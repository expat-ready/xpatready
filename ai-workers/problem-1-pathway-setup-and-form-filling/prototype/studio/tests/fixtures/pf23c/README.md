# PF-23c: the staging alarm's and log group's recorded answers (R1.13, j_13 W5-W6)

## Where these files come from

These six files are **byte-for-byte copies** of AWS reads. The tech lead copied them read-only from AWS CloudShell (ca-central-1) to branch `aws/2026-11-22-staging-proof`, commit `69b57dc9d5361e884cc6c99a37f249d03f95b298` (24 Nov 2026), folder `product/reports/aws-evidence/2026-11-24/`. That branch is not on main; that folder's README says how the files were copied.

qa 11 copied them from there on 24 Nov 2026. No AWS call was made for this copy (US$0).

`SHA256SUMS` holds these six files' lines from that folder's own `SHA256SUMS`, without changes. j_13 checks each file against those sums before it reads it.

## The files

| File | What it is | What j_13 reads |
|---|---|---|
| `20-alarm.sh`, `20-30-alarm.txt` | Step 20's real-error alarm script and its raw output, 24 Nov 04:16-04:24Z. Genuine 503 answers from `/api/platform/session/callback` (38 of them), plus 114 × 401. The alarm `xr-staging-5xx-rate` went OK → ALARM at 04:22:34Z, the action ran on `xr-staging-on-call`, and SNS counted published 1, delivered 1, failed 0. The script says "Never set-alarm-state" and calls no such command. | W5 |
| `43-subscription-now.txt` | A fresh read, 24 Nov 16:57Z. The on-call topic's one subscription: protocol email, confirmed (a subscription ARN, not `PendingConfirmation`). The address is left out on purpose. | W5 |
| `44-alarm-history-24nov.txt` | A fresh read of the alarm's history: OK → ALARM at 04:22:34Z with the action run, then ALARM → OK at 04:28:34Z with the action run. | W5 |
| `45-sns-counts-24nov.txt` | A fresh read of SNS on the on-call topic, 04:15-04:45Z: published 2, delivered 2, failed 0 (the ALARM message and the OK message). | W5 |
| `42-log-groups-now.txt` | A fresh read: the log group `/xr/staging/app`, kept 90 days, in ca-central-1. | W6 |

## Limits, plainly

* **"Delivered" is SNS's own count, not a person reading the email.** That the alarm reached a person is the founder's own confirmation. qa reads it from its DECISIONS row; j_13 does not check it.
* **The command that made the fresh reads is not committed.** The folder's README says `~/run25.sh` made the reads behind 42-45, but that script is not in the folder. The read lines themselves are in the outputs.
* **The account id and the ARNs are the staging account's.** They are not secrets, and they are already on the branch named above.
