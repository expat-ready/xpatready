// PF-F1c's assertion tests (R1.65, the AWS proof of 22 Nov, Step 17 hand-over): the four bucket gaps the deployed check
// found in lib/estate.ts, each a pass on the real stacks and a fail on a broken copy, so no check is blind. Synth only:
// no AWS account, key or network. Run: npm test (node --test test/), in deploy/cdk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allStacks, buildApp } from "../lib/app.ts";
import { ABORT_UPLOAD_DAYS, ACCESS_LOG_DAYS, accessLogBuckets, backupFindings, bucketFindings, bypassFindings, resourcePolicyFindings, type SynthStack, type Template } from "../lib/checks.ts";
import { filesTaskFindings, loaderSettings, taskDefinitions, taskSettingFindings } from "../lib/service-checks.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS = loaderSettings(readFileSync(join(HERE, "..", "..", "..", "api", "src", "platform", "config", "settings.ts"), "utf8"));
const all: SynthStack[] = allStacks(buildApp().app);
const homes = all.filter((s) => /^xr-(staging|production)$/.test(s.name));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
type R = { Type: string; Properties?: Record<string, unknown> };
const of = (t: Template, type: string) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === type) as [string, R][];
const dataBuckets = (t: Template) => of(t, "AWS::S3::Bucket").filter(([id]) => !accessLogBuckets(t).has(id));
const statements = (t: Template) => of(t, "AWS::S3::BucketPolicy").flatMap(([, p]) => (p.Properties!.PolicyDocument as { Statement: Record<string, unknown>[] }).Statement);
const swap = (name: string, edit: (t: Template) => void): SynthStack[] => all.map((s) => (s.name === name ? { ...s, template: (() => { const t = clone(s.template); edit(t); return t; })() } : s));
const container = (t: Template) => ((taskDefinitions(t).service![1].Properties!.ContainerDefinitions as { Environment: { Name: string; Value: unknown }[]; Secrets: { Name: string; ValueFrom: unknown }[] }[])[0]);
const taskPolicy = (t: Template) => of(t, "AWS::IAM::Policy").find(([id]) => id.startsWith("AppTaskTaskRoleDefaultPolicy"))![1];
const taskStatements = (t: Template) => (taskPolicy(t).Properties!.PolicyDocument as { Statement: Record<string, unknown>[] }).Statement;

for (const s of homes) {
  test(`PF-F1c pass (${s.name}): every data bucket refuses a put not encrypted with aws:kms, logs to the access-log bucket and aborts unfinished uploads after ${ABORT_UPLOAD_DAYS} day; the log lines are kept ${ACCESS_LOG_DAYS} days`, () => {
    assert.deepEqual(bucketFindings(s.template), []);
    assert.equal(dataBuckets(s.template).length, 3);
    const [logId, log] = of(s.template, "AWS::S3::Bucket").find(([id]) => accessLogBuckets(s.template).has(id))!;
    for (const [id, b] of dataBuckets(s.template)) assert.deepEqual(b.Properties!.LoggingConfiguration, { DestinationBucketName: { Ref: logId }, LogFilePrefix: `${id.replace(/Bucket.*$/, "").toLowerCase()}/` }, id);
    assert.ok(JSON.stringify(log.Properties!.LifecycleConfiguration).includes(`"ExpirationInDays":${ACCESS_LOG_DAYS}`));
  });
  test(`PF-F1c pass (${s.name}): the task uses the cloud FilesPort on the documents bucket, with only its files grants; every estate guard still passes`, () => {
    assert.deepEqual(filesTaskFindings(s.template), []);
    assert.deepEqual(taskSettingFindings(s.template, SETTINGS, s.name === "xr-production" ? "production" : "staging"), []);
    assert.deepEqual(backupFindings(s, all), []);
  });
}
test("PF-F1c pass: the estate's role and resource-policy guards accept exactly the new grants (log delivery, firm keys)", () => {
  assert.deepEqual(bypassFindings(all), []);
  assert.deepEqual(resourcePolicyFindings(all), []);
});

