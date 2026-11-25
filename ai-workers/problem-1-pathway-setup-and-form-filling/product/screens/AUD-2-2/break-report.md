# AUD-2 part 2: break report, round 1

Head `2e20bdf93e17a3c89b1ac3f2c1f699816c105d02`, detached in the p3 copy. Isolated copy `p3brk` on :4641 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), started, restarted once and stopped. Scratch scripts in the session scratchpad (`brk/export.ts`, `anchors.ts`, `conc2.ts`, `s3.ts`) import the head's `daily-export.ts`, `verify.ts`, `fake.ts`, `s3-archive.ts`, `bind.ts` and `tests/fixtures/aud2-s3/fake-s3-lock.ts`, and run against the copy's database `xr_studio_p3brk`. The attacker in the anchor attempts is the owner (triggers disabled, every hash recomputed from the changed line to the head) and moves `aud_chain_check` to the new head as `xr_app` (`set local role xr_app`, which is allowed). Nothing was fixed.

## Findings

| # | Sev | Attempt | Expected | Actual | Where |
|---|---|---|---|---|---|
| M1 | Major | Put one extra object under `audit/<k>/anchors/` (a different day, seq 11, holding seq 10's recomputed hash) after the owner rewrote line 5 of a 10-line chain, recomputed the hashes and moved the check row. | The rewrite is still found. The archive holds the true anchor at seq 10. | **Not caught.** `latestAnchor` trusts the highest seq in a file *name*, then compares the `seq` and `entryHash` *inside* it. It never checks that name, `chainKey`, `file` and `fileSha256` agree, or that the anchor's hash is the last line of the file it names. Older anchors are never compared. The next day's export writes nothing for this chain (last = 11), so line 11, once written, is never exported. Anyone with the app's `s3:PutObject` (the same role that writes the exports) plus database owner can forge history. | daily-export.ts:96-100, 58; verify.ts:117-121 |
| M2 | Major | Demo route `POST archive/tamper {key:"audit/<A>/anchors/2099-01-01-999999.json", how:"replace"}` on a key that does not exist yet. | 409 (the route is there to show refusals). | **200 `{done:true}`**: the route writes any new key. Then `POST check` gives **500** on every pass: `JSON.parse` of "replaced (Sample)" throws in `latestAnchor`, the chain cannot be checked and there is no heartbeat. The export **silently** skips the chain from then on (`last=999999`, "nothing new"; scratch `export.ts` case 6 shows it is still skipped a day later, with new lines). On S3 the same planted object is locked for 7 years, so one bad object stops the chain's check and export for 7 years. On the fake it is lost on restart. | routes.ts:57; daily-export.ts:58, 100 |
| M3 | Major | Plant a data file `audit/<first chain>/<day>-1-999999.jsonl` (any writer with put, or the tamper route, for tomorrow's day). Then run the export. | That chain fails. Every other chain is still exported. The same rule as the checker's break M3. | `run()` throws "the line at seq 999999 … is not in the database". **0 of the 5 chains after it were exported.** `run()` has no try/catch around each chain, so one firm's bad state (planted, or newest lines removed between a file and its anchor) stops every firm whose key sorts after it, every day. | daily-export.ts:50, 59, 86 |
| M4 | Major | Recorded bucket with `lockless:true`. Run the export three times. | Every run fails (LockNotApplied): "never a silent unlocked object" (s3-archive.ts:8). | Run 1 fails on the file. Run 2 takes `ArchiveKeyExists` on the file and treats it as "resumed", then fails on the anchor. **Run 3 succeeds** (the anchor's `ArchiveKeyExists` is ignored). The file and the anchor are both left **unlocked**. The lock is only checked on the first put, and the export's ArchiveKeyExists paths never re-check it. A real lockless bucket may refuse the lock headers outright (the README marks this unverified). | s3-archive.ts:53-57; daily-export.ts:79-82, 88 |
| m1 | Minor | The file is written, then the anchor put fails at 23:59 UTC. The next run is at 00:01. | The resume finds the stopped file. | The resume only matches a file of **today's** date, so files `D-1-3` and `D+1-1-5` are both written. Lines 1-3 are exported twice, and `D-1-3` has no anchor. | daily-export.ts:59 |
| m2 | Minor | Two runs at once, one line written between their reads (scratch `conc2.ts`). | One file. | Files `1-4` and `1-5` and anchors 4 and 5 are all written. Lines 1-4 are exported twice. Nothing is lost (the next day starts at 6). | daily-export.ts:57-79 |
| m3 | Minor | The anchor's `entryHash` is read again from the database after the file put (and, on resume, up to a day later). | It is the hash of the file's last line. | It is the database value at that moment. A line rewritten in that window is anchored as forged while the file holds the original. | daily-export.ts:85-87 |
| m4 | Minor | Rewrite line 5 (anchor 10) or delete lines 8-10. | The range starts at the bad line. | Caught, but reported as `10-10` (`anchor`), not 5-10 or 8-10. The file in the archive that could pinpoint it is not read. | verify.ts:121 |
| m5 | Minor | One chain of 30,000 lines (the first export, or every restart on the fake). | It is streamed or bounded. | 19 MB and +158 MB RSS in 1.0 s. All rows are held in memory and joined into one string: at about 617 B per line, V8's ~512 M-character string limit is reached near 870 k lines, and the heap runs out well before that. The chain then fails on every run, and (M3) so do all chains after it. | daily-export.ts:66-77 |
| m6 | Minor | S3 adapter: concurrent conditional puts on real S3 can answer 409 `ConditionalRequestConflict`. A HEAD without a version id makes the delete go out with no `VersionId` (sent: confirmed). | The answer is typed. | 409 is not mapped (only 412), so the export fails instead of resuming. With no version id, a versioned bucket writes a delete marker and `remove()` says it succeeded. Both are unverified against a real bucket (README, P-821). | s3-archive.ts:53, 87 |

**Not caught, by design (noted, not scored):**
* Lines *after* the newest anchor can be deleted (13-14 of 14, anchor 10) or rewritten (12) and re-hashed, with the check row moved, and nothing is found. The next export then archives the shortened or forged chain (`11-12`).
* The export never checks the chain before it anchors it, including a chain that is already BROKEN. The same happens after every restart on the fake: post-restart exports re-anchored chains I had tampered with.

That is the one-day window the header describes ("changed after its export").

## What held
* **Anchor checks:**
  * An exported line rewritten (line 5 of 10, and line 3 with unexported 11-12 re-hashed too), with the check row moved as `xr_app`, is caught (`anchor`).
  * Exported newest lines deleted (8-10) with the check row moved are caught.
  * A forged anchor with the *same* seq under another day's name is still caught.
* **No false alarms:**
  * The anchor seq passed by 7 new lines.
  * A chain never exported.
  * After a server restart (the fake is empty: the next export re-exports from seq 1, and the check raised no `anchor` finding).
  * The demo reset: the `sample:` chain was restarted at seq 1, never exported, and no break followed.
  * `latestAnchor` returns null for `sample:` keys.
* **The export:**
  * A second run the same day writes nothing.
  * Across midnight, the files are `D-1-3` then `D+1-4-5`, contiguous.
  * Firm walls: A's file holds only A's chain and firm id.
  * A crash on the same day resumes to one file.
  * Pages are read in number order.
  * Keep-until is 7 years.
* **The demo routes:**
  * Replacing an existing object gives 409, and deleting one gives 423.
  * `x-actor` user-B or user-R gives 403; none or unknown gives 401.
* **The S3 adapter (recorded):**
  * Racing puts of one key: one is stored, the other gets `ArchiveKeyExists`.
  * A keep-until in the past or equal to now gives RangeError. 9999-12-31 is accepted; year 10000 and an invalid date are refused.
  * The odd keys are all refused: upper case, space, é, `..`, leading `/`, `%2f`, `//`, `+`, `.hidden`, over 400 characters.
  * A 200 MB body is put in 0.7 s.
  * A HEAD with no lock headers: the put fails closed (LockNotApplied), and deleting a locked version is refused (403).
* **The binding:**
  * `s3` with no bucket, or an empty one, throws at start; so do a bad bucket name, `us-east-1`, `" ca-central-1"`, a bad KMS key, `S3` and `" s3"`. An empty region falls back to ca-central-1.
  * In production with nothing set there is no archive (the export fails and is alarmed). An explicit `fake` in production also gives none.
  * The recorded client is refused in production and staging.

Breaker verdict: Changes 2e20bdf93e17a3c89b1ac3f2c1f699816c105d02

## Round 2 (b9922aa3)

Head `b9922aa38a44ed7fdb94ef86cc6046e5357fb84d`. Isolated copy `p3brk2` on :4642, started and stopped. The scratch scripts `r2.ts`, `r2b.ts` and `s3r2.ts` use the real `ledger`/`check`/`run`, the verifier, and the recorded S3 bucket, with the same owner and `xr_app` attacker as round 1.

**Round-1 Majors, re-run:**
* **M1 fixed:**
  * An anchor named seq 11 holding seq 10's forged hash is caught as `anchor`. Its range reads `11-10` (from after to): `toSeq: head ?? a.fromSeq`, verify.ts:121.
  * A second anchor for the same seq under another day's name is a finding.
* **M2 fixed.** The tamper route gives 409 on replace and 423 on delete of an archived key. A new key gives 404 (replace and delete). `../etc`, `AUDIT/X`, a bad `how` and `{}` give 400.
* **M3 fixed.** I put `junk.txt` under the first chain: only that chain failed (`not whole`), the chains after it were exported (`13-13`), and the checker marks it BROKEN.
* **M4 fixed.** Lockless recorded bucket, three runs:
  * Run 1 fails with LockNotApplied.
  * Runs 2 and 3 fail with "not kept until a future date". Nothing is reported as exported.

**New or remaining:**

| # | Sev | Attempt | Expected | Actual | Where |
|---|---|---|---|---|---|
| R1 | Major | Count archive reads per pass for one chain with 120 daily exports (fake), and S3 requests per `get` (recorded bucket). | A 30-minute pass costs about the same in year 7 as in week 1. | Each incremental pass reads **every** anchor: 120 gets for 120 anchors, 240 on a full pass. Each S3 `get` is 2 requests (`ListObjectVersions` + `GetObject`), a put is 3, and `chains()` lists every version under `audit/` on each pass. After 7 years that is about 5,100 sequential S3 requests per chain per pass, inside the checker's 120 s transaction (verify.ts:66). At 15-25 ms per request (my estimate, not measured), that is 77-128 s per chain: chains time out, the pass throws, and there is no heartbeat. At 1 year with 100 firms it is about 18 min per 30-minute pass, and roughly 1.7 M LIST-class requests a day. The daily export pays the same per chain, inside a 10-minute transaction (daily-export.ts:78-81). | daily-export.ts:89-121, s3-archive.ts versionsOf |
| R2 | Minor | Forged whole pair: owner rewrites exported line 5 and recomputes to 12, moves the check row as `xr_app`, and puts a valid `<day>-11-12.jsonl` plus its anchor 12 (digest and hash right). | Caught on every pass. | **The incremental pass misses it**; the weekly full pass catches it (`anchor` 11-12). This leaves up to 7 days undetected. `ledger(k,false)` already fetches every anchor, so comparing them all with the database would cost only database reads. | daily-export.ts:174, verify.ts:120 |
| R3 | Minor | S3-only attacker (no database access) puts a crafted pending `11-12.jsonl` whose lines verify from anchor 10's hash. | The export compares a resumed file with the database. | It is **resumed and anchored** (`resumed:true`, failed 0), so crafted content is archived under lock. The checker then raises `anchor` 12-12, and every later export of that chain is refused (`does not verify from seq 13`). Detected, but it cannot be undone for 7 years. Any stray object under a chain's prefix does the same (`not whole`), with no recovery path. | daily-export.ts:129-134, 96 |
| R4 | Minor | Round 1's "not caught" cases, re-run: delete unexported 13-14, or rewrite unexported 12 **and recompute its hashes**, plus move the check row. | The claim (daily-export.ts:14-16): "a chain altered after its anchor is never archived as if it were whole". | **Still not caught**, on incremental or full passes. The next export archives `11-12` and `11-14` (the forged one). Only a rewrite *without* recomputing is refused (e'), and the round-1 checker already found that. The window is inherent; the header comment overstates the guarantee. | daily-export.ts:14-16, 144-145 |

**What held in round 2:**
* No false alarm on an anchor seq passed by 7 new lines, on a chain never exported, or on the demo export and check (full and incremental, 0 breaks).
* A pending file with no anchor does not alarm.
* The routes keep their actor rules.
* `get` reads a key's first version, so a later version or a delete marker cannot hide the original.

Breaker verdict: Changes b9922aa38a44ed7fdb94ef86cc6046e5357fb84d

## Round 3 (36b7787f)

Head `36b7787f312a238838bf6a2303d0ad9e91d44b7d`. Isolated copy `p3brk3` on :4643, started and stopped. I re-ran `r2b.ts` and `s3r2.ts`. The new `r3cost.ts` builds one chain with 120 daily exports on the recorded S3 bucket and counts requests on a fresh adapter (cold cache).

**R1 fixed (request counts, real code):**

| Step | S3 requests | Detail |
|---|---|---|
| 30-minute `check` | 2 | 1 `ListObjectVersions` + 1 `GetObject` |
| Weekly `check` | 129 | 1 listing + 120 anchors + 8 recent files |
| Daily `run` with 1 new line | 8 | |
| Verifier pass, 12 chains | 13 incremental, 142 full | |

The archive is read before the 120 s transaction (verify.ts:68-70), and `chains()` runs on the weekly pass only.

**R3 fixed.** An S3-only attacker's crafted pending file is refused ("is not the database's lines"). A real crash between the file and its anchor still resumes on S3 (`122-123`, `resumed:true`).

**No earlier Major is back:**
* M1: the anchor named 11 is caught on the 30-minute pass from names alone (`anchor 11-11`; range fixed). A duplicate anchor is still a finding.
* M3: junk under the first chain fails only that chain; the next exports `13-13`. M4: three lockless runs all fail. M2: the archive routes have left this head; only `check` remains.
* No false alarm on an anchor seq passed by new lines, a chain never exported, or a legitimate pending file. R2 is still caught only weekly (`anchor 11-12`). R4 is not caught, as accepted.

**Remaining (Minor, none blocking):**
* **m-a. Weekly pass may not finish at scale.** One request per anchor, sequential: 100 firms × 7 years is about 257k requests. At an assumed 20 ms each that is about 86 min, against the job runner's default 15-minute expiry (pgboss-jobs.ts:48; the weekly queue sets none, audit-chain.ts:29). At roughly 50 firm-years of archive the weekly pass, which R2 relies on, stops finishing. Owed: one timed weekly pass on the real bucket.
* **m-b. A crafted pending file blocks a chain silently.** It blocks that chain's export for the 7-year lock, and the checker raises nothing: `ledger` accepts a pending last file unread (daily-export.ts:113). Only the daily job's failure alarms.
* **m-c. The version cache never shrinks.** `first` (s3-archive.ts:39, 114) gains every key of every listing and is pruned only on `remove`. The weekly `chains()` puts every key in the bucket into it: about 511k entries at 100 firms × 7 years.
* **m-d. The recorded bucket never paginates `ListObjectVersions`** (always `IsTruncated=false`), so the adapter's `KeyMarker`/`VersionIdMarker` loop is untested.

Breaker verdict: Approve 36b7787f312a238838bf6a2303d0ad9e91d44b7d
