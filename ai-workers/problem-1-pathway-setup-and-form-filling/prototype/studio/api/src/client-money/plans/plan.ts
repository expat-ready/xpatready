// R1.96 part 2 (design/briefs/R1.96-shape.md; BACKLOG FO-7p "payment plans for earned fees", P-574 (5), P-578): a payment
// plan of one issued invoice, ledger rules only (no pay link, no autopay, no card: FO-7p's later part).
// * Make: 2 to 12 instalments (Sample), each a due date (today or later, strictly rising) and a whole amount; they must
//   sum exactly to what is due on the invoice now, else 409 SUM_MISMATCH naming the difference (the database checks the
//   same at commit, money_payment_plan_sums). One ACTIVE plan per invoice. Trust requests are another table: a plan is
//   never on a deposit or trust money (P-567).
// * Read: the plan with each instalment's settled part, derived, never stored: what the invoice no longer owes since the
//   plan (paid, credited or written off) settles the instalments in order. So a payment is never the plan's and cancelling
//   a plan leaves every payment as it was.
// * Cancel: ACTIVE → CANCELLED, by a person, with a reason; its unsettled instalments then read "Cancelled".
// * Each write: one transaction, the FO-7lk lock order, one audit line, then the ledger check (409 UNBALANCED rolls back).
// Keys (routes.ts): make and cancel agent/invoice:issue (BACKLOG FO-7s4p note: P-578 adds no key), read agent/invoice:show.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { PlanCancelIn, PlanIn } from "../../../../ports/client-money.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { MONEY, UUID, badField, notFound, parse } from "../invoices/drafts.ts";
import { dayOf } from "../invoices/facts.ts";
import { ledgerCheck } from "../ledger-check.ts";
import { failClosed, invoiceInScope, type ScopeOf } from "../reads/visibility.ts";

