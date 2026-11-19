// AUD-5 part 2 (R1.105; brief build-lead-c-briefs/AUD-5-2.md, the draft design/briefs/AUD-5.md "Part 2 (AUD-5b)"): one
// check every deleter asks, in BR-7's order: a legal hold first (LegalHoldPort, PF-21b; its fake until PF-21b part 2's
// real adapter lands), then the floor in code, then the firm's own reminder. A pass and a fail for each named case: DW6
// billing floor from the fiscal year's end, DW7 the reminder's WARN and a deleter's reason on its audit line (BR-8), DW8
// no firm number and the activity log, DW9 a hold before everything for every class, DW10 two holds give both reasons,
// DW11 another firm's hold on the same record id. Also keepPeriodCheckContract on the fake and the real adapter
// (KeepPeriods) on a scratch database, and a small test-only deleter: no caller outside this test is wired (each
// deleter's own row wires it). No network, US$0.
//   tsx studio/tests/check_aud5_check.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeClock } from "../ports/clock.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { keepPeriodCheckContract, type KeepPeriodCheckHarness } from "../ports/contracts/keep-period-port.contract.ts";
import { fakeLegalHolds } from "../ports/legal-hold.ts";
import { addYears, fakeKeepPeriods, holdSubjectsOf, KEEP_PERIODS, KeepCheckNotBuilt, KeepCheckRefused, type KeepCheckInput } from "../ports/keep-period.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud5b_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
const refused = (code: string) => (e: unknown) => e instanceof KeepCheckRefused && e.code === code;

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);

const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { KeepPeriods, CLOSED_CLIENT_FILES } = await import("../api/src/platform/keep-period/service.ts");
const { writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/identity/audit.ts");
const { withFirm, wallUnscopedQueries } = await import("../api/src/platform/firm-scope.ts");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });

