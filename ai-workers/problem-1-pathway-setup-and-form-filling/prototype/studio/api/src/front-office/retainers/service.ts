// FO-5 part 2 (BACKLOG row FO-5; contracts §2.3, §2.6, §7 binding; concept fo-5s-retainer-signing r2 BR-1..BR-11; AG-5-3,
// -9, -16, -28, -34, -39, -49, -50, -64, -65): retainer and consultation agreements on the tables of part 1
// (front-office-retainers.prisma, migration 20261114210000_fo5_retainer_tables, whose triggers hold the same rules again).
// Every change runs in one transaction: the rows, one audit line through AuditPort (fail-closed: a failed line rolls the
// change back), then the outbox row last (contracts §0.5). Files are written to the FilesPort first, under keys named by
// the row (write-once, so a retry writes the same bytes and a lost transaction leaves only an unreferenced file).
// Reads and writes are firm-scoped: another firm's id is 404 (contracts §0.2). With "everyone sees all" off (PF-3's
// platform.everyone_sees_all), a person sees a prospect's retainers when they own the prospect, and the retainer's
// representative always sees it and the prospect's header (BR-3). PF-6b (ruling 4, SA-6-24): "sees all" also needs the
// person's own agent/prospect:view.all key (a role without it is own-only), read from their live grants. Money is in
// cents, CAD.
import { HttpException, Injectable } from "@nestjs/common";
import { Prisma, type FoRetainerFeeWhen, type PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AuditPort } from "../../../../ports/audit.ts";
import { EVENT, RetainerEventPayload, type EventName } from "../../../../ports/events.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { holdsKey } from "../../platform/identity/catalogue.ts";
import { DUTY_KEYS, problem, type StaffContext } from "../../platform/identity/keys.ts";
import { parseInput, strict } from "../../platform/http/input.ts";
import { z } from "zod";
import { EVERYONE_SEES_ALL, readSetting } from "../../platform/settings.ts";
import { winProspect } from "../sales/prospects.ts";
import { endRetainerSigning, prepareRetainerSigning } from "../signing/service.ts";
import { assertDisclosurePrinted, clearance, disclosureFor, lockParty, partyOf } from "../compliance/conflict/gate.ts";
import { DOCX, DocxRender, STARTER_KEY, UnreadableDocx, buildStarter, placeholdersOf, renderDocx, starterFrame } from "./docx.ts";
import { PLACEHOLDERS, WHEN_WORDS, cad, checkPlaceholders } from "./placeholders.ts";
import { CODE_MARKED, checklistFor, draftChecklist, lettersOf, markedLetters } from "./code-checklist.ts";

type Tx = Prisma.TransactionClient;
const STUDIO = resolve(import.meta.dirname, "..", "..", "..", "..");
export const STARTER_TEXT = join(STUDIO, "samples", "fo5-starter-retainer.txt");
/** Sample limits (no source number: AG-5-47 asks for payload limits without one; Lead B to confirm). */
export const TEMPLATE_MAX_BYTES = 5 * 1024 * 1024;
export const OFFLINE_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const FEE_MAX_MINOR = 10_000_000_000n;
const WHENS = ["ON_SIGNING", "ON_DATE", "WHEN_SUBMITTED", "WHEN_DECIDED", "WHEN_DONE"] as const;
const EDITABLE = ["DRAFT", "SENT", "VIEWED", "DECLINED", "EXPIRED"];
const WITHDRAWABLE = ["SENT", "VIEWED", "CLIENT_SIGNED"];
const OFFLINE_FROM = ["DRAFT", "SENT", "VIEWED", "CLIENT_SIGNED"];
export const NO_LICENSED = "No active licensed consultant — add one";

/** A refusal with its field errors (422), a state refusal (409) or not found (404). */
const unprocessable = (detail: string, fields: Record<string, string> = {}, extra: Record<string, unknown> = {}): never => problem(422, "Check the details", detail, { code: "INVALID", fields, ...extra });
const conflict = (detail: string, code = "STATE"): never => problem(409, "Not possible now", detail, { code });
const notFound = (what = "retainer"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });

export type FeeIn = { label: string; amountMinor: bigint | null; when: FoRetainerFeeWhen; dueOn: string | null };
export type Upload = { bytes: Uint8Array; size: number; contentType?: string };
type Clock = { now(): number };

const str = (v: unknown, max: number, what: string, field: string, required = true, multiline = false): string | null => {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) { if (required) unprocessable(`${what} is required.`, { [field]: `${what} is required.` }); return null; }
  if (typeof v !== "string") return unprocessable(`${what} must be text.`, { [field]: `${what} must be text.` });
  const t = v.trim();
  if (t.length > max) unprocessable(`${what} is at most ${max} characters.`, { [field]: `At most ${max} characters.` });
  if (!/[^\s\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]/.test(t)) unprocessable(`${what} is required.`, { [field]: `${what} is required.` });
  // The database's own text rule (fo_retainer_text_ok; break B-16): one line unless a reason; no other control character.
  if (multiline ? /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(t) : /[\u0001-\u001f\u007f\u2028\u2029]/.test(t)) unprocessable(`${what} has a tab, line break or control character.`, { [field]: multiline ? "Remove control characters." : "One line, no tabs." });
  return t;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An attempt suffix for a stored file's key (migration 20261115010000: a lost attempt never blocks the next; M1, B-1). */
const attempt = () => randomBytes(6).toString("hex");
/** Text that looks blank, hides itself or turns the line around (B-13, B-14 of part 1): refused in names. */
const HIDDEN = /[\u00ad\u034f\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u3164\ufe00-\ufe0f\ufeff]/;
/** PF-28 part 5 (R1.10, retainers): each door's own fields through the one input rule, so an unknown field or a body that
 *  is not an object is 422 named before anything is looked up. The values keep their own rules and words (str, feesOf,
 *  expectedVersionOf, expectedStatusOf, uuidOf); those that need no record run before the look-up too.
 *  PF-28 A3: a field whose own rule needs no record is also read here, by that rule and in its words (`rule`), so a value
 *  of the wrong type is named on its field even when another field is missing or the record is not found; a value the
 *  rule takes passes on unchanged, and the service reads it exactly as before. */
const STATUSES = ["DRAFT", "SENT", "VIEWED", "CLIENT_SIGNED", "SIGNED", "SIGNED_OFFLINE", "DECLINED", "WITHDRAWN", "EXPIRED"];
const any = z.unknown().optional();
const rule = (takes: (v: unknown) => boolean, words: string) => z.unknown().refine((v) => v === undefined || takes(v), { error: words }).optional();
const DIGITS = /^[1-9]\d{0,8}$/;   // a version sent as text (multipart): plain digits (FO-5f break m-4)
const KIND = rule((v) => v === null || v === "RETAINER" || v === "CONSULTATION", "RETAINER or CONSULTATION.");
const ID_OR_NONE = rule((v) => v === null || v === "" || (typeof v === "string" && UUID.test(v)), "Not an id.");
const FEES = rule((v) => Array.isArray(v) && v.length <= 50, "At most 50 rows.");
const VERSION = rule((v) => Number.isInteger(v) && (v as number) >= 1, "Send the version shown on your page.");   // JSON: a whole number
const VERSION_TEXT = rule((v) => (Number.isInteger(v) && (v as number) >= 1) || (typeof v === "string" && DIGITS.test(v)), "Send the version shown on your page.");   // multipart: its digits
const STATUS = rule((v) => typeof v === "string" && STATUSES.includes(v), "Send the status shown on your page.");
/** PF-28 (R1.10): the new-version form's own field (multipart text, or a number from a direct call); its rule is expectedVersionOf's ("" is none). */
export const TemplateVersionBody = strict({ expectedVersion: rule((v) => v === "" || (Number.isInteger(v) && (v as number) >= 1) || (typeof v === "string" && DIGITS.test(v)), "Send the version shown on your page.") });
export const TemplateBody = strict({ name: any, kind: KIND });
export const TemplateChangeBody = strict({ active: any, name: any });
export const DraftBody = strict({ kind: KIND, templateId: ID_OR_NONE, representativeStaffId: ID_OR_NONE, signerPersonId: ID_OR_NONE, fees: FEES });
export const EditBody = strict({ templateId: ID_OR_NONE, signerPersonId: ID_OR_NONE, representativeStaffId: ID_OR_NONE, fees: FEES, expectedVersion: VERSION, expectedStatus: STATUS });
export const SendBody = strict({ expectedVersion: VERSION });
export const WithdrawBody = strict({ reason: any, expectedVersion: VERSION, expectedStatus: STATUS });
/** signedVersion's top (the current version) needs the record: signedVersionOf keeps it; here only its form. */
export const OfflineBody = strict({ reason: any, expectedVersion: VERSION_TEXT, signedVersion: rule((v) => v === null || v === "" || (Number.isInteger(v) && (v as number) >= 1) || (typeof v === "string" && DIGITS.test(v)), "A version number from 1 to the current one.") });
export const FileLinkBody = strict({ file: z.enum(["signed-offline"]).optional(), version: z.union([z.number().int(), z.string().max(12)], { error: "A version number." }).optional() });   // review m1: plain words
/** A path id: a uuid, else the one not-found before the body is read (PF-28 part 5). */
const idOf = (id: unknown, what = "retainer"): string => (typeof id === "string" && UUID.test(id) ? id : notFound(what));
const uuidOf = (v: unknown, field: string): string | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !UUID.test(v)) return unprocessable(`${field} is not an id.`, { [field]: "Not an id." });
  return v.toLowerCase();
};

