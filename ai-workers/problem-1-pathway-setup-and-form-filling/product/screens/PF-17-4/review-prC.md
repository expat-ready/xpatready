# PF-17 part 4, PR C (console Support page and ticket panel; R1.93): independent review, 24 Nov

## Round 2 (head `3c703b98555a3745ed76754b54b4215bf13a4025`; the current verdict)
Delta checked: `git diff 67aece028 3c703b985` (support-page.tsx, contract.ts, the shared Panel title in controls.tsx, the check, challenge.md BD-1, the breaker's report).

**Verdict: Block** (last round allowed). Round 1's Major #1 is fixed. But the breaker's M2 fix (focus after the panel closes) only works when the close animation outlasts the queue's refetch. Its own new check fails **2 of 2** on my copy. That makes one new Major, and the fix is small.

**What I ran (copy `rvc3` :4473, never :4400):**
* `web-fresh.sh build` OK; `tsc -p web --noEmit` exit 0.
* `check_pf17_support_browser.ts 4473 xr_studio_rvc3`: **21/22, twice**. Both times the failure was the same line, "B9c fail (round 2, breaker M2)", with `landed: "BODY|"`. The builder reported 22/22 twice.
* `check_pf17_console_browser.ts`: **32/32**. `j_93.ts rvc3 4473`: **24/24**.
* My own probes on the running app (below).
* Copy stopped. `scan-logs.ts var/isolated-logs/rvc3-api.log`: "0 finding(s) — ok" (exit 0, 1 114 lines).
* My runs overwrote six committed PF-17-4 screenshots; I restored them with `git checkout`.

**New Major**
* **R2-1. After a reply moves the ticket out of the current filter, closing the panel drops focus to the page body for anyone with reduced motion or a slow network** (WCAG 2.4.3; EXPERIENCE §2.12 [M]).
  * Cause: `backTo` (`support-page.tsx`) chooses its target at close time. "Reply sent" appears *before* `invalidateQueries(["sys","queue"])` has re-read the list, so a quick Escape finds the row's button still connected and focuses it. A moment later the refetch removes the row, and focus falls to BODY.
  * Probe (only open ticket, `?status=OPEN`, Send, wait for "Reply sent", Escape):
    * Without reduced motion: focus events `Send reply → dialog → H1 Support`. Correct, but only because Radix's close animation lasts longer than the refetch.
    * With `reducedMotion: "reduce"` (as the check itself sets): `Send reply → dialog → BUTTON <the row>`, then **BODY** at 50, 200, 600 and 1 200 ms.
  * Replying always takes a ticket out of the New and Waiting on us filters, so this is the main path for anyone using those chips.
  * The check is right. The product is racy, and the builder's green runs were timing luck. As it stands, CI can go red at random (D16).
  * **Fix:** decide again after the list settles. For example, in `SupportBody` add `useEffect(() => { if (!ticket && document.activeElement === document.body) backTo()?.focus(); }, [d, ticket])`. Or keep a "just closed" ref and move focus in that effect. Run the support check twice with the B9c line green.

**Round 1's findings, re-checked:**
* **#1 Major: fixed.** I opened a ticket, sent a blank reply, closed the ticket in the database, typed and pressed Send. The panel then read "This ticket was closed while you were writing. Your reply was not sent.". The header changed to "· Closed ·", the box went away and the closed note showed. After Escape the row read "Closed". The database still holds 1 message. B5c covers this.
* **#2: partly fixed.** Labels replace the parameter names ("Status:", "Reply:"; `refusalWords` in contract.ts). A blank reply still shows the firm-facing words: "Some fields need a change. Reply: write what you need help with, without control characters". No `maxLength`. Firms still uses its own copy with raw names (PR B R2-d). Minor.
* **#3: fixed** ("No tickets on this page." with Go to page 1; a B4b line). **#6: fixed.** Clicking the Age or Last activity cell opens the panel. The firm link still filters and does not open it (checked). **#7: fixed** ("Show every ticket" on an empty filtered list; a B4b line).
* **#8: fixed.** The new sentence matches the firm side and the API, and BD-1 in `challenge.md` asks the Lead to confirm it.
* **#4, #5, #9, #10:** follow-ups, as stated. They are still Minor, and still to be recorded on the row.

**The breaker's fixes and what the delta could break:**
* **Shared Panel title** (`min-w-0 [overflow-wrap:anywhere]`; 40 Panel users, 4 with a badge). I probed the Support panel with an injected badge, comparing the new and old classes:
  * Short title: identical (115×28, badge on the same line).
  * Long title with spaces: identical (471×56).
  * One unbroken word: old 688 px wide and **overlapping Close**; new wraps to 471×56, clear of Close.
  * So the change only affects unbroken text, where it fixes the overlap. Safe for the other panels.
* `?ticket=..%2Ffirms` is escaped and answers "No such support ticket.".
* `dir="auto"` on messages and the box. The box is read-only while sending. "Reply sent" is announced through a live region that stays mounted.
* The new copy reads well. The row's hover token (`surface-sunken`) and `text-text-ok` exist in tokens.css.

**Journey score, round 2: 8½/10, pass** (no criterion at 0):
* task completed 1
* next step obvious 1
* plain words ½ (#2 firm-facing words)
* feedback and state ½ (#4)
* correct data 1
* error recovery 1 (#1 and #3 fixed)
* accessibility and screen sizes ½ (R2-1, #5, #9)
* speed 1
* visual quality 1
* trust and sources 1

**D-score changes:** D1 3→4 · D5 3→4 · D10 3→4 · D11 3→4 · D13 4→3 (R2-1) · D16 4→3 (a new line fails 2/2 here).

**List to fix for Approve:** R2-1, with the support check green twice. The rest are Minor.

Reviewer: Block 3c703b98555a3745ed76754b54b4215bf13a4025

---
# Round 1 (head `67aece028`; kept as the record)

Reviewer: a fresh context that did not build it. Head `67aece0280850c56d354cb0305438a34c9e03a89` (#3517, stacked on B `20f5bd12c`). Diff `git diff origin/claude/runtime-pf17-screens...HEAD -- studio/` (6 code files, +360). Checked against concept r2 §4d, §4e, §5, §6 B4-B6, BR-1, BR-5 to BR-7; `design/console-r1.html`; SA-10 §3.2-§3.4; STANDARDS, EXPERIENCE (§7 UXL), QUALITY; j_93 W4; PR B's findings (`review-prB.md`). The journey test is the section below (one file, as briefed).

**Verdict: Block** (skill scale: Ship after fixes). One open Major, a small fix. Everything else is sound or Minor.

## What I ran (copy `rvc2` :4467, never :4400)
* `web-fresh.sh build` OK; `tsc -p web --noEmit` exit 0.
* `check_pf17_support_browser.ts 4467 xr_studio_rvc2`: **17/17**. `check_pf17_console_browser.ts`: **32/32**. `j_93.ts rvc2 4467`: **24/24** (both W4 screen lines pass).
* My own Playwright walk at 1440, 1024, 512 at scale 2 (200 %) and 375. Firm A's Owner signed in on the firm card, pressed "?" on Licences and sent a two-line ticket with accents and Chinese. Then I signed in on the console card as `support.sample@…`, found the ticket, replied, and saw the reply on the firm's Help & support page. Also: keyboard only, 300 ms and 2.5 s stubbed latency, a stubbed 500, a ticket closed in the database while its panel was open, bad and unknown `?firm=`, `?ticket=nope`, `?page=99`, a blank, a spaces-only and a 20 001-character reply, and a double-click on Send.
* Copy stopped. `scan-logs.ts var/isolated-logs/rvc2-api.log`: "0 finding(s) — ok" (exit 0, 975 lines).
* My runs overwrote the five committed PF-17-4 screenshots; I restored them with `git checkout`.

## Findings
**Major**
1. **BR-7's 409 path does not behave as written: after the refusal the panel and the row still show the old status, and the composer stays open.** Concept BR-7: "closed ticket → 409 shown in the panel, composer read-only".
   * Steps: open a ticket's panel, close the ticket in the database (as a firm-side close would), type, press Send reply.
   * What happens: the panel shows "A closed ticket takes no new message: raise a new ticket instead." (the firm's words, `support/support.ts:59`; Support cannot "raise a new ticket"). The header still reads "· Waiting on firm ·". The box and Send stay live, so every retry fails the same way. After Escape the row still reads "Waiting on firm".
   * Cause: `support-page.tsx:30` only sets the error text. Nothing re-reads the ticket or the queue on an error, so the stale answer stays on screen (D5, wrong state shown).
   * No check covers it: B5b only opens a ticket that was already closed.
   * **Fix:** when the error is a 409, invalidate `["sys","ticket",id]` and `["sys","queue"]`, so the panel re-reads CLOSED and shows the closed note instead of the composer. Add a B5b fail line: close the ticket while the panel is open, Send, then expect the closed note, no box, and the row reading Closed.

**Minor**. Three of these (#2, #3, #4) repeat PR B's findings.
2. **Field errors show the parameter name, and the reply's error uses the firm's words** (PR B R2-d, repeated).
   * A blank or spaces-only reply shows "Some fields need a change. body: write what you need help with, without control characters". A long one shows "body: at most 5000 characters". `?status=NOPE` shows "status: …" and `?firm=nope` shows "firm: …" (`support-page.tsx:17`).
   * The box is marked `aria-invalid` and the words sit under it, which is good.
   * **Fix:** map body → "Reply", status → "Status" and firm → "Firm" in `contract.ts`, shared with Firms (R2-d). Set `maxLength={5000}` on the box (§2.8). For a blank reply, show a check written for Support ("Write your reply first.") rather than the firm-facing words.
3. **A page past the end says there are no tickets under "All"** (PR B #7, repeated; Firms fixed it).
   * `?page=99` shows "No tickets here. Pick All to see every ticket." with All already pressed and no pager (`support-page.tsx:91,105`).
   * It is reachable without typing an address: on a filtered page 2, replying moves the tickets out of the filter.
   * **Fix:** copy Firms: when `total > 0 && page > 1` and the page is empty, show "No tickets on this page." with "Go to page 1", and add a check line for it.
4. **No visible cue while a filter loads (UXL-12)** (PR B R2-a, repeated).
   * With a 2.5 s stub, pressing Closed left three "Waiting on firm" rows under the pressed Closed chip (screenshot in my walk). The only cue is the screen-reader-only line at `:86`.
   * **Fix:** set `aria-busy` and dim the table while `list.isPlaceholderData`.
5. **Focus falls to the page body after "Clear firm".** Enter on the chip removes it, and focus goes to BODY. The status chips and the firm link do keep focus (my probe, 300 ms latency).
   * **Fix:** after clearing, move focus to the pressed status chip or to the h1.
6. **The whole row does not open the ticket** (concept §4d "Whole row opens the ticket"; UXL-09 "whole row clickable"). Clicking the Age cell does nothing; only the subject opens it.
   * **Fix:** add a row `onClick` that ignores clicks on the firm link, with a pointer cursor. Keep the subject button as the keyboard target.
7. **The empty state has no link to All** (concept §4 States: "No tickets here." with a link to All). It is text only (`:91`).
   * **Fix:** add a "Show all tickets" button that clears status and firm.
8. **The closed-ticket sentence is untrue.** The page says "This ticket is closed. The firm can reopen it by writing again." But the firm side shows "Closed: No more messages on this ticket", the database refuses changes ("a closed ticket never changes"), and the API answers 409.
   * The builder used concept §5's copy as written. The concept is wrong, and it should have been raised as a challenge, not copied silently.
   * **Fix:** record it in `challenge.md`. Ask the Lead for, for example, "This ticket is closed. The firm can raise a new ticket if they need more help."
9. **No focus on the h1 after signing in on this page** (the pattern of PR B #9). After the card, focus is on BODY. The sign-in flag `arrived` also stays set until Firms next mounts, so Firms then takes focus without reason. **Fix:** do `takeArrival()` and focus the h1, as `firms-page.tsx:36` does.
10. **Small things.**
    * The Page column breaks inside words at 1440 ("/platform/lice nces"), from `[overflow-wrap:anywhere]` in a narrow column.
    * An unknown or malformed `?firm=` shows "Clear firm: this firm".

## What is sound
* **The journey works end to end.** A ticket raised from "?" on firm A's Licences page appears with its firm name, its plan ("Team (Sample)", the same `livePlanOf` source as Firms, BR-5), New, the raiser, the page, its age and 1 message. The reply is stored once as SUPPORT. The ticket becomes Waiting on firm in the panel, the row and the database. The firm reads our reply on its Help & support page. A double-click sends 1 POST.
* **The server's order is kept (BR-6).** Waiting on us comes before Waiting on firm, which comes before Closed (B4), and the page never re-sorts.
* **PR B's focus fix carries over.** `keepPreviousData`: Enter on a status chip keeps focus on the chip, and the firm link keeps focus.
* **Field errors are shown, not hidden.** A refused query shows Clear filters with no Retry. A 500 shows Retry, which recovers. `?ticket=nope` shows "No such support ticket." in the panel.
* **Keys (BR-1).** Billing gets no Support menu item and reads the API's sentence with no chips. An Auditor reads the ticket and gets no composer, with a reason. The server enforces both keys (`support.ts:68-70`).
* **Panel (§4e) matches the board.** Header: subject, firm, plan, status, age, page. The thread is in order, ours shown as "ExpatReady support". There is one filled button. Escape returns focus to the row's button. The address `?ticket=` reopens the panel on reload, and Back closes it.
* **Accessibility and widths.** axe 0 on the page and on the open panel at 1440, 1024, 200 % and 375. No sideways scroll. The panel is one pane at 375. Send is 44 px at 375 (UXL-09). The tab title is "Support · ExpatReady console".
* **Code.** Small and readable. No per-row requests from the page (one GET per view; plans once per firm on the server). No migration. The module row is updated. The red check came first (`3770f1f0d`).

## D1-D20 (independent reviewer, browser and script evidence)
D1 3 (§4d, §4e built; BR-7 #1, row #6, empty #7) · D2 4 (one SUPPORT message, status moved, nothing else) · D3 4 (shared Panel, Table, Notice) · D4 N/A · D5 3 (#1 stale after 409, #3) · D6 N/A · D7 N/A (no AI) · D8 4 · D9 4 (row → panel → reply in 3 steps) · D10 3 (#2, #8) · D11 3 (#1, #4) · D12 4 (matches `console-r1.html`) · D13 4 (axe 0 everywhere, keyboard path works; #5, #9) · D14 4 · D15 5 (local answers under 100 ms) · D16 4 (17/17, red first; gaps: 409, page past end) · D17 simulated only · D18 4 (UTC said, Sample, one plan source) · D19 5 (j_93 W4 closed, 24/24) · D20 simulated only.

## UXL-01..14 (1440 and 375 px; 1024 and 200 % too)
01 Met (one filled button) · 02 Met · 03 Met · 04 Met · 05 Met · 06 Met (5 chips) · 07 N/A (ids hidden) · 08 Met · 09 **Partly** (#6; Send 44 px at 375, chips 32 px) · 10 Met (the table scrolls in its own box with a cut edge) · 11 Met (one pane at 375) · 12 **Partly** (#3, #4) · 13 **Partly** (#2: no max length on the box; spaces-only refused with words) · 14 Met (text, not colour). BIC-01..20: N/A (internal console, concept §4b). Retrofit: the team's names (Support, Waiting on firm) are kept.

## Journey test (reviewer role; skill journey-test)
| Journey (persona: our Support member; firm A's Owner) | Result |
|---|---|
| Firm A's Owner presses "?", writes and sends; Support finds it with the firm and plan, opens it, replies; the firm sees the reply | held (walk, j_93 W4, database) |
| Narrow by status and by firm, keyboard only | held; focus lost on Clear firm (#5) |
| Blank, spaces-only and too-long reply; double-click | refused on the box with field-named words (#2); 1 POST |
| Ticket closed while being answered | **wrong state after the 409** (#1) |
| Empty, page past the end, 500, bad address | 500 and bad address held; #3, #7 |
| Wrong key by address: Billing; Auditor without manage | held |

**Score: 8/10, pass** (no criterion at 0):
* task completed 1
* next step obvious 1
* plain words ½ (#2, #8)
* feedback and state ½ (#1, #4)
* correct data 1
* error recovery ½ (#1, #3)
* accessibility and screen sizes ½ (#5, #9)
* speed 1
* visual quality 1
* trust and sources 1

Raise it with #1 first, then #2 and #3.

**Could not check:** a real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). Over 50 real tickets (the page past the end was reached by address). I read the tests rather than mutating the code to see whether they fail. `graph.mjs` (G3 276, G6 24) lists `GET /system/support/tickets/:id` and `POST …/replies` as "no page uses it". This page uses both: the tool does not see prefixed `systemApi` calls, a tool gap already noted in PR B.

**List to fix for Approve:** #1. #2-#10 are Minor: fix them now or record them on the row. #2-#4 repeat PR B's patterns, so fixing them in the shared code helps both pages.

Reviewer: Block 67aece0280850c56d354cb0305438a34c9e03a89
