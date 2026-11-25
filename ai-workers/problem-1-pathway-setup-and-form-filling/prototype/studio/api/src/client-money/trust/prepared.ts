// R1.60 part a2 (product/screens/R1.60/rules.md R6, R7, R9, R10, R11, R17, B5, B7, B9; AG-6-61 §5.4-§5.6, §5.11, §6, §8):
// what a person does with a deposit request a signed retainer prepared (part a1, on-signed.ts).
// * The PREPARED list (GET /trust/requests?state=PREPARED): every holder of agent/payment:record sees the prepared
//   requests they may see (C5, MoneyVisibilityPort; gap G1: no port lists key holders, so a list, not an item each).
// * Send (B5): the request takes the firm's next DR- number (the database's, at send) and is emailed to the client with
//   the amount including the estimated tax and the trust payment details; no card is offered (B9: no trust card
//   account, P-567 (3)); the no-login pay link waits for gap G4. Refused with "Add your trust payment details" while
//   the block is empty, and it stays prepared (B7, R7). Refused while its retainer version is no longer signed (R17,
//   gap G5: RetainerVersionSignedPort), which says why and offers Cancel with a reason; nothing cancels by itself.
// * Edit amount (R10, author default D7): only while prepared; the deposit and the estimated tax are typed again in
//   whole cents (the currency stays), with one audit line naming before and after.
// * Don't send (R11) is #3033's cancel (POST /trust/requests/:id/cancel, a reason required): a prepared request is
//   cancelled with no number and keeps its version (B4).
// Every route reads its C5 scope and the retainer's signed state before its transaction (the r9-M1 shape: never a
// second connection inside it). Legal reading: Unconfirmed: no counsel. Wording and figures: Sample.
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { MINOR_MAX } from "../../../../ports/client-money.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { MoneyVisibility } from "../../../../ports/money-visibility.ts";
import type { RetainerVersionSignedPort } from "../../../../ports/retainer-signed.ts";
import { firmScope, ownFirm } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { SYSTEM_REPLY_TO } from "../../platform/identity/session/mail.ts";
import { MONEY, UUID, notFound, parse } from "../invoices/drafts.ts";
import { dayOf } from "../invoices/facts.ts";
import { trustShows } from "../reads/common.ts";
import { trustSubject, trustText } from "./documents.ts";
import { partyOf } from "./service.ts";

type Tx = Prisma.TransactionClient;
const cents = (what: string, min: number) => z.number({ error: `${what} (in cents) must be a whole number.` }).int(`${what} (in cents) must be a whole number.`).min(min, min ? `${what} is at least 1 cent.` : `${what} is 0 or more.`).max(MINOR_MAX, `${what} is at most ${MONEY(MINOR_MAX)}.`);
export const AmountIn = z.strictObject({ amountMinor: cents("The deposit", 1), estimatedTaxMinor: cents("The estimated tax", 0) });
export const ListIn = z.strictObject({ state: z.literal("PREPARED", { error: "Only state=PREPARED is listed here." }) });
const refuse = (code: string, detail: string): never => problem(409, "Not possible now", detail, { code });
export const NO_DETAILS = "Add your trust payment details in the payment settings first. This request stays prepared: nothing was sent.";
export const NOT_SIGNED = "This retainer is no longer signed. Cancel this request with a reason, or sign the retainer again. Nothing was sent.";

type Row = { id: string; number: string | null; amount: number; tax: number | null; currency: string; purpose: string; prepared: boolean; sent: boolean; cancelled: boolean;
  version: string | null; caseId: string | null; personId: string | null; companyId: string | null };
const seenBy = (s: MoneyVisibility, r: Pick<Row, "caseId" | "personId" | "companyId">) => (r.caseId ? s.cases.includes(r.caseId) : s.parties.includes((r.personId ?? r.companyId) ?? ""));

