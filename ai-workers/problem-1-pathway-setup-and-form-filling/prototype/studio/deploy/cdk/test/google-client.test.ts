// R1.43 part 0 (P-821, 25 Nov): the Google OAuth test app's client on staging only. The secret was made by hand in
// Secrets Manager before the stack named it, so the stack imports it by name and never creates it; the client id is a
// plain (public) setting; production has neither yet. Each line a pass on the real stacks and a fail on a broken copy.
// Synth only: no AWS account, key or network. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allStacks, buildApp } from "../lib/app.ts";
import { bypassFindings, type Template } from "../lib/checks.ts";
import { GOOGLE_CLIENT_ID, STAGE_SECRETS, importedSecretName, templateStage } from "../lib/service.ts";
import { loaderSettings, secretReadFindings, taskDefinitions, taskSettingFindings } from "../lib/service-checks.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS = loaderSettings(readFileSync(join(HERE, "..", "..", "..", "api", "src", "platform", "config", "settings.ts"), "utf8"));
const { app } = buildApp();
const stack = (name: string) => allStacks(app).find((s) => s.name === name)!.template;
const clone = (t: Template): Template => JSON.parse(JSON.stringify(t));
type C = { Environment: { Name: string; Value: unknown }[]; Secrets: { Name: string; ValueFrom: unknown }[] };
const svc = (t: Template) => (taskDefinitions(t).service![1].Properties!.ContainerDefinitions as C[])[0];
const secretsNamed = (t: Template, name: string) => Object.values(t.Resources ?? {}).filter((r) => r.Type === "AWS::SecretsManager::Secret" && r.Properties?.Name === name);
const NAME = "xr/staging/PLATFORM_GOOGLE_CLIENT_SECRET";

test("R1.43 part 0 pass (xr-staging): the service reads the Google client secret imported by name, never created, and the id as a plain setting", () => {
  const t = stack("xr-staging"), c = svc(t);
  assert.deepEqual(STAGE_SECRETS.staging, ["PLATFORM_GOOGLE_CLIENT_SECRET"]);
  assert.equal(importedSecretName(c.Secrets.find((x) => x.Name === "PLATFORM_GOOGLE_CLIENT_SECRET")?.ValueFrom, "staging"), NAME);
  assert.equal(secretsNamed(t, NAME).length, 0, "the stack must not create a secret that already exists (the deploy would fail)");
  assert.equal(c.Environment.find((e) => e.Name === "PLATFORM_GOOGLE_CLIENT_ID")?.Value, GOOGLE_CLIENT_ID.staging);
  assert.ok(!c.Environment.some((e) => e.Name === "PLATFORM_GOOGLE_CLIENT_SECRET"), "never a plain value");
  assert.deepEqual([...taskSettingFindings(t, SETTINGS, "staging"), ...secretReadFindings(t), ...bypassFindings([{ name: "xr-staging", region: "ca-central-1", template: t }])], []);
});

test("R1.43 part 0 pass (xr-production): no Google setting yet (Google connections off there), no secret made for it", () => {
  const t = stack("xr-production"), c = svc(t);
  assert.ok(!c.Secrets.some((x) => x.Name.startsWith("PLATFORM_GOOGLE_")) && !c.Environment.some((e) => e.Name.startsWith("PLATFORM_GOOGLE_")));
  assert.equal(secretsNamed(t, "xr/production/PLATFORM_GOOGLE_CLIENT_SECRET").length, 0);
});

