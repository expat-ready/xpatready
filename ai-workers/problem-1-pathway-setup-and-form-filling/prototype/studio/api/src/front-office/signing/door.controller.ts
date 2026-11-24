// FO-6 part 4b: the public signing door's routes (the service is ./door.ts). Public under /api/public (no sign-in: the
// emailed link's token is the key), so PF-4's staff guard and AUD-3's declarations (`@SystemKeys`/`@AnySystemStaff` routes
// under /api/system only, audit/access/declare.ts) do not apply; the GETs are marked open on the read guard (the module
// card's invariant). Every answer: `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The session cookie is
// HttpOnly, SameSite=Strict, on exactly this link's path, Sample 30 minutes, Secure outside `local`. Rate limited per
// (address, token), Sample 30 a minute, and per address, Sample 300 a minute (Lead 24, answer 9: no trust-proxy yet, so
// behind a proxy only the per-token limit protects one link). Bodies are strict (PF-28).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from "@nestjs/common";
import { z } from "zod";
import { OpenRead } from "../../core.ts";
import { parseInput, strict, text } from "../../platform/http/input.ts";
import { problem } from "../../platform/identity/keys.ts";
import { SESSION_COOKIE, SESSION_MINUTES, sessionCookies, SigningDoor, type DoorAnswer } from "./door.ts";

const WINDOW_MS = 60_000, PER_TOKEN = 30, PER_ADDRESS = 300, MAX_KEYS = 50_000;   // Sample
const hits = new Map<string, number[]>();
let swept = 0;
function over(key: string, max: number, now: number): boolean {
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const full = list.length >= max;
  if (!full) list.push(now);
  hits.set(key, list);
  return full;
}
function limit(ip: string, token: string) {
  const now = Date.now();
  if (hits.size > MAX_KEYS && now - swept > WINDOW_MS) { swept = now; for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); }
  const tok = typeof token === "string" ? token.slice(0, 120) : "";
  if (over(`a|${ip}`, PER_ADDRESS, now) || over(`t|${ip}|${tok}`, PER_TOKEN, now)) problem(429, "Too many tries", "Too many tries from here. Wait a minute and open the link again.", { code: "TOO_MANY_REQUESTS" });
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

  /** Headers every answer carries, then the limiter (a refusal keeps the headers). */
  private begin(r: Rq, res: Rs, token: string) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    limit(ipOf(r), token);
  }
  private finish<T>(res: Rs, token: string, a: DoorAnswer<T>): T {
    if (a.session) {
      const secure = (process.env.PLATFORM_ENVIRONMENT ?? "local") === "local" ? "" : "; Secure";
      res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${a.session}; Path=/api/public/sign/${token}; Max-Age=${SESSION_MINUTES * 60}; HttpOnly; SameSite=Strict${secure}`);
    }
    return a.body;
  }

  @Get(":token") @OpenRead("the client's signing link: its state, the firm's name and the consent text, never personal data (FO-6 part 4b)")
  state(@Param("token") token: string, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token);
    return this.door.state(token);
  }

  @Post(":token/code") @HttpCode(200)
  code(@Param("token") token: string, @Body() body: unknown, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token);
    return this.door.code(token, parseInput(CodeBody, body ?? {}));
  }

  @Post(":token/code/verify") @HttpCode(200)
  async verify(@Param("token") token: string, @Body() body: unknown, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token);
    return this.finish(res, token, await this.door.verify(token, parseInput(VerifyBody, body ?? {})));
  }

  @Post(":token/consent") @HttpCode(200)
  async consent(@Param("token") token: string, @Body() body: unknown, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token);
    return this.finish(res, token, await this.door.consent(token, parseInput(ConsentBody, body ?? {}), sessionCookies(r.headers.cookie)));
  }

  @Get(":token/session") @OpenRead("the client's signing session: the provider's embedded link, for the browser that holds the session (FO-6 part 4b)")
  session(@Param("token") token: string, @Req() r: Rq, @Res({ passthrough: true }) res: Rs) {
    this.begin(r, res, token);
    return this.door.session(token, sessionCookies(r.headers.cookie));
  }
}
