// PF-4bs PR 1 (R1.5; concept product/screens/PF-4bs/concept.md r3 §2 items 4 and 6, §4; Lead 23's ruling on #3214, 24 Nov):
// the service's task role may call exactly seven cognito-idp actions, on the staff pool's ARN only, and nothing else in the
// stack may call Cognito; both staff pools' app clients allow only the admin password flow and refresh, a challenge lasts
// 15 minutes, and a client never says whether a person exists. Each rule: a pass on the real stacks (with a domain and
// without) and a fail on a broken copy, so no check is blind. Synth only: no AWS account, key or network. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allStacks, buildApp } from "../lib/app.ts";
import { bypassFindings, type SynthStack, type Template } from "../lib/checks.ts";
import { SIGN_IN_ACTIONS, poolFindings, signInTaskFindings, taskDefinitions } from "../lib/service-checks.ts";
import { DEFAULT_DOMAIN, NO_DOMAIN } from "../lib/service.ts";

const ARN = "arn:aws:acm:ca-central-1:123456789012:certificate/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";
const withDomain: SynthStack[] = allStacks(buildApp().app);
const noDomain: SynthStack[] = allStacks(buildApp({ context: { "xr:domain": NO_DOMAIN, "xr:certArn": ARN } }).app);
const homes = (all: SynthStack[]) => all.filter((s) => /^xr-(staging|production)$/.test(s.name));
const stageOf = (name: string) => (name === "xr-production" ? "production" : "staging");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
type R = { Type: string; Properties?: Record<string, any> };
const of = (t: Template, type: string) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === type) as [string, R][];
const poolId = (t: Template, stage: string, name: string) => of(t, "AWS::Cognito::UserPool").find(([, p]) => p.Properties!.UserPoolName === `xr-${stage}-${name}`)![0];
const clientOf = (t: Template, id: string) => of(t, "AWS::Cognito::UserPoolClient").find(([, c]) => c.Properties!.UserPoolId.Ref === id)![1].Properties!;
/** The task role's statements that call Cognito (CDK puts the grant in the role's default policy). */
const signInStatements = (t: Template) => of(t, "AWS::IAM::Policy").flatMap(([, p]) => p.Properties!.PolicyDocument.Statement as Record<string, any>[])
  .filter((st) => [st.Action].flat().some((a: string) => a.startsWith("cognito-idp:")));
const swap = (all: SynthStack[], name: string, edit: (t: Template) => void): SynthStack[] => all.map((s) => (s.name === name ? { ...s, template: (() => { const t = clone(s.template); edit(t); return t; })() } : s));

test("PF-4bs: the seven actions are exactly the concept's, each with its caller (§4)", () => {
  assert.deepEqual([...SIGN_IN_ACTIONS].sort(), ["cognito-idp:AdminCreateUser", "cognito-idp:AdminGetUser", "cognito-idp:AdminInitiateAuth", "cognito-idp:AdminRespondToAuthChallenge",
    "cognito-idp:AdminSetUserMFAPreference", "cognito-idp:AdminSetUserPassword", "cognito-idp:AdminUserGlobalSignOut"]);
});

for (const [mode, all] of [["with a domain", withDomain], ["no domain", noDomain]] as const) {
  for (const s of homes(all)) {
    const stage = stageOf(s.name), domain = stage === "production" ? DEFAULT_DOMAIN : mode === "no domain" ? NO_DOMAIN : `staging.${DEFAULT_DOMAIN}`; // production keeps its domain
    test(`PF-4bs pass (${s.name}, ${mode}): the service's task role calls exactly the seven actions on the staff pool's ARN, nothing else calls Cognito; both staff clients admin password + refresh, 15 minutes, no existence errors`, () => {
      assert.deepEqual(signInTaskFindings(s.template, stage), []);
      assert.deepEqual(poolFindings(s.template, stage, domain), []);
      const sts = signInStatements(s.template);
      assert.equal(sts.length, 1);
      assert.deepEqual([...sts[0].Action].sort(), [...SIGN_IN_ACTIONS].sort());
      assert.deepEqual(sts[0].Resource, { "Fn::GetAtt": [poolId(s.template, stage, "staff"), "Arn"] });
      for (const name of ["staff", "own-staff"]) {
        const c = clientOf(s.template, poolId(s.template, stage, name));
        assert.deepEqual([...c.ExplicitAuthFlows].sort(), ["ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"], name);
        assert.equal(c.AuthSessionValidity, 15, name);
        assert.equal(c.PreventUserExistenceErrors, "ENABLED", name);
      }
    });
  }
  test(`PF-4bs pass (${mode}): the estate's role guard takes the seven actions on the task role`, () => assert.deepEqual(bypassFindings(all), []));
}

