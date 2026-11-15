# FO-4 part 1 — journey test (reviewer, 15 Nov 2026)

Commit `3bb03d144c1abb8c59e041cc2115e3c3b9b770e7`, PR #1822. Copy at :4461 (database `xr_studio_screens_fo4`, FO-2 part 1 merged in, `PLATFORM_IDENTITY=local`), never :4400. Data: the builder's suite was run once to seed it (38/38). I walked the journeys in headless Chromium with Playwright, from what is on the page, with screenshots of each decision point (kept outside the repository). axe ran with WCAG 2.2 A/AA tags. Then I read the database underneath.

## Journeys (persona · goal · result)
1. **Visitor, 375 px, keyboard only:** "Ask the firm about a work permit." Tab order: First name, Last name, Email, Phone, Interested in, consent tick, Send. The honeypot is not reached. An empty Send puts errors on both fields and in a summary, and the summary takes focus. A bad email gives "Enter an email like name@example.com.", and the 88-character non-English name is kept. Fixed and sent, it gives the firm's thank-you. **Held.**
2. **Visitor, double click on Send:** exactly one lead (L-00014), values as typed: "Zoë Ångström-李明 …", "Ñúñez". The phone is normalised to +442079460000 and one consent row is written. **Held.**
3. **Visitor, form off or unknown link:** both read "This form is not available." with no fields and nothing more. Reloading after the thank-you draws a fresh form. **Held.**
4. **Case officer, signs in by keyboard (local stand-in card):** Leads opens in 108 ms on Unassigned leads, with the badge "10 unassigned". The row shows Possible match, the waited time "just now since it arrived" and Take it. Search finds "ångström" (case and accents kept). An email search finds nothing, as the placeholder says. **Held** (search scope is a ruled deferral).
5. **Case officer, opens the lead and takes it:** the header reads Lead · Open · L-00014. The match line names the earlier lead the officer may see. Take it gives the toast "You have lead L-00014." and the owner "Case officer (Sample)". Reloading keeps the lead. **Held.** Focus drops to BODY when the button goes away.
6. **Case manager in a second tab, stale Take it:** the row refreshes away and the database has one owner and one `lead.taken` audit line. With "everyone sees all" off (the state the builder's suite leaves), the toast says "No such lead in your firm." The default setting, as DW4 shows, names who has the lead. **Partly** (review issue 4).
7. **Read-only person, by URL:** chips are shown, with no Take it anywhere. An unknown id and a malformed id both give "Lead not found" with a link back to Leads. Sign out returns to the card. A bogus stored token falls back to the sign-in card. **Held**, except that no line says why there is nothing to do (review issue 3).
8. **Back and chips:** All open sets `?view=all`. Opening a lead and going Back returns to All open. A bogus `?view=` falls back to the first chip. **Held.**
9. **Screen sizes:** at 1024 px, at 200 % zoom (512 CSS px) and at 375 px, Leads and the lead have no sideways page scroll, and axe finds nothing on the leads list or the lead at any width, or on the sign-in card and the form. At 375 px the table scrolls inside itself. Below 768 px the Sales menu and its badge are hidden. **Held**, with one Minor.
10. **Boundary to the next screen:** Engage, Log a call, Assign and Closed are part 2. The lead screen offers nothing beyond Take it, and nothing pretends otherwise. **Held.**

## Break-it (15 min)
* Hostile names: `<script>alert(1)</script>` and `<b>bold</b>` mixed with Hebrew and Arabic render as text, both in the table and in the heading.
* A 90-character name wraps without overflow.
* Wrong role by URL is answered by the server (403 or 404), and the screen shows its plain words.
* Two tabs taking one lead: one owner.
* A double send gives one lead.
* A send within 2 s is thanked and nothing is stored. This is FO-2's anti-bot rule and is not visible to the visitor, so it is correct.

No Blocker. The Majors are those in the review: the raw source code, no skeletons, and read-only gives no reason.

## Data underneath
* `fo_lead` holds L-00013 and L-00014, each once, OPEN, source `WEBSITE` / "Website enquiry form", possible-match flag set.
* After Take it, both are owned by the Case officer.
* `audit_event` has one `lead.created` (system:web-form) and one `lead.taken` (staff) per lead, and nothing from the refused stale take.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Form → lead → Take it, end to end (journeys 1, 4, 5) |
| Next step obvious | ½ | Take it is clear; Read-only sees no reason; no Next step column yet |
| Plain words | ½ | `WEBSITE` on every row and on the lead; "Send" lacks its object |
| Feedback and state | ½ | Toasts and busy buttons; text loaders, not skeletons; focus lost after actions |
| Correct data | 1 | One lead per double send, exact values, one audit line, server refusals |
| Error recovery | 1 | Field + summary with input kept; RELOAD and 429 wording passed through; not-found has a way back. The race-off wording is a Minor |
| Accessibility and screen sizes | ½ | axe clean, keyboard complete, no sideways scroll; tooltips are `title` only; focus loss |
| Speed | 1 | Leads 108 ms after sign-in, form 235 ms; one request per view |
| Visual quality | 1 | Team frame and components, one primary, orange only for the "needs you" badge |
| Trust and sources | 1 | Match line honest and permission-aware; "since it arrived" is not passed off as open hours; Sample marked |
| **Total** | **8 / 10** | **Pass** (8 or more and no 0) |

Fixes that would raise the score, most valuable first:
1. Map the source code to words.
2. Use skeletons for loading and a read-only reason line.
3. Move focus after sign-in, Take it and Send, and use `Tip` for the chips.

## Not tested
* A real screen reader.
* A visible headed browser pane: none in this environment, so I walked headless with screenshots.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* `frame-ancestors` on the HTML page: known and raised in the PR.
