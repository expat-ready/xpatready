// PF-0c: JobPort's contract (ports/jobs.ts). Run by fakeJobs and by PgBossJobs and PlatformJobs (api/src/platform/jobs/).
// Every case is a sentence of the port file: a key never queues twice under one job name, even after its job ran or was
// cancelled; a key is per job name; cancel cancels every waiting job of a key and answers whether one was waiting; a
// job scheduled later does not run now; a handler sees its job's payload, key and firm, attempt 1 first; a bad job name
// is refused before anything is queued.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { JobPort, JobRun } from "../jobs.ts";

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
        expect(JSON.stringify(j.payload) === JSON.stringify({ bookingId: "b-7", n: 2, flags: [true, false] }), "the payload as given", j.payload);
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
      name: "cancel of a key never queued answers false",
      async run() {
        const h = await make();
        expect(await h.jobs.cancel(`never:${h.ns}:queued`) === false, "nothing to cancel");
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
