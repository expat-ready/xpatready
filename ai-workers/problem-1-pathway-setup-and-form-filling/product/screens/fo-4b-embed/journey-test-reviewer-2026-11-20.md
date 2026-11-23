# FO-4b embed script: journey test (reviewer, 20 Nov 2026, commit 602a4f8b0)

This is the reviewer's one journey score for this check. It was run on isolated copy :4446 (never :4400), with live AI off and US$0, in Chromium `/opt/pw-browsers/chromium`. The host pages were served by the reviewer's own scratch script (not committed) on `http://localhost:<port>`, using the snippet's markup. The walk was headless and scripted like a person: clicks, typing, Tab and Enter, reading what is on screen. It was replayed together with the PR's suite (37/37, three runs).

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | Visitor, keyboard only, 1024 px: "ask the firm about a work permit" | Arrive at `?utm_campaign=spring&fbclid=FB1&utm_content=<500 x>`; Tab from the link before the form; type the first name `Zoë…`, last name `Nguyễn-Ötzi 李` and email; Tab to Send; Enter | One lead with the attribution; the thank-you is focused | Held. Drawn in 90 ms. Tab order: First name, Last name, Email, Phone, Interested in, tick, Send; the honeypot is never reached. One lead. Attribution: spring, FB1, FBCLID, utm_content cut to 200 characters. Last name stored exactly. One audit line. Focus on the thank-you text |
| J2 | Visitor at 200 % zoom (1024 px → 512 CSS px), 400 px and 1440 px | Open the page | No sideways scroll; no axe violations | Held at all three widths: no sideways scroll, axe (WCAG 2.2 AA, shadow root included) 0 |
| J3 | Firm pasted the script twice | Open the page | One form | Held |
| J4 | Visitor whose consent wording changed during the fill (recovery) | Fill, tick, the firm publishes new wording, Send, Send again | "The form was refreshed…", answers kept, tick cleared; resend makes one lead | Held |
| J5 | Visitor while the firm switches the form off (error) | Fill, form turned off, Send | "This form is not available." | **Not met.** The page said "Not sent / The form could not be sent. Please wait a minute and try again." and stayed in the form state. Nothing saved (review m1) |
| J6 | Visitor when the form is off at draw time | Open the page, follow the link | The link shows; the hosted form says not available | Held |
| J7 | Visitor on a firm site with a strict CSP (`style-src 'self'`) | Fill the form, type a question into the only free-text box shown, Send | The enquiry arrives | **Not met.** The inline style is blocked, so the honeypot shows as an unlabelled box. Typing in it gets the thank-you, but **0 leads** are stored (review M1) |
| Suite | Main path, a site not allowed, blocked script, bot, the same send twice, too many sends | The PR's `check_fo4b_embed_browser.ts` | As in the row's Done-when | 37/37, three runs (each ≥ 60 s apart) |

## Data underneath
- Each good send makes exactly one `fo_lead`, one `fo_lead_attribution` row and one audit line. The `WEB_FORM` door and the source `WEBSITE` are set, and the consent row is written only when the box is ticked.
- A refused send (site not allowed, honeypot, too fast, off form, rate limit) writes no person, lead or consent row.
- The server enforces the allowed site through Origin, not only the browser.

## Break-it (15 min; the breaker covered CORS bypasses in depth)
- Strict host CSP (J7): Major.
- Off-form race (J5): Minor.
- Script loaded twice: holds.
- Non-English text and a 500-character campaign field: hold.
- Wording change in the middle of a fill: holds.
- Re-running the suite within 60 s on the same copy: fails with a timeout, because the suite's own flood fills the address's minute (Minor, test hygiene).

## Score (0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and the suite main path: one lead with its campaign |
| Next step obvious | 1 | One button, "Send my enquiry"; the thank-you is focused |
| Plain words | 1 | The hosted form's words, "(optional)" labels, field messages (fo4b-02) |
| Feedback and state | ½ | The button only dims while sending (no spinner); the off form gives the wrong message (J5) |
| Correct data | ½ | Correct in J1, J4 and the suite; the strict-CSP page loses a real enquiry while thanking the visitor (J7) |
| Error recovery | ½ | RELOAD is handled well (J4); the off form invites retrying for ever (J5) |
| Accessibility and screen sizes | 1 | Keyboard path; 512, 400 and 1440 px; axe 0 |
| Speed | 1 | Drawn in 90 ms; the 2.1 s hold is by rule (AG-2-49) |
| Visual quality | 1 | Calm card, matching the hosted form (screenshots fo4b-01 to 04; reviewer's zoom shot) |
| Trust and sources | 1 | Nothing says whether the person is known; no AI; the campaign origin is stored on the lead |

**Total 8.5 / 10. Pass (8 or more, no criterion at 0).** The score is a pass, but the review's verdict is Block because M1 is open. Fixes that would raise the low criteria, most valuable first:
1. Hide the honeypot whatever the host CSP (correct data).
2. Make an off form say "This form is not available." on the embed (error recovery, feedback).
3. Show a spinner or "Sending…" while sending (feedback).

## Could not test
- A real screen reader.
- Safari and Firefox.
- An intended user's unaided walk (D17 and D20 stay with the founder).
- A visible (headed) browser pane: the walk ran headless.
