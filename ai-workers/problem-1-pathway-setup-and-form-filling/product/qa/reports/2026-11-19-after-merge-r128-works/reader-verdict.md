# R1.28 "Consent recorded per purpose": independent reader's verdict

Date: 19 Nov 2026. Reader: a fresh Opus 5.5 reader who ran nothing and read only the files in this folder (`row.md`, `rules-works.md`, `summary.md`, `batch-checks.txt`, `rerun-jobs.txt`, `auto-verdict.json`, `walk-steps-autoproof.txt`, `j_28.ts`, `j28-brief.md`, `qa511.md`, `qa518.md`).

## Verdict: WORKS

All three Done-when clauses are shown on main by two walks of the journey (47/47 each) and by the consent and arrival suites in a green merge batch whose tree equals a main commit. QA-511, the only bug that held the row, is fixed on main by this evidence and can close. QA-518 is a real Major, but it is a defect in how far an unsubscribe reaches when sending (row 49 and AG-2-84), not in how consent is recorded. It does not break R1.28's Done when.

One condition on recording this verdict: in the same records change, close QA-511 in `BUGS.md` and re-point QA-518 (PR #2325) to row 49 / AG-2-84, with a line saying it does not hold R1.28. Today QA-518 lists "R1.28" first among the rows it affects. While it does, P-305 and gate B (P-317) would read it as an open Major against this row and keep the row Partial by rule, even though the substance says otherwise.

## The Works requirements (P-339) against the evidence

| Requirement | Evidence | Met? |
|---|---|---|
| Every part merged | #2196 (FO-2 part 3b, the real ArrivalPort) merged 18:04 IST, its batch draft #2273, ci 44515526692 green; J-28 #2281 merged 21:36 IST as b5cad6a13, body "Completes: R1.28" (`summary.md`) | Yes |
| Checks green in a merge batch whose tree equals main | Batch draft #2311 (head e5527210e; #2281 with J-37 #2284), tree 100021b5d equals main's ee24ed8b1 (#2284's merge commit, on top of b5cad6a13), ci 44555043162 green. Consent and arrival suites, all PASS (`batch-checks.txt`): check_fo2p3b_arrival_port 51/51 (job 135671454340), check_pf19a_messages_schema 94/94 (job 135671454340), check_fo2_leads_prospects 113/113 (job 135671454263), check_fo2p3_prospects 44/44 (job 135671454438), check_pf19b_sending 40/40 (job 135671454509), check_pf19b2_ses 44/44 (job 135671454573), check_pf19b_mail 28/28 (job 135671454363), check_fo3w_booking_browser 67/67 (job 135671454403) | Yes. #2196's own batch has no tree-equality statement, but its code is inside the later batch, whose tree equals main and whose check_fo2p3b_arrival_port passed |
| Walk 1 on main: the pack run | Item-proof run 44562295519, job 135694924506, on b5cad6a13 (main): j_28 47/47 PASS, secret scan pass, overall PASS (`auto-verdict.json`). The step list holds 47 PASS lines and nothing else (`walk-steps-autoproof.txt`) | Yes, N/N |
| Walk 2 on main: the independent re-run | walks.yml run 44563301296 on main 95fbf96bf (contains b5cad6a13), job 135698580119 "walk j_28" success, 47/47 passed and 0 failed (`summary.md`, `rerun-jobs.txt`). Both harness self-tests that are meant to fail (jobs 135698578548, 135698579276) behaved as designed, so the runner does catch a failing walk | Yes, N/N |
| No open Major or Critical breaking the Done when | QA-511 fixed (below); QA-518 is against row 49 (below) | Yes, once the condition above is recorded |
| A fresh reader's verdict | This file | Yes |

## Each Done-when clause and its evidence

**1. "Each purpose recorded with time, wording and source."**
- Web form door (both walks, steps W1): the tick's words are the firm's form wording. Underneath there is exactly one row, `EMAIL|MARKETING|WEB_FORM|<wording id>|system:web-form|live`. Its time falls between the page opening and now. No row is written for any other purpose. The audit line names the web form as the recorder. Fail half: an unticked form still creates a lead and a person but writes no consent row.
- Booking door (steps W2): the same visitor books with the tick and gets one `EMAIL|MARKETING|BOOKING_FORM|<wording id>|system:booking-page|live` row. Its wording is the one the page showed (the firm's newest, not the web form's). The web form's row is left untouched. Fail half: a booking with the tick off is booked and records no row.
- Suites in batch ci 44555043162: check_pf19a_messages_schema 94/94, check_fo2p3b_arrival_port 51/51, check_fo2p3_prospects 44/44.
- Limit: only EMAIL MARKETING has a public door. The second purpose (WhatsApp opt-in, WHATSAPP SERVICE) is written by a staff fixture through the consent store, with wording, source STAFF_RECORDED, recorder and time (`j_28.ts`, W3 setup; labelled Sample). No product screen records it.

**2. "Withdrawing one keeps the others."**
- Steps W3 (both walks): the marketing mail carries one-click List-Unsubscribe headers. The link opens one page with one button and records nothing. Unsubscribe shows "You are unsubscribed". Underneath, the EMAIL MARKETING row is withdrawn via UNSUBSCRIBE exactly once, with its own withdrawal row. The WhatsApp opt-in row stays live and the send gate still allows it. The withdrawal changed only the withdrawal columns (channel, purpose, wording, source and time are unchanged). Using the link a second time returns 404 and records nothing more.
- Step W5 (row 49's first step): before the unsubscribe a marketing send was allowed and delivered. After it, the send is SUPPRESSED with reason "WITHDRAWN: MARKETING", and asking the worker to deliver it still reaches nothing.
- Suites in batch ci 44555043162: check_pf19b2_ses 44/44, check_pf19b_sending 40/40, check_pf19b_mail 28/28.

**3. "A record is never edited, only superseded."**
- Steps W4 (both walks): the database refuses an edit to a live row ("only the withdrawal is ever set on a consent"). It refuses edits to a withdrawn row, including un-withdrawing it ("a withdrawn consent never changes"). It refuses a delete ("msg_consent is evidence: DELETE refused"). After those refused statements both rows are byte-for-byte as before. A new grant of the same purpose is a new row, the old row is unchanged, and the gate now names the new row.
- How "never edited" is read here: withdrawal sets the withdrawal columns on the row once, and also writes its own withdrawal row. The recorded facts never change (W3 proves it), and the once-only setting is enforced by the trigger. Earlier readers accepted this reading, and so does this one. It is a one-time change of state, not an edit.

## QA-511: fixed on main, can close

QA-511 (Major) said the booking door ran on `fakeArrival()`, so a public booking never became a front-office person or lead and could not record consent. On main, both walks pass two things. First, step W2 "a booking with the tick off is booked and records no consent row (QA-511)", and that step also requires the booker to exist as an `fo_person` in the database. Second, step W2 pass, where a ticked booking writes a BOOKING_FORM row with its wording and the recorder `system:booking-page`, and creates a new person plus an `fo_lead` flagged as a possible match. An in-memory fake cannot produce stored person, lead and consent rows, so this behaviour proves a real ArrivalPort is wired in. check_fo2p3b_arrival_port 51/51 passed in the batch whose tree equals main. The summary says `booking/runtime-ports.ts` binds PrismaArrival (a87a7aa92, #2196). I did not read that code. The proof here rests on behaviour. Every expected result in QA-511 is met.

## QA-518: a defect against row 49 / AG-2-84, does not hold R1.28

QA-518 says that after an unsubscribe the same email address can still receive marketing through a second person record. Every record in that case is correct:
- The booking created its own person, with an express EMAIL MARKETING consent that the visitor really gave on the booking page. That consent was recorded with its time, wording and source (clause 1 holds).
- The unsubscribe withdrew the consent of the person the mail went to and recorded that withdrawal (clause 2 holds; no other purpose was touched).
- Nothing was edited (clause 3 holds).

What fails is how far an unsubscribe reaches when the firm sends: it does not stop marketing to other person records at the same address. The fix the tech lead recommends is a suppression check at send time, which ignores older consent rows on other person records and can be lifted only by a fresh express consent given on a public page. That is a rule in the send gate and the suppression list (row 49, unsubscribe; AG-2-84, persons never linked). It needs no change to how consent is recorded, withdrawn or superseded. So the tech lead's ruling stands: QA-518 is a Major against another row and, under the rules, does not hold R1.28.

It remains a real and serious gap. Whether an unsubscribe must reach every record at that address is a legal point under Canada's anti-spam law: Unconfirmed: no counsel. Row 49 must not be marked Works while QA-518 is open.

## What this evidence does not prove

- I opened no GitHub run. Run, job and commit ids, the tree equality, and the re-run's 47/47 count are taken from `summary.md`, `batch-checks.txt` and `rerun-jobs.txt` as written. `batch-checks.txt` does not tie its job ids to run 44555043162 itself.
- The pack run walked the journey only. The suites listed above come from the merge batch, not from the item-proof run.
- No person has walked the booking door at phone width since #2196. The walks ran at 1440 and 1024 px by script. Earlier walks by hand covered the web form at 400 px (19 Nov) and the unsubscribe at 800 and 375 px (18 Nov).
- WhatsApp opt-in, and the "supersede" grant in W4, were written through the consent store as a staff fixture, not through a product screen. Only EMAIL MARKETING has been proven through public screens.
- A marketing mail has no product door. In the walk it is written through MessagePort with the local adapter, and the firm, its wording and its web form are set up in the database directly (`j_28.ts` header).
- The QA-518 situation itself (a second record still mailable) appears only as an unasserted NOTE in the walk. It is not in the step list.
