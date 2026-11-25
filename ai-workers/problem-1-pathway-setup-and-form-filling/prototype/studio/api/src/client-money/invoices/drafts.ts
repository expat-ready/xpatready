// FO-7b part 1a (QA-482; R1.59; brief build-lead-c-briefs/FO-7b-1a.md, with FO-7b.md's rules and the rulings of 18 Nov):
// draft invoices and their lines. Every input goes through a zod parse (ports/client-money.ts; 422 at the field, PF-28 part 6). The
// route computes each line's amount and its tax with taxForLine (per line, half to even); a tax sent by the client is
// ignored; the rate is the firm's tax default (FO-7g part 1w: taxDefault through lineRatePpm, province by billToProvince); a government fee's tax is 0; the total is money_invoice_total, the sum of the stored lines. A line in another
// currency is refused with 422 in plain words before the database's own trigger sees it. While the firm has "Prices
// include tax" on, no draft is made or added to (until FO-7g part 2). Firm-scoped (PF-12's walls and firmScope): another
// firm's invoice or client is 404. Each write is one transaction with one audit line through AuditPort (fail-closed).
import { HttpException } from "@nestjs/common";
import { MoneyLineKind, Prisma, type PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { systemClock, type ClockPort } from "../../../../ports/clock.ts";
import { BillToIn, DraftIn, type InvoiceView, LineIn, MINOR_MAX } from "../../../../ports/client-money.ts";
import { problemFromZod } from "../../../../contracts/programs.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../platform/http/input.ts";
import { holdsKey } from "../../platform/identity/catalogue.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { dayOf, invoiceFacts } from "./facts.ts";
import { lineRatePpm, provinceCode, taxDefault } from "../tax/defaults.ts";
import { billToProvince, type BillToParty } from "./bill-to.ts";
import { failClosed, invoiceInScope, partyInScope, type MoneyScope, type ScopeOf } from "../reads/visibility.ts";
import { taxForLine } from "./tax-round.ts";
import { liveParty } from "../live-party.ts";
import { SIGNED_STATES, type RetainerFeeRow, type RetainerFeesPort } from "../../../../ports/retainer-fees.ts";

type Tx = Prisma.TransactionClient;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Minor units as "1,234.56", from the integer's digits (no float). */
export const MONEY = (n: number) => { const s = String(n).padStart(3, "0"); return `${s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${s.slice(-2)}`; };

/** PF-28 part 6 (R1.10, Lead B rev 17.21): a field error is FIELD_ERROR_STATUS (422) with `fields` naming each field in
 *  the one rule's words (an unknown one included), the money schemas' own `errors` list and words kept. A body that is not
 *  an object (a list, a number) is refused by its shape, "body: This must be an object.", never read as {}. */
export const parse = <S extends z.ZodType>(schema: S, input: unknown): z.infer<S> => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) badField("body", "This must be an object.");
  if (Object.hasOwn(input as object, "__proto__")) badField("__proto__", "This field is not allowed here.");   // never a field of ours (the one rule's break m2), in the money shape
  const r = schema.safeParse(input);
  if (!r.success) {
    // zod's own words name an unknown key in full: each message is cut, as the one rule cuts a name (its break m3).
    const p = problemFromZod(r.error), errors = (p.errors ?? []).map((e) => ({ field: e.field.slice(0, 64), message: e.message.slice(0, 200) }));
    throw new HttpException({ ...p, detail: errors.map((e) => e.message).join(" ").slice(0, 600), errors: errors.slice(0, 20), status: FIELD_ERROR_STATUS, code: "INVALID", fields: fieldsOf(r.error) }, FIELD_ERROR_STATUS);
  }
  return r.data;
};
/** A field error naming one field (FIELD_ERROR_STATUS), in the same shape as a zod refusal. */
export const badField = (field: string, message: string): never => {
  throw new HttpException({ type: "https://expatready.local/problems/validation", title: "Some details need fixing", status: FIELD_ERROR_STATUS, detail: message, code: "INVALID", errors: [{ field, message }], fields: { [field]: message } }, FIELD_ERROR_STATUS);
};
export const notFound = (what: string): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });

