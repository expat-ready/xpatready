# Speed evidence review, 19 Nov 2026 (for decision P-732)

Three independent reads ordered by Lead 90 at the founder's word (12:1x IST: research first, proven methodology, no memory). Each report is kept as returned. Sources and dates are in each report; anything a report marks unverified stays unverified. Lead 90's verdict is in DECISIONS P-732 and STATE.


## A. Published methodology (the read briefed to refute the proposal)

**Verdict of the refutation attempt:** the evidence does not refute (0), (2) or (4) and partly supports (3). It does refute the 3,000-line half of (1). Every quote below was opened this session unless marked otherwise.

## Findings

**a. PR size.**
- **Against 3,000 lines:** Google's guidance says "100 lines is usually a reasonable size for a CL, and 1000 lines is usually too large" [S1]. SmartBear/Cisco says review "no more than 200 to 400 lines" at a time [S2]. Microsoft found review usefulness drops with size, "only starts to be noticeable for reviews with 20 or more changed files" [S3].
- **For "one capability, one PR with its test":** Google says "The CL should include related test code" and recommends "smaller, full-stack, vertical features" [S1]. DORA defines the batch by time, not lines: "longer than a week to complete and check is too big" [S4]. So a capability built in hours is a small batch by DORA, but not by the review studies.
- **Limit of the support:** Google also says a CL is "usually just one part of a feature, rather than a whole feature at once" [S1].
- **AI-specific:**
  - DORA: "large changes are difficult to review, test, and integrate safely" [S4]; small batches are "especially powerful in an AI-assisted environment" [S5].
  - Faros 2025 (vendor telemetry, 10,000+ developers): "154% increase in average PR size", "PR review time increases 91%" [S6]. Faros 2026: "+28% Bugs per PR" [S7].
  - MSR 2026 on agent PRs: "Not-merged PRs tend to involve larger code changes, touch more files" [S8].
- None of these studies tested an AI reviewer's size limit.

**b. Merge queues.**
- **Mergify's bands:** failure rate over 5% means "small batches (2 to 3 PRs), and prioritize fixing your flaky tests first"; and "if bisection happens more than once a day, your batch size is too large" [S9].
- **Stacking:** "The batches tested on top of the failed one are cancelled" [S10]. That is the three-hour stall you measured.
- **Other vendors:** Trunk says "Watch batch failure rate (should be <10%)" [S11]. Shopify queues a PR only "if Branch CI has passed" [S12].
- **Against (0) as designed:** Mergify's two-step pattern puts fast checks on the PR and exhaustive ones in the queue [S13]. Google presubmit is "only fast, reliable ones" [S14]. Neither recommends a one-hour gate twice.
- **Uber:** optimistic execution "suffers from high failure rates"; they build only changes that share build targets together [S15].

**c. Test selection.**
- **Meta:** selection ran "fewer than a third" of dependency-selected tests and missed "< 0.1% of faulty changes". The safeguard: "Once every few hours, all tests are exercised" on master [S16].
- **Google TAP:** of 5.5 million affected tests "only 63K ever failed"; targets more than 10 dependency edges away "hardly ever break" [S17].
- **Microsoft:** "falls back to running all tests" on files it cannot map, and a periodic full run "is recommended" [S18].
- **Tools:** Turborepo treats all packages as changed if the checkout is too shallow [S19]. Nx warns a shared-input change "selects most tasks" [S20].
- **Against:** every source pairs selection with a full run every few hours, not nightly. Mid-air collisions happen "most days" at Google's scale [S14].

**d. Verification after merge.**
- **For (2):** DORA says "Manual tests and inspections are not reliable" and wants developers as "Primary authors and maintainers of acceptance tests" [S21]. It found "no evidence" that formal external review lowers change fail rate [S22].
- **Against dropping the human entirely:** "Testers also play an essential role performing exploratory testing" [S21]. High-risk changes should be flagged "so that they can be subjected to additional scrutiny", approved "by someone other than the author" [S22].
- **Supports (3) in principle.** DORA does not name money, permissions or schema; those classes are your choice.
- **"Green twice":** I found no source for it, and none for sampling replacing per-item QA.

