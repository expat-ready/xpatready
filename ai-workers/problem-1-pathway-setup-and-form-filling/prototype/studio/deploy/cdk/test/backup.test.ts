// PF-8rc's assertion tests (map row 14, R1.14): the backup plan, the ca-west-1 copy vaults, the vault locks and the
// "no role can bypass" claim. Each check passes on the real app and fails on a broken copy. Synth only (P-551).
import { test } from "node:test";
import assert from "node:assert/strict";
import { App, Stack, aws_iam as iam } from "aws-cdk-lib";
import { allStacks, buildApp } from "../lib/app.ts";
import { BYPASS_ACTIONS, copyVaultName } from "../lib/backup.ts";
import { HOME, REGION_ALLOW, backupFindings, bucketFindings, bypassFindings, regionFindings, resourcePolicyFindings, typeFindings, vaultFindings, type SynthStack, type Template } from "../lib/checks.ts";

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
  assert.deepEqual(resourcePolicyFindings(all), []); // key and vault policies allow only this account's root
  for (const h of homes) { // one role for AWS Backup; PF-8b's four (two tasks, each an execution and a task role) for ECS tasks only
    const by = (svc: string) => of(h.template, "AWS::IAM::Role").filter((r) => JSON.stringify(r.Properties!.AssumeRolePolicyDocument).includes(`"Service":"${svc}"`)).length;
    assert.deepEqual([by("backup.amazonaws.com"), by("ecs-tasks.amazonaws.com"), of(h.template, "AWS::IAM::Role").length], [1, 4, 5]);
  }
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
  for (const w of ["Unlock", "allows backup:DeleteBackupVaultLockConfiguration", "Repolicy", "allows backup:PutBackupVaultAccessPolicy", "Wild", "allows backup:Delete*", "allows kms:*", "uses NotAction", "AdministratorAccess is not on the allow list", "allows backup:UpdateRecoveryPointLifecycle"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8rc buckets pass and fail: old versions expire after 35 days; a TLS deny on the bucket but not its objects does not count (review R3)", () => {
  for (const h of homes) assert.deepEqual(bucketFindings(h.template), []);
  const t = clone(homes[0].template);
  for (const b of of(t, "AWS::S3::Bucket")) b.Properties!.LifecycleConfiguration = { Rules: [{ Status: "Enabled", NoncurrentVersionExpiration: { NoncurrentDays: 400 } }] };
  for (const p of of(t, "AWS::S3::BucketPolicy")) for (const st of (p.Properties!.PolicyDocument as { Statement: Record<string, unknown>[] }).Statement) st.Resource = [(st.Resource as unknown[])[0]];
  const f = bucketFindings(t);
  assert.equal(f.filter((l) => l.includes("old versions do not expire after 35 days")).length, 3);
  assert.equal(f.filter((l) => l.includes("plain HTTP")).length, 4); // PF-F1c: the access-log bucket's TLS deny too
});

// ---- Round 2: the breaker's B2–B8 and the reviewer's R1–R6 at 0ab64811e, each now caught ----
const home = (stacks: SynthStack[], name = "xr-production") => stacks.find((s) => s.name === name)!;
const copyFails = (dest: unknown) => {
  const b = swap("xr-production", (t) => { rule(t).CopyActions[0].DestinationBackupVaultArn = dest; });
  return [...backupFindings(home(b), b), ...regionFindings(b, REGION_ALLOW)];
};

