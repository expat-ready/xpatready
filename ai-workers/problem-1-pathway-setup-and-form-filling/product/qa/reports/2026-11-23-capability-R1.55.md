# qa capability R1.55 (withdraw, re-issue, decline, signed offline): 23 Nov

**Run:** qa Track B 3, asked by Lead 10 (10:5x IST). Main 8f487df4b. j_55 was run twice, each time on an isolated copy (`PLATFORM_IDENTITY=local`, port 4455, never :4400). Live AI off, US$0.

**Verdict: Partial, no verdict (P-606).** Checklist row 55 lists FO-6 and FO-5s. FO-5s parts 1-2 have merged (#2802, #2826). Its later part has not, and FO-6 has not either (part 3 is open as #3065).

## j_55: 27/34, both runs, the same steps
**Passes:**
* Setup by screens (J-53's end: a Sent retainer, version 2).
* Withdraw with a reason: kept, version ended, one audit line. A blank reason is refused (422 on the field); a stale version gets 409; a second withdraw gets 409.
* The withdrawn page tells the user to prepare a new retainer.
* Re-issue: a new retainer by screens after the withdraw. From Declined, Edit and resend makes version 3 in Draft, which is then sent.
* Signed offline:
  * Refusals: no file is refused on the file field ("Upload the signed PDF."); a file that is not a PDF is refused, and so is a missing reason.
  * With the PDF and a reason, the retainer becomes SIGNED_OFFLINE with the file's sha256 kept. The prospect is Won once, with one prospect.won line and its event.
  * A second record gets 409, and so does a withdraw afterwards.
  * The card reads "Signed on paper".
* No session gets 401 on both routes.
* The walk reaches R1.56's first step (an invoice draft for the won client gets 201).
* No sideways scroll at 400 or 1024 px. axe is clean on three states. No page errors.

**Fails, each naming its part:**
| Step | Missing part |
|---|---|
| W1: Send makes a signing request with a link | FO-6 (the signing request) |
| W1: Withdraw offered on the retainer page | FO-5s later part (the page says "Withdraw, Signed offline and Sign as the firm are later parts") |
| W1: the withdraw cancels the signing request | FO-6 |
| W3: the signing link in the client's email | FO-6 (email and public door) |
| W3: the decline is kept with the client's reason, word for word | FO-6 (decline door and reason) |
| W3: the page shows Declined with that reason | FO-6 decline, FO-5s declined state |
| W4: Signed offline offered on the retainer page | FO-5s later part |

**Stand-in:** W2's Declined state is written by SQL, because no route on main makes a retainer Declined. The journey says so.

## Journey changes
None needed. Every label names a part that is really missing.

## Questions for the Lead
1. Is FO-5s' later part (the Withdraw and Signed offline panels, and the declined state with its reason) a backlog row with a lane? BACKLOG still shows FO-5s as "not built" in its trace table.

## Suggestions
None.
