Changes `.github/workflows/skeleton.yml` (shared workflow, PF-7's): the tech lead reads it before the label (P-423); **not labelled by the builder**.

## What and why
Row **PF-8a** (R1.1, map row 1): the Canadian cloud estate as code, proven without an AWS account. The founder asked to start hosting now (ask A210, 19 Nov) because it has Release 1's longest outside lead time. **Nothing is deployed, and no AWS account, key or network call to AWS was used.** The service, secrets and DNS are PF-8b; the deploy from CI by OpenID Connect is PF-8c; the backup copy to `ca-west-1` and the drill are PF-8r.

* `deploy/cdk/` is an AWS CDK v2 app in its own package (STANDARDS §1 gate entry 8). Its `package.json` pins exact versions, its lockfile is committed, and the app's own `package.json` is untouched.
  * Versions are the gate's vetted ones: `aws-cdk-lib` 2.275.0, `aws-cdk` 2.1147.0, `constructs` 10.8.1.
  * There is one stack per environment, `estate-staging` and `estate-production`. Both are pinned to `ca-central-1` inside the stack class, so no caller can place one elsewhere (P-559).
* **Network:** a VPC over `ca-central-1a`/`1b`.
  * Public subnets hold only the NAT gateways (and PF-8b's load balancer later).
  * Tasks run in private subnets with outbound access.
  * The database sits in isolated subnets with no route to the internet.
  * NAT gateways: 2 in production, 1 in staging (P-562).
* **Database:** RDS PostgreSQL **18.3** (the version `compose.test.yml` runs on main; the test reads it from that file).
  * Multi-AZ in production, single-AZ in staging (cost, P-562).
  * Not publicly accessible, and its security group has no ingress yet (PF-8b opens 5432 to the service only).
  * Encrypted with a customer-managed KMS key with rotation.
  * Deletion protection on, automated backups **35 days** with point-in-time restore.
  * Parameter group: `rds.force_ssl=1`, `log_error_verbosity=terse`.
  * The master secret is generated and encrypted with the same key.
  * The database, its secret, the key and the buckets are all retained if a stack is ever deleted.
* **Files:** three buckets (documents, exports, imports), each with:
  * all four public-access blocks;
  * bucket-owner-enforced ownership;
  * versioning;
  * KMS encryption with a bucket key;
  * a policy that denies any request not made over TLS (and TLS below 1.2).
* **Sample values** (`lib/environments.ts`): the database instance classes (`t4g.micro` staging, `t4g.medium` production) and 20 GiB storage are placeholders until a measurement before the first deploy (PF-8b).
* **CI:** a new job `deploy-synth` in `.github/workflows/skeleton.yml`.
  * It runs on a ready PR that changes `deploy/` (or this workflow).
  * Steps: `npm ci --ignore-scripts`, type check, `cdk synth`, the assertion tests, `npm audit --omit=dev --audit-level=high`.
  * It has `contents: read` only, no secret and no OpenID Connect role, instance-metadata lookups off, and a tripwire that fails the job if any AWS credential variable is present.
  * `deploy/**` joins the workflow's trigger. The existing `skeleton` job's "changes" step skips the image build when no file in the PR matches the image paths, and `deploy/` never counts as an image path for a push. App PRs behave exactly as before; see the simulation under Checks.

## Plan (as built)
1. Write the CDK package with exact pins and a lockfile, plus `cdk.json` (telemetry, version reporting and notices off).
2. Build the stack: key, VPC, database, buckets.
3. Write the rules as plain checks over the synthesised CloudFormation (`test/checks.ts`). Each rule gets a pass on the real stacks and a fail on a copy with exactly one property broken.
4. Write the region guard on the assembly `cdk synth` writes.
5. Add the CI job.
6. Show the guard failing once on a real `us-east-1` stack, then remove it.
7. Independent review, then fixes, then re-review.

## Done when → proof
| Done when | Proof |
|---|---|
| `cdk synth` succeeds from a clean clone with no AWS keys | `rm -rf node_modules cdk.out && npm ci --ignore-scripts && env -i PATH=$PATH HOME=$(mktemp -d) AWS_EC2_METADATA_DISABLED=true npx cdk synth --quiet` → **exit 0**. Both stacks synthesise as `aws://unknown-account/ca-central-1`. The reviewer ran the same synth under strace: neither the cdk CLI nor the app opened any network connection (only `npx` itself looked up the npm registry). |
| Every resource's region is `ca-central-1`; a `us-east-1` bucket stack makes the guard fail, shown once, then removed | `test/region.test.ts`. The pass case runs `cdk.json`'s app exactly as `cdk synth` does and checks that assembly. Fail cases: a `us-east-1` bucket stack, a stack with no region pinned, a log destination in `us-east-1`, S3 replication (its ARN names no region), a nested stack, a stack set and a multi-region access point, and a backup copy to `us-west-2` (while `ca-west-1` is allowed only for an AWS Backup copy, PF-8r). **Shown once:** commit d813985f5 added a `us-east-1` bucket stack to the real estate, and `region.test.ts` exited **1** with `stack guard-demo-us is in us-east-1, not ca-central-1`. The next commit (26f617f5d..36f5e8cd2) reverted it; the net diff is empty. |
| The database is not publicly reachable, encrypted, deletion-protected, backups 35 days | `test/estate.test.ts` "database". Passes in both environments. Each of these fail cases is caught on its own: `PubliclyAccessible`, `StorageEncrypted`, missing KMS key, deletion protection off, 7-day backups, subnets moved to the public subnets (a route to the internet gateway), security group open to `0.0.0.0/0`, `rds.force_ssl` off, verbose error log. |
| Every bucket blocks public access, is versioned, encrypted and refuses plain HTTP | `test/estate.test.ts` "file buckets". Passes in both environments. Fail cases: a public policy allowed, versioning suspended, AES256 instead of KMS, the TLS-only statement removed, a bucket missing. |
| Production Multi-AZ, staging single-AZ | `test/estate.test.ts` "availability". Passes. Fail cases: production single-AZ, staging Multi-AZ. Also: two zones (pass), and one zone is caught (fail). |
| The job runs only when `deploy/` changes | The `deploy-synth` "changes" step, plus the trigger path. Local simulation of the step's script on file lists: deploy+records → skeleton skip / synth run; deploy+workflow → both run; app only → skeleton run / synth skip. The per-push path gives app → run, deploy only with a green earlier head → skip, deploy only with no green earlier head → run. |
| Amendment: exact pins, lockfile committed; `npm audit --omit=dev` no high | `package.json` pins exact versions and `package-lock.json` is committed. `npm audit --omit=dev --audit-level=high` → **exit 0**: 0 high, 0 critical, **2 moderate** (`minimatch` bundled inside `aws-cdk-lib`, GHSA-g3hv-75wg-m249, used only at synth time on our own globs; the only "fix" npm offers is downgrading `aws-cdk-lib` below 2.240). |
| `deploy-synth` green on the PR | to be filled from the PR's run |

## Checks and results
* `deploy/cdk`, on a clean install: `npm run typecheck` 0 · `cdk synth` 0 · `npm test` **31 pass, 0 fail** · audit (high) 0.
* `bash product/tools/run-suites.sh --changed origin/main..HEAD`: it selected **every suite**, because `select-suites.mjs:382` treats any `package(-lock).json` as shared, and it stopped at my 15-minute limit (exit 124). Following `/next` step 4, I ran only the suites of the files I touched (the CDK tree's own tests above); none of the app's suites reads `deploy/` or the new job. The PR check runs the rest (see Questions 3).
* `node product/tools/graph.mjs --check` exit 0 · `count-any.mjs --against origin/main`: 417 at base, 417 now.
* Reviewer (Opus, fresh context): review 1 **Block** (Major: three region-guard bypasses) at 36f5e8cd2. All three were fixed with fail tests, along with five Minors. Re-review: see `screens/PF-8a/review.md` and the `Reviewer: Approve` comment.

## Size
`Size exception: P-631`. Hand-written lines: **782** (code, tests, workflow, README, the review record and the qa line). The rest is the generated `deploy/cdk/package-lock.json`. P-631 is worded for libraries-only PF-L PRs, so see Questions 1. npm audit numbers are above; there is no browser bundle (the CDK tree is not part of the app).

## On the demo
Nothing changes at :4400; this is infrastructure only. To try it: `cd deploy/cdk && npm ci --ignore-scripts && npx cdk synth --quiet && npm test`.

## Cost
US$0. No AWS account was touched, no live AI was used, and no priced button was pressed. At deploy time (PF-8b, not now) the main costs will be the NAT gateways (3) and the RDS instances. The instance classes are Sample until measured.

## Duplicate check
Searched `BACKLOG*.md` (PF-8 names two Done-when lines carried into PF-8b and PF-8c), open PRs (none titled PF-8a), branches (none for it), `main`'s code (no `deploy/cdk`) and `qa/BUGS.md` (no bug). None found.

## Questions for the tech lead (each with my recommendation)
1. **Size, P-631's scope.** P-631 exempts generated lockfile lines in PF-L libraries-only PRs; this PR is not libraries-only. The hand-written lines are 782 (< 800). *Recommend:* confirm that P-631 covers a new, separate tooling tree's lockfile, or record a one-line row; splitting adds no review value.
2. **`deploy-synth` does not gate merges.** `.mergify.yml` requires only `ci`, so a red region guard would not stop a merge. That file is outside my Touch list. *Recommend:* add `check-success=deploy-synth` to the product queue's conditions, written so a skipped job counts as success (it skips on PRs that do not touch `deploy/`), in a Lead-owned change.
3. **Every `deploy/` PR runs all app suites.** `select-suites.mjs:382` treats any `package(-lock).json` as shared, `deploy/cdk/` included. *Recommend:* anchor that rule to the studio's own package files and send `deploy/**` to no app suite (`deploy-synth` covers it), as a small Lead row. It does not affect quality.
4. **The stop hook flags `skeleton.yml` as a tech-lead file.** The row's Touch list names one job in it, so I kept the change rather than revert it. Please read the diff before the label (as briefed).
5. **For PF-8b, before the first deploy:** apply CDK's recommended feature flags (84 unset; the reviewer found applying them only adds the restrict-default-security-group resource, with no replacements) and size the database from a measurement.

Context share: about 45% of this session.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MXNda6GqDKEDkRhNxGdp2u
