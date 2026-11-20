# PF-8a review: the Canadian estate as code (CDK v2, synth only), PR #2638

Reviewer (independent; did not build it). Head reviewed: `4e157f41deee8b7e07fc4b0d1376659c74434774`. This is a deploy row, not a screen, so it is judged against BACKLOG line 973 (PF-8a), with PF-8rc at line 977 in view, tech gate entry 8, and the tech lead's ruling (report-only job, no merge-queue run until it is measured green, P-717 (b), P-772 (a); no AWS account or key, P-551). D1–D20 and BIC-01–20 are N/A because there is no UI.

## What I ran
* `npm test` in the worktree: 13 pass, 0 fail, 3.5 s. From a clean `git archive` copy: `npm ci --ignore-scripts`, then synth, then tests: 6 packages, synth exit 0, 13 pass.
* `CDK_DISABLE_CLI_TELEMETRY=true npx --no-install cdk synth --quiet --no-notices` with the AWS key variables unset: exit 0, both stacks synthesized, `aws://unknown-account/ca-central-1`. `cdk.out` deleted afterwards.
* `npm audit --omit=dev --audit-level=high`: exit 0. It reports 2 moderate findings (minimatch bundled in aws-cdk-lib, GHSA-g3hv-75wg-m249), as the PR states.
* `ci-and-lists.mjs deploy-synth.yml`: exit 0. `check-write-token.sh`: 34/34 pass. Required status checks on `main`: only `ci`. `.mergify.yml` never names `deploy-synth`.
* Publish dates from the npm registry: aws-cdk-lib 2.275.0 (26 Oct), aws-cdk 2.1147.0 (30 Oct), constructs 10.8.1 (3 Aug), @aws-cdk/cloud-assembly-schema 55.4.0 (5 Nov, the newest), asset-awscli-v1 (3 Aug), node-proxy-agent-v6 (8 Sep). The rest are bundled. Every package is at least 14 days old on 20 Nov, which matches `--before=2026-11-06`. Pins are exact and match gate entry 8.
* Break-it probes: a scratch script outside the worktree ran the PR's `lib/checks.ts` against variations of the real stacks (results below).

## Synthesized template, read directly
* **RDS:** postgres `18.3` with parameter family `postgres18` (`compose.test.yml` runs `postgres:18.3-bookworm`). `PubliclyAccessible:false`, `StorageEncrypted:true`, `KmsKeyId` set to the environment key (rotation on), `DeletionProtection:true`, `BackupRetentionPeriod:35` (automated backups with PITR, the RDS maximum). Parameters: `rds.force_ssl=1`, `log_error_verbosity=terse`. The subnet group holds the two isolated `data` subnets only, which have no route. MultiAZ is true in production and false in staging. The secret is generated and KMS-encrypted. DeletionPolicy is Snapshot.
* **Buckets** (3 per stack): all four public-access blocks are on, versioning is on, encryption is `aws:kms` with the environment key plus a bucket key, ownership is enforced, and a policy denies `aws:SecureTransport=false`. Policy: Retain.
* **Region:** across both templates, the only region string is `ca-central-1`. The region is pinned in the constructor (`estate.ts:26`), and the "caller's region cannot move it" test is real.
* **Workflow:** triggers on `pull_request` only (no `pull_request_target`, `merge_group`, `push` or `schedule`), `permissions: contents: read`, `persist-credentials: false`, `npm ci --ignore-scripts`, no secrets, and `AWS_EC2_METADATA_DISABLED` set. One command per `run:`. Actions use `@v4` tags, the repo's convention. No leak and no write token, so running the PR's code is safe.

## Done-when, line by line
| Done-when | Holds? |
|---|---|
| `cdk synth` from a clean clone, no AWS keys | Yes (clean archive copy, keys unset) |
| Region: pass, and a us-east-1 bucket test stack fails | Yes as written. But see Major 1 and Major 2: the guard the row describes ("any resource, replication target or log group") does not hold |
| DB not public, encrypted, deletion-protected, 35 days: pass and fail | Yes: each property is named in the fail case (`estate.test.ts:65-75`) |
| Every bucket blocks public access, is versioned, encrypted, refuses HTTP: pass and fail | Yes. The HTTP check is weak (Minor 2) |
| Production Multi-AZ, staging single-AZ: pass and fail | Yes (`estate.test.ts:85-90`) |
| Job runs only when `deploy/` changes | Yes (paths are `deploy/cdk/**` plus the workflow, asserted at `estate.test.ts:106-113`) |
| Exact pins, lockfile committed, `npm audit --omit=dev` no high | Yes |
| Lead ruling: non-blocking, no merge-queue batches | Yes (not required, not in Mergify, no `merge_group`) |

## Blockers
None.

