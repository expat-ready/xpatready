// AUD-5 part 1: KeepPeriodPort's contract (ports/keep-period.ts). Run by fakeKeepPeriods and by the real adapter
// KeepPeriods (api/src/platform/keep-period/service.ts). The port file's sentences: forFirm gives the firm's own number
// for closed client files, or null with "not set" (SA-11-33: no default); one firm's number never shows on another's
// read; a firm id that is not one is refused; check() with no hold check wired refuses (no silent OK).
// AUD-5 part 2: keepPeriodCheckContract, check()'s rules on every adapter with a LegalHoldPort wired: BR-7's order (a hold
// wins for every class, then the floor, then the firm's reminder), every matching hold's reason, another firm's hold never
// counts, and a class or subject with no hold check refused in words.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { LEGAL_HOLD_CATEGORY } from "../legal-hold.ts";
import { KEEP_PERIODS, KeepCheckRefused, addYears, type KeepCheckInput, type KeepCheckResult, type KeepClass, type KeepPeriodPort } from "../keep-period.ts";

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
    name: "check() with no hold check wired refuses (no caller can take a silent OK)",
    async run() {
      const h = await make();
      await expectRefused(() => h.port.check(null, { firmId: h.firmA, class: "closed_client_file", startedAt: new Date(0), subject: "contract" }), "check()", (e) => e instanceof Error && e.name === "KeepCheckNotBuilt");
    },
  },
]);

/** What check()'s contract needs: an adapter with a LegalHoldPort wired, the transaction a deleter would open, a way to
 *  place a hold, and the adapter's "now". **Every make() call gives two fresh firms** with no hold and no setting. */
export type KeepCheckHarness = KeepPeriodHarness & {
  tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  placeHold(firmId: string, scope: { kind: "FIRM" } | { kind: "CASE"; id: string } | { kind: "PERSON"; id: string } | { kind: "CATEGORY"; category: (typeof LEGAL_HOLD_CATEGORY)[number] } | { kind: "DATE_RANGE"; from: Date; to: Date }, reason: string): Promise<void>;
  now: Date;
};

const uuid = () => globalThis.crypto.randomUUID();
const ago = (h: KeepCheckHarness, years: number) => addYears(h.now, -years);
/** A check whose record's own date is its start date unless the case names others. */
const ask = (h: KeepCheckHarness, input: Omit<KeepCheckInput, "recordDates"> & { recordDates?: Date[] }) => h.tx((t) => h.port.check(t, { recordDates: [input.startedAt], ...input }));
/** A subject each class accepts (SUBJECT_KINDS). */
const subjectOf = (c: KeepClass, caseId: string): KeepCheckInput["subject"] => (c === "closed_client_file" || c === "client_financial" ? { kind: "CASE", id: caseId } : { kind: "RECORD", id: `rec-${caseId.slice(0, 8)}` });
const CHECKABLE = KEEP_PERIODS.filter((r) => r.kind !== "REFERENCE").map((r) => r.class);
const is = (r: KeepCheckResult, v: KeepCheckResult["verdict"]) => r.verdict === v;

