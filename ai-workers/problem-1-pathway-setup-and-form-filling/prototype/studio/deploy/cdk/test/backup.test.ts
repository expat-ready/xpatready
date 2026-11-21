// PF-8rc's assertion tests (map row 14, R1.14): the backup plan, the ca-west-1 copy vaults, the vault locks and the
// "no role can bypass" claim. Each check passes on the real app and fails on a broken copy. Synth only (P-551).
import { test } from "node:test";
import assert from "node:assert/strict";
import { App, Stack, aws_iam as iam } from "aws-cdk-lib";
import { allStacks, buildApp } from "../lib/app.ts";
import { BYPASS_ACTIONS, copyVaultName } from "../lib/backup.ts";
import { HOME, REGION_ALLOW, backupFindings, bucketFindings, bypassFindings, regionFindings, vaultFindings, type SynthStack, type Template } from "../lib/checks.ts";

const all: SynthStack[] = allStacks(buildApp().app);
const homes = all.filter((s) => s.region === HOME);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const of = (t: Template, type: string) => Object.values(t.Resources ?? {}).filter((r) => r.Type === type);
/** The app's stacks with one stack's template replaced by a broken copy. */
const swap = (name: string, edit: (t: Template) => void): SynthStack[] => all.map((s) => {
  if (s.name !== name) return s;
  const t = clone(s.template); edit(t); return { ...s, template: t };
});
type Rule = { CopyActions: { DestinationBackupVaultArn: unknown; Lifecycle: { DeleteAfterDays: number } }[]; Lifecycle: { DeleteAfterDays: number }; ScheduleExpression: string };
const rule = (t: Template) => (of(t, "AWS::Backup::BackupPlan")[0].Properties!.BackupPlan as { BackupPlanRule: Rule[] }).BackupPlanRule[0];

for (const h of homes) {
  test(`PF-8rc plan pass (${h.name}): daily, the database and all three buckets, kept 35 days, copied to ca-west-1 only and kept 35 days there`, () => {
    assert.deepEqual(backupFindings(h, all), []);
    const r = rule(h.template);
    assert.equal(r.CopyActions.length, 1);
    assert.match(JSON.stringify(r.CopyActions[0].DestinationBackupVaultArn), new RegExp(`:backup:ca-west-1:.*backup-vault:${copyVaultName(h.name.slice(3) as "staging")}`));
  });
}

test("PF-8rc region pass and fail: the copy rule names ca-west-1 and nothing else outside ca-central-1; a copy to us-east-1 is caught twice", () => {
  assert.deepEqual(regionFindings(all, REGION_ALLOW), []);
  const broken = swap("xr-production", (t) => { rule(t).CopyActions[0].DestinationBackupVaultArn = "arn:aws:backup:us-east-1:1:backup-vault:xr-production-copy"; });
  assert.ok(regionFindings(broken, REGION_ALLOW).some((l) => l.includes("names region us-east-1")));
  const f = backupFindings(broken.find((s) => s.name === "xr-production")!, broken).join("\n");
  assert.match(f, /copies to us-east-1, not ca-west-1 alone/);
  // a copy to ca-west-1 but into a vault no scanned stack defines (so with no lock or deny) is caught too
  const foreign = swap("xr-production", (t) => { rule(t).CopyActions[0].DestinationBackupVaultArn = "arn:aws:backup:ca-west-1:1:backup-vault:someone-elses"; });
  assert.ok(backupFindings(foreign.find((s) => s.name === "xr-production")!, foreign).some((l) => l.includes('copy vault "someone-elses" is not a vault in a scanned ca-west-1 stack')));
});

