# AWS staging proof, 22 Nov 2026 (real domain mode)

Session: AWS staging proof (Opus 5.5, medium), reports to Lead 1. Branch `aws/2026-11-22-staging-proof` from origin/main 5d866c746.
Goal (P-785 (4)): staging in ca-central-1 with a real domain under lab.expatready.com; proofs R1.13, R1.15, R1.5, later R1.24.

## Step 0: reading the code (11:08 IST)

**Finding D1: the code does not build `lab.expatready.com` from `-c xr:domain=lab.expatready.com`.**
`deploy/cdk/lib/service.ts` line 76: `const domain = stage === "production" ? base : \`staging.${base}\``. So for staging:
* `-c xr:domain=lab.expatready.com` builds zone **`staging.lab.expatready.com`**, certificate `*.staging.lab.expatready.com`,
  firm addresses `<firm>.staging.lab.expatready.com`, and Cloudflare needs 4 NS records named **`staging.lab`** (not `lab`).
* `-c xr:domain=expatready.com` builds `staging.expatready.com` (NS records named `staging`).
* Exactly `lab.expatready.com` needs a code change (a staging host that is not prefixed), a PR through review.
The README (line 77) says "a new staging domain needs only `-c xr:domain=<it>`": true for the base, but the `staging.` prefix is added.
Choice for Lead 1 / the founder: (a) `staging.lab.expatready.com`, no code change, fastest (recommended for today);
(b) `staging.expatready.com`, no code change; (c) exact `lab.expatready.com`, needs a PR first.

Other facts from the code: the `OnCallEmail` parameter has no default (a deploy without it fails); the earlier deploy's value
is read from the stack's parameters at step 1 (placeholder, P-782 undecided: flagged).

## Step 1: read-only survey (11:12 IST): done, nothing changed

**Sign-in:** Claude in Chrome was not signed in (11:10); Lead 1 pointed to the app's built-in browser, where the founder's
root sign-in carries over. All AWS work runs there, in CloudShell `ca-central-1`.
**Decision (Lead 1, 11:1x, answer "a"):** staging domain `staging.lab.expatready.com` (`-c xr:domain=lab.expatready.com`,
no code change); Cloudflare NS records named `staging.lab`.

Evidence (CloudShell, 22 Nov 11:10-11:12 IST):
```
account 581508167097, region ca-central-1
ca-central-1: xr-staging UPDATE_COMPLETE 2026-11-21T14:25:02Z; CDKToolkit CREATE_COMPLETE
ca-west-1:    xr-staging-copy CREATE_COMPLETE; CDKToolkit CREATE_COMPLETE
xr-staging parameters: AppImageDigest sha256:ed1b52f0868a4d2e…e39595; OnCallEmail = the founder's alias address (placeholder, P-782 open)
xr-staging outputs: LoadBalancerHost xr-staging-app-172347972.ca-central-1.elb.amazonaws.com (no-domain mode)
ECS service xr-staging-AppService…: desired 0, running 0, task definition :2
RDS xr-staging-database…: available, db.t4g.medium, PostgreSQL 18.3
ECR xr-staging-studio: one image, tag bfd1b2de1, sha256:ed1b52f0…, pushed 2026-11-21T14:22Z (built before PF-8b F4 #2850)
CodeBuild: no project, no CodeBuild role (deleted after the 21 Nov build)
NAT gateways 1, load balancer xr-staging-app, 3 public IPv4 addresses, 13 secrets in Secrets Manager
```
**What waits:** the image on ECR predates PF-8b F4 (the pf12_firm_walls migration fix): main's head needs a new image, which on
21 Nov was built by a CodeBuild project with its own service role, approved by the founder and deleted after. That needs the
founder's approval again. The failed `pf12_firm_walls` migration must be marked rolled back before migrating (21 Nov plan).
**Hourly cost now (estimate from list prices, ca-central-1; Cost Explorer not read):** about **US$0.18/h** idle (RDS
db.t4g.medium ~0.09, NAT ~0.05 + data, load balancer ~0.025, 3 public IPv4 ~0.015, 0 tasks).
**Added by the domain move:** a Route 53 hosted zone US$0.50/month; ACM certificate free; SES identity free; the load balancer
is replaced (CDK-named in domain mode), same price. **Two tasks later:** ~US$0.11/h. **CodeBuild:** ~US$0.01-0.02 per minute of build.

