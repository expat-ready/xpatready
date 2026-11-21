// PF-8b's assertion tests (map row 1; rows 15 and 24's cloud halves): each Done-when line, a pass on the real stacks and
// a fail on a broken copy, so no check is blind. Synth only: no AWS account, key or network. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Stack, aws_route53 as route53 } from "aws-cdk-lib";
import { allStacks, buildApp } from "../lib/app.ts";
import { REGION_ALLOW, bypassFindings, regionFindings, resourcePolicyFindings, type Template } from "../lib/checks.ts";
import { DEFAULT_DOMAIN } from "../lib/service.ts";
import { exposureFindings, listenerFindings, loaderSettings, mailFindings, poolFindings, roleFindings, secretReadFindings, spreadFindings, taskDefinitions, taskSettingFindings, wildcardFindings } from "../lib/service-checks.ts";

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
    assert.deepEqual(taskSettingFindings(s.template, SETTINGS, stage), []);
    assert.deepEqual(secretReadFindings(s.template), []);
  });
  test(`PF-8b pass (${s.name}): at least two Fargate tasks over two zones, nothing public but the load balancer`, () => assert.deepEqual([...spreadFindings(s.template), ...exposureFindings(s.template)], []));
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
  const stripeRef = svcContainer(t).Secrets.find((x) => x.Name === "PLATFORM_STRIPE_SECRET_KEY")!.ValueFrom;
  t.Resources!.Cross = { Type: "AWS::IAM::Policy", Properties: { Roles: [{ Ref: role(migration![1], "ExecutionRoleArn") }], PolicyDocument: { Statement: [{ Action: ["secretsmanager:GetSecretValue"], Resource: [stripeRef] }] } } };
  const f = secretReadFindings(t).join("\n");
  assert.ok(f.includes("only an execution role may") && f.includes("which its task does not use"), f);
});