test("R1.43 part 0 fail: an imported ARN in another account, region or name, or a wildcard on the container, is not taken as the stack's", () => {
  const ok = importedSecretName(svc(stack("xr-staging")).Secrets.find((x) => x.Name === "PLATFORM_GOOGLE_CLIENT_SECRET")!.ValueFrom, "staging");
  assert.equal(ok, NAME);
  const arn = (tail: string, region = "ca-central-1", account: unknown = { Ref: "AWS::AccountId" }) => ({ "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:secretsmanager:${region}:`, account, `:secret:${tail}`]] });
  assert.equal(importedSecretName(arn("xr/staging/PLATFORM_STRIPE_SECRET_KEY"), "staging"), undefined, "a name not in STAGE_SECRETS");
  assert.equal(importedSecretName(arn("xr/production/PLATFORM_GOOGLE_CLIENT_SECRET"), "production"), undefined, "production lists none");
  assert.equal(importedSecretName(arn(NAME, "us-east-1"), "staging"), undefined, "another region");
  assert.equal(importedSecretName(arn(NAME, "ca-central-1", "123456789012"), "staging"), undefined, "another account");
  assert.equal(importedSecretName(arn(`${NAME}-??????`), "staging"), undefined, "the wildcard form is the grant's only");
  assert.equal(importedSecretName(arn(`${NAME}-??????`), "staging", true), NAME);
  // the guards see it: the container pointing at an unlisted imported name, and a grant on another one
  const t = clone(stack("xr-staging")); const c = svc(t);
  c.Secrets.find((x) => x.Name === "PLATFORM_GOOGLE_CLIENT_SECRET")!.ValueFrom = arn("xr/staging/SOMETHING_ELSE");
  assert.ok(taskSettingFindings(t, SETTINGS, "staging").some((l) => l.startsWith("PLATFORM_GOOGLE_CLIENT_SECRET: not a Secrets Manager secret of this stack")));
  const t2 = clone(stack("xr-staging"));
  for (const r of Object.values(t2.Resources ?? {})) if (r.Type === "AWS::IAM::Policy") for (const st of ((r.Properties?.PolicyDocument as { Statement: { Resource: unknown }[] }).Statement))
    if (importedSecretName(st.Resource, "staging", true)) st.Resource = arn("xr/staging/*");
  assert.ok(bypassFindings([{ name: "xr-staging", region: "ca-central-1", template: t2 }]).some((l) => l.includes("not a resource this stack defines")));
});

test("R1.43 part 0 fail: the Google secret given as a plain environment value is caught", () => {
  const t = clone(stack("xr-staging")); const c = svc(t);
  c.Secrets = c.Secrets.filter((x) => x.Name !== "PLATFORM_GOOGLE_CLIENT_SECRET");
  c.Environment.push({ Name: "PLATFORM_GOOGLE_CLIENT_SECRET", Value: "GOCSPX-placeholder-for-the-test" });
  assert.ok(taskSettingFindings(t, SETTINGS, "staging").some((l) => l === "PLATFORM_GOOGLE_CLIENT_SECRET: a secret given as a plain environment value"));
});

// Round 1 (review M1 = break F1, F2, F3, m1): each fix's fail test first.
type St = { Effect?: string; Action?: unknown; Resource?: unknown };
type Pol = { Type: string; Properties?: { PolicyDocument?: { Statement: St[] }; Roles?: unknown[] } };
const policies = (t: Template) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === "AWS::IAM::Policy") as [string, Pol][];
const isGrant = (st: St, stage: "staging" | "production" | undefined) => (Array.isArray(st.Resource) ? st.Resource : [st.Resource]).some((x) => importedSecretName(x, stage, true));
// the execution role's grant on the imported Google client secret in Secrets Manager, and the policy that holds it
const googleGrant = (t: Template) => { for (const [id, p] of policies(t)) for (const st of p.Properties!.PolicyDocument!.Statement) if (isGrant(st, "staging")) return { id, p, st }; throw new Error("no grant on the imported secret"); };
const roleOf = (v: unknown) => (v as { "Fn::GetAtt"?: [string] })?.["Fn::GetAtt"]?.[0];
const policyOfRole = (t: Template, role: string) => policies(t).find(([, p]) => (p.Properties?.Roles ?? []).some((r) => (r as { Ref?: string })?.Ref === role))!;
const tds = (t: Template) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === "AWS::ECS::TaskDefinition");

test("R1.43 part 0 F1 fail: the production stack given staging's imported Google client secret and its grant is caught by every guard", () => {
  const s = stack("xr-staging"), ref = svc(s).Secrets.find((x) => x.Name === "PLATFORM_GOOGLE_CLIENT_SECRET")!.ValueFrom;
  assert.equal(importedSecretName(ref, "staging"), NAME);
  assert.equal(importedSecretName(ref, "production"), undefined, "staging's name is not production's");
  assert.equal(importedSecretName(ref, undefined), undefined, "no stage: nothing imported is accepted");
  const p = clone(stack("xr-production")), c = svc(p);
  c.Secrets.push({ Name: "PLATFORM_GOOGLE_CLIENT_SECRET", ValueFrom: ref });
  const exec = roleOf(taskDefinitions(p).service![1].Properties!.ExecutionRoleArn)!;
  policyOfRole(p, exec)[1].Properties!.PolicyDocument!.Statement.push(JSON.parse(JSON.stringify(googleGrant(s).st)));
  assert.ok(taskSettingFindings(p, SETTINGS, "production").some((l) => l.startsWith("PLATFORM_GOOGLE_CLIENT_SECRET: not a Secrets Manager secret of this stack")));
  assert.ok(bypassFindings([{ name: "xr-production", region: "ca-central-1", template: p }]).some((l) => l.includes("not a resource this stack defines")));
  assert.ok(secretReadFindings(p).length > 0, "who-reads-which-secret sees a grant on a secret that is not this stack's");
});

