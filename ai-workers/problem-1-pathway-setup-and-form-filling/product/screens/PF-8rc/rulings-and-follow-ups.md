# PF-8rc: the tech lead's rulings and the follow-up rows (records only)

Row PF-8rc (R1.14 part 2). The CI-provable half merged in PR #2725 at e22e48c24. Its code was approved at da3911bec; the review and break records are in `review.md` and `break-report.md` next to this file.

## Rulings (Lead 13, 21 Nov, on the PR's three questions)
1. **Governance or compliance mode: keep governance for staging.** Compliance mode can never be undone, so it is a production decision. It is taken before production, with the founder.
   - Until then, this limit stands (breaker B1): an account administrator, the root user or a deploy can replace a vault's policy and then lift the lock, in two steps.
   - `deploy/cdk/lib/backup.ts`, the README and `RUNBOOK-restore.md` §3 say so.
2. **The quarterly drill reminder (JobPort) is held until the first drill runs.**
3. **The break rounds stop at zero Majors** (4 → 2 → 2 → 0 over four rounds). The remaining Minors become the follow-up rows below.

## What runs where now
* **The AWS staging account exists:** `xr-staging`, ca-central-1. R1.14 part 1 PASSED at 11:50 IST, 21 Nov.
* **The ca-west-1 copy and the restore drill are run by the AWS proof session from the Mac**, not from a cloud copy. They are not run from this lane.
* **The drill's evidence** goes in `deploy/evidence/restore-drill-<date>.md`, written by that session.
* **The Unconfirmed points from PR #2725 are to be checked in the AWS proof session**, each with a line in the evidence file. A restore drill alone does not settle them all:
  - the contents of AWS Backup's managed policies and the S3 policy's path: read with `aws iam get-policy-version`;
  - the order in which CloudFormation applies a vault's policy and its lock (review R7): shown by the first deploy;
  - that a vault access policy can deny each listed action and binds the root user: a deliberate denied call, not part of a drill;
  - that the deny leaves AWS Backup's own 35-day expiry working: seen when the first recovery points expire;
  - that S3 backups and the cross-region copy job succeed with the vault keys' KMS permissions; if they don't, explicit grants are needed: shown by the first backup and copy jobs;
  - that the 07:00 UTC plan does not collide with RDS's backup or maintenance window: read from the instance's settings at first deploy.

## Follow-up rows (for the tech lead to add to BACKLOG; Minors, none breaks a Done-when line of PF-8rc)

| Proposed row | What | Touch | Done when | Source |
|---|---|---|---|---|
| PF-8rc-f1 | The region guard refuses `Fn::Split` anywhere, and a `Fn::Join` whose list is not literal, as "region not readable". | `deploy/cdk/lib/checks.ts`, `deploy/cdk/test/backup.test.ts` | A test with `{"Fn::Join":["",{"Fn::Split":["\|","us\|-east-1"]}]}` on a database property fails before the change and passes after. The real stacks still give no finding (`npm test`). | break R4-1 |
| PF-8rc-f2 | Guard the property-level routes out of the account:<br>• S3 `InventoryConfigurations` and `AnalyticsConfigurations` destinations;<br>• bucket `NotificationConfiguration` targets (SNS, SQS, Lambda);<br>• backup vault notifications (SNS topic);<br>• RDS `AssociatedRoles`.<br>Each must name a resource the stack defines. S3 replication destinations are already checked by `regionFindings`. | `deploy/cdk/lib/checks.ts`, tests | One test per route, each failing before the change: an inventory or analytics destination in another account, a notification target in another account, a vault SNS topic in another account, and an outside role are each caught. | break R3-5, review (round 4) |
| PF-8rc-f3 | Widen the role-resource rule for CDK's object grants (`Fn::Join [GetAtt Arn, "/*"]`) when PF-8b adds bucket grants, and only for buckets the stack defines. | `deploy/cdk/lib/checks.ts`, tests | PF-8b's grant passes. A `/*` join on a bucket ARN from outside the stack fails (`npm test`). | review (round 4) |
| PF-8rc-f4 | A production decision before production, with the founder: compliance mode for the copy vault, or an organisation SCP denying the vault-policy and key-policy actions except to the deploy role. | `deploy/cdk/lib/backup.ts`, `deploy/cdk/lib/checks.ts`, `RUNBOOK-restore.md`, `DECISIONS.md` | The founder's decision is recorded. **If compliance mode:** `vaultFindings` takes the stage, since today it reports any `ChangeableForDays` as a finding. A test asserts `ChangeableForDays` on the production copy vault only, and staging stays governance. **If an SCP:** the SCP text and its account attachment are recorded in the evidence file, and a denied test call is shown. | ruling 1, break B1 |
| PF-8rc-f5 | The quarterly drill reminder via JobPort, once the first drill has run. Waits on PF-14 (JobPort) and the first drill. | app code (runtime), the on-call address | The reminder is scheduled once, and a test shows it is not scheduled twice. | ruling 2, PF-8rc row |

Duplicate check for these rows: I searched BACKLOG, the open PRs (#2743 PF-23c and #2748 PF-8b touch `deploy/cdk` but none of these points) and `main`'s `deploy/cdk`. No row covers them.

If PF-8b (#2748) lands first, f3 is needed at once: that PR's own review decides whether its bucket grants pass `bypassFindings`.
