# Review: AUD-2 part 2 (R1.97): the daily export to S3 Object Lock in ca-central-1 (round 1)

Reviewer (Opus 5.5, independent; did not build it). Head `2e20bdf93e17a3c89b1ac3f2c1f699816c105d02`, diff against `origin/claude/runtime-aud1c-verify`: 12 files, +593 −17. Part 2 (the checker) is reviewed separately.
Not a screen: concept fit, keyboard/zoom, D1-D20 and BIC-01..20 are N/A. The real bucket (AUD-2c) and a live put are owed under P-821, so they are not findings. Graph tool not run (it writes GRAPH.md).

## Runs (this head, /home/user/wt-p3)
* `check_aud2_archive.ts`: 33 passed, 0 failed. `check_aud1c_verify.ts`: 20 passed, 0 failed. `check-port-contracts.mjs`: 34 ports, 0 problems, exit 0.
* Probe (scratch database, own script, not committed): P1 a resume that crosses a day; P2 the newest anchor hidden; P3 a firm chain removed whole; P4 an anchor key created.
* Journey on isolated copy `aud22rv` :4436 (stopped after): `journey-test-reviewer-2026-11-25.md`, **6.9/10, Fail**.

## Major
1. **The fake answers a versionless DELETE with 403. S3 does not: it writes a delete marker.** `fake-s3-lock.ts:70-75` ignores `versionId` and refuses any DELETE of a locked object. The test then asserts it as S3's behaviour (`check_aud2_archive.ts:55`: "refused (403), whatever the adapter says"). The fixture's own `README.md:18` says the opposite.
   The consequence is real. After a delete marker, GET, HEAD and ListObjectsV2 no longer show the key. `latestAnchor` (`daily-export.ts:93-101`) then falls back to the previous anchor without a word.
   Probe P2: firm A's newest anchor (seq 6) hidden, lines 4-6 rewritten with recomputed hashes, `aud_chain_check` moved. Result: no finding (with the anchor visible it is `anchor 6`).
   The row's test "a deleted export file is reported by the checker as a missing anchor" is not built.
   **Fix:**
   * Make the fake answer a versionless DELETE with 204, `x-amz-delete-marker: true` and a 404 afterwards. Fix DW1 to match.
   * Let the port see a hidden object, for example list through ListObjectVersions, or `head` by version.
   * Have the checker report a hidden or missing anchor, or an anchor's missing `file`, as a finding.
   * Add a pass and a fail case.
   * Write "deny `s3:DeleteObject` without a version id to the app role" into the README as an AUD-2c requirement.
2. **A chain removed whole, together with its check row, is never checked, although its anchors are in the archive.** `verify.ts:59-60` takes its chain keys only from `audit_event ∪ aud_chain_check`.
   Probe P3: firm C's 3 lines and its check row deleted as the owner. The pass checks 1 chain, finds nothing for C, and `latestAnchor(C)` still exists. This is "newest lines removed" at its limit.
   **Fix:** add the archived chains (`list("audit/")`, chain segment) to the pass's keys. Then an archived chain with no lines is a finding. Add a pass and a fail case.
3. **A crash between the file and its anchor, resumed on a later day, writes a second, overlapping file.** `daily-export.ts:59` looks for the started file only under today's date.
   Probe P1: the anchor put fails all day on 26 Nov, then the 27 Nov run gives `2026-11-26-4-5.jsonl` and `2026-11-27-4-6.jsonl`. Lines 4-5 are now in two locked files for 7 years.
   The row asks for "a crash mid-export resumes without a duplicate file". DW6 resumes on the same day only. It takes 4 failed tries (`DEFAULT_RETRY`), for example an S3 outage at 06:20.
   **Fix:** match the started file on `fromSeq === last+1` whatever its day. Add a case where the crash is on day D and the resume on day D+1.
4. **The tamper route also creates objects, and one created anchor stops the chain check.** `routes.ts:57` calls `put` on any key. A "replace" on a key never written answers `{"done":true}` and writes "replaced (Sample)", kept a day (journey J8).
   `latestAnchor` then `JSON.parse`s it without validation (`daily-export.ts:100`). Every later pass fails for that chain: `POST …/check` gives 500 and there is no heartbeat until a restart (J8b, probe P4).
   Under an `audit/<k>/<today>-<from>-<to>.jsonl` name, the next export would also "resume" on those bytes and anchor them.
   **Fix:** have the route `get` first and answer 404 when the key is absent. Zod-parse the anchor, and report one that does not parse or names another chain as an `anchor` finding, not a failed pass.

