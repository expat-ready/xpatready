// PF-21b part 1: the legal-hold port's fake keeps its shared contract (DW0, DW1, DW2), and adapters that break a rule fail
// it (each case has a fail); a test-only deleter answers HELD and keeps the row while held (DW4, on the fake); the port
// guard and the ports/ import rule hold. No database, no server, no model call (US$0).   tsx studio/tests/check_pf21b_port.ts
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { legalHoldPortContract, type LegalHoldHarness } from "../ports/contracts/legal-hold-port.contract.ts";
import { answer, fakeLegalHolds, IsHeldQuery, LEGAL_HOLD_CATEGORY, LEGAL_HOLD_LOCK, legalHoldLockKey, type HoldAnswer, type HoldMatch, type HoldSubject, type LegalHoldPort } from "../ports/legal-hold.ts";

const STUDIO = join(import.meta.dirname, "..");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const uuid = () => globalThis.crypto.randomUUID();
const harness = (): LegalHoldHarness => {
  let ms = Date.parse("2026-11-16T00:00:00Z");
  const f = fakeLegalHolds({ now: () => new Date(ms += 1000) });
  return { holds: f, tx: (fn) => f.transaction(fn), place: f.place, release: f.release, firmA: uuid(), firmB: uuid(), by: "staff:5b1f3a8e-0000-4000-8000-000000000001" };
};
/** A harness whose port is replaced by `wrap(fake)`: a broken adapter. */
const broken = (wrap: (f: ReturnType<typeof fakeLegalHolds>) => LegalHoldPort<unknown>) => (): LegalHoldHarness => { const h = harness(); return { ...h, holds: wrap(h.holds as ReturnType<typeof fakeLegalHolds>) }; };
const CASES = legalHoldPortContract(harness).map((c) => c.name);
const failedOnly = (r: { failed: string[] }, idx: number[]) => idx.every((i) => r.failed.includes(CASES[i]));

// DW0, DW1, DW2 pass: the fake keeps every case of the contract.
const good = await runContract(legalHoldPortContract, "fakeLegalHolds", harness, ok);
ok("PF-21b DW0 pass: five subjects in one call report every matching hold; CATEGORY and DATE_RANGE match exactly; placement and isHeld are serialised by the port's own lock", good.failed.length === 0 && [0, 1, 6, 7].every((i) => good.passed.includes(CASES[i])), good);
ok("PF-21b DW1 pass: a person hold holds that person only; a firm hold holds every subject of its firm and none of firm B's", good.passed.includes(CASES[2]));
ok("PF-21b DW1 pass (§3.5 purge): a cancelled firm's purge (ALL_FIRM_DATA) is held by any of its holds, never by firm B's", good.passed.includes(CASES[3]));
ok("PF-21b DW2 pass: a released hold is no longer held; the shared contract passes on the fake", good.passed.includes(CASES[4]) && good.failed.length === 0);

// DW0 fail: an adapter that reports only the first match, one that skips the lock (reads outside any transaction), one
// that matches a CATEGORY hold to every category, and one that ignores the range end each break their case.
const firstOnly = await runContract(legalHoldPortContract, "firstOnly", broken((f) => ({ async isHeld(t, firm, s) { const a = await f.isHeld(t, firm, s); return a.held ? { held: true, holds: a.holds.slice(0, 1) } : a; } })), null);
ok("PF-21b DW0 fail: an adapter that reports only the first hold fails the every-match case", failedOnly(firstOnly, [0]), firstOnly.failed);
const noLock = await runContract(legalHoldPortContract, "noLock", broken((f) => ({ isHeld: (_t, firm, s) => f.isHeld(null, firm, s) })), null);
ok("PF-21b DW0 fail: an adapter whose isHeld does not keep the shared lock for the caller's transaction fails the placement-waits case", failedOnly(noLock, [6]), noLock.failed);
const anyCategory = await runContract(legalHoldPortContract, "anyCategory", broken((f) => ({ isHeld: (t, firm, s) => f.isHeld(t, firm, s.map((x) => (x.kind === "CATEGORY" ? { kind: "CATEGORY", category: "case_notes" } : x))) })), null);
ok("PF-21b DW0 fail: an adapter that matches a case_notes hold to a case_tasks delete fails the category case", failedOnly(anyCategory, [1]), anyCategory.failed);
const rows = (h: HoldMatch & { firmId: string; releasedAt: Date | null }) => h;
const openEnd = answer([rows({ holdId: uuid(), firmId: "a0000000-0000-4000-8000-000000000001", scope: { kind: "DATE_RANGE", from: new Date("2025-01-01"), to: new Date("2025-06-30") }, reason: "r", placedBy: "seed:x", placedAt: new Date(), releasedAt: null })], IsHeldQuery.parse({ firmId: "a0000000-0000-4000-8000-000000000001", subjects: [{ kind: "DATE", at: "2025-07-01" }] }));
ok("PF-21b DW0 fail: a DATE after a range's end is not held (the matching rule, not only the fake)", !openEnd.held, openEnd);

