# Break report: CS-D6 part 1 (R1.69), PR #3203 at bb13effa0

Breaker, 23 Nov 2026. Isolated copy `brk_csd6` on :4488 (`PLATFORM_IDENTITY=local`), set up by the PR's own `tests/check_csd6_reads_keep.ts` (18/18 pass on this copy). Attacks were made with curl, psql and Playwright (Chromium, axe-core). Live AI off, US$0. Scope: the two routes and the "File details…" dialog. The `readOnce` "read by AI / read by rules" lines are on the PR's "Not in this PR" list, so they are not findings here. The copy was stopped at the end. Lines staged in SQL are synthetic Sample data.

## Findings

**M1 (Major): both routes skip the one case-visibility rule (`caseScope`), so AG-9-53 is not met.** `reach()` (`api/src/case-document-reads.ts:49-58`) only checks the firm. `api/src/case-access.ts:1-9` (on main, part of this PR's base) is "the one rule for which cases a staff member may see ... later rows import it and nobody re-derives it". Under it, a person with `agent/case:view.own` and no `view.all` sees only cases they own or are on the team of. The brief asks for "the case reached for the staff person, AG-9-53" and names this breaker test ("the panel for a document of a case the person cannot see"). Steps:
1. On an isolated copy, in SQL: `delete from platform_role_permission where role='CASE_MANAGER' and permission_key='agent/case:view.all'` and `insert ... ('CASE_MANAGER','agent/document:view-access-log')`. This simulates a firm that keeps the own-cases rule.
2. Sign in as user-T (Case manager). `GET /api/platform/me` now lists `agent/case:view.own` but not `view.all`. user-T is not on case C-2026-00001's team (only user-R and user-O are) and is not its file owner.
3. `GET /api/runtime/documents/<doc on that case>/reads` with user-T's bearer token. **Expected** 404 "No such document.". **Actual** 200, with the file name, the fingerprint and every reader.
4. `POST .../check-unchanged` gives the same result: **actual** 200, and a "checked unchanged" line is written under user-T's name.
Today this is latent, because every seeded role holds `view.all` (`case-access.ts:9`). The PR still cites AG-9-53 as met and has no test for it. Fix direction (not done here): reach the case through `caseScope`/`caseScopeWhere`, and add a DW2 fail case for a view.own-only person.

**m1 (Minor): the page cursor cuts timestamps to milliseconds, so lines with sub-millisecond `at` are skipped.** `cursorOf` (`case-document-reads.ts:35`) writes `at.toISOString()`, which keeps milliseconds only. `audit_event.at` is `timestamptz(6)` and its database default is `CURRENT_TIMESTAMP`, which keeps microseconds (`prisma/schema/audit.prisma:20`). Steps: add 48 lines for one document at 2026-11-30, plus three lines at `2026-11-29T10:00:00.123456Z`, `.123400Z` and `.123300Z`, then page through with `?before=next`. **Expected** 152 lines, matching the database. **Actual** 151: `.123300` never shows, because the cursor `...00.123Z` puts it neither `< at` nor `= at`. Today's writers go through Prisma and keep milliseconds, so live data is not hit. Any raw-SQL or default-time writer would make this access log lose lines silently.

**m2 (Minor): a directory or a file over 2 GiB at the stored path gives a 500 and writes no "found changed" line. Reading a large file blocks the server.** `checkUnchanged` (`case-document-reads.ts:87-88`) checks `existsSync`, then `readFileSync`. Steps:
- Replace a stored file with a directory: **actual** 500 (`EISDIR` in api.log). No audit line is written.
- Replace it with a 3 GiB sparse file: **actual** 500 (`ERR_FS_FILE_TOO_LARGE`). No line is written.
- Replace it with a 1 GiB file: the check takes 1.8 s, and a `GET /reads` sent at the same time waits 1.5 s, because the event loop is blocked.

Tampering is exactly what this check exists to catch, yet in these cases it records nothing (AG-9-31: "a re-hash mismatch flags the document"). **Expected**: "found changed" with `found_sha256: null` or the hash, using a streamed hash.

**m3 (Minor): keyboard focus falls to the dialog container in three places (WCAG 2.4.3).** Tested at 1440 px, keyboard only:
(a) Press Enter on "Check the file is unchanged". The button becomes `disabled` while busy (`document-reads.tsx:61`), and focus moves to `div[role=dialog]`.
(b) Sign in through the inline card with Enter. The card unmounts and focus lands on the dialog container.
(c) Press "Show older" until the last page loads. The button unmounts (`:90`) and focus lands on the dialog container.
**Expected**: focus stays on the button in (a), and moves to the next sensible control in (b) and (c). The journey `j_69.ts:110` calls `.focus()` on the button by script, so it does not catch (a).

**m4 (Minor): when the session ends mid-call, the dialog gives no reason.** Steps: open File details as the Owner. Delay `check-unchanged` by 1.5 s. While it is in flight, sign in as user-R elsewhere. The call gets a 401 and the dialog falls back to the sign-in card with no words about why. `useSessionEnd()` ("Signed in elsewhere", AG-1-55) is not passed to `<SignInCard embedded />` (`document-reads.tsx:41`). An expired session on reload shows the sign-in card correctly.

**m5 (Minor): `check-unchanged` has no limit, so anyone with `agent/document:show` can flood a document's "Read by" list.** Read only is one of those roles. Steps: send 30 checks at once as user-O. **Actual**: 30 × 200 and 30 audit lines, which never expire (P-571). The real reads get pushed pages down. The key itself is what the brief asks for; the missing per-person limit (or debounce) is the gap.

**m6 (Minor, carried over from the brief's contract gap 2): the "Read by" query does a sequential scan.** With 1.5 M audit lines in the workspace, `GET /reads` takes 170-270 ms (EXPLAIN: Parallel Seq Scan, 500 k rows removed per worker). STANDARDS §9 allows < 200 ms. The `(entity, entity_key, at)` index is the brief's open question for the tech lead. The PR body does not repeat it.

## What held
- Another firm (user-S, sample-solo) on both routes: 404 "No such document.", the same as an unknown id. No line was written. Also held with a mixed bearer for sample-solo plus `x-actor: user-R`.
- x-actor alone, on both routes: 401. Forged bearer: 401 "not one this server issued". A Case officer bearer plus `x-actor: user-R`: 403. Two `Authorization` headers: the first one wins (Officer → 403). A cookie instead of a bearer: 401.
- Letter case in the path: `GET /API/Runtime/Documents/...` returns the SPA HTML and no data. `POST /API/RUNTIME/.../Check-Unchanged` returns 401 without a session, or 403 "link-only" with one. An upper-case document id is normalised and works. A trailing slash still enforces the key (403).
- Malformed ids: SQL-like, unicode/RLO, full-width, `%0A`: 404. A 100 kB id: 431. Cursors that are SQL-like, unicode, `before=a&before=b` or month 13: 400. A huge cursor: 431. Future and 1970 cursors: a correct page. A cursor from another document only marks a time, so it leaks nothing.
- Paging: 50 tied timestamps across a page boundary, then 101 lines, all unique. Exactly 50 lines: `next: null`. 51 lines: pages of 50 + 1. 30 concurrent checks, two sharing one timestamp: paged correctly.
- Other firms' lines: a line with entity "case document", this document's key and the solo firm's `firm_id` is hidden. Firm-less lines show, as designed. `audit_event` refuses UPDATE.
- Missing file: "found changed", `found_sha256: null`, "it is missing" line. A planted-instruction PDF is only hashed (unchanged, no model call). The RLO in a file name is stripped at upload.
- Dialog: axe finds 0 WCAG A/AA violations. At 390 px: scrollWidth 356 = clientWidth, no sideways scroll. 1024 px at 200 % (512×400 CSS): fits, with internal scroll. Screen reader names: "Fingerprint (SHA-256)", "Read by" and "Sign in to your firm" regions, and buttons "Copy", "Check the file is unchanged" and "Close". `<bdi>` is used on names. The Case officer sees no "Read by" list, and the Owner does. A check refreshes the list. An expired session on reload shows the sign-in card. No console errors except the expected 401.

## Not checked
"read by AI / read by rules" and "previewed" lines: not built here, and #3188 is not merged. Several current files on one line (C6.15 sets): no set line exists on the Visitor visa, so the case of N inline sign-in cards in one dialog was not exercised.

Verdict: Changes
