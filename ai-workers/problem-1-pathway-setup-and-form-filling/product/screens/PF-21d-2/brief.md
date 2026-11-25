# PF-21d part 2 — the real erasers (R1.85): brief, carried lines and questions

Row: PF-21d (BACKLOG). Requirements: SA-11-16, SA-11-18, SA-11-28, SA-11-40 (read through `trace-requirements.py --brief PF-21d`).
Stands on: part 1a (#3234, on main: the switch, ErasurePort and its registry) and part 1b (#3235: approve, cancel, the daily
job; not on main yet). Part 2's code starts from main once #3235 has merged. This brief is the plan, written first (P-606).

## What part 2 does
Registers the first real erasers, so an approved, window-elapsed deletion actually removes one person record's data in
one firm (SA-11-40 rule 3). Today no module registers one, so the job records SKIPPED and erases nothing.

* **Front office** (`front-office`): `fo_person` is anonymised in place, because its foreign keys are `ON DELETE RESTRICT`
  and money rows point at it. Then the person's free text in leads, prospects, calls, notes, bookings, consult records and
  queued messages is cleared.
* **Platform** (`platform`): our own records that name the person in that firm (complaints about them).
* **Kept, and said so (SA-11-16 (c), SA-11-28):** money rows (AUD-5's `client_financial` floor, 7 years) and the activity log
  (`activity_log` floor). These answer KEPT with the class, so the request ends HELD / partial and never a false COMPLETED.

The inventory is `api/src/front-office/duplicates/merge/columns.ts`. `check_fo9b_merge` fails on any person column it leaves
out, so the eraser classifies the same list. The first map was made on main at `16b5e4da9`.

## Carried from part 1b (must close here; Lead 4, #3235 comment 7095583893; round 7, comment 7129166598)
1. **Cancel after the day while the "Data erasure" switch is off** (the emergency stop), with its failing-first test.
   Lead 4: part 2 does not merge without it.
2. The claim rule's brackets in `plat_data_request_erase_on_set` (AND binds before OR).
3. The rows file names `erasing_since` and the guard trigger.
4. A claim that is still held counts as skipped, not silent.
5. **A per-module "already erased" mark**: the register must not understate what was erased (also R7-2).
6. A legal hold wins in the crash, 30-minute gap and cancel edge, with its test.
7. Follow `merged_into_id` for a request on a merged person (#3189 r4-m2).
8. Round 7's Minors:
   * **R7-1:** carry the "may have erased" state onto the request, as a flag that blocks cancel and drives the words.
   * **R7-3:** name the module in a retake's own eraser failure, and say "may".
   * **R7-4:** a test for the retake's gone path; `.slice(0, 2000)` must not cut "Nothing more was erased."

## Rulings (Lead 3, 25 Nov 05:2x IST, #3583 comment 7147590364): all five recommendations agreed
* **Q1:** the narrow database exception, exactly as recommended below. The reviewer and the breaker read it as a permissions
  and schema change, and the Lead reads the migration (P-423).
* **Q2:** KEPT under a Sample class name, "Unconfirmed: no counsel", no period invented. The classes and periods (or a source)
  go to the founder as one question. **Founder, 25 Nov (#3583 comment 7150714913, "Sample for now"):** consent proof, signing
  and retainer evidence, identity checks and conflict checks are KEPT under a Sample class, "Unconfirmed: no counsel", with no
  period invented. The request names what was kept; real periods or a source come later. 2b and 2c build on this. The Lead
  records it as a DECISIONS row.
* **Q3:** `msg_suppression.address` is KEPT as "do not contact" (Sample).
* **Q4:** 2a, 2b and 2c, each under 800 lines. No eraser is registered until 2a has merged, with cancel-while-off.
* **Q5:** the follow-up row is **PF-21d-f1**, items (a)-(d). The Lead shapes it into BACKLOG; it does not block 2a.

## Questions for the tech lead (each with my recommendation)
**Q1. Tables that refuse UPDATE in the database but hold the person's own text.**
* The tables:
  * `fo_note.text`, insert-only;
  * `fo_lead_attribution` (`utm_*`, `referrer_url`, `landing_page`), insert-only;
  * `fo_dup_merge.loser_snapshot` and `survivor_before`, the person's old names, email and phone, write-protected;
  * `msg_event.detail`, insert-only.
* Leaving them makes "erased" false.
* **Recommend:** a narrow database exception, as the merge's `fo_dup.merging` flag does. The exception:
  * a transaction setting `pf21d.erasing = '<request id>'`, set only by a definer;
  * that definer checks the request is claimed and names that firm and person;
  * it lets only the named columns be blanked, for rows of that one person.
* `audit_event` stays untouched: it is the `activity_log` floor, and its rows answer KEPT.

**Q2. Evidence with no AUD-5 class.** Consent proof (`msg_consent`, `msg_consent_withdrawal`), signing evidence (`fo_signer`,
`fo_signing_*`, `fo_retainer*`), identity checks (`fo_identity_check`, a file in FilesPort) and conflict checks have no keep
class.
* **Recommend:** KEPT, with a class name labelled **Sample** and "Unconfirmed: no counsel" (AGENTS rule 4). Do not invent a
  period.
* The founder is asked for the classes and periods, or for a source. Until then, the request ends HELD / partial and says
  what was kept.

**Q3. The suppression list** (`msg_suppression.address`). Clearing it would let the address be mailed again.
* **Recommend:** KEPT ("do not contact", Sample class), the same as Q2.

**Q4. Size (P-610).** The carried lines, two erasers, one migration and their tests will pass 800 lines.
* **Recommend three PRs, each under 800:**
  * **2a:** the carried lines 1-8, with the migration for the mark, the "may have erased" flag and the brackets;
  * **2b:** the front-office eraser and Q1's exception;
  * **2c:** the platform eraser and the KEPT classes.
* 2b and 2c register erasers. Lead 4's rule holds: no eraser is registered before 2a, with item 1, has merged.

**Q5. The follow-up row from #3234's round,** for you to shape:
* the switch-key rule goes by the parameter's name (one shared constant, tied to the route);
* the switch route's `@SystemReason` has no body schema, so `{}` gets a 422 naming only `reason`;
* `check_pf28_system_reason`'s route list leaves out the switch route.

## Done when (part 2 as a whole; each with its test in `tests/check_pf21d_erasers.ts` and `check_pf21d_erasure.ts`)
* An approved deletion on its day leaves no name, email, phone or free text of that person in that firm's front-office
  tables, except rows answered KEPT with their class.
* Another person, the same person in another firm, and a family member stay untouched (SA-11-40 rules 2-3).
* Money rows are kept, and the request ends HELD / partial and says so (SA-11-28).
* A legal hold on the person stops every eraser (SA-11-18).
* A second run never answers ERASED.
* Every eraser passes `eraserCases` (ErasurePort's contract).
* The carried lines 1-8 pass, each with a failing-first test.

## Not here
* The outcome email (SA-11-28): part 3, through MailPort.
* The console pages: PF-21rs (the R1.86 lane).
* The case side's eraser: CS-X2.