test("PF-8rc region fail: the ca-west-1 stack may hold only the vault and its key; a bucket or a third region there is caught", () => {
  const withBucket = swap("xr-staging-copy", (t) => { t.Resources!.Stray = { Type: "AWS::S3::Bucket", Properties: {} }; });
  assert.ok(regionFindings(withBucket, REGION_ALLOW).some((l) => l.startsWith("xr-staging-copy: AWS::S3::Bucket in region ca-west-1")));
  const elsewhere = swap("xr-staging-copy", (t) => { t.Resources!.Note = { Type: "AWS::KMS::Alias", Properties: { AliasName: "alias/eu-west-1" } }; });
  assert.ok(regionFindings(elsewhere, REGION_ALLOW).some((l) => l.includes("names region eu-west-1")));
  const app = new App({ analyticsReporting: false });
  const moved = allStacks(app).concat([{ name: "xr-west-2", region: "us-west-2", template: { Resources: {} } }]);
  assert.ok(regionFindings(moved, REGION_ALLOW).some((l) => l.startsWith("xr-west-2: stack region us-west-2"))); // only ca-west-1 is admitted
});

test("PF-8rc plan fail: retention, schedule, copy retention, a missing copy, a foreign target vault and an unselected bucket are each named", () => {
  const t = clone(homes[0].template);
  const r = rule(t);
  r.Lifecycle.DeleteAfterDays = 7; r.CopyActions[0].Lifecycle.DeleteAfterDays = 1; r.ScheduleExpression = "cron(0 7 ? * 1 *)";
  (r as unknown as Record<string, unknown>).TargetBackupVault = "Default";
  const sel = of(t, "AWS::Backup::BackupSelection")[0].Properties!.BackupSelection as { Resources: unknown[] };
  sel.Resources = sel.Resources.slice(0, 2); // the database and documents only
  const f = backupFindings({ ...homes[0], template: t }, all).join("\n");
  for (const w of ["kept 7 days, not 35", "copy kept 1 days, not 35", "not daily", "target vault is not one this stack defines", "ExportsBucket", "ImportsBucket"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
  const none = clone(homes[0].template); rule(none).CopyActions = [];
  assert.ok(backupFindings({ ...homes[0], template: none }, all).some((l) => l.includes("no copy outside the home region")));
});

test("PF-8rc vaults pass: all four vaults (two home, two copy) have their own key, a 35-day governance lock and the deny policy", () => {
  assert.equal(all.flatMap((s) => of(s.template, "AWS::Backup::BackupVault")).length, 4);
  assert.deepEqual(vaultFindings(all), []);
});

test("PF-8rc vaults fail: compliance mode, a shorter lock, no lock, a narrowed deny and an undeleteable-key gap are each named", () => {
  const cases: [(p: Record<string, unknown>, t: Template) => void, string][] = [
    [(p) => { p.LockConfiguration = { MinRetentionDays: 35, ChangeableForDays: 3 }; }, "compliance mode"],
    [(p) => { p.LockConfiguration = { MinRetentionDays: 7 }; }, "minimum 7 days"],
    [(p) => { delete p.LockConfiguration; }, "no vault lock"],
    [(p) => { (p.AccessPolicy as { Statement: Record<string, unknown>[] }).Statement[0].Action = BYPASS_ACTIONS.slice(1); }, "does not deny backup:DeleteBackupVaultLockConfiguration"],
    [(p) => { (p.AccessPolicy as { Statement: Record<string, unknown>[] }).Statement[0].Principal = { AWS: "arn:aws:iam::1:role/x" }; }, "does not deny backup:DeleteRecoveryPoint"],
    [(p) => { (p.AccessPolicy as { Statement: Record<string, unknown>[] }).Statement[0].Condition = { StringEquals: { "aws:PrincipalTag/x": "y" } }; }, "does not deny backup:DeleteBackupVault"],
    [(p) => { p.EncryptionKeyArn = "arn:aws:kms:ca-west-1:1:alias/aws/backup"; }, "not encrypted with a KMS key its stack defines"],
    [(_p, t) => { for (const k of of(t, "AWS::KMS::Key")) (k.Properties!.KeyPolicy as { Statement: Record<string, unknown>[] }).Statement = (k.Properties!.KeyPolicy as { Statement: Record<string, unknown>[] }).Statement.filter((s) => s.Effect !== "Deny"); }, "does not deny kms:ScheduleKeyDeletion"],
  ];
  for (const [edit, word] of cases) {
    const broken = swap("xr-production-copy", (t) => edit(of(t, "AWS::Backup::BackupVault")[0].Properties!, t));
    assert.ok(vaultFindings(broken).some((l) => l.startsWith("xr-production-copy/") && l.includes(word)), word);
  }
  // a wildcard deny covers the list (backup:Delete* plus backup:Put*Lock* plus Update*)
  const wild = swap("xr-staging", (t) => { (of(t, "AWS::Backup::BackupVault")[0].Properties!.AccessPolicy as { Statement: Record<string, unknown>[] }).Statement[0].Action = ["backup:*"]; });
  assert.deepEqual(vaultFindings(wild), []);
});

test("PF-8rc no role can bypass, pass: the only role is AWS Backup's, with its own managed policies and kms:Decrypt on the data key", () => {
  assert.deepEqual(bypassFindings(all), []);
  for (const h of homes) assert.equal(of(h.template, "AWS::IAM::Role").length, 1);
});

test("PF-8rc no role can bypass, fail: a role allowed the lock bypass, the vault policy, a wildcard, NotAction or an admin managed policy is caught", () => {
  const app = new App({ analyticsReporting: false });
  const bad = new Stack(app, "bad", { env: { region: HOME } });
  const role = (id: string, st: iam.PolicyStatement) => new iam.Role(bad, id, { assumedBy: new iam.AccountRootPrincipal(), inlinePolicies: { p: new iam.PolicyDocument({ statements: [st] }) } });
  role("Unlock", new iam.PolicyStatement({ actions: ["backup:DeleteBackupVaultLockConfiguration"], resources: ["*"] }));
  role("Repolicy", new iam.PolicyStatement({ actions: ["backup:PutBackupVaultAccessPolicy"], resources: ["*"] }));
  role("Wild", new iam.PolicyStatement({ actions: ["backup:Delete*"], resources: ["*"] }));
  role("Key", new iam.PolicyStatement({ actions: ["kms:*"], resources: ["*"] }));
  const not = role("Not", new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: ["*"] }));
  (not.node.defaultChild as iam.CfnRole).addPropertyOverride("Policies.0.PolicyDocument.Statement.0", { Effect: "Allow", NotAction: "iam:*", Resource: "*" });
  new iam.Role(bad, "Admin", { assumedBy: new iam.AccountRootPrincipal(), managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")] });
  new iam.Policy(bad, "Attached", { statements: [new iam.PolicyStatement({ actions: ["backup:UpdateRecoveryPointLifecycle"], resources: ["*"] })], roles: [new iam.Role(bad, "Plain", { assumedBy: new iam.AccountRootPrincipal() })] });
  const f = bypassFindings(allStacks(app)).join("\n");
  for (const w of ["Unlock", "allows backup:DeleteBackupVaultLockConfiguration", "Repolicy", "allows backup:PutBackupVaultAccessPolicy", "Wild", "allows backup:DeleteRecoveryPoint", "allows kms:ScheduleKeyDeletion", "allows kms:PutKeyPolicy", "allows by NotAction", "AdministratorAccess is not on the allow list", "allows backup:UpdateRecoveryPointLifecycle"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8rc buckets pass and fail: old versions expire after 35 days; a TLS deny on the bucket but not its objects does not count (review R3)", () => {
  for (const h of homes) assert.deepEqual(bucketFindings(h.template), []);
  const t = clone(homes[0].template);
  for (const b of of(t, "AWS::S3::Bucket")) b.Properties!.LifecycleConfiguration = { Rules: [{ Status: "Enabled", NoncurrentVersionExpiration: { NoncurrentDays: 400 } }] };
  for (const p of of(t, "AWS::S3::BucketPolicy")) for (const st of (p.Properties!.PolicyDocument as { Statement: Record<string, unknown>[] }).Statement) st.Resource = [(st.Resource as unknown[])[0]];
  const f = bucketFindings(t);
  assert.equal(f.filter((l) => l.includes("old versions do not expire after 35 days")).length, 3);
  assert.equal(f.filter((l) => l.includes("plain HTTP")).length, 3);
});
