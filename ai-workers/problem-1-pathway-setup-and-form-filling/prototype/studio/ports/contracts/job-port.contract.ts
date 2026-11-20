// PF-0c: JobPort's contract (ports/jobs.ts). Run by fakeJobs and by PgBossJobs and PlatformJobs (api/src/platform/jobs/).
// Every case is a sentence of the port file: a key never queues twice under one job name, even after its job ran or was
// cancelled; a key is per job name; cancel cancels every waiting job of a key, whatever its name, and answers whether
// one was waiting; a job scheduled later does not run now; a handler sees its job's payload, key and firm, attempt 1
// first; a bad job name, cron or zone is refused before anything is queued. PF-19p (Lead B rev 16.66): a platform job
// (`platform: true`, no firm) runs on a PLATFORM_JOB_QUEUES queue with no firm and is retried as a firm's job is; one on
// any other queue, or one with both a firm and `platform`, is refused. (A recurring schedule's runs are not a
// contract case: they need a clock both a fake and the wall-clock provider can move; check_pf14_jobs.ts compares them.)
import { defineContract, expect, expectRefused } from "./contract.ts";
import { PLATFORM_JOB_QUEUES, type JobPort, type JobRun } from "../jobs.ts";
import { stableJson } from "../render.ts";

/** What a job adapter's test hands the contract. */
export type JobHarness = {
  jobs: JobPort;
  /** A dotted lower-case word naming this run's queues, so two runs on one database never share a queue or a key. */
  ns: string;
  /** The adapter's now (a fake or test clock, or the wall clock). */
  now(): Date;
  /** Lets due jobs run until `done()` holds or the adapter's patience ends; resolves with `done()`. Never moves time
   *  as far as an hour (a job scheduled a day ahead must stay waiting). */
  settle(done: () => boolean): Promise<boolean>;
};

const FIRM = "0c0c0c0c-0000-4000-8000-00000000000a";
/** The platform queue is one name for every adapter, and two adapters on one database may each run its jobs, so its
 *  handler records every run here and each harness reads the runs of its own keys. */
const platformRuns: JobRun[] = [];
const platformHandled = new WeakSet<JobPort>();