## Step 2: domain move (track A) and image build (track B), from 11:13 IST

**Checkout in CloudShell:** `~/xr-setup.sh origin/main` → 5d866c7464957f96551fefa2d7a9fab59e4c7a76 (2026-11-22 05:31Z), Node v22.23.5.
Script `~/d-cdk.sh diff|deploy <tasks> <digest>` (copy of 21 Nov `p2-cdk.sh` with `-c xr:domain=lab.expatready.com` and no cert ARN;
on-call address read from the stack, never printed).

**Diff (`cdk diff`, tasks 0, digest sha256:ed1b52f0…, rc=0), summary:**
* Added: Route 53 hosted zone, SES email identity + 3 DKIM CNAMEs + MAIL FROM MX/TXT + DMARC TXT, ACM wildcard certificate,
  the `*.staging.lab.expatready.com` alias record, the task role's SES send policy (IAM statement change).
* Changed in place: the three Cognito pools and two app clients (WebAuthn relying party now the domain).
* Replaced: the task definition (container settings: address suffix) and the load balancer (no fixed name in domain mode),
  its two listeners follow. Data (RDS, buckets, secrets, logs) untouched.
* Outputs: `LoadBalancerHost` removed, `NameServers` added.

**Deploy A started 11:15 IST** (`d-cdk.sh deploy 0 sha256:ed1b52f0…`, nohup, log `~/d-deploy-0.log`).
* Zone `staging.lab.expatready.com` = `/hostedzone/Z0301963960X9VWH68EH`, name servers
  `ns-1430.awsdns-50.org`, `ns-871.awsdns-44.net`, `ns-440.awsdns-55.com`, `ns-1678.awsdns-17.co.uk`: **sent to Lead 1 11:1x**
  for 4 NS records named `staging.lab` in Cloudflare.
* 11:17 IST: stack 7/23; certificate `arn:aws:acm:ca-central-1:581508167097:certificate/2c5572c6-ee3d-4a7e-b48d-e9ca2ae5736e`
  PENDING_VALIDATION (waits for the delegation).

