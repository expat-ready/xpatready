// FO-13i routes (brief lead-b-briefs/FO-13i.md): record a person's identity check (agent/identity-check:record,
// multipart, the optional copy in field `copy`), list them (agent/prospect:show and the person visible), and the copy's
// bytes only through a short-lived checked link (agent/document:show, the person still visible). The retainers'
// `files/:token` serves retainer files only and is not used. Nest's decorators in @ form (api/tsconfig.json, PF-4t).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { PlatformClock } from "../../../platform/identity/port.ts";
import { FileLinks, LocalFiles } from "../../files.ts";
import { COPY_MAX_BYTES, IdentityChecks } from "./service.ts";

type R = { platform?: StaffContext };
type F = { buffer: Buffer; size: number } | undefined;

@Controller("api/front-office")
export class IdentityChecksController {
  constructor(@Inject(IdentityChecks) private readonly svc: IdentityChecks, @Inject(LocalFiles) private readonly files: LocalFiles,
    @Inject(FileLinks) private readonly links: FileLinks, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  // The upload layer stops at twice the limit (memory); the service answers the limit itself in plain words up to there.
  @Post("people/:personId/identity-checks") @UseInterceptors(FileInterceptor("copy", { limits: { fileSize: 2 * COPY_MAX_BYTES, files: 1 } }))
  @PermissionKeys("agent/identity-check:record")
  record(@Req() r: R, @Param("personId") personId: string, @Body() b: Record<string, unknown>, @UploadedFile() f: F) {
    return this.svc.record(staffOf(r), personId, b ?? {}, f ? { bytes: new Uint8Array(f.buffer), size: f.size } : undefined);
  }

  @Get("people/:personId/identity-checks") @PermissionKeys("agent/prospect:show")
  list(@Req() r: R, @Param("personId") personId: string) { return this.svc.list(staffOf(r), personId); }

  /** A short-lived link to a check's copy (BR-15's pattern). */
  @Post("identity-checks/:id/copy/download-link") @HttpCode(200) @PermissionKeys("agent/document:show")
  async link(@Req() r: R, @Param("id") id: string) {
    const ctx = staffOf(r), key = await this.svc.copyKey(ctx, id);
    const l = this.links.sign(ctx.firmId, ctx.staffId, key, this.clock.now());
    return { url: `/api/front-office/identity-copies/${l.token}`, expiresAt: l.expiresAt };
  }

  /** The copy a link names: another firm's, another person's or an altered link is 404, an expired one 410. */
  @Get("identity-copies/:token") @PermissionKeys("agent/document:show")
  async download(@Req() r: R, @Param("token") token: string, @Res() res: Response) {
    const ctx = staffOf(r), c = this.links.check(token, ctx.firmId, ctx.staffId, this.clock.now());
    if ("refused" in c) return c.refused === "expired" ? problem(410, "Link expired", "This download link has expired. Open the check again.", { code: "LINK_EXPIRED" }) : problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    await this.svc.assertCopyVisible(ctx, c.key);
    const f = await this.files.get(ctx.firmId, c.key);
    if (!f) return problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    res.setHeader("Content-Disposition", `attachment; filename="identity-copy.${c.key.split(".").pop()}"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff")
      .setHeader("Content-Security-Policy", "sandbox; default-src 'none'").type(f.contentType).send(Buffer.from(f.bytes));
  }
}
