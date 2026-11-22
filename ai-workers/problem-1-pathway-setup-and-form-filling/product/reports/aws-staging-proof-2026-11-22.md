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

## Step 4: proofs that need no running service (12:27-12:29 IST), script `~/d-proof.sh`, output `~/d-proof-2026-11-22.txt`

Context line: `== proofs 2026-11-22T06:57:21Z, account 581508167097, ca-central-1, code main 5d866c746, image sha256:dabc0523…,
xr:domain=lab.expatready.com`; stack `UPDATE_COMPLETE 2026-11-22T06:41:29Z`. No secret value printed anywhere.

### TLS on the real domain
```
curl https://any-firm.staging.lab.expatready.com/api/health/live  →  http=503 ssl_verify=0 ip=15.157.177.223, curl exit=0
subject=CN=*.staging.lab.expatready.com   issuer=C=US, O=Amazon, CN=Amazon RSA 2048 M04   notAfter=Jun  7 23:59:59 2027 GMT
```
The certificate is public and verifies (no `-k`). 503 is the load balancer with **0 tasks** (the service cannot start until the
pf12 migration runs, Step 3). **HTTP 200 on a seeded firm: not yet (blocked by PF-8b F5).**

### R1.13 logs and alarms: **Pass for the AWS half; named gap: app-emitted metrics wait on PF-8b F5**
```
R1.13-1 /xr/staging/app 90            (retention 90 days, NFR5-14)
R1.13-2 streams: migrate/migrate/a082ba78… (today 06:54Z), migrate/migrate/835369d9… (today 06:52Z), studio/studio/d1695fed… (21 Nov)
R1.13-3 9 metric filters: Alert_audit_chain_break, Alert_audit_write_failed, Alert_breach_clock_near, Alert_job_stuck,
        Alert_privacy_clock_near, JobAge, JobFailures, MailBounced, MailSent, Requests, ServerErrors
R1.13-4 9 alarms, all OK, each AlarmActions=1 → arn:aws:sns:ca-central-1:581508167097:xr-staging-on-call
        (5xx-rate, job-age, job-failures, mail-bounce-rate also OKActions=1; the 5 alert-line alarms OKActions=0, as designed)
R1.13-5 on-call subscription: email, confirmed (True)
        set-alarm-state ALARM on xr-staging-job-failures at 2026-11-22T06:57:26Z rc=0
R1.13-6 06:57:26.683Z StateUpdate OK→ALARM; 06:57:26.717Z Action "Successfully executed action …xr-staging-on-call"
        06:57:46.147Z StateUpdate ALARM→OK;  06:57:46.179Z Action "Successfully executed action …xr-staging-on-call"
R1.13-7 SNS topic last 15 min: NumberOfMessagesPublished 2, NumberOfNotificationsDelivered 2, NumberOfNotificationsFailed 0
```
The task's output reaches the 90-day log group from today's tasks on main's image; the alarm fired and SNS delivered it to the
confirmed on-call subscription (2 of 2, 0 failed). The on-call address is still the stack's placeholder (P-782 open: flagged).
Gap: request, job and alert lines from the running app are not yet seen, because the service cannot start (Step 3).

### R1.15 secrets in a managed store: **Pass**
```
R1.15-1 service task def xrstagingAppTask7031B6E4:4, secrets (name → Secrets Manager secret):
        DATABASE_URL→xr/staging/DATABASE_OWNER_URL, APP_DATABASE_URL→xr/staging/APP_DATABASE_URL,
        PLATFORM_STRIPE_SECRET_KEY, PLATFORM_STRIPE_WEBHOOK_SECRET, PLATFORM_BOLDSIGN_API_KEY, PLATFORM_ZOOM_CLIENT_ID,
        PLATFORM_ZOOM_CLIENT_SECRET, PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN, PLATFORM_SECRET_BOX_KEYS,
        PLATFORM_SECRET_BOX_KEY_VERSION → xr/staging/<same name>   (10 secrets, all valueFrom ARNs)
R1.15-2 plain environment, names only: PLATFORM_SES_REGION, PLATFORM_ADDRESS_SUFFIX, PLATFORM_IDENTITY,
        PLATFORM_COGNITO_USER_POOL_ID, PLATFORM_ENVIRONMENT, PLATFORM_COGNITO_CLIENT_ID   (no secret setting among them)
R1.15-3 execution role xr-staging-AppTaskExecutionRole…, task role xr-staging-AppTaskTaskRole…
        migrate task def xrstagingAppMigrateFE01F052:3: secret DATABASE_URL→xr/staging/DATABASE_OWNER_URL; environment PLATFORM_ENVIRONMENT only
R1.15-4 every xr/staging/* secret encrypted with KMS key arn:aws:kms:ca-central-1:581508167097:key/5719e23a-… (the stage key)
R1.15-5 runtime read: today's migrate tasks (835369d9…, a082ba78…) received DATABASE_URL from Secrets Manager through the
        execution role and connected to RDS ("Datasource db … at xr-staging-database…:5432"; resolve exit 0)
```
Note: two older secrets outside the `xr/staging/` names, `expatready/staging/PLATFORM_STRIPE_SECRET_KEY` and
`expatready/staging/PLATFORM_BOLDSIGN_API_KEY`, are not referenced by any task definition (leftovers from 21 Nov): for Lead 2 to
decide on removal (not touched). Earlier R1.15 part "firms' keys encrypted" (21 Nov) stays as it was: no store holds sealed values yet.

