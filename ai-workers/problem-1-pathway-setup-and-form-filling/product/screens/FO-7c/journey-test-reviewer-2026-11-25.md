# Journey test: FO-7c part 2a, the pay link and the client's pay door (reviewer, 25 Nov)

**Head:** `d4b1185d79dcdd50513301bc65a6f93d5107487d`.

**Where it ran:**
* isolated copies `rv57` (:4436) and `rv57j` (:4437, `PLATFORM_IDENTITY=local`), runtime ports, never :4400;
* the fake card rail;
* Chromium at `/opt/pw-browsers/chromium`;
* screenshots in the session scratchpad.

This part is API-only by the approved shape (the client's page and "Copy pay link" are FO-7s2 parts 1-2). So the person-level walk covers what a staff member and a client can actually reach today: the API answers, and the page the link opens.

## Journeys
1. **Main (staff, Owner):** "send the client a way to pay INV-0001".
   * Steps: `POST /api/front-office/money/invoices/:id/pay-link`, no body.
   * Result: 200, with the link, CAD and 125000 due.
   * Data underneath: one row hash, equal to `sha256(token)`; one audit line `invoice.pay_link_made` by the staff actor, "CAD 1,250.00 due".
   * Held.
2. **Main (client, no login):** "open the link and see what I owe".
   * Steps: `GET /api/public/pay/<token>`.
   * Result: 200 with the firm, INV-0001, its line, `dueMinor` 125000; `card.offered` false (fake rail, not set up); and the firm's offline details "Interac e-Transfer … (Sample)".
   * Headers: `no-store` and `no-referrer`.
   * Held.
3. **Alternate (client, firm with no account and no details).**
   * Steps: open firm B's link.
   * Result: "Please contact Sample solo practice, representative@… to arrange payment.", with no card (AG-6-49 r1(b)).
   * Held (j_57 W7).
4. **Boundary (client clicks the link in a browser).**
   * Steps: open `http://localhost:4437/money/pay/<token>` at 400, 1024 and 1440 px.
   * Result: the staff Studio shell ("Acting as Configuration author") with "Page not found".
   * At all three widths: no sideways scroll, no console or page errors.
   * This is expected until FO-7s2 part 2, but a link a firm sends today lands on nothing.
5. **Error (client presses Pay while the card is not offered).**
   * Steps: `POST …/session`.
   * Result: 409 `CARD_NOT_OFFERED` with the same offline block.
   * Held.
6. **Error (bad link).**
   * Tried: an unknown firm prefix, an upper-case prefix, a 5,000-character token, a non-ASCII token, a one-character change, "nottoken".
   * Result: each gave the one 404 "This payment link does not work…", on GET and POST.
   * Held.
7. **Wrong role (staff):** a case officer gets 403 from part 1's connect key, and firm B's Owner gets 404 on firm A's pay link (j_57 W1 fail, W8). Held.
8. **Part amount (staff):** a body with an amount → 422 (j_57 W2 fail). Held.
9. **Recovery (staff replaces a link, the client pays from the new one).**
   * On the fake: works.
   * On Stripe: the same idempotency key with new URLs → Stripe `idempotency_error` → 500 for 24 h (review Major 1).
   * Not walkable on the fake: its `once()` ignores parameters.
10. **Money correctness (client, an old tab).**
    * Steps: a 1,000 session; staff record 400; a new 600 session.
    * Result: the old 1,000 session stays live with no `expires_at` → overpay possible (review Major 2).
    * Seen in the suite's own sequence and the code. Not paid through a browser, because there is no page.

**j_57** (`rv57j 4437`): 9/22, as in the PR's run. Every failing label names its missing part: part 5, FO-7s2 parts 1-2, or part 2b.

## Break-it (15 min)
* **Held:**
  * the one 404 for every tampered token (above);
  * the GET twice writes nothing;
  * the limiter gives 429 after 30 a minute (the suite);
  * the lock refusal uses no word "lock".
* **Found:**
  * the public POST accepts `text/plain` (signing door: 415), a Minor;
  * on Stripe, the adapter maps no error in `createHostedPayment`: an offline probe got `StripePermissionError` → 500 instead of the offline details (Major 4).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The link and the answer work by API. The link a client clicks opens "Page not found" (journey 4; the screens are another part). |
| Next step obvious | ½ | The answers carry the amount due and the offline details, but there is no page that shows them. |
| Plain words | 1 | "This payment link does not work. It may have been replaced…", "Please contact … to arrange payment." |
| Feedback and state | ½ | Clear 409 codes, but the real rail gives a 500 on refusal or a missing account (Major 4). |
| Correct data | ½ | Exact due, hash only and the audit line are right. A stale session can overcharge, and the amount sent to the rail is untested (Majors 2-3). |
| Error recovery | ½ | Replacing a link breaks Pay for 24 h on Stripe (Major 1). |
| Accessibility and screen sizes | ½ | No screen in this part. The landing shell has no sideways scroll at 400/1024/1440. No axe run (no page of this part). |
| Speed | 1 | GET 10-20 ms, POST 8 ms on the copy. |
| Visual quality | ½ | Nothing of this part to see. The link lands in the staff chrome. |
| Trust and sources | 1 | Sample details labelled; "Unconfirmed: no counsel" in code; the firm's own account only. |

**Total 6.5/10, fail (below 8, no criterion at 0).** The fixes that raise it most, in order:
1. the key over every parameter (Major 1);
2. a short `expires_at` and one snapshot (Major 2);
3. assert the amount, currency and metadata the rail is sent (Major 3);
4. map Stripe's errors to the offline answer (Major 4);
5. FO-7s2 part 2's page, which lifts task, next step, accessibility and visual (another part, not a finding here).

**Not tested:** a real Stripe test-mode payment (part 5), a screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
