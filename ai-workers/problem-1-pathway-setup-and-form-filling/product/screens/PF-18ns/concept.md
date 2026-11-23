# PF-18ns — the bell and the notification list: concept (addendum to PF-18s)

Row PF-18ns (BACKLOG, R1.50). Addendum to PF-18s's concept (`screens/PF-18s/concept-draft.md`, records PR #2332, not yet on main). Source: AG-10-29a, AG-10-29b, AG-10-36, AG-16-10, AG-7-39 (`trace-requirements.py --brief PF-18ns`, requirements-2026-11-02). No board (P-223 (4)); layout in `design/draft-layout.html`. Studio paths are under `prototype/studio/`, read on main 09b3893df (23 Nov). No immigration value here. Status: **for the tech lead's approval; not built.** r2: the fresh challenge (`challenge.md`: 0 Blockers, 2 Majors, 5 Minors) is taken in: M1 in BR-8 and DW4, M2 in §6 and DW3, the minors in BR-3, BR-5, BR-7, §4 and §5.

## 0. What it waits on, on main (step 1 check)
| Waits on | On main? | Evidence |
|---|---|---|
| PF-6's frame | yes | `web/src/modules/platform/frame.tsx:98` (`controls`: FindBox, "?", name, Sign out) |
| PF-18s (Notifications settings) | yes, part 3 | `/account/notifications` (`web/src/modules/platform/routes.tsx:44`, `settings/notifications-page.tsx`) |
| PF-18n list API | yes, **part 1 only** | `api/src/platform/notifications/routes.ts`: `GET me/notifications/items?unread&page&size`, `GET …/unread-count`, `POST …/read-all?seen`, `POST …/:id/read?seen` |

**Missing for this row's acceptance** (the row's walk starts "a lead is assigned to an Agent"):
* **M-1 No lead-assignment notification.** Only three callers of `notify` exist (`case-deadlines/reminders.ts:176, 194`; `client-money/card/account.ts:173`). FO-10's `api/src/front-office/assignment/place.ts` (rules) and the lead reassign route never call `NotificationPort`; `ports/notifications.ts` has no lead kind and `NOTIFICATION_ITEM_KIND` (:29) has no `"lead"`. PF-18n's row lists "a lead assigned to me (FO-10)" as its caller: owed by PF-18n part 2. No open PR names it (search 23 Nov).
* **M-2 No link for a lead.** `linksOf` (`api/src/platform/notifications/store.ts`) builds `/cases/<id>` only; any other item kind answers `link: null`.
* **M-3 No words for the record.** `GET items` answers `kind`, `item {kind,id}`, `link`, times: no case number or lead name. "who or what, the record" cannot be shown without a per-row lookup from the browser (N+1, and a lead read the person may not hold).
* **M-4 No zone on the list.** Only `GET me/needs-you` answers `zone` (routes.ts, `NeedsYouController`); the row wants times in the person's zone.
* Not blocking this screen: PF-18n's 90-day removal job (none in `api/src/platform/notifications/`).