### R1.5 staff sign-in on the real pool: **Blocked (named failure): the service cannot start until PF-8b F5 fixes the pf12
migration on RDS** (Step 3). The pools are in place with the domain passkey settings (stack UPDATE_COMPLETE); wrong code, expiry
and lock-out need the app's sign-in endpoint.

### Cost
0 tasks, unchanged: about US$0.18/h (RDS, NAT, load balancer, public IPv4) + Route 53 zone US$0.50/month. 2 tasks will add ~US$0.11/h.
Spent on this proof so far: CodeBuild two builds (~5 min small) < US$0.10.

## For PF-8b-f5: the exact P3018 log (CloudWatch `/xr/staging/app`, stream `migrate/migrate/a082ba78496d436b9260d593d2bece3b`)
Task def `xrstagingAppMigrateFE01F052:3`, image `xr-staging-studio@sha256:dabc0523c90a1c8d99ea9a84820d827482c55488b90d47b88ef8ed79ba179769`
(main 5d866c746), RDS PostgreSQL 18.3, migration role `xr_admin` (the instance's admin user, not a superuser). Two `prisma:warn`
OpenSSL-detection lines omitted (they precede every run, including the successful `resolve`).
```
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma/schema.
Datasource "db": PostgreSQL database "postgres", schema "public" at "xr-staging-databaseb269d8bb-rzdhp2v9sbgn.cfq4s6mq8oun.ca-central-1.rds.amazonaws.com:5432"
141 migrations found in prisma/migrations
Applying migration `20261116013000_pf12_firm_walls`
Error: P3018
A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve
Migration name: 20261116013000_pf12_firm_walls
Database error code: 0LP01
Database error:
ERROR: role "xr_wall_reader" is a member of role "xr_admin"
DbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E0LP01), message: "role \"xr_wall_reader\" is a member of role \"xr_admin\"", detail: None, hint: None, position: None, where_: Some("SQL statement \"GRANT xr_wall_reader TO xr_admin WITH INHERIT TRUE, SET TRUE\"\nPL/pgSQL function inline_code_block line 85 at EXECUTE"), schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("user.c"), line: Some(1787), routine: Some("AddRoleMems") }
```
Reading: the failing statement is migration.sql line 113 (`GRANT xr_wall_reader TO <current_user>`); the membership it collides
with is `xr_admin` → `xr_wall_reader` from line 91 (`GRANT xr_admin TO xr_wall_reader`), which RDS allowed. State left: the
migration is recorded failed again; before the rerun, `prisma migrate resolve --rolled-back 20261116013000_pf12_firm_walls`.
Service held at **0 tasks** until f5 merges (Lead 2, 12:3x).

## Step 5: staging database state before PF-8b-f5 (#2968, head 7e5b71a21), read only, 13:1x IST
Read from the VPC CloudShell (`xr-staging-db`) with `psql`, the owner address read from Secrets Manager into a shell variable
and unset after (never printed; the app-only `uselibpqcompat` option dropped, `sslmode=require` kept). No write.
```
pg_roles like 'xr\_%':   xr_admin | super f | createrole t | bypassrls f | login t        (1 row: no xr_data, xr_app, xr_wall_reader …)
pg_auth_members (xr_*):  rds_superuser → member xr_admin | admin f | inherit t | set t      (1 row: no xr_* membership at all)
_prisma_migrations pf12: row 1 done f, rolled_back t   (21 Nov / today's resolve)
                         row 2 done f, rolled_back f   (today 12:25 failure: needs `migrate resolve --rolled-back` again)
functions owned by xr_wall_reader: 0
```
Reading: the failed DO block rolled back as a whole, so the database is clean: no pf12 role or membership is left. #2968's
"leftover reader" branch (drop, or stop with the REVOKE hint) will **not** be hit here; its non-superuser path (rights instead
of membership, then `GRANT xr_wall_reader TO xr_admin`) is the one that runs. Also confirmed: `xr_admin` is not a superuser and
has no BYPASSRLS; the 12:25 run still got past creating the BYPASSRLS roles (it failed later, at line 113 of the old file).

## Step 6: rebuild on main b17e28f3a (PF-8b-f5 merged), 16:34-16:47 IST 22 Nov

* **Go:** Lead 4's "rebuild", 16:34 IST, with the founder's CodeBuild OK as quoted to Lead 4 (14:4x IST) and A284 (11:2x "AWS build approved").
* **Build:** temporary role and project `xr-staging-image-build` recreated from `~/cb`, build `xr-staging-image-build:c3830ad5-a40f-4603-9eb0-46072429913c`
  on SHA b17e28f3a, **SUCCEEDED 16:38:42 IST**, image `xr-staging-studio:b17e28f3a` digest
  `sha256:c22a25554bb4578b6a1316a228ca048a229341394324eedee68169ad95645be5`. Project deleted, role policy and role deleted
  (script output `project-deleted`, `role-deleted`). Build cost under US$0.10.
* **Diff (0 tasks, domain mode):** only `AppMigrateF2FDD66B` and `AppTask786C7957` (new image, may be replaced) and
  `AppService606B9134`. **Deploy rc=0 at 11:12:39Z (16:42:39 IST)**, 88.86 s.
* **`migrate resolve --rolled-back 20261116013000_pf12_firm_walls`:** task def `xrstagingAppMigrateFE01F052:4`, task
  169f672e…, exit 0: "Migration 20261116013000_pf12_firm_walls marked as rolled back."
* **`migrate deploy` (16:46:51 IST): PF-8b-f5 works on RDS:** pf12 and every migration up to `20261119163000_pf19p_platform_account_mail`
  applied. **It then stops at `20261119170000_pf18bk_support_keys`:**

```
Error: P3018
Migration name: 20261119170000_pf18bk_support_keys
Database error code: 42501
ERROR: PF-18bk stopped, nothing changed: xr_admin cannot see every support row (row level security); run migrations as the database owner
```

* **Root cause (code, same family as PF-8b-f5):** the migration's first statement requires the runner to be `rolsuper OR rolbypassrls`
  (written for the local `xr_studio` owner). On Amazon RDS the admin `xr_admin` is neither (rds_superuser member, not SUPERUSER, no
  BYPASSRLS), so the guard stops before anything happens. The DO block is one statement, so nothing changed.
  The guard's reason (review m1: "ADD CONSTRAINT would validate blind as well") does not hold for the keys themselves: PostgreSQL's
  row security docs say referential integrity checks (unique, primary key and foreign key references) always bypass row security. Only the
  three orphan pre-counts are blind for a non-bypass runner, and the key validation would still refuse an orphan with
  foreign_key_violation. Staging's support tables are new and empty.
* **Other migrations after it (18):** scanned on main for the same guard (`rolsuper`/`rolbypassrls` stop): **none**. Only pf18bk stops this way.
* **Not done, by the rules:** no `ALTER ROLE … BYPASSRLS` on RDS (a security setting, and not mine to change), no hand-applied SQL. Staging stays at **0 tasks**;
  `_prisma_migrations` holds a failed pf18bk row, so after a fix: `migrate resolve --rolled-back 20261119170000_pf18bk_support_keys`, then `migrate deploy`.
* **Proposed code row (for the Lead): PF-8b-f6:** pf18bk's guard on a runner that is neither superuser nor BYPASSRLS: skip the blind pre-counts (or say so in a
  NOTICE) and let ADD CONSTRAINT's own validation (which bypasses row security) refuse orphans; test like `check_pf8b_f5_pg18_grants.ts`.

