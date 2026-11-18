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
