// R1.60 part a1 (product/screens/R1.60/rules.md R1-R6, R8, R16, B1-B6; AG-6-61 §5.1-§5.7, §6, §9, §13; MS-D6,
// MS-D21(4); Lead 19's ruling and corrections on #3371, Lead 4's approval of the shape, 25 Nov): a signed retainer
// version prepares one trust deposit request, never an invoice.
// * Trigger: the front office's signed-version call (ports/retainer-signed.ts), in the signing's own transaction, for an
//   e-signature by every signer and the firm, or a paper signature (B2). A consultation agreement prepares nothing (B3).
// * Conditions (B1): the firm's trust answer is YES, and the version's FIRST fee row is "On signing" with an amount
//   above zero. Otherwise nothing is written: the row is billed later by Bill this (Ready to bill, R15).
// * Amount (R4): the deposit row as signed (the version's own rows, never a draft), in its currency (CAD or USD);
//   the estimated tax is the Bill-to province's GST/HST (P-701) on it, rounded once by FO-7b's line rule (taxForLine),
//   stored apart (estimated_tax_minor). Not registered for tax, or no province: 0.
// * Holder (R5): the retainer's client, the person or the company. No retainer names a case on main, so no case is set
//   (the case lead's item, gap G1, joins when a retainer of a case exists: part b).
// * Ask me first (R6, gap G2: no Automatic messages row on main, so every firm is ASK_FIRST): the request is PREPARED,
//   has no DR- number, and nothing is emailed. One Needs you item goes to the representative, the file owner before a
//   case exists (NotificationPort; ids only).
// * Once per version (B4, R8): the partial unique index on (firm_id, retainer_version_id) holds it, a cancelled request
//   keeping its version; a second call for the same version writes nothing (no audit line, no item).
// * Audit (R16): one `trust.request_prepared` line; the signing's own event row stays the transaction's last write.
// The signing never fails because of this: the caller runs it in a savepoint (front-office/retainers/signed-hooks.ts).
// Legal reading (a deposit is money held in trust, never an earned fee): Unconfirmed: no counsel. Tax: Sample.
import type { Prisma } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { MINOR_MAX, MoneyCurrency } from "../../../../ports/client-money.ts";
import { NOTIFICATION_KIND, type NotificationPort } from "../../../../ports/notifications.ts";
import type { RetainerSigned } from "../../../../ports/retainer-signed.ts";
import { billToProvince } from "../invoices/bill-to.ts";
import { MONEY } from "../invoices/drafts.ts";
import { taxForLine } from "../invoices/tax-round.ts";
import { taxDefault } from "../tax/defaults.ts";

type Tx = Prisma.TransactionClient;
export const DEPOSIT_LISTENER = "client-money.deposit-request";
export type DepositMode = "ASK_FIRST" | "SEND_AUTOMATICALLY" | "OFF";
/** Gap G2 (ruled, Lead 19): the Automatic messages row "Deposit request" (AG-12-127, AG12-D21) is not on main, so
 *  every firm is Ask me first (AG-6-61 §10, AG16-76's default) until that row adds the setting. */
export const depositRequestMode = (_firmId: string): DepositMode => "ASK_FIRST";

export type DepositDeps = { audit: AuditPort<Tx>; notifications: NotificationPort<Tx> | null };
export type Prepared = { id: string; amountMinor: number; estimatedTaxMinor: number; currency: string } | null;

/** Why nothing is prepared, in words for a test and a log; null when a request is due. */
export function notDue(signed: RetainerSigned, trustAnswer: string | null): string | null {
  if (signed.kind !== "RETAINER") return "not a retainer";
  if (trustAnswer !== "YES") return "trust is not on";
  const first = signed.fees[0];
  if (!first || first.when !== "ON_SIGNING") return "the first row is not On signing";
  if (first.amountMinor === null || BigInt(first.amountMinor) <= 0n) return "the deposit row has no amount";
  if (!signed.personId === !signed.companyId) return "no single client";
  return null;
}

/** Not a request we can hold (a currency trust does not take, or more than one request holds): said once, by name. */
async function notPrepared(tx: Tx, deps: DepositDeps, firmId: string, signed: RetainerSigned, why: string): Promise<null> {
  await deps.audit.record(tx, { firmId, actor: signed.actor, action: "trust.request_not_prepared", entity: "fo_retainer_version", entityKey: signed.retainerVersionId,
    summary: `No deposit request prepared: the deposit row "${signed.fees[0].label}" is signed, but ${why}. Bill it by hand.`, detail: { retainerId: signed.retainerId, retainerVersionId: signed.retainerVersionId, reason: why }, before: null, after: null });
  return null;
}

