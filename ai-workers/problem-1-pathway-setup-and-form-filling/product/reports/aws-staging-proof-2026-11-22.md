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

## Step 1: read-only survey (11:10 IST): BLOCKED

The founder's Chrome (Claude in Chrome, the only connected browser) shows the AWS **IAM user sign-in** page for
`console.aws.amazon.com` and the CloudShell URL: the console is **not signed in** there. This session never types a
password or code, so step 1 waits for the founder's root sign-in (with MFA) in that Chrome. Sent to Lead 1.