## Majors
1. **The region guard cannot see an S3 replication target, and the test that claims it can is rigged.** S3 bucket ARNs carry no region, so `regionFindings` (`lib/checks.ts:24`, which regex-scans `Properties`) cannot catch cross-region replication. The row names exactly this case ("fails on any … replication target … outside ca-central-1"), and so do `checks.ts:17-18` and `README.md:25`. The fail case at `test/estate.test.ts:40` passes only because it names the destination bucket `copy-eu-west-1` and adds a made-up `Note: "eu-west-1"` property. **Failing scenario (run):** in `xr-production`, `new s3.Bucket(s, "Replicated", { versioned: true, replicationRules: [{ destination: s3.Bucket.fromBucketArn(s, "UsCopy", "arn:aws:s3:::xr-documents-copy"), priority: 1 }] })` synthesizes `ReplicationConfiguration.Rules[0].Destination.Bucket = "arn:aws:s3:::xr-documents-copy"`, and `regionFindings` returns `[]`. **Fix:** report any `ReplicationConfiguration` on an `AWS::S3::Bucket`, and any `AWS::S3::MultiRegionAccessPoint`, unless every destination is a `Ref`/`Fn::GetAtt` to a bucket in a scanned home-region stack, or its type is in the allowance. Replace the test at :40 with the real CDK `replicationRules` case above, with no region in the name.
2. **The guard checks only the two stacks it is handed, not the app.** `test/estate.test.ts:17` builds its input from `STAGES`, so a stack added to `buildApp` in another region is never scanned. That is a realistic case: PF-8b's DNS or certificates, where a CloudFront certificate must live in us-east-1. **Failing scenario (run):** after `buildApp()`, add `new Stack(app, "xr-edge", { env: { region: "us-east-1" } })` with a bucket. The app now holds `xr-edge@us-east-1`, and `regionFindings` over the test's input returns `[]`. Nested stacks (`AWS::CloudFormation::Stack`, whose template is a separate asset) escape the same way. **Fix:** feed the guard every stack in the synthesized assembly (`app.synth().stacks`, nested templates included), or `app.node.findAll().filter(Stack.isStack)`. Add a fail test with an extra us-east-1 stack in the app.

## Minors
1. `REGION_RE` (`lib/checks.ts:12`) misses `us-isof-south-1`, `eu-isoe-west-1` and `eusc-de-east-1` (probed: all three MISSED). It also scans only `Properties`, so a region set as a `CfnParameter` default and used through `{Ref}` escapes (probed: `[]`). Scan the whole template, including Parameters, Mappings and Outputs, and widen the prefix pattern.
2. The TLS-only check (`lib/checks.ts:65-66`) accepts any Deny with `aws:SecureTransport=false`. A Deny narrowed to `s3:DeleteBucket` for one account still passes (probed: `[]`). Require `Principal` `*`, `Action` `s3:*`, and both the bucket and the `bucket/*` resource.
3. PostgreSQL 18.3 is hardcoded at `test/estate.test.ts:57` and `estate.ts:48,53`. If `compose.test.yml` moves, nothing goes red, and that file is outside the workflow's paths (`deploy-synth.yml:12-14`). Read the tag from `compose.test.yml` in the test and add the file to the paths.
4. The isolated-subnet check lives only in the test, runs on production only, and relies on the `/data/i` naming (`test/estate.test.ts:92-104`). `databaseFindings` never checks subnets. Move it into `checks.ts` and run it for both stacks.
5. `cdk synth` prints "81 feature flags are not configured" (`cdk.json:5-10` sets 4). Flipping a flag after the first deploy can replace resources, so either set the recommended flags now, while nothing is deployed (for example `@aws-cdk/aws-ec2:restrictDefaultSecurityGroup`), or record the choice in the README.
6. The row names `test/region.test.ts` and a job in `skeleton.yml`. The PR uses `estate.test.ts` and a separate workflow. The workflow deviation is disclosed and asked as Question 1, and it fits the lead's report-only ruling. The filename change is not disclosed: note it in the PR or rename.

## Journey score (reviewer, the one score for this check)
9/10 (pass, no criterion at 0). Report: `screens/PF-8a/journey-test-reviewer-2026-11-20.md`. Error recovery (the guard catching a mistake) and trust (the claims in the README and `checks.ts` outrun the guard) are ½ each, from Majors 1 and 2.

## Could not check
A real deploy, `cdk diff` against an account, and CloudFormation-side validation (no account, P-551, held). The CI job itself has not run, because the PR is a draft and every check is skipped on this head. The ruleset was read only for `main`'s required checks.

**Verdict: Block.** To fix: Major 1 (S3 replication target escapes the guard; the test at `estate.test.ts:40` is rigged) and Major 2 (the guard sees only the `STAGES` stacks, not every stack in the app).

Reviewer: Block 4e157f41deee8b7e07fc4b0d1376659c74434774

## Re-review (diff-only) at 4b0da1e7b37f56c10813c709191df37845f48656
Scope: only `git diff 4e157f41d..4b0da1e7b` (ad28c8f2d: review fixes; 4b0da1e7b: break fixes, `break-report.md`).

