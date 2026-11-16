# FO-2v break report (PR #1933, row FO-2v, permissions)

Breaker, 16 Nov. Head `87a811e98` on `claude/runtime-fo2v`. Isolated copy `brk_fo2v` on :4537 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), its own database `xr_studio_brk_fo2v`, stopped and dropped at the end. Never :4400. All calls went through the HTTP API, signed in by `POST /api/platform/session/local` as user-R (Owner+Case Manager), user-T (Case Manager), user-O (Case Officer) and user-S (firm sample-solo). SQL was used only for setup: making a lead Unassigned (`owner_staff_id = null`), ageing an audit line, one forged audit line, and a role copy without `view.all`/`assign`. Live AI off, no model calls, US$0. Scratch scripts are outside the repo; nothing was committed.

Scope: the brief's FO-2v list (visibilityOf, the two @OwnOrAll markers plus the sweep rows, and the Take 404/409 answer). The PR's own `check_fo2v_lead_visibility.ts` runs green here: 11 passed, 0 failed.

## Findings, ranked

**Blocker: none. Major: none.**

### m1 (Minor): the race exception names a new owner who was never Unassigned, once the previous owner is deactivated
- **Did:** turned the setting on. T added lead LX (T owns it, so it was never Unassigned). R assigned LX from T to O (`expectedOwnerStaffId: T`). Turned the setting off. R's Take on LX returned 404, which is correct. R then deactivated T (`POST /api/platform/staff/:T/deactivate`), and R took LX again, all within 10 minutes.
- **Expected:** 404 with no name. The latest owner change moved LX from T (an active owner at the time) to O, not from Unassigned.
- **Actual:** `409 ALREADY_TAKEN "Case officer (Sample) already has this lead."` (no `ownerStaffId`). So the current owner's name reaches someone who must get the GET 404.
- **Where:** `api/src/front-office/sales/leads.ts:213`. `staff.get(a.previous)?.status !== "ACTIVE"` checks the previous owner's status **now**, not at the time of the change. Deactivating them later turns an owner-to-owner assign into a "race" for the rest of the 10-minute window. The opposite case fails closed: if the previous owner was deactivated at the time and is reactivated later, a real race answers 404.
- **Severity:** Minor. Only a coworker's display name leaks, only to a holder of `view.all` or `assign`, only within 10 minutes of the deactivation. But it breaks the DW3 rule "404, no name".

### m2 (Minor): the race lookup is not scoped to the firm
- **Did:** R added lead LR2 (never Unassigned). O's Take returned 404, which is correct. I inserted one `audit_event` row with entity `fo_lead`, `entity_key = LR2`, action `lead.taken`, `detail {"firmId": <sample-solo>, "previousOwnerStaffId": null}`, `at now()`. O took LR2 again.
- **Expected:** 404. That line belongs to another firm.
- **Actual:** `409 "Representative (Sample) already has this lead."`
- **Where:** `leads.ts:209-212`. The query filters only on `entity`, `entity_key`, `action` and `at`. Every firm writes into the one shared `platform-audit` workspace (`platform/audit/audit-event.ts:4-7`), and the firm is only in `detail.firmId`. The query checks neither `detail->>'firmId'` nor `workspace_id`.
- **Severity:** Minor. This is defence in depth: I found no API path that writes a `fo_lead` line under another firm's lead id (another firm's Take on that id is 404 before any write). It is still a permission decision read from a table shared by all firms without a firm filter.

### m3 (Minor, pre-existing, not in this diff; needs a ruling, not a fix here): the lead number reveals the firm's lead count
- **Did:** with the setting off, O (who sees 8 leads) added a lead.
- **Actual:** it got `L-00018`; the firm has 18 leads in `fo_lead`. Lead numbers run in sequence per firm (`arrival.ts`), so any own-only person learns how many leads the firm has. The brief asks for "any count … that reveals others' leads or their number". This may be by design (AG-2 numbering); I report it so the release holder can decide. It is not a regression from this PR.

## What held (expected = actual)
- **Lists with the setting off:** `all`, `mine`, `unassigned` and `closed` for R, T and O each returned only the caller's own leads plus Unassigned ones; no one else's lead appeared in any of them. The Owner/Admin override is gone: R lists 1 lead and gets 404 on GET of T's lead. Odd `view` values (`ALL`, empty, `%00`, `mine&view=all`) gave 422; `view[]=` fell back to `all` and stayed filtered. No server-side count or search endpoint exists; the web's badges count the filtered `unassigned` list (`sales-frame.tsx:19`).
- **Role copy without `view.all`/`assign`, setting on:** O lists only their own leads. `view=unassigned` gives 403 with no count. A Take on a lead in the race window gives 404, so the exception needs `seesUnassigned`.
- **Take on an own, never-Unassigned lead (LT, owner T):** O and R get 404, identical in body and keys to GET. Upper-case ids also give 404. Close, reopen and assign (with `expectedOwnerStaffId` T or null) on unseen leads all give 404.
- **The real race:** T took Unassigned lead U1. O and R then got 409 "Second representative (Sample) already has this lead." Body keys were `type,title,status,detail,message,code`, with no `ownerStaffId`. Two Takes at the same moment: one 200, one 409 naming the winner. After ageing the line 11 minutes: 404. Close on the same lead by O: 404 (Take only).
- **Ownership history:** owner-to-owner assign (LA, T to O) gives 404. Take then reassign (U3: T takes, R assigns to O) gives 404. Assign from Unassigned (U2) gives 409, as the brief allows. Take, then close (or close and reopen) inside the window gives 409, the same answer a viewer gets, within the rule's "unowned until moments ago".
- **Across firms:** S's Take and GET on firm A's lead (and on U1 during its race window) give 404. R's and O's Take and GET on firm B's lead give 404. With firm B's setting on, S still gets 404 on firm A's lead and lists only their own.
- **Deactivated owner:** LD's owner T is deactivated, so LD counts as Unassigned. R and O read it and see it in `view=unassigned`. O took it with 200; R then got 409 naming O (a genuine race). A deactivated T gets 401 `STAFF_NOT_ACTIVE` on list and Take.
- **POST leads known-person match:** O adding with T's lead's email (any case) gets `409 KNOWN_PERSON` with `[{personId:null, name:"A person you cannot see"}]`, so no name or lead number. `personId` of T's person gives 404 person. `confirmedNew` creates the lead with "Possible match with a person you cannot see". Firm B adding the same email gives 201 with no match across firms.
- **GET leads/assignees:** O (no `assign`) gets `{oneUser:false, assignees:[]}`. T and R get the firm's active staff. S gets their own firm only (`oneUser:true`). No lead data appears.
- **Web:** `take-it.ts` shows only `detail` and never read `ownerStaffId`, so removing it breaks nothing.