**Track B (image build):** the founder approved a temporary build project and its service role (relayed by Lead 1, ~11:2x).
This session's permission check **refused `iam create-role`** because the approval reached it only through another session,
not typed here. Nothing was created. Waits for the founder's own approval in this session (or his own click).
* **11:3x IST: the founder approved B typed in this session** ("Approve, delete after"; "I approve: create the temporary CodeBuild
  role xr-staging-image-build and project, build main, delete both after"). Created from the 21 Nov files (`~/cb`): role
  `arn:aws:iam::581508167097:role/xr-staging-image-build` (trust codebuild.amazonaws.com, SourceAccount condition; inline policy:
  its own log group, `ecr:GetAuthorizationToken`, push/pull on `xr-staging-studio` only), project `xr-staging-image-build`
  (standard:7.0, small, 30 min timeout). Build `xr-staging-image-build:1b240947-3537-4025-a6ed-263b0f336469` started 11:35:57 IST
  on SHA 5d866c7464957f96551fefa2d7a9fab59e4c7a76. Both are deleted after the build (recorded below).
* 11:21 IST: stack UPDATE_IN_PROGRESS 18/23, waiting on the certificate; Lead 2 (now current Lead) holds the NS values and adds
  them in Cloudflare after the founder's approval in its session.
* Build 1b240947 **FAILED** at 11:36 IST in BUILD: `cd: can't cd to src`. Root cause: CodeBuild keeps the working folder
  between phases, so the project's stored buildspec (`cd src` in both pre_build and build) changes folder twice; the 21 Nov
  `~/cb/buildspec.yml` (one `cd`, tag from `$TAG`) is the version that built. Fix: same project, `--buildspec-override` with
  that file, `TAG=5d866c746`. Build `xr-staging-image-build:64818f1b-a640-45a8-a435-2455d2eebef0` started 11:38 IST: in BUILD at 11:39.
* Build 64818f1b **SUCCEEDED** 11:41 IST. Image `xr-staging-studio:5d866c746` =
  **`sha256:dabc0523c90a1c8d99ea9a84820d827482c55488b90d47b88ef8ed79ba179769`**, pushed 2026-11-22T06:11:05Z, 325,461,024 bytes.
* **Deleted 11:42 IST** as approved: project `xr-staging-image-build` (`delete-project` ok; `list-projects` empty), the role's inline
  policy and role `xr-staging-image-build` (`get-role` → NoSuchEntity). Build logs stay in `/aws/codebuild/xr-staging-image-build`.
* 11:42 IST: stack still UPDATE_IN_PROGRESS, certificate PENDING_VALIDATION (NS records not yet in Cloudflare).

## Step 2b: certificate issued, deploy A failed, stack UPDATE_ROLLBACK_FAILED (11:47-11:50 IST)

* NS records in Cloudflare at 11:4x IST (Lead 1 on the founder's typed word). Certificate **ISSUED 11:47:10 IST** (polled every 20 s).
* **Deploy A failed** (`deploy tasks=0 rc=1`, 06:17:21Z). Events (`describe-stack-events`):
  * 06:17:12Z `AppLbHttps240768BC` UPDATE_FAILED: "The following target groups cannot be associated with more than one load
    balancer: …targetgroup/xr-sta-AppLb-N8GK4CMNJQJE/…". **Root cause (code):** leaving no-domain mode replaces the load balancer
    (the fixed name `xr-staging-app` is dropped), so the HTTPS listener is replaced on the new load balancer, but its target group
    is not replaced; CloudFormation creates the new listener before deleting the old one, and an ALB target group may belong to
    one load balancer only. Any switch that replaces the load balancer hits this (it is not specific to this account).
  * Rollback 06:17:15-17Z: the three Cognito pools UPDATE_FAILED: "Cannot set WebAuthn factor configuration to SINGLE_FACTOR if
    MFA is required and WebAuthn is an allowed first auth factor". **Root cause:** the forward update (05:45Z, UPDATE_COMPLETE)
    turned on the domain's passkey settings; Cognito refuses the no-domain values on the way back, so the rollback cannot undo them.
  * Stack **UPDATE_ROLLBACK_FAILED** 06:17:18Z. Nothing is serving (0 tasks); RDS, buckets, secrets and logs untouched.
* **Recovery options (asked of Lead 2, nothing done yet):**
  1. `aws cloudformation continue-update-rollback --stack-name xr-staging --resources-to-skip` the three pools: the stack returns to
     no-domain mode (UPDATE_ROLLBACK_COMPLETE), pools keep the domain settings (the next deploy sets the same). The rollback's
     cleanup **deletes the resources created minutes ago**: new load balancer, zone `staging.lab.expatready.com`, certificate,
     SES identity and records. A new zone gets **new name servers**, so the 4 Cloudflare records must be changed after the redeploy.
  2. Forward fix for the target group, either (a) staging only, today: delete the old load balancer's HTTPS listener by hand just
     before redeploying (0 tasks, nothing served; CloudFormation's later delete of it finds it gone), or (b) a code row (PF-8b):
     replace the target group with the load balancer (or keep a fixed load balancer name in domain mode), so production and
     future switches are clean. Recommended: (a) today plus (b) as a row.

## Step 2c: recovery and second domain deploy (11:5x-12:12 IST)

* **Founder's approval typed in this session (~11:5x IST):** "You do have my approval, so go ahead and do the job and inform these
  two and listen to lead two".
* 11:54:51 `continue-update-rollback --resources-to-skip AppPoolstaff2F6C69E5 AppPoolownstaff0D412439 AppPoolclientsE77529FE`
  ("Resource skipped during UpdateRollback"). Cleanup deleted the new LB, certificate, SES identity and records; the zone's delete
  failed twice (12:03, 12:06: `HostedZoneNotEmptyException`): the certificate's DNS validation CNAME
  (`_461fd8b3….staging.lab.expatready.com`, TTL 300) is written by CloudFormation's certificate handler, not a stack resource, so
  the stack never deletes it. Deleted by hand 12:07:33 (`change-resource-record-sets` DELETE, PENDING). **Stack
  UPDATE_ROLLBACK_COMPLETE 12:08:48 IST**; zone Z0301963960X9VWH68EH gone (`NoSuchHostedZone`). Pools keep the domain passkey settings.
  * Also for the PF-8b row: a domain stack that rolls back or is deleted leaves this CNAME and fails to delete its zone.
* **Target group freed without deleting anything (12:10:34):** the old HTTPS listener on `xr-staging-app` changed from
  `forward` to a fixed 503 (`staging-moving-to-domain`); target group `xr-sta-AppLb-N8GK4CMNJQJE` now on 0 load balancers.
  The listener is kept so a rollback still has it; CloudFormation deletes it after a successful update. ARN in `~/d-old-listener.txt`.
* **Deploy 2 started ~12:10 IST:** `d-cdk.sh deploy 0 sha256:dabc0523…` (main 5d866c746 image), log `~/d-deploy-0.log`, rc in
  `~/d-deploy-0b.rc`. New zone **Z10188462TUE6DHK5P3ZY**, name servers `ns-796.awsdns-35.net`, `ns-1711.awsdns-21.co.uk`,
  `ns-28.awsdns-03.com`, `ns-1442.awsdns-52.org`: **sent to Lead 2 12:1x** to replace the 4 Cloudflare records.

## Step 3: domain stack complete; migration blocked by a code fault (12:21-12:26 IST)

* NS records replaced in Cloudflare at 12:2x IST (Lead 2, founder's typed yes in its session). **Stack `xr-staging` UPDATE_COMPLETE
  12:21:45 IST** (`cdk deploy` total 650 s, rc 0) with `xr:domain=lab.expatready.com`, image `sha256:dabc0523…` (main 5d866c746),
  0 tasks. Output `NameServers` = `ns-796.awsdns-35.net,ns-1711.awsdns-21.co.uk,ns-28.awsdns-03.com,ns-1442.awsdns-52.org`.
* `d-migrate.sh resolve` (task def `xrstagingAppMigrateFE01F052:3`, image `@sha256:dabc0523…`, task 835369d9…): exit **0**,
  "Migration 20261116013000_pf12_firm_walls marked as rolled back."
* `d-migrate.sh deploy` (task a082ba78…, 12:25 IST): exit **1**. "141 migrations found … Applying migration
  `20261116013000_pf12_firm_walls` … Error: P3018 … Database error code: 0LP01 … ERROR: role "xr_wall_reader" is a member of role
  "xr_admin"".
* **Root cause (code, PF-8b F4's migration on RDS PostgreSQL 18.3):** the loop at migration.sql line 89-107 runs
  `GRANT xr_admin TO xr_wall_reader` (`format('GRANT %I TO xr_wall_reader …', current_user)`); F4 expects RDS to refuse it
  (insufficient_privilege → fallback grants), but on this instance it **succeeds**. Line 112-113 then runs
  `GRANT xr_wall_reader TO xr_admin` because the admin is not yet a member of the reader: that would make a membership loop,
  which PostgreSQL refuses (0LP01). Prisma does not wrap this migration in one transaction, so statements before the error
  may have stayed applied; the migration is written to be re-run (roles and grants only when missing).
* **Effect:** no migration after pf12 runs, so the service cannot start on main's head: R1.5 (sign-in through the app) and the
  parts of R1.13 that need the running service wait on a code fix (proposed row **PF-8b F5**: make line 112-113 skip, or the
  line-91 grant not run, when the other grant already holds; prove on PostgreSQL 18 with a non-superuser CREATEROLE admin as on
  RDS). Before the rerun: `migrate resolve --rolled-back 20261116013000_pf12_firm_walls` again.
