# PF-15c review: bind the case limits (R1.20), PR #2307

Reviewer (Opus, fresh context, did not build it), 19 Nov 2026 20:56 IST. Commit reviewed: **60d5fb9ac14ecca1cb807e5f571b4fd774f51664**, branch `claude/runtime-pf15c-bind-limits`, diff `origin/main...60d5fb9ac` (10 files, +129/−12, under 300). Spec: `design/lead-b-briefs/PF-15.md` on `lead-b-front-office`, "After part 2", bullet PF-15c; BACKLOG row PF-15c; SA-3-4, SA-3-5 (SA-03 v2.29 line 586), SA-3-39. Backend item, no screen: the UI-only dimensions and BIC-01..20 are N/A. The refusal was walked on the existing Open a case dialog (`journey-test-reviewer-2026-11-19.md`). Isolated copies on :4593 only; never :4400.

**Verdict at head 83d643a6c94fb3e5fc039097af43794fc551c70b: Approve.** M1 is fixed; no Blocker or Major is open (re-review below). At 60d5fb9ac the verdict was Block for M1; that history is kept below.

## Re-review at 83d643a6c (diff `60d5fb9ac..83d643a6c`: `runtime.ts` +2/−1, `check_pf15c_case_limits.ts` DW1, records only otherwise)
* **M1: fixed.** The case 409 now carries `upgradePath: "Change the plan in Settings, Billing, or close or withdraw a case first."` (`runtime.ts:317`), for both the over-limit and the no-live-plan refusals. The over-limit sentence ends "…or it is withdrawn; or choose a larger plan in Settings, Billing." Code, metric, limit, used and the type URL are unchanged. Keeping the inline throw instead of `planLimitReached` is accepted: the body is the same shape and runtime.ts imports nothing from platform/. The "; or" join reads a little awkwardly; it is wording only, not a finding.
* **DW1 asserts both** (`/Settings, Billing/` on `upgradePath`, `/choose a larger plan/` on `detail`), so it fails if either is removed. Re-run on a fresh copy pf15crv2 on :4593: **11/11**. The rest of the range is records (break-report.md, this file and the journey file, unchanged from what I wrote).
* **m1, m2, m3: none blocks.** m1 (corporate through the app with the real adapter) is now shown on a running copy by the breaker: 20 parallel corporate openings with 1 slot left gave one 201 (break-report "What held"). It remains a suite gap; Should, not Must. m2 is a carry-over owned by PF-16/PF-17. m3 is a test-strength note.
* **Breaker F1 (PAYMENT_HOLD still opens cases) and F2 (firm status not read): do not block PF-15c.** "Live" is defined by PF-15 part 2's definer function (`status <> 'ENDED'`, migration `20261119051500_pf15_limit_changes` line 164), which PF-15c does not change. The brief's done-when names "no live plan", and F1 is posted as a Question for the tech lead on the PR, so the gap is not silent. It is a money hole the Lead must place (fix the definer function in its own item); it is not this item's scope. The break report's "reopen skips the limit" belongs to PF-15 part 2 (`case-close.ts:9`).
* **Journey score after the fix:** 8.5 / 10. "Next step obvious" rises to 1 (the over-limit refusal now names a larger plan); m2 keeps "Settings, Billing" unreachable on main. The journey file stays as written at 60d5fb9ac.

## Review at 60d5fb9ac (first pass, kept as written)
**Verdict then: Block** (changes requested): one Major (M1). The binding is otherwise correct and well tested.

## Checks run (at 60d5fb9ac, fresh isolated copy each)
* `check_pf15c_case_limits.ts` (copy pf15crv): **11/11**. `check_csc1_count.ts` (pf15crva): **40/40**. `check_csk1_client.ts` (pf15crvb): **51/51**.
* `tsc -p api/tsconfig.json`: no error in any changed file (24 lines of errors elsewhere, all on base). `graph.mjs --check`: G1 0, G2 0.
* My own probe through the copy's `POST /api/runtime/cases` and the browser (journey report): 8 parallel openings with 3 left → 3×201, 5×409. The same idempotency key twice on the last slot → 201 and the same case (no 409). The client actor → 403. A refusal writes no case, party or `case_client`, and the case counter does not move.
* Not run: the full merge-queue suite set. The PR is a draft and the suites run only in the queue (see "Could not check").

