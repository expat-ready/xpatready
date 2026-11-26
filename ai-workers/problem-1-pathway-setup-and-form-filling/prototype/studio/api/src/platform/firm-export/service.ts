// PF-11 part 1 (map row 22; SA-2-33, AG-16-20, AG-16-22; brief lead-b-briefs/PF-11.md, Lead B's corrections on #1972).
// Who: agent/firm-data-export:request (Owner) asks, re-checked in the transaction as an active Owner (staff and firm rows FOR
// SHARE); agent/firm-data-export:list (Owner, Admin) lists; only the requester downloads (anyone else: the same 404). When:
// TRIAL, ACTIVE or PAYMENT_HOLD (@HoldOpen), else 409. One row per (firm, operationId), one job; the zip is READY for the
// Sample 7 days, then EXPIRED and deleted unless a legal hold covers the firm. One audit line per step, never content.
import { HttpException } from "@nestjs/common";
import { Prisma, type PlatformFirmExport, type PlatformFirmStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { FILE_MAX_BYTES, type FilesPort } from "../../../../ports/files.ts";
import type { FirmExportPort } from "../../../../ports/firm-export.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import type { LegalHoldPort } from "../../../../ports/legal-hold.ts";
import { parseInput, idParam } from "../http/input.ts";
import { actorWord } from "../identity/audit.ts";
import { asBypass, firmScope, touchEachFirm, withFirm } from "../firm-scope.ts";
import { logPort } from "../observability/log.ts";
import { EXPORT_SWEEP_BYPASS } from "./export.bypass.ts";
import { forbidden, problem, type StaffContext } from "../identity/keys.ts";
import { buildPackage, ExportTooLarge } from "./package.ts";
import type { Tx } from "./registry.ts";

export const EXPORT_KEYS = { request: "agent/firm-data-export:request", list: "agent/firm-data-export:list" } as const;
export const BUILD_JOB = "platform.firm_export.build";
export const EXPIRE_JOB = "platform.firm_export.expire";
/** Part 1b: the daily sweep (after PF-11c's close at 07:30, the same zone). */
export const SWEEP_JOB = "platform.firm_export.sweep", SWEEP_CRON = "45 7 * * *", SWEEP_ZONE = "America/Toronto";
/** Sample (brief; Lead B on #1972): how long a ready download stays open. */
export const EXPIRY_DAYS = 7;
/** Sample 500 MB (Lead B on #1972), but never above what FilesPort stores (FILE_MAX_BYTES, 25 MB): a larger firm's
 *  download fails "too large for one download" until the file store takes larger objects (a contract gap). */
export const PACKAGE_CAP = Math.min(500 * 1024 * 1024, FILE_MAX_BYTES);
export const OPEN_STATES: readonly PlatformFirmStatus[] = ["TRIAL", "ACTIVE", "PAYMENT_HOLD"];
const SYSTEM = "system:firm-export", TOO_LARGE = "too large for one download", NOT_MADE = "the download could not be made; ask for a new one";
const CLOSED_FIRM = "the firm's account is not open for a data download";

export type ExportDeps = { db: PrismaClient; port: FirmExportPort<Tx>; files: FilesPort; jobs: JobPort; audit: AuditPort<Tx>; holds: LegalHoldPort<Tx>; now: () => Date; cap?: number };
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
/** Row counts for an audit line: the first 50 sections (AuditDetail's limit; the row keeps them all) and the total. */
const counts = (c: Record<string, number> | null) => (c ? [`total:${Object.values(c).reduce((a, n) => a + n, 0)}`, ...Object.entries(c).slice(0, 49).map(([k, n]) => `${k}:${n}`)] : []);
const values = (r: PlatformFirmExport) => ({ state: r.state, attempt: r.attempt, sha256: r.sha256, sizeBytes: r.sizeBytes, expiresAt: r.expiresAt?.toISOString() ?? null });

export class FirmExports {
  constructor(private readonly d: ExportDeps) {}

  /** The firm's state, its row read FOR SHARE: a role change or state move (which lock the firm row) waits or comes first. */
  private async firmOpen(tx: Tx, firmId: string) {
    const [f] = await tx.$queryRaw<{ status: PlatformFirmStatus }[]>`select status from platform_firm where id = ${firmId}::uuid for share`;
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
  async list(s: StaffContext): Promise<{ items: ExportView[] }> {
    const now = this.d.now();
    return this.d.db.$transaction(async (tx) => {
      await this.firmOpen(tx, s.firmId);
      const rows = await tx.platformFirmExport.findMany({ where: firmScope(s.firmId), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, include: { requester: { select: { displayName: true } } } });
      return { items: rows.map((r) => view(r, now, r.requester.displayName)) };
    });
  }

  /** GET /api/platform/firm-export/:id/download: the requester only, while READY or DOWNLOADED and not expired. The zip
   *  is read before the transaction (up to 25 MB, Lead B's m2); the move to DOWNLOADED is a compare-and-set from READY or
   *  DOWNLOADED before its expiry, so a download racing the expiry answers 410 and never undoes EXPIRED (part 1b, m1). */
  async download(s: StaffContext, rawId: string): Promise<{ bytes: Uint8Array; name: string; sha256: string }> {
    const id = idParam(rawId, "data download"), now = this.d.now();
    const gone = () => problem(410, "This download has expired", "Ask for a new data download.", { code: "EXPIRED" });
    const r = await this.d.db.$transaction(async (tx) => {
      const row = await tx.platformFirmExport.findFirst({ where: { id, firmId: s.firmId } });
      if (!row || row.requestedBy !== s.staffId) return notFound();
      await this.firmOpen(tx, s.firmId);
      return row;
    });
    if (view(r, now).state === "EXPIRED") gone();
    if (r.state === "QUEUED") problem(409, "Not ready yet", "The download is still being made. Try again in a few minutes.", { code: "NOT_READY" });
    if (r.state === "FAILED") problem(409, "This download failed", `It was not made: ${r.failedReason}. Ask for a new one.`, { code: "FAILED" });
    const f = await this.d.files.get(s.firmId, r.fileKey!);
    if (!f || f.sha256 !== r.sha256) throw new HttpException({ title: "Not available", status: 500, detail: "The stored download does not match its record. Ask for a new one.", code: "FILE_MISMATCH" }, 500);
    await this.d.db.$transaction(async (tx) => {
      await this.firmOpen(tx, s.firmId);
      const n = await tx.platformFirmExport.updateMany({ where: { id, firmId: s.firmId, sha256: r.sha256, state: { in: ["READY", "DOWNLOADED"] }, expiresAt: { gt: now } }, data: { state: "DOWNLOADED", downloadedAt: now } });
      if (n.count !== 1) gone();
      const after = await tx.platformFirmExport.findUniqueOrThrow({ where: { id } });
      await this.d.audit.record(tx, { firmId: s.firmId, actor: actorWord(s.staffId), action: "platform.firm_export.downloaded", entity: "platform_firm_export", entityKey: id,
        summary: "The firm's full data download was downloaded", detail: { scope: "FIRM", sha256: r.sha256, sizeBytes: r.sizeBytes, rowCounts: counts(r.rowCounts as Record<string, number> | null) }, before: values(r), after: values(after) });
    });
    return { bytes: f.bytes, name: `firm-data-${r.createdAt.toISOString().slice(0, 10)}.zip`, sha256: r.sha256! };
  }

  /** The build job (PF-14's runner, as the export's firm): QUEUED → READY, or FAILED in plain words. */
  async build(exportId: string, firmId: string): Promise<void> {
    // One build at a time: the claim moves attempt n → n+1 only while QUEUED at n, and the result is written only while the
    // row is still QUEUED at this attempt, so a redelivered job never overwrites a newer build or a download (break M1).
    const r0 = await this.d.db.platformFirmExport.findFirst({ where: { id: exportId, firmId, state: "QUEUED" } });
    if (!r0 || (await this.d.db.platformFirmExport.updateMany({ where: { id: exportId, state: "QUEUED", attempt: r0.attempt }, data: { attempt: r0.attempt + 1 } })).count !== 1) return;
    const claimed = { ...r0, attempt: r0.attempt + 1 };
    let reason: string | null = null, made: { bytes: Uint8Array; rowCounts: Record<string, number>; missing: { module: string; name: string }[] } | null = null;
    try {
      const f = await this.d.db.platformFirm.findUnique({ where: { id: firmId }, select: { status: true, operatingName: true } });
      if (!f || !OPEN_STATES.includes(f.status)) reason = CLOSED_FIRM;
      else made = await buildPackage({ title: `Full data download of ${f.operatingName}`, madeAt: this.d.now(), modules: await this.d.port.collect(firmId), file: async (k) => (await this.d.files.get(firmId, k))?.bytes ?? null, cap: this.d.cap ?? PACKAGE_CAP });
      for (const m of made?.missing ?? []) logPort.error("firm_export_file_missing", new Error("a listed file is missing from the store"), { firmId, module: m.module });
    } catch (e) { reason = e instanceof ExportTooLarge ? TOO_LARGE : NOT_MADE; if (!(e instanceof ExportTooLarge)) logPort.error("firm_export_build_failed", e, { firmId }); }
    const stored = made && !reason ? await this.d.files.put(firmId, `firm-export/${exportId}/${claimed.attempt}.zip`, made.bytes, "application/zip").catch(() => { reason = NOT_MADE; return null; }) : null;
    const now = this.d.now(), expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 86_400_000);
    const won = await this.d.db.$transaction(async (tx) => {
      const n = await tx.platformFirmExport.updateMany({ where: { id: exportId, state: "QUEUED", attempt: claimed.attempt }, data: stored && made
        ? { state: "READY", fileKey: stored.key, sha256: stored.sha256, sizeBytes: made.bytes.byteLength, rowCounts: made.rowCounts, expiresAt }
        : { state: "FAILED", failedReason: reason ?? NOT_MADE } });
      if (n.count !== 1) return false;
      const after = await tx.platformFirmExport.findUniqueOrThrow({ where: { id: exportId } });
      await this.d.audit.record(tx, { firmId, actor: SYSTEM, action: stored ? "platform.firm_export.ready" : "platform.firm_export.failed", entity: "platform_firm_export", entityKey: exportId,
        summary: stored ? "The firm's full data download is ready" : `The firm's full data download failed: ${reason ?? NOT_MADE}`,
        detail: { scope: "FIRM", sha256: stored?.sha256 ?? null, sizeBytes: made?.bytes.byteLength ?? null, rowCounts: counts(made?.rowCounts ?? null) }, before: values(claimed), after: values(after) });
      return true;
    });
    if (!won && stored) await this.d.files.delete(firmId, stored.key);   // a newer build won: this zip has no record
    if (won && stored) await this.d.jobs.schedule(EXPIRE_JOB, expiresAt, { exportId }, { key: `firm-export:${exportId}:expire`, firmId });
  }

  /** The expiry job: READY or DOWNLOADED past its 7 days → EXPIRED, one line; the zip is then deleted (PF-Fd's order:
   *  the legal hold asked in the transaction that commits EXPIRED, the delete after it), or kept while a hold covers the firm.
   *  The move is a compare-and-set from READY or DOWNLOADED (part 1b, m1): a download committing first is not lost. */
  async expire(exportId: string, firmId: string): Promise<void> {
    const key = await this.d.db.$transaction(async (tx) => {
      const r = await tx.platformFirmExport.findFirst({ where: { id: exportId, firmId } });
      if (!r || !(r.state === "READY" || r.state === "DOWNLOADED") || !r.expiresAt || this.d.now() < r.expiresAt) return null;
      const held = (await this.d.holds.isHeld(tx, firmId, [{ kind: "ALL_FIRM_DATA" }])).held;
      const n = await tx.platformFirmExport.updateMany({ where: { id: exportId, firmId, state: { in: ["READY", "DOWNLOADED"] }, expiresAt: { lte: this.d.now() } }, data: { state: "EXPIRED" } });
      if (n.count !== 1) return null;
      const after = await tx.platformFirmExport.findUniqueOrThrow({ where: { id: exportId } });
      await this.d.audit.record(tx, { firmId, actor: SYSTEM, action: "platform.firm_export.expired", entity: "platform_firm_export", entityKey: exportId,
        summary: held ? "The firm's full data download expired; its file is kept while a legal hold covers the firm" : "The firm's full data download expired and its file is deleted", detail: { scope: "FIRM", sha256: r.sha256, held }, before: values(r), after: values(after) });
      return held ? null : r.fileKey;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (key) await this.d.files.delete(firmId, key);
  }

  /** The daily sweep (part 1b, m2 and m3): an export whose expiry job was never scheduled (the schedule failed after READY
   *  committed) expires here; an expired export's zip still stored (kept under a hold now released, or a delete that
   *  failed) is deleted once no hold covers the firm, with one line. Every firm, each in its own firm scope; one firm's
   *  failure never stops the rest. */
  async sweep(): Promise<{ expired: number; deleted: number; failed: number }> {
    const now = this.d.now();
    // The cross-firm list, one platform.bypass line per firm it reads (P-607, PF-12b); a firm whose line fails is skipped
    // and counted failed, as the other daily sweeps do (firm-closure, storage).
    const { rows, unrecorded } = await asBypass(EXPORT_SWEEP_BYPASS, async () => {
      const all = await this.d.db.platformFirmExport.findMany({
        where: { OR: [{ state: { in: ["READY", "DOWNLOADED"] }, expiresAt: { lte: now } }, { state: "EXPIRED" }] }, select: { id: true, firmId: true, state: true, fileKey: true }, orderBy: { id: "asc" } });
      const { failed: lost } = await touchEachFirm(this.d.db, all.map((r) => r.firmId));
      return { rows: all.filter((r) => !lost.has(r.firmId.toLowerCase())), unrecorded: new Set(all.filter((r) => lost.has(r.firmId.toLowerCase())).map((r) => r.firmId)).size };
    });
    const out = { expired: 0, deleted: 0, failed: unrecorded };
    for (const r of rows) {
      try {
        await withFirm(r.firmId, async () => {
          if (r.state !== "EXPIRED") { await this.expire(r.id, r.firmId); out.expired++; return; }
          if (!r.fileKey || !(await this.d.files.exists(r.firmId, r.fileKey))) return;
          const del = await this.d.db.$transaction(async (tx) => {
            if ((await this.d.holds.isHeld(tx, r.firmId, [{ kind: "ALL_FIRM_DATA" }])).held) return false;
            // FilesPort's order: the record first, then the delete; a failed delete is tried again by the next sweep.
            await this.d.audit.record(tx, { firmId: r.firmId, actor: SYSTEM, action: "platform.firm_export.file_deleted", entity: "platform_firm_export", entityKey: r.id,
              summary: "The expired data download's file is being deleted (no legal hold covers the firm now)", detail: { scope: "FIRM" }, before: null, after: null });
            return true;
          });
          if (del && (await this.d.files.delete(r.firmId, r.fileKey)).deleted) out.deleted++;
        });
      } catch (e) { out.failed++; logPort.error("firm_export_sweep_failed", e, { firmId: r.firmId }); }
    }
    return out;
  }

  /** Registers the job handlers and the daily sweep on the runner (the feature file, at start-up). */
  async register(jobs: JobPort) {
    await jobs.handle(SWEEP_JOB, async () => { await this.sweep(); });
    await jobs.recurring(SWEEP_JOB, SWEEP_CRON, SWEEP_ZONE);
    await jobs.handle(BUILD_JOB, (j) => withFirm(j.firmId!, () => this.build(String(j.payload.exportId), j.firmId!)));
    await jobs.handle(EXPIRE_JOB, (j) => withFirm(j.firmId!, () => this.expire(String(j.payload.exportId), j.firmId!)));
  }
}