/** The listener: prepares the version's deposit request when it is due. Returns it, or null when nothing was written. */
export async function prepareDepositOnSigning(tx: Tx, deps: DepositDeps, firmId: string, signed: RetainerSigned): Promise<Prepared> {
  if (depositRequestMode(firmId) === "OFF") return null;
  const [facts] = await tx.$queryRaw<{ answer: string | null; registered: boolean | null; address: unknown }[]>`
    select s.trust_answer::text as answer, s.tax_registered as registered, f.business_address as address
      from platform_firm f left join money_payment_settings s on s.firm_id = f.id where f.id = ${firmId}::uuid`;
  if (notDue(signed, facts?.answer ?? null)) return null;
  const row = signed.fees[0], amount = BigInt(row.amountMinor!), currency = MoneyCurrency.safeParse(row.currency);
  const by = signed.actor;
  if (!currency.success) return notPrepared(tx, deps, firmId, signed, `its currency ${row.currency} is not one trust takes (CAD or USD)`);
  if (amount > BigInt(MINOR_MAX)) return notPrepared(tx, deps, firmId, signed, "its amount is more than one request can hold");
  const amountMinor = Number(amount);
  const party = signed.personId ? { kind: "PERSON" as const, id: signed.personId } : { kind: "COMPANY" as const, id: signed.companyId! };
  const tax = taxDefault({ firmProvince: billToProvince({ businessAddress: facts?.address ?? null }, party, null), registered: facts?.registered === true });
  const estimatedTaxMinor = taxForLine(amountMinor, tax.ratePpm);
  if (amountMinor + estimatedTaxMinor > MINOR_MAX) return notPrepared(tx, deps, firmId, signed, "its amount with the estimated tax is more than one request can hold");   // break a1 m4
  const [text] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${`Deposit on signing: ${row.label}`}, 500) as ok`;
  const purpose = text?.ok ? `Deposit on signing: ${row.label}` : "Deposit on signing";
  // B4: one per version; ON CONFLICT on the partial index's own predicate writes nothing for a version already holding
  // one (sent, prepared or cancelled). The trigger takes prepared_at from the database's clock and checks trust is on.
  const made = await tx.$queryRaw<{ id: string }[]>`
    insert into money_trust_request (firm_id, person_id, company_id, case_id, amount_minor, currency, purpose, created_by, retainer_version_id, prepared_at, estimated_tax_minor, updated_at)
    values (${firmId}::uuid, ${signed.personId}::uuid, ${signed.companyId}::uuid, null, ${amountMinor}, ${currency.data}::"MoneyCurrency", ${purpose}, ${by}, ${signed.retainerVersionId}::uuid, now(), ${estimatedTaxMinor}, now())
    on conflict (firm_id, retainer_version_id) where retainer_version_id is not null do nothing
    returning id::text as id`;
  if (!made.length) return null;   // R8: a second call for this version is a quiet no-op
  const id = made[0].id;
  await deps.audit.record(tx, { firmId, actor: by, action: "trust.request_prepared", entity: "money_trust_request", entityKey: id,
    summary: `Deposit request prepared (Ask me first): ${currency.data} ${MONEY(amountMinor)} + ${MONEY(estimatedTaxMinor)} estimated ${tax.taxName ?? "tax"}, from the signed retainer (version ${signed.version}). Not sent: a person sends it.`,
    detail: { trustRequestId: id, retainerId: signed.retainerId, retainerVersionId: signed.retainerVersionId, via: signed.via, mode: "ASK_FIRST" }, before: null,
    after: { status: "Prepared", personId: signed.personId, companyId: signed.companyId, amountMinor, estimatedTaxMinor, currency: currency.data, taxSource: tax.source } });
  if (deps.notifications) await deps.notifications.notify(tx, { staffId: signed.representativeStaffId }, NOTIFICATION_KIND.DEPOSIT_REQUEST_PREPARED, { kind: "trust-request", id });
  return { id, amountMinor, estimatedTaxMinor, currency: currency.data };
}