**e. WIP.**
- DORA: "WIP limits help drive improvements in software delivery performance", mainly with visual management; "The point of WIP limits is to expose problems" [S23].
- One peer-reviewed study (ESEM 2018, 8,000 items, five teams) links lower WIP to shorter lead time. I saw it in a search result only.
- So 52 half-built against 11 finished is a WIP problem by DORA's reading. Fewer PRs per capability lowers WIP directly.

**f. Bigger levers.**
- **Suite duration:** DORA's limit is "about 10 minutes" [S24]; yours is about an hour. Playwright supports `--shard` [S25].
- **Broken main:** fixing it "should take priority over any other work"; otherwise the change is "identified and reverted" [S24].
- **Control systems:** DORA 2025 says without "strong automated testing… an increase in change volume leads to instability" [S26].

## Table

| Element | Verdict | Strongest for | Strongest against | Works when |
|---|---|---|---|---|
| (0) Full run on PR head before queue | Supported, with a cost | Shopify "Branch CI has passed" [S12]; Mergify >5% band [S9] | Mergify two-step [S13]; Google "only fast, reliable" [S14] | The suite is cut well below an hour, or the queue then runs less |
| (1a) One capability = one PR with its journey test | Mixed, leaning supported | Google vertical slices, tests in the same CL [S1]; DORA time-based batch [S4] | Google "one part of a feature" [S1] | The capability is finished in a day or two and can be reverted alone |
| (1b) Cap raised to 3,000 lines | Contradicted | None found | Google 1,000 [S1]; SmartBear 200–400 [S2]; DORA and Faros on AI [S4][S6][S7] | Only if the review is split into units of about 400 lines or 20 files, or generated files and tests are excluded from the count |
| (2) Automatic proof, QA audits risk and a sample | Mixed | DORA test automation [S21]; change approval [S22] | Exploratory testers "essential" [S21]; no evidence for "twice" | Journey tests are deterministic; QA moves to exploration |
| (3) Heavy gates only on risky paths | Supported in principle | DORA "additional scrutiny" for flagged high-risk changes [S22] | AI review slowed PR closure from 5 h 52 min to 8 h 20 min, so even the light gate has a cost [S27] | Risk flagging is automatic by path, with a non-author approver |
| (4) Affected-only tests, full run nightly | Supported; nightly is too rare | Meta [S16]; Google [S17] | Full run "every few hours" [S16]; fallbacks [S18][S19] | Unmapped or shared files trigger the full run; full run on main every few hours; breakages reverted at once |

## What the evidence would do first

1. Make the suite fast (shard, parallelise) and treat a red main as stop-the-line with automatic revert [S24][S14].
2. Cut batch size to 1–3 and reduce stacking until the batch failure rate is under 5% [S9][S10].
3. Turn on affected-only testing with fail-safe fallbacks and a full run on main every few hours [S16][S18]. Mergify scopes also split the queue into independent lanes [S28].
4. Move to one vertical PR per capability with its journey test, but keep each review unit near 400 lines. Do not adopt a flat 3,000 [S1][S2][S3].
5. Limit capabilities in progress, and move QA from walking every item to exploration plus risk-flagged items [S23][S21][S22].

## What I could not verify