## Step 7: Lead 4's R1.5 ruling and the pool half, 16:49 IST 22 Nov

* **Ruling (Lead 4, 16:49 IST):** no password or code is typed here. Wrong code, expired code and lock-out are proven by qa's journey on an
  isolated local copy with seed test accounts. Staging proves only the AWS half: sign-in page over HTTPS from lab., TOTP required for staff,
  Secure and HttpOnly session cookies, secrets from the managed store (R1.15). PF-8b-f6 (pf18bk guard) went to the PF-8b builder at 16:48;
  the founder's CodeBuild OK stands for this proof. Staging stays at 0 tasks until it merges.
* **Pools, read only (`describe-user-pool`, `get-user-pool-mfa-config`, 16:49:23 IST):**

```
xr-staging-own-staff  MFA ON, TOTP on, email/SMS off, first factors PASSWORD+WEB_AUTHN, password min 12, deletion protection ACTIVE,
                      WebAuthn RP staging.lab.expatready.com, user verification required, MULTI_FACTOR_WITH_USER_VERIFICATION
xr-staging-staff      same as own-staff
xr-staging-clients    MFA OPTIONAL, TOTP on, first factor PASSWORD, password min 12, deletion protection ACTIVE, WebAuthn SINGLE_FACTOR
```

* **R1.5 pool half: Pass** for "second step required for staff" (both staff pools MFA ON, TOTP only) and the passkey setting QA-643 asked for
  (WebAuthn on the real domain, user verification required). Still open until the service runs: page over HTTPS from lab. and cookie flags.

