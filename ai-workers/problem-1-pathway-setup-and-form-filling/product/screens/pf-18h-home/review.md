# Review: PF-18h, the staff Home's "Needs you" list (R1.74, QA-471 part 2), PR #2621

**Verdict: Approve** on `8386faca7bc09f4f061a86a0d9ceee0b19416f75`: no Blocker or Major is open. Three Shoulds and seven Minors are listed below.

Reviewer: a fresh agent (`screen-review`) that did not build this screen. Copy: isolated `rev18h` on :4719 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped at the end; never :4400 or :4718. Live AI off, US$0.
**Checked against:** concept r3, `challenge.md`, `design/home-needs-you.html`, STANDARDS, EXPERIENCE, QUALITY, PRODUCT §3–§4. The decisions already made (Q1 (a), Q2 scaffolding, Q3, J-74 moved, m5 and m6 for the founder) are not re-opened.
**Journey report:** `journey-test-reviewer-2026-11-21.md`, **9/10** (pass).

## Re-run on the exact commit (my copy)
| Check | Result |
|---|---|
| `check_pf18h_home_browser.ts 4719 xr_studio_rev18h` | 21/21 in 2 min 20 s |
| `check_pf6a_frame_browser.ts` / `check_pf6f_callback_browser.ts` (same copy) | 52/52 / 11/11 |
| `check_pf18n_notifications.ts` (its own database; store change) | 34/34 |
| My walk scripts (UI only; setup through the real `PrismaNotificationPort`) | see the journey report |

## Concept fit
* **Elements:** all present and behaving as written. `h1` Home, the section `h2` "Needs you", then the count in words ("3 items need you"). Each row: the link ("A government step on case C-2026-00008" or "A stage deadline on case …"), the muted line "Reminder came in 20 Nov 2026, 17:53", and "Hide until next reminder". The foot reads "Times in America/Toronto.", plus "Showing the newest 20 of 26. …" when there are more than 20. Home is the first menu entry (`aria-current`); sign-in and the brand link both open `/home`; the J-74 hooks `data-needs-you-item`, `-open`, `-hide`, `-count` are present.
* **Rules, each walked:** BR-1: a NEEDS_YOU-group row never shows. BR-2: a new reminder on the same deadline moves that row back to the top among others; no second row. BR-3: firm B gets an empty list; another person's row gives 404. BR-4: Open awaits the mark-read, then sends 1 POST; a failed mark keeps the page with the Notice and "Open the case anyway". BR-5: newest first, 20 shown of 26. BR-6: an item with no case has no link and keeps Hide. BR-7: the London colleague sees Europe/London. BR-8: the count is in words.
* **States:** all drawn (empty, loading with 5 skeleton rows and `role=status`, normal, error with Try again that recovers, open-failed, over 20), except "long": the case number wraps at 320 px (S3).
* **Q2 scaffolding (accepted):** In a fresh browser the case page opens as "Acting as Case officer · Simulated"; the representative also lands on it as the Case officer. A browser with a Studio person stored gets "Cases are worked by the firm … Continue as Case officer". It is labelled in the PR and build notes, so it is not a finding; P-33 does not apply, because the Home step is the product's own screen.

