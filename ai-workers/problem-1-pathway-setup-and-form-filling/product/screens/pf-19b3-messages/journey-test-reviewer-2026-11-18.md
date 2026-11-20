# Journey test: PF-19b part 3, the lead page's Messages panel (reviewer, 18 Nov 2026)

Reviewer role (independent Opus, P-303), head `9c5207100`. Isolated copy `rv_pf19b3` on :4541 (`PLATFORM_IDENTITY=local`, stopped after), never :4400. Data: the builder's browser test seeded the lead, its three emails and the three staff. My own harness (`Messages.send` on the copy's database) added the suppressed rows, an empty lead and 51 rows for paging. The copy's own worker and its local test events then moved them. Walked in headless Chromium. No visible browser pane is available in this cloud session.

## Journeys (persona · goal · result)
1. **Main.** Case officer, own lead: "did my email reach Mira?" Keyboard from Leads (Tab, Enter) to the lead. The panel reads Sent, Delivered and Bounced as words, with events and times, and the panel came up in 300 ms. **Held.** Evidence: browser test DW6, `screenshots/lead-messages-1440.png`.
2. **Alternate.** The same officer after a send to the bounced Sample address, plus a marketing email with no consent. Both read "Not sent", but the reason shows as a raw code: "(SUPPRESSED: HARD_BOUNCE)", "(NO_CONSENT: MARKETING)". **Failed: plain words.**
3. **Empty.** A lead with no emails reads "No messages yet." **Held.** The message does not say what will appear there.
4. **Error.** The messages read answers 500 (forced with a Playwright route). The panel reads "Could not load the messages. Please try again." but has no Try again control, so the only way to retry is to reload the page. **Partly.**
5. **Wrong role.** A Read-only person who may not see the lead, and firm B's Owner by URL, both get "Lead not found" and no panel. On the API, firm B gets 404 "No such record in your firm.", for the lead and for the person. A random case party, kind STAFF, or a doubled query value also gets the same 404. No session gets 401. **Held.**
6. **Recovery and volume.** 51 messages show a page of 50, and "Show older messages" (reached by Tab, opened with Enter) shows 51. After the last page loads the button goes away and **focus falls to `<body>`**. Reload shows the first 50 again. The copy's sweep sent the 51 rows: all became DELIVERED within about 2 minutes, none was stuck at SENT, and the log shows no "test event failed" line. **Held, with the focus slip.**
7. **Screen sizes.** At 1024 px, 720 px at 2x (200 % zoom), 400 px and 375 px there is no sideways scroll (the overflow measured 0). axe-core WCAG 2.2 A/AA finds no violations in the panel. A 40-character local part with a 60-character domain wraps cleanly. **Held.**
8. **Across the screen boundary (J-48).** Not walked through the public booking page. DW4 on the running copy shows the copy's own worker taking a lead's email to DELIVERED, and a Sample bounce address to BOUNCED and suppressed.

## Data underneath
* There is one DELIVERED event per message, and a repeated notice answers "repeated".
* Probe: a concurrent Bounce and Delivery on one row (`Promise.all`) ends BOUNCED with the Delivery ignored. Two concurrent copies of one Delivery make one event.
* `created_at` is stored at ms precision, so the cursor loses no rows.
* No body text and no full address appear in the API answer or the page HTML.

## Break it
* A cursor that matches the pattern but holds an impossible date (`2026-13-45T99:99:99.999Z_…`), or an id of all dashes, gives **500** rather than 400 (`staff-routes.ts:67-70`). Minor.
* Doubled query values, a kind that is not offered, and a malformed id each give the same 404. Good.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J6: states and events visible, paging works |
| Next step obvious | ½ | every row is titled "Message" unless it has a template key or a `mail:<head>` key. Two bounced emails cannot be told apart (J2 screenshot) |
| Plain words | ½ | raw codes "(SUPPRESSED: HARD_BOUNCE)", "(NO_CONSENT: MARKETING)" (J2) |
| Feedback and state | 1 | each state is a word in a toned pill, "Loading the messages…" uses role=status, the error uses role=alert |
| Correct data | 1 | database checks above, masked addresses, firm's from-name |
| Error recovery | ½ | no Try again control (J4), bad cursor gives 500 |
| Accessibility and screen sizes | ½ | axe clean and no overflow at any width; focus lost after the last "Show older messages" (J6) |
| Speed | 1 | 300 ms to the first row |
| Visual quality | 1 | same cards, tokens and Pill as the lead page (1440 and 375 screenshots) |
| Trust and sources | 1 | from-name, masked address, event times. No AI on this screen |
| **Total** | **8 / 10** | **Pass** (8 or more, no 0) |

Fixes that would raise the score, most valuable first:
1. Map each `stateReason` to plain words in `web/src/modules/platform/messages/contract.ts`.
2. Move focus to the first newly loaded row when "Show older messages" loads the last page.
3. Add a Try again button to the error state.
4. Send an impossible cursor date to the 400 answer.

**Not tested:** a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); the public booking page into this panel (J-48's own walk).
