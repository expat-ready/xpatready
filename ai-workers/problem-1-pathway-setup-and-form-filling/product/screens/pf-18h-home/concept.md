# PF-18h concept: the staff Home and its "Needs you" list (R1.74, QA-471 part 2)

Row owner: Lead B (9). Brief: `design/lead-b-briefs/PF-18h.md` (branch `lead-b-front-office` at 093ded45e). Model Opus 5.5, effort high. No board (P-223 (4)): the tech lead approves after a fresh challenge (`challenge.md`). Board source: `design/home-needs-you.html`.
Duplicate check: 21 Nov ~02:30 IST, PRs and BACKLOG searched for "PF-18h", "Needs you", QA-471 and PF-18n. Only #2596 (PF-18n part 1, the store this reads; draft) and #2594 (CS-DL3 part 2; names "the Needs you item QA-471" as not its row) match. Old "Needs you" PRs (#616, #637) are the Studio's To review list, another screen. No open PR touches a staff home, `web/src/modules/platform/home/` or `needs-you`. PF-29f (tasks' home section) is not started (held for consolidation).

## 1. Job and journey
**Job:** when a firm staff member signs in, show the deadlines on their cases that need them now, and take them to the case in one click.
Persona: a case officer (RCIC) at a firm. Journey: sign in → Home → open the item → the case page. Capability R1.74 "Deadlines that remind": CS-DL1 (2) "puts one 'Needs you' item on their home". Requirement source: AG-16 §3.3 group `MY_DEADLINES`; AG-10-29a/b (in-app list); AG-7-39 r2 (one per person, item and kind).

## 2. Ten layers (STANDARDS §2)
* **Data:** none new. Reads PF-18n part 1's `msg_notification` (#2596) only: no table, no migration.
* **Rules/engine:** none. The row's unread state is PF-18n's (a reminder re-surfaces the one row).
* **API (r2, challenge M2):** new `GET /api/platform/me/needs-you` in PF-18n's `routes.ts`, as the brief says, plus a `group` filter and a `total` on `MyNotifications.list` in its `store.ts`: one link builder (`linksOf`), never two. These are PF-18n's files, so this part is written **only after #2596 merges** (they are then main's files; merge main first, P-270). Same scope rules (`@AnyStaff`, person and firm from the session).
* **Port and fake (P-576):** until #2596 merges, the web page is built against a typed fake of the route's answer (`home/contract.ts` + a test fixture), never bound in the app. Opening an item calls PF-18n's existing `POST /api/platform/me/notifications/:id/read`: no second write path.
* **UI:** new `web/src/modules/platform/home/home-page.tsx` + `contract.ts` inside `PlatformFrame` (PF-6).
* **Nav and landing:** `callback-page.tsx` line 62 `/account` → `/home` (sign-in lands on Home); `frame.tsx` brand link `home="/account"` → `/home`; `account-sections.ts` adds a first entry `Home` (no key). Route line `{ path: "/home", … }` in `web/src/modules/platform/routes.tsx`: **that file is in open PR #2608 (one of the 32)**, see Q2.
* **Tests touched (challenge m4):** `check_pf6f_callback_browser.ts` (its landing expectation `/account` → `/home`) and `check_pf6a_frame_browser.ts` (brand link, menu entry), one line each.
* **Team's code:** no staff home there to retrofit (read-only `code/` not needed; nothing to map). **AI:** none. **Governance:** read-only screen; marking read is the person's own row.

