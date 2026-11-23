// CS-D5 part 1 (R1.68; concept screens/CS-D5/concept.md r2.1, brief design/briefs/CS-D5.md as corrected on #3024):
// a staff member previews a client's case document through a short-lived, single-use, nameless link.
//   AG-9-24: preview through a short-lived signed GET; every preview audited. AG-9-16: signed, never public.
//   AG-9-53: only those who can see the case, on every read path (the link and the bytes each reach the case again).
//   AG-9-32: every read leaves a record: one "previewed" line per opening, and the token is single use, so no read
//   goes unrecorded (concept M2). AG-09 line 426: "today 300s".
// The scan gate (AG-9-20, AG-9-55: 409 "Checking for viruses…", 410 "Removed — infected file") reads `scanStateOf`;
// case files have no scan state on main (PF-F3 not built): see the tech lead's question on the PR.
// The signer is `case-preview-links.ts` (pure).
import { Controller, Get, Headers, HttpCode, HttpStatus, Inject, Injectable, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { CaseDocuments } from "./case-documents.ts";
import { PREVIEW_PATH, PreviewLinks } from "./case-preview-links.ts";
import { actorOf, Audit, CaseRead, fail, type Actor } from "./core.ts";
import { PlatformClock } from "./platform/identity/port.ts";
import { detect } from "./platform/files/file-type.ts";

export type ScanState = "CLEAN" | "SCANNING" | "QUARANTINED" | "NOT_SCANNED";
const GONE = "No such document.";   // the download's 404 words, for every refusal of a link (leaks nothing)

/** The scan state of a case document. Case files have no scan state on main yet (PF-F3, CS-D1 part 1): see the PR's
 *  question; until it is answered this says NOT_SCANNED and never claims CLEAN. */
export function scanStateOf(_document: { id: string }): ScanState { return "NOT_SCANNED"; }

@Injectable()
export class DocumentPreviews {
  constructor(@Inject(CaseDocuments) private readonly docs: CaseDocuments, @Inject(Audit) private readonly audit: Audit,
    @Inject(PreviewLinks) private readonly links: PreviewLinks, @Inject(PlatformClock) private readonly clock: PlatformClock) {}

  /** POST /runtime/documents/:id/preview-link: the case reached as the download reaches it; a file being checked or
   *  removed makes no link; else one "previewed" line and a link for this asker. */
  async link(actor: Actor, documentId: string) {
    const x = await this.docs.reachDocument(actor, documentId);
    const scan = scanStateOf(x.document);
    if (scan === "SCANNING") fail("Checking for viruses…", HttpStatus.CONFLICT);
    if (scan === "QUARANTINED") fail("Removed — infected file", HttpStatus.GONE);
    const bytes = await x.bytes();
    const found = detect(new Uint8Array(bytes));
    const { token, expiresAt } = this.links.sign(x.workspaceId, actor.id, x.document.id, this.clock.now());
    await this.audit.log(x.workspaceId, actor.id, "previewed", "case document", x.document.id, `${actor.name} previewed ${x.typeName} on case ${x.caseId.slice(0, 8)}`);
    return { url: `${PREVIEW_PATH}${token}`, expires_at: expiresAt, media_type: x.document.mediaType, file_name: x.document.fileName, size_bytes: x.document.sizeBytes,
      uploaded_at: x.document.uploadedAt.toISOString(), scan, contains_scripts: found.ok ? found.activeContent.length > 0 : false };
  }

  /** GET /runtime/document-previews/:token: the token's asker, unaltered, unexpired and unused; the case reached again
   *  (AG-9-53: every read path); the bytes as the download checks them. Every refusal is the download's 404. */
  async bytes(actor: Actor, token: string) {
    const claim = this.links.claims(token);
    if (!claim) fail(GONE, HttpStatus.NOT_FOUND);
    const x = await this.docs.reachDocument(actor, claim!.documentId);
    const now = this.clock.now(), t = this.links.check(token, x.workspaceId, actor.id, now);
    if ("refused" in t || t.document !== x.document.id) fail(GONE, HttpStatus.NOT_FOUND);
    const ok = t as { mac: string; exp: number };
    if (scanStateOf(x.document) === "SCANNING" || scanStateOf(x.document) === "QUARANTINED") fail(GONE, HttpStatus.NOT_FOUND);
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
  @Get("document-previews/:token") async bytes(@Headers("x-actor") a: H, @Param("token") token: string, @Res() res: Response) {
    const f = await this.x.bytes(actorOf(a), token);
    // The download's four headers (case-documents.ts file route): inline, its own type, no sniffing, no scripts, not kept.
    res.setHeader("content-type", f.media); res.setHeader("x-content-type-options", "nosniff"); res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.setHeader("cache-control", "private, no-store"); res.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`); res.end(f.bytes);
  }
}
