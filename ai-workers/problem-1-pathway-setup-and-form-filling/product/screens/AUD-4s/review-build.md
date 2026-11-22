# AUD-4s part 2: build review, round 1 (PR #2916, commit 4f779ef1d4155ad56a272ea87803220c3d676869)

Independent reviewer (did not build it); skill screen-review plus journey-test (reviewer role). Spec: `concept.md` C1–C9 over `concept-draft.md` and `design/draft-1.html`; brief `design/build-lead-c-briefs/AUD-4.md` with its "Part 2 notes after #2339". Copy rv_aud4s on :4444 only (never :4400, 4441 or 4448); AI_LIVE=off; US$0.
Later commits on the branch (00ffa82b3, c71aa61d4) change only the check's usage comment and three screenshots: no change in behaviour.

**Verdict: Ship (Approve).** No Blocker, no Major. Four Minors (Should) below, plus two items outside this diff for the Lead.

## Evidence run
* `check_aud4s_activity_log_browser.ts` on a fresh isolated copy, twice: **44/44 PASS, exit 0** both times. This covers W1 (Owner by keyboard, then Admin), DW1, DW1b, DW2, DW3, DW3b, DW5, DW6, DW7, DW8 and C9, each with its fail side. Also axe at 375, 1024 and 1440 px, and no page errors.
* My own walk (Playwright, headless, a different seed): 200 % zoom at 1024 px (512 css px) by keyboard; address edge cases; a session ended elsewhere; two tabs exporting at once; reload mid-export; Record reference typed with Enter and then reloaded; long and non-English filter text; timings. Screenshots are in the reviewer's scratchpad. The builder's set is `screenshots/aud4s-*.png`.
* Timings: first view 379 ms (navigation to first line); area filter 58 ms; API read 13–33 ms.

## Builder's open questions, judged on the evidence
1. **"ExpatReady support" vs C4.** Settled. The brief's Part 2 notes (Build Lead C, Lead 96 agreed, 19 Nov 23:1x) say the page shows `who` "exactly as the API gives it", and that note wins over C4 and C7. So does the seven-area list. `render.ts:40-42` confirms the API's words, so the page and the CSV agree. Not a finding.
2. **C9 time zone.** I confirmed the gap. `GET /platform/me` (`identity/service.ts:202`) has no zone. No read an `agent/audit:read` holder can call carries `platform.time_zone`: `/platform/offices` needs `agent/settings:list` and is per office. The page never uses the browser's zone, says "UTC" once, and follows `timeZone` when it arrives (C9 check with a stand-in, PASS). BR-11 is met only in part. That needs a change to AUD-4 or `/me` (Lead's call), not to this page.
3. **Integrity pill.** It is correctly absent (C2, row AUD-4s-i). The check asserts no integrity wording.
4. **j_88 outside the touch list.** The concept's "Tests" section names `tests/journeys/j_88.ts`, and the concept wins over the row. The same goes for the `routes.tsx` and `account-sections.ts` lines (C5). Not a finding.
5. **§4b re-read (C8 Minor 8).** This is not a code finding. The concept makes the re-read a precondition for part 2's label. Clio's "Beats" line is kept out of the PR body as C8 asks. **The Lead should confirm the re-read is done, or waive it, before the label.**

