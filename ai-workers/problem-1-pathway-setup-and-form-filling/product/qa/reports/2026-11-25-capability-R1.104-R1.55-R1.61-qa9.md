# qa capability R1.104, R1.55, R1.61 (qa 9), 25 Nov ~08:xx IST

Cloud qa lane qa 9, Opus 5.5 medium, under Lead 3 (founder's ask A380: nearest rows first). Main e397c7dc1. Live AI off, US$0, SigningPort's fake.

## R1.104: Works
* **QA-777 (Major) is closed.** #3498 (6f3cbf40c) moved FO-3c's door onto FO-6 part 4b's browser-bound session (#3460, 259164423). The code now binds to one browser, and consent is recorded only after the code.
* `tests/qa/check_qa777_consult_door_not_bound.ts`: **5/5, exit 0, twice**, each on a fresh isolated copy of main e397c7dc1. A re-run on the same copy stops by design ("firm maple777 exists").
  * (1) Browser B, holding only the forwarded link, is asked for the code and gets no signing link.
  * (2) No consent is recorded before the code.
  * The control: browser A gets the code and then the link.
* j_104: **20/20** on an isolated copy of main, and **20/20 on GitHub's runners** (walks run 45531293372, job 138927229290, success).
* Every part named on the row is on main: FO-3c parts 1-2, QA-772 (#3420), #3477, #3498.
* Fresh Opus reader: its verdict is on this records PR.

## R1.55: Partial, 28/34 (walks run 45531293372, job 138927229158)
FAIL steps, with their parts as the labels name them:
* W1, Withdraw panel: FO-5s.
* W1, request cancelled WITHDRAWN: FO-6.
* W3, signing email for version 3: FO-6.
* W3, decline kept with its reason: FO-6.
* W3, Declined shown on the page: FO-5s.
* W4, Signed offline panel: FO-5s.

The labels predate FO-6 parts 4a and 4b. Whether FO-6's parts now point at built routes is the next qa check.

## R1.61: Partial, 10/20 (walks run 45531293372, job 138927229212)
FAIL steps:
* W2: the link's page.
* W3: the client signs.
* W4: the same link answers the invoice and offers Pay. Parts: G2's joining row, FO-7c.
* W5: the card payment. Part: FO-7c.
* W6-W8: used, forwarded and expired links are refused in words.

On the API the door answers `state: WAITING`. So W6-W8 test the joined sign-then-pay link, which is not built yet. Aligning them to the door's own states is owed.

## Not done here
* R1.58 and R1.56 are unchanged since #3594: 22/24 and 16/18, with their parts missing.
