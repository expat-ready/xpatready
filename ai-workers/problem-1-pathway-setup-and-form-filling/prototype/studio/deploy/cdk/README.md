# The Canadian estate as code (PF-8a, PF-8rc, PF-8b; synth only)

AWS CDK v2 in TypeScript (tech gate entry 8, `design/tech-gate-platform-front-office-2026-11-14.md`). It has its own package and lockfile, outside the app: the studio's `package.json` is untouched. **Nothing here is deployed.** There is no AWS account yet (P-551). Synth and the tests need no account, key or network.

| Stack | Region | Database | Files |
|---|---|---|---|
| `xr-staging` | ca-central-1 (pinned in code) | RDS PostgreSQL 18.3, single zone | `documents`, `exports`, `imports` |
| `xr-production` | ca-central-1 (pinned in code) | RDS PostgreSQL 18.3, Multi-AZ | the same |
| `xr-staging-copy`, `xr-production-copy` | ca-west-1 (pinned in code) | none: only the backup copy vault and its KMS key (PF-8rc) | none |

**Both stacks:**
* **Network:** a VPC over two zones. Public subnets hold only the load balancer, which comes with PF-8b. App subnets have egress through NAT. Data subnets are isolated, with no internet route.
* **Database:** encrypted with the environment's own KMS key (rotation on), deletion-protected, automated backups kept **35 days** with point-in-time restore, `rds.force_ssl=1`, `log_error_verbosity=terse`. Its admin password is generated into Secrets Manager and is never in code or in the environment.
* **Buckets:** all public access blocked, versioned, KMS-encrypted, and a policy that refuses plain HTTP. Old versions expire after 35 days.
* **Backups (PF-8rc, `lib/backup.ts`):** an AWS Backup plan takes the database and the three buckets every day at 07:00 UTC (Sample time) into the home vault and keeps them 35 days. Each backup is copied to the stage's vault in ca-west-1 and kept 35 days there. Each vault has its own KMS key and a vault lock in **governance mode** with a 35-day minimum. Each vault's access policy denies, to every principal, removing the lock, deleting a recovery point, shortening its lifecycle and deleting the vault. Changing the lock is not denied there (a first deploy might set the policy before the lock), but no role in the code may do it. Limit: in governance mode an account administrator, the root user or a deploy can replace the policy and then lift the lock. Each vault key's policy denies its deletion and disabling. The home stack is deployed after its copy stack, and names the copy vault by its fixed name, so there is no cross-region reference.
* **Sizes:** instance sizes and storage are **Sample**, because no load has been measured.

## Run (in this folder)
```bash
npm ci --ignore-scripts
npm test                                                    # assertion tests: each check passes on the real stacks and fails on a broken one
npm run synth                                               # the app alone writes cdk.out/ (ignored); no CLI, so no STS lookup
```
Never run `npx cdk synth`: the CLI looks up the account through STS when it finds AWS credentials. Telemetry is off in three places: `CDK_DISABLE_CLI_TELEMETRY=true` for the CLI (if a deploy row ever uses it), and `versionReporting: false` plus `analyticsReporting: false` for template metadata.

## The checks (`lib/checks.ts`, `test/estate.test.ts`)
* **Region guard:** it is fed every stack of the app, nested ones included (`allStacks`). Every stack must be in ca-central-1, and nothing in a template (resources, parameters, outputs) may name another region. An S3 replication rule must target a bucket inside the scanned stacks, because a bucket ARN carries no region, and multi-region resource types are refused. The only exception is `REGION_ALLOW` (PF-8rc): the backup plan may name ca-west-1, and a ca-west-1 stack may hold only a KMS key, its alias and a backup vault.
* **Database subnets:** no route leaves them and they hand out no public addresses (`dataRouteFindings`).
* **Database:** private, encrypted, deletion-protected, 35-day backups, TLS forced, terse logs. It sits in isolated subnets only.
* **Buckets:** public access blocked, versioned, KMS-encrypted, plain HTTP refused.
* **Backups (PF-8rc, `test/backup.test.ts`):** the plan is daily, covers the database and every bucket, keeps 35 days and copies only to ca-west-1, into a vault one of the scanned stacks defines, kept 35 days (`backupFindings`). Every vault has its own key, a 35-day governance lock and the deny policy, and its key cannot be deleted (`vaultFindings`). Permissions are checked against **allow lists**, not a list of forbidden actions (`bypassFindings`, `resourcePolicyFindings`, `typeFindings`):
  * a role, user, group or policy may allow only the actions in `ROLE_ACTIONS` (today `kms:Decrypt`);
  * a role may be assumed only by a service in `TRUSTED_SERVICES` (today AWS Backup);
  * only AWS Backup's own managed policies may be attached, written plainly;
  * key and vault policies may allow only this account's root;
  * every resource type must be in `ESTATE_TYPES`;
  * an allowed action must name a resource this stack defines, and a policy attaches only to this stack's roles;
  * bucket policies may only deny;
  * a policy built from template functions (`Fn::If` around a value, a statement or the whole document, `Fn::Split`, a JSON string, `NotAction`) cannot be read, and is refused;
  * a resource may not refer to a template parameter, because a deploy can override its value.

  **Not checked** (known limits, PR review covers them): properties that send data or notices to another account, such as bucket inventory, vault notifications or a database's associated roles.

  Widening any list takes a reviewed PR. The copy target must be exactly this account's copy vault. Values whose region cannot be read from the template (Fn::Sub with variables, imports, SSM references) are refused, and a multi-region or replica key is refused.
