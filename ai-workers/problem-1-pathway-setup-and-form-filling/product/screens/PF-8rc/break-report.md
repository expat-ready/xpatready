# PF-8rc break report (permissions, secrets, region; P-303)

PR #2725, head 0ab64811e. Synth only: `npm run synth` on a clean copy of HEAD's `lib/` (cdk.out deleted after); no cdk CLI, no AWS call, no network.
Method: every case below mutates a synthesized template, or adds a CDK stack, using the `swap` / `rule` / `of` helpers of `test/backup.test.ts`. It then runs `regionFindings(all, REGION_ALLOW)`, `vaultFindings`, `bypassFindings` and `backupFindings` (on each ca-central-1 stack), plus `bucketFindings`.
"Passes" below means all of those checks return `[]` for a template that should have been caught.
Note: another agent was changing this worktree during the run: `lib/checks.ts` line 140 dropped `r.Status === "Enabled" &&`, and `test-scratch-review/` appeared. I re-ran every case on HEAD's own files and got the same results.

## Breaks

**B1 Major: "no role can bypass the vault lock" does not hold for the account, only for roles in the template.**
The lock is in governance mode. The vault access policy does not deny `backup:DeleteBackupVaultAccessPolicy` or `backup:PutBackupVaultAccessPolicy` (backup.ts:27-29, 49). The synthesized vault key policy keeps CDK's default first statement, `Allow kms:* to arn:…:root`, which includes `kms:PutKeyPolicy` (backup.ts:42).
Repro (needs the cloud account, so not run here): any account admin, the root user or the CDK bootstrap's CloudFormation execution role (AdministratorAccess by default) runs:
* `DeleteBackupVaultAccessPolicy`, then `DeleteBackupVaultLockConfiguration`, then `DeleteRecoveryPoint`;
* or `PutKeyPolicy` without `NoKeyDestruction`, then `ScheduleKeyDeletion`.

A deploy that drops the deny does the same.
`bypassFindings` (checks.ts:220-235) only reads IAM resources in the template, so a pass proves "no role in this template", nothing more.
Fix (pick one):
* reword the claim to "no role defined here; an account admin or a deploy can lift it (governance mode)";
* or use compliance mode (`changeableFor`) for the copy vault, plus an SCP denying the two vault-policy actions and `kms:PutKeyPolicy` on `xr-*` except to the deploy role.

**B2 Major: a copy into another account's ca-west-1 vault passes.**
`backupFindings` matches only the region and the vault name, never the account (checks.ts:202-205).
Repro: `swap(all,"xr-production",t=>{rule(t).CopyActions[0].DestinationBackupVaultArn="arn:aws:backup:ca-west-1:999999999999:backup-vault:xr-production-copy"})`. Result: 0 findings, and the backups land in a vault outside this account (no lock, no deny).
Fix: require the account part to be `{"Ref":"AWS::AccountId"}`. Simplest: compare the whole value to the exact `Fn::Join` that `backupPlan` emits.

**B3 Major: a region hidden in an intrinsic passes the copy rule and the region guard.**
`regionsIn` flattens only `Fn::Join` (checks.ts:28-38). Each of these copy destinations gives 0 findings:
* `{"Fn::Sub":["arn:aws:backup:us-${D}-1:${AWS::AccountId}:backup-vault:xr-production-copy",{"D":"east","Note":"ca-west-1"}]}`: resolves to us-east-1.
* `"{{resolve:ssm:/ca-west-1/backup-vault:xr-production-copy}}"`: the ARN comes from SSM at deploy time.
* `{"Fn::Select":[1,["arn:aws:backup:ca-west-1:1:backup-vault:xr-production-copy",{"Fn::ImportValue":"elsewhere-vault-arn"}]]}`.

The same gap applies to any resource, not only the copy rule:
* an `AWS::Events::Rule` target `{"Fn::Sub":["arn:aws:events:us-${D}-1:999999999999:event-bus/default",{"D":"east"}]}` passes;
* `Fn::Join ["",["arn:aws:sqs:us-ea",{"Ref":"Tail"}, …]]`, with Parameter `Tail` defaulting to `"st-1"`, passes.

Fix:
* For `DestinationBackupVaultArn`, accept only the exact literal-plus-Ref shape (see B2).
* Anywhere in resources, flag `Fn::Sub` with a variable map, `Fn::Select` over a mixed list, `Fn::ImportValue` and `{{resolve:` as "region not provable". Or substitute `Fn::Sub` variables before scanning.

