# PF-18ns — fresh challenge (independent challenger, 23 Nov)

Read: `concept.md`, `design/draft-layout.html`, BACKLOG rows PF-18ns and PF-18n, `trace-requirements.py --brief PF-18ns` (AG-10-29a, -29b, -36, AG-16-10, AG-7-39), `EXPERIENCE.md`, `STANDARDS.md`, PF-18s's draft (PR #2332) and the studio code on this branch (studio tree identical to `origin/main` 6201f2f39). `ai-workers/tools/freshness.sh` does not exist: skipped. No immigration value is involved. Paths below are under `prototype/studio/` unless stated.

## Verdict
**Build after these changes.** The concept is sound: the right shape, honest about what is missing, and it never puts a missing back end in the screen. It has no Blocker. Two Majors: one would make the acceptance criterion on screen-reader announcements fail in practice, and one would leak a lead's name. Both are a sentence each in the concept plus one test line. The order in Q3 (PF-18n part 2 first) is right and is already in the definition of ready.

### Fact check of the concept's claims (all verified in code; confidence high unless stated)
| Claim | Right? | Evidence |
|---|---|---|
| PF-6 frame `controls` holds FindBox, "?", name, Sign out | Right. The line is **98**, not 97. "?" shows only to holders of `SUPPORT_CREATE_KEY` | `web/src/modules/platform/frame.tsx:98` |
| PF-18s settings on main at `/account/notifications` | Right | `web/src/modules/platform/routes.tsx:44`; `settings/notifications-page.tsx` |
| Part-1 routes (items, unread-count, read-all?seen, :id/read?seen) | Right | `api/src/platform/notifications/routes.ts:31-49` |
| M-1: only three `notify` callers, no lead kind, no `"lead"` item kind | Right. `POST leads/:id/assign` and FO-10's `place.ts` never call the port, and `front-office/sales/` has no notification code at all. No open PR names PF-18n part 2 (REST list of open PRs, 23 Nov) | `case-deadlines/reminders.ts:176,194`; `client-money/card/account.ts:173`; `ports/notifications.ts:15-30`; `front-office/sales/routes.ts:88` |
| M-2: `linksOf` builds `/cases/<id>` only; anything else gets `link: null` | Right | `api/src/platform/notifications/store.ts:47-67` |
| M-3: `GET items` has no record words | Right. Note: `linksOf` already returns `caseNumber` and `needsYou` sends it (`store.ts:94`), so `label` for case kinds is a one-line change | `store.ts:81` |
| M-4: only `needs-you` answers `zone` | Right | `routes.ts:52-63` |
| Q1: the walk ends in SalesFrame, and case pages use another Frame | Right. `lead-page.tsx:182` renders in `SalesFrame`. 8 pages use SalesFrame (leads, lead, pipeline, prospect, web form, retainer templates, retainer, conflict confirm); 20 use PlatformFrame. The case Frame (`runtime/cases.tsx:64-65`) works by the Studio's simulated `PersonPicker`, not the staff token, so a bell there would not be "one line". Deferring it is right | `sales-frame.tsx:62-67` |
| BR-3: "the frame's `loc.key` effect already re-checks" | **Half right.** Only PlatformFrame has that effect, and it re-reads `["fo","me"]`, not a count. SalesFrame has no such effect | `frame.tsx:85-86`; `sales-frame.tsx:57-80` |

## Objections

**MAJOR-1 The count is announced on every page change, not "once per change".** *Needed for the proof.*
* **What breaks:** each page wraps itself in its own `PlatformFrame` or `SalesFrame` (for example `lead-page.tsx:182`, `notifications-page.tsx:11`), so moving between pages remounts the frame and the bell. If "the number differs" is kept in component state (BR-8), every page load goes from nothing to 3 and is announced again. That breaks the row's acceptance ("announced to screen readers once per change") for anyone who moves between pages.
* **Example:** Agent A has 3 unread items and opens Leads, then a lead, then Pipeline: a screen reader says "3 unread" three times while nothing changed.
* **Fix (fact: high; the fix is judgment, high):** keep the last announced count outside the component (module-level, or in the query cache keyed by the person) and announce only when a fetched value differs from it. The first value of a sign-in is not announced. Add to DW4: "navigate between two pages with no change → no new announcement".

