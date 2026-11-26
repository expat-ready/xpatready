# PF-10t review: people as an import target (R1.35 part 2, PR #3705)

Head reviewed: `984a9219af06dedbe7ed79b8b51e7d4a7a04c535`. Scope: only `git diff origin/claude/happy-bardeen-k0jqsn...HEAD` (part 1 approved at `d0520b2`): `import-targets/person.ts`, `features/front-office-import-targets.ts`, `MODULE.rows/PF-10t.md`, `engine.ts` (`list`, `origin`, two rule words), `routes.ts` (two routes), `tests/check_pf10t_targets.ts`, the PF-10b-1 records note. Reviewer: a session that did not build it. Measured against the approved shape (Lead 4 on #3644), the PR's Done when, AG-18-3/-13/-14/-38/-51/-59 (`trace-requirements.py --brief PF-10t`) and STANDARDS. API only: the screen is part 4, so EXPERIENCE, BIC-01 to BIC-20, D17/D20 and axe are N/A here.

## Verdict: Rework (Block)
Two Majors in the consent and preview paths, both reproduced on a scratch database, and a third Major for missing fail tests on the claimed rules.

## Evidence run
* `tsx --tsconfig api/tsconfig.json tests/check_pf10t_targets.ts`: **18 passed, 0 failed**, exit 0 (9.7 s).
* `tests/check_pf10b_import_engine.ts`: **46 passed, 0 failed**, exit 0. Part 1 is not broken.
* The reviewer's probe (scratchpad `probe10t/probe.mts`, not committed) uses the check's harness: Nest on **:4436** (runtime lane), a real `fo_person`, `ConsentStore`, audit, fake jobs and two firms (sample-firm, sample-solo). Its scratch database `xr_studio_pf10t_rv_*` is dropped at the end. Not run against :4400. No paid call (US$0).
* `graph.mjs --check`: G1 0, G4 0, G5 0. CI on this head: module-cards, guard and CodeQL pass. `pr-rules` fails; the PR is a stacked draft and I did not look into why.

## Findings
**M1 (Major, consent): an import gives live marketing consent at an address whose owner withdrew, when that person was merged away.**
* Where: `person.ts:78`. `find` skips tombstones (`mergedIntoId: null`) and does not follow them to the survivor.
* How it happens: FO-9b merges by an exact email or phone match. A pair merged by phone keeps the loser's email only on the tombstone. A file row with that email and "yes" then misses the person and goes to `create`. `create` (`person.ts:101`) writes `IMPORT_DECLARED` on a new subject, with no state check at all.
* Probe P11: D2 withdrew (PORTAL) and was merged into L2, which also withdrew; their emails differ. Importing `d2@client.test,yes` gave CREATE, and `allows()` for the new person returned `{"allowed":true,"reason":"CONSENT"}`.
* This breaks the PR's own rule ("an import never brings back a consent the person withdrew"). It also goes against AG-2-16 §10 ("the tombstone stays resolvable"): FO-9b's `merge/follow.ts` `livePersonId` exists for exactly this.
* Fix: look the key up across tombstones and resolve the hit to its survivor (`livePersonId`). The row then merges into the survivor and inherits its withdrawal ("kept"). Add a pass test (survivor matched) and a fail test (no new person, no live consent).

**M2 (Major, robustness and personal data): one known person with an email the consent store cannot keep makes the whole preview fail with a bare 500, and the email is logged.**
* `check()` (`person.ts:60`) accepts any email that `normaliseEmail` passes, for example `josé@example.com` or `x@ex_ample.com`. The fo_person check accepts them too.
* `find()` then calls `consent.allows` (`person.ts:87`) for every matched person with an email, consent column or not. `normaliseAddress` throws a ZodError, the dry run answers `500 {"message":"Internal server error"}`, and nothing previews.
* Probe P1: a seeded `x@ex_ample.com` made a 3-row file fail with 500. P1b/P1c: the import itself created `josé@example.com` (with a consent row), and re-importing the same person then failed with 500. The Done when's "a re-import adds no person" cannot run for that file.
* Nest's ExceptionsHandler logged the ZodError with `"input": "x@ex_ample.com"`. That is personal data in the log (STANDARDS §5 [M]) and not Problem Details (§6 [M]).
* Fix: refuse at `check()` with the consent store's own form (`normaliseAddress("EMAIL", …)`, or `EMAIL_KEPT`), naming the field in words. Make `consentState` fail closed to "kept", never throw. Add pass and fail tests (a non-kept address is a row error; a known person with such an address does not break the preview).

**M3 (Major, STANDARDS §3.10 and §7 [M] "a rule's test fails when the rule is removed"): some claimed rules have no test.**
* Suppression and unsubscribe: the check seeds only a withdrawal (W). If `person.ts:88` were changed so only WITHDRAWN counts as "kept", it would still pass. The probe shows the rules hold today (P2: suppressed S and unsubscribed U are SKIP with no consent), so add them to the check.
* Firm walls on `GET /imports` and on origin: the check creates batches in one firm only, so dropping `firmId` from `list()`/`origin()` (`engine.ts:286`, `:293`) fails nothing. The probe shows the walls hold (P4: firm A's list has no firm B batch; firm B's batch is 404 to firm A; origin of firm B's imported person reads `imported:false` for firm A).
* Origin route keys: there is no 403 test for the origin route (the probe got 403 for a Case Officer and 401 with no token).
* Fix: one pass and one fail line each, in a second firm and with a suppressed or unsubscribed person.

**m1 (Minor): a new person at a suppressed address gets an `IMPORT_DECLARED` consent row** (`person.ts:101`; P2: N at a COMPLAINT-suppressed address has 1 consent). The gate still refuses (`SUPPRESSED`), so nothing can send. But the record says the person agreed, and the preview counts it, while the merge path refuses the same case. Fix: check `allows()` in `create` the same way, and record nothing unless the state is NO_CONSENT.

**m2 (Minor): origin answers `200 {"imported":false}` for another firm's person, a merged id or a random UUID** (`engine.ts:290-294`). Nothing leaks, because every case gets the same answer. Still, the brief and the other routes answer 404 for a record not in your firm. Fix: 404 when the record is not the firm's. This needs a target hook such as `exists(tx, firmId, id)`. Otherwise document that `imported:false` also means "not yours".

**m3 (Minor, AG-18-13): possible duplicates are not flagged.** A row with a new email and an existing person's phone creates a second person silently (P7). "Non-exact possible duplicates SHALL be flagged as warnings" is cited in the Source, but the engine has no warning channel yet. Record it as a carry to the engine or to the PF-10s screen.

**m4 (Minor, concurrency): the row lock covers only the row's own natural key** (`engine.ts:214`). An email-keyed row and a phone-keyed row for the same person in two batches can both create. Other arrival doors do not take this lock, and fo_person has no unique email. Note it in the card or lock both keys.

**m5 (nit):** `engine.ts` has `}  /** GET /imports/origin…` on the closing line of `list()`, with three blank lines above it.

## What holds (passing evidence)
* Fill only empty fields: a field filled between preview and run is kept. P5: language set to `de` after the preview stayed `de`, and phone was filled. The `updateMany` with null guards plus the in-transaction `find` re-read are sound.
* Consent needs the declaration (422 `DECLARATION_NEEDED`). "no", "non" and spaces write none; "maybe" is a row error (P8). A withdrawn person is SKIP.
* E.164 phone; names checked for length and direction marks (P9: 201 `É`, U+202E refused in words; `李 明` imported).
* Quiet: outbox 0, `fo_lead` 0 (P10). One audit line per person made or filled.
* List keys and page parsing: an unknown key gets 422; a bad page reads as 1.

Not built on this part per the approved shape (not findings): country stamping AG-18-14, company and lead targets, undo. These are still owed by the PF-10t row's Done when, in later parts.

## Could not check
* No screen: browser walk, axe, 1024/1440 px, BIC scorecard and D1-D20 UI dimensions are N/A until part 4. D17 and D20 stay with the founder.
* The real FO-9b merge path: P11 sets the tombstone directly. The real merge copies withdrawals to the survivor, so the survivor is protected, but the new person is not.
* The cause of the `pr-rules` CI failure.

Journey score: **6.5/10 (fail, one criterion at 0)**, API level. See `journey-test-reviewer-2026-11-26.md`.

**Verdict: Block**. Fix M1, M2 and M3, each with a pass and a fail test. m1 to m5 are recommended.

Reviewer: Block 984a9219af06dedbe7ed79b8b51e7d4a7a04c535
