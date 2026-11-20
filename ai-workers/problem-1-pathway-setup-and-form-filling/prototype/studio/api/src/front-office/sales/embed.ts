// FO-4b (BACKLOG FO-4b; AG-2-5 rules 2 and 7, AG-2-49 rule 4): the embed script's one served file and the browser's
// pre-flight for a send from the firm's own site. GET /api/public/embed/form.js serves
// web/src/modules/front-office/embed/form-embed.js as it is (read once, no build), loadable from any site (the script
// alone opens nothing: the form's read and send answer only the form's allowed sites, public.ts corsFor). OPTIONS
// …/forms/:token/submissions answers an allowed site's pre-flight (POST, content-type, 10 minutes) and refuses any other
// site in the form door's own words; it counts against the per-address read limit.
import { Controller, Get, HttpCode, Inject, Options, Param, Req, Res } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OpenRead, STUDIO } from "../../core.ts";
import { PublicForms } from "./public.ts";

export const EMBED_FILE = join(STUDIO, "web", "src", "modules", "front-office", "embed", "form-embed.js");
let source: string | null = null;
const script = () => (source ??= readFileSync(EMBED_FILE, "utf8"));

type Req = { ip?: string; socket?: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): unknown; send?(body: string): unknown };

@Controller("api/public")
export class EmbedController {
  constructor(@Inject(PublicForms) private readonly forms: PublicForms) {}

  @OpenRead("the embed script a firm's own site loads to draw its enquiry form, FO-4b") @Get("embed/form.js")   // QA-53 REVIEWED
  file(@Res() res: Res & { send(body: string): unknown }) {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");   // other sites load it by design
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(script());
  }

  @Options("forms/:token/submissions") @HttpCode(204)
  preflight(@Param("token") token: string, @Req() req: Req, @Res({ passthrough: true }) res: Res) { return this.forms.preflight(token, req, res); }
}
