**Verdict: Block** (skill scale: Ship after fixes) for commit `bd9d8149561e6925875907ff399778fd75b4232d` (PR #3429, PF-4bs part 1, deploy code only). Two Majors are open. Both are small fixes in the checks.

# PF-4bs part 1 review (independent reviewer, 24 Nov 2026)

Read: concept r3 and challenge.md (rounds 1 and 2; branch `claude/laughing-mccarthy-xlmzht`), `git diff origin/main...bd9d81495` (6 files under `deploy/cdk`), and `lib/{service,service-checks,checks}.ts`.
- `npm ci`: exit 0. `npm test`: **exit 0, twice** (133/133 pass, about 15 s). `npm run synth`: exit 0.
- The deploy-synth CI check was skipped on this commit, so the CI run is not evidence yet.

**No app screen:** there was no browser walk, no keyboard, 1024 px or 200 % pass, no BIC scorecard (§6 covers case-side screens only), and the D dimensions that need a UI are N/A.
- I did not run `graph.mjs`: it rewrites `qa/GRAPH.md`, and I write only this file and the journey report. The diff adds no page or API route.

## What holds
- **The synthesized templates change only where intended.** I synthesized `origin/main` and this commit (both modes; production, staging and the copy stacks) and diffed resource by resource.
  - Changed: `AppPoolstaffApp…` and `AppPoolownstaffApp…` (flows become `ALLOW_ADMIN_USER_PASSWORD_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`, plus `AuthSessionValidity: 15`), and `AppTaskTaskRoleDefaultPolicy…` (one added statement: the seven actions on `Fn::GetAtt [AppPoolstaff…, Arn]`).
  - Not changed: the clients' client (still SRP + refresh), the task definitions, any logical ID, and the Parameters, Outputs and Conditions sections.
- **The seven actions match concept §4 exactly** (`service.ts:47`), and the test pins them.
- **Deploy safety:** `authFlows.adminUserPassword` and `authSessionValidity` are valid in aws-cdk-lib 2.275.0 and synth cleanly. Logical IDs are unchanged, so the client is updated in place, not replaced.
  - No app code signs in on Cognito today (no `InitiateAuth`/SRP in `api/src` or `web/src`), so dropping SRP and USER_AUTH breaks nothing live.
  - The live passkey-setting risk is on the staging proof list (README, concept §6).
- **Existing guards still pass on the real stacks:** `bypassFindings`, `resourcePolicyFindings`, `typeFindings`, `poolFindings`, `filesTaskFindings`, `secretReadFindings`.
- **What the guards still refuse:** no action outside the seven reaches any role. `ECS_TASK_ACTIONS` is an exact, case-sensitive list, and `statementsOf` refuses `NotAction`, `NotResource` and `Fn::If`. I tested:
  - an Allow with `NotAction`
  - `Fn::If` in Action
  - the glob `*:ListUsers`
  - an AWS managed policy (AmazonCognitoPowerUser)
  - an `AWS::IAM::ManagedPolicy` resource
  - mixed case
  - the execution role holding the seven
  - a second policy granting one action on own-staff
  - `NotResource`
  - a duplicate exact grant

  Each was refused by `signInTaskFindings`, `bypassFindings` or `typeFindings`.
- **Mutation testing:** removing the glob probe, the other-role branch, the flows rule, the 15-minute rule or the existence-error rule each fails a test.

## Blockers
None.

## Majors (Must)
**M1. `signInTaskFindings` never reads a policy whose `Statement` is a single object.**
- Where: `lib/service-checks.ts:427` uses `arr(g(doc, "Statement"))`, and `arr()` returns `[]` for anything that is not an array.
- IAM allows the single-object form, and `bypassFindings` reads it (`checks.ts:307`) and accepts it: the seven are on `ECS_TASK_ACTIONS` for any task role, and `own()` takes any `Fn::GetAtt`.
- I reproduced it (it is also in break-report.md B1). An `AWS::IAM::Policy` on the service's task role with `Statement: {Effect: Allow, Action: <the seven>, Resource: GetAtt <own-staff pool>}` gets past all six checks. So does the same policy on the **migration** task role on the staff pool.
- That breaks two of the PR's claims: "refuses any other … pool, role" and concept §4 ("never own-staff").
- *Fix:* normalise the way `statementsOf` does (`Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]`), or reuse `statementsOf` and make an unreadable document a finding. Add fail tests: single-object, own-staff, on the service role; and single-object on the migration role.
- The same root cause sits at `:398` (`filesTaskFindings`) and `:106-107` (`secretReadFindings`). Those are outside this PR; note them for a follow-up row.

**M2. The client rules see only clients whose `UserPoolId` is a bare `Ref`.**
- Where: `lib/service-checks.ts:247` and `:274` (`refId` handles only `Ref` and `Fn::GetAtt`, and `.find` takes the first match).
- I reproduced it (also break-report.md B2). An extra `AWS::Cognito::UserPoolClient` with `UserPoolId: {"Fn::Sub": "${<staff pool>}"}` passes every check, even though it has:
  - SRP + `USER_PASSWORD_AUTH`
  - a 3-minute challenge
  - `PreventUserExistenceErrors: LEGACY`
- That is exactly the public-client-id route around our door that challenge B1 and concept §2 item 6 ("every other list is refused") close.
- The blind spot predates this PR, but this PR is the one that claims the client lists are pinned.
- *Fix:* every `AWS::Cognito::UserPoolClient` must have `UserPoolId` exactly `{Ref: <a UserPool of this stack>}`, else a finding. Apply the flow, 15-minute and existence rules to every client of a staff pool. Add a fail test for the `Fn::Sub` client.

## Minors (Should)
- **m1. The inline-policy route has no test, and it is the only guard on that route.**
  - Where: `lib/service-checks.ts:424`.
  - Removing that line still gives 133/133 green. Yet an inline policy on the service's role granting the seven on own-staff is caught only by `signInTaskFindings` (`bypassFindings` accepts it).
  - *Fix:* add a fail case: an inline `Policies` entry on the service's task role, own-staff pool.
- **m2. The migration task could share the service's task role** (break-report M3; reproduced: all checks pass).
  - Where: `lib/service-checks.ts:421`.
  - *Fix:* refuse when the service's `TaskRoleArn` is also any other task definition's.
- **m3. The docstring and README overclaim what the check does by itself.**
  - Where: `lib/service-checks.ts:409-413`; README `:79` ("refuses any other Cognito grant, pool or role").
  - Globs outside the probe set (`*:ListUsers`), an Allow with `NotAction` that names no Cognito action, the execution role, and AWS managed policies are refused by `bypassFindings`, not by `signInTaskFindings`.
  - *Fix:* say "with bypassFindings", or treat any `*`/`?` action and any Allow with `NotAction` as reaching Cognito.
  - Also: the case-insensitive match (`:429`) and the duplicate count (`:435`) have no test. Removing either stays green; `bypassFindings` covers the case-insensitive one.
- **m4. The README contradicts itself.** README `:82` "Not here" still lists "the task role's Cognito admin permissions (the adapter row that uses them…)", which this PR now adds.
  - *Fix:* drop that clause.

## D1–D20 (deploy-only PR; UI dimensions N/A)
- **D1 3/5:** the concept's §2 items 4 and 6 and §4 are built. The refusal guarantee fails on two shapes (M1, M2).
- **D2 4/5:** the synth diff is exactly the intended three resources.
- **D5 4/5:** the client is updated in place, with no replacement. The live passkey interaction is on the staging proof list.
- **D16 3/5:** every concept-listed refusal is tested. Blind spots: m1, the single-object statement, and the non-`Ref` client.
- **D18 4/5:** the AWS quotes are cited in the code comments, and live behaviour is marked Unconfirmed.
- **D3, D4, D6, D7:** N/A (no content).
- **D8–D15:** N/A (no UI). D15 as speed: the suite takes about 15 s, synth a few seconds.
- **D17, D19, D20:** N/A for this PR. Simulated only; they come at the staging proof.

## Journey score (reviewer; `journey-test-reviewer-2026-11-24.md`)
**6.5 of the 8 applicable criteria, 8.1 scaled to 10; no criterion at 0.** Accessibility and visual quality are N/A (no UI). The Majors decide the verdict, not this score.

## Not checked
- Live AWS behaviour: in-place client update with passkey settings on, IAM taking the `userpool` ARN. These are on the staging proof list.
- A CI run on this commit (deploy-synth skipped).
- I read break-report.md after my own probes and reproduced its B1, B2 and M3 independently. Its M4 (a duplicate env name) gives no power on its own once M1 is fixed, so it is not raised here.

**Verdict: Block.** Fix M1 and M2 (and ideally m1–m4), then re-review the new head.

Reviewer: Block bd9d8149561e6925875907ff399778fd75b4232d

## Round 2 (9fe17105a)
**Verdict: Approve** for commit `9fe17105ad710fbbc4db811242dfc732a676e478`. No open Blocker or Major.

Reviewed only `git diff bd9d81495..9fe17105a`: `lib/service-checks.ts`, `README.md`, `test/sign-in-task.test.ts`, plus round-1 records committed by the builder.
- `service.ts` and `checks.ts` are untouched, so the synthesized templates are the same as in round 1.
- `npm ci`: exit 0. `npm test`: **exit 0, twice** (137/137 pass).

**Round-1 findings:**
- **M1, fixed.** `service-checks.ts:440-443` reads a one-object `Statement` as a list of one, and a non-object one is a finding. My round-1 probes are now refused by `signInTaskFindings`: a one-object grant on own-staff (service role), and the same on the staff pool (migration role). Fail tests are at `sign-in-task.test.ts:132-153`.
- **M2, fixed.** `service-checks.ts:248-252` requires every client's `UserPoolId` to be exactly `{Ref: <pool of this stack>}`. With the existing one-client-per-pool count (`:254`), this means the per-pool rules see every staff client. My `Fn::Sub` client probe is refused. The test covers `Fn::Sub`, `Fn::Join`, `Fn::GetAtt` and a literal id, in both modes.
- **m1, fixed.** Inline-policy cases were added (array and one-object). Deleting the inline route now fails a test.
- **m2, fixed.** `service-checks.ts:434` refuses any other task definition running as the service's task role, and it is tested.
- **m3, fixed.**
  - The docstring (`:418-421`) and README `:79` now credit `bypassFindings` for the shapes `signInTaskFindings` does not read.
  - The mixed-case test and the "found 2" test are added. Removing the `/i` flag or loosening `exact !== 1` now fails a test.
- **m4, fixed.** README `:82` now lists only the app code that calls Cognito (PF-4bs parts 2-4, PF-4bc).
- **Also fixed:** the break report's M4 (a setting named twice, `:429-431`, tested).

**Anything new the fixes break:** nothing found.
- Mutation check: removing each new rule fails a test (one-object read, plain-`Ref` client, shared role, named twice, inline route, `/i`, exact count).
- All 15 probes from round 1 are refused by at least one check. The five `signInTaskFindings` does not read (`NotAction`, `Fn::If` in Action, `*:ListUsers`, an AWS managed policy, the execution role) are refused by `bypassFindings`, as the docstring now says.
- One note, not a finding: a `Statement` that is a single `Fn::If` object is read by `signInTaskFindings` as an action-less statement and skipped. `bypassFindings` refuses it ("a statement uses Fn::If"), which is the split the docstring describes.

**Journey score (round 2):**
- Task completed rises to 1. Error recovery rises to 1. Trust and sources rises to 1.
- **8 of 8 applicable, 10 scaled to 10.** Accessibility and visual quality are N/A (no UI).
- Live AWS behaviour stays on the staging proof list.

**Verdict: Approve**

Reviewer: Approve 9fe17105ad710fbbc4db811242dfc732a676e478