## Step 8: Lead 5's pre-check for #3060 (breaker M1), 17:46 IST 22 Nov (read only, VPC CloudShell, owner URL from the managed store, never printed)

* Lead 5 (17:44 IST): before the deploy after #3060, `count(*)` on `platform_subscription` and `fo_consultation_type` must both be 0.
* Run as `xr_admin` (`rolsuper f`, `rolbypassrls f`). Both tables have row security forced (`relrowsecurity t`, `relforcerowsecurity t`), so a
  plain count by xr_admin could be blind. Checked with PostgreSQL's table statistics too, which row security does not filter:

```
xr_admin | f | f
count platform_subscription | 0
count fo_consultation_type  | 0
platform_subscription | rls t | force t | n_live_tup 0 | n_tup_ins 0 | n_tup_del 0
fo_consultation_type  | rls t | force t | n_live_tup 0 | n_tup_ins 0 | n_tup_del 0
platform_firm count 0
2026-11-22 12:16:16Z (17:46:16 IST)
```

* **Result: both 0, and no row was ever inserted.** The two data migrations that update nothing under FORCE (M1) have nothing to update on staging.
  The go condition holds for the deploy after #3060 merges.

## Step 9: rebuild on main 93237d8d2 (PF-8b-f6 #3060 merged), service up with 2 tasks, proofs, 18:47-19:11 IST 22 Nov

Go: Lead 5's "rebuild", 18:47 IST, with Step 8's pre-check (both tables 0, never inserted). The founder's CodeBuild OK stands (Lead 4, 14:4x).

| Step | Exit / result | Time (IST) |
|---|---|---|
| CodeBuild `xr-staging-image-build:07618431-0f5c-4309-9776-baf2d65d83d0` on 93237d8d2 | SUCCEEDED, digest `sha256:5e5ca8661ca10c35b6888c93ac4d6f412a0ca94fecb693bf2c7aa84a5bff895c`; project, role policy and role deleted | 18:56:06 |
| cdk diff 0 | rc=0: only AppMigrate and AppTask (replace), AppService | 18:57 |
| cdk deploy 0 | rc=0, 87.39 s | 18:59:23 |
| `migrate resolve --rolled-back 20261119170000_pf18bk_support_keys` | task exit 0, "marked as rolled back" | 19:02:03 |
| `migrate deploy` (task def `xrstagingAppMigrateFE01F052:5`, task adbe67c4…) | exit 0, pf18bk through `20261122040000_pf8b_f6_pf18bk_checksum`: "All migrations have been successfully applied." | 19:03:30 |
| `xr_app` sign-in with the APP_DATABASE_URL secret | first refused (password did not match), then `ALTER ROLE xr_app PASSWORD :'pw'` from the secret (value never shown, length 40) rc=0; sign-in as xr_app rc=0 | 19:04:43 |
| cdk diff 2 / deploy 2 | rc=0 (only AppService), 132.58 s; service desired 2, running 2, rollout COMPLETED, task def `xrstagingAppTask7031B6E4:6`; target group `/api/health/live`: healthy, healthy | 19:07:50 |