test("R1.43 part 0 F1: templateStage reads each stack's stage from the secrets it names; two stages or a foreign name give none", () => {
  assert.equal(templateStage(stack("xr-staging")), "staging");
  assert.equal(templateStage(stack("xr-production")), "production");
  const both = clone(stack("xr-staging"));
  both.Resources!.Extra = { Type: "AWS::SecretsManager::Secret", Properties: { Name: "xr/production/PLATFORM_STRIPE_SECRET_KEY" } };
  assert.equal(templateStage(both), undefined);
  const foreign = clone(stack("xr-staging"));
  foreign.Resources!.Extra = { Type: "AWS::SecretsManager::Secret", Properties: { Name: "other/PLATFORM_STRIPE_SECRET_KEY" } };
  assert.equal(templateStage(foreign), undefined);
  assert.equal(templateStage({ Resources: {} }), undefined);
});

test("R1.43 part 0 F2 fail: half of the Google client pair is a synth finding, either half", () => {
  const noId = clone(stack("xr-staging"));
  svc(noId).Environment = svc(noId).Environment.filter((e) => e.Name !== "PLATFORM_GOOGLE_CLIENT_ID");
  assert.ok(taskSettingFindings(noId, SETTINGS, "staging").includes("PLATFORM_GOOGLE_CLIENT_ID: missing, half of the Google client pair (PF-24's loader would refuse to start)"));
  const noSecret = clone(stack("xr-staging"));
  svc(noSecret).Secrets = svc(noSecret).Secrets.filter((x) => x.Name !== "PLATFORM_GOOGLE_CLIENT_SECRET");
  assert.ok(taskSettingFindings(noSecret, SETTINGS, "staging").includes("PLATFORM_GOOGLE_CLIENT_SECRET: missing, half of the Google client pair (PF-24's loader would refuse to start)"));
});

test("R1.43 part 0 F3 fail: a value shaped like a Google client secret under another setting's name is a credential", () => {
  const t = clone(stack("xr-staging"));
  svc(t).Environment.push({ Name: "SOME_OTHER_SETTING", Value: "GOCSPX-madeUpValueForThisTest01" });
  assert.ok(taskSettingFindings(t, SETTINGS, "staging").some((l) => l.endsWith("SOME_OTHER_SETTING holds what looks like a credential")));
});

test("R1.43 part 0 m1 fail: who reads the imported secret is pinned (the task role, a missing grant, the migration's role)", () => {
  assert.deepEqual(secretReadFindings(stack("xr-staging")), []);
  const { st } = googleGrant(stack("xr-staging"));
  const svcTd = taskDefinitions(stack("xr-staging")).service![1];
  // (a) the same grant copied onto the task role's policy
  const a = clone(stack("xr-staging"));
  policyOfRole(a, roleOf(svcTd.Properties!.TaskRoleArn)!)[1].Properties!.PolicyDocument!.Statement.push(JSON.parse(JSON.stringify(st)));
  assert.ok(secretReadFindings(a).length > 0, "the task role must not read it");
  // (b) the grant removed: the execution role cannot read what its container names
  const b = clone(stack("xr-staging")), g = googleGrant(b);
  g.p.Properties!.PolicyDocument!.Statement = g.p.Properties!.PolicyDocument!.Statement.filter((x) => x !== g.st);
  assert.ok(secretReadFindings(b).some((l) => l.includes("cannot read") && l.includes(NAME)));
  // (c) the grant copied onto the migration task's execution role, whose task does not use it
  const m = clone(stack("xr-staging")), mig = tds(m).find(([, r]) => r !== taskDefinitions(m).service![1])!;
  policyOfRole(m, roleOf(mig[1].Properties!.ExecutionRoleArn)!)[1].Properties!.PolicyDocument!.Statement.push(JSON.parse(JSON.stringify(st)));
  assert.ok(secretReadFindings(m).some((l) => l.includes("which its task does not use")));
});
