# Production hand-over contract: written now, built later (27 Nov 2026)

Lab register row **LR-114** (full-power lane, bulk FP-2). Written 27 Nov 2026 IST from origin/main e071cb8fa.
Sources: factory v3 plan (26 Nov), "Basics now; the production layer becomes a hand-over contract": "We write these down as
a contract now and don't build them yet, so product work isn't slowed." (V3:H1 to H5); full-power plan rows #227 and #230
to #236; `library/engineering-map.md` stages 3 to 5 (read 20 Nov); scale ruling P-755 (one AWS region in Canada, one
managed PostgreSQL with automatic backups, a managed container service, two environments; no Kubernetes, no second
region). Rule for this page: [C17] in the lab register, "finding the simplest solution possible, and only increasing
complexity when needed". Nothing here is built during the lab or the product pause (P-847); staging and AWS also wait for
Proven 30 (P-750). Legal points: Unconfirmed: no counsel.

**How to read a row.** *Owner* is a role: the Lead (writes and checks), a builder lane (L), qa, the founder (F; every
account, key and purchase is the founder's, P-551, P-821), or the partner team that takes production over. *When* is the
trigger, not a date. *Done when* is a check a person or a script can answer pass or fail. *Today* is what exists on main.

| # | Item | Source | Owner | When | Done when | Today |
|---|---|---|---|---|---|---|
| H-1 | Production on AWS in Canada from the same files as staging (infrastructure as code) | FP #227; V3:H1; P-755 | L builds; F opens the account; partner team runs it | at Proven 30 (P-750), with staging | `cdk synth` of the one CDK package produces both environments, and the only differences between them are listed values (size, domain, secrets' names) | CDK package synthesized with no account (deploy-synth.yml, PF-8a); no environment exists |
| H-2 | Staging and production as GitHub environments with protection rules: production needs a person's approval; only main deploys | V3:H1 | Lead (settings); F approves the setting | with H-1 | GitHub › Environments shows both; a deploy job from a non-main branch is refused; a production job waits for the named approver | none |
| H-3 | Deploys without stored passwords (OIDC to AWS), and a rollback runbook | V3:H2 | L; F creates the AWS role | with H-1 | the deploy workflow has no long-lived AWS key in secrets; the runbook's rollback was run once on staging and timed | migrations ship rollback.sql (Lead-read); no deploy workflow |
| H-4 | Nightly database backups and one restore actually tried; restores tested again on a schedule | FP #230; V3:H3 | L; qa runs the drill | with H-1 | a restore from last night's backup into a scratch database passes the row-count and checksum check; the date of the last good drill is on the page | restore drill on a test image runs in nightly.yml (job restore-drill, PF-8r); no managed backups yet |
| H-5 | Error alerts and tracing, feature flags per firm, service targets | V3:H4; FP #229, #234 (SA-12) | L; partner team | alerts with H-1; flags after the first firms | a planted error on staging reaches the alert channel within 5 min; one flag turns a feature on for one firm only; each target (uptime, p95 page time) has a number and a dashboard | personal-data-in-logs check exists; no alerting, no flags |
| H-6 | Delivery metrics (DORA) from GitHub deployments, not from merges | V3:H5; [C18] | Lead | once deploys exist (H-3) | the measures script reads the deployments API for staging and production and prints deploy frequency, lead time, change failure rate, failed deployment recovery time and rework rate | measured from merges by the automation-measures lane (AM-1) |
| H-7 | Incident runbook and on-call: who answers, how an outage is reviewed | FP #235; V3:H5; P-551 | F names the people; Lead writes the runbook | named people before the first customer (P-551); rota after first firms are live | the runbook names a role for answer, support and breach decisions, a severity table and a review template; one practice incident was walked | none (P-551 records the founder's intent) |
| H-8 | Access reviews: who can push, approve, deploy and read production data | V3:H5 | Lead; F decides | quarterly from the first customer | a dated list of every account with each right, signed off by the founder; removed accounts listed | CODEOWNERS and ruleset work in the ship-security lane |
| H-9 | Release candidate: RC1 cut from main, version tags, release notes | FP #231 | Lead | when Release 1's items are Proven (P-609) | tag `v1.0.0-rc.1` exists on a main commit with notes listing each capability and its proof | main always green; no tags |
| H-10 | Full qa walk of RC1 on staging before v1.0 | FP #232 | qa | after H-9, on staging (H-1) | the qa report lists every Release 1 capability as Works on the RC1 commit on staging, with no open Blocker or Major | qa proves each item on the Mac demo |
| H-11 | Privacy and data-residency review before the first firm's real data (Unconfirmed: no counsel) | FP #233 | F (counsel); Lead prepares the pack | before the first firm's data | counsel's written read is filed in the private notes and each finding has a row; residency: every store is in the Canadian region (checked from the CDK output) | rules in code; legal points Unconfirmed: no counsel |
| H-12 | Product analytics: which screens firms use | FP #236 | L | after the first firms | one privacy-reviewed event list (no personal data) and a weekly screen-use report | none |

## What is not in this contract

* Several regions, Kubernetes, microservices, a dedicated operations team: out of scope at 50 to 100 firms (P-755).
* Anything that slows product work now: nothing above is built before its trigger (v3, quoted at the top).

## Check

The Lead reads this page and records "read" against LR-114 in the lab register. A later builder takes one row at a time
as a backlog row with this row's Done when.
