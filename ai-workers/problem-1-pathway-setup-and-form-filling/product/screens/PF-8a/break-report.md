# PF-8a break report (PR #2638, commit 4e157f41d), breaker, 20 Nov

Scope is the BACKLOG row PF-8a (BACKLOG.md:973) and focuses on permissions and secrets (P-303). Every finding below is against commit **4e157f41d**. Throwaway variants ran from the scratch area against a `git show` copy of that commit. Partway through this run, uncommitted edits by another session appeared in this worktree (lib/app.ts, lib/checks.ts, test/estate.test.ts, deploy-synth.yml, review.md). They are not mine, I did not touch them, and they look aimed at findings 2, 3, 4 and 9. Re-check after they land.

Baseline: `npm test` passes 13/13. `cdk synth --quiet --no-notices` exits 0. Both manifests say `aws://unknown-account/ca-central-1`.

## Findings

**1. Major: `cdk synth` uses any AWS credentials it finds and calls STS in us-east-1.**
Steps: in deploy/cdk, with any `AWS_ACCESS_KEY_ID` in the environment, run `CDK_DISABLE_CLI_TELEMETRY=true npx --no-install cdk synth --quiet --no-notices -v`. Send it through a local logging proxy, not AWS.
Expected (README: "Synth and the tests need no account, key or network"; P-551): no AWS call.
Actual: the verbose log shows `Looking up default account ID from STS`, and the proxy got `CONNECT sts.us-east-1.amazonaws.com:443`. The CLI also sets `CDK_DEFAULT_REGION=us-east-1` for the app. The stacks pin their own region, so templates do not change. With no credentials there is no call (shown twice). So CI holds (no keys on the runner). The founder's Mac (~/.aws) does not, and neither does any later job that gets keys before synth (PF-8c).
Disclosure: this cloud session carries proxy-injected placeholder AWS keys. So the instructed synth runs that went through the session proxy (the first run and one strace run) sent this STS request upstream. There was no real account or key, and the result was swallowed by the CLI. Every later run went to a local stub only.
Without `--no-notices` the CLI also contacts `cli.cdk.dev-tools.aws.dev`. The `npm run synth` script (package.json) omits both `--no-notices` and the telemetry variable, and cdk.json does not pin either.

**2. Major: the region guard cannot see S3 replication or log targets in another region (row: "replication target").**
Steps: on a real staging bucket, set `ReplicationConfiguration.Rules[0].Destination.Bucket = "arn:aws:s3:::xr-documents-copy"` and `LoggingConfiguration.DestinationBucketName = "xr-logs-virginia"`. Run `regionFindings`.
Expected: a finding. Actual: `[]`. S3 ARNs and bucket names carry no region. The test's "fail" case at test/estate.test.ts:40 only works because it plants `copy-eu-west-1` and a `Note: "eu-west-1"` in the template, so it passes for the wrong reason.

**3. Major: the region guard checks only the stacks the test lists.**
Steps: add `new Stack(app, "xr-edge", { env: { region: "us-east-1" } })` in `buildApp`.
Expected: the region test fails. Actual: `real` is built from `STAGES` (test/estate.test.ts:17), so only xr-staging and xr-production are checked. The app holds three stacks and the third is never seen. Nested stacks are not seen either.

**4. Major: the region guard misses regions held outside resource properties or written in other shapes.**
`regionFindings` (lib/checks.ts:24) scans only `Resources.*.Properties` with REGION_RE (checks.ts:12). Each item below returns `[]`:
- a `CfnParameter` default `us-east-1` or a `CfnMapping` value `eu-west-1`, referenced by a resource (the Ref is checked, the value is not);
- `us-east-1_AbCdEf`, a Cognito pool id, in a task-definition environment variable, and an AZ name `us-east-1a`. `\d\b` fails before a letter or `_`;
- `eusc-de-east-1` and `us-isof-south-1`. These prefixes are not in the regex;
- `{"Fn::Join":["",["us-east-","1"]]}`, and `US-EAST-1` in capitals.
Endpoint URLs such as `sqs.us-east-1.amazonaws.com` are caught.

**5. Major: the TLS-only bucket check passes on a policy that still allows plain HTTP.**
`bucketFindings` (checks.ts:65-66) accepts any Deny statement with `aws:SecureTransport:false`. Each of these leaves it empty: the Deny limited to `s3:DeleteBucket`; the Deny limited to one role as Principal; the Deny on an unrelated Resource. In all three cases GetObject over HTTP is still allowed. The real stacks are correct (`s3:*`, `AWS:*`, the bucket and `/*`), but the check cannot fail on a narrowed policy.

