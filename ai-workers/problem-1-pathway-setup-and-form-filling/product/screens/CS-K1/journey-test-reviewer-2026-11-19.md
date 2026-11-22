# CS-K1 part 2 with J-72 (R1.72): journey test, reviewer role, 19 Nov 2026

This is the one journey score for this check. Head **17b41633f**, merged locally with #2321 (FO-2w, head 38d96cf3f) because J-72's Signed offline walk needs FO-2w. I used my own copy `j72r` on :4734 with `PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500`, plus `csk1r2` on :4733 for the data checks, and stopped both. Live AI was off and nothing was spent. The journeys are ruling 1's (`build-lead-c-briefs/CS-K1-2.md`, 20 Nov). "Open a case?" has no screen, so W3 and W7 are API steps, as the ruling allows.

## Journeys
1. **Main path:** a staff member of the Sample firm converts a prospect on its Pipeline card by keyboard (W1). The client appears with no hand-run command (W2). The case is opened from the offer (W3, API). The case page shows the client, the principal applicant, the representative of record and the pinned release (W4).
2. **Alternate:** the same for a Signed offline win, the paper copy recorded through FO-5's route (W5-W8). W8 checks the representative named in the signed version.
3. **Recovery (double click):** a second open-case answers 409 OFFER_USED and opens no second case (DW-c).
4. **Wrong firm:** firm B's staff get 404 on firm A's client, on both the read and open-case (DW-b).
5. **Duplicate delivery:** a second delivery and a catch-up run make no second client. A forged delivery naming firm B is refused (DW-a).
6. **Win twice:** a Signed offline win after a Convert raises nothing new (DW-d).
7. **Error inside the opening:** a forced failure at the end of the transaction leaves no client and no party (`check_csk1_client` DW9 fail).
8. **The step across the boundary:** the client made by the database (fixture or restore) is linked by the job after a restart (I ran this by hand on csk1r2).

## What held
* **J-72: 26/26.** The client appeared 462 ms after the Convert, with a 500 ms poll. Axe was clean on the Pipeline board, the prospect's screen and both case pages. No sideways scroll at 1024 or 1440 px on the board and both case pages. Convert was done by keyboard. No page errors.
* **Data:** one client per prospect, linked to the prospect's own `fo_person`; one case per offer; `case.opened` written once. A direct opening's client and its `fo_person` are written in one transaction (same `xmin`). Firm B's openings link only to firm B's parties.
* **The job, run live:** after a restart it ran as its firm (xr_app), linked the pending client, and validated the check.

## Findings (details and fixes in `review.md`, "Part 2 review")
* **Major M2:** W8 passes even with FO-8's merge-value read switched off (26/26 again). The version names user-R, who is also the firm's default representative.
* **Major M1:** after VALIDATE the check still accepts an unlinked PERSON client when `fo_link_pending` is true, from any writer. A second pending client of a firm whose one job has already run is never linked.
* **Minor m1:** a simulated opener's party records `created_by = staff:user-O`, a staff word for no staff member.
* **Minor m4:** DW-d does not assert the signing's status (it was 200 here). W2 waits 3 intervals + 2 s. The prospect screen has no width check.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Both wins end in one case each with applicant, representative and release (W4, W8) |
| Next step obvious | ½ | Converting by keyboard is clear. Opening the case from the offer is API only (no screen yet, as ruled) |
| Plain words | 1 | OFFER_REFUSED words, the reworded `case.opened` line, the case page headings |
| Feedback and state | ½ | Nothing on screen says the client was made or that an offer waits. W2 reads the API |
| Correct data | ½ | Links, counts and firms are right. W8 is unproven (M2), pending clients stay unlinked (M1), and m1 |
| Error recovery | 1 | 409 OFFER_USED, 404 for firm B, a rolled-back opening leaves nothing, the poll goes on after a failure |
| Accessibility and screen sizes | 1 | Axe WCAG 2.2 A/AA clean on 4 states, keyboard Convert, 1024/1440 on 3 screens |
| Speed | 1 | Client in 462 ms at a 500 ms poll. The default is 10 s (Sample, as ruled) |
| Visual quality | 1 | The existing case page renders as before (`j72-W8-case.png`) |
| Trust and sources | 1 | Sample rows labelled. API steps labelled as such. No AI |

**Total 8.5 / 10. No criterion is at 0, so this is a pass on the journey bar.** Fixing M2 and M1 would raise "Correct data" to 1. An "Open a case?" screen (a follow-up for the Lead, not this row) would raise "Next step obvious" and "Feedback and state".

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* J-72 on `main` after #2321 merges.
* The 10 s default poll in a person's walk.
* The second run of the replay, to check for flakiness (I ran it once as is and once with the mutation).
