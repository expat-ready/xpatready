// FO-5 routes (contracts §2.3 as changed by §7; concept fo-5s-retainer-signing r2 §6). Each declares its permission keys
// (AG-05 C5, PF-3's seeded keys; PF-4's guard refuses the rest, default deny): see list|show, prepare and edit draft, send
// send, withdraw void, Signed offline offline-sign, downloads download, templates configure-template (Owner, Admin).
// Uploads are multipart (field `file`), with the size limit checked by the upload layer and again by the service.
// Nest's decorators are applied as calls below the class (platform/identity/keys.ts says why).
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { PermissionKeys, decorate, problem, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { PlatformClock } from "../../platform/identity/port.ts";
import { FileLinks, LocalFiles } from "../files.ts";
import { OFFLINE_PDF_MAX_BYTES, Retainers, TEMPLATE_MAX_BYTES, type Upload } from "./service.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
type F = { buffer: Buffer; size: number; mimetype?: string } | undefined;
const up = (f: F): Upload | undefined => (f ? { bytes: new Uint8Array(f.buffer), size: f.size, contentType: f.mimetype } : undefined);

export class RetainersController {
  constructor(private readonly svc: Retainers, private readonly files: LocalFiles, private readonly links: FileLinks, private readonly clock: PlatformClock) {}
  placeholders() { return this.svc.placeholders(); }
  async starter(res: Response) {
    const s = await this.svc.starter();
    res.setHeader("Content-Disposition", `attachment; filename="${s.filename}"`).setHeader("X-Sample-Note", s.note).type(s.contentType).send(Buffer.from(s.bytes));
  }
  templates(r: R) { return this.svc.listTemplates(staffOf(r)); }
  upload(r: R, b: B, f: F) { return this.svc.uploadTemplate(staffOf(r), b ?? {}, up(f)); }
  newVersion(r: R, id: string, f: F) { return this.svc.newTemplateVersion(staffOf(r), id, up(f)); }
  changeTemplate(r: R, id: string, b: B) { return this.svc.changeTemplate(staffOf(r), id, b ?? {}); }
  representatives(r: R) { return this.svc.representatives(staffOf(r).firmId); }
  draft(r: R, prospectId: string, b: B) { return this.svc.draft(staffOf(r), prospectId, b ?? {}); }
  read(r: R, id: string) { return this.svc.read(staffOf(r), id); }
  edit(r: R, id: string, b: B) { return this.svc.edit(staffOf(r), id, b ?? {}); }
  send(r: R, id: string) { return this.svc.send(staffOf(r), id); }
  withdraw(r: R, id: string, b: B) { return this.svc.withdraw(staffOf(r), id, b ?? {}); }
  signedOffline(r: R, id: string, b: B, f: F) { return this.svc.signedOffline(staffOf(r), id, b ?? {}, up(f)); }
  /** A short-lived link to one of the retainer's files (BR-15). */
  async link(r: R, id: string, b: B) {
    const ctx = staffOf(r), key = await this.svc.fileKey(ctx, id, b ?? {});
    const l = this.links.sign(ctx.firmId, ctx.staffId, key, this.clock.now());
    return { url: `/api/front-office/files/${l.token}`, expiresAt: l.expiresAt };
  }
  /** The file a link names: another firm's or an altered link is 404, an expired one 410. */
  async download(r: R, token: string, res: Response) {
    const ctx = staffOf(r), c = this.links.check(token, ctx.firmId, ctx.staffId, this.clock.now());
    if ("refused" in c) return c.refused === "expired" ? problem(410, "Link expired", "This download link has expired. Open the agreement again.", { code: "LINK_EXPIRED" }) : problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    const f = await this.files.get(ctx.firmId, c.key);
    if (!f) return problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    res.setHeader("Content-Disposition", `attachment; filename="${c.key.split("/").pop()}"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff").type(f.contentType).send(Buffer.from(f.bytes));
  }
}

const C = RetainersController;
Controller("api/front-office")(C);
[Retainers, LocalFiles, FileLinks, PlatformClock].forEach((t, i) => Inject(t)(C, undefined, i));
// The upload layer stops at twice the limit (memory); the service answers the limit itself in plain words up to there (B-8).
const file = (max: number) => UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * max, files: 1 } }));
decorate(C, "placeholders", [Get("retainer-templates/placeholders"), PermissionKeys("agent/retainer:list")]);
decorate(C, "starter", [Get("retainer-templates/starter"), PermissionKeys("agent/retainer:configure-template")], [Res()]);
decorate(C, "templates", [Get("retainer-templates"), PermissionKeys("agent/retainer:list")], [Req()]);
decorate(C, "upload", [Post("retainer-templates"), file(TEMPLATE_MAX_BYTES), PermissionKeys("agent/retainer:configure-template")], [Req(), Body(), UploadedFile()]);
decorate(C, "newVersion", [Post("retainer-templates/:id/versions"), file(TEMPLATE_MAX_BYTES), PermissionKeys("agent/retainer:configure-template")], [Req(), Param("id"), UploadedFile()]);
decorate(C, "changeTemplate", [Patch("retainer-templates/:id"), PermissionKeys("agent/retainer:configure-template")], [Req(), Param("id"), Body()]);
decorate(C, "representatives", [Get("retainer-representatives"), PermissionKeys("agent/retainer:draft")], [Req()]);
decorate(C, "draft", [Post("prospects/:id/retainers"), PermissionKeys("agent/retainer:draft")], [Req(), Param("id"), Body()]);
decorate(C, "read", [Get("retainers/:id"), PermissionKeys("agent/retainer:show")], [Req(), Param("id")]);
decorate(C, "edit", [Patch("retainers/:id"), PermissionKeys("agent/retainer:draft")], [Req(), Param("id"), Body()]);
decorate(C, "send", [Post("retainers/:id/send"), HttpCode(200), PermissionKeys("agent/retainer:send")], [Req(), Param("id")]);
decorate(C, "withdraw", [Post("retainers/:id/withdraw"), HttpCode(200), PermissionKeys("agent/retainer:void")], [Req(), Param("id"), Body()]);
decorate(C, "signedOffline", [Post("retainers/:id/signed-offline"), HttpCode(200), file(OFFLINE_PDF_MAX_BYTES), PermissionKeys("agent/retainer:offline-sign")], [Req(), Param("id"), Body(), UploadedFile()]);
decorate(C, "link", [Post("retainers/:id/download-link"), HttpCode(200), PermissionKeys("agent/retainer:download")], [Req(), Param("id"), Body()]);
decorate(C, "download", [Get("files/:token"), PermissionKeys("agent/retainer:download")], [Req(), Param("token"), Res()]);
