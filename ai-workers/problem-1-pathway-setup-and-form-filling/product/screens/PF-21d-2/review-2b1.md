# Review: PR #3713, PF-21d part 2b-1, the front-office eraser (R1.85)

**Verdict: Block** on f9faf8699b2151684a25717a05d1c45c8cf6bd95. The plan's verdict word is Rework: 2 Blockers, 3 Majors and 5 Minors are open.

Reviewer: independent; I did not build this. No screen, so the BIC scorecard, keyboard, width and zoom checks are N/A.
Evidence:
* `check_pf21d_fo_eraser` 25/25, `check_pf21d_erasure` 41/41, `check_pf21d_switch` 20/20, `check_fo9b_merge` 88/88, `graph.mjs --check` exit 0.
* `j_85`, run on an isolated copy on :4437, passed 18/21. W5 "no hold → Completed" FAILS (see M1).
* Scratch scripts, run as xr_app under PF-12's walls, used the app's own `arrive()` and `Erasure.run`.
* The break-test report (`break-report-2b1.md`, written separately) reached the same B1, B2 and m3. I re-ran or code-read each one.

## Answers to the questions asked
* **Only this person's rows in this firm?** Yes. Every statement names `firm_id = $1` and the person (eraser.ts:26-39). A wrong firm scope is refused before any write (eraser.ts:70), and RLS holds as well. No family member or other firm was touched (test :125-126, :142).
* **Idempotent, never ERASED twice?** Yes for the same order. The guards touch only rows that still hold words, and the name comes from the request id (eraser.ts:23). A second *request* for the same person renames the record again and answers "cleared: person 1" (m4).
* **ERASED or COMPLETED while personal data is kept?** Yes, in two ways (B1, B2), both on the app's ordinary paths.
* **Breaks a trigger or check?** No. I checked every BEFORE/AFTER trigger and CHECK constraint on the seven updated tables: `fo_booking_write` and `fo_booking_cancel_reason_check` (status unchanged), `fo_prospect_rules`, `fo_prospect_contact_linked` (CORPORATE only; the eraser updates INDIVIDUAL prospects only), `fo_consult_record_recommended_check` (accepts `{}`), `fo_person_email_check`, and `fo_person_keys`, which recomputes the keys.
* **Changes existing tests or the demo?** The existing suites are unchanged and green. On the demo, the "Data erasure" switch is seeded on, so the 07:40 job now really erases due, approved deletions, and B1 and B2 make some of them end falsely COMPLETED. The j_85 edit does not do what the PR body says (M1).
* **Does the test prove each Done-when with a pass and a fail?** Partly. The COMPLETED and KEPT lines are proven only on fixtures that the app cannot produce, and 6 of the 9 KEPT classes have no positive case (M2).

## Blockers
**B1. The activity log is undercounted, so a request ends COMPLETED while the log still holds the person's name, email and phone** (SA-11-28; port rule 5; the brief's rule "audit_event … answered KEPT").
* Cause:
  * eraser.ts:58 counts `audit_event` only where `entity_key = <person id>`.
  * The line that creates every person is keyed on the *lead*: `lead.created`, entity `fo_lead`, sales/arrival.ts:139-144. Its `after` holds `givenNames`, `familyName`, `email` and `phone`, and audit-event.ts:67 flattens them into `detail` (P-687).
  * The corporate path has the same gap: `company_contact.added` is keyed on the link id (sales/corporate/service.ts:244-245).
* Repro: a hand-added person (real `arrive()`, door MANUAL, no message, no consent), then `frontOfficeEraser.erase`.
  * Answer: `{ outcome: "ERASED", note: "cleared: person 1" }`.
  * `audit_event` still holds `givenNames_after: "Walkin"` and `email_after: "walkin…@example.org"`.
  * Through the job, all ERASED gives COMPLETED (service.ts:236-239).
* The test hides it: its only audit line is a hand-made one keyed on the person (test :113-114), and its ERASED and COMPLETED people have no audit line at all (:137-139, :173-179). No person the app creates looks like that.
* Fix: count audit lines in this firm that name the person by any path: `entity_key` in the person's id and their lead, prospect, booking, call and company-contact ids, or `detail->>'personId' = person`. Correct columns.ts:70 ("ids only" is not true). Test it with a person created by `arrive()`.

