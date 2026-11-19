# Review: FO-2w, every win raises `prospect.won` (API only)

Reviewed commit `b160758b7e29bc8236669dfac47775e8c6010ae7` on `claude/wonderful-ramanujan-wzjq0i`, against the brief `design/lead-b-briefs/FO-2w.md` (on `lead-b-front-office`) and `git diff origin/main...b160758`. 19 Nov 2026, reviewer session (not the builder). No screen, no migration: I applied screen-review dimension (5) code and correctness, the rules, and the tests. The UI dimensions, the BIC scorecard and a new journey walk do not apply (see the end).

**Summary: Ship.** No Blocker, no Major. Six Minors, none of them a fix this PR has to make.

## Touch list and scope
Four files, exactly the brief's list: `sales/prospects.ts`, `retainers/service.ts`, `tests/check_fo2w_won_event.ts`, `MODULE.rows/FO-2w.md`. `sales/prospect-edit.ts` is not touched. No migration, no new route, no new technology.

## Evidence I produced myself (all at b160758, Postgres 127.0.0.1:54329)
| Check | Result |
|---|---|
| `check_fo2w_won_event` | 17 passed, 0 failed |
| `check_fo2p3_prospects` / `check_fo5_retainers` / `check_fo2b_corporate` | 44/0 · 248/0 · 61/0 |
| `check_fo2_leads_prospects` / `check_fo5f2_template_safety` | 113/0 · 72/0 |
| J-31 journey (isolated copy `j31r` on :4446, screens range) | 47/47, including "W6 Signed offline wins the prospect … [200, WON, SIGNED_OFFLINE, SIGNED_OFFLINE]" |
| `tools/typecheck.mjs` (8 GB heap, as CI) | "PASS no new type errors (15 known, 0 fixed)"; web 0 |
| `module-cards.py pr` with BASE=origin/main | PASS (the fragment `MODULE.rows/FO-2w.md` is valid) |
| `graph.mjs --check` | no hard gap (no route or page added) |
The builder's numbers all reproduce.

## Behaviour against main, point by point
* **Convert.** Main ran: lock and 409s, WON stage (`findFirstOrThrow`), `signed`, prospect row, move `CONVERT` by `staff:<id>`, audit, outbox. The helper runs the same steps in the same order, and the same 409s come first, before the helper. The prospect is locked a second time inside the same transaction, which only re-reads the row. The only new write is that the lost fields are cleared. That changes nothing in practice: the `fo1a` trigger already forbids a lost reason on any stage that is not LOST (migration 20261114153000, lines 766-769). The payload's `won_via` is now the argument instead of the hard-coded "CONVERTED"; for Convert it is still CONVERTED (W4).
* **Signed offline.** The stage-move cause is still `SIGNED_OFFLINE`. `byActor` is `actorOf(ctx)`, which is exactly `staff:${staffId}`, as before. `wonAt` is the service clock's `now`, as before. The audit line has the same action, summary and detail, and the lost fields are cleared as before. New: `prospect.won` is raised. `retainer.signed_offline` is still raised (W1).
* **Order (Minor m2).** The `prospect.won` outbox row is now written before the `retainer.signed_offline` audit line and before `retainer.request_ended` / `retainer.signed_offline`. On main the two retainer events were the only outbox rows. Everything is in one transaction, the retainer row already reads SIGNED_OFFLINE when the payload is built, and no consumer depends on the order today. It does bend the file header's "the outbox row last" for this caller. Record it for CS-K1's consumer and change nothing now.
* **Missing WON stage (Minor m3).** Main's Signed offline skipped the win silently. Now `findFirstOrThrow` (`prospects.ts:84`) throws, the whole paper signature rolls back, and the caller gets 500 (logged as "unexpected database refusal"). In practice this cannot happen: the firm seed creates every pipeline's WON stage, and `fo_stage_fixed` forbids removing it or turning it off. Failing loudly beats half a win (retainer signed, prospect not won, no hand-over). Accept it.
* **Which retainer the payload names.** Signed offline passes `retainerId`, which narrows the signed-retainer read to the retainer that made the win (`prospects.ts:103`). Without it, the newest signed retainer would be named instead. Correct, but see m1.
* **Once per prospect.** The check runs under the prospect's `FOR UPDATE`: if the prospect is already WON (or missing), the helper returns null before any write and before the audit callback (W2 "direct": the callback throws if it is called). A second offline sign of the same retainer is refused 409 by the retainer's own state. Convert afterwards gets 409 ALREADY_WON. A paper sign after Convert files the retainer with `prospectWon:false`. The race test (sign and Convert at once) gives exactly one event and one WON move.