/** Adding to a draft someone else started needs this key (AG-06 C5: "Edit a DRAFT invoice"); one's own draft, :create. */
export const EDIT_KEY = "agent/invoice:edit";
/** A rate in parts per million as a person reads it ("13 %", "9.975 %"), from the integer's digits (no float). */
const percent = (ppm: number) => { const whole = Math.trunc(ppm / 10_000), rest = String(ppm % 10_000).padStart(4, "0").replace(/0+$/, ""); return `${whole}${rest ? `.${rest}` : ""} %`; };

export class InvoiceDrafts {
  /** `tax` is the one rule (taxForLine); a test passes a planted wrong rule to prove its cases catch it, never the app. */
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly tax: (amountMinor: number, ratePpm: number) => number = taxForLine, private readonly clock: ClockPort = systemClock,
    private readonly scopeOf: ScopeOf = failClosed,   // C5 (#3305 M1): the app binds PgMoneyVisibility; fail closed otherwise
    private readonly retainers: RetainerFeesPort<Tx> | null = null) {}   // FO-7w1: the front office's RetainerFeesPort (the app binds its adapter)

  /** C5 on an existing invoice (reads/visibility.ts invoiceInScope): out of scope is the same 404, before any write. */
  private async seen(tx: Tx, ctx: StaffContext, id: string, scope: MoneyScope) { await invoiceInScope(tx, firmScope(ctx.firmId).firmId, id, scope); }

  /** POST /api/front-office/money/invoices. */
  async create(ctx: StaffContext, body: unknown): Promise<InvoiceView> {
    const d = parse(DraftIn, body);
    const scope = await this.scopeOf(ctx);   // C5 scope read before the transaction: a write never holds two connections (Lead 14, #3321 (4))
    return this.db.$transaction(async (tx) => {
      const settings = await this.settingsOrRefuse(tx, ctx.firmId);
      const client = d.personId
        ? await tx.foPerson.findFirst({ where: firmScope(ctx.firmId, { id: d.personId.toLowerCase() }), select: { id: true } })
        : await tx.foCompany.findFirst({ where: firmScope(ctx.firmId, { id: d.companyId!.toLowerCase() }), select: { id: true } });
      // C5 (Lead 14, #3321 (2)): a party outside the caller's scope is the same 404 as a missing one, before anything is written
      if (!client || !partyInScope(scope, client.id)) notFound(d.personId ? "person" : "company");
      await liveParty(tx, ctx.firmId, client!.id, scope);   // FO-9b part 2m: never a draft on a merged-away client (held FOR KEY SHARE)
      // FO-7w1 (break m4): a retainer's fee rows are CAD only (fo_retainer_fee_row_currency_check), so a draft from one
      // with no currency sent is CAD, never the firm's default (a USD default would refuse every row at a field not sent).
      const currency = d.currency ?? (d.retainerId ? "CAD" : settings.defaultCurrency);
      // FO-7g part 3 (P-797): the Bill-to province starts as the client's Canadian address, else the firm's province, as a
      // code (null while the firm's province is not one of the 13: the tax default then warns, never guesses).
      const [firm] = await tx.$queryRaw<{ address: unknown }[]>`select business_address as address from platform_firm where id = ${firmScope(ctx.firmId).firmId}::uuid`;
      const party: NonNullable<BillToParty> = d.personId ? { kind: "PERSON", id: client!.id } : { kind: "COMPANY", id: client!.id };
      const billTo = provinceCode(billToProvince({ businessAddress: firm?.address ?? null }, party));
      const rows = d.retainerId ? await this.retainerRows(tx, ctx.firmId, d, party, currency) : null;   // FO-7w1, before anything is written
      // Break m1: nothing left to bill is a refusal, never an empty draft (a double click or a reload made one each time).
      if (rows && !rows.length) problem(409, "Not possible now", "Nothing to bill from this retainer: every fee with an amount is already on an invoice, and a deposit (\"On signing\") is billed only when named. Nothing was saved.", { code: "NOTHING_TO_BILL" });
      const deposit = !!rows?.some((r) => r.when === "ON_SIGNING");
      const inv = await tx.moneyInvoice.create({ data: { firmId: firmScope(ctx.firmId).firmId, personId: d.personId ? client!.id : null, companyId: d.companyId ? client!.id : null, currency, billToProvince: billTo, deposit, createdBy: `staff:${ctx.staffId}` }, select: { id: true } });
      const lines = rows ? await this.copyRows(tx, ctx.firmId, inv.id, currency, party, billTo, firm?.address ?? null, rows) : [];
      const from: Record<string, string | boolean | string[]> = d.retainerId ? { retainerId: d.retainerId.toLowerCase(), feeRowIds: rows!.map((r) => r.id), deposit } : {};
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "invoice.draft_created", entity: "money_invoice", entityKey: inv.id,
        summary: d.retainerId ? `Draft invoice started in ${currency} from a signed retainer, with ${lines.length} fee line${lines.length === 1 ? "" : "s"}${deposit ? " (a deposit)" : ""}.` : `Draft invoice started in ${currency}.`, detail: { invoiceId: inv.id, currency, ...from },
        before: null, after: { personId: d.personId ? client!.id : null, companyId: d.companyId ? client!.id : null, currency, billToProvince: billTo, status: "DRAFT", ...(d.retainerId ? { deposit, lineSourceFeeRowIds: lines.map((l) => l.sourceFeeRowId), lineAmountsMinor: lines.map((l) => l.amountMinor), lineTaxMinor: lines.map((l) => l.taxMinor) } : {}) } });   // R1.8 (QA-594): the draft as created
      return this.view(tx, ctx.firmId, inv.id);
    });
  }

  /** POST /api/front-office/money/invoices/:id/lines. The invoice row is locked first, so two lines added at once take
   *  positions one after the other and the total stays the sum of both. */
  async addLine(ctx: StaffContext, invoiceId: string, body: unknown): Promise<InvoiceView> {
    if (!UUID.test(invoiceId)) notFound("invoice");   // PF-28 part 6: a malformed id is the one not-found, before the body
    const l = parse(LineIn, body);
    const amountMinor = l.quantity * l.unitMinor;
    if (amountMinor > MINOR_MAX) badField("unitMinor", `The line's amount (quantity × unit amount) is more than one line can hold (${MONEY(MINOR_MAX)}). Nothing was saved.`);
    // FO-7g part 1w: the rate is never the client's. A sent ratePpm only says "taxable" (the default) or "not taxable" (0);
    // nothing sent is the default (LineIn defaults an absent rate to 0, so the body is asked whether it sent one).
    const sentRate = Object.hasOwn(body as object, "ratePpm") && (body as Record<string, unknown>).ratePpm !== undefined;   // undefined is "not sent" (break m2)
    if (l.kind === "GOVERNMENT_FEE" && sentRate && l.ratePpm !== 0) badField("ratePpm", "A government fee is never taxed: send no rate, or 0. Nothing was saved.");   // AG-6-4 rule 3, no override
    const scope = await this.scopeOf(ctx);   // C5 scope read before the transaction: a write never holds two connections (Lead 14, #3321 (4))
    return this.db.$transaction(async (tx) => {
      await this.settingsOrRefuse(tx, ctx.firmId);
      const firmId = firmScope(ctx.firmId).firmId, id = invoiceId.toLowerCase();
      await this.seen(tx, ctx, id, scope);   // C5 before the row lock and any write (review m2)
      const [inv] = await tx.$queryRaw<{ currency: string; issued: boolean; by: string; personId: string | null; companyId: string | null; billTo: string | null }[]>`select currency::text as currency, issued_at is not null as issued, created_by as by, person_id::text as "personId", company_id::text as "companyId", bill_to_province as "billTo" from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid for update`;
      if (!inv) return notFound("invoice");
      await liveParty(tx, firmId, inv.personId ?? inv.companyId, scope);   // FO-9b part 2m (break m3): never a line on a merged-away client's draft
      if (inv.by !== `staff:${ctx.staffId}` && !(await holdsKey(tx, firmId, ctx.staffId, EDIT_KEY)))
        problem(403, "Not allowed", "Only the person who started this draft, or someone who may edit invoices, can add to it. Nothing was saved.", { code: "MISSING_PERMISSION", missing: [EDIT_KEY] });
      if (inv.issued) problem(409, "Not possible now", "This invoice is issued: it can't be edited. Use a credit note. Nothing was saved.", { code: "ISSUED" });
      // The tax default (FO-7g part 1): the firm's tax_registered and its province, read in one statement (one snapshot),
      // after the lock; the province through billToProvince (P-797). Only this firm's row is read.
      // "Prices include tax" is asked again here, in the same statement, so a change made while this line waited on the lock
      // is never taxed on top (break m1; the ruling of 18 Nov).
      const [facts] = await tx.$queryRaw<{ registered: boolean | null; inclusive: boolean | null; address: unknown }[]>`select s.tax_registered as registered, s.prices_include_tax as inclusive, f.business_address as address from platform_firm f left join money_payment_settings s on s.firm_id = f.id where f.id = ${firmId}::uuid`;
      if (facts?.inclusive) problem(409, "Not possible now", "Prices that include tax come later: this firm has \"Prices include tax\" on, so an invoice can't be drafted yet. Nothing was saved.", { code: "PRICES_INCLUDE_TAX" });
      const dflt = taxDefault({ firmProvince: billToProvince({ businessAddress: facts?.address ?? null }, inv.personId ? { kind: "PERSON", id: inv.personId } : inv.companyId ? { kind: "COMPANY", id: inv.companyId } : null, inv.billTo), registered: facts?.registered === true });
      if (l.kind !== "GOVERNMENT_FEE" && sentRate && l.ratePpm !== 0 && l.ratePpm !== dflt.ratePpm)
        badField("ratePpm", dflt.ratePpm === 0
          ? "This firm adds no tax to this line (not registered for tax, or its province isn't set): send no rate, or 0. Nothing was saved."
          : `The tax rate comes from this invoice's Bill-to province (${dflt.taxName} ${percent(dflt.ratePpm)}): send no rate, or ${dflt.ratePpm} (parts per million), for taxable, or 0 for not taxable. Nothing was saved.`);
      const ratePpm = lineRatePpm({ kind: l.kind, taxable: l.kind === "GOVERNMENT_FEE" ? undefined : !(sentRate && l.ratePpm === 0) }, dflt);
      const taxMinor = this.tax(amountMinor, ratePpm);
      if (l.currency && l.currency !== inv.currency) badField("currency", `This invoice is in ${inv.currency}; a line in ${l.currency} can't be added. Nothing was saved.`);
      // The database's own text rule, asked first, so a description it would refuse is a 422 at the field, never a 500.
      const [text] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${l.description}, 500) as ok`;
      if (!text?.ok) badField("description", "The description needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was saved.");
      const last = await tx.moneyInvoiceLine.aggregate({ where: firmScope(ctx.firmId, { invoiceId: id }), _max: { position: true } });
      const position = (last._max.position ?? 0) + 1;
      if (position > 500) problem(409, "Not possible now", "An invoice holds at most 500 lines. Nothing was saved.", { code: "TOO_MANY_LINES" });
      const line = await tx.moneyInvoiceLine.create({ data: { firmId, invoiceId: id, position, kind: l.kind, description: l.description, quantity: l.quantity, unitAmountMinor: l.unitMinor, amountMinor, taxRatePpm: ratePpm, taxMinor, currency: inv.currency as "CAD" | "USD" }, select: { id: true } });
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "invoice.line_added", entity: "money_invoice_line", entityKey: line.id,
        summary: `Line ${position} added to a draft invoice: ${inv.currency} ${MONEY(amountMinor)}, tax ${MONEY(taxMinor)}.`, detail: { invoiceId: id, position, kind: l.kind, amountMinor, ratePpm, taxMinor },
        before: null, after: { position, kind: l.kind, description: l.description, quantity: l.quantity, unitAmountMinor: l.unitMinor, amountMinor, taxRatePpm: ratePpm, taxMinor, currency: inv.currency } });   // R1.8 (QA-594): the line as added
      return this.view(tx, ctx.firmId, id);
    });
  }

  /** PUT /api/front-office/money/invoices/:id/bill-to (agent/invoice:edit, AG-6-4 §8): the province the draft's tax
   *  follows (FO-7g part 3, P-797), one of the 13 codes. Lead B's read on #3156: in the same transaction, every line taxed
   *  at the old Bill-to's default is re-rated to the new default with taxForLine (a line at 0 %, a government fee and a
   *  line at any other rate stay as they are), and the one audit line carries both rates, how many lines were re-rated and their tax before and after. New
   *  lines take the new default. An issued invoice's is fixed (409, and the database's gate). */
  async setBillTo(ctx: StaffContext, invoiceId: string, body: unknown): Promise<InvoiceView> {
    if (!UUID.test(invoiceId)) notFound("invoice");
    const b = parse(BillToIn, body);
    const scope = await this.scopeOf(ctx);   // C5 scope read before the transaction: a write never holds two connections (Lead 14, #3321 (4))
    return this.db.$transaction(async (tx) => {
      const firmId = firmScope(ctx.firmId).firmId, id = invoiceId.toLowerCase();
      await this.seen(tx, ctx, id, scope);   // C5 before the row lock and any write (review m2)
      const [inv] = await tx.$queryRaw<{ issued: boolean; number: string | null; billTo: string | null; personId: string | null; companyId: string | null; currency: string }[]>`select issued_at is not null as issued, number, bill_to_province as "billTo", person_id::text as "personId", company_id::text as "companyId", currency::text as currency from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid for update`;
      if (!inv) return notFound("invoice");
      await liveParty(tx, firmId, inv.personId ?? inv.companyId, scope);   // FO-9b part 2m (break m3)
      if (inv.issued) problem(409, "Not possible now", `This invoice is issued (${inv.number}): its Bill-to province is fixed. Nothing was saved.`, { code: "ISSUED" });
      if (inv.billTo === b.province) return this.view(tx, ctx.firmId, id);
      // The two defaults, from one read of the firm's facts after the invoice's lock (as addLine reads them).
      const [facts] = await tx.$queryRaw<{ registered: boolean | null; address: unknown }[]>`select s.tax_registered as registered, f.business_address as address from platform_firm f left join money_payment_settings s on s.firm_id = f.id where f.id = ${firmId}::uuid`;
      const party: BillToParty = inv.personId ? { kind: "PERSON", id: inv.personId } : inv.companyId ? { kind: "COMPANY", id: inv.companyId } : null;
      const registered = facts?.registered === true;
      const from = taxDefault({ firmProvince: billToProvince({ businessAddress: facts?.address ?? null }, party, inv.billTo), registered });
      const to = taxDefault({ firmProvince: b.province, registered });
      await tx.moneyInvoice.update({ where: { firmId_id: { firmId, id } }, data: { billToProvince: b.province } });
      const reRated: { position: number; amountMinor: number; taxBefore: number; taxAfter: number }[] = [];
      if (from.ratePpm > 0 && from.ratePpm !== to.ratePpm) {
        const lines = await tx.moneyInvoiceLine.findMany({ where: firmScope(ctx.firmId, { invoiceId: id, taxRatePpm: from.ratePpm, kind: { not: MoneyLineKind.GOVERNMENT_FEE } }), orderBy: { position: "asc" }, select: { id: true, position: true, amountMinor: true, taxMinor: true } });
        try {
          for (const l of lines) {
            const taxAfter = this.tax(l.amountMinor, to.ratePpm);
            await tx.moneyInvoiceLine.update({ where: { id: l.id }, data: { taxRatePpm: to.ratePpm, taxMinor: taxAfter } });
            reRated.push({ position: l.position, amountMinor: l.amountMinor, taxBefore: l.taxMinor, taxAfter });
          }
        } catch (e) {   // the database's credit rule: re-rating down below credit already applied to this draft
          if (/of credit is applied to this draft/.test(String((e as Error).message))) problem(409, "Not possible now", "Credit is applied to this draft, more than its lines would leave at the new province's tax: reverse that credit first. Nothing was saved.", { code: "CREDIT_APPLIED" });
          throw e;
        }
      }
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "invoice.bill_to_changed", entity: "money_invoice", entityKey: id,
        summary: `Bill-to province of a draft invoice set to ${b.province}${reRated.length ? `; ${reRated.length} line(s) re-rated from ${percent(from.ratePpm)} to ${percent(to.ratePpm)}` : ""}.`,
        detail: { invoiceId: id, linesReRated: reRated.length, taxBeforeMinor: reRated.reduce((t, l) => t + l.taxBefore, 0), taxAfterMinor: reRated.reduce((t, l) => t + l.taxAfter, 0) },   // flat facts (AuditDetail)
        before: { billToProvince: inv.billTo, ratePpm: from.ratePpm }, after: { billToProvince: b.province, ratePpm: to.ratePpm } });
      return this.view(tx, ctx.firmId, id);
    });
  }

  /** GET /api/front-office/money/invoices/:id. */
  async read(ctx: StaffContext, invoiceId: string): Promise<InvoiceView> {
    if (!UUID.test(invoiceId)) notFound("invoice");
    // One snapshot: the lines and the total are read as of the same moment (a line added between them never shows).
    const id = invoiceId.toLowerCase();
    const scope = await this.scopeOf(ctx);   // C5 scope read before the transaction: a write never holds two connections (Lead 14, #3321 (4))
    return this.db.$transaction(async (tx) => { await this.seen(tx, ctx, id, scope); return this.view(tx, ctx.firmId, id); }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  // ------------------------------------------------------------------------------- FO-7w1: from a signed retainer
  /** The retainer's rows this draft bills (AG-6-65 r1), checked before anything is written: the retainer of this firm,
   *  kind RETAINER, whose signer (or company) is the draft's client, else 404; signed (SIGNED, SIGNED_OFFLINE), else 409
   *  RETAINER_NOT_SIGNED (AG-6-64 r2). Without `feeRowIds`: every row with an amount except an "On signing" row, a deposit
   *  (Code s. 32; AG-6-61), never copied by itself; with them, exactly the rows named. A row already on an invoice is
   *  skipped, or 409 ROW_ON_INVOICE when named; the retainer's billing is one at a time (a transaction lock on its id), so
   *  the second of two drafts at once reads the first's lines (the unique index stands behind it). */
  private async retainerRows(tx: Tx, firmId: string, d: DraftIn, party: NonNullable<BillToParty>, currency: string): Promise<RetainerFeeRow[]> {
    const r = this.retainers ? await this.retainers.read(tx, firmScope(firmId).firmId, d.retainerId!) : null;
    const signer = party.kind === "PERSON" ? r?.personId : r?.companyId;
    if (!r || r.kind !== "RETAINER" || !signer || signer !== party.id) return notFound("retainer for this client");
    if (!(SIGNED_STATES as readonly string[]).includes(r.status))
      problem(409, "Not possible now", "This retainer is not signed yet: only a signed retainer's fees can be billed from it. Nothing was saved.", { code: "RETAINER_NOT_SIGNED" });
    const named = d.feeRowIds ? [...new Set(d.feeRowIds.map((x) => x.toLowerCase()))] : null;
    if (named) {
      const missing = named.filter((x) => !r.rows.some((row) => row.id === x));
      if (missing.length) badField("feeRowIds", "A fee row named is not on this retainer's current version. Nothing was saved.");
      if (r.rows.some((row) => named.includes(row.id) && row.amountMinor === null)) badField("feeRowIds", "A fee row named has no amount on the retainer: type that line by hand. Nothing was saved.");
    }
    const chosen = r.rows.filter((row) => (named ? named.includes(row.id) : row.amountMinor !== null && row.when !== "ON_SIGNING"));
    const other = chosen.find((row) => row.currency !== currency);
    if (other) badField("currency", `This draft is in ${currency}; the retainer's fee "${other.label.slice(0, 80)}" is in ${other.currency}, so it can't be copied. Nothing was saved.`);
    const big = chosen.find((row) => (row.amountMinor ?? 0) > MINOR_MAX);
    if (big) badField("feeRowIds", `A fee row's amount is more than one line can hold (${MONEY(MINOR_MAX)}). Nothing was saved.`);
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`money.bill-retainer:${r.id}`}, 0))`;
    const ids = chosen.map((row) => row.id);
    const billed = new Set(ids.length ? (await tx.moneyInvoiceLine.findMany({ where: firmScope(firmId, { sourceFeeRowId: { in: ids } }), select: { sourceFeeRowId: true } })).map((l) => l.sourceFeeRowId!) : []);
    if (named && billed.size) problem(409, "Not possible now", "A fee row named is already on an invoice: it is billed once. Nothing was saved.", { code: "ROW_ON_INVOICE", feeRowIds: [...billed] });
    return chosen.filter((row) => !billed.has(row.id));
  }

  /** One FEE line per row (label, quantity 1, the row's amount), taxed by the draft's own default as a typed line
   *  (taxDefault through lineRatePpm, taxForLine). Returns the lines as written, for the one audit line. */
  private async copyRows(tx: Tx, firmId: string, invoiceId: string, currency: string, party: BillToParty, billTo: string | null, address: unknown, rows: RetainerFeeRow[]) {
    const [facts] = await tx.$queryRaw<{ registered: boolean | null }[]>`select tax_registered as registered from money_payment_settings where firm_id = ${firmScope(firmId).firmId}::uuid`;
    const dflt = taxDefault({ firmProvince: billToProvince({ businessAddress: address }, party, billTo), registered: facts?.registered === true });
    const ratePpm = lineRatePpm({ kind: "FEE", taxable: true }, dflt);
    // Break m2: invisible format and direction marks (which money_text_ok refuses) are dropped from the label, not the bill.
    const planned = rows.map((row, i) => ({ row, position: i + 1, amountMinor: row.amountMinor!, taxMinor: this.tax(row.amountMinor!, ratePpm),
      description: [...row.label.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "").trim()].slice(0, 500).join("") }));
    // Break m3: the draft must be one that can be issued (FO-7b part 1b refuses a total above MINOR_MAX at issue).
    if (planned.reduce((t, l) => t + l.amountMinor + l.taxMinor, 0) > MINOR_MAX) badField("feeRowIds", `These fees with their tax come to more than one invoice can hold (${MONEY(MINOR_MAX)}): bill fewer rows at once (name them in feeRowIds). Nothing was saved.`);
    const out: { position: number; sourceFeeRowId: string; amountMinor: number; taxRatePpm: number; taxMinor: number }[] = [];
    for (const { row, position, amountMinor, taxMinor, description } of planned) {
      const [text] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${description}, 500) as ok`;
      if (!text?.ok) badField("feeRowIds", `Fee row ${row.position} ("${description.slice(0, 60)}") has a label that can't be printed on an invoice: correct it on the retainer, or leave that row out and type the line by hand. Nothing was saved.`);
      try {
        await tx.moneyInvoiceLine.create({ data: { firmId: firmScope(firmId).firmId, invoiceId, position, kind: "FEE", description, quantity: 1, unitAmountMinor: amountMinor, amountMinor, taxRatePpm: ratePpm, taxMinor, currency: currency as "CAD" | "USD", sourceFeeRowId: row.id } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") problem(409, "Not possible now", "A fee row of this retainer is already on an invoice: it is billed once. Nothing was saved.", { code: "ROW_ON_INVOICE", feeRowIds: [row.id] });   // review m8
        throw e;
      }
      out.push({ position, sourceFeeRowId: row.id, amountMinor, taxRatePpm: ratePpm, taxMinor });
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------- helpers
  /** The firm's payment settings; refused in words when there are none yet, or while "Prices include tax" is on (the
   *  ruling of 18 Nov: never a silent tax on top, until FO-7g part 2). */
  private async settingsOrRefuse(tx: Tx, firmId: string) {
    const s = await tx.moneyPaymentSettings.findFirst({ where: firmScope(firmId), select: { defaultCurrency: true, pricesIncludeTax: true } });
    if (!s) return problem(409, "Not possible now", "Set up payments first: this firm's payment settings are not saved yet. Nothing was saved.", { code: "PAYMENTS_NOT_SET_UP" });
    if (s.pricesIncludeTax) problem(409, "Not possible now", "Prices that include tax come later: this firm has \"Prices include tax\" on, so an invoice can't be drafted yet. Nothing was saved.", { code: "PRICES_INCLUDE_TAX" });
    return s;
  }

  /** The invoice with its stored lines; the sums are of the stored figures, the total money_invoice_total's (facts.ts). */
  private async view(tx: Tx, firmId: string, id: string): Promise<InvoiceView> {
    return (await invoiceFacts(tx, firmId, id, dayOf(this.clock.now())))?.view ?? notFound("invoice");
  }
}
