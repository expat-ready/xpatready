// PF-8b's assertion tests (map row 1; rows 15 and 24's cloud halves): each Done-when line, a pass on the real stacks and
// a fail on a broken copy, so no check is blind. Synth only: no AWS account, key or network. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { App, Stack, aws_ec2 as ec2, aws_kms as kms, aws_rds as rds } from "aws-cdk-lib";
import { Template as Assert } from "aws-cdk-lib/assertions";
import { CDK_CONTEXT, allStacks, buildApp } from "../lib/app.ts";
import type { Template } from "../lib/checks.ts";
import { AppService, DEFAULT_DOMAIN } from "../lib/service.ts";
import { listenerFindings, loaderSettings, mailFindings, poolFindings, roleFindings, secretReadFindings, spreadFindings, taskDefinitions, taskSettingFindings, wildcardFindings } from "../lib/service-checks.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS = loaderSettings(readFileSync(join(HERE, "..", "..", "..", "api", "src", "platform", "config", "settings.ts"), "utf8"));
const { app } = buildApp();
const real = allStacks(app).filter((s) => /^xr-(staging|production)$/.test(s.name)); // PF-8rc adds its ca-west-1 copy stacks
const stageOf = (name: string) => (name === "xr-production" ? "production" : "staging");
const domainOf = (name: string) => (stageOf(name) === "production" ? DEFAULT_DOMAIN : `staging.${DEFAULT_DOMAIN}`);
const clone = (t: Template): Template => JSON.parse(JSON.stringify(t));
type C = { Name: string; Environment: { Name: string; Value: unknown }[]; Secrets: { Name: string; ValueFrom: unknown }[]; Command?: string[] };
const svcContainer = (t: Template) => (taskDefinitions(t).service![1].Properties!.ContainerDefinitions as C[])[0];
const of = (t: Template, type: string) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === type);

test("PF-8b the loader is read: its secret and required settings are found (a guard that the text scan still works)", () => {
  const names = SETTINGS.map((x) => x.name);
  for (const n of ["DATABASE_URL", "PLATFORM_STRIPE_SECRET_KEY", "PLATFORM_SECRET_BOX_KEYS", "PLATFORM_COGNITO_USER_POOL_ID", "PLATFORM_IDENTITY"]) assert.ok(names.includes(n), n);
  assert.ok(SETTINGS.filter((x) => x.secret).length >= 7 && SETTINGS.filter((x) => x.required).length >= 12);
});

for (const s of real) {
  const stage = stageOf(s.name), domain = domainOf(s.name);
  test(`PF-8b pass (${s.name}): the task holds no secret value, only Secrets Manager references, and sets the two settings`, () => {
    assert.deepEqual(taskSettingFindings(s.template, SETTINGS), []);
    assert.deepEqual(secretReadFindings(s.template), []);
  });
  test(`PF-8b pass (${s.name}): at least two Fargate tasks over two zones`, () => assert.deepEqual(spreadFindings(s.template), []));
  test(`PF-8b pass (${s.name}): HTTPS only (TLS 1.2+), port 80 redirects and does nothing else`, () => assert.deepEqual(listenerFindings(s.template), []));
  test(`PF-8b pass (${s.name}): the wildcard certificate covers *.${domain} and *.${domain} reaches the load balancer`, () => assert.deepEqual(wildcardFindings(s.template, domain), []));
  test(`PF-8b pass (${s.name}): the migration task uses the owner's address, the service the app role's`, () => assert.deepEqual(roleFindings(s.template, stage), []));
  test(`PF-8b pass (${s.name}): SES signs with DKIM, SPF on the MAIL FROM domain, DMARC published`, () => assert.deepEqual(mailFindings(s.template, domain), []));
  test(`PF-8b pass (${s.name}): three separate Cognito pools, staff pools with required two-step`, () => assert.deepEqual(poolFindings(s.template, stage), []));
  test(`PF-8b pass (${s.name}): the image is run by digest from this stack's repository, never a tag`, () => {
    const img = JSON.stringify(svcContainer(s.template)).match(/"Image":(\{.*?\]\]\})/)![1];
    assert.match(img, /"@",\{"Ref":"AppImageDigest[0-9A-F]+"\}/);
    const digest = Object.entries(s.template.Parameters as Record<string, { AllowedPattern?: string }>).find(([k]) => k.startsWith("AppImageDigest"))![1];
    assert.equal(digest.AllowedPattern, "^sha256:[a-f0-9]{64}$");
  });
}

