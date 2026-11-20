// PF-8a's assertion tests (map row 1; R1.14's base): each check passes on the real stacks and fails on a broken one, so
// no check is blind. Synth only: no AWS account, key or network. Run: npm test (node --test test/), in deploy/cdk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { App, RemovalPolicy, Stack, aws_s3 as s3 } from "aws-cdk-lib";
import { Template as Assert } from "aws-cdk-lib/assertions";
import { buildApp, STAGES } from "../lib/app.ts";
import { EstateStack } from "../lib/estate.ts";
import { availabilityFindings, bucketFindings, databaseFindings, regionFindings, type SynthStack, type Template } from "../lib/checks.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const { stacks } = buildApp();
const tpl = (s: Stack): Template => Assert.fromStack(s).toJSON() as Template;
const real: SynthStack[] = STAGES.map((st) => ({ name: stacks[st].stackName, region: stacks[st].region, template: tpl(stacks[st]) }));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const firstOf = (t: Template, type: string) => Object.values(t.Resources ?? {}).find((r) => r.Type === type)!;

test("PF-8a region pass: both stacks are in ca-central-1 and no resource names another region", () => {
  assert.deepEqual(real.map((s) => s.region), ["ca-central-1", "ca-central-1"]);
  assert.deepEqual(regionFindings(real), []);
});

test("PF-8a region pass: a stray AWS_REGION or a caller's region cannot move the estate", () => {
  const app = new App({ analyticsReporting: false });
  const s = new EstateStack(app, "moved", { stage: "staging", env: { region: "us-east-1" } });
  assert.equal(s.region, "ca-central-1");
});

test("PF-8a region fail: a test stack with a us-east-1 bucket is caught (shown once, never part of the app)", () => {
  const app = new App({ analyticsReporting: false });
  const bad = new Stack(app, "bad", { env: { region: "us-east-1" } });
  new s3.Bucket(bad, "Stray", { removalPolicy: RemovalPolicy.DESTROY });
  const f = regionFindings([{ name: "bad", region: bad.region, template: tpl(bad) }]);
  assert.ok(f.some((l) => l.includes("stack region us-east-1")), f.join("; "));
  // and a home-region stack whose resource names another region (a replication target, an ARN)
  const t = clone(real[0].template);
  (firstOf(t, "AWS::S3::Bucket").Properties as Record<string, unknown>).ReplicationConfiguration = { Role: "arn:aws:iam::1:role/r", Rules: [{ Destination: { Bucket: "arn:aws:s3:::copy-eu-west-1" }, Status: "Enabled", Note: "eu-west-1" }] };
  assert.ok(regionFindings([{ ...real[0], template: t }]).some((l) => l.includes("eu-west-1")));
});

test("PF-8a region: an allowance admits a region only inside its resource types (PF-8rc's ca-west-1 backup copy)", () => {
  const t = clone(real[0].template);
  t.Resources!.Copy = { Type: "AWS::Backup::BackupPlan", Properties: { Rule: { CopyActions: [{ DestinationBackupVaultArn: "arn:aws:backup:ca-west-1:1:backup-vault:x" }] } } };
  t.Resources!.Leak = { Type: "AWS::S3::Bucket", Properties: { Note: "ca-west-1" } };
  const f = regionFindings([{ ...real[0], template: t }], [{ region: "ca-west-1", types: ["AWS::Backup::BackupPlan"] }]);
  assert.deepEqual(f.map((l) => l.split(" ")[0]), [`${real[0].name}/Leak`]);
});

for (const s of real) {
  test(`PF-8a database pass (${s.name}): private, encrypted, deletion-protected, 35-day backups, TLS forced, terse logs`, () => {
    assert.deepEqual(databaseFindings(s.template), []);
    const db = firstOf(s.template, "AWS::RDS::DBInstance").Properties!;
    assert.equal(db.Engine, "postgres");
    assert.match(String(db.EngineVersion), /^18\.3/); // as deploy/compose.test.yml's postgres:18.3
  });
  test(`PF-8a buckets pass (${s.name}): three buckets, public access blocked, versioned, KMS, plain HTTP refused`, () => {
    assert.equal(Object.values(s.template.Resources ?? {}).filter((r) => r.Type === "AWS::S3::Bucket").length, 3);
    assert.deepEqual(bucketFindings(s.template), []);
  });
}

