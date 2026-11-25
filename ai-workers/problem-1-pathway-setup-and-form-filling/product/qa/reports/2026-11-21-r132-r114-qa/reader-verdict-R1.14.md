# Fresh reader verdict: R1.14 "Backups with a tested restore" (P-303)

21 Nov 2026 · fresh reader on Opus 5.5, never built this · read only (repo files on main, PR #2638 and #2725 on GitHub); ran nothing, no AWS access.

**Verdict: Works, conditional on the nightly run 44893988642 on main 2821fb787 ending with its restore-drill job (`check_pf8r_restore.ts`) green. If that job is red or does not run, Partial.** No open Major or Critical (no R1.14 or restore row in `qa/BUGS.md`; the findings below are all Minor).

## Done-when, clause by clause (CAPABILITIES row R1.14)

| Clause | Evidence | Judgement |
|---|---|---|
| Point-in-time restore on (read from the account) | PR #2638, 06:34Z (Lead 13): `describe-db-instances` retention 35, encrypted, not public, deletion protection on; `describe-db-instance-automated-backups` status active, retention 35, restore window open; 27 tagged resources in ca-central-1, 0 in 16 other regions. Code: PF-8a `estate.ts`, `estate.test.ts` | Met |
| ca-west-1 copy on (read from the account) | #2638, 08:05Z (Lead 14): plan `xr-staging-daily` (07:00 UTC, 35 days) over the RDS instance and 3 buckets, copy to vault `xr-staging-copy` in ca-west-1 kept 35 days; both vaults locked in governance mode with deny policies; an on-demand backup copied to ca-west-1 (07:52:32Z to 07:56:04Z), encrypted with the copy vault's own key. Code: `backup.ts`, `backup.test.ts` (28 PF-8rc tests, region guard, no bypass role) | Met |
| One drill restores a named moment into a fresh database within 4 h | #2638, 07:41Z and 08:05Z: named point 07:08:41Z (15 min before the start, as runbook §3 step 1 asks) restored into the new instance `xr-staging-drill-20261121`; start 07:23:41Z, available 07:37:46Z, 845 s | Met (RTO measured to "available", not to smoke on a switched service as runbook §4 defines it; 845 s against 4 h leaves ample headroom; see F3) |
| At most 15 min lost | LatestRestorableTime trailed the clock by 4 min 16 s at start, 4 min 21 s at end | Met by an accepted upper bound on PITR data loss; not the runbook §4 marker-row measure (F3) |
| Times recorded | All times in the 08:05Z comment on GitHub; raw output in the Lead's private group notes | Met on GitHub; not in the repo file PF-8rc names (F1) |

Pack: CDK suite 93/93 on GitHub's runner (deploy-synth 44887503333, job 136795902382) on #2748's head, whose `studio/deploy/` equals main 2821fb787's; the CDK app is self-contained (own `package.json`), so tree equality is a fair stand-in for main's head; qa's local rerun on main 93/93 agrees. The local drill on main: the nightly above (pending).

## Findings

| # | Type · severity | Finding | Blocks R1.14? |
|---|---|---|---|
| F1 | Gap · Minor (records, P-557) | No `prototype/studio/deploy/evidence/` on main; PF-8rc's Done-when asks for `deploy/evidence/restore-drill-<date>.md` (counts and timings only). The measurements survive on GitHub in #2638's comment, so nothing is lost, but the raw files sit in a "group notes folder local_…" which reads as a local folder: rule 10 wants private material in the founder's private GitHub home, never only local. Fix: commit `restore-drill-2026-11-21.md` from the 08:05Z comment (account number masked) and confirm where the raw files live. | No: the capability's "times recorded" is met on GitHub. PF-8rc itself is not complete until it lands. |
| F2 | Gap · Minor (scope) | No quarterly drill reminder through `JobPort` (none in `api/src` or `deploy/cdk`). #2725 held it as its question 2; no BACKLOG row carries it, so it can be lost. PF-14 (JobPort) is merged, so nothing blocks it except the on-call address. NFR5-04 calls the quarterly drill "a contractual deliverable". Fix: shape a runtime row now. | No: R1.14's Done-when names one drill, not the schedule. PF-8rc's own Done-when stays open. |
| F3 | Gap · Minor (test depth) | The cloud restore was not verified beyond "instance available": PF-8r's checks (migrate status and diff, row counts and id checksums, app smoke) and the marker-row RPO did not run on the restored copy (they need PF-8b's one-off task, runbook §3 step 4). So "tested" in the cloud means it came up, not that the data was checked. The tooling for those checks is proven locally every night (PF-8r) against a managed RDS PITR. Fix: rerun the drill with step 4 once PF-8b lands. | No: the Done-when does not name the checks, and the local drill covers the check logic. This is the weakest point of the proof. |
| F4 | Gap · Minor | No restore from the ca-west-1 copy was run. NFR5-04's RTO ≤ 4 h is "for region failure", and only an in-region PITR was timed. The runbook has the `start-restore-job --region ca-west-1` step. Fix: include a copy restore in the first quarterly drill. | No: the Done-when asks only that the copy is on. |
| F5 | Bug · Minor (docs) | `deploy/RUNBOOK-restore.md` line 3 and §3 still say the cloud drill is "not run yet" / "the plan, not run yet", and its PF-8rc paragraph says "synth only", although the plan is deployed and the drill passed on 21 Nov. | No. |
| F6 | Gap · Minor (note) | The drill ran on staging, because no production exists yet, on tiny Sample data. PF-8rc's wording is "production's database". 845 s is mostly provisioning time, so it says little about the RTO at production volume. Repeat it on production before the first customer. | No: the Done-when says "a fresh database". |

Not findings: the governance-mode lock can be lifted by root or an administrator in two steps (decided, P-566 (3); documented in `backup.ts` and runbook §3; the 08:05Z comment marks "root cannot bypass" as untested, correctly). Root with MFA ran the drill on staging under the Lead's ruling (P-551, P-782 (5)), and the drill instance was deleted afterwards.

## Why Works and not Partial

Every clause of R1.14's Done-when is shown from the founder's account, read back by an AWS proof side session the Lead drove (gate A for a platform row). The times are on GitHub, and the code and its 93 assertion tests are green. F1 to F6 are gaps against PF-8rc's wider row and against NFR5-04's later obligations. None of them is a defect in what R1.14 claims. I would not call it Proven while F1 is open, because committing the evidence file is a ten-minute job that rule 10 asks for. F2 and F3 need rows in BACKLOG so they are not lost.
