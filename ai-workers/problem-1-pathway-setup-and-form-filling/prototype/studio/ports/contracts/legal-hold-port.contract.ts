// PF-0c: LegalHoldPort's contract (ports/legal-hold.ts). Run by fakeLegalHolds and (PF-21b part 2) by the real adapter on
// plat_legal_hold. The port file's rules: every matching active hold is reported, each once, oldest first, with its scope,
// reason, owner and placedAt; FIRM matches every subject of its firm and never another firm's; CASE and PERSON match their
// id; CATEGORY matches its category; ALL_FIRM_DATA (a firm's purge) is matched by every hold of its firm; DATE_RANGE matches a DATE inside it, both ends included; a released hold matches
// nothing; an empty ask and a bad firm id are refused; isHeld takes the shared lock itself, so a placement and a read in
// another transaction are serialised with no lock call in the caller, with three parties as with two (SA-11 §3.5,
// SA-11-40, BR-7, BR-12). Rule 3's isolation refusal (REPEATABLE READ, SERIALIZABLE) has no fake equivalent: the real
// adapter's own test proves it (part 2).
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { HoldScope, HoldSubject, LegalHoldPort, PlaceHoldInput, ReleaseHoldInput } from "../legal-hold.ts";

/** What a legal-hold adapter's test hands the contract. **Every make() call gives two fresh firms with no holds** (new
 *  platform_firm rows for the real adapter): the cases leave their holds active, and a shared store with fixed firms
 *  would see one case's holds in the next. Each case checks this first and fails with a plain message otherwise. */
export type LegalHoldHarness = {
  holds: LegalHoldPort<unknown>;
  /** Runs `fn` in one transaction that commits when it settles (no lock call: the port takes its own). */
  tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  /** Places a hold in its own transaction; `during` runs after the exclusive lock is taken, before the commit. */
  place(input: PlaceHoldInput, during?: () => Promise<void>): Promise<{ holdId: string }>;
  release(input: ReleaseHoldInput, during?: () => Promise<void>): Promise<void>;
  /** Two firms the store knows, fresh for this make() call (no hold placed on either yet). */
  firmA: string;
  firmB: string;
  /** The placer (`staff:<id>` of the Platform Owner, or `seed:<row>`). */
  by: string;
};

const uuid = () => globalThis.crypto.randomUUID();
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const WAIT_MS = 300;
/** True when `p` has not settled within WAIT_MS (the other transaction is waiting on the lock). */
async function stillWaiting(p: Promise<unknown>): Promise<boolean> {
  let settled = false; p.then(() => { settled = true; }, () => { settled = true; });
  await pause(WAIT_MS); return !settled;
}
/** M2: the harness promise above. */
async function fresh(h: LegalHoldHarness): Promise<LegalHoldHarness> {
  const a = await h.tx((t) => h.holds.isHeld(t, h.firmA, [{ kind: "ALL_FIRM_DATA" }])), b = await h.tx((t) => h.holds.isHeld(t, h.firmB, [{ kind: "ALL_FIRM_DATA" }]));
  expect(!a.held && !b.held, "make() must give two fresh firms with no holds (see LegalHoldHarness)", { a, b });
  return h;
}
const ask = (h: LegalHoldHarness, firmId: string, subjects: HoldSubject[]) => h.tx((t) => h.holds.isHeld(t, firmId, subjects));
const place = (h: LegalHoldHarness, firmId: string, scope: HoldScope, reason = `Sample hold ${uuid().slice(0, 8)}`) => h.place({ firmId, scope, reason, by: h.by });

