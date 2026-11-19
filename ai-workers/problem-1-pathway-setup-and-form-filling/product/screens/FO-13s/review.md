# FO-13s part 1 review: the Identity check panel (R1.110), PR #2309 at 70c36466e

Independent reviewer, 19 Nov 2026 (screen-review skill, fresh context). I read the brief Part B (`lead-b-front-office`, which wins), `concept.md`, `challenge.md`, the diff, STANDARDS, EXPERIENCE and QUALITY. I ran the app on isolated copies :4571 and :4572 (both now stopped) with Part A's 422 rule applied locally and not reviewed. The journey test is in `journey-test-reviewer-2026-11-19.md`: **9/10, pass**.

## Verdict
**Ship after fixes.** The panel does its job. Every server rule shows on the right field. Data stays single under a double click and under a lost answer. P-735 holds: no screen text, test name or message cites the Code. Three Musts are open, and one of them is CI red.

## Runs
* `check_fo13s_identity_browser.ts`: 24/24, twice.
* `j_110.ts`: 10/10, twice.
* `module-cards.py pr` (local, relative paths): PASS. **CI `module-cards` at 70c36466e: FAIL** ("module web-shell: 4 file(s) changed … card web/src/MODULE.md not" changed).
* Reviewer probes: lost answer, double click, Other without a note, 11 MB, 512 px at 2×, a person with no name, list 500 with Try again, BF by URL (403).

## D1-D20 (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | BR-1 to BR-9 behave as written. BR-9 wording slips on the prospect page for a person with no name (issue 5) |
| D2 Data integrity | 5 | 1 row after a double click. 1 row after the server stored and the answer was lost, then Save again (same `requestId`). 0 rows after 422, 400 or 415. Server 403 for BF's POST and copy link |
| D3 Reuse | 4 | Reuses Panel, Field, Notice, `can`, `useLock`, `useReturnFocus`, `arrivedLabel`. The error summary is a one-off box where the team has `Notice title="There is a problem"` (complaints drawers) |
| D4 Rule integrity | 4 | BR-3 parse order is shown as the server answers it (type, then expiry, then copy) |
| D5 Stability and recovery | 4 | Lost answer, double click and load error all recover. The retry path has no test (issue 2) |
| D6 Governance | 4 | Insert-only. Who and when on every row. One audit line per check |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | Sales › Leads › Lead trail; the section sits under Person |
| D9 Flow | 5 | Record in 5 actions; the empty state names the next step |
| D10 Language | 4 | Codes in plain words; hints on last 4 and copy. One date format mixes with another (issue 6) |
| D11 Feedback and state | 3 | Toast, busy Save, locked form, Try again. Loading is text, not skeletons (issue 3) |
| D12 Visual quality | 4 | Team tokens. File input text sits high in its box (`screenshots/expired-1440.png`) |
| D13 Accessibility | 5 | axe clean in 4 states; keyboard Save with focus return; 375, 1024 and 1440 px and 200 % with no sideways scroll |
| D14 Team look | 4 | As D3 and D12 |
| D15 Speed | 5 | Lead plus panel 225 ms warm; one list request per view |
| D16 Testability | 3 | BR-7 retry untested; CI `module-cards` red; graph G3 lists the 4 identity routes as untested or unused (it cannot see `path()` or `${BASE}/api` calls, and the runs show they are used and tested) |
| D17 First use | simulated only | No intended user walked it |
| D18 Provenance | 4 | Checked-by and when; the expiry rule is labelled the firm's own (P-735) |
| D19 Closure | 4 | Lead → check → Send warning gone (J-110 W1-W4). Send runs through the API, named scaffolding (P-33) |
| D20 Pain and wow | simulated only | Founder's walk |

