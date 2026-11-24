**Verdict: Changes** — commit `bd9d8149561e6925875907ff399778fd75b4232d` (PR #3429, branch `claude/screens-pf4bs-deploy`). Two Major breaks: claims (a) and (c) fail when a policy's `Statement` is a single object, and claim (d) fails when a client's `UserPoolId` is not a bare `Ref`. The template this commit synthesizes is correct today. What is wrong is the guarantee.

# PF-4bs part 1: break report (checks only, synth only)

Scope: `deploy/cdk` `signInTaskFindings` (lib/service-checks.ts:414-437), `ECS_TASK_ACTIONS` in `bypassFindings` (lib/checks.ts:410, 417-487), `poolFindings`/`passkeyFindings` (lib/service-checks.ts:241-295), plus `resourcePolicyFindings` and `typeFindings`.

Method: each mutation edits a clone of the synthesized template from `allStacks(buildApp().app)`. It ran on xr-production and xr-staging, in both domain and no-domain modes. A mutation is a break only when all five checks return `[]` in all four runs. The scratch script stays outside the repo.

`npm ci` exit 0. `npm test` exit 0 (133 tests, 133 pass, 0 fail).

## Breaks that worked

### B1 (Major): a single-object `Statement` gets past `signInTaskFindings`. Another pool, the migration role and conditions all pass
- **Mutation:** add this resource:
  `XPol: {Type: AWS::IAM::Policy, Properties: {PolicyName: x, Roles: [{Ref: <service task role>}], PolicyDocument: {Version: "2012-10-17", Statement: {Effect: Allow, Action: [the seven], Resource: {"Fn::GetAtt": [<own-staff pool>, Arn]}}}}}`
  `Statement` is a single object here, not an array. IAM's grammar allows either form, and CloudFormation passes it through.
- **Variants that also passed all five checks:**
  - the clients and own-staff pools together in `Resource`
  - the same grant on the **migration** task role (`Roles: [{Ref: AppMigrateTaskRole…}]`)
  - the role's own inline `Policies` with a single-object `Statement` on the clients pool
  - one action plus a `Condition`
  - a second copy of the exact grant with a `Sid`
- **Checks that returned `[]`:**
  - signInTaskFindings, bypassFindings, resourcePolicyFindings, typeFindings and poolFindings
  - also roleFindings, filesTaskFindings, secretReadFindings and imageFindings
- **Why:** service-checks.ts:427 reads `arr(g(doc, "Statement"))`, and `arr()` returns `[]` for anything that is not an array. The new statement is never looked at. The exact grant is still found once, so `exact === 1`.
  - bypassFindings reads single objects (checks.ts:307 `statementsOf`). It accepts the statement because each action is in `ECS_TASK_ACTIONS` and any `Fn::GetAtt` of a stack resource counts as `own()` (checks.ts:462). That holds for every task role, the migration's included (checks.ts:427).
- **Result:** claim (a) breaks (the migration role can call Cognito) and claim (c) breaks (own-staff and clients pools). Claim (b) still holds: no action outside the seven gets through.
- **Fix:** in signInTaskFindings, read statements the way `statementsOf` does: `Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]`. Better, call `statementsOf` and treat an unreadable document as a finding. Add a fail test with a single-object `Statement` on the service role (own-staff pool) and on the migration role.
- **Same root cause outside this PR (not counted):** filesTaskFindings (service-checks.ts:398) and secretReadFindings (service-checks.ts:106-107) use the same `arr(g(doc,"Statement"))`. A single-object `s3:GetObject` grant on `AccessLogsBucket…/*/*` for the migration role returns `[]` from both filesTaskFindings and bypassFindings.

### B2 (Major): a second app client on the staff pool goes unseen when `UserPoolId` is not a bare `Ref`
- **Mutation:** add this resource:
  `XClient: {Type: AWS::Cognito::UserPoolClient, Properties: {UserPoolId: {"Fn::Sub": "${<staff pool id>}"}, ExplicitAuthFlows: [ALLOW_USER_SRP_AUTH, ALLOW_USER_PASSWORD_AUTH, ALLOW_USER_AUTH, ALLOW_REFRESH_TOKEN_AUTH], PreventUserExistenceErrors: LEGACY, AuthSessionValidity: 3}}`
- **Variant that also passed:** re-point the real own-staff client with `UserPoolId: {"Fn::Join": ["", [{Ref: <own-staff pool>}]]}`, give it `ALLOW_USER_PASSWORD_AUTH` and `LEGACY`, and add a compliant clone as a decoy that keeps the bare `Ref`.
- **Checks that returned `[]`:** all five, in both modes and both stages.
- **Why:** `refId()` (service-checks.ts:14) understands only `Ref` and `Fn::GetAtt`. Clients reached through `Fn::Sub` or `Fn::Join` are not counted at line 247 and are not found at line 274. Line 256 checks only `AllowedOAuthFlowsUserPoolClient`. bypassFindings has no client rule.
- **Result:** claim (d) breaks in both modes. The staff pool gets a public client id that can run SRP or plain password sign-in around the API, uses a 3-minute challenge and tells whether a person exists. Two-step sign-in still holds, because `MfaConfiguration` ON is a pool setting.
- **Fix:** every `AWS::Cognito::UserPoolClient` must have `UserPoolId` exactly `{Ref: <a UserPool of this stack>}`; anything else is a finding. Apply the flow, 15-minute and existence-error rules to every client of a staff pool, not just the first one `.find` returns.

### M3 (Minor): the migration task can share the service's task role
- **Mutation:** set the migration task definition's `TaskRoleArn` to `{"Fn::GetAtt": [<service task role>, Arn]}`.
- **Checks that returned `[]`:** all five, plus roleFindings and filesTaskFindings.
- **Why:** signInTaskFindings compares roles only (`rid !== role`, service-checks.ts:430). It never asks whether another task definition uses the same role.
- **Result:** the one-off `prisma migrate deploy` task, which runs with the database owner's credentials, can call all seven actions (create users, set passwords). The claim's wording ("only the service's task role") still holds, but its intent does not.
- **Fix:** the service's task role must be the `TaskRoleArn` of no other task definition.

### M4 (Minor; ECS behaviour unconfirmed): a duplicate `PLATFORM_COGNITO_USER_POOL_ID`
- **Mutation:** put `{Name: PLATFORM_COGNITO_USER_POOL_ID, Value: {Ref: <own-staff pool>}}` at the start of the service container's `Environment`. The original staff entry stays last.
- **Checks that returned `[]`:** all five.
- **Why:** `env()` (service-checks.ts:16) builds a `Map`, so the last entry wins. Which value ECS gives the container when a name appears twice was not confirmed from the build lane.
- **Result:** on its own this gains no power, because the IAM grant still names the staff pool. Combined with B1 the app could be pointed at, and allowed on, another pool. That breaks claim (c)'s link to "the pool PLATFORM_COGNITO_USER_POOL_ID names".
- **Fix:** a duplicate environment or secret name in the service container is a finding.

## What was tried and caught (each by at least one of the five checks)
- **`NotAction: s3:GetObject`, Resource `*`:** bypassFindings ("a statement uses NotAction").
- **`NotResource` with the seven:** signInTaskFindings and bypassFindings.
- **`Fn::If` or `Fn::Sub` in `Action`:** bypassFindings ("not a literal").
- **`Fn::If` or `Fn::Sub` (`userpool/*`) in `Resource`, even with a single-object `Statement`:** bypassFindings ("not a resource this stack defines").
- **Unexpected action names:** `Cognito-IDP:AdminDeleteUser`, `?ognito-idp:AdminDeleteUser` and `*:AdminDeleteUser` were all caught by bypassFindings' exact, case-sensitive allow list.
- **`AWS::IAM::ManagedPolicy` attached through the role's `ManagedPolicyArns`:** typeFindings and bypassFindings.
- **`AWS::IAM::RolePolicy`:** typeFindings and bypassFindings.
- **A role trusted by ecs-tasks that no task definition references:** bypassFindings (empty allow list).
- **The execution role given the seven (single-object `Statement`):** bypassFindings (`ECS_EXEC_ACTIONS`).
- **Policy `Roles` through `Fn::Join`:** bypassFindings.
- **Migration `TaskRoleArn` as `{Ref}`:** bypassFindings (`RoleArn` naming) and signInTaskFindings.
- **`PLATFORM_COGNITO_USER_POOL_ID` set to own-staff:** signInTaskFindings and poolFindings.
- **Staff and own-staff `UserPoolName` swapped:** signInTaskFindings and poolFindings.
- **A Cognito `LambdaConfig` trigger:** bypassFindings.
- **The exact grant duplicated in a second array-form policy:** signInTaskFindings ("found 2").
- **A second staff client with `UserPoolId` as `Fn::GetAtt [pool, UserPoolId]`:** poolFindings ("2 app clients").
- **The test file's own cases still fail as intended:** an eighth action, `cognito-idp:*`, a glob, other pools, a joined ARN, `*`, a condition, a deny, a missing action, the migration role, wrong client flows, a wrong challenge time, existence errors (test/sign-in-task.test.ts:57-119).
- **`PermissionsBoundary` (AdministratorAccess) on the task role:** passed all five, but it is not a finding, because a boundary only narrows a role and grants nothing.
- **Cognito resource policy:** no CloudFormation type exists for one. A new type would hit typeFindings.

## What held
- **Claim (b), the action set:** nothing outside the seven actions reached any role. That comes from `ECS_TASK_ACTIONS` being an exact, literal, case-sensitive allow list, plus `statementsOf` refusing non-literals, `NotAction` and `NotResource`.
- **No other principal gets Cognito power:** execution roles, AWS Backup's role, roles no task definition references, outside roles, managed policies and other IAM types all fail.
- **The service's env and the staff pool stay tied together** for a single entry (`refId` plus `UserPoolName`).
- **In array-form policies,** signInTaskFindings' exact-grant comparison and its count of one.

## Round 2 (9fe17105a)
**Verdict: Approve** — `9fe17105ad710fbbc4db811242dfc732a676e478`. B1, B2, M3 and M4 are closed. One new Minor remains (R7). It gives no Cognito power: claims (a) to (d) hold against every mutation tried.

`npm test` in deploy/cdk exit 0 (137 tests, 137 pass, 0 fail). Same method as round 1: five checks, xr-production and xr-staging, with a domain and without. I re-ran the scratch `attack.ts` and `side.ts`, then ran a new `attack2.ts` against the round-2 code.

**Round 1 breaks:**
- **B1, closed.** All five variants are now caught by signInTaskFindings: one-object `Statement` on another pool, both pools, the migration role, inline `Policies`, and an added `Condition`. The second exact grant written with a `Sid` is caught too.
- **B2, closed.** The `Fn::Sub` and `Fn::Join` clients are caught by poolFindings ("not a plain Ref to a pool of this stack").
- **M3, closed.** signInTaskFindings: "AppMigrate… also runs as the service's task role".
- **M4, closed.** signInTaskFindings: "named twice".
- All round 1 caught cases are still caught.

**Attacks on the new code, caught:**
- **One-object reader:** each of these was refused.
  - **By bypassFindings (statementsOf):** a `Statement` that is one `Fn::If` object (on a Policy and in inline `Policies`); an `Fn::If` element in the array; a one-object `NotAction`; an extra `Statements` key next to an empty array.
  - **By both checks:** `Statement` as a JSON string ("cannot be read").
- **Plain-Ref client rule:**
  - `{Ref, "Fn::Sub"}` with an extra key is caught.
  - A second plain-Ref staff client behind a resource-level `Condition` is caught ("2 app clients").
- **Shared-role rule:**
  - migration `TaskRoleArn` as `GetAtt [service role, RoleId]`: caught by signInTaskFindings.
  - migration `ExecutionRoleArn` set to the service task role: caught by bypassFindings and resourcePolicyFindings.
  - `Roles` as `Fn::If`: caught by bypassFindings.
  - a decoy `ECS::Service` placed first in the Resources order: caught ("pool null").
- **Duplicate-name rule:** a sidecar container repeating the settings is caught ("named twice"). The rule spans every container and both Environment and Secrets.

**Still open, R7 (Minor): the container's command can set the setting the rule protects**
- **Mutation:** on the service container (which has no `Command` today), add `Command: ["sh","-c",{"Fn::Join":["",["PLATFORM_COGNITO_USER_POOL_ID=",{Ref:<own-staff pool>}," exec node dist/main.js"]]}]`. A variant used `EntryPoint: ["env", "PLATFORM_COGNITO_USER_POOL_ID=<own-staff>"]`.
- **Checks that returned `[]`:** all five.
- **Effect:** the app would sign staff in against own-staff while the checks read the env entry, which still names staff. M4's purpose ("one name, one value") is defeated through a different channel. No power is gained: the IAM grant is still on the staff pool alone, so the calls would be refused.
- **Fix:** the service container has no `Command` or `EntryPoint`, or neither mentions `PLATFORM_`.

**Not findings:**
- an env name with a trailing space (a different variable)
- the env set to `GetAtt [staff, ProviderName]` (still the staff pool, just a wrong value)
- a client in the ca-west-1 copy stack (Cognito is regional and no staff pool is there)
- `PermissionsBoundary` (it only narrows a role)

**Already open before this PR (not counted):** filesTaskFindings still reads only array `Statement`s (service-checks.ts:398). `side.ts` still returns [] from filesTaskFindings and bypassFindings for the migration role's one-object `s3:GetObject` grant.
