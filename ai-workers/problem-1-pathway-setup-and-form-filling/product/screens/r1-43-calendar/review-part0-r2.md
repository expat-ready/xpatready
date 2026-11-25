# R1.43 part 0, round 2 review (PR #3659): diff-only

- **Reviewed:** `git diff d6c52b61318a51b5de77752f3a4db270ee10e7b3..006d45bc070c51f54bc8815f56ebe6a100ea2df6` (5 files: `deploy/cdk/lib/service.ts`, `checks.ts`, `service-checks.ts`, `cdk/test/google-client.test.ts`, `deploy/RUNBOOK-secrets.md`).
- **Reviewer:** a fresh, independent reviewer that did not build this item. Nothing in the repository was edited except this file. Nothing was committed or pushed.
- **Method:** I read the diff. I ran `npm test` in `studio/deploy/cdk`. Then I made 15 hand mutations in a scratch copy of `deploy/cdk` (same relative paths, `node_modules` linked) and ran `node --test test/google-client.test.ts` on each one. Each mutation undoes one fix, or one site of a fix, to show that a test goes red without it.
- **Secret naming:** this report names the secret only by its role, "the Google OAuth client secret in Secrets Manager".

## Suite
`cd …/studio/deploy/cdk && npm test` ended with `# tests 148`, `# pass 148`, `# fail 0`. The new file alone gave `# pass 9`, `# fail 0`.

## Round-1 findings: fixed, and the test that fails without each fix
| Finding | Fix (file:line) | Mutation (scratch copy only) | Result |
|---|---|---|---|
| M1 = F1, overall | `service.ts:52-57`: `importedSecretName(v, stage, wildcard)` returns undefined when there is no stage, and loops only `STAGE_SECRETS[stage]` | Put back the any-stage loop and drop `if (!stage)` | `not ok 5 - … F1 fail …` (fails at test:82) |
| M1, the bypass guard | `checks.ts:420,461`: the stage comes from `templateStage(s.template)` | At :461, pass `"staging"` instead of `stage` | `not ok 5`, failing at **test:89** (the bypass assertion) |
| M1, the secret-source guard | `service-checks.ts:17`: `secretName` takes `templateStage(t)` | Pass `"staging"` | `not ok 5`, failing at **test:88** (taskSettingFindings) |
| M1, who reads which secret | `service-checks.ts:105,111,124` | Set `stage = "staging"` at :105, which changes both of its uses | `not ok 5`, failing at **test:90** |
| `templateStage` | `service.ts:62-70` | (a) `if (!m) continue` instead of returning undefined; (b) `seen.size >= 1`; (c) no longer skip unnamed secrets | (a) and (b): `not ok 6`. (c): `not ok 1`, `not ok 6`, `not ok 9` |
| F2 | `service-checks.ts:74-76`: both halves of the pair, or neither | `if (false)` | `not ok 7 - … F2 fail …` |
| F3 | `service-checks.ts:20`: `GOCSPX-` added to CREDENTIAL | Remove it | `not ok 8 - … F3 fail …` |
| m1 (a) the task role | test:124-127 | Exempt the Google client from "only an execution role may" | `not ok 9`, failing at test:127 |
| m1 (b) a missing grant | test:128-131 | Exempt the Google client from "cannot read" | `not ok 9`, failing at test:131 |
| m1 (c) the migration's role | test:132-135 | Exempt the Google client from "which its task does not use" | `not ok 9`, failing at test:135 |
| F4/m2 runbook | `RUNBOOK-secrets.md:23` names `alias/xr-<stage>-data`, plain text not the console's Key/value JSON, and a `describe-secret --query KmsKeyId` check | n/a | The alias matches `estate.ts:40` (`alias/xr-${props.stage}-data`). See Minor 2 |
| m3 (region literal) | `service.ts:54` still writes `ca-central-1` literally | n/a | Accepted as closed. The literal fails closed: an ARN in another region is refused (test:47 "another region"). If the estate moved region, the pass test (test:28) would go red rather than let anything through |

Mutating one side of who-reads-which-secret alone (only :111, or only :124) leaves the tests green. That is expected: the two sides then disagree, and the disagreement is itself a finding (it fails closed). Only the mutation of both sides together, which is the old behaviour, needs a test, and it has one.

