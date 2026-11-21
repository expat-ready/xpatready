# PF-8rc review (R1.14 part 2): the backup plan, ca-west-1 copy vaults and lock guards (synth only)

PR #2725 · head `0ab64811e` · branch `claude/runtime-pf8rc-backup` · reviewer: independent Opus, fresh context, 21 Nov 2026. I did not build this.
Scope: the Done-when lines of the PF-8rc row (`BACKLOG.md:978`) that synth can prove. The cloud drill and the quarterly reminder are held (P-251, P-551) and are not findings.

## What I ran
- `npm test` (deploy/cdk): **31 passed, 0 failed** (3.8 s). `npm run synth`: exit 0, 4 templates (`xr-staging`, `xr-production`, `xr-staging-copy`, `xr-production-copy`). I read the synthesized vault, key, plan, selection and role resources, then deleted `cdk.out`. I did not run the cdk CLI.
- **Escape probe:** a scratch script (deleted) fed broken templates to each check. **Mutation pass:** I removed one condition at a time from `lib/checks.ts`, ran `npm test` and restored the file. The results are below.
- Not applicable to a synth-only infrastructure row: the screen-review D1–D20 and BIC table, `graph.mjs`, and the 1440/1024 px walk. There is no screen, route or app code. The PR says the same.

## Done-when: real stacks pass, broken stacks fail
| Done-when | Real app | Broken copies caught | Verdict |
|---|---|---|---|
| The copy rule targets ca-west-1 and nothing else outside ca-central-1 | `backupFindings` and `regionFindings(all, REGION_ALLOW)` are clean. The copy ARN is a plain `Fn::Join` built from the fixed name, so there is no cross-stack or cross-region reference (template checked) | A us-east-1 copy (both checks); a foreign ca-west-1 vault name; a bucket, a third region or a us-west-2 stack in the copy stack; ca-west-1 named in a home-stack SSM parameter (my probe) | Met. Escapes R3 and R4 below |
| Retention is 35 days in both vaults | Rule 35, copy 35, both locks `MinRetentionDays: 35` | 7, 1, a weekly schedule, a monthly cron (probe), a second rule with a 1-day copy (probe), a foreign target, no copy, an unselected bucket | Met |
| The vault lock is on, in governance mode | 4 vaults, no `ChangeableForDays` | Compliance mode, 7 days, no lock. Mutation killed | Met |
| No role in the stack holds the bypass permission | One role (AWS Backup's), with two allow-listed managed policies and `kms:Decrypt` on the data key; every vault policy carries the explicit deny | Deny side: a dropped action, a narrowed principal, a Condition, `NotPrincipal` (probe), `NotAction` (probe), a narrowed Resource (probe), an AWS-managed key, a missing key deny. Role side: a named action, `backup:Delete*`, `kms:*`, `NotAction`, `AdministratorAccess`, an `AWS::IAM::Policy` on a role or user, a customer `AWS::IAM::ManagedPolicy` (probe) | Met on today's stacks. Escapes R1 and R2 below |
| Old bucket versions expire after 35 days | 3 buckets, 35 days | 400 days (×3). The TLS deny also has to cover `/*` | Met |

None of these checks is blind: each fails on the broken copies the PR lists. The mutation pass found 4 conditions that **no test pins** (R6).

## Findings
No Blocker or Major.

**Minor**
- **R1. Privilege escalation is not a guarded action.** `checks.ts:215` `GUARDED_ACTIONS` has no IAM write actions. My probe: a role with inline `iam:*` passes `bypassFindings`. That role could give itself `backup:PutBackupVaultAccessPolicy`, remove the deny and then delete the governance lock: the two-step path of the PR's question 1, from inside the template. *Fix:* add `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:PutUserPolicy`, `iam:AttachUserPolicy`, `iam:PutGroupPolicy`, `iam:AttachGroupPolicy`, `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion` and `iam:UpdateAssumeRolePolicy` to `GUARDED_ACTIONS`, with one failing case (`iam:*`). AWS Backup's role holds none of them, so the real app stays clean.
- **R2. Inline `Policies` on users and groups are not scanned.** `checks.ts:224` reads `Policies` only when the type is `AWS::IAM::Role`. My probe: an `AWS::IAM::User` with an inline allow of `backup:PutBackupVaultAccessPolicy` passes, and so does an `AWS::IAM::Group` with `kms:PutKeyPolicy`. (`ManagedPolicyArns` on users and groups is already checked.) *Fix:* read `Policies` for `AWS::IAM::User` and `AWS::IAM::Group` too, with a failing case for each.
- **R3. The copy target's account and stage are not bound.** `checks.ts:204-205` matches the copy vault by name and region only. My probe passed `arn:aws:backup:ca-west-1:999999999999:backup-vault:xr-production-copy`, which is a different account's vault, maybe unlocked. It also passed production copying into `xr-staging-copy`. This contradicts the PR's claim that "a copy to a ca-west-1 vault that no scanned stack defines is caught". *Fix:* require the account part to be `{"Ref":"AWS::AccountId"}` (or the copy stack's account) and the name to be `copyVaultName(<this stack's stage>)`, with two failing cases.
- **R4. A `NotResources` exclusion in the selection is not seen.** `checks.ts:209` reads only `Resources`. My probe: a bucket listed in `NotResources` still passes "every bucket is selected". *Fix:* report any bucket or database id named in `NotResources` (or refuse `NotResources` and `Conditions` outright), with a failing case.
- **R5. The managed-policy allow-list match is unanchored.** `checks.ts:231` tests the regex anywhere in the flattened value. My probe: `Fn::If [C, …/AdministratorAccess, …/AWSBackupServiceRolePolicyForS3Backup]` passes. *Fix:* refuse a `ManagedPolicyArns` entry that holds more than one `:policy/` segment or any `Fn::If`/`Fn::Select`, or match the flattened literal against the whole string.
- **R6. Four conditions survive mutation, so no test would notice them gone.** These are `denies`' `Resource` includes `"*"` (`checks.ts:160`), `regions.length !== 1` (`:203`), `plans.length !== 1` (`:192`) and the lifecycle `Status === "Enabled"` (`:140`). Also, removing `AWS::IAM::ManagedPolicy` from the scanned types (`:225`) breaks no test. *Fix:* one failing case each: a deny on one recovery-point ARN only, a copy ARN naming two regions, a template with no plan or with two plans, a lifecycle rule left `Disabled`, and a customer managed policy allowing a guarded action.
- **R7. Risk to the first deploy (Unconfirmed, not provable in synth).** The vault's own access policy denies `backup:PutBackupVaultLockConfiguration` to `*` (`backup.ts:20`). Suppose CloudFormation's `AWS::Backup::BackupVault` handler applies `AccessPolicy` before `LockConfiguration`, and vault policies govern that action. Then the stack's own create call is denied. Rollback then keeps a named vault (Retain) that cannot be deleted, so the next deploy fails with "already exists". I could not check the handler order (docs blocked). *Fix:* add this to the PR's and README's Unconfirmed list. In `RUNBOOK-restore.md` §3, add a fallback beside the two-deploy rule: the first deploy goes out without the `PutBackupVaultLockConfiguration` deny, and the second adds it. The drill confirms which order applies.
- **R8. The runbook overclaims.** `RUNBOOK-restore.md:37` says "**nobody can shorten a backup's life**, the release holder included". In governance mode `PutBackupVaultAccessPolicy` is not denied, so an account admin outside this template can lift the deny and then the lock (the PR's own question 1). *Fix:* "no role in this template can; an account admin could in two steps until compliance mode (its own later row)".

## Design notes for AWS Backup (no finding; each Unconfirmed: docs.aws.amazon.com is blocked here)
- The 35-day lifecycle equals the 35-day lock minimum, so no job should be refused for retention under the minimum. No cold-storage transition is set, so the lock and the lifecycle cannot conflict that way.
- **Copy:** each vault has its own key in its own region. The home plan names the copy vault through an ARN built from a fixed name, and `addStackDependency` orders the deploy only. This is sound.
- **KMS:** the vault keys and the data key all keep CDK's root-delegation statement, so IAM governs them. The role gets explicit `kms:Decrypt` on the data key only. *Unconfirmed:* whether the S3 backup and the cross-region copy also need `kms:GenerateDataKey` or `kms:CreateGrant` on the home and copy vault keys beyond what the two AWS-managed policies give. If copy jobs fail on KMS access in the drill, add explicit grants or key-policy statements naming the backup role.
- **S3:** versioning is on, as AWS Backup for S3 needs. The S3 managed policy sits at `policy/AWSBackupServiceRolePolicyForS3Backup` with no `service-role/` path. I recall that is right; *Unconfirmed*.
- **The `DeleteRecoveryPoint` deny on `*`:** CDK's own `blockRecoveryPointDeletion` uses the same statement, which suggests lifecycle expiry still runs. *Unconfirmed*; the drill should show a point expiring at 35 days.
- The AWS Backup run at 07:00 UTC may collide with RDS's default backup or maintenance window (neither is set). *Unconfirmed* whether that delays the job. This is Sample, a note for PF-8b or the drill.

## Journey test (reviewer, adapted: no UI)
Journeys: (1) an operator runs `npm test` and `npm run synth` from the README and gets green; (2) a builder breaks a guard and reads which rule broke, in plain words; (3) an operator follows RUNBOOK §3 for a copy restore and for changing a lock.
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 31/31 tests; synth exit 0 |
| Next step obvious | 1 | The README run block; `npx cdk synth` is warned against |
| Plain words | 1 | Findings read like "copy kept 1 days, not 35" |
| Feedback and state | 1 | Each check names the stack, resource and action |
| Correct data | 1 | The synthesized templates match the claims (vault, key, plan, role inspected) |
| Error recovery | ½ | The two-deploy rule for changing a lock is written; the failure mode of the first deploy (R7) is not |
| Accessibility and screen sizes | 1 | N/A (no UI), counted as met |
| Speed | 1 | Tests in 3.8 s |
| Visual quality | 1 | N/A (no UI), counted as met |
| Trust and sources | ½ | The Unconfirmed items are marked, but the runbook overclaims (R8) |
| **Total** | **9/10** | Pass: 8 or more, no 0 |

Not tested: anything in a real AWS account (P-551), AWS's managed-policy contents, the vault-policy semantics and CloudFormation's handler order. The drill and the founder keep these.

Reviewed commit: 0ab64811e (no Blocker or Major open; R1–R8 are Minor).

Verdict: Approve

## Re-review (diff-only) at 6e5569b0d
Read only `git diff 0ab64811e 6e5569b0d`, together with the breaker's `break-report.md`. Commands: `npm test` gave **38 passed, 0 failed**; `npm run synth` exited 0 with 4 templates (`cdk.out` deleted afterwards; no cdk CLI). **No false finding on the real app:** `regionFindings(all, REGION_ALLOW)`, `vaultFindings`, `bypassFindings`, the new `resourcePolicyFindings` and both homes' `backupFindings` each return 0. The real stacks' Secrets Manager dynamic reference is exempt only when it names the stack's own secret; removing that exemption makes the pass test fail.
**Mutation pass:** I removed each fix's condition from `lib/checks.ts` in turn, ran `npm test` and restored the file. The "killed" column means a test fails without the fix.

| Finding | Fix in 6e5569b0d | Test fails without it |
|---|---|---|
| R1, B4(b): IAM writes and role assumption | `GUARDED_ACTIONS` gains the `iam:Put*/Attach*Policy` family, `CreatePolicyVersion`, `SetDefaultPolicyVersion`, `UpdateAssumeRolePolicy`, `PassRole` and `sts:AssumeRole`. Roles may be assumed by AWS services only | killed (`iam:PutRolePolicy`, `sts:AssumeRole`, the trust check) |
| R2, B4(a): inline policies on users and groups | `Policies` is now read for User and Group as well as Role | killed |
| R3, B2: the copy target's account and stage | The copy ARN must exactly equal the `Fn::Join` that `backupPlan` writes: `Ref AWS::AccountId` and `<stack>-copy` | killed |
| B3: a region hidden in an intrinsic | `Fn::Sub` with a variable map, `Fn::ImportValue` and `{{resolve:` are refused. A `Ref` to a parameter is read as its default | killed (each of the four) |
| R4, B7: a narrowed selection | `NotResources`, `Conditions` and `ListOfTags` are refused, and `BackupPlanId` must be this stack's plan | killed |
| R5, B5: the managed-policy allow list | Only an exact plain ARN, or CDK's `Fn::Join` of one, is accepted | killed |
| R6: untested branches | Tests added for a narrowed deny Resource, two plans and a `Disabled` lifecycle rule (`regions.length` is now made redundant by the exact-ARN check) | killed (all three) |
| R7: risk to the first deploy | `PutBackupVaultLockConfiguration` has left the vault-policy deny (confirmed in the synthesized policy) but stays in `GUARDED_ACTIONS` through `LOCK_ACTIONS`; a customer managed policy allowing it is caught. `DeleteRecoveryPoint` and `UpdateRecoveryPointLifecycle` are still denied, so a lowered minimum cannot shorten an existing point. The RUNBOOK covers the first deploy | killed ("Mine" case) |
| R8: the runbook overclaimed | Now reads "no role defined in the code can shorten a backup's life", plus the governance-mode **Limit** (B1, question 1) | n/a (wording) |
| B4(c): resource policies | New `resourcePolicyFindings`: an Allow in a key policy or vault policy may name only this account's root or an AWS service | killed (the other-account case) |
| B6: the lock maximum | `MaxRetentionDays` under 35 is a finding | killed |
| B8: the region's runtime doors | A `MultiRegion` key, `AWS::KMS::ReplicaKey` and `AWS::Backup::ReportPlan` are refused | killed |

B1 is stated as a limit in `backup.ts`, the README and the RUNBOOK, and is left to the tech lead as question 1. I agree with that: it is the governance-mode decision (P-566 (3)), not a code defect.

**Still open or new (Minor; not blocking):**
- **N1. A `Ref` to a parameter with no default is not seen** (my probe: `"arn:aws:sqs:us-ea"` joined with `{Ref: Tail}`, where `Tail` has no `Default`, passes). The same holds for any parameter whose value is overridden at deploy, since the default is only a guess. This is the same class as the `{{resolve:ssm:…}}` that is now refused. *Fix:* in resources, treat a `Ref` to any template parameter other than CDK's `BootstrapVersion` as "region not provable", with a failing case.
- **N2. B8's copy-out door is only partly closed.** My probe: a role trusted by `lambda.amazonaws.com` with an inline allow of `backup:StartCopyJob` passes every check, and at run time it could copy recovery points to any region. *Fix:* add `backup:StartCopyJob` and `backup:CopyFromBackupVault` to `GUARDED_ACTIONS`, with one failing case. AWS Backup's role carries only managed policies, which are not scanned, so this adds no false finding. The organisation-level region guard (an SCP on `aws:RequestedRegion`) stays outside this row.
- **N3. The `Fn::Sub` string-form `${Param}` substitution (`checks.ts` `flatten`) is not pinned by any test.** My probe shows it works (`us-ea${Tail}` with default `st-1` is caught), but removing it breaks no test. *Fix:* one case. The `NotPrincipal` and service-suffix branches of `resourcePolicyFindings` also survive mutation, but they are redundant (an absent `Principal` already fails `ownOrService`) and no hole follows from them.
- **Note (no finding):** the exact copy ARN and `ROOT` both assume the account stays `Ref AWS::AccountId`. If a later row pins the account in `env`, both will report a finding until they are updated. That is a safe failure, so no fix is needed now.
- **Note (no finding):** `iam:PassRole` and `sts:AssumeRole` in `GUARDED_ACTIONS` will flag a legitimate future role (for example a PF-8b task role that passes a role). That row will need a reviewed, scoped exception rather than a quiet removal.

- **The breaker's round 2 (appended to `break-report.md` while I worked): my view.**
  - **R2-2 (the block list can be escalated around)** is sound: `cloudformation:UpdateStack` reuses the stack's service role (Unconfirmed), and `iam:CreateAccessKey`, `lambda:UpdateFunctionCode` and my N2 also get through. **R2-1 (statements built from `Fn::If`, `Fn::Split` or a JSON string)** is the same class as R5.
  - I rate both **Minor, should fix** and not Block. The real template has exactly one role: a service role holding `kms:Decrypt` and two managed policies. The Done-when proof holds on it. Any principal outside the template already has the stronger route that is accepted as B1 (governance mode, question 1).
  - Best fix: invert `bypassFindings` into an allow list. Each template principal may hold only listed actions, and any non-literal `Effect`, `Action`, `Principal` or `PolicyDocument` is "cannot be read". That closes R2-1, R2-2 and N2 together.
  - R2-3 to R2-5 are Minor, as the breaker rates them.
- **Disclosure:** the "another agent changing `lib/checks.ts`" in both break-report rounds was my mutation testing in this shared worktree. Each mutation was restored from a saved copy, and `git status` shows `lib/` identical to `6e5569b0d`. The breaker says each break was re-confirmed on clean files.

Reviewed commit: 6e5569b0d (no Blocker or Major open; N1–N3 are Minor).

Verdict: Approve
