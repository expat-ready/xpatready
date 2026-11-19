// PF-0p (rows rev 16, P-576, P-600): the audit port. One trail (contracts §7 §0, Lead 37's ruling): every changing
// transaction calls AuditPort.record(tx, entry) inside the caller's own transaction, so a failed audit line rolls the
// change back (fail-closed). The interim adapter writes audit_event's existing columns (api/src/platform/audit/
// audit-event.ts); AUD-1 swaps the adapter (firm_id column, insert-only trigger, hash chain) and this port stays.
// This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3).
import { z } from "zod";

/** A firm id: the same lenient uuid form firmScope accepts (api/src/platform/firm-scope.ts). */
export const FirmId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a firm id (uuid)");

/** Who did it: `staff:<staff id>` (a signed-in staff member, PF-4's actor word), `system:<door>` (a job, a webhook, a
 *  public door) or `seed:<row>` (a seed or a demo loader). */
export const AuditActor = z.string().regex(/^(staff|system|seed):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/, "staff:<id>, system:<door> or seed:<row>");

const EMAILISH = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const DetailScalar = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
/** Ids and facts only, never personal data (no names, emails, phone numbers, licence numbers, addresses): flat values, a
 *  string at most 200 characters, and nothing shaped like an email address (the mechanical floor; ids-only is the
 *  caller's duty). */
export const AuditDetail = z
  .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, "a field name"), z.union([DetailScalar, z.array(DetailScalar).max(50)]))
  .refine((d) => !Object.values(d).flat().some((v) => typeof v === "string" && EMAILISH.test(v)), "detail holds ids only: no email address");

/** An entity of the platform and front-office areas: its area's table prefix (`platform_`, `plat_`, `fo_`, `money_`,
 *  `msg_`; rows rev 15.2). Never a case or configuration entity: those stay on the case side's own audit writer until
 *  AUD-1, and a firm's case feed never reads a line of an area entity as its own (tests/check_case_feed.ts sweeps every
 *  `audit….record(tx, {...})` caller for this). */
export const AREA_ENTITY = /^(platform|plat|fo|money|msg)_[a-z][a-z0-9_]*$/;

export const AuditEntry = z.strictObject({
  firmId: FirmId,
  actor: AuditActor,
  /** What happened, a dotted verb (`staff.role.granted`, `retainer.sent`). */
  action: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, "a dotted lower-case action").max(120),
  /** The table or thing changed (`platform_staff`, `fo_retainer`). */
  entity: z.string().regex(AREA_ENTITY, "an area entity: platform_, plat_, fo_, money_ or msg_ and a lower-case table name").max(120),
  /** The changed row's id or key. */
  entityKey: z.string().min(1).max(200),
  /** One plain sentence a person reads in the trail (at most 600 characters). */
  summary: z.string().trim().min(1).max(600),
  detail: AuditDetail.default({}),
  /** AUD-1b (case-side contract §2.5): the case the line is about, when there is one (a uuid); kept on the line. */
  caseId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a case id (uuid)").optional(),
});
export type AuditEntry = z.input<typeof AuditEntry>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** AUD-1m: who did a case-side or configuration thing: AuditPort's typed words plus `person:<party id>` (a person on
 *  their own link), or a listed simulated person (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients; core.ts ACTORS and
 *  RUNTIME_ACTORS). The words AUD-1a's insert trigger maps (aud_event_actor_type), less its two bare legacy words
 *  (`system`, `rules`), which core.ts's Audit.log maps to `system:studio` and `system:rules`. Never a bare word. */
export const CaseActor = z.string().regex(/^(?:(?:staff|person|system|seed):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}|user-[ABCORTSPQ])$/, "staff:<id>, person:<id>, system:<door>, seed:<row> or a simulated person's id");

/** AUD-1m: a line of the case side or the configuration (core.ts's Audit.log). It names its workspace (the demo reset
 *  deletes the demo workspace's lines, P-571 (1)) and never an area entity, so a case line is never read as a platform
 *  line, and the reverse (AuditEntry refuses every entity outside the areas; tests/check_case_feed.ts sweeps both). The
 *  firm is not the caller's: the adapter takes the request's or job's (null outside both, until CS-W1). Detail stays the
 *  case side's own JSON, as before (its ids-only floor is a later row's). */