const t0 = withDomain.find((s) => s.name === "xr-production")!.template;
const breakGrant = (edit: (st: Record<string, any>, t: Template) => void) => { const t = clone(t0); edit(signInStatements(t)[0], t); return t; };

test("PF-4bs fail: an eighth action, cognito-idp:*, the own-staff or clients pool, a joined ARN, every resource, a condition, a deny, or a missing action are caught", () => {
  const cases: [string, (st: Record<string, any>, t: Template) => void, string][] = [
    ["an eighth action", (st) => { st.Action = [...st.Action, "cognito-idp:AdminDeleteUser"]; }, "not the sign-in grant"],
    ["cognito-idp:*", (st) => { st.Action = "cognito-idp:*"; }, "not the sign-in grant"],
    ["a glob", (st) => { st.Action = [...st.Action, "cognito-idp:Admin*"]; }, "not the sign-in grant"],
    ["the own-staff pool", (st, t) => { st.Resource = { "Fn::GetAtt": [poolId(t, "production", "own-staff"), "Arn"] }; }, "not the sign-in grant"],
    ["the clients pool", (st, t) => { st.Resource = { "Fn::GetAtt": [poolId(t, "production", "clients"), "Arn"] }; }, "not the sign-in grant"],
    ["a joined ARN naming the staff pool", (st, t) => { st.Resource = { "Fn::Join": ["", ["arn:aws:cognito-idp:ca-central-1:", { Ref: "AWS::AccountId" }, ":userpool/", { Ref: poolId(t, "production", "staff") }]] }; }, "not the sign-in grant"],
    ["every resource", (st) => { st.Resource = "*"; }, "not the sign-in grant"],
    ["both pools", (st, t) => { st.Resource = [st.Resource, { "Fn::GetAtt": [poolId(t, "production", "own-staff"), "Arn"] }]; }, "not the sign-in grant"],
    ["a condition", (st) => { st.Condition = { StringEquals: { "aws:RequestedRegion": "ca-central-1" } }; }, "not the sign-in grant"],
    ["a deny", (st) => { st.Effect = "Deny"; }, "not the sign-in grant"],
    ["one action missing", (st) => { st.Action = st.Action.filter((a: string) => a !== "cognito-idp:AdminGetUser"); }, "not the sign-in grant"],
  ];
  for (const [name, edit, want] of cases) {
    const f = signInTaskFindings(breakGrant(edit), "production");
    assert.ok(f.some((l) => l.includes(want)), `${name}: ${f.join("; ")}`);
    assert.ok(f.some((l) => l.includes("lacks the sign-in grant")), `${name} leaves no exact grant: ${f.join("; ")}`);
  }
  // the estate's allow list refuses an action beyond the seven on any task role
  for (const act of ["cognito-idp:AdminDeleteUser", "cognito-idp:*", "cognito-idp:ListUsers"]) {
    const f = bypassFindings(swap(withDomain, "xr-production", (t) => { signInStatements(t)[0].Action.push(act); }));
    assert.ok(f.some((l) => l.includes(`allows ${act}, not on the allow list`)), act);
  }
});

