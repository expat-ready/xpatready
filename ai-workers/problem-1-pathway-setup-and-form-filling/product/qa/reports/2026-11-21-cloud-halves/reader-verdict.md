# Fresh reader's verdict: cloud halves of R1.13, R1.24, R1.5 after #2748 (PF-8b) and #2743 (PF-23c)

Reader: independent Opus 5.5 (P-303), 21 Nov. I read code and records only. I ran nothing and spent US$0; live AI was off. Code read at main b04f84f1e.
Rules applied: P-339 (Works only when the pack is green on main's head on GitHub), P-606 (score only when all parts have merged), P-305 (an open Major keeps a row Partial), P-780 (1) (rows that need the AWS account count only when the AWS proof runs), P-616 (gate A by API).

## What qa got right, and one correction
- The evidence files match what qa says: cdk 93/93 twice; pf23 100/100; pf23m 15/15; pf23w 31/31; pf25 68/68. The workflow `deploy-synth.yml` runs on `pull_request` only (lines 10-16), so main's head has no run of its own.
- Correction (it narrows the gap, it does not close it): `git diff 94605d526 b04f84f1e -- studio/deploy/cdk` is empty. So run 44887503333 tested exactly the CDK tree that is on main. Likewise, `git diff ffdff5d29 b04f84f1e` is empty over `api/src/platform/{observability,web-address,identity}` and the three check files. The batches merged later did not touch these paths. P-339 still asks for a run on main's head, and none exists. That does not change any verdict here, because P-780 (1) already holds all three rows.
- Weak evidence: `synth-main-b04f84f1e.txt` (28 bytes) holds only the npm header, with no exit code or output. The synth is proven only indirectly, by the cdk tests (93/93).

## R1.13 Logs, metrics, error reports, alerts: **Partial**
(a) Parts: all merged. PF-23 (#1759), PF-23r (#1812), PF-23w (#1800), PF-23m (03fd593ee..e577d5f88) and PF-23c (#2743). This row may now be scored (P-606).
(b) Clauses met:
- One logger, structured lines, no personal data: check_pf23_observability 100/100 and check_pf23m_log_calls 15/15, run locally on main.
- Logs kept 90 days in Canada, as code: `observability.ts:67-71` (`/xr/<stage>/app`, THREE_MONTHS), with the region pinned by estate.ts. Test "PF-23c retention pass/fail".
- The alarms the row names exist, and their filters read PF-23's fields: `observability.ts:30-54,112-118`. Tests "alarms pass/fail" and "contract with the app".
- The on-call address is a parameter with no default: `observability.ts:73-80`.
(c) Not met or not provable:
- **No log reaches the cloud log group.** In both task definitions the container has no `logging` setting (`service.ts:107-118,124-129`; grep finds no `logging`, `LogDriver` or `awsLogs` under `deploy/cdk/lib`). Once deployed, nothing ships the app's output to `/xr/<stage>/app`, so every metric filter and alarm reads an empty group. "An error reaches the alarm" therefore fails in the cloud by construction.
  - `observability.ts:4-5`, `estate.ts:27` and `README.md:50` all say the task logs there. That is false.
  - The reviewer saw this as Minor u1 (`screens/PF-8b/review.md:250-253`). No row or bug owns it (not found in BACKLOG, BUGS or STATE).
- "An alarm reaches a person" and "a test alarm fires to the on-call address" (PF-23c's own Done when) can only be proven in the founder's account (P-780 (1)). That proof has not run.
- The packs have no green run on main's head on GitHub (P-339).
(d) Verdict: **Partial**. P-780 (1) alone holds this row. The finding below keeps it Partial (P-305) even after the AWS proof.
- New bug: **Gap · Major, deploy lane** (PF-8b follow-up or PF-8c, before any deploy). Wire `logging: awsLogs({ logGroup: observability.appLogs })` on both containers. Admit `logs:CreateLogStream` and `logs:PutLogEvents` on that group only in `ECS_EXEC_ACTIONS`. Add a fail test for a container with no log setting.
- Why Major and not the reviewer's Minor: this is the only path by which the capability's cloud clause can work.

## R1.24 Each firm's own web address: **Partial (not scored: a part is missing)**
(a) Parts: PF-25 (#1763) and PF-8b's wildcard zone and certificate (#2748) are merged. **PF-25w is not merged** (not built; it waits on PF-4s, which is not built either). `web-address/routes.ts:4` says "no route yet". Under P-606 this row gets no verdict.
(b) Met as code:
- The wildcard certificate `*.<domain>` and the wildcard A record go to the load balancer, HTTPS only: `service.ts:162-172`. Tests "wildcard certificate covers…", "HTTPS only…", "a certificate for the apex only… is caught", "the domain is a parameter".
- A taken, reserved or malformed address is refused in words, and another firm's address never shows this firm's data: check_pf25 68/68, run locally.
(c) Not met or not provable:
- "Opens that firm's public pages": only `/api/public/site` is registered for a firm's address (`host.ts:22`). No module calls `registerPublicPath` (grep finds none outside host.ts), so no page opens on a firm address. The booking pages (FO-3w) still answer on `/book/<firmKey>`.
- **Staging firm addresses can never resolve.**
  - PF-8b serves staging at `*.staging.<domain>` (`service.ts:45`).
  - The app knows only the suffixes `expatready.com` and `localhost`, hard-coded in `rules.ts:16`. So `maple.staging.expatready.com` reads as the label `maple.staging`, which is "none" (`rules.ts:108-111`), and every firm address on staging is the plain 404.
  - The CDK's `xr:domain` parameter is also never passed to the app: the task's environment has no domain setting (`service.ts:110-116`).
  - STATE (4c) plans the AWS proof on staging (Phase 1), so R1.24's proof would fail there.
- `staging` is not reserved (`rules.ts:11`). That was break m5's follow-up (`screens/PF-8b/dns-move.md:9`) and no row owns it.
- DNS, certificate validation and delegation can only be proven in the account (P-780 (1)).
(d) Verdict: **Partial, not scored** (PF-25w is missing, and P-780 (1) applies). New bugs:
- **Gap · Major, runtime lane (PF-25)** with deploy: the app must take its address suffix from a setting that the task definition sets per stage, or staging must use a one-label scheme. Add a fail test for `<firm>.staging.<domain>`.
- **Gap · Minor, runtime lane (PF-25)**: reserve `staging`.

## R1.5 Staff sign-in, cloud lines only: **Partial (cloud lines Not proven; one cannot pass as built)**
(a) Parts: PF-4 and PF-4b are merged, and PF-8b's pools are merged. **PF-4s is not built** (MVP row 5 lists it as a part). Strictly, P-606 holds the whole row, whatever qa's on-prem score says. The own-staff pool exists as a construct only.
(b) Met as code:
- Three separate pools, admin-created only: `service.ts:84-102`.
- Both staff pools have `mfa: REQUIRED` with an authenticator app (`service.ts:91-92`). Tests "three separate Cognito pools, staff pools with required two-step" and "a staff pool without two-step… caught".
- The service signs in against the staff pool, with the settings the loader reads (`settings.ts:34-35`).
- Wrong code, expired code and lock-out after repeated tries are Cognito's own behaviour on that pool. They are not provable without the account.
(c) Not met or not provable:
- **"A passkey signs in on the real pool" cannot pass as built.** Neither the pool nor its client has any passkey setting: no WebAuthn first factor, no relying-party id, no feature plan. The client allows `userSrp` only (`service.ts:91`; qa corrected the line number from :101 after review), with no choice-based (USER_AUTH) flow. PF-4b's row asks for passkeys as a replacement for password plus second step.
- The guards refuse every Cognito trigger (`README.md:81`), and the task role has no Cognito admin rights (`README.md:82`). PF-4b's custom email sender, and invitation acceptance on the real pool, will need both.
- QA-623 (two-step rests on `PLATFORM_POOL_MFA_REQUIRED`) is unchanged. The task does not set it, so it defaults to true.
(d) Verdict: the cloud lines are **Not proven** (P-780 (1)) and the row stays **Partial**. New bug: **Gap · Major, deploy lane with runtime (PF-4b)**: configure passkeys on the staff pools and client, with a pass and a fail test, before the AWS proof. Otherwise that proof fails on the passkey clause. The trigger and admin-rights point is Minor, for the same row.

## Summary
| Row | Parts merged | Verdict | New findings |
|---|---|---|---|
| R1.13 | all | Partial (P-780 (1); P-339) | Major: no log shipping to the 90-day group (deploy) |
| R1.24 | no: PF-25w | Partial, not scored | Major: staging suffix unresolvable (runtime and deploy); Minor: reserve `staging` |
| R1.5 cloud | no: PF-4s | Partial; cloud lines Not proven | Major: no passkey setting on the pools (deploy and PF-4b); Minor: trigger and admin rights |
