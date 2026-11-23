# qa capability R1.23 (firm logo, colour, sender name, favicon, banner), re-walk after #3037, 23 Nov 2026

Run: `/qa capability R1.23` (re-walk check after #3037 PF-13 part 3 merged as 955fd15b3) · main 09b3893df · isolated copy :4423 (`j23`, `PLATFORM_IDENTITY=local`), fresh for each run, stopped · live AI off · US$0 · no live mail.

## Verdict: Pass (Works once a GitHub walk of j_23 on main is green and named in the row, P-339)

Done when: "An Owner sets all five; a colour below WCAG AA and a wrong file type or size refused on the field; client pages and emails show them". Every clause holds.

## j_23, twice on fresh copies of main's head: 15/15, exit 0, same lines
* W0 (fails on the fake): before the save, the booking page and the confirmation email carry none of the brand.
* W1, W2: the Owner reaches My account › Branding by the menu and sets all five. The images are stored as the files entered (96x48, 32x32, 600x120), the colour and sender name as typed, with exactly one audit line per changed key.
* W3: refused on the field, with nothing stored:
  * a colour below WCAG AA (#ffcc00);
  * an SVG named logo.png;
  * a logo of 2 MB + 1 byte.
* **W4 (was red, QA-746):** the firm's public booking page draws the logo and banner, uses the favicon and paints #7a1f4e.
* W5: the booking confirmation is from the sender name and carries the logo and colour.
* W6: the Case Officer has no entry, gets a plain refusal by address, and the API answers 403.
* W7: keyboard save; 400, 1024 and 1440 px, axe clean. No page error.

Environment note: on this copy the studio's `node_modules` lacked `@aws-sdk/client-s3`, which main added since the last install, so the API did not start. `npm ci` from main's lockfile fixed it. That is not a product finding.

## Bugs
QA-746 closed (`history/qa-bugs-closed-2026-11-23-r123.md`). No new finding.

## Journey score: 10 / 10
Task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data 1 · error recovery 1 · accessibility and sizes 1 · speed 1 · visual quality 1 · trust and sources 1.

## Could not test
Client pages other than the public booking page (manage-booking, the portal) and PDFs; the shared demo :4400 (cloud session); a real screen reader; D17/D20.
