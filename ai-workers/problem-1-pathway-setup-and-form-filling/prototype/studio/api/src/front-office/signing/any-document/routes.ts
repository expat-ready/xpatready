// FO-6d routes (BACKLOG row FO-6d; AG-5-61): send any PDF for signature and read its state. Send is multipart (field
// `file`; text fields title, prospectId, signerPersonIds (comma-separated or repeated), optional firmSignerStaffId), key
// agent/portal:request-work; the reads follow the prospect's own-or-all rule (agent/prospect:show); a file only through a
// short-lived checked link (agent/document:show), as FO-13i's copies. Nest's decorators in @ form (api/tsconfig.json).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import { idParam, list, parseInput, query, strict } from "../../../platform/http/input.ts";
import { OwnOrAll, PermissionKeys, problem, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { PlatformClock } from "../../../platform/identity/port.ts";
import { FileLinks, LocalFiles } from "../../files.ts";
import { AnyDocuments, MAX_BYTES } from "./service.ts";

type R = { platform?: StaffContext };
type F = { buffer: Buffer; size: number; originalname?: string } | undefined;
const Id = z.uuid({ error: "This is not a valid id." });
/** Multipart sends text: the signer ids as one comma-separated field or the field repeated. */
const SEND = strict({
  title: z.string().trim().min(1).max(200).refine((t) => !/[\p{Cc}\u2028\u2029]|(?![\u200c\u200d])\p{Cf}/u.test(t) && /[\p{L}\p{N}]/u.test(t), "This must be plain text on one line."),   // break m1: C0, C1, format (ZWNJ and ZWJ kept: Persian, Indic) and line-separator characters

  prospectId: Id,
  signerPersonIds: z.union([z.string().max(400), list(z.string().max(40), 9)]).transform((v) => (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim()).filter(Boolean)).pipe(z.array(Id).min(1).max(9)),
  firmSignerStaffId: z.union([Id, z.literal("")]).nullish().transform((v) => v || null),
});
const LINK = strict({ file: z.enum(["original", "signed"]) });

@Controller("api/front-office")
export class AnyDocumentsController {
  constructor(@Inject(AnyDocuments) private readonly svc: AnyDocuments, @Inject(LocalFiles) private readonly files: LocalFiles,
    @Inject(FileLinks) private readonly links: FileLinks, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  // The upload layer stops at twice the limit (memory) and at a few short text fields; the service answers the limit in words.
  @Post("signature-requests") @HttpCode(201) @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * MAX_BYTES, files: 1, fields: 20, fieldSize: 2048, parts: 21 } }))
  @PermissionKeys("agent/portal:request-work") @OwnOrAll("agent/prospect")
  send(@Req() r: R, @Body() b: Record<string, unknown>, @UploadedFile() f: F) {
    return this.svc.send(staffOf(r), parseInput(SEND, b ?? {}), f ? { bytes: new Uint8Array(f.buffer), size: f.size, name: f.originalname } : undefined);
  }

  /** The prospect's requests of kind OTHER (?prospectId=), newest first. */
  @Get("signature-requests") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  list(@Req() r: R, @Query() q: Record<string, unknown>) {
    const { prospectId } = parseInput(query("prospectId"), q ?? {});
    return this.svc.listForProspect(staffOf(r), idParam(prospectId, "prospect"));
  }

  /** Who may sign a document sent from this prospect: its people, and the firm's active people (optional firm signer). */
  @Get("prospects/:id/signers") @PermissionKeys("agent/portal:request-work") @OwnOrAll("agent/prospect")
  signers(@Req() r: R, @Param("id") id: string) { return this.svc.signersFor(staffOf(r), idParam(id, "prospect")); }

  @Get("signature-requests/:id") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  state(@Req() r: R, @Param("id") id: string) { return this.svc.state(staffOf(r), idParam(id, "signature request")); }

  /** A short-lived link to the original or the sealed copy (BR-15's pattern). */
  @Post("signature-requests/:id/download-link") @HttpCode(200) @PermissionKeys("agent/document:show") @OwnOrAll("agent/prospect")
  async link(@Req() r: R, @Param("id") id: string, @Body() b: Record<string, unknown>) {
    const ctx = staffOf(r), rid = idParam(id, "signature request"), { file } = parseInput(LINK, b ?? {}), key = await this.svc.fileKey(ctx, rid, file);
    const l = this.links.sign(ctx.firmId, ctx.staffId, key, this.clock.now());
    return { url: `/api/front-office/signing-files/${l.token}`, expiresAt: l.expiresAt };
  }

  /** The file a link names: another firm's, another person's or an altered link is 404, an expired one 410. */
  @Get("signing-files/:token") @PermissionKeys("agent/document:show") @OwnOrAll("agent/prospect")
  async download(@Req() r: R, @Param("token") token: string, @Res() res: Response) {
    const ctx = staffOf(r), c = this.links.check(token, ctx.firmId, ctx.staffId, this.clock.now());
    if ("refused" in c) return c.refused === "expired" ? problem(410, "Link expired", "This download link has expired. Open the request again.", { code: "LINK_EXPIRED" }) : problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    await this.svc.assertKeyVisible(ctx, c.key);
    const f = await this.files.get(ctx.firmId, c.key);
    if (!f) return problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });
    res.setHeader("Content-Disposition", `attachment; filename="${c.key.endsWith("sealed.pdf") ? "signed-document" : "document"}.pdf"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff")
      .setHeader("Content-Security-Policy", "sandbox; default-src 'none'").type(f.contentType).send(Buffer.from(f.bytes));
  }
}
