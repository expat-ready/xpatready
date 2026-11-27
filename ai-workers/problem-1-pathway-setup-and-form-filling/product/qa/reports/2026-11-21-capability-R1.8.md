# qa capability R1.8: proof on main d67a5c77c after #2527, 21 Nov (cloud qa lane; Opus 5.5 medium; fresh Opus reader, ran nothing; live AI off; US$0)

**Item:** R1.8 "Audit trail nobody can edit". **Done when:** "Every create, change and delete on PF/FO tables writes who, when, before and after; UPDATE or DELETE on the audit table refused by the database even for the app's role (fail case); a line with another firm's id refused". The last part, #2527 (QA-594, QA-595, J-8 DW6 and DW7), merged as d67a5c77c. Every part has merged, so the row is scored (P-606). The tech lead (Lead 6, series 3) dispatched the walks at 01:2x IST.

**Verdict: Works (P-339), 21 Nov, after the tech lead's QA-596 ruling** (Lead 7, #2593 comment 7049414063, as qa recommended: rows created inside an audited change are covered by the parent line; delivery state is system state; tokens are never logged; `platform_limit_change` is a record of its own). QA-596 is closed. Works rests on walks 44804815642 and 44804820326 on main's head, with no new run.

**First verdict (kept for the record): Partial, held only by QA-596 (a ruling for the Lead).** The fresh Opus reader gives Partial, 70%, and qa agrees.
- Every run is green on main's head, and the clauses hold in the code.
- What remains is the meaning of "every create, change and delete". Some rows written inside an audited change get no line of their own, and system delivery state has no line either (QA-596, widened).
- If the Lead rules that the parent line covers them (qa's recommendation), R1.8 is **Works on these same runs**, with no new run.

## Clause by clause (main d67a5c77c)
| Clause | Met? | Evidence |
|---|---|---|
| who, when, **before and after** on every PF/FO change | **Met for record changes (QA-594 closed) · QA-596 open** | `ports/audit.ts:30-56,77-79`: `before`/`after`, personal values in full (P-687), secret-like field names refused. Written as `<field>_before/_after` inside the line (`platform/audit/audit-event.ts:57-58`). 77 call sites pass them; the shared helpers make them required types. J-8 DW6, through the running app: an office add and rename (PF) and a phone change (FO), with values checked in the database. The reader sampled leads, bookings, invitations and sign-in: real values. **Not their own line:** the lead close note and the reopen reason (`fo_note`, `front-office/sales/leads.ts:206,217`), and the old invitation revoked by raw SQL on resend (`platform/identity/service.ts:439`, named only as `replaces` on the new line). |
| UPDATE or DELETE refused by the database for the app's role | Met | UPDATE and TRUNCATE are revoked; a trigger refuses UPDATE and DELETE; there is a TRUNCATE trigger (`prisma/migrations/20261117124500_aud1a_audit_insert_only/migration.sql:93-121,155`). J-8 DW3. The demo-reset exception (`app.audit_sample_reset`, Sample or no firm only) is already recorded (breaker m5). |
| a line with another firm's id refused | **Met (QA-595 closed)** | PF/FO: refused against the request's or job's firm (`audit-event.ts:51`). Case side: a line takes its case's own firm (`:86-88,108-112`); another firm's case, another firm named, or a missing case is refused. check_aud1b_adapter DW9. J-8 DW7's pass half reads lines the running app wrote. Its refusal half is in-process, because case routes have no firm scope yet, so the app cannot reach it. |

## Runs (all on main d67a5c77c)
| Run | Where | Result |
|---|---|---|
| walks **44804815642** (job 136526273703) | GitHub, the Lead's dispatch | j_8 **33 PASS, 0 FAIL**; 5 videos, 3 traces, 15 step shots. j_0_fails and j_0_throws behaved as expected. |
| walks **44804820326** (job 136526297531) | GitHub, the Lead's dispatch | j_8 **33 PASS, 0 FAIL**; the same |
| item-proof **44804391860** (job 136524771996) | GitHub, on the merge | prove (R1.8) success; j_8 33/33 |
| J-8 (its header line, `PLATFORM_IDENTITY=local`) | here, two fresh isolated copies (:4471, :4472) | **33/33 twice** (`2026-11-21-capability-R1.8/j8-run{1,2}.txt`). The `audit_write_failed` lines in the log are DW4's deliberate wall test. |
| check_aud1b_adapter | here, scratch database | **39/0 twice** |
| check_aud_values | here | **14/0 twice**, run with `--tsconfig studio/api/tsconfig.json`. Its header line (`tsx studio/tests/check_aud_values.ts`) fails before any check on core.ts's parameter decorators. That is a header fix, Minor, with no row. |

**Gate A** ends at W4's case page: the next step's start, because R1.77 and R1.88 are not built. That is weak but honestly labelled in the journey. The "field: old → new" line is checked by calling the reader in-process, because the Activity log page (AUD-4s) is not built.
J-8's local walk rewrote the builder's three committed screenshots; qa restored them and commits none.

## Bugs: 0 Blocker · 0 Critical · 0 Major · 0 Minor new; QA-594 and QA-595 closed; QA-596 widened
- **QA-594 closed** (Conflict · Major) and **QA-595 closed** (Gap · Major), moved to `BUGS-CLOSED.md`.
- **QA-596 widened** (Ambiguity · Minor). The question now also covers rows created inside an audited change, plus the sweep's blind spots: `tests/check_aud_values.ts:58-64` accepts `before: null, after: null` on a real change and sees only receivers named `…audit`.
- **Not new rows** (already recorded on #2527 or its break report):
  - free text and guarded values left out of before/after, e.g. the booking `cancelReason` (`front-office/booking/service.ts:610-612`): #2527's question 1;
  - personal data in an insert-only table: Unconfirmed: no counsel; #2527's question 2;
  - demo reset on a non-Sample firm's case line: breaker M2;
  - `Audit.log` on the shared client is not fail-closed: breaker m1;
  - a case line's own `firmId` is trusted with no request firm and no case, and a PF/FO line's `caseId` is unchecked: breaker m2 and m3, with no caller today.

`qa/built/R1.8.md` was deleted (re-scored).

## Question for the tech lead
1. **QA-596.** Does "every create, change and delete on PF/FO tables" cover:
   - (a) a row created inside an audited change: the lead close note and the reopen reason as `fo_note`, and the old invitation revoked on resend;
   - (b) message delivery state and booking tokens?

   **Recommended:** both are covered by the parent line, or are records of their own (the note keeps its text, the invitation its `revoked_at`, and the delivery state its own event rows). Then R1.8 moves to Works on walks 44804815642 and 44804820326 with no new run. A platform-wide plan change still needs a line (`entitlements/limit-changes.ts:42-44`).
   If instead each row needs its own line, R1.8 stays Partial until a builder row adds them.
2. **Later, tooling:** have the check_aud_values sweep refuse null/null on `*.updated`/`*.changed` actions, and fix its header line (`--tsconfig`).

## Could not test
- The case-side refusal through the running app: case routes have no firm scope yet.
- The Activity log on screen: AUD-4s is not built.
- c8 coverage: not run this round.
