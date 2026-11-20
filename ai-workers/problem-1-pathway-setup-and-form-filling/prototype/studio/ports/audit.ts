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

/** R1.8 (QA-594; SA-11-2 "before/after snapshot (JSONB) where applicable"; AG-13-43 and P-687: the firm's Activity log
 *  shows them in full, personal data included): a row's values before or after the change, field by field. Unlike
 *  `detail`, a value may be personal (a name, a phone number, an address) and as long as 4000 characters; flat values only.
 *  Secrets never: a field named like a password, a secret, a token, a hash, a salt or a one-time code is refused (AG-13
 *  §12 "secrets sanitised in audit payloads"). Personal data in an insert-only table that cannot be erased: Unconfirmed: no
 *  counsel. */
export const SECRET_FIELD = /pass(word|code)|pwd|secret|token|hash|salt|otp|signing_?key|private_?key|api_?key|credential|bearer|jwt|cookie|session_?id|(invite|invitation|magic|reset|sign_?in|login|unsubscribe)_?(link|url)/i;
const ValueScalar = z.union([z.string().max(4000), z.number(), z.boolean(), z.null()]);
export const AuditValues = z
  .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, "a field name"), z.union([ValueScalar, z.array(ValueScalar).max(100)]))
  .refine((v) => !Object.keys(v).some((k) => SECRET_FIELD.test(k)), "before and after never hold a secret (a password, token, hash or one-time code)")
  .refine((v) => Object.keys(v).length <= 60, "at most 60 fields");
export type AuditValues = z.input<typeof AuditValues>;

/** The one shape a line's before and after take in detail, the shape AUD-4's reader (firm-read/render.ts changesOf)
 *  already reads: `<field>_before` and `<field>_after`; a lone `_after` is an addition (a create), a lone `_before` a
 *  removal (a delete). A field whose value did not change is left out of a change, so the log shows what changed. */
export function flattenValues(before: AuditValues | null | undefined, after: AuditValues | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}, b = before ?? {}, a = after ?? {};
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (before && after && k in b && k in a && same(b[k], a[k])) continue;
    if (before && k in b) out[`${k}_before`] = b[k];
    if (after && k in a) out[`${k}_after`] = a[k];
  }
  return out;
}

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
  /** R1.8 (QA-594): the row's values before the change (null: a create, nothing before) and after it (null: a delete).
   *  Every create, change and delete passes both (tests/check_aud_values.ts sweeps every caller for them). */
  before: AuditValues.nullable().optional(),
  after: AuditValues.nullable().optional(),
}).refine((e) => !Object.keys(e.detail ?? {}).some((k) => /_(before|after)$/.test(k)), "a field's before and after go in before and after, never in detail");
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
 *  firm (R1.8, QA-595): the named case's own firm, else the request's or job's (null outside every one: a configuration
 *  line). Detail stays the case side's own JSON, as before (its ids-only floor is a later row's). */
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
  /** R1.8 (QA-595): the firm the caller says the line is about. The adapter takes the case's own firm when the line names
   *  a case, else the request's or job's; a line naming a firm that is not that firm is refused (a line never lands on
   *  another firm's trail, the case side too). */
  firmId: FirmId.optional(),
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
