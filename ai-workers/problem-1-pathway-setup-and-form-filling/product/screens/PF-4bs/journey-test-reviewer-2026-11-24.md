# PF-4bs part 1: journey test, reviewer role (24 Nov 2026)

Commit `bd9d8149561e6925875907ff399778fd75b4232d` (PR #3429). Deploy code only (AWS CDK, synth only).

There is no screen, so there was no browser walk, no Playwright replay, no axe check and no 400, 1024 or 1440 px pass. The journeys below are the people who use this change: the builder or tech lead who runs the estate checks, and the deploy that applies the templates. Staff sign-in itself arrives in PRs 2a–4 and the staging proof.

## Journeys
1. **Main.** Tech lead: "prove the estate is still safe after this PR."
   - Steps: `npm ci && npm test && npm run synth`.
   - Expected: green, and only the intended template changes.
   - Result: exit 0 twice (133/133), synth exit 0. A resource-by-resource synth diff against `origin/main` shows exactly the two staff clients and the task role's default policy changed.
2. **Alternate: no-domain mode.**
   - Expected: the same flows, 15 minutes and existence errors off, and passkeys still off.
   - Result: held (the pass tests in both modes, plus the synth diff).
3. **Error: an eighth action, `cognito-idp:*`, a glob, own-staff, clients, a joined ARN, `*`, a condition, a deny, a missing action.**
   - Expected: refused with a plain line.
   - Result: held. Each is refused and the line names the resource.
4. **Wrong role: the migration task's role or the execution role gets the seven.**
   - Result: refused, by `signInTaskFindings` and `bypassFindings` respectively.
5. **Recovery: the deploy applies the change to existing pools.**
   - Expected: no client replacement, so the client id stays the same.
   - Result: logical IDs are unchanged and the properties update in place. The live behaviour with passkey settings is unproven (staging proof).
6. **Boundary: PRs 2b and 3 call the seven actions.**
   - Result: the grant covers the callers named in concept §4. The no-IAM calls are correctly not granted.

## Break it (15 minutes)
Probes on clones of the synthesized templates, all checks run together:
- **Escaped every check (Major):** a single-object `Statement` granting the seven on the own-staff pool, or on the migration role (review M1); a second app client on the staff pool via `Fn::Sub` with SRP, a 3-minute challenge and `LEGACY` existence errors (review M2).
- **Escaped every check (Minor):** the migration task sharing the service's task role (review m2).
- **Refused:**
  - an Allow with `NotAction`
  - `Fn::If` in Action
  - `*:ListUsers`
  - AmazonCognitoPowerUser
  - an `AWS::IAM::ManagedPolicy` resource
  - mixed case
  - `NotResource`
  - a duplicate exact grant
  - a second policy granting one action on own-staff
- **Mutation:** deleting the inline-policy route (`service-checks.ts:424`) keeps the suite green (review m1).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The templates are right; the "refuses any other grant or client" guarantee fails on two shapes (M1, M2) |
| Next step obvious | 1 | README and concept §6 name the staging proof steps |
| Plain words | 1 | Finding lines say what is wrong in words ("is not the sign-in grant … on the staff pool's ARN") |
| Feedback and state | 1 | Each finding names the resource and the reason; `found N` on the count |
| Correct data | 1 | The synth diff is exactly the intended three resources, in both modes |
| Error recovery | ½ | Most bad grants are refused; two shapes pass silently |
| Accessibility and screen sizes | N/A | No UI |
| Speed | 1 | Suite about 15 s, synth a few seconds |
| Visual quality | N/A | No UI |
| Trust and sources | ½ | AWS quotes cited and live behaviour marked Unconfirmed; the README overclaims what the check alone refuses (m3, m4) |

**6.5 of 8 applicable, 8.1 scaled to 10; no criterion at 0.** The score passes, but the verdict is Block on the two Majors. Most valuable fixes:
1. Read single-object statements (M1).
2. Require a bare `Ref` for every client's pool and check every staff client (M2).
3. Add a test for the inline-policy route (m1).
4. Correct the README lines 79 and 82 (m3, m4).

Not tested: live AWS (staging proof), and D17/D20 (founder).
