// AUD-5 part 2 (R1.105; brief build-lead-c-briefs/AUD-5-2.md): one check every deleter asks, in BR-7's order (legal hold,
// then the floor, then the firm's reminder). Every named case, a pass and a fail each: DW6 the billing floor, DW7 a WARN
// delete needs a reason and the reason is on its audit line, DW8 no setting → OK and the activity log always a floor,
// DW9 a hold wins for every class, DW10 every matching hold's reason, DW11 another firm's hold never counts. The shared
// contract runs on the fake and on the real adapter (a scratch database); adapters that break a rule fail it. The
// breaker's five tries are here too. No caller outside this test (callers wire it in their own rows). No network, US$0.
//   tsx studio/tests/check_aud5_check.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { keepPeriodCheckContract, keepPeriodPortContract, type KeepCheckHarness } from "../ports/contracts/keep-period-port.contract.ts";
import { fakeAudit } from "../ports/audit.ts";
import { fakeLegalHolds } from "../ports/legal-hold.ts";
import { KeepCheckNotBuilt, KeepCheckRefused, addYears, decide, fakeKeepPeriods, subjectsFor, warnReason, type HoldsForCheck, type KeepCheckInput, type KeepCheckResult, type KeepPeriodPort } from "../ports/keep-period.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud5b_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const refusedWith = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
const uuid = () => globalThis.crypto.randomUUID();
const NOW = new Date("2026-11-19T00:00:00Z");
const ago = (y: number) => addYears(NOW, -y);
const BY = "staff:5b1f3a8e-0000-4000-8000-0000000000c2";

// --------------------------------------------------------------------------- the fake harness (and broken adapters)
type Holds = ReturnType<typeof fakeLegalHolds>;
/** A fresh fake: its own hold store and two fresh firms; `wrap` turns it into a broken adapter. */
const fakeHarness = (wrap?: (holds: Holds, firms: string[]) => HoldsForCheck<unknown>) => (): KeepCheckHarness => {
  let ms = NOW.getTime() - 86_400_000;
  const holds = fakeLegalHolds({ now: () => new Date(ms += 1000) });
  const firmA = uuid(), firmB = uuid();
  const port = fakeKeepPeriods({}, { holds: wrap ? wrap(holds, [firmA, firmB]) : holds, now: () => NOW });
  return {
    port, firmA, firmB, now: NOW, tx: (fn) => holds.transaction(fn),
    set: async (f, y) => port.set(f, y), clear: async () => { port.set(firmA, null); port.set(firmB, null); },
    placeHold: async (firmId, scope, reason) => { await holds.place({ firmId, scope, reason, by: BY }); },
  };
};
const CASES = keepPeriodCheckContract(fakeHarness()).map((c) => c.name);
const onlyFailed = (r: { failed: string[] }, idx: number[]) => r.failed.length === idx.length && idx.every((i) => r.failed.includes(CASES[i]));

const good = await runContract(keepPeriodCheckContract, "fakeKeepPeriods", fakeHarness(), ok);
ok("AUD-5 DW6-DW11 pass: check()'s contract passes on the fake with fakeLegalHolds wired", good.failed.length === 0 && good.passed.length === CASES.length, good);
const part1 = await runContract(keepPeriodPortContract, "fakeKeepPeriods", () => { const h = fakeHarness()(); return h; }, null);
ok("AUD-5 pass: part 1's contract still passes on a fake with holds wired, but for its check-refuses case (that case is for an unwired port)", part1.failed.length === 1 && /no hold check wired/.test(part1.failed[0]), part1.failed);
ok("AUD-5 fail: a port with no LegalHoldPort wired refuses check() (no silent OK)",
  await refusedWith(() => fakeKeepPeriods().check(null, { firmId: uuid(), class: "our_billing", recordDates: [NOW], startedAt: ago(9), subject: { kind: "RECORD", id: "x" } }), (e) => e instanceof KeepCheckNotBuilt));

ok("AUD-5 fail: a bare string subject (part 1's placeholder shape) is refused at run time on a wired port, never mapped",
  await refusedWith(() => { const h = fakeHarness()(); return h.tx((t) => h.port.check(t, { firmId: h.firmA, class: "our_billing", recordDates: [NOW], startedAt: ago(9), subject: "inv-1" })); }, (e) => e instanceof KeepCheckRefused && e.code === "INVALID_INPUT"));
