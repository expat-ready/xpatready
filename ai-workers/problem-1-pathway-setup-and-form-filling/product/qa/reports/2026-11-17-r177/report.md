# R1.77 capability score, 17 Nov 2026 (qa): submission number and UCI; decision, close, reopen

**Signal:** CS-C1b #2002 merged 16 Nov 22:30 UTC, after CS-C1a #1818. With both, every part of map row 77 is on main (P-606). This scores it within 4 h (P-613 (4)).
**Run:** main **6933695372a**, in qa's cloud container. Isolated copies only (ports 4470, 4471, 4474, 4475), each started and stopped in the same command. Live AI off, US$0.
**Who:** a qa agent on Opus wrote and ran the checks; the verdict is the qa lane's, from that evidence. Lines word for word: `2026-11-17-r177/evidence.md`.

## Verdict: R1.77 Partial
What the row asks for works through the API on the configured checkpoint, with audit lines and the active-case count. It is not Works, for three reasons:
1. **No screen (new Gap · Major, QA-501).** A staff person cannot record a decision, withdraw, close or reopen a case from any page. Nothing in `web/src` calls these routes:
   * `POST /api/runtime/cases/:id/decisions`
   * `POST /api/runtime/cases/:id/withdraw`
   * `POST /api/runtime/cases/:id/close`
   * `POST /api/runtime/cases/:id/reopen`

   The case read shows only `status` OPEN or CLOSED: no outcome, reason or decision.
2. **QA-397 (C8.2) stays open (Major).** Its check gives 5/6 twice on this head, failing at the same step: an open case reads "Filed through PR Portal" while that change is still a draft. `api/src/case-prepare.ts` still reads `combination.portalKey` (lines 160, 177, 417, 718, 895) rather than the pinned release.
3. **No GitHub-runner run on main's head (P-339).**

## Counts (each run twice, the same lines both times)
| Check | Result |
|---|---|
| `tests/check_csc1_close.ts` (CS-C1a; needs `--tsconfig api/tsconfig.json`) | 55/55, exit 0 |
| `tests/check_csc1_count.ts` (CS-C1b) | 40/40, exit 0 |
| Gate B, C8.2 on the checkpoint | "C8.2.test.ts on the checkpoint: exit 0, 19/19 passed", "Gate B: passed" |
| qa's `tests/qa/check_r177_case_decision.ts` (new) | **45/46**, exit 1. The one FAIL is the screens Gap (QA-501) |
| QA-397 retest | 5/6, exit 1 |

## What qa's check walks
The walk runs as the owner, the case manager and the case officer, signed in through the local identity stand-in.

* **Submission number and UCI (C8.2):** recorded on a Ready-to-file Visitor visa filing, and both are in the database.
* **Decision:** APPROVED, 201. Refused:
  * before the submission is recorded: 409 NOT_SUBMITTED;
  * case officer: 403 MISSING_PERMISSION;
  * x-actor alone: 401;
  * another firm: 404;
  * bad outcome: 400 on the field.
* **Order rules:** close before a decision gives 409 NOT_DECIDED, and withdraw after one gives 409 HAS_DECISION.
* **Close with a reason:** 200, CLOSED_BY_STAFF; the reason and the stage it closed from are kept. Refused:
  * blank reason: 400 REASON_REQUIRED;
  * case officer: 403;
  * a decision on the closed case: 409 CASE_CLOSED.
* **Reopen with a reason:** 200, OPEN, at the same stage, which is still CURRENT; the closing fields are cleared. Refused: case officer 403, no reason 400, reopening an open case 409 CASE_OPEN.
* **Next step after reopen:** a new decision (201, a second row), then the case closes again (200).
* **Withdraw a second case:** 200, WITHDRAWN, with one WITHDRAWAL row. Refused: case officer 403, no date 400. The withdrawn case then reopens.
* **Audit:** one `case` line per step, each by `staff:<id>`, carrying its reason; the reopen line keeps the old closing values.
* **Outbox:** `case.closed`, `case.reopened`, `case.closed`, then `case.closed` with reason WITHDRAWAL.
* **Active-case count (CS-C1b):** +1 at opening, -1 when every filing has a decision, +1 at reopen, -1 at the new decision, -1 at the withdrawal.

## Bugs
* **QA-474 (Gap) closed.** Its asked action is done: the row was shaped (CS-C1, both parts merged), and decision, withdrawal, close and reopen are built with named tests. Whether they get their own C row is question 2 below. What is left is the screen, a different finding (QA-501).
* **QA-397 (Bug · Major) kept**, retested and failing as above.
* **QA-501 new**, Gap · Major, screens lane: decision, close, reopen and withdraw have no screen.
* **QA-502 new**, Bug · Minor (CI retry only): `check_bk3_links_browser.cjs` failed its 1st try at 375 px in #2013's merge batch (Cancel left `?open=` in the address), then passed on retry (evidence §6).
* **QA-314 raised to Major**: it recurred on #1998's merge batch, and its row's rule says to raise it then (evidence §6).
* **Minor (test harness, noted here and not logged as a row):** `check_csc1_close.ts` run as its usage line says crashes with "Parameter decorators only work when experimental decorators are enabled". It leaves two scratch databases behind, which qa dropped. Its usage line needs `--tsconfig studio/api/tsconfig.json`.

## Limits
* **No screen walk** of any kind (headed, axe, keyboard, zoom, widths): no screen exists.
* **Roles not walked:** ADMIN, READ_ONLY and BILLING_FINANCE, which the Sample firm lacks; the builder's DW2 and DW5 cover them.
* **Not re-probed:** parallel closes, decision retries and the 409 PLAN_LIMIT_REACHED (DW11 covers the last).
* **Not run:** no c8 coverage, no graph run, no read-only walk of :4400.
* **Sample:** outcomes are a Sample list until cited; auto-close is not built; legal points are Unconfirmed: no counsel.

## For the tech lead
1. Dispatch `nightly.yml` on main for P-339. Run `capabilities=C8.2`, `data=checkpoint`. Also run the full set, which runs both CS-C1 suites. Even green, R1.77 stays Partial until QA-501 and QA-397 close.
2. Should decision, close and reopen get their own C row in CAPABILITIES? R1.77 names only C8.2 today.
3. Is QA-501 (the screen) part of Release 1's bar for row 77?
4. Do you accept CS-C1b counting active cases by firm key rather than platform firm id until CS-W1?