test("PF-8rc round 2: a copy into another account, the other stage's vault, or a target hidden in Fn::Sub, SSM or Fn::ImportValue is caught (B2, B3, R3)", () => {
  const join = (acct: unknown, name: string) => ({ "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":backup:ca-west-1:", acct, `:backup-vault:${name}`]] });
  for (const dest of [
    "arn:aws:backup:ca-west-1:999999999999:backup-vault:xr-production-copy",
    join("999999999999", "xr-production-copy"),
    join({ Ref: "AWS::AccountId" }, "xr-staging-copy"),
    { "Fn::Sub": ["arn:aws:backup:us-${D}-1:${AWS::AccountId}:backup-vault:xr-production-copy", { D: "east", Note: "ca-west-1" }] },
    "{{resolve:ssm:/ca-west-1/backup-vault:xr-production-copy}}",
    { "Fn::Select": [1, ["arn:aws:backup:ca-west-1:1:backup-vault:xr-production-copy", { "Fn::ImportValue": "elsewhere-vault-arn" }]] },
  ]) assert.ok(copyFails(dest).some((l) => l.includes("copy target is not this account's xr-production-copy vault")), JSON.stringify(dest));
});

test("PF-8rc round 2: anywhere in a template, Fn::Sub with variables, an import, an SSM reference or a region in a parameter default joined in is caught (B3)", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ Value: { "Fn::Sub": ["arn:aws:events:us-${D}-1:1:event-bus/default", { D: "east" }] } }, "Fn::Sub with a variable map"],
    [{ Value: { "Fn::ImportValue": "x" } }, "Fn::ImportValue"],
    [{ Value: "{{resolve:ssm:/x}}" }, "a dynamic reference"],
    [{ Value: { "Fn::Join": ["", ["arn:aws:sqs:us-ea", { Ref: "Tail" }, ":1:q"]] } }, "names region us-east-1"],
  ];
  for (const [props, word] of cases) {
    const b = swap("xr-staging", (t) => { t.Parameters = { ...(t.Parameters as object), Tail: { Type: "String", Default: "st-1" } }; t.Resources!.X = { Type: "AWS::SSM::Parameter", Properties: props }; });
    assert.ok(regionFindings(b, REGION_ALLOW).some((l) => l.includes("xr-staging/X") && l.includes(word)), word);
  }
});

test("PF-8rc round 2: a multi-region key, a replica key and a backup report plan are refused (B8)", () => {
  const b = swap("xr-staging", (t) => {
    Object.values(t.Resources!).find((r) => r.Type === "AWS::KMS::Key")!.Properties!.MultiRegion = true;
    t.Resources!.Replica = { Type: "AWS::KMS::ReplicaKey", Properties: { PrimaryKeyArn: "x", KeyPolicy: {} } };
    t.Resources!.Report = { Type: "AWS::Backup::ReportPlan", Properties: { ReportDeliveryChannel: { S3BucketName: "anywhere" } } };
  });
  const f = regionFindings(b, REGION_ALLOW).join("\n");
  for (const w of ["is a multi-region key", "Replica (AWS::KMS::ReplicaKey) is a multi-region resource", "Report (AWS::Backup::ReportPlan) is a multi-region resource"]) assert.ok(f.includes(w), w);
});

