# PF-18h concept: the staff Home and its "Needs you" list (R1.74, QA-471 part 2)

Row owner: Lead B (9). Brief: `design/lead-b-briefs/PF-18h.md` (branch `lead-b-front-office` at 093ded45e). Model Opus 5.5, effort high. No board (P-223 (4)): the tech lead approves after a fresh challenge (`challenge.md`). Board source: `design/home-needs-you.html`.
Duplicate check: 21 Nov ~02:30 IST, PRs and BACKLOG searched for "PF-18h", "Needs you", QA-471 and PF-18n. Only #2596 (PF-18n part 1, the store this reads; draft) and #2594 (CS-DL3 part 2; names "the Needs you item QA-471" as not its row) match. Old "Needs you" PRs (#616, #637) are the Studio's To review list, another screen. No open PR touches a staff home, `web/src/modules/platform/home/` or `needs-you`. PF-29f (tasks' home section) is not started (held for consolidation).

## 1. Job and journey
**Job:** when a firm staff member signs in, show the deadlines on their cases that need them now, and take them to the case in one click.
Persona: a case officer (RCIC) at a firm. Journey: sign in → Home → open the item → the case page. Capability R1.74 "Deadlines that remind": CS-DL1 (2) "puts one 'Needs you' item on their home". Requirement source: AG-16 §3.3 group `MY_DEADLINES`; AG-10-29a/b (in-app list); AG-7-39 r2 (one per person, item and kind).

## 2. Ten layers (STANDARDS §2)
* **Data:** none new. Reads PF-18n part 1's `msg_notification` (#2596) only: no table, no migration.
* **Rules/engine:** none. The row's unread state is PF-18n's (a reminder re-surfaces the one row).
* **API:** new `GET /api/platform/me/needs-you`. **Placement differs from the brief:** the brief puts it in PF-18n's `routes.ts`; I am told never to edit PF-18n's files, so it goes in a new `api/src/platform/home/` (controller + reader) and a new `api/src/features/platform-home.ts`. Same URL, same scope rules (`@AnyStaff`, person and firm from the session).
* **Port and fake (P-576):** `NeedsYouReader` interface (`api/src/platform/home/reader.ts`) with an in-memory fake for the page and unit tests while #2596 is open; the real adapter (raw SQL over `msg_notification`, firm-scoped) lands only after #2596 merges. Opening an item calls PF-18n's existing `POST /api/platform/me/notifications/:id/read`: no second write path.
* **UI:** new `web/src/modules/platform/home/home-page.tsx` + `contract.ts` inside `PlatformFrame` (PF-6).
* **Nav and landing:** `callback-page.tsx` line 62 `/account` → `/home` (sign-in lands on Home); `frame.tsx` brand link `home="/account"` → `/home`; `account-sections.ts` adds a first entry `Home` (no key). Route line `{ path: "/home", … }` in `web/src/modules/platform/routes.tsx`: **that file is in open PR #2608 (one of the 32)**, see Q2.
* **Team's code:** no staff home there to retrofit (read-only `code/` not needed; nothing to map). **AI:** none. **Governance:** read-only screen; marking read is the person's own row.