**What I ran:**
* `npm test`: 21 pass, 0 fail.
* `npm run synth` (`node bin/app.ts`): exit 0, with the AWS key variables set and every proxy variable pointed at a dead port, so it made no network call (break 1 holds). Both templates name only `ca-central-1`. `cdk.out` deleted afterwards.
* `check-skeleton-scope.sh`: all passed. The `Dockerfile.dockerignore` line excludes `deploy/cdk`.
* I re-ran my first probes against the fixed guard, fed by `allStacks`, plus new ones.

**Each fix, and whether its test can fail:**
| Finding | Holds? | Fail test |
|---|---|---|
| M1: S3 replication target | Yes. A real `replicationRules` destination to `fromBucketArn("arn:aws:s3:::xr-documents-copy")` is caught. A destination inside the same stack passes. The rigged test is gone | `estate.test.ts` "real S3 replication…" (fail and pass) |
| M2: every stack in the app | Yes. `allStacks` uses `findAll` plus `Stack.isStack`, so nested stacks are included. An extra `xr-edge@us-east-1` and a nested stack with a `us-west-2` parameter are both caught. The pass test pins exactly the two stacks | "a us-east-1 stack added…" |
| m1: region forms, Parameters, Outputs and the rest | Yes. isof, isoe, eusc, an AZ suffix, `_id`, capitals and a flat `Fn::Join` are all caught. The real stacks give no false finding | two tests |
| m2 / break 5: TLS deny | Mostly. It must now be `*`, `s3:*` and name the bucket. Residual: Minor R3 | narrowed action, principal or resource |
| m3: PostgreSQL version from compose | Yes. The test reads `compose.test.yml`, and the file is in the paths | equality with the compose tag |
| m4: database subnets | Yes. `dataRouteFindings` is in `checks.ts` and runs on both stacks, keyed on subnet group, associations and routes (not names), plus `MapPublicIpOnLaunch` | NAT route, public IP, no group |
| m5: feature flags | Recorded in the README as PF-8c's decision. Accepted | n/a |
| m6: test filename | Not found in the PR body or comments: Minor R5 | n/a |
| break 1: no CLI and no STS lookup | Yes. `synth` is `node bin/app.ts`, and neither CI nor any script calls `cdk` | `package.json` and workflow asserts |
| break 6: stricter workflow test | Yes for triggers, secrets, OIDC, top-level permissions, persisted credentials and install scripts. Residual: Minor R4 | regex asserts |
| break 8: the stack's own KMS keys | Yes, for both the database and the buckets (`alias/aws/rds` and `alias/aws/s3` are caught) | two cases |
| break 10: image excludes `deploy/cdk` | Yes (one line in the dockerignore) | covered by the existing skeleton scope check |

**Nothing new broke.** The real stacks pass every check. The workflow is still pull_request only with contents read, and it still has no `merge_group`. The questions sent to the tech lead are the lead's to answer, not findings here: a CDK-only PR still matches skeleton.yml's `deploy/**` path and Mergify's `**/package.json` barrier. The new job itself stays non-blocking.

**Residual Minors (none blocks):**
* **R1.** Region-less S3 destinations other than replication still escape (probed: all three MISSED): Firehose `S3DestinationConfiguration.BucketARN`, CloudTrail `S3BucketName` and S3 `InventoryConfigurations[].Destination.BucketArn` pointing at a bucket outside the app. None exists today, and the row's named cases (stack region, replication target, log group) now hold. Fix, best in PF-8rc, which extends this guard: treat any literal `arn:aws:s3:::name` or `S3BucketName` that does not resolve to a scanned bucket as a finding.
* **R2.** A nested `Fn::Join` (`["us-", {"Fn::Join":["",["east","-1"]]}]`) is missed, because `flatten` (`checks.ts:137-145`) joins only literal parts. Flatten the parts first, then join them.
* **R3.** A TLS deny that covers only the bucket ARN, not `bucket/*`, still passes (probed), which leaves object requests over HTTP allowed. Require both resources (`checks.ts:224-226`).
* **R4.** The workflow test checks only top-level `permissions:`. A job-level `contents: write` would pass it, though `check-write-token.sh` in `ci` remains the backstop.
* **R5.** The README run block (`README.md:20`) still tells people to run `npx cdk synth`, which is the CLI path that break 1 removed because it calls STS. Show `npm run synth`. Also name the `estate.test.ts` versus `region.test.ts` filename change in the PR (m6).

Journey score at this head: **10/10**. Error recovery and trust go up to 1, because the escapes I found are now caught and the README claims match the guard.

**Verdict: Approve.** No Blocker or Major is open. Minors R1–R5 are optional or for PF-8rc.

Reviewer: Approve 4b0da1e7b37f56c10813c709191df37845f48656
