# AUD-1c part 1 (audit hash chain): break report

Branch `claude/runtime-aud1c-chain` at `26af1802f`. No screen, so I worked on the database and the API only. I used a scratch database `brk_aud1c_s1` (every migration), a back-fill database `brk_aud1c_bf` (every migration before AUD-1c, then 200,000 lines, then AUD-1c's migration) and an isolated copy `brk_aud1c` on :4627. I dropped all three afterwards. I recomputed every chain with `api/src/platform/audit/canonical.ts` (`entryHash`), reading lines in the same way as `tests/check_aud1c_chain.ts` (`LINE_SQL`). Scope: BACKLOG row AUD-1c, part 1 only (columns, trigger, back-fill, reset restart, canonical form, `aud_chain_check` table). The checker, alerts and routes belong to part 2 and are not findings.

## Findings

**1. Major: a demo reset during demo writes leaves a broken chain fragment behind (3 of 3 rounds).**
- What I did: on the copy I loaded the demo. Three `xr_app` writers then inserted lines into the demo workspace with the id read before the reset. This is what an in-flight request does, because the workspace id is cached. The writers kept each transaction open for 150 ms, 40 ms and 0 ms. During this I ran `POST /api/demo/reset {"confirm":"RESET"}` (x-actor user-A) and kept writing for 400 ms after it returned.
- Expected: once a `sample:` chain is emptied, it either ends or starts again at seq 1 linked to zero (migration.sql:96-101, "simply ends").
- Actual: every round left `sample:<old workspace>` with 12 lines whose first seq is not 1 and whose prev_hash names a line that was deleted:
  - round 1: seq 78..89
  - round 2: seq 12..23
  - round 3: seq 14..25

  canonical.ts reports "seq 78 where 1 due". The fragment stays until the next reset's orphan sweep.
- Cause: neither the reset's `DELETE` nor the orphan sweep's `DELETE` takes the chain lock. A line that is inserted but not yet committed is invisible to the delete, so it survives. Its link points into the deleted lines, and later lines link to it. migration.sql:103-117 (`aud_event_chain_restart` checks `NOT EXISTS` without `pg_advisory_xact_lock`).
- Effect: part 2's checker will raise `audit.chain_integrity_failure` for a chain nobody tampered with.

**2. Major: one slow audited transaction stalls or fails every other audited write on the same chain. On main, one chain covers the whole demo workspace, and another covers every firm's platform lines.**
- The lock is held from the audit insert until commit (migration.sql:76, by design). Measurements, with one `xr_app` transaction holding a firm chain for 5 s and 20 writers across 3 firms writing 20 lines each:

  | | Lines | Max wait | p95 | p50 |
  |---|---|---|---|---|
  | Firm 1 (lock held) | 140 | 5,013 ms | 4,994 ms | 5 ms |
  | Firm 2 | 140 | 31 ms | 20 ms | 7 ms |
  | Firm 3 | 120 | 28 ms | 17 ms | 7 ms |

  Every chain verified.
- On main's writer path, all three firms wait: `AuditEventAdapter` puts the firm id only in `detail` (platform/audit/audit-event.ts:30-32), so every line lands on `platform`. Measured max wait per firm: 5,038 / 5,037 / 5,042 ms.
- Prisma's interactive transactions time out after 5 s by default (`demo.ts:545` sets no timeout). I held the demo chain for 7 s and then called `POST /api/demo/reset`. It returned **500 "Something went wrong"** after 7,029 ms and rolled back fully (the demo workspace was unchanged, which is fail-closed). With a 3 s holder the reset returned 201 after 3,296 ms.
- App transactions with audit lines inside are allowed 15-30 s (review-rounds.ts:37, library-changes.ts:368, case-prepare.ts:294). Whichever transaction writes its line first blocks the whole chain for the rest of its run.

**3. Minor: canonical.ts cannot recompute a line that PostgreSQL accepted and the trigger hashed (deep nesting).**
- Maximum array depth I measured: PostgreSQL `jsonb` 16,347, `jsonbText` 2,055 (recursive `value()`/`print()`, canonical.ts:47-89).
- Reproduction: as `xr_app`, insert three lines on one firm, the middle one with `detail` = 3,000 nested `{"c":…}`. The DB stores it (21,001 chars) and hashes it. `entryHash` throws `RangeError: Maximum call stack size exceeded` at seq 2, so the chain cannot be verified past that point.
- I found no API path that passes request JSON of that depth into `detail`, so this is Minor. It would become Major if one exists.

**4. Minor: the canonical `at` drops the era and the sign of infinity.**
- `to_char(… 'YYYY-…')` prints the same text for 2026-01-01 and 2026-01-01 BC, and returns NULL (`~`) for both `infinity` and `-infinity` (migration.sql:37).
- As the owner with `session_replication_role = replica`, I changed seq 6 to `'2026-01-01 00:00Z BC'` and flipped another line from `infinity` to `-infinity`. canonical.ts still reports `ok: true` in both cases, so both changes go undetected.
- `xr_app` can insert both kinds of value (BC date and infinity were accepted).

**5. Minor: the app role can write the checker's table.**
- `aud_chain_check` has `xr_data=arwd` (default privileges). As `xr_app`, `insert … ('x', 99)`, `update … set status='INTACT'` and `delete` all succeeded.
- Part 2 plans to verify "from the last verified seq", so whoever can write this table can move that starting point.

**6. Minor: back-fill cost.**
- 200,000 lines (50 firms, 101 MB) took **27.8 s** to migrate.
- `ALTER TABLE` holds ACCESS EXCLUSIVE on `audit_event` for that whole time, so every audited write waits.
- Each line is updated twice (migration.sql:56-68), and the table grew to 201 MB.
- All 50 chains then verified (5.3 s to recompute in TypeScript). The demo copies have about 63 lines, so the risk only applies to large data.

**7. Minor (latent): the hash is taken before any later-named BEFORE INSERT trigger runs.**
- PostgreSQL fires BEFORE INSERT triggers in name order, so a future trigger whose name sorts after `aud_event_zchain` runs after the hash is taken. Example: `audit_event_trim` sorts after because "audit" > "aud_".
- With such a trigger that trims `summary`, the stored line no longer matches its hash: `entry_hash` mismatch at seq 1. The chain breaks loudly; nothing goes undetected.
- DW3 pins the trigger order only right after this migration (check_aud1c_chain.ts:119-120), so a later migration's trigger would not be caught.

**Note (not counted):** a firm line written by `xr_app` to a workspace id that does not exist lands on `sample:<that id>`, not on the firm's chain. AUD-1a never lets it be deleted (non-Sample firm), so AUD-4, which reads by `firm_id`, will show a line that the firm's chain does not cover. This follows from the rule as written (migration.sql:48-53).

## What held
- **Owner tampering** (replica role, no re-chain): changing `summary` at seq 3, `entry_hash` at seq 4 or `at` shifted by years at seq 6, moving a seq, and deleting seq 2 are each reported at exactly that seq.
- **App role (`xr_app`):**
  - `SET session_replication_role` → permission denied.
  - `ALTER TABLE … DISABLE TRIGGER` → must be owner.
  - `UPDATE` → refused.
  - Forged `chain_key`/`seq`/`prev_hash`/`entry_hash` are replaced: the line landed on its own firm's chain at seq 3 and verified.
- **Insert forms:** `INSERT … SELECT` of 1,000 rows, two inserts in one statement through a CTE, a savepoint rolled back mid-transaction, and an aborted transaction gave 1,004 lines, gap-free and valid.
- **Isolation:** REPEATABLE READ and SERIALIZABLE with a stale head fail closed on `audit_event_chain_key_seq_key`. REPEATABLE READ where the insert is the first statement is fine.
- **Deadlock** (X updates the case row, then inserts its audit line; Y inserts its audit line, then updates the same case row): detected at **1,005 ms** (`deadlock_timeout` 1 s). X rolled back fully: neither its line nor its update remained (chain 2 lines, seq 1..2, Y's line second; case v = 100). The chain verified.
- **Canonical form, TypeScript vs SQL:** 20,000 random JSON documents gave 0 disagreements. They mixed number forms (exponents, `-0`, scale, 46-digit integers), `\u` escapes in upper and lower case, surrogate pairs, `\/`, controls, DEL, U+0085, U+2028, BOM, duplicate keys and non-ASCII keys. These edge cases also match: `1e131071`, `1e-16383`, `-0e-3`, `0.000e-5`, `1E+00001`, keys `constructor`/`__proto__`, 300-byte keys, and depths up to 2,000.
- **Hostile fields through the trigger:** 309 lines verified, including a 1,000,000-char summary, 300,000 × "é", `~`, `1:~`, empty text, a `+05:30` microsecond `at`, and 300 random lines.
- **Demo reset without concurrent writes:** every firm and platform chain kept every line and hash. With a 3 s holder the reset still returned 201, and all chains verified.
- **Out of scope (by design until part 2's anchor and AUD-2's write-once archive):** deleting the tail (seq 4-5 gone, still `ok`) and an owner rewriting a line and then re-chaining (`ok`) are not detectable from the chain alone.

## Round 2 (2793a882, after merging main 63f5cc91)

The isolated copy `aud1cbrk` ran on :4611 (database `xr_studio_aud1cbrk`). I restarted it twice with `PLATFORM_IDENTITY=local`, `PLATFORM_ENVIRONMENT=local` and `PLATFORM_SYSTEM_IDENTITY=local`, then stopped it, which dropped the database. On this copy I added a third firm that is not a Sample firm (`brk-three`, with an owner) and one of our staff (platform-owner). I recomputed every chain with `canonical.ts` (`entryHash`), using the test's `LINE_SQL`. `check_aud1c_chain.ts 4611 xr_studio_aud1cbrk` gave **33 passed, 0 failed**. While I was working, the branch moved to `d191a1e2`. That commit only renames the migration folder to `20261125113000_audit__aud1c_audit_chain`: `git diff -M` shows migration.sql with 0 lines changed, and canonical.ts and the test change only that name. So these results cover the SQL at both heads. Line numbers below are from the renamed file.

### Attack 1: main's new audit writers meeting the chain
- **REPEATABLE READ or SERIALIZABLE inserts.** I searched `api/src` for every `isolationLevel`, `set transaction isolation level`, `RepeatableRead` and `Serializable`. Ten places use REPEATABLE READ, and none of them inserts an audit line inside that snapshot:
  - AUD-4's CSV export (firm-read/service.ts:182-203) writes `audit.exported` in a separate `this.db.$transaction` (line 189). That transaction runs under READ COMMITTED, so it reads the chain head after the lock.
  - AUD-3's access-report export (access/report.ts:150-160) writes and reads back its line under READ COMMITTED. Its REPEATABLE READ snapshot (line 164) only reads.
  - The client-money reads (drafts.ts:186, tax/routes.ts:55, payments.ts:87/97, invoices.ts, parties.ts:106) and case-prepare.ts:212 only read.
  - Running live: 12 exports of the three firms ran at once with the writers below. Results: 10 × 200, 2 × 503 `EXPORTS_BUSY` (the queue cap of 2 running + 8 waiting, by design), and no unique `(chain_key, seq)` failure. No failure path to show.
- **Deleting or rewriting audit lines.** None of AUD-1b, AUD-1m, AUD-3, AUD-4, AUD-5, PF-11c, PF-21d or PF-18a deletes or rewrites a line. The only deletes are still `demo.ts:578` and the sweep at `demo.ts:616`.
  - PF-11c closure (closure.ts:116, 139) only reads lines and writes its `firm.closed` line last in its transaction.
  - PF-21d erasure registers no eraser on main. Its 120 s transaction (erasure/service.ts:193) writes no audit line.
  - pf5p3 (20261122000000) only reads audit_event in an `UPDATE … FROM`.
  - fo3a (20261119081500:48) inserts lines before AUD-1c, and the back-fill chains them.
- **Triggers and columns.** I listed the triggers on the copy: `aud_event_chain_restart`, `aud_event_fill`, `aud_event_no_change`, `aud_event_no_truncate` and `aud_event_zchain`. No migration since 18 Nov adds one.
  - AUD-3's migration 20261123030000 only replaces `aud_event_actor_type`. `aud_event_fill` (which fires before `zchain`) fills `actor_type`, and the canonical form covers it.
  - audit_event has 15 data columns plus the 4 chain columns. The canonical form covers all 15.
  - No new code runs `select *` or `to_jsonb(e)` on audit_event, so the `bigint`/`bytea` columns never reach JSON.
- **AUD-1b now fills firm_id.** Firm lines land on their own firm's chain (round 1 found every firm on `platform`). That part of Major 2 is gone on main.

### Attack 2: demo reset and Sample firms
- **Rule check.** I compared the two rules:
  - The chain rule (migration.sql:50-52) gives `sample:` when the workspace is the demo, or when it is gone and its firm is none or a Sample firm.
  - AUD-1a's delete rule (20261117124500:101-107) allows a delete only when the workspace is demo or gone, **and** its firm (or `detail.firmId`) is none or a Sample firm.
  - So every line the reset can delete sits on a `sample:` chain. A gone workspace's line could only come from a non-demo workspace if that workspace were deleted, and `aud_event_workspace_guard` refuses that.
  - The only new sweep is still `sweepOrphans`.
  - Sample firms' lines now carry their firm_id in `platform-audit`, so they are on the Sample firm's own chain. Neither delete path can reach them.
- **Real reset during writers (3 firms, platform, demo), 20 writers each:**
  - The reset returned 201 after 5,791 ms.
  - Every firm and platform chain kept its pre-run head (same seq, same hash).
  - The old `sample:` chain is gone with its workspace, and the new one starts at seq 1.
  - All 6 chains verify.
- **Minor (fails closed, no API path found): a line of a non-Sample firm in the demo workspace goes onto the demo's `sample:` chain, and the demo reset fails from then on.**
  - What I did: as `xr_app`, I inserted a demo-workspace line with `firm_id` = brk-three. It landed on `sample:<demo>` at seq 105, not on brk-three's own chain (which stood at seq 488). Then I called `POST /api/demo/reset`.
  - Expected: the line sits on brk-three's chain.
  - Actual: the reset answered **500** and left the demo workspace and all 105 lines unchanged, because AUD-1a refuses the delete. Every later reset fails the same way.
  - Effect: AUD-4 shows that line in brk-three's log, but brk-three's chain does not cover it.
  - The writer that could do this is AUD-1m's `firmId = caseFirm ?? scope ?? named` (audit-event.ts:116). Studio routes called with a firm's bearer answered 403, and demo cases belong only to the Sample firms (firms.ts:12). I found no route that writes such a line.

### Attack 3: concurrency with main's real routes
This used `PUT /api/platform/branding` (one firm line each) for sample-firm, sample-solo and brk-three. Our staff called `GET /api/system/register/holds`, which writes `cross_tenant.access` on `platform`. The demo chain got `POST /api/program-nodes` (x-actor user-A). A sampler read `pg_locks` every 10 ms for advisory locks in class 1096107075 that were not yet granted.

| Run | Requests | Max request (firm / platform / demo) | Most waiting at once | Longest chain-lock wait |
|---|---|---|---|---|
| 10 writers × 10 per firm and platform, 3 demo | 430, all 2xx | 686 / 272 / 498 ms | 4 | 33 ms |
| 20 writers × 10, plus 12 exports | 842 (2 × 503 by design) | 1,109 / 629 / 1,110 ms | 8 | 39 ms |
| 20 writers × 10, plus the demo reset | 831 | 1,208 / 573 / 853 ms | 8 | 24 ms |

Every run ended gap-free, with every chain verified and no head cut. Request time is bound by the API process, not by the chain lock. Major 2 still stands as accepted, but only for one slow transaction per chain. I found no new route that writes its line early and then runs long: closure writes its line last, and erasure writes none.

### Notes (not counted, outside part 1's list)
- PF-4s's `plat_system_audit` (20261122060000:67) is a second insert-only audit trail with no chain columns. After my runs it held 605 lines, one per `/api/system` call. R1.97 says "every audit line on a hash chain". Whether that covers this table is for the lead to decide.
- PF-11c's archive copy (closure.ts:139-141) reads lines through Prisma. The chain columns are `@ignore`, so the archive carries no seq or hashes, and the copy cannot be checked against the chain later (AUD-2 territory).

### What held
- No REPEATABLE READ or SERIALIZABLE audit insert on main, no audit delete or update outside the demo reset, no new trigger, and no column outside the canonical form.
- `aud_chain_key_of` and the restart run as `xr_wall_reader` (BYPASSRLS), so they see the Sample firms behind `platform_firm`'s forced RLS even inside a firm-scoped request. Under firm sessions, lines landed on the right chains.
- Exports, the reset and 4 chains written at once did not fork any chain or leave a gap. The round 1 Major 1 fix held under real in-flight demo writes: 15 answered 404 after the reset and 15 were created, and nothing was left behind.

Breaker verdict: Approve 2793a882a3c22f49018907956c231b34d3b73c86
