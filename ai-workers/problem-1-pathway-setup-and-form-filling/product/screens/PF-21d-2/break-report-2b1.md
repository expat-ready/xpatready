# Break report: PR #3713, PF-21d part 2b-1, the front-office eraser (head f9faf8699)

**Verdict: not ready. 2 Blockers, 2 Majors, 3 Minors.** Both Blockers are the failure SA-11-28 forbids: the request ends
COMPLETED while the person's name, email or phone are still stored. Today no eraser is registered, so the job erases nothing
and records SKIPPED. Once this PR merges, the job starts ending requests COMPLETED.

**How I tested.** Scratch databases only: `xr_studio_brk2b1` was migrated to head, and each run used its own clone on 127.0.0.1:54329.
Port 4400 was not used. The eraser ran as xr_app under PF-12's walls (`walledPool` + `withFirm`, the same as the test), and the
real `Erasure` job ran with only `frontOfficeEraser` registered (the state on main after merge). Sample values only, US$0.
`tests/check_pf21d_fo_eraser.ts` passes 25/25 locally.

## Blockers

**B1. Undercounted activity-log lines: the request ends COMPLETED while the log holds the person's name, email and phone in full.**
`eraser.ts:58` counts `activity_log` only where `audit_event.entity_key = <person id>`. The lines that create a person are
not keyed that way:
* The arrival path writes the lead-created line with `entity: "fo_lead"`, `entityKey: lead.id` (`sales/arrival.ts:139`).
  Its `after` holds `givenNames`, `familyName`, `email` and `phone`, and `audit-event.ts:67` flattens them into `detail`
  as `*_after`.
* The corporate path writes `company_contact.added` with `entityKey: link.id`, and the new person's name and email are in
  `after` (`sales/corporate/service.ts:244`).

Neither path writes a line keyed on the person, so for a hand-added lead with no note, consent or suppression, nothing is KEPT.
* Repro 1: a person, their lead, and one `audit_event` row (entity `fo_lead`, entity_key = lead id, detail holding the
  email). Approve the request and run the job.
  * Expected: KEPT `activity_log 1`, request HELD.
  * Actual: `front-office: ERASED — cleared: person 1, leads 1`, status **COMPLETED**, and the email is still in `audit_event.detail` (1 row).
* Repro 2: the same with entity `fo_company_contact`. Actual: `{"outcome":"ERASED","note":"cleared: person 1"}`.

The activity log may be kept (its floor), but it has to be named. The count needs to find lines that name the person in
`detail` (`personId`, or `*_before`/`*_after` values), not only by `entity_key`.

**B2. Records marked ELSEWHERE are handed to erasers that do not exist yet, so the request ends COMPLETED with that data in place.**
`columns.ts:38-41` marks `plat_complaint.subject_id` ("the platform's eraser (part 2c)") and `case_client.fo_person_id`
("CS-X2") as ELSEWHERE. Neither eraser is registered: `front-office` is the only `register(` in `api/src`. The job therefore
sees one ERASED and finishes COMPLETED (`service.ts:239`).
* Repro 3: a `case_client` row (`display_name` 'Given Family Client', `contact` {"email": …}, `fo_person_id` = the person).
  Run the job.
  * Expected: HELD (partial).
  * Actual: **COMPLETED**, and `case_client` still reads `Given Family Client {"email": "client.brk@example.com"}`.
* Repro 4: a `plat_complaint` (subject FRONT_OFFICE_PERSON = the person; `complainant_name` and `complainant_contact` set,
  with its RECEIVED event). Run the job.
  * Actual: **COMPLETED**; `Given Family / complaint.brk@example.com` remains.

Until 2c and CS-X2 register, the front-office eraser could answer KEPT for ELSEWHERE rows, with a class such as
`other_module_pending`, or the job could refuse to finish COMPLETED. Either way the Lead should decide whether this is a merge gate.

## Majors

**M1. A merged-away record keeps all its personal words, but is classified as holding none.**
* `columns.ts:29` classifies `fo_person.merged_into_id` as LINK, "the tombstone mark".
* But a merge only sets `merged_into_id`/`merged_at` on the loser (`merge/service.ts:257`). The loser row keeps
  `given_names`, `family_name`, `email`, `phone`, `language` and `time_zone`: the same human's older details.
