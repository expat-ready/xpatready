// FO-7t part 3 (R1.58; design/briefs/FO-7t.md part 3; AG-6-73 rules 1, 5, 6, §9, §12; Lead B's conditions rev 16.31;
// Lead 96's lock ruling on FO-7ts part 3; legal reading Unconfirmed: no counsel): the "To move" list between the firm's
// trust and operating bank accounts, "I moved these" and "Undo this batch".
// * No rule of its own (Lead B, rev 16.31): the list is read from money_to_move only; a batch is written by inserting
//   money_move_batch and money_move_line rows only, whose triggers (FO-7mv, FO-7a2, FO-7lk, FO-7ts part 3) keep every cap,
//   eligibility and open amount. No cap, eligibility or open amount is computed here; a refusal is the database's, passed on
//   as 409 MOVE_REFUSED in its words.
// * Locks (Lead 96's ruling): before the first line, every lock the lines need, sorted by id: each line's party and each
//   pick line's invoice party, through money_trust_lock (which re-enters, so the triggers' own takes wait for nothing).
//   Line by line, a batch could hold an invoice party's lock and wait for a payer's while a pick holds that payer and waits
//   for the invoice party (FO-7ts part 3 break R3-m1). An undo takes the same locks for the lines of the batch it undoes.
// * Who sees a line (C5, as the ledger, FO-7t.md's ruling): its case is visible, or its person or company when it has no
//   case (MoneyVisibilityPort); a line, or a batch with a line, the person cannot see is 404, as another firm's.
// * Uncleared money asks first (Lead 29's ruling (b) on Lead B 7's read; Lead 25's condition on #3442): under the locks,
//   for each party, case and currency of the batch's trust → operating lines, what the party's money there covers if its
//   uncleared cheques bounce: its ledger on the case, plus what was paid out of it and still waits to move, less the
//   uncleared deposits, cleared money counted first (the reading of part 2's `held`, so mixed money too). Moving more
//   answers 409 UNCLEARED until acknowledged (unclearedAcknowledged); it warns, never blocks. Holding it in the database
//   as well is FO-7ts's (a named gap). Legal reading: Unconfirmed: no counsel.
// * One audit line per batch or undo (AuditPort, in its transaction) and trust.moved last (ids, total, currency).
import { HttpException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ClockPort } from "../../../../ports/clock.ts";
import { MINOR_MAX, MoneyCurrency } from "../../../../ports/client-money.ts";
import { TRUST_EVENT, TrustMovedPayload } from "../../../../ports/events/client-money-trust.ts";
import type { MoneyVisibility } from "../../../../ports/money-visibility.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { MONEY, UUID, badField, notFound, parse } from "../invoices/drafts.ts";
import { dayOf } from "../invoices/facts.ts";
import { trustShows } from "../reads/common.ts";

type Tx = Prisma.TransactionClient;
/** A line waits too long after this many days from its source date (AG-6-73 rule 5; the requirement's own number). */
export const TO_MOVE_WAIT_DAYS = 25;
const Direction = z.enum(["TRUST_TO_OPERATING", "OPERATING_TO_TRUST"], { message: "TRUST_TO_OPERATING or OPERATING_TO_TRUST." });
const id = (what: string) => z.string().regex(UUID, `${what} is not an id.`).transform((v) => v.toLowerCase());
const amount = z.number({ error: "The amount (in cents) must be a whole number." }).int("The amount (in cents) must be a whole number.").min(1, "The amount is at least 1 cent.").max(MINOR_MAX, `The amount is at most ${MONEY(MINOR_MAX)}.`);
const day = z.string({ error: "The transfer date is needed (YYYY-MM-DD)." }).regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "That date does not exist.")
  .refine((d) => d >= "2000-01-01", "A bank transfer date is on or after 2000-01-01.");   // the database's bound (money_move_batch_date_check), as a field error (break M1)
const words = (what: string, max: number) => z.string({ error: `${what} is needed.` }).trim().min(1, `${what} is needed.`).max(max, `At most ${max} characters.`).regex(/^[^\u0000-\u001f\u007f\u2028\u2029]*$/, "One line, no tabs or control characters.");

export const ListIn = z.strictObject({ currency: MoneyCurrency.optional() });
export const BatchIn = z.strictObject({ currency: MoneyCurrency, direction: Direction, transferDate: day,
  unclearedAcknowledged: z.boolean().optional(),
  lines: z.array(z.strictObject({ sourceEntryId: id("The line's trust entry"), amountMinor: amount }), { error: "Tick at least one line." }).min(1, "Tick at least one line.").max(100, "At most 100 lines in one batch.") });
export const UndoIn = z.strictObject({ reason: words("The reason", 200), transferDate: day.optional() });

