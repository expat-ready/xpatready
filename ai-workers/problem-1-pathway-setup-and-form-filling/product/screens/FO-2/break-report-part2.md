# FO-2 part 2 break report (PR #1843: lead inbox permissions and changes)

Breaker run 15 Nov 2026 at head **eee7a5ba7** (`claude/festive-maxwell-76x597`), in a clean worktree. Isolated copy `brk_fo2b` on :4434 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), with the front-office seed. A consent wording was published per firm with `consentStore.publishWording` (temporary script in the scratchpad, deleted). Both `fo_web_form` rows were turned on (`https://maple.example` / `https://solo.example`).
Extra sample-firm staff were added with psql: Readonly Rita (READ_ONLY), Suspended Sam, Deactivated Dan, and Ended Eve (CASE_OFFICER grant ended). R is Owner, T is Case manager, O is Case officer. The copy was stopped at the end. No code was changed. Scope: the API rows in the PR brief. There are no screens in this PR, so keyboard, 1024 px and zoom were not tried.

## Findings

**B1 (Blocker): the lead list does work proportional to rows × days, and it blocks the whole server.** `open-minutes.ts:308-313`, called per row at `leads.ts:56`.
- Did: inserted 480 OPEN leads (same firm, owner null) with `arrived_at` 300-400 days ago. Then `GET /api/front-office/leads?view=all` as R.
- Expected: the list is served within the §9 budget (first view < 1 s, filter < 200 ms), and other requests are not held up.
- Actual: 59.4 s, 63.0 s, 63.7 s (`unassigned`), 55.4 s (O). With the same 500 rows at most 30 days old: 2.4 s. At 7 days old: 1.1 s.
- While one 200-day list ran, an unrelated `GET leads/assignees` from another user took **31.1 s**. The loop is synchronous (two `zonedInstant` Intl calls per row per day, up to 400 days × 500 rows), so every firm's requests wait.
- Should have happened: work out the wait per calendar day once per request (or in closed form), not per row and day.

**M1 (Major): Assign commits, then answers 404 to a Case manager when everyone-sees-all is off.** `leads.ts:214` (`change` ends with `this.read(ctx, id)`).
- Did: `platform.everyone_sees_all=false`. Lead L-00014 unowned. T `POST leads/:id/assign {"staffId":<O>}`.
- Expected: 200 with the lead (or a short "assigned to Case officer" answer).
- Actual: `404 "No such lead in your firm."`, yet `fo_lead.owner_staff_id` is O, with an audit line and a `lead.taken` event.
- In the race runs, T's assign got 404 in 25 of 25 rounds whenever it handed the lead to someone else. The screen will show an error for a change that happened, and a retry gets 409.

**M2 (Major): an Assign from a stale view silently overwrites a Take that just succeeded.** This happens for anyone who sees all: Owner/Admin always, Case manager when everyone-sees-all is on. `leads.ts:156-164`. The `owner === to` check is the only precondition, and there is no expected-owner or version (STANDARDS §2 optimistic concurrency).
- Did: reset the lead to unowned, then fired O `take` and R `assign {staffId:T}` at the same moment (thread barrier), 25 rounds. Repeated with everyone-sees-all on and T as the assigner.
- Expected: whichever lands second gets 409 "<owner> already has this lead" (or a stale 409), unless it says it means to reassign from the owner it saw.
- Actual (off, R assigns): both 200 in **12/25** rounds, and T ended as owner. O was told it took the lead and lost it.
- Actual (on, T assigns): both 200 in **10/25**.
- Same with Assign vs Close: O closed a lead T had just assigned to itself, both 200, in 10/25.

**M3 (Major): `personId` picks a person the adder may not see, and the answer shows their contact details.** `leads.ts:130` and `arrival.ts:54`. Only the firm is checked.
- Did: everyone-sees-all off. R added Lena Park (lena@x.org, +14165550101). O `POST leads {"requestId":…,"email":"lena@x.org"}` got 409 KNOWN_PERSON `{personId:null, name:"A person you cannot see"}` (correct).
- Then O `POST leads {"requestId":<new>,"personId":"<Lena's id>"}`.
- Expected: 404 or 422, as the known-person rule hides her ("naming only people the adder may see").
- Actual: `201`. A new lead L-00003 is owned by O, with `person:{givenNames:"Lena",familyName:"Park",email:"lena@x.org",phone:"+14165550101"}`. Any person id O ever saw (before the setting changed, or before a reassignment) opens that record.

**M4 (Major): captured attribution is still refused (422), so the enquiry is lost.** `public.ts:181` cuts by code points, then `text()` (`common.ts:243-244`) measures UTF-16 units after NFC and refuses U+2028/2029.
- Did: posted valid enquiries to the maple form (drawn, waited 2.2 s, allowed Origin) with these `attribution` values:
  - `utmSource` = 150 × 😀 → `422 "utmSource: at most 200 characters."`
  - `utmCampaign:"spring sale"` → `422 "utmCampaign: one line, no control characters."`
  - `utmContent` = 200 × U+0958 (NFC makes it 400 units) → `422 "utmContent: at most 200 characters."`
- Expected (brief): "cut by characters, never refused". The visitor cannot see or fix these fields.
- Held: 250 ASCII cut to 200; ZWSP/RLO stripped; 2,500 CJK landing page cut to 2,000; tab and newline stripped.

**m1 (Minor): the known-person check treats a deactivated owner's lead as hidden.** `leads.ts:136` passes the raw `ownerStaffId` to `sees`. `read` (`:83`) and `visible` (`:102`) map an inactive owner to null.
- Did: everyone-sees-all off. Lead L-00509 (orphan@x.org) owned by Deactivated Dan. O sees it in `view=unassigned` and `GET leads/:id` gives 200.
- Then O `POST leads {email:"orphan@x.org"}` got `matches:[{personId:null,name:"A person you cannot see"}]`.
- Expected: Orphan Lead named with L-00509, so O can pick them and does not create a duplicate.

