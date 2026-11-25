# FO-13s part 1 review: the Identity check panel (R1.110), PR #2309

Independent reviewer, 19 Nov 2026 (screen-review skill, fresh context). I read the brief Part B (`lead-b-front-office`, which wins), `concept.md`, `challenge.md`, `break-report.md`, the diff, STANDARDS, EXPERIENCE and QUALITY. I ran the app on isolated copies :4571 and :4572 (both stopped) with Part A's 422 rule applied locally and not reviewed. The journey test is in `journey-test-reviewer-2026-11-19.md`: 9/10 at 70c36466e, and **9.5/10 at 3315518af** (feedback and state now 1).

## Round 2: 3315518af (diff 70c36466e..3315518af)
* **Verdict: Ship.** The three Musts from round 1 are fixed and checked. The breaker's two Majors are fixed and tested. CI `module-cards` now passes.
* **Runs:**
  * `check_fo13s_identity_browser.ts`: 28/28, twice (before and after a mutation run).
  * `j_110.ts`: 10/10.
  * `module-cards.py pr <file> <body>` run as CI runs it: PASS at 3315518af and FAIL at 70c36466e. In round 1, I said it passed locally. That was wrong: I had passed the file names as arguments, not as a file.
  * GitHub checks at 3315518af: `module-cards` success, `guard` success, `pr-rules` success.
* **Mutation (STANDARDS §7):** I changed the panel to renew `requestId` on every Save and rebuilt. The BR-7 check went red ("…same requestId and stays one check", ids differ), with 21/28. I reverted it and got 28/28 again.
* **Probes at 512 px ×2 (1024 px at 200 %):**
  * Loading draws the sales `Loading` skeleton (`[data-loading]`).
  * Cancel with typed details asks "Discard the details you typed?".
  * The summary is the Notice "There is a problem".
  * A 470-character unbroken note wraps, with no sideways scroll.
  * The prospect page for a person with no name says "…for the signer.", matching Send.
  * The expiry shows "Nov 19, 2026".

| Round 1 issue | Status at 3315518af |
|---|---|
| 1 Must: CI `module-cards` | **Closed.** `web/src/MODULE.rows/FO-13s.md` (Entry points and Tests, 2 lines); CI green |
| 2 Must: BR-7 retry test | **Closed.** route.fetch then abort, Save again, same id, 1 row; it fails when the rule is removed (verified above). It runs without a copy (a Playwright multipart limit, stated in the test) |
| 3 Must: loading skeletons | **Closed.** `identity-panel.tsx:188` uses `Loading` |
| 4 Should: BIC-13 summary | Mostly closed: the team Notice, "There is a problem", the same words (`:133`). **Open (Should):** no link from each item to its field. Focus already goes to the first field in error |
| 5 Should: "(no name)" | Closed (`prospect-page.tsx:113`) |
| 6 Should: expiry format | Closed (UTC `dateStyle: medium`) |
| 7 Should: J-110 screenshots | Closed (committed) |
| 8 Should: 401 on Open copy | Closed (`identity-panel.tsx:49`, as `postForm`) |
| 9 Should: table to cards | Accepted. Concept §4 already allows stacked rows; the cards read as those rows at every width. No action |
| Breaker MJ-1, MJ-2 | Closed and tested (a 470-character note in the width checks; a half-typed date refused on its field, pass and fail) |

**Open Shoulds (none blocks; fix here or list in a follow-up row):**
* **(a) BIC-13 links.** Make each summary item a link or button that focuses its field (`identity-panel.tsx:133-135`).
* **(b) Breaker m5 (BR-8).** Once checks exist, a viewer without the record key sees no line saying why Record is missing. Show RECORD_REASON under the heading, not only in the empty state.
* **(c) Breaker m7.** "Checked" times use the browser's zone, not the firm's (`sales/time.ts` `arrivedLabel`, shared with the lead page; challenge m4).
* **(d) Breaker m1 and m2.** After a lost answer, an edited retry gets 409 and then a second row. The discard question then says nothing about the check that was already stored.
* **(e)** The file input text sits high in its box (`screenshots/expired-1440.png`).

## D1-D20 at 3315518af (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 5 | BR-1 to BR-9 behave as written on both mounts, including the BR-9 fallback |
| D2 Data integrity | 5 | 1 row after a double click and after a lost answer; 0 rows after 422, 400, 415 or a half-typed date; server 403 by URL |
| D3 Reuse | 5 | Panel, Field, Notice, Loading, `can`, `useLock`, `useReturnFocus` |
| D4 Rule integrity | 4 | Server parse order shown as answered |
| D5 Stability and recovery | 4 | Lost answer, double click, load error, reload all recover; Should (d) |
| D6 Governance | 4 | Insert-only; who and when; one audit line |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | Sales › Leads › Lead trail |
| D9 Flow | 5 | Record in 5 actions; the empty state names the step |
| D10 Language | 4 | Plain words; dates in words. Should (c) |
| D11 Feedback and state | 4 | Skeleton, busy Save, toast, team Notice, Try again |
| D12 Visual quality | 4 | Team tokens. Should (e) |
| D13 Accessibility | 5 | axe clean in 4 states; keyboard Save; 375, 1024, 1440 px and 200 % with no sideways scroll, even with a long note |
| D14 Team look | 5 | Team components throughout |
| D15 Speed | 5 | Lead plus panel 225 ms warm; one list request |
| D16 Testability | 4 | Every BR has a pass and a fail case; the BR-7 mutation is caught. Graph G3 still lists the identity routes as untested (a tool gap: it cannot see `path()` calls) |
| D17 First use | simulated only | No intended user walked it |
| D18 Provenance | 4 | Checked by and when; the expiry rule is labelled the firm's own (P-735) |
| D19 Closure | 4 | J-110 W1-W4. Send runs through the API, named scaffolding (P-33) |
| D20 Pain and wow | simulated only | Founder's walk |