**6. Major: neither the workflow test nor write-token.py catches `pull_request_target`.**
Steps: replace `pull_request:` with `pull_request_target:` and add `ref: ${{ github.event.pull_request.head.sha }}` to the checkout. Run the test's regexes (test/estate.test.ts:106-112) and `write-token.py --dir`.
Expected: a failure. Actual: both pass. write-token.py skips read-only jobs entirely (write-token.py:87-88), so its T1 rule never applies. The result is PR code running in base context: secrets usable if referenced, and the npm cache saved under main's scope.
The test also still passes on each of these:
- `workflow_dispatch` or `workflow_run` added as triggers;
- `${{ toJSON(secrets) }}` and `${{ secrets['K'] }}` (the regex looks only for `secrets.`);
- a quoted `AWS_ACCESS_KEY_ID: '${{ vars.K }}'`;
- `--ignore-scripts` removed;
- `persist-credentials: true`.
write-token.py does catch `permissions: write-all` and `id-token: write` (W0/W1), so the write-token cases hold through ci.yml. The shipped file itself is safe.

**7. Minor: the isolated-subnet test checks production only, and only by name.**
test/estate.test.ts:93 reads `real[1]` only. Pointing staging's DBSubnetGroup at the public subnets leaves every check green. It is still not reachable, because `PubliclyAccessible:false` is enforced in both stacks. Routes are matched by `/data/i` in the logical ID. A `SubnetRouteTableAssociation` that moves a data subnet onto the public route table is not looked at.

**8. Minor: `KmsKeyId` accepts any truthy value.**
At checks.ts:44, `KmsKeyId: "alias/aws/rds"` passes. README says "the environment's own KMS key", but the check proves only "some key".

**9. Minor: the Postgres version is hard-coded and the job's paths are narrower than the row.**
test/estate.test.ts:57 hard-codes `18.3` instead of reading deploy/compose.test.yml. The job's `paths` cover `deploy/cdk/**` only, while the row says "every change under `deploy/`". So a compose bump to 18.4 never runs the check and the drift stays silent. The row's Touch line also names "one job in skeleton.yml" and `test/region.test.ts`. The PR adds a new workflow and `estate.test.ts`. No challenge.md records this deviation; it is fine if the PR body records it.

**10. Minor: CI cost, the queue and the image.**
- skeleton.yml's paths include `studio/deploy/**`, and .mergify.yml:202 requires `skeleton` for any `studio/deploy/` file. So every CDK-only PR runs the 25-minute container proof and is held on it.
- deploy/cdk/package.json and its lockfile match the barrier globs `**/package.json` and `**/package-lock.json` (.mergify.yml:114-115). This PR and every later CDK dependency bump therefore conflict with every scope.
- The Dockerfile copies all of `prototype/` (Dockerfile:40), and the ignore file does not exclude `deploy/cdk` or `cdk.out/`. A Mac-built image would carry `cdk.out` (a git-ignored file), against the dockerignore's own rule.

## What held
- **Workflow event, token and blocking:** the workflow runs on `pull_request` only, with `contents: read`, no secret referenced, `persist-credentials: false`, `npm ci --ignore-scripts`, `npx --no-install` and no merge_group or push trigger. `deploy-synth` appears nowhere in .mergify.yml, so it is not blocking.
- **Repository guards:** write-token.py reports 18 workflows and 0 findings. ci-and-lists.mjs is clean.
- **Lockfile and audit:** the lockfile has 28 entries, none with an install script, all from registry.npmjs.org or bundled in aws-cdk-lib. `npm audit --omit=dev --audit-level=high` exits 0 (2 moderate findings: minimatch inside aws-cdk-lib, fixed in 2.278.0).
- **Region pin:** synth with `AWS_REGION`, `AWS_DEFAULT_REGION` and `CDK_DEFAULT_REGION` all set to us-west-2 still gives ca-central-1, with 0 mentions of us-west-2.
- **Database:** `PubliclyAccessible:false`, encrypted with the stack's key, deletion protection on, 35 days of backups, `force_ssl` and `terse` set, in isolated subnets, security group with no ingress. Each broken property in the fail test is named.
- **Buckets:** BLOCK_ALL, versioned, KMS with bucket key, a `Deny s3:*` policy on both ARNs, BUCKET_OWNER_ENFORCED.
- **Secrets:** no secret value in cdk.out or the code. The password is `GenerateSecretString` and the DB reads it via `{{resolve:secretsmanager:…}}`.
- **Telemetry:** off with the flags shown. `npm test` makes no network connection (strace).

## Re-check on ad28c8f2d (review fixes, pushed during this run): same variants, `npm test` 18/18
- **Fixed:** 2 (replication target must be an own bucket); 3 (`allStacks` sees an added us-east-1 stack); 4 partly (Parameters/Mappings, `eusc-`/`isof` now caught); 5 partly (narrow Action or Principal now caught); 9 partly (compose.test.yml added to paths).
- **Still open:** 1 (STS lookup; `npm run synth` unchanged); 4 rest (`us-east-1a`, `us-east-1_Pool`, capitals, split Fn::Join); 5 rest (Deny on an unrelated Resource passes); 6 (all nine workflow mutations still pass the test); 7; 8; 10.