test("PF-4bs fail: a second grant beside the exact one, Cognito given to the migration task's role, or no grant at all are caught", () => {
  const extra = breakGrant((st, t) => { (Object.values(t.Resources!).find((r) => r.Type === "AWS::IAM::Policy" && JSON.stringify(r).includes("cognito-idp:"))!.Properties!.PolicyDocument as { Statement: unknown[] }).Statement.push({ ...clone(st), Action: "cognito-idp:AdminGetUser" }); });
  assert.ok(signInTaskFindings(extra, "production").some((l) => l.includes("not the sign-in grant")));
  const migrationRole = (t: Template) => (taskDefinitions(t).migration![1].Properties!.TaskRoleArn as { "Fn::GetAtt": [string] } | undefined)?.["Fn::GetAtt"]?.[0];
  const toMigration = clone(t0);
  const roleId = migrationRole(toMigration) ?? (() => { // the migration task has no task role today: give it one, as a slip would
    const id = "MigrateTaskRoleSlip";
    toMigration.Resources![id] = { Type: "AWS::IAM::Role", Properties: { AssumeRolePolicyDocument: { Statement: [{ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" } }], Version: "2012-10-17" } } };
    (taskDefinitions(toMigration).migration![1].Properties as Record<string, unknown>).TaskRoleArn = { "Fn::GetAtt": [id, "Arn"] };
    return id;
  })();
  toMigration.Resources!.MigrateCognitoSlip = { Type: "AWS::IAM::Policy", Properties: { PolicyName: "slip", Roles: [{ Ref: roleId }], PolicyDocument: { Statement: [clone(signInStatements(t0)[0])], Version: "2012-10-17" } } };
  assert.ok(signInTaskFindings(toMigration, "production").some((l) => l.includes("only the service's task role may call Cognito")), signInTaskFindings(toMigration, "production").join("; "));
  for (const act of ["*", "cogn*", "cognito-idp:Admin?etUser"]) { // a wildcard reaching Cognito on another statement is the grant's business too
    const t = clone(t0); signInStatements(t); (Object.values(t.Resources!).find((r) => r.Type === "AWS::IAM::Policy" && JSON.stringify(r).includes("cognito-idp:"))!.Properties!.PolicyDocument as { Statement: unknown[] }).Statement.push({ Action: act, Effect: "Allow", Resource: "*" });
    assert.ok(signInTaskFindings(t, "production").some((l) => l.includes("not the sign-in grant")), act);
  }
  const none = breakGrant((st) => { st.Action = "ses:SendEmail"; });
  assert.ok(signInTaskFindings(none, "production").some((l) => l.includes("lacks the sign-in grant")));
});

test("PF-4bs fail: a staff client with a challenge other than 15 minutes, or one that tells whether a person exists, is caught (both modes, both staff pools)", () => {
  const nd0 = noDomain.find((s) => s.name === "xr-staging")!.template;
  for (const [t1, stage, domain] of [[t0, "production", DEFAULT_DOMAIN], [nd0, "staging", NO_DOMAIN]] as const) for (const name of ["staff", "own-staff"]) {
    const cases: [string, (c: Record<string, any>) => void][] = [
      ["lasts 3 minutes, not 15", (c) => { c.AuthSessionValidity = 3; }],
      ["lasts null minutes, not 15", (c) => { delete c.AuthSessionValidity; }],
      ["tells whether a person exists", (c) => { c.PreventUserExistenceErrors = "LEGACY"; }],
    ];
    for (const [want, edit] of cases) {
      const t = clone(t1);
      edit(clientOf(t, poolId(t, stage, name)));
      const f = poolFindings(t, stage, domain).join("\n");
      assert.ok(f.includes(want), `${stage} ${name}: missing "${want}" in:\n${f}`);
    }
  }
});

// Review and break round 1 (bd9d81495): each shape that slipped past every check, now a fail test.
const serviceRole = (t: Template) => (taskDefinitions(t).service![1].Properties!.TaskRoleArn as { "Fn::GetAtt": [string] })["Fn::GetAtt"][0];
const addPolicy = (t: Template, roleId: string, statement: unknown) => { t.Resources!.SlipPolicy = { Type: "AWS::IAM::Policy", Properties: { PolicyName: "slip", Roles: [{ Ref: roleId }], PolicyDocument: { Statement: statement, Version: "2012-10-17" } } }; };
const giveMigrationRole = (t: Template) => {
  const id = "MigrateTaskRoleSlip";
  t.Resources![id] = { Type: "AWS::IAM::Role", Properties: { AssumeRolePolicyDocument: { Statement: [{ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" } }], Version: "2012-10-17" } } };
  (taskDefinitions(t).migration![1].Properties as Record<string, unknown>).TaskRoleArn = { "Fn::GetAtt": [id, "Arn"] };
  return id;
};

test("PF-4bs fail (review M1, break B1): a policy whose Statement is one object, not a list, is read: another pool, the migration role, a condition, a second copy, an inline policy", () => {
  const exact = () => clone(signInStatements(t0)[0]);
  const cases: [string, (t: Template) => void, string][] = [
    ["one object on the own-staff pool", (t) => addPolicy(t, serviceRole(t), { ...exact(), Resource: { "Fn::GetAtt": [poolId(t, "production", "own-staff"), "Arn"] } }), "not the sign-in grant"],
    ["one object on the clients pool", (t) => addPolicy(t, serviceRole(t), { ...exact(), Resource: { "Fn::GetAtt": [poolId(t, "production", "clients"), "Arn"] } }), "not the sign-in grant"],
    ["one object on the migration role", (t) => addPolicy(t, giveMigrationRole(t), exact()), "only the service's task role may call Cognito"],
    ["one object with a condition", (t) => addPolicy(t, serviceRole(t), { ...exact(), Condition: { Bool: { "aws:SecureTransport": "true" } } }), "not the sign-in grant"],
    ["one object, a second exact copy with a Sid", (t) => addPolicy(t, serviceRole(t), { ...exact(), Sid: "Again" }), "not the sign-in grant"],
    ["an inline policy on the role, own-staff pool", (t) => { (t.Resources![serviceRole(t)].Properties as Record<string, unknown>).Policies = [{ PolicyName: "inline", PolicyDocument: { Statement: [{ ...exact(), Resource: { "Fn::GetAtt": [poolId(t, "production", "own-staff"), "Arn"] } }], Version: "2012-10-17" } }]; }, "not the sign-in grant"],
    ["an inline policy whose Statement is one object", (t) => { (t.Resources![serviceRole(t)].Properties as Record<string, unknown>).Policies = [{ PolicyName: "inline", PolicyDocument: { Statement: { ...exact(), Resource: "*" }, Version: "2012-10-17" } }]; }, "not the sign-in grant"],
    ["an unreadable document", (t) => addPolicy(t, serviceRole(t), "not a statement"), "cannot be read"],
    ["mixed case", (t) => addPolicy(t, serviceRole(t), [{ ...exact(), Action: "Cognito-IDP:AdminDeleteUser" }]), "not the sign-in grant"],
  ];
  for (const [name, edit, want] of cases) {
    const t = clone(t0); edit(t);
    const f = signInTaskFindings(t, "production");
    assert.ok(f.some((l) => l.includes(want)), `${name}: ${f.join("; ")}`);
  }
  // a second exact grant (two statements) is counted, not passed
  const twice = clone(t0); addPolicy(twice, serviceRole(twice), [clone(signInStatements(t0)[0])]);
  assert.ok(signInTaskFindings(twice, "production").some((l) => l.includes("found 2")), signInTaskFindings(twice, "production").join("; "));
});

test("PF-4bs fail (review m2, break M3): the migration task, or any other task, running as the service's task role is caught", () => {
  const t = clone(t0);
  (taskDefinitions(t).migration![1].Properties as Record<string, unknown>).TaskRoleArn = { "Fn::GetAtt": [serviceRole(t), "Arn"] };
  assert.ok(signInTaskFindings(t, "production").some((l) => l.includes("also runs as the service's task role")), signInTaskFindings(t, "production").join("; "));
});

test("PF-4bs fail (break M4): a second PLATFORM_COGNITO_USER_POOL_ID (or any repeated setting name) on the service's container is caught", () => {
  const t = clone(t0);
  const c = (taskDefinitions(t).service![1].Properties!.ContainerDefinitions as { Environment: { Name: string; Value: unknown }[] }[])[0];
  c.Environment.unshift({ Name: "PLATFORM_COGNITO_USER_POOL_ID", Value: { Ref: poolId(t, "production", "own-staff") } });
  assert.ok(signInTaskFindings(t, "production").some((l) => l.includes("named twice")), signInTaskFindings(t, "production").join("; "));
});

test("PF-4bs fail (review M2, break B2): an app client whose UserPoolId is not a plain Ref to a pool of this stack is caught (an extra staff client, or the own-staff client moved, beside a decoy)", () => {
  const nd0 = noDomain.find((s) => s.name === "xr-staging")!.template;
  for (const [t1, stage, domain] of [[t0, "production", DEFAULT_DOMAIN], [nd0, "staging", NO_DOMAIN]] as const) {
    for (const form of [(id: string) => ({ "Fn::Sub": `\${${id}}` }), (id: string) => ({ "Fn::Join": ["", [{ Ref: id }]] }), (id: string) => ({ "Fn::GetAtt": [id, "UserPoolId"] }), () => "ca-central-1_outside"]) {
      const t = clone(t1);
      t.Resources!.SlipClient = { Type: "AWS::Cognito::UserPoolClient", Properties: { UserPoolId: form(poolId(t, stage, "staff")), ExplicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"], PreventUserExistenceErrors: "LEGACY", AuthSessionValidity: 3 } };
      const f = poolFindings(t, stage, domain).join("\n");
      assert.ok(f.includes("SlipClient: its pool") && f.includes("not a plain Ref to a pool of this stack"), `${stage} ${JSON.stringify(form("X"))}:\n${f}`);
    }
  }
});
