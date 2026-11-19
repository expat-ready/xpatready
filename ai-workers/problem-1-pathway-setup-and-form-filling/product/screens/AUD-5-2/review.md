# AUD-5 part 2 — independent review (Opus, P-303)

**Re-review (P-277), diff only:** `94d27d3..7a715130b9ba4ad62f9a3f1bb6446239add0c23b` on `claude/happy-lovelace-p1mlh5`. That is d262a57 (breaker fixes), f20fc69 (break report) and 7a71513 (review fixes). Spec: brief `build-lead-c-briefs/AUD-5-2.md` and "Part 2 (AUD-5b)" of `design/briefs/AUD-5.md`. API only, no screen. 19 Nov 2026.

**Verdict: Ship (Approve 7a71513).** None of my first review's Blockers or Majors is still open. The Minors below are notes for the PR body or a follow-up.

The first review (on `94d27d3`, Block: 3 Major, 5 Minor) is in git history. 7a71513 committed it with the journey report. This file replaces it and is not committed by me.

## What I ran (clean `git archive 7a71513` copy; Postgres 127.0.0.1:54329; never :4400)
* `check_aud5_check.ts` 52/0 · `check_aud5_keep_periods.ts` (part 1, unchanged) 57/0 · `check_pf21b_port.ts` 32/0 · `check_pf0p_ports.ts` 120/0 · `check_case_feed.ts` 39/39 · `tools/check-port-contracts.mjs` exit 0.
* **Mutation pass.** I removed one rule at a time and re-ran `check_aud5_check.ts`. The number is how many checks failed; caught means a check failed, not caught means all 52 still passed.

| Rule removed | Result |
|---|---|
| `recordDates` dropped from the date subjects | caught, 9 |
| one category instead of all five | caught, 9 |
| PERSON subject dropped | caught, 7 |
| only the first named subject asked | caught, 9 |
| `recordDates` made optional | caught, 8 |
| setting read through `this.db` instead of `tx` | caught, 1: the new behavioural m2 test, not only the regex |
| root-client guard | caught, 1 |
| bidi-override refusal | caught, 1 |
| 1900–9999 date bound | caught, 1 |
| "closed client file needs its CASE" | **not caught** |
| "Unconfirmed: no counsel" in FLOOR words | **not caught** |

* **Break probes on the fake (results):**
  * A string in `recordDates` is refused in words.
  * An empty subject list is refused in words.
  * 50 subjects plus 50 dates still go to `isHeld` (107 subjects, under its 200 limit).
  * A closed file named by PERSON only is refused (`NO_HOLD_CHECK`).
  * A Hangul filler, NUL, a lone surrogate, RLO and BEL are refused in words. Emoji with ZWJ and German with Chinese on two lines are kept, NFC-normalised.

## First-review findings: status
| First review | Fix | Status |
|---|---|---|
| Major 1: a category hold on part of a file | `keep-period.ts`: `closed_client_file` asks every `LEGAL_HOLD_CATEGORY` line | Closed (contract "break M2, M3"; mutation B caught) |
| Major 2: the subject map untested beyond CASE | Contract "review M2": for each class, each scope it maps to is placed alone (CASE, PERSON, five categories, DATE_RANGE) and expects HELD; holds on another case, person or year expect OK; broken `firmOnly` adapter | Closed (mutations A–D caught) |
| Major 3: the record's own date, case and person | `recordDates` (at least one, required at run time) adds DATE subjects; `subject` may be a list; the closed file takes PERSON beside its required CASE | Closed for the per-record deleters (PF-21d, FO deletes, CS-X3, CS-D6). ALL_FIRM_DATA for PF-11c's purge stays open; the builder raises it with the tech lead in the PR. Accepted: the purge is not a per-class delete, and PF-21b's `isHeld` takes ALL_FIRM_DATA directly |
| Minor 1: the WARN reason's characters | Same rule as part 1, plus bidi overrides, NFC | Closed |
| Minor 2: the setting read proven only by source text | Writes the setting uncommitted inside the deleter's own transaction and expects WARN | Closed (mutation F now fails a behaviour check) |
| Minor 3: `checkFor` said "a body" | Comment: the ask is built from the STORED record, never a request body | Closed |
| Minor 4: words | No zod text; FLOOR carries "(Unconfirmed: no counsel)"; dates say "(UTC)" | Closed (the "Unconfirmed" part has no test, see Minor A) |
| Minor 5: the Hangul-filler strip | DW7's list has U+3164 and U+115F U+1160 | Closed |
| Breaker extras: far date, root client | 1900–9999 bound; `check()` refuses the root client | Closed, each with a failing case |

