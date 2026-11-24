// FO-7t part 2 (R1.58; design/briefs/FO-7t.md part 2; AG-6-68 rules 1-5, 7-9, AG-6-23 rules 1-4, 9; P-603, P-607 (1),
// P-567 (3)): money out of trust, the only two ways (P-603): a withdrawal to an issued invoice (Pay from trust) and a
// refund to the client. Each runs inside its caller's transaction, under the party's trust lock (money_trust_lock,
// FO-7lk's one order: the parties' locks, smaller id first, then the invoice row), so two people at once read the same
// truth (AG-6-68 rule 7) and the second sees what the first wrote.
// * Available (AG-6-68 rule 1) = what the payer holds on the money's case in the invoice's currency: the invoice's own
//   party on the invoice's case (no case: before a case), unless a deliberate pick names another case of that payer, or
//   another payer on the invoice's case (rule 4; the database refuses any other pick, FO-7ts part 3). Never more than the
//   payer's whole balance either (a reversal elsewhere can leave it lower: P-634).
// * The database keeps every rule it holds (issued invoice, never below zero, the open amount, the pick's shape); the
//   checks here come first only so a person reads "Only CAD 169.50 is available." rather than the database's words.
// * One audit line per change (AuditPort, fail-closed) and its event written last (trust.applied, trust.refunded; ids,
//   amount and currency only), and invoice.paid when Pay from trust settles the invoice.
// Legal reading of the trust rules: Unconfirmed: no counsel.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { InvoiceEventPayload, MINOR_MAX, MONEY_EVENT, MoneyCurrency } from "../../../../ports/client-money.ts";
import { TRUST_EVENT, TrustAppliedPayload, TrustRefundedPayload } from "../../../../ports/events/client-money-trust.ts";
import { problem } from "../../platform/identity/keys.ts";
import { MONEY, UUID, badField, notFound } from "../invoices/drafts.ts";
import { invoiceFacts, type Facts } from "../invoices/facts.ts";
import { trustShows } from "../reads/common.ts";

