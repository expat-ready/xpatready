// PF-18b (AG-16-63, AG16-16): support tickets under /api/platform/support, behind PF-4's guard. Each route declares its key
// (identity/keys.ts; default deny); every rule stays in SupportService (support.ts, its "Who" lines): create raises; list
// reads your own, or the firm's for an Owner or Admin, and adds a message where you see the ticket. A raise is multipart:
// `body` and `page` fields and up to three `files`; the upload layer stops at twice the Sample limit (memory) and the
// service answers the limit itself in plain words up to there (as FO-5's uploads). Downloads go through a short-lived
// signed link (FileLinks, FO-5): another person's, another firm's or an altered link is 404, an expired one 410.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { FileLinks, LocalFiles } from "../../front-office/files.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../identity/keys.ts";
import { PlatformClock } from "../identity/port.ts";
import { ATTACHMENT_MAX_BYTES, MAX_FILES, SUPPORT_KEYS, SupportService, type Upload, isUuid, notFound } from "./support.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
type F = { buffer: Buffer; size: number; mimetype?: string }[] | undefined;
const ups = (fs: F): Upload[] => (fs ?? []).map((f) => ({ bytes: new Uint8Array(f.buffer), size: f.size, contentType: f.mimetype }));
/** One more file than allowed reaches the service, which names the limit in words (the upload layer's own error would not);
 *  at most 8 form fields of 64 KB each (break m8: a body is 5,000 characters, at most 20 KB). */
const files = () => UseInterceptors(FilesInterceptor("files", MAX_FILES + 1, { limits: { fileSize: 2 * ATTACHMENT_MAX_BYTES, files: MAX_FILES + 1, fields: 8, fieldSize: 64 * 1024, parts: MAX_FILES + 9 } }));

@Controller("api/platform/support")
export class SupportController {
  constructor(@Inject(SupportService) private readonly svc: SupportService, @Inject(LocalFiles) private readonly store: LocalFiles,
    @Inject(FileLinks) private readonly links: FileLinks, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  @Post("tickets") @files() @PermissionKeys(SUPPORT_KEYS.create)
  raise(@Req() r: R, @Body() b: B, @UploadedFiles() f: F) { return this.svc.raise(staffOf(r), b ?? {}, ups(f)); }

  @Get("tickets") @PermissionKeys(SUPPORT_KEYS.list)
  list(@Req() r: R) { return this.svc.list(staffOf(r)); }

  @Get("tickets/:id") @PermissionKeys(SUPPORT_KEYS.list)
  get(@Req() r: R, @Param("id") id: string) { return this.svc.get(staffOf(r), id); }

  @Post("tickets/:id/messages") @HttpCode(200) @PermissionKeys(SUPPORT_KEYS.list)
  message(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.addMessage(staffOf(r), isUuid(id) ? id : notFound(), b ?? {}); }   // PF-28 part 2b: the id before the body

  /** A short-lived link to attachment `n` of a ticket the person sees. */
  @Post("tickets/:id/files/:n/link") @HttpCode(200) @PermissionKeys(SUPPORT_KEYS.list)
  async link(@Req() r: R, @Param("id") id: string, @Param("n") n: string) {
    const ctx = staffOf(r), key = await this.svc.fileKey(ctx, id, n);
    const l = this.links.sign(ctx.firmId, ctx.staffId, key, this.clock.now());
    return { url: `/api/platform/support/files/${l.token}`, expiresAt: l.expiresAt };
  }

  /** The file a link names. */
  @Get("files/:token") @PermissionKeys(SUPPORT_KEYS.list)
  async download(@Req() r: R, @Param("token") token: string, @Res() res: Response) {
    const ctx = staffOf(r), c = this.links.check(token, ctx.firmId, ctx.staffId, this.clock.now());
    if ("refused" in c) return c.refused === "expired" ? problem(410, "Link expired", "This download link has expired. Open the ticket again.", { code: "LINK_EXPIRED" }) : problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    await this.svc.assertKeyVisible(ctx, c.key);
    const f = await this.store.get(ctx.firmId, c.key);
    if (!f) return problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    res.setHeader("Content-Disposition", `attachment; filename="support-${c.key.split("/").pop()}"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff").type(f.contentType).send(Buffer.from(f.bytes));
  }
}
