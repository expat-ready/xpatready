# PF-4c1b review: batch invite sends the valid rows (API only, P-727)

PR #2998 at `36113d6983f51c2c1b21913395f23111e49670dc` (branch `claude/dazzling-mayer-yhse8a`). Reviewer: a fresh session
that did not build it. Bar: P-727, the Lead B amendment of 19 Nov 10:52 IST (`design/lead-b-briefs/PF-4c.md` on
`lead-b-front-office`), R1.20, STANDARDS, QUALITY. Paths: `studio/` = `prototype/studio/`; `id/` = `studio/api/src/platform/identity/`.
During the review the builder pushed `20c0e6880` (break M1 fix) onto the branch. **This review covers 36113d698 only.**
Every run below used 36113d698 code: the suites ran before the push, and the mutations and probes ran in a scratch copy taken at 36113d698.

**Verdict: Ship after fixes.** The rule is built correctly and well tested, but one Major is open at this commit.

## What I ran
* `check_pf4c1b_batch.ts` 18/18 · `check_pf4c_batch_invite.ts` 24/24 · `check_pf19r_senders.ts` 27/27 ·
  `check_pf28_inputs.ts` 47/47 (against an isolated copy on :4436, a runtime-builder port, stopped afterwards) ·
  `check_pf4_identity.ts` 111/112. The one failure is "part B: the isolated copy on :4541 answers": no copy was running there, so it is not caused by this PR.
* Mutations (scratch copy): **seats ignored** → 6 failures · **last rows take the seats** → 2 · **no ALREADY_STAFF/INVITED check** → 2 ·
  **one seat check per row** → 2 (R1.20 counter) · **email case kept** → 1 in each batch suite · **firm row lock removed** → the new suite's DW5 failed in 2 of 6 runs and pf4c's DW3 in 3 of 4 (see m2).
* Probes at 36113d698: a role written as `{"toString":1}` → **500, and the good row is not sent**. Rows `ΑΣ@example.com` and `ασ@example.com` → both invited.
* Timing: a 50-row batch answered in 464 ms (fake MailPort).

## Done-when lines (each one needs a passing and a failing test)
| Line | Pass | Fail | Met |
|---|---|---|---|
| 50 rows → all invited; 51 → 422 with `fields` | pf4c1b:86-89 | pf4c1b:92-96 (51 and 0 rows) | Met |
| 3 valid + 2 flagged → 3 invited, 2 listed with reasons | pf4c1b:101-104 | pf4c1b:105-111 | Met |
| 8 valid, 5 seats → 5 invited, 3 OVER_SEAT_LIMIT; one EntitlementPort check | pf4c1b:117-121 | pf4c1b:122-132 (full, none left, no live plan) | Met |
| A repeat batch → ALREADY_INVITED, nothing sent twice | pf4c1b:141 | pf4c1b:142-144 | Met |
| check_pf4c's other cases moved to the new rule | pf4c diff (all 24 cases) | as before | Met |

## The specific checks
* **Single invite, resend, reactivate: byte for byte the same.** `seatCheck` (id/service.ts:236) does the same steps and builds the same 409 body as main's version did when called without `words`. Its callers (invite :409, reactivate :339, resend :479) pass no `adding`. check_pf4_identity's 409 cases pass. Held.
* **`fit` at the edges** (id/service.ts:225-232):
  * Seats can never be unlimited, because `limitOf` turns a null seat limit into 0. If it could be null, `fit` would still be `adding`.
  * No live plan → `fit` 0 and every row gets the "no live subscription" words (tested).
  * Limit already exceeded → `max(0, …)` gives 0. Correct, but untested here; the break pass saw `seatsUsed` 3 > `seatsLimit` 2 reported truthfully.
  * 0 valid rows → one check, `fit` 0, answer 200 with `invited: []` (tested).
  * Counting only the valid rows is enforced by `valid.slice`, in row order.