## [M] lines (met unless named)
* **STANDARDS:** §4: the case table is read only inside `linksOf` (Q1 (a)), one firm-scoped select of `id, caseNumber`. §5: indexed by `@@index([firmId, staffId, createdAt])`; 3 queries plus 2 for the zone, none per row. §6: `@AnyStaff`, person and firm from the session; a Studio `x-actor` alone gets 401. §7: the module card (`MODULE.rows/PF-18h.md`, api and web) is there. **"axe-core on every screen state" and §3.10 are met only by my run, not by the committed check (S1).** §9: about 185 ms from reload to the list (3 runs).
* **EXPERIENCE:** §1: team components (PlatformFrame, Button, Notice, Loading) and tokens; matches the board. §2.1: the path "My account › Home" (m5 is the founder's). §2.12: axe clean at 375, 1024 and 1440 px and at 200 % zoom (720×450, 512×384), no sideways scroll, keyboard path complete; one exception (S2). §4: all states drawn. §5: no ids; words from PRODUCT §4. §3 pattern: m6 is the founder's.

## Code (correctness, races, authorisation, tests that can fail)
* **Mark-read:** Sent with `seen=createdAt`, so a reminder that comes back while the list is open stays unread (PF-18n's rule). `created_at` comes from a JS `Date` (ms), so the `seen` comparison is exact. A stale Hide gives 200 and no error; a double click on Hide or Open sends 1 POST.
* **Removing a rule fails a test (checked by reading):** BR-1 (the DW1 fail line), BR-3 (DW4), BR-5 and BR-8 (the 26-item line), BR-6 (its line), BR-7 (the colleague's zone). **Not covered: BR-4's failure branch and its awaited-first order; no test fails the POST (S1).**
* **Graph (P-86):** `graph.mjs` gives G1 0, G4 0, G5 0, but it cannot see this screen (m7).

## D1–D20 (independent reviewer; browser, script and code)
| Dim | Score | Evidence |
|---|---|---|
| D1 | 4 | BR-1 to BR-8 as written; "number never wraps" fails at 320 px (S3) |
| D2 | 4 | read-only list; mark-read idempotent, own only; double click = 1 POST; cross-firm 404 |
| D3 | 4 | one link builder (`linksOf`); PF-18n's mark-read reused; no second write path |
| D4 / D6 / D7 | N/A | no dependent questions; read-only own state; no AI |
| D5 | 4 | reload, Back, double click, stale tab, failed load and failed mark all recover |
| D8 | 4 | crumb My account › Home; menu entry current |
| D9 | 4 | one click from Home to the case |
| D10 | 4 | plain words; raw zone id shown; empty hint names an unbuilt settings screen (m3) |
| D11 | 4 | skeleton, busy spinner, error and failure Notices; focus loss while busy (S2) |
| D12 / D14 | 4 / 4 | team look and house controls; matches the board at 1440/1024/375 |
| D13 | 4 | axe clean in every state at 3 widths and 200 %; keyboard complete; S2 |
| D15 | 4 | ~185 ms to the list; no request per row |
| D16 | 4 | 21/21 re-run by me; each DW has a fail; gaps S1, m5, m6 |
| D18 | 4 | case number, kind, time and zone named; due date absent by design (Q1) |
| D19 | 3 | reminder → Home → case works, but the case page acts as the simulated person (Q2, accepted) |
| D17 / D20 | simulated only | no intended user walked it; the founder's walk |

## Best-in-class scorecard (EXPERIENCE §6)
BIC-01 to 10, 12, 13, 15, 16 and 17 are N/A: the screen asks nothing, shows no document or AI value, and has no tasks, filing or review.
| Id | Score | Evidence |
|---|---|---|
| BIC-11 | Met | no filled button; "Hide until next reminder" names what it does (`pf18h-1-one-item-1440.png`) |
| BIC-14 | Met | no chips or icon-only buttons; the count is in words |
| BIC-18 | Partly (Should) | empty says what appears, but its first action points at an unbuilt settings screen (m3); skeleton; failures visible |
| BIC-19 | Met | one heading per panel; 3 type sizes (16/14/12); red only in the error Notice; the count says what it counts (1440 and 1024 px) |
| BIC-20 | Partly (Should) | keyboard path complete, 200 % works, headings in order; focus falls to `body` on a busy or failed Hide (S2) |

## Issues, ranked (none Must)
1. **S1 Should: the committed check misses BR-4's failure branch and four states.** No test covers the error, loading, empty or open-failed states, or axe in them (STANDARDS §7 [M], §3.10). My axe runs on all four were clean at this commit. Fix in `check_pf18h_home_browser.ts`: `page.route` the POST to 500, then assert the Notice, "Open the case anyway" and URL `/home`; the GET to 500, then the Notice and Try again recovering; axe on each.
2. **S2 Should: focus falls to `body` around Hide.** `Button busy` sets `disabled`, so focus drops during a Hide (`home-page.tsx`, Row's Hide button) and stays on `body` if the hide fails (`act()`'s catch). Fix: on failure, put focus back on the row's Hide or on the Notice.
3. **S3 Should: the case number splits at 320 px.** It breaks at its hyphens as "C-2026-" / "00006", against concept §5 and the build notes' claim; `itemWords` makes one string (`contract.ts`). Fix: put the number in a `whitespace-nowrap` span, as the board does.
4. **m1:** a Ctrl/Cmd or middle click opens the case without marking it read (`home-page.tsx`, Row `onClick` returns early). Challenge m1, accepted at r2, says it fires mark-read without waiting.
5. **m2:** the web parses `kind` as a closed enum (`contract.ts`), while `needsYou()` filters by group only, so a future MY_DEADLINES kind makes the whole list "Could not load". Fix: filter `kind in NEEDS_YOU_KINDS` on the server, or drop unknown kinds.
6. **m3:** the empty hint says "…in your notification settings", and no web screen for them exists yet. It is the concept's copy (m8), for the Lead.
7. **m4:** after an Open, the failure Notice says "We could not hide this reminder." and gives no retry hint (EXPERIENCE §2.10). The concept's copy, for the Lead.
8. **m5:** the check presets `xr-actor = user-O` in every tab (`tab()` init script), so DW3 never covers the fresh browser named in challenge B1 (a). My walk did.
9. **m6:** two concept behaviours are walked by me only, not in the check: focus moving to the *next row* after Hide, and BR-2's "back to the top" among other items.
10. **m7:** the graph tool cannot see `/home` (a module route) or `GET /platform/me/needs-you` (the second controller in `routes.ts`), and lists `POST …/:id/read` as untested although DW4 posts it. A limit of the tool, not a missing test.

**For the Lead (records, not findings):** The X-rows for Q1 (`CaseLabelPort`) and Q2 (the case page acting as the signed-in staff member) are named in the concept, the build notes and a comment in `store.ts`. BACKLOG rows are the Lead's to write (P-521, P-582).
* m5 and m6 of the challenge go to the founder's morning look.

## What I could not check
* A real screen reader, or an intended user's unaided walk (D17, D20).
* Refetch on window focus: my synthetic events fell inside `staleTime` 2 s, so the result was inconclusive.
* The full CI, and the J-74 walk (moved to another PR).
* The later commit `7fd6b3189` (build notes only).
* The builder's uncommitted edits to `home-page.tsx`, `contract.ts` and the check, which appeared in this checkout after my runs (22:59 UTC). They are not part of this verdict.

**Verdict: Approve** (for `8386faca7bc09f4f061a86a0d9ceee0b19416f75`).
