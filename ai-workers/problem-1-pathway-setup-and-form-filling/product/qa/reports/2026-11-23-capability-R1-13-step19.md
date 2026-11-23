# qa capability re-read: R1.13 against AWS Step 19 (23 Nov ~12:2x IST)

**Asked by:** Lead 2: "re-read R1.13 only … Step 19 … Judge it independently (P-339); that session's results are not verdicts, and its stated limits count. R1.1 and R1.15 stay Partial."

**Input:**
* Step 19 of `product/reports/aws-staging-proof-2026-11-22.md`, on branch `aws/2026-11-22-staging-proof` at commit 29880fc95.
* The scripts and raw outputs it commits, under `product/reports/aws-evidence/` (`alarm.sh`, `scan_logs.py`, `2026-11-23/00-…`, `30-…`, `40-…`, `50-log-scan.txt`).

**What ran:**
* Task def :7, image `sha256:75ae532d…`, built by CodeBuild from main 8f487df4b (report Step 15).
* No studio/ change between 8f487df4b and main b81ed4b0e.
* The outputs were copied by hand from CloudShell. Their claimed SHA-256 match could not be checked independently.

**Reader:** a fresh Opus 5.5 reader in its own context, read-only, briefed on the Done when and the raw outputs, not on qa's earlier verdict (P-339). Live AI off, US$0, no cloud call by qa.

## Verdict: Partial (no Works)

| Clause | Result | Evidence (raw output) | Limits |
|---|---|---|---|
| One logger, structured lines, no personal data (fail case) | Met, with limits | `50-log-scan.txt:2-14`: 1,894 events in 21 streams; 0 hits for 4 seeded emails, 4 names, 3 licence numbers; "any email-shaped text 0". The whole group was searched (`scan_logs.py:21`, no time window), after scale-to-0 plus 60 s. The code half is pf23 100/100 with a passport canary. | The traffic carried no personal data (unsigned 401s and 503s), so this shows the seed and boot paths don't log it. It does not show redaction on case traffic. No passport number exists on staging. The "planted value" self-test (`scan_logs.py:33`) is a tautology. |
| An error reaches the alarm | **Met** | `alarm.sh:9`: 40 POSTs to `/api/platform/session/callback` answered 503 (`30-…:4-5`); no set-alarm-state anywhere in the script. Alarm history (`30-…:2,7,8`): OK → ALARM 06:32:34.126Z, then "Successfully executed action …xr-staging-on-call". SNS (`30-…:9-11`): published 1, delivered 1, failed 0. Filter `{ $.event = "request" && $.status >= 500 }`, rate alarm at 1.44 % (`observability.ts:37,104,113`). | The ServerErrors datapoints and the 503 log lines are not dumped; the chain rests on the alarm's own definition. The return to OK at 06:38:34Z is narrative only. |
| An alarm reaches a person | **Not met** | SNS delivered to a confirmed email subscription (1/1 here, 2/2 in Step 4). | It is the placeholder alias (P-782). Step 19 itself says: "delivered is SNS's count, not a person reading it". |
| Logs kept 90 days in Canada | Met | Step 4 R1.13-1 (`/xr/staging/app 90`, ca-central-1), re-read in Step 16; CDK `RetentionDays.THREE_MONTHS` (`observability.ts:69-73`). | — |

## P-339
* **Cloud half:** no GitHub-runner run exists, and none can (PF-8c, no deploy workflow on main). It meets the strongest substitute: a digest from a main commit whose app tree equals main's head, plus committed scripts and raw outputs, with no forced state.
* **Code half:** still no green pf23 / pf23m / pf23w / cdk pack on main's head on GitHub's runners. The latest recorded runs are ci 44290020058 (15c75cd52) and deploy-synth 44887503333. QA-645 stays.

## QA-641
Refuted on staging. 1,894 events arrived in 21 streams, and the alarm moved on app request lines, which reach the metric only through the log group. The finding was recorded only in R1.13's row; that row now says so.

## What makes R1.13 Works
1. P-782: the founder names the real on-call address, and a person confirms receiving one real-error alarm (time noted).
2. A CI run id on main's head for the pf23 / pf23m / pf23w / cdk pack (closes QA-645).
3. Advised: a real canary line logged through the app and found by the scan, instead of the tautological self-test; attach the ServerErrors datapoints for 06:2x-06:3x.

## Questions for the Lead
1. P-782 is the founder's: can the on-call address be named so that one confirmed alarm closes this clause? Recommendation: ask the founder once, with the AWS session ready to fire one more real 5xx burst.