* **Concurrency:** everything runs inside `inFirm`'s `for no key update` lock (id/service.ts:211). Seats, insert and audit share one transaction, and two batches never pass the limit. The test is weaker than the code (m2).
* **Case and spacing:** ASCII case is normalised by `emailOf` (:66). Spaces and invisible characters give INVALID_EMAIL (tested). Non-ASCII case can still slip past (m1).
* **After-commit email, `emailed: false`, `heldRows`:** still work (pf4c DW5, pf19r DW5).
* **422 only for an invalid body:** 0 or 51 rows, `rows` not a list, an unknown top-level key, or an unknown key on a row (`nmae` → 422 ROWS_FLAGGED, nothing sent). Refusing the whole form for an unknown row key follows PF-28's one input rule, and batch-invite.ts:6-11 explains why. Accepted.
* **No schema change, typed actor, P-712 card fragment:** all present. The touch list says "the batch function only", but `seatCheck` was split into `seatRoom` + `seatCheck`. The split is behaviour-neutral and the shared check is the point of R1.20. Accepted.

## D1-D20 (API only)
D1 4 (P-727 rule met; M1 breaks "every valid row is sent" for a crafted row) · D2 4 (row lock, one transaction, duplicates under race held; m1) ·
D3 5 (row checks shared with the single invite) · D4 N/A · D5 4 (repeat batch is safe; M1 is a 500) · D6 5 (one audit line per invitation) · D7 N/A ·
D8-D14 N/A (no screen; PF-6 shows `flagged`) · D10 4 (plain words in each `detail`; reason codes beyond the brief's list, m3) · D11 5 (`invited`/`flagged`/`emailed`/`heldRows`) ·
D15 5 (50 rows in 464 ms) · D16 4 (every line has a pass and a fail; the lock test is probabilistic, m2) · D17, D20 simulated only (no user walk) ·
D18 N/A · D19 partial by design (the PF-6 screen comes next).
BIC-01-20 (EXPERIENCE §6): N/A, not a case-side screen.

## Issues (ranked)
1. **Major (Must) — M1: one crafted role entry gives a 500 and blocks the whole form's valid rows.** `id/service.ts:71` builds its message with `bad.map(String)`. A JSON role `{"toString":1}` throws a TypeError, `flagOf` re-throws anything that is not an HttpException (`id/batch-invite.ts:22`), and the route answers 500. Row 1, which is valid, is not sent. This goes against P-727 ("every valid row is invited at once") and against routes.ts:23 ("a bad row is a row flag"). The batch accepts this input because `rows: z.unknown()` (id/routes.ts:24). The bug existed before, but under P-727 a single row now denies everyone else in the form.
   **Fix:** name a non-text role without calling `String()`, and add a failing test. Commit `20c0e6880` appears to do exactly this; that diff (service.ts +2, test +5) needs its own short review round.
2. **Minor (Should) — m1: non-ASCII case variants get past DUPLICATE_IN_FORM, ALREADY_STAFF and ALREADY_INVITED.** `emailOf` returns `v.toLowerCase()` (`id/service.ts:66`), so `ΑΣ@`/`ασ@` (final sigma) are stored as two addresses; the break pass found the same for ß and ı. id/batch-invite.ts:64-65 claims "case … cannot hide a duplicate". The single invite has the same gap, so it is not introduced here.
   **Fix:** use a case-folded comparison key (fold final sigma, ß→ss, ı/i), or refuse non-ASCII local parts, and add a test.
3. **Minor (Should) — m2: the lock's only failing test catches the lock's removal only some of the time.** `tests/check_pf4c1b_batch.ts:148` fires two batches with `Promise.all` and nothing forces them to overlap; it caught the removed lock in 2 of 6 runs.
   **Fix:** force the overlap, for example with a `pg_sleep` trigger on insert (the suite already uses a trigger at pf4c DW5) or by holding the firm row from a second session.
4. **Minor (Should) — m3: the `reason` codes are wider than the brief's six and are not written down.** The answer can also return INVALID_NAME, OWNER_BY_SINGLE_INVITE and ROLE_BEYOND_OWN_KEYS. `reason` is `flags[0]` (`id/service.ts:447`), and the name is checked first (`id/batch-invite.ts:60`), so INVALID_NAME hides INVALID_EMAIL. The card fragment `studio/api/src/platform/MODULE.rows/PF-4c1b.md:1` names only OVER_SEAT_LIMIT. PF-6 has to map every code it might receive.
   **Fix:** list every reason code in the card fragment. Either put the brief's six first in `reason`, or record the extra codes in `challenge.md`.
5. **Nit:** `id/batch-invite.ts:7` says "platform_invitation has no name", but PF-4dn added `display_name`. The comment is out of date. Whether a batch should store the name is not in scope for this row.
6. **Nit (existing before):** the seat limit is read twice, by `limitOf` (:227) and inside `check`. That is one EntitlementPort `check`, which meets R1.20. Under load, more than about 20 parallel batches give P2028 500s (break pass m2). Neither is introduced here.

## What I could not check
* CI on this head.
* `graph.mjs` was not run, because it rewrites `qa/GRAPH.md`, which is outside my write scope. The route is named by three suites.
* No browser walk (API only); D17 and D20 stay with the founder.
* Commit `20c0e6880` was not reviewed.
* A separate break pass's report sits beside this file. M1 and m1 above are its findings, which I reproduced independently. Its m2, m3 and m5 are folded in as Nits.

Journey test: `screens/pf-4c1b/journey-test-reviewer-2026-11-22.md`, **8.5 / 10, pass**.

Verdict: Changes — Major: M1 `id/service.ts:71` (with `id/batch-invite.ts:22`). Minor: m1 `id/service.ts:66`; m2 `tests/check_pf4c1b_batch.ts:148`; m3 `id/service.ts:447`, `MODULE.rows/PF-4c1b.md:1`.

Reviewer: Changes 36113d6983f51c2c1b21913395f23111e49670dc

## Round 2: `4ce9dbb3e429fed610daa05787f4f32197d5070b` (diff from 36113d698 only)
* **M1 closed.** `rolesOf` (`id/service.ts:73`) now writes "a value that is not text" for anything that is not a string, and never calls `String()` on it.
  * The new test (`tests/check_pf4c1b_batch.ts:176-180`) sends `{"toString":1}`, `7` and `null` as roles: answer 200, row 1 sent, rows 2 and 3 INVALID_ROLES.
  * The test fails without the fix: at 36113d698 my probe sent the same input and got a 500.
  * Nothing else in the batch path turns a row value into text: `emailOf` and `nameOf` check the type first, and unknown keys are already strings.
  * The single invite was not affected (`list(str(40))`).
* **m3 closed.** `MODULE.rows/PF-4c1b.md:1` lists every reason code. I checked it against the code: with no target person and Owner rows filtered out, the only code `roleRules` can raise is ROLE_BEYOND_OWN_KEYS, and `personCheck` adds ALREADY_STAFF and ALREADY_INVITED. The list is complete.
* **Nit closed.** The name comment (`id/batch-invite.ts:7-8`) is now accurate. The new comment on seatRoom (`id/service.ts:436`) is wording only.
* **Runs at 4ce9dbb3e:**
  * check_pf4c1b_batch 19/19, check_pf4c_batch_invite 24/24.
  * check_pf4_identity 111/112; the one failure is the same :4541 copy check as in round 1.
  * PF-19r and PF-28 not re-run: their inputs did not change except `rolesOf`'s message.
* **Still open as follow-ups (listed on the PR):** m1 non-ASCII case folding (`id/service.ts:66`, existed before this PR) and m2 the race test not forcing the overlap (`tests/check_pf4c1b_batch.ts:148`). Neither blocks.
* Journey score at this head: 9 / 10 (error recovery rises from ½ to 1).
* Not checked: CI on this head.

Verdict: Approve 4ce9dbb3e429fed610daa05787f4f32197d5070b

Reviewer: Approve 4ce9dbb3e429fed610daa05787f4f32197d5070b