Cost: 2 tasks add about US$0.11/h (about US$0.29/h in all with the database, load balancer and NAT); the proof's total spend stays well under US$10.

### R1.24 each firm's own web address: **Partial (AWS half Pass; a firm's 200 not provable: staging has no firm)**
* Wildcard DNS and certificate: any `<name>.staging.lab.expatready.com` resolves; certificate `CN=*.staging.lab.expatready.com`, valid to 7 Jun 2027, `ssl_verify_result=0`.
* The address suffix is the real one: task env `PLATFORM_ADDRESS_SUFFIX=staging.lab.expatready.com` (QA-642's hard-coded suffix gone).
* `https://nosuchfirm.staging.lab.expatready.com/` → **404** "Not available" page (noindex); `Bad_Name.` → 404; `/api/health/live` on a firm host → 404 (firm hosts don't serve the API).
* `www.` → 200 (platform app). `admin.` → **200, the platform app**: for qa to confirm that a reserved name is meant to fall through to the platform app.
* **Named gap:** `platform_firm` has 0 rows on staging (Step 8), so no `<firm>.staging.lab…` can return 200. A firm comes only from self-serve sign-up (email verification, SES sandbox, a password typed), which this session must not do. Needs the Lead: a seed path for staging, or qa's sign-up walk.

### R1.5 staff sign-in, AWS half (Lead 4's ruling): **Pass, one Minor finding**
* Sign-in page over HTTPS from lab.: `GET https://www.staging.lab.expatready.com/sign-in` → 200, `ssl_verify_result=0`, `<title>Product Studio</title>`; `http://` → **301** to `https://…/sign-in`.
* The real pool is in use: task env `PLATFORM_IDENTITY=cognito`, pool and client ids set (ids not copied here); Step 7: staff pools MFA ON, TOTP only, passkeys on staging.lab with user verification.
* No session without a token: `GET /api/platform/me` → **401** "Sign in first: this needs a staff member's session (a bearer token)"; `POST /api/platform/session/callback {}` (no code typed) → **401** `sign-in-code-refused`, `cache-control: no-store`.
* **Cookies: none to flag.** The app carries the session as `Authorization: Bearer` (`api/src/platform/identity/guard.ts:106-107`, `keys.ts:11`), not a cookie; `Set-Cookie` count 0 on `/`, `/sign-in`, `/api/health/live`, `/api/platform/me` and the callback.
* **Finding (Minor):** no `Strict-Transport-Security` header on any response (HTTP→HTTPS redirect is there). Proposed: HSTS on the load balancer or app for staging and production.
* Wrong code, expired code and lock-out: qa's local journey, per Lead 4's ruling (no password or code typed on staging).

### R1.15 secrets in a managed store: **Pass (re-confirmed on the running service)**
* Running task def `xrstagingAppTask7031B6E4:6`: 10 `secrets` (valueFrom Secrets Manager `xr/staging/*`): DATABASE_URL, APP_DATABASE_URL, PLATFORM_STRIPE_SECRET_KEY, PLATFORM_STRIPE_WEBHOOK_SECRET, PLATFORM_BOLDSIGN_API_KEY, PLATFORM_ZOOM_CLIENT_ID, PLATFORM_ZOOM_CLIENT_SECRET, PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN, PLATFORM_SECRET_BOX_KEYS, PLATFORM_SECRET_BOX_KEY_VERSION.
* Plain `environment` holds only 6 non-secret names: PLATFORM_SES_REGION, PLATFORM_ADDRESS_SUFFIX, PLATFORM_IDENTITY, PLATFORM_COGNITO_USER_POOL_ID, PLATFORM_ENVIRONMENT, PLATFORM_COGNITO_CLIENT_ID.
* The running app reads them: both tasks healthy against RDS as `xr_app` with the password only the secret holds.

### R1.13 logs and alarms: **Pass (now including the app-emitted half)**
* Both app tasks write to `/xr/staging/app` (streams `studio/studio/392dc7d3…`, `…/32ffbfde…`): 192 events in 10 minutes.
* App-emitted metrics now reach CloudWatch through the metric filters: `ExpatReady/Alarms/staging/Requests` 56 data points, `JobAge` 6 (max 37,506 ms at 13:35Z vs threshold 1,800,000 ms); the other 9 filters had no matching line (no errors, no mail), as expected.
* All 9 alarms `OK` at 19:10:35 IST; Step 4's test alarm proved delivery to SNS (delivered 2, failed 0). On-call address is still the placeholder (P-782, not decided).
