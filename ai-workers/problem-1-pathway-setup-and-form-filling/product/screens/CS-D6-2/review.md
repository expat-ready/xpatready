# CS-D6 part 2 (R1.69): review — closed files past their keep period, and the weekly reminder (API and job, no screen)

PR #3497, head `8d1b712a5225f5ab2493c52cc3730e9be5699e86` (branch `claude/runtime-csd6-keep`), diff `origin/main...8d1b712a5` (10 files, +310/-3). Spec: brief `design/briefs/CS-D6.md` part 2, qa `qa/reports/2026-11-24-capability-R1.69.md` (the two missing parts), the PR body's stated deviations. There is no `concept.md` for this part. Reviewer: Opus, fresh context, US$0, live AI off, isolated copy :4494 (`xr_studio_runtime_csd6k`) only, never :4400.

**Verdict: Ship after fixes** (`Reviewer: Changes 8d1b712a5225f5ab2493c52cc3730e9be5699e86`). No Blocker. One Major, and it is a missing test: the code is correct. Journey score **8/10** (pass, no 0), report `journey-test-reviewer-2026-11-24.md`.

## What I ran
* `check_csd6_reads_keep.ts 4494 xr_studio_runtime_csd6k`: **42/42**, exit 0 (DW1-DW3 unchanged; DW4-DW6 new).
* `journeys/j_69.ts runtime_csd6k 4494`: **21/21**, exit 0 (W5 list, both W6 steps, W7 axe at 400/1024/1440 px).
* `tsc -p api/tsconfig.json --noEmit`: no error in the changed files. `graph.mjs --check`: G1/G2/G4/G5 0.
* The schedule is registered in the running app: `platform_jobs.schedule` has `case_documents.keep_period_weekly | 17 9 * * 1 | UTC`.
* **The real path, not the fakes:** a scratch script ran `KeepPeriodReminders.remind` with the app's own `PrismaNotificationPort` inside `withFirm(sample-firm)`. First run: 7 `msg_notification` rows (`item_kind case`, Owner only). Second run: still 7 (the adapter upserts). With no firm scope it throws "NotificationPort: no firm in scope", so the job must and does run under `PlatformJobs.handle`'s `withFirm`. I deleted the 7 rows afterwards.
* SQL probes of the date rule: a close on 2020-02-29 + 6 years = 2026-02-28 (Lead 61's 29 February rule holds). A close at `2020-11-25 04:30Z` is 2020-11-24 in America/Toronto (zone-local date, correct). `closed_at` is `timestamptz`, so `at time zone` gives the local wall time. `isoWeek` gives the right answers at 2026-W53, 2027-W01, 2020-W53 and 2025-W01 (on 2024-12-30), at 00:00, 12:00 and 23:59 UTC.
* Break pass with curl (Owner and solo-firm sessions):
  * a cursor of `' or 1=1--`, a 5000-character cursor, or a doubled `after` → 400 in field words;
  * a cursor in upper case → accepted;
  * this firm's case id used as a cursor by the other firm → 400, the same answer as an unknown id (nothing leaks);
  * `x-actor` alone → 401; POST → 404;
  * the list takes 14-17 ms.

## Judged
* **Permissions:** correct.
  * The route uses `@CaseRead()` and `@PermissionKeys("agent/document:dispose")` behind PF-4's guard. The firm comes from the session. DW5 proves 401 (also with `x-actor`) and 403 for the Case officer.
  * Each case is shown only if it is in `caseScope(...keys)` (`keep-period.ts:57`, `caseVisibleSql`). The cursor is accepted only if it is inside the same visible set (`:60`).
  * The reminder filters per recipient (`:155`). Holders are ACTIVE staff with an open grant whose role carries the key (`:148-151`), the same rule as `holdsKey`.
* **Firm walls and the bypass:** correct. `keep-period.bypass.ts` declares `job:case_documents.keep_period_weekly` with `outside: true` and audit per-firm, and `asJob` finds it. Under it, the weekly run reads only `distinct firm_id` and writes one `platform.bypass` line per firm through `touchEachFirm`. Each firm's job runs in `withFirm`, and every query also names `c.firm_id`.
* **Calendar dates in the firm zone:** correct (`:59`, `:63-64`), verified above. `today` comes from the clock port and `localDate(zone)`.
* **Job idempotency:** correct. The key is `keep-period:<firm>:<ISO week>`, unique per name (pg-boss), so a second run queues 0 (DW6). A redelivered firm job adds no row (verified on the real adapter). A job delayed into the next week returns 0 (`:141`).
* **SQL safety:** correct. Every query is a `Prisma.sql` tagged template. The zone, years, today, ids and cursor are bound parameters. The only `Prisma.raw` is the constant alias `c`. The cursor is checked as a uuid by zod.
* **Stated deviations:**
  * Not touching `case-documents.ts` and the screen: acceptable.
  * The guarded route: correct.
  * The j_69 W5 call aligned to a session with the assertion unchanged: acceptable, the same alignment qa made for part 1.
  * The route path and the per-case item: see m4 and m5.

## Issues (ranked)
**M1 (Must): the reminder's per-person case scope (AG-9-53) has no failing test.** The [M] line in `STANDARDS.md` (line 48) says "A rule's test fails when the rule is removed". If you replace `keep-period.ts:155` with `const seen = cases`, every holder is told about every past case of the firm, and all 42 checks stay green: DW6 runs with the Owner as the only holder (`view.all`), because DW5 restores CASE_MANAGER's keys before DW6 starts (`check_csd6_reads_keep.ts:180`). This filter is the only guard on this path. The bell labels case items "by the firm's own case only, with no case-scope check" (`platform/notifications/store.ts:43-45`), so its removal would send the case number of a case the person cannot see. Every seeded role holds `view.all` today, so the gap is latent, but it is a permission rule with no proof.
* **Fix (test only):** in DW6, give CASE_MANAGER `agent/document:dispose` and take away its `view.all` for the 14-day run (in a `try/finally`).
* Assert that `user-T` is never told about `kExact` (the fail case).
* For the pass case, assert either that `user-T` is told about a past case where they are on the team, or that the Owner is still told twice.

**m1 (Should): the zone and 29 February rules have no failing test.** DW4 closes cases at 12:00 local time (`check_csd6_reads_keep.ts:156`). 12:00 in Toronto is 17:00 UTC, the same date, so a version that counts UTC dates also passes. **Fix:** close one case at 21:30 local on today−6y. That is 02:30 UTC the next day, and it must be listed. Then call `pastKeepPeriod(db, firm, 6, zone, "2026-02-28", …)` and `"2026-02-27"` for a case closed on 2020-02-29 local: listed on the 28th, not on the 27th.

**m2 (Should): other reminder rules have no failing test.**
* The ACTIVE-staff filter and the ended-grant filter (`:150-151`) are untested.
* The stale-week guard (`:141`) is untested.
* The redelivery check proves only the fake port's dedupe (it would pass with no guard in this code). That is acceptable, since the port is the rule (PR question 2), but say so in the DW6 label.

**m3 (Should): paging of the keep list is untested.** The brief asks for "paged 50". The keyset `(closed_at, id)` reads correct, but no case seeds 51 rows. **Fix:** 51 past cases page as 50 + 1, with none twice and `next` null at the end.

**m4: the route path differs from the brief.** The brief names `GET /api/runtime/keep-period/closed-files?before=` (part 2), and part 3's Dispose hangs off it (`…/closed-files/:caseId/dispose`). The PR body says the brief "names none". It does; it was qa's report that called j_69's path a guess. The deviation is stated, so it is not silent. **Fix:** the Lead confirms `documents/past-keep-period?after=` and amends part 3 of the brief in the same breath, so that the two parts do not diverge.

**m5: one notification per case, not per firm (a stated deviation).** It is needed for j_69 W6, which matches the case or document id. The cost: the port marks each item unread again weekly, so a firm with N past cases gives every holder N unread items each Monday. Also, `web/.../notifications/contract.ts:30-37` has no `keep-period-passed` words, so the bell reads "Something needs you". **Fix:** the Lead confirms. Add the bell's words with the screen follow-up.

**m6: the brief's part-2 screen and the browser script are not built.** These are `/cases/keep-period`, `keep-period.tsx` and `check_csd6_keep_browser.ts`. Deferring them is right: part 2's Ready-when ("the screen concept agreed") is not met, and R1.69's Done when is at API level (qa). Until then, the list is reachable only by API with a bearer token. **Fix:** record a follow-up row (PR question 1), so the screen is not lost.

**m7: low-risk code points.**
* `remind` caps the list at 10 000 cases with no word if it is cut (`:146`, `:155`).
* All notifies run in one transaction.
* Each holder's run also re-reads the document ids, which it never uses.
* `register(_o)` ignores its argument.
* **Fix:** log when a cap is hit; skip the document query when the scope is null.

**m8: hygiene.**
* DW5 changes role permissions with no `try/finally` (`check_csd6_reads_keep.ts:178-180`): a crash between the change and the restore leaves the copy with changed keys.
* The card fragment `MODULE.cases.rows/CS-D6.md` has no part-2 `Tests:` line. That is harmless, since it is the same file.
* j_69 W5's label still says "missing … the path is a guess" (`j_69.ts:199`): qa's to tidy.

## D1–D20 (API and job only)
* **D1 4/5:** both missing parts are built per SA-11-33 and AG-9-53. The screen is deferred (m6).
* **D2 5/5:** no writes except the notifications, which are idempotent.
* **D5 5/5:** re-run, redelivery and a stale week are all safe.
* **D6 N/A.**
* **D7 N/A:** no AI.
* **D15 5/5:** 15 ms, with no query per row (the document ids come in one query).
* **D16 3/5:** M1, m1-m3.
* **D18 4/5:** the number's source is shown ("firm setting").
* **D8-D14 and D19: N/A** (no screen).
* **D17 and D20: simulated only.**

**BIC-01–BIC-20:** all N/A. There is no case-side screen in this PR.

## Could not check
* A real pg-boss Monday fire. I checked the schedule row and the handler under `withFirm` separately.
* RLS on the app's own non-superuser role: my script ran as `xr_studio`.
* A visible-browser walk: there is no screen.
* The full CI: `ci` was skipped on this head, as it runs at label or queue time.
* **A newer commit:** `1c3b1ae00`, the breaker's fixes (one transaction per notification, no 10 000 cap, only firms with a number set), was pushed on top while I wrote this review. **It is not reviewed here.** The verdict holds for `8d1b712a5` only, and the next round must re-check M1 on the new head.

Verdict: Changes 8d1b712a5225f5ab2493c52cc3730e9be5699e86