- **Failure-rate threshold:** no peer-reviewed figure. The 5% and 10% numbers are vendor guidance [S9][S11].
- **"Green twice" and sampled QA:** no primary source found. Only secondary pages on SOC 2 audit sampling, not opened.
- **Google review paper figures** (median 24 lines, 90% under 10 files): the PDF returned 403; seen in search summaries only.
- **WIP study (ESEM 2018):** source pages blocked; search result only.
- **Not opened:** DORA 2025 full report PDF (I used DORA's site and Google Cloud posts), Uber's original paper (too large; I used a summary [S15]), Bazel docs, GitHub's current merge queue page (404; an Enterprise Server 3.19 copy confirms failing PRs are removed and groups rebuilt).
- **AI reviewers and PR size:** no study found on how an AI reviewer's defect detection changes with size.
- **Theory of Constraints:** no primary source opened.
- **Faros figures** are vendor telemetry, not peer-reviewed.

## Sources

- S1 Google, "Small CLs" (undated): https://google.github.io/eng-practices/review/developer/small-cls.html
- S2 SmartBear, peer code review best practices (undated; Cisco study): https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/
- S3 "Characteristics of Useful Code Reviews", MSR 2015: https://www.microsoft.com/en-us/research/wp-content/uploads/2015/05/PID3556473.pdf
- S4 DORA, Working in small batches (updated 8 Dec 2025): https://dora.dev/capabilities/working-in-small-batches/
- S5 Google Cloud, DORA AI Capabilities Model (24 Sep 2025): https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model
- S6 Faros, AI Productivity Paradox (23 Jul 2025): https://www.faros.ai/blog/ai-productivity-paradox-report-2025
- S7 Faros, Acceleration Whiplash (Q2 2026): https://www.faros.ai/research/ai-acceleration-whiplash
- S8 "Where Do AI Coding Agents Fail?", MSR 2026 (21 Jan 2026): https://arxiv.org/abs/2601.15195
- S9 Mergify, batching guide (undated): https://mergify.com/learn/merge-queue/batching
- S10 Mergify docs, batches: https://docs.mergify.com/merge-queue/batches.md
- S11 Trunk docs, batching (undated): https://docs.trunk.io/merge-queue/optimizations/batching
- S12 Shopify (14 Nov 2019): https://shopify.engineering/successfully-merging-work-1000-developers
- S13 Mergify docs, two-step CI: https://docs.mergify.com/merge-queue/two-step
- S14 Software Engineering at Google, ch. 23 (year not shown on page): https://abseil.io/resources/swe-book/html/ch23.html
- S15 Summary of Uber, "Keeping master green at scale", EuroSys 2019 (18 Apr 2019): https://blog.acolyer.org/2019/04/18/keeping-master-green-at-scale/ ; follow-up (7 Jan 2025, CI resources down about 53%): https://arxiv.org/abs/2501.03440
- S16 "Predictive Test Selection", ICSE-SEIP 2019: https://arxiv.org/pdf/1810.05286 ; blog (21 Nov 2018): https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/
- S17 "Taming Google-Scale Continuous Testing", ICSE-SEIP 2017: https://web.eecs.umich.edu/~xwangsd/courses/w23/readings/googletest.pdf
- S18 Microsoft, Test Impact Analysis (updated 7 May 2026): https://learn.microsoft.com/en-us/azure/devops/pipelines/test/test-impact-analysis
- S19 Turborepo, `--affected`: https://turborepo.dev/docs/reference/run
- S20 Nx, affected: https://nx.dev/docs/features/ci-features/affected
- S21 DORA, Test automation (updated 17 Jul 2025): https://dora.dev/capabilities/test-automation/
- S22 DORA, Streamlining change approval (updated 30 Oct 2025): https://dora.dev/capabilities/streamlining-change-approval/
- S23 DORA, WIP limits (undated): https://dora.dev/capabilities/wip-limits/
- S24 DORA, Continuous integration (undated): https://dora.dev/capabilities/continuous-integration/
- S25 Playwright CLI: https://playwright.dev/docs/test-cli
- S26 Google Cloud, 2025 DORA report (24 Sep 2025; AI still has "a negative relationship with software delivery stability"): https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report ; 2024 report (23 Oct 2024; stability down an estimated 7.2%): https://cloud.google.com/blog/products/devops-sre/announcing-the-2024-dora-report
- S27 "Automated Code Review In Practice", ICSE-SEIP 2025 (24 Dec 2024): https://arxiv.org/abs/2412.18531
- S28 Mergify docs, scopes: https://docs.mergify.com/merge-queue/scopes
- Also opened: Mergify performance docs (https://docs.mergify.com/merge-queue/performance), DORA trunk-based development (https://dora.dev/capabilities/trunk-based-development/), GitHub Enterprise Server 3.19 merge queue docs.


## B. How agent-heavy teams ship, and what "shipped" meant

## Agent-heavy delivery: what is published (research of 19 Nov 2026)

Every row below was opened this session unless marked unverified. Throughput figures are self-reported by the builders; only AIDev, METR and Faros are independent measurements.

### 1. Published set-ups

| Who, date | Unit of work | Review | Tests before merge | Merge | "Done" means | Reported throughput | Reported failures |
|---|---|---|---|---|---|---|---|
| OpenAI "Harness engineering", 11 Feb 2026 (S1, mirror copy) | Short-lived PR | Agent-to-agent; "Humans may review pull requests, but aren't required to" | CI, custom linters, structural tests | "minimal blocking merge gates"; flakes re-run | Merged PR in an internal beta | ~1,500 PRs in 5 months; "3.5 PRs per engineer per day" | Fridays (20% of week) lost to "AI slop"; "should not be assumed to generalize" |
| StrongDM Software Factory, 6 Feb 2026 (S2, S3) | Spec plus scenarios | None: "Code must not be reviewed by humans" | Holdout end-to-end scenarios against cloned third-party services | Not described | Probabilistic "satisfaction" share of scenarios | "thousands of scenarios per hour"; no feature or PR rate | "Tests can be reward hacked"; US$1,000 of tokens per engineer per day |
| Stripe Minions, 9 Feb 2026 (S4) | One-shot task, Slack message to PR | Human on every PR | Local lints on push, selective CI, "at most two, CI runs" | Normal human-approved merge | PR that passes CI and is "ready for human review" | "Over a thousand pull requests merged each week" | After a second failed CI push the run stops; partial results handed to a person |
| Anthropic C compiler, 5 Feb 2026 (S5) | Task claimed by lock file | None described | Test suites; GCC as known-good oracle; 1-10% sample by default | Each agent pulls, merges, pushes; "I don't use an orchestration agent" | Tests pass; compiles Linux 6.9 | 16 agents, ~2,000 sessions, 100,000 lines, US$20,000 | "New features and bugfixes frequently broke existing functionality"; not production grade |
| Cursor long-running agents, 14 Jan 2026 (S6) | Planner-made task | Judge agent per cycle | Not stated | Hundreds of workers push to one branch | Not defined | 1M+ lines; projects of 7.4K-14.6K commits | Locks cut 20 agents to throughput of "two or three"; integrator role "created more bottlenecks than it solved"; drift |
| the practitioner (yegge.ai), Wyvern game, about Aug 2026 (S7, S8) | Commit | Agents | ~30-minute build gate | Queue reached 166; at 100 he lands a 120-150 commit megabatch | Commit on main, which can be red | ~175 commits a day, up to 250 | Queue overrun; earlier system "effectively burned down"; ~US$87k a month at list price |
| Anthropic internal, 9 Mar and 14 Aug 2026 (S9, S10) | PR | AI review on nearly every PR, then human: "that's still a human call" | Not stated | Human approval | Merged PR | Output per engineer "grown 200%"; maintenance agents 180 of 388 PRs merged (46%) | 84% of PRs over 1,000 lines get findings against 31% under 50 lines |
| Cognition Devin, 14 Nov 2025 (S11) | Junior task of 4-8 hours | Human | Verifiable outcome | Human merge | Merged PR | "67% of its PRs are now merged" | Poor on ambiguous work and mid-task changes; "Human review is still necessary" |

### 2. Five recurring practices

1. **A fast check the agent runs itself before CI.** Stripe caps CI at two runs after local fixes (S4). The compiler harness samples 1-10% of tests because Claude "will happily spend hours running tests" (S5). Claude Code docs: without a check, "'looks done' is all it has to go on" (S12). Safe for money code: yes, but no source treats it as sufficient alone.
2. **Small, fully scoped, one-shot units.** Stripe one-shots (S4), Devin wants "clear, upfront requirements" (S11), and Anthropic's review data shows small PRs draw far fewer findings (S9). Safe: yes.
3. **AI review first, human approval kept.** Stripe, Anthropic, Devin and Claude Code docs ("have a person approve the result at the end", S12) all keep a person. Only OpenAI (internal beta) and StrongDM drop it. StrongDM does build permission software, but publishes no defect data, and its reviewer asks how this could "possibly be a sensible strategy" (S3). Not shown safe for money or permissions code.
4. **Light gates and fix-forward.** OpenAI: "corrections are cheap, and waiting is expensive" (S1). the practitioner (yegge.ai) lets main go red (S7). OpenAI itself warns against generalising; the practitioner's product is a game, and a critic notes a green main is not a good one (S8). No source supports this for money, permissions or compliance code.
5. **Thin orchestration and short instruction files.** Anthropic used no orchestrator (S5), Cursor removed its integrator (S6), OpenAI keeps `AGENTS.md` to "roughly 100 lines" as a map (S1). Records are still kept: compiler agents maintain progress files (S5). Safety: the sources do not address it.

### 3. Three biggest differences from the team described

1. **Verification time per unit (confidence: medium).** The team pays a ~1 hour batch suite, a separate journey PR and 3-5 hours of QA per capability. The fast set-ups cap verification at minutes or two CI runs (S4, S5) or run "thousands of scenarios per hour" (S2). the practitioner's 30-minute gate alone produced a 166-deep queue (S7). Ranking is my inference from these figures; no source measures this causally.
2. **Definition of done (confidence: medium-high).** Published rates count merged PRs or commits, not capabilities proven end to end. At 3-6 PRs per capability, 1-3 capabilities a day is roughly 3-18 PRs a day, which already matches or exceeds OpenAI's 3.5 per engineer. The gap is partly a counting difference.
3. **Orchestration and records overhead (confidence: low).** A standing lead agent and four record pages contrast with S5 and S6, but OpenAI and Anthropic also keep in-repo records, and nobody published the cost.

### 4. Looser definitions of done

- OpenAI counts merged PRs in an "internal beta" with optional review (S1).
- Stripe's "done" is a PR ready for human review (S4).
- Cursor reports lines and commits (S6); the practitioner (yegge.ai) reports commits with main sometimes red (S7).
- The an investor's claim is "600,000+ lines" in 60 days, with "shipped" undefined (S13).
- Independent data cuts against "tests pass means done": METR found "roughly half of test-passing" agent PRs would not be merged by maintainers (S14). On GitHub, Codex PRs were accepted at 65.3% and Claude Code at 52.5%, against 76.8% for humans (S15). Faros found 98% more PRs merged but "no significant correlation" with company-level delivery, and 9% more bugs per developer (S16).
- I found no published set-up reporting features per day proven end to end on main in a multi-tenant, client-money or compliance product.

### 5. Not verified

- OpenAI's own page returned 403; S1 quotes come from a third-party copy.
- DORA 2025 instability and small-batch findings: the PDF was too large to open. Only Google's summary was read ("linked to higher software delivery throughput", S17).
- a Claude Code lead's 20-30 PRs a day and 259 PRs in 30 days: search snippets only.
- CodeRabbit's "1.7x more issues": search snippet only, and from a vendor.
- Factory, Sourcegraph Amp, Replit and Claude Code GitHub Actions docs: not opened.
- Ramp's ~30% of merged PRs (S18) carries no date. the practitioner's essay date is inferred from S8.
- No source publishes defect, revert or incident rates for a no-human-review pipeline.

### Sources

- S1 OpenAI, "Harness engineering", 11 Feb 2026: https://openai.com/index/harness-engineering/ (403); copy read at https://gitcode.csdn.net/69ef655d0a2f6a37c5a6667a.html
- S2 StrongDM, 6 Feb 2026: https://factory.strongdm.ai/
- S3 an independent reviewer (simonwillison.net), 7 Feb 2026: https://simonwillison.net/2026/Feb/7/software-factory/
- S4 Stripe, 9 Feb 2026: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents
- S5 Anthropic, 5 Feb 2026: https://www.anthropic.com/engineering/building-c-compiler
- S6 Cursor, 14 Jan 2026: https://cursor.com/blog/scaling-agents
- S7 a practitioner (yegge.ai essay), date not shown: https://yegge.ai/essays/the-shape-of-things-to-come/
- S8 a Mergify engineer's blog, 18 Aug 2026: https://julien.danjou.info/blog/steve-yegge-deleted-the-wrong-thing
- S9 Anthropic, Code Review, 9 Mar 2026: https://claude.com/blog/code-review
- S10 The Decoder, 14 Aug 2026: https://the-decoder.com/claude-code-now-runs-daily-maintenance-on-anthropics-software-with-a-46-percent-merge-rate/
- S11 Cognition, 14 Nov 2025: https://cognition.com/blog/devin-annual-performance-review-2025
- S12 Claude Code best practices, undated: https://code.claude.com/docs/en/best-practices
- S13 AI Builder Club, 8 Apr 2026: https://www.aibuilderclub.com/blog/garry-tan-ai-coding-workflow
- S14 METR, 10 Mar 2026: https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/
- S15 AIDev, 20 Jul 2025: https://arxiv.org/html/2507.15003v1
- S16 Faros AI, 23 Jul 2025: https://www.faros.ai/blog/ai-productivity-paradox-report-2025
- S17 Google on DORA 2025, 23 Sep 2025: https://blog.google/technology/developers/dora-report-2025/
- S18 Ramp, undated: https://builders.ramp.com/post/why-we-built-our-background-agent
- Also opened: Anthropic teams post, 24 Jul 2025 (https://claude.com/blog/how-anthropic-teams-use-claude-code); martinfowler.com, 2 Apr 2026 (https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html); InfoQ, 21 Feb 2026 (https://www.infoq.com/news/2026/02/openai-harness-engineering-codex)


## C. Our own measured chain, 16-19 Nov 2026

**Bottom line:** 10 Proven a day is not reachable under (b). It is not reliably reachable under (c) or (d) either unless builder output rises about 1.5 times, to roughly 28–30 parallel lanes (estimate), and review rounds do not grow with PR size. Today the main limit is builder output and how thinly it is spread across items. The test run is not the limit, and outside 19 Nov the queue is not either. Nothing in the repo was changed; scratch files are in $TMPDIR/measure/.

The window is 16 Nov 00:00 IST to 19 Nov about 12:15 IST (3.53 days). 19 Nov is a part day. All times IST.

**1. App-code PRs merged** (studio files; qa, records, tooling, ci, tests, demo and cleanup PRs left out)

n=73 for 16–19 Nov (22 / 29 / 8 / 14 by day); n=14 for 19 Nov.

| Measure | median / p75 / p90, 16–19 Nov | 19 Nov |
|---|---|---|
| Opened → first "Reviewer: Approve" | 0.58 / 0.91 / 2.4 h | 0.59 / 1.8 / 4.6 h |
| Approve → `review: approved` label | 1.7 / 4.7 / 10.3 h | 0.1 / 2.2 / 20.9 h |
| Label → merge | 3.9 / 7.8 / 13.9 h | 6.5 / 10.6 / 12.8 h |
| Total | 7.9 / 16.0 / 32.4 h | 8.7 / 14.0 / 38.8 h |
| Approve comments (review rounds) | 2 / 3 / 5 | 2 / 3.75 / 5 |
| Times queued (`queued` label) | 1 / 2 / 3 | 2 / 3 / 3 |
| Changed lines | 658 / 915 / 1080 | 786 / 908 / 948 |

- 48 of 73 PRs were queued only once; on 19 Nov it was 5 of 14.
- Builders open the PR when the build is done, so build time itself is not visible.

**2. Merge-queue batches** (165 `mergify/merge-queue/*` runs)

| Day | Batches | Fresh pass / fail | Bisect runs | Median minutes, pass / fail | PRs merged through batches |
|---|---|---|---|---|---|
| 16 Nov | 66 | 42 / 16 | 8 | 54 / 81 | 79 |
| 17 Nov | 37 | 23 / 9 | 5 | 78 / 117 | 59 |
| 18 Nov | 17 | 12 / 3 | 2 | 73 / 277 | 30 |
| 19 Nov | 45 | 13 / 19 | 10 | 62 / 61 | 37 |

- Passing batches hold a median of 1 PR (mean 2.07).
- Of the 27 failed runs on 19 Nov: 4–5 were the original failures, 8 failed because a batch ahead failed, 7 failed because a PR ahead was updated or dequeued, and 7 because their own PR was.
- I read the logs of 8 failed 19 Nov runs. All 8 were faults in a member PR, each a check that failed twice and failed again on later runs:
  - `check_case_feed` and `check_b164`: #2181 (sales/calls.ts), failed in 4 runs.
  - `check_csv1_inputs` and `check_forms_qa53`: #2167.
  - `check_bk2_fold_outs`: case-decision.tsx, almost certainly #2169 (by elimination).
  - `check_pf19b_mail`: #2196, likely (by elimination).
- I found no fault already on main. One possibly flaky check: `check_pf6_staff_browser`, once. No infrastructure faults on 19 Nov; there were 3 timeouts on 17–18 Nov.

**3. Capabilities that reached Works since 16 Nov** (n=4 built; very small)

| Item | App-code PRs | First PR opened → last merge | Last merge → Works set |
|---|---|---|---|
| R1.6 | 10 (#1808 … #2172) | 90.9 h | 13 min for the verdict; 4.2 h until it was on main |
| R1.12 | 2 (#1711, #1822) | 49.5 h | 37 min |
| R1.11 | 1 (#1713) | 5.5 h | 44.9 h (waited on a skeleton dispatch) |
| R1.99 | parts finished by 11 Nov | — | about 4.3 days (held by a decision, P-616) |

Six more rows (R1.63, R1.73, R1.82, R1.83, R1.84, R1.101) were added as Works on 16 Nov from earlier proofs, with no new build. I did not count them as throughput.

**4. Parts left** (journeys-2026-11-19.md, all 101 rows)

| Group | Parts left: count of items | Mean | Total |
|---|---|---|---|
| Partial (n=52) | 0:7, 1:19, 2:9, 3:9, 4:5, 5:2, 7:1 | ≥1.94 | ≥101 |
| Not built (n=38) | — | 2.55 | 97 |

- The 7 Partial rows that counted 0 are written in prose and really have at least 1 part each. Walk rows (J-) after a ";" were not counted, so these totals are low.
- Random sample of 10 Partial items (seed 19), read by hand: 1, 2, 3, 1, 2, 3, 1, 2, 3, 1 parts. Median 2, mean 1.9.

**5. Test time** (3 passing batch runs of 19 Nov)

- Whole run 52–58 min; the 8 shards take 34–54 min each; regression jobs 11–25 min.
- One run costs about 7.3 job-hours (7.21, 7.27, 7.56).
- In shard 4 (63 suites, run one after another, 52 min), the 10 slowest suites take 1723 s, 55% of the shard. Slowest first: b152_recorded_fees_api 323 s, bk3_links 206, c81_sign 198, qa317_sheet 184, b83_undo 164, bk2_fold_outs_browser 145, a24_2_case_list 138, k13_names 137, b78_sp_case 119, qa144_lmia 109.

**Model**

Proven a day ≈ app PRs merged a day ÷ PRs per item × share of merges that finish an item.

Assumptions:
- About 3 PRs per item: about 2 parts plus a walk row.
- Builder output stays at today's level: 20.7 app PRs a day × 658 lines ≈ 13.6k lines a day.
- About 20 lanes today, taken from the 18–22 app PRs open at a time.
- The runner limit is 40 concurrent jobs, which works out to about 130 full runs a day (estimate).

| Scenario | Low | Likely | High | Most sensitive to |
|---|---|---|---|---|
| (a) As is | 0.3 | 1.1 (measured: 4 items ÷ 3.53 days) | 6.7 (ceiling: 20.7 ÷ 3.1) | Focus: 52 items open at once |
| (b) + full run before the queue | 1.1 | 1.5 (estimate) | 6.7 | Focus; batch first-pass rate would rise to about 95% |
| (c) + one PR per item, automatic proof | 3 | 6–7 | 10 | Lines per item PR (about 2000, estimate) and review rounds |
| (d) + test run at a third | 3 | 7 | 10–11 | Builder output |

- Under (b), each PR adds about 2 full runs (one per review round), about 300 job-hours a day, or 53% of the runner limit (estimate).
- Under (c), each item takes about 4 runs, about 29 job-hours; 10 items a day would use about 30% of the runner limit.
- Under (c), the queue plus automatic proof takes about 2 h end to end; under (d), about 40 min. That shortens the wait but adds little throughput.

**Findings that matter most**

1. Merges are not the problem: about 21 app PRs a day merged, yet only 4 items were Proven in 3.5 days, and only R1.6 was built inside the window. That item took 10 PRs over 91 h. Effort is spread too thin.
2. On 19 Nov the queue did become a limit. Fresh batches passed first time only 41% of the time, and every failure I sampled was a fault in a member PR that fails every time. One fault produced about 5 failed runs, because batches are stacked behind each other.
3. With one PR per item, 10 a day needs about 20k lines a day, which is a little over one 2000-line item PR per lane a day — more than today's output per lane — so about 28–30 lanes (estimate). It also collides with the 800-line limit (P-610). Once that is solved, the binding limit becomes builder output and review rounds, not tests or the queue.

**Not measured, and why**

- Build time before a PR is opened: there is no data for it.
- qa session length: Works commits do not record when the session started.
- Exact dequeue counts: Mergify's payload comment is overwritten, so I counted `queued` labels instead.
- Changed lines on PRs touching more than 100 files: only the first page of files was fetched.
- Lane count: inferred from open PRs, not a roster.
- PRs opened before 14 Nov are left out of the open-PR counts at the start of 16 Nov.
