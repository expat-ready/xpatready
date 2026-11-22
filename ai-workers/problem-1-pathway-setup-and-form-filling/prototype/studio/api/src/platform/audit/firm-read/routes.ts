// AUD-4 routes: the firm reads and exports its own activity log (agent/audit:read; Owner and Admin by default, PF-3's
// seed). No firm id is taken from the request: the firm is the session's. No @OwnOrAll: the record-visibility check
// does not apply to the audit viewer (AG-13-44).
import { pipeline } from "node:stream/promises";
import { Controller, Get, HttpException, Inject, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { FirmAuditLog } from "./service.ts";
import { parseInput, query } from "../../http/input.ts";

export const AUDIT_READ = "agent/audit:read";
type R = { platform?: StaffContext };

/** PF-28 part 2b (R1.10): the activity log's filter keys; an unknown one is refused 422, named, before the filter is read. */
const AUDIT_QUERY = query("from", "to", "person", "actorType", "ours", "area", "action", "entity", "entityKey", "cursor");

@Controller("api/platform")
export class FirmAuditController {
  constructor(@Inject(FirmAuditLog) private readonly log: FirmAuditLog) {}

  @Get("audit") @PermissionKeys(AUDIT_READ)
  page(@Req() r: R, @Query() q: Record<string, unknown>) { return this.log.page(staffOf(r), parseInput(AUDIT_QUERY, q)); }

  @Get("audit/export") @PermissionKeys(AUDIT_READ)
  async export(@Req() r: R, @Query() q: Record<string, unknown>, @Res() res: Response) {
    parseInput(AUDIT_QUERY, q);   // PF-28 part 2b: before the download starts
    let made: Awaited<ReturnType<FirmAuditLog["exportCsv"]>>;
    let left = false; res.on("close", () => { if (!res.writableEnded) left = true; });
    try { made = await this.log.exportCsv(staffOf(r), q, () => left); } catch (e) {
      if (left) return;   // nobody to answer
      // The app's error filter rewords every 413 as an upload limit (main.ts); this export's own refusals keep their words.
      if (e instanceof HttpException && (e.getStatus() === 413 || e.getStatus() === 503)) return void res.status(e.getStatus()).type("application/problem+json").json(e.getResponse());
      throw e;
    }
    res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${made.name}"`);
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Export-Rows", String(made.rows));
    // The file is whole before the first byte, so a reader who stops or leaves holds no database connection; it is
    // removed when the answer ends either way.
    try { await pipeline(made.file, res); } catch { /* the reader left: nothing more to send */ } finally { await made.done(); }
  }
}