**B2. ELSEWHERE rows are handed to erasers that do not exist, so the request ends COMPLETED with that data in place.**
* columns.ts:38-41 hands `case_client` to CS-X2 and `plat_complaint` to part 2c.
* After this PR, `front-office` is the only eraser registered in `api/src`. The job sees one ERASED and finishes COMPLETED, while `case_client.display_name` and `contact`, or `plat_complaint.complainant_name` and `complainant_contact`, remain. The break report reproduced both.
* Fix: until those modules register, count those rows here as KEPT (for example `not_yet_erasable`, or a class naming the other module), or have the Lead rule that the job may not finish COMPLETED while a module named ELSEWHERE is unregistered. Leaving it silent is not allowed.

## Majors
**M1. The j_85 W5 change cannot pass, but the PR body says the step now uses the app's own eraser.** On the :4437 run, W5 FAILED with `erased: []`. There are two causes:
* (a) `runOn` gives `Erasure` the owner client `db`, which is not walled. `plat_data_request_erasure_mark_add` then refuses with "not an order of this firm under this claim" (42501), the order fails, and nothing is recorded. I reproduced this alone; with the walled client the job is fine.
* (b) j_85.ts:206 reads `coalesce(given_names, 'gone')`. The eraser nulls `given_names`, so even a correct run reads "gone" and the line fails. Read `family_name` instead, or test that the row exists.