ok("AUD-5 fail (break M1): a check that names no record date is refused at run time, never matched on the start date alone",
  await refusedWith(() => { const h = fakeHarness()(); return h.tx((t) => h.port.check(t, { firmId: h.firmA, class: "our_billing", startedAt: ago(9), subject: { kind: "RECORD", id: "inv-1" } })); }, (e) => e instanceof KeepCheckRefused && e.code === "INVALID_INPUT"));
ok("AUD-5 fail (review A): a closed client file named by its client only (no case) is refused, never checked on the person alone",
  await refusedWith(() => { const h = fakeHarness()(); return h.tx((t) => h.port.check(t, { firmId: h.firmA, class: "closed_client_file", startedAt: ago(9), recordDates: [ago(9)], subject: { kind: "PERSON", id: uuid() } })); }, (e) => e instanceof KeepCheckRefused && e.code === "NO_HOLD_CHECK"));
// DW9 fail: an adapter that decides the floor and the reminder before the hold (BR-7's order broken).
const floorFirst = (): KeepCheckHarness => {
  const h = fakeHarness()();
  return { ...h, port: { ...h.port, async check(tx, raw) {
    const { row, input } = subjectsFor(raw);
    const d = decide(row, input.startedAt, (await h.port.forFirm(input.firmId)).closedClientFilesYears, NOW);
    return d.verdict === "OK" ? h.port.check(tx, raw) : d;
  } } };
};
const rFloorFirst = await runContract(keepPeriodCheckContract, "floorFirst", floorFirst, null);
ok("AUD-5 DW9 fail: an adapter that checks the floor and the reminder before the hold fails the hold-wins case", rFloorFirst.failed.includes(CASES[0]), rFloorFirst.failed);
// DW10 fail: an adapter whose hold answer keeps only the first match.
const rFirst = await runContract(keepPeriodCheckContract, "firstHoldOnly", fakeHarness((h) => ({ async isHeld(t, f, s) { const a = await h.isHeld(t, f, s as never); return a.held ? { held: true, holds: a.holds.slice(0, 1) } : a; } })), null);
ok("AUD-5 DW10 fail: an adapter that reports only the first hold fails the two-holds case (and DW11's B side)", onlyFailed(rFirst, [1, 2]), rFirst.failed);
// DW11 fail: an adapter that asks the hold store about every firm it knows (a held item of another firm counts).
const rAnyFirm = await runContract(keepPeriodCheckContract, "anyFirm", fakeHarness((h, firms) => ({
  async isHeld(t, _f, s) {
    const holds = (await Promise.all(firms.map((x) => h.isHeld(t, x, s as never)))).flatMap((a) => (a.held ? a.holds : []));
    return holds.length ? { held: true, holds } : { held: false };
  },
})), null);
ok("AUD-5 DW11 fail: an adapter that counts another firm's hold fails the other-firm case", rAnyFirm.failed.includes(CASES[2]), rAnyFirm.failed);

// Review M2 fail: an adapter that asks the hold store about the firm only (the class-to-subject map dropped).
const rFirmOnly = await runContract(keepPeriodCheckContract, "firmOnly", fakeHarness((h) => ({ isHeld: (t, f) => h.isHeld(t, f, [{ kind: "FIRM" }]) })), null);
ok("AUD-5 fail (review M2): an adapter that sends only the FIRM subject fails the subject-map case (and the case, date and category cases)", rFirmOnly.failed.includes(CASES[5]) && rFirmOnly.failed.includes(CASES[3]) && rFirmOnly.failed.includes(CASES[4]), rFirmOnly.failed);

