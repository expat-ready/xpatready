# PF-18s part 2 (the "?" button and Help & support, R1.92): independent review

Commit reviewed: **2ed09e077c74d205611195331d49c81bdb50b700** (branch `claude/gallant-pascal-kks7vc`, draft PR #2906). Reviewer: a fresh context that did not build it. Spec: `concept-draft.md` + `challenge.md` on #2332 (`concept-2332`, dcc2e6b3), boards D and E; challenge M3, M4, M5, M6, m4, m6, m7, m9, m10. Requirement: AG-16-63. Run on isolated copy `review_pf18s2` :4731 (fresh database), live AI off, US$0; copy stopped, rewritten screenshots restored. Part 1's review is in git history (4f0705259). Journey test: `journey-test-reviewer-2026-11-22-part2.md`, **7.5/10, below the 8 pass** because of M-1.

## Verdict: Rework (Block) for 2ed09e07. One Major, five Minors.
The row's Done-when holds: `check_pf18s_help_browser.ts` exits 0 (25/25, run twice). It opens the "?" from two pages, sends once, stops a second send inside the guard window and shows the error state. The double-send test can fail; I confirmed it myself (below). The frame edit is minimal. What blocks is one element of board E: **an attachment cannot be opened**.

## Major (Must)
* **M-1 Clicking "Attachment 1" leaves the app for a raw 401 JSON page.** `support-page.tsx:90` does `window.location.assign(l.url)`. That is a plain navigation, so it carries no bearer token. `GET /api/platform/support/files/:token` is behind PF-4's guard (`api/src/platform/support/routes.ts:49`, key `support-ticket:list`), and the session lives in sessionStorage, not a cookie. Walked: raise with a PDF and a text file, open the ticket, click Attachment 1. The browser then shows `{"title":"Sign in again","status":401,…}`. curl gives 401 without the bearer and 200 with it. Board E's "files as links (signed link per click)" and the build notes' "attachments by a short-lived link" therefore do not work, and nothing tests them: the graph shows the link and file routes with no web use. **Fix:** fetch the URL with the bearer and save the blob, as `identity-panel.tsx:56` and `templates-page.tsx:37` already do. Show 410 "Link expired" in words. Add a DW step that waits for Playwright's `download` event, with a fail line: no 401 page.

## Minors (Should, ranked)
1. **m-1 A reply into a ticket closed meanwhile vanishes in silence.** The 409 refetch (`support-page.tsx:69`) turns the page Closed and unmounts `Reply` (`:113`), which takes the typed text and the "Not sent" notice with it. Walked: typed a reply, closed the ticket by SQL, pressed Send. Result: Closed notice, no text, no words. This breaks BR-11 "a failure … keeps the text" and concept §5 "409 closed: the service's words". **Fix:** when the answer is a 409, keep the text visible under the Closed notice (or hand it to Raise a ticket), together with the server's words.
2. **m-2 Field errors are server fragments, in lower case, and use jargon.** On an empty Send the box says "write what you need help with, without control characters" (`api/src/platform/support/support.ts:69`, shown as given by `help-button.tsx:34`). Other examples: "at most 3 attachments" and "the file is not a PDF as its type says". This misses EXPERIENCE §2.10 and BIC-13 (what happened and how to fix it, in plain words). Reply disables an empty Send but Raise does not. **Fix:** words on the web for blank ("Write what you need help with."), start each server message with a capital, or disable Send while the box is blank, as Reply does.
3. **m-3 Between 640 and 767 px the list has a "Last change" heading over empty cells.** This affects a person who sees only their own tickets, and shows at 200 % zoom on a 1440 screen (reviewer shot `list-zoom200`). `headClass` is fixed by position (`support-page.tsx:39`), but the "Raised by" column is optional, so "Last change" gets `sm:` on the heading and `md:` on its cells (`:45`). When the label wraps ("Waiting on / support"), the status dot squeezes into an oval (`:21`, no `shrink-0`). **Fix:** build `headClass` from the same column list; add `shrink-0` to the dot.
4. **m-4 Tooltips appear only on mouse hover.** The status (`support-page.tsx:20`, a span that cannot take focus) and the "?" (`help-button.tsx:70`) use only `title`. EXPERIENCE §2.10 and BIC-14 want them on keyboard focus too. Screen readers do get the status tip (sr-only text) and the "?" name (aria-label). **Fix:** use the team's `components/ui/tooltip.tsx` (used in `billing-page.tsx`) on the "?" and the status.
5. **m-5 The test's words overstate the forced second click.** A disabled button dispatches no click, so the guard's proof rests on `requestSubmit()` (`check_pf18s_help_browser.ts:100, 156`). Behaviour is fine; only the words are wrong. **Fix:** say that in the comment and in the build notes.

## The double-send guard (owed 2, challenge M3): really can fail
I removed both `if (sending.current)` guards in the served bundle only: Playwright rewrote the JS asset, and no source was edited. Then I replayed DW2 and DW5 under a held first POST. **Raise: 3 POSTs. Reply: 2.** With the real bundle: 1 and 1. The two clicks and two Enters alone gave 1 POST even without the ref, because the busy button is disabled; the extra submits reached the network. This matches the builder's red run (`seenWhileHeld 3`). The check's API fail line (two direct POSTs make two tickets) shows the server does not deduplicate. m10's residual (a lost answer retried) is recorded in the build notes.

## Concept fit (part 2's share)
* **Board D met:** the "?" sits in PF-6's header with the name and tooltip "Get help with this page" and opens the right panel "Ask for help". It has one box, up to 3 files, no priority, and the line "We'll note the page you're on: /account/licence". The query and fragment are dropped (DW1, my walk with `?view=secret-token#frag`). "Ticket sent … Open your ticket" follows. Escape asks "Discard your message?" when text is typed.
* **Board E met except M-1:** "Raise a ticket" (filled), subject link (M5: first line, 80 with "…"; checked with a French and Japanese first line), Status in words with tips, Waiting on firm in orange, "Raised by" only for Owner/Admin (M4 names from the server: "Raised from /account/licence by Case officer (Sample)"), Last change. The ticket page lists messages oldest first (You / name / ExpatReady support); the Owner can reply on any ticket; a Closed ticket has no box and shows the concept's words.
* **m4:** Enter makes a new line, and the newline is kept in the saved message. After a reply, focus lands on the new message; after a failure, on the box. **m6:** with a privacy notice pending, the terms page shows and no "?" (walked). **m7:** path only. **m9:** `fields` show on the fields (body, files). **M6:** seeding by SQL is labelled scaffolding in the check only; the demo path uses no scaffolding (P-33).
* **States:** empty (both texts, walked on `sample-solo`), loading (text status: PF-6's pattern, as part 1, not a skeleton), normal, long (4,923 characters, non-Latin), error on the field plus summary, refused (no key), not found (another person's ticket by address), sending (busy, disabled), failed (text kept). The conflict state is m-1.

## Frame edit and code (STANDARDS [M])
* **Frame:** `frame.tsx` +3/−1: two imports and one conditional slot in `controls`, nothing else. `help-button.tsx` does not import the frame, so there is no cycle. `session.ts`: `form` is additive (used only here).
* **Server:** `support.ts` is additive with no migration. The list makes 1 ticket query with `include` (raiser, first message), and a ticket makes 3 queries, with no per-row request and no `GET /staff`. Names come from `firmScope(t.firmId)`, so another firm's names cannot appear. Authorisation stays with PF-18b's guard.
* **Rules and tests:** strict types, contract parsed at the edge, module-card rows present, comments cite #2064 and challenge points. "A rule's test fails when the rule is removed": met for the guard (above), the path rule (DW1), visibility (DW4, DW5 404) and Closed (DW5).

## D1–D20 (1–5)
| D | Score | Evidence |
|---|---|---|
| D1 | 3 | AG-16-63 raise, own list, Owner sees all and replies all met; attachments cannot be opened (M-1) |
| D2 | 4 | One ticket and one reply under a held double send; path only; firm-scoped names; server does not deduplicate a retry (m10, recorded) |
| D3 | 5 | `Panel`, `Table`, `Notice`, PF-18b routes; no new route |
| D4 | N/A | No dependent questions |
| D5 | 3 | 500 recovers with text kept; double send safe; 409 loses the reply (m-1) |
| D6 | N/A | No governance on tickets beyond PF-18b's audit event |
| D7 | N/A | No AI |
| D8 | 4 | "My account › Help & support › Ticket", back link, subtitle "In Settings: Help & support" |
| D9 | 4 | "?" → type → Send → "Open your ticket": 3 steps |
| D10 | 3 | Subject instead of ids (M5); server fragments (m-2); raw JSON (M-1) |
| D11 | 3 | Busy, sent, not sent, closed visible; silent 409 (m-1) |
| D12 | 4 | Team look; column mismatch at 640–767 px (m-3) |
| D13 | 4 | axe clean (panel, list, ticket at 375/1024/1440); keyboard path; 200 % with no sideways scroll; hover-only tips (m-4) |
| D14 | 4 | Team components and words; Raise is a right panel |
| D15 | 5 | List first view 338 ms; check 17 s for 25 checks |
| D16 | 3 | 25 pass/fail checks, red when the guard is removed; no test opens an attachment (M-1) |
| D17 | — | Simulated only |
| D18 | 4 | Page noted and shown before sending; author names on every message |
| D19 | — | Part 2 of 3; support's side is PF-17 |
| D20 | — | Simulated only |

## Scorecard (EXPERIENCE §6; not case-side, concept §4c)
BIC-11 Met (one filled button: "Raise a ticket"; panel "Send") · BIC-13 Partly (field plus summary, text kept; m-2, m-1) · BIC-14 Partly (m-4) · BIC-18 Met (states above) · BIC-19 Met at 1440/1024 (orange only for Waiting on firm, red only for errors; m-3 at 640–767) · BIC-20 Met (keyboard: Tab to "?", Enter, type, Send; 200 %) · BIC-01–10, 12, 15–17 N/A (no facts, AI, filing or review). Evidence: builder shots `pf18s-help-1…6`; reviewer shots in the session scratchpad (not committed).

## Graph (P-86)
`graph.mjs`: G1 0, G2 0. G3 lists all six `/platform/support/*` routes as untested and unused by the web: the tool's known blind spot for `staffApi(`, as in part 1. Four are exercised by DW1–DW5, but **`POST …/files/:n/link` and `GET …/files/:token` are reached by no browser test**, which is how M-1 got through. Every element serves AG-16-63.

## Not checked
A real screen reader; files over 10 MB; Safari/Firefox; the team's code (Mac-only, so the retrofit mapping is Unverified, as in the challenge); an intended user's unaided walk (D17/D20 stay with the founder).

**Verdict: Block.** To fix: M-1 (Must); m-1 to m-5 (Should, or a follow-up row each).

Reviewer: Block 2ed09e077c74d205611195331d49c81bdb50b700

---
## Round 2 (commit 5ee13db4ec1c158a23db7962793c4ffcdf3976ee): Ship (Approve)
Scope: `git diff 2ed09e07..5ee13db4` only (support.ts, help-button.tsx, support-page.tsx, support-contract.ts, the check, build notes). Isolated copy `review2_pf18s2` :4732, fresh database, `AI_LIVE=off PLATFORM_IDENTITY=local`, US$0. `check_pf18s_help_browser.ts`: **30/30 twice**, exit 0, 15 s. I also walked it in my own Playwright script (shots in the session scratchpad, not committed). The copy is stopped and the rewritten `pf18s-help-*.png` are restored.

| Round 1 | Fixed? | Evidence (walk + test that fails without the fix) |
|---|---|---|
| **M-1** attachment opened by navigation → 401 | **Yes** | `support-page.tsx:19-34` fetches with the bearer and saves the blob. A 401 ends the session as `staffApi` does. Walked: Attachment 1 saved `support-1.pdf` (`%PDF-`), Attachment 2 saved `support-2.png`, still on the ticket. A 410 shows "File not opened · This download link has expired. Open the ticket again." Test: DW5 waits for Playwright's `download` event and checks the PNG bytes. With `location.assign` no download fires, the wait throws and the check fails (`:225`). The fail line asserts 401 without the bearer. |
| m-1 reply lost on a 409 Closed | Yes | `Reply` now always mounts (`:133`). While it holds text on a Closed ticket, the box stays read-only with "Not sent · A closed ticket takes no new message: raise a new ticket instead." There is no Send, the hint says "copy your text into a new ticket" and focus is on the box. Axe is clean in that state. A fresh Closed ticket still shows only the Closed notice (1024, axe clean). Test: the new DW5 line (it would time out on `[data-reply-problem]` before the fix). |
| m-2 field errors were lower-case fragments | Mostly | `fieldOf` makes the server's words sentences and names the refused file ("File 2: The file is not a PDF as its type says."). Raise's Send is disabled on a blank or spaces-only box (walked). Residual below. |
| m-3 empty "Last change" column at 640–767 px | Yes | `headClass` now follows the columns (`:56`). At 720 px the heads are `[Ticket, Status, Last change:none]` and the cells match. No sideways scroll. The dot has `shrink-0`. |
| m-4 tips only on hover | Partly | The ticket page shows the tip as visible text ("Closed · No more messages on this ticket."), `aria-hidden` so screen readers do not hear it twice. The list status and the "?" are still `title` only. Residual below. |
| m-5 test words overstated the second click | Yes | The check's names and comments (`:108, :113, :170-179`) say that only the ref stops the one-moment submits. The guard code is unchanged, so my round 1 red run (3 and 2 POSTs without the ref) still applies. |
| Breaker m1 to m8 (not mine; checked in passing) | Yes | CRLF transform (`support.ts:70`). Node's FormData sends `\r\n`, so the DW1 4,999-character line goes red without the transform (5,048 > 5,000). Footer Close asks before discarding (DW1). Reopening mid-send keeps the message. Text typed during a send stays. Subjects drop bidi marks, are wrapped in `<bdi>` and cut by grapheme. A 413 shows on the files field. |

**Nothing broke:**
* DW1–DW6 hold as in round 1: one POST under the held double send, path only, 500 recovery, visibility 404, keyboard to "?", axe clean at 375/1024/1440.
* No page errors.
* The graph still shows G1 0 and G2 0. The support routes appear only in G3 because of `staffApi(`, the blind spot already noted. Both file routes are now reached by DW5.
* The frame and session files are untouched in this diff.
* The builder ran `check_pf18b_support` 41/41 and `check_pf28_inputs` 41/41. I did not re-run them: the server change is additive, the CRLF transform plus the subject function.

**Scores that change:** D1 4, D5 4, D10 4, D11 4, D12 5, D16 4. The rest are as in round 1. BIC-13 Partly (file words, below). BIC-14 Partly (m-4 residual). BIC-19 Met at every width.

**Open Minors (Should; a follow-up row each, none blocks):** 1. **m-2 rest.** "The file is not a PDF as its type says." and "At most 3 attachments." say what is wrong but not how to fix it (EXPERIENCE §2.10). A ZWSP-only body still reaches "…without control characters." (`support.ts:70`). Fix: "Attach a real PDF, PNG or JPEG." and "Remove a file: at most 3." 2. **m-4 rest.** The list's status tip and the "?" tip are still hover-only (`support-page.tsx:37`, `help-button.tsx:73`). Fix: the team's `tooltip.tsx`.

Journey (`journey-test-reviewer-2026-11-22-part2.md`, round 2): **9.5/10**, pass.

**Verdict: Approve.** There is no open Blocker or Major at 5ee13db4.

Reviewer: Approve 5ee13db4ec1c158a23db7962793c4ffcdf3976ee

---
## Merge of main (diff-only), commit c7615519b22230258249853660306fdd308815ef: Approve
Scope: `git diff bfe94dfd c7615519` on `routes.tsx` and the web `MODULE.rows/PF-18s.md`, and `git show c7615519 --cc` (the P-270 merge of origin/main, conflict with part 3 #2904).

* **routes.tsx:** both sides kept. Part 2's import (`SupportPage, SupportTicketPage`) and its two routes (`/platform/support`, `/platform/support/:id`) are unchanged. Part 3's import (`NotificationsPage`) and its route (`/account/notifications`) follow them. Nothing else in the file moved.
* **web MODULE.rows/PF-18s.md:** 4 lines (limit 6): part 1 + part 3 entry line, a tests line with both tests, then part 2's entry and tests lines word for word. The api row (4 lines) and the features row (1 line) are not touched by the merge.
* **build-notes.md:** part 2's section is kept in full, and part 3's section follows it. Records only.
* **account-sections.ts** (auto-merged): Notifications (part 3, line 10), Offices (part 1, line 15) and Help & support (part 2, line 17) are all present.
* **Nothing of part 2 lost:** `git diff bfe94dfd c7615519` on help-button.tsx, support-page.tsx, support-contract.ts, frame.tsx, session.ts, `api/src/platform/support/`, and the check is empty. The only change in those paths is part 3's menu line. `git diff ac456c6b c7615519` (what the PR now brings to main) lists exactly part 2's files, plus product records.
* **Re-run (mine):** `check_pf18s_notifications_browser.ts` on my own copy `review3_pf18s2` :4733 (fresh database, `AI_LIVE=off PLATFORM_IDENTITY=local`, US$0): **40/40**, exit 0. It shows part 3 works in the merged tree next to part 2. The copy is stopped and the 7 rewritten `pf18s-n*.png` are restored. I take the builder's other runs at c7615519 as reported (help 30/30, offices 28/28, pf1 routes 28/28, pf6a frame 52/52).

No new finding. Round 2's two open Minors stand as follow-ups. The journey score is unchanged (9.5/10): the merge changes no behaviour.

**Verdict: Approve.** There is no open Blocker or Major at c7615519.

Reviewer: Approve c7615519b22230258249853660306fdd308815ef
