# Review: CS-NT1 part 4 (CS-NT1d), Notes and timeline on the case page, round 1

PR #3822 at **d4070b5862289897f800e5a85f33ce8a92f378a0**. The PR's own diff is `075bde483..d4070b586`: 1069eaef3, #3649's approved head, adds only #3649's review records on top of 075bde483, so the `CS-NT1c/*` "deletions" in `1069eaef3..d4070b586` are not this PR's changes, and a merge keeps them. Reviewer: a fresh context that did not build this screen. Concept r2 and `challenge.md` were read from `origin/claude/runtime-csnt1d-panel` (#3694). Rulings: (1) caseScope, (2) access lines hidden, (3) under the header, (4) the bell's words. Journey test: `journey-test-reviewer-2026-11-26.md` (**8/10, pass**).

## Verdict: Ship after fixes
The panel is well made. The API decides, conflicts keep words, a double Add stores one note, part 3s is enforced and tested, and History reads well. Three Majors remain, each contained.

## Rulings and the builder's two deviations
* **Ruling 1** met: `peopleOf` keeps to caseScope, and the add refuses anyone else (400, nothing written; DP7). **Ruling 2** met (`ACCESS`, DP12). **Ruling 3** met (`cases.tsx:397`, under the header before StageStrip). **Ruling 4** deviates (PR question 1).
* **Ruling 4: half of the reason holds.** The row has no actor (AG-7-39 r10: ids only), so "{name}" needs a PF-18n change. That part holds. The PR also says "no labeller exists yet for the `case` item kind". **That is wrong.** `store.ts:52` labels `case` items already: the officer's row came back `label: "C-2026-00004"`, `link: /cases/<id>`. The bell reads "You were mentioned in a note · C-2026-00004", so "on {case}" is delivered today. Recommendation: accept the wording and correct the PR body. The tech lead rules on "{name}" (a follow-up row with a stored actor). Minor m1 below.
* **Part 3s folded in: accept.** It is about 5 lines in `subjectOf` (`service.ts:134`) and covers every case read and act. DP7 fails when it is removed: the notes, timeline and people reads give 404 → 200 for a Case manager without `view.all`. The concept made it a prerequisite. Caveat: the 404 words "This case is not in the firm you are signed in to." now also show for a same-firm case outside the person's scope (m6).