## Does the diff break anything new?
- **Could `templateStage` return undefined for a real stack and silently drop a guard?** No. Undefined means "accept nothing imported", so every guard reports, and nothing is dropped. A probe over `allStacks(buildApp().app)` gave:
  - `xr-staging` → `staging` (12 secrets: 11 named `xr/staging/…`, 1 unnamed, the RDS admin's)
  - `xr-production` → `production`
  - `xr-staging-copy` and `xr-production-copy` → undefined. These stacks create no secrets and import none, so there is nothing to accept.
  - If a future change named a secret outside the `xr/<stage>/` form, staging's pass test (test:25-33, `taskSettingFindings` must be empty) would go red loudly.
- **Could a template add an extra named secret to flip its stage?** No. Adding a staging-named secret to production gives two stages, so undefined, so the imported reference is refused (test:96-98). Skipping unnamed secrets lets nobody add a stage. A non-string `Name` becomes `[object Object]` and gives undefined. To flip, every named secret of production would have to be renamed to staging's form. `roleFindings(t, stage)` (`service-checks.ts:166-169`, called with the stage from the stack's name at `service.test.ts:38`) pins the owner's and the app's addresses to `xr/<stage>/…`, so that is caught.
- **F2 and production:** production has neither half of the pair, so the check adds nothing there (test:35-39 passes).
- **Other changes:** callers in `roleFindings` and `filesFindings` (`service-checks.ts:166,386`) go through `secretName`, so they now also refuse another stage's import. That is consistent with the fix. No other caller of `importedSecretName` exists (`grep -n importedSecretName lib/*.ts`).

## Findings
No Major findings.

**Minor 1: two assertions on who reads which secret check only that some finding exists.**
- Where: `test/google-client.test.ts:90` and `:127` both use `secretReadFindings(...).length > 0`.
- The mutations above prove each one catches its fix today. But any unrelated finding added later would also satisfy them.
- The exact findings, from a probe of the same set-ups (role ids shortened):
  - For :90: `AppTask…: execution role cannot read <the imported ARN>` and `…ExecutionRoleDefaultPolicy…: execution role … reads <the imported ARN>, which its task does not use`
  - For :127: `…TaskRoleDefaultPolicy…: …TaskRole… may read secrets (<the Google client>); only an execution role may`
- Fix: assert `some(l => l.includes("cannot read"))` at :90 and `some(l => l.includes("only an execution role may"))` at :127, as (b) and (c) already do at :131 and :135.

**Minor 2: the runbook overstates its check.**
- Where: `RUNBOOK-secrets.md:23`. It says "Check both without reading the value", but `describe-secret --query KmsKeyId` checks only the key.
- Whether the value is plain text or Key/value JSON cannot be seen without reading the value. Today only the loader catches it, when the task starts.
- Also, `KmsKeyId` comes back as whatever was given when the secret was made (a key id, a key ARN or an alias ARN). "Compare it with the alias's target" covers only the key-id and key-ARN cases.
- Fix (wording only): say "check the key without reading the value", and say that an alias ARN in the answer must be `alias/xr-<stage>-data` itself.

**Observation (not graded).** `taskSettingFindings` gets a `stage` argument, but `secretName` reads the stage from the template instead (`service-checks.ts:17`). The two can disagree only if every secret is renamed, and `roleFindings` catches that (see above). So there is no gap, only two sources for one fact.

## Journey test (reviewer role)
Not scored (N/A). This is a synth-only CDK change with no screen, route or user step to walk, so no persona journey exists. The data check for this item is the synthesized templates, and the table above covers them. The founder's walk of connecting a Google calendar belongs to R1.43's later parts.

## Could not check
- No real AWS deploy, so it is untested that the hand-made secret is really encrypted with the stack's key.
- The `check_pf24_secrets.ts` flake (round-1 m4, watch only) was not rerun.
- The skill's D1-D20, BIC and graph steps do not apply: there is no screen.

Reviewer: Approve 006d45bc070c51f54bc8815f56ebe6a100ea2df6

Verdict: Approve
