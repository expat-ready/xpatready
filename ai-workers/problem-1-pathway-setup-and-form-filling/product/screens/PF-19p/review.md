# PF-19p review: platform account messages (independent Opus reviewer, effort high)

Reviewed: `a1b2794e828960f0961edeedd39d28f8c51024ef` (PR #1961), `git diff origin/main...a1b2794e8`, against the brief `lead-b-briefs/PF-19p.md` (Lead B rev 16.62) on `lead-b-front-office`, `STANDARDS.md` and the PR body's "Plan, as built". 16 Nov 2026. No live AI, no live email, US$0. Code not edited.
Outcome: **Block** (two Majors; no Blocker). The journey score is in `journey-test-reviewer-2026-11-16.md`: **7/10**, below the pass mark.
Note: while I reviewed, another agent changed the shared checkout (uncommitted break-F1 work in `send/messages.ts`, then the branch moved to `208074c6f`). Everything below was measured on clean worktrees of `a1b2794e8`. The later commit is not reviewed here; re-review reads only its diff (P-277).

## What I ran (clean worktree at a1b2794e8, Postgres 18.3 on :54329)
* `tests/check_pf19p_platform_mail.ts`: **48 passed, 0 failed** (4.7 s). Also: pf19b_sending 42/0, pf19b_mail 29/0, pf0p_ports 113/0 (the PF-0p "mail fail: a message without firmId is refused" line at `check_pf0p_ports.ts:181` is unchanged and passes), pf19a_messages_schema 94/0, pf3 75/0, pf4b 55/0, pf5 53/0. pf23_observability fails here only on its live-server part (the isolated api.log is missing in this sandbox), which has nothing to do with this diff.
* `prisma migrate diff`, from a database with every migration applied to `prisma/schema`: no `msg_outbox`, `MsgAudience` or platform drift. `graph.mjs --check`: exit 0, with no new gaps.
* Probes (scratch database, real `Messages` and `MessagesMail`):
  - 12 concurrent `send`s with one platform key give 1 row and 1 id.
  - 6 at REPEATABLE READ give 1 row, and the others get `MessageRepeated`, so the partial index's P2002 is mapped.
  - 3 `dispatch(null)`, 2 `sweep()` and 1 `deliver(null)` on one row together call the adapter once.
  - An adapter that throws leaves the row QUEUED with no reason, `dispatch` does not throw, and 0 lines are logged.
  - The raw CHECK refuses `template_version_id` and `consent_id` on a platform row (23514).
* Isolated copy on :4431 (runtime ports): `GET /api/demo/platform-inbox?address=not-an-email` gives 400 in plain words; a valid address gives 200 in 13 ms; as Client A (`user-P`) it gives 403. Stopped afterwards.
* Test merges (`git merge-tree`, then tsc on the merge):
  - with #1910 (PF-12): conflicts in `demo-inbox.ts` and `platform/MODULE.md`;
  - with #1956 (PF-19b part 2): the same two conflicts, and `send/messages.ts` merges by itself;
  - the merge with #1956 gives 3 new TS errors (`ses.ts` ×2, `unsubscribe.ts`: `string | null` firm id), so CI's types job catches them on the second PR to land.

## Schema, unions, existing paths: what holds
* **CHECKs:**
  - `("firm_id" IS NULL) = ("audience" = 'PLATFORM_ACCOUNT')` is exact, on insert and on update (DW2 proves both);
  - the platform CHECK pins EMAIL, TRANSACTIONAL, no subject, consent or template, and a non-null key. It is needed: the composite consent FK is MATCH SIMPLE and the template trigger compares with `<>`, so both pass a NULL firm (`pf19a migration.sql:283,428`);
  - existing rows become FIRM through `ADD COLUMN … NOT NULL DEFAULT`.
* **Partial unique index:** `(firm_id, idempotency_key) NULLS NOT DISTINCT WHERE audience = 'PLATFORM_ACCOUNT'` is correct. It needs PG 15 or later; the lanes and `deploy/compose.test.yml` run 18.3.
* **NULL-firm rows on existing paths:**
  - the firm sweep now says `firm_id IS NOT NULL` (`messages.ts:191`);
  - `deliver(firm, id)` is firm-keyed, so a platform id is skipped (tested);
  - `msg_event.firm_id` is NOT NULL and its FK is `(firm_id, outbox_id)`, so a platform row can never have an event;
  - `firmScope` readers never match NULL;
  - the demo inbox reads by address and the platform file space (`filesSpaceOf`).
* **zod unions:**
  - each side is strict, so a message with both is refused;
  - neither is refused as a firm message without `firmId` (error path `firmId`), so PF-0p is unchanged;
  - `platformAccount: false`, marketing, service, a person, an attachment, WhatsApp and a template are all refused;
  - `MessageSend`'s callers are unchanged apart from an optional `platformAccount?: undefined`.

## Findings
**Blocker:** none.

**M1 (Major): platform delivery runs inside the caller's request, not in the worker (plan item 1).**
* Code: `send/mail.ts:44-45` calls `dispatch(null)`, which runs `deliverPlatform` inline (`send/messages.ts:113-116`). The adapter call happens in the caller's process and request.
* Against: STANDARDS.md:28 [M] "Background work in the worker … never inside a web request", and the brief's "through the same send path".
* Failure scenario: PF-5v part 2's `POST /api/public/signup` calls `MESSAGES_MAIL.send({ platformAccount: true, … })`. Once #1956's SES adapter is chosen (`SES_TIMEOUT_MS` 20 s), the person's sign-up answer waits on SES for up to 20 s. A firm email returns as soon as its job is queued.
* Fix: Lead B rules (the PR asks). Recommended:
  - let a platform row be a `messages.send` job. `JobRun.firmId` is already `string | null` (`ports/jobs.ts:28`); only `JobOptions.firmId` (`ports/jobs.ts:18`) must accept null for it. Under PF-12 this also needs a `job:` entry on BYPASS_USES;
  - or Lead B records a written exception to STANDARDS:28 for this row.

**M2 (Major): a failing platform send is retried every minute, forever, with no backoff, no limit, no reason and no log line. Fifty such rows starve the sweep.**
* Code: `send/messages.ts:115` (`.catch(() => undefined)`) and `:195-200` (the 50 oldest QUEUED platform rows each minute, `.catch(() => "failed")`). The "dispatch … failed; the sweep sends it" log at `send/mail.ts:45` can never fire.
* Against: STANDARDS.md:28 [M] "retry with backoff … persisted status".
* Failure scenario (probe above; the breaker's F1 measured 500 provider calls in 5 sweeps): SES rejects the From address (sandbox, unverified) or one address. Every verification email stays QUEUED with no reason, SES is called 60 times an hour for each row, and nobody is told. Once 50 rows are stuck, a verification email left by a crash is never sent.
* Firm rows, by contrast, get pg-boss's 3 tries with backoff (`pgboss-jobs.ts:44`), a dead letter, and an hourly sweep key.
* Fix: count the tries on the row, back off, end FAILED with a reason after N tries, and log ids only. Add a pass/fail test (a throwing adapter: retried later, then FAILED, one log line).

**Minor**
* m1 `settings.ts:207`, `send/messages.ts:105`: `platform.account_mail_from` is registered in the per-firm settings registry, but only `.default` is read, so a stored value changes nothing. Its key `system/settings:manage` is in no role catalogue. Say "read as its default only" in its description, or give it a platform-level read: Lead B's call.
* m2 `migration.sql:21-22`: nothing tests the CHECK's `channel = 'EMAIL'`, `consent_id IS NULL` and `template_version_id IS NULL` clauses at the database, so removing any one fails no test (STANDARDS.md:48). They are the only database guard, because of the MATCH SIMPLE FK and the `<>` trigger. Add three raw inserts to DW2's 23514 line.
* m3 `check_pf19p…ts:149-160`: DW3 proves reads only. The brief's "writable only by the system role" half is not proven: the probe role gets SELECT only, and the PF-12 branch never writes as `xr_app` or `xr_staff_bypass`. Add one INSERT of a NULL-firm row by each, expecting 42501 and ok. When PF-12 lands, that is the tripwire for the `asBypass` wrap. Without the wrap, `deliverPlatform` reads nothing and answers "skipped" with no error.
* m4: no race test for the platform key. Removing the advisory lock at `send/messages.ts:102` fails no test in this suite (I measured that it holds: 12 sends, 1 row).
* m5 DW4's "the migration test in a parallel world" (rev 16.7) has no case in this suite: no stamp check, and nothing measured right after its own migration (pattern: `check_pf5_signup_billing.ts:91-95`). The stamp `20261116123000` is later than main's newest and PF-12's. The behaviour holds: the breaker carried 8 old rows across, and migrate diff is clean.
* m6: landing notes for #1956 are missing from the PR.
  - #1956 gives `deliver` `{ timeout: DELIVER_TX_MS }` (its break M1). `deliverPlatform` keeps Prisma's 5 s default, and the files merge without a conflict. So with SES, a send accepted after 5 s rolls back and is sent again: a second verification email.
  - `ses.ts` tags `firm: r.firmId` (null). tsc catches this, but the second PR to land must choose (omit the tag). `bounces.ts` then ignores a platform bounce, so the address is never suppressed.
* m7: the PF-12 landing note should also say to keep PF-12's `asBypass("platform.demo.inbox")` wrapper together with this PR's `filesSpaceOf` when the `demo-inbox.ts` conflict is resolved (breaker F3). Also, `asBypass("platform.account.mail")` needs a BYPASS_USES entry with the sign-up routes and `outside: true`.

## The five deviations
1. Inline delivery with no JobPort: **not accepted as built** (M1, M2). Lead B rules on M1; M2 must be fixed whatever the ruling.
2. Platform file space (nil uuid): **accepted**. It is a folder name only; no row or FK holds it.
3. No templates on platform rows: **accepted**. The reason is verified (`msg_outbox_template_in_firm`'s `<>` passes a NULL firm); test it (m2).
4. TRANSACTIONAL only: **accepted**. It matches "never marketing", keeps a person's consent out, and keeps #1956's unsubscribe headers away (they return `{}` for TRANSACTIONAL).
5. Touch list widened: **accepted**. It was asked in the open, and the files are the ones the shared send path needs. For P-423, the release holder should read `ports/messages.ts` and both contracts, not only `ports/mail.ts`.

## Screen-review items
* No screen: the brief's build list has no UI, and the PR says "nothing to click yet". D1–D20 and BIC-01–20 are N/A.
* [M] lines:
  - idempotent creates (STANDARDS:27): met;
  - background work (STANDARDS:28): not met (M1, M2);
  - migrations keep records and a rollback is recorded (STANDARDS:34): met;
  - personal data never logged (STANDARDS:35): met;
  - strict TS, no new `any`: met (count-any 417 → 417);
  - "a rule's test fails when the rule is removed" (STANDARDS:48): partly met (m2, m4).
* Graph: no new page or route; exit 0.

## What I could not check
* Real SES (#1956 is not merged; no live email).
* PF-12's roles against this exact commit: the breaker ran that check (F3).
* The caller, PF-5v part 2, does not exist yet.

**Fix list:** M1 (Lead B's ruling, or the job path); M2 (backoff, a limit, FAILED with a reason, a log line, and a test). The Minors are recommended for the same PR.

Verdict: Changes requested

## Re-review (diff a1b2794e8..8b82dfd2f)

Diff only (P-277), 16 Nov 2026: the branch's own commits `208074c6f` (break F1, F2), `92fb36576` (m2-m6) and `7b2be8e02` (Lead B's ruling A on M1), plus the merge `8b82dfd2f`'s resolutions in `demo-inbox.ts` and `platform/MODULE.md` and its two new BYPASS_USES rows. PF-12's own code is not re-reviewed. Lead B's ruling: PR comment 6911266709 (rev 16.66). No live AI, no live email, US$0. Code not edited.
Note: the PR head is now `148894cc4`. That commit adds only the breaker's re-break notes to `break-report.md`, so this verdict covers its code too.

### What I ran (checkout at 8b82dfd2f, clean tree, Postgres on :54329)
* `check_pf19p_platform_mail` 65/0 (it was 48), `check_pf14_jobs` 95/0, `check_pf0p_ports` 114/0, `check_pf12_walls` 100/0, `check_pf19b_sending` 42/0, `check_pf19b_mail` 29/0.
* `product/tools/typecheck.mjs`: PASS, no new type errors (15 known, 0 fixed). It needs `NODE_OPTIONS=--max-old-space-size=6144` in this sandbox; with the default heap, tsc api runs out of memory.
* One probe on a scratch database (dropped afterwards; the probe file is deleted): the real `Messages` and `MessagesMail` with fakeJobs. The provider and the try's own bookkeeping read fail once, then both work again. Result after 120 sweeps (2 h): the row is `QUEUED`, its reason is null, the sweep queued 0 jobs, and 0 log lines were written (m-r2 below).

### Lead B's four conditions
1. **Either `firmId` or `platform: true`, never both, never neither: met.** `ports/jobs.ts:26` is a zod discriminated union of two strict objects.
   - Neither is refused as a firm job without `firmId`, and both are refused by the strict object.
   - The contract case (c) and the breaker's probe also cover `platform: false`, `"true"` and `1`.
2. **`platform: true` only on PLATFORM_JOB_QUEUES (`messages.send`), refused by the port and the runner: met.**
   - The constant is one frozen array at `ports/jobs.ts:23`.
   - The fake refuses through `jobFirmOf` (`:34`), on both enqueue and schedule.
   - PgBossJobs refuses before anything is queued (`pgboss-jobs.ts:240`) and again at run, a hand-written envelope included (`:283`, the new PF-14 line in `check_pf14_jobs.ts`).
   - "Only for PLATFORM_ACCOUNT messages" holds because `sendPlatformRow` selects only `firm_id IS NULL AND audience = 'PLATFORM_ACCOUNT'`. A platform job naming a firm's row is skipped (breaker, Held).
3. **A platform job runs as the system role and never touches a firm's rows: met for every caller in the code, but the handler does not enforce it (m-r1).**
   - `PlatformJobs.handle` runs a job with no firm through `asJob`, which uses `asBypass("job:messages.send")` (`firm-scope.ts:107`). `check_pf14_jobs` logs `platform_bypass use job:messages.send`, and DW3's last line sends through the walled pool.
   - A firm's send job still runs `withFirm`.
4. **The shared contract case on every adapter: met.**
   - Case (a) runs, (b) refuses an unlisted queue, (c) refuses a job naming neither. It runs on fakeJobs (pf0p), PgBossJobs and PlatformJobs (pf14).
   - On the fake, (a)'s "retried as a firm's job is" compares `[1]` with `[1]`, because the fake never retries. PgBossJobs and PlatformJobs prove a real second attempt.

### The earlier findings
* **M1: resolved.**
  - `MessagesMail.send` writes the row under `asBypass("platform.account.mail")` (`send/mail.ts:45`) and then only queues a job: `dispatch(null)` does one `enqueue` (`send/messages.ts:130`).
  - The first DW1 line proves the answer comes back with the row `QUEUED` and one waiting platform job on `messages.send`, and no provider call is made.
  - The sign-up answer no longer waits on the provider. STANDARDS:28 is met.
* **M2: resolved.**
  - A failed try is counted in `state_reason` (`send failed: try n of 5`), with one log line of ids and the error name only (`:186`). Then the error is thrown on, so the runner retries.
  - At try 5 the row is `FAILED "send failed"`.
  - The sweep waits longer after each failed try, puts never-tried rows first, and queues each try once under its own key.
  - DW1 has a pass/fail test: 51 stuck rows, one fresh row sent on the first sweep, and all 51 rows FAILED after exactly 5 × 51 log lines.
  - The breaker's pg-boss probe: one job makes 4 provider calls and ends "try 4 of 5" with one dead letter; the sweep's 5th call ends it FAILED.
* **m1** (setting wording): resolved (`settings.ts:205-209`).
* **m2** (CHECK clauses): resolved. A new DW2 line covers WhatsApp, `consent_id` and `template_version_id` (23514).
* **m3** (role writes): resolved.
  - With the probe roles, a firm role's insert gives 42501, it updates 0 rows, and the system role writes.
  - With PF-12's roles, `xr_app` gets 42501.
  - Through the real `WalledPool`, a write without the bypass is refused, and `platform.account.mail` is refused on another route.
  - The DW3 probe no longer switches PF-12's row security off (`hadRls`).
* **m4** (key race): resolved. Eight concurrent sends give 1 row and 7 `repeated`.
* **m5** (parallel world): resolved.
  - DW4 checks the stamp.
  - It migrates up to the migration before PF-19p's, writes an old-shape SENT row with its event, applies PF-19p's migration and checks right after it: the row is FIRM, its event is kept, both CHECKs are validated, and the index is valid and unique. Then it runs the later migrations.
* **m6** (#1956 landing notes, 60 s transaction): resolved.
  - `PLATFORM_DELIVER_TX_MS` (60 s) is set as both `timeout` and `maxWait` (`:43`, the transaction at `sendPlatformRow`).
  - The PR body's "Landing notes" covers the `ses.ts` null firm tag and bounces.
* **m7** (merge): resolved.
  - `demo-inbox.ts` keeps PF-12's `asBypass("platform.demo.inbox")` around `listAll` and uses `filesSpaceOf` for both reads.
  - `platform/MODULE.md` keeps both test lists, so both `check_pf12_walls` and `check_pf19p_platform_mail` are listed.
  - BYPASS_USES has `job:messages.send` (`outside`, no routes) and `platform.account.mail` (the sign-up routes, `outside`, `direct`).

### Nothing else broken
* **PF-14's "no job without a firm":** still holds for every queue except `messages.send` with an explicit `platform: true`.
* **PF-12's walls:** 100/0. The two new bypass uses are the only change in `firm-scope.ts`.
* **Firm sends unchanged:**
  - The firm path's dispatch key, sweep query, hourly sweep key and `deliver(firm, …)` are unchanged in the diff;
  - the firm handler branch gets `String(j.payload.firmId)` as before;
  - pf19b sending and mail pass.
* **`JobOptions`:** its type is now `z.input`, and `cancel` uses `JobKey`. tsc finds no new error, and nothing else read `JobOptions.shape`.

### Findings
**Blocker:** none. **Major:** none.

**Minor**
* **m-r1 `send/messages.ts:239`: the send handler picks the platform or firm path from the payload, not from the job's firm.** (This is the breaker's R1; I confirm it by reading.)
  - What happens: a platform job (`j.firmId === null`) whose payload has `firmId: A` and no `platform: true` takes the firm path, `deliver(A, …)`, inside the bypass scope. A firm's row is then sent by a job with no firm, as the system role.
  - Failure scenario: a later caller writes `enqueue("messages.send", { firmId, outboxId }, { key, platform: true })` by mistake. Firm A's message goes out under `job:messages.send`, past the wall, and nothing refuses it.
  - Why it is not higher: no caller does this today. `dispatch(null)` and the sweep always set `platform: true` (`:130`, `:233`). Consent and the cap still apply.
  - Condition 3 is therefore held by its callers, not by the code.
  - Fix (one token, recommended in this PR): branch on `j.firmId === null` alone, and refuse a payload `firmId` on a job with no firm.
* **m-r2 `send/messages.ts:181-187, :233`: a try that fails before it is counted leaves the row QUEUED for good.** (This is the breaker's R2; my probe reproduces it independently.)
  - What happens: the try is counted only if the catch's own `findFirst` and `updateMany` succeed. The sweep re-offers the row under `platformJobKey(id, tries)`, and a key that is already used never queues again (`job-key.ts`: no job row is ever deleted).
  - Failure scenario: all 4 pg-boss attempts of one job die uncounted. For example, the API's Prisma pool is exhausted (`maxWait` 60 s, then the catch's read also times out) while pg-boss's own pool works, for the few minutes of its 30 s, 60 s and 120 s backoff.
  - Result: a sign-up verification email stays QUEUED forever. It never becomes FAILED, and no row log line is written; only the dead-letter list shows the job.
  - The firm path's hourly sweep key does not have this hole.
  - Fix: count the try before the provider call (claim it in its own statement), or let the sweep key also carry the hour once a row is far past its wait.
* **m-r3 `send/messages.ts:44` and the PR's "2/4/8/16 min": the wait schedule described is only the fake's.**
  - In production, tries 2-4 are pg-boss's retries (`DEFAULT_RETRY`: 30 s base with jitter, so about 30-60 s, 60-120 s and 120-240 s). Only try 5 waits for the sweep's 16 minutes.
  - pg-boss's third retry can wait up to 240 s, which matches the sweep's 4-minute wait after try 2, so the two may overlap. The row lock and the cap of 5 keep it bounded (the breaker measured no double send).
  - Fix: correct the comment and the PR text. Optionally, set the platform queue's retry policy to match.
* **m-r4 (STANDARDS:48): "a failing send rethrows so the runner retries" has no test that fails without it.**
  - DW1 runs on fakeJobs, which never retries. If `if (!last) throw e` (`:187`) were removed, every DW1 line would still pass, because the sweep makes all 5 tries.
  - The breaker's pg-boss probe shows that the rethrow works, but that probe is not committed.
  - Fix: add one assertion that the platform job's fake status is `failed` after a refused send, or a small PgBossJobs case in pf14.
* **m-r5 (breaker R3, bounded): the platform sweep reads the 2000 oldest-`updated_at` rows before it filters by wait (`:228`).**
  - With more than 2000 stuck rows that are not yet due, a due row can wait up to 16 minutes.
  - I accept it as the breaker rated it: it clears by itself, and the sweep only matters when a dispatch was lost.
* **Note:** `outside: true` on `platform.account.mail` also allows it inside a firm's job (breaker's note). No caller does this. Accepted, as I recommended in m7.

### Journey re-score
Journeys 5 (provider failure) and 10 (across the boundary) now hold, with m-r2 as the remaining recovery gap. The re-score is in `journey-test-reviewer-2026-11-16.md` ("Re-score at 8b82dfd2f"): **8.5/10** (6/7 applicable), no criterion at 0, so it passes.

**Fix list (recommended, not blocking):** m-r1 (branch on the job's firm), m-r2 (count before the send), m-r3 (wording), m-r4 (one assertion).

Verdict: Approve 8b82dfd2f1170990519b1daa6d701d1dd5a0b345

## Re-review (diff 8b82dfd2f..f0793beb3)

Diff only (P-277), 16 Nov 2026: `f0793beb3` changes `send/messages.ts` (+8/−3) and `tests/check_pf19p_platform_mail.ts` (+18/−2). `148894cc4` in between is records only (`break-report.md`). Code not edited.

### What I ran (checkout at f0793beb3, clean tree)
`check_pf19p_platform_mail` 68/0, `check_pf19b_sending` 42/0, `check_pf14_jobs` 95/0. I did not re-run the others; the builder reports pf12 100/0, pf0p 114/0, pf19b_mail 29/0, fo3_booking 133/0 and a clean tsc.

### The four Minors
* **m-r1: resolved.**
  - The send handler is now `deliver(j.firmId, outboxId)` (`send/messages.ts:244`), so the job's own firm picks the path and the payload's `firmId` is never read.
  - A job with no firm can only reach `deliverPlatform`, which selects only platform rows with no firm. So Lead B's condition 3 is now held by the code, not only by its callers.
  - Firm sends are unchanged in effect. Both places that queue a firm send set `payload.firmId` equal to `opts.firmId` (`:136`, `:227`), so `j.firmId` is the same firm.
  - A recurring run on `messages.send` (no firm) now goes to `deliverPlatform` and is skipped, which is harmless.
  - New test: a platform job whose payload names firm A's QUEUED row leaves it QUEUED. On the old line it would have been sent through the firm path.
* **m-r2: resolved.**
  - The platform sweep key is now `msg.send:platform:<id>[:try:n]:sweep:<hour>` (`:237`), the same pattern as the firm rows' hourly key.
  - A try that was never counted is queued again within the hour, and the dispatch's key (`:132`) is never reused.
  - Cost: a row whose job is still waiting can get one more job each hour. That is the same as the firm path, and it stays bounded: the row lock and the QUEUED check stop a second send, and a failing provider ends the row FAILED at 5 counted tries.
  - New test: after the try's count is cleared, a sweep an hour later queues it again and counts try 1. My earlier probe of this case (QUEUED for good) would now recover in the same way.
* **m-r3: resolved.** The comment at `:44-46` now says that pg-boss's own retries usually make tries 2 to 4, and the sweep's wait covers what is left.
* **m-r4: resolved.** A new DW1 line checks that the dispatch's job ends `failed`, not `done`, after a send that throws. Without the rethrow at `:189` that line fails.

### New findings
None. m-r5 (the 2000-row window) stays accepted as bounded.

The journey score is unchanged in kind, with error recovery's edge (m-r2) now closed. I did not re-walk it beyond the suite lines above.

Verdict: Approve f0793beb3f87718be3fb30fec0f125849da6332d
