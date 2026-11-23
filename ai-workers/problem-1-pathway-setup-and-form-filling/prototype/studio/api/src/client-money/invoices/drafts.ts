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
    private readonly scopeOf: ScopeOf = failClosed) {}   // C5 (#3305 M1): the app binds PgMoneyVisibility; fail closed otherwise

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
      const currency = d.currency ?? settings.defaultCurrency;
      // FO-7g part 3 (P-797): the Bill-to province starts as the client's Canadian address, else the firm's province, as a
      // code (null while the firm's province is not one of the 13: the tax default then warns, never guesses).
      const [firm] = await tx.$queryRaw<{ address: unknown }[]>`select business_address as address from platform_firm where id = ${firmScope(ctx.firmId).firmId}::uuid`;
      const billTo = provinceCode(billToProvince({ businessAddress: firm?.address ?? null }, d.personId ? { kind: "PERSON", id: client!.id } : { kind: "COMPANY", id: client!.id }));
      const inv = await tx.moneyInvoice.create({ data: { firmId: firmScope(ctx.firmId).firmId, personId: d.personId ? client!.id : null, companyId: d.companyId ? client!.id : null, currency, billToProvince: billTo, createdBy: `staff:${ctx.staffId}` }, select: { id: true } });
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "invoice.draft_created", entity: "money_invoice", entityKey: inv.id, summary: `Draft invoice started in ${currency}.`, detail: { invoiceId: inv.id, currency },
        before: null, after: { personId: d.personId ? client!.id : null, companyId: d.companyId ? client!.id : null, currency, billToProvince: billTo, status: "DRAFT" } });   // R1.8 (QA-594): the draft as created
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