## 3. Business rules
* **BR-1** An item is one of **my unread** notifications in group `MY_DEADLINES` (kinds `case-stage-deadline`, `case-milestone-deadline`). Source: brief ruling (P-294); AG-16 §3.3.
* **BR-2** One item per deadline: a 7-day, 2-day or on-the-day reminder brings the same item back to the top, never a second one. Source: PF-18n part 1 (AG-7-39 r2, AG16-60).
* **BR-3** Own only: person and firm from the session, never a parameter; another person's or firm's rows never show. Source: PF-3, AG-7-39.
* **BR-4** Opening an item marks it read (PF-18n's route, awaited first, challenge m1) and then goes to its case; it leaves Needs you. If marking fails, the page stays with a Notice and an "Open the case anyway" link. The history stays in PF-18ns's list (later row). Source: brief.
* **BR-5** Newest first by `created_at` (a re-surfaced reminder is new), at most 20 shown, total counted. Source: brief.
* **BR-6** An item whose case the reader cannot link (case gone, other firm) shows without a link and with "Hide until next reminder"; it is never hidden silently. Source: STANDARDS (no silent loss); PF-18n `link: null`.
* **BR-7 (r2, challenge M1)** Times show in **the person's** time zone: their office's zone through `OfficeClockPort.officeOfStaff` then `zoneFor` (PF-18a, `OFFICE_CLOCK`), which falls back to the firm's `platform.time_zone`; the zone is named once. Source: brief.
* **BR-8** The count is in words ("2 items need you"), never colour alone. Source: brief, WCAG 1.4.1.

## 4. Layout (EXPERIENCE §3: no listed pattern is a home; the closest is the Library list's table reduced to one list, no facets: flagged for the Lead, m6)
PlatformFrame (firm name, person, Sign out; side menu with **Home** first). Page: `h1` "Home" → section `h2` "Needs you" with the count line → a list (`ul`), one row per item:
* line 1 (link, the whole row's target): **"A stage deadline on case C-2026-00042"** or **"A government step on case C-2026-00042"**
* line 2 (muted): "Reminder came in 21 Nov 2026, 09:00" · zone named in the section's foot ("Times in America/Toronto").
* right: **"Hide until next reminder"** (button; marks read without opening; r2, challenge M4: the deadline itself stays open on the case, so "done" would mislead). Focus then moves to the next row, or to the section heading when none is left (m2).
More than 20: "Showing the newest 20 of 34. The rest are in your notifications." (no link until PF-18ns). PF-29f later adds "Due today or overdue" beside this section: the page keeps one `<section>` per block so it can.
Sizes 375 / 1024 / 1440: one column; at 375 the menu becomes the row above the page (PlatformFrame's behaviour).

## 5. States and copy
* **Empty:** "Nothing needs you right now." + muted "Deadline reminders on your cases show here when in-app reminders are on in your notification settings." (m8) · **Loading:** skeleton rows, `role="status"` "Loading what needs you…" · **Error:** Notice danger "Could not load what needs you." + Try again · **Signed out / elsewhere / terms:** PlatformFrame's own · **Long:** case number never wraps; row text wraps · **Open failed** (mark-read error): the page stays; Notice "We could not hide this reminder." with "Open the case anyway" (m1) · **Read-only:** N/A (own rows only) · **Conflict:** marked read in another tab → the list refetches on focus; a second mark-read is a no-op (PF-18n returns the first time).
Copy is from PRODUCT §4 words: "case", "deadline", "government step". No ids, kinds or "notification" on the main path.

## 6. Contract and tests
`GET /api/platform/me/needs-you` → `{ items: [{ id, kind: "case-stage-deadline"|"case-milestone-deadline", caseNumber|null, link|null, createdAt }], total, zone }`. 401 signed out. Kinds outside `MY_DEADLINES` never appear. `caseNumber` per Q1.
`tests/check_pf18h_home_browser.ts` (real app, real `PlatformJobs`, FakeClock, the CITED test route J-74 uses), each a pass and a fail:
* **DW1** a 7-day reminder for a case I officer shows one item (fail: a `NEEDS_YOU`-group self-test row for me shows nothing).
* **DW2** after I hide it, the 2-day reminder of the same deadline brings it back to the top, `total` 1 and one row in the list (fail: a second notify on a different item kind adds a second item, proving the count is real).
* **DW3 (r2, B1)** opening it marks it read, then lands on `/cases/<id>` **with the case header showing that case's number** (not only the URL), and Home no longer lists it (fail: the same deadline's item for the representative stays unread on their Home).
* **DW4** another person's and another firm's items never show, API and page (fail: firm B's officer sees an empty list, and `POST …/<firm A id>/read` is 404).
* **DW5** keyboard only (Tab to the row, Enter opens; Tab to Hide, Space; focus lands on the next row), axe-core clean at 375/1024/1440 (fail: the check run against a page with the count shown by colour only reports an axe or text failure).
* **BR-6** a row whose case is gone shows with no link; **BR-7** an office in another zone shows that zone's time; **BR-8** the count line is text. Scale: 25 items → 20 shown, "of 25" in words.
* **No J-74 step here (r3, row owner's ruling on #2621, 21 Nov 03:0x IST, P-294):** Lead C's follow-up PR after #2594, R1.74's last PR, walks reminder → Home → open → case in `j_74.ts` (P-728: the J-test sits in the item's last PR). One writer per file. This PR keeps stable hooks for that walk: `data-needs-you-item` on each row, `data-needs-you-open` on its link, `data-needs-you-hide` on "Hide until next reminder" (plus `data-needs-you-count` on the count line).

## 6b. Capability or scaffolding
All elements are capability, needed for the proof of R1.74, except: the fake reader (scaffolding, test-only after #2596 merges; never bound in the app); "the rest are in your notifications" points at PF-18ns (Not built, no link).

## 7. Questions for the tech lead (recommendation first; the founder reviews next morning, P-223 (4))
* **Q1 Case number on the item (conflict: brief vs STANDARDS §2 line 25 [M], challenge M3).** The brief asks for "the case number from the link" and "no read of case-side tables", but the link is `/cases/<uuid>`: there is no number in it. **Recommend (a):** add `caseNumber` to the case select PF-18n's `linksOf` already makes (it already reads `case`, `case_stage`, `case_milestone` firm-scoped to build links). One more column in an existing query, no new crossing of the boundary. Record the crossing as an X-row: "a case-side `CaseLabelPort` replaces platform reads in `linksOf`" (P-582). (b) No number ("A stage deadline on one of your cases"): no boundary question, but two items can't be told apart. Due date not shown in either.
* **Q2 Opening a case as the right person (challenge B1).** `/cases/*` acts as the Studio's simulated person (`x-actor`; defaults to the case officer), not the firm sign-in, and `Me` has no actor id. Only the case side can fix that, and it is not this row's job. **Recommend:** accept it as labelled scaffolding for R1.74's proof (the Sample officer is the one reminded). DW3 checks that the header renders, the PR names the gap, and an X-row is opened for the case side: "the case page acts as the signed-in staff member". Alternative: add `actorId` to `Me` and call `setActor` before navigating. That touches session code outside the touch list.
* **Q3 The `/home` route line.** `platform/routes.tsx` is in #2608 (the 32). **Recommend:** build everything else now and add the one line after #2608 merges (merge main, P-270). Fallback if #2608 is still open at green: a small `web/src/modules/home/routes.tsx` module (the seam allows it), folded back later.
* Accepted from the challenge (no question): M1 person's zone, M2 the route in PF-18n's file after it merges, M4 "Hide until next reminder", m1–m4 and m8. m5 ("Home" under "My account") and m6 are noted for the founder's morning look.

## Definition of ready
Acceptance test: `tests/check_pf18h_home_browser.ts` DW1–DW5 on the real app (the J-74 walk is Lead C's, r3). Row text: brief PF-18h. Waits on: #2596 merged (API part, DW1–DW4), #2608 merged (route line, Q3). The build starts only after the tech lead's approval **and** #2596 on main (row owner, r3). Decisions: Q1–Q3 answered by the tech lead. r2 after `challenge.md` (verdict: Build after these changes).
