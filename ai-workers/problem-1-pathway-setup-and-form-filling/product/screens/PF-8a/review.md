# PF-8a review: the Canadian estate as code (synth only)

Reviewed commit **36f5e8cd2cc95a9b05eccb1e466441a12f29f679** on `claude/exciting-hopper-fvivo0` (net diff `origin/main...36f5e8cd2`: `deploy/cdk/**` new, `.github/workflows/skeleton.yml` changed). Independent reviewer; did not build it. The temporary us-east-1 demo stack (d813985f5) is fully reverted: `git diff 26f617f5d 36f5e8cd2` is empty. During the review the branch moved to a299bdbb7, which adds only `qa/built/PF-8a.md` (required by "Every PR"); a diff-only re-review covers it.

**Journey test: not applicable (infrastructure, no screen).** Screen-review dimensions D1–D20, the BIC table and the walkthroughs do not apply. Reviewed as infrastructure code against the row.

## Checks I ran (Node 22.23.5, npm 10.9.9, in `deploy/cdk`)
| Command | Exit |
|---|---|
| `npm ci --ignore-scripts` | 0 |
| `npm run typecheck` | 0 |
| `env -i PATH HOME=$(mktemp -d) AWS_EC2_METADATA_DISABLED=true npx cdk synth --quiet` | 0 (two stacks, both `aws://unknown-account/ca-central-1`) |
| the same synth under `strace -f -e connect` calling `node_modules/.bin/cdk` | 0, **no network connection at all** from the CLI or the app (`npx` itself looks up registry.npmjs.org, which is npm, not AWS) |
| `npm test` | 0 (27 pass, 0 fail) |
| `npm audit --omit=dev --audit-level=high` | 0 (2 moderate: minimatch inside aws-cdk-lib; no high) |
| `product/tools/push-guard.sh origin/main..36f5e8cd2` | 0 (clean) |
| `graph.mjs --check` | 0 |
`node_modules/` and `cdk.out/` were already there when I started, so I left them in place (both gitignored). Exact versions in `package.json`, lockfile v3 committed, every resolved URL on registry.npmjs.org. The app's `package.json` is untouched.

## Done-when checked against the synthesized CloudFormation (`cdk.out/estate-*.template.json`)
| Claim | Staging | Production |
|---|---|---|
| Region pinned in code (`env: { region: REGION }` in the stack constructor; callers cannot override it) | ca-central-1 | ca-central-1 |
| VPC over two AZs: public / tasks (NAT egress) / database (isolated, no route at all) | 1a, 1b; 1 NAT | 1a, 1b; 2 NAT |
| DB in isolated subnets, `PubliclyAccessible: false`, SG with no ingress | yes | yes |
| `StorageEncrypted: true`, `KmsKeyId` = the stack's CMK (rotation on) | yes | yes |
| `DeletionProtection: true`, `BackupRetentionPeriod: 35` (PITR follows) | yes | yes |
| Parameter group `postgres18`: `rds.force_ssl: "1"`, `log_error_verbosity: terse` | yes | yes |
| `Engine postgres`, `EngineVersion 18.3` (= `postgres:18.3` in `compose.test.yml` on main) | yes | yes |
| `MultiAZ` | false | true |
| 3 buckets: all four public-access blocks, versioning Enabled, `aws:kms` with the CMK, Deny `s3:*` on `aws:SecureTransport=false` (bucket and `/*`), plus TLS < 1.2 deny | yes | yes |
| Stateful resources `DeletionPolicy: Retain` (key, DB, subnet group, buckets); termination protection on | yes | yes |
The data rules hold in the output, not only in the tests.

## Are the tests real? Mutations in a scratch copy (not committed)
Each code mutation turned the suite red: backups 7 days (9 fail), staging Multi-AZ (1), `REGION = 'us-east-1'` (5), `enforceSSL` off (6), DB in public subnets (10), `rds.force_ssl` 0 (9), versioning off (6), deletion protection off (9), Postgres 17.6 (2). The check functions keep their own constants (35 days, ca-central-1) and do not import them from `lib/`, so a change in `lib/` cannot pass on a matching change in the checks. The database, bucket and availability rules each have a real pass case and a real fail case.

The region guard does not hold the row's claim ("fails on any resource, replication target or log group outside ca-central-1"). Probes, all with all 27 tests green:
* a. **It checks the test's own app, not what `cdk synth` writes.** I added `new Stack(app, 'side-us', { env: { region: 'us-east-1' } })` with a bucket in `bin/app.ts`. `cdk synth` wrote a us-east-1 stack to `cdk.out/manifest.json` and `npm test` still passed 27/27. `region.test.ts` and `estate.test.ts` call `buildEstate(new App())` themselves, so stacks added in `bin/app.ts` and context from `cdk.json` (feature flags later) are never checked. That assembly is the one PF-8c deploys.
* b. **S3 cross-region replication to a bucket outside Canada passes.** A `ReplicationConfiguration` on `estate-production` with destination `arn:aws:s3:::client-docs-copy-virginia` returns `[]`, because S3 ARNs carry no region. The current "Replica" test fails only because the string `ca-west-1` sits in the rule's `Id`. It does not show that replication targets are checked.
* c. **Nested stacks are not read.** A `NestedStack` holding a subscription filter to `arn:aws:logs:us-east-1:…` returns `[]`: `stacksRecursively` covers Stages (I checked: a us-east-1 stack in a Stage is caught) but not nested templates.
* Caught as intended: an env-agnostic stack (`unknown-region`), a Stage, `AutomaticBackupReplicationRegion: us-east-1` on the DB, a cross-region log destination, a us-west-2 Backup copy.

