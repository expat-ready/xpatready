// FO-1p (Lead B's brief lead-b-briefs/FO-1p.md; P-607: every case client gets a front-office party, so a person has one
// portal login; case-side contract v0.1 §1 rule 4: the case side never writes front-office tables). The case side
// (CS-K1 part 2) asks the front office for a case client's party through this port: a PERSON client gets an fo_person,
// a COMPANY client an fo_company (Lead B ruling 2; a company's people are FO-2b's contacts, never made here). Both calls
// run in the caller's transaction (the case opening's), so a refused opening leaves no party. No automatic link to an
// existing person or company (BR-2: a possible match is shown, never linked; FO-9a owns the warning and the merge); the
// one exception is a won prospect's own party, named by `prospectId` (FO-8): that is the same party, not a guess.
// Idempotency is the caller's: it calls only while its client names no party, in the transaction that records the id.
// The adapter is api/src/front-office/people/fo-person-port.ts; this file imports only zod and its own folder (§1 rule 3).
import { z } from "zod";
import { AuditActor, FirmId, type AuditPort } from "./audit.ts";
import { normaliseEmail } from "./matching.ts";

/** The injection token the API binds the adapter to (api/src/features/front-office-sales.ts). */
export const FO_PERSON_PORT = Symbol.for("front-office.FoPersonPort");

/** The audit actions, one per party made (ids only in the line: no name, email or phone). */
export const FO_PERSON_ACTION = { PERSON: "front_office.person.created_for_client", COMPANY: "front_office.company.created_for_client" } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A letter or digit, as the database's fo_sales_has_word reads it (the Hangul fillers it drops are not letters there). */
export const hasWord = (s: string) => /[\p{L}\p{N}]/u.test(s.replace(/[ᅟᅠㅤﾠ]/g, ""));
const tidy = (v: string) => v.normalize("NFC").trim();
/** Optional text: absent, null or blank is null; otherwise trimmed (NFC) and at most `max` characters (no limit without one). */
const optional = (max?: number) => z.string().nullish().transform((v) => (v == null || !tidy(v) ? null : tidy(v))).refine((v) => v === null || max === undefined || [...v].length <= max, `at most ${max} characters`);
const required = (max: number) => z.string().transform(tidy).refine((v) => v.length > 0, "this is required").refine((v) => [...v].length <= max, `at most ${max} characters`);

export const EnsureForClientInput = z.strictObject({
  firmId: FirmId,
  /** A typed audit actor (ports/audit.ts AuditActor: staff:<id>, system:<door> or seed:<row>); it becomes created_by. */
  actor: AuditActor,
  /** The case client's name. Kept as given_names when neither name part is given (fo_person has no display-name column). */
  displayName: required(200),
  givenNames: optional(200),
  familyName: optional(200),
  /** Stored lower case, as FO-2 does; text that is not an email address is refused (FoPersonInvalidInput). */
  email: optional(254).refine((v) => v === null || normaliseEmail(v) !== null, "not an email address").transform((v) => (v === null ? null : normaliseEmail(v))),
  /** Never refused: E.164 when readable, otherwise kept as typed with phone_readable false (FO-9a, AG-2-84 rule 5). */
  phone: optional(),
  prospectId: z.string().nullish().transform((v) => v ?? null),
});
export type EnsureForClientInput = z.input<typeof EnsureForClientInput>;

export const EnsureCompanyForClientInput = z.strictObject({
  firmId: FirmId,
  actor: AuditActor,
  /** The company's operating name (FO-2b's 200 characters; it holds a letter or digit, as fo_company's check needs). */
  name: required(200).refine(hasWord, "a letter or digit"),
  prospectId: z.string().nullish().transform((v) => v ?? null),
});
export type EnsureCompanyForClientInput = z.input<typeof EnsureCompanyForClientInput>;

/** The port. `Tx` is the caller's transaction (a Prisma transaction client in the API); the port never opens its own. */
export interface FoPersonPort<Tx = unknown> {
  /** A person client: the prospect's subject person when `prospectId` is given (no new row, nothing else read from the
   *  input), else a new fo_person with one audit line. In the caller's tx. */
  ensureForClient(tx: Tx, a: EnsureForClientInput): Promise<{ foPersonId: string }>;
  /** A company client: the prospect's company when `prospectId` is given, else a new fo_company with one audit line.
   *  In the caller's tx. */
  ensureCompanyForClient(tx: Tx, a: EnsureCompanyForClientInput): Promise<{ foCompanyId: string }>;
}