## Still open (Minor, none blocking)
**A. Two new rules have no failing case.**
* "A closed client file must name its CASE" (`ports/keep-period.ts`, the second `NO_HOLD_CHECK` line in `subjectsFor`). Scenario: remove it, and `{class: closed_client_file, subject: PERSON p}` is checked on the person only. A CASE hold or a category hold on the file is then missed, and 52/52 still pass. The probe shows the refusal works today.
* "(Unconfirmed: no counsel)" in the billing FLOOR words (the `decide` FLOOR line). Remove it and the suite stays green.
* Fix: one check each.

**B. A date-range hold strictly inside a file's life is missed if the caller sends only the opened and closed dates.**
* The `KeepCheckInput` comment says `recordDates` is "a file's opened and closed dates".
* Scenario: a file opened 10 Jan 2019 and closed 1 Aug 2019, with a hold over Mar–Apr 2019. With `recordDates: [opened, closed]` the answer is **OK**.
* PF-21b's DATE subject is a point, so only the dates of each record in the file catch it (at most 50 per call; more calls in the same transaction for larger files).
* Fix:
  * Make the comment say every dated record the delete removes.
  * Put the "intersects" (interval) question next to the ALL_FIRM_DATA question for the tech lead.

**C. The TypeScript type still makes `recordDates` optional** (`export type KeepCheckInput`, so part 1's test compiles). A later caller that leaves it out compiles, then is refused at run time. That is safe (refused, never OK), but the first time they find out is in a test. The PR body should say so.

**D. A comment now says the wrong thing.** `HoldSubjectOut`'s comment says it is "imported by shape, so this file stays zod-only", but the file now imports `LEGAL_HOLD_CATEGORY` from `./legal-hold.ts`. That import is allowed (a ports file); the comment is wrong.

**E. Kept from the first review:**
* The real-adapter run uses the bridge's own fake transaction, so the real advisory lock is untested until PF-21b part 2. That part must run `keepPeriodCheckContract` against its real adapter.
* The PR body must carry `Card unchanged: P-712 …` for the `module-cards` check.

## Builder choices (first review, unchanged)
These were all accepted:
1. The optional `KEEP_CHECK_HOLDS` token, refusing when nothing is wired.
2. Part 1's test left unchanged.
3. The string subject allowed by the type, refused at run time (now also `recordDates`, see C).
4. The subject map is now fully tested.
5. No MODULE.md line, under P-712.

## D1–D20 (API only; screen dimensions N/A)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | BR-7 order, every reason, firm wall, refusals in words, and every hold scope is asked. The purge's ALL_FIRM_DATA and interval dates are open with the tech lead (B) |
| D2 Data integrity | 4 | Refused deletes delete nothing; held records are HELD for each mapped scope; root client refused |
| D3 Reuse | 5 | One reason rule shape with part 1; `answer()`, `readSetting` and the table reused |
| D4 Rule integrity | 4 | Unknown, REFERENCE, wrong-kind and caseless file refused; one refusal untested (A) |
| D5 Stability | 5 | One transaction, rolls back; bad text refused in words, never a failed write |
| D6 Governance | 4 | The WARN reason on the delete's one audit line |
| D7, D8–D14, D19 | N/A | No AI, no screen, no caller yet. Words: plain, UTC labelled |
| D15 Speed | 5 | One hold read, at most one setting read |
| D16 Testability | 4 | DW6–DW11 and the subject map each pass and fail; two small gaps (A) |
| D17, D20 | Simulated only | No intended user walked it |
| D18 Provenance | 5 | HELD carries reason, placedBy, placedAt; FLOOR carries row words and "Unconfirmed: no counsel" |

**BIC-01–BIC-20:** N/A (no case-side screen).
**Graph:** not run. It rewrites `qa/GRAPH.md`, and there is no page or route.
**Journey score (reviewer, the one score for this check): 9.4/10, Pass.** See `journey-test-reviewer-2026-11-19.md`.
**Could not check:** the real LegalHoldPort lock (not built), the PR body, full `ci`.

**Verdict: Approve 7a715130b9ba4ad62f9a3f1bb6446239add0c23b**
