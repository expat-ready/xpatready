// FO-13c (brief lead-b-briefs/FO-13c.md; BACKLOG FO-13c): the gate before a person becomes a client. Send (a retainer),
// Signed offline, Convert and FO-6's e-signature win (all through sales/prospects.ts `winProspect`) ask `clearance` for the
// prospect's party: no recorded check → refused; a check still waiting for its confirmation → refused; CONFLICT_CANNOT_ACT →
// refused (Code SOR/2022-128 s. 15(2), 16(1)); the party's name, email or phone changed since the check → a new check is
// needed. "A recorded check before the retainer is sent" is our product rule implementing s. 5 and 15: the Code names no
// check step. Code read from trace t8 §1b (current to 2026-10-19, read 16 Nov 2026 by Lead B). Unconfirmed: no counsel.
import type { Prisma, PrismaClient } from "@prisma/client";
import { personNameKey } from "../../../../../ports/matching.ts";
import { normaliseCompanyName } from "../../sales/corporate/match.ts";
import { phoneE164Exact } from "../../duplicates/phone.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import { problem } from "../../../platform/identity/keys.ts";

type Db = PrismaClient | Prisma.TransactionClient;
export type Party = { kind: "PERSON" | "COMPANY"; id: string };
export type Terms = { name: string | null; email: string | null; phone: string | null };

export const REQUIRED = "Record a conflict-of-interest check for this client first: no retainer is sent and no client is made without one (our rule on Code SOR/2022-128 s. 5, 15; Unconfirmed: no counsel).";
export const UNCONFIRMED = "The conflict check found matches you cannot open: a manager who may see them must confirm it first.";
export const CANNOT_ACT = "The conflict check recorded a conflict the firm cannot act in (Code SOR/2022-128 s. 15(2), 16(1); Unconfirmed: no counsel).";
export const STALE = "The client's name, email or phone changed after the conflict check: a new check is needed.";
export const NO_DISCLOSURE = "A potential conflict needs its disclosure in the retainer the client signs (Code SOR/2022-128 s. 15(1), 24(3)(o)): use a template with {conflict.disclosure} and edit the agreement so its new version prints it.";
export const NO_CONSENT = "A potential conflict needs the client's written consent: the signed retainer that carries the disclosure (Code SOR/2022-128 s. 15(1)). Record the signed retainer instead of converting.";
const refuse = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });

// The table's text rules (fo_compliance_text_ok / _long_text_ok, break M-5, m-1): no control or direction mark, something visible.
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/;
const INVISIBLE = /[\s\u00ad\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\u0300-\u036f]/gu;
const visible = (t: string) => t.replace(INVISIBLE, "").length > 0;
/** One line the table accepts, at most `max` code points, or null: control marks become spaces, direction marks go. */
export function clean(t: string | null | undefined, max: number): string | null {
  const s = [...(t ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(new RegExp(BIDI.source, "g"), "").replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
  return s && visible(s) ? s : null;
}
/** A disclosure the table accepts (paragraphs and tabs allowed). */
export const longTextOk = (t: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(t) && !BIDI.test(t) && visible(t);

/** The party a prospect engages: its person (Individual) or its company (Corporate). */
export async function partyOf(db: Db, firmId: string, prospectId: string): Promise<Party | null> {
  const p = await db.foProspect.findFirst({ where: firmScope(firmId, { id: prospectId }), select: { subjectPersonId: true, subjectCompanyId: true } });
  if (!p) return null;
  return p.subjectCompanyId ? { kind: "COMPANY", id: p.subjectCompanyId } : p.subjectPersonId ? { kind: "PERSON", id: p.subjectPersonId } : null;
}

/** What a check searches: the party's own current name, email and phone (never typed by the checker), in the shape the
 *  table's terms check accepts (a phone it would refuse is left out). */
export async function termsOf(db: Db, firmId: string, party: Party): Promise<Terms> {
  if (party.kind === "COMPANY") {
    const c = await db.foCompany.findFirst({ where: firmScope(firmId, { id: party.id }), select: { operatingName: true } });
    return { name: clean(c?.operatingName, 300), email: null, phone: null };
  }
  const p = await db.foPerson.findFirst({ where: firmScope(firmId, { id: party.id }), select: { givenNames: true, familyName: true, email: true, phone: true, phoneE164: true } });
  const name = clean([p?.givenNames, p?.familyName].map((x) => x?.trim()).filter(Boolean).join(" "), 300);
  const phone = p?.phoneE164 ?? p?.phone ?? null;
  const phoneOk = !!phone && /^\+?[0-9 ()./-]+$/.test(phone) && phone.replace(/[^0-9]/g, "").length >= 7 && phone.replace(/[^0-9]/g, "").length <= 15;
  return { name, email: p?.email?.trim().toLowerCase() || null, phone: phoneOk ? phone : null };
}

/** Whether the party's terms are still those searched: a person's name by the match's name key, a company's by the
 *  company key (m-6), the email exactly, the phone by its digits (a format change alone is not a change). */
const same = (kind: Party["kind"], a: Terms, b: Terms) => {
  const key = (n: string | null) => (kind === "COMPANY" ? normaliseCompanyName(n ?? "") : personNameKey(n, ""));
  const tel = (p: string | null) => (p ? phoneE164Exact(p) ?? p.replace(/\D/g, "") : "");   // R2-m3: the number as the search reads it
  return key(a.name) === key(b.name) && (a.email ?? null) === (b.email ?? null) && tel(a.phone) === tel(b.phone);
};

/** The party lock by prospect id (Convert takes it before the prospect's row; none for a prospect without a party). */
export async function lockPartyOf(tx: Prisma.TransactionClient, firmId: string, prospectId: string) {
  const party = await partyOf(tx, firmId, prospectId);
  if (party) await lockParty(tx, firmId, party);
}

/** One check or win at a time per party (m-3): a check being saved is seen by the win that waits for it. */
export async function lockParty(tx: Prisma.TransactionClient, firmId: string, party: Party) {
  await tx.$queryRaw`select 1 as ok from (select pg_advisory_xact_lock(hashtextextended(${`fo-conflict:${firmId}:${party.id}`}, 0))) l`;
}

/** The latest check for the party (any engagement), or null. */
export const latestCheck = (db: Db, firmId: string, party: Party) =>
  db.foConflictCheck.findFirst({ where: firmScope(firmId, party.kind === "PERSON" ? { personId: party.id } : { companyId: party.id }), orderBy: [{ checkedAt: "desc" }, { id: "desc" }] });

/** The gate (409 with the reason, else the check that clears it). */
export async function clearance(db: Db, firmId: string, prospectId: string) {
  const party = await partyOf(db, firmId, prospectId);
  const c = party ? await latestCheck(db, firmId, party) : null;
  if (!party || !c) return refuse(REQUIRED, "CONFLICT_CHECK_REQUIRED");
  if (c.result === null || (c.hiddenCount > 0 && !c.confirmedBy)) return refuse(UNCONFIRMED, "CONFLICT_CHECK_UNCONFIRMED");   // M1
  if (c.result === "CONFLICT_CANNOT_ACT") return refuse(CANNOT_ACT, "CONFLICT_CANNOT_ACT");
  if (!same(party.kind, { name: c.searchedName, email: c.searchedEmail, phone: c.searchedPhone }, await termsOf(db, firmId, party))) return refuse(STALE, "CONFLICT_CHECK_STALE");
  return c;
}

/** The disclosure a new retainer version prints ({conflict.disclosure}): the party's latest check's, when it is a potential conflict. */
export async function disclosureFor(db: Db, firmId: string, prospectId: string): Promise<string | null> {
  const party = await partyOf(db, firmId, prospectId);
  const c = party ? await latestCheck(db, firmId, party) : null;
  return c?.result === "POTENTIAL_CONFLICT" ? c.disclosureText : null;
}

/** s. 24(3)(o): with a potential conflict, the version sent or signed prints the check's disclosure. A version holds the
 *  value only when its own template names {conflict.disclosure} (retainers `mergeValues`; break B-1), so the value is the proof. */
export function assertDisclosurePrinted(c: { result: string | null; disclosureText: string | null }, values: Record<string, unknown>) {
  if (c.result === "POTENTIAL_CONFLICT" && values["conflict.disclosure"] !== c.disclosureText) refuse(NO_DISCLOSURE, "CONFLICT_DISCLOSURE_NOT_PRINTED");
}

/** At the win (in its transaction): the gate; a potential conflict needs the signed retainer as the client's written
 *  consent, whose id is recorded once on the check (s. 15(1)). */
export async function clearForWin(tx: Prisma.TransactionClient, firmId: string, prospectId: string, retainerId: string | null, signed: boolean) {
  const party = await partyOf(tx, firmId, prospectId);
  if (party) await lockParty(tx, firmId, party);
  const c = await clearance(tx, firmId, prospectId);
  if (c.result !== "POTENTIAL_CONFLICT") return;
  if (!retainerId && !signed) refuse(NO_CONSENT, "CONFLICT_CONSENT_NEEDED");
  if (retainerId && !c.writtenConsentRef) await tx.foConflictCheck.updateMany({ where: firmScope(firmId, { id: c.id, writtenConsentRef: null }), data: { writtenConsentRef: retainerId } });
}
