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
