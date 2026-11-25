// PF-20 part 1 (R1.36; map row 36; AG-2-31 rules 4-8, AG-2-33; FO-12a's Done when, rev 11; P-584 (2)): the automation
// engine. A module enrols a person inside its own transaction (enrol), then schedule queues one JobPort job per step at
// its time. The step's job (the Conductor) locks the step run and checks the run, the firm's recipe on, the recipe
// registered and the step's mode, then sends through PF-19b's MessagePort, whose consent gate judges the person then
// (AG-2-33 rule 1): without the purpose's consent the step is SKIPPED with the gate's reason and the run goes on; a
// withdrawal ends the run "unsubscribed" (AG-2-31 rule 8). Switching a recipe off ends its runs, cancels every queued step
// and withdraws its messages still waiting in the outbox, in one transaction, then cancels their jobs. A step job run
// twice sends once (row lock, QUEUED state, outbox key auto.step:<id>). Later (PF-20 part 2): approving "Ask me first",
// a sweep for a job lost between commit and schedule, quiet hours and rate caps beyond the gate's daily cap.
import type { Prisma, PrismaClient } from "@prisma/client";
import { z, ZodError } from "zod";
import { systemClock, type ClockPort } from "../../../../ports/clock.ts";
import type { AuditPort } from "../../../../ports/audit.ts";
import { normaliseAddress, type Channel, type Subject } from "../../../../ports/consent.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import { MessageRefused, type MessagePort } from "../../../../ports/messages.ts";
import { firmScope, withFirm } from "../firm-scope.ts";
import type { AutomationRegistry, Recipe } from "./registry.ts";

type Tx = Prisma.TransactionClient;
export const STEP_QUEUE = "automation.step";
export const stepJobKey = (stepRunId: string) => `auto.step:${stepRunId}`;
/** Why a run ended (AG-2-31 rule 8, plus the engine's own two). */
export const EXIT = { RECIPE_OFF: "recipe switched off", FINISHED: "last step done", UNSUBSCRIBED: "unsubscribed" } as const;
/** Why a step was skipped or cancelled, in plain words (the gate's own reasons are kept as it gives them). */
export const STEP_REASON = { RECIPE_OFF: "recipe switched off", RUN_ENDED: "run ended", NOT_REGISTERED: "recipe not registered", STEP_OFF: "step switched off", ASK: "waits for a person's approval" } as const;
/** Gate reasons that mean the person said stop: the run ends there (AG-2-31 rule 8, AG-2-33 rule 4). */
const STOPPED = /^(WITHDRAWN|ADDRESS_UNSUBSCRIBED|SUPPRESSED: (UNSUBSCRIBE|STOP|COMPLAINT))\b/;

export type EnrolInput = { firmId: string; recipeKey: string; subject: Subject; channel: Channel; address: string; context?: { kind: string; id: string }; by: string };
export type EnrolResult = { started: true; runId: string; stepRunIds: string[] } | { started: false; reason: "recipe off" | "already running" | "not registered" | "no steps"; runId?: string };
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
/** Checked before any SQL runs, so a refused enrolment never spoils the caller's transaction (break m3): a person or a
 *  case party (never staff), uuids, a lead or prospect context, and an address the channel can use. */
const EnrolShape = z.object({ firmId: Uuid, recipeKey: z.string().max(100), subject: z.strictObject({ kind: z.enum(["FO_PERSON", "CASE_PARTY"]), id: Uuid }), channel: z.enum(["EMAIL", "WHATSAPP"]),
  address: z.string().min(3).max(320), context: z.strictObject({ kind: z.string().regex(/^[a-z][a-z_]{0,39}$/), id: Uuid }).optional(), by: z.string().min(1).max(200) });
/** Refused: an enrolment whose person, address or context the engine cannot use (nothing was written). */
export class EnrolRefused extends Error { constructor(message: string) { super(message); this.name = "EnrolRefused"; } }

/** The messages module's own withdrawal of rows it still holds QUEUED (PF-19b: Messages.withdrawQueued), so a step whose
 *  message waits (the daily limit, or between commit and send) is never sent after its recipe is switched off (break M2). */
