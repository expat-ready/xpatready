// FO-6 part 4b: the public signing door's routes (the service is ./door.ts). Public under /api/public (no sign-in: the
// emailed link's token is the key), so PF-4's staff guard and AUD-3's declarations (`@SystemKeys`/`@AnySystemStaff` routes
// under /api/system only, audit/access/declare.ts) do not apply; the GETs are marked open on the read guard (the module
// card's invariant). Every answer: `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The session cookie is
// HttpOnly, SameSite=Strict, on exactly this link's path, Sample 30 minutes, Secure outside `local`. Rate limited per
// (address, token), Sample 30 a minute; and an address that misses (malformed or unknown links) 300 times a minute gets 429
// for further misses only, so a live link is never refused because of other callers (4b breaker M1: with no trust-proxy
// yet, every client behind a proxy shares one address; Lead 24, answer 9). POST bodies must be JSON (415 otherwise: a
// cross-site form cannot make the door email a code, 4b breaker m4). Bodies are strict (PF-28).
import { Body, Controller, Get, HttpCode, HttpException, Inject, Param, Post, Req, Res } from "@nestjs/common";
import { z } from "zod";
import { OpenRead } from "../../core.ts";
import { parseInput, strict, text } from "../../platform/http/input.ts";
import { problem } from "../../platform/identity/keys.ts";
import { NOT_WORK, SESSION_COOKIE, SESSION_MINUTES, sessionCookies, SigningDoor, TOKEN_SHAPE, type DoorAnswer } from "./door.ts";

const WINDOW_MS = 60_000, PER_TOKEN = 30, MISSES_PER_ADDRESS = 300, MAX_KEYS = 50_000;   // Sample
const hits = new Map<string, number[]>();
let swept = 0;
function over(key: string, max: number, now: number): boolean {
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const full = list.length >= max;
  if (!full) list.push(now);
  hits.set(key, list);
  return full;
}
const tooMany = (): never => problem(429, "Too many tries", "Too many tries from here. Wait a minute and open the link again.", { code: "TOO_MANY_REQUESTS" });
function sweep(now: number) { if (hits.size > MAX_KEYS && now - swept > WINDOW_MS) { swept = now; for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); } }
/** Per (address, token): every call counts. */
function limit(ip: string, token: string) {
  const now = Date.now(); sweep(now);
  if (over(`t|${ip}|${typeof token === "string" ? token.slice(0, 120) : ""}`, PER_TOKEN, now)) tooMany();
}
/** A miss (malformed or unknown link) from this address: past the ceiling it answers 429 instead of the 404. */
function missed(ip: string): never {
  if (over(`m|${ip}`, MISSES_PER_ADDRESS, Date.now())) tooMany();
  return problem(404, "Not found", NOT_WORK, { code: "LINK_NOT_WORKING" });
}
/** Runs a door call; its "This link does not work." counts as a miss for the address. */
async function counted<T>(ip: string, run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (e) {
    if (e instanceof HttpException && e.getStatus() === 404 && (e.getResponse() as { code?: unknown })?.code === "LINK_NOT_WORKING") missed(ip);
    throw e;
  }
}

type Rq = { ip?: string; socket?: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> };
type Rs = { setHeader(name: string, value: string | string[]): unknown };
const ipOf = (r: Rq) => String(r.ip ?? r.socket?.remoteAddress ?? "unknown");
const CodeBody = strict({ resend: z.boolean().optional() });
const VerifyBody = strict({ code: text(20) });
const ConsentBody = strict({ agree: z.literal(true), consentTextVersion: text(40) });

@Controller("api/public/sign")
export class SigningDoorController {
  constructor(@Inject(SigningDoor) private readonly door: SigningDoor) {}

  /** Headers every answer carries, the limiter (a refusal keeps the headers), JSON only on a POST, then the token's shape:
   *  a malformed link is the one 404 (a miss) before any body is read (PF-28: a bad path key is not found before a field error). */
  private begin(r: Rq, res: Rs, token: string, post = false) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    limit(ipOf(r), token);
    if (typeof token !== "string" || !TOKEN_SHAPE.test(token)) missed(ipOf(r));
    const type = r.headers["content-type"];
    if (post && !(typeof type === "string" && /^application\/json\s*(;|$)/i.test(type))) problem(415, "Send JSON", "This door takes a JSON body.", { code: "UNSUPPORTED_MEDIA_TYPE" });
  }
  private finish<T>(res: Rs, token: string, a: DoorAnswer<T>): T {
    if (a.session) {
      const secure = (process.env.PLATFORM_ENVIRONMENT ?? "local") === "local" ? "" : "; Secure";
      res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${a.session}; Path=/api/public/sign/${token}; Max-Age=${SESSION_MINUTES * 60}; HttpOnly; SameSite=Strict${secure}`);
    }
    return a.body;
  }

  @OpenRead("the client's signing link: its state, the firm's name and the consent text, never personal data, FO-6 part 4b") @Get(":token")   // QA-53 REVIEWED
  state(@Param("token") token: string, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token);
    return counted(ipOf(r), () => this.door.state(token));
  }

  @Post(":token/code") @HttpCode(200)
  code(@Param("token") token: string, @Body() body: unknown, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token, true);
    return counted(ipOf(r), () => this.door.code(token, parseInput(CodeBody, body ?? {})));
  }

  @Post(":token/code/verify") @HttpCode(200)
  async verify(@Param("token") token: string, @Body() body: unknown, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token, true);
    return this.finish(res, token, await counted(ipOf(r), () => this.door.verify(token, parseInput(VerifyBody, body ?? {}))));
  }

  @Post(":token/consent") @HttpCode(200)
  async consent(@Param("token") token: string, @Body() body: unknown, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token, true);
    return this.finish(res, token, await counted(ipOf(r), () => this.door.consent(token, parseInput(ConsentBody, body ?? {}), sessionCookies(r.headers.cookie))));
  }

  @OpenRead("the client's signing session: the provider's embedded link, only for the browser that holds the session, FO-6 part 4b") @Get(":token/session")   // QA-53 REVIEWED
  session(@Param("token") token: string, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token);
    return counted(ipOf(r), () => this.door.session(token, sessionCookies(r.headers.cookie)));
  }
}
