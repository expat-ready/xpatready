# qa capability R1.33 Phone numbers: re-score after FO-9b (20 Nov 2026, ~03:3x IST)

**Verdict: Works** on main d07a08fbc. R1.33's last part, FO-9b #2405 (one exact phone normaliser at every arrival door; ruling P-747), merged at bc51aac90. Since then main has changed messages code, two lines of `lead-page.tsx` (MessagesPanel) and qa tests; no phone code. Mode `/qa capability R1.33`, Opus 5.5 at high effort, P-608. Isolated copies :4471 and :4472 only; never :4400. Live AI off, US$0, no priced button.

Bugs: 0 Blocker · 0 Critical · 0 Major open on R1.33 · 3 new Minor (QA-540, QA-541, QA-542; QA-542 since closed as decided: Sample, Lead 2, ruling P-760). **Closed:** QA-526 (Major) and QA-528. **Answered:** QA-527, by P-747.

## The Done when, read under P-747
The row says: "Stored as E.164 with country; an impossible number refused on the field; two spellings of one number match as duplicates". P-747 limits the refusal to the staff edit route. At every arrival door an impossible number is kept as typed and flagged "Fix number" (AG-2-84 rule 5).

| Clause | By screens (J-33 on GitHub) | Underneath |
|---|---|---|
| Stored as E.164 with country (the calling code) | W3: "+1 416 555 0100" saved and shown +14165550100; W5: +442079460958 on screen | W3 SQL `+14165550100\|true\|+14165550100`; probe A1, A2, W1, B1, E2; builder D1-D5 |
| Impossible number refused on the field (edit route); kept and flagged at arrival doors | W2: "12" refused with the field's sentence, field invalid, axe clean, nothing saved; W1: "12" kept with Fix number on the web form | probe E1 (422), A3-A6, W2, B2 (201, unreadable) |
| Two spellings match as duplicates | W5: web form "+44 (0)20 7946 0958" and booking "0044 20 7946 0958" under two emails; the booking's lead shows "Possible match" | probe A7: a second spelling at Add a lead gets 409 KNOWN_PERSON naming the first person; builder D6 |

## Runs
* **Pack on GitHub's runners, main d07a08fbc:** walks.yml with journeys=j_33, dispatched by qa. Run [44666100413](https://github.com/expat-ready/xpatready/actions/runs/44666100413), job 136055885546: 19/19 (`walk-j33-job136055885546.txt`).
* **Independent re-run:** run [44666113220](https://github.com/expat-ready/xpatready/actions/runs/44666113220), job 136055899809: 19/19 (`walk-j33-job136055899809.txt`). Both runs' self-test fixtures failed on purpose, as designed.
* **Automatic item-proof** on bc51aac90 (run 44654575202): `prove` was skipped, because #2405 has no Completes line. So the walks above are the pack.
* **CI:** merge batch [44650353018](https://github.com/expat-ready/xpatready/actions/runs/44650353018) (head 2d83d243f; its studio tree 2824ac67e equals bc51aac90's). All 29 jobs green (`ci-44650353018-jobs.txt`). Phone suites (`ci-44650353018-suites-r133.txt`):

| Suite | Result |
|---|---|
| check_fo9b_phone_doors | 26/26 |
| check_fo9b_port | 20/20 |
| check_fo9a_phone_edit | 36/36 |
| check_fo9a_duplicates | 53/53 |
| check_fo2_leads_prospects | 113/113 |
| check_fo1p_person_port | 35/35 |

## qa's own tests (headless Playwright and HTTP)
* **Door probe**, `tests/qa/check_r133_phone_doors_http.ts` (`door-probe-http.txt`): 17/18 passed, twice. It goes through the running API, not the services, with inputs the builder's check does not use:
  * a trunk 0 on the web form: "+44 (0) 161 496 0000";
  * "011" international dialling at booking;
  * Arabic-Indic digits, read as +14165550199;
  * an extension, kept unreadable;
  * "(000) 555-0100", kept unreadable;
  * "555-0101" at booking, booked and kept unreadable.

  The one FAIL is E3, now QA-540.
* **Gate A**, `tests/qa/check_r133_gate_a_engage.ts` (`gate-a-engage.txt`, `shots/`): 6/6 at 1440, 1024 and 400, twice each.
  * Route, by screens: web form → lead (E.164 shown, no Fix number) → Engage → Engage as Individual → prospect (Engaged) → "From lead" → the lead still shows the E.164 number.
  * The same for a "12" lead fixed by Fix number to "(416) 555-0100" → +14165550100.
  * Underneath, each engaged person holds the readable number.
  * Weakness (the reader's point): Engage does not read the phone, and the prospect page shows no contact details by design. The gate shows the number survives the next step, not that the step uses it. The first step that uses a phone is the retainer merge, where QA-541 lives.
* **Not done:** a headed walk (this cloud container has no display; only headless). The read-only main path on the shared demo (:4400), barred by this task's rules. Coverage (c8) and the graph refresh were not rerun for this single-row re-score.

## Fresh reader (P-339, P-348c)
A fresh Opus reader read the code, the journey and these files, and ran nothing: **WORKS** (`reader-verdict.md`). It confirmed every door now calls `phoneE164Exact`, and that nothing imports the loose `phoneE164` any more. Its new Minor points:
* N1: Fix number does not re-run the match → QA-540.
* N2: the retainer merge takes an unreadable phone → QA-541; qa checked `retainers/service.ts:321`.
* N3: no re-read of phones stored before FO-9b → QA-542; qa found no migration.
* N4: E.164 is shown to staff unformatted → a suggestion below.
* N5: gate A's header claimed more than the check does → fixed in the header.

## Questions for the Lead
* Answered by Lead 2 (series 3), 20 Nov: QA-542 is decided Sample (ruling P-760): no customer data exists before launch, and copies are rebuilt from seed. Closed in `BUGS-CLOSED.md`.
* P-747 is quoted only in `screens/FO-9b/review.md` and `qa/built/R1.33.md`; there is no row for it in `DECISIONS.md` or `RULES.md` on main d07a08fbc. QA-527's closure points to it, so the ruling needs a row. Answered: P-747 is now a row in `DECISIONS.md` on main (Lead 2, series 3).

## Records hygiene (reviewer's Changes requested on f0262a690)
The first capture of `door-probe-http.txt` (commit 007ef8c7a) held a local stand-in session token, cut off at 260 characters: the JWT header and most of its payload, with no signature. It came from the throwaway isolated copy :4471, which no longer exists. The token is now redacted in the file, and the check prints only the status and whether a token came back (`check_r133_phone_doors_http.ts:47`). The copy in history stays, because rewriting history is barred (AGENTS.md rule 1).

## Suggestions
* Re-run the possible-match check after a staff phone edit (QA-540). *Needed for the proof*: no. *Capability*.
* Show stored E.164 numbers formatted for people ("+44 20 7946 0958"), keeping E.164 underneath. *Later*. *Capability*.
* Give #2405-style PRs a "Completes: R1.nn" line, so item-proof runs the pack by itself. *Later*. *Scaffolding*.

## Files
| File | What it is |
|---|---|
| walk-j33-job136055885546.txt, walk-j33-job136055899809.txt | the two GitHub walks' PASS/FAIL lines |
| ci-44650353018-jobs.txt, ci-44650353018-suites-r133.txt | the merge batch's jobs, and its phone suite lines |
| door-probe-http.txt | qa's HTTP probe output |
| gate-a-engage.txt, shots/ | the gate A walk, and its screenshots at 3 widths |
| reader-verdict.md | the fresh Opus reader's verdict |
