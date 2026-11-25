// PF-10b part 1 (R1.35; map row 35; AG-18-1, -6, -8, -9, -11, -12, -13, -15, -16, -17, -20, -38, -49, -52, -54, -58): the
// one import engine. Upload a CSV (stored through FilesPort, its SHA-256 on the batch) → map its columns to the target's
// fields (a saved mapping per source and target is offered first) → a DRY RUN checks every row against the target and the
// firm (outcomes CREATE | MERGE | SKIP | ERROR with {field, rule} reasons, never the value) and writes nothing to a record
// → the RUN is allowed only for the dry run's file + mapping hash, after the Owner's attestation when the target holds
// personal data; each row in its own transaction, re-checked against the firm as it is then (AG-18-17), its RUN row keyed
// (batch, RUN, row number) so a run started again writes no row twice (AG-18-20). A natural key is locked for its row's
// transaction, so two batches never create one person twice. Every step writes one audit line (AG-18-54), counts only.
// The firm is always the session's (PF-4's guard); PF-12's walls hold every table. Not in this part: undo, the result
// report and its notification, .xlsx (question 7), the background job and the file scan (PF-F3): see the PR's shape.
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { ENGINE_RULE, MAX_REASONS, Mapping, Reason, mappingFaults, suggestMapping, type ImportContext, type ImportTarget, type ImportTargets } from "../../../../ports/import-target.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { actorWord } from "../identity/audit.ts";
import { problem, type StaffContext } from "../identity/keys.ts";
import { CsvRefused, readCsv, type Csv } from "./csv.ts";

type Tx = Prisma.TransactionClient;
export const RUN_KEY = "agent/import:run";
export const VIEW_KEY = "agent/import:view-report";
/** The attestation's wording (AG-18-49; Sample wording, Unconfirmed: no counsel). A new wording is a new version. */
export const ATTESTATION = {
  version: "2026-11-25.1",
  words: "I confirm, as an Owner of this firm, that the firm may lawfully transfer the personal data in the files we import, and that the people in them were told how the firm uses their data.",
  unconfirmed: "Unconfirmed: no counsel",
} as const;
/** The importer's declaration for a consent column (AG-18-45; Sample wording). */
export const DECLARATION = "I declare that each person marked \"yes\" in the consent column agreed to receive that kind of message from our firm, and that we can show how.";
/** How long a finished batch can be undone (AG-18-39, Sample 14 days; undo itself is PF-10b part 2). */
export const UNDO_DAYS = 14;
const PAGE = 50;

/** The words a person reads for a reason's rule (a target's own rules fall back to their name). */
export const RULE_WORDS: Record<string, string> = {
  required: "is required", duplicate_in_file: "is the same as an earlier row of this file (that row is imported)", nothing_new: "is already on the record: nothing to add",
  cell_count: "has a different number of cells from the header", not_email: "is not an email address", not_phone: "is not a phone number",
  not_language: "is not a language code (for example en or fr)", not_allowed_value: "is not one of the allowed values", too_long: "is too long",
  no_contact: "needs an email or a phone", not_text: "has characters that cannot be saved",
};
export const reasonWords = (t: ImportTarget<unknown> | undefined, r: Reason) => `${t?.fields.find((f) => f.key === r.field)?.label ?? r.field}: ${RULE_WORDS[r.rule] ?? r.rule.replace(/_/g, " ")}`;

export type ImportDeps = { db: PrismaClient; audit: AuditPort<Tx>; files: FilesPort; targets: ImportTargets<Tx>; now?: () => Date };

const sha256 = async (s: string | Uint8Array) => Buffer.from(await crypto.subtle.digest("SHA-256", typeof s === "string" ? new TextEncoder().encode(s) : s)).toString("hex");
const canonical = (m: Mapping) => JSON.stringify({ columns: Object.fromEntries(Object.entries(m.columns).sort(([a], [b]) => (a < b ? -1 : 1))), declared: m.declared });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SourceName = z.string().trim().min(1, "This is required.").max(200).refine((v) => /[\p{L}\p{N}]/u.test(v) && !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(v), "Name the source in ordinary words (letters or digits, one line).");
const DryRunBody = z.strictObject({ columns: Mapping.shape.columns, declared: z.boolean().default(false), saveMapping: z.boolean().default(true) });
const RunBody = z.strictObject({ dryRunHash: z.string().regex(/^[0-9a-f]{64}$/, "This is not a dry run's code.") });
const AttestBody = z.strictObject({ version: z.literal(ATTESTATION.version, { message: "The attestation's wording has changed: read it again." }), confirm: z.literal(true, { message: "Tick the box to confirm." }) });