## Done when → evidence
- [x] The 11th active individual case on a 10-case plan is refused through the running app's createCase (DW1 through `/api/runtime/cases`, not the adapter). I reproduced it in the UI: toast "Your firm's plan allows 13 active individual cases and 13 are active…".
- [x] A closed case frees one (DW2: withdraw → 9 → 201 → 409 again).
- [x] No live plan → 409 `PLAN_LIMIT_REACHED`, `limit: 0`, its own sentence, never a 500 (DW3). Also seen in the UI at 1024 px.
- [x] No silent allow-all. Runtime's default throws (`runtime.ts:146`). Both in-process suites bind explicitly: csc1_count binds the fake, csk1_client seeds and binds `PgEntitlements`. I searched for every other path: `NestFactory`/`Test.createTestingModule` apps holding Runtime (only csc1_count, csk1_client and csc1_close, which opens no case); `new Runtime(` (only DW4); `createCase(` callers (`sample-case.ts:64`, inside the main app, so bound). No script or demo loader inserts `runtime_case` directly. Every copy seeds the Sample firms (`isolated.sh:87`, `start.sh:16`, `PLATFORM_SAMPLE_SEED` default on).
- [ ] Every case-opening suite green: only the three above were run here. The full run is still to come (see "Could not check").

## Code (look-fors from the Lead)
* **Limit read inside the opening transaction: correct.** `this.entitlements(tx)` (`runtime.ts:315`) builds `PgEntitlements` on `tx` after `pg_advisory_xact_lock` and the in-transaction count. That closes PF-15 review deviation 2 (the old read ran outside the transaction). The parallel probe (3 of 8) confirms one opening at a time against the real adapter.
* **Seats and storage callers of `PgEntitlements.check`: no behaviour change.** Seats with no plan were already refused with `limit: 0`; now the result also carries `noLivePlan: true`. `seatCheck` (`identity/service.ts:186-195`) reads only `allowed` and `limit` and words it from `plan.planCode`, and `planLimitReached` does not spread the result, so no new field leaks. Storage skips the new line (`limits.ts:49`, `metric !== "storage_mb"`) and keeps its warn and fail-closed rules (`StorageWatch` at `storage.ts:40,109` is unchanged).
* **The binding provider** (`features/platform-entitlements.ts`) is an eager singleton in the one AppModule (`registerFeatures`), with Runtime and PlatformClock in the same module. No other test app spreads this feature's providers, so the new Runtime dependency breaks none.
* **Rule removal makes the tests fail.** Unbinding makes DW1 fail (500). Binding the fake makes DW1-fail fail. Dropping `limits.ts:49` makes DW3 fail on the sentence regex.

## Issues
**M1 (Major, Must). The case 409 does not give the upgrade path SA-3-5 requires ("stating metric, limit and upgrade path"), and PF-15c is the item that makes this refusal live.**
* Where: `runtime.ts:316-317`. The body is `type, title, status, detail, message, code, metric, limit, used` (probe, journey J2). There is no `upgradePath`, unlike the seats 409 (`identity/service.ts:194`) and the storage 409 (`planLimitReached`, `limits.ts:58-62`, documented as "the 409 every refused limit gives (SA-3-5…)"). The over-limit sentence offers only "A case stops counting once every filing has a decision or it is withdrawn." It never says to choose a larger plan, which SA-4-56's case wording does ("Close or withdraw N of them or choose a larger plan", `limits.ts:75`).
* Fix (about 2 lines): throw through `planLimitReached(limit, detail)` (same `code`, `metric`, `limit`, `used`, plus `upgradePath`). Add "or choose a larger plan in Settings, Billing" to the over-limit sentence. Keep the `type` URL as it is (PF-15 review m2 left the two URLs as they are). The no-live-plan sentence already names a path; it still needs the field.
* If the Lead reads the brief's "nothing else changes" as freezing the CS-C1b sentence, this is a requirements-vs-brief conflict. It goes to the Lead in the PR, not left silent.

**m1 (minor, Should).** BACKLOG PF-15c asks for "a passing and a failing case per metric". `active_corporate_cases` is never exercised through the running app with the real adapter. The configured checkpoint has no CORPORATE pathway (all five released combinations have a null `client_type`). Corporate is covered only with the fake (csc1_count DW10, the `tc` port) and by the adapter contract. Fix: a corporate fixture (as csc1_count builds one) with one pass and one fail in check_pf15c, or a line in the PR that the Lead accepts the gap.

