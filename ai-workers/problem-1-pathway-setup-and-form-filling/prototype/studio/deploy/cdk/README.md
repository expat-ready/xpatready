# The Canadian estate as code (PF-8a, PF-8b; synth only)

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

## The service (PF-8b, `lib/service.ts`, checks `lib/service-checks.ts`, tests `test/service.test.ts`)
* **Image:** an ECR repository per stage (immutable tags, scan on push, the stage's KMS key). The service runs PF-7's image **by digest only**: the template parameter `ImageDigest` (`sha256:` + 64 hex) that PF-8c's deploy fills.
* **Service:** ECS Fargate, **2 tasks** (Sample size 1 vCPU, 2 GB) in the app subnets of two zones, no public address, the deployment circuit breaker with rollback (PF-8c proves it). Health check `/api/health/live`.
* **Load balancer:** internet-facing, public subnets, **HTTPS only** with `ELBSecurityPolicy-TLS13-1-2-2021-06` (TLS 1.2 and 1.3). Port 80 answers with a 301 redirect to HTTPS and nothing else. The tasks accept traffic only from the load balancer.
* **Settings:** `PLATFORM_ENVIRONMENT=production` and `PLATFORM_IDENTITY=cognito` are set explicitly. The Cognito pool and client ids and `PLATFORM_SES_REGION` are plain settings. Every other value PF-24's loader requires is a Secrets Manager secret `xr/<stage>/<NAME>`, created with a random placeholder that the app refuses, and **supplied at deploy** (SA-8-1, `../RUNBOOK-secrets.md`). The test reads the loader's own list (`api/src/platform/config/settings.ts`), so a new required or secret setting fails here until the task supplies it.
* **Who reads a secret:** only each task definition's execution role, and only the secrets its own task uses. The task role reads none (it may only send mail through SES).
* **Two database roles (PF-12):** the one-off migration task (`prisma migrate deploy`) holds `xr/<stage>/DATABASE_OWNER_URL`, the table owner's address. The service holds only `xr/<stage>/DATABASE_URL`, the app role's (`xr_app`, owns no table), under both `DATABASE_URL` and `APP_DATABASE_URL`.
* **Firm addresses (PF-25, P-607 (2)):** a hosted zone per stage (production `expatready.com`, staging `staging.expatready.com`; `-c xr:domain=<name>` changes the base), `*.<domain>` pointing at the load balancer, and a DNS-validated wildcard certificate `*.<domain>` on the HTTPS listener. The output `NameServers` lists the NS records to add at the parent: at the registrar for production, in the production zone for staging.
* **Mail (PF-19b):** an SES identity for the stage's domain with DKIM (three CNAMEs published), MAIL FROM `mail.<domain>` with its SPF record (the apex SPF is left alone), and DMARC `p=none; adkim=s; aspf=r` (Sample: monitor first).
* **Sign-in (PF-4b, PF-4s, PF-4p):** three separate Cognito pools (`staff`, `own-staff`, `clients`), each with its own app client. Both staff pools require two-step sign-in (P-567). The clients' pool has it optional (not known: PF-4p decides). No self sign-up; deletion protection on. The password policy is Sample.
* **Not here:** log groups and alarms (PF-23c), the deploy and smoke test (PF-8c), the task role's Cognito admin and bucket permissions (the adapter rows that use them).

## Feature flags
`cdk.json` sets every flag `aws-cdk-lib` recommends for a new app, at its recommended value (what `cdk init` writes). The app reads `cdk.json` itself (`CDK_CONTEXT` in `lib/app.ts`), so `npm run synth`, the tests and the CLI build the same template. A test fails when an upgrade brings a new recommended flag that is not set.

## Next rows
* **PF-8c:** deploy from CI.
* **PF-8rc:** the AWS Backup plan with a copy in ca-west-1, plus the cloud drill. The drill is held until the account exists.