## Lock order and deadlock risk
Signed offline takes the retainer row first (an explicit `FOR UPDATE` on the copy path, otherwise the guarded `updateMany`), then the prospect (`lockProspect`, `FOR UPDATE` on `fo_prospect` alone). Main did the same: its private `winProspect` locked `for update of p` after the retainer writes. So the order is unchanged. Convert locks the prospect and only *counts* `fo_retainer` (a snapshot read, no row lock). No code path in `api/src` locks a prospect and then a retainer row (I grepped every `fo_prospect … for update` and every `foRetainer.update*`), so the two orders cannot cross and no deadlock is added. One harmless consequence, also true on main: if Convert holds the prospect while a paper sign waits, Convert's payload says `retainerSigned:false` and the paper sign then raises nothing.

## Would the tests fail on a regression?
* Remove the event from the helper: W1 and W4 fail. Write it outside the transaction: the `xmin` check in W1 fails. Remove the WON guard: W2 "direct" and the paper-sign-after-Convert check fail. Break the rollback: W3 (Signed offline and Convert) fails. Remove the call from Signed offline: the W5 mutant shows the W1 check would fail, and the W5 grep keeps `prospect.won` to two files.
* **m1:** dropping the `id: retainerId` narrowing (`prospects.ts:103`) passes every suite, because W1 has only one signed retainer. A prospect with an earlier `CLIENT_SIGNED` retainer, then a second retainer signed offline, would catch it. Should: add that case when the suite is next touched (FO-6).
* **m6:** the suite proves the subject part only for an Individual (PERSON) paper win. A Corporate paper win (subject COMPANY) relies on the shared `wonSubjectOf`, which `check_fo2b_corporate` proves only through Convert. Should: one Corporate paper-sign case, at the same time as m1.
* **m4:** the W5 mutant is written into `api/src/front-office/retainers/.fo2w-mutant-<pid>.ts`, inside `api/tsconfig.json`'s include path and not ignored by git. It is removed in `finally`, but a killed run leaves an untracked source file, and any suite sweeping `api/src` at the same moment sees a third copy. Should, later (outside this touch list): add `.fo2w-mutant-*` to `.gitignore`.

## Brief "Done when"
Paper-signed retainer gives exactly one event with the subject part: met (W1). Second sign or Convert afterwards gives none: met (W2). Forced failure after the move leaves neither the move nor the event: met (W3, both callers). Convert still raises once: met (W4). Removing the helper call from Signed offline fails the suite: met (W5 mutant and grep). FO-2p3, `check_fo5*` and J-31 green: met (above). The note for FO-6's owner is in the helper's doc comment and in the row fragment: met.