**M2. The KEPT classes are not proven as the Done-when says.**
* Only `do_not_contact`, `not_yet_erasable` and `activity_log` have a positive case (test :127-128). `consent`, `signing`, `retainer`, `identity_check`, `conflict_check` and `client_financial` (AUD-5's money floor) have none. A wrong predicate in KEPT_SQL (eraser.ts:44-52) would stay green.
* Nothing ties a column classified KEEP in columns.ts to a count in KEPT_SQL, so a later KEEP row can be counted by nothing.
* The "fail" line at test :104 is a tautology: it changes a local array and exercises no code.

**M3. Merged-away records keep the same human's words, but the classification says they hold none.**
* columns.ts:29 calls `fo_person.merged_into_id` "the tombstone mark", LINK. A merge sets only `merged_into_id` and `merged_at` (merge/service.ts:257), so the loser keeps its name, email, phone, language and time zone.
* Today the `fo_dup_merge` count keeps the answer KEPT. Once 2b-2 clears the snapshots, nothing planned clears or names the loser, and the answer turns into a false ERASED.
* Fix: classify it as KEEP `not_yet_erasable`, and count the losers in KEPT_SQL (or anonymise them under a Lead ruling on SA-11-40 rule 6).

## Minors
* m1. Other subjects' conflict checks that list this person in `matches` are not counted (eraser.ts:49 counts `person_id` only). This is a code read; see the break report's M2.
* m2. The note labels every kept class "(Sample; Unconfirmed: no counsel)" (eraser.ts:86), including `client_financial` and `activity_log`, which are AUD-5 floors in code, not Sample. The `.slice(0, 300)` cuts that label first when counts are large.
* m3. `words()` (test :90-97) never seeds or reads `fo_lead.close_note` or `fo_consult_record.recommended`. Dropping either from ERASE_SQL stays green.
* m4. A second request for an already-erased person renames it to a new number and answers ERASED "cleared: person 1", although no personal word was cleared (eraser.ts:23, :27-29).
* m5. The staff-facing step shows snake_case class names ("not_yet_erasable 3", "do_not_contact 1") with no plain words (D10).

## Departures in the PR body
1. Keeping `msg_outbox.address` as not_yet_erasable: agreed (`msg_address_ok` refuses a blank).
2. Money rows not asking `KeepPeriodPort.check`: acceptable, because the rows are never changed and are always named. Note it on the brief.
3. A numbered placeholder: agreed.

## D1-D20 (back-end item; the rest are N/A)
* D1 2: the brief's "audit_event answered KEPT" and SA-11-28 are broken (B1, B2).
* D2 2: data stays where COMPLETED says it is gone.
* D5 4: one transaction, the claim kept, a wrong firm refused, the retake idempotent.
* D10 3: m5.
* D11 2: a false COMPLETED state.
* D15 5: about 17 statements per order.
* D16 2: M2, m3, and fixtures the app cannot produce.
* D18 3: kept classes are named, but mislabelled (m2).
* D19 2: the outcome is not reached truthfully.
* D17 and D20: simulated only.
* D3, D4, D6-D9, D12-D14: N/A (no screen, no AI).

Journey score (reviewer): **5/10, fail** (two criteria at 0). See `journey-test-reviewer-2026-11-26.md`.
Not checked: CI on this head; a real 07:40 runner tick; S3 files of kept classes.

**To fix before Approve:** B1, B2, M1, M2, M3.
Reviewer: Block f9faf8699b2151684a25717a05d1c45c8cf6bd95

## Round 2: diff-only review of f484b3e25c580d0177f240eb28b21dd059a23a70 (`git diff f9faf8699..f484b3e25`)
**Verdict: Approve** on f484b3e25c580d0177f240eb28b21dd059a23a70. No Blocker or Major is open; 4 Minors remain.

Evidence:
* `check_pf21d_fo_eraser` 34/34 at this head (a separate worktree).
* `j_85` with this head's journey and eraser, on an isolated copy on :4437: W5 passes 3/3 (19/21 overall; W1 and W2 still wait for PF-21rs and PF-17, as on main).
* A scratch script, run as xr_app under PF-12's walls: a `plat_complaint` about the person (with its RECEIVED event) answers KEPT, "case or complaint rows 1".
* The diff touches no server route, the job, or the merge or erasure suites, so I did not re-run those.

**Round 1 findings, each re-checked:**
* B1, closed. eraser.ts activity_log now counts lines keyed on the person, on their merged-away records, and on their leads, prospects, calls, notes, bookings, company links, retainers, identity checks and conflict checks. It also counts any line whose detail or summary holds their email or phone. The new test makes a person through the real `arrive()` and gets KEPT.
* B2, closed. `awaiting_other_eraser` counts `case_client` and `plat_complaint`. RLS lets xr_app see both in the firm's scope (`plat_complaint` is firm-filtered, which I proved with a real row; `case_client` has no RLS).
* M1, closed. j_85 runs the job on the walled client and reads `family_name`.
* M2, partly closed. A live-schema probe column replaces the tautology, conflict checks have a positive case, and a KEEP → KEPT_SQL tie was added. See m-R2-1.
* M3, closed. Records merged into the person are anonymised, recursively and in this firm only. Their test checks name, email and phone.
* m1-m5, closed. Matches are counted. The note is in words, grouped, with each group's label first; Sample appears only on the Sample classes, and money and the activity log are called floors. `close_note` and `recommended` are seeded and read. An already-anonymised record is never renamed, and the test answers NOTHING.

**Your question: is the structural tie enough for consent, signing, retainer, identity and money?**
* Not for all five. I removed each class from KEPT_SQL in turn and re-ran the tie (test :199-201).
  * Consent, signing, money and do-not-contact: the tie fails, as it should.
  * Retainer, identity_check and conflict_check: the tie **still passes**, because `fo_retainer`, `fo_identity_check` and `fo_conflict_check` also appear in the activity_log query's CTE. Conflict checks have their own positive case, so retainer and identity_check are left with no effective proof.
* I count this as a Minor, not a Major:
  * by read, each of those count queries is correct (live columns; a wrong column or enum fails the run);
  * a person the app creates always has a `lead.created` line, so they stay KEPT through activity_log anyway.
* A tie that proves only "the table is named somewhere" does not prove the predicate, so it is not a substitute for one positive row per class.

**Minors (round 2):**
* **m-R2-1.** Make the tie per class: each KEEP reason starts with its class name ("retainer: …"), so check that *that* class's own query names the table. Better, add one positive row for retainer and identity_check (fixtures exist in their own suites). `client_financial` is the floor that matters most, and a positive money row would be worth adding too.
* **m-R2-2.** Anonymising merged-away records touches person records other than the order's. That goes past the letter of port rule 3 ("that one person record") and next to SA-11-40 rule 6. Say so in the PR body as a departure, or get the Lead's nod.
  * Note for 2b-2: an unmerge after erasure restores the survivor's pre-merge values from `survivor_before` (merge/service.ts:331). The request already reads HELD naming the merge records, so it is truthful today.
* **m-R2-3.** activity_log runs `strpos` over `detail::text || summary` for every audit line of the firm, for each order. That is fine at Sample scale and the job is daily, but watch it when a firm's log is large.
* **m-R2-4.** `awaiting_other_eraser` counts even after CS-X2 or 2c register (nothing checks the registry), so those PRs must drop their table from it. The `plat_complaint` half has no test here; I proved it by hand.

Journey score (reviewer), round 2: **8.75/10, pass** (no 0): task ½→1, feedback and state 0→1, correct data 0→1, plain words ½→1. Next step stays ½ (staff get no date for "not yet erasable"), and trust and sources stays ½ (m-R2-2). That is 7 of 8 applicable criteria, scaled.

Reviewer: Approve f484b3e25c580d0177f240eb28b21dd059a23a70
