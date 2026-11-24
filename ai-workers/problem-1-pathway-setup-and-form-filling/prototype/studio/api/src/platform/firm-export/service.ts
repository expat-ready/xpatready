// PF-11 part 1 (map row 22; SA-2-33, AG-16-20, AG-16-22; brief lead-b-briefs/PF-11.md, Lead B's corrections on #1972).
// Who: agent/firm-data-export:request (Owner, PF-3's seed) asks, re-checked in the transaction as an active Owner (the staff
// row FOR SHARE, so a deactivation waits or comes first); agent/firm-data-export:list (Owner, Admin) lists; only the
// requester downloads (anyone else, any other firm: the same 404). When: TRIAL, ACTIVE or PAYMENT_HOLD (@HoldOpen); else 409.
// One row per (firm, operationId): the same id again is the same request and one job. The job zips every registered module
// (FirmExportPort, package.ts) under the cap, stores it per attempt; READY for the Sample 7 days, then EXPIRED (the file stays
// until PF-Fd adds a delete: a contract gap). One audit line per step: actor, scope FIRM, counts, hash; never content.
import { HttpException } from "@nestjs/common";
import { Prisma, type PlatformFirmExport, type PlatformFirmStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { FILE_MAX_BYTES, type FilesPort } from "../../../../ports/files.ts";
import type { FirmExportPort } from "../../../../ports/firm-export.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import { parseInput, idParam } from "../http/input.ts";
import { actorWord } from "../identity/audit.ts";
import { withFirm } from "../firm-scope.ts";
import { forbidden, problem, type StaffContext } from "../identity/keys.ts";
import { buildPackage, ExportTooLarge } from "./package.ts";
import type { Tx } from "./registry.ts";

export const EXPORT_KEYS = { request: "agent/firm-data-export:request", list: "agent/firm-data-export:list" } as const;
export const BUILD_JOB = "platform.firm_export.build";
export const EXPIRE_JOB = "platform.firm_export.expire";
/** Sample (brief; Lead B on #1972): how long a ready download stays open. */
export const EXPIRY_DAYS = 7;
/** Sample 500 MB (Lead B on #1972), but never above what FilesPort stores (FILE_MAX_BYTES, 25 MB): a larger firm's
 *  download fails "too large for one download" until the file store takes larger objects (a contract gap). */
export const PACKAGE_CAP = Math.min(500 * 1024 * 1024, FILE_MAX_BYTES);
export const OPEN_STATES: readonly PlatformFirmStatus[] = ["TRIAL", "ACTIVE", "PAYMENT_HOLD"];
const SYSTEM = "system:firm-export";
const TOO_LARGE = "too large for one download";
const NOT_MADE = "the download could not be made; ask for a new one";
const CLOSED_FIRM = "the firm's account is not open for a data download";

export type ExportDeps = { db: PrismaClient; port: FirmExportPort<Tx>; files: FilesPort; jobs: JobPort; audit: AuditPort<Tx>; now: () => Date; cap?: number };
const RequestBody = z.strictObject({ operationId: z.string().uuid("an operation id (uuid)") });
const notFound = (): never => problem(404, "Not found", "No such data download in your firm.", { code: "NOT_FOUND" });

/** What a person sees of a request: who, when, the state (EXPIRED once its 7 days pass), and the facts of the file. */
export type ExportView = { id: string; operationId: string; requestedBy: string; requestedByName: string | null; state: string; createdAt: string; expiresAt: string | null; downloadedAt: string | null; sizeBytes: number | null; sha256: string | null; failedReason: string | null };
const view = (r: PlatformFirmExport, now: Date, name: string | null = null): ExportView => ({
  id: r.id, operationId: r.operationId, requestedBy: r.requestedBy, requestedByName: name,
  state: (r.state === "READY" || r.state === "DOWNLOADED") && r.expiresAt && now >= r.expiresAt ? "EXPIRED" : r.state,
  createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt?.toISOString() ?? null, downloadedAt: r.downloadedAt?.toISOString() ?? null,
  sizeBytes: r.sizeBytes, sha256: r.sha256, failedReason: r.failedReason,
});
const values = (r: PlatformFirmExport) => ({ state: r.state, attempt: r.attempt, sha256: r.sha256, sizeBytes: r.sizeBytes, expiresAt: r.expiresAt?.toISOString() ?? null });

export class FirmExports {
  constructor(private readonly d: ExportDeps) {}

  private async firmOpen(tx: Tx, firmId: string) {
    const f = await tx.platformFirm.findUnique({ where: { id: firmId }, select: { status: true } });
    if (!f || !OPEN_STATES.includes(f.status)) problem(409, "Not open for a data download", "Your firm's data download is open in Trial, Active and Payment hold only.", { code: "FIRM_NOT_OPEN" });
  }

  /** POST /api/platform/firm-export { operationId }: the active-Owner re-check, then one request per operationId. */
  async request(s: StaffContext, body: unknown): Promise<ExportView & { repeated: boolean }> {
    const { operationId } = parseInput(RequestBody, body ?? {});
    const firmId = s.firmId, now = this.d.now();
    const out = await this.d.db.$transaction(async (tx) => {
      await this.firmOpen(tx, firmId);
      const owner = await tx.$queryRaw<{ ok: boolean }[]>`select true as ok from platform_staff st where st.id = ${s.staffId}::uuid and st.firm_id = ${firmId}::uuid and st.status = 'ACTIVE'
        and exists (select 1 from platform_role_grant g where g.staff_id = st.id and g.firm_id = st.firm_id and g.role = 'OWNER' and g.ended_at is null) for share of st`;
      if (!owner.length) forbidden("Only an active Owner of the firm can ask for the firm's data download.", "NOT_ACTIVE_OWNER");
      const had = await tx.platformFirmExport.findUnique({ where: { firmId_operationId: { firmId, operationId } } });
      if (had) return { row: had, repeated: true };
      const row = await tx.platformFirmExport.create({ data: { firmId, operationId, requestedBy: s.staffId } });
      await this.d.audit.record(tx, { firmId, actor: actorWord(s.staffId), action: "platform.firm_export.requested", entity: "platform_firm_export", entityKey: row.id,
        summary: "The firm's full data download was asked for", detail: { scope: "FIRM", operationId }, before: null, after: values(row) });
      return { row, repeated: false };
    }).catch(async (e) => {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;   // two requests at once with one operationId: the first wins
      return { row: await this.d.db.platformFirmExport.findUniqueOrThrow({ where: { firmId_operationId: { firmId, operationId } } }), repeated: true };
    });
    await this.d.jobs.enqueue(BUILD_JOB, { exportId: out.row.id }, { key: `firm-export:${out.row.id}`, firmId });   // a repeat queues nothing (its key)
    return { ...view(out.row, now), repeated: out.repeated };
  }

  /** GET /api/platform/firm-export: the firm's requests, newest first. */
  async list(_s: StaffContext): Promise<{ items: ExportView[] }> {
    const rows = await this.d.db.platformFirmExport.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, include: { requester: { select: { displayName: true } } } });
    const now = this.d.now();
    return { items: rows.map((r) => view(r, now, r.requester.displayName)) };
  }

  /** GET /api/platform/firm-export/:id/download: the requester only, while READY or DOWNLOADED and not expired. */
  async download(s: StaffContext, rawId: string): Promise<{ bytes: Uint8Array; name: string; sha256: string }> {
    const id = idParam(rawId, "data download"), now = this.d.now();
    return this.d.db.$transaction(async (tx) => {
      const r = await tx.platformFirmExport.findFirst({ where: { id, firmId: s.firmId } });
      if (!r || r.requestedBy !== s.staffId) return notFound();
      await this.firmOpen(tx, s.firmId);
      const v = view(r, now);
      if (v.state === "EXPIRED") problem(410, "This download has expired", "Ask for a new data download.", { code: "EXPIRED" });
      if (r.state === "QUEUED") problem(409, "Not ready yet", "The download is still being made. Try again in a few minutes.", { code: "NOT_READY" });
      if (r.state === "FAILED") problem(409, "This download failed", `It was not made: ${r.failedReason}. Ask for a new one.`, { code: "FAILED" });
      const f = await this.d.files.get(s.firmId, r.fileKey!);
      if (!f || f.sha256 !== r.sha256) throw new HttpException({ title: "Not available", status: 500, detail: "The stored download does not match its record. Ask for a new one.", code: "FILE_MISMATCH" }, 500);
      const after = await tx.platformFirmExport.update({ where: { id }, data: { state: "DOWNLOADED", downloadedAt: now } });
      await this.d.audit.record(tx, { firmId: s.firmId, actor: actorWord(s.staffId), action: "platform.firm_export.downloaded", entity: "platform_firm_export", entityKey: id,
        summary: "The firm's full data download was downloaded", detail: { scope: "FIRM", sha256: r.sha256, sizeBytes: r.sizeBytes }, before: values(r), after: values(after) });
      return { bytes: f.bytes, name: `firm-data-${r.createdAt.toISOString().slice(0, 10)}.zip`, sha256: r.sha256! };
    });
  }

  /** The build job (PF-14's runner, as the export's firm): QUEUED → READY, or FAILED in plain words. */
  async build(exportId: string, firmId: string): Promise<void> {
    const claimed = await this.d.db.$transaction(async (tx) => {
      const r = await tx.platformFirmExport.findFirst({ where: { id: exportId, firmId } });
      if (!r || r.state !== "QUEUED") return null;
      return tx.platformFirmExport.update({ where: { id: exportId }, data: { attempt: { increment: 1 } } });
    });
    if (!claimed) return;
    let reason: string | null = null, made: { bytes: Uint8Array; rowCounts: Record<string, number> } | null = null;
    try {
      const f = await this.d.db.platformFirm.findUnique({ where: { id: firmId }, select: { status: true, operatingName: true } });
      if (!f || !OPEN_STATES.includes(f.status)) reason = CLOSED_FIRM;
      else made = await buildPackage({ title: `Full data download of ${f.operatingName}`, madeAt: this.d.now(), modules: await this.d.port.collect(firmId), file: async (k) => (await this.d.files.get(firmId, k))?.bytes ?? null, cap: this.d.cap ?? PACKAGE_CAP });
    } catch (e) { reason = e instanceof ExportTooLarge ? TOO_LARGE : NOT_MADE; }
    const stored = made && !reason ? await this.d.files.put(firmId, `firm-export/${exportId}/${claimed.attempt}.zip`, made.bytes, "application/zip").catch(() => { reason = NOT_MADE; return null; }) : null;
    const now = this.d.now(), expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 86_400_000);
    await this.d.db.$transaction(async (tx) => {
      const after = await tx.platformFirmExport.update({ where: { id: exportId }, data: stored && made
        ? { state: "READY", fileKey: stored.key, sha256: stored.sha256, sizeBytes: made.bytes.byteLength, rowCounts: made.rowCounts, expiresAt }
        : { state: "FAILED", failedReason: reason ?? NOT_MADE } });
      const counts = made ? Object.entries(made.rowCounts).slice(0, 50).map(([k, n]) => `${k}:${n}`) : [];
      await this.d.audit.record(tx, { firmId, actor: SYSTEM, action: stored ? "platform.firm_export.ready" : "platform.firm_export.failed", entity: "platform_firm_export", entityKey: exportId,
        summary: stored ? "The firm's full data download is ready" : `The firm's full data download failed: ${reason ?? NOT_MADE}`,
        detail: { scope: "FIRM", sha256: stored?.sha256 ?? null, sizeBytes: made?.bytes.byteLength ?? null, rowCounts: counts }, before: values(claimed), after: values(after) });
    });
    if (stored) await this.d.jobs.schedule(EXPIRE_JOB, expiresAt, { exportId }, { key: `firm-export:${exportId}:expire`, firmId });
  }

  /** The expiry job: READY or DOWNLOADED past its 7 days → EXPIRED, one line. */
  async expire(exportId: string, firmId: string): Promise<void> {
    await this.d.db.$transaction(async (tx) => {
      const r = await tx.platformFirmExport.findFirst({ where: { id: exportId, firmId } });
      if (!r || !(r.state === "READY" || r.state === "DOWNLOADED") || !r.expiresAt || this.d.now() < r.expiresAt) return;
      const after = await tx.platformFirmExport.update({ where: { id: exportId }, data: { state: "EXPIRED" } });
      await this.d.audit.record(tx, { firmId, actor: SYSTEM, action: "platform.firm_export.expired", entity: "platform_firm_export", entityKey: exportId,
        summary: "The firm's full data download expired (the file stays stored until a delete exists)", detail: { scope: "FIRM", sha256: r.sha256 }, before: values(r), after: values(after) });
    });
  }

  /** Registers both job handlers on the runner (the feature file, at start-up). */
  async register(jobs: JobPort) {
    await jobs.handle(BUILD_JOB, (j) => withFirm(j.firmId!, () => this.build(String(j.payload.exportId), j.firmId!)));
    await jobs.handle(EXPIRE_JOB, (j) => withFirm(j.firmId!, () => this.expire(String(j.payload.exportId), j.firmId!)));
  }
}