* **Unconfirmed** (the AWS documentation site is unreachable from the build lane): the contents of AWS Backup's managed policies; that a vault access policy can deny each listed action, binds the root user, and leaves AWS Backup's own 35-day expiry working; and the S3 policy's path. The cloud drill proves these.
* **Availability:** production is Multi-AZ; staging is single-zone (cost, P-562).
* **CI job:** `.github/workflows/deploy-synth.yml` runs on pull requests that change this folder, and never in a merge-queue batch. It is report-only until measured green (P-717 (b), P-772 (a)).

## The service (PF-8b, `lib/service.ts`, checks `lib/service-checks.ts`, tests `test/service.test.ts`)
* **Image:** an ECR repository per stage (immutable tags, scan on push, the stage's KMS key). The service runs PF-7's image **by digest only**: the template parameter `ImageDigest` (`sha256:` + 64 hex) that PF-8c's deploy fills.
* **Service:** ECS Fargate, **2 tasks** (Sample size 1 vCPU, 2 GB) in the app subnets of two zones, no public address, the deployment circuit breaker with rollback (PF-8c proves it). Health check `/api/health/live`.
* **Load balancer:** internet-facing, public subnets, **HTTPS only** with `ELBSecurityPolicy-TLS13-1-2-2021-06` (TLS 1.2 and 1.3). Port 80 answers with a 301 redirect to HTTPS and nothing else. The tasks accept traffic only from the load balancer.
* **Settings:** `PLATFORM_ENVIRONMENT` is set explicitly: `production` in production, `test` in staging, so staging refuses a live Stripe key (Lead 13 ruling 3). `PLATFORM_IDENTITY=cognito`; `PLATFORM_SAMPLE_SEED` is never set. The Cognito pool and client ids and `PLATFORM_SES_REGION` are plain settings. Every other value PF-24's loader requires is a Secrets Manager secret `xr/<stage>/<NAME>`, created with a random placeholder that the app refuses, and **supplied at deploy** (SA-8-1, `../RUNBOOK-secrets.md`). The test reads the loader's own list (`api/src/platform/config/settings.ts`), so a new required or secret setting fails here until the task supplies it (on the next change to this folder: the CI job does not watch `settings.ts`; proposed to the tech lead in #2748).
* **Who reads a secret:** only each task definition's execution role, and only the secrets its own task uses. The task role reads none (it may only send mail through SES).
* **Two database roles (PF-12, as the team's code has it):** the one-off migration task (`prisma migrate deploy`) holds `xr/<stage>/DATABASE_OWNER_URL`, the table owner's address, as `DATABASE_URL`. The service runs every request as the app role `xr_app` (owns no table) from `xr/<stage>/APP_DATABASE_URL`. Its `DATABASE_URL` is the owner's address too, because the job runner (pg-boss, `platform-jobs.ts`) connects with it and creates its own schema; a jobs role of its own is a question for the tech lead (`product/screens/PF-8b/challenge.md`).
* **Firm addresses (PF-25, P-607 (2)):** a hosted zone per stage (production `expatready.com`, staging `staging.expatready.com`; the context key `xr:domain` changes the base: `buildApp({ context: { "xr:domain": … } })`, or `-c` for PF-8c's deploy), `*.<domain>` pointing at the load balancer, and a DNS-validated wildcard certificate `*.<domain>` on the HTTPS listener. The output `NameServers` lists the NS records to add at the parent: at the registrar for production, in the production zone for staging.
* **Mail (PF-19b):** an SES identity for the stage's domain with DKIM (three CNAMEs published), MAIL FROM `mail.<domain>` with its SPF record (the apex SPF is left alone), and DMARC `p=none; adkim=s; aspf=r` (Sample: monitor first).
* **Sign-in (PF-4b, PF-4s, PF-4p):** three separate Cognito pools (`staff`, `own-staff`, `clients`), each with its own app client. Both staff pools require two-step sign-in (P-567). The clients' pool has it optional (not known: PF-4p decides). No self sign-up; deletion protection on. The password policy is Sample.
* **Checked beyond the row (break and review rounds):** nothing public but the load balancer on 80 and 443; no principal but an execution role reads a secret, in any grant form (inline, managed, resource policy, glob); the stack key decrypts for no one outside a service; no dynamic reference, literal secret value or environment file; pools are admin-create only, without OAuth, and the service signs staff in against the staff pool.
* **PF-8rc's guards, widened for PF-8b only (`lib/checks.ts`):** a role trusted by ECS tasks may allow only `ECS_ACTIONS` (image pull, its secrets, SES send); a Backup role keeps `kms:Decrypt`; `"*"` only for `ecr:GetAuthorizationToken`; a secret's `Ref` or an ARN joined from this stack's resources counts as its own resource; the one parameter allowed is a sha256-only digest; the key may let an ECS execution role decrypt through Secrets Manager only; PF-8b's resource types join `ESTATE_TYPES`.
* **Not here:** log groups and alarms (PF-23c), the deploy and smoke test (PF-8c), the task role's Cognito admin and bucket permissions (the adapter rows that use them).

## Feature flags (not set yet)
`cdk.json` sets four flags only. Two findings for the later row PF-8c-flags (Lead 13): synth reports the others as unset, and `npm run synth` and the tests build the App without reading `cdk.json`, so its flags reach only the CLI. Turning on the recommended set changes PF-8rc's template (the copy target's ARN form; a Lambda for the default security group), so that row reconciles PF-8rc's guards too.

## Next rows
* **PF-8c:** deploy from CI.
* **PF-8rc, held part:** the cloud drill (a restore to 15 minutes ago, recovery within 4 hours, evidence in `deploy/evidence/`), and the quarterly reminder. Both wait for the account (P-551).
