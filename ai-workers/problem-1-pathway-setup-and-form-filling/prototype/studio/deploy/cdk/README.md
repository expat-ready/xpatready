# The Canadian estate as code (PF-8a, PF-8rc; synth only)

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
  * a policy built from template functions (`Fn::If`, `Fn::Split`, a JSON string, `NotAction`) cannot be read, and is refused.

  Widening any list takes a reviewed PR. The copy target must be exactly this account's copy vault. Values whose region cannot be read from the template (Fn::Sub with variables, imports, SSM references) are refused, and a multi-region or replica key is refused.
* **Unconfirmed** (the AWS documentation site is unreachable from the build lane): the contents of AWS Backup's managed policies; that a vault access policy can deny each listed action, binds the root user, and leaves AWS Backup's own 35-day expiry working; and the S3 policy's path. The cloud drill proves these.
* **Availability:** production is Multi-AZ; staging is single-zone (cost, P-562).
* **CI job:** `.github/workflows/deploy-synth.yml` runs on pull requests that change this folder, and never in a merge-queue batch. It is report-only until measured green (P-717 (b), P-772 (a)).

## Not decided yet
* **CDK feature flags:** synth reports 81 that are not configured. They must be set before the first deploy, because flipping one later can replace resources. That choice is PF-8c's (review m5).

## Next rows
* **PF-8b:** the service on Fargate, its secrets and DNS.
* **PF-8c:** deploy from CI.
* **PF-8rc, held part:** the cloud drill (a restore to 15 minutes ago, recovery within 4 hours, evidence in `deploy/evidence/`), and the quarterly reminder. Both wait for the account (P-551).