/** The version a page shows, which a change names (the stale-save rule; Devin 4575579111, break B-24). A JSON route takes
 *  a whole number; a multipart one (Signed offline) its digits as text. Missing or malformed → 422 at the field. */
function expectedVersionOf(body: Record<string, unknown>, multipart = false): number {
  const v = body.expectedVersion;
  const n = typeof v === "number" ? v : multipart && typeof v === "string" && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : NaN;   // plain digits (FO-5f break m-4)
  if (!Number.isInteger(n) || n < 1) return unprocessable("Send the version you are acting on (expectedVersion).", { expectedVersion: "Send the version shown on your page." });
  return n;
}
const stale = (current: number, expected: number): never =>
  conflict(expected < current ? `This agreement has a newer version (${current}) than the one you saw (${expected}). Open it again.`
    : `This agreement is at version ${current}, not version ${expected}. Open it again.`, "CHANGED");   // FO-5f break m-3
/** FO-5f item 2 (B-25): the status the page showed. Send does not raise the version, so the version alone does not name the
 *  state a person acted on: Edit and Withdraw send both, and a mismatch is 409 CHANGED. Missing or unknown → 422. */
function expectedStatusOf(body: Record<string, unknown>): string {
  const v = body.expectedStatus;
  if (typeof v !== "string" || !STATUSES.includes(v)) return unprocessable("Send the status you are acting on (expectedStatus).", { expectedStatus: "Send the status shown on your page." });
  return v;
}
const WORDS: Record<string, string> = { DRAFT: "a draft", SENT: "sent", VIEWED: "viewed", CLIENT_SIGNED: "signed by the client", SIGNED: "signed", SIGNED_OFFLINE: "signed on paper", DECLINED: "declined", WITHDRAWN: "withdrawn", EXPIRED: "expired" };
const restated = (current: string, expected: string): never =>
  conflict(`This agreement is now ${WORDS[current]} (your page showed ${WORDS[expected]}). Open it again.`, "CHANGED");
/** FO-5f item 3: the version the paper was signed on (Signed offline, multipart text). Default: the current one. */
function signedVersionOf(body: Record<string, unknown>, current: number): number {
  const v = body.signedVersion;
  if (v === undefined || v === null || v === "") return current;
  const n = typeof v === "number" ? v : typeof v === "string" && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > current) return unprocessable(`The version signed on paper is one of versions 1 to ${current} (signedVersion).`, { signedVersion: `A version from 1 to ${current}.` });
  return n;
}
/** The merge value that marks a version copied from an earlier one for Signed offline (FO-5f item 3). Not a placeholder. */
export const COPIED_FROM = "copied_from_version";
/** The merge values that name a version's signer and representative by id (FO-5f review M-2). Not placeholders. */
export const SIGNER_ID = "signer.person_id", REPRESENTATIVE_ID = "representative.staff_id";
/** The key that opens every prospect of the firm (SA-6-24); its sibling agent/prospect:view.own is everyone's own. */
export const PROSPECT_VIEW_ALL = "agent/prospect:view.all";

/** BR-5: fee rows in. Amounts in cents (whole numbers, 0 … CAD 100 million), empty while the draft has none. */
const FEE_KEYS = ["label", "amountMinor", "when", "dueOn"];
export function feesOf(v: unknown): FeeIn[] {
  if (!Array.isArray(v) || v.length > 50) return unprocessable("Fee rows are a list of at most 50.", { fees: "At most 50 rows." });
  return v.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>, at = `fees[${i}]`;
    // PF-28 part 5 (review m2): a fee row takes only its four fields; a misspelt one is refused, never dropped.
    const extra = typeof o === "object" ? Object.keys(o).find((k) => !FEE_KEYS.includes(k)) : undefined;
    if (extra !== undefined) unprocessable(`A fee row takes only label, amountMinor, when and dueOn (fee row ${i + 1}).`, { [`${at}.${extra.slice(0, 40)}`]: "This field is not allowed here." });
    const label = str(o.label, 120, "A fee row's label", `${at}.label`)!;
    let amountMinor: bigint | null = null;
    if (o.amountMinor !== undefined && o.amountMinor !== null && o.amountMinor !== "") {
      if (typeof o.amountMinor !== "number" && typeof o.amountMinor !== "string") unprocessable("A fee amount is a whole number of cents up to CAD 100 million.", { [`${at}.amountMinor`]: "Cents, 0 to 10000000000." });
      const s = String(o.amountMinor);
      if (!/^\d{1,11}$/.test(s) || BigInt(s) > FEE_MAX_MINOR) unprocessable("A fee amount is a whole number of cents up to CAD 100 million.", { [`${at}.amountMinor`]: "Cents, 0 to 10000000000." });
      amountMinor = BigInt(s);
    }
    const when = (o.when ?? "ON_SIGNING") as FoRetainerFeeWhen;
    if (!WHENS.includes(when as never)) unprocessable("When is one of On signing, On a date, When submitted, When decided, When done.", { [`${at}.when`]: "Pick when it is due." });
    let dueOn: string | null = null;
    if (o.dueOn !== undefined && o.dueOn !== null && o.dueOn !== "") {
      if (when !== "ON_DATE") unprocessable("Only an \"On a date\" fee has a date.", { [`${at}.dueOn`]: "Only for On a date." });
      const d = String(o.dueOn);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d || d < "2000-01-01" || d > "2200-12-31")
        unprocessable("A due date is a real date as YYYY-MM-DD.", { [`${at}.dueOn`]: "A date as YYYY-MM-DD." });
      dueOn = d;
    }
    return { label, amountMinor, when, dueOn };
  });
}

/** The service. `audit` defaults to the one trail (AuditEventAdapter until AUD-1); a test passes a failing one. */
/** R1.8 (QA-594): a retainer's fees as flat words for an audit line's before and after ("Deposit on signing: 150000 ON_SIGNING"). */
const feeWords = (fees: { label: string; amountMinor: bigint | number | null; when: string; dueOn: string | null }[]) =>
  fees.map((f) => `${f.label}: ${f.amountMinor === null ? "no amount" : String(f.amountMinor)} ${f.when}${f.dueOn ? ` ${f.dueOn}` : ""}`);

export class Retainers {
  readonly render: DocxRender;
  constructor(private readonly db: PrismaClient, private readonly files: FilesPort, private readonly clock: Clock, private readonly audit: AuditPort<Tx> = auditEvent) {
    // The port's adapter resolves the starter's frame; a firm's template renders from its stored bytes (renderDocx).
    this.render = new DocxRender(async (k) => (k === STARTER_KEY ? starterFrame() : null));
  }