test("PF-8a database fail: each broken property is named", () => {
  const t = clone(real[1].template);
  const db = firstOf(t, "AWS::RDS::DBInstance").Properties!;
  Object.assign(db, { PubliclyAccessible: true, StorageEncrypted: false, DeletionProtection: false, BackupRetentionPeriod: 7 });
  delete db.KmsKeyId;
  const pg = t.Resources![(db.DBParameterGroupName as { Ref: string }).Ref].Properties!;
  pg.Parameters = { "rds.force_ssl": "0" };
  const f = databaseFindings(t).join("\n");
  for (const w of ["PubliclyAccessible", "not encrypted", "no KMS key", "deletion protection off", "kept 7 days", "force_ssl", "terse"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
  assert.deepEqual(databaseFindings({ Resources: {} }), ["no database instance"]);
});

test("PF-8a buckets fail: a public, unversioned, unencrypted bucket with no TLS policy is caught", () => {
  const app = new App({ analyticsReporting: false });
  const bad = new Stack(app, "badbucket", { env: { region: "ca-central-1" } });
  new s3.Bucket(bad, "Open", { blockPublicAccess: new s3.BlockPublicAccess({ blockPublicAcls: false, blockPublicPolicy: false, ignorePublicAcls: false, restrictPublicBuckets: false }), encryption: s3.BucketEncryption.S3_MANAGED });
  const f = bucketFindings(tpl(bad)).join("\n");
  for (const w of ["BlockPublicAcls", "RestrictPublicBuckets", "versioning not enabled", "not KMS-encrypted", "plain HTTP"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8a availability pass and fail: production Multi-AZ, staging single-zone", () => {
  assert.deepEqual(availabilityFindings(real[1].template, "production"), []);
  assert.deepEqual(availabilityFindings(real[0].template, "staging"), []);
  assert.equal(availabilityFindings(real[0].template, "production").length, 1); // staging's template judged as production
  assert.equal(availabilityFindings(real[1].template, "staging").length, 1);
});

test("PF-8a database in isolated subnets only: its subnet group uses the data subnets, which have no internet route", () => {
  const t = real[1].template;
  const group = firstOf(t, "AWS::RDS::DBSubnetGroup").Properties!;
  const ids = (group.SubnetIds as { Ref: string }[]).map((r) => r.Ref);
  assert.equal(ids.length, 2); // two zones
  for (const id of ids) assert.match(id, /data/i);
  const dataRoutes = (x: Template) => Object.values(x.Resources ?? {}).filter((r) => r.Type === "AWS::EC2::Route" && /data/i.test(JSON.stringify(r.Properties)));
  assert.deepEqual(dataRoutes(t), []); // no route (internet or NAT) from a data subnet's table
  // fail: a NAT route added to a data subnet's table is found (the check is not blind)
  const tableId = Object.keys(t.Resources ?? {}).find((k) => t.Resources![k].Type === "AWS::EC2::RouteTable" && /data/i.test(k))!;
  const bad = clone(t); bad.Resources!.Leak = { Type: "AWS::EC2::Route", Properties: { RouteTableId: { Ref: tableId }, DestinationCidrBlock: "0.0.0.0/0" } };
  assert.equal(dataRoutes(bad).length, 1);
});

test("PF-8a the CI job runs only when deploy/cdk changes, on pull requests only, never in a merge-queue batch (P-772 (a))", () => {
  const raw = readFileSync(join(HERE, "..", "..", "..", "..", "..", "..", "..", ".github", "workflows", "deploy-synth.yml"), "utf8");
  const wf = raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"); // the header comment names merge_group in words
  const paths = [...wf.matchAll(/^ {6}- "([^"]+)"$/gm)].map((m) => m[1]);
  assert.deepEqual(paths, ["ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/deploy/cdk/**", ".github/workflows/deploy-synth.yml"]);
  assert.doesNotMatch(wf, /merge_group|schedule:|push:/);
  assert.doesNotMatch(wf, /AWS_ACCESS_KEY_ID: \$\{\{|secrets\./); // no AWS key or repository secret reaches the job
});