## BIC (EXPERIENCE §6)
| Check | Score | Evidence |
|---|---|---|
| 01-03, 05-10, 12, 15-17 | N/A | No case facts, AI, applications, signing or review on this panel |
| 04 | Met | "(optional)" in words on 6 fields; malformed input refused at the field (`panel-1440`) |
| 11 | Met | One outline header button; one primary, "Save check" (`lead-1440`, `panel-1024`) |
| 13 | Partly | Errors show on the field and in a top summary, with the same words and the input kept. The summary title is "One thing to fix", not "There is a problem", and it has no links to the fields (`expired-1440`) |
| 14 | Met | No chip or icon needs a tooltip; help is visible as hints |
| 18 | Partly | The empty state teaches; read-only says why (BF, RO); failed save and load are visible. Loading is a text line, not skeletons (`identity-panel.tsx:177`) |
| 19 | Met | One heading and one primary per panel; no internal ids (`lead-1024`, `listed-1440`) |
| 20 | Met | Keyboard-complete; 200 % at 1024 px with no sideways scroll (probe `zoom200-panel`) |

## Issues, ranked
1. **Must (Major): CI `module-cards` fails at 70c36466e** (STANDARDS §7 [M], P-615 (3)). Fix: add the row fragment `web/src/MODULE.rows/FO-13s.md` (Entry points: `modules/front-office/compliance/identity/identity-panel.tsx`; Tests: `tests/check_fo13s_identity_browser.ts`, `tests/journeys/j_110.ts`), or put `Card unchanged: <reason>` in the PR body. A new folder favours the fragment.
2. **Must (Major): BR-7's screen rule has no test** (STANDARDS §3.10 and §7 [M] "a rule's test fails when the rule is removed"; challenge M2 asked for exactly this test; the PR body says every BR has a pass and a fail case). The behaviour is right: my probe gave 1 row and the same id twice. But if `requestId` were renewed on every Save, both suites would still pass. Fix: in the browser check, `page.route` the first POST, call `route.fetch()` then `route.abort()`, then Save again and assert 1 row and the kept-details line.
3. **Must (Major): loading draws no skeletons** (EXPERIENCE §4 [M], concept §4 "skeleton rows", BIC-18 Partly). `identity-panel.tsx:177`. Fix: use `sales/loading.tsx` `Loading` (or `Skeleton` rows), and keep `role=status` with its label.
4. Should: BIC-13 summary (`identity-panel.tsx:121-122`). Use the team's `Notice tone="danger" title="There is a problem"`, with each item a link or button that focuses its field.
5. Should: on the prospect page, a person with no name gets "No identity check is recorded for (no name)." The Send warning says "the signer" (`prospect-page.tsx:113` passes `p.person.name`, which the server fills with "(no name)"). BR-9 says word for word. Fix: pass the empty string when the name is "(no name)", or build the name from the person's names, as the lead page does.
6. Should: the expiry shows the raw "2026-11-19" beside "Nov 19, 2026, 3:24 p.m." (`identity-panel.tsx:60`). Format the date string as a date without UTC conversion (challenge m4).
7. Should: J-110's screenshots, cited in the PR body (`product/screens/J-110/`), are not in the commit. They are untracked in the worktree. Commit them.
8. Should: Open copy's bearer fetch does not apply the 401 rule (`identity-panel.tsx:37-41`), though the Lead response to M3 promised "the same handling of a 401". Route a 401 through `endSession` as `postForm` does.
9. Should: concept §4 draws a table with columns, but the build is a list of cards. That works at every width, but the change is not recorded. Note it in the concept or in build notes. There is no `build-notes.md`.

## Concept, scope, rules
* The prospect mount (M1) follows the brief's "lead and prospect page". Nothing outside "What gets built" was added. The retrofit is recorded: there is no team screen (concept §2).
* No personal names. P-735 holds: a grep of the diff finds no "Code", "24(2)", "SOR/" or "requires" in screen text, test names or messages.
* Server authorisation on every route was checked by URL. There is no request per row, no migration and no API change.

## Could not check
A real screen reader. An intended user's walk (D17, D20). The 410 expired-link path. A server-side 413 (the client pre-check stops the upload). Mutation runs that rebuild the web (rule-removal checks were judged from the assertions, apart from issue 2, which the probe showed).

**Verdict: Block.** Fix 1 (CI `module-cards`), 2 (BR-7 retry test) and 3 (loading skeletons), then re-review the new commit. Issues 4-9 are Shoulds: fix them here or list them in a follow-up row.