**MAJOR-2 A lead's `label` and `link` must follow the lead's visibility, not only "null when gone".** *Needed for the proof* (as a condition on PF-18n part 2's contract, which this concept proposes in §6).
* **What breaks:** a notification row outlives the assignment. Leads follow own-versus-all visibility (`front-office/sales/README.md:19`; `sales/common.ts:59` `visibilityOf`). If the lead is reassigned away from an Agent without "view all", the old row would still show the lead's name, a personal name the Agent can no longer read (AG-10-29a "never leak … cross-user"; STANDARDS §6 deny by default). It would also show a link that answers 404.
* **Example:** Owner assigns Client A's lead to Agent A, then reassigns it to Agent B. Agent A's panel still reads "Lead assigned to you · Client A".
* **Fix:** in §6, write `label` and `link` as "null when the record is gone **or the person may no longer see it** (the lead's own `visibilityOf`)". The screen then shows the BR-5 unlinked row. DW3 gains one line: "lead reassigned away → the row shows no name and no link".

**MINOR-1 BR-3 leans on a frame effect the sales frame does not have.** *Needed for the proof.* The bell should refresh itself on `useLocation().key` (plus `refetchInterval: 60_000`, with polling off while the tab is hidden), whichever frame holds it. SalesFrame also has no terms gate (`sales-frame.tsx:66` shows FindBox ungated), and the guard answers 428 TERMS_PENDING (`api/src/platform/identity/guard.ts`). So the shared bell should render nothing on 428, not the "Could not load" state.

**MINOR-2 Opening a row duplicates PF-18h's flow, and drops parts of it.** *Needed for the proof.* Home already marks read first, then opens (`home/home-page.tsx:4-5, 65-80`). It keeps the page when `readAt` comes back null ("A newer reminder came in…"), offers "Open the case anyway" when the mark fails, and marks a Ctrl/middle-click open as read (`:36, :99`). Concept BR-5 and §4 say only "row stays unread, inline 'Could not mark this read.'", which leaves opening blocked by a failed mark. Fix: state the same three outcomes (a failed mark still lets the person open) and reuse Home's words.

**MINOR-3 Words, zone and cache are defined twice.** *Needed for the proof.* Home's kind map says "A stage deadline" / "A government step" (`home/contract.ts:24`), while §5 says "A government step is due". Home shows the zone once ("Times in …", `home-page.tsx:101`), while the panel repeats "· America/Toronto" on every row. STANDARDS §7: no duplicated logic. Fix: one kind-words map in `notifications/contract.ts` that Home can later import (no Home edit in this row), and the zone once in the panel footer. After any mark, invalidate both the bell count and Home's `["pf","home","needs-you"]` key: the two read the same rows.

**MINOR-4 "This item can no longer be opened" is false for an item that never had a page.** *Needed for the proof.* `payment-account-disconnected` carries item kind `firm` (`account.ts:173`), which has no link builder and no web route (the email's `/settings/payments` has no route in `web/src`). The Owner would read that a live disconnection "can no longer be opened". Fix: a neutral line for any null link, for example "No page to open for this notice", with Mark read.

**MINOR-5 The panel's role is not named.** *Needed for the proof.* A panel that traps focus is a modal dialog. Write `role="dialog"`, `aria-modal="true"`, named by its "Notifications" heading, with initial focus on the heading. Build it on the existing `Dialog`/`Panel` focus handling in `components/ui/controls.tsx:77,102` rather than a new popover primitive (STANDARDS §1: prefer what exists). BR-7's fallback sentence ("until the zone is answered…") goes, since Q3 puts M-4 on main first. The frame line reference should be :98.

No objection is *Not built*. No scaffolding stands in for a capability (P-33). I added no scope: email, @mention and the other callers stay PF-18n part 2's.

## What is sound
* §0 is accurate and honest: every gap is placed on PF-18n part 2, none is faked in the browser. The N+1 risk in M-3 is caught, and the server builds `label` on read, matching `linksOf`.
* BR-1, BR-2 and BR-9 follow AG-10-29a, AG-10-36 and AG-10-29b exactly: no person, firm or view parameter is sent, and preferences are only linked to.
* `seen` is used on both mark routes ("duplicate beats a miss", AG16-60) and DW2 tests it: better than the benchmark products.
* Q1 is correct and well evidenced. Bell in PlatformFrame and SalesFrame follows the FindBox precedent (`sales-frame.tsx:10,66`), and leaving case frames out is right given their simulated identity.
* The states are complete (EXPERIENCE §3, BIC-18): skeleton, two empties, load failed, mark failed, long name, 375 px. Colour is never alone. The 99+ cap is there.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Badge count | `msg_notification` (read_at null) | `GET me/notifications/unread-count` (on main) | BR-1, BR-3; MAJOR-1 announce | DW1, DW4 (+ navigation line) |
| Panel rows (20) | same | `GET …/items?size=20` + `label`, `zone` (PF-18n part 2) | BR-4, BR-7; MAJOR-2 visibility | DW1, DW3 (+ reassigned line) |
| Lead row exists | `msg_notification` kind lead, item `lead` | `notify` in `POST leads/:id/assign` and FO-10 placement (PF-18n part 2) | AG-16-10 test 1; AG-7-39 r2 | PF-18n part 2's check; DW1 |
| Open a row | read_at | `POST …/:id/read?seen=` (on main) | BR-5, MINOR-2 | DW1 |
| Mark all read | read_at | `POST …/read-all?seen=` (on main) | BR-6 | DW2 |
| All page | same | `GET …/items?unread&page&size=25` | AG-10-36 | DW6 |
| Lead link | none stored | `linksOf` adds `/front-office/leads/<id>` (PF-18n part 2) | MAJOR-2 | DW1, DW3 |

## Questions for the founder
None: Q1–Q3 are the tech lead's. The challenger agrees with all three recommendations (Q1 with MINOR-1's self-refresh, Q3 as the gate).

## Lead response
— (the tech lead's). Builder note: concept r2 takes in both Majors and all five Minors as written (see concept Status line); nothing is declined.

## Agreement
—

## Build discoveries
—
