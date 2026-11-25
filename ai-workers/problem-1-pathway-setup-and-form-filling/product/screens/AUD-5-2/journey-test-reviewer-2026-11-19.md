# AUD-5 part 2: journey test (reviewer role, 19 Nov 2026)

**Commit:** re-run on `7a715130b9ba4ad62f9a3f1bb6446239add0c23b`. The first run was on `94d27d3` (7.5/10, Fail; in git history).

**Scope:** API only (no screen, no route).
* The "person" is a deleter's code acting for a case officer or the Owner. The words returned are what a person would read.
* The visible-browser walk, axe and screen widths do not apply.
* Run on a clean `git archive` copy against Postgres 127.0.0.1:54329, never :4400.

## Journeys (main path first)
| # | Persona · goal | Expected | Result on 7a71513 |
|---|---|---|---|
| J1 | Case officer, setting 6: delete a file closed 2 years ago | WARN; the delete goes ahead only with a reason; the reason is on its one audit line | Held (DW7) |
| J2 | Same, closed 8 years ago | OK, no reason | Held |
| J3 | Empty: a firm with no setting | OK, no default number | Held (DW8) |
| J4 | Error: no reason, `""`, spaces, U+200B, Hangul fillers, NUL, lone surrogate, RLO, BEL | Refused in words, nothing deleted | Held (all refused; German plus Chinese on two lines is kept) |
| J5 | Held by FIRM, CASE, PERSON, any of the five categories, a DATE_RANGE over the record's own date | HELD with every reason | Held (contract "review M2"; firmOnly adapter fails) |
| J6 | Wrong firm: a body naming firm B; B's hold on the same id | Refused; B's hold ignored | Held |
| J7 | Recovery: setting saved mid-transaction; the deleter's own uncommitted save | Read through the deleter's transaction | Held (6 → OK, 10 → WARN; uncommitted 10 → WARN) |
| J8 | Bad input: unknown class, College row, caseless file, string or far dates, root client | Refused in words | Held (plain words, no zod text) |
| J9 | Boundary: PF-21d erasure of Client A's file, A on hold | HELD | Held (subject `[CASE, PERSON]`) |
| J10 | Boundary: a whole file (Jan–Aug 2019) with a Mar–Apr 2019 hold, sent as opened and closed dates only | HELD | **OK**: only each record's own date catches it (review Minor B) |

## Data underneath
* After J1, exactly one file is gone and there is one audit line with `verdict: WARN` and the trimmed reason.
* After J4, J6 and J8, nothing is deleted and nothing is written.
* The setting is read through the deleter's Prisma transaction. The mutation that reads it through `this.db` fails the behaviour check.

## Break it
* Tried, and held:
  * 50 subjects plus 50 dates (107 hold subjects, under the port's 200 limit).
  * Empty subject list.
  * String dates.
  * Year 1850 and year 275760 dates.
  * NaN date.
  * Root client.
  * Prototype-named class.
* Minor: J10's interval case (comment guidance), and two rules with no failing case (closed file needs its CASE; "Unconfirmed" in the FLOOR words).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J9 complete as expected |
| Next step obvious | 1 | "Give a reason to delete it now; the reason is recorded." HELD and FLOOR give the reasons or the date |
| Plain words | 1 | No zod text; dates say "(UTC)" |
| Feedback and state | 1 | Four typed verdicts; refusals carry a code and words |
| Correct data | ½ | Exact audit line and no stray writes; J10 still answers OK when the caller sends only the file's end dates |
| Error recovery | 1 | Refusals roll back whole; an unwired port refuses |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | One hold read, at most one setting read |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | HELD shows reason, who and when; FLOOR carries "Unconfirmed: no counsel" |

**Score: 9.4/10.** That is 7.5 of the 8 criteria that apply, scaled to 10; the two N/A criteria are left out.

**Verdict: Pass.** No criterion is at 0.

**Fix that would raise it:** the `recordDates` comment should say every dated record removed, and the interval question goes to the tech lead.

**Could not test:** a real screen reader and an intended user's unaided walk (D17 and D20 stay with the founder); the real LegalHoldPort lock (not built).
