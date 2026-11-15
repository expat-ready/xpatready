// CS-C1a (map row 77; brief design/briefs/CS-C1.md part 1): a decision on a submitted filing, a whole-case withdrawal
// before any decision, a staff close with a reason, and a reopen with a reason back to the stage the case closed from.
// Rules: AG-7-33 rules 1-3 and 5 (a decision needs agent/case:record-decision and a filing recorded as submitted, C8.2;
// outcome, date and note); AG-7-50 rules 1, 2, 4 and 6, BR-10 (withdraw before the decision, with a date and a reason);
// AG-7-34 rules 2 and 4 (staff close a case whose filings all have a decision, with a reason; a closed case has no moves);
// AG-7-13 rules 2, 3 and 7 (reopen needs agent/case:reopen and a reason, clears the closing fields, the audit line keeps
// the old values). Not built here: the case closing itself (AG-7-34 rule 1 waits on after-decision items, AG-7-49; staff
// close only, Lead ruling), a filing's own withdrawal and status move (AG-7-50 rule 3, AG-7-33 rule 5: no filing stage
// field yet, D9 Q54), and the count and limit check (part 2). Outcomes are a Sample list until cited (AG-7-33 rule 4).
// Every change is one transaction: the case row is locked first, then the rows, the case's audit line, and the outbox
// event (module_event, firm id from platform_firm by the case's firm key until CS-W1) last. Another firm's case is 404.
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { CaseClosedPayload, CaseReopenedPayload, EVENT } from "../../ports/events.ts";
import { Db } from "./core.ts";
import { problem, type StaffContext } from "./platform/identity/keys.ts";

type Tx = Prisma.TransactionClient;
type B = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Sample until cited (AG-7-33 rules 3-4: APPROVED, REFUSED, or another value from the pack). */
export const DECISION_OUTCOMES = ["APPROVED", "REFUSED"] as const;
export const REASON_MAX = 1000, NOTE_MAX = 2000;

const notFound = (what = "case"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
const invalid = (field: string, detail: string): never => problem(400, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });

/** Words a person reads: no NUL or other control character but tab and new line (break m1). */
const BAD_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/** Spaces and invisible characters only count as empty (break m4). */
const blank = (t: string) => !t.replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
function reasonOf(b: B): string {
  const r = typeof b.reason === "string" ? b.reason.trim() : "";
  if (BAD_TEXT.test(r)) return invalid("reason", "Plain text only.");
  if (blank(r)) return problem(400, "A reason is needed", "Give a reason.", { code: "REASON_REQUIRED", fields: { reason: "Give a reason." } });
  if (r.length > REASON_MAX) return invalid("reason", `At most ${REASON_MAX} characters.`);
  return r;
}
function dateOf(b: B, field: string): Date {
  const d = b[field];
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d || d < "1900-01-01" || d > "2200-12-31")
    return invalid(field, "A real date as YYYY-MM-DD.");
  return new Date(`${d}T00:00:00Z`);
}

const caseView = (c: { id: string; caseNumber: string; status: string; closedAt: Date | null; closedReason: string | null; closeOutcome: string | null; withdrawnAt: Date | null; withdrawReason: string | null; closedFromStageId: string | null }) =>
  ({ id: c.id, caseNumber: c.caseNumber, status: c.status, closedAt: c.closedAt, closedReason: c.closedReason, closeOutcome: c.closeOutcome, withdrawnAt: c.withdrawnAt, withdrawReason: c.withdrawReason, closedFromStageId: c.closedFromStageId });

@Injectable()
export class CaseClose {
  constructor(@Inject(Db) private readonly db: Db) {}

  /** Called last inside every change's transaction; a test overrides it to force a rollback (DW6). */
  protected async beforeCommit(_tx: Tx): Promise<void> {}

