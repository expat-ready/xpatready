// PF-19b part 2: the two open doors of the sending path, on ExpatReady's own host (never a firm's address).
//   GET  /api/public/unsubscribe/:token  the page with one button (changes nothing)
//   POST /api/public/unsubscribe/:token  one click (RFC 8058, or the button): withdraws email marketing once
//   POST /api/public/messages/ses-notices SNS's bounce and complaint notices (text/plain JSON), signature checked first
// A token that does not work, whatever the reason, answers the public side's one 404; too many tries from one IP, 429.
import { Body, Controller, Get, Inject, Param, Post, Req, Res } from "@nestjs/common";
import { OpenRead } from "../../core.ts";
import { sendPublicNotFound } from "../web-address/host.ts";
import { NOTICE_PATH, NoticeRefused, SesNotices } from "./channels/email/bounces.ts";
import { Unsubscribe } from "./channels/email/unsubscribe.ts";

type Req = { ip?: string; path: string; headers: Record<string, string | string[] | undefined>; on(e: string, f: (c?: Buffer) => void): unknown; readable?: boolean };
type Res = { status(c: number): Res; setHeader(k: string, v: string): unknown; end(b?: string): unknown };
const html = (res: Res, status: number, body: string) => { res.status(status); res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(body); };
const tooMany = (res: Res) => { res.status(429); res.setHeader("Content-Type", "application/problem+json; charset=utf-8"); res.end(JSON.stringify({ type: "https://expatready.local/problems/too-many", title: "Please wait", status: 429, detail: "Too many tries from here. Wait a minute and try again." })); };
/** SNS posts text/plain, which the JSON parser leaves unread: read it here (64 KB at most). */
const rawText = (req: Req) => new Promise<string>((done) => { let s = "", n = 0; req.on("data", (c) => { n += c!.length; if (n <= 65_536) s += c!.toString("utf8"); }); req.on("end", () => done(n <= 65_536 ? s : "")); });

@Controller("api/public")
export class MessagesPublicController {
  constructor(@Inject(Unsubscribe) private readonly u: Unsubscribe, @Inject(SesNotices) private readonly n: SesNotices) {}

  @OpenRead("the unsubscribe page a marketing or service email links to (PF-19b): one button, changes nothing")
  @Get("unsubscribe/:token")
  async page(@Param("token") t: string, @Req() req: Req, @Res() res: Res) {
    if (!this.u.allow(String(req.ip ?? "unknown"))) return tooMany(res);
    const p = await this.u.page(t);
    return p ? html(res, 200, p) : sendPublicNotFound(req, res);
  }

  @Post("unsubscribe/:token")
  async confirm(@Param("token") t: string, @Req() req: Req, @Res() res: Res) {
    if (!this.u.allow(String(req.ip ?? "unknown"))) return tooMany(res);
    const p = await this.u.confirm(t);
    return p ? html(res, 200, p) : sendPublicNotFound(req, res);
  }

  @Post(NOTICE_PATH.replace("/api/public/", ""))
  async notice(@Body() body: unknown, @Req() req: Req, @Res() res: Res) {
    const parsed = body && typeof body === "object" && Object.keys(body).length ? body : req.readable ? await rawText(req) : "";
    try {
      const r = await this.n.receive(parsed);
      res.status(200); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ result: r }));
    } catch (e) {
      if (!(e instanceof NoticeRefused)) throw e;
      res.status(400); res.setHeader("Content-Type", "application/problem+json; charset=utf-8"); res.end(JSON.stringify({ type: "https://expatready.local/problems/notice-refused", title: "Not a verified notice", status: 400, detail: "This notice is not signed by Amazon SNS." }));
    }
  }
}