## Rules and standards
`firmScope` is on every new read. Audit goes through AuditPort with a typed actor. One transaction per change. The payload is checked against `ProspectWonPayload` (strict zod), whose `won_via` enum already has all three values. No names, no immigration values, no new dependency. **m5:** `sales/README.md:17` still says "Won comes only from FO-6's signature or Convert". It was already wrong on main (since FO-5's Signed offline) and the file is outside this touch list. Whoever next edits that README should fix it.

## D1–D20, BIC-01–BIC-20, journey score
No screen: the D dimensions about UI, words, look, keyboard, widths and zoom (D1–D16, D18, D19) and BIC-01–BIC-20 are N/A, because no element, state or text changed. D17 and D20 are N/A (no intended-user walk applies). Journey score: **N/A (API only).** I wrote no new UI walk. Instead I re-ran J-31 myself on an isolated copy: 47/47. (That run rewrote tracked screenshots in `screens/fo-4-sales/screenshots/`. I restored them with `git checkout`; this file is the only one changed.)

## What I could not check
CI's merge-queue run. The case-side consumer of `prospect.won` (CS-K1 part 2 is not built). An FO-6 e-signature win (not built; the `E_SIGNED` → `RETAINER_EXECUTED` cause mapping is unproven until FO-6 lands).

## Issues ranked
1. m1 (Should): the retainer named in the payload is unproven by a test (`prospects.ts:103`). Add a two-retainer case.
2. m6 (Should): no Corporate paper-win case in `check_fo2w_won_event.ts`.
3. m4 (Should, later): the W5 mutant is written inside `api/src` and not ignored by git.
4. m2 (note): `prospect.won` now comes before the retainer's audit line and events in Signed offline.
5. m3 (note): a missing WON stage now throws instead of skipping the win (cannot happen in practice; accepted).
6. m5 (note): `sales/README.md:17` is out of date (it predates this PR).

**Verdict: Approve** (no open Blocker or Major; nothing to fix before merge; m1, m6 and m4 can go with FO-6's suite change).

## Re-review at 974a940
Scope: only `git diff b160758..974a940`. Two files changed. `tests/check_fo2w_won_event.ts` (+17/-3) has the new W4c checks and `retainer()` now takes an optional `companyId`. `screens/FO-2w/review.md` is committed exactly as I wrote it. No source file changed.
* **m6: closed.** W4c engages a Corporate prospect through `Corporate.engage` and adds a COMPANY retainer (subject COMPANY plus `company_id`, as `fo_retainer_subject_check` requires). That retainer is signed on paper. The checks: `prospectWon` is true, exactly one `prospect.won` is raised, the payload passes the strict `ProspectWonPayload` parse, type is CORPORATE, the subject is COMPANY with this company's id, and the contacts include the engaged person as primary contact. A Convert afterwards gets 409 and raises nothing more. A `wonSubjectOf` that returned PERSON for a company, or named the wrong company or primary contact, would fail it.
* **m1: withdrawn.** The case I described cannot happen. `fo_retainer_one_live_per_prospect` (fo5 migration `20261114210000`, lines 254-255) is a partial unique index on (firm_id, prospect_id) where kind is RETAINER and status is not WITHDRAWN or EXPIRED. CLIENT_SIGNED, SIGNED and SIGNED_OFFLINE are all live, so a prospect never holds two signed retainers. The `retainerId` narrowing is only a guard, and an untested guard is no finding.
* **m4: deferred to FO-6.** Accepted: `.gitignore` is outside this touch list. m2, m3 and m5 stay as notes.
* I re-ran it myself: `check_fo2w_won_event` 19 passed, 0 failed (W4c pass and fail both PASS). The source is unchanged since b160758, so my earlier runs of the other suites, J-31, typecheck and module-cards still hold.

**Verdict: Approve** (no open Blocker or Major).

## Re-review at cfd83b050948fd4732fd02092e9e777b923749a7
Scope: the merge `5b3662ef8` (origin/main into the branch) and `cfd83b0` (a test-only change). Why the change: #2321 left the merge queue because W5 also found FO-8's consumer `api/src/case-clients/prospect-won.ts` (from #2255). That file only reads `prospect.won` from the outbox and never writes one.
* **The merge only brings in main.** `git diff origin/main...HEAD` lists only FO-2w's five files. `prospects.ts`, `retainers/service.ts` and `MODULE.rows/FO-2w.md` are unchanged since 974a940 (empty diff), so my earlier code review still holds.
* **The test change is what was asked for and nothing more.** W5's grep now covers only `api/src/front-office` and only `*.ts` files. It still expects exactly `retainers/service.ts` and `sales/prospects.ts`, and its check name now says it is about the front office's emitters. The mutant file is written after the grep runs, so the grep never sees it.
* **The narrowed grep still catches a new emitter.** I ran the same grep on a copy of `front-office` in the scratchpad. As is, it lists the two files. Adding `booking/rogue.ts` with `EVENT.PROSPECT_WON` lists three; adding `sales/rogue2.ts` with the literal `"prospect.won"` lists three. Either way the list no longer equals the expected two, so W5 fails.
* **m7 (note): what W5 no longer covers.** A `prospect.won` raised outside the front office (for example in `case-clients/`) no longer fails W5. The row file still says "Nothing else raises prospect.won". This is Lead B's scoping choice, and the brief's "Done when" only asks that removing Signed offline's call fails the suite, which the W5 mutant still proves. Not blocking. A possible later fix: check the writes (`moduleEvent.create` with `PROSPECT_WON`) across all of `api/src`.
* I re-ran `check_fo2w_won_event` myself: 19 passed, 0 failed (both W5 checks PASS). I did not re-run check_fo8_prospect_won 43/43, check_fo2p3 44/0 or check_fo5_retainers 248/0 at this head: those are the builder's figures. FO-2w's source is unchanged since my earlier runs.

**Verdict: Approve** (no open Blocker or Major).