## 3. Business rules
* **BR-1** An item is one of **my unread** notifications in group `MY_DEADLINES` (kinds `case-stage-deadline`, `case-milestone-deadline`). Source: brief ruling (P-294); AG-16 §3.3.
* **BR-2** One item per deadline: a 7-day, 2-day or on-the-day reminder brings the same item back to the top, never a second one. Source: PF-18n part 1 (AG-7-39 r2, AG16-60).
* **BR-3** Own only: person and firm from the session, never a parameter; another person's or firm's rows never show. Source: PF-3, AG-7-39.
* **BR-4** Opening an item marks it read (PF-18n's route) and goes to its case; it leaves Needs you. The history stays in PF-18ns's list (later row). Source: brief.
* **BR-5** Newest first by `created_at` (a re-surfaced reminder is new), at most 20 shown, total counted. Source: brief.
* **BR-6** An item whose case the reader cannot link (case gone, other firm) shows without a link and with "Mark as done"; it is never hidden silently. Source: STANDARDS (no silent loss); PF-18n `link: null`.
* **BR-7** Times show in the firm's time zone (`platform.time_zone`, as Complaints do), zone named once. Source: brief "the person's time zone"; there is no per-person zone today.
* **BR-8** The count is in words ("2 items need you"), never colour alone. Source: brief, WCAG 1.4.1.

## 4. Layout (EXPERIENCE §3: none of the seven fits a home; nearest is a plain list in the Side-panel's section style)
PlatformFrame (firm name, person, Sign out; side menu with **Home** first). Page: `h1` "Home" → section `h2` "Needs you" with the count line → a list (`ul`), one row per item:
* line 1 (link, the whole row's target): **"A stage deadline on case C-2026-00042"** or **"A government step on case C-2026-00042"**
* line 2 (muted): "Reminder came in 21 Nov 2026, 09:00" · zone named in the section's foot ("Times in America/Toronto").
* right: "Mark as done" (button; marks read without opening).
More than 20: "Showing the newest 20 of 34. The rest are in your notifications." (no link until PF-18ns). PF-29f later adds "Due today or overdue" beside this section: the page keeps one `<section>` per block so it can.
Sizes 375 / 1024 / 1440: one column; at 375 the menu becomes the row above the page (PlatformFrame's behaviour).

## 5. States and copy
* **Empty:** "Nothing needs you right now." + muted "Deadline reminders on your cases show here." · **Loading:** skeleton rows, `role="status"` "Loading what needs you…" · **Error:** Notice danger "Could not load what needs you." + Try again · **Signed out / elsewhere / terms:** PlatformFrame's own · **Long:** case number never wraps; row text wraps · **Open failed** (mark-read error): goes to the case anyway (the case matters more than the dot) and the item stays; a Notice says "We could not mark it as done." · **Read-only:** N/A (own rows only) · **Conflict:** marked read in another tab → the list refetches on focus; a second mark-read is a no-op (PF-18n returns the first time).
Copy is from PRODUCT §4 words: "case", "deadline", "government step". No ids, kinds or "notification" on the main path.

## 6. Contract and tests
`GET /api/platform/me/needs-you` → `{ items: [{ id, kind: "case-stage-deadline"|"case-milestone-deadline", caseId|null, caseNumber|null, link|null, createdAt }], total, zone }`. 401 signed out. Kinds outside `MY_DEADLINES` never appear. `caseNumber` needs a firm-scoped read of `case.case_number` (see Q1).
`tests/check_pf18h_home_browser.ts` (real app, real `PlatformJobs`, FakeClock, the CITED test route J-74 uses), each a pass and a fail:
* **DW1** a 7-day reminder for a case I officer shows one item (fail: a `NEEDS_YOU`-group self-test row shows nothing).
* **DW2** the 2-day reminder of the same deadline brings it back after I marked it done, still one item (fail: two rows would be counted 2).
* **DW3** opening it lands on `/cases/<id>` and Home no longer lists it (fail: a second officer's same item stays theirs and unread).
* **DW4** another person's and another firm's items never show, API and page (fail: firm B's token gets its own empty list, not 403-leaks).
* **DW5** keyboard only (Tab to the row, Enter opens; Tab to Mark as done, Space), axe-core clean at 375/1024/1440.
* Scale: 25 items → 20 shown, "of 25" in words. Unit: the reader's fake and real adapter run one contract test.
* **J-74 walk step** (after CS-DL3 part 2, #2594, is on main; `j_74.ts` is theirs until then): reminder → Home shows it → open → case. Exits 0 twice.

## 6b. Capability or scaffolding
All elements are capability, needed for the proof of R1.74, except: the fake reader (scaffolding, test-only after #2596 merges; never bound in the app); "the rest are in your notifications" points at PF-18ns (Not built, no link).

## 7. Questions for the tech lead (recommendation first)
* **Q1 Case number on the item.** The brief says "case number from the link" and "no read of case-side tables", but the link is `/cases/<uuid>`: no case number is in it. **Recommend:** the reader reads `case.case_number` firm-scoped by the id in the link, exactly as PF-18n's `linksOf` already reads `case_stage`/`case_milestone` (a read, platform-owned, no write). Without it the row says "A deadline on one of your cases", and two items are indistinguishable. Due date is **not** shown (would need more case-side reads; the case page shows it).
* **Q2 The `/home` route line.** `platform/routes.tsx` is in #2608 (the 32). **Recommend:** build everything else now; add the one route line after #2608 merges (merge main, P-270). Fallback if #2608 is still open at green: a tiny `web/src/modules/home/routes.tsx` module (the seam allows it), later folded back.
* **Q3 Placement of the API** in `platform/home/` not PF-18n's `routes.ts` (above): **recommend** accept; it avoids two lanes on one file (P-576) and keeps the URL.

## Definition of ready
Acceptance test: `tests/check_pf18h_home_browser.ts` DW1–DW5 + the J-74 step. Row text: brief PF-18h. Waits on: #2596 merged (real reader, DW1–DW4), #2608 merged (route line, Q2), #2594 merged (J-74 step). Decisions: Q1–Q3 answered by the tech lead.