## D1–D20
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | R1.88 "filters by person, record and date and exports; other roles refused": all walked. BR-11 is in UTC until a zone read exists (question 2). |
| D2 Data integrity | 5 | Read-only (BR-2 asserted). One export makes one line (DW3, DW3b). Two tabs make two exports and two lines, as they should. The firm wall holds (no FIRM-B-ONLY). |
| D3 Reuse | 4 | One zod parser (`contract.ts`). Team `Dialog`, `Notice`, `Table`, `Field`. AUD-5's keep sentence is reused, not retyped (DW8). |
| D4 Rule integrity | N/A | No rules authored here. |
| D5 Stability | 4 | Reload mid-export leaves one line and a clean page. Double press gives one file (DW3b). A session ended elsewhere shows the "Signed in elsewhere" card with no firm text. Back leaves the page, because filters use `replace`. |
| D6 Governance | 4 | This screen is the governance view. The export is itself a line. The keep period is stated. |
| D7 AI trust | N/A | No AI. |
| D8 Orientation | 4 | The trail reads My account › Activity log (C5). The menu entry is highlighted. |
| D9 Flow | 4 | Shortcut, then a line, then "Show only this person's changes", then export: each step is one action. |
| D10 Language | 4 | Concept copy is word for word. The change chip shows AUD-4's raw field and ISO values (`lastSignInAt: (empty) → 2026-11-22T05:37:35.210Z`), as BR-5 specifies. |
| D11 Feedback | 4 | Skeleton with status text. Dimmed `aria-busy` while loading. "Showing N lines". "Export saved: … The export is now a line in the log." |
| D12 Visual | 4 | Dense, aligned 44 px rows, team tokens (`aud4s-3-line-open-1440.png`). |
| D13 Accessibility | 4 | axe is clean on every state at all widths. Keyboard walk W1 passes, and so does 200 % zoom at 1024 px. Minors 1–3 below. |
| D14 Team look | 4 | Uses `PlatformFrame` and team controls. |
| D15 Speed | 5 | See timings above. One read per page plus keep-periods once; no request per row. |
| D16 Testability | 4 | 44 checks, each with a fail side, rerun twice by me. Graph G3 lists both AUD-4 routes as untested. That is a tool blind spot: `graph.mjs` reads only `api(` and `call(`, not `staffApi`, and only `C\d+.\d+` ids. It is not a gap in this PR. |
| D17 First use | simulated only | Needs an intended user. |
| D18 Provenance | 4 | Who, area, action code and raw detail are under Advanced. The keep sentence comes from AUD-5. |
| D19 Closure | 4 | R1.88 runs end to end: read, filter, open, export, then the export line appears. |
| D20 Pain/wow | simulated only | Needs an intended user. |

**BIC-01–20:** N/A. This is a firm-settings screen, not a case-side one (P-407 scope, concept §4c). The §1–§5 [M] lines were checked directly instead.

## [M] lines (STANDARDS, EXPERIENCE): met, except as below
* Met: authorisation on the server (403 on both routes, DW1); deny by default (`Gate` plus the 403 branch); cursor paging with no skip or repeat (DW5); field errors on the field (BR-3); no `any`; module card row; why-comments; axe on every state; keyboard path; all §4 states drawn (first-use only by code, see build notes); status shown in text ("(left the firm)", "Support session"); one primary action.
* Partly met: **EXPERIENCE §1 / §4 long content and §2.12 "1024 px works"** (Minor 1); **§2.12 keyboard path / WCAG 2.4.3** (Minor 2); **§2.10 tooltip** (Minor 3).

## Issues, ranked
1. **Should (Minor). A long Advanced filter value makes the page scroll sideways.** At `activity-log-page.tsx:198-201` the chip's `<li>` has no `max-w-full`/`min-w-0`, so the button's `max-w-full` and `truncate` cannot take effect. Failing case: at 1024 px, `?entityKey=` set to 60 CJK characters gives scrollWidth 1053 against 1024; 120 ASCII characters gives 1149. At 1440 px, 140 CJK characters gives 1856. The field accepts 200 characters. A UUID fits. Fix: `className="max-w-full min-w-0"` on the `li`.
2. **Should (Minor). Focus is lost after removing a chip or pressing Clear filters.** At `:199` the chip unmounts, and at `:225` (and `:212`) the empty state unmounts. In both cases `document.activeElement` becomes `BODY`, and a keyboard user has to Tab through the menu again (about 15 stops). Fix: move focus to the next chip, or to the filters section or the sentence, after removal and after Clear.
3. **Should (Minor). The shortcut's tooltip only appears on hover.** At `:178` the concept §5 tooltip is a `title` attribute: nothing shows on keyboard focus, and there is no `role=tooltip`. Fix: the team's tooltip, shown on focus, or the sentence as a visible hint.
4. **Should (Minor). Refused-filter text shows codes.** `?area=nonsense` shows the server's `"area" is one of team, front-office, money, …`. This only happens from the address, and DW2 asks for the API's words. Optional: map the field to its label.

**Outside this diff, for the Lead (AUD-4, not this PR):**
* (a) The export's file name and its line summary use the exclusive `to`, one day past the chosen To: To = 22 Nov gives `activity-log-2026-11-15-to-2026-11-23.csv`, and the summary reads "… to 2026-11-23T00:00:00.000Z" (`service.ts:190,204`).
* (b) The C9 zone field (question 2).

## What I could not check
A real screen reader; the 1Password and Atlassian lines in §4b (hosts not reachable here); D17 and D20 (an intended user). The walk was scripted headless Playwright, not a visible pane. The `j_88` recorded walk was not run: ffmpeg is absent here, and `j_88` imports the same check, which passed.

Journey test: `journey-test-reviewer-2026-11-22.md`, **8.5/10, pass**.

Reviewer: Approve 4f779ef1d4155ad56a272ea87803220c3d676869

