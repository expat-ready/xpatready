// PF-26 part 2 (map row 34, R1.34; AG-2-93 rules 1-3, 7, 8, 10; SA-11-36, SA-11-40; shape product/screens/PF-26/shape.md):
// one person's data as one export, asked for, built, downloaded and logged.
// * Who (AG-2-93 rules 1, 2): `agent/data-export:request` (the route's key) AND the requester can see the person
//   (`canSee`): the front office's own-versus-all rule on one of the person's leads or prospects (sales/common.ts
//   visibilityOf and sees), or the case side's scope on a case whose client is the person (case-access.ts caseScope).
//   "Everyone sees all" with view.all sees every person, which is also the only way to export a person with no lead,
//   prospect or client file (AG02-D12). Not seeing the person answers 404, as reading it would (never a hint it exists).
// * One person record (rule 3, SA-11-40): the record asked for, never a merged-away one (404: export the survivor), plus
//   every earlier record merged into it (FO-9b's merged_into_id lineage); a family member is never swept in.
// * Why (the capability's "logged with who and why"; shape question (a)): a reason in the requester's words, 1-300
//   characters, kept on the export row; the audit line names the row (its id), never the free text, which may hold
//   personal data. The package's content never reaches an audit line, an event or a log (rule 7).
// * Switched off until whole (shape, review m7): a request is refused 503 until every module R1.34 names has registered
//   its exporter (REQUIRED_MODULES), so no package is ever offered as complete without the case side's or money sections.
// * Built in the background (rule 8, PF-14's runner, as the export's firm): every registered exporter
//   (ports/person-export.ts) in one REPEATABLE READ, READ ONLY transaction; one failing → FAILED naming the module, no
//   file (AG-2-93 "Failure state"). READY for the Sample 7 days, then EXPIRED and the file deleted, unless a legal hold
//   covers the person (SA-11 BR-7). Only the requester downloads (anyone else, the same 404); each download is a line.
import { HttpException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, type PlatformPersonExport, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { FILE_MAX_BYTES, type FilesPort } from "../../../../ports/files.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import type { LegalHoldPort } from "../../../../ports/legal-hold.ts";
import { buildPersonPackage, ExporterFailed, packageBytes, type PersonExportPort } from "../../../../ports/person-export.ts";
import { caseScope, caseScopeWhere } from "../../case-access.ts";
import { sees, visibilityOf } from "../../front-office/sales/common.ts";
import { idParam, parseInput } from "../http/input.ts";
import { actorWord } from "../identity/audit.ts";
import { problem, type StaffContext } from "../identity/keys.ts";
import { firmScope, withFirm } from "../firm-scope.ts";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;
export const PERSON_EXPORT_KEY = "agent/data-export:request";
export const BUILD_JOB = "platform.person_export.build", EXPIRE_JOB = "platform.person_export.expire";
/** The modules whose sections make the package complete (AG-2-93 rule 4; shape parts 2-4), each named exactly (review
 *  round 2: no wildcard, so part 3a alone never opens it): the person record (part 2), the front office's sales and its
 *  services (3a, 3b), the platform's messages and consents (3b), the case side and client money (part 4). */
export const REQUIRED_MODULES = ["front-office.person", "front-office.sales", "front-office.services", "platform.messages", "case-side", "client-money"] as const;
/** The required modules that have not registered an exporter (empty when the package can be complete). */
export const missingModules = (port: PersonExportPort<unknown>) => REQUIRED_MODULES.filter((m) => !port.exporters().some((e) => e.module === m));
/** Sample (shape; no requirement names a number): how long a ready export stays downloadable. */
export const EXPIRY_DAYS = 7;
const SYSTEM = "system:person-export";
/** One line of ordinary text (review M1, break m1): no control character (a line break or tab too: the table refuses
 *  [[:cntrl:]]), no format character (direction marks, zero-width, word joiner, byte-order mark, tags), no line or
 *  paragraph separator, no lone surrogate; at least one letter or digit; at most 300 characters counted as characters
 *  (break m2), the table's char_length. The table's check says the same (migration). */
const ODD = /(?![\u200c\u200d])[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;   // ZWNJ and ZWJ stay: ordinary Persian and Hindi (break R2-m1)
export const REASON_MAX = 300;
const RequestBody = z.strictObject({
  reason: z.string({ required_error: "Say why you are exporting this person's data." }).trim()
    .min(1, "Say why you are exporting this person's data.")
    .refine((r) => !ODD.test(r) && (r as unknown as { isWellFormed(): boolean }).isWellFormed(), "Write it as one line of ordinary text.")
    .refine((r) => /[\p{L}\p{N}]/u.test(r), "Say why in words.")
    .refine((r) => [...r].length <= REASON_MAX, `Keep the reason to ${REASON_MAX} characters.`),
});
/** The longest merge lineage read (FO-9b's chain); a longer one fails rather than being cut short (review m2). */
export const LINEAGE_MAX = 200;
/** How often a kept or undeleted file's expiry is checked again (review M2, break M2/M3). */
const RECHECK_MS = 86_400_000;
/** A request still QUEUED after this long has lost its build (break R2-M1): a new request closes it FAILED "(stale)"
 *  and starts again, rather than answering the dead row. */
export const STALE_MS = 30 * 60_000;
const expireKey = (id: string, at: Date, run?: Date) => `person-export:${id}:expire:${at.toISOString()}${run ? `:${run.toISOString()}` : ""}`;
const notFound = (what = "person"): never => problem(404, "Not found", what === "person" ? "No such person in your firm." : "No such export in your firm.", { code: "NOT_FOUND" });

export type PersonExportDeps = { db: PrismaClient; port: PersonExportPort<Tx>; files: FilesPort; jobs: JobPort; audit: AuditPort<Tx>; holds: LegalHoldPort<Tx>; now: () => Date };
/** What the requester sees of one export. `state` reads EXPIRED once its 7 days pass, before the job marks it. */
export type PersonExportView = { id: string; personId: string; state: string; reason: string; createdAt: string; finishedAt: string | null; expiresAt: string | null; sizeBytes: number | null; sha256: string | null; failed: boolean };
const view = (r: PlatformPersonExport, now: Date): PersonExportView => ({
  id: r.id, personId: r.personId, reason: r.reason, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
  state: r.state === "READY" && r.expiresAt && now >= r.expiresAt ? "EXPIRED" : r.state,
  expiresAt: r.expiresAt?.toISOString() ?? null, sizeBytes: r.sizeBytes, sha256: r.sha256, failed: r.state === "FAILED",
});
const values = (r: PlatformPersonExport) => ({ state: r.state, sha256: r.sha256, sizeBytes: r.sizeBytes, expiresAt: r.expiresAt?.toISOString() ?? null });

/** The person record and every earlier record merged into it (FO-9b), the record first; null when the firm has no live
 *  record with that id (absent, another firm's, or merged away). Over LINEAGE_MAX records → LineageTooLong (never a
 *  silently shortened package, review m2). */
export class LineageTooLong extends Error {}
export async function lineageOf(db: Db, firmId: string, personId: string): Promise<string[] | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    with recursive l(id, depth) as (
      select p.id, 0 from fo_person p where p.firm_id = ${firmId}::uuid and p.id = ${personId}::uuid and p.merged_into_id is null
      union
      select p.id, l.depth + 1 from fo_person p join l on p.merged_into_id = l.id where p.firm_id = ${firmId}::uuid and l.depth <= ${LINEAGE_MAX})
    select id::text as id from l order by depth, id limit ${LINEAGE_MAX + 1}`;
  if (rows.length > LINEAGE_MAX) throw new LineageTooLong();
  return rows.length ? rows.map((r) => r.id.toLowerCase()) : null;
}

/** AG-2-93 rule 2: may this staff member see the person (any of its records)? */
export async function canSee(db: Db, ctx: StaffContext, records: string[]): Promise<boolean> {
  const firmId = firmScope(ctx.firmId).firmId, vis = await visibilityOf(db, ctx);
  if (vis.seesAll) return true;
  const leads = await db.foLead.findMany({ where: { firmId, personId: { in: records } }, select: { ownerStaffId: true } });
  if (leads.some((l) => sees(vis, ctx, l.ownerStaffId))) return true;
  const prospects = await db.foProspect.findMany({ where: { firmId, OR: [{ subjectPersonId: { in: records } }, { primaryContactPersonId: { in: records } }] }, select: { ownerStaffId: true } });
  if (prospects.some((p) => sees(vis, ctx, p.ownerStaffId))) return true;
  const scope = await caseScope(db, { firmId, staffId: ctx.staffId, keys: ctx.keys });
  if (!scope.member) return false;
  if (await db.case.findFirst({ where: { AND: [caseScopeWhere(scope), { client: { foPersonId: { in: records } } }] }, select: { id: true } })) return true;
  // Review m1 (AG-2-93 rule 2, AG-7-88): the person's client file, with or without a case: all with case view.all, else
  // the file's owner.
  if (!scope.all && !scope.own) return false;
  return !!(await db.caseClient.findFirst({ where: { firmId, foPersonId: { in: records }, ...(scope.all ? {} : { fileOwner: scope.staffId }) }, select: { id: true } }));
}

export class PersonExports {
  constructor(private readonly d: PersonExportDeps) {}

  /** 503 until every required module has registered (review m7). */
  private open(): void {
    if (missingModules(this.d.port).length) problem(503, "Not available yet", "One person's data export opens once every part of the product adds its data to it.", { code: "NOT_AVAILABLE_YET" });
  }

  /** The person's lineage when the caller may export it; 404 otherwise (absent, merged away, another firm's, not seen). */
  private async seen(db: Db, s: StaffContext, personId: string): Promise<string[]> {
    const records = await lineageOf(db, s.firmId, personId).catch((e) => {
      if (e instanceof LineageTooLong) problem(409, "Too many merged records", "This person has more merged records than one export can hold. Ask us for help.", { code: "LINEAGE_TOO_LONG" });
      throw e;
    });
    if (!records || !(await canSee(db, s, records))) return notFound();
    return records;
  }

  /** GET people/:personId/exports/allowed: whether the action is offered (the screen asks; the server decides). */
  async allowed(s: StaffContext, rawPerson: string): Promise<{ allowed: true }> {
    await this.seen(this.d.db, s, idParam(rawPerson, "person"));
    this.open();
    return { allowed: true };
  }

  /** POST people/:personId/exports { reason }: one request and its build job; one audit line (who, the person, why). */
  async request(s: StaffContext, rawPerson: string, body: unknown): Promise<PersonExportView> {
    const personId = idParam(rawPerson, "person"), { reason } = parseInput(RequestBody, body ?? {}), firmId = s.firmId;
    this.open();
    const row = await this.d.db.$transaction(async (tx) => {
      await this.seen(tx, s, personId);
      // Review m4: a second click while the first is still being prepared is the same export, not a second copy; one
      // queued longer than STALE_MS lost its build and is closed (break R2-M1). Two requests in the same instant can still
      // make two rows, both logged (break R2-m2, Minor).
      const queued = await tx.platformPersonExport.findFirst({ where: firmScope(firmId, { personId, requestedBy: s.staffId.toLowerCase(), state: "QUEUED" }), orderBy: { createdAt: "desc" } });
      if (queued && this.d.now().getTime() - queued.createdAt.getTime() < STALE_MS) return queued;
      if (queued) await this.closeStale(tx, queued);
      const r = await tx.platformPersonExport.create({ data: { firmId, personId, requestedBy: s.staffId, reason } });
      await this.d.audit.record(tx, { firmId, actor: actorWord(s.staffId), action: "platform.person_export.requested", entity: "platform_person_export", entityKey: r.id,
        summary: "One person's data export was asked for (the reason is on the export)", detail: { scope: "PERSON", personId }, before: null, after: values(r) });
      return r;
    });
    try { await this.d.jobs.enqueue(BUILD_JOB, { exportId: row.id }, { key: `person-export:${row.id}`, firmId }); }
    catch {
      // Review m3: a row with no job would wait forever; it fails now, plainly, and a new request starts again.
      await this.finish(row.id, firmId, row, { state: "FAILED", failedModule: "(queue)", finishedAt: this.d.now() }, null);
      problem(503, "Export failed", "The export could not be started. Try again.", { code: "NOT_STARTED" });
    }
    return view(row, this.d.now());
  }

  /** GET people/:personId/exports: the caller's own exports of this person, newest first (others' are not theirs). */
  async list(s: StaffContext, rawPerson: string): Promise<{ items: PersonExportView[] }> {
    const personId = idParam(rawPerson, "person"), now = this.d.now();
    await this.seen(this.d.db, s, personId);
    const rows = await this.d.db.platformPersonExport.findMany({ where: firmScope(s.firmId, { personId, requestedBy: s.staffId }), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
    return { items: rows.map((r) => view(r, now)) };
  }

  /** The requester's own export of a person they still see, else 404. */
  private async own(db: Db, s: StaffContext, rawPerson: string, rawId: string): Promise<PlatformPersonExport> {
    const personId = idParam(rawPerson, "person"), id = idParam(rawId, "export");
    const r = await db.platformPersonExport.findFirst({ where: firmScope(s.firmId, { id, personId }) });
    if (!r || r.requestedBy !== s.staffId.toLowerCase()) return notFound("export");
    await this.seen(db, s, personId);
    return r;
  }

  /** GET people/:personId/exports/:id */
  async read(s: StaffContext, rawPerson: string, rawId: string): Promise<PersonExportView> {
    return view(await this.own(this.d.db, s, rawPerson, rawId), this.d.now());
  }

  /** GET people/:personId/exports/:id/download: the requester only, while READY and not expired; one line each time. */
  async download(s: StaffContext, rawPerson: string, rawId: string): Promise<{ bytes: Uint8Array; name: string; sha256: string }> {
    const now = this.d.now();
    return this.d.db.$transaction(async (tx) => {
      const r = await this.own(tx, s, rawPerson, rawId);
      const v = view(r, now);
      if (v.state === "EXPIRED") problem(410, "This download has expired", "Request the export again.", { code: "EXPIRED" });
      if (r.state === "QUEUED") problem(409, "Not ready yet", "The export is still being prepared. Try again in a minute.", { code: "NOT_READY" });
      if (r.state === "FAILED") problem(409, "Export failed", "The export could not be made. Try again.", { code: "FAILED" });
      const f = await this.d.files.get(s.firmId, r.fileKey!);
      if (!f || f.sha256 !== r.sha256) throw new HttpException({ title: "Not available", status: 500, detail: "The stored export does not match its record. Request it again.", code: "FILE_MISMATCH" }, 500);
      await this.d.audit.record(tx, { firmId: s.firmId, actor: actorWord(s.staffId), action: "platform.person_export.downloaded", entity: "platform_person_export", entityKey: r.id,
        summary: "One person's data export was downloaded", detail: { scope: "PERSON", personId: r.personId, sha256: r.sha256, sizeBytes: r.sizeBytes }, before: null, after: values(r) });
      return { bytes: f.bytes, name: `person-data-${r.createdAt.toISOString().slice(0, 10)}.json`, sha256: r.sha256! };
    });
  }

  /** A request whose build never finished: FAILED "(stale)", one line (break R2-M1). */
  private async closeStale(tx: Tx, r: PlatformPersonExport): Promise<void> {
    const n = await tx.platformPersonExport.updateMany({ where: { id: r.id, firmId: r.firmId, state: "QUEUED" }, data: { state: "FAILED", failedModule: "(stale)", finishedAt: this.d.now() } });
    if (n.count !== 1) return;
    const after = await tx.platformPersonExport.findUniqueOrThrow({ where: { id: r.id } });
    await this.d.audit.record(tx, { firmId: r.firmId, actor: SYSTEM, action: "platform.person_export.failed", entity: "platform_person_export", entityKey: r.id,
      summary: "One person's data export failed", detail: { scope: "PERSON", personId: r.personId, sha256: null, records: null, module: "(stale)" }, before: values(r), after: values(after) });
  }

  /** QUEUED → READY or FAILED with one audit line, in one transaction; false when the row was no longer QUEUED. */
  private async finish(exportId: string, firmId: string, r0: PlatformPersonExport, data: Prisma.PlatformPersonExportUpdateManyMutationInput, made: { sha256: string; records: number } | null): Promise<boolean> {
    return this.d.db.$transaction(async (tx) => {
      const n = await tx.platformPersonExport.updateMany({ where: { id: exportId, firmId, state: "QUEUED" }, data });
      if (n.count !== 1) return false;
      const after = await tx.platformPersonExport.findUniqueOrThrow({ where: { id: exportId } });
      const ready = after.state === "READY";
      await this.d.audit.record(tx, { firmId, actor: SYSTEM, action: ready ? "platform.person_export.ready" : "platform.person_export.failed", entity: "platform_person_export", entityKey: exportId,
        summary: ready ? "One person's data export is ready" : "One person's data export failed", detail: { scope: "PERSON", personId: r0.personId, sha256: made?.sha256 ?? null, records: made?.records ?? null, module: ready ? null : after.failedModule },
        before: values(r0), after: values(after) });
      return true;
    });
  }

  /** The build job (as the export's firm): QUEUED → READY with the file, or FAILED naming the module. Everything the
   *  package reads (the lineage, the language, every module) is read in one REPEATABLE READ, READ ONLY transaction
   *  (review m5). Each attempt stores its own file (person-export/<id>/<attempt>.json): the store is write-once, so a
   *  retry never collides with an earlier attempt's bytes, and an attempt whose result is not recorded (the row moved on,
   *  or the final transaction failed) deletes its own file before it ends (review M3, break M1). */
  async build(exportId: string, firmId: string): Promise<void> {
    const r = await this.d.db.platformPersonExport.findFirst({ where: firmScope(firmId, { id: exportId }) });
    // A redelivered build of a READY export makes sure its expiry is queued (review R2-m2: a schedule that failed after
    // READY); the same key never queues twice.
    if (r?.state === "READY" && r.expiresAt) { await this.d.jobs.schedule(EXPIRE_JOB, r.expiresAt, { exportId }, { key: expireKey(exportId, r.expiresAt), firmId }); return; }
    if (!r || r.state !== "QUEUED") return;
    const r0 = r, now = this.d.now();
    let made: { bytes: Uint8Array; sha256: string; records: string[] } | null = null, failedModule: string | null = null;
    try {
      made = await this.d.db.$transaction(async (tx) => {
        await tx.$executeRaw`set transaction read only`;
        const records = await lineageOf(tx, firmId, r0.personId).catch((e) => { throw e instanceof LineageTooLong ? new ExporterFailed("(lineage)", "too many merged records") : e; });
        if (!records) throw new ExporterFailed("(person)", "the person record is gone or was merged away");
        if (missingModules(this.d.port).length) throw new ExporterFailed("(modules)", "a required module has not registered");
        const pkg = await buildPersonPackage(this.d.port, (fn) => fn(tx), { firmId, personId: r0.personId, records }, now);
        const [p] = await tx.foPerson.findMany({ where: firmScope(firmId, { id: r0.personId }), select: { language: true } });
        const withLanguage: typeof pkg & { language: string | null } = { ...pkg, language: p?.language ?? null };   // rule 6: the person's language named
        const out = await packageBytes(withLanguage);
        // The size limit (review round 2): the file store's own, FILE_MAX_BYTES (25 MB); a larger package fails whole.
        if (out.bytes.byteLength > FILE_MAX_BYTES) throw new ExporterFailed("(too-large)", "the package is over the file store's limit");
        return { ...out, records };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (e) { failedModule = e instanceof ExporterFailed ? e.module : "(build)"; made = null; }
    const key = `person-export/${exportId}/${randomUUID()}.json`;
    const stored = made ? await this.d.files.put(firmId, key, made.bytes, "application/json").catch(() => { failedModule = "(files)"; return null; }) : null;
    const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 86_400_000);
    let won = false;
    try {
      won = await this.finish(exportId, firmId, r0, stored && made
        ? { state: "READY", fileKey: stored.key, sha256: stored.sha256, sizeBytes: made.bytes.byteLength, records: made.records, expiresAt, finishedAt: now }
        : { state: "FAILED", failedModule: failedModule ?? "(build)", finishedAt: now }, made && stored ? { sha256: stored.sha256, records: made.records.length } : null);
    } finally {
      // This attempt's file has no record: never left behind. When the final step's answer was lost, the row is read
      // again first, so a file it did record is never deleted (break R2-m4).
      if (!won && stored) {
        const now2 = await this.d.db.platformPersonExport.findFirst({ where: firmScope(firmId, { id: exportId }), select: { fileKey: true } }).catch(() => null);
        if (now2?.fileKey !== stored.key) await this.d.files.delete(firmId, stored.key);
      }
    }
    if (won && stored) await this.d.jobs.schedule(EXPIRE_JOB, expiresAt, { exportId }, { key: expireKey(exportId, expiresAt), firmId });   // a throw retries the job, which re-ensures it
  }

  /** The expiry job, safe to run again (review M2, break M2, M3, m3):
   *  * before its time → scheduled again for its time;
   *  * READY past its 7 days with a legal hold on the person → stays READY (the download already answers 410), one line
   *    the first time, and checked again daily, so the file goes once the hold is released;
   *  * READY past its 7 days, no hold → EXPIRED with one line, then the file deleted after the commit (PF-Fd's order);
   *  * EXPIRED whose file is still stored (a delete that failed) → the delete again. A failing delete throws, so the
   *    runner retries the job. */
  async expire(exportId: string, firmId: string): Promise<void> {
    const now = this.d.now();
    // Each reschedule has its own key (break R2-M3, review R2-m1): the running job's key is already used.
    const next = (at: Date) => this.d.jobs.schedule(EXPIRE_JOB, at, { exportId }, { key: expireKey(exportId, at, now), firmId });
    const step = await this.d.db.$transaction(async (tx): Promise<{ delete: string | null; again: Date | null }> => {
      const r = await tx.platformPersonExport.findFirst({ where: firmScope(firmId, { id: exportId }) });
      if (!r || !r.fileKey || !r.expiresAt) return { delete: null, again: null };
      if (r.state === "EXPIRED") return { delete: r.fileKey, again: null };
      if (r.state !== "READY") return { delete: null, again: null };
      if (now < r.expiresAt) return { delete: null, again: r.expiresAt };
      const held = (await this.d.holds.isHeld(tx, firmId, [{ kind: "PERSON", id: r.personId }])).held;
      if (held) {
        const told = await tx.auditEvent.findFirst({ where: { firmId, action: "platform.person_export.kept", entityKey: exportId }, select: { id: true } });
        if (!told) await this.d.audit.record(tx, { firmId, actor: SYSTEM, action: "platform.person_export.kept", entity: "platform_person_export", entityKey: exportId,
          summary: "One person's data export is past its download days; its file is kept while a legal hold covers the person", detail: { scope: "PERSON", personId: r.personId, sha256: r.sha256 }, before: values(r), after: values(r) });
        return { delete: null, again: new Date(now.getTime() + RECHECK_MS) };
      }
      const after = await tx.platformPersonExport.update({ where: { id: exportId }, data: { state: "EXPIRED" } });
      await this.d.audit.record(tx, { firmId, actor: SYSTEM, action: "platform.person_export.expired", entity: "platform_person_export", entityKey: exportId,
        summary: "One person's data export expired and its file is deleted", detail: { scope: "PERSON", personId: r.personId, sha256: r.sha256 }, before: values(r), after: values(after) });
      return { delete: r.fileKey, again: null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (step.again) await next(step.again);
    if (step.delete) await this.d.files.delete(firmId, step.delete);   // deleted: false when already gone; a throw retries the job
  }

  /** Both job handlers on the runner (the feature file, at start-up). */
  async register(jobs: JobPort) {
    await jobs.handle(BUILD_JOB, (j) => withFirm(j.firmId!, () => this.build(String(j.payload.exportId), j.firmId!)));
    await jobs.handle(EXPIRE_JOB, (j) => withFirm(j.firmId!, () => this.expire(String(j.payload.exportId), j.firmId!)));
  }
}