const seen = (s: MoneyVisibility, x: string) => Prisma.sql`(${Prisma.raw(x)}.case_id = any(${s.cases}::uuid[]) or (${Prisma.raw(x)}.case_id is null and coalesce(${Prisma.raw(x)}.person_id, ${Prisma.raw(x)}.company_id) = any(${s.parties}::uuid[])))`;
const refuse = (detail: string): never => problem(409, "Not possible now", detail, { code: "MOVE_REFUSED" });

/** The locks a set of trust entries' move lines take: each entry's party, and for a withdrawal its invoice's party, each
 *  with its own currency; sorted by party id then currency, as money_move_line_write compares ids (smaller first). */
async function takeLocks(tx: Tx, f: string, entryIds: string[]) {
  const locks = await tx.$queryRaw<{ party: string; currency: string }[]>`select x.party::text, x.currency::text from (
    select coalesce(e.person_id, e.company_id) as party, e.currency from money_trust_entry e where e.firm_id = ${f}::uuid and e.id = any(${entryIds}::uuid[])
    union
    select coalesce(i.person_id, i.company_id), i.currency from money_trust_entry e join money_invoice i on i.firm_id = e.firm_id and i.id = e.invoice_id
      where e.firm_id = ${f}::uuid and e.id = any(${entryIds}::uuid[]) and e.kind = 'WITHDRAWAL_TO_INVOICE'
    ) x order by x.party, x.currency`;   // uuid order, as money_move_line_write compares ids (review m3)
  for (const l of locks) await tx.$executeRaw`select money_trust_lock(${f}::uuid, ${l.party}::uuid, ${l.currency}::"MoneyCurrency")`;
}

export class TrustToMove {
  constructor(private readonly db: PrismaClient, private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort, private readonly scopeOf: (ctx: StaffContext) => Promise<MoneyVisibility>) {}