export type QueuedWithdrawal = { withdrawQueued(tx: Tx, firmId: string, outboxIds: string[], reason: string): Promise<number> };
export type AutomationDeps = { db: PrismaClient; messages: MessagePort<Tx> & QueuedWithdrawal; jobs: JobPort; audit: AuditPort<Tx>; registry: AutomationRegistry; clock?: ClockPort };

export class Automation {
  readonly #clock: ClockPort;
  constructor(private readonly d: AutomationDeps) { this.#clock = d.clock ?? systemClock; }

  /** The step worker on JobPort (once, at start-up). */
  async register(): Promise<void> {
    await this.d.jobs.handle(STEP_QUEUE, async (j) => { if (j.firmId) await this.runStep(j.firmId, String(j.payload.stepRunId)); });
  }
  async onModuleInit(): Promise<void> { await this.register(); }

  /** Makes the firm's copy of each registered recipe it lacks (on as the registry says, AG-2-31 rule 1), in `tx`. */
  async ensure(tx: Tx, firmId: string, only?: Recipe[]): Promise<void> {
    const want = only ?? this.d.registry.list();
    const have = new Set((await tx.autoRecipe.findMany({ where: firmScope(firmId, { key: { in: want.map((r) => r.key) } }), select: { key: true } })).map((r) => r.key));
    for (const r of want.filter((x) => !have.has(x.key))) {
      // ON CONFLICT DO NOTHING: two first reads at once make one copy.
      const made = await tx.$queryRaw<{ id: string }[]>`INSERT INTO auto_recipe (id, firm_id, module, key, "on", updated_by) VALUES (gen_random_uuid(), ${firmId}::uuid, ${r.module}, ${r.key}, ${r.defaultOn}, 'system:automation') ON CONFLICT (firm_id, key) DO NOTHING RETURNING id`;
      if (!made.length) continue;
      await tx.autoRecipeStep.createMany({ data: r.steps.map((s, i) => ({ firmId, recipeId: made[0].id, position: i + 1, delayMinutes: s.delayMinutes, class: s.class, mode: s.mode, subject: s.subject, body: s.body })) });
    }
  }

  /** The firm's recipes: every registered one (made on first read), its steps, and how many people are in it now. */
  async recipes(firmId: string) {
    return withFirm(firmId, () => this.d.db.$transaction(async (tx) => {
      await this.ensure(tx, firmId);
      const rows = await tx.autoRecipe.findMany({ where: firmScope(firmId, {}), orderBy: { key: "asc" }, include: { steps: { orderBy: { position: "asc" } } } });
      const running = await tx.autoRun.groupBy({ by: ["recipeId"], where: firmScope(firmId, { state: "RUNNING" as const }), _count: { _all: true } });
      const count = new Map(running.map((g) => [g.recipeId, (g._count as { _all: number })._all] as const));
      return rows.map((r) => {
        const def = this.d.registry.get(r.key);
        return {
          key: r.key, module: r.module, label: def?.label ?? r.key, description: def?.description ?? null, registered: !!def, on: r.on, running: count.get(r.id) ?? 0,
          updatedAt: r.updatedAt.toISOString(), steps: r.steps.map((s) => ({ position: s.position, delayMinutes: s.delayMinutes, class: s.class, mode: s.mode, subject: s.subject })),
        };
      });
    }));
  }

  /** Switches the firm's recipe on or off (agent/template:configure). Off ends its running runs and cancels every queued
   *  step in the same transaction, then cancels their jobs. Unknown key → null. */
  async setOn(firmId: string, key: string, on: boolean, by: string): Promise<{ key: string; on: boolean; endedRuns: number; cancelledSteps: number } | null> {
    const def = this.d.registry.get(key);
    if (!def) return null;
    const out = await withFirm(firmId, () => this.d.db.$transaction(async (tx) => {
      await this.ensure(tx, firmId, [def]);
      const [r] = await tx.$queryRaw<{ id: string; on: boolean }[]>`SELECT id, "on" FROM auto_recipe WHERE firm_id = ${firmId}::uuid AND key = ${key} FOR UPDATE`;
      const now = this.#clock.now();
      let ended: string[] = [], cancelled: string[] = [], withdrawn = 0;
      // Off always ends what still runs, even when already off (break M1); enrol holds this row FOR SHARE meanwhile.
      if (!on) ({ ended, cancelled, withdrawn } = await this.#endRuns(tx, firmId, { recipeId: r.id }, EXIT.RECIPE_OFF, STEP_REASON.RECIPE_OFF));
      if (r.on !== on || ended.length) {
        if (r.on !== on) await tx.autoRecipe.update({ where: { id: r.id }, data: { on, updatedAt: now, updatedBy: by } });
        const queued = cancelled.length + withdrawn;
        await this.d.audit.record(tx, { firmId, actor: by, action: on ? "automation.recipe.on" : "automation.recipe.off", entity: "plat_auto_recipe", entityKey: r.id,
          summary: on ? `Automatic messages "${def.label}" switched on.` : `Automatic messages "${def.label}" switched off: ${ended.length} running, ${queued} queued messages cancelled.`,
          detail: { key, endedRuns: ended.length, cancelledSteps: cancelled.length, withdrawnMessages: withdrawn }, before: { on: r.on }, after: { on } });
      }
      return { ended, cancelled, withdrawn };
    }));
    for (const id of out.cancelled) await this.d.jobs.cancel(stepJobKey(id));
    return { key, on, endedRuns: out.ended.length, cancelledSteps: out.cancelled.length + out.withdrawn };
  }

  /** Enrols one person in one recipe inside the caller's transaction (AG-2-31 rules 4, 9). Nothing starts while the
   *  firm's recipe is off, and a person already running in it is not enrolled twice. Call schedule after the commit. */
  async enrol(tx: Tx, input: EnrolInput): Promise<EnrolResult> {
    const shape = EnrolShape.safeParse(input);
    if (!shape.success) throw new EnrolRefused(`enrol: ${shape.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
    let address: string;
    try { address = normaliseAddress(input.channel, input.address); } catch { throw new EnrolRefused(`enrol: not an address ${input.channel === "EMAIL" ? "email" : "WhatsApp"} can use`); }
    const e = { ...input, address };
    const def = this.d.registry.get(e.recipeKey);
    if (!def) return { started: false, reason: "not registered" };
    await this.ensure(tx, e.firmId, [def]);
    // FOR SHARE: a switch-off (FOR UPDATE in setOn) waits for this enrolment, or this one waits and reads off (break M1).
    const [lock] = await tx.$queryRaw<{ id: string; on: boolean }[]>`SELECT id, "on" FROM auto_recipe WHERE firm_id = ${e.firmId}::uuid AND key = ${e.recipeKey} FOR SHARE`;
    const r = await tx.autoRecipe.findUniqueOrThrow({ where: { id: lock.id }, include: { steps: { orderBy: { position: "asc" } } } });
    if (!lock.on) return { started: false, reason: "recipe off" };
    if (!r.steps.length) return { started: false, reason: "no steps" };
    const now = this.#clock.now();
    const made = await tx.$queryRaw<{ id: string }[]>`INSERT INTO auto_run (id, firm_id, recipe_id, subject_kind, subject_id, channel, address, context_kind, context_id, enrolled_by, started_at)
      VALUES (gen_random_uuid(), ${e.firmId}::uuid, ${r.id}::uuid, ${e.subject.kind}, ${e.subject.id}::uuid, ${e.channel}, ${e.address}, ${e.context?.kind ?? null}, ${e.context?.id ?? null}::uuid, ${e.by}, ${now})
      ON CONFLICT (firm_id, recipe_id, subject_kind, subject_id) WHERE state = 'RUNNING' DO NOTHING RETURNING id`;
    if (!made.length) {
      const run = await tx.autoRun.findFirst({ where: firmScope(e.firmId, { recipeId: r.id, subjectKind: e.subject.kind, subjectId: e.subject.id, state: "RUNNING" as const }), select: { id: true } });
      return { started: false, reason: "already running", runId: run?.id };
    }
    const runId = made[0].id, stepRunIds: string[] = [];
    for (const s of r.steps) {
      const sr = await tx.autoStepRun.create({ data: { firmId: e.firmId, runId, position: s.position, dueAt: new Date(now.getTime() + s.delayMinutes * 60_000) }, select: { id: true } });
      stepRunIds.push(sr.id);
    }
    return { started: true, runId, stepRunIds };
  }

  /** After the enrolling transaction commits: one job per step at its due time. */
  async schedule(firmId: string, stepRunIds: string[]): Promise<void> {
    if (!stepRunIds.length) return;
    const rows = await withFirm(firmId, () => this.d.db.autoStepRun.findMany({ where: firmScope(firmId, { id: { in: stepRunIds }, state: "QUEUED" as const }), select: { id: true, dueAt: true } }));
    for (const s of rows) await this.d.jobs.schedule(STEP_QUEUE, s.dueAt, { stepRunId: s.id }, { key: stepJobKey(s.id), firmId });
  }

  /** Ends a person's running runs (a goal met: a reply, a booking, won, lost; AG-2-31 rule 8) in the caller's
   *  transaction; returns the step runs whose jobs to cancel after the commit (cancelJobs). */
  async endRunsFor(tx: Tx, firmId: string, subject: Subject, reason: string): Promise<string[]> {
    return (await this.#endRuns(tx, firmId, { subjectKind: subject.kind, subjectId: subject.id }, reason, STEP_REASON.RUN_ENDED)).cancelled;
  }
  async cancelJobs(stepRunIds: string[]): Promise<void> { for (const id of stepRunIds) await this.d.jobs.cancel(stepJobKey(id)); }

  /** A person's runs, newest first ("Enrolled in", AG-2-94), each with its steps' states. */
  async runsFor(firmId: string, subject: Subject) {
    const runs = await withFirm(firmId, () => this.d.db.autoRun.findMany({ where: firmScope(firmId, { subjectKind: subject.kind, subjectId: subject.id }), orderBy: { startedAt: "desc" }, take: 50,
      include: { recipe: { select: { key: true } }, steps: { orderBy: { position: "asc" } } } }));
    return runs.map((r) => ({ id: r.id, recipeKey: r.recipe.key, label: this.d.registry.get(r.recipe.key)?.label ?? r.recipe.key, state: r.state, exitReason: r.exitReason, startedAt: r.startedAt.toISOString(), endedAt: r.endedAt?.toISOString() ?? null,
      steps: r.steps.map((s) => ({ position: s.position, dueAt: s.dueAt.toISOString(), state: s.state, reason: s.reason, outboxId: s.outboxId, doneAt: s.doneAt?.toISOString() ?? null })) }));
  }

  async #endRuns(tx: Tx, firmId: string, where: Prisma.AutoRunWhereInput, exit: string, stepReason: string): Promise<{ ended: string[]; cancelled: string[]; withdrawn: number }> {
    const now = this.#clock.now();
    const runs = (await tx.autoRun.findMany({ where: firmScope(firmId, { ...where, state: "RUNNING" as const }), select: { id: true } })).map((r) => r.id);
    if (!runs.length) return { ended: [], cancelled: [], withdrawn: 0 };
    // A step handed to the outbox whose message still waits there (the daily limit, not yet sent) is withdrawn (break M2).
    const handed = (await tx.autoStepRun.findMany({ where: firmScope(firmId, { runId: { in: runs }, state: "SUCCESS" as const, outboxId: { not: null } }), select: { outboxId: true } })).map((s) => s.outboxId as string);
    const withdrawn = handed.length ? await this.d.messages.withdrawQueued(tx, firmId, handed, `CANCELLED: ${stepReason}`) : 0;
    // The rows this UPDATE changed (a step being sent holds its row: the UPDATE waits, re-reads it SUCCESS and leaves it, so
    // the count names only what was cancelled; review m1). A step awaiting approval is closed too (review m5).
    const cancelled = (await tx.autoStepRun.updateManyAndReturn({ where: firmScope(firmId, { runId: { in: runs }, state: { in: ["QUEUED", "AWAITING_APPROVAL"] as ("QUEUED" | "AWAITING_APPROVAL")[] } }), data: { state: "CANCELLED", reason: stepReason, doneAt: now }, select: { id: true } })).map((s) => s.id);
    await tx.autoRun.updateMany({ where: firmScope(firmId, { id: { in: runs }, state: "RUNNING" as const }), data: { state: "ENDED", exitReason: exit, endedAt: now } });
    return { ended: runs, cancelled, withdrawn };
  }

  /** The Conductor: one step at its time (see the file's head). Returns the step run's state afterwards. */
  async runStep(firmId: string, stepRunId: string): Promise<string | null> {
    if (!Uuid.safeParse(firmId).success || !Uuid.safeParse(stepRunId).success) return null;
    const out = await withFirm(firmId, () => this.d.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auto_step_run WHERE firm_id = ${firmId}::uuid AND id = ${stepRunId}::uuid FOR UPDATE`;
      if (!locked.length) return null;
      const sr = await tx.autoStepRun.findUniqueOrThrow({ where: { id: stepRunId }, include: { run: { include: { recipe: { include: { steps: { orderBy: { position: "asc" } } } } } } } });
      if (sr.state !== "QUEUED") return { state: sr.state, outboxId: null, cancel: [] as string[] };
      const run = sr.run, recipe = run.recipe, step = recipe.steps.find((s) => s.position === sr.position), now = this.#clock.now();
      if (now.getTime() < sr.dueAt.getTime()) return { state: sr.state, outboxId: null, cancel: [] as string[] };   // not yet its time (break m1)
      const finish = async (state: "SUCCESS" | "SKIPPED" | "AWAITING_APPROVAL" | "FAILED" | "CANCELLED", reason: string | null, outboxId: string | null = null) => {
        await tx.autoStepRun.update({ where: { id: sr.id }, data: { state, reason, outboxId, doneAt: now } });
        let cancel: string[] = [];
        // The run ends with the step when the person said stop, or when its recipe is off (review M1: the whole run, so
        // switching the recipe on again never sends its later steps).
        const exit = state === "SKIPPED" && reason !== null && STOPPED.test(reason) ? EXIT.UNSUBSCRIBED : reason === STEP_REASON.RECIPE_OFF && run.state === "RUNNING" ? EXIT.RECIPE_OFF : null;
        if (exit) cancel = (await this.#endRuns(tx, firmId, { id: run.id }, exit, exit === EXIT.RECIPE_OFF ? STEP_REASON.RECIPE_OFF : STEP_REASON.RUN_ENDED)).cancelled;
        else if (run.state === "RUNNING" && (await tx.autoStepRun.count({ where: firmScope(firmId, { runId: run.id, state: { in: ["QUEUED", "AWAITING_APPROVAL"] as ("QUEUED" | "AWAITING_APPROVAL")[] } }) })) === 0)
          await tx.autoRun.update({ where: { id: run.id }, data: { state: "ENDED", exitReason: EXIT.FINISHED, endedAt: now } });
        return { state, outboxId, cancel };
      };
      if (run.state !== "RUNNING") return finish("CANCELLED", STEP_REASON.RUN_ENDED);
      if (!recipe.on) return finish("CANCELLED", STEP_REASON.RECIPE_OFF);
      if (!this.d.registry.has(recipe.key) || !step) return finish("SKIPPED", STEP_REASON.NOT_REGISTERED);
      if (step.mode === "OFF") return finish("SKIPPED", STEP_REASON.STEP_OFF);
      if (step.mode === "ASK") return finish("AWAITING_APPROVAL", STEP_REASON.ASK);
      // The stricter class wins: a step the module now registers as MARKETING is marketing on older copies (break m6).
      const cls = step.class === "MARKETING" || this.d.registry.get(recipe.key)?.steps[step.position - 1]?.class === "MARKETING" ? "MARKETING" : "SERVICE";
      try {
        const sent = await this.d.messages.send(tx, {
          firmId, person: { kind: run.subjectKind as Subject["kind"], id: run.subjectId }, channel: run.channel as Channel, class: cls,
          address: run.address, content: { subject: step.subject, text: step.body }, idempotencyKey: stepJobKey(sr.id),
        });
        return sent.state === "SUPPRESSED" ? finish("SKIPPED", sent.reason ?? "suppressed") : finish("SUCCESS", null, sent.outboxId);
      } catch (e) {
        if (e instanceof MessageRefused) return finish("FAILED", e.message.slice(0, 200));
        if (e instanceof ZodError) return finish("FAILED", "the address or wording was refused");
        throw e;   // anything else rolls back and the job runner tries again (PF-14)
      }
    }));
    if (!out) return null;
    if (out.outboxId) await this.d.messages.dispatch(firmId, [out.outboxId]);
    await this.cancelJobs(out.cancel);
    return out.state;
  }
}
