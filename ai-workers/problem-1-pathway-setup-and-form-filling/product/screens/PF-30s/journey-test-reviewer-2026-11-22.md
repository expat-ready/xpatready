# PF-30s find box: journey test (reviewer), 22 Nov 2026

Reviewer: a fresh agent that did not build PF-30s (skill journey-test, reviewer role; the one journey score for this check).
Commit: bd0b4da2e91eb78eb3f59db5d46068a081c6f5e7, plus a local merge of `origin/claude/runtime-pf30a` (#2884, the API the box reads).
Copy: `isolated.sh rev_pf30s 4571`, PLATFORM_IDENTITY=local, Sample firms. Chromium (Playwright, headless) at 1440, 1024, 780 to 640 in 10 px steps, 512 at scale 2 (1024 px at 200 %), and 375.
Sign-in: a `POST /api/platform/session/local` token in sessionStorage `xr-staff-session`, as the builder's check does. Screenshots are in the reviewer's scratchpad `walk/shots/` and are not committed. Each one is named below, so it can be shot again with the step.

## Journeys (persona · goal · expected)
1. **Main path.** Case officer, mid-call: "open Lena Park's file". Type the name and press Enter, and the lead opens with the box cleared.
2. **Alternate, by file number.** Typing "p-00001" lists the prospect under Leads and prospects; a click opens it.
3. **Alternate, by email.** Typing the email in capitals finds the person, "Matched: Email".
4. **Empty.** A name nobody has shows "No matches. Try an email, phone or file number".
5. **Error.** The API fails (500 stubbed): the error line shows, the text is kept, and the next key recovers. With a 401 the session ends and the sign-in card shows with no error line. Partial (stubbed): the API's line shows, plus "No matches in what loaded." when nothing came back.
6. **Wrong role.** A Case Officer under "each sees their own" gets no hit for the Case Manager's lead (F6 in the builder's check, re-run).
7. **Recovery.** Back after opening leaves the box empty. A late answer never replaces a newer one. Text of 101 characters shows the 2-to-100 line.
8. **Keyboard only.** One Tab from the logo reaches the box. Arrows wrap, Enter opens the marked row, Tab closes the list, and Escape works in three steps.
9. **Phone, 375 px.** Tap Find, type, tap a row, and the lead opens. The Close button closes the box.
10. **Across the boundary.** Sales frame `/front-office/leads` has the same box. Opening a hit hands over to the lead or prospect page.

## What held
* Journeys 1 to 4, 6, 7 and 10 work as the concept says. Highlighting ignores accents ("zoe" marks "Zoë", "angstr" marks "Ångström"). A hostile name `<img onerror>` is shown as text and does not run. With 9 matching leads the box shows 8 rows and "8 best matches. Type more to narrow." (a3-best-matches-1440). An unknown kind shows under "Other", in the API's order (a5-other-partial-1440).
* Partial with no hits: "Some results could not be loaded" and "No matches in what loaded.", and the live region says both (a4-partial-1440). With a 401 the box goes away and the sign-in card shows, with no error line (a6-401-1440).
* axe (WCAG 2.0, 2.1 and 2.2 A/AA) finds 0 violations with the list open at 1440 and 375, in the partial state and in the error state. No page or console errors.
* Speed: the list draws about 0.3 s after the last key, including the 250 ms pause. The door answers in p95 51 ms (builder's check, n=21). `api.log` records only the route: the typed text is never logged.
* At 375 px (d2-open-375) and at 1024 px at 200 % zoom (512 CSS px, the Find button mode) there is no sideways scroll, and the list fits the screen.

## Findings
| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| J1 | Major | From 640 to 719 CSS px, the 14 rem input spills out of its shrunken container in PlatformFrame and covers the start of the staff name: 47 px at 640, 10 px at 700. Below 676 px the 28 rem list also starts left of the screen: -21 px at 640, with group words and names cut off. This is a 1280 px laptop at 200 % zoom (640) or a 1366 px laptop at 200 % (683). | width scan; e-home-640x1, e-home-700x1, e-open-640x1; `find-box.tsx:117` `sm:w-56`, `:124` `sm:right-0 sm:w-[28rem]` | Let the input shrink (`w-full` inside a `sm:w-56` wrapper with `min-w-0`) or switch to the input from `md`. Cap the list at `min(28rem, 100vw - 2rem)` and keep it inside the screen. Add 640 and 700 to the width loop. |
| J2 | Minor | BR-1's "a modal dialog or drawer is open" clause never applies to this app's dialogs: Radix `Dialog` and `Panel` set no `aria-modal` (checked: `null`). At 375, "/" on a button in the lead page's Engage dialog opens the find box behind the dialog, and it still covers the header after the dialog closes. At 1440 the "/" is simply swallowed. | c2-dialog-slash-375, c3-after-dialog-375; `find-words.ts:65` | Also match `[role='dialog']` (or Radix's `[data-state='open'][role='dialog']`), and add a pass and a fail test. |
| J3 | Minor | Below 640 px, Close (and the third Escape) leave focus on `BODY`, because the focused Close button hides itself. | step 9; `find-box.tsx:121`, `:88` | Return focus to the Find button. |
| J4 | Minor | Enter during the 250 ms pause does nothing, even when the earlier list is still shown with its first row marked (`aria-selected`). The quick typist's "type and Enter" is silently dropped. | step 1: url stays `/home`; `find-box.tsx:85` | Either do not mark rows while searching, or let Enter open the top hit when the answer arrives. |

## Score (0, ½ or 1, with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 to 3, 9 and 10 open the right record (builder's check F1, F2, F9 re-run; a3, d2) |
| Next step obvious | 1 | Placeholder "Find a person or file", "/" key label from 1024 px, first row marked as Enter's target |
| Plain words | 1 | "Matched: Name / Email / File number"; every state line plain; numbers are file numbers |
| Feedback and state | ½ | Every BR-6 state is drawn and announced, but Enter is silently dropped during the pause (J4) |
| Correct data | 1 | view.own enforced by the server (F6); late answers dropped (F8); nothing typed logged or stored |
| Error recovery | 1 | 500 keeps the text and recovers on the next key; 401 hands over to the sign-in card |
| Accessibility and screen sizes | ½ | axe 0 (2.2 AA); keyboard complete; but J1 at 640 to 719 px and J3 focus loss |
| Speed | 1 | List about 0.3 s after the last key, including the 250 ms pause; door p95 51 ms |
| Visual quality | ½ | Team tokens, clean at 375, 1024 and 1440; overlap and clipping at 640 to 719 (J1), header covered after a dialog (J2) |
| Trust and sources | 1 | Partial answers said plainly; why each row matched; no hidden counts (BR-8); no AI |

**Score 8.5 / 10, pass (8 or more, no 0).** The fixes worth most: J1 (raises screen sizes and visual quality), then J4 (feedback), then J3.

## Not tested
A real screen reader (live region checked only as DOM text). An intended user's unaided walk (D17 and D20 stay with the founder). Firefox and Safari: "/" quick find was not tested, though `preventDefault` is in place. An input-method composition (code read only: `isComposing` is guarded). A terms-pending person in SalesFrame. Client and case journeys (Not built, concept §6b).