## BIC (EXPERIENCE §6) at 3315518af
| Check | Score | Evidence |
|---|---|---|
| 01-03, 05-10, 12, 15-17 | N/A | No case facts, AI, applications, signing or review |
| 04 | Met | "(optional)" in words; a malformed or half-typed date is refused at the field |
| 11 | Met | One outline header button; one primary, "Save check" |
| 13 | Partly (Should) | Field and summary carry the same words; input kept; focus on the first error; no field links (a) |
| 14 | Met | Nothing needs a tooltip; hints visible |
| 18 | Met | Skeleton; the empty state teaches; failed load and save visible; read-only reason when the list is empty. Should (b) for a list with rows |
| 19 | Met | One heading and one primary per panel; no internal ids (`lead-1024`, `listed-1440`) |
| 20 | Met | Keyboard-complete; 200 % at 1024 px with no sideways scroll (probe) |

## Concept, scope, rules
* The prospect mount follows the brief. Nothing outside "What gets built" was added. The retrofit is recorded: there is no team screen.
* No personal names. P-735 holds: no screen text, test name or message cites the Code.
* Authorisation is on the server. There is no request per row, no migration and no API change.

## Could not check
A real screen reader. An intended user's walk (D17, D20). The 410 path, which the breaker saw. The BR-7 retry with a copy attached (a Playwright limit; the server's own replay with a copy is covered by FO-13i).

**Verdict: Approve 3315518afccf7c6d76d4d96235b415b2c3d0d381.** No open Blocker or Major. Shoulds (a)-(e) are fixed here or listed in a follow-up row.

## Round 3: 1efbf26e7 (diff bf750ef65..1efbf26e7, P-277), 20 Nov 2026
* **Verdict: Ship.** Nothing in the panel changed (`compliance/identity/` and `prospect-actions.tsx` untouched since bf750ef65). Journey score holds at **9.5/10** (`journey-test-reviewer-2026-11-19.md`, round 3).
* **Merge 2b48e0ca2:** not conflict-free. `lead-page.tsx` had one conflicted hunk at the Phone row (`git show --cc`). It was resolved correctly: main's `PhoneRow` is kept and the panel mount sits under Person (`lead-page.tsx:126`). The prospect mount is unchanged (`prospect-page.tsx:133`). `MessagesPanel` comes after Enquiry (`:136`). Heading ids are unique (`fo-person`, `fo-identity`, `pf-messages`). axe is clean on the merged lead page. No sideways scroll at 375, 1024 or 1440 px with the 470-character note (my `lead-375`/`lead-1024` runs). The server's #2305 rule answers 422 with `fields.documentExpiry`. The panel's existing field mapping shows it under Expiry date and in the summary, in the same words. The client does no date check of its own, so no second rule can drift from the server's.
* **f026e1568, J-110 W5:** the new assertion waits for the POST's own response and needs status 422 with `documentExpiry` in the body. If the server rule is removed, the server answers 201, so the assertion fails (reasoned from the code, not run as a mutation). The W5 claim no longer depends on a local patch.
* **f026e1568, the focus wait: legitimate, and it hides no bug.** `useReturnFocus.back` focuses after a 60 ms timer (`sales/prospect-actions.tsx:35-40`). I ran a probe copy of the check (under ignored `studio/var/`, since deleted). At the drawer's detach, focus is on `BODY`. Once the wait ends, focus is on Record a check, and it stays there at +0, 100, 300, 800, 1500 and 3000 ms. The element handle is taken after detach, so a remounted button would make the wait time out and the check fail. The wait therefore cannot pass on a lost focus. The short window with focus on body comes from the shared hook and is used by every sales panel. It is not this PR's (Minor, no action here).
* **1efbf26e7:** I viewed the screenshots. They show the merged page (Phone Edit, Messages) and the server's refusal on the field (`expired-1440`, J-110 `w5-expired-1440`).
* **My runs at 1efbf26e7** (isolated copies :4446 and :4447, real routes; both stopped; the screenshots the runs rewrote were restored):
  * `j_110.ts`: 11/11, exit 0.
  * `check_fo13s_identity_browser.ts`: 28/28 twice, plus 28/28 in the probe run.
  * `tsc` web: exit 0.
  * Graph: G1 0, G2 0 (G3 unchanged, the known `path()` tool gap).
  * any ratchet: 416, the same as base 568e240fd.
  * GitHub at the head: `guard`, `module-cards` and `pr-rules` succeeded; CodeQL was still running.
* **Open Shoulds (a) to (e) from round 2:** unchanged. None blocks. Fix them here or carry them in a follow-up row.
* **Done when:** method, document type, country and expiry, with who and when (J-110 W3). An expired document is refused in words, by the server (W5, 422). The panel shows on the prospect page (BR-9 and M1 checks). Met.

**Verdict: Approve 1efbf26e795aaca13f82ca53f9850e75e4afd65f.** No open Blocker or Major.
