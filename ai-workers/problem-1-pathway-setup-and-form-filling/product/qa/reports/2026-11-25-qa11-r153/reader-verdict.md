# R1.53: the fresh reader's verdict (qa 11, 25 Nov 2026, ~05:2x IST)

A fresh Opus reader read main b35093f8f and the four fix PRs. It only read; it ran nothing and changed nothing.

**Reader: Works (conditional on walks j_53 green on main's head)**

**Confidence: medium-high.** The reader could not open GitHub Actions, so it took qa 11's runs as stated. They were on 525a2c358, which is an ancestor of b35093f8f. Between those two commits only `tests/journeys/j_58.ts` changed.

## The fixes, each merged and judged against its bug
* **QA-778, #3532 (ae105b1bd).** Check and send now saves the typed fees as the next version and opens the Send panel on that version. A refused save opens nothing.
* **QA-780, #3541 (779ca7679).** The draft has a Template choice, the PATCH carries `templateId`, and the refusal offers a way to do what it says.
* **QA-779 (a), #3556 (16b5e4da9).** `PATCH /people/:id` takes `{email}` with FO-2's rule, a lock, a 409 when the edit is stale, and an audit line. The prospect page lets staff add the email.
* **QA-779 (b), #3587 (d717a6ffd).** The draft reads the record's email when the signer blocker shows. Save becomes pressable, and the server rebuilds the values from the person (`retainers/service.ts:388`).

## The checks
* **check_s17 can fail, and did.** It gave 4 FAIL on 24c453a2c and 7/8 on 278256502.
  * The checks are weak: they only test that a control exists. M4 (a) is at `:127`, M4 (b) at `:137` and M5 at `:155`; M1 at `:107-108` passes on any one of three conditions.
  * The fixes' own browser cases cover the full paths.
* **j_53 walks every clause by screens:**
  * W0, the template;
  * W2, Prepare, v1 and the 26 items, which never block (DW1);
  * W3, the fee, v2 and Send, with the download hash checked (DW2);
  * W4, Edit after Send: v3 is made, v2 is kept and ended as replaced;
  * W5, the card.
* **"A sent version cannot change"** rests on the database trigger. j_53 shows only that v2 survives the edit.
* **The Works evidence from 21 Nov** is solid: item-proof 44912439721 and walks 44912442984 gave j_53 21/21 each, and fo5 gave 248/248.

## Open findings
* No Major or Critical is open for R1.53.
* QA-770 is open, but it belongs to R1.55: the signing link is outside this row.

## Minors
* BUGS.md still showed QA-779 (b) as open. qa 11 closes it in this records PR.
* check_s17's checks only test that a control exists (see above).
* j_53 never tries to change a sent version through the screens.

## qa 11's answers, on main b35093f8f (isolated copies, live AI off, US$0)
| Check | Result | What it covers |
|---|---|---|
| `check_fo5_retainers` | 248/248, exit 0 | the database trigger that refuses any change to a sent version |
| `check_fo5s_retainer_screens_browser` | 66/66, exit 0 | the fixes' full browser paths |
