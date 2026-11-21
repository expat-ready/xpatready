# Review: PR #2527, R1.8 "Audit trail nobody can edit" (QA-594, QA-595)

Independent reviewer (did not build it), 20 Nov 2026. Ruling followed: P-687 (AG-13-43, the firm's Activity log shows before and after in full, personal data included). R1.8 is not a screen, so the D1–D20 and BIC tables do not apply. Journey report: `journey-test-reviewer-2026-11-20.md`.

## Round 2: delta e81b8cd51..f204e0f84 (`git diff e81b8cd51 f204e0f84 -- . ':!*.png'`)

### What I ran (this container, HEAD = f204e0f84, clean; Postgres 127.0.0.1:54329; isolated copies on :4436/:4437, runtime lane, never :4400)
| Suite | Result |
|---|---|
| `check_aud_values` | 14 passed, 0 failed (new: caseIdOf pass/fail, wider secret list) |
| `check_aud1b_adapter` | 39/0 |
| `check_aud4_firm_log` | 33/0 (was 32/1) |
| `check_fo9a_phone_edit` | 37/0 (was 35/1) |
| `check_fo2pv_prospect_value` | 27/0 (was 25/1) |
| `check_pf18b_support` | 41/0 (was 40/1) |
| `check_pf19a_messages_schema` | 94/0 (was 92/2) |
| `check_fo8_prospect_won` (on an isolated copy, :4437) | 44/44 |
| `check_pf4_identity` part A | 111/111 |
| `check_aud1m_case_writes` | 17/0 |
| `check_case_feed` | 42/42 |
| `check_pf0p_ports` | 126/0 |
| `check_pf0a_audit_port` | 24/0 |
| J-8 (header command on :4436) | 33/33 |

Not run:
* J-33: the builder reports 19/0, and I read its new W3 assertion (`j_33.ts:133`): numbers only as `phone_after`.
* PF-4 part B: its one failure is the missing isolated copy on its fixed port (:4541), outside my lane's ports.

### Round 1 findings
* **M1 (export line), fixed.** `firm-read/service.ts:188` now passes `before: null, after: null`; its range and count stay in `detail`. AUD-4 DW6 (review M2) passes again.
* **M2 (red suites), fixed.** Personal record fields stay in full (P-687) and each test now asserts two things: nothing outside `_before`/`_after`, plus a positive check of the value. This covers:
  * `check_fo9a_phone_edit.ts:141-145`
  * `check_fo2pv_prospect_value.ts:116-118`
  * `check_pf19a_messages_schema.ts:314-316`
  * `check_fo8_prospect_won.ts:118-122`
  * `fo-person-port.contract.ts:41-44`
  * `j_33.ts:133`

  Free text and requirement-guarded values are now kept out, so their tests return to main's wording:
  * support body and page (`support.ts:156, 196, 212`; PF-18b, AG-16-63);
  * consent wording text, recorded as `textLength` (`consent-store.ts:164`);
  * the licence number (`identity/service.ts:316-321`). It records only `licenceNumberChanged`, per AG-1-31 "never logged", and `check_pf4_identity.ts:452` is back to main's.

  That settles my round 1 Minor 2 (Question 2) the cautious way. The policy is now consistent: record fields in full, free text and Confidential numbers out.
* **M3 (CI), part fixed.**
  * The fragment is renamed to `MODULE.rows/R1-8.md`, and `pr-rules` is green on f204e0f84 (run 136288474553, after "Done when" was added to the body).
  * **`module-cards` is still red on f204e0f84** (job 136288473696) for a different reason. Three more modules are touched with no card change and no `Card unchanged: <reason>` line in the PR body: api-cases (`case-clients/prospect-won.ts`), api-core (`core.ts`) and api-front-office (16 files). The earlier "Card unchanged except …" sentence was dropped from the body.
  * This is now a PR-body gate, not code. CI enforces it before any merge, so I record it as Minor N1 below rather than block the code on it.

### The delta's other changes
* **`core.ts:150-155` `caseIdOf` (breaker M1): correct.** Only an entity in `CASE_ENTITIES` is read for its case, so a configuration line's typed words ("see case bbbbbbbb") never put it on that case's firm trail.
  * `CASE_ENTITIES` (`case-feed.ts:17-23`) includes case, person, case fact, row, item, filing, case document, assessment and the other case entities, so real case lines keep their case id.
  * J-8 DW7, `check_aud1m_case_writes` and `check_case_feed` all pass.
  * Code-made words come first in case-entity summaries (e.g. filing `warning_passed`: "on case <id>: <reason>"), and `caseOf` takes the first match, so a typed reason cannot redirect the line. Pass and fail are in `check_aud_values.ts:39-49`.
* **`retainers/service.ts:623-625`: `prospect.won` (signed on paper) now reads its before values from the locked row.** `winProspect` (`sales/prospects.ts:82-90`) passes `p`, which is locked and read before the update. That fixes half of my round 1 Minor 1.
* **`money-line.ts:19`: `before: null, after: null`,** as PF-6m froze the line. It is an event of the role change, whose own line carries `roles` before and after. Acceptable.
* **`SECRET_FIELD` widened (`ports/audit.ts:36`):** pwd, credential, bearer, jwt, cookie, session id, and invite/magic/reset/sign-in/login/unsubscribe links. All 13 suites above stay green, so no real field is caught by mistake.
* **Insert-only:** still no change under `prisma/`, no migration, and no grant or trigger touched. Without the review records the diff is about 690 changed lines, under 800.

### Open after round 2 (none Blocker or Major)
* **N1 (Minor, PR body):** `module-cards` is red (above). Add `Card unchanged: <reason>` for api-cases, api-core and api-front-office. If cards or fragments are changed instead, the head moves and needs a new review.
* **Round 1 Minors still open (follow-ups, not blocking):**
  * The fixed `twoStep: "SET_UP"` before value (`session/service.ts:199`).
  * The adapter does not check that the case's workspace matches the line's.
  * `CaseEntry.firmId` is trusted when there is no request firm and no case (breaker m2).
  * A PF/FO line's `caseId` is not checked against its firm (breaker m3).
  * The sweep checks that the keys are present, not their values.
* **Breaker M2 (demo reset refuses a non-Sample firm's case line) and m1 (`Audit.log` on the shared client):** these are the breaker's findings and the PR raises them as Questions 3-4 for the Lead. Every demo case's firm comes from a Sample firm key today. I did not re-judge them.

### Journey score (reviewer, J-8 on :4436, 33/33): 9 / 10
"Plain words" (the export line) and "correct data" (`prospect.won`) are now 1. "Next step obvious" stays ½: the values are visible only through `GET /api/platform/audit`, because the AUD-4s page (R1.88) is not built. The fixed `twoStep` before value is minor and does not change the score.

## Round 1 (e81b8cd51), for the record
Majors raised:
* **M1:** the export line showed false changes.
* **M2:** five suites and J-33 were red because "no personal data" tests were not updated with P-687.
* **M3:** CI was red (`module-cards` on the fragment name, `pr-rules` with no "Done when").

Minors raised:
* Before values not read from the row: the `twoStep` fixed value, and `prospect.won` before null.
* The licence number against AG-1-31.
* Latent case-wall gaps.
* Sweep strength.
* `SECRET_FIELD` by name.
* Stale comments.

Judged sound in round 1:
* the port and writer;
* every sampled caller's before and after (30+ sites);
* the case-firm wall on today's paths;
* the tests' pass/fail pairs, with no test weakened;
* insert-only, no migration.

Full round 1 text: git history of this file at 09594b40b.

Could not check: the CI walk with video, the full 70-suite set, and a real screen reader.

Verdict: Approve f204e0f8445dc390bb3e73ea678dc7066b963804
