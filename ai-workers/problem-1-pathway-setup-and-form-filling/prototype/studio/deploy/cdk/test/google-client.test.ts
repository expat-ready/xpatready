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
import { GOOGLE_CLIENT_ID, STAGE_SECRETS, importedSecretName } from "../lib/service.ts";
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
  assert.equal(importedSecretName(c.Secrets.find((x) => x.Name === "PLATFORM_GOOGLE_CLIENT_SECRET")?.ValueFrom), NAME);
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
  const ok = importedSecretName(svc(stack("xr-staging")).Secrets.find((x) => x.Name === "PLATFORM_GOOGLE_CLIENT_SECRET")!.ValueFrom);
  assert.equal(ok, NAME);
  const arn = (tail: string, region = "ca-central-1", account: unknown = { Ref: "AWS::AccountId" }) => ({ "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:secretsmanager:${region}:`, account, `:secret:${tail}`]] });
  assert.equal(importedSecretName(arn("xr/staging/PLATFORM_STRIPE_SECRET_KEY")), undefined, "a name not in STAGE_SECRETS");
  assert.equal(importedSecretName(arn("xr/production/PLATFORM_GOOGLE_CLIENT_SECRET")), undefined, "production lists none");
  assert.equal(importedSecretName(arn(NAME, "us-east-1")), undefined, "another region");
  assert.equal(importedSecretName(arn(NAME, "ca-central-1", "123456789012")), undefined, "another account");
  assert.equal(importedSecretName(arn(`${NAME}-??????`)), undefined, "the wildcard form is the grant's only");
  assert.equal(importedSecretName(arn(`${NAME}-??????`), true), NAME);
  // the guards see it: the container pointing at an unlisted imported name, and a grant on another one
  const t = clone(stack("xr-staging")); const c = svc(t);
  c.Secrets.find((x) => x.Name === "PLATFORM_GOOGLE_CLIENT_SECRET")!.ValueFrom = arn("xr/staging/SOMETHING_ELSE");
  assert.ok(taskSettingFindings(t, SETTINGS, "staging").some((l) => l.startsWith("PLATFORM_GOOGLE_CLIENT_SECRET: not a Secrets Manager secret of this stack")));
  const t2 = clone(stack("xr-staging"));
  for (const r of Object.values(t2.Resources ?? {})) if (r.Type === "AWS::IAM::Policy") for (const st of ((r.Properties?.PolicyDocument as { Statement: { Resource: unknown }[] }).Statement))
    if (importedSecretName(st.Resource, true)) st.Resource = arn("xr/staging/*");
  assert.ok(bypassFindings([{ name: "xr-staging", region: "ca-central-1", template: t2 }]).some((l) => l.includes("not a resource this stack defines")));
});

test("R1.43 part 0 fail: the Google secret given as a plain environment value is caught", () => {
  const t = clone(stack("xr-staging")); const c = svc(t);
  c.Secrets = c.Secrets.filter((x) => x.Name !== "PLATFORM_GOOGLE_CLIENT_SECRET");
  c.Environment.push({ Name: "PLATFORM_GOOGLE_CLIENT_SECRET", Value: "GOCSPX-placeholder-for-the-test" });
  assert.ok(taskSettingFindings(t, SETTINGS, "staging").some((l) => l === "PLATFORM_GOOGLE_CLIENT_SECRET: a secret given as a plain environment value"));
});