export const legalHoldPortContract = defineContract("LegalHoldPort", (make: () => Promise<LegalHoldHarness> | LegalHoldHarness) => [
  {
    name: "one call with five subjects reports every matching hold (scope, reason, owner, placedAt), each once, oldest first",
    async run() {
      const h = await fresh(await make()), c = uuid(), p1 = uuid(), p2 = uuid(), at = new Date("2026-03-10T12:00:00Z");
      const hc = await place(h, h.firmA, { kind: "CASE", id: c }, "Sample: case dispute");
      await pause(5);
      const hp = await place(h, h.firmA, { kind: "PERSON", id: p2 }, "Sample: person complaint");
      await pause(5);
      const hd = await place(h, h.firmA, { kind: "DATE_RANGE", from: new Date("2026-03-01T00:00:00Z"), to: new Date("2026-03-31T23:59:59Z") }, "Sample: March records");
      const out = await ask(h, h.firmA, [{ kind: "FIRM" }, { kind: "CASE", id: c }, { kind: "PERSON", id: p1 }, { kind: "PERSON", id: p2 }, { kind: "CATEGORY", category: "case_notes" }, { kind: "DATE", at }]);
      expect(out.held, "held", out);
      const ids = out.holds.map((x) => x.holdId);
      expect(ids.length === 3 && ids[0] === hc.holdId && ids[1] === hp.holdId && ids[2] === hd.holdId, "all three matches, each once, oldest first", ids);
      const first = out.holds[0];
      expect(first.scope.kind === "CASE" && first.reason === "Sample: case dispute" && first.placedBy === h.by && first.placedAt instanceof Date, "scope, reason, owner and placedAt", first);
    },
  },
  {
    name: "a CATEGORY hold matches its category only; a DATE_RANGE hold matches a DATE inside it (ends included), not outside",
    async run() {
      const h = await fresh(await make());
      await place(h, h.firmA, { kind: "CATEGORY", category: "case_notes" });
      const notes = await ask(h, h.firmA, [{ kind: "CATEGORY", category: "case_notes" }]);
      const tasks = await ask(h, h.firmA, [{ kind: "CATEGORY", category: "case_tasks" }]);
      expect(notes.held && !tasks.held, "case_notes held, case_tasks not", { notes, tasks });
      const g = await fresh(await make()), from = new Date("2025-01-01T00:00:00Z"), to = new Date("2025-06-30T00:00:00Z");
      await place(g, g.firmB, { kind: "DATE_RANGE", from, to });
      const inside = await ask(g, g.firmB, [{ kind: "DATE", at: new Date("2025-03-01T00:00:00Z") }]);
      const end = await ask(g, g.firmB, [{ kind: "DATE", at: to }]);
      const outside = await ask(g, g.firmB, [{ kind: "DATE", at: new Date("2025-07-01T00:00:00Z") }]);
      expect(inside.held && end.held && !outside.held, "inside and the end held, outside not", { inside, end, outside });
    },
  },
  {
    name: "a PERSON hold holds that person only; a FIRM hold holds every subject of its firm and none of the other firm's",
    async run() {
      const h = await fresh(await make()), p = uuid(), other = uuid();
      await place(h, h.firmA, { kind: "PERSON", id: p }, "Sample: a person's dispute");
      const mine = await ask(h, h.firmA, [{ kind: "PERSON", id: p }]);
      const theirs = await ask(h, h.firmA, [{ kind: "PERSON", id: other }]);
      expect(mine.held && mine.holds[0].reason === "Sample: a person's dispute" && !theirs.held, "that person held with its reason, another not", { mine, theirs });
      await place(h, h.firmB, { kind: "FIRM" }, "Sample: firm B investigation");
      const every = await Promise.all(([{ kind: "FIRM" }, { kind: "CASE", id: uuid() }, { kind: "PERSON", id: uuid() }, { kind: "CATEGORY", category: "case_files" }, { kind: "DATE", at: new Date() }] as HoldSubject[]).map((s) => ask(h, h.firmB, [s])));
      expect(every.every((x) => x.held), "every subject of firm B held", every);
      const a = await ask(h, h.firmA, [{ kind: "FIRM" }, { kind: "CASE", id: uuid() }]);
      expect(!a.held, "firm A is not held by firm B's hold", a);
    },
  },
  {
    name: "ALL_FIRM_DATA (the purge of a cancelled firm) is held by any active hold of its firm, a case hold included; never by another firm's",
    async run() {
      const h = await fresh(await make());
      await place(h, h.firmA, { kind: "CASE", id: uuid() }, "Sample: one case's dispute");
      const purgeA = await ask(h, h.firmA, [{ kind: "ALL_FIRM_DATA" }]);
      const firmOnly = await ask(h, h.firmA, [{ kind: "FIRM" }]);
      const purgeB = await ask(h, h.firmB, [{ kind: "ALL_FIRM_DATA" }]);
      expect(purgeA.held && purgeA.holds[0].reason === "Sample: one case's dispute" && !firmOnly.held && !purgeB.held, "firm A's purge held by its case hold; a FIRM ask and firm B's purge not", { purgeA, firmOnly, purgeB });
    },
  },
  {
    name: "a released hold is no longer held; releasing it twice is refused; a new hold on the same scope holds again",
    async run() {
      const h = await fresh(await make()), c = uuid();
      const { holdId } = await place(h, h.firmA, { kind: "CASE", id: c });
      await h.release({ holdId, by: h.by, reason: "Sample: dispute settled" });
      const after = await ask(h, h.firmA, [{ kind: "CASE", id: c }]);
      expect(!after.held, "released: not held", after);
      await expectRefused(() => h.release({ holdId, by: h.by, reason: "Sample: again" }), "a second release");
      const again = await place(h, h.firmA, { kind: "CASE", id: c });
      const now = await ask(h, h.firmA, [{ kind: "CASE", id: c }]);
      expect(now.held && now.holds.length === 1 && now.holds[0].holdId === again.holdId, "only the new hold", now);
    },
  },
  {
    name: "an empty subject list, a bad firm id and an unknown category are refused (never a silent pass)",
    async run() {
      const h = await fresh(await make());
      await expectRefused(() => ask(h, h.firmA, []), "no subjects");
      await expectRefused(() => ask(h, "not-a-firm", [{ kind: "FIRM" }]), "a bad firm id");
      await expectRefused(() => ask(h, h.firmA, [{ kind: "CATEGORY", category: "everything" } as unknown as HoldSubject]), "an unknown category");
    },
  },
  {
    name: "no race: a placement waits for an open isHeld transaction, and the next read sees the hold (no lock call in the caller)",
    async run() {
      const h = await fresh(await make()), c = uuid();
      let placing: Promise<{ holdId: string }> | undefined, waited = false;
      const first = await h.tx(async (t) => {
        const before = await h.holds.isHeld(t, h.firmA, [{ kind: "CASE", id: c }]);
        placing = place(h, h.firmA, { kind: "CASE", id: c });
        waited = await stillWaiting(placing);
        return before;
      });
      const placed = await placing!;
      const next = await ask(h, h.firmA, [{ kind: "CASE", id: c }]);
      expect(!first.held && waited, "the placement waited for the open deleter", { first, waited });
      expect(next.held && next.holds[0].holdId === placed.holdId, "the read after it sees the hold", next);
    },
  },
  {
    name: "no race: an isHeld that starts while a placement is open waits for it and then sees the hold",
    async run() {
      const h = await fresh(await make()), p = uuid();
      let reading: Promise<unknown> | undefined, waited = false;
      await h.place({ firmId: h.firmA, scope: { kind: "PERSON", id: p }, reason: "Sample: court order", by: h.by }, async () => {
        reading = ask(h, h.firmA, [{ kind: "PERSON", id: p }]);
        waited = await stillWaiting(reading);
      });
      const out = await reading! as Awaited<ReturnType<LegalHoldPort["isHeld"]>>;
      expect(waited && out.held && out.holds[0].reason === "Sample: court order", "the read waited and saw the hold", { waited, out });
    },
  },
  {
    name: "three parties: placements queued behind an open one never run together, and a deleter queued with them never sees a hold commit while it is open",
    async run() {
      const h = await fresh(await make()), c = uuid();
      let inside = 0, most = 0, readEnded = 0, placedAt = 0;
      const enter = () => { inside++; most = Math.max(most, inside); }, leave = () => { inside--; };
      let reading: Promise<Awaited<ReturnType<LegalHoldPort["isHeld"]>>> | undefined, second: Promise<unknown> | undefined;
      await h.place({ firmId: h.firmA, scope: { kind: "CASE", id: uuid() }, reason: "Sample: first", by: h.by }, async () => {
        enter();
        reading = h.tx(async (t) => { const r = await h.holds.isHeld(t, h.firmA, [{ kind: "CASE", id: c }]); await pause(WAIT_MS); readEnded = Date.now(); return r; });
        second = h.place({ firmId: h.firmA, scope: { kind: "CASE", id: c }, reason: "Sample: second", by: h.by }, async () => { enter(); await pause(50); leave(); }).then((x) => { placedAt = Date.now(); return x; });
        await pause(100);
        leave();
      });
      const [read] = await Promise.all([reading!, second!]);
      expect(most === 1, "two placements never held the exclusive lock together", { most });
      expect(read.held || placedAt >= readEnded, "the second hold committed only after the deleter that read 'not held' ended", { read, placedAt, readEnded });
    },
  },
]);
