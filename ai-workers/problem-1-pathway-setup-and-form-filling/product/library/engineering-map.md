# Engineering map: how a strong SaaS team ships, and where Expat Ready stands

Living master (library, `cockpit/library.json`), version 1.0, 20 Nov 2026, Lead 100. The founder asked for it on 20 Nov 12:0x IST: "This should be one live document, put in the library ... so that we don't never lose sight of it, my side or your side."

Visual page: https://claude.ai/artifact/KaDK6QQfhhseTGP5q6sKsu. Decisions: P-750 (staging at Proven 30), P-755 (scale).

**How it stays live:**
- Every "Missing" and "Later" row is an item in the one action list, `design/full-power-plan-2026-11-17.md` §1d, items #225-#237. `plan-watch.py` fails if an item disappears (P-690).
- `library-freshness.py` marks this page behind when its feeds change, and lead-watch prints it.

**Scale (P-755):** 50 firms at launch, 100 at most, 1-10 staff each, so about 1,000 staff users plus their clients. That means one AWS region in Canada, one managed PostgreSQL with automatic backups, the app in a managed container service, and two environments (staging, production). Kubernetes, several regions, microservices and a dedicated operations team are out of scope.

**RC = Release Candidate:** a version frozen for final testing before release. If testing finds nothing serious it becomes v1.0; otherwise it is fixed and RC2 is cut.

Status words: **Have** · **Partly** · **Missing** (needed soon) · **Later** · **More than needed**.

## Stage 1 · Write and review the code
| Practice | What it is | Expat Ready today | Status | Plan item |
|---|---|---|---|---|
| Pull requests and code review | Every change reviewed by someone who did not write it | Independent Opus reviewer on every PR; Lead read for money, schema and CI | Have | - |
| Merge queue | Changes tested together before main | Mergify batches, 6 at once | Have | - |
| Process guards | Checks that the team follows its rules | 28 guards plus records checks; review of value under way, none dropped without evidence | More than needed (review) | #237 |

## Stage 2 · Test automatically
| Practice | What it is | Expat Ready today | Status | Plan item |
|---|---|---|---|---|
| Unit, API and browser tests | Tests that click through the app like a person | Hundreds of suites, all run on every merge | Have | - |
| Run only affected tests | A PR runs only the tests it touches; the merge runs all | Every PR runs all (~50,000 CI min a day); B203 building | Partly | B203 |
| Flaky-test quarantine | A broken test held aside so it blocks no one | QUARANTINE list in run-suites.sh (P-754 used it 20 Nov) | Have | - |
| Human-like QA | Walked as a user before it counts | qa lanes prove each R1 item | Have | - |

## Stage 3 · Places to run it
| Practice | What it is | Expat Ready today | Status | Plan item |
|---|---|---|---|---|
| Staging | Internet copy of production for safe trials | Mac demo at :4400 only | Missing | #226 |
| Production on AWS (Canada) | The real site firms use | Not set up | Missing | #227 |
| Infrastructure as code | Servers described in files, rebuilt the same way | None | Missing | #226, #227 |

## Stage 4 · Release to customers
| Practice | What it is | Expat Ready today | Status | Plan item |
|---|---|---|---|---|
| Release candidate and versions | Freeze RC1, test, tag v1.0, release notes | Main always green; no tags | Missing | #231, #232 |
| Automatic deploy (CD) | Merge deploys to staging; production on a click | Only the Mac demo updates itself | Missing | #228 |
| Feature flags | One firm first, then all | In requirements (SA-12) | Later | #234 |
| Migrations with rollback | Every schema change can be undone | Each migration ships rollback.sql, Lead-read | Have | - |

## Stage 5 · Run it safely
| Practice | What it is | Expat Ready today | Status | Plan item |
|---|---|---|---|---|
| Error and uptime monitoring | Hear about errors before a firm calls | None; personal-data-in-logs check exists | Missing | #229 |
| Backups and restore test | Nightly backups, a restore actually tried | Not yet | Missing | #230 |
| Dependency security | Known library holes patched | 29 alerts (9 high) on main; CodeQL runs | Partly | #225 |
| Privacy and compliance | Canadian privacy law, consent, residency; SOC 2 when asked | Rules in code; legal points Unconfirmed: no counsel | Partly | #233 |
| On-call and incidents | Who answers, how outages are reviewed | Not needed before firms are live | Later | #235 |
| Product analytics | Which screens firms use | After first firms | Later | #236 |

## Order, without over-engineering
1. Now: B203 (affected tests only), #225 (security alerts), #237 (guard review). Add no new process guards.
2. At Proven 30: #226-#230 as one package (staging, production, deploy, monitoring, backups).
3. Week before 29 Nov: #231-#232 (RC1, qa walk on staging, v1.0).
4. Before the first firm's data: #233.
5. After the first firms: #234-#236.

Sources: this repository's records and GitHub data, read 20 Nov 2026. CI minutes are from GitHub billing; alerts are from GitHub's push notice. Industry practice is general guidance for B2B SaaS, not legal advice.
