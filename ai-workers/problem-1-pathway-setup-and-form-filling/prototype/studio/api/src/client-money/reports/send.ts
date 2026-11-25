// FO-7r part 2 (R1.111; AG-6-28 rules 3, 8-10, §13; AG-6-41; shape r1-111-shape.md, Lead 4 on #3634): the statement as
// a PDF, and Send statement.
//   * GET …/parties/:kind/:id/statement.pdf?from=&to=&caseId= (agent/invoice:show).
//     * It prints every line of the period and part 1's summary, read in one repeatable-read transaction and one query.
//       So the lines, the totals and the summary are one snapshot, and the PDF never contradicts itself (break M4 on
//       #3753). The same C5 scope, firm and figures as part 1's reads apply (ledgerCtes, summaryIn).
//     * A case narrows everything: the lines and the summary's figures (that case's row only), and the page names the
//       case. The case must be one of this client's cases in the caller's scope, else 404 (break M2, M3).
//     * Over STATEMENT_LINE_MAX lines it answers 422 naming `to` ("choose a shorter period"), never a statement cut
//       short silently.
//   * POST …/parties/:kind/:id/statement/send { from?, to?, caseId? } (agent/invoice:issue, AG-6-28 §8).
//     * Sent by a person only, with no schedule (§13: no automatic statements).
//     * It goes to the client's own address only, with no Cc (AG-6-41): a person's email, or a company's current
//       primary contact's. No address, or one the mail port would refuse, answers 422 naming `to`, and nothing is sent
//       (break m2).
//     * The audit line "statement.sent" (who, client, period, case, closing per account; AG-6-28 §9) and the email are
//       one step (break M1, review M2): the email is written in the line's transaction (mailIn) and dispatched after commit.
//       * An audit failure sends nothing.
//       * A refused or failed email rolls the line back and answers { email: "NOT_SENT" }; one the daily cap holds is HELD.
//     * The email's text is a short cover note; the statement itself is the attached PDF (review M1: the message layer
//       takes at most 100,000 characters of text, about 1,400 lines).
//     * The idempotency key is per request, because a person may send the same period again.
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { systemClock, type ClockPort } from "../../../../ports/clock.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { DocumentRenderPort, RenderedDocument } from "../../../../ports/render.ts";
import { firmScope, ownFirm } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import { SYSTEM_REPLY_TO } from "../../platform/identity/session/mail.ts";
import { mailIn, mailReady } from "../../platform/messages/send/mail.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { addressOf } from "../invoices/money.ts";
import { UUID, badField, notFound } from "../invoices/drafts.ts";
import { dayOf } from "../invoices/facts.ts";
import { Day, trustShows } from "../reads/common.ts";
import { failClosed, type MoneyScope, type ScopeOf } from "../reads/visibility.ts";
import { partyOf } from "../trust/service.ts";
import { caseLinks } from "../visibility-adapter.ts";
import { kindOf, partyFor, sortMemory, type Party } from "./common.ts";
import { allLines } from "./statement.ts";
import { STATEMENT_TEMPLATE, StatementDocuments, coverText, statementData } from "./statement-document.ts";
import { summaryIn } from "./summary.ts";

type Tx = Prisma.TransactionClient;
/** The most lines one statement prints (Sample: about 80 pages of the PDF); past it, a shorter period. */
export const STATEMENT_LINE_MAX = 5000;
const Period = z.strictObject({ from: Day.optional(), to: Day.optional(), caseId: z.string().regex(UUID).optional() });
/** The address the mail port takes (MailMessage's own rule): one the database holds but the port refuses is a 422 here. */
const Address = z.email();
/** SENT; HELD: written, waiting for the firm's daily cap (the message layer sends it later); NOT_SENT: refused or failed, nothing recorded. */
export type SendView = { email: "SENT" | "HELD" | "NOT_SENT"; to: string; lines: number };
/** Thrown inside the send transaction when the mail fails, so the audit line rolls back. */
class MailFailed extends Error {}

export class StatementSend {
  constructor(private readonly db: PrismaClient, private readonly scopeOf: ScopeOf = failClosed, private readonly audit: AuditPort<Tx>,
    private readonly mail: MailPort | null, private readonly clock: ClockPort = systemClock, private readonly docs: DocumentRenderPort = new StatementDocuments()) {}

  /** GET …/statement.pdf. */
  async pdf(ctx: StaffContext, kind: string, id: string, query: unknown): Promise<RenderedDocument> {
    return this.docs.render(STATEMENT_TEMPLATE, (await this.build(ctx, kind, id, query)).data);
  }

