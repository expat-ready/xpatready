# R1.43 part 0: break report, round 2 (secrets focus), PR #3659

Breaker: adversarial, secrets focus. Head 006d45bc0, diff `d6c52b6..HEAD` under `prototype/studio/deploy/`. Synth only: no AWS account.
Method: each attempt is a small script that clones the synthesized `xr-staging` or `xr-production` template (`lib/app.ts`
`buildApp`/`allStacks`), changes it, and runs **every guard the test suite runs** (all 27 `*Findings` functions in
`lib/checks.ts`, `lib/service-checks.ts`, `lib/observability.ts`, with the stack's own stage and domain). A finding counts
as "caught" only if it is new compared with the unmodified template (both baselines: zero findings). `npm test`: 148/148 pass.
Scripts stayed in the breaker's scratch area (harness, attacks 1 to 4); nothing in the repository changed except this file.
The secret is named here only by its role, "the Google OAuth client secret in Secrets Manager" (below: the Google secret).

## F1 re-attack: production made to accept staging's Google secret (the round-1 finding)

| # | Attempt (on `xr-production` unless stated) | Caught by |
|---|---|---|
| A0 | Round-1 replay: staging's exact imported reference on the service container, staging's exact wildcard grant on the service's execution role | taskSetting ("not a Secrets Manager secret of this stack"), secretRead (cannot read / does not use), bypass (`own()`) |
| A1 | A0 plus an injected secret named `xr/staging/FAKE`, so the template names two stages | `templateStage` gives none; same three guards |
| A2 | A0 with every named production secret renamed to `xr/staging/prod-…`, so `templateStage` says **staging** | roleFindings: the owner and app database addresses must be `xr/production/…` exactly (3 findings) |
| A2b | Names rewritten to `xr/staging/../production/…` (stage regex matches staging) | roleFindings, as A2 |
| A2c | Production names turned into `Fn::Join` objects (not strings) plus one literal staging name | `templateStage` gives none; taskSetting, secretRead, roleFindings, bypass |
| A3a | Reference and grant as `Fn::Sub` | taskSetting, secretRead, bypass |
| A3b | Another `Fn::Join` split (region and name in separate literals) | taskSetting, secretRead, bypass |
| A3c | Literal partition (`arn:aws:` written out) | taskSetting, secretRead, bypass |
| A3d | Literal 12-digit account (placeholder) | taskSetting, secretRead, bypass |
| A3e | `Ref AWS::Region` instead of the literal region | taskSetting, secretRead, bypass |
| A3f | Grant ending in `*` instead of six `?` | taskSetting, secretRead, bypass |
| A3g | The six-character suffix written literally on both sides (no wildcard, so the two sides are the same text) | taskSetting, bypass |
| A3h | Container names the secret by its plain name (ECS accepts a same-region name) | taskSetting, secretRead, bypass |
| A3i | Grant `Resource` as an array: a production secret's `Ref` plus staging's wildcard form | taskSetting, secretRead, bypass |
| A3j | Staging's wildcard form with an extra `*` | taskSetting, secretRead, bypass |
| A3a to A3j | Each again under a setting name the loader does not know (`XR_GOOGLE`) | secretRead and bypass on every one (A3g: bypass) |
| B3 | Staging's secret through a `Fn::Join` that includes a `Ref` to a stack resource (see m1), under the loader's name | taskSetting |
| B4 | B3 plus a second entry with the loader's name pointing at a production secret, so the last-wins map looks clean | signInTaskFindings: "named twice" |
| B5 | `kms:Decrypt` on staging's data key for the production execution role | bypass (action not allowed; resource not this stack's) |
| C1 to C5 | Staging's grant given to the task role, the migration's execution role, a new ECS-trusted role, a managed policy, or the execution role's inline `Policies` (both stacks) | secretRead and bypass each time (C2 staging: secretRead "does not use"; C5 also typeFindings). C3 on staging is the same grant twice on the right role, correctly not a finding |

**F1 holds.** Every form of staging's Google secret that `importedSecretName` might have matched is now refused on
production, and `templateStage` cannot be made to say "staging" on the production template without roleFindings failing:
the database addresses pin `xr/production/…` names into the template (`lib/service-checks.ts:161-176`). Mixed or foreign
names fail closed: nothing imported is accepted.