  /** GET /trust/to-move: the open lines the person may see, and a total per currency and direction. */
  async list(ctx: StaffContext, query: unknown) {
    const q = parse(ListIn, query), f = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx);
    return this.db.$transaction(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("trust record");
      const since = new Date(this.clock.now().getTime() - TO_MOVE_WAIT_DAYS * 86_400_000);
      const rows = await tx.$queryRaw<{ source_entry_id: string; kind: string; direction: string; currency: string; person_id: string | null; company_id: string | null; case_id: string | null; invoice_id: string | null; open_minor: number; source_date: Date; over: boolean }[]>`
        select m.source_entry_id::text, m.kind::text, m.direction::text, m.currency::text, m.person_id::text, m.company_id::text, m.case_id::text, m.invoice_id::text, m.open_minor, m.created_at as source_date,
               (m.direction = 'TRUST_TO_OPERATING' and m.created_at < ${since}::timestamptz) as over
          from money_to_move m where m.firm_id = ${f}::uuid and ${seen(scope, "m")} ${q.currency ? Prisma.sql`and m.currency = ${q.currency}::"MoneyCurrency"` : Prisma.empty}
          order by m.currency, m.direction, m.created_at, m.source_entry_id`;
      const lines = rows.map((r) => ({ sourceEntryId: r.source_entry_id, kind: r.kind, direction: r.direction, currency: r.currency, personId: r.person_id, companyId: r.company_id, caseId: r.case_id, invoiceId: r.invoice_id,
        openMinor: r.open_minor, sourceDate: r.source_date.toISOString(), over25Days: r.over }));
      const totals = new Map<string, { currency: string; direction: string; openMinor: number; lines: number }>();
      for (const l of lines) {   // adds the database's open amounts per group; computes none
        const t = totals.get(`${l.currency} ${l.direction}`) ?? { currency: l.currency, direction: l.direction, openMinor: 0, lines: 0 };
        t.openMinor += l.openMinor; t.lines++; totals.set(`${l.currency} ${l.direction}`, t);
      }
      return { lines, totals: [...totals.values()] };
    });
  }

  /** POST /trust/to-move/batches: "I moved these", one batch and its lines in one transaction, by insert only. */
  async record(ctx: StaffContext, body: unknown) {
    const b = parse(BatchIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`, scope = await this.scopeOf(ctx);
    if (b.transferDate > dayOf(this.clock.now())) badField("transferDate", "A move is recorded once the bank transfer is made: the date can't be in the future. Nothing was saved.");
    const ids = [...new Set(b.lines.map((l) => l.sourceEntryId))];
    return this.write(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("trust record");
      const found = await tx.$queryRaw<{ id: string; kind: string; currency: string; party: string; case_id: string | null; visible: boolean }[]>`
        select e.id::text, e.kind::text, e.currency::text, coalesce(e.person_id, e.company_id)::text as party, e.case_id::text, ${seen(scope, "e")} as visible from money_trust_entry e where e.firm_id = ${f}::uuid and e.id = any(${ids}::uuid[])`;
      if (found.length !== ids.length || found.some((e) => !e.visible)) notFound("trust entry");
      if (found.some((e) => e.currency !== b.currency))
        badField("lines", `One batch per currency: CAD and USD never share a batch, and this batch is ${b.currency}. Record each currency's moves as its own batch. Nothing was saved.`);
      await takeLocks(tx, f, ids);
      const acknowledged = b.direction === "TRUST_TO_OPERATING" ? await this.askUncleared(tx, f, b, found) : false;
      const [batch] = await tx.$queryRaw<{ id: string }[]>`insert into money_move_batch (firm_id, currency, direction, transfer_date, recorded_by)
        values (${f}::uuid, ${b.currency}::"MoneyCurrency", ${b.direction}::"MoneyMoveDirection", ${b.transferDate}::date, ${by}) returning id::text`;
      const kindOf = new Map(found.map((e) => [e.id, e.kind === "CORRECTION" ? "WRONG_ACCOUNT" : "TRUST_APPLIED"]));   // the line's kind names its source's kind; the database checks it
      const lines: { lineId: string; sourceEntryId: string; amountMinor: number }[] = [];
      for (const l of b.lines) {
        const [line] = await tx.$queryRaw<{ id: string }[]>`insert into money_move_line (firm_id, batch_id, kind, direction, currency, amount_minor, source_entry_id)
          values (${f}::uuid, ${batch.id}::uuid, ${kindOf.get(l.sourceEntryId)}::"MoneyMoveKind", ${b.direction}::"MoneyMoveDirection", ${b.currency}::"MoneyCurrency", ${l.amountMinor}::int, ${l.sourceEntryId}::uuid) returning id::text`;
        lines.push({ lineId: line.id, sourceEntryId: l.sourceEntryId, amountMinor: l.amountMinor });
      }
      const total = lines.reduce((s, l) => s + l.amountMinor, 0);
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust_money.moved", entity: "money_move_batch", entityKey: batch.id,
        summary: `${b.currency} ${MONEY(total)} recorded as moved ${b.direction === "TRUST_TO_OPERATING" ? "from trust to operating" : "from operating to trust"} (${lines.length} line${lines.length === 1 ? "" : "s"}).`,
        detail: { batchId: batch.id, currency: b.currency, direction: b.direction, transferDate: b.transferDate, totalMinor: total, lines: lines.length, unclearedAcknowledged: acknowledged },
        before: null, after: { sourceEntryIds: lines.map((l) => l.sourceEntryId), amountsMinor: lines.map((l) => l.amountMinor) } });
      await tx.moduleEvent.create({ data: { firmId: f, type: TRUST_EVENT.TRUST_MOVED, subjectId: batch.id, payload: TrustMovedPayload.parse({ batchId: batch.id, undoesBatchId: null, amountMinor: total, currency: b.currency }) } });
      return { batchId: batch.id, currency: b.currency, direction: b.direction, transferDate: b.transferDate, totalMinor: total, lines };
    });
  }

  /** POST /trust/to-move/batches/:id/undo: a reversing batch naming the batch; its lines go back to the list (FO-7mv). */
  async undo(ctx: StaffContext, batchId: string, body: unknown) {
    const bid = UUID.test(batchId) ? batchId.toLowerCase() : notFound("batch");   // the id before the body (PF-28: a malformed id is 404)
    const u = parse(UndoIn, body), f = firmScope(ctx.firmId).firmId, by = `staff:${ctx.staffId}`, scope = await this.scopeOf(ctx);
    if (u.transferDate && u.transferDate > dayOf(this.clock.now())) badField("transferDate", "The date the bank sent the money back can't be in the future. Nothing was saved.");
    return this.write(async (tx) => {
      if (!(await trustShows(tx, f))) notFound("trust record");
      const [b] = await tx.$queryRaw<{ currency: string; direction: string }[]>`select currency::text, direction::text from money_move_batch where firm_id = ${f}::uuid and id = ${bid}::uuid`;
      if (!b) notFound("batch");
      const lines = await tx.$queryRaw<{ source_entry_id: string; amount_minor: number; visible: boolean }[]>`
        select l.source_entry_id::text, l.amount_minor, ${seen(scope, "e")} as visible from money_move_line l join money_trust_entry e on e.firm_id = l.firm_id and e.id = l.source_entry_id
          where l.firm_id = ${f}::uuid and l.batch_id = ${bid}::uuid`;
      if (lines.some((l) => !l.visible)) notFound("batch");
      await takeLocks(tx, f, [...new Set(lines.map((l) => l.source_entry_id))]);
      const [undo] = await tx.$queryRaw<{ id: string }[]>`insert into money_move_batch (firm_id, currency, direction, transfer_date, undoes_batch_id, reason, recorded_by)
        values (${f}::uuid, ${b.currency}::"MoneyCurrency", ${b.direction}::"MoneyMoveDirection", ${u.transferDate ?? null}::date, ${bid}::uuid, ${u.reason}, ${by}) returning id::text`;
      const total = lines.reduce((s, l) => s + l.amount_minor, 0);
      await this.audit.record(tx, { firmId: f, actor: by, action: "trust_money.move_undone", entity: "money_move_batch", entityKey: undo.id,
        summary: `A batch of ${b.currency} ${MONEY(total)} undone; its lines are back on the To move list.`,
        detail: { batchId: undo.id, undoesBatchId: bid, currency: b.currency, totalMinor: total, lines: lines.length }, before: null, after: { reason: u.reason, transferDate: u.transferDate ?? null } });
      if (total > 0) await tx.moduleEvent.create({ data: { firmId: f, type: TRUST_EVENT.TRUST_MOVED, subjectId: undo.id, payload: TrustMovedPayload.parse({ batchId: undo.id, undoesBatchId: bid, amountMinor: total, currency: b.currency }) } });
      return { batchId: undo.id, undoesBatchId: bid };
    });
  }

  /** Ruling (b): each party and case's lines against what its cleared money covers, read under the locks. True when the
   *  question applied and was acknowledged (the audit line records it); refuses 409 UNCLEARED when not acknowledged. */
  private async askUncleared(tx: Tx, f: string, b: z.infer<typeof BatchIn>, found: { id: string; party: string; case_id: string | null }[]): Promise<boolean> {
    const of = new Map(found.map((e) => [e.id, e])), groups = new Map<string, { party: string; caseId: string | null; minor: number }>();
    for (const l of b.lines) {   // adds the person's own amounts per party and case; reads every money figure from the database
      const e = of.get(l.sourceEntryId)!, key = `${e.party} ${e.case_id ?? "-"}`;
      const g = groups.get(key) ?? { party: e.party, caseId: e.case_id, minor: 0 };
      g.minor += l.amountMinor; groups.set(key, g);
    }
    let asked = false;
    for (const g of groups.values()) {
      const on = Prisma.sql`x.firm_id = ${f}::uuid and coalesce(x.person_id, x.company_id) = ${g.party}::uuid and x.currency = ${b.currency}::"MoneyCurrency" and x.case_id is not distinct from ${g.caseId}::uuid`;
      const [r] = await tx.$queryRaw<{ ledger: string; waiting: string; uncleared: string }[]>`select
          (select coalesce(sum(x.amount_minor), 0) from money_trust_entry x where ${on})::text as ledger,
          (select coalesce(sum(x.open_minor), 0) from money_to_move x where ${on} and x.direction = 'TRUST_TO_OPERATING')::text as waiting,
          (select coalesce(sum(x.amount_minor), 0) from money_trust_entry x join money_payment p on p.firm_id = x.firm_id and p.id = x.payment_id where ${on} and x.kind = 'DEPOSIT' and not p.cleared)::text as uncleared`;
      const uncleared = Number(r.uncleared), covered = Math.max(0, Number(r.ledger) + Number(r.waiting) - uncleared);
      if (g.minor <= covered) continue;
      if (!b.unclearedAcknowledged) problem(409, "Not possible now", `${b.currency} ${MONEY(Math.min(uncleared, g.minor - covered))} of this is from a cheque not yet cleared. If it bounces, the firm will have moved money it doesn't hold. Move anyway?`,
        { code: "UNCLEARED", acknowledge: "unclearedAcknowledged" });
      asked = true;
    }
    return asked;
  }

  /** One writing transaction; the database's refusal (its own words name the rule) is 409 MOVE_REFUSED, never a 500. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (e instanceof HttpException) throw e;
      const text = e instanceof Error ? e.message : String(e);
      if (/money_move_batch_firm_id_undoes_batch_id_key/.test(text) || /undoes_batch_id/.test(JSON.stringify((e as { meta?: unknown }).meta ?? ""))) refuse("This batch is already undone. Nothing was saved.");
      if (/money_move_line_firm_id_source_entry_id_move_ordinal_key|move_ordinal/.test(text + JSON.stringify((e as { meta?: unknown }).meta ?? ""))) refuse("Someone moved this line at the same moment: read the list again. Nothing was saved.");
      const said = /money_[a-z_]+: ([^\n]{1,400})/.exec(text);
      return said ? refuse(`The money rules refused this: ${said[0].replace(/[\s`]+$/, "")}. Nothing was saved.`) : Promise.reject(e);
    }
  }
}
