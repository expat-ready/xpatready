# PF-21b part 3 review: the register of privacy requests made to ExpatReady (reviewer, 23 Nov 2026)

Reviewed head **1b9733fd136dd842d024b92698db334aca9faf1d** (branch `claude/runtime-pf21b-requests`, PR #3189), `git diff origin/main...1b9733fd` (7 files, +795). Spec: `lead-b-briefs/PF-21b.md` "Part 2" (DW3, DW5, DW6), split by `track-b/PF-21b-2.md` (part 3), BACKLOG PF-21b, SA-11 §3.8 / SA-11-27 / SA-11-40 / §10 line 778. Compared with the merged holds part (`register/holds/`, `20261122180000_pf21b_legal_holds`), PF-4s's guard and `staff.ts` `change()`, and `observability/alerts.ts`.

**Left out (screen-only):** concept fit, keyboard/1024 px/200 % walk, PRODUCT §3-§4 words, D1-D20, BIC table, retrofit mapping. This row has no screen (PF-21rs). I checked the schema, migration, definers, permission gating, the daily check, input validation, the tests' pass/fail power and the CI guards that read this diff instead.

**Runs (this container, Postgres 18 on :54329; :4400 never used):**
- `check_pf21b_requests.ts`: 27 passed, 0 failed (exit 0).
- Passed unchanged (exit 0): `check_pf12_walls` 110/110, `check_pf21b_holds` 67/67, `check_pf4s_system_signin` 102/102, `check_features_registry` 27/27, `check_pf8b_f4_migrations` 9/9, `check_aud_values` 14/14, `check_pf21_complaints` 108/108, `check_pf6b_permission_rules` 33/33. `graph.mjs --check`: G1 0, G2 0.
- **Red because of this commit:** `product/tools/typecheck.mjs` (CI job `types`): 15 new errors, all in `requests/service.ts` (B1). CI `module-cards` failed on this head (M1).
- I also read the breaker's `break-report.md` (same head) and re-checked its M1 against the code. My findings carry its numbers where they overlap.

## Findings

### Blocker
**B1. The CI type check fails: 15 new TS18048 errors in `api/src/platform/register/requests/service.ts` (lines 101-104, 117-118, 122, 131-132).** `const fields = (e: z.ZodError): never => problem(...)` (:63) is an arrow function assigned to a `const` with no type annotation. TypeScript does not narrow on a call to such a function, so `p.data`, `b` and `q.data` stay `possibly undefined` after `if (!p.success) fields(p.error)`. tsx does not type-check, so the suite passes, but `typecheck.mjs` exits 1 ("15 new type error(s) (not in typecheck-known.txt)"). Fix (0 extra lines): `function fields(e: z.ZodError): never { return problem(...); }`, as `holds/service.ts:62` does.

### Major
**M1. `module-cards` is red.** `module-cards.py pr` prints: "module api-features: 1 file(s) changed (…features/platform-register-requests.ts), card …/api/src/features/MODULE.md not [changed]. FAIL update the card(s) in this PR, or put `Card unchanged: <reason>` in the PR body (P-615 (3))". Fix: a `Card unchanged: …` line in the PR body (no code lines), or the card's own line.

**M2 (breaker M1, confirmed). A request logged past or near its target answers 500 after it was saved, so a retry saves it again, and the register can never delete the copy.** `log()` commits the request, its RECEIVED step and the ALLOWED line in `change()`, then calls `await this.checkOne(id)` (service.ts:106) outside it. If the alert cannot be raised (overdue path: `alerts.raise` throws; near path: the deliberate throw at :171), the error reaches the caller as 500. The breaker reproduced 2 rows after one retry and 3 rows from three parallel posts. Fix (same line): `await this.checkOne(id).catch((e) => logPort.error("data_request_check_failed", e, { requestId: id }));`. The daily check retries it.

**M3. The daily check swallows every failure without a trace.** `sweep()` does `catch { out.failed++; }` (:150), and the job handler discards the returned counts (`features/platform-register-requests.ts:15`). A request whose overdue alert cannot be raised, or a database error in `plat_data_request_mark`, therefore leaves no log line and no failed job, every day. NFR5-14 exists for exactly this alert. Compare `billing/exit-notices.ts:119`, which logs each failure. The near path's `raiseSafely` logs `alert_not_raised`; the overdue path and database errors log nothing. Fix (same line): `catch (e) { out.failed++; logPort.error("data_request_check_failed", e, { requestId: r.id }); }`.

### Minor
- **m1. The actions taken can be overwritten with no record.** `plat_data_request_move` sets `actions_taken = coalesce(p_actions, r.actions_taken)` (migration.sql:164), and the trigger allows it on any open request. The step row has no actions column, and the audit line's target is only `{requestId, to}`. So a HELD move with "deleted X" followed by COMPLETED with "deleted Y" loses "deleted X", in a register described as insert-only. Fix: write `p_actions` into the step's `note` when it is given, or refuse a change of a set value.
- **m2 (breaker m7). The SA-11-40 link is not checked.** `firmId`/`subject.id` only need to be uuid-shaped. The suite's own "request with a firm's person (SA-11-40)" uses a random `uuid()` as the person (test:163), so it asserts a link that does not exist. The holds part checks that its firm exists (`plat_legal_hold_placed`). Fix in `plat_data_request_log`: `fo_person` with `id = p_person AND firm_id = p_firm`, else a field error. If the line budget forbids it, record it for PF-21d (the erasure job), which acts on this link.
- **m3 (breaker m1).** `xr_data` keeps SELECT/INSERT/UPDATE on both tables (only DELETE/TRUNCATE are revoked, :106). Through `xr_staff_bypass` a forged `NEAR_DATE_ALERTED` step suppresses the alert. The header's "reached only through the definers" is true only without the bypass role. This is the same model as holds (graded Minor there). `REVOKE SELECT, INSERT, UPDATE … FROM xr_data` closes it.
- **m4 (breaker m5).** `today()` is the UTC day while the job runs on Toronto time. After about 19:00 Toronto, "tomorrow" passes the future-date check, and `completedOn` records tomorrow, so an on-time completion can read as late.
- **m5 (breaker m2).** The due read is capped at 501 rows, ordered `received_on DESC`, so with many near-alerted open requests the oldest overdue one is skipped silently. Order the due read by `target_date ASC`.
- **m6. Test gaps.** No case fails if the ALLOWED line is moved outside the change's transaction (for example, make `identity.audit` throw and check that nothing was logged). The near path's "an alert not raised undoes the mark" (:171) is untested: `flaky` takes the overdue path. "Each a REFUSED line" uses `>=`.
- **m7. Requirement vs brief, a question only.** SA-11 v2.16 persona table (line 243) says "The Auditor reads these read-only". The seed and DW3 refuse the Auditor on GET (Sample: Platform Owner only, per the brief). Note it for Lead B and PF-21rs. This is not a change for this PR.
- **m8 (wording).** The `move` comment (service.ts:110) says Overdue by hand → 409, but it is 422 (zod). `tx as never` (:86) is an unneeded cast (Tx has `platSystemAudit`). A `NOTE` step with a null note passes the event check.

## What held
- The migration matches the holds pattern line for line where it should: forced RLS with no policy on both tables; five definers owned by xr_wall_reader with search_path pinned, EXECUTE revoked from PUBLIC and granted to xr_data; the CREATE grant/revoke around the hand-over (PF-8b F4); the seed in its own DO block in F7's shape. The Platform Owner holds `dsr-manage` only, labelled Sample. Right after itself on empty and demo copies, the shape is the same; `migrate diff` is empty.
- The database rules: DELETE/TRUNCATE are refused even for the owner; steps are insert-only; facts are fixed; COMPLETED is final; `completed_on` ⇔ COMPLETED; there is one mark of each kind (a partial unique index); a row is logged PENDING only. The move and mark definers take `FOR UPDATE`, so parallel moves and sweeps serialise (the breaker saw exactly one alert each over four parallel sweeps).
- Gating: the guard first (a firm token gets FIRM_SESSION_REFUSED; Support, Admin and Auditor get 403), then `allowed()` in the service, then the definers refuse inside a firm's session. The change routes are `@SystemChange`; the ALLOWED line is written with `tx`, inside the change. A refusal writes one REFUSED line after the rollback, as in PF-4s `staff.ts`.
- The once-only alert: the mark and the alert are in one transaction, so a throw undoes the mark. A request past its target is not also raised as near-date. The 5-day lead is PF-23's `CLOCK_LEAD_MS` through `clocksNear`, with no second constant. The alert detail holds ids only.
- The tests pass and fail for DW3, DW5 and DW6 as listed in the PR body. Without the unique index or the status recheck, the "not twice on a second run" lines would fail.

## Journey score (reviewer; `journey-test-reviewer-2026-11-23.md`)
**7.5/10 (6 of 8 applicable), not a pass.** The low criteria are feedback and state, correct data and error recovery (M2, m1, m2). None is at 0.

## To fix before Approve
1. B1: `fields` as a function declaration; `typecheck.mjs` exit 0.
2. M1: `Card unchanged: <reason>` in the PR body (or the card line); `module-cards` green.
3. M2: `log()` answers 201 even when the immediate check fails, and logs it.
4. M3: `sweep()` logs each failure.
The Minors are at the builder's discretion within the 800-line budget. m1 and m2 matter most.

Verdict: Block 1b9733fd136dd842d024b92698db334aca9faf1d

## Round 2 (23 Nov 2026): head 0cda0efbf27edd1f545f039b021f53fea45ca3a5, diff only
Read only `git diff 1b9733fd1..0cda0efbf -- …/prototype/studio`: 5 files, +20/−17, covering 3 commits (efbc8e4dd, 9a4bdd6b4, 0cda0efbf). The studio diff against main is now 798 lines, under 800. The records commit 0e8a6610 on top touches only `product/screens/PF-21b-3/` (checked with `git diff --stat`).

**Runs** (a detached worktree at 0cda0efbf, Postgres on :54329, :4400 never used):
- `check_pf21b_requests.ts` 27/27, `check_pf12_walls.ts` 110/110, `check_pf4s_system_signin.ts` 102/102 (with its one new seed entry), `check_pf8b_f4_migrations.ts` 9/9. All exit 0.
- `typecheck.mjs`: the 15 errors in `requests/service.ts` are gone. Two errors remain, in `../p2/runner.ts` (`@anthropic-ai/sdk` not found). They come from my worktree's package links, not from this diff: the main checkout at round 1 did not show them, and p2 is untouched.
- `module-cards.py pr` with the current PR body: PASS (`Card unchanged: api-features …`). On GitHub, `module-cards` is green on 0e8a6610.

**Round 1 items:**
- **B1 fixed.** `fields` is now a `function … : never` (service.ts:64), and the type narrowing holds.
- **M1 fixed.** The PR body has the `Card unchanged:` line.
- **M2 fixed.** `log()` runs `checkOne(id).catch(() => undefined)` (:107), so a saved request answers 201. The `flaky` case now logs a request 31 days late while alerts are down: it gets 201 PENDING, one row, no error, and the next run marks it with one alert. That case would fail if the catch were removed.
- **M3 fixed.** `sweep()` logs each failure (`logPort.error("data_request_check_failed", e, {})`, :151). The job handler throws when `failed > 0`, so PF-14's job line records a failed run. The marks make a retried run harmless.
- **Breaker m1 / my m3 fixed.** `REVOKE ALL ON plat_data_request, plat_data_request_event FROM xr_data`. The definers keep their access: per the PF-12 walls migration, xr_wall_reader holds the owner's rights by membership on a superuser cluster, and by its own grants and default privileges on a non-superuser one (RDS), not through xr_data. The suite and `check_pf8b_f4_migrations` pass. The test now proves xr_app with no firm, xr_app in a firm session, and xr_app as `xr_staff_bypass` all get "permission denied".
- **m5 fixed.** The due read is ordered by `target_date` first only when `p_due_by` is set. The console list stays newest first.
- **m4 fixed.** `today()` is now Toronto's day (`toLocaleDateString("en-CA", { timeZone: DATA_REQUEST_ZONE })`). It drives the future-date check, `completedOn` and the overdue test. `dueAt` stays end of the target day in UTC; that is harmless, at most a few hours earlier on the near-date alert.
- **Breaker m3.** The check's transaction now has `timeout: 60_000`.
- **m8.** The `move` comment is corrected, and the `tx as never` cast is gone.
- **Left as questions in the PR body (acceptable, Minor):** m1 (actions text overwritten), m2 (firm and person link unchecked; recommended for PF-21d, whose eraser acts on it), m7 (Auditor read), break m4 (some invisible characters), break m6 (Overdue → Held → In progress).

**New, Minor (no change required):**
- **r2-m1.** `log()`'s catch writes nothing. The request reads PENDING past its target until 07:20 the next day, when the daily check retries and now logs any failure. A `logPort.warn` there would say so at once.
- **r2-m2.** `sweep()`'s log line carries `{}`. Adding `{ entityKey: r.id }` (an id only) would name the request that failed.
- **r2-m3.** A slow alert can now hold the row lock for up to 60 s. A staff move on that request runs in Prisma's default 5 s transaction and would time out (500, with a REFUSED line) rather than wait. This happens only with a slow AlertPort, since LogAlerts writes synchronously.

Journey score (round 1: 7.5/10): J7, retry after a 500, now holds. Feedback and state, and error recovery, rise to 1. Correct data stays at ½ (m1, m2). **Round 2: 7 of 8 applicable, 8.75/10, a pass.**

No open Blocker or Major.

Verdict: Approve 0cda0efbf27edd1f545f039b021f53fea45ca3a5

## Round 3 (23 Nov 2026): head 18d790159d07f7f4ef546934421a22d452151dd5, diff only (`c62d4bcb3..18d790159`)

Scope: the Lead's round-3 line on #3189 allows the re-stamp to `20261123200000` only (Lead 8; Lead B 4's order). One commit since the approved c62d4bcb3. No journey score this round: a folder rename changes nothing a user sees, and the round-2 score (8.75/10) stands.

