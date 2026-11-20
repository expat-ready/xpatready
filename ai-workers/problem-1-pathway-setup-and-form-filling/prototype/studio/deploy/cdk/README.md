# The Canadian estate as code (PF-8a, synth only)

AWS CDK v2 in TypeScript (tech gate entry 8, `design/tech-gate-platform-front-office-2026-11-14.md`). It has its own package and lockfile, outside the app: the studio's `package.json` is untouched. **Nothing here is deployed.** There is no AWS account yet (P-551). Synth and the tests need no account, key or network.

| Stack | Region | Database | Files |
|---|---|---|---|
| `xr-staging` | ca-central-1 (pinned in code) | RDS PostgreSQL 18.3, single zone | `documents`, `exports`, `imports` |
| `xr-production` | ca-central-1 (pinned in code) | RDS PostgreSQL 18.3, Multi-AZ | the same |

**Both stacks:**
* **Network:** a VPC over two zones. Public subnets hold only the load balancer, which comes with PF-8b. App subnets have egress through NAT. Data subnets are isolated, with no internet route.
* **Database:** encrypted with the environment's own KMS key (rotation on), deletion-protected, automated backups kept **35 days** with point-in-time restore, `rds.force_ssl=1`, `log_error_verbosity=terse`. Its admin password is generated into Secrets Manager and is never in code or in the environment.
* **Buckets:** all public access blocked, versioned, KMS-encrypted, and a policy that refuses plain HTTP.
* **Sizes:** instance sizes and storage are **Sample**, because no load has been measured.

## Run (in this folder)
```bash
npm ci --ignore-scripts
npm test                                                    # assertion tests: each check passes on the real stacks and fails on a broken one
CDK_DISABLE_CLI_TELEMETRY=true npx cdk synth --quiet --no-notices   # writes cdk.out/ (ignored)
```
Telemetry is off in three places: `CDK_DISABLE_CLI_TELEMETRY=true` for the CLI, and `versionReporting: false` plus `analyticsReporting: false` for template metadata.

## The checks (`lib/checks.ts`, `test/estate.test.ts`)
* **Region guard:** every stack is in ca-central-1, and no resource names another region. The only exception is an allowance by resource type, which PF-8rc uses for the ca-west-1 backup copy.
* **Database:** private, encrypted, deletion-protected, 35-day backups, TLS forced, terse logs. It sits in isolated subnets only.
* **Buckets:** public access blocked, versioned, KMS-encrypted, plain HTTP refused.
* **Availability:** production is Multi-AZ; staging is single-zone (cost, P-562).
* **CI job:** `.github/workflows/deploy-synth.yml` runs on pull requests that change this folder, and never in a merge-queue batch. It is report-only until measured green (P-717 (b), P-772 (a)).

## Next rows
* **PF-8b:** the service on Fargate, its secrets and DNS.
* **PF-8c:** deploy from CI.
* **PF-8rc:** the AWS Backup plan with a copy in ca-west-1, plus the cloud drill. The drill is held until the account exists.
