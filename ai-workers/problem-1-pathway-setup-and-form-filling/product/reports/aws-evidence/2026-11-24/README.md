# AWS evidence, 24 Nov 2026 (read-only, US$0)

Copied by the tech lead (Lead 1, new account) from AWS CloudShell, ca-central-1, 24 Nov 2026 16:56-16:58 UTC (22:26-22:28 IST), after the founder signed in to the console in the Claude app's browser pane. Nothing was created, changed or fired in AWS: every command is a describe, list or get call. No new alarm run.

**How copied:** CloudShell `~/run25.sh` copied the earlier raw outputs and ran the fresh reads into `~/run25/`, wrote `SHA256SUMS`, packed `~/run25.tgz` (sha256 `b09fc3b65b537bf4d163b726c3613adf6b0bbbd1360c3f67103b4ed8c2e67e5a`), and printed it as base64. The text was read from the terminal, decoded on the Mac, and the bundle's sha256 matched CloudShell's; `shasum -a 256 -c SHA256SUMS` passes for all 13 files. The two scripts equal the committed `../r11-read.sh` (7d045274…) and `../alarm.sh` (c7233f44…).

| File | What it is | For |
|---|---|---|
| `15-r11-read.sh`, `15-r11-read-23nov.txt` | Step 15's read script and its raw output, 23 Nov (CloudShell `~/r11-read.txt`): stacks, databases and clusters per enabled region; every bucket's region; RDS zone, Multi-AZ, public, encrypted | R1.1 (3) |
| `16-p23.sh`, `16-p23-23nov.txt` | Step 16's read script and raw output, 23 Nov 05:41Z (CloudShell `~/p23-2026-11-23.txt`): log groups and retention, newest streams, alarms, secret names → store (names only, never values), plain env names, user pools | R1.1 (3), R1.13 (2), R1.15 |
| `20-04-regions.txt`, `20-13-all-regions.txt` | Step 20's region survey outputs, 24 Nov 04:00Z and 04:15Z (CloudShell `~/run24/`) | R1.1 (3) |
| `20-alarm.sh`, `20-30-alarm.txt` | Step 20's real-error alarm script and its raw output, 24 Nov 04:16-04:24Z: 38 × 503 and 114 × 401, OK → ALARM 04:22:34Z, action executed on the on-call topic, SNS published 1, delivered 1, failed 0 | R1.13 (1) |
| `41-r11-read-now.txt` | The same r11 read, fresh, 24 Nov 16:56Z: stacks only in ca-central-1 and ca-west-1 (the backup copy); 6 buckets, all in ca-central-1 or ca-west-1 | R1.1 (3) |
| `42-log-groups-now.txt` | Fresh: `/xr/staging/app` retention 90 days, ca-central-1 | R1.13 (2), R1.1 (3) |
| `43-subscription-now.txt` | Fresh: the on-call topic's one subscription, protocol email, confirmed (a subscription ARN, not PendingConfirmation); the address is left out on purpose | R1.13 (1) |
| `44-alarm-history-24nov.txt` | Fresh read of the alarm history, 24 Nov 04:15-04:40Z: OK → ALARM 04:22:34Z with the action executed, ALARM → OK 04:28:34Z with the action executed | R1.13 (1) |
| `45-sns-counts-24nov.txt` | Fresh: SNS on the on-call topic 04:15-04:45Z 24 Nov: published 2, delivered 2, failed 0 (the ALARM and the OK message) | R1.13 (1) |

Not verdicts: qa decides. Still owed for R1.13 (3): the founder's confirmation in his own words (asked 24 Nov ~22:3x IST; he will check his inbox). R1.1 (1) PF-8c and (2) the signed-in smoke, and R1.15's sealed store, are code parts, not reads.
