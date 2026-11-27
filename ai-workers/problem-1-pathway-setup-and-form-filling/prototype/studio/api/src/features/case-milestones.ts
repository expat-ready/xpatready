// CS-DL3 part 1 (R1.74, QA-591; brief build-lead-c-briefs/CS-DL3.md): a case's government steps, record and cancel only
// (no update route: a due date is never edited, AG-7-96 r7), behind PF-4's guard with declared keys (as case-close.ts).
// Each write is one transaction: the case row locked (another firm: 404, BR-20), the line, one audit line and one outbox
// event, ids only (never the note, reference or reason). Plain parts: ../case-deadlines/milestones.ts.
import { Body, Controller, Get, HttpCode, HttpException, Inject, Injectable, Param, Post, Req } from "@nestjs/common";
import type { CaseMilestone as Row, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { CancelMilestoneBody, MILESTONE_KEYS, MILESTONE_WORDS, RecordMilestoneBody, type CaseMilestonesView, type MilestoneView } from "../../../contracts/milestones.ts";
import { systemClock, type ClockPort } from "../../../ports/clock.ts";
import { CaseMilestonePayload, EVENT } from "../../../ports/events.ts";
import { isoDay, milestoneRemindersOf, showDue, wordsOf } from "../case-deadlines/milestones.ts";
import { deadlineDay } from "../case-stages.ts";
import { Audit, CaseRead, Db } from "../core.ts";
import type { Feature } from "../features.ts";
import { idParam } from "../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../platform/identity/keys.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (what = "case"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const conflict = (detail: string, code: string): never => problem(409, "Not possible now", detail, { code });
/** A body read through its schema: the first failed check answers 400 at its field (a missing reason: REASON_REQUIRED). */
function parsed<S extends z.ZodType>(schema: S, b: unknown): z.infer<S> {
  const r = schema.safeParse(b && typeof b === "object" && !Array.isArray(b) ? b : {});
  if (r.success) return r.data;
  const i = r.error.issues[0], field = String(i.path[0] ?? "body");
  if ((i as { params?: { code?: string } }).params?.code === "REASON_REQUIRED") return problem(400, "A reason is needed", i.message, { code: "REASON_REQUIRED", fields: { [field]: i.message } });
  return problem(400, "Check the details", i.message, { code: "INVALID", fields: { [field]: i.message } });
}

type CaseHead = { id: string; workspaceId: string; caseNumber: string; firmKey: string; status: string; firmId: string };

@Injectable()
export class CaseMilestones {
  /** P-607: today comes from the clock port (a suite sets a FakeClock here). */
  clock: ClockPort = systemClock;
  constructor(@Inject(Db) private readonly db: Db) {}

  /** The case, if it is the session's firm's (locked for this transaction when `lock`); 404 otherwise. */
  private async caseOf(tx: Db | Tx, ctx: StaffContext, id: string, lock: boolean): Promise<CaseHead> {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const hit = lock
      ? await tx.$queryRaw<{ id: string }[]>`select id::text from runtime_case where id = ${id}::uuid and firm_key = ${ctx.firmKey} for update`
      : await tx.$queryRaw<{ id: string }[]>`select id::text from runtime_case where id = ${id}::uuid and firm_key = ${ctx.firmKey}`;
    if (!hit.length) return notFound();
    const c = await tx.case.findUniqueOrThrow({ where: { id }, select: { id: true, workspaceId: true, caseNumber: true, firmKey: true, status: true } });
    const firm = await tx.platformFirm.findUnique({ where: { key: c.firmKey }, select: { id: true } });
    if (!firm || firm.id !== ctx.firmId) return notFound();   // the case's firm key names another platform firm
    return { ...c, firmId: firm.id };
  }

  private async names(firmId: string, actors: (string | null)[]) {
    const ids = [...new Set(actors.filter((a): a is string => !!a).map((a) => a.replace(/^staff:/, "")).filter((x) => UUID.test(x)))];
    return new Map((await this.db.platformStaff.findMany({ where: { id: { in: ids }, firmId }, select: { id: true, displayName: true } })).map((s) => [s.id, s.displayName]));
  }

  private async view(rows: Row[], c: CaseHead): Promise<MilestoneView[]> {
    const names = await this.names(c.firmId, rows.flatMap((r) => [r.recordedBy, r.cancelledBy]));
    const who = (a: string) => { const staffId = a.replace(/^staff:/, ""); return { staffId, name: names.get(staffId) ?? null }; };
    const { cal, today } = await deadlineDay(this.db, this.clock, c.firmKey);
    return rows.map((r) => {
      const due = r.dueOn ? isoDay(r.dueOn) : null, open = !r.cancelledAt;
      let reminders: { offset: number; day: string }[] = [];
      try { reminders = open && due && c.status === "OPEN" ? milestoneRemindersOf(r.id, due, 0, cal).filter((x) => x.day >= today).map((x) => ({ offset: x.offset, day: x.day })) : []; } catch { reminders = []; }
      return { id: r.id, key: r.milestoneKey, words: wordsOf(r.milestoneKey), occurredOn: isoDay(r.occurredOn), dueOn: due, reference: r.reference, note: r.note, recordedAt: r.recordedAt.toISOString(), recordedBy: who(r.recordedBy),
        cancelled: r.cancelledAt ? { at: r.cancelledAt.toISOString(), by: who(r.cancelledBy ?? ""), reason: r.cancelReason ?? "" } : null, deadline: open && due ? showDue(due, cal, today) : null, reminders };
    });
  }

  private async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(fn); } catch (e) {
      if (!(e instanceof HttpException) && /P2034|could not serialize|deadlock/i.test(String((e as Error)?.message ?? e))) conflict("This case changed at the same time. Open it again.", "CHANGED");
      throw e;
    }
  }

  private async record_(tx: Tx, ctx: StaffContext, c: CaseHead, action: string, summary: string, milestoneId: string, milestoneKey: string, type: string) {
    // Ids and codes only: never the note, the reference or a reason (DW7).
    await new Audit(tx as never).log(c.workspaceId, `staff:${ctx.staffId}`, action, "case", c.id, `${c.caseNumber}: ${summary}`.slice(0, 600), { milestoneId, milestoneKey, firmId: c.firmId } as Prisma.InputJsonValue);
    await tx.moduleEvent.create({ data: { firmId: c.firmId, type, subjectId: c.id, payload: CaseMilestonePayload.parse({ caseId: c.id, milestoneId }) } });
  }

  /** GET …/milestones: every step of the case, oldest first, cancelled ones included (shown as cancelled). */
  async list(ctx: StaffContext, caseId: string): Promise<CaseMilestonesView> {
    const c = await this.caseOf(this.db, ctx, caseId, false);
    const rows = await this.db.caseMilestone.findMany({ where: { caseId: c.id, firmId: c.firmId }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
    return { caseId: c.id, milestones: await this.view(rows, c), keys: MILESTONE_KEYS.map((key) => ({ key, words: MILESTONE_WORDS[key] })), sample: true, caseOpen: c.status === "OPEN" };
  }

  /** POST …/milestones: records a step on an open case. */
  async record(ctx: StaffContext, caseId: string, body: unknown): Promise<MilestoneView> {
    const b = parsed(RecordMilestoneBody, body), key = b.idempotencyKey ?? null;
    const fingerprint = createHash("sha256").update(JSON.stringify([b.milestoneKey, b.occurredOn, b.dueOn ?? null, b.reference ?? null, b.note ?? null])).digest("hex");
    const { row, c, replayed } = await this.run(async (tx) => {
      const c = await this.caseOf(tx, ctx, caseId, true);
      if (key) {   // STANDARDS §4: a retry after a lost answer returns the first line
        const again = await tx.caseMilestone.findUnique({ where: { caseId_idempotencyKey: { caseId: c.id, idempotencyKey: key } } });
        if (again && again.idempotencyFingerprint !== fingerprint) conflict("This idempotency key was already used for a different step; nothing was recorded. Use a new key.", "IDEMPOTENCY_KEY_REUSED");
        if (again) return { row: again, c, replayed: true };
      }
      if (c.status !== "OPEN") conflict("This case is closed: reopen it to record a government step.", "CASE_CLOSED");
      const row = await tx.caseMilestone.create({ data: {
        firmId: c.firmId, caseId: c.id, milestoneKey: b.milestoneKey, occurredOn: new Date(`${b.occurredOn}T00:00:00Z`),
        dueOn: b.dueOn ? new Date(`${b.dueOn}T00:00:00Z`) : null, reference: b.reference ?? null, note: b.note ?? null, recordedBy: `staff:${ctx.staffId}`,
        idempotencyKey: key, idempotencyFingerprint: key ? fingerprint : null,
      } });
      await this.record_(tx, ctx, c, "case.milestone_recorded", `government step recorded (${b.milestoneKey}${b.dueOn ? `, due ${b.dueOn}` : ""})`, row.id, b.milestoneKey, EVENT.CASE_MILESTONE_RECORDED);
      return { row, c, replayed: false };
    });
    const v = (await this.view([row], c))[0];
    return replayed ? { ...v, replayed: true } : v;
  }

  /** POST …/milestones/:mid/cancel: cancels a step with a reason; the line stays, shown as cancelled. */
  async cancel(ctx: StaffContext, caseId: string, milestoneId: string, body: unknown): Promise<MilestoneView> {
    const b = parsed(CancelMilestoneBody, body);
    const { row, c } = await this.run(async (tx) => {
      const c = await this.caseOf(tx, ctx, caseId, true);
      if (typeof milestoneId !== "string" || !UUID.test(milestoneId)) return notFound("government step");
      const m = await tx.caseMilestone.findFirst({ where: { id: milestoneId, caseId: c.id, firmId: c.firmId } });
      if (!m) return notFound("government step");
      if (m.cancelledAt) conflict("This step is already cancelled.", "ALREADY_CANCELLED");
      const row = await tx.caseMilestone.update({ where: { id: m.id }, data: { cancelledAt: new Date(), cancelledBy: `staff:${ctx.staffId}`, cancelReason: b.reason } });
      await this.record_(tx, ctx, c, "case.milestone_cancelled", `government step cancelled (${m.milestoneKey})`, m.id, m.milestoneKey, EVENT.CASE_MILESTONE_CANCELLED);
      return { row, c };
    });
    return (await this.view([row], c))[0];
  }
}


type R = { platform?: StaffContext };

@CaseRead()
@Controller("api/runtime/cases/:id/milestones")
export class CaseMilestonesController {
  constructor(@Inject(CaseMilestones) private readonly svc: CaseMilestones) {}

  @Get() @PermissionKeys("agent/case:show")
  list(@Req() r: R, @Param("id") id: string) { return this.svc.list(staffOf(r), id); }

  @Post() @PermissionKeys("agent/case:edit")
  record(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.record(staffOf(r), idParam(id, "case"), b); }   // R1.10 A5: a malformed id is the one 404 before the body

  @Post(":mid/cancel") @HttpCode(200) @PermissionKeys("agent/case:edit")
  cancel(@Req() r: R, @Param("id") id: string, @Param("mid") mid: string, @Body() b: unknown) { return this.svc.cancel(staffOf(r), idParam(id, "case"), idParam(mid, "government step"), b); }
}

export default { controllers: [CaseMilestonesController], providers: [CaseMilestones] } satisfies Feature;