export const jobPortContract = defineContract("JobPort", (make: () => Promise<JobHarness> | JobHarness) => {
  const worker = async (h: JobHarness, name: string) => {
    const runs: JobRun[] = [];
    await h.jobs.handle(name, async (j) => { runs.push(j); });
    return runs;
  };
  return [
    {
      name: "a keyed job runs once (the same key again answers queued: false and never runs twice)",
      async run() {
        const h = await make(), name = `contract.${h.ns}.once`, runs = await worker(h, name);
        const first = await h.jobs.enqueue(name, { noteId: "n-1" }, { key: `once:${h.ns}:1`, firmId: FIRM });
        const second = await h.jobs.enqueue(name, { noteId: "n-2" }, { key: `once:${h.ns}:1`, firmId: FIRM });
        expect(first.queued === true, "the first enqueue of a key is queued", first);
        expect(second.queued === false, "the same key again answers queued: false", second);
        await h.settle(() => runs.length >= 1);
        await h.settle(() => runs.length >= 2);   // room for a wrong second run to show
        expect(runs.length === 1, "the key ran exactly once", runs.map((r) => r.payload));
        expect(runs[0].payload.noteId === "n-1", "the run carries the first enqueue's payload", runs[0].payload);
      },
    },
    {
      name: "a key that ran stays used (enqueue again: queued false, no new run)",
      async run() {
        const h = await make(), name = `contract.${h.ns}.ran`, runs = await worker(h, name);
        await h.jobs.enqueue(name, {}, { key: `ran:${h.ns}:1`, firmId: FIRM });
        expect(await h.settle(() => runs.length === 1), "the job ran", runs.length);
        const again = await h.jobs.enqueue(name, {}, { key: `ran:${h.ns}:1`, firmId: FIRM });
        await h.settle(() => runs.length > 1);
        expect(again.queued === false && runs.length === 1, "a finished key refuses a second job", { again, runs: runs.length });
      },
    },
    {
      name: "a different key under the same name is a second job; the same key under another name is its own job",
      async run() {
        const h = await make(), a = `contract.${h.ns}.keya`, b = `contract.${h.ns}.keyb`, ra = await worker(h, a), rb = await worker(h, b);
        const r1 = await h.jobs.enqueue(a, {}, { key: `k:${h.ns}:1`, firmId: FIRM });
        const r2 = await h.jobs.enqueue(a, {}, { key: `k:${h.ns}:2`, firmId: FIRM });
        const r3 = await h.jobs.enqueue(b, {}, { key: `k:${h.ns}:1`, firmId: FIRM });
        expect(r1.queued && r2.queued && r3.queued, "each is queued", { r1, r2, r3 });
        expect(await h.settle(() => ra.length === 2 && rb.length === 1), "each runs once", { a: ra.map((r) => r.key), b: rb.map((r) => r.key) });
      },
    },
    {
      name: "the handler sees the job's name, payload, key and firm, attempt 1",
      async run() {
        const h = await make(), name = `contract.${h.ns}.shape`, runs = await worker(h, name);
        await h.jobs.enqueue(name, { bookingId: "b-7", n: 2, flags: [true, false] }, { key: `shape:${h.ns}:1`, firmId: FIRM });
        expect(await h.settle(() => runs.length === 1), "the job ran", runs.length);
        const j = runs[0];
        expect(j.name === name && j.key === `shape:${h.ns}:1` && j.firmId?.toLowerCase() === FIRM && j.attempt === 1, "name, key, firm and attempt 1", { name: j.name, key: j.key, firmId: j.firmId, attempt: j.attempt });
        expect(stableJson(j.payload) === stableJson({ bookingId: "b-7", n: 2, flags: [true, false] }), "the payload as given (key order aside: jsonb keeps its own)", j.payload);
        expect(j.runAt instanceof Date && Number.isFinite(j.runAt.getTime()), "runAt is a time", j.runAt);
      },
    },
    {
      name: "a job scheduled a day ahead waits; cancel answers true once, then false, and the key stays used",
      async run() {
        const h = await make(), name = `contract.${h.ns}.later`, runs = await worker(h, name), key = `later:${h.ns}:1`;
        const at = new Date(h.now().getTime() + 24 * 3600_000);
        expect((await h.jobs.schedule(name, at, {}, { key, firmId: FIRM })).queued, "the schedule is queued");
        await h.settle(() => runs.length > 0);
        expect(runs.length === 0, "nothing runs a day early", runs.length);
        expect(await h.jobs.cancel(key) === true, "cancel finds the waiting job");
        expect(await h.jobs.cancel(key) === false, "a second cancel finds nothing");
        expect((await h.jobs.enqueue(name, {}, { key, firmId: FIRM })).queued === false, "a cancelled key stays used");
        await h.settle(() => runs.length > 0);
        expect(runs.length === 0, "the cancelled job never runs", runs.length);
      },
    },
    {
      name: "cancel cancels every waiting job of the key, whatever its name",
      async run() {
        const h = await make(), a = `contract.${h.ns}.cana`, b = `contract.${h.ns}.canb`, ra = await worker(h, a), rb = await worker(h, b), key = `can:${h.ns}:1`;
        const at = new Date(h.now().getTime() + 24 * 3600_000);
        await h.jobs.schedule(a, at, {}, { key, firmId: FIRM });
        await h.jobs.schedule(b, at, {}, { key, firmId: FIRM });
        expect(await h.jobs.cancel(key) === true, "cancel finds the waiting jobs");
        expect(await h.jobs.cancel(key) === false, "neither job is still waiting");
        expect((await h.jobs.enqueue(a, {}, { key, firmId: FIRM })).queued === false && (await h.jobs.enqueue(b, {}, { key, firmId: FIRM })).queued === false, "the key stays used under both names");
        await h.settle(() => ra.length + rb.length > 0);
        expect(ra.length + rb.length === 0, "neither cancelled job runs", { a: ra.length, b: rb.length });
      },
    },
    {
      name: "recurring refuses a cron that does not parse and a zone that does not exist",
      async run() {
        const h = await make();
        await expectRefused(() => h.jobs.recurring(`contract.${h.ns}.sweep`, "nine every morning", "America/Toronto"), "a cron that does not parse");
        await expectRefused(() => h.jobs.recurring(`contract.${h.ns}.sweep`, "0 9 * * *", "Mars/Olympus"), "a zone that does not exist");
        await expectRefused(() => h.jobs.recurring("Not A Name", "0 9 * * *", "America/Toronto"), "a bad job name");
      },
    },
    {
      name: "cancel of a key never queued answers false",
      async run() {
        const h = await make();
        expect(await h.jobs.cancel(`never:${h.ns}:queued`) === false, "nothing to cancel");
      },
    },
    {
      name: "PF-19p: a platform job runs on a listed queue with no firm and is retried as a firm's job is; an unlisted queue, or a firm too, is refused",
      async run() {
        const h = await make(), queue = PLATFORM_JOB_QUEUES[0], firmQueue = `contract.${h.ns}.pfirm`, firmRuns: JobRun[] = [];
        const failFirst = (seen: JobRun[], j: JobRun) => { seen.push(j); if (j.attempt === 1) throw new Error("contract: the first try fails"); };
        if (!platformHandled.has(h.jobs)) { platformHandled.add(h.jobs); await h.jobs.handle(queue, async (j) => { if (String(j.payload.fail) === "yes") failFirst(platformRuns, j); else platformRuns.push(j); }); }
        await h.jobs.handle(firmQueue, async (j) => failFirst(firmRuns, j));
        const key = `platform:${h.ns}:${Date.now()}`, keyFail = `${key}:fail`, mine = (k: string) => platformRuns.filter((r) => r.key === k);
        const q = await h.jobs.enqueue(queue, { outboxId: "o-1", platform: true }, { key, platform: true });
        await h.jobs.enqueue(queue, { fail: "yes" }, { key: keyFail, platform: true });
        await h.jobs.enqueue(firmQueue, {}, { key: `pfirm:${h.ns}:${Date.now()}`, firmId: FIRM });
        await h.settle(() => mine(key).length >= 1 && mine(keyFail).length >= 2 && firmRuns.length >= 2);
        const run = mine(key)[0];
        expect(q.queued === true && mine(key).length === 1 && run?.firmId === null && run.payload.outboxId === "o-1" && run.name === queue, "the platform job ran once, with no firm and its payload", mine(key));
        expect(mine(keyFail).map((r) => r.attempt).join() === firmRuns.map((r) => r.attempt).join(), "a failing platform job is retried exactly as a failing firm job", { platform: mine(keyFail).map((r) => r.attempt), firm: firmRuns.map((r) => r.attempt) });
        await expectRefused(() => h.jobs.enqueue(`contract.${h.ns}.notlisted`, {}, { key: `${key}:x`, platform: true }), "a platform job on a queue not in PLATFORM_JOB_QUEUES");
        await expectRefused(() => h.jobs.enqueue(queue, {}, { key: `${key}:y`, platform: true, firmId: FIRM } as never), "a job naming both a firm and platform");
        await expectRefused(() => h.jobs.enqueue(queue, {}, { key: `${key}:z` } as never), "a job naming neither a firm nor platform");
      },
    },
    {
      name: "a job name outside the dotted lower-case form, or a job without a firm, is refused",
      async run() {
        const h = await make();
        await expectRefused(() => h.jobs.enqueue("Send Email!", {}, { key: `bad:${h.ns}:1`, firmId: FIRM }), "a bad job name");
        await expectRefused(() => h.jobs.enqueue(`contract.${h.ns}.nofirm`, {}, { key: `bad:${h.ns}:2` } as never), "a job without a firm");
        await expectRefused(() => h.jobs.schedule(`contract.${h.ns}.nofirm`, new Date("not a time"), {}, { key: `bad:${h.ns}:3`, firmId: FIRM }), "a schedule without a valid time");
      },
    },
  ];
});
