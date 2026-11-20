# Review: PR #2527, R1.8 "Audit trail nobody can edit" (QA-594, QA-595), commit e81b8cd51

Independent reviewer (did not build it), 20 Nov 2026. Diff `origin/main...e81b8cd51` (45 files, +493 −149; the PR's newer head f15adc814 only adds J-8 screenshots, so the code is the same). Ruling followed: P-687 (AG-13-43, the firm's Activity log shows before and after in full, personal data included). Not a screen, so the D1–D20 and BIC tables do not apply. The journey score is below. Report: `journey-test-reviewer-2026-11-20.md`.

## What I ran (this container, Postgres 127.0.0.1:54329; isolated copy on :4436, runtime lane, never :4400)
* `check_aud_values.ts`: 12 passed, 0 failed. `check_aud1b_adapter.ts`: 39 passed, 0 failed (DW8, DW9 and the contract case on both fake and adapter).
* J-8 header command (`isolated.sh j8r 4436 start --ttl 30 PLATFORM_IDENTITY=local … j_8.ts`): 33 of 33 passed, exit 0.
* Suites the PR did not list, picked because they read audit lines:
  * `check_aud4_firm_log.ts`: **32 passed, 1 failed**.
  * `check_fo9a_phone_edit.ts`: **35 passed, 1 failed**.
  * `check_fo2pv_prospect_value.ts`: **25 passed, 1 failed**.
  * `check_pf18b_support.ts`: **40 passed, 1 failed**.
  * `check_pf19a_messages_schema.ts`: **92 passed, 2 failed**.
* CI on e81b8cd51: **`module-cards` failed and `pr-rules` failed** (GitHub check runs 136276121897, 136276122478). The app suites were skipped, so CI has not yet seen the failures above.

## Blockers
None.

