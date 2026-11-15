# PF-19b part 1 review: one sending path behind `MessagePort` (runtime, no screen)

Reviewer: Opus 5.5, fresh context (I did not build this). Commit **8064504e471d44b89b9665c69d813fd294aa8ba1**, branch `claude/great-keller-dkedpc`, PR #1824. Reviewed on 15 Nov 2026 against `git diff origin/main...8064504e4` (9 files, +605 −1, under P-610's 800) and brief `PF-19b.md` at 9446bd33a (part 1 only). Live AI off, US$0, no keys. Own copy `rv_pf19b` on :4491 (never :4400), stopped afterwards (database and files removed).
Scope: runtime only. There is no screen, so the 1024 px / 200 % walks, the BIC table and D8–D14 are N/A. Journey test: `journey-test-reviewer-2026-11-15.md`, score **8.5 / 10**.

**Note:** while I reviewed, the shared working tree picked up uncommitted edits from someone else. They touch `messages.ts`, `ports/messages.ts`, `demo-inbox.ts` and the suite, and they answer the breaker's M1, m1, m2, m3, m5 and m7. This review covers the commit only. Re-review reads the new commit (P-277).

## What I ran
* `tsx … studio/tests/check_pf19b_sending.ts` → **30 passed, 0 failed** (5 s). Neighbouring suites: `check_pf19a_messages_schema` 94/0, `check_pf23w_jobs_wired` 31/0, `check_features_registry` 27/0, `graph.mjs --check` G1/G2/G4/G5 = 0.
* `check_forms_qa53.ts 4491` on my copy → **39 passed, 1 failed** (B1 below).
* **Nest wiring, on the running copy:**
  * The app boots.
  * pg-boss has the queues `msg.send`, `msg.cap_alert` and `msg.outbox_sweep`, and the `msg.outbox_sweep` schedule (`* * * * *` UTC). So `onModuleInit` runs on the factory-made `Messages`, and the `PlatformJobs` injection resolves.
* **End to end:** I committed one send with no dispatch and aged it 5 minutes. The app's own sweep sent it through pg-boss (job 37 ms): `SENT`, one `SENT` event, and the counter at 1.
  * `GET /api/demo/platform-inbox` showed it with the firm's sender and Reply-To.
  * `<script>` in the text came back escaped in the layout.
  * `x-actor: user-P` → 403; a bad address → 400.
  * The API log has 0 lines with the address.
