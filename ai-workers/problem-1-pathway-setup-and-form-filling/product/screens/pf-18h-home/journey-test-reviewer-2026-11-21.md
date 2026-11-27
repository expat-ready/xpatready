# Journey test: PF-18h staff Home, "Needs you" (reviewer, 21 Nov ~04:30 IST)

**Score: 9/10, pass** (no criterion at 0).
* Tested at commit `8386faca7bc09f4f061a86a0d9ceee0b19416f75`.
* Copy: isolated `rev18h` on :4719 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped at the end; never :4400.
* Live AI off, US$0.
* Walked headless with Playwright, through the UI only.
* Setup used scripts: cases came from the runtime API, and reminders came from PF-18n's real `PrismaNotificationPort`.
* My walk scripts and screenshots are in my scratchpad, not committed. The builder's committed screenshots show the same states.

## Journeys (persona: a case officer at a firm unless named)
1. **Main path.**
   * Steps: sign in from a fresh browser with no stored person → Home → open the newest reminder → the case.
   * Expected: the case shows with its number, and the item leaves Home.
2. **Alternate.** "Hide until next reminder" by keyboard on the middle of 3 rows. Expected: the row goes and focus moves to the next row.
3. **Empty.** Firm B's staff member signs in. Expected: "Nothing needs you right now." plus the hint.
4. **Error.** The list fails to load, then marking read fails on Open. Expected: a Notice with Try again; the page stays, with "Open the case anyway".
5. **Wrong role and other people.**
   * Cases: no session, the Studio `x-actor` alone, another firm, another person.
   * Expected: 401, 401, an empty list, 404.
6. **Recovery.** Reload, Back, double click, and a stale tab that already hid the row.
7. **Screen boundary.**
   * The representative opens their own item, and a browser that has a Studio person stored opens one.
   * Expected per Q2 (accepted scaffolding): the case page acts as the simulated person.
8. **Sizes.** 1440, 1024 and 375 px, 200 % zoom (720×450 and 512×384), and 320 px.

## What held
* **J1:**
  * The sign-in card on `/home` led straight to the list.
  * The list showed "3 items need you", newest first, with the zone named in the foot.
  * The Tab order was frame, then menu, then row link, then Hide.
  * Enter on the newest row sent 1 POST, then opened `/cases/<id>` with the header `C-2026-00008`; the case page shows "Acting as Case officer · Simulated".
  * Back went to Home, without that row.
  * The brand link opened `/home`.
* **J2:**
  * After Space on the middle row's Hide, the row was gone and focus sat on the next row's link.
  * The database showed that one row read, and the two others still unread.
* **J3:** firm B saw the empty state, with axe clean.
* **J4:**
  * GET 500 showed "Could not load what needs you." with Try again, and Try again restored 3 rows.
  * POST 500 on Open kept the URL `/home` and showed "We could not hide this reminder." with "Open the case anyway", which opened the case. The row stayed unread, which is correct.
  * Loading showed 5 skeleton rows and `role=status`.
  * axe was clean in every one of these states.
* **J5:**
  * Without a session: 401. With a Studio actor only: 401.
  * The builder's check, re-run by me, covers the rest. Firm B gets an empty list; marking firm A's row read gives 404 from firm B and from a colleague; the row stays unread.
* **J6:**
  * A double click on Hide or on Open sent 1 POST.
  * After a hide made in another session, the stale Hide gave no error and the row left.
  * A reminder that came back while the list was open stayed unread after Hide, matching PF-18n's `seen`.
* **J7 (accepted scaffolding, Q2):**
  * The representative landed on C-2026-00002 as "Case officer (Simulated)".
  * The browser with a Studio person stored got "Cases are worked by the firm … Continue as Case officer".
* **J8:**
  * There was no sideways scroll at any width, and axe was clean.
  * At 375 px the menu became a row above the page.
* **Speed:** 183, 182 and 196 ms from reload to the list.
* **Re-runs on the same copy:**
  * `check_pf18h_home_browser.ts`: 21/21.
  * PF-6a: 52/52. PF-6f: 11/11.
  * PF-18n: 34/34, on its own database.

## Findings (none Blocker or Major)
* **Minor: focus is lost around Hide.** While Hide is busy, focus falls to `body`, because `Button busy` disables it. It stays there if the hide fails. A keyboard user then starts again from the top (`home-page.tsx`, Row's Hide and `act()`'s catch).
* **Minor: the case number splits at 320 px.** It breaks at its hyphens as "C-2026-" / "00006", against concept §5's "case number never wraps". It holds at 375 px and wider.
* **Minor: the copy has two problems.**
  * The empty hint sends the person to "your notification settings", which has no screen yet.
  * The open-failed Notice says "hide" after the person pressed Open, and offers no retry hint.
  * The zone is shown as the raw id "America/Toronto".
  * All of this is the concept's copy.
* **Minor:** a Ctrl/Cmd click opens the case in a new tab and leaves the item unread (challenge m1 asked for the mark-read to fire).
* **Minor: the committed check misses some paths.**
  * There are no failure or loading paths, and axe runs only on the normal state.
  * DW3 presets the stored person, so it never covers the fresh-browser case I walked in J1.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: sign-in → Home → case with its number, row gone |
| Next step obvious | 1 | one link per row naming the case; one secondary action |
| Plain words | ½ | IANA zone id, unbuilt "notification settings", "hide" on an Open failure |
| Feedback and state | 1 | skeleton + status, busy spinner, count updates, Notices |
| Correct data | 1 | one row per deadline; only the acted row read; others' rows untouched; 404 across people and firms |
| Error recovery | 1 | Try again restores; "Open the case anyway"; stale tab and double click safe |
| Accessibility and screen sizes | 1 | axe clean in every state at 375/1024/1440 px and 200 %; keyboard complete (focus-on-failure Minor) |
| Speed | 1 | ~185 ms to the list; no request per row |
| Visual quality | 1 | team frame and controls; matches the board |
| Trust and sources | ½ | no AI; the case page then acts as the simulated person (Q2, labelled); due date not shown (Q1, by design) |

**What would raise it:**
1. Plain words: name the zone in words, or by the office, and fix the open-failed Notice so its verb matches and it offers a fix. Both need the Lead's word on the copy.
2. Trust: the case page acting as the signed-in staff member, which is the Q2 X-row on the case side.

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* Refetch when the window regains focus (inconclusive inside `staleTime`).
* Hostile or long text: the rows hold no free text, only a kind word and a case number.