try {
  await seedSampleFirms(db);
  const FIRM_A = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  const FIRM_B = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } })).id;
  const WS = await platformAuditWorkspaceId(db);
  const KEY = CLOSED_CLIENT_FILES.key;
  const setYears = (firmId: string, years: number) => writeSetting(db, { firmId, key: KEY, value: years, by: "staff:aud5b", workspaceId: WS });
  const clearYears = () => sql(`delete from platform_firm_setting where key = '${KEY}'`);

  const NOW = new Date("2030-06-01T12:00:00.000Z"), clock = new FakeClock(NOW), holds = fakeLegalHolds();
  const kp = new KeepPeriods(db as never, holds as never, clock);
  const yearsAgo = (n: number) => addYears(NOW, -n);
  const uuid = () => globalThis.crypto.randomUUID();
  const check = (input: KeepCheckInput) => holds.transaction((tx) => kp.check(tx as never, input));

  // ------------------------------------------------------------------------------------------------- DW6: billing
  const b5 = await check({ firmId: FIRM_A, class: "our_billing", startedAt: yearsAgo(5), subject: "invoice-2025-0001" });
  ok("AUD-5 DW6 fail: deleting a billing record whose fiscal year ended 5 years ago → FLOOR, with the date the floor ends (6 years after, SA4-D18)",
    b5.verdict === "FLOOR" && b5.until?.toISOString() === addYears(yearsAgo(5), 6).toISOString(), b5);
  const b7 = await check({ firmId: FIRM_A, class: "our_billing", startedAt: yearsAgo(7), subject: "invoice-2023-0001" });
  ok("AUD-5 DW6 pass: one whose fiscal year ended 7 years ago → OK", b7.verdict === "OK", b7);
  const fin = await Promise.all([6, 8].map((n) => check({ firmId: FIRM_A, class: "client_financial", startedAt: yearsAgo(n), subject: uuid() })));
  ok("AUD-5 DW6 pass: the financial class (trust entries, receipts) is FLOOR for 7 years (NFR5-08, BR-6), then OK", fin[0].verdict === "FLOOR" && fin[1].verdict === "OK", fin);

  // ------------------------------------------------------------- DW7: the reminder, and a deleter's reason (BR-8)
  // A test-only deleter, as CS-X3's case delete door will be: check() in the deleter's own transaction (the hold store's,
  // which keeps the shared hold lock until it ends), refuse on HELD and FLOOR, and on WARN delete only with a reason,
  // written on the delete's audit line.
  sql(`create table aud5b_probe (id uuid primary key, firm_id uuid not null)`);
  const deleteClosedFile = async (firmId: string, caseId: string, closedAt: Date, reason?: string) =>
    holds.transaction(async (htx) => {
      const r = await kp.check(htx as never, { firmId, class: "closed_client_file", startedAt: closedAt, subject: caseId });
      if (r.verdict === "HELD" || r.verdict === "FLOOR") return { deleted: false, verdict: r.verdict };
      if (r.verdict === "WARN" && !reason?.trim()) return { deleted: false, verdict: r.verdict, refused: "REASON_NEEDED" };
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`delete from aud5b_probe where id = $1::uuid and firm_id = $2::uuid`, caseId, firmId);
        await tx.auditEvent.create({ data: { workspaceId: WS, actor: "staff:aud5b", action: "case.file.deleted", entity: "fo_aud5b_probe", entityKey: caseId, summary: `A closed client file was deleted (${r.verdict})`, detail: { firmId, verdict: r.verdict, ...(reason?.trim() ? { reason: reason.trim() } : {}) } } });
      });
      return { deleted: true, verdict: r.verdict };
    });
  const probe = (id: string, firm = FIRM_A) => sql(`insert into aud5b_probe values ('${id}', '${firm}')`);
  const there = (id: string) => sql(`select count(*) from aud5b_probe where id = '${id}'`) === "1";
  const lineOf = (id: string) => { try { return sql(`select coalesce((select detail::text from audit_event where entity_key = '${id}' and action = 'case.file.deleted'), '')`); } catch (e) { return `unreadable: ${String(e).slice(0, 200)}`; } };

  await setYears(FIRM_A, 8);
  const c1 = uuid(); probe(c1);
  const w = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(3), subject: c1 });
  ok("AUD-5 DW7 pass: a closed file inside the firm's reminder (8 years, closed 3 years ago) → WARN, with the date it ends and plain words",
    w.verdict === "WARN" && w.until.toISOString() === addYears(yearsAgo(3), 8).toISOString() && /Give a reason/.test(w.why), w);
  const noReason = await deleteClosedFile(FIRM_A, c1, yearsAgo(3)), blank = await deleteClosedFile(FIRM_A, c1, yearsAgo(3), " \t ");
  ok("AUD-5 DW7 fail: without a reason (or an empty or whitespace one) the delete is refused, nothing deleted, no audit line", !noReason.deleted && !blank.deleted && there(c1) && lineOf(c1) === "", { noReason, blank });
  const withReason = await deleteClosedFile(FIRM_A, c1, yearsAgo(3), "The client asked for early deletion in writing.");
  const line = lineOf(c1);
  ok("AUD-5 DW7 pass: with a reason it is deleted, and the reason is on its audit line with the WARN (BR-8)", withReason.deleted && !there(c1) && /"reason": "The client asked for early deletion in writing\."/.test(line) && /"verdict": "WARN"/.test(line), { withReason, line });
  const c2 = uuid(); probe(c2);
  const past = await deleteClosedFile(FIRM_A, c2, yearsAgo(9));
  ok("AUD-5 DW7 pass: past the firm's number (closed 9 years ago) → OK, deleted without a reason", past.deleted && past.verdict === "OK" && !there(c2), past);

  // ------------------------------------------------------------------------- DW8: no firm number; the activity log
  clearYears();
  const unset = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(1), subject: uuid() });
  ok("AUD-5 DW8 pass: with no firm setting a closed file → OK (SA-11-33 sets no default; the College's 6 years is never applied)", unset.verdict === "OK", unset);
  const logs = await Promise.all([0, 7, 50].map((n) => check({ firmId: FIRM_A, class: "activity_log", startedAt: yearsAgo(n), subject: "audit-line-1" })));
  ok("AUD-5 DW8 fail: an activity-log line → FLOOR always, at any age (never deleted by the product, SA-11-14)", logs.every((r) => r.verdict === "FLOOR" && r.until === null), logs);
  await setYears(FIRM_B, 30);
  const crossFirm = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(10), subject: uuid() });
  ok("AUD-5 DW8 fail: firm B's number (30) never applies to firm A's check (A has none → OK)", crossFirm.verdict === "OK", crossFirm);

  // ---------------------------------------------------------------------------- DW9: a hold before everything (BR-7)
  await setYears(FIRM_A, 8);
  const held = uuid(), start = yearsAgo(40); probe(held);
  await holds.place({ firmId: FIRM_A, scope: { kind: "CASE", id: held }, reason: "Litigation hold: matter 2030-17", by: "seed:aud5b" });
  await holds.place({ firmId: FIRM_A, scope: { kind: "DATE_RANGE", from: start, to: start }, reason: "Records hold: 1990", by: "seed:aud5b" });
  const classes = KEEP_PERIODS.filter((r) => r.kind !== "REFERENCE").map((r) => r.class);
  const anyRecord = uuid();   // a fresh id: only the date-range hold covers it
  const all = await Promise.all(classes.map((c) => check({ firmId: FIRM_A, class: c, startedAt: start, subject: anyRecord })));
  ok("AUD-5 DW9 fail: a held item → HELD with its reason, before any floor or reminder, for every class (6), even 40 years old",
    classes.length === 6 && all.every((r) => r.verdict === "HELD" && r.reason === "Records hold: 1990"), all);
  const heldDelete = await deleteClosedFile(FIRM_A, held, yearsAgo(3), "a reason does not lift a hold");
  ok("AUD-5 DW9 fail: a held closed file is not deleted even with a reason (a hold beats the reminder)", !heldDelete.deleted && heldDelete.verdict === "HELD" && there(held), heldDelete);
  const free = await check({ firmId: FIRM_A, class: "our_billing", startedAt: yearsAgo(7), subject: "invoice-2023-0002" });
  ok("AUD-5 DW9 pass: a record no hold covers → the floor and reminder decide (billing 7 years old: OK)", free.verdict === "OK", free);

  // ------------------------------------------------------------------- DW10: two holds; DW11: another firm's hold
  const two = uuid();
  await holds.place({ firmId: FIRM_A, scope: { kind: "CASE", id: two }, reason: "Hold one", by: "seed:aud5b" });
  await holds.place({ firmId: FIRM_A, scope: { kind: "CASE", id: two }, reason: "Hold two", by: "seed:aud5b" });
  const both = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(20), subject: two });
  ok("AUD-5 DW10 pass: two active holds on one subject → HELD lists both reasons, never only the first",
    both.verdict === "HELD" && [...both.reasons].sort().join("|") === "Hold one|Hold two" && both.holds.length === 2 && both.reason === both.reasons.join("; "), both);
  const one = uuid();
  await holds.place({ firmId: FIRM_A, scope: { kind: "CASE", id: one }, reason: "Only hold", by: "seed:aud5b" });
  const single = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(20), subject: one });
  ok("AUD-5 DW10 fail: one hold → one reason (no hold of another subject is added)", single.verdict === "HELD" && single.reasons.join("|") === "Only hold", single);
  const shared = uuid();
  await holds.place({ firmId: FIRM_B, scope: { kind: "CASE", id: shared }, reason: "Firm B's hold", by: "seed:aud5b" });
  const forA = await check({ firmId: FIRM_A, class: "client_financial", startedAt: yearsAgo(10), subject: shared });
  const forB = await check({ firmId: FIRM_B, class: "client_financial", startedAt: yearsAgo(10), subject: shared });
  ok("AUD-5 DW11 fail: a hold of another firm (B) on the same subject id → not HELD for firm A", forA.verdict === "OK", forA);
  ok("AUD-5 DW11 pass: the same hold → HELD for its own firm (B)", forB.verdict === "HELD" && forB.reason === "Firm B's hold", forB);

  // --------------------------------------------- the breaker's findings (F1 category, F2 person and dates, F6 dates)
  const catCase = uuid();
  const catHold = await holds.place({ firmId: FIRM_A, scope: { kind: "CATEGORY", category: "case_files" }, reason: "All case files held", by: "seed:aud5b" });
  const cat = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(10), subject: catCase });
  await holds.release({ holdId: catHold.holdId, by: "seed:aud5b", reason: "check done" });
  const catAfter = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(10), subject: catCase });
  ok("AUD-5 break F1 fail: a CATEGORY hold on case_files holds a closed client file (HELD, never OK or WARN); released, it no longer does",
    cat.verdict === "HELD" && cat.reasons.includes("All case files held") && catAfter.verdict !== "HELD", { cat, catAfter });
  const person = uuid(), personCase = uuid();
  await holds.place({ firmId: FIRM_A, scope: { kind: "PERSON", id: person }, reason: "Client's records held", by: "seed:aud5b" });
  const noAlso = await check({ firmId: FIRM_A, class: "client_financial", startedAt: yearsAgo(10), subject: personCase });
  const withAlso = await check({ firmId: FIRM_A, class: "client_financial", startedAt: yearsAgo(10), subject: personCase, also: [{ kind: "PERSON", id: person }] });
  ok("AUD-5 break F2 pass: the caller adds the case's people (also: PERSON) and a person hold holds the record; without them it cannot be seen",
    noAlso.verdict === "OK" && withAlso.verdict === "HELD" && withAlso.reason === "Client's records held", { noAlso, withAlso });
  const openedIn = new Date("2022-03-01T00:00:00.000Z"), rangeCase = uuid();
  await holds.place({ firmId: FIRM_A, scope: { kind: "DATE_RANGE", from: new Date("2022-01-01T00:00:00Z"), to: new Date("2022-12-31T00:00:00Z") }, reason: "2022 matters held", by: "seed:aud5b" });
  const range = await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: new Date("2024-05-01T00:00:00Z"), subject: rangeCase, also: [{ kind: "DATE", at: openedIn }] });
  ok("AUD-5 break F2 pass: a case open during a held date range (also: DATE) is HELD though it closed after the range", range.verdict === "HELD" && range.reasons.includes("2022 matters held"), range);
  ok("AUD-5 break F6 fail: a start in the future, or one the calendar cannot carry forward, is refused (BAD_INPUT), never OK",
    await throwsLike(() => check({ firmId: FIRM_A, class: "our_billing", startedAt: addYears(NOW, 2), subject: "invoice-future" }), refused("BAD_INPUT"))
    && await throwsLike(() => check({ firmId: FIRM_A, class: "our_billing", startedAt: new Date(8.64e15 - 1000), subject: "invoice-far" }), refused("BAD_INPUT"))
    && await throwsLike(() => check({ firmId: FIRM_A, class: "our_billing", startedAt: new Date("1066-10-14T00:00:00Z"), subject: "invoice-old" }), refused("BAD_INPUT")));
  ok("AUD-5 break F11 fail: a prototype name is no class (holdSubjectsOf reads own keys only)",
    await throwsLike(() => holdSubjectsOf("toString", "x", NOW), refused("NO_HOLD_CHECK")) && await throwsLike(() => holdSubjectsOf("constructor", "x", NOW), refused("NO_HOLD_CHECK")));

  // ------------------------------------------------------------------------- refusals (no silent OK, ever)
  const base = { firmId: FIRM_A, startedAt: yearsAgo(1), subject: uuid() };
  ok("fail: the College's REFERENCE row is not a class of record (NOT_A_RECORD_CLASS)", await throwsLike(() => check({ ...base, class: "college_client_file" }), refused("NOT_A_RECORD_CLASS")));
  ok("fail: a class not in the table, a blank or whitespace subject, or a firm id that is not one is refused (BAD_INPUT)",
    await throwsLike(() => check({ ...base, class: "chat_messages" as never }), refused("BAD_INPUT"))
    && await throwsLike(() => check({ ...base, class: "our_billing", subject: "  " }), refused("BAD_INPUT"))
    && await throwsLike(() => check({ ...base, firmId: "sample-firm", class: "our_billing" }), refused("BAD_INPUT")));
  ok("fail: a closed client file or a financial record named by anything but its case id is refused in words (BAD_INPUT)",
    await throwsLike(() => check({ ...base, class: "closed_client_file", subject: "file-17" }), (e) => refused("BAD_INPUT")(e) && /case id/.test((e as Error).message))
    && await throwsLike(() => check({ ...base, class: "client_financial", subject: "trust-1" }), refused("BAD_INPUT")));
  ok("fail: a record type with no hold-subject mapping is refused in words (\"no hold check yet\"), never passed as OK",
    await throwsLike(() => holdSubjectsOf("chat_messages", "x", NOW), (e) => refused("NO_HOLD_CHECK")(e) && /has no hold check yet/.test((e as Error).message)));
  const fileKinds = holdSubjectsOf("closed_client_file", held, NOW).map((s) => s.kind);
  ok("pass: every class of record has a hold-subject mapping; a closed file asks about its CASE, its DATE and every case-side category",
    classes.every((c) => holdSubjectsOf(c, held, NOW).length > 0) && fileKinds[0] === "CASE" && fileKinds[1] === "DATE" && fileKinds.filter((k) => k === "CATEGORY").length === 5, fileKinds);
  ok("fail: with no legal-hold store wired (the API today), check() refuses (KeepCheckNotBuilt): nothing is deleted without asking it",
    await throwsLike(() => new KeepPeriods(db as never).check(null as never, { ...base, class: "our_billing" }), (e) => e instanceof KeepCheckNotBuilt)
    && await throwsLike(() => fakeKeepPeriods().check(null, { ...base, class: "our_billing" }), (e) => e instanceof KeepCheckNotBuilt));
  ok("fail: check() outside the hold store's open transaction is refused (the hold is read in the caller's transaction, PF-21b rule 3)",
    await throwsLike(() => kp.check({} as never, { ...base, class: "our_billing" }), (e) => /open transaction/.test(String(e))));
  const mid = uuid(); probe(mid);
  const midRun = await holds.transaction(async (htx) => {
    const r1 = await kp.check(htx as never, { firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(3), subject: mid });
    await setYears(FIRM_A, 1);   // the setting changes after the check was answered
    return r1;
  });
  ok("pass (breaker): the setting changed mid-request does not change an answer already given; the next check reads the new number",
    midRun.verdict === "WARN" && (await check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(3), subject: mid })).verdict === "OK", midRun);
  const src = readFileSync(join(STUDIO, "ports", "keep-period.ts"), "utf8");
  const rule = src.slice(src.indexOf("export function addYears"), src.indexOf("/** The port."));
  ok("pass: check()'s rule never names the College number, and the clock port decides time (P-607: no new Date() in the rule)", rule.length > 500 && !/COLLEGE/.test(rule) && !/new Date\(\)/.test(rule));

  // ------------------------------------------------------------------ review Minors: dates and an unreadable setting
  const thisYear = await check({ firmId: FIRM_A, class: "our_billing", startedAt: new Date(NOW.getTime() + 200 * 24 * 3600 * 1000), subject: "invoice-this-year" });
  ok("review m: this year's invoice (its fiscal year ends ahead) → FLOOR, not a refusal", thisYear.verdict === "FLOOR" && thisYear.until?.toISOString() === addYears(new Date(NOW.getTime() + 200 * 24 * 3600 * 1000), 6).toISOString(), thisYear);
  const end = yearsAgo(6), atEnd = await check({ firmId: FIRM_A, class: "our_billing", startedAt: end, subject: "invoice-edge" });
  const justIn = await check({ firmId: FIRM_A, class: "our_billing", startedAt: new Date(end.getTime() + 1000), subject: "invoice-edge2" });
  ok("review m: the floor ends at its date exactly: started 6 years ago to the second → OK; one second later → FLOOR", atEnd.verdict === "OK" && justIn.verdict === "FLOOR", { atEnd, justIn });
  ok("review m: a floor started on 29 Feb ends on 28 Feb in a common year (Unconfirmed: no counsel)", addYears(new Date("2024-02-29T00:00:00Z"), 1).toISOString() === "2025-02-28T00:00:00.000Z" && addYears(new Date("2024-02-29T00:00:00Z"), 4).toISOString() === "2028-02-29T00:00:00.000Z");
  const neverWhy = await check({ firmId: FIRM_A, class: "activity_log", startedAt: yearsAgo(1), subject: "audit-line-2" });
  ok("review m: an activity-log FLOOR says it is never deleted", neverWhy.verdict === "FLOOR" && /Nothing in the product deletes it/.test(neverWhy.why), neverWhy);
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by, changed_at) values ('${FIRM_A}', '${KEY}', '"not a number"', 'test', now()) on conflict (firm_id, key) do update set value = excluded.value`);
  ok("review m: an unreadable stored setting is refused in words (SETTING_UNREADABLE), never read as not set",
    await throwsLike(() => check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(3), subject: uuid() }), refused("SETTING_UNREADABLE")));
  clearYears();

  // ---------------------------------------------------- break F3/F4: the firm asked is the firm the caller runs as
  const inB = await throwsLike(() => withFirm(FIRM_B, () => check({ firmId: FIRM_A, class: "our_billing", startedAt: yearsAgo(7), subject: "invoice-x" })), refused("FIRM_SCOPE"));
  const inA = await withFirm(FIRM_A, () => check({ firmId: FIRM_A, class: "our_billing", startedAt: yearsAgo(7), subject: "invoice-x" }));
  ok("AUD-5 break F3/F4 fail: run in firm B's scope, a check asking for firm A is refused (FIRM_SCOPE): a firm id taken from the request cannot steer it",
    inB && inA.verdict === "OK", { inB, inA });

  // -------------------------------------------------------------------------- the check contract, fake and real
  clearYears();
  const fakeHolds = fakeLegalHolds(), fakeClock = new FakeClock(NOW), fake = fakeKeepPeriods({}, { holds: fakeHolds, clock: fakeClock });
  const realHolds = fakeLegalHolds(), realClock = new FakeClock(NOW), real = new KeepPeriods(db as never, realHolds as never, realClock);
  const fakeHarness = (): KeepPeriodCheckHarness => ({ port: fake, firmA: FIRM_A, firmB: FIRM_B, set: async (f, y) => fake.set(f, y), clear: async () => { fake.set(FIRM_A, null); fake.set(FIRM_B, null); },
    holds: { tx: (fn) => fakeHolds.transaction(fn), place: (i) => fakeHolds.place(i) }, clock: fakeClock });
  const realHarness = (): KeepPeriodCheckHarness => ({ port: real as never, firmA: FIRM_A, firmB: FIRM_B, set: async (f, y) => { await setYears(f, y); }, clear: async () => { clearYears(); },
    holds: { tx: (fn) => realHolds.transaction(fn), place: (i) => realHolds.place(i) }, clock: realClock });
  const rFake = await runContract(keepPeriodCheckContract, "fakeKeepPeriods", fakeHarness, ok);
  const rReal = await runContract(keepPeriodCheckContract, "KeepPeriods", realHarness, ok);
  ok("pass: check()'s contract passes for the fake and the real adapter (7 cases each)", rFake.failed.length === 0 && rReal.failed.length === 0 && rFake.passed.length === 7 && rReal.passed.length === 7);
  const broken = await runContract(keepPeriodCheckContract, "broken", () => ({ ...fakeHarness(), port: { ...fake, check: async () => ({ verdict: "OK" as const }) } }), null);
  ok("fail: an adapter whose check() always says OK breaks the contract", broken.failed.length >= 5, broken);
  // Last, as it changes the process (break F3): under the API's walled database a check with no firm scope is refused.
  wallUnscopedQueries();
  ok("AUD-5 break F3 fail: with the database walled (the API) and no firm scope (a job that forgot it), check() is refused (FIRM_SCOPE), never a false OK",
    await throwsLike(() => check({ firmId: FIRM_A, class: "closed_client_file", startedAt: yearsAgo(3), subject: uuid() }), refused("FIRM_SCOPE")));
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
