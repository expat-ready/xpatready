// FO-7b part 1a (QA-482; R1.59; brief build-lead-c-briefs/FO-7b-1a.md, with FO-7b.md's rules and the rulings of 18 Nov):
// draft invoices and their lines. Every input goes through a zod parse (ports/client-money.ts; 422 at the field, PF-28 part 6). The
// route computes each line's amount and its tax with taxForLine (per line, half to even); a tax sent by the client is
// ignored; a government fee's tax is 0; the total is money_invoice_total, the sum of the stored lines. A line in another
// currency is refused with 422 in plain words before the database's own trigger sees it. While the firm has "Prices
// include tax" on, no draft is made or added to (until FO-7g part 2). Firm-scoped (PF-12's walls and firmScope): another
// firm's invoice or client is 404. Each write is one transaction with one audit line through AuditPort (fail-closed).
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { DraftIn, InvoiceView, LineIn, MINOR_MAX } from "../../../../ports/client-money.ts";
import { problemFromZod } from "../../../../contracts/programs.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../platform/http/input.ts";
import { holdsKey } from "../../platform/identity/catalogue.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { taxForLine } from "./tax-round.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Minor units as "1,234.56", from the integer's digits (no float). */
const MONEY = (n: number) => { const s = String(n).padStart(3, "0"); return `${s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${s.slice(-2)}`; };

/** PF-28 part 6 (R1.10, Lead B rev 17.21): a field error is FIELD_ERROR_STATUS (422) with `fields` naming each field in
 *  the one rule's words (an unknown one included), the money schemas' own `errors` list and words kept. A body that is not
 *  an object (a list, a number) is refused by its shape, "body: This must be an object.", never read as {}. */
const parse = <S extends z.ZodType>(schema: S, input: unknown): z.infer<S> => {
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
const badField = (field: string, message: string): never => {
  throw new HttpException({ type: "https://expatready.local/problems/validation", title: "Some details need fixing", status: FIELD_ERROR_STATUS, detail: message, code: "INVALID", errors: [{ field, message }], fields: { [field]: message } }, FIELD_ERROR_STATUS);
};
const notFound = (what: string): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });

/** Adding to a draft someone else started needs this key (AG-06 C5: "Edit a DRAFT invoice"); one's own draft, :create. */
export const EDIT_KEY = "agent/invoice:edit";

export class InvoiceDrafts {
  /** `tax` is the one rule (taxForLine); a test passes a planted wrong rule to prove its cases catch it, never the app. */
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly tax: (amountMinor: number, ratePpm: number) => number = taxForLine) {}

  /** POST /api/front-office/money/invoices. */
  async create(ctx: StaffContext, body: unknown): Promise<InvoiceView> {
    const d = parse(DraftIn, body);
    return this.db.$transaction(async (tx) => {
      const settings = await this.settingsOrRefuse(tx, ctx.firmId);
      const client = d.personId
        ? await tx.foPerson.findFirst({ where: firmScope(ctx.firmId, { id: d.personId.toLowerCase() }), select: { id: true } })
        : await tx.foCompany.findFirst({ where: firmScope(ctx.firmId, { id: d.companyId!.toLowerCase() }), select: { id: true } });
      if (!client) notFound(d.personId ? "person" : "company");
      const currency = d.currency ?? settings.defaultCurrency;
      const inv = await tx.moneyInvoice.create({ data: { firmId: firmScope(ctx.firmId).firmId, personId: d.personId ? client!.id : null, companyId: d.companyId ? client!.id : null, currency, createdBy: `staff:${ctx.staffId}` }, select: { id: true } });
      await this.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "invoice.draft_created", entity: "money_invoice", entityKey: inv.id, summary: `Draft invoice started in ${currency}.`, detail: { invoiceId: inv.id, currency },
        before: null, after: { personId: d.personId ? client!.id : null, companyId: d.companyId ? client!.id : null, currency, status: "DRAFT" } });   // R1.8 (QA-594): the draft as created
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
    const ratePpm = l.kind === "GOVERNMENT_FEE" ? 0 : l.ratePpm;   // a government fee is never taxed (AG-6-4 rule 3)
    const taxMinor = this.tax(amountMinor, ratePpm);
    return this.db.$transaction(async (tx) => {
      await this.settingsOrRefuse(tx, ctx.firmId);
      const firmId = firmScope(ctx.firmId).firmId, id = invoiceId.toLowerCase();
      const [inv] = await tx.$queryRaw<{ currency: string; issued: boolean; by: string }[]>`select currency::text as currency, issued_at is not null as issued, created_by as by from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid for update`;
      if (!inv) return notFound("invoice");
      if (inv.by !== `staff:${ctx.staffId}` && !(await holdsKey(tx, firmId, ctx.staffId, EDIT_KEY)))
        problem(403, "Not allowed", "Only the person who started this draft, or someone who may edit invoices, can add to it. Nothing was saved.", { code: "MISSING_PERMISSION", missing: [EDIT_KEY] });
      if (inv.issued) problem(409, "Not possible now", "This invoice is issued: it can't be edited. Use a credit note. Nothing was saved.", { code: "ISSUED" });
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

  /** GET /api/front-office/money/invoices/:id. */
  async read(ctx: StaffContext, invoiceId: string): Promise<InvoiceView> {
    if (!UUID.test(invoiceId)) notFound("invoice");
    // One snapshot: the lines and the total are read as of the same moment (a line added between them never shows).
    return this.db.$transaction((tx) => this.view(tx, ctx.firmId, invoiceId.toLowerCase()), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
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

  /** The invoice with its stored lines; the sums are of the stored figures, the total money_invoice_total's. */
  private async view(tx: Tx, firmId: string, id: string): Promise<InvoiceView> {
    const inv = await tx.moneyInvoice.findFirst({ where: firmScope(firmId, { id }), include: { lines: { orderBy: { position: "asc" } } } });
    if (!inv) return notFound("invoice");
    const [t] = await tx.$queryRaw<{ total: string }[]>`select money_invoice_total(${inv.firmId}::uuid, ${inv.id}::uuid)::text as total`;
    const lines = inv.lines.map((x) => ({ id: x.id, position: x.position, kind: x.kind, description: x.description, quantity: x.quantity, unitMinor: x.unitAmountMinor, amountMinor: x.amountMinor, ratePpm: x.taxRatePpm, taxMinor: x.taxMinor, currency: x.currency }));
    return InvoiceView.parse({ id: inv.id, status: inv.issuedAt ? "ISSUED" : "DRAFT", number: inv.number, personId: inv.personId, companyId: inv.companyId, currency: inv.currency, lines,
      subtotalMinor: lines.reduce((s, x) => s + x.amountMinor, 0), taxMinor: lines.reduce((s, x) => s + x.taxMinor, 0), totalMinor: Number(t.total) });
  }
}