**B4 Major: `bypassFindings` misses doors to the guarded actions inside the template.**
Each case below, added as a new ca-central-1 stack, gives 0 bypass or region findings:
* (a) `new iam.CfnUser(s,"U",{policies:[{policyName:"p",policyDocument:{Statement:[{Effect:"Allow",Action:["backup:DeleteBackupVaultAccessPolicy","kms:PutKeyPolicy"],Resource:"*"}]}}]})`. Same for `CfnGroup` with `backup:*`. Only `AWS::IAM::Role` inline `Policies` are read (checks.ts:224-225).
* (b) A role trusted by `AnyPrincipal()` that is allowed `sts:AssumeRole`, `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `backup:StartCopyJob` and `backup:CopyFromBackupVault`. That is privilege escalation to any guarded action. The trust policy is never read.
* (c) Resource policies are not read:
  * a key-policy statement `Allow` to `arn:aws:iam::999999999999:root` of `kms:PutKeyPolicy`;
  * a vault AccessPolicy `Allow` to that account of `backup:DeleteBackupVaultAccessPolicy`.

  Both are applied with `swap(all,"xr-production-copy",…)` and both pass. In each case the deny does not cover the granted action.

Fix:
* Read the `Policies` of User and Group.
* Flag trust in `*` or in another account.
* Add `iam:*` escalation actions and `sts:AssumeRole` on `*` to `GUARDED_ACTIONS`.
* Flag any `Allow` in a KeyPolicy or vault AccessPolicy whose principal is not this account's root.

**B5 Minor: the managed-policy allow list can be fooled.**
The regex is unanchored and runs over `json(flatten(x))` (checks.ts:231).
Repro: `ManagedPolicyArns:[{"Fn::Select":[0,["arn:aws:iam::aws:policy/AdministratorAccess","x:iam::aws:policy/AWSBackupServiceRolePolicyForS3Backup"]]}]` on a role. Result: 0 findings, and the role gets AdministratorAccess.
Fix: accept only a plain string or CDK's exact `Fn::Join` shape, and match the policy name anchored at the end.

**B6 Minor: the vault lock's `MaxRetentionDays` is never checked.**
Repro: `swap(all,"xr-production-copy",t=>{of(t,"AWS::Backup::BackupVault")[0].Properties.LockConfiguration.MaxRetentionDays=7})`. Result: 0 findings, yet a 35-day copy is outside the lock's range, so every copy job would fail (Unconfirmed: AWS docs unreachable).
Fix (checks.ts:175-180): require `MaxRetentionDays` to be absent or at least 35.

**B7 Minor: the backup selection can select nothing and still pass.**
`backupFindings` (checks.ts:209-210) only looks for the resource ids in `BackupSelection.Resources`. Each of these gives 0 findings, and nothing is backed up:
* `NotResources:["*"]`;
* `Conditions:{StringEquals:[{ConditionKey:"aws:ResourceTag/never",ConditionValue:"never"}]}`;
* `BackupPlanId:"some-other-plan"`.

Fix: reject `NotResources`, `Conditions` and `ListOfTags`, and require `BackupPlanId` to be the `GetAtt` of this stack's plan.

**B8 Minor: "nothing leaves Canada" has unguarded runtime doors.**
* `MultiRegion:true` on the data key or a vault key passes. It allows `kms:ReplicateKey` to any region.
* The vault policies do not deny `backup:StartCopyJob` / `backup:CopyFromBackupVault` to other regions. Combined with B4(b), a template role can copy recovery points to us-east-1.
* An `AWS::Backup::ReportPlan` delivering to `someone-elses-bucket` passes. That is job metadata only.

Fix:
* flag `MultiRegion: true`;
* add a vault-policy deny on copy-out unless the destination is the stage's copy vault (condition key Unconfirmed);
* the real guard is an SCP on `aws:RequestedRegion`.

## What held
* Tests 31/31 pass, and `npm run synth` writes four templates offline.
* No secret, key, token or 12-digit account id in the diff, `lib/`, `bin/`, `test/` or cdk.out. The account is always `Ref AWS::AccountId`.
* Tampering with the vault-policy and key-policy deny is caught each way tried: `NotPrincipal` instead of `*`, a narrowed `Resource`, a `Condition`, one principal ARN, or one action removed. Action matching ignores case in both directions: an all-caps `BACKUP:DELETE*` deny counts, and a mixed-case `Backup:DeleteBackupVaultLockConfiguration` allow in an `AWS::IAM::RolePolicy` is caught.
* The region guard catches: an upper-case region in a tag (`US-EAST-1`); a region split across `Fn::Join` parts; an `AWS::KMS::ReplicaKey` or `AWS::S3::Bucket` added to the ca-west-1 stack; S3 replication to a literal bucket; a stack in us-west-2.
* `backupFindings` catches: a second plan in the home stack; a copy whose ARN literally names us-east-1 or a vault no scanned stack defines; a copy, plan or lock kept other than 35 days (a lifecycle shorter than the lock); a compliance-mode lock; a missing copy.
* Inline role policies allowing `backup:*`, `kms:*`, `NotAction`, AdministratorAccess, or `AWS::IAM::Policy` / `ManagedPolicy` attached to a role are all caught.
* Not counted as findings, because AWS would reject them at deploy (Unconfirmed): cold storage after 1 day with a 35-day lifecycle; a second vault with the same name in the same region and account. A logically air-gapped vault that nothing targets moves no data, so it is not a finding either.
