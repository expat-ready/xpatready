# Review: CS-NT1t, a person's own timeline (R1.76), round 1

PR #3829 at **3069120aee22938a2c5b3d7ff8b0ae52c9c1e163**. Its own diff is `ece71d926..3069120ae` (ece71d926 is #3822's approved head, reviewed separately; merge 4ea14d870 brings only #3822's review records). Reviewer: a fresh context that did not build this. There is no concept for this item, so the bar is the BACKLOG row CS-NT1t (origin/main:1093) and its five named tests. Isolated copy on :4434 (never :4400), stopped afterwards. Journey test: `journey-test-reviewer-2026-11-26.md` (**8/10, pass**).

## Verdict: Ship after fixes
The server half is sound. One keyset cursor covers three sources, and the case lines come through `CaseTimeline.pageAfter` (one firm rule, one caseScope, not a copy). Another firm's person answers 404, and a planted line is never shown. My own runs: `check_csnt1t_person_timeline.ts` **24/24**, `check_csnt1d_panel_browser.cjs` **53/53** on this head, j_76 **W5 PASS** (W8 fails only for FO-4 part 2b, another row). Two Majors stop it on the screen: the row's "each line says what" for prospect lines, and person notes that cannot be read in full.

## The three departures and the carried Minors
1. **Path `/api/runtime/clients/:id/timeline`: accept.** `core.ts:99` admits key routes only under `/api/runtime/`, and `:100` refuses any other bearer path with 403 "Not for a link session". The row's path could not answer a staff token unless the guard were widened. The new path sits beside part 3's client notes.
2. **File `case-notes/person-timeline.ts`: accept.** The `api/tsconfig.json` include list has `src/case-notes/**` and no `src/case-clients/**`, so a decorated service there would not compile with decorators.
3. **A section, not a tab: accept.** The client page has no tab row (h1 → Identity check · Cases · Timeline, screenshot `j1-client-1440`). EXPERIENCE §2.2 allows one row of tabs at most and points deeper structure to sections, so one tab alone would be an invented pattern.
4. Carried #3822 Minors: the region is now "Note list" (`case-notes.tsx:74`), and a 404 title reads "Not available to you" (`:69`). Both are done.

