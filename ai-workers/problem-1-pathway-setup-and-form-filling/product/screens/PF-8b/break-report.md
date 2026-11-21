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