const fail = (status: number, code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(status, status === 409 ? "Not now" : "Not imported", detail, { code, ...extra });
const parseBody = <S extends z.ZodTypeAny>(s: S, raw: unknown): z.output<S> => { const r = s.safeParse(raw ?? {}); if (!r.success) problem(FIELD_ERROR_STATUS, "Not imported", "Check the fields named.", { code: "INVALID_INPUT", fields: fieldsOf(r.error) }); return r.data; };

export class ImportService {
  private readonly now: () => Date;
  constructor(private readonly d: ImportDeps) { this.now = d.now ?? (() => new Date()); }

  private target(key: string): ImportTarget<Tx> { return this.d.targets.get(key) ?? fail(404, "NO_SUCH_TARGET", "There is nothing to import into by that name."); }
  private ctx(s: StaffContext, b: { id: string; sourceName: string; mapping: unknown }): ImportContext {
    return { firmId: s.firmId, actor: actorWord(s.staffId) as ImportContext["actor"], batchId: b.id, sourceName: b.sourceName, declared: Mapping.parse(b.mapping).declared };
  }
  private async batch(db: Tx | PrismaClient, s: StaffContext, id: string) {
    const b = UUID.test(id) ? await db.platImportBatch.findFirst({ where: { firmId: s.firmId, id: id.toLowerCase() } }) : null;
    return b ?? fail(404, "NO_SUCH_IMPORT", "No such import in your firm.");
  }
  private async file(s: StaffContext, b: { fileKey: string; fileSha256: string }): Promise<Csv> {
    const f = await this.d.files.get(s.firmId, b.fileKey);
    if (!f || f.sha256 !== b.fileSha256) fail(409, "FILE_CHANGED", "The uploaded file cannot be read back as it was: upload it again.");
    return readCsv(f!.bytes);
  }

  /** GET targets: what can be imported, each field with its words, and the wordings a person ticks. */
  targets() {
    return {
      targets: this.d.targets.list().map((t) => ({ key: t.key, label: t.label, personalData: t.personalData, keyField: t.keyField, fields: t.fields })),
      attestation: ATTESTATION, declaration: DECLARATION,
    };
  }

  /** GET attestation: the firm's latest attestation of the current wording, if any. */
  async attestation(s: StaffContext) {
    const a = await this.d.db.platImportAttestation.findFirst({ where: { firmId: s.firmId, wordingVersion: ATTESTATION.version }, orderBy: { at: "desc" } });
    return { current: a ? { id: a.id, at: a.at.toISOString(), byStaffId: a.ownerStaffId } : null, wording: ATTESTATION, canAttest: s.roles.includes("OWNER") };
  }

  /** POST attestation: an Owner attests the current wording (AG-18-49); the database also refuses anyone else. */
  async attest(s: StaffContext, raw: unknown) {
    if (!s.roles.includes("OWNER")) fail(403, "OWNER_ONLY", "Only an Owner of the firm gives this confirmation.");
    parseBody(AttestBody, raw);
    return this.d.db.$transaction(async (tx) => {
      const a = await tx.platImportAttestation.create({ data: { firmId: s.firmId, ownerStaffId: s.staffId, wordingVersion: ATTESTATION.version } });
      await this.d.audit.record(tx, { firmId: s.firmId, actor: actorWord(s.staffId) as ImportContext["actor"], action: "platform.import.attested", entity: "plat_import_attestation", entityKey: a.id, summary: "An Owner confirmed the firm may import personal data.", detail: { wordingVersion: ATTESTATION.version }, before: null, after: { wordingVersion: ATTESTATION.version } });
      return { id: a.id, at: a.at.toISOString() };
    });
  }

  /** POST /imports (a text/csv body): stores the file and makes a DRAFT batch; answers its columns, the first rows'
   *  cells (for the person mapping them) and the mapping offered (the saved one for this source, else by header). */
  async upload(s: StaffContext, q: { target?: string; source?: string; name?: string }, bytes: Uint8Array) {
    const t = this.target(String(q.target ?? ""));
    const src = SourceName.safeParse(q.source ?? "");
    if (!src.success) problem(FIELD_ERROR_STATUS, "Not imported", "Name where the file comes from.", { code: "INVALID_INPUT", fields: { source: src.error.issues[0].message } });
    let csv: Csv;
    try { csv = readCsv(bytes); } catch (e) { if (e instanceof CsvRefused) fail(e.code === "TOO_LARGE" ? 413 : FIELD_ERROR_STATUS, e.code, e.message); throw e; }
    const id = crypto.randomUUID(), key = `imports/${id}.csv`;
    const put = await this.d.files.put(s.firmId, key, bytes, "text/csv");
    const sourceName = src.data!;
    const saved = await this.d.db.platImportMapping.findFirst({ where: { firmId: s.firmId, sourceName, targetKey: t.key } });
    const savedMapping = saved ? Mapping.safeParse(saved.mapping) : null;
    const offered = savedMapping?.success && !mappingFaults(t, csv!.header, savedMapping.data).length ? { ...savedMapping.data, declared: false } : suggestMapping(t, csv!.header);
    const b = await this.d.db.$transaction(async (tx) => {
      const b = await tx.platImportBatch.create({ data: { id, firmId: s.firmId, targetKey: t.key, sourceName, fileKey: key, fileSha256: put.sha256, fileKind: "CSV", mapping: offered, importerStaffId: s.staffId } });
      await this.d.audit.record(tx, { firmId: s.firmId, actor: actorWord(s.staffId) as ImportContext["actor"], action: "platform.import.uploaded", entity: "plat_import_batch", entityKey: id, summary: `A file of ${csv!.rows.length} rows was uploaded to import into ${t.label}.`, detail: { batchId: id, target: t.key, rows: csv!.rows.length, columns: csv!.header.length }, before: null, after: { state: "DRAFT", target: t.key } });
      return b;
    });
    return { ...(await this.view(s, b.id)), mappingFrom: savedMapping?.success && offered.columns === savedMapping.data.columns ? "saved" : "headers" };
  }

  /** POST /imports/:id/dry-run: checks the mapping, then every row; writes the preview rows and the dry-run hash. */
  async dryRun(s: StaffContext, id: string, raw: unknown) {
    const body = parseBody(DryRunBody, raw);
    const b0 = await this.batch(this.d.db, s, id), t = this.target(b0.targetKey);
    if (!["DRAFT", "DRY_RUN_READY"].includes(b0.state)) fail(409, "ALREADY_RUN", "This import has run: start a new import to change it.");
    const csv = await this.file(s, b0);
    const mapping: Mapping = { columns: Object.fromEntries(csv.header.map((h) => [h, body.columns[h] ?? null])), declared: body.declared };
    const faults = mappingFaults(t, csv.header, { ...mapping, columns: { ...mapping.columns, ...Object.fromEntries(Object.keys(body.columns).filter((c) => !csv.header.includes(c)).map((c) => [c, body.columns[c]])) } });
    if (faults.length) fail(FIELD_ERROR_STATUS, "MAPPING_REFUSED", "The column mapping cannot be used: see each column named.", { faults: faults.map((f) => ({ ...f, words: mappingWords(t, f) })) });
    const consentMapped = Object.values(mapping.columns).some((k) => t.fields.find((f) => f.key === k)?.kind === "CONSENT");
    if (consentMapped && !mapping.declared) fail(FIELD_ERROR_STATUS, "DECLARATION_NEEDED", "A consent column is mapped: tick the declaration that the people agreed, or leave that column unmapped.", { declaration: DECLARATION });
    const att = t.personalData ? await this.d.db.platImportAttestation.findFirst({ where: { firmId: s.firmId, wordingVersion: ATTESTATION.version }, orderBy: { at: "desc" } }) : null;
    const plan = await this.plan(this.d.db, s.firmId, t, csv, mapping);
    const hash = await sha256(`${b0.fileSha256}\n${t.key}@${t.version}\n${canonical(mapping)}`);
    await this.d.db.$transaction(async (tx) => {
      const b = await tx.platImportBatch.findFirstOrThrow({ where: { firmId: s.firmId, id: b0.id } });
      if (!["DRAFT", "DRY_RUN_READY"].includes(b.state)) fail(409, "ALREADY_RUN", "This import has run: start a new import to change it.");
      await tx.platImportRow.deleteMany({ where: { firmId: s.firmId, batchId: b.id, phase: "DRY_RUN" } });
      await tx.platImportBatch.update({ where: { id: b.id }, data: { mapping, dryRunHash: hash, state: "DRY_RUN_READY", attestationId: att?.id ?? null } });
      await tx.platImportRow.createMany({ data: plan.map((p) => ({ firmId: s.firmId, batchId: b.id, phase: "DRY_RUN" as const, rowNumber: p.row, outcome: p.outcome, reasons: p.reasons, recordKind: p.recordId ? t.recordKind : null, recordId: p.recordId })) });
      if (body.saveMapping) await tx.platImportMapping.upsert({ where: { firmId_sourceName_targetKey: { firmId: s.firmId, sourceName: b.sourceName, targetKey: t.key } }, create: { firmId: s.firmId, sourceName: b.sourceName, targetKey: t.key, mapping: { columns: mapping.columns, declared: false }, savedBy: s.staffId }, update: { mapping: { columns: mapping.columns, declared: false }, savedBy: s.staffId, savedAt: this.now() } });
      const totals = tally(plan.map((p) => p.outcome));
      await this.d.audit.record(tx, { firmId: s.firmId, actor: actorWord(s.staffId) as ImportContext["actor"], action: "platform.import.dry_run", entity: "plat_import_batch", entityKey: b.id, summary: `Dry run: ${totals.CREATE} to create, ${totals.MERGE} to merge, ${totals.SKIP} to skip, ${totals.ERROR} with errors.`, detail: { batchId: b.id, target: t.key, ...totals }, before: { state: b.state }, after: { state: "DRY_RUN_READY" } });
    });
    return this.view(s, b0.id);
  }

  /** The outcome of each row against the firm as it is now (read only). */
  private async plan(db: Tx | PrismaClient, firmId: string, t: ImportTarget<Tx>, csv: Csv, m: Mapping) {
    const seen = new Set<string>(), out: { row: number; outcome: "CREATE" | "MERGE" | "SKIP" | "ERROR"; reasons: Reason[]; recordId: string | null }[] = [];
    for (let i = 0; i < csv.rows.length; i++) {
      const r = await this.decide(db, firmId, t, csv.header, csv.rows[i], m, seen);
      out.push({ row: i + 1, outcome: r.outcome, reasons: r.reasons, recordId: r.existing?.id ?? null });
    }
    return out;
  }

  /** One row's outcome: its check, a duplicate earlier in the file, then the firm's record by natural key. */
  private async decide(db: Tx | PrismaClient, firmId: string, t: ImportTarget<Tx>, header: string[], cells: string[], m: Mapping, seen: Set<string>) {
    if (cells.length !== header.length) return { outcome: "ERROR" as const, reasons: [{ field: "row", rule: ENGINE_RULE.cellCount }], existing: null };
    const mapped: Record<string, string> = {};
    header.forEach((h, k) => { const f = m.columns[h]; const v = cells[k].trim(); if (f && v !== "") mapped[f] = v; });
    const reasons: Reason[] = t.fields.filter((f) => f.required && !(f.key in mapped)).map((f) => ({ field: f.key, rule: ENGINE_RULE.required }));
    const c = t.check(mapped);
    if ("reasons" in c) reasons.push(...c.reasons);
    if (reasons.length) return { outcome: "ERROR" as const, reasons: reasons.slice(0, MAX_REASONS).map((r) => Reason.parse(r)), existing: null };
    const ok = c as { values: Record<string, string>; naturalKey: string | null };
    if (ok.naturalKey !== null) {
      if (seen.has(ok.naturalKey)) return { outcome: "SKIP" as const, reasons: [{ field: t.keyField, rule: ENGINE_RULE.duplicateInFile }], existing: null, values: ok.values };
      seen.add(ok.naturalKey);
      const existing = await t.find(db as Tx, firmId, ok.naturalKey);
      if (existing) {
        const fills = t.fills(existing, ok.values);
        return fills.length ? { outcome: "MERGE" as const, reasons: [], existing, values: ok.values, fills, naturalKey: ok.naturalKey } : { outcome: "SKIP" as const, reasons: [{ field: t.keyField, rule: ENGINE_RULE.nothingNew }], existing, values: ok.values };
      }
    }
    return { outcome: "CREATE" as const, reasons: [], existing: null, values: ok.values, naturalKey: ok.naturalKey };
  }

  /** POST /imports/:id/run: only for the dry run the person saw (its hash), after the attestation where needed. A run
   *  started again (a lost connection) goes on from the first row it has not written. */
  async run(s: StaffContext, id: string, raw: unknown) {
    const body = parseBody(RunBody, raw);
    const b0 = await this.batch(this.d.db, s, id), t = this.target(b0.targetKey);
    if (["COMPLETED", "PARTIAL", "FAILED", "UNDOING", "UNDONE"].includes(b0.state)) fail(409, "ALREADY_RUN", "This import has already run.");
    if (b0.state === "DRAFT" || !b0.dryRunHash) fail(409, "DRY_RUN_NEEDED", "Run the preview (the dry run) first: nothing is imported without one.");
    if (body.dryRunHash !== b0.dryRunHash) fail(409, "DRY_RUN_CHANGED", "The preview has changed since you looked at it (a new mapping or a new preview): check the new preview, then run it.");
    const csv = await this.file(s, b0), mapping = Mapping.parse(b0.mapping);
    const hash = await sha256(`${b0.fileSha256}\n${t.key}@${t.version}\n${canonical(mapping)}`);
    if (hash !== b0.dryRunHash) fail(409, "DRY_RUN_CHANGED", "The rules for this kind of record changed since the preview: run the preview again.");
    if (b0.state === "DRY_RUN_READY") {
      // The attestation the batch runs under is the one its dry run named (frozen from the run on, PF-10a's trigger).
      if (t.personalData && !b0.attestationId) fail(409, "ATTESTATION_NEEDED", "An Owner of the firm must first confirm the firm may import personal data; then run the preview again.");
      await this.d.db.$transaction(async (tx) => {
        const n = await tx.platImportBatch.updateMany({ where: { firmId: s.firmId, id: b0.id, state: "DRY_RUN_READY", dryRunHash: body.dryRunHash }, data: { state: "RUNNING" } });
        if (n.count !== 1) fail(409, "DRY_RUN_CHANGED", "The preview has changed since you looked at it: check the new preview, then run it.");
        await this.d.audit.record(tx, { firmId: s.firmId, actor: actorWord(s.staffId) as ImportContext["actor"], action: "platform.import.started", entity: "plat_import_batch", entityKey: b0.id, summary: `Import into ${t.label} started (${csv.rows.length} rows).`, detail: { batchId: b0.id, target: t.key, rows: csv.rows.length }, before: { state: "DRY_RUN_READY" }, after: { state: "RUNNING" } });
      });
    }
    const ctx = this.ctx(s, b0);
    const done = new Set((await this.d.db.platImportRow.findMany({ where: { firmId: s.firmId, batchId: b0.id, phase: "RUN" }, select: { rowNumber: true } })).map((r) => r.rowNumber));
    // The file's earlier rows decide a later duplicate, so their keys are read again in order, whatever is written.
    const seen = new Set<string>();
    for (let i = 0; i < csv.rows.length; i++) {
      const row = i + 1;
      if (done.has(row)) { this.keyOf(t, csv.header, csv.rows[i], mapping, seen); continue; }
      const seenBefore = new Set(seen);
      await this.d.db.$transaction(async (tx) => {
        const k = this.keyOf(t, csv.header, csv.rows[i], mapping, new Set());
        if (k !== null) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`import:${s.firmId}:${t.key}:${k}`}, 0))`;
        const r = await this.decide(tx, s.firmId, t, csv.header, csv.rows[i], mapping, seen);
        let recordId: string | null = r.existing?.id ?? null, before: Record<string, string | null> | null = null;
        if (r.outcome === "CREATE") recordId = (await t.create(tx, ctx, r.values!)).id;
        if (r.outcome === "MERGE") before = (await t.merge(tx, ctx, r.existing!, r.values!, r.fills!)).before;
        await tx.platImportRow.create({ data: { firmId: s.firmId, batchId: b0.id, phase: "RUN", rowNumber: row, outcome: r.outcome, reasons: r.reasons, recordKind: recordId ? t.recordKind : null, recordId, beforeImage: before ?? undefined } });
      }).catch((e: unknown) => {
        // Another run of the same batch wrote this row first (the (batch, RUN, row) key): its write stands, ours rolled back.
        if ((e as { code?: string }).code !== "P2002") throw e;
        seen.clear(); for (const k of seenBefore) seen.add(k); this.keyOf(t, csv.header, csv.rows[i], mapping, seen);
      });
    }
    const rows = await this.d.db.platImportRow.findMany({ where: { firmId: s.firmId, batchId: b0.id, phase: "RUN" }, select: { outcome: true } });
    const n = tally(rows.map((r) => r.outcome)), at = this.now();
    const state = n.ERROR === 0 ? "COMPLETED" : n.CREATE + n.MERGE > 0 ? "PARTIAL" : "FAILED";
    await this.d.db.$transaction(async (tx) => {
      const moved = await tx.platImportBatch.updateMany({ where: { firmId: s.firmId, id: b0.id, state: "RUNNING" }, data: { state, createdCount: n.CREATE, mergedCount: n.MERGE, skippedCount: n.SKIP, errorCount: n.ERROR, finishedAt: at, undoDeadline: state === "FAILED" ? null : new Date(at.getTime() + UNDO_DAYS * 86_400_000) } });
      if (moved.count === 1) await this.d.audit.record(tx, { firmId: s.firmId, actor: ctx.actor, action: "platform.import.finished", entity: "plat_import_batch", entityKey: b0.id, summary: `Import into ${t.label} finished: ${n.CREATE} created, ${n.MERGE} merged, ${n.SKIP} skipped, ${n.ERROR} with errors.`, detail: { batchId: b0.id, target: t.key, ...n }, before: { state: "RUNNING" }, after: { state } });
    });
    return this.view(s, b0.id);
  }

  private keyOf(t: ImportTarget<Tx>, header: string[], cells: string[], m: Mapping, seen: Set<string>): string | null {
    if (cells.length !== header.length) return null;
    const mapped: Record<string, string> = {};
    header.forEach((h, k) => { const f = m.columns[h]; const v = cells[k].trim(); if (f && v !== "") mapped[f] = v; });
    const c = t.check(mapped);
    const key = "naturalKey" in c ? c.naturalKey : null;
    if (key !== null) seen.add(key);
    return key;
  }

  /** GET /imports/:id: the batch, its columns, its mapping and the totals of its preview or its run. */
  async view(s: StaffContext, id: string) {
    const b = await this.batch(this.d.db, s, id), t = this.d.targets.get(b.targetKey);
    const phase = ["DRAFT", "DRY_RUN_READY"].includes(b.state) ? "DRY_RUN" : "RUN";
    const groups = await this.d.db.platImportRow.groupBy({ by: ["outcome"], where: { firmId: s.firmId, batchId: b.id, phase }, _count: { _all: true } });
    const totals = { CREATE: 0, MERGE: 0, SKIP: 0, ERROR: 0 };
    for (const g of groups) totals[g.outcome] = g._count._all;
    const f = await this.d.files.get(s.firmId, b.fileKey);
    let header: string[] = [], sample: string[][] = [], rows = 0;
    if (f) try { const c = readCsv(f.bytes); header = c.header; sample = c.rows.slice(0, 3); rows = c.rows.length; } catch { /* stored files were read once; nothing to show */ }
    return {
      id: b.id, target: b.targetKey, targetLabel: t?.label ?? b.targetKey, sourceName: b.sourceName, state: b.state, rows, header, sample,
      mapping: b.mapping, dryRunHash: b.dryRunHash, phase, totals, attestationNeeded: !!t?.personalData && !b.attestationId && phase === "DRY_RUN",
      counts: { created: b.createdCount, merged: b.mergedCount, skipped: b.skippedCount, errors: b.errorCount },
      importerStaffId: b.importerStaffId, createdAt: b.createdAt.toISOString(), finishedAt: b.finishedAt?.toISOString() ?? null, undoDeadline: b.undoDeadline?.toISOString() ?? null,
    };
  }

  /** GET /imports/:id/rows: one page of the preview's or the run's rows, each reason in words (never a cell's value). */
  async rows(s: StaffContext, id: string, q: { outcome?: string; page?: string }) {
    const b = await this.batch(this.d.db, s, id), t = this.d.targets.get(b.targetKey);
    const phase = ["DRAFT", "DRY_RUN_READY"].includes(b.state) ? "DRY_RUN" : "RUN";
    const outcome = q.outcome && ["CREATE", "MERGE", "SKIP", "ERROR"].includes(q.outcome) ? (q.outcome as "CREATE") : undefined;
    const page = Math.max(1, Math.min(10_000, Number.parseInt(q.page ?? "1", 10) || 1));
    const where = { firmId: s.firmId, batchId: b.id, phase: phase as "RUN", ...(outcome ? { outcome } : {}) };
    const [total, list] = await Promise.all([this.d.db.platImportRow.count({ where }), this.d.db.platImportRow.findMany({ where, orderBy: { rowNumber: "asc" }, skip: (page - 1) * PAGE, take: PAGE })]);
    return { phase, page, pageSize: PAGE, total, rows: list.map((r) => ({ row: r.rowNumber, outcome: r.outcome, reasons: (r.reasons as Reason[]).map((x) => ({ ...x, words: reasonWords(t, x) })), recordKind: r.recordKind, recordId: r.recordId })) };
  }

  /** GET /imports: the firm's batches, newest first (AG-18-56). */
  async list(s: StaffContext, q: { page?: string }) {
    const page = Math.max(1, Math.min(10_000, Number.parseInt(q.page ?? "1", 10) || 1));
    const where = { firmId: s.firmId };
    const [total, list] = await Promise.all([this.d.db.platImportBatch.count({ where }), this.d.db.platImportBatch.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE })]);
    return { page, pageSize: PAGE, total, imports: list.map((b) => ({ id: b.id, target: b.targetKey, targetLabel: this.d.targets.get(b.targetKey)?.label ?? b.targetKey, sourceName: b.sourceName, state: b.state, counts: { created: b.createdCount, merged: b.mergedCount, skipped: b.skippedCount, errors: b.errorCount }, importerStaffId: b.importerStaffId, createdAt: b.createdAt.toISOString(), finishedAt: b.finishedAt?.toISOString() ?? null, undoDeadline: b.undoDeadline?.toISOString() ?? null })) };
  }

  /** GET /imports/origin/:kind/:id: where an imported record came from (AG-18-42: origin Import, the batch, its source). */
  async origin(s: StaffContext, kind: string, id: string) {
    if (!UUID.test(id)) return { imported: false };
    const r = await this.d.db.platImportRow.findFirst({ where: { firmId: s.firmId, phase: "RUN", outcome: "CREATE", recordKind: kind, recordId: id.toLowerCase() }, include: { batch: true } });
    return r ? { imported: true, origin: "IMPORT", batchId: r.batchId, sourceName: r.batch.sourceName, at: r.writtenAt.toISOString() } : { imported: false };
  }
}

const tally = (o: string[]) => ({ CREATE: o.filter((x) => x === "CREATE").length, MERGE: o.filter((x) => x === "MERGE").length, SKIP: o.filter((x) => x === "SKIP").length, ERROR: o.filter((x) => x === "ERROR").length });
const MAPPING_WORDS: Record<string, string> = { unknown_column: "is not a column of this file", unknown_field: "is mapped to a field that does not exist", field_mapped_twice: "is mapped to a field another column already uses (one column per field)", required_field_not_mapped: "is required: map a column to it", nothing_mapped: "Map at least one column." };
function mappingWords(t: ImportTarget<unknown>, f: { column?: string; field?: string; rule: string }): string {
  if (f.rule === "nothing_mapped") return MAPPING_WORDS.nothing_mapped;
  if (f.rule === "required_field_not_mapped") return `${t.fields.find((x) => x.key === f.field)?.label ?? f.field} ${MAPPING_WORDS[f.rule]}`;
  return `Column "${(f.column ?? "").slice(0, 80)}" ${MAPPING_WORDS[f.rule] ?? f.rule}`;
}