test("PF-8rc round 2: user and group inline policies, IAM writes, role assumption, trust in anyone and a customer managed policy are caught (B4 a/b, R1, R2, R6)", () => {
  const app = new App({ analyticsReporting: false });
  const bad = new Stack(app, "bad", { env: { region: HOME } });
  const doc = (Action: string[]) => ({ Statement: [{ Effect: "Allow", Action, Resource: "*" }] });
  new iam.CfnUser(bad, "U", { policies: [{ policyName: "p", policyDocument: doc(["backup:DeleteBackupVaultAccessPolicy"]) }] });
  new iam.CfnGroup(bad, "G", { policies: [{ policyName: "p", policyDocument: doc(["backup:*"]) }] });
  new iam.Role(bad, "Anyone", { assumedBy: new iam.AnyPrincipal() });
  new iam.Role(bad, "Escalate", { assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"), inlinePolicies: { p: new iam.PolicyDocument({ statements: [new iam.PolicyStatement({ actions: ["iam:*", "sts:AssumeRole"], resources: ["*"] })] }) } });
  new iam.ManagedPolicy(bad, "Mine", { statements: [new iam.PolicyStatement({ actions: ["backup:PutBackupVaultLockConfiguration"], resources: ["*"] })] });
  const f = bypassFindings(allStacks(app)).join("\n");
  for (const w of ["bad/U", "allows backup:DeleteBackupVaultAccessPolicy", "bad/G", "may be assumed by", "allows iam:*", "allows sts:AssumeRole", "Mine", "allows backup:PutBackupVaultLockConfiguration"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8rc round 2: AdministratorAccess hidden in Fn::Select or Fn::If beside an allowed policy is caught (B5, R5)", () => {
  const allowed = "arn:aws:iam::aws:policy/AWSBackupServiceRolePolicyForS3Backup", admin = "arn:aws:iam::aws:policy/AdministratorAccess";
  for (const arn of [{ "Fn::Select": [0, [admin, allowed]] }, { "Fn::If": ["C", admin, allowed] }]) {
    const b = swap("xr-staging", (t) => { (Object.values(t.Resources!).find((r) => r.Type === "AWS::IAM::Role" && r.Properties!.ManagedPolicyArns)!.Properties!.ManagedPolicyArns as unknown[]).push(arn); /* the Backup role: PF-8b adds ECS roles */ });
    assert.ok(bypassFindings(b).some((l) => l.includes("AdministratorAccess is not on the allow list")), JSON.stringify(arn));
  }
});

test("PF-8rc round 2: a key or vault policy allowing another account, a too-short lock maximum and a narrowed deny Resource are caught (B4 c, B6, R6)", () => {
  const other = { AWS: "arn:aws:iam::999999999999:root" };
  const b = swap("xr-production-copy", (t) => {
    (of(t, "AWS::KMS::Key")[0].Properties!.KeyPolicy as { Statement: unknown[] }).Statement.push({ Effect: "Allow", Principal: other, Action: "kms:PutKeyPolicy", Resource: "*" });
    const v = of(t, "AWS::Backup::BackupVault")[0].Properties!;
    (v.AccessPolicy as { Statement: unknown[] }).Statement.push({ Effect: "Allow", Principal: other, Action: "backup:DeleteBackupVaultAccessPolicy", Resource: "*" });
    v.LockConfiguration = { MinRetentionDays: 35, MaxRetentionDays: 7 };
  });
  const f = resourcePolicyFindings(b).join("\n");
  assert.ok(f.includes("AWS::KMS::Key): allows \"kms:PutKeyPolicy\"") && f.includes("AWS::Backup::BackupVault): allows \"backup:DeleteBackupVaultAccessPolicy\""), f);
  assert.ok(vaultFindings(b).some((l) => l.includes("vault lock maximum 7 days")));
  const narrow = swap("xr-staging", (t) => { (of(t, "AWS::Backup::BackupVault")[0].Properties!.AccessPolicy as { Statement: Record<string, unknown>[] }).Statement[0].Resource = "arn:aws:backup:ca-central-1:1:recovery-point:x"; });
  assert.ok(vaultFindings(narrow).some((l) => l.includes("does not deny backup:DeleteRecoveryPoint")));
});

test("PF-8rc round 2: a selection narrowed by NotResources, Conditions or tags, or tied to another plan, a second plan and a disabled lifecycle rule are caught (B7, R4, R6)", () => {
  for (const [k, v] of [["NotResources", ["*"]], ["Conditions", { StringEquals: [{ ConditionKey: "aws:ResourceTag/x", ConditionValue: "never" }] }], ["ListOfTags", [{ ConditionType: "STRINGEQUALS", ConditionKey: "x", ConditionValue: "y" }]]] as const) {
    const b = swap("xr-production", (t) => { (of(t, "AWS::Backup::BackupSelection")[0].Properties!.BackupSelection as Record<string, unknown>)[k] = v; });
    assert.ok(backupFindings(home(b), b).some((l) => l.includes(`the selection has ${k}`)), k);
  }
  const other = swap("xr-production", (t) => { of(t, "AWS::Backup::BackupSelection")[0].Properties!.BackupPlanId = "someone-elses-plan"; });
  assert.ok(backupFindings(home(other), other).some((l) => l.includes("not this stack's plan's")));
  const two = swap("xr-production", (t) => { t.Resources!.Second = clone(of(t, "AWS::Backup::BackupPlan")[0]); });
  assert.ok(backupFindings(home(two), two).some((l) => l.includes("2 backup plans, not 1")));
  const off = clone(homes[0].template);
  for (const bk of of(off, "AWS::S3::Bucket")) (bk.Properties!.LifecycleConfiguration as { Rules: Record<string, unknown>[] }).Rules[0].Status = "Disabled";
  assert.equal(bucketFindings(off).filter((l) => l.includes("old versions do not expire")).length, 3);
});

// ---- Round 3: the breaker's round 2 (R2-1..R2-5) and the reviewer's N1–N3 at 6e5569b0d ----
const roleOf = (t: Template) => Object.values(t.Resources!).find((r) => r.Type === "AWS::IAM::Role")!.Properties!;
const policyOf = (t: Template) => Object.values(t.Resources!).find((r) => r.Type === "AWS::IAM::Policy")!.Properties!;

test("PF-8rc round 3: every resource type is one the estate is made of; a Lambda function or a custom resource is refused", () => {
  assert.deepEqual(typeFindings(all), []);
  const b = swap("xr-staging", (t) => { t.Resources!.Fn = { Type: "AWS::Lambda::Function", Properties: {} }; t.Resources!.Cr = { Type: "Custom::Anything", Properties: {} }; });
  const f = typeFindings(b).join("\n");
  assert.ok(f.includes("AWS::Lambda::Function is not an estate type") && f.includes("Custom::Anything is not an estate type"), f);
});

test("PF-8rc round 3: a policy built from Fn::If, Fn::Split or a JSON string cannot be read, and is a finding (R2-1)", () => {
  const edits: [string, (t: Template) => void, string][] = [
    ["action Fn::If", (t) => { (policyOf(t).PolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Action = { "Fn::If": ["C", "backup:*", "kms:Decrypt"] }; }, "a policy cannot be read: Action"],
    ["action Fn::Split", (t) => { (policyOf(t).PolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Action = { "Fn::Split": [",", "backup:*,kms:Decrypt"] }; }, "a policy cannot be read: Action"],
    ["statement Fn::If", (t) => { (policyOf(t).PolicyDocument as { Statement: unknown[] }).Statement.push({ "Fn::If": ["C", { Effect: "Allow", Action: "backup:*", Resource: "*" }, { Ref: "AWS::NoValue" }] }); }, "a statement uses Fn::If"],
    ["string document", (t) => { policyOf(t).PolicyDocument = JSON.stringify({ Statement: [{ Effect: "Allow", Action: "backup:*", Resource: "*" }] }); }, "the policy document is not a literal object"],
    ["trust Fn::If", (t) => { (roleOf(t).AssumeRolePolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Principal = { "Fn::If": ["C", { AWS: "*" }, { Service: "backup.amazonaws.com" }] }; }, "may be assumed by"],
    ["service Fn::If", (t) => { (roleOf(t).AssumeRolePolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Principal = { Service: { "Fn::If": ["C", "lambda.amazonaws.com", "backup.amazonaws.com"] } }; }, "may be assumed by"],
    ["another service", (t) => { (roleOf(t).AssumeRolePolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Principal = { Service: "lambda.amazonaws.com" }; }, "may be assumed by"],
  ];
  for (const [name, edit, word] of edits) assert.ok(bypassFindings(swap("xr-staging", edit)).some((l) => l.includes(word)), name);
  const key = swap("xr-production-copy", (t) => { (of(t, "AWS::KMS::Key")[0].Properties!.KeyPolicy as { Statement: unknown[] }).Statement.push({ "Fn::If": ["C", { Effect: "Allow", Principal: { AWS: "arn:aws:iam::999999999999:root" }, Action: "kms:PutKeyPolicy", Resource: "*" }, { Ref: "AWS::NoValue" }] }); });
  assert.ok(resourcePolicyFindings(key).some((l) => l.includes("its policy cannot be read: a statement uses Fn::If")));
});

test("PF-8rc round 3: only listed actions may be allowed; CloudFormation, IAM, Lambda and copy-job escalations are refused (R2-2, review N2)", () => {
  const acts = ["cloudformation:UpdateStack", "cloudformation:ExecuteChangeSet", "iam:CreateAccessKey", "iam:AddUserToGroup", "iam:DeleteRolePermissionsBoundary", "lambda:UpdateFunctionCode", "backup:StartCopyJob", "backup:CopyFromBackupVault"];
  const b = swap("xr-staging", (t) => { (policyOf(t).PolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Action = acts; });
  const f = bypassFindings(b).join("\n");
  for (const a of acts) assert.ok(f.includes(`allows ${a}, not on the allow list`), a);
});

test("PF-8rc round 3: a key or vault policy may allow only this account's root, never a service (R2-5)", () => {
  const b = swap("xr-production-copy", (t) => { (of(t, "AWS::KMS::Key")[0].Properties!.KeyPolicy as { Statement: unknown[] }).Statement.push({ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "kms:PutKeyPolicy", Resource: "*" }); });
  assert.ok(resourcePolicyFindings(b).some((l) => l.includes('allows "kms:PutKeyPolicy" to {"Service":"lambda.amazonaws.com"}')));
});

test("PF-8rc round 3: MultiRegion as a string or Fn::If, and a lock maximum through Fn::If, are caught (R2-4)", () => {
  for (const v of ["true", { "Fn::If": ["C", true, false] }]) {
    const b = swap("xr-staging", (t) => { of(t, "AWS::KMS::Key")[0].Properties!.MultiRegion = v; });
    assert.ok(regionFindings(b, REGION_ALLOW).some((l) => l.includes("is a multi-region key")), JSON.stringify(v));
  }
  const m = swap("xr-staging-copy", (t) => { of(t, "AWS::Backup::BackupVault")[0].Properties!.LockConfiguration = { MinRetentionDays: 35, MaxRetentionDays: { "Fn::If": ["C", 7, 100] } }; });
  assert.ok(vaultFindings(m).some((l) => l.includes("vault lock maximum")));
});

test("PF-8rc round 3: a parameter with no default or from SSM, Fn::FindInMap, a delimiter from a parameter, a split dynamic reference, and Fn::Sub ${Param} are caught (R2-3, N1, N3)", () => {
  const params = { NoDefault: { Type: "String" }, FromSsm: { Type: "AWS::SSM::Parameter::Value<String>", Default: "/x" }, Sep: { Type: "String", Default: "-" }, Tail: { Type: "String", Default: "st-1" } };
  const cases: [unknown, string][] = [
    [{ Ref: "NoDefault" }, "a parameter set at deploy time (NoDefault)"],
    [{ Ref: "FromSsm" }, "a parameter set at deploy time (FromSsm)"],
    [{ "Fn::Join": ["", ["arn:aws:sqs:", { "Fn::FindInMap": ["M", "a", "b"] }, ":1:q"]] }, "Fn::FindInMap"],
    [{ "Fn::Join": [{ Ref: "Sep" }, ["us", "east", "1"]] }, "delimiter is not a literal"],
    [{ "Fn::Join": ["", ["{{res", "olve:ssm:/x}}"]] }, "a dynamic reference"],
    [{ "Fn::Sub": "arn:aws:sqs:us-ea${Tail}:1:q" }, "names region us-east-1"],
  ];
  for (const [value, word] of cases) {
    const b = swap("xr-staging", (t) => { t.Parameters = { ...(t.Parameters as object), ...params }; t.Resources!.X = { Type: "AWS::SSM::Parameter", Properties: { Value: value } }; });
    assert.ok(regionFindings(b, REGION_ALLOW).some((l) => l.includes("xr-staging/X") && l.includes(word)), word);
  }
});

// ---- Round 4: the breaker's round 3 (R3-1..R3-5) and the reviewer's M1–M4 at 2a41fd9ac ----
test("PF-8rc round 4: a whole policy document, trust document, key policy or Policies list in Fn::If is refused, not read as empty (R3-1, M1)", () => {
  const wrap = (d: unknown) => ({ "Fn::If": ["C", { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] }, d] });
  const b = swap("xr-staging", (t) => {
    policyOf(t).PolicyDocument = wrap(policyOf(t).PolicyDocument);
    roleOf(t).AssumeRolePolicyDocument = wrap(roleOf(t).AssumeRolePolicyDocument);
    roleOf(t).Policies = { "Fn::If": ["C", [{ PolicyName: "p", PolicyDocument: { Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] } }], { Ref: "AWS::NoValue" }] };
    of(t, "AWS::KMS::Key")[0].Properties!.KeyPolicy = wrap(of(t, "AWS::KMS::Key")[0].Properties!.KeyPolicy);
  });
  const f = [...bypassFindings(b), ...resourcePolicyFindings(b)].join("\n");
  for (const w of ["(AWS::IAM::Policy): a policy cannot be read: the policy document has keys Fn::If", "its trust policy cannot be read", "its Policies cannot be read", "(AWS::KMS::Key): its policy cannot be read"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8rc round 4: a bucket policy may only deny; an Allow to another account, or a policy in Fn::If, is caught (R3-2)", () => {
  const b = swap("xr-staging", (t) => { (of(t, "AWS::S3::BucketPolicy")[0].Properties!.PolicyDocument as { Statement: unknown[] }).Statement.push({ Effect: "Allow", Principal: { AWS: "arn:aws:iam::999999999999:root" }, Action: "s3:*", Resource: "*" }); });
  assert.ok(resourcePolicyFindings(b).some((l) => l.includes("a bucket policy may only deny")));
  const w = swap("xr-staging", (t) => { const p = of(t, "AWS::S3::BucketPolicy")[0].Properties!; p.PolicyDocument = { "Fn::If": ["C", p.PolicyDocument, p.PolicyDocument] }; });
  assert.ok(resourcePolicyFindings(w).some((l) => l.includes("(AWS::S3::BucketPolicy): its policy cannot be read")));
});

test("PF-8rc round 4: any parameter in a resource, by Ref or by ${} in Fn::Sub, is refused, even with a home-region default (R3-3)", () => {
  for (const value of [{ "Fn::Sub": "${Dest}" }, { Ref: "Home" }]) {
    const b = swap("xr-staging", (t) => {
      t.Parameters = { ...(t.Parameters as object), Dest: { Type: "String" }, Home: { Type: "String", Default: "ca-central-1" } };
      of(t, "AWS::RDS::DBInstance")[0].Properties!.AutomaticBackupReplicationRegion = value;
    });
    assert.ok(regionFindings(b, REGION_ALLOW).some((l) => l.includes("a parameter set at deploy time")), JSON.stringify(value));
  }
});

test("PF-8rc round 4: managed policies in Fn::If are a finding, not a crash (R3-4)", () => {
  const b = swap("xr-staging", (t) => { roleOf(t).ManagedPolicyArns = { "Fn::If": ["C", ["arn:aws:iam::aws:policy/AdministratorAccess"], []] }; });
  assert.ok(bypassFindings(b).some((l) => l.includes("its managed policies cannot be read")));
});

test("PF-8rc round 4: an allowed action on everything, a policy attached to users or an outside role, a non-literal Effect and a trust action other than sts:AssumeRole are caught (R3-5, M2, M4)", () => {
  const f = bypassFindings(swap("xr-staging", (t) => {
    const p = policyOf(t), st = (p.PolicyDocument as { Statement: Record<string, unknown>[] }).Statement;
    st[0].Resource = "*";
    p.Users = ["someone"]; p.Roles = ["outside-role"];
    (roleOf(t).AssumeRolePolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Action = "sts:AssumeRoleWithWebIdentity";
  })).join("\n");
  for (const w of ['allows on "*", not a resource this stack defines', "attached to users or groups", 'attached to "outside-role"', "may be assumed by"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
  const e = bypassFindings(swap("xr-staging", (t) => { (policyOf(t).PolicyDocument as { Statement: Record<string, unknown>[] }).Statement[0].Effect = { "Fn::If": ["C", "Allow", "Deny"] }; }));
  assert.ok(e.some((l) => l.includes("is not a literal")));
});
