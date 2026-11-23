# PF-18ns: the bell and the notification list, independent review

Reviewed head `8d2a5c301f3b370245cadb6ca6843a70e4785c9a` (PR #3302, stacked on #3289). Diff: `origin/claude/screens-pf18n2-lead-notices...HEAD`. Spec: concept r2 and challenge on main, BACKLOG row PF-18ns, Lead 10 (#3279: bell in PlatformFrame and SalesFrame, All page at `/account/notifications/all`), Lead 12 (Done when). Reviewer did not build it. Own copy `pf18nsrev` on :4741 (port named in the brief; never :4400 or :4731). Journey report: `journey-test-reviewer-2026-11-23.md`.

## Verdict: Ship (Approve). 0 Blockers, 0 Majors, 9 Minors.
* **Journey score (reviewer, the one score for this check): 9 / 10, pass.** Half points: feedback and state (m1, m2, m4) and error recovery (m3). Details: `journey-test-reviewer-2026-11-23.md`.
* **Acceptance:** `check_pf18ns_bell_browser.ts` passed 18/18 twice, each time on a fresh copy. All six DW lines pass by name: keyboard only, axe-core 0 serious or critical at 375, 1024 and 1440, no sideways scroll.
  * A third run on the *same* copy failed DW1, because rows from earlier runs were still there (m8). This is a test hygiene issue, not a product defect.
* **Walked like a person:**
  * Representative assigns a lead on the lead page → the Case officer's bell shows 1 within 132 ms of a menu click → the panel opens in 80 ms → Enter lands on the lead → the bell shows 0 and `read_at` is set underneath.
  * Also walked: Mark all read, See all with the Unread filter and page 2, the empty and failed states, signed out, 375 px and 200 % zoom at 1024.

## D1–D20 (1–5; reviewer, browser and script)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | Every acceptance clause passes (DW1–DW6). BR-3 "refreshed on navigation" has a 2 s gap (m1) |
| D2 Data integrity | 5 | Own-only rule: DW3 answers 404. One row per lead per person (walk J1, SQL). Mark all read sends the `seen` time (DW2 fail line) |
| D3 Reuse | 4 | Reuses the app's `Panel` and one contract. Home keeps its own kind words (m9) |
| D4 Rule integrity | N/A | No questionnaire or document rules |
| D5 Stability | 4 | A double click opens once. A reload with the panel open is clean. Try again recovers a failed list (walk J4). Test not re-runnable on a reused copy (m8) |
| D6 Freshness and governance | N/A | No governed content. Personal read state is not audited, by design (PF-18n) |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | Crumbs read "My account › Notifications › All". The account menu does not mark "Notifications" as current on the All page (m6) |
| D9 Flow | 5 | From any staff page to the record in two actions, in both frames |
| D10 Language | 4 | Plain words, §5 copy as written. No ids except the lead number, which is a business number |
| D11 Feedback and state | 3 | Unread shown by a dot and the word. Announced once per change (DW4). But: a stale count with Mark all read disabled while unread rows show (m1); loading is text, not skeletons (m2); a failed count reads "none unread" (m4) |
| D12 Visual quality | 4 | Team Panel, buttons and tokens (screenshots `pf18ns-5-panel-*`, `pf18ns-6-all-*`). Long names wrap instead of truncating (m5) |
| D13 Accessibility and responsive | 4 | axe 0 serious. Keyboard path checked (DW5 and walk J1 Tab order). 200 % zoom at 1024 has no sideways scroll. Focus is lost after a failed Mark read (m3) |
| D14 Team look | 4 | Same frame controls as FindBox and "?". The side panel follows the EXPERIENCE §3 width of 480–560 px |
| D15 Speed | 5 | Count 132 ms, panel 80 ms. One request per view; labels come from the server, no request per row |
| D16 Testability | 4 | Each DW line has a pass and a fail line. BR-3 (refresh on navigation) and BR-5 (a failed mark still opens) have no failing test (m1) |
| D17 First use | simulated only | Not yet evidenced; the founder's walk |
| D18 Provenance | 4 | Each row says what happened, which record and when; the zone is named once |
| D19 End-to-end | 4 | Assignment → bell → lead works across FO-4 and PF-6. Case frames are a follow-up X-row (Lead 10) |
| D20 Pain solved | simulated only | Not yet evidenced |

## BIC (EXPERIENCE §6) and UXL (§7)
* **BIC:** N/A as a whole. This is a platform screen, outside §6's case-side scope (concept §4c). The checks that always apply:
  * BIC-11 Met: no filled button in the panel.
  * BIC-14 Met: the bell's name and title carry the count.
  * BIC-18 Partly: loading is text (m2).
  * BIC-19 Met: one heading per panel, no reds except errors (`pf18ns-5-panel-1440`, `-1024`).
  * BIC-20 Met: DW5 and the zoom walk.
  * BIC-01 to 10, 12, 13, 15 to 17: N/A (no facts, AI, filing or review).
* **UXL at 1440, 1024 and 375** (`pf18ns-5-panel-375`, `pf18ns-6-all-375`):
  * Met: 01, 03, 04, 05, 08, 10, 11.
  * UXL-07 Met: "L-00007" is chunked.
  * UXL-09 Met: the bell is 36×32 px and Mark read is 32 px tall, both at least 24 px; there is no primary action.
  * UXL-12 Partly (m2).
  * UXL-14 Met for colour; the text is English only.
  * UXL-02 and UXL-06: N/A.

## [M] lines (STANDARDS, EXPERIENCE): Not met or Partly; every other line Met or N/A
* EXPERIENCE §4 "loading (skeletons)": Not met (m2). §1 "long text one line with full text on hover": Not met, wraps instead (m5). §2.12 accessible: Partly (m3).
* STANDARDS §3.10 / §7 "every business rule has a passing and a failing test": Partly. BR-3 is untested: DW1 reloads the page with `p.goto`, and removing `bell.tsx:99` fails nothing. BR-5's failed-mark path is also untested (m1).
* STANDARDS §7 comments: Partly. Two comments now sit on the wrong lines (m7).
* Met, with evidence:
  * Server authorisation, own-only (DW3).
  * No N+1: one `items` call, labels batched in #3289.
  * zod contract with no app imports (`contract.ts`).
  * Module card `MODULE.rows/PF-18ns.md`.
  * No new technology.
  * Mark all read is safe under a race through `seen` (DW2).
  * No migration in this PR.

## Issues, ranked (all Should; none blocks)
1. **m1 Stale count after a quick page change.**
   * Each page mounts its own frame, so the `loc.key` effect (`bell.tsx:99`) skips every page-to-page change (first mount). The refresh then relies on refetch-on-mount, and the app's `staleTime: 2_000` (`lib/api.ts:46`) suppresses that within 2 s of the last read.
   * Walk J2: two notices arrived, then a tab click within 2 s. Bell 0, panel showing 2 Unread rows, **Mark all read disabled** (`bell.tsx:81` keys it on the bell's count). Fixed itself after the next navigation more than 2 s later.
   * Fix: `staleTime: 0` on the count query (`bell.tsx:96`), refetch the count when the panel opens, and enable Mark all read from the panel's own unread rows. Add a DW line that navigates in-app (not `goto`) and expects the new count.
2. **m3 Focus falls to the page after a failed "Mark read"** (WCAG 2.4.3). The busy button disables, and focus lands on `BODY` (walk J4). Home fixed the same case (review S2). Fix: return focus to the row's button after the failure (`bell.tsx:31`).
3. **m4 A failed count reads "Notifications, none unread"** (`bell.tsx:105`, walk J4 with a 500 answer). Fix: on an error other than 401/402/428, name it "Notifications" without a count.
4. **m2 Loading is a text line, not 3 skeleton rows** (concept §4, EXPERIENCE §4 [M]): `bell.tsx:84`, `all-page.tsx:44`. `components/ui/skeleton.tsx` exists.
5. **m5 Long lead names wrap, with no `title`** (`bell.tsx:41`). The concept §4 says truncate with the full text in `title`. Wrapping reads well at 375 (`j8-panel-375`); either add `title` and truncate, or record the deviation in build-notes.
6. **m6 The My account menu does not mark "Notifications" current on `/account/notifications/all`.** `NavLink … end` is at `frame.tsx:58`. Fix: no `end` for that section.
7. **m7 Comments moved to the wrong lines.** The "?" comment now trails the bell import (`frame.tsx:18`), and PF-18s part 3's comment trails the All route (`routes.tsx:46`).
8. **m8 The check is not re-runnable on a reused copy.** DW1 expects exactly 1 row (`check_pf18ns_bell_browser.ts:112`), although `:71` says a reused copy is handled. Fix: count the rows newer than the walk's start, or delete O's and R's rows at setup.
9. **m9 The kind words differ from Home** ("A government step is due" here, "A government step" on Home). Recorded in build-notes as a follow-up; it needs a BACKLOG follow-up row so §5's "one map" lands.

Recorded deviations accepted:
* The panel is the app's right side `Panel`, not a 400 px popover (challenge m5, build-notes).
* `panel.tsx` was folded into `bell.tsx`.

## Graph (P-86) and capability (P-33)
* `graph.mjs`: G1 0, G2 0. G3 lists the four `me/notifications` routes as unreached. That is the tool's blind spot (pages call `staffApi(…)`; tests call a local `api(…)` helper), not a real gap: DW1–DW6 call all four.
* Every element serves R1.50. No step depends on scaffolding. DW6 seeds unopenable rows by SQL as test data only; in the walk, the real flow (reassign, assign) produced them.

## Not checked
* A real screen reader. Live-region timing was checked through the DOM (DW4), not by ear.
* A visible (headed) browser: walked headless with screenshots.
* Retrofit mapping against the team's code: `code/` is not in this checkout, and the concept §2 says so.
* D17 and D20 stay with the founder.
* The 428 terms gate in SalesFrame: read in the code only (`bell.tsx:104` returns null).

**Verdict: Approve**. No open Blocker or Major. Minors m1–m9: fix them in this PR or list them as follow-ups.

Reviewer: Approve 8d2a5c301f3b370245cadb6ca6843a70e4785c9a