## Issues (ranked)
1. **Major (Must): a kind chip can claim "Nothing has happened on this case yet." falsely, with no way to page.** `case-notes.tsx:228` drops access lines on the client. When a page is all `viewed` (the API gave 50/50 `viewed`, `more: true`, under Documents), `:239` shows the empty line and `:249` hides Show older (`shown.length` is 0), so the older upload is unreachable (journey J5). Every document view writes a line, so this is common on a busy case. *Fix:* while the filtered lines are fewer than `limit` and `hasNextPage`, fetch the next page. Show the empty line only when there is no next page. Add a DP12/DP8 case: 60 views newer than one upload; the Documents chip shows the upload.
2. **Major (Must): the page jumps on load, against concept §4** ("a fixed-height skeleton while it loads, so nothing below moves"; challenge M6, accepted). The skeleton (`:59`) is 351 px. The loaded panel is 1,356 px (6 notes, 10 lines, 1440×1000), and the page's CLS is **0.47** (§9 budget 0.1). The panel is the first block under the header, so every panel below moves about 1,000 px. *Fix:* reserve the kept-short height (writer + 3 cards + 10 lines) while the notes, me and timeline reads load, or render the writer at once and skeleton only the lists at their final size. Add a CLS or height check to the browser test.
3. **Major (Must, STANDARDS §5 [M] "no N+1"): `peopleOf` runs caseScope plus a count per active staff member** (`service.ts:199-202`). That is about 3-4 queries per person. It runs on every picker open and **inside the add transaction** of every note with mentions. It is fast with 3 staff (27-38 ms), but it grows with the firm and holds the write open. *Fix:* one query: active staff joined to their live grants for `view.all`/`view.own`, plus file owner and team rows, or `caseVisibleSql` evaluated per staff in one SQL. Keep DP7.
4. Minor (Should): challenge **m4**, which the Lead response put in the build as written, is not built. Add note is disabled on an empty box (`:107`), and its reason is only a `title`, so the keyboard never reaches it (concept BR-1's own text still says "disabled", so the concept contradicts itself).
5. Minor (Should): challenge **m1**: no 20-person cap and no "At most 20 people" (the API's 400 would show instead).
6. Minor (Should): challenge **m6**: Edit shows on a client-visible note without the share key (`:202`), and the API refuses it (`needShare`). It is low risk today because every role with edit holds the share key.
7. Minor (Should): challenge **m9(b)**: there is no `#notes` anchor. The bell links to `/cases/<id>`, and the panel is near the top anyway.
8. Minor (Should): concept §4 asks for times that are "relative, exact date in the tooltip". Notes show an absolute date, and timeline times have no tooltip (`:245`). "Pinned" and "Edited" have no tooltip (concept §4c BIC-14).
9. Minor (Should): the BR-10 key renews only on a words change (`:84`), not on mentions or visibility (challenge M5 fix). A retry after a lost response with changed mentions shows the API's "This idempotency key was already used …" with no fresh-key retry.
10. Minor (Should): the kind pill (`:242`, `w-20`) renders as an 80×50 px grey tile on every line (walk `4-timeline-1440.png`; 375 px shot). The concept asks for an "icon by kind" in a quiet line.
11. Minor (Should): the PR body's claim on the case labeller (above). DP9's "typed note kept" across a lost sign-in has no test (the draft ref exists, `:45`).

## D1-D20 (1-5)
D1 4 BRs 1-10 mapped, m1/m4/m6/m9b gaps · D2 4 one row on double Add (DP1; my Ctrl+Enter×2), versions + 409, server-side mention scope · D3 4 shared controls, `staffApi`, four zod shapes · D4 N/A no configuration rules · D5 4 conflict keeps words, stale pin refused in words, double Add · D6 4 History who/when per version, audit per act · D7 N/A no AI · D8 4 under the case header, h2 "Notes and timeline" · D9 4 writer first, one filled button, Told after Add · D10 3 "Other change" ×2 on every new case, absolute times, key-reuse jargon · D11 3 CLS 0.47, false empty under a chip · D12 3 grey kind tiles, the panel over one screen tall · D13 4 axe 0 (builder every state; mine at 375), keyboard path, 1024 + 200 % with no sideways scroll · D14 4 team controls and tokens, as CS-C1s · D15 4 reads under 40 ms; the N+1 in people · D16 4 48/48, pass and fail per DP; no test for J5, CLS, draft-kept · D17 simulated only · D18 4 who/when on every line, raw summary behind Details · D19 4 j_76 W8's case step (builder's run, not re-run) · D20 simulated only.

## BIC (EXPERIENCE §6)
| Id | Score | Evidence |
|---|---|---|
| 01 | Met | author, time and case from the session (J1 history lines) |
| 02, 03, 05-10, 12, 15-17 | N/A | no questions, AI, applications, tasks, filing or review step (concept §4c) |
| 04 | Met | empty is not sent; 5,001 refused on the box (DP2) |
| 11 | Met | one filled button, Add note (`j1-case-page-1440`, `j4-1024`) |
| 13 | Partly | on the box with the fix and words kept (DP2, DP5); empty reason hover-only (#4); key-reuse jargon (#9) |
| 14 | Partly | tooltips on For the client, Mention, Client can see this; none on Pinned, Edited, timeline times (#8) |
| 18 | Partly | empty, skeleton, Adding…, failed, conflict, read-only (`walk/5-officer-1440.png`), no session (`walk/1-no-session-*`) all drawn; false empty under a chip (#1) |
| 19 | Partly | one heading and one primary; the panel is 1,356 px tall at the top, and the grey tiles (#2, #10) |
| 20 | Met | keyboard path and visible focus (J4); 1024 px and 200 % with no sideways scroll; h1 → h2 → h3 |

## [M] lines, by exception (all others met or N/A for a read panel)
STANDARDS §5 "no N+1" **not met** (#3). §9 CLS ≤ 0.1 **not met** (0.47; a warning budget, raised with the concept's own rule in #2). §7 "a rule's test fails when removed": spot-checked on part 3s (DP7) and M1 (DP11), met. §6 contract first: met (the web parses all four shapes; the API does not parse its own output). EXPERIENCE §4 states: met except #1.

## Graph (P-86)
`graph.mjs`: G1 0 · G2 0 · G4 0 · G5 0. G3 lists `GET …/notes/people` and the case `versions/text/pin/visibility` routes as unreached. That is the tool missing template-literal paths: DP7, DP4, DP5, DP3 and DP10 call each one. Not a finding. Every element serves a capability in concept §1. No scaffolding beyond PF-4's sign-in stand-in.

## Could not check
A screen reader; an intended user's walk (D17, D20); j_76 not re-run. `check_c69_page_browser` 53/54 on my copy: the eligibility help sits at 2,467 px even with the panel removed, below the test's 2,400 px window, so I could not pin the failure on this PR (no base copy run). CI on d4070b586 not looked up.

**Verdict: Block** for the `review: approved` label until #1-#3 are fixed (Reviewer: Changes d4070b5862289897f800e5a85f33ce8a92f378a0). The Minors may follow as listed.

Verdict: Changes d4070b5862289897f800e5a85f33ce8a92f378a0

## Round 2 (diff only, d4070b586..e21943b7a): reviewer, 26 Nov
Reviewed **e21943b7a02bda29cd2a0444113383a567f157a0**. The diff is `case-access.ts` (+`staffWhoMaySee`), `case-notes/service.ts`, `case-notes/timeline.ts`, `case-notes.tsx` and the browser test, plus the records commit 38256f26b. I re-ran everything on clean isolated copies (:4434 and :4435; `git status` empty before and after; both copies stopped):
* `check_csnt1d_panel_browser` **54/54** (the builder reported 53);
* `check_csnt1_notes` **56/56** and `check_csnt1_timeline` **36/36**;
* `j_76`: W8's case-page step **passes**. 25/27 overall: the 2 fails are W5 (CS-NT1t) and W8's prospect page (FO-4 part 2b), both named as missing parts;
* my own walk script, at 1440 and 375 px.

**Round 1 Majors: all closed.**
* **#1 (also the breaker's M1) closed.** `timeline.ts` leaves out `case document` lines whose action is in `ACCESS` (`READ_ACTIONS` minus "found changed", the same five types the panel used to drop). It does this in the page query and in the floor query, so a page is never filled by them, and the panel filter is gone. Walk: 120 newer access lines (viewed, previewed, read by AI, checked unchanged) over one older upload. All shows 3 lines. Documents shows "Document uploaded" and then the end line. The API's DOCUMENT page is `["uploaded"]` with `more: false`. DP12 fails if the SQL line is removed (61 views would show).
* **#2 closed.** The panel's height is constant through loading: 1440 px: skeleton 1,232 = notes loaded 1,232 = timeline loaded 1,232 (timeline read slowed to 2 s); 375 px: 1,307 three times. The page's CLS is still 0.34 at 1440 px and 0.63 at 375 px. Since this panel no longer changes height, that comes from other panels (outside this PR). The new DP check compares the skeleton with the loaded panel at both widths.
* **#3 closed.** `staffWhoMaySee` is one SQL query.
  * Its rule matches `caseScope` and `holdsKey`: the same grant and permission join, view.all, or view.own with file owner or team by staff or actor id, ACTIVE only, the case team first.
  * The mention check uses it inside the add.
  * The test adds 1,000 staff; the people read and an add with a mention each pass under 1.5 s.

**Minors from round 1:** 4 fixed (Add stays enabled; empty → "Write the note first." on the box, reached by keyboard in my walk) · 5 fixed (cap and "At most 20 people.") · 6 fixed · 7 fixed (`id="notes"`) · 8 partly (exact-time tooltips on timeline lines; Pinned and Edited tooltips; times stay absolute) · 9 fixed (fresh key on any draft change, `useEffect`) · 10 fixed (the pill is compact) · 11: the PR body is to be corrected; DP9's draft-kept still has no test.

**The breaker's items:**
* M1 closed (above).
* m1 partly fixed: the words now read "… or your role cannot open it.", but the notice title is still "Not in your firm" for an out-of-scope person in the same firm (`case-notes.tsx:60`).
* m2 fixed (a 403 names the act). m3 fixed (text, picks and For the client kept in the draft ref). m4 fixed: on open, focus is on Find; after a pick, focus returns to Mention; Escape closes the list (DP7). m5 fixed (no `maxLength`). m6 fixed ("(not: {names})"). m7 fixed ("Replace their words with mine" replaces Save after a conflict; DP5). m11 fixed (`dir="auto"` on both boxes).
* m8 (bell {name}) is the tech lead's call. m9 and m10 are my #2 and #3, both closed.

**New in this diff (Minor, Should):**
* **R2-m1. Challenge m3 has regressed.** The notes list is now a `role="region"` named "Notes", so `getByRole("region", { name: /notes/i })` matches 2 regions (measured). j_76 W8 still passes only because `waitFor` runs while the skeleton shows and the inner region is not there yet. *Fix:* give the scroll box a name without "notes" (for example "Saved list"), or point it with `aria-labelledby` at a heading that does not match.
* **R2-m2. The fixed heights cost space.** The panel is now always about 1,230 px tall at the top of the page, more than one 1440×1000 screen, even on a case with no notes. The writer keeps about 80 px of blank room under Add note (`r2-loaded-1440`). The notes (320 px) and timeline (416 px) scroll inside their own boxes. This is acceptable for "nothing below moves", but it is a BIC-19 Partly. Consider sizing the boxes to the kept-short content.

**Scores changed:** D10 3→4 (refusal words name the act; tooltips) · D11 3→4 · D12 stays 3 (R2-m2) · D15 4→5 (people in one query, 1,000 staff under 1.5 s) · BIC-13 Met · BIC-14 Met (relative times not built; the concept's tooltip asks are met) · BIC-18 Met · BIC-19 Partly (R2-m2). Journey: **9/10, pass** (see Round 2 in `journey-test-reviewer-2026-11-26.md`).
**Could not check:** CI on e21943b7a; web `tsc` (builder: 0); a screen reader; D17 and D20.

**Verdict: Approve**: no open Blocker or Major. R2-m1, R2-m2 and breaker m1's title stay as Minors, with relative times and the bell's {name} left to the tech lead.

Verdict: Approve e21943b7a02bda29cd2a0444113383a567f157a0

## Round 3 (diff only, ece71d926..139a34847): reviewer, 26 Nov
Reviewed **139a348470cca9a302af979c77905276a4046752**.
* **e21943b7a..ece71d926** is records only: the round 2 review and journey notes.
* **ece71d926..8bab60324** (BK-2) touches only `case-notes.tsx`, +5/-4:
  * `<FoldArrow open>` on Mention (`open`), History (`history`) and the note's Show all / Show less (`long`). Show all also gains `aria-expanded={long}`.
  * The timeline's `<details>` becomes `<FoldOut summary="Details">`. It is still native `<details>`/`<summary>`, so Tab, Enter and Space and the expanded/collapsed announcement are unchanged, and the content is unchanged.
  * `FoldArrow` is `aria-hidden`, so Mention, History and Show all keep their accessible names, and every `data-*` hook the tests use is unchanged.
  * This follows `components/fold-out.tsx`'s own rule: a button that opens a fold-out keeps its button and `aria-expanded` and shows the arrow. Correct, and nothing else changed.
* **8bab60324..139a34847 is only the merge of #3649's head.**
  * Second parent: 311001283, the code head approved in #3649's round 7. #3649 is merged on GitHub; its final head 9f256d850 is 311001283 plus one records commit.
  * The diff over `case-notes.tsx`, `api/src/case-notes/` and `case-access.ts` is **empty**. It is also empty for this PR's other files: `cases.tsx`, `contracts/runtime.ts`, `check_csnt1d_panel_browser.cjs`, `j_76.ts`, `notifications/contract.ts`.
  * `git diff 311001283 139a34847` lists only this PR's 28 files (802 lines added, 12 removed), so the merge resolved nothing by hand in this PR's files.

**Ran at 139a34847:**
* `check_bk2_fold_outs` **16/16**.
* Web `tsc --noEmit`: 0 errors.
* **Not re-run:** `check_csnt1d_panel_browser`, because the demo Postgres on :54329 is not answering (`pg_isready`: no response). `isolated.sh` refuses to start without it. I did not start the shared database, and I did not run prisma generate. The builder reports 54/54 at this head (`run-suites.sh --only`). The change is markup only, and the test's hooks are intact.

**Issues:** none new. Open Minors as in round 2: R2-m1, R2-m2, the breaker's m1 notice title, the DP9 draft-kept test; relative times and the bell's {name} are for the tech lead. Scores and journey: unchanged (9/10, pass). The fold arrows add a cue and remove none.

**Verdict: Approve**: no open Blocker or Major.

Verdict: Approve 139a348470cca9a302af979c77905276a4046752
