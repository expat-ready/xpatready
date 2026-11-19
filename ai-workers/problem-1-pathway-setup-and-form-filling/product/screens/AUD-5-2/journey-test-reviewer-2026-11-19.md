# AUD-5 part 2: journey test (reviewer role, 19 Nov 2026)

**Commit:** `94d27d3cae4d05badcf63038a8fd572cbd1e1aa7`.

**Scope:** API only (no screen, no route).
* The "person" in each journey is a deleter's code acting for a staff member: the case officer, or the Owner as approver. The words they get back are what a person would read.
* The visible-browser walk, axe and the screen widths do not apply.
* Everything ran on a clean copy of the commit, against Postgres 127.0.0.1:54329, never :4400.

## Journeys (main path first)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | Case officer, firm setting 6: "delete this file closed 2 years ago" | `checkFor` → WARN → give a reason → delete → audit | WARN with words; the delete goes ahead with the reason on its one audit line | Held (test DW7 pass: trimmed reason on the line) |
| J2 | Same, a file closed 8 years ago | `checkFor` | OK, no reason needed | Held |
| J3 | Empty: a firm with no setting | `check` closed file | OK (no default number) | Held (DW8) |
| J4 | Error: no reason, `""`, spaces, U+200B, Hangul filler | WARN delete | Refused in words, nothing deleted, no audit line | Held. **But** `"ok\u0000"` and `"ok\uD800"` are accepted, and the deleter's audit write would then fail with an error, not words |
| J5 | Held file (FIRM or CASE hold, two holds) | `check` | HELD with every reason, before floor or reminder | Held (DW9, DW10) |
| J5b | Held by a CATEGORY `case_documents` hold, a DATE_RANGE over the record's own date, or a PERSON hold on the file's client | `check` closed file / invoice | HELD | **Failed:** OK, FLOOR then OK, and WARN respectively (review Majors 1 and 3) |
| J6 | Wrong firm: a body naming firm B; firm B's hold on the same case id | `checkFor` as firm A | Refused; B's hold ignored | Held ("never names one"; WARN for A) |
| J7 | Recovery: the Owner saves 10 years while the delete transaction is open | `check`, save, `check` | Each read sees the committed value, inside the same transaction | Held (6 → OK, 10 → WARN) |
| J8 | Bad input: class `trust_ledger` / `__proto__`, the College row, a closed file named as RECORD, a string date | `check` | Refused in words, never OK | Held. The string-date words carry zod's text (Minor 4) |
| J9 | Boundary: PF-21d erasure of Client A, who is on hold | `check` closed file as CASE (PERSON refused) | HELD | **Failed:** WARN. The input cannot name the person |

## Data underneath
* After J1, the store lost exactly one file and the audit has exactly one line, with `verdict: WARN` and the trimmed reason.
* After J4 and the firm-B body, the store is unchanged and the audit has no line.
* The real adapter reads `platform_firm_setting` through the deleter's Prisma transaction and opens none of its own.

## Break it (15 minutes)
* Tried, and held:
  * Far-future and leap-day dates: 29 Feb 2020 + 6 years = 1 Mar 2026.
  * Unknown and prototype-named classes.
  * Extra keys in the body.
  * Another firm's hold.
  * A setting changed mid-transaction.
  * A 501-character reason.
  * A Japanese reason.
* **Minor:** NUL and lone-surrogate reasons are accepted.
* **Major:** the category, date and person holds are missed (J5b, J9).
* **Not tested:** the real hold adapter's advisory lock. It is not built; the test's bridge opens its own fake transaction.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1-J3 and J5-J8 complete; J5b and J9 answer non-HELD for held data |
| Next step obvious | 1 | WARN words: "Give a reason to delete it now; the reason is recorded." FLOOR and HELD give the date or the reasons |
| Plain words | ½ | Plain sentences, but zod's text leaks into INVALID_INPUT (`keep-period.ts:144`) and dates are ISO |
| Feedback and state | 1 | Four typed verdicts; refusals carry a code and words |
| Correct data | ½ | Audit line and nothing-deleted are exact; held records can get OK or WARN |
| Error recovery | 1 | Refused deletes roll back whole; an unwired port refuses (`KeepCheckNotBuilt`) |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | One hold read and at most one setting read per check; the 38-check suite runs in seconds |
| Visual quality | N/A | No screen |
| Trust and sources | ½ | HELD shows the reason, who and when; the billing FLOOR drops "Unconfirmed: no counsel" |

**Score: 7.5/10.** That is 6 of the 8 criteria that apply, scaled to 10; the two N/A criteria are left out, not counted as 1.

**Verdict: Fail** (below 8). No criterion is at 0.

**Fixes that raise it, most valuable first:**
1. Map every case-side category for a closed client file, and test each subject kind per class (correct data, task completed).
2. A ruling from the tech lead, or wider input, for the record date and the person (J5b, J9).
3. One reason rule shared with part 1 (correct data).
4. Plain refusal words and "Unconfirmed: no counsel" on the billing floor (plain words, trust).

**Could not test:** a real screen reader and an intended user's unaided walk (D17 and D20 stay with the founder); the real LegalHoldPort lock.
