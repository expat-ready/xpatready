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
import { Audit, Db } from "./core.ts";
import { problem, type StaffContext } from "./platform/identity/keys.ts";
// CS-V1 part 2: the checks and their words live in the schemas now (contracts/runtime.ts).
import { CaseDecisionBody, CaseReasonBody, CaseWithdrawBody, DECISION_OUTCOMES, NOTE_MAX, REASON_MAX, type CaseDecisionsView } from "../../contracts/runtime.ts";
import type { z } from "zod";
export { DECISION_OUTCOMES, NOTE_MAX, REASON_MAX };

type Tx = Prisma.TransactionClient;
type B = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (what = "case"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
const invalid = (field: string, detail: string): never => problem(400, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });

/** A body read through its schema (a body that is not an object counts as empty, as before). The first failed check
 *  answers as it always did: a missing reason is 400 "A reason is needed" (REASON_REQUIRED), any other is "Check the
 *  details" (INVALID) with the field named. */
function parsed<S extends z.ZodType>(schema: S, b: unknown): z.infer<S> {
  const r = schema.safeParse(b && typeof b === "object" && !Array.isArray(b) ? b : {});
  if (r.success) return r.data;
  const i = r.error.issues[0], field = String(i.path[0] ?? "body");
  if ((i as { params?: { code?: string } }).params?.code === "REASON_REQUIRED") return problem(400, "A reason is needed", i.message, { code: "REASON_REQUIRED", fields: { [field]: i.message } });
  return invalid(field, i.message);
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
    await new Audit(tx as never).log(c.workspaceId, `staff:${ctx.staffId}`, action, "case", c.id, `${c.caseNumber}: ${summary}`.slice(0, 600), { ...detail, firmId: ctx.firmId } as Prisma.InputJsonValue);
  }

  private async closedEvent(tx: Tx, firmId: string, p: CaseClosedPayload) {
    await tx.moduleEvent.create({ data: { firmId, type: EVENT.CASE_CLOSED, subjectId: p.caseId, payload: CaseClosedPayload.parse(p) } });
  }

  /** CS-C1s: the case's decision and closing, read only (no lock): the closing fields, every active filing of every stage
   *  with "submitted" and its decisions (newest first), and which of the four acts the case's state allows now (`can`:
   *  the same checks as decide/withdraw/close/reopen below, made here once so the screen holds no copy; keys stay with
   *  /platform/me). Firm-scoped as `locked`: another firm's case is 404. */
  async view(ctx: StaffContext, id: string): Promise<CaseDecisionsView> {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const c = await this.db.case.findFirst({
      where: { id, firmKey: ctx.firmKey },
      include: {
        filings: { where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, subjectId: true, stage: { select: { id: true, staffName: true, ord: true } }, record: { select: { submittedOn: true } } } },
        stages: { select: { id: true, staffName: true, state: true } },
        decisions: { orderBy: [{ recordedAt: "desc" }, { id: "desc" }], select: { id: true, filingId: true, kind: true, outcome: true, decidedOn: true, note: true, recordedAt: true, recordedBy: true } },
      },
    });
    if (!c) return notFound();
    const firm = await this.db.platformFirm.findUnique({ where: { key: c.firmKey }, select: { id: true } });
    if (!firm || firm.id !== ctx.firmId) return notFound();
    const subjects = new Map((await this.db.answerSubject.findMany({ where: { id: { in: c.filings.map((f) => f.subjectId) } }, select: { id: true, label: true } })).map((s) => [s.id, s.label]));
    const staffIds = [...new Set(c.decisions.map((d) => d.recordedBy.replace(/^staff:/, "")).filter((x) => UUID.test(x)))];
    const names = new Map((await this.db.platformStaff.findMany({ where: { id: { in: staffIds }, firmId: firm.id }, select: { id: true, displayName: true } })).map((s) => [s.id, s.displayName]));
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const decision = (d: (typeof c.decisions)[number]) => ({ id: d.id, outcome: d.outcome, decidedOn: day(d.decidedOn), note: d.note, recordedAt: d.recordedAt.toISOString(), recordedBy: { staffId: d.recordedBy.replace(/^staff:/, ""), name: names.get(d.recordedBy.replace(/^staff:/, "")) ?? null } });
    const ruled = c.decisions.filter((d) => d.kind === "DECISION");
    const stageOf = (sid: string | null) => { const s = sid ? c.stages.find((x) => x.id === sid) : undefined; return s ? { id: s.id, label: s.staffName } : null; };
    const current = c.stages.find((s) => s.state === "CURRENT") ?? null;
    const filings = c.filings.sort((a, b) => a.stage.ord - b.stage.ord).map((f) => {
      const mine = ruled.filter((d) => d.filingId === f.id).map(decision);
      return { id: f.id, person: subjects.get(f.subjectId) ?? null, stage: { id: f.stage.id, label: f.stage.staffName }, current: f.stage.id === current?.id, submitted: !!f.record, submittedOn: f.record ? day(f.record.submittedOn) : null, latest: mine[0] ?? null, earlier: mine.slice(1) };
    });
    const open = c.status === "OPEN";
    const withdrawal = c.decisions.find((d) => d.kind === "WITHDRAWAL");
    return {
      case: { id: c.id, caseNumber: c.caseNumber, status: c.status, closeOutcome: c.closeOutcome, closedAt: c.closedAt?.toISOString() ?? null, closedReason: c.closedReason,
        withdrawnAt: c.withdrawnAt?.toISOString() ?? null, withdrawnOn: c.closeOutcome === "WITHDRAWN" && withdrawal ? day(withdrawal.decidedOn) : null, withdrawReason: c.withdrawReason,
        closedFromStage: stageOf(c.closedFromStageId), currentStage: current ? { id: current.id, label: current.staffName } : null,
        // Break M1: each active filing's latest decision (never an inactive filing's), as the panel's rows show them.
        decisions: !open && c.closeOutcome === "CLOSED_BY_STAFF" ? filings.filter((f) => f.latest).map((f) => ({ person: f.person, outcome: f.latest!.outcome })) : [] },
      filings, outcomes: [...DECISION_OUTCOMES], sample: true,
      can: {
        decide: open ? filings.filter((f) => f.submitted).map((f) => f.id) : [],
        withdraw: open && ruled.length === 0,
        close: open && filings.length > 0 && filings.every((f) => f.latest),
        reopen: c.status === "CLOSED" && !!c.closeOutcome,
      },
    };
  }

  /** AG-7-33: a decision on one filing recorded as submitted (C8.2's filing record). 201 with the row. */
  async decide(ctx: StaffContext, caseId: string, b: unknown) {
    return this.run(async (tx) => {
      const { c, firmId } = await this.locked(tx, ctx, caseId);
      // STANDARDS §4: the same key again (a retry after a lost answer) returns the first decision, never a second row.
      const v = parsed(CaseDecisionBody, b), key = v.idempotencyKey ?? null; // CS-V1 part 2: every check of the body, in zod
      const { idempotencyKey: _k, ...request } = (b && typeof b === "object" ? b : {}) as B; // the fingerprint reads the body as sent, as before
      const fingerprint = createHash("sha256").update(JSON.stringify([request.filingId, request.outcome, request.decidedOn, request.note ?? null])).digest("hex");
      if (key) {
        const again = await tx.caseDecision.findUnique({ where: { caseId_idempotencyKey: { caseId: c.id, idempotencyKey: key } } });
        if (again && again.idempotencyFingerprint !== fingerprint) conflict("This idempotency key was already used for a different decision; nothing was recorded. Use a new key.", "IDEMPOTENCY_KEY_REUSED");
        if (again) return { decision: { ...again, decidedOn: again.decidedOn.toISOString().slice(0, 10) }, everyFilingDecided: c.filings.every((f) => f.decisions.length > 0), replayed: true };
      }
      if (c.status !== "OPEN") conflict("This case is closed. Reopen it first.", "CASE_CLOSED");
      const outcome = v.outcome, decidedOn = v.decidedOn, note = v.note ?? null;
      const filing = typeof v.filingId === "string" ? c.filings.find((f) => f.id === v.filingId) : undefined;
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
  async withdraw(ctx: StaffContext, caseId: string, b: unknown) {
    return this.run(async (tx) => {
      const { c, firmId, clientType } = await this.locked(tx, ctx, caseId);
      const { reason, withdrawnOn: on } = parsed(CaseWithdrawBody, b);
      if (c.status !== "OPEN") conflict("This case is closed. Reopen it first.", "CASE_CLOSED");
      if (c.decisions.length > 0) conflict("A filing has a decision, so the case cannot be withdrawn (AG-7-50 rules 4 and 6). Close it with a reason instead.", "HAS_DECISION");
      const now = new Date(), stage = c.stages[0]?.id ?? null;
      const row = await tx.caseDecision.create({ data: { firmId, caseId: c.id, filingId: null, kind: "WITHDRAWAL", outcome: "WITHDRAWN", decidedOn: on, note: reason, recordedBy: `staff:${ctx.staffId}` } });
      const after = await tx.case.update({ where: { id: c.id }, data: { status: "CLOSED", closedAt: now, closedReason: reason, closeOutcome: "WITHDRAWN", withdrawnAt: now, withdrawReason: reason, closedFromStageId: stage } });
      await this.audit(tx, ctx, c, "case.withdrawn", "Withdrawn with a reason; the case is closed", { decisionId: row.id, withdrawnOn: on.toISOString().slice(0, 10), reason, closedFromStage: stage });
      await this.closedEvent(tx, firmId, { caseId: c.id, clientId: c.clientId, clientType, reason: "WITHDRAWAL", outcome: "WITHDRAWN", closedAt: now.toISOString() });
      return { case: caseView(after), withdrawal: { id: row.id, decidedOn: on.toISOString().slice(0, 10) } };
    });
  }

  /** AG-7-34 rule 2: staff close a case whose filings all have a decision, with a reason: CLOSED_BY_STAFF. */
  async close(ctx: StaffContext, caseId: string, b: unknown) {
    return this.run(async (tx) => {
      const { c, firmId, clientType } = await this.locked(tx, ctx, caseId);
      const { reason } = parsed(CaseReasonBody, b);
      if (c.status !== "OPEN") conflict("This case is already closed.", "CASE_CLOSED");
      if (!c.filings.length || c.filings.some((f) => !f.decisions.length)) conflict("Every filing needs a decision before the case is closed (AG-7-34 rule 2). Before the decision, withdraw the case.", "NOT_DECIDED");
      const now = new Date(), stage = c.stages[0]?.id ?? null;
      const after = await tx.case.update({ where: { id: c.id }, data: { status: "CLOSED", closedAt: now, closedReason: reason, closeOutcome: "CLOSED_BY_STAFF", closedFromStageId: stage } });
      await this.audit(tx, ctx, c, "case.closed", "Closed by staff with a reason", { closeOutcome: "CLOSED_BY_STAFF", reason, closedFromStage: stage });
      await this.closedEvent(tx, firmId, { caseId: c.id, clientId: c.clientId, clientType, reason: "DECISION", outcome: "CLOSED_BY_STAFF", closedAt: now.toISOString() });
      return { case: caseView(after) };
    });
  }

  /** AG-7-13 rules 2, 3, 7: reopen a closed case with a reason, back at the stage it closed from; the closing fields are
   *  cleared and the audit line keeps their old values. */
  async reopen(ctx: StaffContext, caseId: string, b: unknown) {
    return this.run(async (tx) => {
      const { c, firmId, clientType } = await this.locked(tx, ctx, caseId);
      const { reason } = parsed(CaseReasonBody, b);
      if (c.status !== "CLOSED" || !c.closeOutcome) conflict("This case is open.", "CASE_OPEN");
      const old = { closedAt: c.closedAt?.toISOString() ?? null, closedReason: c.closedReason, closeOutcome: c.closeOutcome, withdrawnAt: c.withdrawnAt?.toISOString() ?? null, withdrawReason: c.withdrawReason, closedFromStage: c.closedFromStageId };
      const now = new Date(), stage = c.closedFromStageId;
      const after = await tx.case.update({ where: { id: c.id }, data: { status: "OPEN", closedAt: null, closedReason: null, closeOutcome: null, withdrawnAt: null, withdrawReason: null, closedFromStageId: null } });
      await this.audit(tx, ctx, c, "case.reopened", "Reopened with a reason", { reason, ...old });
      await tx.moduleEvent.create({ data: { firmId, type: EVENT.CASE_REOPENED, subjectId: c.id, payload: CaseReopenedPayload.parse({ caseId: c.id, clientId: c.clientId, clientType, stageId: stage, previousOutcome: c.closeOutcome, reopenedAt: now.toISOString() }) } });
      return { case: caseView(after), stageId: stage, currentStageId: c.stages[0]?.id ?? null };
    });
  }
}
