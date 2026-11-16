# PF-21b part 1 review: LegalHoldPort, its fake and contract (reviewer, 16 Nov 2026)

Reviewed head **8272b685dcb1998f8897e4756d115f8df107ce35** (PR #2025, branch `claude/runtime-legal-hold-port`, 2 commits, 3 new files, +418). Brief: `main:product/design/lead-b-briefs/PF-21b.md` (part 1, DW0-DW2, DW4 on the fake). Callers: `design/briefs/CS-X3.md` (step 1, the no-race rule, DW1-DW7), `AUD-5.md:36`. Requirement: SA-11 §3.5 (`SA-11-…_v2.16:346-360`). Compared with `ports/consent.ts`, `ports/contracts/consent-port.contract.ts`, `contract.ts`, `tools/check-port-contracts.mjs`.

**Left out (screen-only):** concept fit, the keyboard/1024 px/200 % walk, PRODUCT §3-§4 words, D1-D20, the BIC table, retrofit mapping and the graph element check. There is no screen, concept or route. Checked instead: the matching rules, the fake's lock model (by probes), the contract on a real Postgres adapter, whether each fail test proves its case, and the two additions.

**Runs (this container):** `tsx tests/check_pf21b_port.ts` gave 29 passed, 0 failed, exit 0 (5.75 s). `node tools/check-port-contracts.mjs` gave 0 problems, `LegalHoldPort ×1`, exit 0. `tsc --strict` on the test and both port files exited 0. `graph.mjs --check` reported G1 0, G2 0. Database suites: not run (Mac-only Postgres, as instructed). Probes are in the scratchpad (`race.mts`, `probe2.mts`, `shared-store.mts`). No repo file was changed.

## Findings

### Major
**M1. The fake's lock lets a placement commit while a deleter's shared lock is still held: the race this port exists to stop.** `ports/legal-hold.ts:125-135`. `until()` checks the condition, then returns through an `async` boundary. `share()` and `exclusively()` take the lock only after that extra microtask. When `wake()` (`:124`) releases several waiters at once, each one checks the lock before any of them takes it.
*Failing scenarios (scratch `race.mts`):*
- **A.** A deleter's transaction is open, and two placements queue behind it. When it ends, both placements run inside the "exclusive" section at once (max inside = 2).
- **B.** Placement P1 is open. Deleter D and placement P2 queue behind it. When P1 ends, D reads "not held" and P2 commits its CASE hold while D's transaction is still open. In Postgres, P2 would wait for D to end. In the fake, D goes on to delete data that is now held.

The 8 contract cases use only two parties, so they pass. CS-X3 DW7 ("a hold placed concurrently") and the brief's breaker case ("two parallel releases") run on this fake, so a door bug could hide behind it.
*Fix:* take the lock in the same synchronous step as the check, e.g. `until(l, free, take)` with `take()` called right after the `while`: `l.shared.add(tx)` / `l.exclusive = true`. I applied exactly that to a scratch copy: A gives 1 and B gives false, and the suite is unchanged. Add a three-party test (B) with a pass and a fail.

**M2. The contract only runs on a real adapter under an unstated precondition: every `make()` must return two firms with no holds.** The harness doc (`ports/contracts/legal-hold-port.contract.ts:18-20`) says only "Two firms the store knows (real platform_firm rows)". That is the consent contract's wording, and the consent harness reuses its two firms (`consent-port.contract.ts:22-24`).
The cases leave holds active:
- case 3 places a FIRM hold on firm B and never releases it (`:78`);
- case 1 places a March 2026 DATE_RANGE hold on firm A (`:45`).

Then case 4 expects firm B's purge not held (`:93`), and case 1 expects exactly 3 matches (`:49`).
*Failing scenario (scratch `shared-store.mts`):* one store with fixed firms, as a database would be. Run 1 fails case 4. Run 2 fails cases 1, 2 and 4.
Part 2's touch list does not include the contract file, so this has to be right now.
*Fix:* state in `LegalHoldHarness` that each `make()` returns two **new** firms with no holds (fresh `platform_firm` rows for the real adapter). Or have each case release what it placed; the first is one line.

### Minor
- **m1. The fake accepts a non-transaction and then keeps no lock.** `:150-151` routes any `tx` it did not open (`null`, a root client) to a one-read wait. A door that passes `prisma` instead of `tx` keeps its tests green on the fake (scratch J-a: the placement did not wait for the open deleter). Rule 3 says isHeld runs inside the caller's transaction. Refuse a `tx` the fake did not open, and make the noLock fail test (`tests/check_pf21b_port.ts:36`) use a separate fake's transaction or a wrapper.
- **m2. A shared lock leaks if isHeld resumes after its transaction ended.** `share()` adds to `l.shared` after the wait even when `held` no longer has the tx (`:130`). After that, every later placement on that firm waits forever (scratch J-b). Postgres would throw "transaction already closed". Check `held.has(tx)` after the wait and throw.
- **m3. Rule 3's REPEATABLE READ / SERIALIZABLE refusal (`:20-21`) has no contract case, but the header says the contract proves every rule (`:7`).** CS-X3 moved this check into the port, so for now no test covers it. Either add a case that uses an optional harness hook (`txIsolation`) that the real adapter must provide, or reword the header to say part 2's suite proves it.
- **m4. Fail tests: some prove less than their labels say.**
  - `failedOnly` (`tests:23`) checks "includes", not "only"; only `purgeIgnored` and `staleRun` add `failed.length === 1`.
  - Case 8 (a read waits for an open placement) has no broken adapter that reads without waiting.
  - The DATE "fail" (`:41-42`) asserts the correct rule on `answer()`. The comment at `:32-33` promises an adapter "that ignores the range end", but no such adapter is run.

  Each case would still catch its bug; the proof is only missing. Fix: a harness whose `place` widens `to`, and a reader that does not wait.
- **m5. A new isHeld can overtake a queued placement in the fake** (scratch J-c: d2 reads before the placement). Postgres queues a shared request behind a waiting exclusive one. Both orders are serialisable, so this is not a correctness bug. A placement can starve under a stream of deleters in the fake only. A one-line note is enough, or you could queue writers first.

## The two additions beyond the brief (PR "Decisions")
- **ALL_FIRM_DATA: accepted.** §3.5 (`:350`, `:355`) says the purge of a cancelled firm "refuses while any active hold exists". Under the brief's rules, a FIRM subject is matched only by a FIRM hold. The other option, letting FIRM match every hold, would block every CS-X3 delete in a firm with one case hold, because CS-X3 sends FIRM on every delete. A separate subject is the right shape. Matching is checked before the scope switch (`:77`) and is firm-filtered (`:91`). It has its own case and fail test. Lead B should confirm, as the PR asks.
- **placedBy on each match: accepted.** §3.5 says "explainable … with reason and owner". It is an `AuditActor` (`staff:<id>`), never a name. Callers' firm-facing 409s (CS-X3) should carry reason and placedAt only, since the hold list is the Platform Owner's. A note in the port comment at `:59` would help, but it is not a finding.

## Correct as built (checked)
- **Matching:**
  - OR over subjects that describe one item.
  - Ids and firm compared case-insensitively.
  - DATE_RANGE includes both ends.
  - Another firm's hold never matches.
  - Released holds are excluded.
  - Matches come oldest first with an id tie-break, each once.
  - An empty ask, a bad date, an extra field (`firmId` in a subject), an unknown category and a bad firm are all refused (zod, scratch J-d).
  - CS-X3's five-subject ask returns both reasons.
- **Lock statements:** they match the codebase's `$executeRaw` form (`rule-facts.ts:201`, `consent-store.ts:146`). The key is per firm and lowercased.
- **For Postgres:**
  - Case 7 proves the shared lock is kept to the end of the transaction. A lock taken on the root client, or a session lock, fails it.
  - Case 8 needs the lock and the SELECT as two statements at READ COMMITTED, which is the real gotcha. A one-statement lock+read fails it.
  - `during` runs after the lock and before the commit; that works with Prisma's 5 s interactive-transaction limit.
  - The 300 ms waits can only false-pass on a very slow database, never false-fail.
- **No deadlock in the model:**
  - only one exclusive key per placement;
  - no lock upgrade in a single fake transaction;
  - every release path (throw in `fn`, in `during`, at transaction end) calls `wake()`;
  - no lost wake-up, because the check and the push happen in one step.

## Named tests (ticked on 8272b685, this container)
- [x] **PF-21b DW0 pass/fail.** Five subjects, every match, scope/reason/owner/placedAt. CATEGORY notes vs tasks. DATE inside, end and outside. Both no-race cases. Fails: first-only, no-kept-lock, any-category. *Gaps: M1 (three parties), m4.*
- [x] **PF-21b DW1 pass/fail.** Person vs another person; firm B FIRM hold over five subjects; firm A not held; ALL_FIRM_DATA. Fails: never-held, widened person, purge-as-FIRM.
- [x] **PF-21b DW2 pass/fail.** Release, second release refused, re-hold; the guard lists `LegalHoldPort ×1`. Fail: release no-op. *Gap: M2 (real adapter).*
- [x] **PF-21b DW4 (fake).** HELD with the reason, the row kept; deleted after release.
- DW3, DW5, DW6 belong to part 2.

**Journey score:** 8.1/10, 6.5 of 8 applicable criteria (see `journey-test-reviewer-2026-11-16.md`).

**Not checked:** the real adapter and Postgres behaviour (part 2; reasoned above, not run); CI on this head; an intended user's walk (D17/D20 stay with the founder).

Verdict: Block
To fix: M1 (atomic check-and-take in the fake, plus a three-party test), M2 (fresh firms per `make()` in the harness contract). Minors m1-m5 are optional; m1 and m3 are worth doing while the file is open.
