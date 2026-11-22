// PF-19b part 2: the two open doors of the sending path, on ExpatReady's own host (never a firm's address).
//   GET  /api/public/unsubscribe/:token  the page with one button (changes nothing)
//   POST /api/public/unsubscribe/:token  one click (RFC 8058, or the button): withdraws email marketing once
//   POST /api/public/messages/ses-notices SNS's bounce and complaint notices (text/plain JSON), signature checked first
// A link that does not work, whatever the reason, answers the public side's one not-found page (HTML: a person reads it);
// too many tries of one link in a minute, 429.
import { Body, Controller, Get, HttpException, Inject, Param, Post, Req, Res } from "@nestjs/common";
import { logPort } from "../observability/log.ts";
import { OpenRead } from "../../core.ts";
import { PUBLIC_NOT_FOUND_HTML } from "../web-address/host.ts";
import { NoticeRefused, SesNotices } from "./channels/email/bounces.ts";
import { page, Unsubscribe } from "./channels/email/unsubscribe.ts";

type Req = { on(e: string, f: (c?: Buffer) => void): unknown; readable?: boolean };
type Res = { status(c: number): Res; setHeader(k: string, v: string): unknown; end(b?: string): unknown };
const html = (res: Res, status: number, body: string) => { res.status(status); res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(body); };
const tooMany = (res: Res) => html(res, 429, page("Please wait", "<p>This link was tried many times in the last minute. Wait a minute and try again.</p>"));
/** SNS's largest message (256 KB) and its envelope. */
export const NOTICE_MAX_BYTES = 300 * 1024;
/** SNS posts text/plain, which the JSON parser leaves unread: read it here, decoded once at the end (break M4: a
 *  character split across two chunks), at most NOTICE_MAX_BYTES; a client that goes away gives "" (break m3). */
export const rawText = (req: Req) => new Promise<string>((done) => {
  const parts: Buffer[] = []; let n = 0;
  req.on("data", (c) => { n += c!.length; if (n <= NOTICE_MAX_BYTES) parts.push(c!); });
  req.on("end", () => done(n <= NOTICE_MAX_BYTES ? Buffer.concat(parts).toString("utf8") : ""));
  for (const e of ["error", "aborted", "close"]) req.on(e, () => done(""));
});

@Controller("api/public")
export class MessagesPublicController {
  constructor(@Inject(Unsubscribe) private readonly u: Unsubscribe, @Inject(SesNotices) private readonly n: SesNotices) {}

  @OpenRead("PF-19b: the unsubscribe page a marketing or service email links to; one button, changes nothing") @Get("unsubscribe/:token") async page(@Param("token") t: string, @Res() res: Res) {
    const a = this.u.allow(t);
    if (a === "limited") return tooMany(res);
    const p = a === "open" ? await this.u.page(t) : null;
    return html(res, p ? 200 : 404, p ?? PUBLIC_NOT_FOUND_HTML);
  }

  @Post("unsubscribe/:token")
  async confirm(@Param("token") t: string, @Res() res: Res) {
    const a = this.u.allow(t);
    if (a === "limited") return tooMany(res);
    const p = a === "open" ? await this.u.confirm(t) : null;
    return html(res, p ? 200 : 404, p ?? PUBLIC_NOT_FOUND_HTML);
  }

  @Post("messages/ses-notices")   // NOTICE_PATH, written out so the route scan (check_forms_qa53.ts) sees it
  async notice(@Body() body: unknown, @Req() req: Req, @Res() res: Res) {
    const parsed = body && typeof body === "object" && Object.keys(body).length ? body : req.readable ? await rawText(req) : "";
    try {
      const r = await this.n.receive(parsed);
      res.status(200); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ result: r }));
    } catch (e) {
      // PF-28: a signed notice whose envelope breaks the schema is the one rule's 422, answered here (this door writes its own answers).
      if (e instanceof HttpException && e.getStatus() === 422) {
        // Review m3: a notice SNS signed that the schema refuses means AWS's format moved: one warning, field names only.
        logPort.warn("messages.sns_notice_refused_by_schema", { fields: Object.keys(((e.getResponse() as { fields?: object }).fields) ?? {}).slice(0, 20).join(",") });
        res.status(422); res.setHeader("Content-Type", "application/problem+json; charset=utf-8"); res.end(JSON.stringify(e.getResponse())); return; }
      if (!(e instanceof NoticeRefused)) throw e;
      res.status(400); res.setHeader("Content-Type", "application/problem+json; charset=utf-8"); res.end(JSON.stringify({ type: "https://expatready.local/problems/notice-refused", title: "Not a verified notice", status: 400, detail: "This notice is not signed by Amazon SNS." }));
    }
  }
}