export class PreparedRequests {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort, private readonly mail: MailPort | null,
    private readonly scopeOf: (ctx: StaffContext) => Promise<MoneyVisibility>, private readonly signed: RetainerVersionSignedPort) {}

  /** GET /trust/requests?state=PREPARED: the prepared requests this person may see, oldest first. */
  async list(ctx: StaffContext, query: unknown) {
    parse(ListIn, query);
    const f = firmScope(ctx.firmId).firmId, seen = await this.scopeOf(ctx);
    if (!(await trustShows(this.db, f))) notFound("trust record");
    const rows = await this.db.$queryRaw<(Row & { preparedAt: Date })[]>`select id::text, number, amount_minor as amount, estimated_tax_minor as tax, currency::text, purpose, retainer_version_id::text as version,
        case_id::text as "caseId", person_id::text as "personId", company_id::text as "companyId", prepared_at as "preparedAt"
      from money_trust_request where firm_id = ${f}::uuid and prepared_at is not null and sent_at is null and cancelled_at is null order by prepared_at, id`;
    return { items: rows.filter((r) => seenBy(seen, r)).map((r) => ({ id: r.id, status: "Prepared", amountMinor: r.amount, estimatedTaxMinor: r.tax ?? 0, totalMinor: r.amount + (r.tax ?? 0),
      currency: r.currency, purpose: r.purpose, personId: r.personId, companyId: r.companyId, caseId: r.caseId, retainerVersionId: r.version, preparedAt: r.preparedAt.toISOString() })) };
  }

  /** POST /trust/requests/:id/send. */
  async send(ctx: StaffContext, requestId: string) {
    const rid = this.idOf(requestId), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const seen = await this.scopeOf(ctx);
    const first = await this.row(this.db, f, rid, seen);
    this.mustBePrepared(first);
    // R17 (gap G5): read before the transaction (a second connection is never opened inside it).
    if (!first.version || !(await this.signed.versionSigned(f, first.version))) refuse("RETAINER_NOT_SIGNED", NOT_SIGNED);
    const done = await this.write(async (tx) => {
      const r = await this.row(tx, f, rid, seen, true);
      this.mustBePrepared(r);
      const s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(f), select: { trustAnswer: true, trustDetails: true } });
      if (s?.trustAnswer !== "YES") refuse("TRUST_OFF", "This firm no longer takes money into trust: this request can't be sent. Cancel it with a reason. Nothing was sent.");
      const details = s.trustDetails?.trim() || null;
      if (!details) refuse("NO_TRUST_DETAILS", NO_DETAILS);   // B7, R7: it stays PREPARED
      await tx.moneyTrustRequest.update({ where: { firmId_id: { firmId: f, id: rid } }, data: { sentAt: this.clock.now(), sentBy: by } });
      const [sent] = await tx.$queryRaw<{ number: string; sentAt: Date }[]>`select number, sent_at as "sentAt" from money_trust_request where firm_id = ${f}::uuid and id = ${rid}::uuid`;
      const total = r.amount + (r.tax ?? 0);
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust.request_sent", entity: "money_trust_request", entityKey: rid,
        summary: `Deposit request ${sent.number} sent: ${r.currency} ${MONEY(total)} including ${MONEY(r.tax ?? 0)} estimated tax.`,
        detail: { trustRequestId: rid, retainerVersionId: r.version }, before: { status: "Prepared", number: null }, after: { status: "Sent", number: sent.number, totalMinor: total } });
      return { ...r, ...sent, details, total };
    });
    // The email after the commit; it never undoes the send (as #3033's request).
    const who = await partyOf(this.db, f, done.personId ? { personId: done.personId } : { companyId: done.companyId! });
    const firmName = (await this.db.platformFirm.findFirst({ where: ownFirm(f), select: { operatingName: true } }))?.operatingName ?? "";
    const data = { firmName, number: done.number, sentOn: dayOf(done.sentAt), party: who.name, currency: done.currency,
      amount: `${MONEY(done.total)} (including ${done.currency} ${MONEY(done.tax ?? 0)} estimated tax)`, purpose: done.purpose, trustDetails: done.details };
    return { id: rid, number: done.number, status: "Sent", totalMinor: done.total, email: await this.email(f, who, data, `trust-request:${rid}`) };
  }

  /** PUT /trust/requests/:id/amount: Edit amount, only while prepared (D7). */
  async editAmount(ctx: StaffContext, requestId: string, body: unknown) {
    const rid = this.idOf(requestId), a = parse(AmountIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    if (a.amountMinor + a.estimatedTaxMinor > MINOR_MAX) problem(422, "Check the amounts", `The deposit with its estimated tax is at most ${MONEY(MINOR_MAX)}. Nothing was saved.`, { code: "TOO_LARGE" });
    const seen = await this.scopeOf(ctx);
    return this.write(async (tx) => {
      const r = await this.row(tx, f, rid, seen, true);
      if (r.sent && !r.cancelled) refuse("SENT", `${r.number} is sent: its amount stays. Cancel it with a reason and prepare another if it is wrong. Nothing was saved.`);
      this.mustBePrepared(r);
      if (r.amount === a.amountMinor && (r.tax ?? 0) === a.estimatedTaxMinor) return { id: rid, status: "Prepared", amountMinor: r.amount, estimatedTaxMinor: r.tax ?? 0, changed: false };
      await tx.moneyTrustRequest.update({ where: { firmId_id: { firmId: f, id: rid } }, data: { amountMinor: a.amountMinor, estimatedTaxMinor: a.estimatedTaxMinor } });
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust.request_amount_edited", entity: "money_trust_request", entityKey: rid,
        summary: `Deposit request amount edited: ${r.currency} ${MONEY(r.amount)} + ${MONEY(r.tax ?? 0)} → ${MONEY(a.amountMinor)} + ${MONEY(a.estimatedTaxMinor)} estimated tax.`,
        detail: { trustRequestId: rid }, before: { amountMinor: r.amount, estimatedTaxMinor: r.tax ?? 0 }, after: { amountMinor: a.amountMinor, estimatedTaxMinor: a.estimatedTaxMinor } });
      return { id: rid, status: "Prepared", amountMinor: a.amountMinor, estimatedTaxMinor: a.estimatedTaxMinor, changed: true };
    });
  }

  // ------------------------------------------------------------------------------------------------- helpers
  private idOf(v: string) { return UUID.test(v) ? v.toLowerCase() : notFound("trust request"); }
  /** The request, 404 unless trust shows and the caller sees it (C5, fail closed: an unseen one reads as missing). */
  private async row(tx: Tx | PrismaClient, f: string, rid: string, seen: MoneyVisibility, lock = false): Promise<Row> {
    if (!(await trustShows(tx, f))) notFound("trust request");
    const [r] = lock
      ? await tx.$queryRaw<Row[]>`select id::text, number, amount_minor as amount, estimated_tax_minor as tax, currency::text, purpose, prepared_at is not null as prepared, sent_at is not null as sent, cancelled_at is not null as cancelled,
          retainer_version_id::text as version, case_id::text as "caseId", person_id::text as "personId", company_id::text as "companyId" from money_trust_request where firm_id = ${f}::uuid and id = ${rid}::uuid for update`
      : await tx.$queryRaw<Row[]>`select id::text, number, amount_minor as amount, estimated_tax_minor as tax, currency::text, purpose, prepared_at is not null as prepared, sent_at is not null as sent, cancelled_at is not null as cancelled,
          retainer_version_id::text as version, case_id::text as "caseId", person_id::text as "personId", company_id::text as "companyId" from money_trust_request where firm_id = ${f}::uuid and id = ${rid}::uuid`;
    if (!r || !seenBy(seen, r)) return notFound("trust request");
    return r;
  }
  private mustBePrepared(r: Row) {
    if (r.cancelled) refuse("CANCELLED", `${r.number ?? "This request"} is cancelled. Nothing was changed.`);
    if (r.sent) refuse("ALREADY_SENT", `${r.number} is already sent. Nothing was changed.`);
    if (!r.prepared) refuse("NOT_PREPARED", "This request was not prepared by a signed retainer: it is sent from the trust request form. Nothing was changed.");
  }
  /** One writing transaction; a rule the database refused (its own words) is a 409, never a 500. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e && typeof (e as { getStatus?: unknown }).getStatus === "function") throw e;
      const said = /money_[a-z_]+: ([^\n]{1,300})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].replace(/\s*\(.*$/, "")}. Nothing was saved.`) : Promise.reject(e);
    }
  }
  /** One email to the client, no Cc, no card and no pay link (B9; G4). Never throws: the request is already sent. */
  private async email(f: string, who: { email: string | null }, data: Record<string, string>, idempotencyKey: string): Promise<"SENT" | "NO_ADDRESS" | "NOT_SENT"> {
    try {
      if (!who.email) return "NO_ADDRESS";
      if (!this.mail) return "NOT_SENT";
      await this.mail.send({ firmId: f, to: who.email, replyTo: SYSTEM_REPLY_TO, class: "TRANSACTIONAL", templateKey: "client_money.trust_request", idempotencyKey,
        subject: trustSubject("client_money.trust_request", data), text: trustText("client_money.trust_request", data) });
      return "SENT";
    } catch { return "NOT_SENT"; }
  }
}
