# Journey test — PF-5s S5 Firm profile (reviewer, 23 Nov 2026)

Head `2f44fe25e45ab75e5c0a949496414d0013ca7310` (PR #3201, draft). Isolated copy `pf5srev` on :4748 (`AI_LIVE=off PLATFORM_IDENTITY=local`), never :4400; US$0, no model call. Walked headless in Playwright as a person: click, type and read only, with the database read after each journey. Spec: step 2 of the hand-over on #3173, which outranks concept S5 where they differ.

## Journeys (persona · goal · expected)
1. **Owner, main path.** "Set our phone, email, language, currency and time zone." My account → Firm profile → change five fields (the zone by typing "Europe/Paris" into the picker) → Save. Expected: saved, kept after a reload, one audit line per changed key.
2. **Owner, leaving with unsaved edits.** Edit the phone, then click Offices in the menu. Expected: the edit is kept or a warning shows.
3. **Owner, failed save.** The network drops on Save, then the server answers 500. Expected: "Not saved" in words, the typed value kept, focus on the message.
4. **Owner and Admin, two tabs.** The Admin saves the website while the Owner is editing; then the Owner saves. Expected: 409, the latest details loaded, said in words.
5. **Owner, bad and odd input.** Empty the billing email; a non-ASCII email; a 470-character website; a phone written with dots. Expected: words on each field, valid input saved.
6. **Case Officer and Admin, wrong role.** The Case Officer reads the page at 1024 px and tries a write through the API; the Admin tries the billing email through the API. Expected: read-only page, 403 from the server.
7. **Owner, keyboard only and zoom.** Tab order from the top; 1024 px; 200 % zoom (512 CSS px). Expected: logical order, no sideways scroll, axe clean.
8. **Across the screen boundary.** "Go to Plan and billing" from the business address. Expected: Plan and billing opens.

## What held
- **J1.** First view in 166 ms; Save in 243 ms. A double click sent **one** PUT, carrying the version and only the five changed fields. The database holds exactly what was typed (the phone trimmed) and has 5 `platform.setting.change` lines, nothing else. After a reload: fr, USD, Europe/Paris. Typing into the zone picker works (418 IANA zones).
- **J3.** A network failure gives "Not saved · Please try again."; the typed phone is kept and focus goes to the message. A 500 shows the server's detail.
- **J4.** 409 with "Someone else changed the firm profile while you were editing. The latest details are loaded…"; the Admin's website is loaded; nothing written; focus on the message.
- **J5.** A 470-character website and `416.555.0123` both save, one line each. The empty billing email and `café@exämple.ca` are refused on their own fields.
- **J6.** The Case Officer sees text only ("Only an Owner or Admin can change these."), no billing section; no sideways scroll and axe clean at 1024 px. Case Officer PUT → **403**. Admin PUT of the billing email → **403** "Only the firm's Owner can change the billing email."
- **J7.** Tab order: header → menu → the 7 fields → "Go to Plan and billing" → Save. No sideways scroll and axe clean (WCAG 2.2 A/AA) at 1024 px, at 200 % and at 1440 px.
- **J8.** The link opens `/settings/billing`, "Plan and billing".
- **Builder's suite.** `check_pf5s_firm_profile_browser.ts` gave **22/22 twice** on this copy. j_92: W1 PASS; W6 fails only on #3173's warning (19/20).

## Findings (severity)
- **Minor F1: a 409 throws away the person's own edits.** The Owner typed phone `+1 604 555 0199` and currency CAD. After the 409 the form shows the stored `+1 (604) 555-0142` and USD. The message still says "check them and save again", so pressing Save then gives "No changes to save". `firm-profile-page.tsx:79-83` calls `load(latest)`, which replaces the whole form. Fix: re-apply the person's changed fields (`changesOf(start, f)`) on top of the latest, or say "Your changes were not kept: enter them again."
- **Minor F2: leaving by the menu with unsaved edits drops them without a warning** (J2: no dialog, and Back shows the saved phone). The page does say "You have unsaved changes." Fix: a leave guard while `dirty`.
- **Minor F3: focus falls to `<body>` after a successful Save.** The shared `Button` sets `disabled` while busy (`components/ui/controls.tsx:36`), so a keyboard user restarts from the top of the page. Fix: send focus to the heading or the Save button after the save.
- **Minor F4: the field errors are the server's lower-case fragments** ("an email address like office@firm.ca", "digits, spaces and + ( ) . - only"). The summary says only "Please check the highlighted details.", with no field names or links (BIC-13).
- **Minor F5: at 375 px the Save button is about 36 px tall**, below the 44 px that UXL-09 / P-795 ask for (`screenshots-s5/pf5s-s5-owner-375.png`).
- **Observation for the API (not this page):** an Owner cannot clear the billing email, although the concept calls it optional (BR-7, BIC-04).

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and the Admin save: values held, reload confirms |
| Next step obvious | 1 | One filled Save, "You have unsaved changes.", the address links to Plan and billing |
| Plain words | ½ | F4 fragments; the zone list is raw IANA names (as ruled by Lead 6) |
| Feedback and state | 1 | Busy button, toast, problem notice, read-only notes say who changes what |
| Correct data | 1 | Exact values, one audit line per key, nothing else changed, 403s on the server |
| Error recovery | ½ | F1 (409 drops edits), F2 (no leave guard); a network failure keeps the input |
| Accessibility and screen sizes | ½ | axe clean at 375/1024/1280/1440/200 %, keyboard path; F3, F5 |
| Speed | 1 | 166 ms first view, 243 ms save |
| Visual quality | 1 | Team tokens, three calm cards, one primary; nothing breaks at 200 % |
| Trust and sources | 1 | "Changed by ExpatReady support" on the legal fields; the address says where it is changed and why; no AI |

**8.5 / 10, no criterion at 0: Pass.** Fixes that would raise the low scores, most valuable first: F1, F3 + F5, F4, F2.

## Not tested
No real screen reader. No intended user's unaided walk (D17 and D20 stay with the founder). The "Not available" state cannot be reached by a real role, because all six roles hold `agent/settings:list`. Hostile files do not apply (no upload). Headless browser only, no visible pane.