// The rule itself, firm-free: DW6 and DW8's numbers.
const row = (c: string) => subjectsFor({ firmId: uuid(), class: c, startedAt: ago(1), recordDates: [ago(1)], subject: { kind: c === "closed_client_file" ? "CASE" : "RECORD", id: c === "closed_client_file" ? uuid() : "r" } }).row;
const d5 = decide(row("our_billing"), ago(5), null, NOW), d7 = decide(row("our_billing"), ago(7), null, NOW);
ok("AUD-5 DW6 pass: a billing record whose fiscal year ended 7 years ago → OK", d7.verdict === "OK", d7);
ok("AUD-5 DW6 fail: one whose fiscal year ended 5 years ago → FLOOR, refused until the end of year 6, in words", d5.verdict === "FLOOR" && d5.until.toISOString().startsWith("2027-11-19") && /cannot be deleted before then/.test(d5.words), d5);
ok("AUD-5 DW6 pass (review A): the billing floor's words keep \"Unconfirmed: no counsel\" (SA4-D18 is not confirmed)", d5.verdict === "FLOOR" && d5.words.endsWith("(Unconfirmed: no counsel)"), d5);
ok("AUD-5 DW8 pass: with no firm setting a closed file → OK, however recently closed", decide(row("closed_client_file"), ago(0), null, NOW).verdict === "OK");
ok("AUD-5 DW8 fail: an activity-log line → FLOOR at any setting (1 or 50 years), until 7 years after it was written",
  [1, 50, null].every((y) => { const r = decide(row("activity_log"), ago(6), y, NOW); return r.verdict === "FLOOR" && r.until.getTime() === addYears(ago(6), 7).getTime(); }));
ok("AUD-5 pass: no answer's words say \"legal obligation\" or \"required by law\"",
  [d5, decide(row("closed_client_file"), ago(1), 6, NOW)].every((r) => r.verdict !== "OK" && !/legal obligation|required by law/i.test(r.words)));

// --------------------------------------------------------------------------- the real adapter (scratch database)
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { KeepPeriods, CLOSED_CLIENT_FILES } = await import("../api/src/platform/keep-period/service.ts");
const { writeSetting } = await import("../api/src/platform/settings.ts");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const KEY = CLOSED_CLIENT_FILES.key;