export const CaseEntry = z.strictObject({
  workspaceId: z.string().regex(UUID, "a workspace id (uuid)"),
  actor: CaseActor,
  /** What happened, the case side's own word (`answered`, `re-compared`). */
  action: z.string().trim().min(1).max(120),
  /** The case-side or configuration entity (`case`, `form copy`, `library field`), never an area entity. */
  entity: z.string().trim().min(1).max(120).refine((e) => !AREA_ENTITY.test(e), "a case or configuration entity, never an area entity (platform_, plat_, fo_, money_, msg_)"),
  entityKey: z.string().max(2000).nullable(),
  summary: z.string().max(600),
  detail: z.unknown().optional(),
  /** The configuration row an edit belongs to. */
  combinationId: z.string().regex(UUID, "a combination id (uuid)").nullable().optional(),
  /** The case the line is about, when its entity or key names one (a uuid). */
  caseId: z.string().regex(UUID, "a case id (uuid)").optional(),
});
export type CaseEntry = z.input<typeof CaseEntry>;
/** A case line names its workspace; a platform or front-office line never does (AuditEntry is strict). */
export const isCaseEntry = (e: AuditEntry | CaseEntry): e is CaseEntry => !!e && typeof e === "object" && "workspaceId" in e;

/** The port. `Tx` is the caller's transaction (a Prisma transaction client in the API); the port never opens its own. */
export interface AuditPort<Tx = unknown> {
  /** Records one line inside `tx`. Throws on a refused entry or a failed write, so the caller's transaction rolls back.
   *  A CaseEntry (AUD-1m: it names a workspace) is a case-side or configuration line; any other entry is an AuditEntry. */
  record(tx: Tx, entry: AuditEntry | CaseEntry): Promise<void>;
}

/** The forced failure of the fake (a test's `failOn` matched). */
export class AuditFailure extends Error {
  constructor(readonly entry: AuditEntry) { super(`forced audit failure: ${entry.action} ${entry.entity}/${entry.entityKey}`); this.name = "AuditFailure"; }
}

export type FakeAudit = AuditPort<unknown> & {
  /** The lines recorded, in order (a line whose transaction the test discarded is gone). */
  readonly entries: ReadonlyArray<z.output<typeof AuditEntry>>;
  /** AUD-1m: the case-side lines recorded, in order (kept apart: a case line is never read as a platform line). */
  readonly caseEntries: ReadonlyArray<z.output<typeof CaseEntry>>;
  /** How many records were refused by `failOn`. */
  readonly failures: number;
  /** Drops the lines recorded under `tx` (a test standing in for a rolled-back transaction). */
  discard(tx: unknown): void;
  /** Runs `fn` with a fresh in-memory transaction token: its lines stay only if `fn` resolves. */
  transaction<T>(fn: (tx: object) => Promise<T>): Promise<T>;
};

/** The fake: validates like the real adapter, records in memory, and throws AuditFailure when `failOn` matches, so each
 *  row can prove "a forced audit failure rolls the change back" (call it inside the row's real transaction and check the
 *  database). `entries` does not follow a real transaction's rollback: lines recorded earlier in a Prisma transaction
 *  that then rolls back stay listed unless the test calls `discard(tx)` with that transaction (it is the `tx` the row's
 *  code passed; `failOn` receives it too). */
export function fakeAudit(opts: { failOn?: (e: z.output<typeof AuditEntry>, tx: unknown) => boolean } = {}): FakeAudit {
  const rows: { tx: unknown; entry: z.output<typeof AuditEntry> }[] = [], caseRows: { tx: unknown; entry: z.output<typeof CaseEntry> }[] = [];
  let failures = 0;
  const fake: FakeAudit = {
    async record(tx, entry) {
      if (isCaseEntry(entry)) { caseRows.push({ tx, entry: CaseEntry.parse(entry) }); return; }
      const e = AuditEntry.parse(entry);
      if (opts.failOn?.(e, tx)) { failures++; throw new AuditFailure(entry); }
      rows.push({ tx, entry: e });
    },
    get entries() { return rows.map((r) => r.entry); },
    get caseEntries() { return caseRows.map((r) => r.entry); },
    get failures() { return failures; },
    discard(tx) { for (const list of [rows, caseRows] as { tx: unknown }[][]) for (let i = list.length - 1; i >= 0; i--) if (list[i].tx === tx) list.splice(i, 1); },
    async transaction(fn) {
      const tx = {};
      try { return await fn(tx); } catch (err) { fake.discard(tx); throw err; }
    },
  };
  return fake;
}
