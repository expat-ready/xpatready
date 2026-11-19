// AUD-4 routes: the firm reads and exports its own activity log (agent/audit:read; Owner and Admin by default, PF-3's
// seed). No firm id is taken from the request: the firm is the session's. No @OwnOrAll: the record-visibility check
// does not apply to the audit viewer (AG-13-44).
import { Controller, Get, Inject, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { FirmAuditLog } from "./service.ts";

export const AUDIT_READ = "agent/audit:read";
type R = { platform?: StaffContext };

@Controller("api/platform")
export class FirmAuditController {
  constructor(@Inject(FirmAuditLog) private readonly log: FirmAuditLog) {}

  @Get("audit") @PermissionKeys(AUDIT_READ)
  page(@Req() r: R, @Query() q: Record<string, unknown>) { return this.log.page(staffOf(r), q); }

  @Get("audit/export") @PermissionKeys(AUDIT_READ)
  async export(@Req() r: R, @Query() q: Record<string, unknown>, @Res() res: Response) {
    await this.log.exportCsv(staffOf(r), q, {
      begin: (rows, name) => { res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
        res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Export-Rows", String(rows)); },
      write: (chunk) => res.write(chunk),
      drain: () => new Promise<void>((ok, fail) => {
        if (res.destroyed) return fail(new Error("the reader went away"));
        const done = () => { res.off("drain", drained); res.off("close", closed); };
        const drained = () => { done(); ok(); }, closed = () => { done(); fail(new Error("the reader went away")); };
        res.on("drain", drained); res.on("close", closed);
      }),
    });
    res.end();
  }
}