**m2 (minor, carry-over from PF-15 review m2, not this PR's to fix).** "Choose a plan in Settings, Billing." names a screen that does not exist on main (grep of `web/src`: no Billing route). The upgrade path cannot be followed until PF-16/PF-17. Leave as it is; note it in the PR.

**m3 (minor, Should).** DW4 (`check_pf15c_case_limits.ts:78-82`) proves the unbound default by calling the private field, not by opening through an app that lacks the feature. It still fails if someone restores an allow-all default, so it is acceptable. An opening through csc1_count's app before its explicit bind would prove it end to end.

Observations, not findings (pre-existing UI, outside this backend item): the refusal shows only as a 9-second toast (polite live region) while the dialog stays open, and Enter in the principal-name field does not submit the dialog. Tab to "Open case" and Enter does. Passed to qa for R1.20's J-test.

## D1–D20 (backend item: applicable lines only)
D1 Met except M1 (SA-3-5 upgrade path) · D2 Met (refusal writes nothing; 3 of 8 under race; replay on the same key) · D5 Met (withdraw frees one; idempotent retry) · D10 Partly (plain sentences; no upgrade path, M1) · D11 Partly (the server answers; UI toast only, pre-existing) · D13 Met on the refusal (axe 0 at 1440 and 1024; 200 % zoom; Tab+Enter) · D15 Met (409 in 32-41 ms) · D16 Partly (pass and fail per done-when line; corporate only with the fake, m1) · D18 Partly (the refusal does not name the plan) · D3, D4, D6-D9, D12, D14, D19 N/A · D17, D20 simulated only. BIC-01..20: N/A (no case-side screen built).

## Journey score (reviewer, the one score for this check)
**8 / 10, pass** (no criterion at 0). Details in `journey-test-reviewer-2026-11-19.md`.

## Could not check
* The full merge-queue run ("every case-opening suite is green"). The PR is a draft and its suites run only in the queue. The open risk is a suite opening more than 25 individual or 5 corporate cases on `sample-solo` (30 corporate on `sample-firm`) in one copy. The PR names this risk and says how it will be handled.
* The walled `xr_app` role through createCase: copies run as the owner role. The adapter's walled read by key is covered by `check_pf15_limits.ts` (PF-15 review M1 fix).
* A real screen reader. D17 and D20 stay with the founder.

## Re-review at 784c0a206 after main's FO-8 (19 Nov 2026, IST evening)
Range `778ad0585..784c0a206`, mostly main's merge (b5ecdc9c4, main at 37d1b196d) and the fix commit 784c0a206. **Verdict at head 784c0a206eee76e6c174e5482d01a0de6ebe0d72: Approve.** No Blocker or Major is open.
* **The limit check survived the merge.** `git diff 37d1b196d 784c0a206` holds only PF-15c's own lines: the `CaseLimits` type, the throwing default, `this.entitlements(tx)` after the `case-open:<firm>` lock, `upgradePath` and both sentences (`runtime.ts:323-331`). runtime.ts keeps one `import type { Prisma }` (line 12; the TS2300 is gone). tsc on api shows no error in runtime.ts, prospect-won.ts, limits.ts or the ports.
* **FO-8's opening has no nested-transaction risk.** `openCaseFromOffer` (`case-clients/prospect-won.ts:183-206`) reads on `db` outside any transaction and then calls `Runtime.createCase` once. Its `inTx` step runs last, inside createCase's single transaction (`runtime.ts:360`) and after the limit check, so a refusal (409, over the limit or no live plan) happens before FO-8 writes anything. `PgEntitlements` is built on that same `tx`. No second transaction or connection is opened.
* **No lock-timeout risk either.** The limit read is one call to the definer function with no lock of its own. createCase takes only `case-open:<firm>`. The FO-8 subscriber (`makeClient`) takes `prospect-won:<id>` and then `case-open:<firm>`, but never calls createCase, so there is no lock cycle. The 15 s timeout and 10 s maxWait are unchanged. The breaker's 400 parallel openings ran with no 5xx.
* **No other in-process suite opens cases unbound.** Searched at this head:
  * NestFactory and createTestingModule apps importing runtime.ts: check_csc1_count binds the fake; check_csk1_client and check_fo8_prospect_won bind `PgEntitlements` after `seedSampleFirms`. check_csc1s_view only reads and closes cases (GET `/api/runtime/cases/:id/...`) and opens none.
  * `new Runtime(`: only DW4.
  * createCase callers in api/src and tools: the controller, `sample-case.ts:64` (main app, bound) and FO-8's door (`runtime.ts:262`, the same Runtime).
* **Re-run here on :4593, fresh copies:** check_fo8_prospect_won **43/43**, check_pf15c_case_limits **11/11**. The coordinator also reports csc1_count 40/40 and csk1_client 51/51 at this head.
* **Earlier points unchanged:** m1, m2 and m3 do not block. Breaker F1 and F2 stay with the Lead's question (the definer function's idea of "live"), outside this item.
