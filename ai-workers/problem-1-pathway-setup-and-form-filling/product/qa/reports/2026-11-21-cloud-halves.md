# qa: cloud halves R1.13, R1.24, R1.5, after #2743 (PF-23c) and #2748 (PF-8b), 21 Nov (ready qa lane, cloud)

Main: **b04f84f1e** (#2748 merged 09:50Z). Opus 5.5 medium; live AI off; US$0; isolated copies :4477-:4478 only; :4400 not touched.
Fresh Opus reader (ran nothing, P-303): `2026-11-21-cloud-halves/reader-verdict.md`. qa checked each of its Majors in the code.

## Verdicts
| Row | Verdict | Why |
|---|---|---|
| R1.13 | **Partial** (all parts merged: PF-23, 23r, 23w, 23m, 23c) | Met as code: one logger with no personal data, a log group kept 90 days in Canada, the named alarms, and the on-call address as a parameter. Held by **QA-641** (Major: the app's output never reaches the log group), by P-780 (1) (no AWS proof yet) and by P-339 (no pack run on main's head on GitHub; deploy-synth runs only on PRs, QA-645). |
| R1.24 | **Partial, parts missing: PF-25w** (no verdict, P-606) | Wildcard certificate, wildcard record and HTTPS only are met as synth. Found ahead of the proof: **QA-642** (Major: staging addresses never resolve to a firm) and QA-644 (Minor). |
| R1.5 (cloud lines) | **Not proven; the row stays Partial**, as scored on the on-prem half today (#2762) | Three separate pools, with two-step required on both staff pools (`service.ts:84-102`). Wrong code, expired code and lock-out on the real pool need the AWS account (P-780 (1)). **QA-643** (Major): the pool has no passkey setting. PF-4s, a listed part, is not built either. |

## Evidence
| Check (main b04f84f1e) | Result |
|---|---|
| cdk `npm run synth` | exit 0 (the saved output holds only npm's header; the exit code is from the shell) |
| cdk `npm test` | 93/93 twice (`test-main-b04f84f1e-{a,b}.txt`) |
| deploy-synth on GitHub | last green run **44887503333** on #2748's head 94605d526. The reader checked that its cdk tree is identical to main's. It never runs on main or in the merge queue (QA-645). |
| merge batch with #2748: ci **44888552668** (head ffdff5d29) | success, 31 jobs. App and check paths for these packs are identical to main's (reader). Main's head tree differs because other batches merged after it. |
| `check_pf23_observability.ts` (isolated :4478) | 100/100 |
| `check_pf23m_log_calls.ts` | 15/15 |
| `check_pf23w_jobs_wired.ts` | 31/31 |
| `check_pf25_web_address.ts` | 68/68 |

## Bugs (new; numbers self-assigned, above the open PRs' range)
* **QA-641** Gap · Major · R1.13 · deploy: neither task definition has a log setting (`deploy/cdk/lib/service.ts:99-121`, no `logging:`). Nothing sends the app's output to `/xr/<stage>/app`, so every metric filter and alarm reads an empty group. The README, `estate.ts:27` and `observability.ts:4` all say the wiring exists. The PF-8b reviewer saw it as Minor u1 (`screens/PF-8b/review.md:250`). It is Major because it is the only route for "an error reaches the alarm".
* **QA-642** Gap · Major · R1.24 · runtime with deploy: the app's address suffixes are hard-coded to `expatready.com` and `localhost` (`api/src/platform/web-address/rules.ts:16`). Staging serves `*.staging.<domain>`, so `maple.staging.expatready.com` is two labels deep and always the plain 404 (`rules.ts:88-111`). The CDK's domain setting never reaches the app. The staging AWS proof would fail on this.
* **QA-643** Gap · Major · R1.5 · deploy with PF-4b: neither the pool nor its client has a passkey (WebAuthn) setting, and the client allows only `userSrp` (`service.ts:91`). "A passkey signs in on the real pool" cannot pass as built.
* **QA-644** Gap · Minor · R1.24 · runtime: `staging` is not in `RESERVED_ADDRESSES` (`rules.ts:11`). That is the breaker's follow-up m5, which no row owns.
* **QA-645** Gap · Minor · process (tech lead): `deploy-synth.yml` runs only on `pull_request`; no push to main and no merge_group. No cloud line can ever have a run on main's head (P-339), and a combination of merges can break the synth unseen.
* 0 Blocker · 0 Critical · 3 Major · 2 Minor.

## Not tested
The real AWS account (P-551, P-780). No walk: these lines have no screen (P-616). Not raised as a bug, for PF-4b to note: the guards refuse every Cognito trigger and the task role has no Cognito admin rights (README:81-82), and PF-4b's email sender and invitation acceptance will need both.

## Questions for the Lead
1. QA-641, QA-642, QA-643: one follow-up row on the deploy lane (log driver; domain suffix passed to the app; passkeys on the pool, or a ruling that passkeys are PF-4b's)? Each keeps its row Partial even after the AWS proof (P-305).
2. QA-645: add `push: branches: [main]` to deploy-synth, so cloud lines can meet P-339?