* **Concurrency probe** (scratch script on my copy's database):
  * 8 parallel sends with one key → 1 row, 7 `repeated`.
  * 6 parallel `deliver` of one row → 1 adapter call, 1 event.
  * 5 rows delivered in parallel with a trial firm at 49 → 1 sent, 4 held, counter exactly 50, alert jobs all under one key.
  * The row lock, counter lock and advisory lock hold.

## Brief rulings, checked
| Ruling | Result | Evidence |
|---|---|---|
| Rendered file through FilesPort at `msg/<firm>/outbox/<id>.json` before the row; worker re-hashes; mismatch → `FAILED` "content changed" | Met | `messages.ts:71-76`, `:101-104` (the worker recomputes SHA-256, it does not trust `.meta`); DW6 |
| Orphan-file choice stated in the PR | Met | PR body "How it works" (written first; FilesPort is not transactional) |
| Local adapter never writes `demo_message` | Met | `local.ts`; DW8 count unchanged |
| Demo inbox reads `msg_outbox`: 404 outside demo, 403 client | Met (see m1) | class-level DW0; HTTP 403/400 on :4491 |
| Cap: Sample 50 trial / 2,000 active; 51st held `QUEUED` "daily limit"; one alert per firm per day | Met | `messages.ts:110-114`, `:122`; DW5; race probe |
| Consent gate and suppression at send, in the caller's transaction; again in the worker | Met | `:69` (`allows(tx, …)`), `:105`; DW1, DW2 |
| Job run twice sends once; rollback never sends | Met | `:92-95` `FOR UPDATE` + state check; DW3, DW4; parallel probe |
| Firm A never carries firm B's sender or Reply-To | Met | `:54`, `:70`; DW7 and the contract |
| No PII in alerts, events, jobs or logs | Met | alert = rule, firm id, day; event detail = reason or provider; payload = ids; log grep 0 |

## Findings

### Blocker
* **B1. CI's QA-53 suite goes red: the new open read is not on its reviewed list.**
  * Where: `demo-inbox.ts:39-43` (`@OpenRead` on `api/demo/platform-inbox`), against `tests/check_forms_qa53.ts:53-55` (`OWN_GUARD`).
  * Run: `check_forms_qa53.ts 4491` fails. The marked list contains `"/api/demo/platform-inbox open"`, which neither `REVIEWED` nor `OWN_GUARD` has. `run-suites.sh` runs every `tests/check_*.ts`, so the shard is red, and the brief's "every other suite passes unchanged" fails.
  * Fix: add `"/api/demo/platform-inbox": "inbox"` to `OWN_GUARD`, so the suite also asks client 403 / bad address 400 / Bearer 403. Also extend its firm-workspace 404 line to this route.
  * Because that file is outside the touch list, ask in the PR, citing this run.
  * Fail test: the suite itself, which is red now.

### Major
* **M1. One firm's held backlog stops every other firm's crash recovery** (DW4 under load). I confirmed this on its own; the breaker reports it as M1 too.
  * Where: `messages.ts:129`. The sweep takes the 500 oldest `QUEUED` rows across all firms, held rows included.
  * Probe: 500 held rows of firm B, then one firm A row with no job. The sweep queued 500, all of them firm B's, and firm A's row was not among them. At 50 a day, B's backlog keeps A's lost message waiting for about 10 days.
  * Fix: sweep crash rows (`stateReason IS NULL`) apart from held rows, or give each firm a fair share. The uncommitted edit does the first.
  * Fail test: 510 held rows of B plus one aged, undispatched row of A; the next sweep sends A's row.

### Minor
* **m1. A client persona named by its persona name gets 200.**
  * Where: `demo-inbox.ts:21`. `x-actor: client` returns 200 on :4491, from both this inbox and `/api/demo/inbox`, because `actorOf` accepts persona names.
  * Fail test: `list(x, "client")` → 403.
* **m2. Two concurrency guards have no test.**
  * The advisory lock (`:51`) and both `FOR UPDATE` reads (`:94`, `:113`) are correct by my probe. Removing any of them fails no test: DW4 calls `deliver` twice in sequence.
  * Fail test: add the three parallel probes above (`Promise.all` same key ×8; `deliver` ×6; 5 rows at 49 of 50).
* **m3. DW8's name points to a suite that does not exist.**
  * Where: `check_pf19b_sending.ts:156` names `tests/check_c616_person_link*`, and there is no such file.
  * The brief's DW8 is "the demo inbox still shows the case side's link emails". Only "never writes `demo_message`" is proved.
  * Fix: name and run the real suites (`check_c616_privacy_browser.cjs`, `tests/qa/check_qa357_qa358_c616_words.cjs`, `check_qa359_resend_after_staff_readdress.cjs`) and paste their results in the PR.
* **m4. The adapter runs inside the database transaction, holding the row lock and the firm's counter lock** (`:115`).
  * Harmless for `local`. For part 2's SES, a commit that fails after the provider accepted the message means a second send on retry, and every send of a firm waits behind one network call.
  * Settle at-least-once vs at-most-once (provider idempotency token = outbox id, or a `SENDING` mark) before part 2.
  * Fail test: an adapter that succeeds, then a commit forced to fail → adapter called twice.
* **m5. Every non-`ACTIVE` status silently gets the trial cap** (`:111`). That includes `PAYMENT_HOLD`, `SECURITY_LOCK`, `ABANDONED` and `DELETED`, so a locked or deleted firm can still send 50 a day.
  * The brief names only trial and active. State the choice in the PR, or ask Lead B.
  * Fail test: a `SECURITY_LOCK` firm's send, compared with the ruling.
* **m6. A row whose adapter keeps failing is retried every hour by the sweep, with no limit and no `FAILED`** (`:126-133`). Not reachable with `local`; it matters for part 2.
* **m7. The breaker's M2 (marketing to an address under another person's consent)** is the PF-19a `ConsentPort` design: a consent holds no address. That is not this row's defect. I agree with the question to Lead B and with documenting it on `MessageSend.person`. The breaker's m2–m8 I either confirmed by reading or found consistent; m8 (no `SUPPRESSED`/`QUEUED` event kinds without a schema change) should be named in the PR.

