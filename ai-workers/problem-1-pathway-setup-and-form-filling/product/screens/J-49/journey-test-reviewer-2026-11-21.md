# J-49 journey test (reviewer, 21 Nov 2026; PR #2731 head 849e2db98)

Isolated copies j49r on :4593 (never :4400), Sample rows only, cost US$0. `walk.mjs` and headed video were not run: this container lacks Playwright's ffmpeg.

## Journeys
1. **Visitor A, main path.** Book on the firm's page with the marketing tick. Get the confirmation, then the firm's marketing email with an unsubscribe link. Open the link, press Unsubscribe, and get no more marketing while service email still arrives.
2. **Visitor B, refusal.** Book without the tick. The firm's marketing email is not sent, and the lead page says why.
3. **Owner.** Read B's and A's lead pages: "Not sent" with the reason in words, and the address masked.
4. **Error and recovery:**
   * a used link
   * a forged token
   * a junk token
   * reloading after unsubscribing
   * opening the page twice (a link scanner)
5. **Keyboard and small screen:** the unsubscribe page, keyboard only, at 400 px.
6. **Boundary.** The walk ends on A's lead page, because map row 50 (in-app notifications) is Not built.

## What held
* Journeys 1-3 are scripted in `j_49.ts`: 29/29 on a fresh copy, 2 x 29/29 on a kept copy (17 s and 18 s), and 29/29 on a third copy. axe found no A/AA violation on 5 states, with no sideways scroll at 1024 and 1440 px and no page errors.
* Data underneath:
  * one `msg_consent` row, BOOKING_FORM, self-service, for A
  * none for B
  * one withdrawal, via UNSUBSCRIBE
  * outbox states and reasons as labelled
* Break pass:
  * forged token: 404 on GET and POST
  * junk token: 404
  * two GETs record nothing
  * Tab then Enter unsubscribes
  * 400 px: no sideways scroll
  * reload after unsubscribing: the public "This page is not available." page

## Findings
These are as in `review.md` (m1-m6). The only one a person sees is m2: the harness's stand-in run leaves a "no consent" row on the lead page of A, who did consent.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The walk passes. The marketing send is in process because no screen sends marketing on main (honest limit). |
| Next step obvious | 1 | "You are unsubscribed" says what stays (file messages, WhatsApp choices). |
| Plain words | 1 | "Not sent: no consent to marketing on this channel" and "Not sent: the person withdrew consent". |
| Feedback and state | 1 | The Not sent, Sent and Delivered labels on the lead page; the unsubscribe page then its confirmation. |
| Correct data | 1 | One withdrawal, the consent reads withdrawn, the outbox reasons are exact. |
| Error recovery | ½ | A spent or forged link gives 404. A reload after unsubscribing shows "This page is not available." rather than "already unsubscribed". |
| Accessibility and screen sizes | 1 | axe clean; 400, 1024 and 1440 px; keyboard only on the unsubscribe page. |
| Speed | ½ | Pages answer at once, but no STANDARDS §9 budget was measured. |
| Visual quality | ½ | The unsubscribe page is plain and unstyled. The full-page screenshots catch the sticky header mid-page. |
| Trust and sources | 1 | Sample labelled, address masked, reason shown. |

**8/10, no 0: pass.** To raise the score, most valuable first:
1. Fix m2, so the evidence reads true.
2. Have the walks job record the visible-browser run.
3. Measure the §9 timings.

Not tested: a real screen reader, an intended user's unaided walk (D17 and D20 stay with the founder), and real SES delivery.