* Erasing the survivor never touches the loser, and 2b-2's list (brief "Insert-only rows") names only the `fo_dup_merge` snapshots.

Repro 6: survivor S, and loser L with `merged_into_id = S`. Erase S.
* Actual: `ERASED — cleared: person 1`. L still reads `Given2,Family2,loser.old.brk@example.com,+14165552002,fr,America/Toronto`.

In a real merge, the `fo_dup_merge` row makes the answer KEPT (`not_yet_erasable`), so there is no false COMPLETED today. But
that note promises 2b-2 will clear it, and nothing planned does. Once 2b-2 clears the snapshots, the answer becomes ERASED
with L intact.

**M2. Other people's conflict checks that name this person are not counted** (code read; not run, because the compliance
rows need much setup).
* `eraser.ts:49` counts `fo_conflict_check` only by `person_id`, the person who was checked.
* Another subject's check stores this person in `matches` (`recordId` = the person, `displayName`; fo13 migration :145-150).
  `searched_name`/`searched_email` may also hold their details.
* Those rows are kept and not named. With nothing else kept, the answer is ERASED → COMPLETED, the same failure as B1.

## Minors

**m1. The 300-character cut can drop the legal label.** `eraser.ts:86` cuts the whole note with `.slice(0, 300)`, and
"(Sample; Unconfirmed: no counsel)" is at the end. All nine classes with large counts come to 295 characters, so a few more
digits (activity_log 15200) cut the label first; the counts part should be shortened instead. Repro 8 (many rows): 136, fine.

**m2. A company lead's words are erased as if they were the contact's** (inconsistent with the classification).
P is PRIMARY contact of a company and of its CORPORATE prospect, and the corporate lead's `person_id` is P. Erasing P clears
that lead's `interested_in_text`, `source_detail` and `close_note`, while the prospect's `lost_note` is kept as "words about
the company" (`columns.ts`, `fo_prospect.primary_contact_person_id`). Repro 11: `ERASED — cleared: person 1, leads 1`.

**m3. Links to a person that are not foreign keys are unclassified.**
`msg_email.filed_kind/filed_id` (subject, from/to, body file), `msg_address_link.record_kind/record_id/address` and
`msg_unmatched.suggestions` are in neither `ERASE_COLUMNS` nor `ERASE_OTHER`, and FO-9b's inventory (foreign keys only)
cannot catch them. No writer exists yet (PF-19m part 1 defers "erasure (PF-21d) of a person's filed email"): latent, list it.

## What held
* **Booking statuses** (repro 5, all ERASED): each of SCHEDULED, RESCHEDULED, CANCELLED, COMPLETED, NO_SHOW passes
  `fo_booking_write`; `cancel_reason` cleared, zone UTC, `status`/`sequence` unchanged, no token voided, consult notes cleared.
* **Trigger refusal half-way** (repro 7, trigger on `fo_call` installed on scratch): `failed: 1`, step `front-office: FAILED —
  nothing was erased; the next run retries`; person, lead and call intact; after removing it, the next run (+1 h) completes.
* **Running twice:** the same order twice in parallel gives one ERASED and one NOTHING (FOR UPDATE serialises them); two
  different requests in parallel each answer ERASED, the second only renames.
* **Walls:** firm-A scope with a firm-B person → NOTHING, nothing changed; an order in another firm's scope is refused (test);
  a non-uuid `personId` is a bound parameter, refused with 22P02, never injected.
* **Primary contact on a company prospect:** no deferred trigger (`fo_prospect_contact_linked`, `fo_dup_live_party`)
  refuses; the company prospect is untouched.
* **Confirmed by the suite:** family member, same email in another firm, re-run KEPT/NOTHING, feature registered once.
* **do_not_contact matching:** `fo_person.email` and `msg_suppression.address` are both lower case by constraint.
* **A merged-away person through the job** (code read): `foPersonCheck` requires `merged_into_id IS NULL`; no eraser runs.

## Round 2 (head f484b3e25; diff f9faf8699..f484b3e25)
**Verdict: ready from the breaker's side. No Blocker or Major left; 4 new Minors.** I re-ran the round-1 script on a fresh
scratch database migrated to f484b3e25, and added new attacks on the recursive CTE, the `strpos` matches and the
email/phone audit match.