## Findings

**m1 (Minor, older than this PR): a cross-stage read gets past every guard through the generic joined-ARN allowance.**
`bypassFindings` `own()` accepts any `Fn::Join` of literals, pseudo parameters and **at least one `Ref` or `GetAtt` of any
resource in the stack** (`lib/checks.ts:460-468`). Attempt B2: set the production ECS cluster's `ClusterName` to the Google
secret's last name segment plus its six-character suffix. Then add a container secret and an execution-role grant, both
`Fn::Join["arn:", Partition, ":secretsmanager:ca-central-1:", AccountId, <":secret" + ":xr/staging/">, {Ref: <the cluster>}]`,
under a name the loader does not read (`XR_GOOGLE`). Result: **no guard catches it** (all 27 run). A new log group named
like the secret (B1b, retention 90 days, stage tag) also gets through. The same trick reaches staging's Stripe secret
(attempts 4), so this is older than this PR, not a regression. Under the loader's own name it is caught (B3, B4), so the
app never uses the value. It does land in the production task's environment.
Limits: it needs an insider who knows the suffix, and a reviewed code change. KMS blocks the read at run time if the
hand-made Google secret is encrypted with staging's data key: production's execution role has no `kms:Decrypt`, and B5
shows a guard refuses one. Synth cannot verify that key. The runbook line added in this PR (`RUNBOOK-secrets.md:23`) is the
only control, and it is a manual one.
Suggested direction, not a fix: in `own()`, take a joined secrets-manager ARN only in its exact form, or take no joined form.

**m2 (Minor, F2 is incomplete): the pair guard checks that the names are present, not that the values are usable.**
`lib/service-checks.ts:75-76` takes a setting as present if its name appears (`e.has`/`s.has`). The loader trims each value
and treats a blank one as unset, and a value that fails its format rule is refused (`api/src/platform/config/settings.ts:152-156,172-174`).
The guard passes all of these, and each one makes the staging task stop at start: client id `""` (D1); id `"   "`; id with
upper-case letters, which fails the loader's format rule; id `{Ref: AWS::NoValue}`; id given as a container secret that
points at another stack secret, here the Zoom client id (D2). Moving the Google secret into the migration container is
caught (D3). Two copies of the id, the second empty, are caught by signInTaskFindings (D4). An id alone on production is
caught (D5). Deployed with the guard green, the task would fail its start-up check. That is loud, not a leak, hence Minor.

**m3 (Minor, older than this PR): the credential-shape scan, now with the `GOCSPX` prefix (F3), covers only literal strings in task definitions.**
Caught: the plain value under another setting's name, inside `Fn::Select` (E4), `DockerLabels` (E5) and `Command` (E11).
Not caught:
- the value split over `Fn::Join` literals ("GOC" + "SPX-…", E1);
- the value in a secret's `Description` (E6), a resource `Tag` (E7), a stack `Output` (E8), a `Parameter` default (E9), a
  Cognito client's name (E10), or resource or template `Metadata` (E12).

The same cases with a Stripe live-key shape pass too (E1b, E6b), so this is the scope the scan already had
(`lib/service-checks.ts:84,88`). This PR did not narrow it. A value written that way would be readable by anyone who can
read the stack's template.

## What held

- `importedSecretName` now needs the checked template's own stage and refuses everything when it has none (`lib/service.ts:52-58`).
- `templateStage` returns no stage for two stages, a name outside `xr/<stage>/`, a non-string name or no named secret.
- The three guards that take an imported name (bypass `own()`, taskSetting `secretName`, secretRead `grants`/`wanted`)
  all pass `templateStage(t)`, and none of them can be steered to accept another stage's name (A0 to A3j).
- Who may read the Google secret is pinned: only the service's execution role, never the task role, the migration's
  role, a new role or a managed policy (C1 to C5).
- The pair rule catches either half missing, and the production pass test pins that production has no Google setting.
- Plain-value placement stays refused: the Google secret as a plain environment value in the service, a sidecar or the
  migration task.
- The runbook addition names no value and no ARN. It gives a describe-only command to check the key.

Verdict: Approve
