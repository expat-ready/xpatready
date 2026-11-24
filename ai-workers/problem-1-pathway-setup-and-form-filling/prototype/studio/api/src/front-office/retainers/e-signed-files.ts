// FO-6 part 4d (BACKLOG row FO-6; AG-5-31 §8 "Download: `agent/retainer:download` (agreements)", §10 "staff download it
// from the agreement", §11 "the hash equals the certificate's"; AG-5-41 short-lived links): the e-signed retainer's sealed
// copy and the provider's audit file (part 3's `fo_signing_evidence`), through the retainer's own download link
// (`POST retainers/:id/download-link` with `file: "signed"` or `"evidence"`) and its own files route (`GET files/:token`).
// The other files of that link (a version's document, the signed paper copy) stay `Retainers.fileKey`'s. Only a RETAINER
// request's evidence is ever named: an OTHER document's sealed copy keeps FO-6d's own route and its own read rule.
// Every value is Sample; legal points: Unconfirmed: no counsel.
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { Db } from "../../core.ts";
import { idParam, parseInput, strict } from "../../platform/http/input.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { Retainers } from "./service.ts";

/** The body that asks for the e-signed files: exactly one of the two, nothing else (PF-28: 422 named, before any look-up). */
export const ESignedLinkBody = strict({ file: z.enum(["signed", "evidence"], { error: "signed or evidence." }) });
/** Whether a download-link body asks for an e-signed file (the route sends every other body to `Retainers.fileKey`). */
export const asksESigned = (b: unknown): boolean => !!b && typeof b === "object" && ["signed", "evidence"].includes((b as { file?: unknown }).file as string);
/** The keys part 3 stores (`signing/service.ts`): `signing/<request id>/<attempt>/sealed.pdf` and `…/audit.pdf`. */
const KEY = /^signing\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]+\/(?:sealed|audit)\.pdf$/;
const notFile = (): never => problem(404, "Not found", "No such file in your firm.", { code: "NOT_FOUND" });

export class RetainerSignedFiles {
  constructor(private readonly db: PrismaClient, private readonly retainers: Retainers) {}

  /** The key of the sealed copy (`signed`) or the audit file (`evidence`) of a retainer the person sees, once everyone
   *  has signed it electronically. Order: malformed id 404 → body 422 → not visible 404 → not e-signed 409 NOT_SIGNED. */
  async fileKey(ctx: StaffContext, id: string, body: unknown): Promise<string> {
    const rid = idParam(id, "retainer");
    const { file } = parseInput(ESignedLinkBody, body ?? {});
    await this.retainers.assertFileVisible(ctx, `retainers/${rid}/`);   // the retainer's own read rule (404 "No such file")
    const q = await this.db.foSignatureRequest.findFirst({ where: { firmId: ctx.firmId, documentKind: "RETAINER", documentId: rid, status: "SIGNED", evidence: { isNot: null } },
      select: { evidence: { select: { sealedFileKey: true, auditFileKey: true } } }, orderBy: { endedAt: "desc" } });
    if (!q?.evidence) return problem(409, "Not possible now", "This agreement is not signed electronically by everyone yet.", { code: "NOT_SIGNED" });
    return file === "signed" ? q.evidence.sealedFileKey : q.evidence.auditFileKey;
  }

  /** The download's second check (the link is the person's own, from `fileKey`): the key is the stored evidence of a
   *  RETAINER request in the person's firm, and the person still sees that retainer; otherwise the one 404. */
  async assertKeyVisible(ctx: StaffContext, key: string): Promise<void> {
    const m = KEY.exec(key);
    if (!m) return notFile();
    const q = await this.db.foSignatureRequest.findFirst({ where: { firmId: ctx.firmId, id: m[1], documentKind: "RETAINER" }, select: { documentId: true, evidence: { select: { sealedFileKey: true, auditFileKey: true } } } });
    if (!q?.evidence || (q.evidence.sealedFileKey !== key && q.evidence.auditFileKey !== key)) return notFile();
    await this.retainers.assertFileVisible(ctx, `retainers/${q.documentId}/`);
  }
}
Inject(Db)(RetainerSignedFiles, undefined, 0);
Inject(Retainers)(RetainerSignedFiles, undefined, 1);
Injectable()(RetainerSignedFiles);