test("PF-F1c gap 1 fail: no deny on a put not encrypted with aws:kms (an AES256 put was accepted on staging), an IfExists deny, a deny on one action only, or no Null deny, is caught", () => {
  const t0 = homes[0].template;
  const cases: [string, (st: Record<string, unknown>) => void, string][] = [
    ["removed", (st) => { if (st.Sid) Object.assign(st, { Effect: "Allow-removed" }); }, "encrypted other than with aws:kms"],
    ["IfExists (a put naming AES256 is still refused, but a missing header is not)", (st) => { if (st.Sid === "DenyPutNotKms") st.Condition = { StringNotEqualsIfExists: { "s3:x-amz-server-side-encryption": "aws:kms" } }; }, "encrypted other than with aws:kms"],
    ["another algorithm allowed", (st) => { if (st.Sid === "DenyPutNotKms") st.Condition = { StringNotEquals: { "s3:x-amz-server-side-encryption": ["aws:kms", "AES256"] } }; }, "encrypted other than with aws:kms"],
    ["a narrower principal", (st) => { if (st.Sid === "DenyPutNotKms") st.Principal = { AWS: "arn:aws:iam::1:root" }; }, "encrypted other than with aws:kms"],
    ["the bucket, not its objects", (st) => { if (st.Sid === "DenyPutNotKms") st.Resource = (st.Resource as { "Fn::Join": [string, unknown[]] })["Fn::Join"][1][0]; }, "encrypted other than with aws:kms"],
    ["no Null deny", (st) => { if (st.Sid === "DenyPutNoEncryption") st.Effect = "Allow-removed"; }, "names no encryption"],
  ];
  for (const [name, edit, want] of cases) {
    const t = clone(t0);
    for (const st of statements(t)) edit(st);
    assert.equal(bucketFindings(t).filter((l) => l.includes(want)).length, 3, name);
  }
});