const t0 = real.find((s) => s.name === "xr-production")!.template;

test("PF-8b fail: a task definition missing PLATFORM_ENVIRONMENT, or set to local, or PLATFORM_IDENTITY=local, is caught", () => {
  const t = clone(t0); const c = svcContainer(t);
  c.Environment = c.Environment.filter((e) => e.Name !== "PLATFORM_ENVIRONMENT");
  assert.ok(taskSettingFindings(t, SETTINGS).some((l) => l.startsWith("PLATFORM_ENVIRONMENT is null")));
  const t2 = clone(t0); const c2 = svcContainer(t2);
  for (const e of c2.Environment) if (e.Name === "PLATFORM_ENVIRONMENT" || e.Name === "PLATFORM_IDENTITY") e.Value = "local";
  assert.equal(taskSettingFindings(t2, SETTINGS).filter((l) => / is "local", not /.test(l)).length, 2);
});

test("PF-8b fail: a secret as a plain value, a secret missing, a reference outside the stack, a credential in any task are caught", () => {
  const t = clone(t0); const c = svcContainer(t);
  const stripe = c.Secrets.find((x) => x.Name === "PLATFORM_STRIPE_SECRET_KEY")!;
  c.Secrets = c.Secrets.filter((x) => x !== stripe && x.Name !== "PLATFORM_BOLDSIGN_API_KEY");
  c.Environment.push({ Name: "PLATFORM_STRIPE_SECRET_KEY", Value: "sk_live_abcdefgh12345678" });
  c.Secrets.find((x) => x.Name === "PLATFORM_ZOOM_CLIENT_SECRET")!.ValueFrom = "arn:aws:secretsmanager:ca-central-1:1:secret:elsewhere";
  const mig = (taskDefinitions(t).migration![1].Properties!.ContainerDefinitions as C[])[0];
  mig.Environment.push({ Name: "NOTE", Value: "postgresql://xr_admin:hunter2@db:5432/x" });
  const f = taskSettingFindings(t, SETTINGS).join("\n");
  for (const w of ["PLATFORM_STRIPE_SECRET_KEY: a secret given as a plain environment value", "PLATFORM_BOLDSIGN_API_KEY: required by PF-24's loader, not supplied", "PLATFORM_ZOOM_CLIENT_SECRET: not a Secrets Manager secret", "STRIPE_SECRET_KEY holds what looks like a credential", "NOTE holds what looks like a credential"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8b fail: the task role reading secrets, or the execution role reading another task's secret, is caught", () => {
  const t = clone(t0);
  const { service, migration } = taskDefinitions(t);
  const role = (td: unknown, k: string) => ((td as { Properties: Record<string, { "Fn::GetAtt": [string] }> }).Properties[k])["Fn::GetAtt"][0];
  const ownerRef = (migration![1].Properties!.ContainerDefinitions as C[])[0].Secrets[0].ValueFrom;
  t.Resources!.Wide = { Type: "AWS::IAM::Policy", Properties: { Roles: [{ Ref: role(service![1], "TaskRoleArn") }], PolicyDocument: { Statement: [{ Action: "secretsmanager:GetSecretValue", Resource: ownerRef }] } } };
  t.Resources!.Cross = { Type: "AWS::IAM::Policy", Properties: { Roles: [{ Ref: role(service![1], "ExecutionRoleArn") }], PolicyDocument: { Statement: [{ Action: ["secretsmanager:GetSecretValue"], Resource: [ownerRef] }] } } };
  const f = secretReadFindings(t).join("\n");
  assert.ok(f.includes("task role reads secrets") && f.includes("which its task does not use"), f);
});

test("PF-8b fail: one task, or both tasks in one zone, is caught", () => {
  const t = clone(t0); const svc = of(t, "AWS::ECS::Service")[0][1].Properties!;
  svc.DesiredCount = 1;
  const net = svc.NetworkConfiguration as { AwsvpcConfiguration: { Subnets: unknown[] } };
  net.AwsvpcConfiguration.Subnets = [net.AwsvpcConfiguration.Subnets[0], net.AwsvpcConfiguration.Subnets[0]];
  const f = spreadFindings(t).join("\n");
  assert.ok(f.includes("1 tasks, fewer than 2") && f.includes("span 1 zone(s)"), f);
});

test("PF-8b fail: port 80 forwarding to the app, a TLS 1.0 policy or an HTTPS listener with no certificate is caught", () => {
  const t = clone(t0);
  for (const [, l] of of(t, "AWS::ElasticLoadBalancingV2::Listener")) {
    const p = l.Properties!;
    if (p.Protocol === "HTTP") p.DefaultActions = [{ Type: "forward", TargetGroupArn: { Ref: "X" } }];
    else { p.SslPolicy = "ELBSecurityPolicy-2016-08"; p.Certificates = []; }
  }
  const f = listenerFindings(t).join("\n");
  for (const w of ["more than a redirect to HTTPS", "allows below TLS 1.2", "no certificate"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
  const t2 = clone(t0); // a listener rule forwarding on port 80 also counts
  const http = of(t2, "AWS::ElasticLoadBalancingV2::Listener").find(([, l]) => l.Properties!.Protocol === "HTTP")![0];
  t2.Resources!.Sneak = { Type: "AWS::ElasticLoadBalancingV2::ListenerRule", Properties: { ListenerArn: { Ref: http }, Actions: [{ Type: "forward" }] } };
  assert.equal(listenerFindings(t2).length, 1);
});

test("PF-8b fail: a certificate for the apex only, or a wildcard record pointing elsewhere, is caught", () => {
  const t = clone(t0);
  for (const [, c] of of(t, "AWS::CertificateManager::Certificate")) c.Properties!.DomainName = DEFAULT_DOMAIN;
  assert.deepEqual(wildcardFindings(t, DEFAULT_DOMAIN), [`no certificate for *.${DEFAULT_DOMAIN}`]);
  const t2 = clone(t0);
  for (const [, r] of of(t2, "AWS::Route53::RecordSet")) if (r.Properties!.Name === `*.${DEFAULT_DOMAIN}.`) r.Properties!.AliasTarget = { DNSName: "elsewhere.example.com", HostedZoneId: "Z1" };
  assert.ok(wildcardFindings(t2, DEFAULT_DOMAIN).some((l) => l.includes("does not point at the load balancer")));
});

test("PF-8b fail: the service holding the owner's address, or the migration task holding the app's, is caught", () => {
  const t = clone(t0);
  const { service, migration } = taskDefinitions(t);
  const m = (migration![1].Properties!.ContainerDefinitions as C[])[0], s = svcContainer(t);
  const [ownerRef, appRef] = [m.Secrets[0].ValueFrom, s.Secrets.find((x) => x.Name === "DATABASE_URL")!.ValueFrom];
  m.Secrets[0].ValueFrom = appRef; s.Secrets.find((x) => x.Name === "DATABASE_URL")!.ValueFrom = ownerRef;
  const f = roleFindings(t, "production").join("\n");
  assert.ok(f.includes("migration task's DATABASE_URL") && f.includes("service's DATABASE_URL") && f.includes("holds the owner's"), f);
  void service;
  const t2 = clone(t0); // no migration task at all
  for (const [id] of of(t2, "AWS::ECS::TaskDefinition")) if (id !== taskDefinitions(t2).service![0]) delete t2.Resources![id];
  assert.deepEqual(roleFindings(t2, "production"), ["no migration task (a task definition running prisma migrate deploy)"]);
});

test("PF-8b fail: SES without DKIM, its records missing, no SPF or no DMARC is caught", () => {
  const t = clone(t0);
  for (const [, r] of of(t, "AWS::SES::EmailIdentity")) r.Properties!.DkimAttributes = { SigningEnabled: false };
  for (const [id, r] of of(t, "AWS::Route53::RecordSet")) if (r.Properties!.Type === "CNAME" || r.Properties!.Type === "TXT") delete t.Resources![id];
  const f = mailFindings(t, DEFAULT_DOMAIN).join("\n");
  for (const w of ["DKIM signing off", "three DKIM records", "no SPF", "no DMARC"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8b fail: two kinds of user on one pool, a pool with no client, a staff pool without two-step are caught", () => {
  const t = clone(t0);
  const pools = of(t, "AWS::Cognito::UserPool");
  const [own] = pools.find(([, p]) => String(p.Properties!.UserPoolName).endsWith("-own-staff"))!;
  const [staff] = pools.find(([, p]) => String(p.Properties!.UserPoolName).endsWith("-staff") && !String(p.Properties!.UserPoolName).endsWith("own-staff"))!;
  for (const [, c] of of(t, "AWS::Cognito::UserPoolClient")) if ((c.Properties!.UserPoolId as { Ref: string }).Ref === own) c.Properties!.UserPoolId = { Ref: staff };
  delete t.Resources![own];
  t.Resources![staff].Properties!.MfaConfiguration = "OPTIONAL";
  const f = poolFindings(t, "production").join("\n");
  for (const w of ["not the three separate", "2 app clients", "without required two-step"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8b synth still needs no keys: no account lookup, no missing context, every stack's account left unresolved", () => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith("AWS_") || k.startsWith("CDK_DEFAULT_")) delete process.env[k];
  try {
    const asm = buildApp().app.synth();
    assert.deepEqual(asm.manifest.missing ?? [], []); // a HostedZone.fromLookup or Vpc.fromLookup would be listed here
    for (const st of asm.stacks) assert.equal(st.environment.account, "unknown-account", st.stackName);
  } finally { Object.assign(process.env, saved); }
});

test("PF-8b the recommended feature flags are all set in cdk.json and reach the app (not only the CLI)", () => {
  const recommended = JSON.parse(readFileSync(join(HERE, "..", "node_modules", "aws-cdk-lib", "recommended-feature-flags.json"), "utf8")) as Record<string, unknown>;
  const differ = Object.keys(recommended).filter((k) => JSON.stringify(CDK_CONTEXT[k]) !== JSON.stringify(recommended[k]));
  assert.deepEqual(differ, []); // each one set, to the value aws-cdk-lib recommends for a new app (what `cdk init` writes)
  assert.equal(buildApp().app.node.tryGetContext("@aws-cdk/aws-ecs:enableImdsBlockingDeprecatedFeature"), CDK_CONTEXT["@aws-cdk/aws-ecs:enableImdsBlockingDeprecatedFeature"]);
});

test("PF-8b the domain is a parameter: -c xr:domain moves both zones, certificates and SES identities", () => {
  const a = buildApp({ context: { "xr:domain": "example.org" } }).app;
  for (const s of allStacks(a).filter((x) => /^xr-(staging|production)$/.test(x.name))) {
    const d = stageOf(s.name) === "production" ? "example.org" : "staging.example.org";
    assert.deepEqual([...wildcardFindings(s.template, d), ...mailFindings(s.template, d)], []);
  }
});

test("PF-8b the construct alone: a stack with AppService synthesizes with the same checks passing (no hidden coupling)", () => {
  const app2 = new App({ analyticsReporting: false, context: CDK_CONTEXT });
  const st = new Stack(app2, "solo", { env: { region: "ca-central-1" } });
  const vpc = new ec2.Vpc(st, "V", { maxAzs: 2 });
  const key = new kms.Key(st, "K");
  const database = new rds.DatabaseInstance(st, "D", { engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_18_3 }), vpc });
  new AppService(st, "App", { stage: "staging", vpc, key, database });
  const t = Assert.fromStack(st).toJSON() as Template;
  assert.deepEqual([...spreadFindings(t), ...listenerFindings(t), ...roleFindings(t, "staging"), ...poolFindings(t, "staging")], []);
});
