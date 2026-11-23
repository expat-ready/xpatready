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

## Re-review round 2 (P-277: only the new commits)
Head `c4b62d0aeab5ab076eab5cc34fd6a5814cd73376`. Diff `8d2a5c301..c4b62d0ae`. Reviewed:
* The code round, `ca5c03c3b`: `bell.tsx`, `all-page.tsx`, `contract.ts`, `frame.tsx`, `routes.tsx` and the check.
* The build-notes section "Review round 1 → round 2", checked against this review and `break-report.md`.

`0a7daf7f6` and `c4b62d0ae` are screenshots only, and `defce764e` is the round-1 records.

**Acceptance test:** `check_pf18ns_bell_browser.ts` passed **24/24 twice** on my copy `pf18nsrev` on :4741. The first run was on a fresh database; the second re-ran on the same database without a restart, so m8 is fixed. No page errors. The test-written screenshots were left as they are.

**Probes like a person** (in-app clicks; failures forced with Playwright routes):
| Finding | Round 2 | Evidence |
|---|---|---|
| m1 Stale count after a quick page change | **Fixed** | Two notices, then a tab click within 1 s: the bell reads 2 and the panel's Mark all read is enabled. New DW1 and DW2 lines (`staleTime: 0`, `refetchOnMount: "always"`, re-read when the panel opens) |
| m2 Loading as text | **Fixed** | `Loading`: 3 skeleton rows plus words for screen readers, in the panel and the All page |
| m3 Focus after Mark read | **Partly** | Success path fixed: focus stays on the row (`LI` row). After Mark all read, focus moves to the list (`UL`). **Failure path still open:** a 500 on `:id/read` shows "Could not mark this read." but focus falls to `BODY` (`bell.tsx:35`, the catch does not refocus; the button was disabled while busy). Should: in the catch, focus the row's Mark read button again |
| m4 Failed count read "none unread" | **Fixed** | A 500 answer now reads "Notifications, count not available" (`contract.ts` `bellName(null)`). No test line; probe only |
| m5 Long names without `title` | **Fixed / recorded** | The full label is in `title`. Wrapping instead of truncating is recorded in build-notes as a deviation, with its reason |
| m6 Account menu current entry on the All page | **Follow-up** | Recorded on the PR (PF-6's file) |
| m7 Misplaced comments | **Fixed** | `frame.tsx:17-18` and `routes.tsx:45-46` are back on their own lines |
| m8 Not re-runnable on a reused copy | **Fixed** | Second run 24/24 on the same database |
| m9 Kind words differ from Home | **Follow-up** | Recorded (PF-18h's file) |

**Breaker's findings, as landed (spot-checked in the diff and the probes):**
* M1 Focus after Mark read on success: fixed. DW6 line, and my probe confirms it.
* m2: fixed (same fix as my m1).
* m3 Paging past the end: fixed. Steps back one page when a page empties; DW6 line.
* m4 Only an app path is trusted as a link: fixed in the contract; DW3 line.
* m5 Screen-reader names: fixed. "(unread)" is in the link name, and each Mark read button names its row and time; DW5 and DW6 lines.
* m6: fixed (`title`).
* m7 Filter in the address: partly. `aria-busy` is set and Mark all read waits while a page loads; keeping the filter and page in the address is a follow-up.
* m8 Comments: fixed.
* m1 320 px header: follow-up (WCAG reflow; the project bar of 375 px passes).

None of the follow-ups is a Blocker or Major against the concept's "What gets built" or the row's acceptance.

**New code checked:**
* The link check `^\/(?!\/)[A-Za-z0-9/_-]{1,200}$` passes `/front-office/leads/<uuid>` and `/cases/<uuid>`.
* The step back to an earlier page cannot loop: it is guarded by `page > 1` and `!isPlaceholderData`.
* The focus targets (`li` and `ul` with `tabIndex=-1`) show a visible focus ring.
* Two refetches on panel open (the count and the list) is two requests per view, not one per row.

**Open after round 2:** 0 Blockers, 0 Majors, 1 Minor (m3, failure path) plus the recorded follow-ups. The journey score stays at 9 / 10. Feedback and state would now earn the full point. Error recovery stays at ½ until the failure-path focus is fixed.

Verdict: Approve c4b62d0aeab5ab076eab5cc34fd6a5814cd73376

## Re-review round 3 (Lead 13: focus fixes only)
Head `49aeb7896a8ea08eeafe0d8f2862ef0011e4b009`. Diff `1ae9ad035..49aeb7896`:
* `7b2f9e79a`: three test lines, written to fail first.
* `49aeb7896`: `useListFocus` in `bell.tsx`, used by the panel and the All page; the failed Mark read returns focus to its button; build-notes; screenshots.

Nothing else changed. No new scope.

**Acceptance test:** `check_pf18ns_bell_browser.ts` passed **27/27 twice** on my copy `pf18nsrev` (:4741), first on a fresh database and then on the same one reused. No page errors. The copy is stopped. Test-written screenshots were left as they are.

**Focus probes** (keyboard Enter; "focus" is `document.activeElement`):
| Case | Result |
|---|---|
| Unread filter, Mark read on row 1 | The new row 1 (test line DW6, round 3) |
| Failed Mark read (500) | Back on its Mark read button (DW6 fail line). **My m3 is closed** |
| Unread filter, Mark all read | The empty line (DW2, round 3) |
| All filter, Mark read on row 3 (the row stays, now read) | Row 3 itself |
| Unread filter, Mark read on the last row of page 1 | The previous row, now last (row 23 of 23) |
| Panel, Mark all read | Row 1, still inside the dialog |
| Panel, Mark read on row 2 | Row 2 (it stays, now read) |
| **Unread filter, page 2 holding one row: Mark read on it** | **`BODY`** |

**Still open: one Minor (Should), the step back from an emptied page.**
* Build-notes say round 3 also fixes "the step back from an emptied page". In the probe it does not.
* What happens:
  1. `useListFocus` focuses the empty line of page 2.
  2. It clears its target (`bell.tsx:41`).
  3. The step-back effect (`all-page.tsx:33`) moves to page 1, and the empty line unmounts when page 1's rows arrive.
  4. Focus falls to the page body.
* It happens once per emptied page, not per row: the breaker's M1 was repeated on every row; this is not.
* Fix: when stepping back, ask `useListFocus` for the new page's last row (for example `want = { index: PAGE_SIZE - 1 }` before `setPage`). Add one test line: Unread, page 2 with one row, Mark read, then expect focus on a row of page 1.
* No test covers it today.

**Code reading:**
* `useListFocus` waits for a settled list: for the All page, not fetching and not placeholder data; for the panel, not fetching.
* It retries on the next render when its target is not drawn yet, then clears its target. Its effect sets no state, so it cannot loop.
* The row and empty-line targets have `tabIndex=-1` and a visible focus ring.
* `useMarkAll` now takes a callback instead of an element, and its two callers were updated together.

**Open after round 3:** 0 Blockers, 0 Majors, 1 Minor (focus after the step back from an emptied page), plus the follow-ups recorded in round 2. Journey score: **9.5 / 10**. Feedback and state (round 2) and error recovery (round 3) now earn full points. Accessibility drops to ½ while the step-back focus edge stays open.

Verdict: Approve 49aeb7896a8ea08eeafe0d8f2862ef0011e4b009
