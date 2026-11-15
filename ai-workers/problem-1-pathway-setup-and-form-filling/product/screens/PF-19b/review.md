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