type Tx = Prisma.TransactionClient;
type Reader = Tx | PrismaClient;
const refuse = (code: string, detail: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
export type InstalmentView = { position: number; dueDate: string; amountMinor: number; settledMinor: number; status: "Settled" | "Part settled" | "Due" | "Overdue" | "Cancelled" };
export type PlanView = { id: string; invoiceId: string; currency: "CAD" | "USD"; amountMinor: number; status: "ACTIVE" | "CANCELLED"; createdBy: string; cancelledBy: string | null; cancelledAt: string | null; cancelReason: string | null;
  /** What the invoice no longer owes since the plan (paid, credited or written off), at most the plan's amount. */
  settledMinor: number;
  /** What is due on the invoice now, and the part of it the plan's unsettled instalments do not cover (a refund of money
   *  paid before the plan raises what is due past the plan: review m4; cancel and plan again to cover it). */
  dueNowMinor: number; uncoveredMinor: number; instalments: InstalmentView[] };

/** Settles instalments in order with what the invoice no longer owes since the plan (pure; tested on its own). */
export function settle(rows: { position: number; dueDate: string; amountMinor: number }[], settledMinor: number, today: string, cancelled = false): InstalmentView[] {
  let left = Math.max(0, settledMinor);
  return [...rows].sort((a, b) => a.position - b.position).map((r) => {
    const s = Math.min(r.amountMinor, left); left -= s;
    const status = s === r.amountMinor ? "Settled" : cancelled ? "Cancelled" : s > 0 ? "Part settled" : r.dueDate < today ? "Overdue" : "Due";
    return { position: r.position, dueDate: r.dueDate, amountMinor: r.amountMinor, settledMinor: s, status };
  });
}

export class PaymentPlans {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort, private readonly scopeOf: ScopeOf = failClosed) {}

  /** POST …/invoices/:id/plan { instalments: [{ dueDate, amountMinor }] } → 201 the plan. */
  async create(ctx: StaffContext, invoiceId: string, body: unknown): Promise<PlanView> {
    const id = idOf(invoiceId), b = parse(PlanIn, body), today = dayOf(this.clock.now()), firmId = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    b.instalments.forEach((x, i) => {
      if (x.dueDate < today) badField(`instalments.${i}.dueDate`, "An instalment is due today or later.");
      if (i > 0 && x.dueDate <= b.instalments[i - 1].dueDate) badField(`instalments.${i}.dueDate`, "Each instalment is due after the one before it.");
    });
    const scope = await this.scopeOf(ctx);
    return this.write(async (tx) => {
      await invoiceInScope(tx, firmId, id, scope);
      const inv = await lock(tx, firmId, id);
      if (!inv.issued) refuse("DRAFT", "A plan is for an issued invoice: issue it first. Nothing was saved.");
      if (await tx.moneyPaymentPlan.findFirst({ where: firmScope(firmId, { invoiceId: id, status: "ACTIVE" }), select: { id: true } })) refuse("PLAN_EXISTS", `${inv.number} already has a plan: cancel it first. Nothing was saved.`);
      const due = await dueOf(tx, firmId, id);
      if (due <= 0) refuse("NOTHING_DUE", `Nothing is due on ${inv.number}, so there is nothing to plan. Nothing was saved.`);
      const sum = b.instalments.reduce((s, x) => s + x.amountMinor, 0);
      if (sum !== due) refuse("SUM_MISMATCH", `The instalments add up to ${inv.currency} ${MONEY(sum)} but ${inv.currency} ${MONEY(due)} is due on ${inv.number}: ${sum > due ? "remove" : "add"} ${inv.currency} ${MONEY(Math.abs(due - sum))}. Nothing was saved.`, { dueMinor: due, sumMinor: sum, differenceMinor: due - sum });
      const plan = await tx.moneyPaymentPlan.create({ data: { firmId, invoiceId: id, currency: inv.currency, createdBy: by }, select: { id: true } });
      await tx.moneyInstalment.createMany({ data: b.instalments.map((x, i) => ({ firmId, planId: plan.id, position: i + 1, dueDate: new Date(`${x.dueDate}T00:00:00Z`), amountMinor: x.amountMinor, currency: inv.currency })) });
      await this.audit.record(tx, { firmId, actor: by, action: "invoice.plan_created", entity: "money_payment_plan", entityKey: plan.id,
        summary: `Payment plan on ${inv.number}: ${b.instalments.length} instalments, ${inv.currency} ${MONEY(due)}.`, detail: { invoiceId: id, planId: plan.id, amountMinor: due, instalments: b.instalments.length },
        before: { plan: "none", dueMinor: due }, after: { plan: "ACTIVE", amountMinor: due, instalments: b.instalments.length } });
      await this.balanced(tx, firmId, id);
      return (await this.view(tx, firmId, id, today))!;
    });
  }

  /** GET …/invoices/:id/plan → 200 the ACTIVE plan, else the latest; 404 when the invoice never had one. */
  async read(ctx: StaffContext, invoiceId: string): Promise<PlanView> {
    const id = idOf(invoiceId), firmId = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx);
    return this.db.$transaction(async (tx) => { await invoiceInScope(tx, firmId, id, scope); return (await this.view(tx, firmId, id, dayOf(this.clock.now()))) ?? notFound("payment plan"); });
  }

  /** POST …/invoices/:id/plan/cancel { reason } → 200 the cancelled plan; payments are untouched. */
  async cancel(ctx: StaffContext, invoiceId: string, body: unknown): Promise<PlanView> {
    const id = idOf(invoiceId), c = parse(PlanCancelIn, body), today = dayOf(this.clock.now()), firmId = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`;
    const scope = await this.scopeOf(ctx);
    return this.write(async (tx) => {
      await invoiceInScope(tx, firmId, id, scope);
      const inv = await lock(tx, firmId, id);
      const [text] = await tx.$queryRaw<{ ok: boolean }[]>`select money_text_ok(${c.reason}, 200) as ok`;
      if (!text.ok) badField("reason", "The reason needs a visible letter, number or punctuation, with no hidden or direction-changing characters. Nothing was saved.");
      const plan = await tx.moneyPaymentPlan.findFirst({ where: firmScope(firmId, { invoiceId: id, status: "ACTIVE" }), select: { id: true } });
      if (!plan) return refuse("NO_PLAN", `${inv.number ?? "This invoice"} has no active plan. Nothing was saved.`);
      await tx.moneyPaymentPlan.update({ where: { id: plan.id }, data: { status: "CANCELLED", cancelledBy: by, cancelReason: c.reason } });
      await this.audit.record(tx, { firmId, actor: by, action: "invoice.plan_cancelled", entity: "money_payment_plan", entityKey: plan.id,
        summary: `Payment plan on ${inv.number} cancelled.`, detail: { invoiceId: id, planId: plan.id }, before: { status: "ACTIVE" }, after: { status: "CANCELLED", reason: c.reason } });
      await this.balanced(tx, firmId, id);
      return (await this.view(tx, firmId, id, today))!;
    });
  }

  private async view(tx: Reader, firmId: string, id: string, today: string): Promise<PlanView | null> {
    const p = await tx.moneyPaymentPlan.findFirst({ where: firmScope(firmId, { invoiceId: id }), orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { instalments: true } });
    if (!p) return null;
    const due = Math.max(0, await dueOf(tx, firmId, id)), settled = Math.min(p.amountMinor, Math.max(0, p.amountMinor - due));
    return { id: p.id, invoiceId: id, currency: p.currency, amountMinor: p.amountMinor, status: p.status, createdBy: p.createdBy, cancelledBy: p.cancelledBy,
      cancelledAt: p.cancelledAt?.toISOString() ?? null, cancelReason: p.cancelReason, settledMinor: settled, dueNowMinor: due,
      uncoveredMinor: p.status === "ACTIVE" ? Math.max(0, due - (p.amountMinor - settled)) : 0,
      instalments: settle(p.instalments.map((x) => ({ position: x.position, dueDate: dayOf(x.dueDate), amountMinor: x.amountMinor })), settled, today, p.status === "CANCELLED") };
  }
  private async balanced(tx: Tx, firmId: string, id: string) {
    const check = await ledgerCheck(tx, firmId, id);
    if (!check.balanced) refuse("UNBALANCED", "The ledger would not balance after this. Nothing was saved.", { problems: check.problems });
  }
  /** One writing transaction; a rule the database refused in its own words is a 409, never a 500. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      if ((e as { code?: string }).code === "P2002") refuse("PLAN_EXISTS", "This invoice already has a plan: cancel it first. Nothing was saved.");   // two at once: the partial index keeps one
      const said = /money_[a-z_]+: ([^\n]{1,300})/.exec(e instanceof Error ? e.message : "");
      return said ? refuse("MONEY_RULE", `The money rules refused this: ${said[1].replace(/\s*\(.*$/, "")}. Nothing was saved.`) : Promise.reject(e);
    }
  }
}

const idOf = (invoiceId: string) => (UUID.test(invoiceId) ? invoiceId.toLowerCase() : notFound("invoice"));
/** What is due on the invoice now: the database's own money_invoice_due (the plan trigger reads the same). */
async function dueOf(tx: Reader, firmId: string, id: string): Promise<number> {
  const [r] = await tx.$queryRaw<{ due: string }[]>`select money_invoice_due(${firmId}::uuid, ${id}::uuid)::text as due`;
  return Number(r?.due ?? 0);
}
/** The party's trust lock first, then the invoice row (FO-7lk's one order, as InvoiceMoney.lock). */
async function lock(tx: Tx, firmId: string, id: string) {
  const [p] = await tx.$queryRaw<{ party: string; currency: string }[]>`select coalesce(person_id, company_id)::text as party, currency::text as currency from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid`;
  if (!p) return notFound("invoice");
  await tx.$executeRaw`select money_trust_lock(${firmId}::uuid, ${p.party}::uuid, ${p.currency}::"MoneyCurrency")`;
  const [inv] = await tx.$queryRaw<{ issued: boolean; number: string | null; currency: "CAD" | "USD" }[]>`select issued_at is not null as issued, number, currency::text as currency from money_invoice where firm_id = ${firmId}::uuid and id = ${id}::uuid for update`;
  return inv ?? notFound("invoice");
}