test("PF-F1c gap 2 fail: a data bucket logging nowhere or to a bucket outside the stack, log lines kept 30 or 400 days or for ever, a KMS-managed log bucket, ACLs on it, or its TLS deny gone, is caught", () => {
  const t0 = homes[1].template, logId = [...accessLogBuckets(t0)][0];
  const nowhere = clone(t0);
  for (const [, b] of dataBuckets(nowhere)) delete b.Properties!.LoggingConfiguration;
  assert.equal(accessLogBuckets(nowhere).size, 0);
  // with no bucket logging to it, the old log bucket is held to a data bucket's rules too: 4 findings
  assert.equal(bucketFindings(nowhere).filter((l) => l.includes("not logged to an access-log bucket")).length, 4);
  const away = clone(t0);
  for (const [, b] of dataBuckets(away)) b.Properties!.LoggingConfiguration = { DestinationBucketName: "someone-elses-logs" };
  assert.equal(bucketFindings(away).filter((l) => l.includes("not logged to an access-log bucket")).length, 4);
  for (const [days, want] of [[30, "expire before 90 days"], [400, "not kept 90 days"], [undefined, "not kept 90 days"]] as const) {
    const t = clone(t0);
    (t.Resources![logId].Properties!.LifecycleConfiguration as { Rules: Record<string, unknown>[] }).Rules[0].ExpirationInDays = days;
    assert.ok(bucketFindings(t).some((l) => l.startsWith(logId) && l.includes(want)), String(days));
  }
  const kms = clone(t0);
  kms.Resources![logId].Properties!.BucketEncryption = { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" } }] };
  kms.Resources![logId].Properties!.OwnershipControls = { Rules: [{ ObjectOwnership: "ObjectWriter" }] };
  const f = bucketFindings(kms).join("\n");
  for (const w of ["not encrypted with S3's own key", "does not enforce the bucket owner"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
  const http = clone(t0);
  for (const st of statements(http)) if (JSON.stringify(st.Resource).includes(logId) && st.Effect === "Deny") st.Effect = "Allow-removed";
  assert.ok(bucketFindings(http).some((l) => l.startsWith(logId) && l.includes("plain HTTP")));
  // a data bucket cannot pass as a log bucket to dodge its rules or the backup: a bucket that itself logs is not one
  const chain = clone(t0), [docId] = dataBuckets(chain)[0];
  for (const [id, b] of dataBuckets(chain)) if (id !== docId) b.Properties!.LoggingConfiguration = { DestinationBucketName: { Ref: docId } };
  assert.ok(!accessLogBuckets(chain).has(docId));
});

test("PF-F1c gap 3 fail: no abort rule, an abort after 7 days, or a disabled rule, on any bucket, is caught", () => {
  for (const edit of [(r: Record<string, unknown>) => { delete r.AbortIncompleteMultipartUpload; }, (r: Record<string, unknown>) => { if (r.AbortIncompleteMultipartUpload) r.AbortIncompleteMultipartUpload = { DaysAfterInitiation: 7 }; }, (r: Record<string, unknown>) => { if (r.AbortIncompleteMultipartUpload) r.Status = "Disabled"; }]) {
    const t = clone(homes[0].template);
    for (const [, b] of of(t, "AWS::S3::Bucket")) for (const r of (b.Properties!.LifecycleConfiguration as { Rules: Record<string, unknown>[] }).Rules) edit(r);
    assert.equal(bucketFindings(t).filter((l) => l.includes(`unfinished upload is not aborted after ${ABORT_UPLOAD_DAYS} day`)).length, 4, edit.toString());
  }
});

test("PF-F1c gap 4 fail: the task without PLATFORM_FILES=s3, on another bucket, another key or region, without the link key or with a placeholder one, is caught", () => {
  const t0 = homes[1].template;
  const exportsId = dataBuckets(t0).find(([id]) => id.startsWith("ExportsBucket"))![0];
  const cases: [string, (t: Template) => void, string][] = [
    ["unset", (t) => { const c = container(t); c.Environment = c.Environment.filter((e) => e.Name !== "PLATFORM_FILES"); }, 'PLATFORM_FILES is null, not "s3"'],
    ["local", (t) => { container(t).Environment.find((e) => e.Name === "PLATFORM_FILES")!.Value = "local"; }, 'not "s3"'],
    ["exports bucket", (t) => { container(t).Environment.find((e) => e.Name === "PLATFORM_FILES_BUCKET")!.Value = { Ref: exportsId }; }, "not this stack's documents bucket"],
    ["a literal bucket name", (t) => { container(t).Environment.find((e) => e.Name === "PLATFORM_FILES_BUCKET")!.Value = "xr-documents"; }, "not this stack's documents bucket"],
    ["an alias", (t) => { container(t).Environment.find((e) => e.Name === "PLATFORM_FILES_KMS_KEY_ID")!.Value = "alias/aws/s3"; }, "not the bucket's own KMS key"],
    ["ca-west-1", (t) => { container(t).Environment.find((e) => e.Name === "PLATFORM_FILES_REGION")!.Value = "ca-west-1"; }, "PLATFORM_FILES_REGION"],
    ["no link key", (t) => { const c = container(t); c.Secrets = c.Secrets.filter((x) => x.Name !== "PLATFORM_FILES_LINK_KEY"); }, "PLATFORM_FILES_LINK_KEY is not a Secrets Manager secret"],
    ["placeholder link key", (t) => { const id = (container(t).Secrets.find((x) => x.Name === "PLATFORM_FILES_LINK_KEY")!.ValueFrom as { Ref: string }).Ref; (t.Resources![id].Properties!.GenerateSecretString as Record<string, unknown>).SecretStringTemplate = '{"placeholder":"supplied at deploy"}'; }, "made from a template"],
  ];
  for (const [name, edit, want] of cases) {
    const t = clone(t0); edit(t);
    assert.ok(filesTaskFindings(t).some((l) => l.includes(want)), `${name}: ${filesTaskFindings(t).join("; ")}`);
  }
});

test("PF-F1c gap 4 fail: the task role on every key, deleting, another bucket, the key outside S3 or every key, is caught; and the estate guards refuse a wildcard that is not a bucket's firm keys", () => {
  const t0 = homes[0].template;
  const exportsId = dataBuckets(t0).find(([id]) => id.startsWith("ExportsBucket"))![0];
  const objects = (t: Template) => taskStatements(t).find((st) => JSON.stringify(st.Action).includes("s3:GetObject"))!;
  const cases: [string, (t: Template) => void][] = [
    ["every key", (t) => { (objects(t).Resource as { "Fn::Join": [string, unknown[]] })["Fn::Join"][1][1] = "/*"; }],
    ["delete", (t) => { objects(t).Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]; }],
    ["another bucket", (t) => { (objects(t).Resource as { "Fn::Join": [string, unknown[]] })["Fn::Join"][1][0] = { "Fn::GetAtt": [exportsId, "Arn"] }; }],
    ["key without ViaService", (t) => { delete taskStatements(t).find((st) => JSON.stringify(st.Action).includes("kms:"))!.Condition; }],
    ["an extra grant", (t) => { taskStatements(t).push({ Action: "s3:GetObject", Effect: "Allow", Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [exportsId, "Arn"] }, "/*/*"]] } }); }],
    ["grants gone", (t) => { const p = taskPolicy(t).Properties!.PolicyDocument as { Statement: Record<string, unknown>[] }; p.Statement = p.Statement.filter((st) => !/s3:|kms:/.test(JSON.stringify(st.Action))); }],
  ];
  for (const [name, edit] of cases) { const t = clone(t0); edit(t); assert.ok(filesTaskFindings(t).length > 0, name); }
  // the bypass guard: "/*/*" only after a bucket of this stack; "/*" or "*/*" or after a key ARN is refused
  for (const [tail, head] of [["/*", undefined], ["*/*", undefined], ["/*/*", "DataKey"]] as const) {
    const b = swap(homes[0].name, (t) => { const r = objects(t).Resource as { "Fn::Join": [string, unknown[]] }; r["Fn::Join"][1][1] = tail; if (head) r["Fn::Join"][1][0] = { "Fn::GetAtt": [of(t, "AWS::KMS::Key").find(([id]) => id.startsWith(head))![0], "Arn"] }; });
    assert.ok(bypassFindings(b).some((l) => l.includes("not a resource this stack defines")), `${head ?? "bucket"} + ${tail}`);
  }
  const extra = swap(homes[0].name, (t) => { taskStatements(t).push({ Action: "s3:DeleteObject", Effect: "Allow", Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [exportsId, "Arn"] }, "/*/*"]] } }); });
  assert.ok(bypassFindings(extra).some((l) => l.includes("allows s3:DeleteObject, not on the allow list")));
});