## 1. Job and journey
* **Job:** a staff member sees, on any staff page, that work was handed to them, opens it in one click, and clears what they have seen.
* **Persona:** every staff role (no key to receive, AG-7-39 §8); routes are `@AnyStaff`, own only.
* **J1 (row's walk):** a lead is assigned to an Agent → the bell shows 1 → the panel shows "Lead assigned to you · <lead name>" → Enter opens `/front-office/leads/<id>` → count 0. **J2:** Mark all read → 0. **J3:** "See all" → My account → Notifications → All, filter Unread, page 2. Activity / SA-01B ids: not known.

## 2. Ten layers
| Layer | On main | New here |
|---|---|---|
| Data, rules, engine | `msg_notification`, `MyNotifications` (part 1) | none in this row (M-1 to M-4 are PF-18n's) |
| Contract | four `me/notifications` routes | `web/src/modules/platform/notifications/contract.ts` (zod, no app imports) |
| Screen | PF-6 frame `controls`; `/account/notifications` (settings) | `notifications/bell.tsx`, `panel.tsx`, `all-page.tsx`; one line in `frame.tsx`; route + tab (Q2) |
| Team's code | not read (`code/` is Mac-only) | — |

## 3. Business rules (the server decides; the screen shows)
* BR-1 Own only, firm-scoped; another person's id → 404 (routes.ts; AG-10-29a). The screen sends no person or firm id.
* BR-2 The Individual/Corporate view never filters, hides or re-orders the bell, count or lists (AG-10-36): no view parameter is sent.
* BR-3 Count = `unread-count`; refreshed by the bell itself on every navigation (`useLocation().key`; SalesFrame has no such effect, PlatformFrame's re-reads `me` only) and every 60 s while the tab is visible; no push in Release 1 (row). A 428 (terms pending) or 401 renders no bell (SalesFrame has no terms gate; challenge m1).
* BR-4 Panel = `items?size=20`, newest first; unread rows marked by a dot **and** the word "Unread" for screen readers (never colour alone).
* BR-5 Opening a row (reuses Home's flow, `platform/home/home-page.tsx`: a failed mark still opens; a re-surfaced reminder stays with its notice; a new-tab open is marked read): `POST :id/read?seen=<row createdAt>` then navigate to `link`; a re-surfaced reminder stays unread (part 1's `seen` rule, "duplicate beats a miss", AG16-60). `link: null` → the row is text, not a link, with "This item can no longer be opened" (or no line, for kinds that never have a page, e.g. payment-account-disconnected) and a "Mark read" button.
* BR-6 Mark all read: `POST read-all?seen=<newest createdAt shown>` so a notice arriving meanwhile stays unread; then count refetch.
* BR-7 Times in the person's zone (M-4); The zone name shows once, in the panel heading line, not on every row.
* BR-8 The count is announced once per change (polite live region updated only when the number differs), never every 60 s and never on a page change: each page mounts its own frame, so the last announced count lives outside the bell (module-level store, one per tab), not in its state (challenge M1).
* BR-9 "Choose what you get" links to `/account/notifications` (PF-18s); preferences are never edited here (AG-10-29b).

## 4. Layout (`design/draft-layout.html`)
* **Bell:** icon button in the frame's `controls`, before "?"; accessible name "Notifications, 3 unread" / "Notifications, none unread"; badge shows 1-99, "99+" above. Shown only to a signed-in person past the terms gate (same guard as FindBox).
* **Panel (modal dialog, `role="dialog"`, on the app's existing Dialog/Panel focus handling; 400 px, anchored under the bell; full-width sheet below 640 px):** heading "Notifications", "Mark all read" (text button; disabled at 0 unread), list of ≤20 rows: what (kind words) · the record (case number or lead name) · time ("21 Nov, 09:00"; the zone once in the heading line, BR-7) · unread dot. Footer: "See all" and "Choose what you get". Esc or outside click closes; focus is trapped while open and returns to the bell (row).
* **All page** `/account/notifications/all`: tabs "Settings | All" over PF-18s's page (Q2); filter All / Unread; 25 per page; Previous / Next from `nextPage`; same row as the panel.
* **States:** loading (3 skeleton rows), empty ("Nothing new. Work handed to you will show here."), unread-filter empty ("No unread notifications."), load failed ("Could not load your notifications." + Try again; the bell stays usable), mark failed (row stays unread, inline "Could not mark this read."), unlinked row (BR-5), long lead name truncated with full text in `title`, 375 px no sideways scroll.

## 4b. Best in class (Unverified: named practice from GitHub, Linear, Slack, Jira, Gmail; vendor pages not fetched from this session)
* GitHub/Linear inbox: one list, unread filter, "mark all as read", each row deep-links to the item. **Copied.**
* Slack/Jira bell: count badge capped ("99+"), panel of recent items with "See all". **Copied.**
* Gmail/Linear "mark read on open": **copied, beaten**: our `seen` rule never consumes a reminder that came back after the person's list loaded (most products lose it).
* Common failure beaten: badges that announce on every poll (screen-reader noise); we announce on change only (BR-8). Effort saved: one click from any page to the record; no typing; nothing to configure here.

## 4c. Scorecard
N/A as a whole (platform screen, not case-side §6 scope). Met in spirit: one primary action per surface, states drawn, colour never alone, keyboard and 375/1024/1440.

## 5. Copy
Kind words (one map shared with Home's `whatOf`, moved to the notifications contract, so both read the same words; an unknown kind reads "Something needs you"): lead assigned → "Lead assigned to you"; case-stage-deadline → "A stage deadline"; case-milestone-deadline → "A government step is due"; payment-account-disconnected → "Payment account disconnected". Empty, failure and unlinked lines as §4.

## 6. Contract and tests
* Reads only the four part-1 routes, plus M-2 to M-4 once PF-18n adds them: proposed additive fields on `GET items`: `label` (case number or lead display name, built on read like `link`), and `label` and `link` both null when the item is gone **or the person can no longer see it** (a lead reassigned away under own-only visibility: FO-2's lead read rule, never a name leak; challenge M2) and top-level `zone` (OfficeClockPort, as needs-you).
* `tests/check_pf18ns_bell_browser.ts` (`PF-18ns DWn`, own ports and DB, seeded through the API):
  * DW1 J1 walk: assign a lead to an Agent → bell "1" → panel row with the lead's name → Enter → URL `/front-office/leads/<id>`, count 0. Fail: the Owner's bell stays 0.
  * DW2 Mark all read → 0; a notice created after the panel loaded stays unread (fail without `seen`).
  * DW3 Another person's notification never shows; their id on `:id/read` → 404. A lead reassigned away from an Agent: their row shows no lead name and no link (M2).
  * DW4 Live region changes text once per count change; two 60 s polls with no change and a navigation to another page with no change → no new announcement (fake timers).
  * DW5 Keyboard only: Tab to bell, Enter opens, focus inside, Esc returns focus to the bell; axe-core on bell, panel, All page (each state); 375/1024/1440 with no sideways scroll.
  * DW6 All page: Unread filter, page 2 via Next; "Choose what you get" lands on `/account/notifications`.

## 6b. Capability or scaffolding
Bell, panel, All page: capability, *Needed for the proof* (R1.50). Email notices, @mention, client-message, signed and payment callers: PF-18n part 2 and their modules, *Not built* here. Bell on the case pages' frame (`runtime/cases.tsx`): *Not built* here (Q1).

## 7. Questions for the tech lead (recommendation first)
1. **Which frames carry the bell.** The row says PF-6's frame, but its own walk lands on the lead page, which renders in **SalesFrame** (`front-office/sales/sales-frame.tsx`), not PlatformFrame; case pages use `runtime/cases.tsx`'s Frame. Recommend: one shared `<NotificationBell />` placed in PlatformFrame and SalesFrame (one line each; SalesFrame is FO-4's file, so add it to the touch list); case frames as a follow-up X-row. Otherwise the count is invisible where the walk ends.
2. **Where "All" lives.** Recommend: `/account/notifications/all` in this module, with a "Settings | All" tab line added to PF-18s's `notifications-page.tsx` and one route line in `platform/routes.tsx` (both outside the row's touch list; one line each).
3. **Order.** Recommend: PF-18n part 2 (M-1 lead kind + FO-10 caller, M-2 lead link, M-3 `label`, M-4 `zone`) merges first; this screen builds after it. Building on part 1 alone cannot pass DW1 (no lead notification exists).

**Definition of ready:** acceptance test `tests/check_pf18ns_bell_browser.ts` named; row text as BACKLOG; Q1-Q3 answered; M-1 to M-4 on main.
