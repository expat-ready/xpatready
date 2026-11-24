# FO-6ds journey test (reviewer role), 24 Nov 2026

Commit 7d30fe3ef3b1f2149b7351dc7a8f331f5e39e74e, PR #3367. Isolated copy `fo6ds_rev` on :4581 (never :4400), fresh database, Sample firm, `PLATFORM_IDENTITY=local`. Live AI off, no vendor call, no email, US$0. The walk was a headless Playwright script driving the screen only by what a person sees (click, type, Tab, read), with the database read after each journey. The script is in the reviewer's scratchpad and was not committed. The builder's `check_fo6ds_send_browser.ts` was also re-run on this copy: 47/47 PASS.

## Journeys (persona · goal · steps · expected → result)
1. **Main.** A case manager (Owner) on Corporate prospect "Sample Bakery Ltd" wants "Get the offer letter signed by the bakery's contacts, and our representative after them."
   * Steps: open the prospect, click Send for signature, choose a PDF (the title fills in), tick Client B and D, pick a firm signer, click Send.
   * Result: the toast "Recorded for signature: … No one is emailed yet." appears, focus lands on the new row, and the row reads "Recorded · 0 of 3 signed · … (firm): not signed yet · Recorded Nov 24, 2026 · Expires Dec 8, 2026".
   * Download original returns the same bytes (sha256 equal).
   * Database: one request, 1 FIRM signer, 1 audit line. **Held.**
2. **Alternate.** An Individual prospect with Persian names and a Persian file name "پیشنهاد‌کار.pdf" (with ZWNJ). The only signer is pre-ticked and the title is pre-filled. A 16-word title with spaces at both ends is stored trimmed and shown whole. **Held.**
3. **Empty.** A new prospect shows "No documents sent for signature yet. Upload a PDF such as an offer letter for this person to sign." **Held.**
4. **Error: bad file.**
   * A "PDF" holding "hello" gives the API's NOT_PDF words on File.
   * A 26 MB file is refused as soon as it is picked ("This file is too large: at most 25 MB.").
   * Cancel then reopen shows empty fields and no old error. **Held.**
5. **Error: nobody has an email.** The panel warns "No one on this prospect has an email. Add one to the person's record first." and Send is disabled. **Held.**
6. **Error: someone else changes the people meanwhile** (email removed, contact ended, firm signer suspended).
   * The refusal shows on the right field.
   * But the panel keeps the stale choice: a ticked row that is disabled, an invisible id, or a select that shows "No firm signer" while the old id is still sent.
   * Every Send after that is refused the same way; only Cancel gets out. **Failed** (review MJ-1).
7. **Wrong role.** Read only, opening the prospect by its URL, sees the list and downloads but no button. The signers route answers 403 for them. **Held.**
8. **Recovery.**
   * List load error (500) shows "Could not load the signature requests." and Try again brings the rows.
   * An expired download link shows "This download link has expired. Try again."
   * Esc returns focus to the button.
   * Two tabs that each send make 2 requests: the API has no idempotency key, which is FO-6d's scope. A double click in one tab makes 1 (builder's test).
   * **Held, with that note.**
9. **Keyboard and sizes.**
   * At 1024 px and at 200 % zoom (512 px CSS): Tab reaches "Send for signature" and the focus ring is visible.
   * The panel opens on File; Tab order is Title, ticks, Firm signer, Cancel, Send.
   * axe (WCAG 2.2 AA) finds nothing and there is no sideways scroll. At 375 px Send is 44 px tall (builder's check). **Held.**
10. **Across the boundary.** A won prospect still offers the button. A Lost prospect keeps its list with no button (builder's check). The signed copy downloads and matches the sealed sha. The next screen (FO-6 part 4, the client's signing page) is not live, and the screen says so. **Held.**

## Break-it pass (15 min)
* **Major (MJ-1):** journey 6 above (`web/src/modules/front-office/sign/signature-requests.tsx:53`, `:122`, `:130-132`).
* **Minor:** a disabled signer's accessible name reads "Client C SampleNo email: add an email first" (`:124`).
* Holds:
  * Long and non-English titles.
  * A 201-character title, refused on the screen and by the API (builder's test).
  * A government form named "IMM5257 sample.pdf" and a PDF with `/Encrypt`, both refused (builder's test).
  * Reload in the middle of the panel records nothing.
* A hostile file is not rendered: the download is an attachment with `nosniff` and `sandbox`.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: a row recorded, database correct, download matches |
| Next step obvious | 1 | Button beside the list, pre-tick, toast, focus on the new row |
| Plain words | 1 | Concept §5 words; "Recorded", never "Sent"; the minor accessible-name join |
| Feedback and state | ½ | Recording…, toast and states are good; J4c select shows "No firm signer" while another choice is sent |
| Correct data | 1 | One row per Send; firm signers 0/1 as chosen; stage unchanged; audit line |
| Error recovery | ½ | Field errors and Try again work; J6 refusals trap the panel until Cancel |
| Accessibility and screen sizes | 1 | axe clean; keyboard; 200 % zoom; 375/1024/1440 with no sideways scroll |
| Speed | 1 | Prospect page with the section 453 ms; Send to row 115 ms; no per-row requests |
| Visual quality | 1 | Team components; one filled button per area (`section-states-1440`, `panel-1024`) |
| Trust and sources | 1 | No AI; honest "no one is emailed"; signed copy sha verified; Sample values |

**9/10, pass** (8 or more, no criterion at 0). Fixes, most valuable first: clear stale signer and firm choices after a reload, which raises error recovery and feedback to 1 each (review MJ-1).

## Not tested
A real screen reader, Safari and Firefox, and an intended user's unaided walk (D17 and D20 stay with the founder).

## Round 2 (commit 232d508ec)
I re-walked journey 6 on :4583. All three refusals now recover in place: a stale pick is dropped, a vanished person is unticked, and the firm-signer select shows and sends "No firm signer". The next Send records one row with the shown choice, without Cancel. The builder's test is 52/52. Feedback and state ½ → 1, error recovery ½ → 1: **10/10, pass**. New Minor: a file name of more than 100 emoji pre-fills a title that Send refuses as too long (review mn-4).
