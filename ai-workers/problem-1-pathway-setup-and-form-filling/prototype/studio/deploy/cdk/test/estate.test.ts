// PF-8a's assertion tests (map row 1; R1.14's base): each check passes on the real stacks and fails on a broken one, so
// no check is blind. Synth only: no AWS account, key or network. Run: npm test (node --test test/), in deploy/cdk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { App, CfnParameter, NestedStack, RemovalPolicy, Stack, aws_s3 as s3 } from "aws-cdk-lib";
import { Template as Assert } from "aws-cdk-lib/assertions";
import { allStacks, buildApp } from "../lib/app.ts";
import { EstateStack } from "../lib/estate.ts";
import { availabilityFindings, bucketFindings, databaseFindings, dataRouteFindings, regionFindings, type SynthStack, type Template } from "../lib/checks.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const { app: estate } = buildApp();
const tpl = (s: Stack): Template => Assert.fromStack(s).toJSON() as Template;
const real: SynthStack[] = allStacks(estate); // every stack of the real app, nested ones included (review M2)
const COMPOSE_PG = /image: postgres:(\d+\.\d+)/.exec(readFileSync(join(HERE, "..", "..", "compose.test.yml"), "utf8"))![1];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const firstOf = (t: Template, type: string) => Object.values(t.Resources ?? {}).find((r) => r.Type === type)!;

test("PF-8a region pass: the app's stacks (exactly the two) are in ca-central-1 and nothing names another region", () => {
  assert.deepEqual(real.map((s) => [s.name, s.region]), [["xr-staging", "ca-central-1"], ["xr-production", "ca-central-1"]]);
  assert.deepEqual(regionFindings(real), []);
});

test("PF-8a region pass: a stray AWS_REGION or a caller's region cannot move the estate", () => {
  const app = new App({ analyticsReporting: false });
  const s = new EstateStack(app, "moved", { stage: "staging", env: { region: "us-east-1" } });
  assert.equal(s.region, "ca-central-1");
});

test("PF-8a region fail: a us-east-1 stack added to the app, or nested in a home stack, is caught (review M2)", () => {
  const { app } = buildApp();
  const edge = new Stack(app, "xr-edge", { env: { region: "us-east-1" } }); // e.g. a CloudFront certificate stack
  new s3.Bucket(edge, "Stray", { removalPolicy: RemovalPolicy.DESTROY });
  const f = regionFindings(allStacks(app));
  assert.ok(f.some((l) => l.startsWith("xr-edge: stack region us-east-1")), f.join("; "));
  const { app: app2, stacks } = buildApp();
  const nested = new NestedStack(stacks.production, "Extra");
  new CfnParameter(nested, "Where", { default: "us-west-2" }); // a region hidden in a parameter default (review m1)
  const f2 = regionFindings(allStacks(app2));
  assert.ok(f2.some((l) => l.includes("xr-production/Extra") && l.includes("us-west-2")), f2.join("; "));
});

test("PF-8a region fail: real S3 replication to a bucket outside the app is caught though its ARN names no region (review M1)", () => {
  const { app, stacks } = buildApp();
  const away = s3.Bucket.fromBucketArn(stacks.staging, "Away", "arn:aws:s3:::xr-documents-copy");
  new s3.Bucket(stacks.staging, "Replicated", { versioned: true, replicationRules: [{ destination: away, priority: 1 }] });
  const f = regionFindings(allStacks(app));
  assert.ok(f.some((l) => l.includes("replicates to a bucket outside the scanned stacks")), f.join("; "));
  // and replication to a bucket inside the same home stack passes (not every replication is wrong)
  const { app: ok, stacks: st2 } = buildApp();
  const home = new s3.Bucket(st2.staging, "HomeCopy", { versioned: true });
  new s3.Bucket(st2.staging, "Source", { versioned: true, replicationRules: [{ destination: home, priority: 1 }] });
  assert.deepEqual(regionFindings(allStacks(ok)).filter((l) => l.includes("replicates")), []);
});

test("PF-8a region fail: newer region families (us-isof-south-1, eu-isoe-west-1, eusc-de-east-1) are recognised (review m1)", () => {
  for (const region of ["us-isof-south-1", "eu-isoe-west-1", "eusc-de-east-1", "ap-southeast-7", "mx-central-1"]) {
    const t = clone(real[0].template);
    t.Resources!.X = { Type: "AWS::SSM::Parameter", Properties: { Value: `arn:aws:sns:${region}:1:t` } };
    assert.ok(regionFindings([{ ...real[0], template: t }]).some((l) => l.includes(region)), region);
  }
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
    assert.equal(String(db.EngineVersion), COMPOSE_PG); // read from deploy/compose.test.yml (review m3)
  });
  test(`PF-8a database subnets pass (${s.name}): no route leaves them, no public addresses (review m4)`, () => {
    assert.deepEqual(dataRouteFindings(s.template), []);
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

test("PF-8a database subnets fail: a NAT route on a database subnet's table, or public addresses, are found", () => {
  const t = clone(real[1].template);
  const assoc = Object.values(t.Resources ?? {}).find((r) => r.Type === "AWS::EC2::SubnetRouteTableAssociation" && /data/i.test(JSON.stringify(r.Properties)))!;
  t.Resources!.Leak = { Type: "AWS::EC2::Route", Properties: { RouteTableId: assoc.Properties!.RouteTableId, DestinationCidrBlock: "0.0.0.0/0" } };
  const sub = (firstOf(t, "AWS::RDS::DBSubnetGroup").Properties!.SubnetIds as { Ref: string }[])[0].Ref;
  t.Resources![sub].Properties!.MapPublicIpOnLaunch = true;
  const f = dataRouteFindings(t).join("\n");
  assert.ok(f.includes("Leak: a route leaves a database subnet") && f.includes("gives public addresses"), f);
  assert.deepEqual(dataRouteFindings({ Resources: {} }), ["no database subnet group"]);
});

test("PF-8a buckets fail: a TLS deny narrowed to one action or one principal does not count (review m2)", () => {
  for (const narrow of [{ Action: "s3:GetObject" }, { Principal: { AWS: "arn:aws:iam::1:root" } }]) {
    const t = clone(real[0].template);
    for (const r of Object.values(t.Resources ?? {})) if (r.Type === "AWS::S3::BucketPolicy") for (const st of (r.Properties!.PolicyDocument as { Statement: Record<string, unknown>[] }).Statement) Object.assign(st, narrow);
    assert.equal(bucketFindings(t).filter((l) => l.includes("plain HTTP")).length, 3, JSON.stringify(narrow));
  }
});

test("PF-8a the CI job runs only when deploy/cdk changes, on pull requests only, never in a merge-queue batch (P-772 (a))", () => {
  const raw = readFileSync(join(HERE, "..", "..", "..", "..", "..", "..", "..", ".github", "workflows", "deploy-synth.yml"), "utf8");
  const wf = raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"); // the header comment names merge_group in words
  const paths = [...wf.matchAll(/^ {6}- "([^"]+)"$/gm)].map((m) => m[1]);
  assert.deepEqual(paths, ["ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/deploy/cdk/**", "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/deploy/compose.test.yml", ".github/workflows/deploy-synth.yml"]);
  assert.doesNotMatch(wf, /merge_group|schedule:|push:/);
  assert.doesNotMatch(wf, /AWS_ACCESS_KEY_ID: \$\{\{|secrets\./); // no AWS key or repository secret reaches the job
});