## Majors
1. **The export line now shows false changes (a regression of AUD-4's review M2).** `api/src/platform/audit/firm-read/service.ts:187-188` adds `before: null, after: { rangeFrom, rangeTo, rows }` to `audit.exported`. `flattenValues` turns these into `rangeFrom_after`, `rangeTo_after` and `rows_after`, and `changesOf` shows them as three additions ("rows: (none) → 100000"). `check_aud4_firm_log.ts:192-193` ("the export's own line shows no false change") now fails. An export is an action, not a row change. **Fix:** `before: null, after: null` there, as the PR already does for settings (`platform/settings.ts:176`). The range and count are in `detail` already.
2. **Existing "no personal data in the audit line" tests are red, and the PR changes some of these tests but not others.** P-687 does change these rules, so the code is not wrong, but the tests have to move in the same PR (STANDARDS: "when a decision changes behaviour, its pack changes in the same PR"). They are:
   * `check_fo9a_phone_edit.ts:141-142`: the phone is now at `front-office/people/edit.ts:65`.
   * `check_fo2pv_prospect_value.ts:120`: the amounts are now at `sales/prospect-edit.ts:51`.
   * `check_pf18b_support.ts:219-221`: the body and page are now at `platform/support/support.ts:156, 196, 212`.
   * `check_pf19a_messages_schema.ts:314-316`: the suppressed address is at `messages/consent/consent-store.ts:129`. The second failure in that suite is the wording text, `consent-store.ts:164`.
   * `tests/journeys/j_33.ts:133` (W3 "ids only (no number)"). I read this one and did not run it. It checks `detail::text !~ '4165550100'`, and `phone_after` now holds that number.
   
   This also contradicts the PR's stated policy (Questions, point 1: values were "kept out" where a test says they never reach the trail). The support body, the consent wording text and the suppressed address are exactly that kind of field, and each has a test saying so. **Fix:** for each field, either follow P-687 and update its test, keeping a positive assertion as `check_pf21_complaints.ts:265` and `check_pf4_identity.ts:452` do, or keep it out as Question 1 does. Post the full run of the affected suites on the PR. The PR body still promises "the full 70-suite set … goes in a comment", and no comment exists.
3. **CI is red on this commit.**
   * `module-cards`: "`api/src/platform/MODULE.rows/R1.8.md`: a fragment is named after its row, e.g. FO-3a.md". The tree's convention is `R1-30.md`, so rename it to `R1-8.md`.
   * `pr-rules`: "MISSING: no Done when" in the PR body.

## Minors
1. **Before values that were not read from the row.**
   * `identity/session/service.ts:199` writes `before: { twoStep: "SET_UP" }` as a fixed value. Two-step state lives at the provider, so the person may never have set it up.
   * `retainers/service.ts:625`: `prospect.won` (signed on paper) is a change but has `before: null`, so the reader shows it as a creation. Pass `{ stage, wonVia: null }`, as `sales/prospects.ts` "convert" does.
   
   Every other before I sampled (more than 30 sites; below) is read before its update.
2. **Licence number in full (PR Question 2).** The PR says AG-1-31 "does not forbid audit values". The newest text (requirements-2026-11-02, AG-01 §, AG-1-31) says licence PII is "Confidential … encrypted at rest (TARGET) … never logged". Case-side summaries on main already carry licence numbers (`case-prepare` "reviewed … (licence …)"), so this is not new, and QA-594 names this exact field. The Lead should still answer Question 2 on the PR, quoting AG-1-31 accurately (AGENTS rule 2), before this merges. `check_pf4_identity.ts:452-457` was edited to match.
3. **Case-firm wall: gaps a future caller could open (none is reachable today; `core.ts:167` is the only CaseEntry caller).**
   * `recordCase` does not check that the case's `workspace_id` equals the line's `workspaceId`. `caseIdOf` does, but the adapter does not.
   * A CaseEntry with no `caseId` whose words name a case gets no case firm. `caseIdOf` covers this for `Audit.log` only.
   * With no request firm and no case, a named `firmId` is accepted unchecked (`audit-event.ts:87`), which is the same as the PF path.
   * A PF/FO line carrying `caseId` (`case-clients/prospect-won.ts`, the "Open a case?" line) is not checked against the case's firm. `case-feed.ts` never reads area entities as case lines, so nothing leaks today.
4. **Sweep strength.** `check_aud_values.ts:43-59` checks that the `before` and `after` keys are present, not what they hold. `before: undefined`, a fixed value or both null all pass. Helpers with required typed parameters make up for most of this. J-8 DW6's negative-result (NR) check (`j_8.ts:216-217`) runs the judge on a hand-built object rather than on a stand-in writer.
5. **`SECRET_FIELD` (`ports/audit.ts:36`) matches by name.**
   * It catches `password`, `token`, `hash`, `otp` and api, signing or private keys.
   * It misses `pwd`, `credential` and a bare `code` used as a one-time code.
   * It falsely matches `footprint` and `hashtag`. That is fail-closed, so harmless.
   
   No sampled site passes a secret under another name: invitation tokens, request hashes and IP hashes stay out, and `fileSha256` is a file digest.
6. The header of `consent-store.ts` (lines 1-6) still says "never an address … or the wording's text". That is true of `detail` but no longer of the line. The comment on `type Values` in `sales/corporate/service.ts:224` says "as AuditPort's AuditDetail".

## Judged as asked
1. **Port and writer: correct.**
   * `AuditValues` keeps values flat, strings at most 4000, lists at most 100, at most 60 fields, and refuses secrets.
   * The detail-key `.refine` is enforced in one place (`ports/audit.ts:76`).
   * `flattenValues` leaves out unchanged fields, gives a create lone `_after` keys and a delete lone `_before` keys, and keeps a change to or from null.
   * `firmId` is spread last, so a value can never overwrite it (`audit-event.ts:61`).
   * `caseFirmOf` (`:103-107`) reads `firm_id`, else `case_lookup.case_firm_id_of_key`, and refuses an unknown case.
   * Refusals: the alert's firm is the request's, set before any refusal (`:77`). The case firm is set only after both checks pass (`:89`). DW9 checks the first alert names firm B.
   * Still one try (`attempts: 1`), still fail-closed, and the refusal text goes to the server log and a generic 500 only (`main.ts:227`).
2. **Before and after at caller sites: right, apart from Minor 1.** Sampled:
   * Complaints: before is the locked row, after a re-read (`complaints.ts:358-362`).
   * Identity and session: roles, deactivate/reactivate, licence (`identity/service.ts:319`, read before the upsert), invitations, sign-in (read `for update`).
   * Offices and staff office (read before the update), settings, storage, limit changes, sign-up, web address, terms, consent, support.
   * Front office: booking attendance, reschedule, zone, cancel; availability set, change, delete, time off; booking types; consult record; identity check; phone edit; fo-person port.
   * Sales: leads, prospects (engage, move, lost, convert, undo), corporate (engage, contact add, role, end, type change), prospect value, calls and notes (notes kept out), arrival.
   * Retainers: template upload, version, rename; drafted, edited (the earlier version's fees), sent, withdrawn, signed offline.
   * case-clients: won, again, case opened.
   
   In all of these:
   * No secret, token or hash is passed.
   * Free text is bounded, either by its validator (reasons 200, notes 2000, licence 100) or by `.slice(0, 4000)`.
   * Placeholders are at most the 18 known names (unknown names are refused).
   * No site reads `before` after its update.
3. **Case-firm wall: not bypassable on today's paths** (DW9 and J-8 DW7, plus Minor 3).
   * `runtime_case` has no RLS. If RLS ever hid the case, the line would be refused ("does not exist"), never mis-attributed.
   * A caseId in another workspace never reaches the adapter through `core.ts`.
4. **Tests.**
   * `check_aud_values`, `check_aud1b_adapter` DW8/DW9, the contract case and J-8 DW6/DW7 each have a pass and a fail. Removing the wall line `audit-event.ts:86` fails DW9.
   * The edits to `check_pf21_complaints.ts` and `check_pf4_identity.ts` relax the leak checks only for before/after, in line with P-687, and each adds a positive assertion, so they are not weakened. The `check_pf0a_audit_port.ts` edit only passes the new required parameters.
   * Weakness: five other suites and J-33 now fail (Majors 1 and 2).
5. **Database and size.** No change under `prisma/`, no grant or trigger touched, and J-8 DW3 still shows UPDATE and DELETE refused as `xr_app`. No migration. The diff is 642 changed lines, under 800.

## Journey score (reviewer; journey-test skill, J-8 on :4436): 8.5 / 10
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-8 33/33; PF office add and rename, FO phone edit and case lines all write who, when, before and after. |
| Next step obvious | ½ | The values show only through `GET /api/platform/audit`; the AUD-4s page (R1.88) is not built. |
| Plain words | ½ | The export line reads as three additions (Major 1). |
| Feedback and state | 1 | Refusals are fail-closed and nothing is written (DW9, DW7). |
| Correct data | ½ | Fixed `twoStep` before value; `prospect.won` before is null (Minor 1). |
| Error recovery | 1 | Rollback with the line (DW5). |
| Accessibility and screen sizes | 1 | axe clean; 1024 and 1440 px with no sideways scroll. |
| Speed | 1 | One indexed select per case line. |
| Visual quality | 1 | Activity unchanged. |
| Trust and sources | 1 | Values sit inside the hash-chained line; the table is insert-only. |

## To fix before Approve
Majors 1-3: the export line values; the red suites and J-33 brought in line with P-687, or the fields kept out; the fragment renamed to `R1-8.md`; "Done when" added to the body. Then post the affected suites' results on the PR. Minors 1 and 6 are cheap to fold in. Question 2 needs the Lead's answer.

## Could not check
The CI walk with video (the walk was skipped on this commit). The full 70-suite set. J-33 (by reading only). A real screen reader.

Verdict: Changes requested
