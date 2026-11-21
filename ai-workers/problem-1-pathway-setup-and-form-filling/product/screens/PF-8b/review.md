# PF-8b review: the app service on Fargate, secrets, mail, firm addresses, Cognito (PR #2748)

Verdict: Changes requested

Reviewed commit: `efeb00451cdbb88fbb99774ea477f83d0328923d` (branch `claude/cool-bell-2acxlh`). While I was reviewing, the branch moved to `28bc3e195`, which only reverts the `deploy-synth.yml` path line and adjusts README and `estate.test.ts` to match. `lib/` and `test/service.test.ts` are the same in both commits, so every finding below still applies to `28bc3e195` except m1, which that commit resolves.
Reviewer role. Infrastructure only, so there is no screen to walk: the screen-review walk, D1–D20 scores and BIC table do not apply. **Journey score: N/A.** There is no screen, route or app change, and the brief said to skip UI walking, so I wrote no journey-test report. I did not read the breaker's `break-report.md`, so this review is independent of it.

## What I ran (deploy/cdk, AWS keys unset, CDK CLI never called)
* `npm test`: 51 passed, 0 failed (PF-8a's 21 tests included). `npm run synth`: exit 0, both templates written, validation report empty.
* I inspected `cdk.out/xr-production.template.json` by hand:
  * Service task: 5 plain settings (`PLATFORM_ENVIRONMENT=production`, `PLATFORM_IDENTITY=cognito`, the pool and client ids as Refs, SES region) and 10 Secrets Manager Refs. `APP_DATABASE_URL` and `DATABASE_URL` point to the same secret.
  * Migration task: only `xr/production/DATABASE_OWNER_URL`.
  * Execution policies are scoped to each task's own secret ARNs. The task role can only call `ses:SendEmail`/`SendRawEmail` on its identity. The KMS key policy grants decrypt via Secrets Manager to the two execution roles only.
  * Listeners: HTTPS uses `ELBSecurityPolicy-TLS13-1-2-2021-06` and the wildcard certificate; port 80 is a 301 redirect only. The wildcard ACM certificate is DNS-validated, and the `*.expatready.com.` A alias points at the ALB.
  * SES: DKIM on with 3 CNAMEs, MAIL FROM `mail.` with SPF, `_dmarc` set to `p=none` (labelled Sample).
  * Cognito: 3 pools, one client each. Both staff pools have MFA `ON`. Admin-create only.
* Loader parsing (`service-checks.ts:30-32`) on the real `settings.ts` finds 16 settings: 12 required (`s(`) and 8 secret. That matches the file exactly.
* Feature flags: all 89 keys in `aws-cdk-lib/recommended-feature-flags.json` (2.275.0) are set to exactly the recommended value. The 16 extra keys in `cdk.json` are each at their recommended value, which is also their v2 default, so they change nothing. Reading `cdk.json` in `buildApp` (`app.ts:13,16`) is correct. CLI and env context still override it, because App loads constructor context first.
* Mutation probes against the checks (my own script, in the scratchpad, not committed): results listed under M1.

## Blockers
None.

## Majors
**M1. The secret guards miss common ways to widen access, so "the task role reads none / no secret value" can regress unseen.**
* Where: `lib/service-checks.ts:57-79` (`secretReadFindings`), `:41` and `:46-51` (`taskSettingFindings`); `test/service.test.ts:63-84`.
* Each change below to the real production template still gives **no finding**:
  * (a) `ManagedPolicyArns: [SecretsManagerReadWrite]` on the task role.
  * (b) An inline `Policies` entry on the task role allowing `secretsmanager:GetSecretValue` on `*`.
  * (c) An `AWS::SecretsManager::ResourcePolicy` granting the task role the owner secret.
  * (d) A referenced secret with a literal `SecretString: "sk_live_…"`. The value sits in the template while the task holds only a Ref.
  * (e) `EnvironmentFiles` (S3) on the service container.
  * (f) A second container with plain `PLATFORM_ZOOM_CLIENT_SECRET`.
* Also, `:76` only catches "another policy" when the logical id contains `AppSecret`.
* Scenario: PF-4b's or FilesPort's adapter row calls `taskRole.addManagedPolicy(...)` or adds a sidecar, and the CI check stays green. The row is marked breaker on secrets.
* Fix: in `secretReadFindings`, read the role's own `Policies` and `ManagedPolicyArns` (refuse any AWS-managed policy with secretsmanager read, or simply any managed policy on a task role) and any `SecretsManager::ResourcePolicy`. Match by the secret resources' ids, not by a name pattern. In `taskSettingFindings`, apply the name rules to every container of every task definition, refuse `EnvironmentFiles`, and require each referenced secret to have no `SecretString`. Add one fail case per gap in `service.test.ts`.

**M2. The service runs pg-boss as `xr_app`, which cannot create pg-boss's schema, so the service as defined will not start. Question 4 calls this "not known", but the code answers it.**
* Where: `lib/service.ts:32-35, 91-92, 127`; `lib/service-checks.ts:90`.
* Evidence:
  * `api/src/platform/jobs/platform-jobs.ts:45` starts pg-boss on `DATABASE_URL`.
  * `api/src/platform/jobs/pgboss-jobs.ts:1-2,111` says "pg-boss creates and migrates that schema itself at start". `node_modules/pg-boss/dist/plans.js:205` runs `CREATE SCHEMA IF NOT EXISTS`.
  * PF-12's migration gives `xr_data`/`xr_app` table rights on `public` only, with no CREATE on the database (`prisma/migrations/20261116013000_pf12_firm_walls/migration.sql:26-46`).
  * `firm-scope.ts:291-292` ("production gives the app role its own secret" = `APP_DATABASE_URL`) and `firms.ts:41-43` ("on the owner's address") both show that PF-12/PF-14's code expects `DATABASE_URL` to stay the owner's address inside the API process.
* Scenario: on PF-8c's first deploy, `onApplicationBootstrap` throws with permission denied for the database. The circuit breaker then rolls back, every time.
* The cause is a conflict between the row's wording ("the service runs as the app role that owns no table") and the team's code. Under AGENTS.md rule 2 that conflict goes to the lead or founder; the PR should not settle it, and should not leave it as "not known".
* Fix (no new scope here): write `screens/PF-8b/challenge.md`, or update the PR's question 4, with this evidence and the two options:
  * (1) Owner address in `DATABASE_URL`, app role in `APP_DATABASE_URL`. The walled connection is still `xr_app`. Change `roleFindings` to assert `APP_DATABASE_URL` is the app's secret and the owner's secret appears only in the migration task and that single slot.
  * (2) Keep app-only, and name a row before PF-8c that gives the jobs schema an owner or connection of its own.
* Also add it to README's "Not here" list (`README.md:42`) so PF-8c does not find it at deploy.

## Minors
* **m1** `.github/workflows/deploy-synth.yml:17`, `test/estate.test.ts:167`. The new path is outside the row's "Touch: deploy/cdk/** only" and changes PF-8a's Done-when ("runs only when deploy/ changes"). **Already resolved in `28bc3e195`**, which reverts the line and proposes it to the lead.
* **m2** `lib/service.ts:85-90`, README:36. "A random placeholder, which the app refuses" is not guaranteed:
  * The default generated string is 32 printable characters with at least one punctuation mark.
  * It can pass `PLATFORM_BOLDSIGN_API_KEY` (`[A-Za-z0-9+/=_-]{16,512}`) or `PLATFORM_ZOOM_CLIENT_ID` (`[A-Za-z0-9_-]{8,128}`) when the punctuation drawn is only `+/=_-` (unlikely, but possible).
  * Fix: `generateSecretString: { secretStringTemplate: '{"placeholder":"supply at deploy"}', generateStringKey: "nonce" }`. JSON fails every loader rule.
* **m3** `test/service.test.ts:153-161`. "Synth still needs no keys" has a pass but no fail case, so it is unproven that `manifest.missing` lists a lookup. Fix: synth a throwaway stack with `HostedZone.fromLookup` and assert `missing` is non-empty.
* **m4** `lib/service.ts:103, 169, 184-185`. Some values are neither sourced nor labelled Sample: OTP-only second factor (`sms: false`), `minHealthyPercent: 100`, health-check interval 15 s, deregistration delay 30 s. Fix: label them Sample (README too).
* **m5** README:39. "`-c xr:domain=<name>` changes the base", but `npm run synth` is `node bin/app.ts` and takes no `-c`, and the CLI is deliberately never run. Fix: name the way it actually works (`CDK_CONTEXT_JSON='{"xr:domain":"…"}' npm run synth`), or read an env var in `bin/app.ts`.

## Checked and holding
* Each Done-when line has a passing test on both stacks and a failing broken copy:
  * PLATFORM_ENVIRONMENT missing or set to `local`.
  * Two tasks over two zones (1 task fails; one zone fails; unresolvable subnets fail closed).
  * HTTP redirect only (forwarding default action fails, as does a forwarding listener rule, a TLS 1.0 policy, or no certificate).
  * Wildcard (apex-only certificate fails; record pointing elsewhere fails).
  * Owner vs app (swapped secrets fail; missing migration task fails).
  * DKIM, SPF, DMARC.
  * Three separate pools.
* Except for M1, none of these checks is trivially satisfiable.
* Synth needs no keys or lookups, and every account stays `unknown-account`.
* No conflict with PF-8a's tests. Region stays `ca-central-1` everywhere.
* The open PR #2725 conflict (question 1) is correctly left for the lead.
* Not checked: anything only a real deploy can show (PF-8c).

## Re-review (afb1f3c)

Verdict: Approve

Scope: the new commits only, `git diff efeb004..afb1f3c`. 28bc3e1 reverts the workflow line; afb1f3c fixes M1, M2 and the breaker's findings. Run in deploy/cdk with AWS keys unset and the CDK CLI never called: `npm run synth` exits 0, `npm test` 54/54 pass. I re-ran my first-round mutation probes (scratchpad script) against the new checks.

**M1: resolved.** Every gap I listed is now found on the production template:
* a managed policy on the task role;
* an inline role policy;
* a secret resource policy;
* a literal `SecretString`;
* an environment file;
* a sidecar's plain secret.

Dynamic `{{resolve:…}}` references and key grants without `kms:ViaService` are caught as well. Each has a fail case in `test/service.test.ts` (the "break M-2" and "break M-1, review M1" tests). The previous checks would not produce any of the strings those tests assert, so each test fails without its fix.

**M2: resolved, and escalated correctly.** The service now has `APP_DATABASE_URL` set to `xr/<stage>/APP_DATABASE_URL` (requests run walled as `xr_app`). Its `DATABASE_URL` is the owner's address, which pg-boss needs. The migration task holds only the owner's address.
* `roleFindings` fails on swapped secrets.
* `challenge.md` puts the conflict with the row's wording, the trade-off (the service process holds the owner credential) and the `xr_jobs` option to the tech lead, as AGENTS.md rule 2 requires.

**First-round minors:**
* m1 is reverted.
* m2 is fixed: the placeholder is now JSON.
* m3 now has a fail case.
* m4: values are labelled Sample.
* m5: README is corrected.

**New minors (none blocks):**
* **n1** `lib/service-checks.ts:133-147`: nothing asserts that the service's `DATABASE_URL` is the owner's. If it is set back to the app secret (the configuration that cannot start), the tests still pass (probe k). Fix: `if (s.get("DATABASE_URL") !== owner) out.push(…)`, plus a fail case.
* **n2** `lib/service-checks.ts:20,84`, `readsSecret`: the check reads `Action` only. On the task role, an `Allow` with `NotAction: "iam:*"` gives no finding (probe i), and neither does a glob such as `secretsmanager:*Value` (probe j). Fix: treat any `NotAction` Allow as a read, and match globs by turning them into a regex tested against `GetSecretValue`.
* **n3** `lib/service-checks.ts:108-112`, the `ROOT` pattern: its first alternative accepts any `arn:${Partition}…:root`. A key-policy decrypt grant to another account's root therefore passes (probe l). Fix: anchor it to `{"Ref":"AWS::AccountId"}`.
* **n4** `test/service.test.ts:208-211`: the m3 lookup proof counts any exception at synth as a pass. Fix: assert that the missing context is a hosted-zone lookup.
* Note: the extra test "the construct alone" was removed. It was not a Done-when line, so this is not a finding.

## Re-review (bd5a1ce)

Verdict: Approve

Scope: the new commits only, `git diff afb1f3c..bd5a1ce` (product/screens excluded). The `lib/service.ts` changes touch comments only (the header now points to the README). Run in deploy/cdk with AWS keys unset and the CDK CLI never called: `npm run synth` exits 0, `npm test` 54/54 pass. My mutation probes a–l (scratchpad script) all produce a finding now.

Each fix and the fail test that proves it:
* **n1 fixed.** `roleFindings` now requires the service's `DATABASE_URL` to be the owner's. Fail case: `t3` in the owner/app test. Probe k is now caught.
* **n2 fixed.**
  * IAM globs are matched as globs against `GetSecretValue`, and any Allow with `NotAction` is a finding.
  * Fail cases: `secretsmanager:*SecretValue` and `NotAction: "iam:*"` in the "break M-2" test. Probes i and j are now caught.
* **n3 fixed.**
  * `ROOT` is anchored to this account's `AWS::AccountId`, and `kms:ViaService` must name Secrets Manager in ca-central-1.
  * Fail case: a `999999999999:root` principal with `kms:Dec*`. Probe l is now caught.
* **Breaker RM-1 closed.** A credential in a command, the log settings or any other task-definition field is a finding. Fail case: the migration `Command` holding `postgresql://o:pw@…`.
* **Breaker RM-2 closed.** Policies attached to users or groups, `AWS::IAM::RolePolicy`/`UserPolicy`/`GroupPolicy`, and an execution role that more than `ecs-tasks.amazonaws.com` can assume are all findings. Fail cases: `ToUser`, `RolePol`, and a trust principal of `{AWS: "*"}`.
* **n4 left as is (Minor, accepted).** The lookup test still passes on any synth error. It does not block.

No new findings.

## Re-review (adaa846)

Verdict: Approve

Scope: merge commit b01a20d, then `git diff b01a20d adaa846`. Run in deploy/cdk with AWS keys unset; the cdk and aws CLIs were never called. `npm run synth` exits 0 and writes 4 stacks (home and copy, per stage). `npm test` 83/83 pass, PF-8a's and PF-8rc's tests included.

**(a) The merge.**
* `git diff origin/main b01a20d` on `lib/app.ts` and `cdk.json` is empty, and so is the diff against the merge's main parent 19fdf28. So main's four flags are back and `buildApp` no longer reads `cdk.json` (Lead 13 ruling 1).
* No conflict markers anywhere in the package.
* The README keeps PF-8rc's text and adds PF-8b's section. "Feature flags (not set yet)" hands the flags finding to PF-8c-flags.
* The synthesized templates contain no Lambda or custom resource.

**(b) Each widening: is it the narrowest that admits PF-8b, and does it have a fail test?**
* **Per-service actions** (`checks.ts:324-330`, `allowedFor`):
  * A role trusted only by `ecs-tasks` gets the 8 ECS actions (ECR pull, secret read, SES send). The Backup role keeps `kms:Decrypt` only. A role trusted by mixed or several services falls back to `ROLE_ACTIONS`.
  * Fail tests: `iam:PassRole` on an ECS role; `ses:SendEmail` on the Backup role.
  * Narrow per trusting service, but not per role (r1).
* **Resource forms** (`own`, `tokenOnly`):
  * Allowed: a secret's Ref; a GetAtt to this stack's resources; a Join of literals with no `*` plus pseudo parameters, which must contain at least one Ref to a stack resource. `"*"` is allowed only for `ecr:GetAuthorizationToken`, and only on an ECS role.
  * Fail test: `"*"` for a secret read and for the token on the Backup role (exactly 2 findings).
  * The Join form does not pin the account (r2).
* **Digest-only parameter** (`digestOnly`):
  * Exempt only when the parameter is exactly `{Type: String, AllowedPattern: ^sha256:[a-f0-9]{64}$, Description}`.
  * Fail tests: removing the pattern is refused. My probe adds a `Default`, and that is refused as well.
  * This is the narrowest possible.
* **KMS grant to an ECS role** (`ecsExec`):
  * Admits exactly `kms:Decrypt`, `Resource: *`, and `kms:ViaService = secretsmanager.ca-central-1`, granted only to roles trusted by `ecs-tasks`.
  * Fail tests: no ViaService; the Backup role as grantee (exactly 2).
  * It admits the task role as well as the execution role (r3).
* **Types:** 15 types added, each one used by PF-8b and read by `service-checks.ts`. No Lambda, custom resource or IAM user or group type is added.
* **The Policies rule now applies to IAM types only.** This is needed because Cognito `UserPool.Policies` is a password policy. Any other type that carries `Policies` must first be added to `ESTATE_TYPES` by a reviewed PR, so nothing is lost.

**PF-8rc's existing fail tests still bite:**
* The two `backup.test.ts` edits are exact. The role count is `[1 backup, 4 ecs, 5 total]` rather than "1". The admin-policy mutation now targets the Backup role, because the first role found may be an ECS role with no `ManagedPolicyArns`.
* The "Escalate" role (`ecs-tasks` with `iam:*`) is still refused, because `iam:*` is not in `ECS_ACTIONS`.
* `lambda.amazonaws.com` trust is still refused.

**Staging runs as `test` (ruling 3):**
* `service.ts` gives both staging tasks `PLATFORM_ENVIRONMENT=test`, confirmed in `cdk.out`.
* The test checks the loader's live-key rule by text, then shows that staging set to `production` fails. It also refuses `PLATFORM_SAMPLE_SEED`.

**New minors (none blocks):**
* **r1** `checks.ts:327`: execution and task roles share `ECS_ACTIONS`.
  * Probe p1: `ses:SendEmail` on the execution role gives no finding in either check file. A task role reading a secret is still caught by `secretReadFindings`.
  * Fix: split the list into execution actions (ECR and secrets) and task actions (SES), keyed by the role's place in a task definition.
* **r2** `checks.ts` `own()`: a Join may carry a literal foreign account.
  * Probe p2: `ecr:BatchGetImage` on `arn:aws:ecr:ca-central-1:999999999999:repository/` plus a Ref passes `bypassFindings`, and the region guard does too.
  * Fix: require `{Ref: AWS::AccountId}` in the account position of a joined ARN.
* **r3** `checks.ts` `ecsExec`: a Secrets-Manager-scoped decrypt grant to the task role passes (probe p3). It is harmless today, because the task role cannot call `GetSecretValue`.
  * Fix: require the grantee to be some task definition's `ExecutionRoleArn`.
* **n4** (the lookup test passes on any synth error) is still open. It was already accepted.

## Re-review (c99d79a)

Verdict: Approve

Scope: `git diff HEAD~1 HEAD` at c99d79a, product/screens excluded. Run in deploy/cdk with AWS keys unset; the cdk and aws CLIs were never called. `npm run synth` exits 0; `npm test` 83/83 pass. I also probed the guards with my own scratchpad script.

Each fix, the fail test in `test/service.test.ts` ("PF-8b's widening … stays narrow", `b2` and `k`), and the probe I ran:

| Fix | Fail test | Probe |
|---|---|---|
| **r1:** separate lists, `ECS_EXEC_ACTIONS` and `ECS_TASK_ACTIONS`. A role used as both, or by neither, gets nothing. | `ses:SendEmail` on the execution role | p1 caught |
| **r2:** a joined ARN may not contain `*`, `?` or a literal 12-digit account. | the `999999999999` secret ARN | p2 (foreign ECR repository) caught |
| **r3:** key grants only to an `ExecutionRoleArn` of this stack, and only with a single principal key. | the task role as grantee; an extra `Service` key (`k` length 4) | p3 caught |
| **RB-1:** every `*RoleArn` and `*CallerArn` must be a role this stack defines. | the service's `TaskRoleArn` set to an outside Admin role | the migration task's outside `TaskRoleArn` is caught too |
| **RB-2:** no ECR repository policy and no Cognito `LambdaConfig`. | the repository policy (`RepositoryPolicyText`) | my probe: a Cognito trigger is caught |
| **Two-service trust:** reads every trust statement; a role trusted by two services gets no actions. | a second `ecs-tasks` statement on the Backup role (`allows kms:Decrypt, not on the allow list ()`) | none |

**PF-8rc's tests still bite.** All of them pass unchanged in this commit. Their assertions require findings to be present, and the narrowing only removes allowances.

**New minor (does not block):**
* **s1** The Cognito `LambdaConfig` half of RB-2 has no fail test in the suite. My probe shows the check works.
* Fix: add one `LambdaConfig` line to `b2`'s mutation and its expected string.

Still open and accepted: n4.

## Re-review (round 6, 23ef8fb)

Verdict: Approve

Scope: `git diff HEAD~1 HEAD` at 23ef8fb, product/screens excluded. Run in deploy/cdk with AWS keys unset; the cdk and aws CLIs were never called. `npm run synth` exits 0; `npm test` 83/83 pass.

* **The template is unchanged.** I synthesized HEAD~1 in a temporary worktree and compared it with HEAD: all four templates (staging and production, home and copy) are byte-identical. Turning the five public fields of `service.ts` into locals is a refactor only.
* **`imageFindings`** (`service-checks.ts:37-47`):
  * It requires exactly two task definitions, the service's and the migration's. It also requires exactly one repository and one parameter with the sha256 pattern, and every container's `Image` must equal CDK's exact `repositoryUriForDigest` form.
  * Its fail test ("re-break RC-1") must find exactly 4 problems: another registry on the migration task, a tagged sidecar image, a third task definition, and the count. Without the function the test cannot pass.
  * The dropped inline image test, which checked the digest Ref and the pattern, is fully covered by `imageFindings`: the pattern is enforced by selecting the one digest parameter.
* **s1 resolved.** `b2` now sets a Cognito `LambdaConfig` and expects `Cognito::UserPool): a Lambda trigger`. If that check were removed, the assertion would fail.
* **The dropped domain-parameter test is not a Done-when line.** The row's nine Done-when lines do not include it. It only backed the row's description ("the domain name is a parameter"), which `service.ts` still implements through `xr:domain`.
  * Minor **t1**: that sentence is now untested. If space allows later, one assertion that `buildApp({context:{"xr:domain":"example.org"}})` yields `*.example.org` would cover it again.

Still open and accepted: n4.

## Re-review (t1, head 30c06be53eaf6fbe90d2cebcb7625bd85c8c43ba)

Verdict: Approve

Scope: the test-only change, `git diff HEAD~1 HEAD -- '*.ts'`. `npm test` in deploy/cdk: 84/84 pass, with AWS keys unset and the CDK CLI never called.

* The new test covers t1. Production built with `xr:domain=example.org` passes `wildcardFindings` and `mailFindings` for `example.org`.
* The test can also fail: the default production template (`t0`) gives findings for `example.org`, so the check is not blind.
* Staging's `staging.<domain>` is not checked here. The same code path builds it, so this is acceptable.

Still open and accepted: n4.

## Re-review (merge with PF-23c, head d9bc77cd98f3f7422cbe1840f0a92c010e25cac5)

Verdict: Approve

Scope: the merge resolution only, read with `git show --remerge-diff HEAD`. Run in deploy/cdk with AWS keys unset; the cdk and aws CLIs were never called. `npm run synth` exits 0; `npm test` 93/93 pass (PF-8a, PF-8rc, PF-23c and PF-8b).

The merge is correct:
* **`ESTATE_TYPES` keeps both lists.** PF-8b's 15 types stay, followed by PF-23c's five (`Logs::LogGroup`, `Logs::MetricFilter`, `CloudWatch::Alarm`, `SNS::Topic`, `SNS::Subscription`).
* **The README keeps both sections**, PF-23c's "Logs and alarms" and then PF-8b's "The service". Main's line "Not decided yet: 81 flags" is the only thing removed, and PF-8b's "Feature flags (not set yet)" paragraph replaces it. Nothing else of main's is lost.
* **`git diff HEAD^2 HEAD`** on deploy/cdk shows PF-8b's own files only.
* **`estate.ts` wires both.** `AppService` is at line 77 and `Observability` at line 80. The production template contains the log group, metric filters, alarms and SNS topic as well as the ECS service.

New minor (not a merge defect; it is a gap between the two rows):
* **u1** The containers in both task definitions have no `LogConfiguration`. Yet PF-23c's README section and `estate.ts:27` say "PF-8b's task logs here" (`appLogs`).
* As merged, nothing ships the service's output, so PF-23c's metric filters and alarms would read nothing once deployed.
* Wiring it means `logging: ecs.LogDrivers.awsLogs({ logGroup: observability.appLogs })`. That adds `logs:CreateLogStream` and `logs:PutLogEvents` to each execution role, which `ECS_EXEC_ACTIONS` would then have to admit narrowly, on that log group only.
* Fix: the tech lead names the row that wires it, a PF-8b follow-up or PF-8c, before any deploy. Until then, correct the README sentence.

Still open and accepted: n4.