  /** POST …/statement/send. */
  async send(ctx: StaffContext, kind: string, id: string, body: unknown): Promise<SendView> {
    const b = await this.build(ctx, kind, id, body), f = firmScope(ctx.firmId).firmId;
    if (!b.email) return badField("to", `${b.head.billTo} has no email address on file: add one first. Nothing was sent.`);
    if (!Address.safeParse(b.email).success) return badField("to", `${b.head.billTo}'s email address on file cannot receive mail: correct it first. Nothing was sent.`);
    if (!this.mail) return { email: "NOT_SENT", to: b.email, lines: b.lines };
    const mail = this.mail, doc = await this.docs.render(STATEMENT_TEMPLATE, b.data);
    // audit values are scalars (AuditDetail, AuditValues) and a detail holds no email address: each closing as "INVOICES CAD 165550"
    const closing = b.accounts.map((a) => `${a.account} ${a.currency} ${a.closingMinor}`);
    // review M2: the email is written in the audit line's own transaction (mailIn: the message layer's outbox when the app's
    // MailPort is MessagesMail) and dispatched after the commit, as complaints.ts and card/account.ts do: no email without
    // its line, no line without its email. A refusal or a failure inside rolls both back.
    // review M1: the body is a short cover note (the message layer takes at most 100,000 characters of text); the whole
    // statement travels in the PDF.
    await mailReady(mail, f);
    let out: { held: boolean; dispatch: () => Promise<void> };
    try {
      out = await this.db.$transaction(async (tx) => {
        await this.audit.record(tx, { firmId: f, actor: `staff:${ctx.staffId}`, action: "statement.sent", entity: "money_statement", entityKey: b.party.id,
          summary: `Statement sent to ${b.head.billTo} (${b.data.period}).`, ...(b.caseId ? { caseId: b.caseId } : {}),
          detail: { partyKind: b.party.kind, partyId: b.party.id, from: b.q.from ?? null, to: b.q.to ?? null, caseId: b.caseId ?? null, lines: b.lines, closing },
          before: null, after: { period: String(b.data.period), lines: b.lines, closing } });
        try {
          return await mailIn(mail, tx, { firmId: f, to: b.email!, replyTo: SYSTEM_REPLY_TO, class: "TRANSACTIONAL", templateKey: STATEMENT_TEMPLATE, idempotencyKey: `money-statement:${randomUUID()}`,
            subject: `Your statement from ${b.head.firmName}`, text: coverText(b.data), attachments: [{ filename: `statement-${b.issuedOn}.pdf`, contentType: doc.contentType, bytes: new Uint8Array(doc.bytes) }] });
        } catch { throw new MailFailed(); }
      });
    } catch (e) { if (e instanceof MailFailed) return { email: "NOT_SENT", to: b.email, lines: b.lines }; throw e; }
    await out.dispatch();   // after the commit; a failed dispatch is the message layer's sweep's to retry, never a second send
    return { email: out.held ? "HELD" : "SENT", to: b.email, lines: b.lines };
  }

  /** The whole statement, its summary, the letterhead and the client's address: one snapshot. */
  private async build(ctx: StaffContext, kindRaw: string, id: string, input: unknown) {
    const q = parseInput(Period, input ?? {}), kind = kindOf(kindRaw);
    if (q.from && q.to && q.from > q.to) badField("to", "to is before from.");
    const f = firmScope(ctx.firmId).firmId, scope = await this.scopeOf(ctx), issuedOn = dayOf(this.clock.now()), caseId = q.caseId?.toLowerCase();
    return this.db.$transaction(async (tx) => {
      await sortMemory(tx);
      const party = await partyFor(tx, f, kind, id, scope), showTrust = await trustShows(tx, f);
      if (caseId) await this.caseOfClient(tx, f, party, scope, caseId);
      const st = await allLines(tx, f, party, scope, caseId, showTrust, q.from, q.to, STATEMENT_LINE_MAX);
      if (st.items.length > STATEMENT_LINE_MAX) badField("to", `This statement has more than ${STATEMENT_LINE_MAX.toLocaleString("en-CA")} lines: choose a shorter period. Nothing was printed or sent.`);
      const sum = await summaryIn(tx, f, party, scope, issuedOn, showTrust);
      const firm = await tx.platformFirm.findFirst({ where: ownFirm(f), select: { operatingName: true, businessAddress: true } });
      const who = await partyOf(tx, f, party.kind === "PERSON" ? { personId: party.id } : { companyId: party.id });
      const head = { firmName: firm?.operatingName ?? "", firmAddress: addressOf(firm?.businessAddress), billTo: party.name ?? who.name };
      const label = caseId ? sum.cases.find((c) => c.caseId === caseId)?.caseLabel ?? null : null;
      const view = { accounts: st.accounts, period: { from: q.from ?? null, to: q.to ?? null }, trustShows: showTrust };
      return { q, party, caseId, accounts: st.accounts, lines: st.items.length, issuedOn, head, email: who.email?.trim() || null,
        data: statementData(view, st.items, sum, head, issuedOn, caseId ? { caseId, label } : null) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /** A case named by the request is one of this client's cases (its linked person or company) in the caller's scope, else
   *  the same 404 as an unknown one (break M3 on #3753). */
  private async caseOfClient(tx: Tx, f: string, party: Party, scope: MoneyScope, caseId: string): Promise<void> {
    if (scope !== "ALL" && !scope.cases.includes(caseId)) notFound("case of this client");
    const [hit] = await tx.$queryRaw<{ ok: number }[]>`select 1 as ok from (${caseLinks(f)}) l where l.case_id = ${caseId}::uuid
      and ${party.kind === "PERSON" ? Prisma.sql`l.pid = ${party.id}::uuid` : Prisma.sql`l.cid = ${party.id}::uuid`} limit 1`;
    if (!hit) notFound("case of this client");
  }
}