**m2 (Minor): the target's status is not re-read under the row lock.** `leads.ts:158`. `staff` comes from `staffOf()` at `:196`, before the transaction. Only `editors` is re-read.
- Did: held the lead's row lock in psql (`select … for update; pg_sleep(4)`). Sent T `assign {staffId:O}`. Set O `DEACTIVATED` while it waited.
- Actual: 200, and the lead is owned by "Case officer (Sample) | DEACTIVATED".
- Expected: 422 "Choose an active person…" (the brief: "checked again under the row lock").

**m3 (Minor): length limits count UTF-16 units, not characters.** `common.ts:243`. `givenNames` = 60 × 😀 got `422 "First name: at most 100 characters."`. The same applies to every staff text field (note, reason, source).

**m4 (Minor): a reused `requestId` with a different body silently returns the first lead.** `arrival.ts:48-50`. `payloadHash` is stored but never compared.
- Did: O added "Idem" (idem@x.org) with key K, then posted K again with "Other", other@x.org and a note.
- Actual: `201` L-00006 "Idem". The second person and note are dropped with no word.
- Expected: 409/422 "this request was already used for another lead", or a documented choice.

**m5 (Minor): for an id the actor cannot see, a change names the owner even when the lead is closed.** `leads.ts:206`.
- Did: everyone-sees-all off. O `POST leads/<R's CLOSED lead>/reopen {"reason":"x"}` and `/close`.
- Actual: `409 "Representative (Sample) already has this lead."` `GET` of the same id gives 404.
- The 409 only makes sense for Take or Assign on an open lead. For a closed lead, or for Close and Reopen, 404 is expected.

**m6 (Minor): `personId: null` is treated as a pick.** `leads.ts:123,130`. `{"personId":null,"givenNames":"A","email":"pn@x.org"}` got `404 "No such person in your firm."`. Expected: null means absent (the normal new-person path), or 422 naming the field.

**m7 (Minor, question): a solo worker with a Read-only colleague is not a "one-user firm".**
- Did: sample-solo plus an ACTIVE READ_ONLY user. A form lead arrived unowned, and `assignees` answered `{oneUser:false, assignees:[S]}`. With the same user SUSPENDED, S owned it (correct).
- `arrival.ts:64` and `leads.ts:63` count active staff, not staff who can work leads. If X-4 means "one person who works leads", this is a finding; otherwise ignore it.

**m8 (Minor): waits over 400 days are undercounted.** `open-minutes.ts:308`. The walk starts at `from` and stops after 400 days, so a lead open longer than 400 days reports only its first 400 days. This was read from the code; the B1 rows stayed under 400 days.

## What held
- **Cross-firm ids.** A solo person's `personId` → 404. A solo LEAD_CLOSE `reasonId` → 422. S assigning or reopening a sample-firm lead → 404. Staff S as a target → 422. A KNOWN_PERSON match never crossed firms (solo@x.org added in sample-firm made a new lead).
- **Assign targets.**
  - Refused with 422: Read-only, suspended, deactivated, an ended grant, another firm, a random uuid.
  - `staffId` as a number, an array or null → refused.
  - Uppercase id → accepted.
  - O (no assign key) → 403. The assignees list is empty for O and Read-only, and lists only the three editors for R and T.
- **Close reasons.** PROSPECT_LOST (`NOT_READY`), system (`ADDED_TO_PROSPECT`, `COMBINED_LEAD`), inactive, random, number, object and missing → 422. An uppercase reason id was accepted. Note: number → 422; 2001 characters → 422; Greek multiline kept.
- **Reopen.** Missing, empty, spaces, `!!!`, number, array, 2001 characters and ZWSP → 422. A valid reason ("— 回电") was stored as an INTERNAL note `Reopened: …`. Reopening an open lead → 409.
- **Change events.** The audit line and outbox `lead.closed` (with reasonKey) and `lead.reopened` were each written once.
- **Races.**
  - Take vs Assign with everyone-sees-all off, T as assigner: one winner, the other 409 ALREADY_TAKEN (25/25).
  - Close vs Close and Reopen vs Reopen: one 200 and one 409 STATE (25/25 each).
  - Close vs Take: one winner (25/25).
- **Duplicates and first enquiries.**
  - Same email or phone: 12 parallel Adds with one `requestId` made one lead.
  - 6 parallel `confirmedNew` Adds with one email: the first was unflagged, 5 were flagged.
  - 6 parallel form posts with one phone in 6 formats: the first was unflagged, 5 were flagged.
  - 4 crossed email/phone pairs: no deadlock, the first unflagged and 3 flagged.
- **Known person.** Everyone-sees-all on: named with the lead number. Off: "A person you cannot see", with `personId` null. `confirmedNew:"true"` (a string) does not skip the check.
- **Odd bodies.** An array body → 422. A JSON string or null → 400. Wrong types for names, email, source and interestedIn → 422. Spaces only, punctuation only, 101 characters and RLO → 422. CJK and Arabic names stored. Unknown `ownerStaffId` / `__proto__` keys are ignored (the adder owns the lead).
- **Roles.** Read-only: lists 200, assignees empty, create/take/assign/close/reopen 403. Suspended sign-in → 401.
- **One-user firm.** The solo form lead is owned by S, and `oneUser:true` while S is the only active user.
- **Open-hours wait.** Friday 16:00 → 60 min (expected 60). Friday 30 Oct 16:30 EDT, across the DST change → 4,830 (expected 4,830). Arrived Sunday → 0.
- **Views.** `view=ALL` and `view=` → 422.