  /** The case locked for this transaction, if it is the session's firm's; 404 otherwise (never 403: BR-20). */
  private async locked(tx: Tx, ctx: StaffContext, id: string) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const hit = await tx.$queryRaw<{ id: string }[]>`select id::text from runtime_case where id = ${id}::uuid and firm_key = ${ctx.firmKey} for update`;
    if (!hit.length) return notFound();
    const c = await tx.case.findUniqueOrThrow({
      where: { id },
      include: {
        filings: { where: { active: true }, select: { id: true, record: { select: { id: true } }, decisions: { where: { kind: "DECISION" }, select: { id: true } } } },
        stages: { where: { state: "CURRENT" }, select: { id: true } },
        decisions: { where: { kind: "DECISION" }, select: { id: true } },   // any filing's, active or not (review m2)
      },
    });
    const firm = await tx.platformFirm.findUnique({ where: { key: c.firmKey }, select: { id: true } });
    if (!firm || firm.id !== ctx.firmId) return notFound();   // the case's firm key names another platform firm
    // The case's group (SA-3-4): the client type of the Pathway its combination sits under (the PATHWAY node of program_def).
    const up = await tx.$queryRaw<{ client_type: string | null }[]>`
      with recursive up as (select p.* from program_def p join combination x on x.program_def_id = p.id where x.id = ${c.combinationId}::uuid
        union all select p.* from program_def p join up on p.workspace_id = up.workspace_id and p.program_node_key = up.parent_node_key)
      select client_type from up where node_kind = 'PATHWAY' limit 1`;
    const t = up[0]?.client_type, clientType: "INDIVIDUAL" | "CORPORATE" | null = t === "INDIVIDUAL" || t === "CORPORATE" ? t : null;
    return { c, firmId: firm.id, clientType };
  }

  private async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(async (tx) => { const r = await fn(tx); await this.beforeCommit(tx); return r; }); }
    catch (e) {
      if (e instanceof HttpException) throw e;
      const m = String((e as Error)?.message ?? e);
      if (/P2034|could not serialize|deadlock|runtime_case_closing_fields_check|runtime_case_status_check/i.test(m)) conflict("This case changed at the same time. Open it again.", "CHANGED");
      throw e;
    }
  }

  private async audit(tx: Tx, ctx: StaffContext, c: { id: string; workspaceId: string; caseNumber: string }, action: string, summary: string, detail: Record<string, unknown>) {
    await tx.auditEvent.create({ data: { workspaceId: c.workspaceId, actor: `staff:${ctx.staffId}`, action, entity: "case", entityKey: c.id, summary: `${c.caseNumber}: ${summary}`.slice(0, 600), detail: { ...detail, firmId: ctx.firmId } as Prisma.InputJsonValue } });
  }

  private async closedEvent(tx: Tx, firmId: string, p: CaseClosedPayload) {
    await tx.moduleEvent.create({ data: { firmId, type: EVENT.CASE_CLOSED, subjectId: p.caseId, payload: CaseClosedPayload.parse(p) } });
  }

  /** AG-7-33: a decision on one filing recorded as submitted (C8.2's filing record). 201 with the row. */
  async decide(ctx: StaffContext, caseId: string, b: B) {
    return this.run(async (tx) => {
      const { c, firmId } = await this.locked(tx, ctx, caseId);
      // STANDARDS §4: the same key again (a retry after a lost answer) returns the first decision, never a second row.
      const key = b.idempotencyKey == null ? null : typeof b.idempotencyKey === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(b.idempotencyKey) ? b.idempotencyKey : invalid("idempotencyKey", "1-100 letters, digits, . _ : -");
      const { idempotencyKey: _k, ...request } = b;
      const fingerprint = createHash("sha256").update(JSON.stringify([request.filingId, request.outcome, request.decidedOn, request.note ?? null])).digest("hex");
      if (key) {
        const again = await tx.caseDecision.findUnique({ where: { caseId_idempotencyKey: { caseId: c.id, idempotencyKey: key } } });
        if (again && again.idempotencyFingerprint !== fingerprint) conflict("This idempotency key was already used for a different decision; nothing was recorded. Use a new key.", "IDEMPOTENCY_KEY_REUSED");
        if (again) return { decision: { ...again, decidedOn: again.decidedOn.toISOString().slice(0, 10) }, everyFilingDecided: c.filings.every((f) => f.decisions.length > 0), replayed: true };
      }
      if (c.status !== "OPEN") conflict("This case is closed. Reopen it first.", "CASE_CLOSED");
      const outcome = typeof b.outcome === "string" ? b.outcome : "";
      if (!(DECISION_OUTCOMES as readonly string[]).includes(outcome)) invalid("outcome", `One of ${DECISION_OUTCOMES.join(", ")} (Sample list).`);
      const decidedOn = dateOf(b, "decidedOn");
      const note = b.note == null || b.note === "" ? null : typeof b.note === "string" && b.note.trim().length <= NOTE_MAX && !BAD_TEXT.test(b.note) ? b.note.trim() || null : invalid("note", `Plain text, at most ${NOTE_MAX} characters.`);
      const filing = typeof b.filingId === "string" ? c.filings.find((f) => f.id === b.filingId) : undefined;
      if (!filing) return notFound("filing on this case");
      if (!filing.record) conflict("This filing is not recorded as submitted, so it has no decision yet (AG-7-33 rule 2).", "NOT_SUBMITTED");
      const row = await tx.caseDecision.create({ data: { firmId, caseId: c.id, filingId: filing.id, kind: "DECISION", outcome, decidedOn, note, recordedBy: `staff:${ctx.staffId}`, idempotencyKey: key, idempotencyFingerprint: key ? fingerprint : null } });
      const correction = filing.decisions.length > 0;
      await this.audit(tx, ctx, c, "case.decision.recorded", `Decision ${outcome.toLowerCase()} recorded${correction ? " (a correction: a new row)" : ""}`, { decisionId: row.id, filingId: filing.id, outcome, decidedOn: decidedOn.toISOString().slice(0, 10), correction });
      const decided = c.filings.every((f) => f.id === filing.id || f.decisions.length > 0);
      return { decision: { ...row, decidedOn: row.decidedOn.toISOString().slice(0, 10) }, everyFilingDecided: decided };
    });
  }

  /** AG-7-50, BR-10: withdraw the whole case before any decision, with a date and a reason; it closes WITHDRAWN. */
  async withdraw(ctx: StaffContext, caseId: string, b: B) {
    return this.run(async (tx) => {
      const { c, firmId, clientType } = await this.locked(tx, ctx, caseId);
      const reason = reasonOf(b), on = dateOf(b, "withdrawnOn");
      if (c.status !== "OPEN") conflict("This case is closed. Reopen it first.", "CASE_CLOSED");
      if (c.decisions.length > 0) conflict("A filing has a decision, so the case cannot be withdrawn (AG-7-50 rules 4 and 6). Close it with a reason instead.", "HAS_DECISION");
      const now = new Date(), stage = c.stages[0]?.id ?? null;
      const row = await tx.caseDecision.create({ data: { firmId, caseId: c.id, filingId: null, kind: "WITHDRAWAL", outcome: "WITHDRAWN", decidedOn: on, note: reason, recordedBy: `staff:${ctx.staffId}` } });
      const after = await tx.case.update({ where: { id: c.id }, data: { status: "CLOSED", closedAt: now, closedReason: reason, closeOutcome: "WITHDRAWN", withdrawnAt: now, withdrawReason: reason, closedFromStageId: stage } });
      await this.audit(tx, ctx, c, "case.withdrawn", "Withdrawn with a reason; the case is closed", { decisionId: row.id, withdrawnOn: on.toISOString().slice(0, 10), reason, closedFromStage: stage });
      await this.closedEvent(tx, firmId, { caseId: c.id, clientId: null, clientType, reason: "WITHDRAWAL", outcome: "WITHDRAWN", closedAt: now.toISOString() });
      return { case: caseView(after), withdrawal: { id: row.id, decidedOn: on.toISOString().slice(0, 10) } };
    });
  }

  /** AG-7-34 rule 2: staff close a case whose filings all have a decision, with a reason: CLOSED_BY_STAFF. */
  async close(ctx: StaffContext, caseId: string, b: B) {
    return this.run(async (tx) => {
      const { c, firmId, clientType } = await this.locked(tx, ctx, caseId);
      const reason = reasonOf(b);
      if (c.status !== "OPEN") conflict("This case is already closed.", "CASE_CLOSED");
      if (!c.filings.length || c.filings.some((f) => !f.decisions.length)) conflict("Every filing needs a decision before the case is closed (AG-7-34 rule 2). Before the decision, withdraw the case.", "NOT_DECIDED");
      const now = new Date(), stage = c.stages[0]?.id ?? null;
      const after = await tx.case.update({ where: { id: c.id }, data: { status: "CLOSED", closedAt: now, closedReason: reason, closeOutcome: "CLOSED_BY_STAFF", closedFromStageId: stage } });
      await this.audit(tx, ctx, c, "case.closed", "Closed by staff with a reason", { closeOutcome: "CLOSED_BY_STAFF", reason, closedFromStage: stage });
      await this.closedEvent(tx, firmId, { caseId: c.id, clientId: null, clientType, reason: "DECISION", outcome: "CLOSED_BY_STAFF", closedAt: now.toISOString() });
      return { case: caseView(after) };
    });
  }

  /** AG-7-13 rules 2, 3, 7: reopen a closed case with a reason, back at the stage it closed from; the closing fields are
   *  cleared and the audit line keeps their old values. */
  async reopen(ctx: StaffContext, caseId: string, b: B) {
    return this.run(async (tx) => {
      const { c, firmId, clientType } = await this.locked(tx, ctx, caseId);
      const reason = reasonOf(b);
      if (c.status !== "CLOSED" || !c.closeOutcome) conflict("This case is open.", "CASE_OPEN");
      const old = { closedAt: c.closedAt?.toISOString() ?? null, closedReason: c.closedReason, closeOutcome: c.closeOutcome, withdrawnAt: c.withdrawnAt?.toISOString() ?? null, withdrawReason: c.withdrawReason, closedFromStage: c.closedFromStageId };
      const now = new Date(), stage = c.closedFromStageId;
      const after = await tx.case.update({ where: { id: c.id }, data: { status: "OPEN", closedAt: null, closedReason: null, closeOutcome: null, withdrawnAt: null, withdrawReason: null, closedFromStageId: null } });
      await this.audit(tx, ctx, c, "case.reopened", "Reopened with a reason", { reason, ...old });
      await tx.moduleEvent.create({ data: { firmId, type: EVENT.CASE_REOPENED, subjectId: c.id, payload: CaseReopenedPayload.parse({ caseId: c.id, clientId: null, clientType, stageId: stage, previousOutcome: c.closeOutcome, reopenedAt: now.toISOString() }) } });
      return { case: caseView(after), stageId: stage, currentStageId: c.stages[0]?.id ?? null };
    });
  }
}
