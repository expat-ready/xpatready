// FO-7r part 2 (R1.111; AG-6-28 rules 3, 8-10, §13; AG-6-41; shape r1-111-shape.md, Lead 4 on #3634): the statement as
// a PDF, and Send statement.
//   * GET …/parties/:kind/:id/statement.pdf?from=&to=&caseId= (agent/invoice:show): every line of the period, read
//     page by page through part 1's MoneyStatement (so its C5 scope, firm and figures), with part 1's summary for owed,
//     credit and the cases' trust. A statement over STATEMENT_LINE_MAX lines is refused (422 naming `to`: "choose a
//     shorter period"), never cut short silently.
//   * POST …/parties/:kind/:id/statement/send { from?, to?, caseId? } (agent/invoice:issue, AG-6-28 §8): sent by a
//     person only. There is no schedule (§13: no automatic statements). It goes to the client's own address only, no
//     Cc (AG-6-41): a person's email, or a company's primary contact's. With no address the answer is 422 and nothing is
//     sent. The email holds the statement text and the PDF; its idempotency key is per request, because a person may
//     send the same period again.
//     Each email sent writes one audit line, "statement.sent" (who, client, period, case, closing per account; AG-6-28
//     §9). A mail failure answers { email: "NOT_SENT" } and writes no line, as FO-7b's invoice email.
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { systemClock, type ClockPort } from "../../../../ports/clock.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { DocumentRenderPort, RenderedDocument } from "../../../../ports/render.ts";
import { ownFirm } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import { SYSTEM_REPLY_TO } from "../../platform/identity/session/mail.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { addressOf } from "../invoices/money.ts";
import { UUID, badField } from "../invoices/drafts.ts";
import { dayOf } from "../invoices/facts.ts";
import { Day } from "../reads/common.ts";
import { partyOf } from "../trust/service.ts";
import { MoneyStatement, type StatementLine } from "./statement.ts";
import { STATEMENT_TEMPLATE, StatementDocuments, statementData, statementText } from "./statement-document.ts";
import { MoneySummary } from "./summary.ts";

type Tx = Prisma.TransactionClient;
/** The most lines one statement prints (Sample: about 80 pages of the PDF); past it, a shorter period. */
export const STATEMENT_LINE_MAX = 5000;
const Period = z.strictObject({ from: Day.optional(), to: Day.optional(), caseId: z.string().regex(UUID).optional() });
export type SendView = { email: "SENT" | "NOT_SENT"; to: string; lines: number };

export class StatementSend {
  constructor(private readonly db: PrismaClient, private readonly statements: MoneyStatement, private readonly summaries: MoneySummary, private readonly audit: AuditPort<Tx>,
    private readonly mail: MailPort | null, private readonly clock: ClockPort = systemClock, private readonly docs: DocumentRenderPort = new StatementDocuments()) {}

  /** GET …/statement.pdf. */
  async pdf(ctx: StaffContext, kind: string, id: string, query: unknown): Promise<RenderedDocument> {
    return this.docs.render(STATEMENT_TEMPLATE, (await this.build(ctx, kind, id, query)).data);
  }

  /** POST …/statement/send. */
  async send(ctx: StaffContext, kind: string, id: string, body: unknown): Promise<SendView> {
    const b = await this.build(ctx, kind, id, body), f = ctx.firmId;
    if (!b.email) return badField("to", `${b.head.billTo} has no email address on file: add one first. Nothing was sent.`);
    try {
      if (!this.mail) return { email: "NOT_SENT", to: b.email, lines: b.lines.length };
      const doc = await this.docs.render(STATEMENT_TEMPLATE, b.data);
      await this.mail.send({ firmId: f, to: b.email, replyTo: SYSTEM_REPLY_TO, class: "TRANSACTIONAL", templateKey: STATEMENT_TEMPLATE, idempotencyKey: `money-statement:${randomUUID()}`,
        subject: `Your statement from ${b.head.firmName}`, text: statementText(b.data), attachments: [{ filename: `statement-${b.issuedOn}.pdf`, contentType: doc.contentType, bytes: new Uint8Array(doc.bytes) }] });
    } catch { return { email: "NOT_SENT", to: b.email, lines: b.lines.length }; }
    // audit values are scalars (AuditDetail, AuditValues) and a detail holds no email address: each closing as "INVOICES CAD 165550"
    const closing = b.st.accounts.map((a) => `${a.account} ${a.currency} ${a.closingMinor}`);
    await this.db.$transaction(async (tx) => this.audit.record(tx, { firmId: f, actor: `staff:${ctx.staffId}`, action: "statement.sent", entity: "money_statement", entityKey: b.st.party.id,
      summary: `Statement sent to ${b.head.billTo} (${b.data.period}).`, ...(b.q.caseId ? { caseId: b.q.caseId.toLowerCase() } : {}),
      detail: { partyKind: b.st.party.kind, partyId: b.st.party.id, from: b.q.from ?? null, to: b.q.to ?? null, caseId: b.q.caseId?.toLowerCase() ?? null, lines: b.lines.length, closing },
      before: null, after: { period: String(b.data.period), lines: b.lines.length, closing } }));
    return { email: "SENT", to: b.email, lines: b.lines.length };
  }

  /** Every line of the period (pages of 200 through MoneyStatement), the summary, the letterhead and the client's address. */
  private async build(ctx: StaffContext, kind: string, id: string, input: unknown) {
    const q = parseInput(Period, input ?? {}), lines: StatementLine[] = [];
    let next: string | null = null, st: Awaited<ReturnType<MoneyStatement["statement"]>> | null = null;
    do {
      const p = await this.statements.statement(ctx, kind, id, { ...q, pageSize: "200", ...(next ? { after: next } : {}) });
      st ??= p; lines.push(...p.items); next = p.next;
      if (lines.length > STATEMENT_LINE_MAX) badField("to", `This statement has more than ${STATEMENT_LINE_MAX.toLocaleString("en-CA")} lines: choose a shorter period. Nothing was printed or sent.`);
    } while (next);
    const sum = await this.summaries.summary(ctx, kind, id), f = ctx.firmId, issuedOn = dayOf(this.clock.now());
    const { head, email } = await this.db.$transaction(async (tx) => {
      const firm = await tx.platformFirm.findFirst({ where: ownFirm(f), select: { operatingName: true, businessAddress: true } });
      const who = await partyOf(tx, f, st!.party.kind === "PERSON" ? { personId: st!.party.id } : { companyId: st!.party.id });
      return { head: { firmName: firm?.operatingName ?? "", firmAddress: addressOf(firm?.businessAddress), billTo: st!.party.name ?? who.name }, email: who.email?.trim() || null };
    });
    return { q, st: st!, lines, issuedOn, head, email, data: statementData(st!, lines, sum, head, issuedOn) };
  }
}
