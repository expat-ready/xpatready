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