## Issues (ranked)
1. **Major (Must; row "each line says what"; EXPERIENCE §5 [M] plain words): every prospect line except a note reads "Other change".** The FO kinds CALL, AUDIT and EVENT map to ACTIVITY (`person-timeline.ts:35`), and `lineWords` (`case-notes.tsx:24`) knows no FO type. So "lead engaged", "won", stage moves and calls all show "Other change". A call's own words ("Incoming call: connected (3 min). …", written by staff) sit only behind Details (`:268`). API evidence: `prospect ACTIVITY lead.engaged` renders "Other change" (screenshot `j1-client-1440`, line 2). *Fix:* give prospect lines words from their type: add the FO types to `LINE_WORDS` (for example "Lead engaged", "Prospect won", "Moved to {stage}") and show a CALL line's summary as its words, as a note's is. Do not show raw FO audit summaries: they carry staff UUIDs ("Staff cf506866-… engaged lead L-00001"). Add a PT7 assertion that no prospect line reads "Other change".
2. **Major (Must; EXPERIENCE §1 [M] "long text … with full text on hover"): a person's own note longer than two lines cannot be read in full anywhere.** Timeline notes are `line-clamp-2` with no title, expander or link (`case-notes.tsx:266`). On the case page the full text is in the Note list, but the client page has no note list (`clients.tsx:186-191`), so this timeline is the only reader of part 3's person notes and of the prospect's notes. A 4,990-character note shows two lines and an ellipsis (screenshot `b-rtl-375`). *Fix:* for note lines on a person's timeline, add a keyboard-reachable "Show all" or put the full words in a `<details>`, kept to the timeline component.
3. Minor (Should): **case lines do not name their case.** For a person on two cases, "Document uploaded · Someone at the firm · 26 Nov" (120 such lines in J1) does not say which case it belongs to. The API sends `caseId` and the screen drops it, and prospect lines carry no "From the prospect" mark either (D18). *Fix:* put the case number on case lines (the page already has the id → number list from Cases), and mark prospect lines.
4. Minor (Should): **the 404 words on the client timeline name a case.** The text reads "This case is not in the firm you are signed in to, or your role cannot open it." (`errWords`, `case-notes.tsx:33`; J7). *Fix:* pass the subject noun.
5. Minor (Should, D16): **removing the `older()` filter for notes or prospect lines fails no test.** If it is removed (`person-timeline.ts:57`, `:74`), those lines repeat on every page. PT4 only checks lines matching `^Paged upload` (`check_csnt1t_person_timeline.ts:104`), and PT7 does not watch console duplicate-key warnings. *Fix:* in PT4, assert that no `source:refId` repeats across pages, whatever its source.
6. Minor (Should): **the prospect read hides every failure.** `.catch(() => null)` (`person-timeline.ts:71`) turns a 500 or a database error into "no prospect lines" without a word. *Fix:* catch only 404, as the case loop does at `:62`.
7. Minor (Should; server authorisation): **prospect lines are read without `agent/prospect:show`**, the key that the prospect timeline's own route requires (`front-office/sales/routes.ts:141`, with `@OwnOrAll`). Every seeded role holds both keys today (checked in `platform_role_permission`), so nothing leaks now. A role edited to lack the key would still see the prospect's calls and notes here. *Fix:* skip source 3 unless `ctx.keys` holds `agent/prospect:show`.
8. Minor (Should; BIC-18): **the empty words do not teach.** "Nothing has happened for this client yet." (J4) could say what will appear: notes, case changes, the prospect's history.
9. Note, not a finding: prospect lines past the front office's 500-line cap (`sales/timeline.ts:17`) are never reached, the same cap as the prospect's own timeline. Each case costs about 5 queries per page (bounded by the person's cases, not by rows).

## D1-D20 (1-5)
D1 3: three sources merged, newest first, paged, firm and caseScope rules kept; "what" not met for prospect lines (#1) · D2 4: read-only; forged, repeated or unknown query → 400 on `cursor` · D3 5: `pageAfter` and the `Timeline` component reused, no second firm rule · D4 N/A · D5 4: keyset paging never skips (120 lines over 3 pages, PT4 and my J1); failures swallowed (#6) · D6 4: who and when on every line · D7 N/A · D8 3: under Cases with an h2 and breadcrumbs; lines do not say which case (#3) · D9 4: read-only; Show older, then "That is everything for this client." · D10 3: "Other change" (#1), the case 404 words (#4) · D11 4: skeleton, empty, error, busy Show older, end line · D12 3: grey kind tiles (inherited) and walls of "Other change" · D13 4: axe 0 (whole page at 1024; timeline at 1440 and 375), keyboard path, 200 % and 375 px with no sideways scroll · D14 4: team components and tokens · D15 4: read 94 ms, first lines 197 ms after the click · D16 4: 24/24, each case with a pass and a fail; gap #5 · D17 simulated only · D18 3: the origin of a line (case, prospect, person) is not shown · D19 4: j_76 W5 passes · D20 simulated only.

## BIC (EXPERIENCE §6)
| Id | Score | Evidence |
|---|---|---|
| 01-10, 12, 13, 15-17 | N/A | read-only list: no questions, input, AI, applications, tasks, filing or review step |
| 11 | Met | no filled button; Show older is secondary (`j1-client-1440`, `j2-client-1024`) |
| 14 | Partly | kind pills have no tooltip; the exact time is a `title` (hover only, not keyboard) |
| 18 | Partly | skeleton (J5), error (J6), end line; the empty words do not say what will appear (#8) |
| 19 | Partly | one heading, no internal ids on the main path; repeated "Other change" lines and grey tiles (#1) |
| 20 | Met | keyboard reaches the region (visible ring, `j2-region-focus-1024`) and Show older (Enter loads 10→50, focus kept); h1→h2; 200 % and 1024 px with no sideways scroll |

UXL (375 px): 09 Show older is 32 px (secondary, ≥24 met) · 10 no sideways scroll · 12 loading, empty and error drawn.

## Graph (P-86)
`graph.mjs`: G1 0 · G2 0. G6 lists `features/case-client-timeline.ts` as imported by nothing. That is a false positive: features load by `readdirSync` (`features.ts:18`), and 26 other feature files are listed the same way. The graph's route list has no `GET /runtime/clients/:id/timeline`, so its testedBy cannot be read there. The new test calls it directly.

## Could not check
A real screen reader; an intended user's unaided walk (D17, D20); the breaker's personal-data pass (the row says breaker: yes). There is no screen in the product to write a person's note (part 3 is API only, outside this row). So the person notes in the demo come from the API or tests, and that belongs to the Lead to place, not to this PR (P-26). Screenshots are in the reviewer's scratch folder and not committed. The builder's `client-timeline-{1440,375}.png` match what I saw.

**Verdict: Changes 3069120aee22938a2c5b3d7ff8b0ae52c9c1e163.** Fix Majors #1 and #2. Fix Minors #3-#8 or give each a follow-up row.

## Round 2 (diff only): 3069120ae..79676e3ccb7897639c094b711ad4f25b8bf15166
Scope: `person-timeline.ts`, `case-notes.tsx`, `contracts/runtime.ts` (additive: `caseNumber`, `prospectOlderHidden`), and the check. The breaker's round-1 Majors (`break-report.md`) are checked here too, so one verdict covers both. Copy `rv_csnt1t` on :4434 only, stopped afterwards; no `prisma generate`. My runs at 79676e3cc: `check_csnt1t_person_timeline.ts` **33/33**; `check_csnt1d_panel_browser.cjs` **53/53** (the case panel shares the changed `Timeline`); plus my own browser walk at 1440 and 375 px, and API probes.

**Closed**
* **Review M1, prospect lines in words: closed.** Audit and event lines keep their type and are sent with an empty summary, so no staff id leaves the server (`person-timeline.ts:85`). Calls and notes are sent as types "call" and "note" with their words. `LINE_WORDS` gains the front-office names, and unknown ones read "Prospect updated" or "Contact details changed". Walk: "Engaged as a prospect · Prospect" (`r2-first-1440`); across all 628 lines no prospect line reads "Other change". The "Other change" lines that remain are case audit lines, part 4's words (its review, D10), not this PR's. PT3 fails if summaries are sent again.
* **Review M2, long notes: closed.** A note or call over 2 lines or 200 characters folds, with a real button "Show all of it" / "Show less" that has `aria-expanded` and a 2 px focus outline. Enter unfolds it, at 1440 and 375 px (`r2-showall-375`). A shorter note is never clamped, so no text is hidden without a button. PT7 checks folded, then unfolded.
* **Breaker M1, prospect key: closed.** Source 3 is read only when `ctx.keys` holds `agent/prospect:show`. The route's `@OwnOrAll` is metadata only (`keys.ts:32-38`), and `Prospects.read` applies it, so the person timeline now matches the front-office route. PT3 removes the key from Case manager: 200, the person's note, no prospect line.
* **Breaker M2, more than 500 prospect lines lost silently: closed as a Major.** Walk with 600 extra prospect notes: 14 Show older clicks, 628 lines, 498 bulk notes. The last page carries `prospectOlderHidden`, and the end line no longer claims "everything" (`r2-end-1440`). PT4 covers it. The wording is not exact: see m-b.
* **Minors closed:**
  * #3 / breaker m4: lines carry the case number, or "Prospect" for prospect lines.
  * #4 / breaker m5: the 404 now reads "This client is not in the firm…". With no connection it reads "Could not reach the server. Try again." Try again recovers after a 500 (walk).
  * #5: PT4 now checks that no `source:refId` repeats.
  * #6 / breaker m1: only a 404 or 403 skips the prospect source; anything else throws.
  * #7: the key check above.
  * #8: the empty words now say what will appear.
  * Breaker m3: 40 cases on one person read in 160-218 ms.
  * Breaker m2, at the API: an empty page now returns the floor as its cursor. The repro (600 planted firm-B lines naming the case) gives page 1: 0 lines, more, a cursor; page 2: the real note. Firm B's lines are never shown.

**Open (both Minor, Should; neither blocks)**
* **m-a, breaker m2 on the screen: still a false empty.** The `Timeline` component shows "Nothing has happened for this client yet." whenever the lines shown are empty, and Show older needs at least one line (`case-notes.tsx:268`, `:280`). So an empty first page that has more lines still shows nothing, and the real note cannot be reached from the screen (same repro; `r2-m2-false-empty.png`). It is rare: it needs over 500 hidden rows newer than everything else. *Fix:* when the shown lines are empty and `hasNextPage`, fetch the next page, or show Show older. Add a PT case.
* **m-b, the cap words promise a page that does not show those lines.** The end line says "Older lines of the prospect are on the prospect's own page". The prospect page has no timeline yet (FO-4 part 2b, j_76 W8), and the front office's own read keeps the same newest 500 (`sales/timeline.ts:17`), so even that page would not show them. *Fix:* "Only the prospect's newest 500 lines are shown here."

Graph and kill checks: removing the key check, sending the summaries again, or removing the fold each makes a named PT fail. Journey score this round: 9/10 (plain words ½ for m-b and the inherited case words, visual quality ½ for the inherited grey tiles; the rest 1). Screenshots are in the reviewer's scratch folder and not committed.

**Verdict: Approve 79676e3ccb7897639c094b711ad4f25b8bf15166.** No Blocker or Major is open from the review or the break report. m-a and m-b are Minors to fix or give a follow-up row.