## Findings
**Blocker:** none.

**Major**
1. **The region guard can be bypassed (C1-3, P-559; `test/checks.ts:30-50`, `test/region.test.ts`).** See a–c above. Fix in this PR:
   * (a) Run `regionProblems` on the assembly the CLI wrote: `new cx_api.CloudAssembly('cdk.out')`. CI already runs synth before `npm test`, so fail when `cdk.out` is missing or older than the sources.
   * (b) Refuse any S3 `ReplicationConfiguration` whose destination is not a bucket resource of a ca-central-1 stack in the same assembly. Simpler: refuse S3 replication outright, since PF-8r's copy goes through AWS Backup, which stays allowed. Then replace the `Id: 'ca-west-1'` case with a realistic destination ARN.
   * (c) Read the nested templates, or refuse `AWS::CloudFormation::Stack` resources.
   * Each fix needs one fail case. Until then the README's "any resource, replication target, log destination" claim overstates what the guard does.

**Minor**
2. **The skeleton skip rarely fires** (`skeleton.yml:73-75`). It needs every file under `deploy/`, but every PR also adds `qa/built/<ID>.md` ("Every PR"). PF-8b, 8c and 8r PRs will therefore trigger the workflow (now that `deploy/**` is in `paths`) and build the full image. This fails safe, but it adds CI minutes against B190's purpose. A narrower fix: skip when no file in the PR's diff matches the image globs (with `deploy/` removed), using the matcher that already exists. App-PR behaviour is unchanged as written. I traced the selectors with sample lists, and they parse in YAML.
3. **`deploy-synth` is not a merge condition.** `.mergify.yml` requires only `ci` (and `xfa-engine` for its own paths), so a red region guard does not stop a merge. `.mergify.yml` is outside this row's Touch list: put it under "Questions" for the Lead, with an `or: check-success = deploy-synth / -files ~= ^deploy/` condition like `xfa-engine`'s.
4. **84 CDK feature flags are not set** (the synth warning). In a scratch copy I applied `aws-cdk-lib/recommended-feature-flags.json`: it adds only the restrict-default-security-group custom resource and changes the key policy's partition literal, with no replacements. Without it, the VPC's default SG keeps its allow-all rules. Set the recommended flags before the first deploy (PF-8b at the latest).
5. **Versions differ from gate entry 8** (`aws-cdk-lib` 2.275.0, `aws-cdk` 2.1147.0). The PR uses 2.277.0 (published 13 Nov) and **2.1149.0 (published 19 Nov 04:13 UTC, the day of the build)**, against the 14-day age rule the gate document applies elsewhere. Either use the gate's vetted versions or record the bump and the reason in the PR.
6. **README "Everything stateful is retained" overstates it.** The master secret is `DeletionPolicy: Delete`, and the parameter group, SG and VPC are not retained, so a stack delete (after removing termination protection) fails on resources still in use. Reword it, or retain the secret.
7. **The Postgres version is copied, not checked.** `estate.test.ts:30` hardcodes `'18.3'`, so a Postgres bump in `compose.test.yml` on main drifts without a red test (the row says "the version main runs"). Read the tag from `compose.test.yml` instead. Also note for PF-8b: RDS's default `AutoMinorVersionUpgrade: true` will move the instance off 18.3.
8. **The two-AZ rule has only a pass case** (`estate.test.ts:86-91`). "Every PR" asks for a pass and a fail case for each rule.
9. **Size (P-610).** About 1,486 lines added, 859 of them the generated lockfile (about 627 hand-written). P-631's exemption is written for PF-L libraries-only PRs: state "Size exception: P-631" in the PR body, with npm audit before and after, or ask the Lead whether it applies.

**Scope:** inside the Touch list (plus the required `qa/built` line). No AWS account, key or call; nothing deployed. The CI job has `contents: read` only, no `id-token`, an AWS-variable tripwire, IMDS off, and runs only on non-draft PRs that change `deploy/` or the workflow file (or by hand).

**Not checked:** a real GitHub Actions run of the edited workflow (no PR run visible to me); RDS availability of 18.3 / `db.t4g.micro` in ca-central-1 (would need AWS; `aws-cdk-lib` 2.277.0 lists `VER_18_3`).

**Verdict: Block** at 36f5e8cd2cc95a9b05eccb1e466441a12f29f679. Fix Major 1 (a, b, c, each with a fail case). The Minors are should-fix; item 3 goes to the Lead as a question.
