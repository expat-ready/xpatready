# qa capability read: R1.1, R1.13, R1.15 against the AWS staging proof (23 Nov ~12:3x IST)

**Asked by:** the tech lead (Lead 1), PR #3183 comment, 23 Nov 06:00Z: "a fresh Opus reader checks that report against each row's Done when, then record Works or name the missing evidence. A session's own Pass is not a verdict."
**Input:** `product/reports/aws-staging-proof-2026-11-22.md` on branch `aws/2026-11-22-staging-proof`, commit 61cd95852 (544 lines; the branch adds only the report). Line numbers (L) below refer to it.
**What ran:** the image was built in AWS CodeBuild from main 8f487df4b (build `dfcae20f-…`, image `sha256:75ae5322…688a`, task def `xrstagingAppTask7031B6E4:7`, 2 healthy tasks, L461-468, 23 Nov 05:36-05:40Z). Main's head 1e89856fc differs only in qa records, so the app tree is the same.
**Reader:** a fresh Opus 5.5 reader in its own context, read-only (P-339). Live AI off, US$0, no cloud call made by qa.

## Verdict: all three Partial, none Works

| Row | Verdict | Met on AWS | Missing (what closes it) |
|---|---|---|---|
| R1.1 | Partial (was Not built) | App in ca-central-1 from main's image (L461-468, L475, L484). Database in ca-central-1a, private, encrypted (L475, L479). Files in three ca-central-1 buckets (L478). Backup copy in ca-west-1 (L476). Log group read in ca-central-1 (L168, L493). | **The smoke against the cloud address.** Only single curls ran: `/api/health/live` 200, `/sign-in` 200, a 401, a 301 (L504-506); Sample firm addresses 404 (L522-524). Closes with a committed smoke run against the staging address on main's image, with its output. Also PF-8c (deploy from CI) is not merged (L486). The all-regions survey is quoted as one summary line (L473-481). |
| R1.13 | Partial | Logs kept 90 days in ca-central-1 (L168, L493). Alarm → SNS email: published 2, delivered 2, failed 0, to a confirmed subscription (L174-178). | **An app error reaching the alarm.** The alarm was forced with `set-alarm-state ALARM` (L175-176), which skips the error → metric filter → alarm path. **No search of the cloud log group** for the seeded Sample emails and names (the seed ran, L520-521). The on-call address is a placeholder alias (L33, L181; P-782, a founder item). |
| R1.15 | Partial | Ten Secrets Manager `valueFrom` entries under `xr/staging/*`, on task defs :4, :6, :7 (L186-190, L352, L496), with the stage KMS key (L195). Tasks reach RDS as `xr_app` with them (L197, L354, L509). Task env holds six non-secret names (L191-192, L498-499). | **Firms' own keys stored encrypted.** The report says itself "no store holds sealed values yet" (L201). Closes with a firm key saved through `SecretBoxPort` on staging and the stored row read back as ciphertext. No secret-value scan of the image or the log group. A missing secret stopping start-up is shown in code only (pf24); the AWS quote at L367 is cut. |

## Evidence quality
* **Identifiers: good.** The report gives the account, region, ARNs, task-def revisions, build ids, digests and UTC times.
* **Scripts and outputs: not on GitHub.** `~/r11-read.sh`, `~/p23.sh` and `~/d-proof.sh`, and their output files, live only in CloudShell. That is against P-557. Several quoted outputs are cut with "…".
* **No P-339 run id for any cloud half.** `deploy-synth` push run 45114853084 (headSha 8f487df4b, success) builds the CDK tree only. The AWS proof ran by hand. This also means QA-645's "synth runs only on pull requests" no longer holds.
* **The report's own counts disagree:** "9 metric filters" but 11 names are listed (L170-171); 9 alarms (L172, L494) but "7 alarms" in the stack summary (L481).
* **The report marks R1.15 "Pass"** (L184, L509, L541) while its own L201 leaves a Done-when clause open.

## Bugs
No new row. **QA-641** (no log driver, so the alarms read an empty group): staging shows app streams with 192 and 99 events in 10 minutes (L357, L493), so it looks refuted on AWS. qa re-tests it from the committed cdk tree before closing it.

## Questions for the Lead
1. Who runs the three closing proofs on AWS (a cloud smoke run; a real 5xx reaching ServerErrors → SNS with a log-group search for the Sample personal data; a sealed firm key read back as ciphertext), and can their scripts and outputs be committed to the aws branch (P-557)? Recommendation: the AWS session runs all three in one CloudShell pass with `tee` into `product/reports/aws-evidence/`, then qa reads them again.

## Suggestions
* *Needed for the proof · Scaffolding:* commit the CloudShell scripts (`r11-read.sh`, `p23.sh`, `d-proof.sh`) and their raw outputs next to the report, so a reader can check each line without the session.
