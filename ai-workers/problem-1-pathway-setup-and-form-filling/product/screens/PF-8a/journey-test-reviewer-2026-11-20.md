# Journey test: PF-8a, the Canadian estate as code (reviewer, 20 Nov 2026)

Head: `4e157f41deee8b7e07fc4b0d1376659c74434774` (PR #2638). This row has no UI, so the "people" here are the operators who will use it: a builder of the next row (PF-8b, PF-8rc), the tech lead reading CI, and later the founder deploying. The journeys use their tools: a clean checkout, the README's commands, the CI job and the test output. The app on :4400 is unchanged and was not opened, and neither was any other port.

## Journeys
1. **Main path (builder):** "prove the estate synthesizes with no AWS account". Clean `git archive` of the PR, then `npm ci --ignore-scripts`, `npm test` and `cdk synth` with the AWS key variables unset. Expected: green, both stacks in ca-central-1. **Held:** 6 packages, 13/13 tests, synth exit 0, `aws://unknown-account/ca-central-1`.
2. **Alternate (tech lead):** "confirm the job cannot block merges or touch secrets". Read `deploy-synth.yml`, `.mergify.yml` and the required checks on `main`. **Held:** pull_request only, contents read, no persisted token, no secrets, not required (only `ci` is), not in Mergify, no `merge_group`.
3. **Error (builder breaks the database):** public, unencrypted, 7-day backups, no TLS. **Held:** each broken property is named in plain words (`estate.test.ts:65-75`).
4. **Error (builder adds a bad bucket):** **Held:** public-access, versioning, KMS and HTTP findings are named.
5. **Error (builder adds S3 replication to a US copy bucket):** expected the guard to fail. **Did not hold:** `regionFindings` returned `[]`, because S3 ARNs carry no region (review Major 1).
6. **Error (builder adds a us-east-1 stack for certificates in PF-8b):** expected the guard to fail. **Did not hold:** the test scans only the `STAGES` stacks (review Major 2).
7. **Wrong environment (stray `AWS_REGION` or a caller's region):** **Held:** the stack stays in ca-central-1 (test at `estate.test.ts:26-30`).
8. **Step across the boundary (PF-8rc):** PF-8rc adds a ca-west-1 backup copy through the allowance. **Held:** the allowance admits ca-west-1 only inside `AWS::Backup::BackupPlan`, and a bucket naming ca-west-1 is still caught.
9. **Recovery (re-run):** running the tests twice and the synth twice gives the same result. `cdk.out` and `node_modules` are git-ignored.

## Break-it (15 min)
* Region strings `us-isof-south-1`, `eu-isoe-west-1` and `eusc-de-east-1` are missed by the regex. A region passed through a `CfnParameter` default is missed. (Minor 1)
* A Deny narrowed to one action and one principal still counts as "refuses plain HTTP". (Minor 2)
* A `compose.test.yml` version bump would not turn anything red. (Minor 3)

## Data underneath
I read the synthesized templates directly. RDS: 18.3/postgres18, not public, KMS-encrypted, deletion protection on, 35-day backups, force_ssl=1, terse logging, isolated subnets only, Multi-AZ in production only. Buckets: all four public-access blocks, versioning, aws:kms, and a Deny on SecureTransport=false. The only region string is ca-central-1.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1 is green from a clean copy |
| Next step obvious | 1 | The README's Run block and "Next rows" section |
| Plain words | 1 | Findings read like `Database…: backups kept 7 days, not 35` |
| Feedback and state | 1 | Each failing finding names the stack, the resource and the property |
| Correct data | 1 | The template matches the row on every RDS and bucket setting |
| Error recovery (the guard catches mistakes) | ½ | Journeys 5 and 6 escape |
| Accessibility and screen sizes | 1 | No UI. Plain-text output, no colour-only signal (CLI equivalent) |
| Speed | 1 | Tests 3.5 s, synth a few seconds, `npm ci` 5 s |
| Visual quality | 1 | No UI. The README table and comments are clear |
| Trust and sources | ½ | Sizes are labelled Sample and decisions cited, but `README.md:25` and `checks.ts:17-18` claim more than the guard does |

**9/10: pass (8 or more, no 0).** To raise the two half scores: fix review Majors 1 and 2, then reword the README's guard claim to match what the guard actually does.

## Could not test
A real deploy or `cdk diff` (no account, P-551). The CI run, because the PR is a draft and its checks are skipped. No intended user walked it unaided, so D17/D20 stay with the founder.
