migration — `20261120100000_csk1_client_link_check` (case_client: `fo_link_pending` and its guard trigger, a NOT VALID link check, a SECURITY DEFINER validate function). Shared files: `api/src/platform/firm-scope.ts` (one `BYPASS_USES` line, the Lead reads it); `api/src/runtime.ts` createCase.

Completes: R1.72

Duplicate check: searched open PRs for "CS-K1", "client_link", "fo_link", "prospect-won poll" and "J-72" (the Lead's 00:3x IST search found #2255 merged and no part-2 PR; re-checked at open), BACKLOG*.md (CS-K1 part 2 is this row; FO-5rp, FO-2u are follow-ups), main's code (`git grep -n "linkClient\|fo_link_pending\|ProspectWonPoll\|j_72" -- prototype/studio` finds none), and qa/BUGS.md; none.

Done when:
* `tsx studio/tests/check_csk1_client.ts` exits 0, with DW1-DW8 unchanged and DW9-DW13 each passing and failing as named.
* `tests/journeys/j_72.ts` walks both wins (Convert, and Signed offline) into one case each, with applicants, representative and pinned release. It exits 0 twice, on fresh isolated copies.
* `check_fo8_prospect_won`, `check_csc1_count`, `check_case_feed`, `check_csw1_firm_id` and `check_pf19r_case_links` stay green.
* The reviewer's Approve is on the head; full ci is green.

## What and why
R1.72's last part. Brief: `design/build-lead-c-briefs/CS-K1-2.md` on `claude/build-lead-c-647b40`, with Build Lead C (4)'s four answers of 20 Nov (comment 7019036496 on #2255). Resume note: `screens/CS-K1/RESUME-part-2.md`.
* **Every case client is linked to its front-office party** through FoPersonPort (contract §1 rule 4). A PERSON client gets an fo_person; a COMPANY client gets an fo_company, never a contact person.
  * A new client is born linked, in the opening's transaction: `clients.ts newClient` calls the port, then inserts the client with its party's id.
  * Existing clients are linked by a JobPort job per firm (`case-clients/client-link.ts`, queue `cases.client_link`, key `cases.client_link:<firm>:<oldest waiting client>`).
    * It is queued again only while a client waits.
    * Each client is linked in its own transaction, under its row lock.
    * A failure throws, so pg-boss retries it.
    * A re-run changes nothing.
    * The job ends by validating the check.
  * The front office's text rule refuses some characters a case name may hold, such as a Persian name's U+200C, a soft hyphen or an emoji joiner. The party's copy of the name drops those characters. A name with no letter or digit left is named by its client code (breaker F1).
* **Live delivery of `prospect.won`** (ruling 2: a polling publisher over the outbox). `case-clients/live.ts` `ProspectWonPoll` runs FO-8's catch-up at app start, then every `PROSPECT_WON_POLL_MS` (default 10000, Sample).
  * It is single-flight and stops on shutdown.
  * It lists the due prospects on the one bypass use `cases.prospect-won.catch-up`. Each client is then made as its own firm (`withFirm`), never on the bypass.
  * A failed prospect is logged by id and the poll goes on.
  * While the job runner runs, it queues the link job of each firm with a client still waiting. With none waiting, it validates the check once.
* **The migration** (ruling 3):
  * `case_client_front_office_link_check` is added NOT VALID: a client of a platform firm is linked by its kind unless `fo_link_pending`.
  * `case_client_pending_guard` lets only the two database triggers set that flag (`pg_trigger_depth() >= 2`), so application code cannot get round the check (review M1, breaker F3).
  * `case_client_validate_link_check()` validates the check once no client is missing its link.
* **J-72** (`tests/journeys/j_72.ts`, ruling 1) walks a Convert win and a Signed offline win into one case each, plus the four DW lines.

## Deviations from the brief (asked as "Question for the tech lead" on #2255, comment 7019181906, before building; your ruling stands over them)
1. **`fo_link_pending`.** A NOT VALID check still refuses every new or changed row, and two database paths write unlinked clients that code cannot reach in its transaction:
   * `case_client_for_case`: a case written straight to the table. 21 suites write fixture cases this way.
   * `case_client_follow_firm`: CS-W1's backfill fills a client's firm id later, as in CS-K1 DW8a.

   Both now set the flag; the job links those clients and clears it. A guard trigger refuses any other write that sets it. A client of a key with no platform firm (`firm_id` null, as `check_pf19r_case_links` writes) has no front office yet, so the check passes it.
2. **The opening runs as the opener's platform firm.** `POST /api/runtime/cases` is an x-actor route with no firm scope, so under PF-12's walls the port's `fo_person` write was refused. createCase now resolves the firm with `case_lookup.case_firm_id_of_key(<the opener's firm key>)` and runs its transaction in `withFirm`. A staff session of another firm is refused with 403. The firm is never taken from the request. Needs the Lead's read (firm scope).
3. **A SECURITY DEFINER validate function.** VALIDATE needs the table's owner, and the API runs as `xr_app`. The function's search_path is pinned, it is executable by xr_data, and it validates only when nothing is missing.

## Found by J-72 and fixed here (FO-8 faults)
* **A signed-in open-case answered 500.** AUD-1m accepts only lines naming the request's own actor, and createCase logged the simulated actor's id. createCase now takes `by` (`staff:<id>` from open-case). `check_fo8_prospect_won` ran in-process without the audit context, so it never saw this. J-72 W3 is the failing case: 500 before the fix, 201 after.
* **Signed offline's representative (resume note).** W8 shows FO-8 reads `representative.staff_id` from the version ended SIGNED_OFFLINE through the real signing route. No FO-8 change was needed.

## Carried over from FO-8
* `MODULE.cases.rows/FO-8.md` has its `Tests:` line back.
* The accent-cut case now uses q + U+0301 (no composed form), 50 each in the given and family names. It asserts the name ends on the mark within 120 units.
* The `case.opened` audit words are now: A case was opened from the "Open a case?" offer.
* `OFFER_REFUSED.CHANGED` now says the client updates by itself within a few seconds.

## Checks (cloud container, own isolated copies, never :4400)
| Check | Result |
|---|---|
| `tests/check_csk1_client.ts` (DW1-DW13, fresh copy) | 64/64, exit 0 |
| `tests/journeys/j_72.ts` (branch + #2321 merged, fresh copy :4473, poll 500 ms) | 27/27, exit 0 |
| `check_fo8_prospect_won.ts` | 43/43 |
| `check_csc1_count` · `check_case_feed` | 40/40 · 42/42 |
| `check_csw1_firm_id` · `check_pf19r_case_links` · `check_a24_case_number_api` · `check_csv1_inputs` (fresh copies) | 47/47 · exit 0 · 23/23 · exit 0 |
| fo1p, pf12_walls, pf25, aud1m, csc1s, c617 | exit 0 |
| typecheck.mjs | no new errors (15 known) |
| graph --check · count-any · mergify scopes · module-cards tree | exit 0 · 416 → 416 · PASS · PASS |

Card unchanged: api-platform (one `BYPASS_USES` entry, listed on `MODULE.cases.rows/CS-K1.md`; no platform entry point, invariant or table changes) and api-features (one feature file; the feature index is unchanged). The cases card's items are in `MODULE.cases.rows/CS-K1.md`.

## On the demo
On :4400, Convert a prospect (Front office → Pipeline → the prospect → Convert to client). Within about 10 s the client appears under `GET /api/runtime/clients`, linked to the prospect's person. Open its case with `POST /api/runtime/clients/<id>/open-case` (staff session). The case page shows the client, the applicant, the representative and the release. There is no "Open a case?" screen yet: **follow-up row for the Lead to add** (ruling 1).

Cost US$0 (no live AI). Lines: about 600 changed, including tests and J-72 (under 800).

## Review and break
* The Opus reviewer returned Changes needed at 17b41633f: 0 Blockers, 2 Majors (M1 the pending-flag escape and the job queued once; M2 W8 not discriminating), 7 Minors. All nine were fixed at 4715e7873. See `screens/CS-K1/review.md`.
* The breaker found 0 Blockers, 4 Majors and 4 Minors at 17b41633f. F1, F2 and F3 are fixed. F4 (an x-actor request with no session writes front-office rows) goes to the tech lead (comment 7020701579 on #2255). See `screens/CS-K1/break-report.md`.
* Minors left open:
  * F6: an opening for a DELETED firm still makes its party. Sample firms are never deleted; the row that closes firms owns this.
  * F8: `main.ts` never calls `enableShutdownHooks`, so the poll's stop step runs only in suites. Nothing is half-written. It is outside the touch list.

## Questions
* **Question for the tech lead: F4, firm scope** (above, and on #2255). Recommendation: accept it as Minor until the case routes use PF-4's session.
* **Question for the tech lead: migration read (P-423, P-600).** Stamp `20261120100000_csk1_client_link_check` is later than main's newest at open. Recommend: OK.
* Deviations 1-3 above (also on #2255): recommend keeping them as built.
* Minor: the poll writes one `platform_bypass` log line per run (every 10 s). Recommend keeping it: every bypass use is logged by rule. A later row moves the poll onto PF-14's JobPort when it schedules finer than a minute.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MXNda94oFJuNFyG65DwpeY
