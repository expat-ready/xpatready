// PF-8rc (map row 14, R1.14): the AWS Backup plan and its copy outside the home region, synth only (no account, P-551).
// Daily backups of the database and the three buckets into a vault in ca-central-1, kept 35 days, each copied to a vault
// in ca-west-1 kept 35 days (NFR5-04: "all in Canadian regions"; P-586). Each vault has its own KMS key, a vault lock in
// governance mode (a minimum retention and no ChangeableForDays, so no compliance-mode cooling-off ever starts) and an
// access policy that denies, to every principal, the actions that would bypass the lock: removing or loosening it,
// deleting a recovery point early, shortening its lifecycle or deleting the vault (`BYPASS_ACTIONS`). An explicit deny
// wins over any allow, so the claim "no role can bypass" rests on the template, not on what AWS's managed policies hold.
// Unconfirmed (docs.aws.amazon.com unreachable from the build lane, 21 Nov): that a vault access policy can deny each of
// these actions, that it binds the account's root user too, and that it does not stop AWS Backup's own expiry at 35
// days. The cloud drill (held, P-251) proves them in the founder's account.
import { Duration, RemovalPolicy, Stack, Tags, type StackProps, aws_backup as backup, aws_events as events, aws_iam as iam, aws_kms as kms } from "aws-cdk-lib";
import type { Construct } from "constructs";
import type { Stage } from "./estate.ts";

export const COPY_REGION = "ca-west-1";
export const RETENTION_DAYS = 35; // both vaults: the same 35 days as the database's own automated backups
/** The actions that would bypass the vault lock in governance mode; every vault policy denies them to every principal. */
export const BYPASS_ACTIONS = [
  "backup:DeleteBackupVaultLockConfiguration",
  "backup:PutBackupVaultLockConfiguration", // in governance mode a new lock may lower the minimum: denied too
  "backup:DeleteRecoveryPoint",
  "backup:UpdateRecoveryPointLifecycle",
  "backup:DeleteBackupVault",
];
/** Destroying a vault's key destroys its backups: denied to every principal in the key's own policy. */
export const KEY_DESTROY_ACTIONS = ["kms:ScheduleKeyDeletion", "kms:DisableKey"];
/** Changing the vault policy would lift the deny: no role in the template may hold these either (checked, not denied, so
 *  the policy itself stays changeable by a deploy). */
export const POLICY_ACTIONS = ["backup:PutBackupVaultAccessPolicy", "backup:DeleteBackupVaultAccessPolicy"];
/** The copy vault's name is fixed so the home plan can name it without a cross-region reference. */
export const copyVaultName = (stage: Stage) => `xr-${stage}-copy`;

/** A KMS key and a locked vault with the deny policy: the home vault and the copy vault are built by this one function. */
export function lockedVault(scope: Construct, stage: Stage, name: string): { key: kms.Key; vault: backup.BackupVault } {
  const key = new kms.Key(scope, "VaultKey", {
    alias: `alias/${name}`,
    description: `Expat Ready ${stage}: backup vault ${name}`,
    enableKeyRotation: true,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  // Deleting or disabling the vault's key would make every copy unreadable, a bypass by another door (break-style): the
  // key policy denies both to every principal. Changing the key policy itself stays allowed (no lock-out of the key).
  key.addToResourcePolicy(new iam.PolicyStatement({ sid: "NoKeyDestruction", effect: iam.Effect.DENY, principals: [new iam.AnyPrincipal()], actions: KEY_DESTROY_ACTIONS, resources: ["*"] }));
  const vault = new backup.BackupVault(scope, "Vault", {
    backupVaultName: name,
    encryptionKey: key,
    lockConfiguration: { minRetention: Duration.days(RETENTION_DAYS) }, // no changeableFor: governance mode
    accessPolicy: new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({ sid: "NoLockBypass", effect: iam.Effect.DENY, principals: [new iam.AnyPrincipal()], actions: BYPASS_ACTIONS, resources: ["*"] })],
    }),
    removalPolicy: RemovalPolicy.RETAIN,
  });
  return { key, vault };
}

/** The ca-west-1 copy stack: only a KMS key and the copy vault (the region guard admits nothing else there). */
export class BackupCopyStack extends Stack {
  readonly vault: backup.BackupVault;
  constructor(scope: Construct, id: string, props: StackProps & { stage: Stage }) {
    super(scope, id, { ...props, env: { account: props.env?.account, region: COPY_REGION } });
    Tags.of(this).add("xr:stage", props.stage);
    this.vault = lockedVault(this, props.stage, copyVaultName(props.stage)).vault;
  }
}

/** The home vault and the daily plan in the estate stack: the database and every bucket, kept 35 days, copied to the
 *  stage's ca-west-1 vault and kept 35 days there. The role is AWS Backup's own (backups only; restores are the drill's
 *  step with its own role, RUNBOOK-restore.md §3). */
export function backupPlan(home: Stack, stage: Stage, resources: backup.BackupResource[], dataKey: kms.IKey): backup.BackupPlan {
  const { vault } = lockedVault(home, stage, `xr-${stage}-home`);
  // ARN built from the fixed name: the home stack never imports from the copy stack (no cross-region reference).
  const copy = backup.BackupVault.fromBackupVaultArn(home, "CopyVault", `arn:${home.partition}:backup:${COPY_REGION}:${home.account}:backup-vault:${copyVaultName(stage)}`);
  const plan = new backup.BackupPlan(home, "BackupPlan", { backupPlanName: `xr-${stage}-daily`, backupVault: vault });
  plan.addRule(new backup.BackupPlanRule({
    ruleName: "daily",
    scheduleExpression: events.Schedule.cron({ minute: "0", hour: "7" }), // 07:00 UTC, 03:00 Toronto: Sample, outside office hours
    deleteAfter: Duration.days(RETENTION_DAYS),
    copyActions: [{ destinationBackupVault: copy, deleteAfter: Duration.days(RETENTION_DAYS) }],
  }));
  const selection = plan.addSelection("Estate", { resources, allowRestores: false });
  // S3 needs its own AWS-managed policy (CDK attaches only the generic one). Unconfirmed: its exact path and contents.
  (selection.grantPrincipal as iam.Role).addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSBackupServiceRolePolicyForS3Backup"));
  dataKey.grantDecrypt(selection.grantPrincipal); // the database and buckets are encrypted with the stage's data key
  return plan;
}