// DW1 fail: an adapter that never answers held fails every holding case; one that stores a person hold as a firm hold
// (widening it) fails the person case.
const never = await runContract(legalHoldPortContract, "neverHeld", broken(() => ({ async isHeld(): Promise<HoldAnswer> { return { held: false }; } })), null);
ok("PF-21b DW1 fail: an adapter that never answers held fails every holding case", failedOnly(never, [0, 1, 2, 3, 4, 7]), never.failed);
const purgeIgnored = await runContract(legalHoldPortContract, "purgeAsFirm", broken((f) => ({ isHeld: (t, firm, s) => f.isHeld(t, firm, s.map((x) => (x.kind === "ALL_FIRM_DATA" ? { kind: "FIRM" } : x))) })), null);
ok("PF-21b DW1 fail: an adapter that reads a purge as a FIRM ask (missing a case hold) fails the purge case", failedOnly(purgeIgnored, [3]) && purgeIgnored.failed.length === 1, purgeIgnored.failed);
const widened = await runContract(legalHoldPortContract, "personWidened", (): LegalHoldHarness => { const h = harness(); return { ...h, place: (i, d) => h.place(i.scope.kind === "PERSON" ? { ...i, scope: { kind: "FIRM" } } : i, d) }; }, null);
ok("PF-21b DW1 fail: an adapter that widens a person hold to the whole firm fails the person case", failedOnly(widened, [2]), widened.failed);

// DW2 fail: an adapter that still reports released holds fails the release case.
const staleRun = await runContract(legalHoldPortContract, "releaseIgnored", (): LegalHoldHarness => ({ ...harness(), release: async () => undefined }), null);
ok("PF-21b DW2 fail: an adapter whose release leaves the hold active fails the release case", failedOnly(staleRun, [4]) && staleRun.failed.length === 1, staleRun.failed);

// DW4 (BR-12, BR-7) on the fake: a test-only deleter that asks the port answers HELD with the reason and keeps the row;
// after release it deletes. Never a success while held.
{
  const f = fakeLegalHolds(), firm = uuid(), caseId = uuid(), store = new Map<string, string>([[caseId, "Sample row"]]);
  const del = (id: string) => f.transaction(async (t) => {
    const a = await f.isHeld(t, firm, [{ kind: "FIRM" }, { kind: "CASE", id }, { kind: "CATEGORY", category: "case_documents" }]);
    if (a.held) return { code: "HELD" as const, reasons: a.holds.map((x) => x.reason) };
    store.delete(id); return { code: "DELETED" as const };
  });
  const { holdId } = await f.place({ firmId: firm, scope: { kind: "CASE", id: caseId }, reason: "Sample: complaint open", by: "seed:pf21b" });
  const whileHeld = await del(caseId);
  ok("PF-21b DW4 pass/fail (fake): a held delete answers HELD with the reason and the row stays", whileHeld.code === "HELD" && whileHeld.reasons?.[0] === "Sample: complaint open" && store.has(caseId), whileHeld);
  await f.release({ holdId, by: "seed:pf21b", reason: "Sample: closed" });
  const after = await del(caseId);
  ok("PF-21b DW4 pass (fake): after release the same delete proceeds", after.code === "DELETED" && !store.has(caseId), after);
}

// The port's own rules: the lock key and statements, the categories CS-X3 offered, ids compared without case.
ok("PF-21b rule 3: the lock key is per firm and the statements are the shared and exclusive transaction locks", legalHoldLockKey("A0000000-0000-4000-8000-00000000000A") === "legal-hold:a0000000-0000-4000-8000-00000000000a" && /pg_advisory_xact_lock_shared\(hashtext\(\$1\)\)/.test(LEGAL_HOLD_LOCK.shared) && /pg_advisory_xact_lock\(hashtext\(\$1\)\)/.test(LEGAL_HOLD_LOCK.exclusive));
ok("PF-21b categories: CS-X3's five case-side names ship", ["case_documents", "case_answers", "case_notes", "case_tasks", "case_files"].every((c) => (LEGAL_HOLD_CATEGORY as readonly string[]).includes(c)));
{
  const f = fakeLegalHolds(), firm = uuid(), c = uuid();
  await f.place({ firmId: firm, scope: { kind: "CASE", id: c.toUpperCase() }, reason: "Sample", by: "seed:pf21b" });
  const s: HoldSubject[] = [{ kind: "CASE", id: c }];
  const a = await f.isHeld(null, firm.toUpperCase(), s);
  ok("PF-21b rule 2: ids and the firm match whatever their letter case", a.held, a);
  let refused = false; try { await f.place({ firmId: firm, scope: { kind: "DATE_RANGE", from: new Date("2026-02-01"), to: new Date("2026-01-01") }, reason: "Sample", by: "seed:pf21b" }); } catch { refused = true; }
  ok("PF-21b rule 2 fail: a date range that ends before it starts is refused", refused);
}

// The guard lists LegalHoldPort with its contract call; ports/ imports only zod and its own files.
const guard = spawnSync(process.execPath, [join(STUDIO, "tools/check-port-contracts.mjs")], { encoding: "utf8" });
ok("PF-21b guard: tools/check-port-contracts.mjs exits 0", guard.status === 0, guard.stdout + guard.stderr);
const foreign = (t: string) => [...t.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]).filter((s) => s !== "zod" && !/^\.\.?\/[a-z0-9-]+(\.contract)?\.ts$/.test(s));
const imports = ["ports/legal-hold.ts", "ports/contracts/legal-hold-port.contract.ts"].flatMap((f) => foreign(readFileSync(join(STUDIO, f), "utf8")));
ok("PF-21b ports rule: the port and its contract import only zod and ports/ files", imports.length === 0, imports);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