## Minor
1. A bad key on the tamper route returns 500, not 400 in words (J6: `../X`). `ArchiveKey.parse` is unmapped (`routes.ts:55-59`).
2. The anchor's `entryHash` is read from the database after the file (`daily-export.ts:85-87`), not from the file's last line. On a resume, a rewrite made between the crash and the resume is anchored as if true. Take it from the bytes that are in hand.
3. The anchor put's `ArchiveKeyExists` is swallowed without comparing the stored anchor (`daily-export.ts:88`). Compare it, as the file path does at `:81`.
4. A large first export holds every line in memory and sends one PUT (`daily-export.ts:66-77`). S3's single-PUT limit is 5 GB, and pg-boss expires a job after 15 minutes, which starts a second runner. There is no per-chain lock, so new lines arriving between two runners give two overlapping files.
   Cap the lines per file (the key format already allows several files a day) and take a per-chain advisory lock. Otherwise say the limit in the card.
5. The head check compares to the millisecond (`s3-archive.ts:57`). The tamper route passes a date with milliseconds. If S3 returns whole seconds (the README lists this as unverified), the result is a false `LockNotApplied`. Truncate `retainUntil` to seconds before the put.
6. `get` recomputes the SHA-256 but never compares it with the stored `x-amz-meta-sha256` or with `ChecksumMode: "ENABLED"` (`s3-archive.ts:64-66`), so "get recomputes it" (`:10`) checks nothing. A retain-until that is not visible reads as 1970.
7. For the Lead (row design, not a build fault): "the newest anchor only" is defeated by anyone who can put to the bucket. A forged newer anchor hides a mismatch at an older one. The weekly full pass could check every anchor, or check that each file's first `prevHash` equals the previous anchor's `entryHash`.
8. `check-port-contracts --list` shows AuditArchivePort ×1 (S3 only): `fakeAuditArchive` is not recognised as a fake, although it does run the contract (`check_aud2_archive.ts:46`).
9. Cost: every 30-minute pass lists and reads anchors per chain from S3, about 365 more keys a year per chain. Fine for the MVP; say it in the card.

## Checked and sound
* **Put:**
  * `IfNoneMatch: "*"`, with 412 or `PreconditionFailed` mapped to `ArchiveKeyExists`.
  * `ObjectLockMode: COMPLIANCE` with `ObjectLockRetainUntilDate`.
  * `ChecksumSHA256` in base64, which also meets S3's checksum rule for Object Lock puts, plus the hex digest in metadata. Optional SSE-KMS.
  * A head after the put checks the mode and the date. A lost-response retry that gets 412 is accepted by the export only when the bytes are identical (`:81`).
* **Remove:** refused on the object's own date, then deleted by the exact `VersionId`.
* **Errors:** the error carries only its name and status, and no SDK text leaks.
* **Setup:** a region outside Canada is refused, as is a bucket name S3 does not serve on its own host. `list` follows its pages.
* **Fake honesty, apart from Major 1:** the requests are the real SDK's, and the README says what is unverified (precision, the delete code, a lockless bucket).
* **Export:**
  * one run per chain and day, the second the same day writes nothing;
  * pages read by `seq >` in `audit_event.seq` order, 12 lines read 2 at a time;
  * `sample:` chains skipped in both the export and the checker;
  * one chain per query, and each firm's file holds only its own lines (DW4);
  * the file re-verifies with no database;
  * keep-until is `ACTIVITY_LOG_YEARS` = 7 from AUD-5's table, the longest audit period (`our_staff_audit` 7).
* **Anchor check:** catches a re-hashed rewrite with the check row moved (DW8), and the newest exported line removed (DW8 fail). No false alarm for a chain never exported, a `sample:` chain, or a firm exported today (DW7, J7). An unreachable archive fails the pass (no heartbeat), never a silent pass.
* **Binding:**
  * production with no S3 gets `none`, and the export throws, so the job fails;
  * `PLATFORM_AUDIT_ARCHIVE=fake` in production also gets `none`;
  * the recorded client is refused outside local;
  * a missing bucket fails at start.
* **Demo routes:** 404 outside the demo workspace, the author duty (J3: 403 for the approver), and only digests and dates in the list, never bytes. Replace gives 409 and delete gives 423 (J4, J5).

## Could not check
A live bucket (P-821). Whether S3 keeps the retain-until milliseconds. The 404 outside the demo was read in the code, not run.

**Verdict: Block.** To fix: Majors 1-4. Minors 1-3 are cheap to fix in the same round.

## Round 2 (diff-only, b9922aa3)
* **Runs** (from `/home/user/wt-p3`): `check_aud2_archive.ts` 41/41; `check_aud1c_verify.ts` 20/20; `tsc` 15 errors, none in our files.
* **Mutations:** each fix reverted, one at a time, in a scratch copy, then the new suite run.

**Round-1 Majors: all fixed.**
* M1: versions and delete markers in the fake; the adapter lists versions and reads the first. Old adapter: DW1 fails.
* M2: `verify.ts:62` adds `chains()`. Without it, DW10 fails.
* M3: the pending file is found on any day. Today-only fails DW6, DW7 and DW8.
* M4, by direct controller calls: 409 replace, 423 delete, 404 for an unwritten key (nothing written), 400 for `../X` and no key. No test.