type Tx = Prisma.TransactionClient;
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
const id = (what: string) => z.string().regex(UUID, `${what} is not an id.`).transform((v) => v.toLowerCase());
const amount = z.number({ error: "The amount (in cents) must be a whole number." }).int("The amount (in cents) must be a whole number.").min(1, "The amount is at least 1 cent.").max(MINOR_MAX, `The amount is at most ${MONEY(MINOR_MAX)}.`);
const words = (what: string, max: number) => z.string().trim().min(1, `${what} is needed.`).max(max, `At most ${max} characters.`).regex(/^[^\u0000-\u001f\u007f\u2028\u2029]*$/, "One line, no tabs or control characters.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "That date does not exist.");
const oneOrNone = (d: Record<string, unknown>, keys: string[]) => keys.filter((k) => d[k] !== undefined).length <= 1;

/** The deliberate pick (AG-6-68 rule 4): another case of the payer (caseId; null = its money before a case), or another
 *  payer (personId | companyId) on the invoice's case; always with a reason. */
export const PickIn = z.strictObject({ caseId: id("The case").nullable().optional(), personId: id("The person").optional(), companyId: id("The company").optional(), reason: words("The reason for using this money", 200) })
  .refine((p) => oneOrNone(p, ["personId", "companyId"]), { message: "Name one payer: a person or a company.", path: ["personId"] });
export const ApplyIn = z.strictObject({ invoiceId: id("The invoice"), amountMinor: amount, unclearedAcknowledged: z.boolean().optional(), duplicateAcknowledged: z.boolean().optional(), pick: PickIn.optional() });
/** The tick at issue (`?payFromTrustMinor=N&unclearedAcknowledged=true`): query values are text. */
export const IssueTick = z.strictObject({
  payFromTrustMinor: z.string().regex(/^[1-9]\d{0,9}$/, "The amount to pay from trust is a whole number of cents.").transform(Number).pipe(amount).optional(),
  unclearedAcknowledged: z.enum(["true", "false"], { message: "true or false." }).transform((v) => v === "true").optional(),
});
const PayeeIn = z.strictObject({ personId: id("The payee").optional(), companyId: id("The payee").optional(), name: words("The payee's name", 200).optional(), reason: words("The reason for another payee", 200).optional() })
  .refine((p) => oneOrNone(p, ["personId", "companyId", "name"]), { message: "Name one payee: a person, a company or a name.", path: ["personId"] });
export const RefundIn = z.strictObject({
  personId: id("The person").optional(), companyId: id("The company").optional(), caseId: id("The case").optional(), currency: MoneyCurrency, amountMinor: amount,
  reason: words("The reason", 200), reference: words("The reference", 100), refundedOn: day.optional(), payee: PayeeIn.optional(), duplicateReferenceAcknowledged: z.boolean().optional(),
  method: z.enum(["BANK_TRANSFER", "WIRE", "CHEQUE", "CASH", "E_TRANSFER", "OTHER"], { message: "A refund from trust is offline: bank transfer, e-Transfer, wire, cheque, cash or another method, never by card." }),
}).refine((d) => (d.personId ? 1 : 0) + (d.companyId ? 1 : 0) === 1, { message: "Name one client: a person or a company.", path: ["personId"] });

/** A reference as a person reads it (AG-6-19's duplicate warning, as part 1's deposits read it): NFKC, no zero-width
 *  characters, one space for any run of white space, no outer spaces, any letter case. */
export const refKey = (x: Prisma.Sql) => Prisma.sql`btrim(regexp_replace(regexp_replace(lower(normalize(${x}, NFKC)), '[\u200b-\u200d\u2060\ufeff]', '', 'g'), '\\s+', ' ', 'g'))`;

type PartyRef = { personId: string | null; companyId: string | null };
const partyId = (p: PartyRef) => (p.personId ?? p.companyId)!;
/** The party's own column, as every query below reads it (a person, or a company). */
const partyIs = (p: PartyRef) => (p.personId ? Prisma.sql`e.person_id = ${p.personId}::uuid` : Prisma.sql`e.company_id = ${p.companyId}::uuid`);

/** What the party holds on one case (null: before a case) in a currency, its whole balance, and the part of the case's
 *  money that came from cheques not yet cleared. Read under the party's lock. */
async function held(tx: Tx, firmId: string, p: PartyRef, currency: string, caseId: string | null) {
  const on = Prisma.sql`e.firm_id = ${firmId}::uuid and ${partyIs(p)} and e.currency = ${currency}::"MoneyCurrency"`, here = Prisma.sql`e.case_id is not distinct from ${caseId}::uuid`;
  const [r] = await tx.$queryRaw<{ on_case: string; whole: string; uncleared: string }[]>`select
      (select coalesce(sum(e.amount_minor), 0) from money_trust_entry e where ${on} and ${here})::text as on_case,
      coalesce((select e.balance_after_minor from money_trust_entry e where ${on} order by e.seq desc limit 1), 0)::text as whole,
      (select coalesce(sum(e.amount_minor), 0) from money_trust_entry e join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id
        where ${on} and ${here} and e.kind = 'DEPOSIT' and not p.cleared)::text as uncleared`;
  return { available: Math.max(0, Math.min(Number(r.on_case), Number(r.whole))), uncleared: Number(r.uncleared) };
}

export type ApplyArgs = { firmId: string; by: string; today: string; invoiceId: string; amountMinor: number; unclearedAcknowledged?: boolean; duplicateAcknowledged?: boolean; atIssue?: boolean;
  pick?: { caseId?: string | null; personId?: string; companyId?: string; reason: string }; payer?: PartyRef };
export type Applied = { entryId: string; invoiceId: string; amountMinor: number; currency: string; after: Facts };

/** Pay from trust: one WITHDRAWAL_TO_INVOICE on the payer's ledger, inside the caller's transaction (the route's, or FO-7b's
 *  issue step right after the number is taken). The party locks first, then the invoice row, then the reads. */
export async function applyTrust(tx: Tx, audit: AuditPort<Tx>, a: ApplyArgs): Promise<Applied> {
  const [inv] = await tx.$queryRaw<{ person_id: string | null; company_id: string | null; currency: string; case_id: string | null }[]>`
    select person_id::text, company_id::text, currency::text, case_id::text from money_invoice where firm_id = ${a.firmId}::uuid and id = ${a.invoiceId}::uuid`;
  if (!inv) return notFound("invoice");
  const own: PartyRef = { personId: inv.person_id, companyId: inv.company_id };
  const payer: PartyRef = a.payer ?? own;
  const caseId = a.pick && a.pick.caseId !== undefined ? a.pick.caseId : inv.case_id;
  for (const p of [...new Set([partyId(own), partyId(payer)])].sort()) await tx.$executeRaw`select money_trust_lock(${a.firmId}::uuid, ${p}::uuid, ${inv.currency}::"MoneyCurrency")`;
  const [row] = await tx.$queryRaw<{ issued: boolean; number: string | null; person_id: string | null; company_id: string | null; case_id: string | null }[]>`
    select issued_at is not null as issued, number, person_id::text, company_id::text, case_id::text from money_invoice where firm_id = ${a.firmId}::uuid and id = ${a.invoiceId}::uuid for update`;
  const not = a.atIssue ? " The invoice was not issued." : " Nothing was paid from trust.";   // review m5: at issue, say the issue rolled back
  if (!(await trustShows(tx, a.firmId))) refuse("TRUST_OFF", `This firm doesn't hold client money in trust, so nothing can be paid from trust.${not}`);   // break m3
  if (!row.issued) refuse("DRAFT", `Issue the invoice first: trust pays only an issued invoice.${not}`);
  // Review m4: what was read before the locks (party, case) is read again under them; a draft changed in between is refused.
  if (row.person_id !== inv.person_id || row.company_id !== inv.company_id || row.case_id !== inv.case_id) refuse("CHANGED", `This invoice changed while it was being paid from trust: try again.${not}`);
  const before = (await invoiceFacts(tx, a.firmId, a.invoiceId, a.today))!, cur = inv.currency;
  const h = await held(tx, a.firmId, payer, cur, caseId);
  if (a.amountMinor > h.available) refuse("NOT_AVAILABLE", `Only ${cur} ${MONEY(h.available)} is available.${a.atIssue ? not : ""}`, { availableMinor: h.available });
  const due = Math.max(0, before.view.dueMinor);
  if (a.amountMinor > due) refuse("OVER_DUE", `Only ${cur} ${MONEY(due)} is due on ${row.number}.${not}`, { dueMinor: due });
  // Review and break M1 (a double click): the same amount from the same payer on this invoice in the last 2 minutes,
  // read under the payer's lock, so the second of two clicks sees the first. A proper idempotency key needs a column
  // (a migration): question for the tech lead on the PR.
  const [dup] = await tx.$queryRaw<{ n: bigint }[]>`select count(*) as n from money_trust_entry e where e.firm_id = ${a.firmId}::uuid and e.invoice_id = ${a.invoiceId}::uuid and e.kind = 'WITHDRAWAL_TO_INVOICE'
    and e.amount_minor = ${-a.amountMinor}::int and ${partyIs(payer)} and e.created_at > now() - interval '2 minutes'`;
  if (dup.n > 0n && !a.duplicateAcknowledged) refuse("DUPLICATE", `${cur} ${MONEY(a.amountMinor)} was paid from trust on ${row.number} a moment ago. Pay it again?`, { acknowledge: "duplicateAcknowledged" });
  const clearedPart = Math.max(0, h.available - h.uncleared);
  if (a.amountMinor > clearedPart && !a.unclearedAcknowledged)
    refuse("UNCLEARED", `${cur} ${MONEY(Math.min(h.uncleared, a.amountMinor - clearedPart))} of this is a cheque not yet cleared. Apply anyway?`, { acknowledge: "unclearedAcknowledged" });
  const e = await tx.moneyTrustEntry.create({ data: { firmId: a.firmId, personId: payer.personId, companyId: payer.companyId, caseId, kind: "WITHDRAWAL_TO_INVOICE", amountMinor: -a.amountMinor, currency: cur as never,
    invoiceId: a.invoiceId, createdBy: a.by, ...(a.pick ? { pickedOtherFundsBy: a.by, pickedOtherFundsReason: a.pick.reason } : {}) }, select: { id: true, balanceAfterMinor: true } });
  const after = (await invoiceFacts(tx, a.firmId, a.invoiceId, a.today))!;
  await audit.record(tx, { firmId: a.firmId, actor: a.by, action: "trust_money.applied", entity: "money_trust_entry", entityKey: e.id,
    summary: `${cur} ${MONEY(a.amountMinor)} paid from trust on ${row.number}${a.pick ? " (a deliberate pick of other money)" : ""}.`,
    detail: { entryId: e.id, invoiceId: a.invoiceId, amountMinor: a.amountMinor, caseId, payerId: partyId(payer), picked: !!a.pick, dueAfterMinor: after.view.dueMinor },
    before: { dueMinor: before.view.dueMinor }, after: { dueMinor: after.view.dueMinor, balanceAfterMinor: e.balanceAfterMinor, ...(a.pick ? { pickedCaseId: caseId, pickReason: a.pick.reason } : {}) } });
  await tx.moduleEvent.create({ data: { firmId: a.firmId, type: TRUST_EVENT.TRUST_APPLIED, subjectId: e.id, payload: TrustAppliedPayload.parse({ entryId: e.id, invoiceId: a.invoiceId, personId: payer.personId, companyId: payer.companyId, caseId, amountMinor: a.amountMinor, currency: cur }) } });
  if (before.view.dueMinor > 0 && after.view.dueMinor <= 0) {
    const v = after.view;
    await tx.moduleEvent.create({ data: { firmId: a.firmId, type: MONEY_EVENT.INVOICE_PAID, subjectId: v.id, payload: InvoiceEventPayload.parse({ invoiceId: v.id, number: v.number, personId: v.personId, companyId: v.companyId, caseId: after.caseId,
      currency: v.currency, subtotalMinor: v.subtotalMinor, taxMinor: v.taxMinor, totalMinor: v.totalMinor, dueDate: v.dueDate }) } });
  }
  return { entryId: e.id, invoiceId: a.invoiceId, amountMinor: a.amountMinor, currency: cur, after };
}

export type RefundArgs = { firmId: string; by: string; today: string; holder: PartyRef; caseId: string | null; r: z.infer<typeof RefundIn>; payee: { personId?: string; companyId?: string; name?: string; reason?: string } | null };

/** A refund to the client: one REFUND_TO_CLIENT on the payer's ledger, never more than the payer holds on that case. */
export async function refundTrust(tx: Tx, audit: AuditPort<Tx>, a: RefundArgs) {
  const { r } = a, cur = r.currency, refundedOn = r.refundedOn ?? a.today;
  if (refundedOn > a.today) badField("refundedOn", "A refund is recorded once it is made: the date can't be in the future. Nothing was saved.");
  await tx.$executeRaw`select money_trust_lock(${a.firmId}::uuid, ${partyId(a.holder)}::uuid, ${cur}::"MoneyCurrency")`;
  const h = await held(tx, a.firmId, a.holder, cur, a.caseId);
  if (r.amountMinor > h.available) refuse("NOT_AVAILABLE", `Only ${cur} ${MONEY(h.available)} is available.`, { availableMinor: h.available });
  // Break m2: never dated before this case's money came in (the database checks the party's first money, any case; the
  // same one day's slack for the time zone).
  const on = Prisma.sql`e.firm_id = ${a.firmId}::uuid and ${partyIs(a.holder)} and e.currency = ${cur}::"MoneyCurrency" and e.case_id is not distinct from ${a.caseId}::uuid`;
  const [first] = await tx.$queryRaw<{ d: string | null }[]>`select to_char(min(e.created_at)::date - 1, 'YYYY-MM-DD') as d from money_trust_entry e where ${on}`;
  if (first.d && refundedOn < first.d) badField("refundedOn", "A refund is never dated before this money came into trust. Nothing was saved.");
  // Review and break M1: a trust refund can't be corrected (P-603), so the same reference twice for this payer is asked
  // first, under the payer's lock: the second of two clicks is refused (deposits' AG-6-19 warning, the same reading).
  const [dup] = await tx.$queryRaw<{ n: bigint }[]>`select count(*) as n from money_trust_entry e where e.firm_id = ${a.firmId}::uuid and ${partyIs(a.holder)} and e.kind = 'REFUND_TO_CLIENT'
    and ${refKey(Prisma.sql`e.refund_reference`)} = ${refKey(Prisma.sql`${r.reference}`)}`;
  if (dup.n > 0n && !r.duplicateReferenceAcknowledged) refuse("DUPLICATE_REFERENCE", `A trust refund with reference ${r.reference} is already recorded for this client. Record anyway?`, { acknowledge: "duplicateReferenceAcknowledged" });
  const e = await tx.moneyTrustEntry.create({ data: { firmId: a.firmId, personId: a.holder.personId, companyId: a.holder.companyId, caseId: a.caseId, kind: "REFUND_TO_CLIENT", amountMinor: -r.amountMinor, currency: cur, reason: r.reason,
    refundMethod: r.method, refundedOn: new Date(`${refundedOn}T00:00:00Z`), refundReference: r.reference, createdBy: a.by,
    payeePersonId: a.payee?.personId ?? null, payeeCompanyId: a.payee?.companyId ?? null, payeeName: a.payee?.name ?? null, payeeReason: a.payee?.reason ?? null }, select: { id: true, balanceAfterMinor: true } });
  const left = h.available - r.amountMinor;
  await audit.record(tx, { firmId: a.firmId, actor: a.by, action: "trust_money.refunded", entity: "money_trust_entry", entityKey: e.id,
    summary: `${cur} ${MONEY(r.amountMinor)} refunded from trust${a.payee ? " to another payee" : " to the payer"}.`,
    detail: { entryId: e.id, amountMinor: r.amountMinor, caseId: a.caseId, payerId: partyId(a.holder), otherPayee: !!a.payee, balanceAfterMinor: e.balanceAfterMinor },
    before: null, after: { amountMinor: r.amountMinor, currency: cur, method: r.method, refundedOn, reference: r.reference, reason: r.reason, payeePersonId: a.payee?.personId ?? null, payeeCompanyId: a.payee?.companyId ?? null, payeeName: a.payee?.name ?? null, payeeReason: a.payee?.reason ?? null } });
  await tx.moduleEvent.create({ data: { firmId: a.firmId, type: TRUST_EVENT.TRUST_REFUNDED, subjectId: e.id, payload: TrustRefundedPayload.parse({ entryId: e.id, personId: a.holder.personId, companyId: a.holder.companyId, caseId: a.caseId, amountMinor: r.amountMinor, currency: cur }) } });
  return { entryId: e.id, amountMinor: r.amountMinor, currency: cur, balanceMinor: left };   // balanceMinor: what the payer still holds on that case (review m8)
}