## D scores (runtime; N/A where there is no UI)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | every part-1 ruling met (table); B1 and M1 open |
| D2 | 5 | one row per key under 8-way race; one send under 6-way race; exact counter |
| D5 | 3 | crash recovery starves across firms (M1) |
| D15 | 5 | send-to-SENT 37 ms |
| D16 | 3 | 30/0 with pass/fail pairs; QA-53 red (B1); locks untested (m2); DW8 misnamed (m3) |
| D18 | 4 | reasons on rows (`NO_CONSENT: MARKETING`, `SUPPRESSED: COMPLAINT`, `daily limit`); `consent_id` kept |
| D17, D20 | simulated only | no screen |

## Could not check
* CI on this head: every job was skipped (draft). I did not run `check_pf24_secrets` (it enumerates GET routes on its own copy).
* The demo reset with outbox rows.
* Part 2 (SES, bounces, unsubscribe) is out of scope.

**Verdict: Changes needed** (Block). Fix B1 and M1. The Minors can follow or go in the same commit.

## Re-review (1a016939b)
Diff-only (P-277): `git diff 8064504e4..1a016939b`. That is two commits: d3fc939ce (break-round fixes) and 1a016939b (review-round fixes). Code and tests: 5 files, +55 −17. Reviewed on 15 Nov 2026. Own copy `rv2_pf19b` on :4494 (never :4400), stopped afterwards, database and files removed. Mutation runs used a scratch copy of `studio/` at 1a016939b (files byte-identical to the commit), never the shared tree. US$0, no keys.
**Head moved:** the PR head is now d4cdc2064 (Lead B's `MessageRepeated` and address duty), pushed while this ran. It is **not covered** here and needs its own diff-only read.

### What I ran
* `check_pf19b_sending.ts` → **36 passed, 0 failed** (8 s).
* `check_forms_qa53.ts 4494 xr_studio_rv2_pf19b`, each run on a freshly started copy:
  * Runs 2 and 3: **40 passed, 0 failed**.
  * Run 1 stopped with `fetch failed` at `:125`, just after the firm-workspace copy on :4495 stopped. I could not reproduce it, and the step it hit was already there before this PR. Note: a rerun on a used database gives "setup: the demo loads — 409", by design.
* `check_c616_privacy.ts` 48/48. `graph.mjs --check`: G1/G2/G4/G5 = 0.
* **Mutations.** I reverted each fix in the scratch copy and ran the suite again:

| Reverted | Result |
|---|---|
| sweep back to one query (M1) | `break M1` FAIL |
| row `FOR UPDATE` | `review m2` 6 workers FAIL (6 × `sent`) |
| counter `FOR UPDATE` | `review m2` cap race FAIL |
| persona check (m1) | `break m1` FAIL |
| `msg/` attachment check | `break m3, m5, m7` FAIL |
| template subject >200 | `break m3, m5, m7` FAIL |
| advisory lock | the suite crashes with P2002 and exits 1 (red, but not through its named test) |
| job key back to `msg.send:<id>` | **all 36 still pass** |

### Earlier findings, checked
| Finding | Status | Evidence |
|---|---|---|
| B1 QA-53 route list | **Fixed** | `"/api/demo/platform-inbox": "inbox"` added to `OWN_GUARD`, so the probe asks client 403, bad address 400 and Bearer 403 (passes, "(4)" routes); firm-workspace 404 now covers both inboxes (`{"inbox":404,"platformInbox":404}`); the file outside the touch list is OK'd by Lead B (#1824, answer 5) |
| M1 crash rows starved | **Fixed for crash rows** (but see new M2) | `messages.ts:130-131` sweeps `stateReason IS NULL` apart from held; fail test `:166` fails on the old query |
| breaker m1 persona name | Fixed | `demo-inbox.ts:21` matches `id` or `persona`, as `actorOf` does; `:168` (`client`, `client-b` 403; `user-O` 200) |
| breaker m2 job key | Fixed for case (a), **no test** | `:84` `msg.send:<firm>:<id>`, so another firm's wrong dispatch no longer uses up the key. Case (b), a dispatch before commit, still uses it up; the doc says "after the commit" and the sweep now recovers it in about 3 minutes. The mutation passes 36/0 (m-a) |
| breaker m3 subject | Fixed | `ports/messages.ts:21` one line (C0 and DEL); `messages.ts:65` the same, plus ≤200 after filling; `:171` (CRLF and a 300-character value) |
| breaker m5 `msg/` attachments | Fixed | `:68`; FileKey is lower-case only with no `.`/`..` segment, so `msg/` cannot be dodged by case or `./` |
| breaker m7 firm first | Fixed | `:49-50` before `ensureMessagesFirm` and the lock; `:171` expects `MessageRefused` |
| my m2 lock tests | Fixed | `:177-187`; two of three locks fail their named test when removed (the advisory lock: see the table above) |
| my m3 DW8 wording | Fixed in the test name | It names `check_c616_privacy` and `check_forms_qa53` (both run green above). The PR body still has no results for them (m-c) |
| left for Lead B | Answered on #1824 (09:34) | breaker M2 → PF-19ad; my m5 → part 2; m4/m6/breaker m9 → part 2 `SENDING`; breaker m4/m6/m8 noted |

### New findings
* **M2 (Major): the new held pass has the same cross-firm starvation as M1.** One firm's held backlog stops every other firm's held rows from ever being released.
  * Where: `messages.ts:131`, second query. It takes the 500 oldest held rows across all firms.
  * Probe (scratch copy, real rows):
    * Firm B is on trial at 50/50, with 505 committed sends aged 30 minutes. After one sweep: 500 held, 5 crash rows.
    * Firm A is `ACTIVE` with room left, and has one row held "daily limit" (10 minutes old).
    * After 3 sweeps and then +1 h, +2 h and +3 h: A's row is still `QUEUED`. Every hour B's 500 older rows are re-queued and re-held.
    * A waits until B's backlog falls below 500, about 10 days at 50 a day.
  * The PR says "held rows retry hourly and go the next day". That is false for every firm but the one with the backlog.
  * Fix: release held rows only for firms that have room today (skip firms whose counter is at the cap), or a per-firm share (`ROW_NUMBER() OVER (PARTITION BY firm_id ORDER BY created_at) <= n`).
  * Fail test: the probe above. Expect A's held row `SENT` on the first hourly sweep while B's 500+ rows stay held.
* **m-a (Minor):** the job-key change (breaker m2) has no test. Fail test: `dispatch(firmA, [B's id])`, then `dispatch(B, [id])` → `SENT` without the sweep.
* **m-b (Minor):** with the advisory lock removed, the suite crashes on P2002 and never reports through its named test. Use `Promise.allSettled` so the named line fails.
* **m-c (Minor):** the PR body has not been updated for the two rounds. It needs the M1 sweep split and the results of `check_c616_privacy` and `check_forms_qa53`. Lead B (answer 5) also asks for an "Outside the touch list (approved)" section.
* Nit: the one-line check leaves C1 (`U+0080`–`U+009F`) and `U+2028`/`U+2029` through. This is harmless for a JSON field, but worth recalling when part 2 writes raw MIME.

### Scores changed
D5 3 → 3: crash recovery is fixed, but released held rows now starve across firms (M2). D16 3 → 4: QA-53 is green, the locks and fixes fail their named tests when removed, but the job key is untested. Journey test re-run on the diff: **8.5 / 10**, unchanged (journeys 5, 9 and 10 now held for crash rows, persona and CI; error recovery stays ½ because of M2). See the addendum in `journey-test-reviewer-2026-11-15.md`.

Fix M2 with its fail test. m-a to m-c can go in the same commit. Approval would be for that commit, read together with d4cdc2064.

Verdict: Changes needed