## Round 2 (diff-only: 4f779ef1d..dc006e04e, `prototype/studio`; commit dc006e04e0e4e70922fd785b4e4778656a80a2fd)

**Verdict: Ship (Approve).** No Blocker, no Major. All seven breaker items (M1–M3, m3, m4, m6, m7) and my Minors 1–3 are fixed. One new Minor.
The diff touches `activity-log-page.tsx`, `contract.ts` and the check only. No API change, no migration.

**Run:** check on a fresh copy rv_aud4s :4444 gave **59/59 PASS, exit 0**. A second fresh copy gave 59/59, and I then probed it myself. Screenshots the check rewrote were restored to the commit.

| Item | Fix | Holds? (evidence) |
|---|---|---|
| Review Minor 1, breaker m1 (long chip) | `li min-w-0 max-w-full`, `span min-w-0`; `overflow-wrap:anywhere` on the sentence, the empty heading and the confirm | Yes. Check: 60 CJK characters at 1024 px, 120 at 375 px, 200 at 1440 px, no sideways scroll; its fail side widens the page |
| Review Minor 2 (focus lost) | `removeChip`/`clear` record a target; an effect on `chips.length` focuses the next chip, else the previous one, else the Filters box (`tabIndex=-1`, focus ring) | Yes. Check: next, previous and last chip, and Clear filters; never `BODY` |
| Review Minor 3 (tooltip) | `role=tooltip` span linked by `aria-describedby`, shown on `peer-hover`/`peer-focus-visible` | Partly. It now shows on keyboard focus and is the button's description. New Minor R2-1 below |
| M1 (Who column collapses) | `w-40 min-w-40 max-w-48`, `overflow-wrap:break-word` | Yes. With a Person filter and no pill, the Who column is 160 px at 1440, 1024 and 700 px; hidden below 640 px, as designed (200 % zoom on 1024 is 512 css px). Names wrap at word boundaries (`r2-person-1024`). The check's fail side runs on the old classes |
| M2 (A's filters survive sign-out) | `ActivityLogPage` empties the address while there is no token | Yes. `useStaffToken` reads sessionStorage synchronously (`session.ts:21,49-52`), so a signed-in load never wipes its filters (DW6 from the address still passes). After a session ends elsewhere, the address is empty and `client-alpha` is not in the DOM. DW1b now asserts that the address is empty and B has no chips or person. Trade-off: a filtered link opened before signing in loses its filters. That is consistent with BR-13 and is not a finding |
| M3 (31 Dec 9999 crashes) | `isDay` accepts years 1970–9998 | Yes. `?to=9999-12-31`, `?from=9999-06-01&to=9999-12-31`, `?from=0001-01-01` and `?to=275760-09-13` all give "Pick a date." with the frame and Sign out intact, and no page error. `9998-12-31` reads |
| m3, m6 (stale refusal and status words) | An effect on the read `key` clears `exportError` and `said`; the shortcut's words are deferred through `sayAfter` | Yes. Check: a filter change after a 413 clears both. DW7 still says "Person filter cleared. Done by filter cleared." |
| m4 (confirm before names load) | `canExport` needs data that is not a placeholder | Yes. Enter on Export while the first read is held opens no dialog (`aria-disabled=true`). After the load, the confirm names "Second representative (Sample)" |
| m7 (`dayStart` at a skipped midnight) | Steps forward 15 minutes at a time until the zone's day is reached (at most 2 h) | Yes. Santiago on 6 Sep 2026 gives 04:00Z (01:00 local); Toronto is unchanged (pure check) |

**Regression scan of the diff:** nothing else breaks. All 44 round-1 checks still pass, among the 59. axe is clean on every state, including the tip's screenshot `aud4s-15`. There are no page errors. The `key` effect also runs on mount and clears `said`, which is harmless.

**New Minor (Should):**
* **R2-1. The tip cannot be hovered or dismissed (WCAG 1.4.13).** At `activity-log-page.tsx:191-194` the tip has `pointer-events-none` and is shown only while the button is hovered or focused. Moving the pointer onto the tip hides it, and Escape does not hide it while focus stays on the button (probe: onHover true, onTip false, afterEsc true). It covers nothing important today; it does not overlap the Advanced toggle. Fix: show it on the wrapper's hover (`group`) with pointer events on, and hide it on Escape.

Round-1 items for the Lead are unchanged: the C9 zone field, AUD-4's export name and summary one day past To (breaker m5), and the §4b re-read before the label (C8 Minor 8).

Reviewer: Approve dc006e04e0e4e70922fd785b4e4778656a80a2fd