test("PF-8b fail (break M-2): a managed or inline policy, a wildcard action, a resource policy, a key grant without ViaService are caught", () => {
  const t = clone(t0);
  const td = taskDefinitions(t).service![1].Properties as Record<string, { "Fn::GetAtt": [string] }>;
  const taskRole = td.TaskRoleArn["Fn::GetAtt"][0];
  const r = t.Resources![taskRole].Properties!;
  r.ManagedPolicyArns = ["arn:aws:iam::aws:policy/SecretsManagerReadWrite"];
  r.Policies = [{ PolicyName: "x", PolicyDocument: { Statement: [{ Effect: "Allow", Action: "secretsmanager:Get*", Resource: "*" }] } }];
  t.Resources!.RP = { Type: "AWS::SecretsManager::ResourcePolicy", Properties: {} };
  const key = of(t, "AWS::KMS::Key")[0][1].Properties!.KeyPolicy as { Statement: unknown[] };
  key.Statement.push({ Effect: "Allow", Principal: { AWS: { "Fn::GetAtt": [taskRole, "Arn"] } }, Action: "kms:Decrypt", Resource: "*" });
  key.Statement.push({ Effect: "Allow", Principal: { AWS: "arn:aws:iam::999999999999:root" }, Action: "kms:Dec*", Resource: "*" }); // re-review n3
  const secretRef = svcContainer(t).Secrets[0].ValueFrom;
  t.Resources!.ToUser = { Type: "AWS::IAM::Policy", Properties: { Users: ["someone"], PolicyDocument: { Statement: [{ Effect: "Allow", Action: "secretsmanager:*SecretValue", Resource: secretRef }] } } }; // re-break RM-2, n2
  t.Resources!.RolePol = { Type: "AWS::IAM::RolePolicy", Properties: { RoleName: { Ref: taskRole }, PolicyDocument: { Statement: [{ Effect: "Allow", Action: "secretsmanager:GetSecretValue", Resource: "*" }] } } };
  t.Resources!.Not = { Type: "AWS::IAM::Policy", Properties: { Roles: [{ Ref: taskRole }], PolicyDocument: { Statement: [{ Effect: "Allow", NotAction: "iam:*", Resource: "*" }] } } };
  const exec = td.ExecutionRoleArn["Fn::GetAtt"][0];
  (t.Resources![exec].Properties!.AssumeRolePolicyDocument as { Statement: { Principal: unknown }[] }).Statement[0].Principal = { AWS: "*" };
  const f = secretReadFindings(t).join("\n");
  for (const w of ["managed policy not on the allow list", `${taskRole} inline`, "resource policy, user or group", "decrypt outside a service", "999999999999", 'ToUser: ', "RolePol:", "NotAction", "assumed by more than ECS tasks"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8b fail (break M-1, review M1): a dynamic reference, a literal SecretString, an environment file, a sidecar's plain secret are caught", () => {
  const t = clone(t0); const c = svcContainer(t);
  c.Environment.push({ Name: "X", Value: "{{resolve:secretsmanager:xr/production/DATABASE_OWNER_URL}}" });
  (taskDefinitions(t).service![1].Properties!.ContainerDefinitions as unknown[]).push({ Name: "side", Environment: [{ Name: "PLATFORM_SECRET_BOX_KEYS", Value: "1:abc" }], EnvironmentFiles: [{ Type: "s3", Value: "arn:aws:s3:::b/x.env" }] });
  of(t, "AWS::SecretsManager::Secret")[0][1].Properties!.SecretString = "sk_live_x";
  const mig = taskDefinitions(t).migration!; (mig[1].Properties!.ContainerDefinitions as C[])[0].Command = ["sh", "-c", "DATABASE_URL=postgresql://o:pw@db/x prisma migrate deploy"]; // re-break RM-1
  const f = taskSettingFindings(t, SETTINGS).join("\n");
  for (const w of ["X holds what looks like a credential", "side: PLATFORM_SECRET_BOX_KEYS: a secret given", "an environment file", "a secret value written into the template", `${mig[0]}: a credential outside the environment`]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
});

test("PF-8b fail: one task, or both tasks in one zone, is caught", () => {
  const t = clone(t0); const svc = of(t, "AWS::ECS::Service")[0][1].Properties!;
  svc.DesiredCount = 1;
  const net = svc.NetworkConfiguration as { AwsvpcConfiguration: { Subnets: unknown[] } };
  net.AwsvpcConfiguration.Subnets = [net.AwsvpcConfiguration.Subnets[0], net.AwsvpcConfiguration.Subnets[0]];
  const f = spreadFindings(t).join("\n");
  assert.ok(f.includes("1 tasks, fewer than 2") && f.includes("span 1 zone(s)"), f);
});

test("PF-8b fail (break m1): public task addresses, a task or database group open to the internet are caught", () => {
  const t = clone(t0);
  const net = of(t, "AWS::ECS::Service")[0][1].Properties!.NetworkConfiguration as { AwsvpcConfiguration: Record<string, unknown> };
  net.AwsvpcConfiguration.AssignPublicIp = "ENABLED";
  const [sg] = of(t, "AWS::EC2::SecurityGroup").find(([id]) => id.startsWith("AppServiceSg"))!;
  t.Resources!.Open = { Type: "AWS::EC2::SecurityGroupIngress", Properties: { GroupId: { "Fn::GetAtt": [sg, "GroupId"] }, IpProtocol: "tcp", FromPort: 5432, ToPort: 5432, CidrIp: "0.0.0.0/0" } };
  const f = exposureFindings(t).join("\n");
  assert.ok(f.includes("public address") && f.includes("Open: open to the internet on 5432"), f);
});

test("PF-8b fail (break m2, m3, m7, m8): self sign-up, OAuth on, the service on the clients' pool, SPF +all, a redirect to another host", () => {
  const t = clone(t0);
  const pools = of(t, "AWS::Cognito::UserPool");
  pools[0][1].Properties!.AdminCreateUserConfig = { AllowAdminCreateUserOnly: false };
  of(t, "AWS::Cognito::UserPoolClient")[0][1].Properties!.AllowedOAuthFlowsUserPoolClient = true;
  const clients = pools.find(([, p]) => String(p.Properties!.UserPoolName).endsWith("-clients"))![0];
  svcContainer(t).Environment.find((e) => e.Name === "PLATFORM_COGNITO_USER_POOL_ID")!.Value = { Ref: clients };
  const f = poolFindings(t, "production").join("\n");
  for (const w of ["anyone may sign up", "OAuth flows on", "not the staff pool"]) assert.ok(f.includes(w), `missing "${w}" in:\n${f}`);
  for (const [, r] of of(t, "AWS::Route53::RecordSet")) if (JSON.stringify(r.Properties!.ResourceRecords ?? "").includes("v=spf1")) r.Properties!.ResourceRecords = ['"v=spf1 include:amazonses.com +all"'];
  assert.ok(mailFindings(t, DEFAULT_DOMAIN).some((l) => l.includes("no SPF record ending")));
  for (const [, l] of of(t, "AWS::ElasticLoadBalancingV2::Listener")) if (l.Properties!.Protocol === "HTTP") (l.Properties!.DefaultActions as { RedirectConfig: Record<string, string> }[])[0].RedirectConfig.Host = "evil.example.com";
  assert.equal(listenerFindings(t).length, 1);
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
  const [ownerRef, appRef] = [m.Secrets[0].ValueFrom, s.Secrets.find((x) => x.Name === "APP_DATABASE_URL")!.ValueFrom];
  m.Secrets[0].ValueFrom = appRef; s.Secrets.find((x) => x.Name === "APP_DATABASE_URL")!.ValueFrom = ownerRef;
  const f = roleFindings(t, "production").join("\n");
  assert.ok(f.includes("migration task's DATABASE_URL") && f.includes("service's APP_DATABASE_URL is") && f.includes("holds the owner's address"), f);
  const t3 = clone(t0); svcContainer(t3).Secrets.find((x) => x.Name === "DATABASE_URL")!.ValueFrom = appRef; // re-review n1: the app role cannot start pg-boss
  assert.ok(roleFindings(t3, "production").some((l) => l.includes("the job runner needs the owner's address")));
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
    const { app: looked } = buildApp(); // and a lookup is seen (review m3): it needs an account at synth
    route53.HostedZone.fromLookup(new Stack(looked, "lookup", { env: { account: "111111111111", region: "ca-central-1" } }), "Looked", { domainName: "example.org" });
    let missing: unknown[]; try { missing = looked.synth().manifest.missing ?? []; } catch (e) { missing = [String(e)]; } // listed, or refused at synth
    assert.ok(missing.length > 0);
  } finally { Object.assign(process.env, saved); }
});

test("PF-8b the domain is a parameter: -c xr:domain moves both zones, certificates and SES identities", () => {
  const a = buildApp({ context: { "xr:domain": "example.org" } }).app;
  for (const s of allStacks(a).filter((x) => /^xr-(staging|production)$/.test(x.name))) {
    const d = stageOf(s.name) === "production" ? "example.org" : "staging.example.org";
    assert.deepEqual([...wildcardFindings(s.template, d), ...mailFindings(s.template, d)], []);
  }
});

test("PF-8b staging never accepts a live Stripe key (Lead 13 ruling 3): staging runs as test, production as production, no Sample seed", () => {
  const src = readFileSync(join(HERE, "..", "..", "..", "api", "src", "platform", "config", "settings.ts"), "utf8");
  assert.match(src, /\/\^\(sk\|rk\)_live_\/\.test\(stripeKey\) && environment !== "production"/); // the loader's rule this relies on
  const staging = real.find((x) => x.name === "xr-staging")!.template;
  assert.equal(svcContainer(staging).Environment.find((e) => e.Name === "PLATFORM_ENVIRONMENT")!.Value, "test");
  const t = clone(staging); // staging set to production would accept a live key: caught
  svcContainer(t).Environment.find((e) => e.Name === "PLATFORM_ENVIRONMENT")!.Value = "production";
  svcContainer(t).Environment.push({ Name: "PLATFORM_SAMPLE_SEED", Value: "on" });
  const f = taskSettingFindings(t, SETTINGS, "staging").join("\n");
  assert.ok(f.includes('is "production", not "test"') && f.includes("PLATFORM_SAMPLE_SEED is set"), f);
});

test("PF-8b's widening of PF-8rc's guards stays narrow: actions per service, \"*\" for the token only, the digest parameter only, key grants via Secrets Manager only", () => {
  const home = real.find((x) => x.name === "xr-production")!;
  const swap = (fn: (t: Template) => void) => { const t = clone(home.template); fn(t); return [{ ...home, template: t }]; };
  const roleOf = (t: Template, svc: string) => of(t, "AWS::IAM::Role").find(([, r]) => JSON.stringify(r.Properties!.AssumeRolePolicyDocument).includes(svc))![0];
  const pol = (t: Template, role: string, Action: unknown, Resource: unknown) => { t.Resources![`X${Object.keys(t.Resources!).length}`] = { Type: "AWS::IAM::Policy", Properties: { Roles: [{ Ref: role }], PolicyDocument: { Statement: [{ Effect: "Allow", Action, Resource }], Version: "2012-10-17" } } }; };
  const b = bypassFindings(swap((t) => {
    const ecs = roleOf(t, "ecs-tasks"), bak = roleOf(t, "backup.amazonaws.com");
    pol(t, ecs, "iam:PassRole", { "Fn::GetAtt": [ecs, "Arn"] });     // an ECS role may not pass roles
    pol(t, bak, "ses:SendEmail", { "Fn::GetAtt": [bak, "Arn"] });     // the Backup role does not get ECS's actions
    pol(t, ecs, "secretsmanager:GetSecretValue", "*");                // "*" for a secret read
    pol(t, bak, "ecr:GetAuthorizationToken", "*");                    // "*" only for an ECS role's token
  })).join("\n");
  for (const w of ["allows iam:PassRole", "allows ses:SendEmail", 'allows on "*"']) assert.ok(b.includes(w), `missing "${w}" in:\n${b}`);
  const b2 = bypassFindings(swap((t) => { // re-break RB-1, RB-2, review r1, r2, a second trust statement
    const { service } = taskDefinitions(t); const td = service![1].Properties as Record<string, { "Fn::GetAtt": [string] }>;
    const exec = td.ExecutionRoleArn["Fn::GetAtt"][0];
    pol(t, exec, "ses:SendEmail", { "Fn::GetAtt": [exec, "Arn"] });
    pol(t, exec, "secretsmanager:GetSecretValue", { "Fn::Join": ["", ["arn:aws:secretsmanager:ca-central-1:999999999999:secret:", { Ref: exec }]] });
    service![1].Properties!.TaskRoleArn = "arn:aws:iam::111111111111:role/Admin";
    of(t, "AWS::ECR::Repository")[0][1].Properties!.RepositoryPolicyText = { Statement: [{ Effect: "Allow", Principal: "*", Action: "ecr:*" }] };
    (t.Resources![roleOf(t, "backup.amazonaws.com")].Properties!.AssumeRolePolicyDocument as { Statement: unknown[] }).Statement.push({ Effect: "Allow", Action: "sts:AssumeRole", Principal: { Service: "ecs-tasks.amazonaws.com" } });
  })).join("\n");
  for (const w of ["allows ses:SendEmail, not on the allow list (ecr:", "999999999999", "TaskRoleArn names", "repository policy", "allows kms:Decrypt, not on the allow list ()"]) assert.ok(b2.includes(w), `missing "${w}" in:\n${b2}`);
  assert.equal(b.split("\n").filter((l) => l.includes('allows on "*"')).length, 2);
  const r = regionFindings(swap((t) => { for (const p of Object.values(t.Parameters as Record<string, Record<string, unknown>>)) delete p.AllowedPattern; }), REGION_ALLOW);
  assert.ok(r.some((l) => l.includes("a parameter set at deploy time (AppImageDigest")), r.join("\n")); // a free-text parameter is still refused
  const k = resourcePolicyFindings(swap((t) => {
    const st = (of(t, "AWS::KMS::Key")[0][1].Properties!.KeyPolicy as { Statement: Record<string, unknown>[] }).Statement;
    const grant = st.find((x) => JSON.stringify(x.Principal).includes("ExecutionRole"))!;
    st.push({ ...grant, Condition: undefined });                                                       // no ViaService
    st.push({ ...grant, Principal: { AWS: { "Fn::GetAtt": [roleOf(t, "backup.amazonaws.com"), "Arn"] } } }); // not an ECS role
    const task = (taskDefinitions(t).service![1].Properties!.TaskRoleArn as { "Fn::GetAtt": [string] })["Fn::GetAtt"][0];
    st.push({ ...grant, Principal: { AWS: { "Fn::GetAtt": [task, "Arn"] } } });                     // a task role (review r3)
    st.push({ ...grant, Principal: { ...(grant.Principal as object), Service: "s3.amazonaws.com" } }); // an extra principal key
  }));
  assert.equal(k.length, 4, k.join("\n"));
});
