# AUD-1c part 1 review: the audit hash chain (R1.97, branch `claude/runtime-aud1c-chain`)

Reviewer: independent Opus 5.5. I did not build this. Commit reviewed: **26af1802f6826d7ae061fc23ec052a61d6a753cd**. The diff is `git diff origin/main..26af1802f` (merge base = `origin/main` 15c75cd52): 5 files, +559/−3, under P-610's 800.
Read against: Build Lead C's brief `build-lead-c-briefs/AUD-1c-1.md` (it wins), the draft `design/briefs/AUD-1c.md` (the points the release Lead confirms, and Part 1), AUD-1a's migration, `demo.ts` `wipe`/`sweepOrphans` (read only), `api/src/platform/MODULE.md`.
This row has no screen. The browser walk, the journey score, D1–D20 and the BIC table are N/A (caller's instruction). I reviewed the code, the migration and the tests only.
**The head moved during this review.** e6f883db9 (the breaker's fixes and `break-report.md`) was committed in this clone at 14:01 UTC. I have not reviewed it. A re-review reads only that commit (P-277).

## What I ran (my own copies on :4617–4619 and scratch databases, never :4400)
* `tsx studio/tests/check_aud1c_chain.ts 4617 xr_studio_rev_aud1c` on 26af1802f: **30 passed, 0 failed** (26 s).
* Other suites:
  * On 26af1802f:
    * `check_aud1a_insert_only` 41/41 (fresh copy)
    * `check_pf0p_ports` 120/120
    * `check_case_feed` 39/39
    * `check_pf14_jobs` 92/92
    * `check_pf23_observability` 99/100. The one fail is the PF-23r case, which needs the configured sample. Here that load stops on child-process errors: PyMuPDF and pypdf are not installed in this clone. That is the environment, not this row.
  * Copies migrated from e6f883db9's tree, so they are not evidence for 26af1802f:
    * `check_s7_reset` 4/4
    * `check_d1_reset_to_six`: setup fails with "IMM 0008 is not in the library". The forms library is not in this clone (environment).
  * Every chain on these copies was recomputed with `canonical.ts`: all intact.
* Tools:
  * `typecheck.mjs`: no new errors (15 known)
  * `check-port-contracts.mjs`: 0 problems
  * `prisma validate`: ok
  * `module-cards.py tree`: the platform card passes; the run fails only on `front-office/MODULE.md` (42 lines), which this diff does not touch.
* **Canonical form, SQL against TS** (`aud_event_canonical` on a populated record against `canonical()`, and `jsonbText(pg out) == pg out`): 27 sources, **0 mismatches**. They covered:
  * `1e400`, `1e-400`, `123.4560e2`, `0e-5`, `-0e-2`, `100e-1` and 30-digit decimals
  * keys of the same byte length where UTF-16 and UTF-8 order differ (`"！x"` vs `"😀"`), empty and space keys, `Ǆ/ǅ/ǆ`
  * `\u001f \u007f   \u0080`, upper-case `é`, surrogate pairs, `\/`
  * duplicate keys at depth, heavy whitespace, top-level scalars

  17 invalid sources (`01`, `+1`, `.5`, `NaN`, `\u0000`, lone surrogates, trailing commas…) are refused by both sides.
* **Concurrency** (as `xr_app`):
  * A multi-row `INSERT … SELECT`, a rolled-back savepoint, and a rolled-back transaction followed by an insert: seq 1..8 with no gap.
  * REPEATABLE READ and SERIALIZABLE with a stale head both fail closed on `audit_event_chain_key_seq_key`, including an RR writer that waited 304 ms on an in-flight holder. READ COMMITTED waits, then links. Design choice (4) holds.
* **Mutations** (scratch copy of the three files, one at a time): 11 of 12 were caught.
  * Caught:
    * no advisory lock: DW1 dies on a duplicate seq
    * trigger named `aud_event_chain`: 12 fails
    * no `ENABLE TRIGGER`: 6
    * writer's seq kept
    * plain key sort in TS: 8
    * firm-first chain rule: 4, including "firm chains unchanged by the reset"
    * restart trigger dropped
    * back-fill ordered without `at`
    * `Number()` for numerics
    * a restart on a gone workspace
  * Survived: upper-case `\u00XX` hex in `quote()`. The code is right (my `\u001f` case matches PostgreSQL), but the vector has no control character with a hex letter (minor 4).

## The checks the caller asked for
* **Back-fill and trigger switching.** `aud_event_no_change` is disabled for exactly two UPDATEs and enabled before NOT NULL. This is atomic: Prisma's multi-statement script is one implicit transaction. DW3 asserts `tgenabled = 'O'` and an UPDATE still refused (owner and app). Order is per chain `(at, id)`. The back-fill is correct.
* **Grants / SECURITY DEFINER.**
  * Both definers (`aud_event_zchain`, `aud_event_chain_restart`) are owned by `xr_wall_reader`, which has BYPASSRLS and is a member of `xr_studio` and `xr_data`: the existing PF-12/AUD-1a pattern.
  * `search_path` is pinned to `pg_catalog, public, pg_temp`. `xr_app` has no CREATE on `public`, and trigger functions cannot be called directly.
  * `aud_chain_key_of` is an invoker function, so its owner change is harmless.
* **Prisma.** The `@ignore` + `dbgenerated()` columns keep the client unchanged. No `SELECT *`/`row_to_json` of `audit_event` exists in `api/src`, and DW5's `migrate diff` is empty.
* **Design choices:**
  * **(2)** is sound. Without the "workspace exists" test, each sweep pass would write a new orphan restart line. See minor 3 for its record.
  * **(3)** follows the brief's rule literally. AUD-1b adds no back-fill, so firm lines written before AUD-1b stay on `platform`. That is acceptable: `firm_id` is in the hash, so it could never be back-filled anyway.
  * **(1):** see minor 2.

## Findings (ranked)
1. **Major — a demo write in flight during a reset leaves a broken `sample:` fragment** (migration.sql:103-117; the restart trigger takes no chain lock and the DELETE takes none either). I reproduced it on 26af1802f with a synthetic reset delete: a writer holds an uncommitted demo line while the delete runs. The chain left behind is `4: demo in flight (prev ≠ zero), 5: chain.restarted (prev ≠ zero)`: the "restart" line restarts nothing. In the real reset, the breaker shows the fragment surviving the orphan sweep (3 of 3 rounds: seq 78..89, 12..23, 14..25). Part 2's checker will then raise `audit.chain_integrity_failure` on a chain nobody touched, and SA-11 BR-2 makes a break an incident. DW4 ("its sample: chain restarts") does not hold under concurrent use.
   * Fix: take the chain lock and clear the chain before restarting.
   * Add a named DW4 case with a concurrent demo writer during the reset (pass and fail).
   * e6f883db9 claims this fix; it is not reviewed here.
2. minor — **design choice (1) is wider than its reason** (`aud_chain_key_of`, migration.sql:48). A line whose workspace does not exist goes to `sample:<ws>` even when its `firm_id` is a real firm's. The brief says "else the firm_id", and AUD-1a never lets the reset delete such a line. The builder's reason, "the lines AUD-1a lets the reset delete", covers only lines whose firm is null or a Sample firm. Match AUD-1a's delete rule exactly: gone AND (firm null or Sample firm) → `sample:`, else the firm. Or record the deviation in the PR. Reach is low: no writer on `main` uses a missing workspace id.
3. minor — **record design choice (2) in the PR body.** In the real reset, the `chain.restarted` line is written and then swept as an orphan, and the new demo chain starts with the reset's own line. The brief expected the restart line to stay. The real-reset assertion only checks `startsWith("1:")` (check_aud1c_chain.ts:228). Assert `1:reset`.
4. minor — **the shared vector lacks a control character with a hex letter** (canonical.ts:151). Add `\u001f` so a hex-case slip in `quote()` fails DW2 (mutation survivor above).
5. minor — **the canonical `at` drops the era and ±infinity** (migration.sql:38; breaker 4). For example, AD and BC dates print the same text. The brief fixed this format, so the remedy is a CHECK constraint on `at`, not a format change.
6. minor — **`jsonbText` recurses**: a deep `detail` (about 2,000 levels or more) that PostgreSQL stored and hashed cannot be recomputed in TS (breaker 3). Use an iterative parser, or a depth CHECK, before part 2's checker relies on it.
7. minor — **`tools/demo-dump.mjs:52`** (B120's "behaviour unchanged" dump) now dumps `entry_hash`/`prev_hash`. These cover random ids and `at`, so two identical loads will differ on every audit line. Add both to `ID_HASH_KEYS`. That file is outside the touch list, so it goes to the tech lead as a "Question for the tech lead" or a follow-up.
8. minor, for part 2 (not counted against this part):
   * `aud_chain_check` is `arwd` for `xr_app` (breaker 5).
   * Read lines `ORDER BY` the bigint column, never a `seq::text` alias. My first verifier did, and reported false breaks at seq 10. The test correctly uses `audit_event.seq`.
   * A later BEFORE INSERT trigger must sort before `aud_event_zchain` (breaker 7). Say so in the module card.
9. Not counted (accepted by the brief's confirmed point "the per-chain lock is held until commit"): the breaker's lock-wait measurements (Major 2 in break-report.md). Until AUD-1b, all firms share `platform`. A holder over 5 s makes `POST /demo/reset` return 500, fail-closed, because of Prisma's default interactive timeout in `demo.ts:545`. It is the Lead's call whether that needs a row.

## Could not check
* Full CI on this sha.
* `check_s7_reset` and `check_d1_reset_to_six` on 26af1802f itself: the clone's tree had moved, and a worktree copy could not reach the pg18 data directory.
* The configured-sample paths: PyMuPDF and the forms library are absent here.
* e6f883db9.

Verdict: Changes needed
1. Major — finding 1: the reset vs in-flight demo write fragment, with a named DW4 concurrency case.
2. minors 2–7 (fix or record in the PR); 8 goes to part 2.
