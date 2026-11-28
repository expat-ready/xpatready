# CS-NT1t break report: a person's own timeline (PR #3829 at 3069120ae)

Breaker, 26 Nov 2026. I tested against an isolated copy `br_csnt1t` on :4436 (`AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`). I did not use :4400. The copy has since been stopped and its database dropped. Every role and setting row I removed was put back inside the same script. Scope is BACKLOG row CS-NT1t; this screen folder has no concept.md, challenge.md or build-notes.md. The PR's own check passed 24/24 on this copy.

## Findings

**M1 (Major): the person timeline shows a won prospect's lines to someone the front office refuses (403).** It skips the `agent/prospect:show` key that the prospect routes require.
- Where: `api/src/case-notes/person-timeline.ts:71` calls `Timeline.prospect()` (the service) directly. The key is checked only on the route (`front-office/sales/routes.ts:141`, `@PermissionKeys("agent/prospect:show")`). `Prospects.read` (`prospects.ts:226`) checks only who owns the prospect.
- Repro:
  1. Link a person to a prospect (`update case_client set prospect_id=…`).
  2. Run `delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/prospect:show'`.
  3. Sign in as user-T (Case manager only).
- Expected: the prospect's lines are left out, as when the front office says no.
- Actual: `GET /front-office/prospects/:id/timeline` gives **403** and `GET /front-office/prospects/:id` gives **403**. But `GET /runtime/clients/:id/timeline` gives **200 with 9 `prospect` lines**, including the internal prospect notes and "Staff … engaged lead L-00003". These are personal data that the role was refused.

**M2 (Major): a prospect with more than 500 lines loses its older lines without warning, and the end of the list claims it is complete.**
- Where: `person-timeline.ts:71-76`. `Timeline.prospect()` returns only the newest 500 lines (`MAX_LINES`, `front-office/sales/timeline.ts:17`) and cannot page further. The floor at line 76 only holds back other sources until the 500 run out. After that, `more` turns false.
- Repro: add 600 `fo_note` rows to a linked prospect, one minute apart. Add 70 case audit lines, interleaved between them. Then follow `nextCursor` to the end.
- Expected: all 600 prospect notes, or a clear "older prospect lines not shown".
- Actual: 16 pages. All 70 case lines appear, no line repeats, the order is correct. But only **491 of the 600** notes appear: #492 to #600 never show. The last page has `more:false`, so the client page says "That is everything for this client." The PR's own header comment (lines 9-10) promises "pages never skip … a line".

**m1 (Minor): a failing front office is silently treated as "no prospect".**
- Where: `person-timeline.ts:71`, `.catch(() => null)`. This catches every error, not only the 404 that the comment describes.
- Repro: store `platform.everyone_sees_all = "broken"` in `platform_firm_setting`. `readSetting` then throws.
- Expected: the prospect read failing is said somewhere, or the request answers 5xx.
- Actual: the prospect timeline route answers **500**. The person timeline answers **200**: its 9 prospect lines vanish and nothing says why.
- Also seen: a `fo_note` whose `by_actor` is not a staff UUID makes the prospect timeline itself 404 (a front-office issue that is not this PR's). The person timeline hid that the same way.

**m2 (Minor): dead end, `{lines: [], more: true, nextCursor: null}`.**
- Where: `person-timeline.ts:83`. When the merged page is empty but a case source set the floor, `last` is null, so no cursor is returned. The case's own `keyed()` returns its floor as `last` in this situation (10 rounds of lines that `case-feed.ts` drops). The person timeline uses that floor only to filter, never as the next cursor.
- Repro:
  1. Open a case with one note.
  2. Insert 600 newer `audit_event` rows with `case_id` null, `firm_id` = firm B, and a summary naming the case's first 8 characters.
- Expected: same as the case's own timeline, which answers 0 lines, `more:true` with a cursor, and reaches the note on page 2.
- Actual: the person timeline answers 0 lines, `more:true`, `nextCursor:null`. The web treats that as "no next page" (`getNextPageParam`) and shows "Nothing has happened for this client yet." The real note can never be reached. This needs over 500 such rows, so it is rare.

**m3 (Minor): many cases are slow.** The server makes one `pageAfter` call per case, one after another (`person-timeline.ts:61`). Each call runs about six queries: the scope query, the firm, audit, audit floor, notes and names.
- Measured: 100 cases with 5 lines each gave 14 pages, all 500 lines exactly once, at **1.18 to 1.43 s per page**. With 2 cases a page takes about 75 ms.
- This is above STANDARDS §9's "first view < 1 s" and its "no request per row" rule (here, a set of queries per case). A paying client company with many cases would hit it.

**m4 (Minor): a line does not say which case it belongs to, and prospect lines mostly do not say what happened.**
- `caseId` is in the answer but never shown (`web/src/runtime/case-notes.tsx:263-268`). For a person on two cases, "A3 note …" and "Other change" give no hint which case they belong to. Screenshots at 375 and 1440 px.
- Prospect audit, call and event lines fall through to `lineWords` and read "Other change" (line 24). A call or a stage move is only explained behind Details.
- The row asks that "each line says what, who and when".

**m5 (Minor): error wording written for a case appears on the client page** (`case-notes.tsx:31-33`, reused by the `Timeline` component).
- A 404 reads "This case is not in the firm you are signed in to…".
- No connection reads "Could not reach the server. Your words are kept; try again." on a read-only list.
- Seen by intercepting the request at 375 px. There is no retry button.

## What held
- **Firm walls:**
  - Firm B reading A's person gets 404, even when using A's cursor.
  - An unknown id or a non-UUID id gets 404. An upper-case id works.
  - A cross-firm prospect link set by SQL, in either direction, between people who share an email: the other firm's prospect note never appears.
  - Moving a person or a case across firms by SQL is refused by the composite foreign key `runtime_case(client_id, workspace_id, firm_key)`.
- **caseScope (`view.own`):**
  - With an open team row, only that case shows. When the row is ended, it disappears.
  - As file owner, all 3 of the person's cases show.
  - Without the case, the person's own note still shows and no case is named.
- **Cursor:**
  - 330 lines at the same microsecond across all sources (person notes, case notes on 2 cases, 2×120 audit lines, 30 prospect notes) arrive exactly once each, newest first.
  - 164 more at another tie point also arrive exactly once.
  - Forged cursors all get 400 on `cursor`: an object, a bare string, a value above the bigint maximum, an SQL quote, an id of 70 characters, text that is not base64, an upper-case source, `cursor` given twice. Extra parameters get 400 as well.
  - The largest bigint returns the first page. `0` gives an empty page, `more:false`.
  - Another person's cursor only positions in time and leaks nothing.
- **Roles:** the simulated client (`x-actor`) and a staff `x-actor` without a session both get 401. The client's own case read never shows the person's note.
- **Client page:**
  - Empty, 500 and 403 states each show their own text.
  - No sideways scroll at 375, 1024, 1440 px or at 200 % (512 CSS px). No console errors.
  - A note of 4,990 characters with no spaces wraps and clamps. Mixed Arabic/Hebrew/English shows correctly in `<bdi>`.
  - Keyboard only: Tab reaches the lines region, Details and Show older; Enter loads more (10 → 50 lines).

Verdict: Changes 3069120aee22938a2c5b3d7ff8b0ae52c9c1e163