/** `prospectId` names no prospect of this firm (another firm's, or none): the case side answers 404 "No such client.". */
export class FoPersonNotFound extends Error {
  readonly status = 404;
  constructor(message = "No such prospect in this firm.") { super(message); this.name = "FoPersonNotFound"; }
}
/** `prospectId` is a prospect of the other kind (a Corporate prospect to ensureForClient, an Individual one to
 *  ensureCompanyForClient). */
export class FoPersonKindMismatch extends Error {
  readonly status = 409;
  constructor(message: string) { super(message); this.name = "FoPersonKindMismatch"; }
}
/** The input breaks the shape above (an untyped actor, no name, an email that is no address): a caller's bug. */
export class FoPersonInvalidInput extends Error {
  readonly status = 400;
  constructor(readonly fields: Record<string, string>) { super(`FoPersonPort: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("; ")}`); this.name = "FoPersonInvalidInput"; }
}

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new FoPersonInvalidInput(Object.fromEntries(r.error.issues.map((i) => [i.path.join(".") || "input", i.message])));
  return r.data;
}
export const parsePersonInput = (raw: unknown) => parse(EnsureForClientInput, raw);
export const parseCompanyInput = (raw: unknown) => parse(EnsureCompanyForClientInput, raw);
/** A prospect id that is no uuid is "not found", never a shape error (it tells nothing about other firms' ids). */
export const prospectIdOrMiss = (id: string): string => (UUID.test(id) ? id.toLowerCase() : (() => { throw new FoPersonNotFound(); })());

/** The person row's name parts: the given parts, or the display name as given_names when neither is given. */
export const nameParts = (a: z.output<typeof EnsureForClientInput>) =>
  a.givenNames === null && a.familyName === null ? { givenNames: a.displayName, familyName: null } : { givenNames: a.givenNames, familyName: a.familyName };

/** The phone as stored: `e164` (the adapter passes FO-9a's libphonenumber normaliser) gives the readable form, else the
 *  number is kept as typed and flagged unreadable. */
export function keepPhone(typed: string, e164: (v: string) => string | null): { phone: string; readable: boolean } {
  const n = e164(typed);
  return n ? { phone: n, readable: true } : { phone: typed, readable: false };
}
/** The fake's normaliser (Sample, FO-2's common.ts rule): "+" and 7-15 digits, or a 10-digit North American number. */
export function sampleE164(v: string): string | null {
  const d = v.replace(/[\s().-]/g, "");
  return /^\+[1-9][0-9]{6,14}$/.test(d) ? d : /^1?[2-9][0-9]{9}$/.test(d) ? `+1${d.slice(-10)}` : null;
}

// ------------------------------------------------------------------------------------------------------------ fake
type FakePerson = { id: string; firmId: string; givenNames: string | null; familyName: string | null; email: string | null; phone: string | null; phoneReadable: boolean; createdBy: string };
type FakeCompany = { id: string; firmId: string; operatingName: string; createdBy: string };
type FakeProspect = { id: string; firmId: string; type: "INDIVIDUAL" | "CORPORATE"; subjectId: string };
export type FakeFoPerson = FoPersonPort<unknown> & {
  /** Committed rows a test starts from: a firm's sales setup row, a person, a company, a prospect of either type. */
  addSetup(firmId: string): void;
  seedPerson(firmId: string, fields: Partial<Omit<FakePerson, "id" | "firmId">>): string;
  seedProspect(firmId: string, type: FakeProspect["type"]): { prospectId: string; subjectId: string };
  person(id: string): FakePerson | null;
  company(id: string): FakeCompany | null;
  counts(firmId: string): { persons: number; companies: number; setups: number };
  /** Reverts everything done under `tx` (a test standing in for a rolled-back transaction). */
  discard(tx: unknown): void;
  /** Runs `fn` in a fresh transaction; a throw reverts it. */
  transaction<T>(fn: (tx: object) => Promise<T>): Promise<T>;
};

