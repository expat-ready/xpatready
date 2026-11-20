# PF-12b part 1 review: every cross-firm bypass use writes `platform.bypass` to the touched firm's trail, fail-closed

Reviewed commit `ccbc1825b88ba846867b2a2b3a88cef2746cc012` (PR #2029, branch `claude/runtime-pf12b-bypass-audit`, draft). I checked it against Lead B's brief `lead-b-briefs/PF-12b.md` (part 1 only), the PR's Plan and Done-when, P-607, P-571 (1) and AG-1-45. The head has since moved to `a2b839c85` (a check_pf5 test fix) and `14d2e13d1` (fixes from the breaker). I have not reviewed those commits. This row has no screen, so the screen-only checks (BIC-01 to BIC-20, 1024 px, zoom, keyboard) are N/A. Journey report: `journey-test-reviewer-2026-11-16.md` (score 8.5/10).

## What I ran
- `tests/check_pf12b_bypass_audit.ts` at ccbc1825 (its own worktree): **22 passed, 0 failed**, about 5 s.
- Five mutations, each caught by the suite:
  - touch removed from the demo reset: 5 FAIL;
  - `touchFirm` swallows its failure: 4 FAIL;
  - no dedupe: 1 FAIL;
  - the verify line moved outside the creating transaction: 1 FAIL;
  - correlation id dropped: 2 FAIL.
  So each DW pass check fails when its rule is removed.
- Neighbouring suites at ccbc1825:
  - pf5v 7/7, pf19b_sending 40/40, pf19b_mail 28/28, pf25 68/68, pf14 92/92;
  - pf4_identity 119/119, with part B run against my copy on **:4433** (runtime lane), started from ccbc1825's app code;
  - **pf5_signup_billing 52/53**: its exact audit list now holds `platform.bypass` (fixed on a2b839c85, a test-only change).
  - pf12_walls 95/100 and pf24: every failure is a server spawn failing in tsx path resolution from the /tmp worktree. That is environmental, not this diff. pf12_walls gave 100/100 from the main checkout, but that was at 14d2e13d1, not ccbc1825.
- HTTP journeys on :4433:
  - start-up catch-up: 1 line per Sample firm;
  - `POST /api/demo/reset`: 1 line per firm (`POST`, the request's correlation id), and A's setting goes "fr" to "en";
  - demo inbox: 1 line per firm listed, 0 for an address with no mail;
  - public sign-up with firm A's staff email: A's line.

## Judged points
- **Coverage of per-firm uses.** Sweep (`messages.ts:144`), reset (`demo-reset.ts:22-28`), inbox (`demo-inbox.ts:34`), catch-up (`routes.ts:39`) and sign-up (`signup.ts:143,187,194`) each touch every firm whose rows they hand back.
  - The sign-up verify line is in the creating transaction: same `xmin` as `firm.created`.
  - The 409 verify path writes the existing firm's line. My break script shows it; the suite does not test it (m6).
- **Silent uses.** None on the shipped paths for rows a use returns. There are two gaps:
  - the catch-up reads other firms' rows with no line (m2);
  - nothing refuses a per-firm use that reads without touching (m1).
- **Ambient `touchFirm`.**
  - It reads the use from the scope, so job handlers keep their signature, and it does nothing outside a bypass. That fits the brief ("a small helper … name the one you pick": named in the PR).
  - The dedupe is per transaction object (`firm-scope.ts:176-193`). It has a latent flaw and a race (m3, m4).
- **Actor.** `system:<use>` gives `system:job:messages.outbox_sweep`. That is the only form `AuditActor` (`ports/audit.ts`) allows for the brief's `job:<queue>`. Accepted.
- **`none` reasons, both true.**
  - `purgeExpired` (`signup.ts:220`) deletes only `platform_signup_pending`, which has no `firm_id`.
  - The re-encrypt handler refuses a job with no firm before any read (`reencrypt.ts`, `registerReencryptJob`).
  - The seven doors' `none` (until part 2) is in line with the brief's split.
- **Demo reset, one transaction per firm.**
  - `writeSetting` takes a `tx`, and PF-4's reset checks still pass.
  - If the second firm's line fails, the first firm stays reset, with its line. Nothing happened without a line. The demo is half-reset until a retry (m5).
- **Fail-closed.** `BypassNotRecorded` is a 500 in plain words. The reset, the sweep and the creating transaction roll back (DW2, DW4 fail). The sign-up background step fails quietly, which is the design: no enumeration.

## Blockers
None.

## Majors
**M1. A caller-chosen `X-Request-Id` is written into a firm's permanent trail, from an unauthenticated door.**
- `touchFirm` stores `requestScope…correlationId` (`firm-scope.ts:188-191`).
- `correlationOf` (`observability/hook.ts:23`) keeps any `[A-Za-z0-9_.:-]{1,128}`.
- Repro on :4433: `POST /api/public/signup` with a Sample staff email and `x-request-id: rv-signup-known` stored `"correlationId":"rv-signup-known"` in firm A's `platform.bypass` line. The demo reset stored `rv-reset-1` the same way.
- Anyone who knows one staff email can write free text, such as a name or a date, into that firm's append-only trail. That breaks AuditDetail's "ids and facts only, never personal data" and AG-1-45's trustworthy trail. The breaker's M2 found the same.
- **Fix:** store only an id the server made (for example, keep the caller's id only when it is a uuid, otherwise the server's own), and add a fail test for a free-text header.

**M2. The reviewed commit leaves `tests/check_pf5_signup_billing.ts:188` red.**
- Its exact list of audit actions per firm now holds `platform.bypass` (52/53 at ccbc1825).
- a2b839c85 fixes the expectation. The re-review must confirm that this is the only change there.

## Minors
- **m1.** Crossing firms without a line is still possible inside a per-firm use. `asBypass` checks only the use and the route (`firm-scope.ts:150-159`), and `platform.demo.reset` is allowed on every `POST /api/demo/*` (`:117`).
  - The suite's "DW1 fail" (`check_pf12b_bypass_audit.ts:85`) asserts this hole on the new code. It is not QA-499's before-state.
  - Fix: narrow the route to `POST /api/demo/reset`, relabel that check, and name the invariant "each per-firm call site touches" on the module card.
- **m2.** Catch-up: `assignIn` (`web-address/firm-created.ts:47-51`) reads other firms' web-address and address-history rows with no line. A firm with no free suggestion returns null after its row was read, with no line. Use `platform_web_address_taken` or touch those firms.
- **m3.** `touchFirm(db, …)` with a client that is not a transaction dedupes for the life of the process. My break: two separate uses, 1 line. Its line also commits on its own. No caller does this today, but `tx: unknown` allows it. Refuse a non-transaction client.
- **m4.** `seen` is read before the await and filled after it (`firm-scope.ts:186-193`), so concurrent touches in one transaction write duplicates. That is the breaker's m4; I did not reproduce it.
- **m5.** A reset whose line fails at the second firm answers 500 after `Demo.wipe` has already deleted the workspace (`demo.ts:545-575`). A retry finishes it. Say so in the 500, or put the platform step first.
- **m6.** Tests do not cover:
  - verify's 409 `ACCOUNT_EXISTS` line (`signup.ts:187`);
  - the 500 through the HTTP filter: DW2 checks the exception object only;
  - catch-up under `failOn`.
- **m7.** `touchFirms` (`firm-scope.ts:197-201`) is one transaction for every firm, apart from the work: one firm's failed line stops the others' sweep. Also, the sweep writes a line per firm on every run even when it queues nothing (breaker m5/m6). The brief's "in the same transaction as its writes" is met only for the reset, the catch-up and verify. The safe direction holds: a line can exist without its work, never work without its line.

## Could not check
- A clean ccbc1825 run of the server-spawning parts of pf12_walls and pf24 (the /tmp worktree's tsx resolution).
- CI.
- Release-holder SQL read (P-423).

**Verdict: Changes needed.** Fix M1 and confirm M2 on the next head. The Minors are for the builder to fix or to answer in the PR.

## Re-review: `ccbc1825..c166a1ce9` (diff only, P-277)
Runs at c166a1ce9 (the main checkout, clean): `check_pf12b_bypass_audit` **27/0**, `check_fo3_booking` 133/0, `check_fo2_leads_prospects` 113/0. The two FO suites test that refusing a bypass use inside another breaks no door.
- **M2: fixed.** check_pf5's list now includes `platform.bypass`. I did not re-run it; the builder reports 53/0.
- **m3: fixed.** `touchFirm` throws `FirmScopeError` when given a client (detected by `$disconnect`, `firm-scope.ts:192`). Real transactions still write (DW4, same `xmin`).
- **m4: fixed.** The firm is reserved before the await and released on failure (`:194-204`).
- **m6: fixed.** `touchEachFirm` gives each firm its own transaction. In the sweep (`messages.ts:145-148`), a firm whose line failed gets nothing queued, the other firms go ahead, then the job fails. The new DW2 check covers it.
- **Breaker M1:** a bypass use inside another is now refused (`:157-159`), with a test.
- **m1, m2, m5:** accepted as known limits. They go in the PR for the Lead. The DW1 fail line now names the limit.
- **M1: still open.** `CORRELATION` (`firm-scope.ts:182`) keeps `^job:[A-Za-z0-9._-]{1,100}$`. `correlationOf` (`observability/hook.ts:23-25`) passes a caller's `X-Request-Id` that has that shape.
  - Repro, in process with the real `correlationOf` and `touchFirm`: header `job:Client.A.passport.lost` gives `kept: true`, stored `"job:Client.A.passport.lost"`. Header `job:Client-A-1990-01-01-client-of-sample-firm` is stored the same way. Without the prefix it is stored as null.
  - So the unauthenticated sign-up can still write free text into a firm's trail.
  - **Fix:** keep only `^(job:)?<uuid>$`, if pg-boss job ids are uuids. Alternatively, mark the scope's correlation id as server-made (`observability/jobs.ts:20`, the uuid fallback in `correlationOf`), so a client value is never kept. Add a fail test for a `job:`-prefixed header.

**Verdict: Changes needed** (M1).

## Re-review 2: `c166a1ce9..c3539d10` (diff only)
- **M1: fixed.** `CORRELATION` (`firm-scope.ts:183`) now keeps only `^(job:)?<uuid>$`. `observability/jobs.ts:20` makes `job:<pg-boss id>` and otherwise a uuid, so these are our only shapes.
  - My repro at c3539d10: `job:Client.A.passport.lost`, `job:Client-A-1990-01-01-client-of-sample-firm` and `Client.A.passport.lost` are now all stored as null.
  - A caller can still send its own uuid. That carries no free text, so it is accepted.
- **New fail test:** the `job:`-prefixed free text gives null. `check_pf12b_bypass_audit` gives 27/0.
- **Nothing else changed in the code.** No open Blocker or Major. m1, m2 and m5 stay as known limits in the PR for the Lead.

**Verdict: Approve.**

Reviewer: Approve c3539d10fb5d4f5fbe1b7fda8bc0ee8fea2359fe

## Re-review 3: `57c5e36..3d019b0` (diff only)
- **Text only:** the "Jane Doe" placeholders become `Client.A` / `Client-A` in the test, the break report and this review (AGENTS.md rule 5).
- **The test still checks M1:** the test values are still free text, neither a uuid nor `job:<uuid>`, so they are still stored as null. `check_pf12b_bypass_audit` gives 27/0 at 3d019b0.
- **No personal names remain** in the PF-12b files.

**Verdict: Approve.**

Reviewer: Approve 3d019b01936e4f4c0758ca4257f9237c542769b7

## Re-review 4: `3b14920..d690067` (diff only)
- **The change.** The catch-up's inline wrapper becomes `touchingAudit(inner)` (`firm-scope.ts:217-222`). It calls `touchFirm(tx, entry.firmId)`, then `inner.record(tx, entry)` with the entry unchanged. `routes.ts:39` uses `touchingAudit(auditEvent)`.
- **This is an honest fix, not a dodge.** check_case_feed's sweep exists to read every audit entry's literal entity and summary at its source. Both sources are still read:
  - the catch-up's entry at `firm-created.ts:55` (`audit.record(tx, {…})`, `platform_firm`);
  - the bypass line itself at `firm-scope.ts` (`bypassAudit.record(tx, {…})`, literal `platform_firm`).
  The wrapper adds no entry and changes none. It is the same pass-through role as `audit-event.ts`, which the sweep already allows.
- **Minor, not blocking.** `inner.record` passes the sweep only because `inner` does not match `/audit\w*$/i`. A later wrapper that rewrote entries under such a name would also pass unseen. Better: list `touchingAudit` beside `audit-event.ts` as a known pass-through in `check_case_feed.ts`.
- **Runs at d690067:** `check_case_feed` 39/39, `check_pf12b_bypass_audit` 27/0, `check_pf25_web_address` 68/0.

**Verdict: Approve.**

Reviewer: Approve d69006734c01724f28bdb5173991e6f603c048bd

## Re-review 5: merge of origin/main (`2ddfe62`; parents a7945ac, bcc505afd)
- **MODULE.md resolution** (`git diff 2ddfe62^2 2ddfe62`): main's Tests line is kept, with its new `check_pf6m_money_line.ts` and `check_pf5t_terms.ts`, and `check_pf12b_bypass_audit.ts` is added. This PR's PF-12b invariant line is kept as reviewed. Nothing else changed.
- **Main's side** (`git diff a7945ac 2ddfe62 -- ':!*MODULE*'`): 203 files, none of them this PR's. The merged tree differs from main only in this PR's 12 files, and every one of them except MODULE.md is byte-identical to a7945ac.
- **Runs on the merged tree:** `check_pf12b_bypass_audit` 27/0, `check_case_feed` 39/39. The builder reports pf12_walls 100/0 and pf5 53/0; I did not re-run those.

**Verdict: Approve.**

Reviewer: Approve 2ddfe62fd8e944f8d87dfabe8561035096bb39c2

## Re-review 6: second merge of origin/main (`ca2382c`; parents bfa5e31, 39c1203cd; local, not pushed)
Conflict resolutions, read from `git diff ca2382c^2 ca2382c`:
- **`firms/signup.ts`.** Main's `writeMoneyKeysGranted` import (`:23`) and its call in the creating transaction (`:200`) are untouched. The PR adds only the touch import and its three touches: the new firm's at `:195`, in the same transaction.
- **`identity/demo-reset.ts`.** The PR's one transaction per firm, with its line first, now uses main's `SAMPLE_SETTING_VALUES` seed value (AUD-5) exactly as main computes it, through `writeSetting(tx, …)`. Main's `writeSetting` still runs on a transaction it is given (`settings.ts:140`).
- **`tests/check_pf5_signup_billing.ts`.** The expected list holds both `platform.bypass` and main's `platform.staff.money_keys_granted`.
- **`MODULE.md`.** Main's Tests line plus `check_pf12b_bypass_audit.ts`, and the PF-12b invariant as reviewed.

Against bfa5e31, six of this PR's files changed:
- the four resolved above;
- `messages/demo-inbox.ts` and `messages/send/messages.ts`, which merged cleanly. Their changes are line-for-line main's own (bcc505afd..39c1203cd: PF-19b part 2's unsubscribe headers and `DELIVER_TX_MS`). Nothing of this PR in them changed.
Every other file of this PR is unchanged.

Runs on the merged tree: `check_pf12b_bypass_audit` 27/0, `check_pf5_signup_billing` 53/0, `check_aud5_keep_periods` 57/0. I did not re-run the builder's other suites.

**Verdict: Approve.**

Reviewer: Approve ca2382c5fd3f9939553a9403161a08881fe54b15

## Re-review 7: third merge of origin/main (`43db8c6`; parents d1ea8a4, 4c47c1bad)
- **This PR's files.** Of its 12 files, only `MODULE.md` changed against d1ea8a4.
- **MODULE.md against main** (`git diff 43db8c6^2 43db8c6`), compared word by word: there are exactly two insertions, the PF-12b invariant sentence and `tests/check_pf12b_bypass_audit.ts` on the Tests line. Main's new Tables and Tests entries are kept. The card is 39 lines.
- **Main's side.** It adds no new `asBypass(`/`asJob(` call (merge base..4c47c1bad), and all 14 `BYPASS_USES` entries carry `audit`.
- **Run on the merged tree:** `check_pf12b_bypass_audit` 27/0. I did not re-run the builder's other suites.

**Verdict: Approve.**

Reviewer: Approve 43db8c6654e212f95eeb606078091565fe403b53

## Re-review 8: fourth merge of origin/main (`6411124`; parents 165a5d2, 34c5e1e99; local, not pushed)
- **MODULE.md against main** (`git diff 6411124^2 6411124`): only two insertions, the PF-12b invariant sentence and `tests/check_pf12b_bypass_audit.ts` after `check_pf12_walls.ts`. Main's new Purpose entry (`files/file-type.ts`, PF-F4) and its `check_pff4_file_type.ts` test are kept. The card is 39 lines. `module-cards.py tree` passes (15 cards).
- **This PR's files against 165a5d2.** Of its 12 files, only `MODULE.md` changed. Those changes are line-for-line main's own (4c47c1bad..34c5e1e99).
- **Main's side: the builder's "no new asBypass use" is wrong.** Main (CS-W1, 4c47c1bad..34c5e1e99) adds a new call site, `api/src/demo.ts:40`: `asBypass("platform.demo.reset", () => seedSampleFirms(db))`. It runs on every configured load (`:449`) and every reset (`:552`). It adds no new `BYPASS_USES` entry, and all 14 entries carry `audit`.

**M1 (Major, from the merge).** This new call site crosses firms with no `platform.bypass` line.
- `platform.demo.reset` is `audit: "per-firm"` (`firm-scope.ts:117`). `seedSampleFirms` (`platform/seed-sample-firms.ts:52`, `:124`) reads both Sample firms and writes their missing platform rows and settings, but never calls `touchFirm`.
- The configured load gets no line at all. On reset, `resetSampleFirmSettings`'s lines (`:590`) come later and in other transactions. That is work without its line, the unsafe direction.
- So in the merged tree, the invariant this PR adds to the card ("Every bypass use writes `platform.bypass` to the touched firm's trail, or is refused") is false.
- This is the accepted m1 limit, now real at a call site. m1 was accepted when every per-firm call site touched its firms.
- **Fix:** touch each Sample firm in the seed's transaction (`touchFirm(tx, firm.id)` in `seedSampleFirms`, or a per-firm touch in `seedSampleFirmsAsDemo`). Then add a DW1-style check that a configured load writes one line per Sample firm. If the Lead decides otherwise, the alternative is to record this site in the PR as a named exception and narrow the card's sentence to match.

Not re-run by me: the builder's suites (pf12b 27/0, pf12_walls 100/0).

**Verdict: Block.** Fix M1. The rest of the merge is clean.

### Re-review 8, fix: `6411124..43abda2` (diff only)
- **M1: fixed.** `seedSampleFirms` now calls `touchFirm(tx, firm.id)` (`seed-sample-firms.ts:79`) for each Sample firm, after the firm is found or created and before its staff, grants and credentials.
  - The call is in the seed's one transaction. A failed line throws `BypassNotRecorded` and rolls back the seed.
  - Outside a bypass use, `touchFirm` returns at once (`firm-scope.ts:190`), so the start-up seed, the script and the suites write no line.
- **Test.** The new DW1 check (`check_pf12b_bypass_audit.ts:168-174`) seeds on `platform.demo.reset` and expects +1 line per Sample firm and +2 in total. It then seeds directly and expects no line. DW7's reset count goes from 4 to 6 to match. Nothing else changed.
- **Every call site** (`git grep -n 'asBypass(\|asJob(' 43abda2 -- api/src`):
  - The per-firm uses all touch their firms: sign-up, demo reset (now both sites), demo inbox, catch-up, and the outbox sweep through `asJob`.
  - The rest are the seven `none:` own-firm doors and the two `none:` jobs.
  - Main adds no other call site. m2 (catch-up's `assignIn`) stays the accepted known limit.
- Not re-run by me: the builder reports pf12b 28/0, pf12_walls 100/0, pf3_platform_schema 75/0, and tsc clean. csw1_firm_id and aud1a are left to CI.

**Verdict: Approve.** No open Blocker or Major.

Reviewer: Approve 43abda2758e9cb02ba6bf74a8475addaafbcb3cc

## Re-review 9: fifth merge of origin/main (`7f2b05b`; parents 82c1aae, 9d440b2f4; local, not pushed; diff only, P-277)
- **Base.** 82c1aae is 43abda2 (last Approve) plus review records only (`git diff --stat 43abda2 82c1aae`: `review.md`).
- **MODULE.md against main** (`git diff 7f2b05b^2 7f2b05b`): only two changes, the PF-12b invariant sentence and `tests/check_pf12b_bypass_audit.ts` after `check_pf12_walls.ts`. Main's PF-19r Entry-points text (`MAIL_PORT` senders, `MessagesMail.sendIn`) and its `check_pf19r_senders.ts` test are kept. The card is 39 lines; `module-cards.py tree` passes (15 cards). No conflict markers left.
- **This PR's 13 files against 82c1aae.** Only `MODULE.md` (main's two lines) and `messages.ts` changed. The `messages.ts` change is main's `capHolds` (PF-19r) alone: firm-scoped through `firmScope(firmIdIn)` in the caller's transaction, no bypass. `firm-scope.ts` and `BYPASS_USES` are unchanged.
- **Call sites** (`git grep -n 'asBypass(\|asJob('` under `api/src`, 82c1aae against 7f2b05b): identical in content. Only line numbers moved, in `identity/service.ts` (+2) and `identity/session/service.ts` (+2). Main's diff under `api/src` adds or removes no line with `asBypass`, `asJob`, `BYPASS_USES` or `touchFirm`. So every per-firm site still touches its firms, and the card's sentence holds.
- Not re-run by me: the builder reports pf12b_bypass_audit 28/0, pf12_walls 100/0, pf19b_sending 40/0 on the merged tree. pf19r_senders and the rest are left to CI.

**Verdict: Approve.** No open Blocker or Major.

Reviewer: Approve 7f2b05bce1ef5b243bde3ee0a1e5cc8cbf03c606

## Re-review 10: sixth merge of origin/main (`1ff5223`; parents 268b086, 4aa912c92; local, not pushed; diff only, P-277)
Read: `git diff 1ff5223^2 1ff5223` and `git diff 268b086 1ff5223` for `firm-scope.ts`, `entitlements/storage.ts`, `platform/MODULE.md` and `check_pf12b_bypass_audit.ts`.

- **BYPASS_USES.** Main's only new entry is `job:platform.entitlements.storage_daily` (merge base 9d440b2f4 against 4aa912c92). It is kept, with `audit: "per-firm"`. Main's diff under `api/src` adds no other entry.
- **Call sites** (`git grep -n 'asBypass(\|asJob(' -- api/src`, 268b086 against 1ff5223, line numbers ignored). Main adds one call site, `entitlements/storage.ts:89` (`daily()`), and no other. It is reached through `platform-jobs.ts:68` → `asJob("platform.entitlements.storage_daily")`, which opens the same use first.
- **Point 2, same-use re-entry (`firm-scope.ts:162`): safe.** It runs after the named-list and route checks (`:154-157`), not before, so the route check is never skipped. The inner call is checked against the same entry and the same `store.route` as the outer call; inside a job that means `outside: true`, and the entry has `routes: []`, so a request is still refused. It runs `fn` in the scope it is already in, the same use and the same route, with no firm. Nothing widens: no new role, no new route, and no other use's name. A different use is still refused at `:163`; break M1's check (`check_pf12b:108`) still passes. `withFirm` drops `bypass` (`:79`), so `measure()` runs as each firm, not on the bypass. When the use is re-entered, the operations line is not written a second time; the outer call already wrote it. That is correct.
- **Point 3, `daily()`.** Each listed firm gets its line in a transaction of its own (`touchEachFirm`), inside the bypass and before that firm is measured. A firm whose line fails is left out of `firms` and added to `failed`. This is the outbox sweep's pattern.
- **Point 4, lazy recorder: correct, and needed.** I made a mutation in a scratch worktree that restored the eager `= auditEvent`. Loading `check_pf12b` then failed with `ReferenceError: Cannot access 'auditEvent' before initialization`, so the cycle is real. With `recorder()`, both load orders work: firm-scope first (the suite) and audit-event first (a probe script). The ESM live binding is read only when a line is written. `onBypassAudit(null)` restores the default. The cycle's other edge reads `firmScope` only at call time (`pgboss-jobs.ts:46`, inside a refine; `firmScope` is also a hoisted function declaration), so it carries no load-time risk.
- **Tests bite** (mutations in the scratch worktree, since removed):
  - Without `:162`, the suite stops at `check_pf12b:125` with BypassRefused (red).
  - Without `touchEachFirm` in `daily()`, the suite goes red: 27/3 (storage_daily DW1, DW2 and DW7).
- **Re-run by me on 1ff5223** (Postgres :54329, no API server, never :4400):
  - `check_pf12b_bypass_audit` 30/0.
  - `check_pf15_limits` 69/0.
  - `tsc -p api/tsconfig.json`: no error in the touched files. The 17 errors it does report are in untouched files (`p2/runner.ts`, `check_c18`, `check_c69`, `check_cost_check`, `check_vv`, `check_x2b`).
  - Not re-run: pf12_walls, pf5, case_feed, pf19b_sending, pf25 and aud5. I rely on the builder's results for those, and on CI.
- **MODULE.md (P-712).** Against main the card has only two changes. The pf12b test is added to main's Tests line, and the blank line before **Do not.** is removed. Main's AUD-1b invariant and PF-15 section are kept as main wrote them. The card is 40 lines (main's is 41), and `module-cards.py tree` passes (15 cards). No migration is added (`git diff 4aa912c92 1ff5223 -- '*/prisma/migrations/*'` is empty).
- **Journey.** Not re-run: this is a diff-only re-review of a row with no screen, and the merge changes a job path, which the suite covers. The score stands at 8.5/10 (`journey-test-reviewer-2026-11-16.md`).

**m1 (Minor, not blocking).** When `daily()` cannot write a firm's line, it skips that firm and counts it as failed, but the job still completes. `register()` throws the counts away, so pg-boss does not retry until the next day. The outbox sweep instead throws once the other firms have gone ahead (`messages.ts:164`, break m6), and the card says "or a failed job". The audit rule itself holds: no firm is measured without its line, and AuditPort's `writeAuditWithAlarm` raises `audit_write_failed`. Suggested fix, in this PR or a follow-up: throw the first `touchEachFirm` error after the loop, as the outbox sweep does. This keeps main's choice to keep going when one firm's measure fails.

**Verdict: Approve.** No open Blocker or Major.

Reviewer: Approve 1ff522380486af07c62e6e9ad93b5b8f42877066