export const keepPeriodCheckContract = defineContract("KeepPeriodPort.check", (make: () => Promise<KeepCheckHarness> | KeepCheckHarness) => [
  {
    name: "DW9: a held item is HELD with its reason, before any floor or reminder, for every class",
    async run() {
      const h = await make(), c = uuid();
      await h.set(h.firmA, 10);
      await h.placeHold(h.firmA, { kind: "FIRM" }, "Sample: regulator inquiry");
      for (const cls of CHECKABLE) for (const years of [1, 30]) {
        const r = await ask(h, { firmId: h.firmA, class: cls, startedAt: ago(h, years), subject: subjectOf(cls, c) });
        expect(r.verdict === "HELD" && r.reasons.length === 1 && r.reasons[0] === "Sample: regulator inquiry", `${cls} ${years}y ago: HELD with the reason`, r);
      }
    },
  },
  {
    name: "DW10: two active holds on one subject → HELD lists both reasons, oldest first",
    async run() {
      const h = await make(), c = uuid();
      await h.placeHold(h.firmA, { kind: "CASE", id: c }, "Sample: fee dispute");
      await h.placeHold(h.firmA, { kind: "CASE", id: c }, "Sample: court order");
      const r = await ask(h, { firmId: h.firmA, class: "closed_client_file", startedAt: ago(h, 20), subject: { kind: "CASE", id: c } });
      expect(r.verdict === "HELD" && r.reasons.join("|") === "Sample: fee dispute|Sample: court order" && r.holds.length === 2, "both reasons", r);
    },
  },
  {
    name: "DW11: a hold of another firm on the same subject id is not HELD for this firm",
    async run() {
      const h = await make(), c = uuid();
      await h.placeHold(h.firmB, { kind: "CASE", id: c }, "Sample: firm B's dispute");
      await h.placeHold(h.firmB, { kind: "FIRM" }, "Sample: firm B investigation");
      const a = await ask(h, { firmId: h.firmA, class: "closed_client_file", startedAt: ago(h, 20), subject: { kind: "CASE", id: c } });
      const b = await ask(h, { firmId: h.firmB, class: "closed_client_file", startedAt: ago(h, 20), subject: { kind: "CASE", id: c } });
      expect(is(a, "OK") && b.verdict === "HELD" && b.reasons.length === 2, "A OK, B HELD", { a, b });
    },
  },
  {
    name: "break M1: a date-range hold is matched on the record's own date, not only the date its period starts from",
    async run() {
      const h = await make();
      await h.placeHold(h.firmA, { kind: "DATE_RANGE", from: new Date("2019-01-01T00:00:00Z"), to: new Date("2019-06-30T00:00:00Z") }, "Sample: first half of 2019");
      const fy = new Date("2019-12-31T00:00:00Z");
      const inside = await ask(h, { firmId: h.firmA, class: "our_billing", startedAt: fy, recordDates: [new Date("2019-03-15T00:00:00Z")], subject: { kind: "RECORD", id: "inv-2019-03" } });
      const outside = await ask(h, { firmId: h.firmA, class: "our_billing", startedAt: fy, recordDates: [new Date("2019-09-01T00:00:00Z")], subject: { kind: "RECORD", id: "inv-2019-09" } });
      expect(inside.verdict === "HELD" && outside.verdict !== "HELD", "the March invoice HELD, the September one not", { inside, outside });
      await expectRefused(() => ask(h, { firmId: h.firmA, class: "our_billing", startedAt: fy, recordDates: [], subject: { kind: "RECORD", id: "x" } }), "no record date", (e) => e instanceof KeepCheckRefused);
    },
  },
  {
    name: "break M2, M3: a whole client file is held by any case-side category hold; a record of a case and a client is held by either",
    async run() {
      const h = await make(), c = uuid(), p = uuid(), other = uuid();
      await h.placeHold(h.firmA, { kind: "CATEGORY", category: "case_documents" }, "Sample: documents kept for an inquiry");
      const file = await ask(h, { firmId: h.firmA, class: "closed_client_file", startedAt: ago(h, 9), subject: { kind: "CASE", id: c } });
      expect(file.verdict === "HELD", "a 9-year-old file HELD by a case_documents hold", file);
      const g = await make();
      await g.placeHold(g.firmA, { kind: "CASE", id: c }, "Sample: case dispute");
      const both = await ask(g, { firmId: g.firmA, class: "client_financial", startedAt: ago(g, 8), subject: [{ kind: "PERSON", id: p }, { kind: "CASE", id: c }] });
      const personOnly = await ask(g, { firmId: g.firmA, class: "client_financial", startedAt: ago(g, 8), subject: { kind: "PERSON", id: other } });
      expect(both.verdict === "HELD" && personOnly.verdict === "OK", "case and client named: HELD; another client alone: OK", { both, personOnly });
    },
  },
  {
    name: "review M2: every class asks every hold subject it maps to (each scope placed alone holds it; another case, person or date does not)",
    async run() {
      const c = uuid(), p = uuid(), rec = new Date("2020-04-15T00:00:00Z");
      const asks: { cls: KeepClass; subject: KeepCheckInput["subject"]; scopes: Parameters<KeepCheckHarness["placeHold"]>[1][] }[] = [
        { cls: "closed_client_file", subject: [{ kind: "CASE", id: c }, { kind: "PERSON", id: p }], scopes: [{ kind: "CASE", id: c }, { kind: "PERSON", id: p }, ...LEGAL_HOLD_CATEGORY.map((category) => ({ kind: "CATEGORY" as const, category }))] },
        { cls: "client_financial", subject: [{ kind: "CASE", id: c }, { kind: "PERSON", id: p }], scopes: [{ kind: "CASE", id: c }, { kind: "PERSON", id: p }] },
        { cls: "activity_log", subject: [{ kind: "RECORD", id: "line-9" }, { kind: "PERSON", id: p }], scopes: [{ kind: "PERSON", id: p }] },
        ...(["our_billing", "breach_record", "our_staff_audit"] as const).map((cls) => ({ cls, subject: { kind: "RECORD" as const, id: `r-${cls}` }, scopes: [] })),
      ];
      for (const a of asks) for (const scope of [...a.scopes, { kind: "DATE_RANGE" as const, from: new Date("2020-04-01T00:00:00Z"), to: new Date("2020-04-30T00:00:00Z") }]) {
        const h = await make();
        await h.placeHold(h.firmA, scope, `Sample: ${scope.kind}`);
        const r = await ask(h, { firmId: h.firmA, class: a.cls, startedAt: ago(h, 30), recordDates: [rec], subject: a.subject });
        expect(r.verdict === "HELD", `${a.cls} held by a ${scope.kind} hold`, { scope, r });
      }
      const h = await make();
      await h.placeHold(h.firmA, { kind: "PERSON", id: uuid() }, "Sample: another person");
      await h.placeHold(h.firmA, { kind: "CASE", id: uuid() }, "Sample: another case");
      await h.placeHold(h.firmA, { kind: "DATE_RANGE", from: new Date("2021-01-01T00:00:00Z"), to: new Date("2021-12-31T00:00:00Z") }, "Sample: another year");
      const r = await ask(h, { firmId: h.firmA, class: "client_financial", startedAt: ago(h, 30), recordDates: [rec], subject: [{ kind: "CASE", id: c }, { kind: "PERSON", id: p }] });
      expect(r.verdict === "OK", "holds on another case, person and year do not hold it", r);
    },
  },
  {
    name: "DW6: a billing record whose fiscal year ended 5 years ago → FLOOR until year 6; one ended 7 years ago → OK",
    async run() {
      const h = await make(), five = ago(h, 5);
      const r5 = await ask(h, { firmId: h.firmA, class: "our_billing", startedAt: five, subject: { kind: "RECORD", id: "inv-5" } });
      const r7 = await ask(h, { firmId: h.firmA, class: "our_billing", startedAt: ago(h, 7), subject: { kind: "RECORD", id: "inv-7" } });
      expect(r5.verdict === "FLOOR" && r5.until.getTime() === addYears(five, 6).getTime() && is(r7, "OK"), "5y FLOOR until +6y, 7y OK", { r5, r7 });
    },
  },
  {
    name: "DW7, DW8: a closed file inside the firm's reminder → WARN; past it → OK; with no setting → OK; an activity line → FLOOR at any setting",
    async run() {
      const h = await make(), c = uuid();
      const file = (years: number) => ask(h, { firmId: h.firmA, class: "closed_client_file", startedAt: ago(h, years), subject: { kind: "CASE", id: c } });
      const line = () => ask(h, { firmId: h.firmA, class: "activity_log", startedAt: ago(h, 3), subject: { kind: "RECORD", id: "line-1" } });
      const unset = await file(2), lineUnset = await line();
      await h.set(h.firmA, 6);
      const inside = await file(2), past = await file(8), lineSet = await line();
      const other = await ask(h, { firmId: h.firmB, class: "closed_client_file", startedAt: ago(h, 2), subject: { kind: "CASE", id: c } });
      expect(is(unset, "OK") && is(past, "OK") && is(other, "OK"), "not set, past the reminder, and firm B (not set) → OK", { unset, past, other });
      expect(inside.verdict === "WARN" && inside.until.getTime() === addYears(ago(h, 2), 6).getTime(), "inside → WARN until closing + 6y", inside);
      expect(lineUnset.verdict === "FLOOR" && lineSet.verdict === "FLOOR", "activity line FLOOR either way", { lineUnset, lineSet });
    },
  },
  {
    name: "an unknown class, a REFERENCE class and a subject with no hold check are refused in words, never OK",
    async run() {
      const h = await make(), c = uuid();
      const refused = (code: string) => (e: unknown) => e instanceof KeepCheckRefused && e.code === code && /cannot be deleted/.test(e.message);
      await expectRefused(() => ask(h, { firmId: h.firmA, class: "everything" as KeepClass, startedAt: ago(h, 9), subject: { kind: "RECORD", id: "x" } }), "an unknown class", refused("UNKNOWN_CLASS"));
      await expectRefused(() => ask(h, { firmId: h.firmA, class: "college_client_file", startedAt: ago(h, 9), subject: { kind: "CASE", id: c } }), "the College REFERENCE row", (e) => refused("NO_HOLD_CHECK")(e) && /no hold check yet/.test((e as Error).message));
      await expectRefused(() => ask(h, { firmId: h.firmA, class: "closed_client_file", startedAt: ago(h, 9), subject: { kind: "RECORD", id: "file-1" } }), "a client file named without its case", refused("NO_HOLD_CHECK"));
      await expectRefused(() => ask(h, { firmId: "sample-firm", class: "our_billing", startedAt: ago(h, 9), subject: { kind: "RECORD", id: "x" } }), "a firm id that is not one", (e) => e instanceof KeepCheckRefused);
    },
  },
]);