try {
  await seedSampleFirms(db);
  const FIRM_A = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })).id;
  const FIRM_B = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } })).id;
  const ws = await (await import("../api/src/platform/identity/audit.ts")).platformAuditWorkspaceId(db);
  const set = async (f: string, y: number) => { await writeSetting(db, { firmId: f, key: KEY, value: y, by: "staff:5b1f3a8e-0000-4000-8000-0000000000c2", workspaceId: ws }); };
  const clearNow = () => { sql(`delete from platform_firm_setting where firm_id in ('${FIRM_A}', '${FIRM_B}') and key = '${KEY}'`); };
  const clear = async () => clearNow();
  /** Until PF-21b part 2's real hold adapter, the fake hold store stands in: each isHeld runs in its own fake transaction
   *  (the lock rule is proven on the fake by check_pf21b_port.ts); check() still reads the setting through the Prisma tx. */
  const bridge = (h: Holds): HoldsForCheck<unknown> => ({ isHeld: (_tx, f, s) => h.transaction((t) => h.isHeld(t, f, s as never)) });
  const realHarness = (): KeepCheckHarness => {
    clearNow();   // every make(): both firms with no setting and a fresh hold store (the contract's "fresh firms")
    let ms = NOW.getTime() - 86_400_000;
    const holds = fakeLegalHolds({ now: () => new Date(ms += 1000) });
    const port = new KeepPeriods(db, bridge(holds) as never, () => NOW);
    return {
      port: port as never, firmA: FIRM_A, firmB: FIRM_B, now: NOW, set, clear,
      tx: (fn) => db.$transaction((t) => fn(t)),
      placeHold: async (firmId, scope, reason) => { await holds.place({ firmId, scope, reason, by: BY }); },
    };
  };
  const real = await runContract(keepPeriodCheckContract, "KeepPeriods", realHarness, ok);
  ok("AUD-5 DW6-DW11 pass: check()'s contract passes on the real adapter (setting read through the deleter's Prisma transaction)", real.failed.length === 0 && real.passed.length === CASES.length, real);
  ok("AUD-5 fail: the real adapter with no LegalHoldPort wired refuses check() (no silent OK until PF-21b part 2 wires it)",
    await refusedWith(() => db.$transaction((t) => new KeepPeriods(db).check(t as never, { firmId: FIRM_A, class: "our_billing", recordDates: [NOW], startedAt: ago(9), subject: { kind: "RECORD", id: "x" } })), (e) => e instanceof KeepCheckNotBuilt));

  // DW7: a test-only deleter of a closed client file (no caller outside this test): HELD and FLOOR refuse; WARN goes ahead
  // only with a reason, written on the delete's one audit line (BR-8); a refused delete deletes nothing and writes nothing.
  await clear(); await set(FIRM_A, 6);
  const holds = fakeLegalHolds(), port = new KeepPeriods(db, bridge(holds) as never, () => NOW), audit = fakeAudit();
  const store = new Map<string, { firmId: string; closedAt: Date }>();
  const staffA = { staffId: "5b1f3a8e-0000-4000-8000-0000000000c2", firmId: FIRM_A, firmKey: "sample-firm", roles: ["OWNER"], keys: [], duties: [], authTime: 0, via: "local" as const };
  const deleteFile = (caseId: string, reason?: unknown, ask?: Record<string, unknown>) => db.$transaction(async (tx) => {
    const f = store.get(caseId)!;
    const r: KeepCheckResult = await port.checkFor(tx as never, staffA as never, ask ?? { class: "closed_client_file", recordDates: [NOW], startedAt: f.closedAt, subject: { kind: "CASE", id: caseId } });
    if (r.verdict === "HELD" || r.verdict === "FLOOR") throw new KeepCheckRefused("INVALID_INPUT", r.words);
    const why = warnReason(r, reason);
    store.delete(caseId);
    await audit.record(tx, { firmId: f.firmId, actor: `staff:${staffA.staffId}`, action: "client_file.deleted", entity: "plat_client_file", entityKey: caseId, summary: "A closed client file was deleted.", detail: { verdict: r.verdict, ...(why ? { reason: why } : {}) } });
    return r;
  });
  const recent = uuid(), old = uuid();
  store.set(recent, { firmId: FIRM_A, closedAt: ago(2) }); store.set(old, { firmId: FIRM_A, closedAt: ago(8) });
  const noReason = await Promise.all([undefined, "", "   ", "\u200b\t", "\u3164", "\u115f\u1160"].map((r) => refusedWith(() => deleteFile(recent, r), (e) => e instanceof KeepCheckRefused && /Give a reason/.test((e as Error).message))));
  ok("AUD-5 DW7 fail: a closed file inside the firm's 6-year reminder with no reason (none, empty, whitespace, invisible only) is refused; nothing deleted, no audit line",
    noReason.every(Boolean) && store.has(recent) && audit.entries.length === 0, noReason);
  const warned = await deleteFile(recent, "  Client asked for erasure; our copy is with the College.  ");
  const line = audit.entries.at(-1);
  ok("AUD-5 DW7 pass: with a reason the WARN delete goes ahead, and the trimmed reason is on its one audit line",
    warned.verdict === "WARN" && !store.has(recent) && audit.entries.length === 1 && line?.detail.reason === "Client asked for erasure; our copy is with the College." && line.detail.verdict === "WARN", { warned, line });
  const past = await deleteFile(old);
  ok("AUD-5 DW7 pass: a file past the reminder is OK and needs no reason (no reason on its line)", past.verdict === "OK" && !store.has(old) && !("reason" in (audit.entries.at(-1)?.detail ?? {})));

  // Breaker tries.
  const c1 = uuid(); store.set(c1, { firmId: FIRM_A, closedAt: ago(2) });
  ok("break: a check that names a firm (taken from the request) is refused, whatever firm it names; nothing deleted",
    await refusedWith(() => deleteFile(c1, "x", { class: "closed_client_file", recordDates: [NOW], startedAt: ago(2), subject: { kind: "CASE", id: c1 }, firmId: FIRM_B }), (e) => e instanceof KeepCheckRefused && /never names one/.test((e as Error).message)) && store.has(c1));
  await holds.place({ firmId: FIRM_B, scope: { kind: "CASE", id: c1 }, reason: "Sample: firm B's hold", by: BY });
  const crossed = await db.$transaction((t) => port.checkFor(t as never, staffA as never, { class: "closed_client_file", recordDates: [NOW], startedAt: ago(2), subject: { kind: "CASE", id: c1 } }));
  ok("break: a held item of another firm on the same id does not hold firm A's session (WARN, its own reminder)", crossed.verdict === "WARN", crossed);
  ok("break: a class name that is not in the table is refused in words",
    await refusedWith(() => db.$transaction((t) => port.checkFor(t as never, staffA as never, { class: "trust_ledger", recordDates: [NOW], startedAt: ago(9), subject: { kind: "RECORD", id: "x" } })), (e) => e instanceof KeepCheckRefused && e.code === "UNKNOWN_CLASS"));
  const mid = await db.$transaction(async (t) => {
    const before = await port.check(t as never, { firmId: FIRM_A, class: "closed_client_file", recordDates: [NOW], startedAt: ago(7), subject: { kind: "CASE", id: c1 } });
    await set(FIRM_A, 10);   // the Owner saves 10 years while the deleter's transaction is open
    const after = await port.check(t as never, { firmId: FIRM_A, class: "closed_client_file", recordDates: [NOW], startedAt: ago(7), subject: { kind: "CASE", id: c1 } });
    return { before, after };
  });
  ok("break: the setting changed mid-request is read through the deleter's own transaction at each check (6 → OK, 10 → WARN), never from a second transaction", mid.before.verdict === "OK" && mid.after.verdict === "WARN", mid);
  const unsaved = await db.$transaction(async (t) => {
    sql(`delete from platform_firm_setting where firm_id = '${FIRM_A}' and key = '${KEY}'`);
    await writeSetting(t as never, { firmId: FIRM_A, key: KEY, value: 10, by: BY, workspaceId: ws });   // not committed yet
    return port.check(t as never, { firmId: FIRM_A, class: "closed_client_file", startedAt: ago(7), recordDates: [ago(7)], subject: { kind: "CASE", id: c1 } });
  });
  ok("review m2: the setting is read through the deleter's own transaction (its own uncommitted 10 years → WARN; a read on the root client would see none → OK)", unsaved.verdict === "WARN", unsaved);
  ok("break: a WARN delete with a reason of spaces only is refused (warnReason)", await refusedWith(() => warnReason({ verdict: "WARN", until: NOW, words: "" }, " \n "), (e) => e instanceof KeepCheckRefused));

  const far = await Promise.all([new Date(8.64e15), new Date("1850-01-01T00:00:00Z"), new Date(Number.NaN)].map((d) => refusedWith(() => db.$transaction((t) => port.checkFor(t as never, staffA as never, { class: "activity_log", startedAt: d, recordDates: [NOW], subject: { kind: "RECORD", id: "x" } })), (e) => e instanceof KeepCheckRefused && e.code === "INVALID_INPUT")));
  ok("break m1: a start date past year 9999 (which overflowed to OK), before 1900 or not a date is refused, never OK", far.every(Boolean), far);
  const badReasons = await Promise.all(["a\u0000b", "a\ud800", "x\u202egnp.exe", "bell\u0007"].map((r) => refusedWith(() => warnReason({ verdict: "WARN", until: NOW, words: "" }, r), (e) => e instanceof KeepCheckRefused && /ordinary text/.test((e as Error).message))));
  ok("break m3: a WARN reason with a NUL, a lone surrogate, a direction override or a control character is refused in words (never a failed audit write)", badReasons.every(Boolean), badReasons);
  ok("break m3 pass: a reason on two lines in another script is kept (NFC)", warnReason({ verdict: "WARN", until: NOW, words: "" }, " Der Mandant bat um Löschung.\n客户要求删除。 ") === "Der Mandant bat um Löschung.\n客户要求删除。");
  ok("break m4: the real check() on the root client (not the deleter's transaction) is refused",
    await refusedWith(() => port.checkFor(db as never, staffA as never, { class: "closed_client_file", startedAt: ago(2), recordDates: [ago(2)], subject: { kind: "CASE", id: c1 } }), (e) => e instanceof KeepCheckRefused && /own transaction/.test((e as Error).message)));
  const words = decide(row("activity_log"), ago(3), null, NOW);
  ok("break m5: the date in the words says it is UTC", words.verdict === "FLOOR" && /\(UTC\)/.test(words.words), words);

  const srcSvc = readFileSync(join(STUDIO, "api", "src", "platform", "keep-period", "service.ts"), "utf8");
  const body = srcSvc.slice(srcSvc.indexOf("async check("), srcSvc.indexOf("async checkFor("));
  ok("AUD-5 pass: the real check() opens no transaction of its own and never names the College's number", !/\$transaction|this\.db\./.test(body) && !/COLLEGE/.test(body), body);
  let contracts = 0; try { execFileSync(process.execPath, [join(STUDIO, "tools", "check-port-contracts.mjs")], { stdio: "pipe" }); } catch (e) { contracts = (e as { status?: number }).status ?? 1; }
  ok("AUD-5 pass: node studio/tools/check-port-contracts.mjs exits 0", contracts === 0, contracts);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
