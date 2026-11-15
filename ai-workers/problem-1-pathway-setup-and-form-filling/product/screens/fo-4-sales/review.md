# FO-4 part 1 — review (reviewer agent, 15 Nov 2026)

PR #1822 at `3bb03d144c1abb8c59e041cc2115e3c3b9b770e7` (branch `claude/friendly-fermat-rhrpoj`). Scope: the hosted enquiry form, Leads (Unassigned leads, Mine, All open, search, waited time, Take it) and one lead, beside FO-2 part 1 (#1813). The bar: brief FO-4 part 1 (9ebb5da30), concept r2 and board r2 (`lead-b-front-office`), `STANDARDS.md`, `EXPERIENCE.md`. Copy under test: :4461 (FO-2 part 1 merged in, `PLATFORM_IDENTITY=local`), never :4400. The builder's suite: **38/38** on my run. Size: 763 lines added, 0 removed (under 800). Journey test: `journey-test-reviewer-2026-11-15.md`, **8/10**.

**Verdict: Block** (on the skill's scale, Ship after fixes): three Majors, each a few lines. Approve after they are fixed and re-checked on the diff only.

## Deferred items (Lead B's rulings on #1813, comment 6892106486; none counted against this PR)
Waited time in open hours and the Assign picker with the one-user hiding are both moved to the FO-4 part that follows FO-2's route. The screen does not hide this: the cell reads "… since it arrived", not "open min". Closed moves to part 2. Search covers name and number only; the placeholder says so, and the email and phone `q` is asked of FO-2 part 2. `frame-ancestors` is missing on the hosted HTML page; it is raised in the PR body (Q4) and is an API-side file. The local stand-in sign-in card says what it is in its own text (`sales-frame.tsx:48`). FO-2 part 1 has no Assign route (`routes.ts`: "Part 2 adds … Assign"), so "no Assign button" is correct, not missing.

## Issues (Must = Major, Should = Minor)
1. **Must (Major), raw code on the main path.** Source shows `WEBSITE` on every Leads row and on the lead ("WEBSITE · Website enquiry form"): `leads-page.tsx:76`, `lead-page.tsx:63`; builder's own `screenshots/leads-unassigned-1440.png`. This breaks EXPERIENCE §5 [M] (plain words, no codes) and BIC-19 ("no internal ids on the main path"); the board's word is "Website form". **Fix:** a words map in `contract.ts` (`WEBSITE` → "Website form"; an unknown code → `sourceDetail`, else "Other"), used in both places, plus a check that `WEBSITE` never shows.
2. **Must (Major), no loading skeletons.** All four loading states are a text line ("Loading leads…", "Loading the lead…", "Loading the form…", "Loading…"): `leads-page.tsx:59`, `lead-page.tsx:21`, `web-form-page.tsx:102`, `sales-frame.tsx:77`. EXPERIENCE §4 [M] and concept §4 ("loading skeletons") ask for skeletons. BIC-18 is Partly, so under the §6 rule this is a Must. **Fix:** use the app's `components/ui/skeleton.tsx` (table rows, the two rails, the form card).
3. **Must (Major), read-only does not say why.** A Read-only person gets the lists and the lead with no Take it and no word of explanation (walk: RO chips shown, 0 Take it). On the lead the rail reads "Owner: Nobody yet" and nothing else. EXPERIENCE §4 [M] read-only state, BIC-18 ("read-only says why") and concept §4 ("read-only for Read-only people") all ask for the reason. **Fix:** without `agent/prospect:edit`, one muted line, for example "You can view leads. Taking one needs a role that works leads.", in the lead's rail and under the Leads subtitle. Add a DW6 assertion for it.
4. **Should, a stale Take it is worded as not found when "everyone sees all" is off.** The Case Officer took L-00013, then the Case Manager clicked Take it on the stale row. The toast said "No such lead in your firm." (FO-2 answers 404 by its no-leak rule). The row does refresh away. The test comment says this case "is checked after this one" (`tests/check_fo4_sales_browser.ts:175`), but no such check exists. **Fix:** in `take-it.ts:13`, map a 404 on take to "Someone else has this lead now." (it names nobody, so nothing leaks). Add the check or drop the comment.
5. **Should, a 3-state field read as 2.** `lead-page.tsx:42` shows anything not `OPEN` as "Closed", so an `ENGAGED` lead (FoLeadState has three values; FO-5's tests insert them) reads "Closed". **Fix:** map OPEN/ENGAGED/CLOSED to words.
6. **Should, tooltips by `title` only (BIC-14 Partly).** "Possible match", "Fix number", the Waited cell and Arrived use `title` (`leads-page.tsx:71-72,78`; `lead-page.tsx:56,64`), which never opens on keyboard focus. The app has `Tip` (`components/status.tsx:15`). The Waited tooltip text also differs from concept §5 (it drops "counting only your open hours"); that is right until open hours land.
7. **Should, focus is lost.** After sign-in focus lands on BODY, and the same happens after Take it on the lead (the button goes away) and after Send on the form. Move focus to the page's h1, the owner line or the thank-you (BIC-20).
8. **Should, words against the concept and board.** The form's button is "Send"; the board says "Send my enquiry" (verb plus object, BIC-11; `web-form-page.tsx:86`). The fields read "First name" and "Last name (optional)", where concept §4 and the board say "Given names" and "Family name", with family name not optional (`web-form-page.tsx:67-68`). FO-2's API accepts a missing family name and uses the same words. Record the choice in the PR, or align with the concept.
9. **Should, not recorded as deferred.** Three concept items are not in this part and not in the PR's "Not in this part" list: the empty state's "Copy your form link" (concept §4; the link comes with part 3's settings route), the Next step column ("Call now", board screen 2) and the waited time in the lead's right rail (board screen 4). List them so part 2 or 3 picks them up.
10. **Should, owner state read from display text.** `leads-page.tsx:37` and `lead-page.tsx:34` decide "no active owner" by the prefix "(Inactive) " of the owner's display label. Ask FO-2 for an `ownerActive` boolean. Until then it is harmless: a wrong guess only shows a Take it that the server refuses.
11. **Should, no menu below 768 px.** Below 768 px, which includes 1024 px at 200 % zoom, the Sales menu and its "n unassigned" badge are hidden (`sales-frame.tsx:24`, `hidden md:block`) and nothing replaces them. The chips still work. **Fix:** show the badge count beside the page title at narrow widths.
12. **Should, PR body.** "Checks and results: In progress." Paste the result lines before asking for the label (brief rule rev 16).

## D1–D20 (1–5)
D1 4 BR-1/2/3/4/5/10 behave per concept, deferrals ruled · D2 5 double-click Send → one lead; race → one owner, one audit line · D3 4 one `take-it.ts`, one contract · D4 N/A · D5 4 reload, back (chip kept), bogus token → sign-in, RELOAD answer shown · D6 4 `lead.taken` audit line with actor · D7 N/A (no AI) · D8 4 "Sales › Leads › Lead" + Back · D9 4 Take it is the one action; Next step column absent · D10 3 `WEBSITE` code; title-only tooltips · D11 3 toasts good; text loaders, focus loss · D12 4 team tokens, one primary, orange only for the badge · D13 4 axe clean on all states; 375/1024/200 % no sideways scroll; keyboard path works · D14 4 `Frame`, `Table`, `Pill`, `Field` · D15 5 Leads 108 ms after sign-in, form 235 ms, one request per view · D16 4 DW1-4, 6, 7 pass+fail; the 404 race comment claims an unwritten check · D17 simulated only · D18 4 match line, source detail, attribution shown · D19 N/A (J-27) · D20 simulated only.

## Scorecard (EXPERIENCE §6; concept §4c)
| BIC | Score | Evidence |
|---|---|---|
| 01 | N/A | Answer keys travel at Engage/Convert (part 2+) |
| 02, 03, 05, 06, 07, 09, 12, 15, 16, 17 | N/A | As concept §4c / no such step in part 1 |
| 04 | Met | "Last name (optional)", "Phone (optional)", "Interested in (optional)" in words |
| 08 | Partly | Three chips; Closed deferred (ruled) |
| 10 | N/A | Next step is computed by FO-2 later (issue 9) |
| 11 | Partly | One primary per panel; "Send" lacks its object (issue 8) |
| 13 | Met | Empty send: field errors + summary focused, input kept (88 chars kept on bad email) |
| 14 | Partly | `title` only (issue 6) |
| 18 | Partly | Empty text present; no skeletons; read-only gives no reason (issues 2, 3) |
| 19 | Partly | Five inputs + tick; `WEBSITE` code on the main path (issue 1) |
| 20 | Partly | Keyboard path, 200 % zoom pass; focus lost (issue 7) |

## Code (check 5)
Server authorisation is FO-2's: Read-only Take it gives 403 (DW6 fail side). No per-row requests: the badge shares the `["fo","leads","unassigned"]` query. There are no migrations. zod parses every answer at the edge. Problem Details come through `problemOf`. The honeypot is out of the tab order. The submissionId and stamp are fresh per draw (`gcTime: 0`). `tsc --noEmit` on web exits 0. Rule-removal spot-check: removing the inactive-owner arm of `unowned` drops DW7's Take it, so the check fails; showing Take it to Read-only fails DW6. Retrofit mapping (check 6): no `build-notes.md` in `screens/fo-4-sales/`; the PR body carries the mapping (Should).

## Not checked
`check_pf1_module_routes.ts`: it writes temporary module folders and PF-1 screenshots into the tree, and I may write only these two files, so I left it to CI. A real screen reader. An intended user's unaided walk (D17, D20). The graph tool (`G1 0 · G2 0`) does not see `staffApi(...)` calls, so the page → route links for this module are untraced (a tool gap, not this PR's). `frame-ancestors` on the HTML page (known, raised).

**Verdict: Block**: fix 1, 2 and 3 (Majors); fix 4-12 or list them in the PR.
