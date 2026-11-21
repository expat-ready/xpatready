# qa capability R1.14: backups with a tested restore, 21 Nov (cloud qa lane)

Main: **2821fb787**. Asked by Lead 15 (local_17a286ef), 15:4x IST. Opus 5.5, medium. Live AI off, US$0. No AWS access from this lane (P-551): the cloud drill was run by the AWS proof side session the Lead drives (P-782 (5)); qa reads its record and re-runs everything that runs on GitHub.

## Verdict: **Works**. Open findings are Minor only (QA-656, QA-657); QA-655 closed in this PR
Done when: "Point-in-time restore and a ca-west-1 copy on (read from the account); one drill restores a named moment into a fresh database within 4 h with at most 15 min lost, times recorded".
Parts: PF-8r (#2014), PF-8a (#2638), PF-8rc (#2725), all merged.

| Evidence | Result |
|---|---|
| nightly **44893988642** dispatched by qa on main 2821fb787, job restore-drill **136815605085** | `check_pf8r_restore.ts` **10/10**: the drill passes on main, restore 21 s (Sample bound 5 min), and the fail cases (rows deleted, an unapplied migration, a dropped index and firm-wall policy) each fail and name the problem. The audit step is skipped and says so in words |
| deploy-synth **44887503333**, job 136795902382 (#2748's head 94605d526; `studio/deploy/` is identical to main 2821fb787's, 0 files differ) | CDK suite **93/93**: 28 PF-8rc lines (daily plan over the database and 3 buckets, kept 35 days, copied to ca-west-1 only; 4 vaults with their own keys, a 35-day governance lock and the deny policy; no role can bypass; old versions expire after 35 days) and the PF-8a lines (35-day backups, encrypted, private, region pinned) |
| qa re-run of `npm test` in `deploy/cdk` on main 2821fb787 | 93/93 |
| Gate A part 1, founder's AWS account (#2638 comment 06:34Z) | PITR on: automated backups **active**, retention 35, restore window open, ca-central-1 only (27 tagged resources; none in the 16 other regions) |
| Gate A part 2 (#2638 comment 08:05Z, which replaces 07:41Z) | ca-west-1 copy on, read from the account: plan `xr-staging-daily` copies to the locked `xr-staging-copy` vault in ca-west-1, and an on-demand backup was copied there (07:52:32Z to 07:56:04Z). **Drill:** the named point 07:08:41Z was restored into a fresh instance between 07:23:41Z and 07:37:46Z, **845 s** (≤ 4 h). Data-loss bound: LatestRestorableTime trailed the clock by **≤ 4 min 21 s** (≤ 15 min). An S3 version restore matched by sha256. The drill instance was deleted |
| Fresh Opus reader (ran nothing, P-303) | Works if the nightly restore drill is green (it is), with six Minor findings (`2026-11-21-r132-r114-qa/reader-verdict-R1.14.md`) |

## Clauses
1. **PITR on (read from the account): met** (part 1).
2. **ca-west-1 copy on (read from the account): met** (part 2: plan, vault, a completed copy job).
3. **A named moment restored into a fresh database within 4 h: met** (845 s).
4. **At most 15 min lost: met by AWS's restorable-time lag** (≤ 4 min 21 s), not by PF-8r's marker row (QA-657).
5. **Times recorded: met**: #2638 comment 08:05Z, and now in the repository as `qa/evidence/2026-11-21-R1.14-drill.txt` (Lead 15's transcription of the CloudShell output, ids redacted; it closes QA-655).

**Judgment (qa's, with the reader):** PF-8rc's own extra items (the evidence file, the quarterly reminder, PF-8r's checks on the cloud copy) are not R1.14's Done when, so they are logged as Minor rather than holding the row. The reader would rather the evidence file were committed before the row is called proven. qa scores Works because GitHub holds the times, and QA-655 tracks the file.

## Bugs
* **QA-655** (Gap · Minor): opened and closed in this PR. The drill evidence is committed at Lead 15's ruling. Still open as a note: RUNBOOK-restore.md says the drill has not run.
* New **QA-656** (Gap · Minor): no quarterly restore-drill reminder; it needs a BACKLOG row (PF-8rc's Done when, NFR5-04).
* New **QA-657** (Gap · Minor): the cloud restore was timed to "available", not checked by PF-8r; no restore from the ca-west-1 copy.
* 0 Blocker · 0 Critical · 0 Major · 2 Minor open (QA-656, QA-657; Lead 15 adds their BACKLOG rows).

## Not tested / limits
* qa cannot reach AWS: gate A rests on the Lead-posted read-backs. The raw files are in the Lead's notes folder, not readable here.
* The drill ran on staging with Sample-sized data. Production does not exist yet; the RTO says nothing about real volumes.
* "Root cannot bypass the lock" was not tested. The governance mode is a decided limit (P-566 (3)).
* `trace-requirements.py --brief 14` answers "no Release 1 row 14 in BACKLOG.md" (also for R1.10): the brief tool cannot find Release 1 rows.

## Questions for the Lead
None blocking. MVP-CHECKLIST row 14 (your file): "qa R1.14 Works (21 Nov, main 2821fb787): nightly 44893988642 restore drill 10/10, CDK 93/93 (deploy-synth 44887503333), AWS drill PASS (#2638); QA-655..657 Minor".

## Suggestions
* *Later · Capability:* repeat the drill on production before the first customer, with PF-8r's checks on the restored copy and a restore from the ca-west-1 copy (QA-657).
* *Later · Scaffolding:* fix `trace-requirements.py --brief` for Release 1 rows (P-604 cannot be followed as written).