  // ------------------------------------------------------------------------------------------------- helpers
  /** One transaction; a race the database refuses (a lost lock check, a trigger, a unique key) answers 409, never 500 (B-5). */
  private async tx<T>(fn: (tx: Tx) => Promise<T>, unique: Record<string, () => never> = {}): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      const m = String((e as Error)?.message ?? e) + JSON.stringify((e as { meta?: unknown })?.meta ?? "");
      for (const [k, f] of Object.entries(unique)) if (m.includes(k)) f();
      // Only what a race produces (review r2-m1): a unique key, a serialization or deadlock, or part 1's state triggers
      // refusing a move another transaction made first. Anything else is a fault: logged and answered 500, never hidden.
      if (/P2002|P2034|Unique constraint|could not serialize|deadlock|status cannot move|does not change|only the current version|a request ends once|sent_at is set once|current_version moves|written only as the current version|must end before version|comes back to DRAFT only|change only by an edit/i.test(m))
        conflict("This changed at the same time (someone else saved it). Open it again.", "CHANGED");
      // FO-5f item 10 (r3-m2): only the error code and the constraint's name are logged, never Prisma's message or meta
      // (a failing row's values could be personal data).
      const meta = (e as { meta?: { code?: unknown; constraint?: unknown } })?.meta, name = /^[A-Za-z0-9_]{1,63}$/;
      const code = [(e as { code?: unknown })?.code, meta?.code].find((c) => typeof c === "string" && name.test(c)) ?? "none";
      const constraint = [meta?.constraint, /constraint "([A-Za-z0-9_]{1,63})"/.exec(m)?.[1]].find((c) => typeof c === "string" && name.test(c)) ?? "unknown";
      console.error(`[fo-retainers] unexpected database refusal: code=${code} constraint=${constraint}`);
      throw e;
    }
  }

  /** All of the firm's prospects (and their retainers): the person's agent/prospect:view.all key and the firm setting (PF-6b).
   *  The key is read from the person's live role grants, the tables the guard reads, not from req.platform.keys: callers
   *  that build a context themselves (FO-5's suite) keep their results (Lead B, #1808). */
  private async seesAll(ctx: StaffContext) {
    return (await readSetting<boolean>(this.db, ctx.firmId, EVERYONE_SEES_ALL.key)) === true && holdsKey(this.db, ctx.firmId, ctx.staffId, PROSPECT_VIEW_ALL);
  }

  /** The firm's people who may represent (BR-3): active, a licence record, and the case-manager sign-off keys. */
  async representatives(firmId: string): Promise<{ staffId: string; name: string }[]> {
    const keys = [...DUTY_KEYS.represent];
    const rows = await this.db.$queryRaw<{ id: string; display_name: string }[]>(Prisma.sql`
      select s.id::text, s.display_name from platform_staff s
       join platform_staff_credential c on c.firm_id = s.firm_id and c.staff_id = s.id
      where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE'
        and (select count(distinct rp.permission_key) from platform_role_grant g join platform_role_permission rp on rp.role = g.role
              where g.firm_id = s.firm_id and g.staff_id = s.id and g.ended_at is null and rp.permission_key = any(${keys})) = ${keys.length}
      order by s.display_name, s.id`);
    return rows.map((r) => ({ staffId: r.id, name: r.display_name }));
  }

  private async prospectFor(ctx: StaffContext, prospectId: string, viaRepresentative = false) {
    const p = await this.db.foProspect.findFirst({
      where: { firmId: ctx.firmId, id: prospectId },
      include: { subjectPerson: true, subjectCompany: { include: { contacts: { where: { validTo: null }, include: { person: true }, orderBy: { validFrom: "asc" } } } }, primaryContact: true, stage: true },
    });
    if (!p) return notFound("prospect");
    if (!viaRepresentative && !(await this.seesAll(ctx)) && p.ownerStaffId !== ctx.staffId) return notFound("prospect");
    return p;
  }

  /** The retainer if the person may see it (firm, then visibility). The representative always may read it (BR-3); a
   *  change needs the prospect's own visibility (break B-11, review m3: the row grants the representative reading). */
  private async visible(ctx: StaffContext, id: string, change = false) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const r = await this.db.foRetainer.findFirst({ where: { firmId: ctx.firmId, id } });
    if (!r) return notFound();
    if ((!change && r.representativeStaffId === ctx.staffId) || (await this.seesAll(ctx))) return r;
    if (r.prospectId) {
      const p = await this.db.foProspect.findFirst({ where: { firmId: ctx.firmId, id: r.prospectId }, select: { ownerStaffId: true } });
      if (p?.ownerStaffId === ctx.staffId) return r;
    } else if (r.createdBy === `staff:${ctx.staffId}`) return r;
    return notFound();
  }

  private async event(tx: Tx, firmId: string, type: EventName, payload: RetainerEventPayload) {
    await tx.moduleEvent.create({ data: { firmId, type, subjectId: payload.retainerId, payload: RetainerEventPayload.parse(payload) } });   // last (contracts §0.5)
  }

  // R1.8 (QA-594): every line below passes before and after (the retainer's or template's values; null for the side that
  // does not exist). The fees as one flat list of words, one per fee.
  private line(ctx: StaffContext, action: string, entityKey: string, summary: string, detail: Record<string, string | number | boolean | null> = {}) {
    return { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action, entity: "fo_retainer", entityKey, summary, detail };
  }

  // ----------------------------------------------------------------------------------------------- templates
  placeholders() { return { placeholders: PLACEHOLDERS.map((p) => ({ name: p.name, label: p.label, mustFill: !!p.mustFill, loop: !!p.loop })) }; }

  /** BR-1 (M5): the Sample starter, built at run time from the committed text by the render port. */
  async starter(): Promise<{ bytes: Uint8Array; contentType: string; filename: string; note: string }> {
    const doc = await buildStarter(this.render, readFileSync(STARTER_TEXT, "utf8"));
    return { ...doc, filename: "sample-retainer-starter.docx", note: "Sample wording. Unconfirmed: no counsel." };
  }

  /** Reads an uploaded .docx (BR-1): unreadable → 422 "We could not read this file."; an unknown placeholder → 422 naming
   *  it; a missing client name or fee → accepted with warnings. */
  private async readTemplate(file: Upload | undefined) {
    if (!file?.bytes?.length) return unprocessable("Choose a .docx file.", { file: "Choose a .docx file." });
    if (file.size > TEMPLATE_MAX_BYTES) unprocessable("A template is at most 5 MB.", { file: "At most 5 MB." });
    let found: string[];
    try { found = await placeholdersOf(file.bytes); } catch (e) {
      if (e instanceof UnreadableDocx) { const says = e.says ?? "We could not read this file."; return unprocessable(says, { file: says }, { code: e.code ?? "UNREADABLE_FILE" }); }   // FO-5f: B-19, B-20, B-21 say why
      throw e;
    }
    const c = checkPlaceholders(found);
    const shown = c.unknown.slice(0, 10), more = c.unknown.length - shown.length;   // a short answer (break B-19)
    if (c.unknown.length) unprocessable(shown.map((n) => `{${n}} is not a placeholder we know`).join("; ") + (more ? `; and ${more} more` : "") + ".", { file: `Unknown: ${shown.map((n) => `{${n}}`).join(", ")}${more ? ` and ${more} more` : ""}` }, { code: "UNKNOWN_PLACEHOLDER", unknown: shown });
    return c;
  }

  async listTemplates(ctx: StaffContext) {
    const rows = await this.db.foRetainerTemplate.findMany({ where: { firmId: ctx.firmId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
    return rows.map((t) => ({ id: t.id, name: t.name, kind: t.kind, version: t.version, active: t.active, placeholders: t.placeholders, warnings: checkPlaceholders(t.placeholders).warnings, updatedAt: t.updatedAt }));
  }

  async uploadTemplate(ctx: StaffContext, body: Record<string, unknown>, file: Upload | undefined) {
    parseInput(TemplateBody, body);
    const name = nameOf120(body.name);
    const kind = (body.kind ?? "RETAINER") as "RETAINER" | "CONSULTATION";
    if (kind !== "RETAINER" && kind !== "CONSULTATION") unprocessable("Kind is RETAINER or CONSULTATION.", { kind: "RETAINER or CONSULTATION." });
    const c = await this.readTemplate(file);
    const id = randomUUID(), key = `retainer-templates/${id}/v1-${attempt()}.docx`;
    const stored = await this.files.put(ctx.firmId, key, file!.bytes, DOCX);
    const taken = () => conflict("A template with this name already exists.", "NAME_TAKEN");
    {
      await this.tx(async (tx) => {
        await tx.foRetainerTemplate.create({ data: { id, firmId: ctx.firmId, name, kind, fileKey: key, fileSha256: stored.sha256, placeholders: c.placeholders, createdBy: `staff:${ctx.staffId}`, updatedBy: `staff:${ctx.staffId}` } });
        await this.audit.record(tx, { ...this.line(ctx, "retainer.template.uploaded", id, `Template uploaded (${kind.toLowerCase()}, version 1)`, { templateId: id, kind, version: 1, sha256: stored.sha256 }), entity: "fo_retainer_template",
          before: null, after: { name, kind, version: 1, active: true, fileSha256: stored.sha256, placeholders: c.placeholders } });
      }, { fo_retainer_template_firm_id_name: taken, "(`firm_id`,`name`)": taken, firmId_name: taken });
    }
    return { id, name, kind, version: 1, active: true, placeholders: c.placeholders, warnings: c.warnings };
  }

  /** A new file for a template makes version n+1 (BR-1); retainers keep the version they were made from. */
  async newTemplateVersion(ctx: StaffContext, id: string, file: Upload | undefined, body: Record<string, unknown> = {}) {
    if (typeof id !== "string" || !UUID.test(id)) notFound("template");
    // PF-28 (R1.10): the form's fields through the one input rule, and the file's presence, before the template is looked up
    // (an unknown field or a wrong type 422 named; no file 422 on its field; a random id's 404 never hides them).
    parseInput(TemplateVersionBody, body);
    if (!file?.bytes?.length) unprocessable("Choose a .docx file.", { file: "Choose a .docx file." });
    const t = await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id } }) ?? notFound("template");
    // FO-5s part 2 break M1: the version the page showed (multipart digits); a colleague's newer version is never replaced
    // silently. Optional, so earlier callers keep working.
    if (body.expectedVersion !== undefined && body.expectedVersion !== "") {
      const expected = expectedVersionOf(body, true);   // plain digits or 422 at the field, as the retainer routes (break n4)
      if (expected !== t.version) conflict(`This template is now at version ${t.version}, not version ${expected}. Open it again.`, "CHANGED");
    }
    const c = await this.readTemplate(file);
    const version = t.version + 1, key = `retainer-templates/${id}/v${version}-${attempt()}.docx`;
    const stored = await this.files.put(ctx.firmId, key, file!.bytes, DOCX);
    await this.tx(async (tx) => {
      const n = await tx.foRetainerTemplate.updateMany({ where: { firmId: ctx.firmId, id, version: t.version }, data: { version, fileKey: key, fileSha256: stored.sha256, placeholders: c.placeholders, updatedBy: `staff:${ctx.staffId}` } });
      if (n.count !== 1) conflict("Someone changed this template at the same time. Open it again.", "CHANGED");
      await this.audit.record(tx, { ...this.line(ctx, "retainer.template.new_version", id, `Template version ${version} uploaded`, { templateId: id, version, sha256: stored.sha256 }), entity: "fo_retainer_template",
        before: { version: t.version, fileSha256: t.fileSha256, placeholders: t.placeholders }, after: { version, fileSha256: stored.sha256, placeholders: c.placeholders } });
    });
    return { id, version, placeholders: c.placeholders, warnings: c.warnings };
  }

  async changeTemplate(ctx: StaffContext, id: string, body: Record<string, unknown>) {
    if (typeof id !== "string" || !UUID.test(id)) notFound("template");
    parseInput(TemplateChangeBody, body);   // PF-28 part 5: the body before the template is looked up
    const data: { active?: boolean; name?: string } = {};
    if (body.active !== undefined) { if (typeof body.active !== "boolean") unprocessable("Active is true or false.", { active: "true or false" }); data.active = body.active as boolean; }
    if (body.name !== undefined) data.name = nameOf120(body.name);
    if (!Object.keys(data).length) unprocessable("Nothing to change.", { body: "Send active or name." });
    const t = await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id } }) ?? notFound("template");
    const taken = () => conflict("A template with this name already exists.", "NAME_TAKEN");
    await this.tx(async (tx) => {
      await tx.foRetainerTemplate.update({ where: { id: t.id }, data: { ...data, updatedBy: `staff:${ctx.staffId}` } });
      await this.audit.record(tx, { ...this.line(ctx, "retainer.template.changed", id, `Template ${data.active === false ? "switched off" : data.active ? "switched on" : "renamed"}`, { templateId: id, active: data.active ?? t.active }), entity: "fo_retainer_template",
        before: { name: t.name, active: t.active }, after: { name: data.name ?? t.name, active: data.active ?? t.active } });
    }, { fo_retainer_template_firm_id_name: taken, "(`firm_id`,`name`)": taken, firmId_name: taken });
    return { id, ...data };
  }

  /** FO-5b: the template's Code s. 24(3) checklist (its newest version): each item marked or not, never a refusal. */
  async templateChecklist(ctx: StaffContext, id: string) {
    if (typeof id !== "string" || !UUID.test(id)) notFound("template");
    const t = await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id }, select: { id: true, name: true, kind: true, version: true, placeholders: true } }) ?? notFound("template");
    // s. 24(3) is the service agreement's list: a consultation template's answer says it does not apply (review m3).
    return { templateId: t.id, name: t.name, kind: t.kind, version: t.version, appliesTo: "RETAINER", applies: t.kind === "RETAINER", ...checklistFor(t.placeholders) };
  }

  // ----------------------------------------------------------------------------------------------- retainers
  /** The signer (BR-4): the prospect's person; for Corporate, its SIGNATORY contact, else a warning and the company's other
   *  contacts to pick from (AG-5-50: never a block). A given signer must be one of those people. */
  private signerFor(p: Awaited<ReturnType<Retainers["prospectFor"]>>, given: string | null) {
    if (p.type === "INDIVIDUAL") {
      if (given && given !== p.subjectPersonId) unprocessable("The signer of an Individual prospect is the prospect's person.", { signerPersonId: "Not this prospect's person." });
      return { signer: p.subjectPerson, warnings: [] as string[], options: [] as { personId: string; name: string; role: string; email: string | null }[] };
    }
    const contacts = p.subjectCompany?.contacts ?? [];
    const options = contacts.map((c) => ({ personId: c.personId, name: nameOf(c.person), role: c.role, email: c.person.email }));   // FO-5s review n1: with the email, as read() lists them
    if (given) {
      const c = contacts.find((x) => x.personId === given);
      if (!c) unprocessable("The signer must be one of the company's contacts.", { signerPersonId: "Not one of the company's contacts." });
      return { signer: c!.person, warnings: [], options };
    }
    const sig = contacts.find((c) => c.role === "SIGNATORY");
    if (sig) return { signer: sig.person, warnings: [], options };
    return { signer: null, warnings: ["This company has no signatory contact. Pick who signs from its contacts."], options };
  }

  /** The merge values bound into a version (AG-5-3): copied, so a later change to the person never alters it. */
  private async mergeValues(firmId: string, p: { id: string; type: string; subjectPerson: Person | null; subjectCompany: { operatingName: string } | null }, signer: Person | null, repId: string, n: number, fees: FeeIn[], templatePlaceholders: readonly string[] = []) {
    const printsDisclosure = templatePlaceholders.includes("conflict.disclosure");
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: firmId }, select: { operatingName: true } });
    const rep = await this.db.platformStaff.findFirst({ where: { firmId, id: repId }, include: { credential: true } });
    const client = p.type === "CORPORATE" ? p.subjectCompany?.operatingName ?? null : (p.subjectPerson ? nameOf(p.subjectPerson) || null : null);
    const contact = p.type === "CORPORATE" ? signer : p.subjectPerson;
    const amounts = fees.filter((f) => f.amountMinor !== null).map((f) => f.amountMinor!);
    return {
      "client.name": client, "client.email": contact?.email ?? null, "client.phone": contact?.phone ?? null,
      "company.name": p.type === "CORPORATE" ? p.subjectCompany?.operatingName ?? null : null,
      "signer.name": signer ? nameOf(signer) || null : null, "signer.email": signer?.email ?? null,
      "representative.name": rep?.displayName ?? null, "representative.licensing_body": rep?.credential?.licensingBody ?? null, "representative.licence_number": rep?.credential?.licenceNumber ?? null,
      "firm.name": firm.operatingName, "agreement.date": new Date(this.clock.now()).toISOString().slice(0, 10), "agreement.version": String(n),
      fees: fees.map((f) => ({ label: f.label, amount: f.amountMinor === null ? null : cad(f.amountMinor), when: WHEN_WORDS[f.when], due_on: f.dueOn })),
      "fees.total": amounts.length ? cad(amounts.reduce((a, b) => a + b, 0n)) : null,
      // FO-13c, s. 24(3)(o): only a version whose template prints it holds it, so the value proves it was printed (break B-1).
      "conflict.disclosure": printsDisclosure ? await disclosureFor(this.db, firmId, p.id) : null,
      // Who signs and who represents, by id (FO-5f review M-2: a Signed offline copy of this version restores them). Not
      // placeholders: a template naming them is refused.
      [SIGNER_ID]: signer?.id ?? null, [REPRESENTATIVE_ID]: repId,
      // FO-5b: the Code s. 24(3) items this version's template marks, kept with the version (write-once). Not a placeholder.
      [CODE_MARKED]: markedLetters(templatePlaceholders),
    };
  }

  /** Renders version n from the retainer's template file and stores it (write-once key). */
  private async renderVersion(firmId: string, retainerId: string, n: number, templateFileKey: string, values: Record<string, unknown>) {
    const tpl = await this.files.get(firmId, templateFileKey);
    if (!tpl) return conflict("The template's file is missing. Upload the template again.", "TEMPLATE_FILE_MISSING");
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) data[k] = v === null ? "" : k === "fees" ? (v as Record<string, unknown>[]).map((f) => {
      const row = { label: f.label, amount: f.amount ?? "", when: f.when, due_on: f.due_on ? `, ${f.due_on}` : "" };
      return { ...row, ...Object.fromEntries(Object.entries(row).map(([x, y]) => [`fees.${x}`, y])) };   // {fees.label} inside the loop too (m4)
    }) : v;
    const bytes = await renderDocx(tpl.bytes, data);
    const key = `retainers/${retainerId}/v${n}-${attempt()}.docx`;
    return this.files.put(firmId, key, bytes, DOCX);
  }

  /** BR-6 (AG-5-9): what blocks Send (choices and the two must-fill values) and what only shows "missing". */
  completeness(values: Record<string, unknown>, signerPersonId: string | null, placeholders: string[], representativeEligible = true) {
    const blockers: Record<string, string> = {};
    const fees = (values.fees as { amount: string | null; when: string; due_on: string | null }[]) ?? [];
    if (!values["client.name"]) blockers["client.name"] = "Client name is missing.";
    if (!fees.some((f) => f.amount)) blockers.fees = "Fee is missing. Add a fee row.";
    else if (fees.some((f) => f.when === WHEN_WORDS.ON_DATE && !f.due_on)) blockers.fees = "A fee due on a date needs its date.";   // B-6
    if (!representativeEligible) blockers.representativeStaffId = "The representative is no longer active, licensed or a case manager. Edit to choose another.";   // B-4
    if (!signerPersonId) blockers.signerPersonId = "Choose who signs.";
    else if (!values["signer.email"] && !values["client.email"]) blockers.signerPersonId = "The signer needs an email.";
    const missing = placeholders.filter((n) => !n.startsWith("fees") && n !== "conflict.disclosure" && n in values && (values[n] === null || values[n] === ""));
    return { blockers, missing };
  }

  /** Prepare retainer (BR-2): from a prospect, with the firm's template, a representative and the signer. */
  async draft(ctx: StaffContext, prospectId: string, body: Record<string, unknown>) {
    // PF-28 part 5: a malformed prospect id is the one not-found, then the body, then the look-ups.
    const pid = idOf(prospectId, "prospect").toLowerCase();
    parseInput(DraftBody, body);
    const kind = (body.kind ?? "RETAINER") as "RETAINER" | "CONSULTATION";
    if (kind !== "RETAINER" && kind !== "CONSULTATION") unprocessable("Kind is RETAINER or CONSULTATION.", { kind: "RETAINER or CONSULTATION." });
    for (const f of ["templateId", "representativeStaffId", "signerPersonId"] as const) uuidOf(body[f], f);
    if (body.fees !== undefined) feesOf(body.fees);
    const reps = await this.representatives(ctx.firmId);
    if (!reps.length) conflict(NO_LICENSED, "NO_LICENSED_CONSULTANT");
    const p = await this.prospectFor(ctx, pid);
    if (p.stage.kind === "WON" || p.stage.kind === "LOST") conflict(`This prospect is ${p.stage.kind === "WON" ? "won" : "lost"}: a retainer is prepared for an open prospect.`, "PROSPECT_CLOSED");
    const open = () => conflict("This prospect already has an open retainer. Open it instead.", "RETAINER_OPEN");
    if (kind === "RETAINER" && await this.db.foRetainer.findFirst({ where: { firmId: ctx.firmId, prospectId: p.id, kind: "RETAINER", status: { notIn: ["WITHDRAWN", "EXPIRED"] } }, select: { id: true } })) open();   // B-9: before any rendering
    const t = await this.templateFor(ctx.firmId, uuidOf(body.templateId, "templateId"), kind);
    const repId = uuidOf(body.representativeStaffId, "representativeStaffId") ?? (reps.some((r) => r.staffId === ctx.staffId) ? ctx.staffId : null);
    if (!repId) unprocessable("Choose the representative.", { representativeStaffId: "Choose the representative." });
    if (!reps.some((r) => r.staffId === repId)) unprocessable("The representative must be an active person with a licence and the case-manager permissions.", { representativeStaffId: "Not eligible to represent." });
    const s = this.signerFor(p, uuidOf(body.signerPersonId, "signerPersonId"));
    const fees = body.fees === undefined ? [{ label: "Deposit on signing", amountMinor: null, when: "ON_SIGNING" as const, dueOn: null }] : feesOf(body.fees);
    const id = randomUUID(), values = await this.mergeValues(ctx.firmId, p, s.signer, repId!, 1, fees, t.placeholders);
    const file = await this.renderVersion(ctx.firmId, id, 1, t.fileKey, values);
    await this.tx(async (tx) => {
      await tx.foRetainer.create({ data: { id, firmId: ctx.firmId, kind, prospectId: p.id, subject: p.type === "CORPORATE" ? "COMPANY" : "PERSON", companyId: p.type === "CORPORATE" ? p.subjectCompanyId : null, signerPersonId: s.signer?.id ?? null, representativeStaffId: repId!, templateId: t.id, templateVersion: t.version, templateFileKey: t.fileKey, createdBy: `staff:${ctx.staffId}` } });
      await this.writeVersion(tx, ctx, id, 1, values, file, fees);
      await this.audit.record(tx, { ...this.line(ctx, "retainer.drafted", id, `${kind === "RETAINER" ? "Retainer" : "Consultation agreement"} drafted (version 1)`, { retainerId: id, prospectId: p.id, templateId: t.id, templateVersion: t.version, sha256: file.sha256 }), entity: "fo_retainer",
        before: null, after: { kind, status: "DRAFT", version: 1, prospectId: p.id, signerPersonId: s.signer?.id ?? null, representativeStaffId: repId!, templateId: t.id, templateVersion: t.version, fees: feeWords(fees), fileSha256: file.sha256 } });
      await this.event(tx, ctx.firmId, EVENT.RETAINER_DRAFTED, { retainerId: id, kind, prospectId: p.id, version: 1 });
    }, { fo_retainer_one_live_per_prospect: open });
    return { ...(await this.read(ctx, id)), warnings: s.warnings, signerOptions: s.options };
  }

  private async templateFor(firmId: string, templateId: string | null, kind: "RETAINER" | "CONSULTATION") {
    if (templateId) {
      const t = await this.db.foRetainerTemplate.findFirst({ where: { firmId, id: templateId } });
      if (!t) return unprocessable("No such template in your firm.", { templateId: "No such template." });
      if (!t.active) unprocessable("This template is switched off.", { templateId: "Switched off." });
      if (t.kind !== kind) unprocessable(`This is a ${t.kind.toLowerCase()} template.`, { templateId: "Another kind of template." });
      return t;
    }
    const all = await this.db.foRetainerTemplate.findMany({ where: { firmId, kind, active: true } });
    if (all.length === 1) return all[0];
    return all.length ? unprocessable("Choose the template.", { templateId: "Choose the template." }) : conflict(`No active ${kind === "RETAINER" ? "retainer" : "consultation agreement"} template. Upload one first.`, "NO_TEMPLATE");
  }

  private async writeVersion(tx: Tx, ctx: StaffContext, retainerId: string, n: number, values: Record<string, unknown>, file: { key: string; sha256: string }, fees: FeeIn[]) {
    const v = await tx.foRetainerVersion.create({ data: { firmId: ctx.firmId, retainerId, n, mergeValues: values as Prisma.InputJsonValue, fileKey: file.key, originalSha256: file.sha256, createdBy: `staff:${ctx.staffId}` } });
    if (fees.length) await tx.foRetainerFeeRow.createMany({ data: fees.map((f, i) => ({ firmId: ctx.firmId, versionId: v.id, position: i + 1, label: f.label, amountMinor: f.amountMinor, when: f.when, dueOn: f.dueOn ? new Date(`${f.dueOn}T00:00:00Z`) : null })) });
    return v;
  }

  /** FO-5s (S2): a prospect's retainers for its card, newest first. The prospect's own visibility shows them all; the
   *  representative of one sees that one (BR-3); anyone else gets the one not-found. */
  async listForProspect(ctx: StaffContext, prospectId: string) {
    const id = uuidOf(prospectId, "prospectId") ?? notFound("prospect");
    const p = await this.db.foProspect.findFirst({ where: { firmId: ctx.firmId, id }, select: { id: true, ownerStaffId: true } });
    if (!p) return notFound("prospect");
    const all = p.ownerStaffId === ctx.staffId || (await this.seesAll(ctx));
    const rows = await this.db.foRetainer.findMany({ where: { firmId: ctx.firmId, prospectId: p.id, ...(all ? {} : { representativeStaffId: ctx.staffId }) }, orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true, kind: true, status: true, currentVersion: true, representativeStaffId: true, updatedAt: true, versions: { where: { sentAt: { not: null } }, select: { n: true }, take: 1 } } });
    if (!all && !rows.length) return notFound("prospect");
    // sentBefore: an earlier version was sent, so a Draft means the client cannot sign until the new one is sent (break re-check).
    return rows.map(({ versions, ...r }) => ({ ...r, mine: r.representativeStaffId === ctx.staffId, sentBefore: versions.length > 0 }));
  }

  /** The retainer page (BR-6): the current version, its fees, what blocks Send and what is missing, the versions. */
  async read(ctx: StaffContext, id: string) {
    const r = await this.visible(ctx, id);
    const versions = await this.db.foRetainerVersion.findMany({ where: { firmId: ctx.firmId, retainerId: r.id }, orderBy: { n: "asc" }, include: { fees: { orderBy: { position: "asc" } } } });
    const cur = versions.find((v) => v.n === r.currentVersion)!;
    const tpl = await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id: r.templateId }, select: { name: true, placeholders: true, version: true } });
    const values = cur.mergeValues as Record<string, unknown>;
    // The prospect's header (BR-3: the retainer's representative reads it whatever the visibility setting).
    const ph = r.prospectId ? await this.db.foProspect.findFirst({ where: { firmId: ctx.firmId, id: r.prospectId }, select: { id: true, number: true, type: true, stage: { select: { label: true, kind: true } } } }) : null;
    const repOk = (await this.representatives(ctx.firmId)).some((x) => x.staffId === r.representativeStaffId);
    const madeFrom = await this.placeholdersMadeFrom(ctx.firmId, r, tpl);
    const c = this.completeness(values, r.signerPersonId, madeFrom, repOk);
    const signed = r.status === "SIGNED" || r.status === "SIGNED_OFFLINE";
    const filedFrom = signed ? (versions.find((v) => v.n === r.currentVersion)?.mergeValues as Record<string, unknown> | undefined)?.[COPIED_FROM] : undefined;
    return {
      id: r.id, kind: r.kind, status: r.status, prospectId: r.prospectId, prospect: ph ? { id: ph.id, number: ph.number, type: ph.type, stage: ph.stage.label, stageKind: ph.stage.kind } : null, subject: r.subject, companyId: r.companyId, signerPersonId: r.signerPersonId,
      representativeStaffId: r.representativeStaffId, template: { id: r.templateId, name: tpl?.name ?? null, version: r.templateVersion },
      version: { n: cur.n, sha256: cur.originalSha256, sentAt: cur.sentAt, values: { ...values, "representative.licence_number": undefined } as Record<string, unknown>,
        fees: cur.fees.map((f) => ({ position: f.position, label: f.label, amountMinor: f.amountMinor === null ? null : f.amountMinor.toString(), currency: f.currency, when: f.when, dueOn: f.dueOn?.toISOString().slice(0, 10) ?? null })) },
      // break r2-m3: what blocks Send is shown only while the agreement can still be edited (never "Edit to choose another" on a signed one).
      // FO-5s break M4: whether this person may change it (Edit, Send): the prospect's own visibility, not the
      // representative's read-only right (BR-3). The screens offer no control the server would refuse.
      mayChange: await this.visible(ctx, id, true).then(() => true, () => false),
      // FO-5s review M1 (BR-4, AG-5-50): a company's current contacts, the signer's choices (a signatory first, never a block).
      signerOptions: r.subject === "COMPANY" && r.companyId ? (await this.db.foCompanyContact.findMany({ where: { firmId: ctx.firmId, companyId: r.companyId, validTo: null }, include: { person: true }, orderBy: { validFrom: "asc" } }))
        .map((c) => ({ personId: c.personId, name: nameOf(c.person) || "(no name)", role: c.role, email: c.person.email })) : [],
      canSend: r.status === "DRAFT" && !Object.keys(c.blockers).length, blockers: EDITABLE.includes(r.status) ? c.blockers : {}, missing: c.missing,
      // FO-5b: one quiet line, each Code s. 24(3) item present or missing in this version's template; never a blocker.
      codeChecklist: r.kind === "RETAINER" ? draftChecklist(lettersOf(values) ?? markedLetters(madeFrom), { id: r.templateId, version: r.templateVersion, currentVersion: tpl?.version ?? null }) : null,
      withdrawn: r.withdrawnAt ? { at: r.withdrawnAt, reason: r.withdrawnReason } : null, signedOffline: r.offlineAt ? { at: r.offlineAt, reason: r.offlineReason, filed: "Signed on paper" } : null,
      // FO-5f item 3: each version's fees (the Signed offline panel shows the chosen version's), whether it is the signed
      // one, and the version a Signed offline copy was made from.
      versions: versions.map((v) => {
        const from = (v.mergeValues as Record<string, unknown>)[COPIED_FROM], copiedFrom = typeof from === "number" ? from : null;
        return {
          n: v.n, sentAt: v.sentAt, endedAt: v.endedAt, endReason: v.endReason, sha256: v.originalSha256, copiedFrom, codeMarked: lettersOf(v.mergeValues as Record<string, unknown>),
          signed: signed ? v.n === r.currentVersion : null,
          note: copiedFrom !== null ? `Copied from version ${copiedFrom}, signed on paper` : !signed || v.n === r.currentVersion ? null
            : v.n === filedFrom ? `Signed on paper; filed as version ${r.currentVersion}` : "Not signed",   // review m-2
          fees: v.fees.map((f) => ({ position: f.position, label: f.label, amountMinor: f.amountMinor === null ? null : f.amountMinor.toString(), currency: f.currency, when: f.when, dueOn: f.dueOn?.toISOString().slice(0, 10) ?? null })),
        };
      }),
    };
  }

  /** FO-5f item 9 (Devin 4575579359): an agreement's "missing" list uses the placeholders of the template version it was
   *  made from. The template row holds its newest version's list; an older version's is read from its own stored file. */
  private async placeholdersMadeFrom(firmId: string, r: { templateVersion: number; templateFileKey: string }, tpl: { placeholders: string[]; version: number } | null): Promise<string[]> {
    if (tpl && tpl.version === r.templateVersion) return tpl.placeholders;
    const f = await this.files.get(firmId, r.templateFileKey);
    try { return f ? await placeholdersOf(f.bytes) : tpl?.placeholders ?? []; } catch { return tpl?.placeholders ?? []; }
  }

  /** Edit (BR-9; AG-5-65): every edit is version n+1. On a sent one the open request ends (UPDATED) in the same
   *  transaction; after the client signed, refused. From Declined or Expired, Edit and resend (AG-5-65 r1). */
  async edit(ctx: StaffContext, id: string, body: Record<string, unknown>) {
    idOf(id);
    parseInput(EditBody, body);   // PF-28 part 5: the body before the retainer is looked up
    if (!["templateId", "signerPersonId", "representativeStaffId", "fees"].some((k) => body[k] !== undefined)) unprocessable("Nothing to change.", { body: "Send templateId, signerPersonId, representativeStaffId or fees." });   // B-12: no new version for nothing
    // A stale save is refused (STANDARDS stale-save rule; Devin 4575579111): the page sends the version it shows.
    const expected = expectedVersionOf(body), expectedStatus = expectedStatusOf(body);
    for (const f of ["templateId", "signerPersonId"] as const) if (body[f] !== undefined) uuidOf(body[f], f);
    if (body.representativeStaffId !== undefined) uuidOf(body.representativeStaffId, "representativeStaffId") ?? unprocessable("Choose the representative.", { representativeStaffId: "Choose the representative." });
    if (body.fees !== undefined) feesOf(body.fees);
    const r = await this.visible(ctx, id, true);
    if (expected !== r.currentVersion) stale(r.currentVersion, expected);
    if (expectedStatus !== r.status) restated(r.status, expectedStatus);   // FO-5f item 2 (B-25): sent by a colleague meanwhile
    if (!EDITABLE.includes(r.status)) conflict(r.status === "CLIENT_SIGNED" || r.status === "SIGNED" || r.status === "SIGNED_OFFLINE" ? "The client has signed this agreement: it can no longer be edited." : "This agreement is withdrawn: prepare a new one.", "NOT_EDITABLE");
    const p = await this.prospectFor(ctx, r.prospectId ?? notFound("prospect"), true);
    const open = () => conflict("This prospect already has an open retainer. Open it instead.", "RETAINER_OPEN");
    if (r.kind === "RETAINER" && r.status === "EXPIRED" && await this.db.foRetainer.findFirst({ where: { firmId: ctx.firmId, prospectId: p.id, kind: "RETAINER", id: { not: r.id }, status: { notIn: ["WITHDRAWN", "EXPIRED"] } }, select: { id: true } })) open();   // review r2-m2, before rendering
    const cur = await this.db.foRetainerVersion.findFirstOrThrow({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion }, include: { fees: { orderBy: { position: "asc" } } } });
    const chosen = body.templateId !== undefined ? await this.templateFor(ctx.firmId, uuidOf(body.templateId, "templateId"), r.kind) : null;
    const t = chosen ?? await this.currentTemplateFile(ctx.firmId, r);
    let repId = r.representativeStaffId;
    if (body.representativeStaffId !== undefined) {
      repId = uuidOf(body.representativeStaffId, "representativeStaffId") ?? unprocessable("Choose the representative.", { representativeStaffId: "Choose the representative." });
      if (!(await this.representatives(ctx.firmId)).some((x) => x.staffId === repId)) unprocessable("The representative must be an active person with a licence and the case-manager permissions.", { representativeStaffId: "Not eligible to represent." });
    }
    const s = this.signerFor(p, body.signerPersonId !== undefined ? uuidOf(body.signerPersonId, "signerPersonId") : r.signerPersonId);
    const fees = body.fees !== undefined ? feesOf(body.fees) : cur.fees.map((f) => ({ label: f.label, amountMinor: f.amountMinor, when: f.when, dueOn: f.dueOn?.toISOString().slice(0, 10) ?? null }));
    const usedPh = chosen ? chosen.placeholders
      : await this.placeholdersMadeFrom(ctx.firmId, r, await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id: r.templateId }, select: { placeholders: true, version: true } }));
    const n = r.currentVersion + 1, values = await this.mergeValues(ctx.firmId, p, s.signer, repId, n, fees, usedPh);
    const file = await this.renderVersion(ctx.firmId, r.id, n, t.fileKey, values);
    await this.tx(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string; current_version: number }[]>(Prisma.sql`select status::text, current_version from fo_retainer where firm_id = ${ctx.firmId}::uuid and id = ${r.id}::uuid for update`);
      if (locked[0]?.status !== r.status || locked[0]?.current_version !== r.currentVersion) conflict("This agreement changed at the same time (for example the client signed). Open it again.", "CHANGED");
      const ends = !!cur.sentAt && !cur.endedAt;
      if (ends) await tx.foRetainerVersion.update({ where: { id: cur.id }, data: { endedAt: new Date(this.clock.now()), endReason: "UPDATED" } });
      await tx.foRetainer.update({ where: { id: r.id }, data: { status: "DRAFT", currentVersion: n, signerPersonId: s.signer?.id ?? null, representativeStaffId: repId, templateId: t.id, templateVersion: t.version, templateFileKey: t.fileKey } });
      await this.writeVersion(tx, ctx, r.id, n, values, file, fees);
      await this.audit.record(tx, { ...this.line(ctx, "retainer.edited", r.id, `Edited: version ${n}${ends ? " (the earlier request ended)" : ""}`, { retainerId: r.id, version: n, endedVersion: ends ? cur.n : null, sha256: file.sha256 }), entity: "fo_retainer",
        before: { status: r.status, version: r.currentVersion, signerPersonId: r.signerPersonId, representativeStaffId: r.representativeStaffId, templateId: r.templateId, templateVersion: r.templateVersion, fees: feeWords(cur.fees.map((f) => ({ ...f, dueOn: f.dueOn?.toISOString().slice(0, 10) ?? null }))) },
        after: { status: "DRAFT", version: n, signerPersonId: s.signer?.id ?? null, representativeStaffId: repId, templateId: t.id, templateVersion: t.version, fees: feeWords(fees) } });
      // FO-5f item 1: the ended request is told outside FO-5 (FO-6 cancels the signing request on it).
      if (ends) await this.event(tx, ctx.firmId, EVENT.RETAINER_REQUEST_ENDED, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: cur.n, reason: "UPDATED" });
    }, { fo_retainer_one_live_per_prospect: open });
    return { ...(await this.read(ctx, r.id)), warnings: s.warnings, signerOptions: s.options };
  }

  /** The template file the retainer was made from, or the template's current one when it is switched to (an edit). */
  private async currentTemplateFile(firmId: string, r: { templateId: string; templateVersion: number; templateFileKey: string }) {
    return { id: r.templateId, version: r.templateVersion, fileKey: r.templateFileKey };
  }

  /** Send (BR-6, BR-8; AG-5-9): only a Draft, only with its choices made and the client name and a fee filled in. FO-6
   *  adds the signing request and the one email in this same step. */
  async send(ctx: StaffContext, id: string, body: Record<string, unknown> = {}) {
    idOf(id);
    parseInput(SendBody, body);   // PF-28 part 5: the body before the retainer is looked up
    const expected = expectedVersionOf(body);   // break B-24: never send a version the person did not see
    const r = await this.visible(ctx, id, true);
    if (expected !== r.currentVersion) stale(r.currentVersion, expected);
    if (r.status !== "DRAFT") conflict("Only a draft is sent. Edit it to make a new version first.", "NOT_DRAFT");
    const page = await this.read(ctx, id);   // its blockers include the representative's eligibility now (B-4)
    if (Object.keys(page.blockers).length) unprocessable(Object.values(page.blockers).join(" "), page.blockers, { code: "SEND_BLOCKED" });
    await this.conflictCleared(ctx, r, page.version.values);   // FO-13c
    // FO-13i (Code SOR/2022-128 s. 24(2)(a): "seeking corroboration of the information if possible", current to
    // 2026-10-19, read 16 Nov 2026 by Lead B): a signer with no identity check is a warning on the answer and the audit
    // line, never a block. Unconfirmed: no counsel.
    const signer = r.signerPersonId ? await this.db.foPerson.findFirst({ where: { firmId: ctx.firmId, id: r.signerPersonId }, select: { id: true, givenNames: true, familyName: true } }) : null;
    const noCheck = !!signer && (await this.db.foIdentityCheck.count({ where: { firmId: ctx.firmId, personId: signer.id } })) === 0;
    const warnings = noCheck ? [`No identity check is recorded for ${nameOf(signer!) || "the signer"}.`] : [];
    // FO-6 part 3: the signing request in this same step (the adapter's envelope now; its rows in this transaction; the
    // envelope cancelled when the transaction does not commit). A consultation agreement is FO-3c's.
    const signing = r.kind === "RETAINER" ? await prepareRetainerSigning(this.db, this.files, ctx, r, { audit: this.audit, now: () => new Date(this.clock.now()) }) : null;
    await this.tx(async (tx) => {
      if (r.kind === "RETAINER" && r.prospectId) {   // FO-13c (m3, m-3): asked again in the send's transaction, after the party's lock
        const party = await partyOf(tx, ctx.firmId, r.prospectId);
        if (party) await lockParty(tx, ctx.firmId, party);
        assertDisclosurePrinted(await clearance(tx, ctx.firmId, r.prospectId), page.version.values);
      }
      const now = new Date(this.clock.now());
      const n = await tx.foRetainer.updateMany({ where: { firmId: ctx.firmId, id: r.id, status: "DRAFT", currentVersion: r.currentVersion }, data: { status: "SENT" } });
      if (n.count !== 1) conflict("This agreement changed at the same time. Open it again.", "CHANGED");
      await tx.foRetainerVersion.updateMany({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion }, data: { sentAt: now } });
      await this.audit.record(tx, { ...this.line(ctx, "retainer.sent", r.id, `Sent (version ${r.currentVersion})${noCheck ? "; warning: no identity check is recorded for the signer" : ""}`, { retainerId: r.id, version: r.currentVersion, ...(noCheck ? { warning: "NO_IDENTITY_CHECK", signerPersonId: signer!.id } : {}) }), entity: "fo_retainer",
        before: { status: "DRAFT", sentAt: null }, after: { status: "SENT", sentAt: now.toISOString() } });
      await signing?.record(tx);
      await this.event(tx, ctx.firmId, EVENT.RETAINER_SENT, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: r.currentVersion });
    }).catch(async (e) => { await signing?.cancel(); throw e; });
    await signing?.afterCommit();
    return { ...(await this.read(ctx, id)), warnings };
  }

  /** FO-13c: a retainer is sent or signed only for a party with a recorded conflict check that clears it (gate.ts), and
   *  with a potential conflict only when the version prints the check's disclosure (s. 24(3)(o)). A consultation
   *  agreement never makes a client and is not gated. */
  private async conflictCleared(ctx: StaffContext, r: { kind: string; prospectId: string | null }, values: Record<string, unknown>) {
    if (r.kind !== "RETAINER" || !r.prospectId) return;
    assertDisclosurePrinted(await clearance(this.db, ctx.firmId, r.prospectId), values);
  }


  /** Withdraw (BR-10; AG-5-34): a reason 1-200, from Sent, Viewed or Client signed; the request ends. */
  async withdraw(ctx: StaffContext, id: string, body: Record<string, unknown>) {
    idOf(id);
    parseInput(WithdrawBody, body);   // PF-28 part 5: the body before the retainer is looked up
    const reason = str(body.reason, 200, "A reason", "reason", true, true)!;
    // FO-5f item 2 (B-25 and the Withdraw gap): the version and the status the page showed.
    const expected = expectedVersionOf(body), expectedStatus = expectedStatusOf(body);
    const r = await this.visible(ctx, id, true);
    if (expected !== r.currentVersion) stale(r.currentVersion, expected);
    if (expectedStatus !== r.status) restated(r.status, expectedStatus);
    if (!WITHDRAWABLE.includes(r.status)) conflict(r.status === "SIGNED" || r.status === "SIGNED_OFFLINE" ? "A signed agreement cannot be withdrawn." : r.status === "DRAFT" ? "A draft has not been sent: edit it or leave it." : `A ${r.status.toLowerCase()} agreement cannot be withdrawn.`, "NOT_WITHDRAWABLE");
    let signing: Awaited<ReturnType<typeof endRetainerSigning>> | null = null;
    await this.tx(async (tx) => {
      const now = new Date(this.clock.now());
      const v = await tx.foRetainerVersion.updateMany({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion, endedAt: null }, data: { endedAt: now, endReason: "WITHDRAWN" } });
      const n = await tx.foRetainer.updateMany({ where: { firmId: ctx.firmId, id: r.id, status: r.status, currentVersion: r.currentVersion }, data: { status: "WITHDRAWN", withdrawnAt: now, withdrawnBy: `staff:${ctx.staffId}`, withdrawnReason: reason } });
      if (n.count !== 1 || v.count !== 1) conflict("This agreement changed at the same time. Open it again.", "CHANGED");
      await this.audit.record(tx, { ...this.line(ctx, "retainer.withdrawn", r.id, "Withdrawn with a reason", { retainerId: r.id, version: r.currentVersion }), entity: "fo_retainer",
        before: { status: r.status, withdrawnReason: null }, after: { status: "WITHDRAWN", withdrawnAt: now.toISOString(), withdrawnReason: reason } });
      // QA-770: the client's signing request ends with the withdraw (its link stops); the envelope after the commit.
      if (r.kind === "RETAINER") signing = await endRetainerSigning(tx, ctx, r.id, "WITHDRAWN", { audit: this.audit, now });
      await this.event(tx, ctx.firmId, EVENT.RETAINER_WITHDRAWN, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: r.currentVersion });
    });
    await signing?.afterCommit();
    return this.read(ctx, id);
  }

  /** Signed offline (BR-11; AG-5-39, AG-5-47; contracts §2.6): a PDF and a reason; ends the open request; filed "Signed on
   *  paper", no seal; the prospect becomes WON (SIGNED_OFFLINE) once; cannot be undone. A consultation agreement never
   *  makes a client (contracts §7 §2.3-§2.4).
   *  FO-5f item 3 (Lead B, rows rev 16.8): the paper may have been signed on an earlier version (`signedVersion`, default
   *  the current one). The record files exactly what was signed: a new version copies that version's values, fees and
   *  file (marked "copied from version k"), and that copy is filed as signed, in one transaction. History stays
   *  forward-only (part 1's triggers unchanged); the newer unsigned versions stay, marked "not signed". The current
   *  version's open request ends (UPDATED, `retainer.request_ended`). `expectedVersion` stays the stale check. */
  async signedOffline(ctx: StaffContext, id: string, body: Record<string, unknown>, file: Upload | undefined) {
    idOf(id);
    parseInput(OfflineBody, body);   // PF-28 part 5: the form's fields and the file before the retainer is looked up
    const reason = str(body.reason, 200, "A reason", "reason", true, true)!;
    // break B-24: the version the page showed; a newer one saved meanwhile is never filed as signed.
    const expected = expectedVersionOf(body, true);
    if (!file?.bytes?.length) unprocessable("Upload the signed PDF.", { file: "Upload the signed PDF." });
    if (file!.size > OFFLINE_PDF_MAX_BYTES) unprocessable("The signed copy is at most 10 MB.", { file: "At most 10 MB." });
    const head = Buffer.from(file!.bytes.subarray(0, 5)).toString("latin1"), tail = Buffer.from(file!.bytes.subarray(-1024)).toString("latin1");
    if (head !== "%PDF-" || !tail.includes("%%EOF")) unprocessable("The signed copy must be a PDF.", { file: "A PDF only." });   // B-15: header and trailer
    const r = await this.visible(ctx, id, true);
    if (expected !== r.currentVersion) stale(r.currentVersion, expected);
    const k = signedVersionOf(body, r.currentVersion);
    if (!OFFLINE_FROM.includes(r.status)) conflict(r.status === "SIGNED_OFFLINE" || r.status === "SIGNED" ? "This agreement is already signed." : `A ${r.status.toLowerCase()} agreement cannot be recorded as signed.`, "NOT_SIGNABLE");
    // The client signed the current version electronically: a new version (the copy) is never made after that (AG-5-65).
    if (k !== r.currentVersion && r.status === "CLIENT_SIGNED") conflict(`The client signed version ${r.currentVersion} electronically: record that version, or withdraw it first.`, "NOT_SIGNABLE");
    // FO-13c: the conflict gate before any file is stored, on the version signed (winProspect asks again in the transaction).
    await this.conflictCleared(ctx, r, (await this.db.foRetainerVersion.findFirstOrThrow({ where: { firmId: ctx.firmId, retainerId: r.id, n: k } })).mergeValues as Record<string, unknown>);
    // The copy's file is stored first (write-once, a fresh attempt key), like every other file here.
    let copy: { values: Record<string, unknown>; fees: FeeIn[]; file: { key: string; sha256: string }; signerPersonId: string | null; representativeStaffId: string } | null = null;
    if (k !== r.currentVersion) {
      const src = await this.db.foRetainerVersion.findFirstOrThrow({ where: { firmId: ctx.firmId, retainerId: r.id, n: k }, include: { fees: { orderBy: { position: "asc" } } } });
      // Review M-2 (break M-1): the record names the people of the version signed on paper. A version records them by id;
      // one made before FO-5f does not, and is filed only when it names the same people as the current version.
      const sv = src.mergeValues as Record<string, unknown>;
      let people = { signerPersonId: r.signerPersonId, representativeStaffId: r.representativeStaffId };
      if (typeof sv[REPRESENTATIVE_ID] === "string") people = { signerPersonId: typeof sv[SIGNER_ID] === "string" ? sv[SIGNER_ID] as string : null, representativeStaffId: sv[REPRESENTATIVE_ID] as string };
      else {
        const cv = (await this.db.foRetainerVersion.findFirstOrThrow({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion } })).mergeValues as Record<string, unknown>;
        if (["signer.name", "signer.email", "representative.name", "representative.licensing_body", "representative.licence_number"].some((x) => (sv[x] ?? null) !== (cv[x] ?? null)))   // break r2-m2: the body too
          // break r2-m1 (Lead B's wording): no promised way out that cannot work (an edit prints today's details again).
          conflict(`Version ${k} names another signer or representative than version ${r.currentVersion}. This version was saved before people were recorded by id; record a new version as signed instead.`, "NOT_SIGNABLE");
      }
      const f = await this.files.get(ctx.firmId, src.fileKey) ?? conflict(`Version ${k}'s file is missing.`, "VERSION_FILE_MISSING");
      const ext = /\.pdf$/.test(src.fileKey) ? "pdf" : "docx";
      const stored = await this.files.put(ctx.firmId, `retainers/${r.id}/v${r.currentVersion + 1}-${attempt()}.${ext}`, f.bytes, f.contentType);
      copy = {
        values: { ...(src.mergeValues as Record<string, unknown>), [COPIED_FROM]: k },
        fees: src.fees.map((x) => ({ label: x.label, amountMinor: x.amountMinor, when: x.when, dueOn: x.dueOn?.toISOString().slice(0, 10) ?? null })),
        file: stored, ...people,
      };
    }
    const offlineKey = `retainers/${r.id}/signed-offline-${attempt()}.pdf`;
    const stored = await this.files.put(ctx.firmId, offlineKey, file!.bytes, "application/pdf");
    let prospectWon = false, signing: Awaited<ReturnType<typeof endRetainerSigning>> | null = null;
    const filed = copy ? r.currentVersion + 1 : r.currentVersion;
    const filedValues = copy ? copy.values : (await this.db.foRetainerVersion.findFirstOrThrow({ where: { firmId: ctx.firmId, retainerId: r.id, n: k } })).mergeValues as Record<string, unknown>;
    await this.tx(async (tx) => {
      if (r.kind === "RETAINER" && r.prospectId) {   // FO-13c (review r2, r3): the party's lock first, as Send takes it; the gate and the disclosure again
        const party = await partyOf(tx, ctx.firmId, r.prospectId);
        if (party) await lockParty(tx, ctx.firmId, party);
        assertDisclosurePrinted(await clearance(tx, ctx.firmId, r.prospectId), filedValues);
      }
      const now = new Date(this.clock.now());
      let ended: number | null = null, from = r.status;
      if (copy) {
        const locked = await tx.$queryRaw<{ status: string; current_version: number }[]>(Prisma.sql`select status::text, current_version from fo_retainer where firm_id = ${ctx.firmId}::uuid and id = ${r.id}::uuid for update`);
        if (locked[0]?.status !== r.status || locked[0]?.current_version !== r.currentVersion) conflict("This agreement changed at the same time. Open it again.", "CHANGED");
        const cur = await tx.foRetainerVersion.findFirstOrThrow({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion } });
        if (cur.sentAt && !cur.endedAt) { await tx.foRetainerVersion.update({ where: { id: cur.id }, data: { endedAt: now, endReason: "UPDATED" } }); ended = cur.n; }
        // The signer and representative change only with a new version (part 1's trigger): this is that version. The
        // template columns stay (the trigger takes only the template's current version for a draft).
        await tx.foRetainer.update({ where: { id: r.id }, data: { status: "DRAFT", currentVersion: filed, signerPersonId: copy.signerPersonId, representativeStaffId: copy.representativeStaffId } });
        await this.writeVersion(tx, ctx, r.id, filed, copy.values, copy.file, copy.fees);
        from = "DRAFT";
      }
      const v = await tx.foRetainerVersion.updateMany({ where: { firmId: ctx.firmId, retainerId: r.id, n: filed, endedAt: null }, data: { endedAt: now, endReason: "SIGNED_OFFLINE" } });
      const n = await tx.foRetainer.updateMany({ where: { firmId: ctx.firmId, id: r.id, status: from as never, currentVersion: filed }, data: { status: "SIGNED_OFFLINE", offlineAt: now, offlineBy: `staff:${ctx.staffId}`, offlineReason: reason, offlineFileKey: offlineKey, offlineFileSha256: stored.sha256 } });
      if (n.count !== 1 || v.count !== 1) conflict("This agreement changed at the same time. Open it again.", "CHANGED");
      // FO-2w: the one win (sales/prospects.ts `winProspect`): moves the prospect and raises `prospect.won`, once per prospect.
      if (r.kind === "RETAINER" && r.prospectId) prospectWon = (await winProspect(tx, ctx, r.prospectId, { via: "SIGNED_OFFLINE", at: now, retainerId: r.id, audit: (p) =>
        this.audit.record(tx, { ...this.line(ctx, "prospect.won", r.prospectId!, "Won: retainer signed on paper", { prospectId: r.prospectId, wonVia: "SIGNED_OFFLINE" }), entity: "fo_prospect",
          before: { stageKind: p.kind, stage: p.key, wonVia: p.won_via }, after: { stageKind: "WON", wonVia: "SIGNED_OFFLINE", retainerId: r.id } }) })) !== null;
      await this.audit.record(tx, { ...this.line(ctx, "retainer.signed_offline", r.id, `Signed on paper${copy ? ` (version ${k}, filed as version ${filed}, a copy of it)` : ""}${prospectWon ? "; the prospect is won" : ""}`, { retainerId: r.id, version: filed, signedVersion: k, copiedFrom: copy ? k : null, endedVersion: ended, sha256: stored.sha256, prospectWon, representativeStaffId: copy?.representativeStaffId ?? r.representativeStaffId, signerPersonId: copy ? copy.signerPersonId : r.signerPersonId }), entity: "fo_retainer",
        before: { status: r.status, version: r.currentVersion, signerPersonId: r.signerPersonId, representativeStaffId: r.representativeStaffId },
        after: { status: "SIGNED_OFFLINE", version: filed, signerPersonId: copy ? copy.signerPersonId : r.signerPersonId, representativeStaffId: copy?.representativeStaffId ?? r.representativeStaffId, offlineAt: now.toISOString(), offlineReason: reason, offlineFileSha256: stored.sha256 } });
      if (ended !== null) await this.event(tx, ctx.firmId, EVENT.RETAINER_REQUEST_ENDED, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: ended, reason: "UPDATED" });
      // QA-770: a paper signature ends the open e-signing request too (SIGNED_OFFLINE); the envelope after the commit.
      if (r.kind === "RETAINER") signing = await endRetainerSigning(tx, ctx, r.id, "SIGNED_OFFLINE", { audit: this.audit, now });
      await this.event(tx, ctx.firmId, EVENT.RETAINER_SIGNED_OFFLINE, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: filed, prospectWon });
    });
    await signing?.afterCommit();
    return { ...(await this.read(ctx, id)), prospectWon };
  }

  /** A download re-checks that the person still sees the retainer the file belongs to (Devin 4575579436: a link outlived
   *  a change of the prospect's owner). 404 otherwise. */
  async assertFileVisible(ctx: StaffContext, key: string): Promise<void> {
    const m = /^retainers\/([0-9a-f-]{36})\//.exec(key);
    if (!m) return notFound("file");
    // FO-5f item 11 (B-26): "No such file", never "retainer"; any other fault stays a fault (review m-3).
    try { await this.visible(ctx, m[1]); } catch (e) { if (e instanceof HttpException && e.getStatus() === 404) notFound("file"); throw e; }
  }

  /** The file a download link may name (BR-15): a version's document or the signed paper copy, of a retainer the person sees. */
  async fileKey(ctx: StaffContext, id: string, body: Record<string, unknown>): Promise<string> {
    idOf(id);
    parseInput(FileLinkBody, body);   // PF-28 part 5: the body before the retainer is looked up
    const r = await this.visible(ctx, id);
    if (body.file === "signed-offline") return r.offlineFileKey ?? notFound("signed copy");
    const n = body.version === undefined ? r.currentVersion : Number(body.version);
    const v = Number.isInteger(n) ? await this.db.foRetainerVersion.findFirst({ where: { firmId: ctx.firmId, retainerId: r.id, n } }) : null;
    return v?.fileKey ?? notFound("version");
  }
}
Injectable()(Retainers);

type Person = { id: string; givenNames: string | null; familyName: string | null; email: string | null; phone: string | null };
/** A template's name (B-13): one line, 1-120 characters, NFC, nothing hidden or turned around. */
const nameOf120 = (v: unknown): string => {
  // FO-5f item 7 (B-22): normalized first, so the length checked is the length stored (NFC can make a name longer).
  const n = str(typeof v === "string" ? v.normalize("NFC") : v, 120, "The template's name", "name")!;
  if (HIDDEN.test(n) || /[\u0000-\u001f\u007f]/.test(n)) unprocessable("The template's name has hidden characters.", { name: "Remove hidden characters." });
  return n;
};
const nameOf = (p: Pick<Person, "givenNames" | "familyName">) => [p.givenNames, p.familyName].filter((x) => x && x.trim()).join(" ").trim();
