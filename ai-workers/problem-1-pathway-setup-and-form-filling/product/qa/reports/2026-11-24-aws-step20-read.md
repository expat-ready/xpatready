# qa read of AWS staging Step 20: R1.65, R1.13, R1.1 (24 Nov)

**Asked by:** Lead 20, on #3380: "decide from it, as evidence to check, not a verdict (P-339, P-290)".
**Read:** `product/reports/aws-staging-proof-2026-11-22.md` Step 20 on branch aws/2026-11-22-staging-proof, commit 5bf324120. That run deployed main cc349dcfe.
**qa:** cloud copy, Opus 5.5 medium. No AWS access and no paid step, US$0. R1.15 was not exercised and is not judged here.

## Verdicts
| Row | Verdict | Exactly what is left |
|---|---|---|
| R1.65 | **Partial** | (1) Commit Step 20's raw outputs and the cross-firm script with their sha256. (2) Put the real bucket's recorded answers where j_65 W5 reads them (`tests/fixtures/pff1c/`), then get j_65 13/13 on GitHub's runners on main. |
| R1.13 | **Partial** | Commit Step 20's R1.13 raw outputs, and record the founder's confirmation in their own words where it can be read. No new run is needed. |
| R1.1 | **Partial** | (1) PF-8c, deploy from CI. (2) The smoke's signed-in step on the cloud address, which needs R1.5's sign-in chain. (3) Commit the survey output. |

## Why Step 20 alone does not decide
Step 20 says its results were "read off the CloudShell screen; the raw outputs are in CloudShell `~/run24/`, not yet in this repository". Step 19 set the bar: committed scripts plus raw outputs, each with its sha256 matching CloudShell's. Without that, every AWS answer in Step 20 is a transcription I cannot check (P-557). I checked what can be checked from here: main's code, the committed Step 19 evidence, and GitHub runs.

## What I checked myself
* **The deployed code matches the reported `cdk diff`** (main cc349dcfe):
  * `deploy/cdk/lib/estate.ts:87-118`: AccessLogsBucket, whose lines expire after ACCESS_LOG_DAYS; each bucket logs under its own prefix; `unfinished-uploads` is aborted after ABORT_UPLOAD_DAYS; there are two Deny statements, `DenyPutNotKms` and `DenyPutNoEncryption`.
  * `deploy/cdk/lib/service.ts:111-118`: the `PLATFORM_FILES_LINK_KEY` secret.
  * `service.ts:167`: the task's `PLATFORM_FILES=s3`, its bucket, KMS key and region.
  * `service.ts:180-182`: three task-role Allow statements: `*/*` objects, the bucket list, and the key through S3 only.
* **GitHub runs on main's code (P-339):**
  * deploy-synth **45320629064** on cc349dcfe itself: synth, then cdk assertion tests **123/123**. QA-645 is fixed: c52b96fa2 runs deploy-synth on every push to main.
  * ci **45313187590**, the merge batch of #3225, whose tree fa4ab6fd4 equals main bdcf1e7be's: `check_pf23_observability` **100/100**, `check_pf23m_log_calls` **15/15**, `check_pf23w_jobs_wired` **31/31**, and every shard green.
  * `git diff bdcf1e7be cc349dcfe -- prototype/` is empty, so no app or deploy file changed between them.
* **j_65 W5** reads `tests/fixtures/pff1c/get-bucket-{versioning,location,encryption}.xml`. That folder is not on main, so j_65 still stops at 12/13 whatever Step 20 showed.

## R1.65: private storage in Canada (Partial)
* **Consistent with the code** (reported, not checkable): AES256 and unencrypted puts were refused (AccessDenied) and an aws:kms put was accepted; access logs and lifecycle rules are on the three buckets; the task holds the S3 settings.
* **Cross-firm on the real bucket.** Try 2 reported `adapter=S3Files ownFirmReads=sample otherFirmReads=null pathTrick=refused`, and the object came back read under firm A's prefix with aws:kms. Try 1 was void (it ran nothing) and does not count, as the Lead said. The script for try 2 is not committed, so I cannot see what it asserted. Locally, j_65 W4 already shows the adapter refusing another firm against a fake S3.
* **To reach Works:**
  1. Commit `~/run24/` and the cross-firm script with their sha256.
  2. Save the bucket's recorded versioning, location and encryption answers as j_65's fixtures. qa can align W5's reader if the CLI saved JSON rather than S3's XML; this is a test-file change only.
  3. Get j_65 13/13 on GitHub.

## R1.13: logs, metrics, error reports, alarms (Partial)
* **Now met with a GitHub run:** the packs above. This was the last code-side gap from the 23 Nov read.
* **Still met from Step 19's committed outputs:** a real error reaches the alarm (`30-r113-real-error-alarm.txt`), no seeded personal data in 1,894 events (`50-log-scan.txt`), and logs kept 90 days in ca-central-1.
* **Reported in Step 20 (not checkable from here):** the on-call subscription was replaced and confirmed at 04:22:13Z, before the alarm. Then 38 × 503 and 114 × 401 with no set-alarm-state; OK → ALARM at 04:22:34Z, action run, delivered 1 and failed 0. The founder answered "Yes, received at 09:52 IST". 04:22:34Z is 09:52:34 IST, so the times agree.
* **Weak point:** the founder picked an offered option that already contained the time, rather than typing it. This is the founder's own attestation and I accept it as the person's confirmation, but it has to be recorded where anyone can read it.
* **To reach Works:** commit the R1.13 raw outputs (the subscription read, the alarm history, the SNS counts) with their sha256, and put the founder's confirmation in their words on a PR or in DECISIONS. No new AWS run is needed. The on-call address must not be written anywhere (Lead 20).

## R1.1: hosting in Canada (Partial)
* **Reported:** 17 enabled regions; stacks, databases and clusters only in ca-central-1, plus the backup stacks in ca-west-1. The service ran at 2 tasks on cc349dcfe's image with health 200. This agrees with Step 15. The raw output is not committed.
* **Step 19's committed smoke** (`10-r11-smoke.txt`) passes health, the first page and the bundle. Its signed-in step was SKIPPED, because the local sign-in is off on AWS.
* **Left:**
  * PF-8c, deploy from CI: no `deploy.yml` on main. This is a missing part, so P-606 applies.
  * The signed-in smoke step, which needs R1.5's chain: PF-4bc (not merged; `identity/session/provider.ts` still answers `SIGN_IN_NOT_SET_UP`), plus rows for the sign-in page, the Cognito callback, and the task role's cognito-idp actions with their check.
  * Commit the survey output.

## Bugs
None new.

## Questions for the Lead
* Will the AWS session commit `~/run24/` (with sha256, as Step 19 did) and the bucket's three recorded answers? That alone moves R1.13 to Works, and R1.65 once j_65 is green.

## Suggestions
* *Needed for the proof · Scaffolding:* the AWS session saves the raw S3 API answers (`get-bucket-versioning`, `get-bucket-location`, `get-bucket-encryption`) as j_65's fixtures in the same commit as its evidence.
