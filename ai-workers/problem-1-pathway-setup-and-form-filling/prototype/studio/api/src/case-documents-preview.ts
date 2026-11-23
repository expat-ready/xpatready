// CS-D5 part 1 (R1.68; concept screens/CS-D5/concept.md r2.1, brief design/briefs/CS-D5.md as corrected on #3024):
// a staff member previews a client's case document through a short-lived, single-use, nameless link.
//   AG-9-24: preview through a short-lived signed GET; every preview audited. AG-9-16: signed, never public.
//   AG-9-53: only those who can see the case, on every read path (the link and the bytes each reach the case again).
//   AG-9-32: every read leaves a record: one "previewed" line per opening, and the token is single use, so no read
//   goes unrecorded (concept M2). AG-09 line 426: "today 300s".
// The scan gate (AG-9-20, AG-9-55: 409 "Checking for viruses…", 410 "Removed — infected file") is R1.66's and joins
// when PF-F3 lands (Lead 10's ruling on #3188): case files have no scan state yet, so the answer says NOT_SCANNED and
// never claims CLEAN. Files are read as they are stored today, through the download's own read path.
// The signer is `case-preview-links.ts` (pure).
import { Controller, Get, Head, Headers, HttpCode, HttpStatus, Inject, Injectable, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { CaseDocuments } from "./case-documents.ts";
import { PREVIEW_PATH, PreviewLinks } from "./case-preview-links.ts";
import { actorOf, Audit, CaseRead, fail, type Actor } from "./core.ts";
import { PlatformClock } from "./platform/identity/port.ts";
import { detect } from "./platform/files/file-type.ts";

/** What the answer says of a file's virus scan: case files have none until PF-F3 (R1.66). */
export const SCAN_STATE = "NOT_SCANNED" as const;
const GONE = "No such document.";   // the download's 404 words, for every refusal of a link (leaks nothing)

@Injectable()
export class DocumentPreviews {
  constructor(@Inject(CaseDocuments) private readonly docs: CaseDocuments, @Inject(Audit) private readonly audit: Audit,
    @Inject(PreviewLinks) private readonly links: PreviewLinks, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  /** POST /runtime/documents/:id/preview-link: the case reached as the download reaches it, then one "previewed" line
   *  and a link for this asker. */
  async link(actor: Actor, documentId: string) {
    const x = await this.docs.reachDocument(actor, documentId);
    const bytes = await x.bytes();
    const found = detect(new Uint8Array(bytes));
    const { token, expiresAt } = this.links.sign(x.workspaceId, actor.id, x.document.id, this.clock.now());
    await this.audit.log(x.workspaceId, actor.id, "previewed", "case document", x.document.id, `${actor.name} previewed ${x.typeName} on case ${x.caseId.slice(0, 8)}`);
    return { url: `${PREVIEW_PATH}${token}`, expires_at: expiresAt, media_type: x.document.mediaType, file_name: x.document.fileName, size_bytes: x.document.sizeBytes,
      uploaded_at: x.document.uploadedAt.toISOString(), scan: SCAN_STATE, contains_scripts: found.ok ? found.activeContent.length > 0 : false };
  }

  /** GET /runtime/document-previews/:token: the token unaltered, unexpired and unused (checked first, before any
   *  database read), then the case reached again (AG-9-53: every read path), then the token's asker and firm. Staff who
   *  may not use it get the download's 404; a client or the configuration author gets the download's 403 (BR-4). */
  async bytes(actor: Actor, token: string) {
    const now = this.clock.now(), v = this.links.verify(token, now);
    if ("refused" in v) fail(GONE, HttpStatus.NOT_FOUND);
    const x = await this.docs.reachDocument(actor, (v as { document: string }).document);
    const t = this.links.check(token, x.workspaceId, actor.id, now);
    if ("refused" in t || t.document !== x.document.id) fail(GONE, HttpStatus.NOT_FOUND);
    const ok = t as { mac: string; exp: number };
    if (!this.links.consume(ok.mac, ok.exp, now)) fail(GONE, HttpStatus.NOT_FOUND);
    return { bytes: await x.bytes(), media: x.document.mediaType, name: x.document.fileName };
  }
}

type H = string | undefined;

@CaseRead()
@Controller("api/runtime")
export class DocumentPreviewsController {
  constructor(@Inject(DocumentPreviews) private readonly x: DocumentPreviews) {}
  @Post("documents/:id/preview-link") @HttpCode(200) link(@Headers("x-actor") a: H, @Param("id") id: string) { return this.x.link(actorOf(a), id); }
  /** HEAD would use the single-use link up with no bytes sent (Express answers HEAD on a GET route): refused. */
  @Head("document-previews/:token") head(@Res() res: Response) { res.status(HttpStatus.METHOD_NOT_ALLOWED).setHeader("allow", "GET"); res.end(); }
  @Get("document-previews/:token") async bytes(@Headers("x-actor") a: H, @Param("token") token: string, @Res() res: Response) {
    res.setHeader("cache-control", "private, no-store"); res.setHeader("x-content-type-options", "nosniff");   // refusals too
    const f = await this.x.bytes(actorOf(a), token);
    // The download's four headers (case-documents.ts file route): inline, its own type, no sniffing, no scripts, not kept.
    res.setHeader("content-type", f.media); res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`); res.end(f.bytes);
  }
}
