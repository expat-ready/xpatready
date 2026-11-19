VERDICT: WORKS
QA-502: FIXED
(Fresh Opus reader, P-303; read only, nothing run. Main c66a41c96; studio tree 1b360046e. Condition: QA-502 must be moved to BUGS-CLOSED in the same records change. BUGS.md:31 at c66a41c96 still says Open, and gate B (P-317/P-305) holds the row on that record until then.)

## Tree and pack identity (checked locally)
- Studio tree at c66a41c96 = 1b360046e = batch #2344 head 6f1ef9c36 (`git rev-parse <c>:…/studio`). So the case-side suites in ci 44575502680 ran on main's app code.
- tests/journeys/j_77.ts at c66a41c96 is byte-identical to the pack's j_77.ts (cmp).

## (1) Done when, clause by clause (walk 44600094672; re-run 44600106989 identical apart from ids)
- Submission number and UCI recorded (C8.2, already Works): "J-77 W1 pass: the case officer records the application number and the UCI on the case page; the filing is submitted — ["V300077001","1177-0077"]" (j_77.ts:104-115 fills the Record the submission dialog and asserts filing_record.application_number and filing_person_record.uci in the database).
- Decided: "J-77 W2 pass: Approved (Sample) is recorded with the authority's date and the note…". "J-77 W3 pass: Refused (Sample) is the latest; 1 earlier decision opens the history…" (j_77.ts:185-207, on screen plus case_decision rows).
- Withdrawn: "J-77 W4b pass: withdrawn, the header reads Withdrawn, with the withdrawal date and the reason". "J-77 W4b data: the case is CLOSED WITHDRAWN with one WITHDRAWAL row dated as typed" (j_77.ts:159-171). Refused after a decision: "J-77 W4 fail: the Withdraw held open in another tab is refused in the screen's words".
- Closed: "J-77 W5 pass: closed with the reason; the header reads Closed and the line gives how, when, the decision and the reason". "J-77 W5 data: … CLOSED, CLOSED_BY_STAFF, with the reason and the stage" (j_77.ts:229-240).
- Reopened: "J-77 W6 pass: reopened, the header is Open again with no closing line, and the case is at the stage it closed from" (j_77.ts:246-255).
- Audit lines are really asserted. `audit()` (j_77.ts:60) reads audit_event rows for the case; dw2 (j_77.ts:221) needs an exact count and actor `staff:<platform_staff id>`. PASS lines:
  "DW2 pass: the withdrawal wrote one audit line, case.withdrawn by staff:…" (:173);
  "DW2 pass: the decision and its correction each wrote one audit line…" (:222);
  "DW2 pass: the close wrote one more line by the same staff member" (:241);
  "DW2 pass: one line per act, in order, each by staff: decision, correction, close, reopen" (:257; the reopen line is asserted here).
  NR: "DW2 NR: … simulated person's header, no session, the act is 401 … no line" (:224-225).
- Active count moves with each act (DW4 lines, :174, :223, :242, :256). Firm isolation: DW3 pass, NR and break (:260-271).
- The walk ends at the next step: "J-77 end: … the reopened case is listed Open". 76/76 twice, axe clean and no sideways scroll at 1440 and 1024 px on every screen.

## (2) QA-502: FIXED on main
- The case page mounts the panel and the header line: web/src/runtime/cases.tsx:19, :362 (CaseStatusPill), :363 (CaseEndLine), :406 (CaseDecisionPanel).
- All four acts on screen: case-decision.tsx:222-225 POST decisions/withdraw/close/reopen through staffApi (the firm staff bearer session). Buttons at :163-165 and :185.
- The case read shows outcome, reason and decision: GET /runtime/cases/:id/decisions (api/src/features/case-close.ts:19-20) feeds CaseEndLine (case-decision.tsx:67-79: "Withdrawn on <date> · Reason", "Closed … · Decision: … · Reason") and the per-filing latest decision with its history (:178-182).
- qa's own static check would now pass: tests/qa/check_r177_case_decision.ts:150 regex matches case-decision.tsx:55/222-225. It was not re-run in this pack. Gap: re-run it when closing QA-502.
- Permissions are checked at both ends.
  - Screen: keys from /platform/me (:24, :111-112). Decide, withdraw and close need agent/case:record-decision; reopen needs agent/case:reopen (:150, :163-165). A role without the key gets words, no button (:156, :158).
  - Server: @PermissionKeys on every route (features/case-close.ts:22-32): record-decision for decide/withdraw/close, reopen for reopen, case:show for the read.
  - Proven by suites on the tree-equal batch, not by j_77, which walks only the Owner/Case-manager representative:
    check_csc1s_decision_browser.cjs DS5 "the case officer (no agent/case:record-decision) is offered no act … a forced decision … is 403 and records nothing" (tests:83-88; job 135744274446, 52/0).
    check_csc1_close.ts "DW2 fail: … without agent/case:record-decision (READ_ONLY, BILLING_FINANCE, CASE_OFFICER) → 403 MISSING_PERMISSION" (:206) and "DW5 fail: reopen without agent/case:reopen (ADMIN …) → 403" (:254) (job 135744274298, 55/0).

## (3) P-339
- Pack: walks.yml j_77 on main c66a41c96, run 44600094672 (job 135829183143) 76/76. Independent re-run 44600106989 (job 135829221381) 76/76 on fresh data (different case and staff ids, so not a replay).
- Case-side suites: ci 44575502680 (all 18 shards and 5 regression jobs green) on tree 1b360046e. That covers C8.2 (record API/browser, numbers), CS-C1 close/count, CS-C1s view and decision browser, and B83 undo/withdraw. Main's own head ci 44594750686 ran fast+types only (records change).
- Not verifiable by this reader (no network allowed): the run ids, their head SHA and conclusions come from batch-checks.txt. The walk text has no SHA line. The Lead or qa should confirm `gh run view` shows headSha c66a41c96 for both walk runs.

## (4) Other holds (P-305)
- No other open Major or Critical in BUGS.md at c66a41c96 names R1.77, CS-C1 or C8.2. Every other Major names other rows. QA-397 is closed.
- Open Minors touching C8.2 do not hold: QA-429, 430, 431, 412, 386, 294, 324, 509.

## Minor observations (not holds; qa may log)
- Without a staff sign-in, useCaseDecisions is disabled (case-decision.tsx:54). The header pill then falls back to "Closed" even for a withdrawn case (:61-63), with no end line. Outcome and reason show only to signed-in staff.
- refusalOf 403 says "An Owner, Admin or Case manager can" (:44) for every act, including reopen, but Admin lacks agent/case:reopen (:156; check_csc1_close.ts:254). Wrong words only on a role changed mid-session.
- j_77's line "W2 pass: with no firm staff sign-in…" (:119) reuses the W2 tag for a sign-in check (label only).
- W7's earlier stage is a SQL fixture (session_replication_role = replica; j_77.ts:281-288), declared in the header. The behaviour is still read on the product's screen.
