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
  - Repro, in process with the real `correlationOf` and `touchFirm`: header `job:Jane.Doe.passport.lost` gives `kept: true`, stored `"job:Jane.Doe.passport.lost"`. Header `job:Jane-Doe-1990-01-01-client-of-sample-firm` is stored the same way. Without the prefix it is stored as null.
  - So the unauthenticated sign-up can still write free text into a firm's trail.
  - **Fix:** keep only `^(job:)?<uuid>$`, if pg-boss job ids are uuids. Alternatively, mark the scope's correlation id as server-made (`observability/jobs.ts:20`, the uuid fallback in `correlationOf`), so a client value is never kept. Add a fail test for a `job:`-prefixed header.

**Verdict: Changes needed** (M1).
