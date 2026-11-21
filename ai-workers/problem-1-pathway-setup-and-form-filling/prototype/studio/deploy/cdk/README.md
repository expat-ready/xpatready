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
* **Region guard:** it is fed every stack of the app, nested ones included (`allStacks`). Every stack must be in ca-central-1, and nothing in a template (resources, parameters, outputs) may name another region. An S3 replication rule must target a bucket inside the scanned stacks, because a bucket ARN carries no region, and multi-region resource types are refused. The only exception is an allowance by resource type, which PF-8rc uses for the ca-west-1 backup copy.
* **Database subnets:** no route leaves them and they hand out no public addresses (`dataRouteFindings`).
* **Database:** private, encrypted, deletion-protected, 35-day backups, TLS forced, terse logs. It sits in isolated subnets only.
* **Buckets:** public access blocked, versioned, KMS-encrypted, plain HTTP refused.
* **Availability:** production is Multi-AZ; staging is single-zone (cost, P-562).
* **CI job:** `.github/workflows/deploy-synth.yml` runs on pull requests that change this folder, and never in a merge-queue batch. It is report-only until measured green (P-717 (b), P-772 (a)).

## Logs and alarms (PF-23c, `lib/observability.ts`, `test/observability.test.ts`)
* **Log group:** `/xr/<stage>/app` in each stack (so in ca-central-1), kept **90 days** (NFR5-14), retained if the stack goes. PF-8b's task definition sends the service's output here (`stack.observability.appLogs`).
* **Metric filters, not embedded metric format:** CloudWatch reads PF-23's EMF lines only through an EMF-aware shipper; the plain `awslogs` driver is not one. A metric filter reads the same JSON line whatever ships it. The filters read PF-23's field names; a test fails if `metrics.ts`, `log.ts` or the alert port renames them.
* **Alarms (thresholds Sample):** 5xx rate over 5 % for 10 minutes (at least 20 requests); 3 job failures in 15 minutes; a job older than the app's `STUCK_JOB_MS`; mail bounce rate over 5 % in an hour (at least 20 sent); and the first alert line of each kind: audit-write failure, chain break, stuck job, privacy clock, breach clock. No data counts as no incident.
* **Routing:** every alarm (and its recovery) goes to the SNS topic `xr-<stage>-on-call`, whose one subscription is the email in the deploy parameter `OnCallEmail`. That parameter has no default: the founder names the address, and a deploy without it fails.
* **Held for the AWS proof (P-782):** a test alarm reaching the on-call person. That needs the founder's account.

## Not decided yet
* **CDK feature flags:** synth reports 81 that are not configured. They must be set before the first deploy, because flipping one later can replace resources. That choice is PF-8c's (review m5).

## Next rows
* **PF-8b:** the service on Fargate, its secrets and DNS.
* **PF-8c:** deploy from CI.
* **PF-8rc:** the AWS Backup plan with a copy in ca-west-1, plus the cloud drill. The drill is held until the account exists.
