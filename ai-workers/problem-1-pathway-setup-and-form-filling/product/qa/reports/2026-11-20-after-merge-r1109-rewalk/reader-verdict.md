VERDICT: WORKS
QA-517: FIXED
R1.109 Complaints record, main 6f6efac88 (PF-21j #2315). Fresh reader (Opus 5.5), 20 Nov 2026; read only, ran nothing.
Paths below: studio = ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/ at /tmp/claude-501/qa7/rec (HEAD 6f6efac88).

## 1. QA-517 in code: FIXED
- complaints.ts:199 `canAct` = record key AND (handler OR read key). A keyless handler (Read-only, or a Case Officer) fails it.
  complaints.ts:197 `canRead` is unchanged: the handler still reads their own. That is intended (header lines 9-12; QA-517 asks only that changes be refused).
- Every change route goes through `change()` (complaints.ts:345-350: 404 if they cannot read, then 403 if they cannot act):
  acknowledge :365, addStep :381 (steps and notes, also on a closed complaint), responseSent :394, changeHandler :408, close :423.
  routes.ts:49-62: those five POSTs are the only write routes. DELETE (:64) is always 405 (complaints.ts:438-441).
  No other writer of plat_complaint exists in api/src (grep). No bulk path exists.
- Setting a handler: `checkHandler` (complaints.ts:226-229) gives 422 at handlerStaffId unless the person is active staff whose current grants (endedAt null) give a role holding agent/complaint:record (`mayHandle` :219-223).
  It is used when recording (:283) and when reassigning the handler (:414). Reassigning also needs both keys (:411, routes.ts:61).
- Handler choices: `handlers()` :337-340 lists only `mayHandle` people. The reminder (:464) goes to the handler only while they hold the key, otherwise to the Owners and Admins.
- Screen: web/src/modules/platform/complaints/contract.ts:12 uses the same rule as the server, so record-page.tsx:80-82 shows no actions to a keyless handler.
- The keys come from current grants on every request (identity/service.ts:107, `grants: { where: { endedAt: null } }`), so a demotion takes effect at once.
- Proof: check_pf21j_handler_key.ts (identical to main's tests/ copy), 19 assertions, 19 passed / 0 failed in batch ci 44601627608, job 135836669956:
  PASS H1: Owner and Case Manager listed; Read-only and Case Officer left out.
  PASS H2: recording or reassigning to a Read-only person gives 422 with HANDLER_NEEDS_KEY, and nothing is stored (row and event snapshot unchanged).
  PASS H3: a Case Manager handler (record key, no read key) acknowledges (200) and closes (200).
  PASS H4: a handler made Read-only gets 403 NOT_ALLOWED on acknowledge and on close, and the row is unchanged; they can still open it (200).
    An ended Case Manager grant does not count (not listed; reassigning to them gives 422). The Owner still acts (200).
  PASS H5: a handler with the key gets the reminder. A handler made Read-only does not; the Owners and Admins do.
  check_pf21s_complaints_browser.ts 120/120 (job 135836669742): H6 checks the screen rule; the picker leaves out the Case Officer (line 407).
  check_pf21w_routes.ts 83/83 (job 135836669813): DW3 shows the Case Manager handler acts on all 4 routes; DW4 shows reassigning needs both keys (403 otherwise).
- Paths the fix misses: none in code. One test gap (Minor, below): H4 asserts 403 only for acknowledge and close, not for steps, note or response-sent.
  Those three routes pass the same `change()`/`canAct` gate, so the code covers them.

## 2. Done-when clauses on main
Row: "who, about what, dates and outcome; never deleted; the list filters by state". Walks j_109 run 44608469689 (job 135859331855) and 44608482750 (job 135858756145): 26 PASS each, output files identical; j_109.ts identical to main's.
- Who: PASS W1 (name shown; handler and recorder in the row). Also W1 one request with an Idempotency-Key, and the same key with other words gives 422.
- About what: walk sends category and summary but does not assert them in the row. Suite check_pf21_complaints.ts 108/0 (job 135836669790): line 1 (summary required; recorded) and :231 (facts never change).
- Dates: PASS W1 received time; W2 acknowledge-by Tue 17 Nov skipping closed Fri 13 Nov, and not Mon 16 Nov; Needs you with days late. DW2 shows the system clock is used.
- Outcome: PASS W4 (closing with no outcome refused, stays OPEN; closing Resolved leaves only Add a note).
- Never deleted: now proven on main's tree (the earlier gap is closed).
  check_pf21w_routes DW5 (:198-201): DELETE gives 405 COMPLAINT_KEPT for every role, rows and events unchanged. DW8: the same 405 for another firm's id.
  check_pf21_complaints line 5 (:242-246): the database refuses delete and truncate of rows and events, and events are insert-only.
- List filters by state: PASS W3 (Owner sees it under Overdue; Read-only sees none and gets 404); W5 (it leaves Open and shows under Closed, for the handler too).
- Other suites in batch: pf21i 30/0, pf21v 55/0, pf21b 32/0. Run 44601627608: all 29 non-skipped jobs succeeded (ci-jobs.txt).

## 3. P-339
- Pack run 44608469689 plus independent re-run 44608482750, both on main's head 6f6efac88, both 26/26. Batch ci 44601627608 green.
- The batch studio tree 9a14d742b differs from main's 8bc206112 only by tests/journeys/j_41.ts (batch-checks.txt). This is stated in the pack; I did not re-diff it (ran nothing). No complaints file is involved.
- This verdict is the fresh reader's (P-303).

## 4. Holds (P-305)
- No open Major or Critical remains once QA-517 is closed. QA-506 (Minor, no My account menu entry) does not hold.
- Records: QA-517 still shows "Open" in BUGS and is listed twice in bugs-open.md. Set the row to Fixed (PF-21j #2315, 6f6efac88, job 135836669956) before R1.109 is marked Works, or gate B (P-317) will still read it as open.

## Gaps (not holds)
- The row's own note "then a walk step for it" is not done: j_109 still has the same 26 steps and none for a keyless handler. The proof is suite-level (H4, H6) on GitHub's runners.
- J-109's "Done when" asks for a walk in a visible browser. Both walks ran headless again (j_109.ts:73; HEADED=1 exists but was not used).
- "About what" is proven by a suite, not by a walk assertion on the row.

## Minor findings worth logging
- m1: check_pf21j H4 has no 403 assertions for /steps (STEP and NOTE, including a note on a closed complaint) or /response-sent by a keyless handler. Add them so every change route is pinned.
- m2: an existing complaint whose handler loses the key stays assigned to them; nothing flags it except the reminder going to Owners and Admins. Suggest a "handler cannot act" hint in the Owner's list (suggestion, not a defect).
- m3: the QA-517 row is duplicated in BUGS (two identical rows). Close both, or merge them.
