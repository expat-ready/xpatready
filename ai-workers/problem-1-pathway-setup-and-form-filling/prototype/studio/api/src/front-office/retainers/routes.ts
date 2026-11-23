// FO-5 routes (contracts §2.3 as changed by §7; concept fo-5s-retainer-signing r2 §6). Each declares its permission keys
// (AG-05 C5, PF-3's seeded keys; PF-4's guard refuses the rest, default deny): see list|show, prepare and edit draft, send
// send, withdraw void, Signed offline offline-sign, downloads download, templates configure-template (Owner, Admin).
// Uploads are multipart (field `file`), with the size limit checked by the upload layer and again by the service.
// Nest's decorators in @ form: api/tsconfig.json compiles them for src/front-office/** (PF-4t, #1775).
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { OwnOrAll, PermissionKeys, problem, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { idParam } from "../../platform/http/input.ts";
import { PlatformClock } from "../../platform/identity/port.ts";
import { FileLinks, LocalFiles } from "../files.ts";
import { OFFLINE_PDF_MAX_BYTES, Retainers, TEMPLATE_MAX_BYTES, type Upload } from "./service.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
type F = { buffer: Buffer; size: number; mimetype?: string } | undefined;
const up = (f: F): Upload | undefined => (f ? { bytes: new Uint8Array(f.buffer), size: f.size, contentType: f.mimetype } : undefined);

// The upload layer stops at twice the limit (memory); the service answers the limit itself in plain words up to there (B-8).
const file = (max: number) => UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * max, files: 1 } }));

@Controller("api/front-office")
export class RetainersController {
  constructor(@Inject(Retainers) private readonly svc: Retainers, @Inject(LocalFiles) private readonly files: LocalFiles,
    @Inject(FileLinks) private readonly links: FileLinks, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  @Get("retainer-templates/placeholders") @PermissionKeys("agent/retainer:list")
  placeholders() { return this.svc.placeholders(); }

  @Get("retainer-templates/starter") @PermissionKeys("agent/retainer:configure-template")
  async starter(@Res() res: Response) {
    const s = await this.svc.starter();
    res.setHeader("Content-Disposition", `attachment; filename="${s.filename}"`).setHeader("X-Sample-Note", s.note).type(s.contentType).send(Buffer.from(s.bytes));
  }

  /** FO-5b: the template's Code s. 24(3) checklist (never refuses a send). */
  @Get("retainer-templates/:id/checklist") @PermissionKeys("agent/retainer:list")
  checklist(@Req() r: R, @Param("id") id: string) { return this.svc.templateChecklist(staffOf(r), id); }

  @Get("retainer-templates") @PermissionKeys("agent/retainer:list")
  templates(@Req() r: R) { return this.svc.listTemplates(staffOf(r)); }

  @Post("retainer-templates") @file(TEMPLATE_MAX_BYTES) @PermissionKeys("agent/retainer:configure-template")
  upload(@Req() r: R, @Body() b: B, @UploadedFile() f: F) { return this.svc.uploadTemplate(staffOf(r), b ?? {}, up(f)); }

  @Post("retainer-templates/:id/versions") @file(TEMPLATE_MAX_BYTES) @PermissionKeys("agent/retainer:configure-template")
  newVersion(@Req() r: R, @Param("id") id: string, @Body() b: B, @UploadedFile() f: F) { return this.svc.newTemplateVersion(staffOf(r), id, up(f), b ?? {}); }

  @Patch("retainer-templates/:id") @PermissionKeys("agent/retainer:configure-template")
  changeTemplate(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.changeTemplate(staffOf(r), id, b ?? {}); }

  @Get("retainer-representatives") @PermissionKeys("agent/retainer:draft")
  representatives(@Req() r: R) { return this.svc.representatives(staffOf(r).firmId); }

  @Post("prospects/:id/retainers") @PermissionKeys("agent/retainer:draft")
  draft(@Req() r: R, @Param("id") prospectId: string, @Body() b: B) { return this.svc.draft(staffOf(r), prospectId, b ?? {}); }

  /** FO-5s: the prospect's retainers (its card on the prospect page). */
  @Get("prospects/:id/retainers") @PermissionKeys("agent/retainer:list")
  listForProspect(@Req() r: R, @Param("id") prospectId: string) { return this.svc.listForProspect(staffOf(r), idParam(prospectId, "prospect")); }   // PF-28: a malformed id is the one not-found (404), never a field error

  @Get("retainers/:id") @PermissionKeys("agent/retainer:show") @OwnOrAll("agent/prospect")
  read(@Req() r: R, @Param("id") id: string) { return this.svc.read(staffOf(r), id); }

  @Patch("retainers/:id") @PermissionKeys("agent/retainer:draft")
  edit(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.edit(staffOf(r), id, b ?? {}); }

  @Post("retainers/:id/send") @HttpCode(200) @PermissionKeys("agent/retainer:send")
  send(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.send(staffOf(r), id, b ?? {}); }

  @Post("retainers/:id/withdraw") @HttpCode(200) @PermissionKeys("agent/retainer:void")
  withdraw(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.withdraw(staffOf(r), id, b ?? {}); }

  @Post("retainers/:id/signed-offline") @HttpCode(200) @file(OFFLINE_PDF_MAX_BYTES) @PermissionKeys("agent/retainer:offline-sign")
  signedOffline(@Req() r: R, @Param("id") id: string, @Body() b: B, @UploadedFile() f: F) { return this.svc.signedOffline(staffOf(r), id, b ?? {}, up(f)); }

  /** A short-lived link to one of the retainer's files (BR-15). */
  @Post("retainers/:id/download-link") @HttpCode(200) @PermissionKeys("agent/retainer:download")
  async link(@Req() r: R, @Param("id") id: string, @Body() b: B) {
    const ctx = staffOf(r), key = await this.svc.fileKey(ctx, id, b ?? {});
    const l = this.links.sign(ctx.firmId, ctx.staffId, key, this.clock.now());
    return { url: `/api/front-office/files/${l.token}`, expiresAt: l.expiresAt };
  }

  /** The file a link names: another firm's or an altered link is 404, an expired one 410. */
  @Get("files/:token") @PermissionKeys("agent/retainer:download")
  async download(@Req() r: R, @Param("token") token: string, @Res() res: Response) {
    const ctx = staffOf(r), c = this.links.check(token, ctx.firmId, ctx.staffId, this.clock.now());
    if ("refused" in c) return c.refused === "expired" ? problem(410, "Link expired", "This download link has expired. Open the agreement again.", { code: "LINK_EXPIRED" }) : problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    await this.svc.assertFileVisible(ctx, c.key);   // still sees the retainer (404 otherwise)
    const f = await this.files.get(ctx.firmId, c.key);
    if (!f) return problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    res.setHeader("Content-Disposition", `attachment; filename="${c.key.split("/").pop()}"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff").type(f.contentType).send(Buffer.from(f.bytes));
  }
}
