# Journey test: FO-7g part 3, the Bill-to province (reviewer role, 22 Nov)

Head `8de8403af60f4878ac89b36ee228565ef7ab8a46`. The item is API only (no screen), so there was nothing to walk in a browser. The caller also asked for no database drops while suites ran on :54329. So I **simulated** each journey from the code (`invoices/drafts.ts`, `bill-to.ts`, the migration) and the PR's own check (`tests/check_fo7g3_bill_to.ts`, 20/0 by the builder, which I did not re-run). I started no isolated copy and never used :4400.

## Journeys (persona: a biller at an Ontario firm; an RCIC Owner holds `agent/invoice:edit`)
1. **Main:** start a draft for a client with no address. Bill-to is ON (the firm's province). A fee line takes 13 %. Code `drafts.ts:68-72`, check B5.
2. **Alternate:** the client is in New Brunswick. Set Bill-to to NB, add a fee: 15 %. Code `:130-145`, `:104`, check B1.
3. **Change midway:** one line at ON, then switch to AB. Line 1 keeps 13 %, line 2 takes 5 %. One audit line records ON to AB. Check B2.
4. **Error:** send "Ontario", "on", "XX", 13, null or an extra field. Each gets 422 at `province` with "Choose one of the 13 provinces and territories (a two-letter code such as ON)", and nothing changes. Check B4.
5. **Wrong role:** a Case Officer drafts but cannot change Bill-to: 403. Check "keys fail".
6. **Wrong firm:** another firm's invoice gives 404; a malformed id gives 404. Check B6.
7. **After issue:** 409 "This invoice is issued (INV-…): its Bill-to province is fixed. Nothing was saved." The database gate refuses the same write made around the route. Check B3.
8. **Recovery and double submit:** the same value again writes nothing and no second audit line. A line and an edit sent together run one after the other (both take the row lock).
9. **Across the boundary:** the issued invoice keeps its Bill-to (the gate passes the issue update itself). The invoice screen (FO-7s1) will read `billToProvince` from InvoiceView.

## Findings (from review.md; all Minor)
* The refusal at `drafts.ts:108` still says "comes from your firm's province" when the rate is the Bill-to's.
* A draft from before this part, or of a firm with no province, issues with a null Bill-to, which is then frozen as null.
* B3 issues by raw SQL, not through the issue route.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1-3: the stored value drives each new line's rate (B1, B2, B5) |
| Next step obvious | 1 | the 422 names the expected form ("such as ON"); the 409 says the value is fixed |
| Plain words | ½ | `drafts.ts:108` names the wrong source (Minor 1) |
| Feedback and state | 1 | the full InvoiceView comes back with `billToProvince`; one audit line with before and after |
| Correct data | ½ | CHECK, gate, lock and no-op are right; null can be frozen at issue (Minor 2) |
| Error recovery | 1 | 422 / 403 / 404 / 409 each write nothing ("Nothing was saved.") |
| Accessibility and screen sizes | ½ | not applicable: no screen |
| Speed | ½ | not measured (no run) |
| Visual quality | ½ | not applicable: no screen |
| Trust and sources | 1 | cited table only; P-797 and Memorandum 3-3-6 cited in the migration and code; "Unconfirmed: no accountant" |

**8/10, pass** (no criterion at 0). The two fixes that would raise the score most: the words at `drafts.ts:108` (plain words), then filling a null Bill-to at issue (correct data).

Not tested: a real browser or screen reader (there is no screen), timings, live HTTP, and an intended user's unaided walk (D17/D20 stay with the founder).
