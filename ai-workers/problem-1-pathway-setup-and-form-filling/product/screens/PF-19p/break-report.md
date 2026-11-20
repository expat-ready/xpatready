# PF-19p break report: platform account messages

Breaker (Opus 5.5, effort high), 16 Nov. Head `a1b2794e828960f0961edeedd39d28f8c51024ef` (PR #1961), brief `lead-b-briefs/PF-19p.md` on `lead-b-front-office`.
Setup: scratch database `xr_studio_pf19pbreak_25961` on 127.0.0.1:54329. First main's migrations; then 8 old-shape FIRM outbox rows (keyed, unkeyed, QUEUED and SENT) and 6 `msg_event` rows; then this PR's migration; then PF-12's `20261116013000_pf12_firm_walls` from #1910. A second database applied everything in name order (PF-12 before PF-19p). TS probes under `studio/var/` used the real `Messages`, `MessagesMail`, `LocalMail`, `PlatformInbox`, `LocalFiles`, `fakeJobs` and a fake clock. No live AI, no live email, US$0. The databases, PF-12's five cluster roles and the probe files were removed afterwards. Product code unchanged.

## Findings

**F1 (Major): a platform row whose send throws is retried every minute, with nothing logged, and is never FAILED. Fifty such rows stop the sweep from ever delivering a newer row.**
* Code: `api/src/platform/messages/send/messages.ts:115` (`dispatch(null)`: `.catch(() => undefined)`) and `:198-200` (sweep: 50 oldest QUEUED platform rows, `.catch(() => "failed")`).
* Repro: an EMAIL adapter that throws for `stuck<n>@example.com`. Send 51 of those through `MessagesMail.send({ platformAccount: true, … })`. Then write one good row with `messages.send` and do not dispatch it (a crash). Advance the clock by `SWEEP_AFTER_MS` + 1 s, then run 5 one-minute sweeps.
* Result: 500 provider calls; 0 sent by the sweeps; the good row stays QUEUED (starved); all 51 stuck rows stay QUEUED; **0 log lines**.
* Why it matters:
  - `MessagesMail`'s "dispatch … failed; the sweep sends it" log (`send/mail.ts:45`) can never fire, because `dispatch(null)` swallows the error itself.
  - The firm path has pg-boss retries with backoff, a dead-letter list with the error, and an hourly sweep key. The platform path has none of these.
  - If the provider rejects every platform email (for example, an unverified From address or the SES sandbox in part 2), every sign-up silently gets no verification email. Nothing in logs or alerts shows it, and the provider is called 60 times an hour per row, forever. If a send succeeds and only the commit fails, the same email goes out again every minute.
* Today's `local` adapter never throws, so this is latent until an adapter can fail. The PR names "retried each minute" (plan item 1) but not the silence or the starvation.

**F2 (Minor): `platform.account_mail_from` is registered, but nothing reads a stored value.**
* Code: `send/messages.ts:105` passes `ACCOUNT_MAIL_FROM.default` (a code constant) to `render`. Settings are stored per firm only (`readSetting(db, firmId, key)`), and there is no platform-level value.
* So "From and Reply-To come from one platform setting" holds only as long as the Sample default is never changed. Changing it, by any path, does nothing. The change key `system/settings:manage` (`settings.ts:207`) exists nowhere else in the code.

**F3 (Minor): the PR's "whoever lands second" list for PF-12 leaves out the demo inbox.**
* Repro: with PF-12 applied, run as `xr_app` (Prisma `options: -c role=xr_app`):
  - `sendPlatform` → `new row violates row-level security policy for table "msg_outbox"` (the PR expects this);
  - `PlatformInbox.list` of an address holding a SENT platform row → 0 messages;
  - `sweep()` → 0, silently.
* The PR body lists `sendPlatform`, `deliverPlatform` and the sweep for `asBypass`, but not `demo-inbox.ts`. Without it, DW1's "shows in the demo inbox" breaks once PF-12 lands.

**F4 (Minor): nothing pins `audience` and `firm_id` after insert.**
* As the system role (raw SQL):
  - `update msg_outbox set firm_id = null, audience = 'PLATFORM_ACCOUNT'` on a firm's TRANSACTIONAL row with no person and no consent → **accepted**;
  - `update … set firm_id = '<firm A>', audience = 'FIRM'` on a platform sign-up row → **accepted**. The stranger's message then sits inside firm A's wall.
* Firm roles cannot do either (see Held). Before PF-19p the system role could already move a row between firms, so this is parity, but the brief asked about "updates that drop the firm".

## What held
* **Migration on existing rows:**
  - all 8 old rows became FIRM, all three constraints were validated, and the msg_event foreign keys were intact;
  - the migration took 14 ms;
  - applying in name order with PF-12 first also works;
  - `prisma migrate diff` against the schema shows no `msg_` drift (only drift already on main).
* **Firm roles behind PF-12:**
  - `xr_app` with firm A, with no firm, or with the all-zero id reads 0 PLATFORM_ACCOUNT rows (`audience = …` or `firm_id is null`); firm A still reads its own 4 rows;
  - insert of a platform row, update of its own row to platform, and a duplicate platform key all give 42501 (from the gate, before the unique check, so nothing leaks);
  - update, delete and claim of platform rows affect 0 rows;
  - `xr_staff_bypass` reads and writes them.
* **Raw SQL checks:**
  - refused with 23514: FIRM with no firm; PLATFORM_ACCOUNT with a firm; WHATSAPP; MARKETING (on update); a firm's or the platform's `template_version_id` (insert and update); a consent id; a null key; `audience = FIRM` with a null firm;
  - a NULL audience → 23502;
  - a duplicate platform key (insert and update) → 23505;
  - a `msg_event` for a platform row → 23503;
  - moving a firm row that has events → 23001.
* **Forged `platformAccount`:** refused through MailMessage, AnyMessageSend, MessagesMail, LocalMail, fakeMail, fakeMessages and `Messages.send`. Cases tried: `firmId: undefined` as a key, `platformAccount: "true"` or `1`, lower-case class, MARKETING or SERVICE, with a firm and a person, `attachments: []`, a person, a CRLF subject, and a prototype-inherited `platformAccount` with its own `firmId`. `MessageSend` alone refuses `platformAccount: true`.
* **Concurrency on one key** (8 at once):
  - READ COMMITTED → 1 row, 7 repeated;
  - REPEATABLE READ → 1 row, 7 `MessageRepeated` (the partial index name matches `/idempotency/`);
  - SERIALIZABLE → 1 row, P2034 retryable, the same as the firm path;
  - 8 parallel `MessagesMail.send` → 1 row, 1 id, 1 inbox entry;
  - 6 parallel `deliver(null, id)` → 1 provider call.
* **No crossing between firm and platform:**
  - the same key in firm A and among platform rows gives separate rows;
  - `dispatch(firmA, [platform id])` plus the job, and `dispatch(null, [firm id])` → both rows stay QUEUED, with 0 provider calls;
  - `deliverPlatform(firm id)` → skipped;
  - the firm part of the sweep excludes NULL firms.
* **Demo inbox:**
  - listed by the normalised address only (a near-miss address gives 0, another address gives 0);
  - the client persona is refused (403);
  - the file is read from the platform space.
* **Text:** a 200-character non-English subject and a 3 KB Arabic body pass. Refused: a 201-character subject, an empty body, a whitespace subject, an IDN address. A padded upper-case address is stored lower case and trimmed.
* **Unchanged suites pass:** `check_pf19p_platform_mail` 48/0, `check_pf19a_messages_schema` 94/0, `check_pf19b_sending` 42/0, `check_pf19b_mail` 29/0, `check_pf0p_ports` 113/0, `check_pf4b_session_reads` 55/0. `tsc -p api`: the first 12 errors are all in test files that already fail on main (c18, c69, cost_check, vv_checklist); the rest of the list was not read.

Verdict: Changes requested

## Re-break (diff a1b2794e8..8b82dfd2f)

Diff only (P-277): JobOptions firmId XOR `platform: true`, PLATFORM_JOB_QUEUES, the platform job path, try counting, the two BYPASS_USES rows; PF-12's own changes not re-broken. Probe (deleted) on scratch DB `xr_studio_pf19pbreak2_<pid>` (dropped; PF-12 roles kept): the real PgBossJobs with PlatformJobs' `handle` wrapper (withFirm / asJob), Messages and MessagesMail on a WalledPool as xr_app, a spying adapter; plus fakeJobs on a FakeClock.

**R1 Minor: a platform job picks its path from its payload, so it sends a firm's row as the system role.** `api/src/platform/messages/send/messages.ts:239` takes the firm path whenever `payload.platform !== true` and reads `payload.firmId`, even on a job with no firm. Reproduced: (a) `jobs.enqueue("messages.send", { firmId: A, outboxId: <A's QUEUED row> }, { key, platform: true })` is accepted (`queued: true`); the row is then SENT through the firm path under bypass use `job:messages.send` (audit line seen). (b) A hand-written pg-boss row `{ firmId: null, recurring: true, payload: { firmId: A, outboxId } }` on messages.send passes the runner (`pgboss-jobs.ts:284` lets any recurring envelope through without a firm) and does the same. Expected: a job with no firm never reaches the firm path (`ports/jobs.ts`: "never touches a firm's rows"). Reach: code or a hand-made row only. No cross-firm read: deliver filters on `firm_id = payload firm AND id`, and consent and the cap still apply. Fix shape: branch on `j.firmId === null`, not on the payload.

**R2 Minor: a try that fails before it is counted leaves the row QUEUED for good.** `deliverPlatform` counts a try only if its own `findFirst` / `updateMany` work (`messages.ts:182-184`). The sweep then re-queues under `platformJobKey(id, tries)` (`:233`), and that key is already used. Reproduced on fakeJobs, with the database refusing for one try (`$transaction` and `msgOutbox` reject): the job failed, `state_reason` stayed null, and 48 hourly sweeps queued 0 jobs. The row stayed QUEUED with no log line. On pg-boss a used key never queues again (checked: second `enqueue` of the same key gives `queued: false`), so the same happens once all 4 attempts of one job die this way (for example when xr_app's connections are refused while pg-boss's own pool works). The dead-letter list records the job. Expected (header comment): "the sweep queues a row a crash or a failed job left QUEUED". The firm path's hourly sweep key does not have this problem.

**R3 Minor (bounded): the sweep window can still hold back a due row.** The sweep reads the 2000 oldest-`updated_at` QUEUED rows before it filters by wait (`messages.ts:228`). Reproduced: 2100 rows at try 4, tried 10 minutes earlier (not yet due), plus one never-tried row that is due. The sweep queued 0 and skipped the due row. This clears by itself: the backlog falls due within 16 minutes and fails out at 50 a run. It needs more than 2000 stuck sign-up emails, and the sweep only matters when a dispatch was lost. F1's starvation and silence are otherwise fixed (see Held).

**Note, not a finding (ruled "outside"):** `platform.account.mail` with `outside: true` (`firm-scope.ts:108`) is also allowed inside a firm's job (`withFirm(A)`): MessagesMail writes an ExpatReady platform email there. The same goes for `asJob("messages.send")`. No caller does this today; sign-up's routes are requests.

**Held**
* JobOptions refuses `platform: false`, `"true"`, `1`, both (`firmId` plus `platform`), neither, and `firmId` with `platform: false`. A firm job with `platform: undefined` is accepted. Through the fake, `enqueue` and `schedule` on another queue refuse a platform job and use no key. Through PgBossJobs, `enqueue` and `schedule` on another queue, both, and `"true"` are all JobRefused.
* Hand-written pg-boss rows: a platform row on another queue (its handler never ran), and `platform: true` with firm A on messages.send, both go to retry with "a platform job on a queue not in PLATFORM_JOB_QUEUES, or naming a firm".
* Payloads naming the wrong row: a platform job with `{ platform: true, outboxId: <firm row> }` completes and the firm row stays QUEUED; a firm job with no payload `firmId`, or with payload `platform: true`, naming a platform row leaves it QUEUED (0 provider calls).
* Retries on pg-boss (3 retries) plus the sweep:
  - one job makes exactly 4 provider calls and ends "try 4 of 5" with 1 dead letter;
  - a sweep before the 16-minute wait queues 0; after it, two sweeps at once queue 1;
  - the 5th call ends the row FAILED "send failed", with one log line of ids;
  - a sweep of the FAILED row queues 0.
* A dispatch retry racing a sweep try, with the provider accepting the second call: SENT, 2 provider calls (1 refused, 1 accepted), no double send. Nothing ends FAILED early: 5 counted calls give FAILED.
* Bypass routes: `platform.account.mail` is refused on POST /api/platform/staff/invitations, GET /api/public/signup, /api/public/signupx, and in a firm's request with the firm set. It is allowed on POST /api/public/signup/verify/ (same route). `job:messages.send` is refused inside a request.
* PF-12 merge: msg_outbox has RLS and FORCE on, with policy `firm_id = platform_session_firm()`. xr_app reads and updates 0 platform rows as firm A, and on the sign-up route without the bypass. The demo inbox through the walled pool lists the platform email on GET (and HEAD/slash) /api/demo/platform-inbox, and gives BypassRefused on another route. The PF-19p migration touches no PF-12 function.
* `check_pf19p_platform_mail` at 8b82dfd2f: 65/0.

Verdict: Approve 8b82dfd2f1170990519b1daa6d701d1dd5a0b345

## Re-break (diff 8b82dfd2f..f0793beb3)

Scope: `messages.ts` only. The send handler now calls `deliver(j.firmId, …)`, and the platform sweep key ends `:sweep:<hour>`. Probe deleted, scratch DB `xr_studio_pf19pbreak3_<pid>` dropped, PF-12 roles kept. Same harness as before: the real PgBossJobs with PlatformJobs' wrapper, Messages on a WalledPool as xr_app, fakeJobs for the clock cases.

* **R1 fixed.** A `jobs.enqueue("messages.send", { firmId: A, outboxId: <A's row> }, { platform: true })` now leaves A's row QUEUED with 0 provider calls; it runs only the platform path, under `job:messages.send`. The hand-written recurring envelope naming A's row does the same: the job completes and the row stays QUEUED.
* **Firm sends still work.**
  - The dispatch-shaped firm job is SENT.
  - A firm job with no payload `firmId` and an upper-case envelope firm is SENT (it failed before).
  - Firm A's job naming firm B's row, or naming a platform row, sends nothing.
  - MessagesMail firm and platform sends through dispatch are both SENT. The firm send writes 1 SENT event, and the counter counts 3 for the 3 firm sends.
* **R2 fixed.**
  - One try lost before it was counted is re-queued by the next hour's sweep (`…:sweep:<hour>`) and SENT.
  - While the database keeps refusing, it gets one uncounted try an hour (7 jobs in 6 hours), stays QUEUED, and is SENT the hour after it comes back. The firm path behaves the same way.
  - Two sweeps in one hour queue 1 job; the next hour, a row still due queues 1 more. A second job for a row cannot send twice, because of the row lock and the QUEUED check (held in the earlier re-break, 4e).
* **R3:** accepted as bounded (coordinator); not re-tested.
* **Suites at f0793beb3:** `check_pf19p_platform_mail` 68/0, `check_pf19b_sending` 42/0, `check_pf19b_mail` 29/0.

Verdict: Approve f0793beb3f87718be3fb30fec0f125849da6332d