**Fixed (re-run):**
* **B1:** both repros now answer KEPT ("activity log lines (7 years) 1"); the request is HELD.
* **B2:** the `case_client` and `plat_complaint` repros are HELD.
* **M1:** the loser is anonymised. A chain C→D→S gives "merged-away records 2", all three are anonymised, and a second run
  gives NOTHING. A crafted cycle X→Y→X terminates (UNION removes duplicates).
* **M2:** another party's conflict check holding the person's id in `matches` → KEPT "conflict checks 1".
* **m1:** the labels now lead. **m3:** the `msg_*` tables are counted.
* **Still held:** every booking status, refusal and rollback, the parallel runs (two requests in parallel now give ERASED
  and NOTHING), the walls, and the non-uuid id.
* **Still open:** m2 (a company lead's text is cleared through its primary contact) is unchanged: repro 11 still gives
  `ERASED — cleared: person 1, leads 1`.

**Over-counting (the safe direction) holds.** A false KEPT is safe, and that is all these give:
* Person `a@b.co` with another person's line holding `xa@b.com` → KEPT.
* An unreadable phone stored as `''` or `1` (allowed by `fo_person_phone_check` when `phone_readable` is false) would match
  every line → KEPT.
* `strpos` on `matches`/`suggestions`, `plat_complaint` without `subject_kind`, and `msg_email.filed_id` without
  `filed_kind` can only count more.
* The conflict service writes `recordId` as the person's lower-case `id::text` (`conflict/service.ts:99`), so the uuid `strpos` matches.

**New Minors**
* **R2-m1. An email containing `"` or `\` escapes the audit match, so the answer can be ERASED.**
  * `eraser.ts`, activity_log: `strpos(lower(detail::text || summary), $3)`. `jsonb::text` writes `quote"me@…` as
    `quote\"me@…`, so the match misses.
  * Both the app's rule (`sales/common.ts:46`, `^[^\s@]+@[^\s@]+\.[^\s@.]+$`) and `fo_person_email_check` accept such an address.
  * Repro r2a: person `quote"me.brk@example.com`, with one line keyed outside the person's rows (entity msg_outbox) holding
    that address and a name → `ERASED — Cleared: person 1.`
  * Low reach: every arrival line is keyed on a lead, which is counted. Matching against `(detail #>> '{}')`-style values,
    or against `to_jsonb($3)::text` trimmed of its quotes, closes it.
* **R2-m2 (latent). Rows that stay on a merged-away record are not counted for the survivor.** FO-9b leaves these on the
  loser (`merge/columns.ts` STAYS):
  * identity checks, conflict checks, retainers, signers, outbox rows, complaints and original consents;
  * a suppression of the loser's old address;
  * and, for a chain C→D→S, C's own log lines and its C→D merge row.

  KEPT_SQL counts only `person_id = S`, and `activity_log`'s `mine` follows one level only. Today this is masked: the
  survivor always has a `fo_dup_merge` row, counted as `not_yet_erasable`, so the answer is KEPT. Once 2b-2 stops counting
  merge rows (or clears them), it becomes a false ERASED. The fix: count over S plus the CTE's `gone` set.
* **R2-m3. The 300-character cut now drops whole groups.** Eleven classes at count 12 give exactly 300 characters, ending
  `…Kept (waiting for another module's eraser): c`. The "not yet erasable" group and the cleared list are lost. A typical
  4-group person is already at 294 (`keptNote`). The outcome is still KEPT and HELD, so this is only the words; shorter
  item words, or labels without the item list when over the limit, would fix it.
* **R2-m4. activity_log reads the firm's whole audit log on every order.** It runs `lower(detail::text || summary)` over
  every `audit_event` row of the firm, inside the order's transaction with the person row held FOR UPDATE.
  * Repro perf: 1,000,000 lines took 8.7 s on this machine. That fits the job's 120 s per-order limit up to about 13M
    lines, and a 501-order run is serial.
  * There is no budget for this in STANDARDS. Recorded so it is not a surprise.
* **Latent, same class as m3:** `plat_import_row` (PF-10a; `record_id`/`record_kind`, and `before_image` on MERGE rows,
  which holds the person's earlier values) is not listed. Nothing writes it yet (PF-10b).
