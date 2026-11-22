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