**Breaker's Majors: fixed.** Each revert fails its case: extra anchors ignored (DW9), the verify skipped (DW9), both `locked()` calls removed (DW10), one chain's failure (the test throws).

**Minors:** m1 and m2 fixed (m2 at `daily-export.ts:152`). m3, m5 and m6 fixed in code but untested (each revert still gives 41/41).

### New Major
1. **The 30-minute pass reads every anchor of every chain from S3, inside the chain's 120 s transaction, and gains one anchor a day for 7 years.**
   * `verify.ts:120` calls `check(k, false)`, whose `ledger()` gets every anchor (`daily-export.ts:106`). On S3 each `get` is a ListObjectVersions plus a GetObject (`s3-archive.ts:68-71`). `chains()` (`verify.ts:62`) also lists every version in the archive.
   * Measured (recorded bucket, one chain, one export a day): 4, 62 and 242 requests a pass after 1, 30 and 120 days. That is 2N+2, about 5,100 by year 7.
   * At 50 firms in year 3: about 110,000 serial requests a pass (close to 30 minutes at 15 ms each, about 33 s per chain), about 5 million a day, half LIST-priced (about US$400 a month). Older anchors are locked first versions: reading them again finds nothing new.
   * **Fix:**
     * Every pass and the export: the ledger's shape from key names only, plus the newest anchor (version ids from that one listing).
     * The weekly pass only: every anchor, every file, and `chains()`.
     * A test that counts the requests per pass.

### Minor
1. **No failing case:** the full pass's file re-verify (`daily-export.ts:110-115`; switched off, 41/41), m3, m5, m6, and the route's 404/400.
2. The fake's ListObjectVersions never truncates, so `s3-archive.ts:100-105` paging is not exercised.
3. The ledger needs files from seq 1 forever, so a 7-year lifecycle expiry or a database rebuilt against a locked bucket breaks every chain. For AUD-2c, in the README: one bucket per environment and database, and no expiry rule.

**Journey re-score** (controller calls and the suite, not a browser): 9.4/10, Pass. J6 now 400, J8 404, P1-P3 fixed; error recovery, feedback and correct data at 1; J1b still ½.

**Verdict: Block.** To fix: new Major 1. Minor 1 is cheap in the same round.

## Round 3 (diff-only, 36b7787f)
* **Runs** (from `/home/user/wt-p3`): `check_aud2_archive.ts` 43/43; `check_aud1c_verify.ts` 20/20; `tsc` 15 errors, none in our files.
* **Method:** mutations and a probe in a scratch copy.

**Round-2 Major: fixed.**
* My round-2 probe again (recorded bucket, one chain, one export a day). After 1, 30 and 120 days:
  * the 30-minute pass makes 2, 2 and 2 requests (round 2: 242 at day 120);
  * the weekly pass makes 4, 40 and 130;
  * the daily export makes 7, 8 and 8.
* The old projection (about 110,000 requests a pass, about US$400 a month) no longer holds; the weekly pass grows by about one request per anchor.
* `check()` now runs before the chain's transaction (`verify.ts:68-70`), and `chains()` only weekly (`:62`).
* DW10 (R1) fails without the names-only skip, and with `chains()` on every pass. My probe's 30-minute pass still finds a rewrite of the newest anchored line with the check row moved.

**Breaker R3: fixed.** Without the database comparison (`daily-export.ts:147-149`), DW10 (R3) fails. **Round-2 Minor 3: fixed** in the README.

### Minor (none blocks)
1. **Untested in the suite:**
   * the 30-minute anchor choice: `lastAnchored` forced to the oldest file (`daily-export.ts:107`) still gives 43/43;
   * the weekly file re-verify (its off switch fails only on a read count);
   * the S3 first-version cache (off: 43/43);
   * m3, m5, m6 and version-list paging.

   A 30-minute case rewriting the newest anchored line would cover the first.
2. The first-version cache (`s3-archive.ts:39`) is never evicted; "60 s" applies only on read. The weekly `chains()` listing fills it with every key, about 500,000 at 100 firms by year 7. Bound it, or clear it after each read.
3. The README allows "a cheaper storage class". Glacier Flexible Retrieval or Deep Archive would make every weekly anchor read fail. Name the classes allowed: Standard-IA or Glacier Instant Retrieval.
4. `MODULE.rows/AUD-2-2.md:1` still names `latestAnchor` and the three demo routes, which have moved to J-97.
5. A chain deleted whole, with its check row, is now found only weekly (up to 7 days, accepted for cost). Say so in the card.

**Verdict: Approve.** No open Blocker or Major; journey score stands at 9.4/10 (the demo routes are now J-97's).