**(1) The diff holds the rename and nothing else.** `git diff -M --stat` shows 4 files, 3 lines in and 3 out:
- `prisma/migrations/20261123100000_pf21b_data_requests/migration.sql` becomes `20261123200000_pf21b_data_requests/migration.sql`. Git reads this as a 100% rename; the blob is `040d37abc` at both commits, so the file is byte-identical.
- One-line stamp swaps in `tests/check_pf21b_requests.ts` (`NEW`), `api/src/platform/MODULE.rows/PF-21b-3.md` and the `platform-register.prisma` comment. Each line is otherwise identical.
- No other file changes.

**(2) No live reference to the old stamp remains.** `git grep 20261123100000 18d790159 -- …/prototype` finds nothing. Across the whole repository, the only hit is `product/screens/PF-21b-3/break-report.md:4`, a record that stays.

**(3) The stamp is unique and later than everything on main.** After `git fetch`, origin/main is at a2e3d48ed and its newest migration is `20261123140000_csd7c_type_defaults` (#3256). `20261123200000` comes after it and is not used anywhere else. The six duplicate 14-digit prefixes in the folder (20261025090000 … 20261122060000) are also on main, so this PR did not add them. #3180's planned 150000 also sorts before 200000.
- The branch has not taken in main's `20261123030000` and `20261123140000`. To test the real landing order, I merged in a scratch worktree (`origin/main` + 18d790159). The merge was clean (tree `1c5b18ab8`), and the commit was never pushed or given a ref.
- On that merge, `check_pf21b_requests.ts` passed 27/27. DW6 reads "own stamp, later than every one before it and unique (newest before: 20261123140000_csd7c_type_defaults)", "right after its own migration, on an empty copy and on a demo-data copy" passed, and `prisma migrate diff` is empty. `check_pf8b_f4_migrations.ts` passed 9/9.

**(4) The suites pass.** In a worktree at 18d790159 (node_modules symlinked; Postgres 18 on 127.0.0.1:54329; never :4400):
- `check_pf21b_requests.ts`, run 1: 27 passed, 0 failed (newest before: 20261123020000_fo7g3_bill_to_province).
- `check_pf21b_requests.ts`, run 2: 27 passed, 0 failed.
- `check_pf8b_f4_migrations.ts`: 9/9. This includes the rule that a later migration's wall-reader hand-over is wrapped in a GRANT and REVOKE of CREATE.

My runs left no scratch databases. Two others exist, `xr_studio_pf21b3_empty_4275` and `xr_studio_pf21b3_demo_4275`, created at 02:09 EST, which is hours before this review. They come from an earlier run that did not finish, not from this round. I left them for the cleanup tool. This is not a finding against the PR. Both worktrees were removed.

No new findings. No open Blocker or Major. Round-2 Minors as recorded.

**Verdict: Approve** 18d790159d07f7f4ef546934421a22d452151dd5

## Round 4 (23 Nov 2026): head 7d63314ecaf893f66aa9335bce671b19299097dc, diff only (`3421835e9..7d63314ec`)

Scope: the Lead's full run 45215337825 failed at shard 19. FO-9b DW2 found `plat_data_request.person_id` missing from the merge list (Lead 9 on #3189). Two commits since the approved head 66db561ce. No journey score this round, because one classification row changes nothing a user sees. The round-2 score (8.75/10) stands.

**(1) The merge 3421835e9 is clean.** Its parents are 66db561ce and origin/main 09b3893df.
- `git show --remerge-diff 3421835e9` is empty, so there are no hand edits and no conflict resolutions.
- `git diff 3421835e9^2 3421835e9` touches the same 11 files as the PR's own diff at 66db561ce (1091 lines in). The two patches are identical apart from the hunk offset in `check_pf4s_system_signin.ts`, which main also changed.

**(2) The PR's change is one row** at `api/src/front-office/duplicates/merge/columns.ts:39`: `plat_data_request.person_id` is classified STAYS, with its reason. No other file changes.

**(3) STAYS is right, and the reason is true and sourced.**
- *Source.* SA-11-40 §6 says: "The subject is fixed when the request is created." §5 rule 1 says "A request has one subject: one person record". Both are quoted correctly. This is the specific rule for this record. AG-2-16 rule 2 says to re-parent "every note, task, communication, call, document, assessment, appointment and open lead", which is the person's work at the firm. A request made to ExpatReady is the platform's own register entry, so it is not that kind of work.
- *The trigger.* "Its trigger refuses a change" is true: `migration.sql:79` raises `plat_data_request_moved` when `NEW.person_id IS DISTINCT FROM OLD.person_id`. A MOVE row would therefore abort every merge of a person who has a request.
- *A second reason the builder did not state.* The merge runs in the firm's session as xr_app. DW6 shows that a firm session and xr_app cannot read or write this table. MOVE could not run even without the trigger.
- *The neighbouring rows.* The row matches `plat_complaint.subject_id` ("kept as received") and the evidence rows (`fo_identity_check`, `fo_conflict_check`, `fo_signer`), which all stay because their records refuse a change.
- *The tombstone tension.* AG-2-16 rule 5 says "No row ever points to a tombstone after the commit", and every STAYS row breaks it. FO-9b already settled this through its file-wide rule: "a reader follows fo_person/fo_company.merged_into_id to the survivor" (`columns.ts:5-6`). That matches AG-2-16 §10: "the tombstoned record stays resolvable, so the merge stays reversible". This row adds nothing new to the tension.
- *Undo.* "A merge and its Undo leave it" is true. The merge locks and writes only MOVE columns (`service.ts:111`), and Undo writes back only `UNDOABLE` = MOVE plus `fo_company_contact.valid_to` (`service.ts:127`). After an Undo, the request again names a live record, the one it was made about. No move back is needed.
- *SA-11-40 rule 6.* The rule says "never picks one or merges silently", and it holds. The register never changes the subject, and the merge is a staff decision under AG-2-16 ("Person decides").
- *Readers.* Nothing reads `person_id` expecting the survivor. The only reader is the register list (`register/requests/service.ts:72, 178`), which returns the id as stored. `j_85.ts` and `j_4.ts` do not join on it.
- *No question needed.* The sources settle this, so the builder was right not to post one.

**(4) Tests** (worktree at 7d63314ec, node_modules symlinked, Postgres 18 on 127.0.0.1:54329; never :4400):
- `check_fo9b_merge.ts`, run 1: 88 passed, 0 failed. Run 2: 88 passed, 0 failed. All three DW2 lines pass.
- `check_pf21b_requests.ts`: 27 passed, 0 failed (DW6 newest before: 20261123140000_csd7c_type_defaults).
- The test fails when the rule is removed. With the row deleted (in the scratch worktree only), `check_fo9b_merge.ts` gives 87 passed, 1 failed: `FAIL FO-9b DW2 pass … {"unlisted":["plat_data_request.person_id"],"gone":[]}`. I restored the row afterwards.
- `module-cards.py pr`, run on the 12 changed paths and a body holding both "Card unchanged:" lines: PASS (3 modules touched; platform through its fragment `MODULE.rows/PF-21b-3.md`), with and without `BASE=3421835e9`. A body with no such line fails, so the check bites.
- Tool note (not this PR): the tool reads only the first "Card unchanged:" line and lets it cover every module. The front-office line is right but never checked.
- Scratch databases: my runs left none. Only the two older `xr_studio_pf21b3_{empty,demo}_4275` from round 3 remain, left for the cleanup tool.

**New, Minor (no change required):**
- **r4-m1.** "A legal record of who asked" is loose wording. `person_id` names whom the request is *about*. Under SA-11-40 rule 8 the asker can be someone else, such as the principal asking for a minor. Who asked is `requester_name`/`requester_email`. "A legal record of the request, kept as received" would be exact. The classification is unaffected.
- **r4-m2 (for PF-21d, not this PR).** After a merge, the loser's moved data sits on the survivor. An exporter or eraser acting on a request's `person_id` must follow `merged_into_id`, or it would touch only the tombstone's data (SA-11-40 rules 2 and 3). This goes with round-2 m2 (the firm and person link is unchecked), which is already queued for PF-21d.

No open Blocker or Major. Minors from earlier rounds stand as recorded.

**Verdict: Approve** 7d63314ecaf893f66aa9335bce671b19299097dc
