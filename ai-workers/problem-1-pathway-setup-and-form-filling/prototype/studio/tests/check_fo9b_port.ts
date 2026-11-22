// FO-9b part 0 (DW0): the person merge port's fake runs its contract, a broken adapter fails it, the AG-2-16 rule 1
// default is right, the two event names exist once each, and the port guard passes (and fails when the fake runs no
// contract). No database, no server, no model call (US$0).   tsx studio/tests/check_fo9b_port.ts
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { personMergePortContract, type PersonMergeHarness } from "../ports/contracts/person-merge-port.contract.ts";
import { EVENT, PersonMergePayload } from "../ports/events.ts";
import { defaultPick, fakePersonMerge, MERGE_KEY, MergePersonsInput, type PersonMergePort } from "../ports/person-merge.ts";
import { fakeStaff, FAKE_FIRM_ID } from "../ports/staff.ts";

const STUDIO = join(import.meta.dirname, ".."), WORK = join(STUDIO, "var", `fo9b-port-check-${process.pid}`);
const FIRM_B = "00000000-0000-4000-8000-0000000f0002";
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };

const harness = (wrap: (p: PersonMergePort<unknown>) => PersonMergePort<unknown> = (p) => p): PersonMergeHarness => {
  const f = fakePersonMerge();
  return {
    port: wrap(f), tx: (fn) => f.transaction(fn), ctx: fakeStaff({ keys: [MERGE_KEY] }),
    async seed(kind, fields, updatedAt, otherFirm) { return f.seed(otherFirm ? FIRM_B : FAKE_FIRM_ID, kind, fields, updatedAt); },
    async read(id) { return f.read(id); }, async events() { return f.events(); }, async addFromLoserChannel(ref) { f.addFromLoserChannel(ref); },
  };
};
mkdirSync(WORK, { recursive: true });
try {
  // DW0 pass: the fake keeps the contract. Fail: an adapter that skips the self-merge check, or opens its own
  // transaction (commits even when the caller rolls back), breaks it.
  const good = await runContract(personMergePortContract, "fakePersonMerge", () => harness(), ok);
  const noSelfCheck = await runContract(personMergePortContract, "noSelfCheck", () => harness((p) => ({ ...p, async mergePersons(tx, ctx, i) { return i.survivor_fo_id === i.loser_fo_id ? { merge_ref: globalThis.crypto.randomUUID() } : p.mergePersons(tx, ctx, i); } })), null);
  const ownTx = await runContract(personMergePortContract, "ownTransaction", () => harness((p) => ({ ...p, mergePersons: (_tx, ctx, i) => p.mergePersons({}, ctx, i) })), null);
  ok("FO-9b DW0 fail: an adapter that lets a self-merge through, or ignores the caller's transaction, fails the contract",
    good.failed.length === 0 && noSelfCheck.failed.includes(personMergePortContract(() => harness())[2].name) && ownTx.failed.some((n) => /rolls back/.test(n)), { noSelfCheck, ownTx });

  // AG-2-16 rule 1: the most complete value, then the most recent; a tie keeps the survivor's.
  const t1 = new Date("2026-11-01T00:00:00Z"), t2 = new Date("2026-11-02T00:00:00Z");
  ok("FO-9b DW0 pass: defaultPick — a value beats none, then the newer record, a tie keeps the survivor",
    defaultPick({ value: null, updatedAt: t2 }, { value: "x", updatedAt: t1 }) === "LOSER" && defaultPick({ value: "a", updatedAt: t1 }, { value: "b", updatedAt: t2 }) === "LOSER"
    && defaultPick({ value: "a", updatedAt: t2 }, { value: "b", updatedAt: t1 }) === "SURVIVOR" && defaultPick({ value: "a", updatedAt: t1 }, { value: "b", updatedAt: t1 }) === "SURVIVOR");
  ok("FO-9b DW0 fail: defaultPick never takes an empty newer value over a filled older one (\"\" and [] count as empty)",
    defaultPick({ value: "a", updatedAt: t1 }, { value: "  ", updatedAt: t2 }) === "SURVIVOR" && defaultPick({ value: ["x"], updatedAt: t1 }, { value: [], updatedAt: t2 }) === "SURVIVOR");
  const id = globalThis.crypto.randomUUID(), id2 = globalThis.crypto.randomUUID();
  ok("FO-9b DW0 pass: CS-K2's three-field call and the guided call with choices and a reason both parse",
    MergePersonsInput.safeParse({ kind: "PERSON", survivor_fo_id: id, loser_fo_id: id2 }).success && MergePersonsInput.safeParse({ kind: "COMPANY", survivor_fo_id: id, loser_fo_id: id2, choices: { operatingName: "LOSER" }, reason: "Same firm." }).success);
  ok("FO-9b DW0 fail: an unknown field, a 501-character reason, a bad id or an extra key is refused",
    [{ choices: { email: "LOSER" }, kind: "COMPANY" }, { reason: "x".repeat(501) }, { loser_fo_id: "not-a-uuid" }, { firm_id: id }].every((o) => !MergePersonsInput.safeParse({ kind: "PERSON", survivor_fo_id: id, loser_fo_id: id2, ...o }).success));

  // Events: each name once in the events contract (ports/events/<module>.ts since P-785 (2); ports/events.ts re-exports); the payload is ids only.
  const ev = [readFileSync(join(STUDIO, "ports/events.ts"), "utf8"), ...readdirSync(join(STUDIO, "ports/events")).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(STUDIO, "ports/events", f), "utf8"))].join("\n");
  const count = (s: string) => ev.split(`"${s}"`).length - 1;
  ok("FO-9b DW0 pass: person.merged and person.unmerged exist once each in EVENT", EVENT.PERSON_MERGED === "person.merged" && EVENT.PERSON_UNMERGED === "person.unmerged" && count("person.merged") === 1 && count("person.unmerged") === 1, { merged: count("person.merged"), unmerged: count("person.unmerged") });
  ok("FO-9b DW0 fail: the payload refuses a name, email or phone (ids only)",
    PersonMergePayload.safeParse({ mergeRef: id, kind: "PERSON", survivorId: id, loserId: id2 }).success && !PersonMergePayload.safeParse({ mergeRef: id, kind: "PERSON", survivorId: id, loserId: id2, email: "a@example.com" }).success);

  // The port guard passes on this tree and fails when the fake runs no contract; ports/ imports only zod and its own files.
  const guard = (root: string) => spawnSync(process.execPath, [join(root, "tools/check-port-contracts.mjs")], { encoding: "utf8" });
  const here = guard(STUDIO);
  ok("FO-9b DW0 pass: tools/check-port-contracts.mjs exits 0 and lists PersonMergePort", here.status === 0 && /PersonMergePort ×1/.test(here.stdout), here.stdout);
  const copy = join(WORK, "tree");
  for (const d of ["ports", "tools"]) cpSync(join(STUDIO, d), join(copy, d), { recursive: true });
  const there = guard(copy);
  ok("FO-9b DW0 fail: with no test running the contract, the guard exits 1 naming fakePersonMerge", there.status === 1 && /PersonMergePort: fake adapter fakePersonMerge/.test(there.stdout), there.stdout);
  const foreign = (t: string) => [...t.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]).filter((s) => s !== "zod" && !/^\.\.?\/[a-z0-9-]+(\.contract)?\.ts$/.test(s));
  const files = ["ports/person-merge.ts", "ports/contracts/person-merge-port.contract.ts"].flatMap((f) => foreign(readFileSync(join(STUDIO, f), "utf8")));
  ok("FO-9b DW0 pass: the port and its contract import only zod and ports/ files", files.length === 0, files);
} finally { rmSync(WORK, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
