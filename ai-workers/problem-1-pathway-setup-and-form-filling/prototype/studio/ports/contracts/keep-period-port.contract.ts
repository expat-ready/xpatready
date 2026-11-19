// AUD-5 part 1: KeepPeriodPort's contract (ports/keep-period.ts). Run by fakeKeepPeriods and by the real adapter
// KeepPeriods (api/src/platform/keep-period/service.ts). The port file's sentences: forFirm gives the firm's own number
// for closed client files, or null with "not set" (SA-11-33: no default); one firm's number never shows on another's
// read; a firm id that is not one is refused; check() with no legal-hold store wired refuses (no silent OK).
// AUD-5 part 2: keepPeriodCheckContract below holds check()'s own cases (BR-7: HELD first, with every matching hold's
// reason, for every class; then FLOOR; then WARN inside the firm's own number; else OK; refusals in words), run by
// tests/check_aud5_check.ts on the fake and the real adapter, each given the legal-hold store and a clock.
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
};

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
    name: "check() with no legal-hold store wired refuses (no caller can take a silent OK)",
    async run() {
      const h = await make();
      await expectRefused(() => h.port.check(null, { firmId: h.firmA, class: "closed_client_file", startedAt: new Date(0), subject: "contract" }), "check()", (e) => e instanceof Error && e.name === "KeepCheckNotBuilt");
    },
  },
]);

/** What check()'s contract needs on top of a firm with a number: the hold store (fakeLegalHolds until PF-21b part 2's
 *  real adapter) and the clock check() reads (FakeClock). The port is built with both. */
export type KeepPeriodCheckHarness = KeepPeriodHarness & {
  holds: { tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>; place(input: PlaceHoldInput): Promise<{ holdId: string }> };
  clock: { set(to: Date | string): Promise<void> };
};

const NOW = new Date("2030-06-01T12:00:00.000Z");
const yearsAgo = (n: number) => addYears(NOW, -n);
const uuid = () => globalThis.crypto.randomUUID();
const isRefused = (code: string) => (e: unknown) => e instanceof Error && e.name === "KeepCheckRefused" && (e as { code?: string }).code === code;

/** check()'s cases. Each hold is placed on a fresh case id, so no case sees another's hold. */
export const keepPeriodCheckContract = defineContract("KeepPeriodPort", (make: () => Promise<KeepPeriodCheckHarness> | KeepPeriodCheckHarness) => [
  {
    name: "check: a billing record whose fiscal year ended 5 years ago is FLOOR until 6 years; one 7 years ago is OK (SA4-D18)",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const ask = (start: Date) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "our_billing", startedAt: start, subject: "invoice-2025-0001" }));
      const young = await ask(yearsAgo(5)), old = await ask(yearsAgo(7));
      expect(young.verdict === "FLOOR" && young.until?.toISOString() === addYears(yearsAgo(5), 6).toISOString() && old.verdict === "OK", "FLOOR then OK", { young, old });
    },
  },
  {
    name: "check: a closed client file inside the firm's number is WARN; past it, or with no number set, OK (SA-11-33, BR-7)",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const ask = (start: Date) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "closed_client_file", startedAt: start, subject: uuid() }));
      const unset = await ask(yearsAgo(1));
      await h.set(h.firmA, 8);
      const inside = await ask(yearsAgo(3)), past = await ask(yearsAgo(9));
      expect(unset.verdict === "OK" && inside.verdict === "WARN" && inside.until.toISOString() === addYears(yearsAgo(3), 8).toISOString() && past.verdict === "OK", "OK unset, WARN inside, OK past", { unset, inside, past });
    },
  },
  {
    name: "check: an activity-log line is FLOOR at any age (never deleted, SA-11-14); the firm's number, never the College's 6, decides a closed file",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const out = await Promise.all([0, 7, 30].map((n) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "activity_log", startedAt: yearsAgo(n), subject: "audit-line-1" }))));
      // A file closed 5 years and 6 months ago with the firm's 5: OK. Were the College's 6 years a floor or a reminder, it would not be.
      await h.set(h.firmA, 5);
      const halfPast = new Date(yearsAgo(5).getTime() - 183 * 24 * 3600 * 1000);
      const file = await h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "closed_client_file", startedAt: halfPast, subject: uuid() }));
      expect(out.every((r) => r.verdict === "FLOOR" && r.until === null) && file.verdict === "OK", "FLOOR always; the firm's 5 decides", { out, file });
    },
  },
  {
    name: "check: a held record is HELD with its reason, before any floor or reminder, for every class (BR-7)",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW); await h.set(h.firmA, 8);
      const start = yearsAgo(40), caseId = uuid();
      await h.holds.place({ firmId: h.firmA, scope: { kind: "DATE_RANGE", from: start, to: start }, reason: "Litigation hold: matter 2030-17", by: "seed:aud5-contract" });
      const classes = KEEP_PERIODS.filter((r) => r.kind !== "REFERENCE").map((r) => r.class);
      const out = await Promise.all(classes.map((c) => h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: c, startedAt: start, subject: caseId }))));
      expect(classes.length === 6 && out.every((r) => r.verdict === "HELD" && r.reasons.length === 1 && r.reason === "Litigation hold: matter 2030-17"), "HELD for each class", out);
    },
  },
  {
    name: "check: two active holds on one record → HELD lists both reasons (isHeld reports every match)",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const caseId = uuid();
      await h.holds.place({ firmId: h.firmA, scope: { kind: "CASE", id: caseId }, reason: "First hold", by: "seed:aud5-contract" });
      await h.holds.place({ firmId: h.firmA, scope: { kind: "CASE", id: caseId }, reason: "Second hold", by: "seed:aud5-contract" });
      const r = await h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "closed_client_file", startedAt: yearsAgo(20), subject: caseId }));
      expect(r.verdict === "HELD" && [...r.reasons].sort().join("|") === "First hold|Second hold" && r.holds.length === 2, "both reasons", r);
    },
  },
  {
    name: "check: another firm's hold on the same record id never holds this firm's record",
    async run() {
      const h = await make(); await h.clear(); await h.clock.set(NOW);
      const caseId = uuid();
      await h.holds.place({ firmId: h.firmB, scope: { kind: "CASE", id: caseId }, reason: "Firm B's hold", by: "seed:aud5-contract" });
      const a = await h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmA, class: "client_financial", startedAt: yearsAgo(10), subject: caseId }));
      const b = await h.holds.tx((tx) => h.port.check(tx, { firmId: h.firmB, class: "client_financial", startedAt: yearsAgo(10), subject: caseId }));
      expect(a.verdict === "OK" && b.verdict === "HELD", "A OK, B HELD", { a, b });
    },
  },
  {
    name: "check: the College's REFERENCE row, a class not in the table, a blank subject and a case class without a case id are refused in words",
    async run() {
      const h = await make(); await h.clock.set(NOW);
      const ask = (input: unknown) => h.holds.tx((tx) => h.port.check(tx, input as never));
      const base = { firmId: h.firmA, startedAt: yearsAgo(1), subject: uuid() };
      await expectRefused(() => ask({ ...base, class: "college_client_file" }), "the College row", isRefused("NOT_A_RECORD_CLASS"));
      await expectRefused(() => ask({ ...base, class: "chat_messages" }), "a class not in the table", isRefused("BAD_INPUT"));
      await expectRefused(() => ask({ ...base, class: "our_billing", subject: "   " }), "a blank subject", isRefused("BAD_INPUT"));
      await expectRefused(() => ask({ ...base, class: "closed_client_file", subject: "file-17" }), "a closed file named without its case id", isRefused("BAD_INPUT"));
    },
  },
]);
