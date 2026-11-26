# Review: PF-21d part 2b-2, the narrow exception for the insert-only rows (R1.85)

Head `70c939fc15394f0de68003746dd61560a56d0eeb`, branch `claude/runtime-pf21d-2b2`, stacked on 2b-1 (#3713, f484b3e25). Only the
diff `origin/claude/blissful-archimedes-x463xr..HEAD` was reviewed. Reviewer: independent; I did not build this.
There is no screen, so the BIC scorecard, keyboard, width and zoom checks are N/A. D17 and D20 are simulated only.

Evidence (scratch databases on :54329 only; never :4400):
* Suites at the head: `check_pf21d_fo_eraser` 43/43, `check_fo9b_merge` 88/88, `check_pf21d_erasure` 41/41,
  `check_pf21d_switch` 20/20, `graph.mjs --check` exit 0.
* **`check_pf19a_messages_schema` 91/94 at the head, 94/94 at the base f484b3e25** (see M1).
* Probes: the catalog before the migration, after it and after its rollback; UPDATE, DELETE and TRUNCATE on every table
  these three functions guard, before and after; the definer's claim time and bad inputs; a mutation run of the test (M2).

## Answers to the questions asked
* **Can a firm's session, or anyone else, forge the exception?** No, within PF-12's model.
  * `fo_erasure_names` is owned by xr_wall_reader. It is a security definer with search_path pinned, and execute is revoked
    from PUBLIC. xr_app cannot call it (test :242-244; catalog).
  * The settings themselves can be set by anyone. What protects the exception is the pair (request uuid, claim time).
  * xr_app has no grant on `plat_data_request`. Every register definer calls `plat_data_request_system_only()`, which
    refuses any session with `app.firm_id` set, so a firm's session cannot read the pair.
  * The definer also asks that `p_firm` is the session's firm.
  * Probe results: another firm's session gives false; no firm gives false; another person gives false; a null person
    gives false; a released claim gives false; a malformed request id or time gives false, not an error.
  * Limit, as for all of PF-12: raw SQL as xr_app can clear `app.firm_id` and call the register definers. That power can
    already run a real erasure, so this exception adds nothing beyond it.
* **Is the rollback exact?** Yes.
  * After migrate then rollback, `pg_get_functiondef` of all three trigger functions is byte-identical to the database
    before the migration.
  * Owner, ACL, prosecdef and proconfig are identical.
  * The md5 of every public function and every non-internal trigger is identical, and the definer is gone.
  * The test re-applies the migration after the rollback (:291-295).
* **Do the triggers still refuse everything else, and is FO-9b kept?** The fo_* tables: yes. The msg_* tables: no (M1).
  * FO-9b's `fo_dup.merging` branch is unchanged word for word (migration :38-42), and `fo_dup_merge_write` keeps its
    Undo-stamp logic after the new branch.
  * Without a claim, every UPDATE, DELETE and TRUNCATE on these tables gives the same SQLSTATE and words as before:
    fo_note, fo_lead_attribution, fo_stage_move, fo_dup_merge and msg_event.
  * Each exception lists every other column of its table (checked against `information_schema`). Its target values are
    exact: 'Erased.', all nine attribution words null, both snapshots `{"erased": true}`, and `kind = 'PERSON'`.
* **Is the claim time compared precisely (milliseconds)?** Yes.
  * The claim is `date_trunc('milliseconds', clock_timestamp())`, which a JS Date carries exactly, and the comparison is
    equality.
  * Probe: the exact time (with Z, or the same instant written +05:30) gives true. +1 ms, -1 ms and +1 µs give false.
  * The test does not show the 1 ms case (m6).
* **Any regression for other users of `msg_write_once`?** Yes: M1.
* **Does the test prove each line with a pass and a fail?** No: M2.

## Majors (Must)
**M1. `msg_write_once` now fails for msg_consent_wording, msg_consent_withdrawal and msg_template_version with the wrong error.**
* Cause: migration :87 puts `NEW."detail"` in one flat `IF`. PL/pgSQL resolves record fields for the whole expression, and
  `AND` gives no protection.
* Result: on those tables, every UPDATE and DELETE, and TRUNCATE (where `NEW` is null), raises `42703 record "new" has no
  field "detail"`. Before, they raised `23001 <table> is write-once: <op> refused`.
* The writes are still refused, but the error contract has changed, and `check_pf19a_messages_schema` goes red: 3 FAILs,
  at its lines 135-137, 214-216 and 361-362.
* **Fix:** nest the `IF`, as `fo_sales_insert_only` already does. Outer: `IF TG_TABLE_NAME = 'msg_event' AND TG_OP = 'UPDATE'
  THEN`. Inner: the column check and the claim. `rollback.sql` needs no change.

**M2. For three of the four tables the exception is not tested, and nor is the merged-into chain.**
* The refusals (test :260-271) touch only fo_note, plus one fo_dup_merge case that changes another column.
* The brief requires: "each insert-only table refuses the same update without the flag, and with a flag for another
  firm, person or claim".
* Mutation evidence, in a scratch copy:
  * I removed `fo_erasure_names` from the msg_event branch and from the fo_lead_attribution branch, so anyone could blank
    those rows.
  * I removed the recursive merged-into part of the definer.
  * The test still passed **43/43**.
* XL (:245) has no note, attribution or message, and the merge row also names X, so the chain is never exercised.
* **Fix:** for attribution, merge and msg_event, add the refusal set the note has: no claim, a forged request, a wrong
  time, another person, another firm, another column. Give XL a note, an attribution row and a message event, and show
  that the job clears them.

## Minors (Should)
* **m1** The Undo refusal of an erased merge (duplicates/merge/service.ts:288) has no test: add a line that it answers
  UNDO_REFUSED with these words (fo9b's 88/88 covers the normal Undo).
* **m2** R2-m1 (jsonb-escaped email, eraser.ts:111) and R2-m2 (counts over merged-away records): add a line each that fails without it.
* **m3** The brief's carried 2a item, "the unguessable claim id (do it in 2b)", was neither done nor recorded.
  * The timestamp works because the request uuid is secret from firm sessions.
  * Record that reasoning in the PR (or in `challenge.md`) for the Lead, or add the claim uuid.
* **m4** `message_addresses` is now a **Sample** keep class (eraser.ts:87, :124) under P-819.
  * The founder's P-819 list does not include message addresses, and 2b-1's review agreed "not yet erasable".
  * Keep it in the "later" group, or ask the Lead in the PR. Never deviate silently.
* **m5** `rollback.sql` should warn about the app code.
  * If this PR's app code stays, every erasure with insert-only rows fails (EraserFailed, nothing erased, retried daily).
  * Roll the app back with the rollback (the brief's carried "rollback's warning about the flag").
* **m6** Add a line that a claim 1 ms off is refused (today only 2026-01-01 is tried).
* **m7** Record this case: erasing X also blanks `survivor_before` on an **undone** merge where X was the loser. That field
  holds the other party's earlier snapshot. This is acceptable once the merge is undone, but it is more than "that one
  person's" data.

## Journey score (reviewer, the one score for this check): 8/10, pass
`journey-test-reviewer-2b2-2026-11-26.md`: J1 (the job clears all four tables; HELD naming message addresses) held; the break pass found M1, M2.

## What I could not check
* `j_85` on an isolated copy (`isolated.sh` refused: 4 copies already running, cap 4; I stopped none); a real 07:40 tick;
  an intended user's walk (D17, D20 stay with the founder).
* `zz_break_job.ts` (untracked in the worktree) is not part of this diff and was not reviewed.

**Verdict: Block** (plan word: Ship after fixes; 2 Majors, no Blocker). Fix M1 and M2; the Minors are Should.
