// AUD-5 part 1: KeepPeriodPort's contract (ports/keep-period.ts). Run by fakeKeepPeriods and by the real adapter
// KeepPeriods (api/src/platform/keep-period/service.ts). The port file's sentences: forFirm gives the firm's own number
// for closed client files, or null with "not set" (SA-11-33: no default); one firm's number never shows on another's
// read; a firm id that is not one is refused. check() (part 2, BR-7) answers HELD before anything else, for every class;
// then FLOOR (in code; the activity log never deleted), then WARN inside the firm's own number, else OK; a REFERENCE class,
// an unknown class or an empty ask is refused; another firm's hold never holds this firm's record.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { addYears, KEEP_PERIODS, type KeepPeriodPort } from "../keep-period.ts";
import type { PlaceHoldInput } from "../legal-hold.ts";

/** What an adapter's test hands the contract: the port, two firms with no number yet, and a way to set one. */
export type KeepPeriodHarness = {
  port: KeepPeriodPort<unknown>;
  firmA: string;
  firmB: string;
  /** Sets a firm's number as its Owner would (the real adapter: through the settings write path). */
  set(firmId: string, years: number): Promise<void>;
  /** Puts both firms back to "not set". */
  clear(): Promise<void>;
  /** The hold store check() asks (fakeLegalHolds until PF-21b part 2's real adapter): one transaction, and a placement. */
  holds: { tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>; place(input: PlaceHoldInput): Promise<{ holdId: string }> };
  /** The clock check() reads (FakeClock). */
  clock: { set(to: Date | string): Promise<void> };
};

const NOW = new Date("2030-06-01T12:00:00.000Z");
const yearsAgo = (n: number) => addYears(NOW, -n);
const uuid = () => globalThis.crypto.randomUUID();

export const keepPeriodPortContract = defineContract("KeepPeriodPort", (make: () => Promise<KeepPeriodHarness> | KeepPeriodHarness) => [
  {
    name: "a firm with no number reads null, \"not set\"",
    async run() {
      const h = await make(); await h.clear();
      const got = await h.port.forFirm(h.firmA);
      expect(got.closedClientFilesYears === null && got.source === "not set", "null and not set", got);
    },
  },
  {
    name: "a firm's number is read back as \"firm setting\"",
    async run() {
      const h = await make(); await h.clear();
      await h.set(h.firmA, 8);
      const got = await h.port.forFirm(h.firmA);
      expect(got.closedClientFilesYears === 8 && got.source === "firm setting", "8 years, firm setting", got);
    },
  },
  {
    name: "firm B's number never shows on firm A's read",
    async run() {
      const h = await make(); await h.clear();
      await h.set(h.firmB, 9);
      const a = await h.port.forFirm(h.firmA), b = await h.port.forFirm(h.firmB);
      expect(a.closedClientFilesYears === null && b.closedClientFilesYears === 9, "A not set, B 9", { a, b });
    },
  },
  {
    name: "a firm id that is not one is refused",
    async run() {
      const h = await make();
      await expectRefused(() => h.port.forFirm("sample-firm"), "forFirm(\"sample-firm\")");
    },
  },
  {
    name: "check: a billing record whose fiscal year ended 5 years ago is FLOOR until 6 years; one 7 years ago is OK (SA4-D18)",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const ask = (start: Date) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "our_billing", startedAt: start, subjects: [{ kind: "DATE", at: start }] }));
      const young = await ask(yearsAgo(5)), old = await ask(yearsAgo(7));
      expect(young.verdict === "FLOOR" && young.until?.toISOString() === addYears(yearsAgo(5), 6).toISOString() && old.verdict === "OK", "FLOOR then OK", { young, old });
    },
  },
  {
    name: "check: a closed client file inside the firm's number is WARN; past it, or with no number set, OK (SA-11-33, BR-7)",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const ask = (start: Date) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "closed_client_file", startedAt: start, subjects: [{ kind: "CASE", id: uuid() }] }));
      const unset = await ask(yearsAgo(1));
      await h.set(h.firmA, 8);
      const inside = await ask(yearsAgo(3)), past = await ask(yearsAgo(9));
      expect(unset.verdict === "OK" && inside.verdict === "WARN" && inside.until.toISOString() === addYears(yearsAgo(3), 8).toISOString() && past.verdict === "OK", "OK unset, WARN inside, OK past", { unset, inside, past });
    },
  },
  {
    name: "check: an activity-log line is FLOOR at any age, never deleted (SA-11-14); the College's 6 years plays no part",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW); await h.set(h.firmA, 1);
      const out = await Promise.all([0, 7, 30].map((n) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "activity_log", startedAt: yearsAgo(n), subjects: [{ kind: "FIRM" }] }))));
      // A closed file 5 years and 6 months old with the firm's 5: OK by the firm's number. Were the College's 6 years used
      // as a floor (or a reminder), it would be FLOOR or WARN (DW1: check() never reads the College number).
      await h.set(h.firmA, 5);
      const halfPast = new Date(yearsAgo(5).getTime() - 183 * 24 * 3600 * 1000);
      const file = await h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "closed_client_file", startedAt: halfPast, subjects: [{ kind: "CASE", id: uuid() }] }));
      expect(out.every((r) => r.verdict === "FLOOR" && r.until === null) && file.verdict === "OK", "FLOOR always; the firm's 5, not the College's 6, decides", { out, file });
    },
  },
  {
    name: "check: a held record is HELD, with the hold's reason, before any floor or reminder, for every class (BR-7)",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW); await h.set(h.firmA, 8);
      const caseId = uuid();
      await h.holds.place({ firmId: h.firmA, scope: { kind: "CASE", id: caseId }, reason: "Litigation hold, file 2030-17", by: "seed:aud5-contract" });
      const classes = KEEP_PERIODS.filter((r) => r.kind !== "REFERENCE").map((r) => r.class);
      const out = await Promise.all(classes.map((c) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: c, startedAt: yearsAgo(40), subjects: [{ kind: "CASE", id: caseId }] }))));
      expect(classes.length === 6 && out.every((r) => r.verdict === "HELD" && r.reason === "Litigation hold, file 2030-17" && r.holds.length === 1), "HELD for each class", out);
    },
  },
  {
    name: "check: another firm's hold never holds this firm's record",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const caseId = uuid();
      await h.holds.place({ firmId: h.firmB, scope: { kind: "CASE", id: caseId }, reason: "Firm B's hold", by: "seed:aud5-contract" });
      const r = await h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "client_financial", startedAt: yearsAgo(10), subjects: [{ kind: "CASE", id: caseId }] }));
      expect(r.verdict === "OK", "firm A not held by firm B's hold", r);
    },
  },
  {
    name: "check: the College's REFERENCE row, a class not in the table and an empty ask are refused",
    async run() {
      const h = await make(); await h.clock.set(NOW);
      const ask = (input: unknown) => h.holds.tx((tx) => h.port.check(tx, input as never));
      const base = { firmId: h.firmA, startedAt: yearsAgo(1), subjects: [{ kind: "FIRM" }] };
      await expectRefused(() => ask({ ...base, class: "college_client_file" }), "the College row", (e) => e instanceof Error && e.name === "KeepCheckRefused");
      await expectRefused(() => ask({ ...base, class: "chat_messages" }), "a class not in the table", (e) => e instanceof Error && e.name === "KeepCheckRefused");
      await expectRefused(() => ask({ ...base, class: "our_billing", subjects: [] }), "an empty ask", (e) => e instanceof Error && e.name === "KeepCheckRefused");
    },
  },
]);
