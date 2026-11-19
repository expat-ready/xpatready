# The Canadian estate as code (PF-8a)

AWS CDK v2 app for the Pathway Configurator's cloud estate. **Synth only: nothing here deploys, and no AWS account,
key or network call to AWS is needed.** Tooling outside the app (STANDARDS §1 gate entry 8): its own `package.json`
with exact versions and its own lockfile; the app's `package.json` is not touched.

| Stack | Region | Database | NAT gateways |
|---|---|---|---|
| `estate-staging` | `ca-central-1` | PostgreSQL 18.3, single-AZ (cost, P-562) | 1 |
| `estate-production` | `ca-central-1` | PostgreSQL 18.3, Multi-AZ | 2 |

Each stack: a VPC over `ca-central-1a` and `ca-central-1b` (public subnets for NAT only, private subnets for tasks,
isolated subnets for the database); one customer-managed KMS key with rotation; RDS PostgreSQL (the version
`prototype/studio/deploy/compose.test.yml` runs), private, encrypted, deletion-protected, 35-day automated backups
with point-in-time restore, `rds.force_ssl = 1`, `log_error_verbosity = terse`, a generated master secret encrypted
with the same key; three S3 buckets (documents, exports, imports) with public access blocked, versioning,
KMS encryption and a TLS-only policy. Everything stateful is retained if a stack is ever deleted.

Values marked **Sample** in `lib/environments.ts` (database instance class and storage) are placeholders until a
measurement sets them before the first deploy (PF-8b).

## Run
```
cd deploy/cdk
npm ci --ignore-scripts
npm run typecheck
npx cdk synth --quiet     # writes cdk.out/ (ignored)
npm test                  # region guard and data rules, each with a pass and a fail case
npm audit --omit=dev --audit-level=high
```
CI: job `deploy-synth` in `.github/workflows/skeleton.yml` runs the same steps on a ready pull request that changes
`deploy/`, with no AWS credentials.

## Tests
* `test/region.test.ts`: the region guard (C1-3). It runs `cdk.json`'s app as `cdk synth` does and checks that
  assembly, the one PF-8c deploys. It fails on any stack outside `ca-central-1`, any stack with no region pinned, any
  resource, log destination or output naming another region (the one exception: a `ca-west-1` copy in an AWS Backup
  plan, PF-8r), and refuses outright what can leave the region without naming it: S3 replication, multi-region access
  points, nested stacks and stack sets (a row that needs one extends the guard first).
* `test/estate.test.ts`: the database (private, encrypted, deletion-protected, 35-day backups, TLS only, terse errors),
  the buckets (public access blocked, versioned, KMS, plain HTTP refused), and availability (production Multi-AZ,
  staging single-AZ, two zones). Each rule passes on the real stacks and fails on a copy with exactly that property
  broken. The engine version is read from `compose.test.yml`, so a PostgreSQL bump on main turns this red.

## Next rows
PF-8b the service, secrets and DNS · PF-8c deploy from CI by OpenID Connect · PF-8r backups copy to `ca-west-1` and
the restore drill · AUD-2c the locked archive bucket.
