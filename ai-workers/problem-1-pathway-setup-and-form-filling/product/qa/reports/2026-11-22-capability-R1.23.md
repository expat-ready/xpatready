# qa capability R1.23 (firm logo, colour, sender name, favicon, banner), 22 Nov 2026

Run: `/qa capability R1.23` (re-walk check after #2910 merged as c695547bd) · main 0fb27300c · isolated copy :4423 (`j23`, `PLATFORM_IDENTITY=local`), fresh for each run, stopped · live AI off · US$0 · no live mail (the local email adapter).

## Verdict: Fail, so the row moves to Partial (was Not built); one clause is missing (QA-746, Major)

Done when: "An Owner sets all five; a colour below WCAG AA and a wrong file type or size refused on the field; client pages and emails show them". Two of its three parts hold, and so does the email half of the third; client pages do not.

## j_23, twice on fresh copies of main's head: 14/15, exit 1, same lines
* W0 (fails on the fake): before anything is set, the booking page shows no brand, and a confirmation email is not from the sender name.
* W1: the Owner signs in on the sign-in card and opens Branding from My account's menu.
* W3: refusals on the field, with nothing stored:
  * #ffcc00 is refused with its ratio and 4.5:1;
  * an SVG named logo.png is refused ("PNG or JPEG");
  * a 2 MB + 1 byte logo is refused ("2 MB").
* W2: all five are set on the page and "Branding saved." shows. The images are stored as the files entered (96x48, 32x32, 600x120), the colour and sender name as typed, with exactly one audit line per changed key.
* **W4, FAIL:** the public booking page draws no logo, banner, favicon or colour (QA-746).
* W5: the booking confirmation is from the sender name, and its HTML carries the logo link and #7a1f4e.
* W6: the Case Officer has no entry, gets "Only an Owner or Admin can change the firm's branding." by address, and the API answers 403.
* W7: keyboard save; 400, 1024 and 1440 px with no sideways scroll; axe clean. No page error.

## Bugs
QA-746 (Gap, Major): no client page reads the branding. PF-13 concept §6b leaves "drawing the brand on the real client pages" to its own part; PF-13's backlog row names it ("applied to client pages"), but no part is built or scheduled. The public read exists and `booking-public/frame.tsx` has an empty brand slot.

## Journey score: 8 / 10 (passes the score; the row still fails a done-when clause)
| Criterion | Score |
|---|---|
| Task completed | ½: set and email yes, client page no |
| Next step obvious | 1 |
| Plain words | 1 |
| Feedback and state | 1 |
| Correct data | 1 |
| Error recovery | 1 |
| Accessibility and sizes | 1 |
| Speed | 1 |
| Visual quality | 1 |
| Trust and sources | ½: the brand the Owner set is not what a client sees |

## Could not test
The client portal (not built for firms' clients yet), PDFs, the shared demo :4400 (cloud session), a real screen reader, D17/D20.

## Questions for the tech lead
1. Who builds "client pages show them" (QA-746)? It needs a small row: the public booking pages (and later the portal) read the firm's public branding (logo, banner, favicon, colour). Until then R1.23 cannot be Works.
