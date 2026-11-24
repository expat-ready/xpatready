// FO-9b part 2b (BACKLOG row FO-9b part 2b; P-574 (2); Lead 10 and Lead 12 on #3174; AG-2-16, AG-2-78, AG-2-96): every
// arrival door merges a new safe duplicate by itself, through part 2's mergeIfSafe (review.ts: exact email or phone, no
// case, stored document, invoice or money for either person; fail-closed).
// * Outside the arrival's transaction (pair-model.md §4; check_fo9b_review "part 2b limit"): the arrival takes only its
//   new person's own arrival lock (fo_dup_arrival:<id>, a namespace no merge takes) and queues one job; a merge that is
//   Busy (55P03, part 1's NOWAIT) or fails therefore never fails the arrival.
// * Outside any staff request (Lead 12, AUD-3a): the merge's audit line names `system:fo-duplicates`, which a signed-in
//   request's audit context refuses, so it runs as a job of the person's firm (PF-14's runner, PF-12's firm scope).
// * The job first waits on that arrival lock, so it reads the arrival as committed (the person is there) or rolled back
//   (no person: nothing to do). Then each OPEN pair of the new person, best first, in its own transaction; the first
//   merge ends it (the newer record goes into the older). A refusal leaves the pair on To review; Busy throws, so the
//   queue tries again (DEFAULT_RETRY), and once its tries are spent the pair stays on To review.
// * One door path: arrive() calls queueArrivalMerge for a new person (web form, hand-added lead, booking page), with
//   its own ports' queue, else the one the running app registered (this file's provider, features/front-office-auto-merge.ts).
import type { PrismaClient } from "@prisma/client";
import type { JobPort, JobRun } from "../../../../../ports/jobs.ts";
import { firmScope } from "../../../platform/firm-scope.ts";
import { logPort } from "../../../platform/observability/log.ts";
import type { Tx } from "../../sales/common.ts";
import { mergeIfSafe, type Unsafe } from "./review.ts";
import { MergeBusy, type MergePorts } from "./service.ts";

export const AUTO_MERGE_QUEUE = "fo.duplicates.auto_merge";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arrivalLock = (personId: string) => `fo_dup_arrival:${personId.toLowerCase()}`;
/** How long the job waits for the arrival's transaction to end (it is a few statements long). */
const WAIT_MS = 30_000;

/** What arrive() is given: queues the merge of one new person, after its arrival commits. */
export interface AutoMergeQueue { enqueue(firmId: string, personId: string): Promise<void> }

let registered: AutoMergeQueue | null = null;
/** The running app's queue (set by ArrivalAutoMerge once its job is registered; null when it closes). */
export function registerAutoMerge(q: AutoMergeQueue | null): void { registered = q; }

/** Inside the arrival's transaction, after its new person is written: takes the person's arrival lock (held until the
 *  arrival ends) and queues the job. `q` undefined: the registered queue; null: none (nothing is merged by itself).
 *  A failure here is logged and never refuses the arrival (the pair stays on To review). */
export async function queueArrivalMerge(tx: Tx, q: AutoMergeQueue | null | undefined, firmId: string, personId: string): Promise<boolean> {
  const queue = q === undefined ? registered : q;
  if (!queue) return false;
  await tx.$executeRaw`savepoint fo_dup_auto_queue`;
  try {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${arrivalLock(personId)}, 0))`;
    await tx.$executeRaw`release savepoint fo_dup_auto_queue`;
  } catch (e) { await tx.$executeRaw`rollback to savepoint fo_dup_auto_queue`; logPort.error("fo9b_auto_merge_lock_failed", e); return false; }
  try { await queue.enqueue(firmId, personId); return true; } catch (e) { logPort.error("fo9b_auto_merge_queue_failed", e); return false; }
}

export type ArrivalMergeOut = { mergeRef: string | null; refused: { pairId: string; why: Unsafe[] }[]; busy: boolean; arrived: boolean };
const deadlock = (e: unknown) => /40P01|deadlock detected/i.test(`${(e as Error)?.message ?? ""} ${JSON.stringify((e as { meta?: unknown })?.meta ?? {})}`);

/** The job's work for one new person: wait for its arrival to end, then merge its first safe OPEN pair. */
export async function mergeArrival(db: PrismaClient, firmId: string, personId: string, ports: MergePorts): Promise<ArrivalMergeOut> {
  const id = personId.toLowerCase();
  const person = await db.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${arrivalLock(id)}, 0))`;
    return tx.foPerson.findFirst({ where: firmScope(firmId, { id }), select: { mergedIntoId: true } });
  }, { timeout: WAIT_MS, maxWait: WAIT_MS });
  if (!person || person.mergedIntoId) return { mergeRef: null, refused: [], busy: false, arrived: !!person };
  const pairs = await db.foDupReview.findMany({ where: firmScope(firmId, { status: "OPEN" as const, OR: [{ lowId: id }, { highId: id }] }), orderBy: [{ score: "desc" }, { firstSeenAt: "asc" }, { id: "asc" }], select: { id: true } });
  const refused: ArrivalMergeOut["refused"] = [];
  let busy = false;
  for (const p of pairs) {
    try {
      const r = await db.$transaction((tx) => mergeIfSafe(tx as never, firmId, p.id, ports));
      if ("mergeRef" in r) return { mergeRef: r.mergeRef, refused, busy: false, arrived: true };
      refused.push({ pairId: p.id, why: r.refused });
    } catch (e) { if (e instanceof MergeBusy || deadlock(e)) busy = true; else throw e; }
  }
  return { mergeRef: null, refused, busy, arrived: true };
}

/** The job and the queue arrive() uses in the running app. */
export class ArrivalAutoMerge implements AutoMergeQueue {
  constructor(private readonly db: PrismaClient, private readonly jobs: JobPort, private readonly ports: MergePorts) {}

  /** Registers the job on PF-14's runner (before it starts), then this queue for arrive(). */
  async register(): Promise<void> {
    await this.jobs.handle(AUTO_MERGE_QUEUE, (job) => this.run(job));
    registerAutoMerge(this);
  }

  async enqueue(firmId: string, personId: string): Promise<void> {
    await this.jobs.enqueue(AUTO_MERGE_QUEUE, { personId: personId.toLowerCase() }, { firmId, key: `fo-dup-auto:${personId.toLowerCase()}` });
  }

  /** One run: Busy with nothing merged throws, so the queue tries again; anything else is done. */
  async run(job: JobRun): Promise<ArrivalMergeOut | null> {
    const personId = job.payload.personId;
    if (!job.firmId || typeof personId !== "string" || !UUID.test(personId)) return null;
    const out = await mergeArrival(this.db, job.firmId, personId, this.ports);
    if (out.busy && !out.mergeRef) throw new MergeBusy();
    return out;
  }
}