/** An in-memory FoPersonPort with the adapter's rules, writing its audit lines through `audit` (fakeAudit for tests). */
export function fakeFoPerson(opts: { audit: AuditPort<unknown> & { discard?(tx: unknown): void }; e164?: (v: string) => string | null }): FakeFoPerson {
  const persons = new Map<string, FakePerson>(), companies = new Map<string, FakeCompany>(), prospects = new Map<string, FakeProspect>(), setups = new Set<string>();
  const undo: { tx: unknown; revert: () => void }[] = [];
  const e164 = opts.e164 ?? sampleE164;
  const id = () => globalThis.crypto.randomUUID();
  const setup = (tx: unknown, firmId: string) => { if (!setups.has(firmId)) { setups.add(firmId); undo.push({ tx, revert: () => setups.delete(firmId) }); } };
  const party = (firmId: string, prospectId: string, want: FakeProspect["type"]) => {
    const p = prospects.get(prospectIdOrMiss(prospectId));
    if (!p || p.firmId !== firmId) throw new FoPersonNotFound();
    if (p.type !== want) throw new FoPersonKindMismatch(want === "INDIVIDUAL" ? "This prospect is a company: ask for its company." : "This prospect is a person: ask for its person.");
    return p.subjectId;
  };
  const fake: FakeFoPerson = {
    async ensureForClient(tx, raw) {
      const a = parsePersonInput(raw), firmId = a.firmId.toLowerCase();
      if (a.prospectId !== null) return { foPersonId: party(firmId, a.prospectId, "INDIVIDUAL") };
      setup(tx, firmId);
      const ph = a.phone === null ? null : keepPhone(a.phone, e164);
      const p: FakePerson = { id: id(), firmId, ...nameParts(a), email: a.email, phone: ph?.phone ?? null, phoneReadable: ph?.readable ?? true, createdBy: a.actor };
      persons.set(p.id, p); undo.push({ tx, revert: () => persons.delete(p.id) });
      await opts.audit.record(tx, { firmId, actor: a.actor, action: FO_PERSON_ACTION.PERSON, entity: "fo_person", entityKey: p.id, summary: "A front-office person was made for a new case client.", detail: { foPersonId: p.id } });
      return { foPersonId: p.id };
    },
    async ensureCompanyForClient(tx, raw) {
      const a = parseCompanyInput(raw), firmId = a.firmId.toLowerCase();
      if (a.prospectId !== null) return { foCompanyId: party(firmId, a.prospectId, "CORPORATE") };
      setup(tx, firmId);
      const c: FakeCompany = { id: id(), firmId, operatingName: a.name, createdBy: a.actor };
      companies.set(c.id, c); undo.push({ tx, revert: () => companies.delete(c.id) });
      await opts.audit.record(tx, { firmId, actor: a.actor, action: FO_PERSON_ACTION.COMPANY, entity: "fo_company", entityKey: c.id, summary: "A front-office company was made for a new case client.", detail: { foCompanyId: c.id } });
      return { foCompanyId: c.id };
    },
    addSetup(firmId) { setups.add(firmId.toLowerCase()); },
    seedPerson(firmId, f) { const p: FakePerson = { id: id(), firmId: firmId.toLowerCase(), givenNames: null, familyName: null, email: null, phone: null, phoneReadable: true, createdBy: "seed:test", ...f }; persons.set(p.id, p); return p.id; },
    seedProspect(firmId, type) {
      const f = firmId.toLowerCase(), subjectId = id();
      if (type === "INDIVIDUAL") persons.set(subjectId, { id: subjectId, firmId: f, givenNames: "Client", familyName: "A", email: null, phone: null, phoneReadable: true, createdBy: "seed:test" });
      else companies.set(subjectId, { id: subjectId, firmId: f, operatingName: "Sample Co", createdBy: "seed:test" });
      const prospectId = id(); prospects.set(prospectId, { id: prospectId, firmId: f, type, subjectId });
      return { prospectId, subjectId };
    },
    person(i) { const p = persons.get(i); return p ? { ...p } : null; },
    company(i) { const c = companies.get(i); return c ? { ...c } : null; },
    counts(firmId) { const f = firmId.toLowerCase(); return { persons: [...persons.values()].filter((p) => p.firmId === f).length, companies: [...companies.values()].filter((c) => c.firmId === f).length, setups: setups.has(f) ? 1 : 0 }; },
    discard(tx) { for (let i = undo.length - 1; i >= 0; i--) if (undo[i].tx === tx) { undo[i].revert(); undo.splice(i, 1); } opts.audit.discard?.(tx); },
    async transaction(fn) { const tx = {}; try { return await fn(tx); } catch (err) { fake.discard(tx); throw err; } },
  };
  return fake;
}