test("PF-F1c fail: the log-delivery Allow widened (another principal, every key, any source, no account) or on a data bucket, is caught by the resource-policy guard", () => {
  const logId = [...accessLogBuckets(homes[0].template)][0];
  const delivery = (t: Template) => statements(t).filter((st) => st.Effect === "Allow");
  const cases: [string, (st: Record<string, unknown>) => void][] = [
    ["anyone", (st) => { st.Principal = { AWS: "*" }; }],
    ["s3:*", (st) => { st.Action = "s3:*"; }],
    ["every key", (st) => { (st.Resource as { "Fn::Join": [string, unknown[]] })["Fn::Join"][1][1] = "/*"; }],
    ["any source", (st) => { (st.Condition as Record<string, unknown>).ArnLike = { "aws:SourceArn": "*" }; }],
    ["no account", (st) => { delete (st.Condition as Record<string, unknown>).StringEquals; }],
  ];
  for (const [name, edit] of cases) {
    const b = swap(homes[0].name, (t) => { for (const st of delivery(t)) edit(st); });
    assert.ok(resourcePolicyFindings(b).some((l) => l.includes("a bucket policy may only deny")), name);
  }
  // the same statement moved onto a data bucket's policy is refused (only an access-log bucket takes deliveries)
  const moved = swap(homes[0].name, (t) => {
    const st = clone(delivery(t)[0]), [docId] = dataBuckets(t)[0];
    (st.Resource as { "Fn::Join": [string, unknown[]] })["Fn::Join"][1][0] = { "Fn::GetAtt": [docId, "Arn"] };
    (of(t, "AWS::S3::BucketPolicy").find(([, p]) => JSON.stringify(p.Properties!.Bucket) === JSON.stringify({ Ref: docId }))![1].Properties!.PolicyDocument as { Statement: unknown[] }).Statement.push(st);
  });
  assert.ok(resourcePolicyFindings(moved).some((l) => l.includes("a bucket policy may only deny")));
  assert.ok(logId);
});
