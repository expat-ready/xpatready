# Code Review sources mapped to our pipeline (27 Nov 2026)

**Sources, read in full on 27 Nov 2026 (raw page text, line by line, not from memory):**
**Updated by the tech lead 27 Nov after founder decision P-849 (Claude Approvals is the approver, no machine account) and the founder's review of the layers, incidents and learning sections: rows B13, B14, B42, B75, B97, DS14 changed. Where a row says P-845 machine user, read P-849.**

* **Page 1 (blog):** "How the Claude Code team does code review", claude.dev blog, https://claude.dev/blog/solving-code-review-at-anthropic/ , by the Claude Code team, published 15 Oct 2026. Sections as on the page: intro, Rethinking the purpose of code review, The scarce resource, The life of a change, Layer by layer (1-7), How we make the reviewer better, Where humans stay in the loop, Sharing context across the team, "You land it, you own it", When we change direction, How you can adopt this process, Where this is going.
* **Page 2 (docs):** the Code Review section of the Claude Code docs, every page under "Code Review" in the left navigation (six pages): Overview https://code.claude.com/docs/en/code-review · Set up https://code.claude.com/docs/en/code-review-setup · Customize reviews https://code.claude.com/docs/en/code-review-customize · Read and request reviews https://code.claude.com/docs/en/code-review-pull-requests · Costs and usage https://code.claude.com/docs/en/code-review-costs · Troubleshooting https://code.claude.com/docs/en/code-review-troubleshooting . The sibling entries in the same navigation group (Claude Ship, PR Steward, Claude Approvals, /ship and /steward, On-demand reviews, Security scans, Run Claude in your own CI, GitHub Enterprise Server) are separate products, not children of Code Review, and were not mapped; where a Code Review page mentions them, that mention is mapped. The docs have no separate "security" child page: the security points live in Overview › "What a review can access" and "Who controls a review", and Customize › "Which branch REVIEW.md is read from".

**Our setup as mapped (from the brief and from origin/main as fetched locally on 27 Nov, 05:32 UTC):** repo expat-ready/xpatready on GitHub Enterprise Cloud, public (P-504); agent lanes build every change, one row = one PR, under 800 changed lines (P-610); reviewer subagent on Opus 5.5 in a fresh context posts `Reviewer: Approve <sha>` on the exact head (P-385); breaker agent for money, schema, permissions, new screens (P-303); `review: approved` label queues the PR in Mergify (parallel scopes, batches); `label-guard.yml` removes the label on any new head without a matching Approve; `review-rounds.yml` counts rounds, at most two then the Lead decides (P-277, P-293; report-only); re-review reads only the new diff (P-277, P-610); the Lead reads the diff of money, permission, schema, migration, `.github/`, `.mergify.yml` PRs (P-423, relaxed by P-823). Claude Ship today: Code Review ON, xpatready Manual (`@claude review`), level Standard, PR tips off, Code Review spend cap US$100/month, Steward off, Claude Approvals connected with no policy file. The Lead comments `@claude review` on money, schema, migration, permission and pipeline PRs. Opus 5.5 medium everywhere (founder). Already decided and not yet built: **P-845 Factory v3** (26 Nov): a Lead machine-user account approves money, schema, migration and pipeline changes; GitHub's own approval replaces the `review: approved` label; main locked by a ruleset; Code Review on risky paths only (about 10-15% of PRs), resized from the measured average; the factory moves to expat-ready/private. Not present on main today: a root `REVIEW.md`, a `CODEOWNERS` file, "Risk" or "How to revert" in `.github/pull_request_template.md`, a reviewer eval set, feature flags or staged releases (no live users yet).

**Verdicts:** ADOPT = take it, small and named; KEEP = we already do it or the current setting is right; NOT ADOPTED = not for us now, with the reason; FOUNDER DECISION = a product or risk preference only the founder sets. **Owner lanes:** lab-ship-security (Claude Ship, Code Review, Approvals, security settings), lab-automation (CI workflows, scripts, gates, measurement), lab-fast-route (reviewer and breaker flow, rounds, merge route), Lead (rules, records, founder asks).

Quotes are verbatim and under 15 words. "B" rows are page 1, "D" rows page 2 (DO Overview, DS Set up, DC Customize, DR Read and request, DK Costs, DT Troubleshooting).

---

## Page 1: blog, "How the Claude Code team does code review" (106 rows)

| # | Section | Concept (short quote) | What we have today | Verdict | Why (one line) | Owner lane |
|---|---|---|---|---|---|---|
| B1 | Intro | "Claude writes about 90 percent of Claude Code's own code" | Agents write 100% of our code | KEEP | Same starting point; nothing to change | Lead |
| B2 | Intro | "merged pull requests ... more than doubled while ... reverted fell" | We count merges; revert share not tracked as a number | ADOPT | Gives the guardrail number (see B12) for our own speed claims | lab-automation |
| B3 | Intro | "move most of the reading to machines, optimized for human time" | Reviewer, breaker, qa and Code Review read; founder reads no code | KEEP | Matches P-699 (agents build, review, test, label) | Lead |
| B4 | Rethinking | "changes landing per day went from about 2,500 ... to more than 30,000" | Our volume is tens of PRs a day, not thousands | KEEP | Context only; our scale needs no new machinery | Lead |
| B5 | Rethinking | "Find and fix issues before they ship" / "Build shared context" | Job 1 covered by reviewer, breaker, CI; job 2 by STATE, module cards | KEEP | Both jobs already have an owner | Lead |
| B6 | Rethinking | "'did a human read the code?' is an imprecise proxy" | Risk picks the check: breaker and `@claude review` only on risky paths | KEEP | Same principle as P-303 and P-845 | Lead |
| B7 | Rethinking | "review runs continuously, more like spellcheck while you write" | Builder self-checks, then reviewer subagent before the label | KEEP | Review already happens before any human or queue | lab-fast-route |
| B8 | Scarce resource | "preserve human time and attention for issues only humans can solve" | Founder decides product only; Lead owns pipeline | KEEP | Matches founder-product-only rule | Lead |
| B9 | Scarce resource | "the time people spend reviewing, and the time they spend fixing" | We measure wait and merges, not fix-after-merge time | ADOPT | Count main-red and revert PRs so saved review time isn't just moved | lab-automation |
| B10 | Scarce resource | "merge with at most one human in the loop, who can be the author" | Zero humans in the loop on ordinary PRs; founder override only | KEEP | One human (the founder) on product, not on code; P-845 settles code approvals | Lead |
| B11 | Scarce resource | "human approvals per PR (median and 95th percentile), human comments" | Not measured; founder clicks ~0 by design (P-637) | NOT ADOPTED | With one human who never reviews code, the number is always 0 | Lead |
| B12 | Scarce resource | "Revert and incident rates are the guardrail" | cto-review uses "reverted or main red" as a DORA proxy | ADOPT | Make it the standing guardrail next to speed in every factory report | lab-automation |
| B13 | Life of a change | "a person's attention goes where the risk is" (Fig A) | Lead reads only risky-path diffs (P-423/P-823) | ADOPT | We have the layers; adopt the picture: a layer map (what each layer catches and misses) on the factory page, fed by B49 escape attribution (register LR-142) | Lead |
| B14 | Layer by layer | "Each layer catches some problems and misses others" (Fig B) | Layers: self-check, reviewer, breaker, CI, Code Review, queue, qa | ADOPT | Same layer map (LR-142): each main-red or revert names the layer that should have caught it | Lead |
| B15 | 1. Verified before | "ask it to show the output instead of saying it's done" | PR template "Checks and results (each command and its exit code)" | KEEP | Same rule, already in the template | lab-fast-route |
| B16 | 1. Verified before | "a subagent reviews the diff with fresh context" | Reviewer subagent, fresh context, Opus 5.5 | KEEP | Identical practice | lab-fast-route |
| B17 | 1. Verified before | "one hunts for bugs, one simplifies the diff, one checks ... end to end" | Reviewer (bugs), journey-test walks (end to end); no simplify pass | NOT ADOPTED | A third pass per PR adds tokens; reviewer already flags needless code | lab-fast-route |
| B18 | 1. Verified before | "Verification looks different for each domain" (quoting the creator of Claude Code) | Tests, walks in a browser, screenshots per PR | KEEP | Already domain-specific verification | lab-fast-route |
| B19 | 1. Verified before | "we fix it at the source: in the skill, with a lint rule" | Lessons go to RULES rows and enforcers (P-612, enforce-rules-not-text) | ADOPT | Add the trigger: a finding repeated on 3 PRs becomes a REVIEW.md line, lint or check | Lead |
| B20 | 1. Verified before | "CLAUDE.md ... Every review loads it ... we keep it short" | Root CLAUDE.md short, points to AGENTS.md and product docs | KEEP | Already short with pointers | Lead |
| B21 | 1. Verified before | "REVIEW.md, written by code owners ... We check ... the reviewer actually follows it" | No REVIEW.md | ADOPT | Cheapest lever on Code Review noise and focus (Top 1) | lab-ship-security |
| B22 | 1. Verified before | "say what failure looks like ... cap the nits, list paths to skip" | Reviewer prompt has no nit cap, no skip list | ADOPT | Put these five items in REVIEW.md: failure meaning, nit cap, skip paths, file:line evidence, count-first summary | lab-ship-security |
| B23 | 2. AI review every PR | "Every pull request gets a Claude review before a person looks" | Every PR gets our reviewer subagent; Code Review only on risky PRs | KEEP | Our own reviewer is the every-PR layer; Code Review on all PRs costs more for little gain (P-845) | lab-fast-route |
| B24 | 2. AI review every PR | "On a bug fix, it looks for the root cause" | P-502: root cause required; reviewer not told to check it | ADOPT | One line in the reviewer brief: on a fix PR, name the root cause or flag its absence | lab-fast-route |
| B25 | 2. AI review every PR | "/code-review runs a lighter version locally" | Lanes use our reviewer subagent, not /code-review | KEEP | Our subagent is tuned to our rules; /code-review would be a duplicate pass | lab-fast-route |
| B26 | 2. AI review every PR | "substantive review comments went from 16% to 54%" | Not measured | NOT ADOPTED | A vanity rate for us; B54 noise sorting is the useful measure | lab-automation |
| B27 | 2. AI review every PR | "Admins set each repo to Quick, Standard, or Deep" | xpatready on Standard | KEEP | Standard until the measured average cost is known (see DS9) | lab-ship-security |
| B28 | 2. AI review every PR | "a separate group votes on each finding ... only gets posted if enough ... agree" | Built into Code Review; our reviewer is one agent | KEEP | Code Review already does it on risky PRs; voting on every PR would multiply our tokens | lab-fast-route |
| B29 | 2. AI review every PR | "tagged Important, Nit, or Pre-existing" | Reviewer findings have no fixed severity tags | ADOPT | Reuse the same three tags in our reviewer so both reviewers speak one language | lab-fast-route |
| B30 | 2. AI review every PR | "Every finding has to be answered ... fix it or resolve the thread" | Builder answers the reviewer's findings; Code Review findings not tracked | ADOPT | Important Code Review findings fixed or resolved with a one-line reason before approval (Top 4) | lab-fast-route |
| B31 | 2. AI review every PR | "Often an agent picks up the fix overnight" | Lanes fix after review in the same session | KEEP | Already agent-fixed | lab-fast-route |
| B32 | 3. Security review | "A PR can't merge while any finding ... is still open" | Nothing blocks on Code Review today (it never fails a check) | ADOPT | Gate only risky PRs, report-only first, via the script in DR11 (Top 3) | lab-automation |
| B33 | 3. Security review | "close the thread with a short reason ... how you clear a false positive" | No path for clearing a false positive | ADOPT | Same as B30: resolve with reason is the clearing path | lab-fast-route |
| B34 | 3. Security review | "If a later commit fixes the issue, the finding clears on its own" | Code Review does this on its next review | KEEP | Service behaviour; nothing to build | lab-ship-security |
| B35 | 3. Security review | "open-source security review GitHub Action or the /security-review command" | Breaker covers permissions; no dedicated security pass | FOUNDER DECISION | A second paid security pass on permission PRs is a cost choice; recommend not yet, breaker plus Code Review cover it | Lead |
| B36 | 4. Automated checks | "lint, type checks, tests on every platform, and a build" | ci.yml, pr-suites, guards, walks; one platform (web) | KEEP | Our blocking CI already covers this | lab-automation |
| B37 | 4. Automated checks | "The PR template asks how the change was tested and how to undo it" | Template asks "Checks and results"; no "How to revert" | ADOPT | Add "Risk" and "How to revert" lines (Top 5) | lab-automation |
| B38 | 5. Human approval by risk | "Low ... None required ... Medium ... One person ... High ... Two people" | Two tiers: ordinary (agent Approve) and risky paths (P-845 machine-user approval) | KEEP | Our two tiers fit one-founder scale; a third tier would be over-tightening | Lead |
| B39 | 5. Human approval by risk | "The change sets the tier, not the author. A classifier reads the change" | Tier set by changed paths (P-823 path list, Mergify scopes) | KEEP | Path rules are deterministic and cheaper than a classifier | lab-automation |
| B40 | 5. Human approval by risk | "anything owners have listed as sensitive and any CI workflow file" | `.github/` and `.mergify.yml` are on the Lead-read list (P-423) | KEEP | Same list, already ours | Lead |
| B41 | 5. Human approval by risk | "Only authors on the repo's trusted list get the lighter paths" | Only our lanes open PRs; public repo, forks not queued | KEEP | All authors are our lanes; a trusted list adds nothing | lab-ship-security |
| B42 | 5. Human approval by risk | "An agent's approval never counts as a person's" | P-845: the Lead machine user (an agent) approves risky paths | SETTLED (P-849) | Founder 27 Nov chose Claude Approvals as the approver, no machine account; this line is the reason (an agent-driven account adds no human-level quality) | Lead |
| B43 | 5. Human approval by risk | "the person directing the agent counts as one of the required reviewers" | Founder directs product; Lead directs lanes | NOT ADOPTED | No human directs each PR here; ownership sits with the Lead role (B73) | Lead |
| B44 | 5. Human approval by risk | "An approval covers one specific commit" | Approve names the exact head sha; label-guard removes the label on a new head | KEEP | Already exact-commit, enforced in CI | lab-automation |
| B45 | 6. Merge queue | "re-runs every check against main with the change applied" | Mergify batches run the full check on the combined change | KEEP | Same mechanism | lab-fast-route |
| B46 | 6. Merge queue | "ships behind a flag to Anthropic employees first" | No live users; demo updates itself | NOT ADOPTED | No users to stage to yet; revisit at first client tenant | Lead |
| B47 | 6. Merge queue | "Public releases go to the latest channel first. The stable channel trails" | One demo; no channels | NOT ADOPTED | Same reason as B46 | Lead |
| B48 | 7. Detection, rollback | "Flags turn off without a deploy" | No runtime flags (STUDIO_*_LIVE switches only for paid AI) | NOT ADOPTED | Nothing live to switch off yet | Lead |
| B49 | 7. Detection, rollback | "incident reviews ask which layer should have caught the issue" | Lessons recorded; layer not named | ADOPT | Each main-red or revert note names the layer that should have caught it (feeds B52) | Lead |
| B50 | 7. Detection, rollback | "We don't yet have circuit breakers that tighten approval" | None | NOT ADOPTED | Source itself lacks it; would be over-engineering for us | Lead |
| B51 | 7. Detection, rollback | "We'd rather get faster at noticing and fixing problems" | Nightly, red-on-old and pipeline-heartbeat watch main | KEEP | Speed-to-fix stance already ours | lab-automation |
| B52 | Reviewer better | "Any incidents are now an eval ... The reviewer runs against that set daily" | No reviewer eval | ADOPT | Small set from our own reverts and main-red PRs; run on change, not daily (Top 7) | lab-automation |
| B53 | Reviewer better | "every change to the reviewer is scored against all of it" (Fig C) | Reviewer prompt changes land unscored | ADOPT | Run the B52 set whenever the reviewer brief, tools or model change | lab-automation |
| B54 | Reviewer better | "they fixed it, said it was wrong, said ... intentional, or ... didn't matter" | Builder responses are free text | ADOPT | Builder answers each finding with one of four words; counted monthly (Top 8) | lab-automation |
| B55 | Reviewer better | "run the reviewer on PRs we know are clean" | Not done | NOT ADOPTED | B52 set plus B54 counts give the false-alarm signal at lower cost | lab-automation |
| B56 | Reviewer better | "catching real bugs first and cutting review rounds second" | Not written as a priority | ADOPT | One line in the reviewer brief; settles trade-offs | lab-fast-route |
| B57 | Reviewer better | "Noise costs more when the author is an agent" | Seen: lanes fix every nit, extra rounds | KEEP | Already the reason for P-293; supports the nit cap (B22) | lab-fast-route |
| B58 | Reviewer better | "One CLI PR went through more than fifty rounds" | Round cap two, then Lead (P-293) | KEEP | Our cap is already tighter | lab-fast-route |
| B59 | Reviewer better | "about 59% of it was code that had been there since the reviewer's first pass" | Not measured | NOT ADOPTED | Our diff-only re-review (P-277) already removes the cause | lab-fast-route |
| B60 | Reviewer better | "several rounds by default ... worthwhile on a risky change, but not on every PR" | One review per head; extra rounds only on change | KEEP | Already the case | lab-fast-route |
| B61 | Reviewer better | "tracks rounds-to-pass alongside recall" | review-rounds.yml counts rounds (report-only) | ADOPT | Add rounds-to-pass to the monthly noise count (Top 8) | lab-automation |
| B62 | Reviewer better | "After three rounds, the reviewer asks the author to step back" | Two rounds, then the Lead decides (P-293) | KEEP | Ours is stricter; do not loosen or tighten | lab-fast-route |
| B63 | Reviewer better | "Diff-only re-review after the first few passes" | Diff-only from round two (P-277, P-610) | KEEP | Already ours | lab-fast-route |
| B64 | Reviewer better | "Flag the class of bug, so the author fixes every instance" | Reviewer flags instances | ADOPT | One line in the reviewer brief (Top 6) | lab-fast-route |
| B65 | Reviewer better | "No repeats of findings already posted" | Not stated | ADOPT | One line in the reviewer brief (Top 6) | lab-fast-route |
| B66 | Reviewer better | "Review agents also run nightly over existing code" | Nightly CI runs tests, not a review agent | NOT ADOPTED | Daily token cost with no users yet; qa explore covers old areas | lab-automation |
| B67 | Reviewer better | "Fewer review rounds per internal pull request" (Fig D) | No before/after measure | ADOPT | Measure rounds before and after Top 6 (same count as B61) | lab-automation |
| B68 | Humans in the loop | "Pulling a senior engineer out of deep work ... costs far more" | Founder never pulled into code | KEEP | Already the rule | Lead |
| B69 | Humans in the loop | "Deciding whether to build it. Direction, taste and scope" | Founder decides product; backlog rows shaped by Lead | KEEP | Already the split | Lead |
| B70 | Humans in the loop | "Reviewing risky code such as billing, the auto-updater and CI workflows" | Lead reads risky-path diffs; P-845 machine user approves | KEEP | Same paths; human slot is B42's founder decision | Lead |
| B71 | Humans in the loop | "Reviewing architecture that sets a pattern others will copy" | Screen concept + challenger before build; STANDARDS gate for new tech | KEEP | Design-before-build already covers it | Lead |
| B72 | Humans in the loop | "If you can't say what the checks would miss, ask for a real review" | Lead labels on evidence (P-385, P-423) | ADOPT | Lead's label note names what the checks would miss on a risky PR, else asks for `@claude review` | Lead |
| B73 | Humans in the loop | "A person is accountable for every change that ships" | Lead role owns outcome; founder owns product | KEEP | Accountability by role, no names (AGENTS.md rule 5) | Lead |
| B74 | Sharing context | "Code review's second job has always been to spread codebase understanding" | Module cards, STATE, design notes | KEEP | Already the context carriers | Lead |
| B75 | Sharing context | "they ask Claude to write an explainer for exactly that slice" | Lanes read module cards; explainers on request | ADOPT (risky PRs) | Agents write all code; the future team and the Lead learn it from a 5-line plain-words explainer on money, schema, permission and pipeline PRs, and an artifact on request (LR-141) | Lead |
| B76 | Sharing context | "have Claude build a small artifact that visualizes that part" | Visual pages for the founder exist | KEEP | Already used for founder reviews | Lead |
| B77 | Sharing context | "defaulting to working on open Slack channels helps too" | Everything in GitHub PRs and records (P-557) | KEEP | GitHub is our open channel | Lead |
| B78 | You land it | "you usually fix it" | The lane that merged a breaking PR fixes it (P-731) | KEEP | Same norm | lab-fast-route |
| B79 | You land it | "Changes are small, so they're easy to review, debug and revert" | Under 800 changed lines per PR (P-610) | KEEP | Already enforced in CI | lab-automation |
| B80 | You land it | "Everything is reversible. Flags, reverts and staged releases" | Reverts via PR; no flags or stages | ADOPT | "How to revert" line in the template makes it explicit (Top 5) | lab-automation |
| B81 | You land it | "Blast radius sets the bar" | Breaker and Code Review only on risky paths | KEEP | Already risk-scaled | Lead |
| B82 | You land it | "Regressions surface fast through telemetry and internal use" | Nightly, qa after-merge walks, demo | KEEP | Our equivalent of internal use | lab-automation |
| B83 | You land it | "It isn't blame ... incident reviews look at the system" | Lessons name causes and enforcers, not lanes | KEEP | Already system-focused | Lead |
| B84 | You land it | "Ownership is also shared ... anyone can ... pick up a thread" | Lead reassigns rows; lanes are replaceable | KEEP | Already the swarm model | Lead |
| B85 | Change direction | "some work shouldn't land ... the author closes or reshapes the PR" | Lead closes or reshapes rows | KEEP | Already allowed | Lead |
| B86 | Change direction | "raise a different direction in the thread early" | Disagreements go in the PR or challenge.md (CLAUDE.md) | KEEP | Already the rule | Lead |
| B87 | Adopt: before PR | "checks it can run, listed in a short CLAUDE.md, plus hooks" | Checks in skills and hooks; CLAUDE.md short | KEEP | Already ours | Lead |
| B88 | Adopt: before PR | "Run /code-review and /security-review locally, or a fresh-context subagent" | Fresh-context reviewer subagent | KEEP | The subagent option is the one we use | lab-fast-route |
| B89 | Adopt: before PR | "Add a REVIEW.md, and move repeated review comments into it" | No REVIEW.md | ADOPT | Same as B21 and B19 | lab-ship-security |
| B90 | Adopt: every PR | "add 'Testing', 'Risk' and 'How to revert' to your PR template" | Testing covered by "Checks and results"; Risk and revert missing | ADOPT | Top 5 | lab-automation |
| B91 | Adopt: every PR | "on one repo, tune REVIEW.md for a few weeks, then widen" | One repo, Manual mode | ADOPT | Tune on xpatready first; add expat-ready/private only when the factory moves (P-845) | lab-ship-security |
| B92 | Adopt: every PR | "require every review thread resolved before merge" | Not required | NOT ADOPTED | GitHub-wide conversation resolution would block on every comment; B30 + Top 3 cover risky PRs only | lab-ship-security |
| B93 | Adopt: every PR | "a quick pass on routine changes, a deep one where a missed bug is expensive" | Our reviewer on all; Code Review Standard on risky | KEEP | Effort already risk-matched; level change waits for cost data (DS9) | lab-ship-security |
| B94 | Adopt: every PR | "Cap review rounds; after the first few, re-review only the new diff" | P-293 and P-277 | KEEP | Already ours | lab-fast-route |
| B95 | Adopt: approval | "Write down risk tiers ... start strict and loosen with evidence" | Risky-path list in P-423/P-823/P-845 | KEEP | Written; loosening already evidence-based (P-823) | Lead |
| B96 | Adopt: approval | "Keep the lighter approval paths for authors you trust" | Only our lanes author | KEEP | Same as B41 | lab-ship-security |
| B97 | Adopt: approval | "Use CODEOWNERS and branch protection so auth, billing, CI ... need a person" | No CODEOWNERS; P-845 ruleset on main is owed | NOT ADOPTED (P-849) | No machine-user approver to name; approvals.yml routes risky paths to Code Review instead; CODEOWNERS only when a second person joins | lab-ship-security |
| B98 | Adopt: approval | "Never let a bot's approval replace a required human's; dismiss approvals on new commits" | Label-guard does the dismiss part; bot-vs-human is B42 | ADOPT | Ruleset "dismiss stale approvals on push" when GitHub approval replaces the label (P-845); human part = B42 | lab-ship-security |
| B99 | Adopt: merge and after | "merge queue, feature flags, internal use first, staged releases ... rollback" | Merge queue yes; the rest not applicable yet | KEEP | Queue kept; flags and stages as B46-B48 | lab-fast-route |
| B100 | Adopt: merge and after | "Turn incidents and reverts into an eval set, and rescore the reviewer" | None | ADOPT | Same as B52-B53 | lab-automation |
| B101 | Adopt: merge and after | "Measure human time, with revert and incident rates as the guardrail" | Speed measured; guardrail not standing | ADOPT | Same as B12 | lab-automation |
| B102 | Where going | "approving a pull request is still a human call; the product posts findings" | Code Review never fails our checks; approval is ours | KEEP | Matches the product's design | lab-ship-security |
| B103 | Where going | "letting owners decide which low-risk changes merge on automated checks alone" | Ordinary PRs merge on agent Approve + CI already | KEEP | We are already there for low risk | Lead |
| B104 | Where going | "ask what the model didn't have ... put the fix into a CLAUDE.md, a skill" | Lessons become rules and enforcers | KEEP | Same loop as B19 | Lead |
| B105 | Where going | "less human time per change, and no more reverts than before" | Goal implied, not written | ADOPT | Write it as the reviewer-lab goal line with B12's guardrail | Lead |
| B106 | Where going | "we'd like to hear which checks you've automated" | No outside posting (AGENTS.md rule 1) | NOT ADOPTED | Invitation to give feedback; we do not post outside | Lead |

---

## Page 2: Code Review docs (six child pages, 108 rows)

### DO: Overview (https://code.claude.com/docs/en/code-review) (29 rows)

| # | Section | Concept (short quote) | What we have today | Verdict | Why (one line) | Owner lane |
|---|---|---|---|---|---|---|
| DO1 | Intro | "Several agents read each change alongside the surrounding code" | Code Review ON for xpatready | KEEP | The service we pay for | lab-ship-security |
| DO2 | Intro | "Findings arrive as inline comments ... ranked by severity, with a summary" | Seen on `@claude review` PRs | KEEP | Nothing to change | lab-ship-security |
| DO3 | Intro | "By itself, a review doesn't approve or block the pull request" | Nothing reads its result | ADOPT | Our own script decides what blocks (Top 3) | lab-automation |
| DO4 | Intro | "A review with no findings doesn't mean your code is error-free" | Clean review not treated as proof | KEEP | Our reviewer, breaker and CI still run | Lead |
| DO5 | Intro | "Run /code-review in your Claude Code session on any plan" | Reviewer subagent instead | KEEP | Same as B25 | lab-fast-route |
| DO6 | Availability | "Plans: Team and Enterprise" | Team/Enterprise plan with Code Review ON | KEEP | Eligible | lab-ship-security |
| DO7 | Availability | "GitHub Enterprise Cloud with data residency" needs ghe.com setup | GitHub Enterprise Cloud on github.com | KEEP | No data residency, so no extra setup | lab-ship-security |
| DO8 | Availability | "isn't available to organizations with Zero Data Retention" or HIPAA | Not ZDR, not HIPAA | KEEP | Not affected; note if client data ever needs ZDR | Lead |
| DO9 | Availability | "isn't yet available for ... customer-managed encryption keys" | No CMEK | KEEP | Not affected | lab-ship-security |
| DO10 | Availability | "you need a Claude organization ... even if ... Bedrock" | Claude organization in use | KEEP | Not affected | lab-ship-security |
| DO11 | How reviews work | "focuses on correctness: bugs that would break production" | Matches our need on risky PRs | KEEP | Correctness is what we buy it for | lab-ship-security |
| DO12 | How reviews work | "Find ... Verify ... Rank ... Post" | Service-side | KEEP | Nothing to build | lab-ship-security |
| DO13 | How reviews work | "check run: named Claude Code Review ... doesn't conclude as a failure" | Check run appears; not required in Mergify | KEEP | Never make it a required check (it can't fail); read its text instead (Top 3) | lab-automation |
| DO14 | How reviews work | "Code review found no issues" note | Seen | KEEP | Script treats it as a pass (DR12) | lab-automation |
| DO15 | How reviews work | "its admin settings don't offer a model choice" | Founder rule: Opus 5.5 medium everywhere | KEEP | Rule covers our agents; Code Review's model is the service's, not ours to set | Lead |
| DO16 | How reviews work | "someone with write access ... can comment @claude review" | Lead comments on risky PRs | KEEP | Works in Manual mode | Lead |
| DO17 | Review levels | "Quick ... Standard ... Deep" | Standard | KEEP | Same as B27 | lab-ship-security |
| DO18 | Review levels | "can give an individual repository its own" level | One repo; the private factory repo will come | FOUNDER DECISION | When expat-ready/private joins: Deep there (pipeline only) vs Standard; recommend Standard until cost data | Lead |
| DO19 | Access | "on Anthropic infrastructure ... don't run in self-hosted environments" | Accepted | KEEP | Public repo; no extra exposure | lab-ship-security |
| DO20 | Access | "access to your repository is read-only, and a review doesn't push commits" | Label-guard unaffected by its comments | KEEP | Safe with our head-sha Approve rule | lab-ship-security |
| DO21 | Access | "The app itself holds a broader permission set" | Claude GitHub App installed | ADOPT | Keep app access to selected repos only; check when adding expat-ready/private | lab-ship-security |
| DO22 | Access | "without building or running your code" | CI runs the code | KEEP | CI stays the execution layer | lab-automation |
| DO23 | Who controls | automatic "except on drafts and forks" | Manual; forks never queued | KEEP | Not affected | lab-ship-security |
| DO24 | Who controls | "REVIEW.md ... never from the pull request's own changes" | No REVIEW.md | ADOPT | A PR cannot weaken its own review; merge REVIEW.md before relying on it (Top 1) | lab-ship-security |
| DO25 | Compare | Code Review: "Pull request activity ... or an @claude review comment" | Used, Manual | KEEP | Right option for risky PRs | lab-ship-security |
| DO26 | Compare | /code-review: "Your Claude Code session" | Not used | KEEP | Our subagent fills this slot (B25) | lab-fast-route |
| DO27 | Compare | Ultrareview: "A cloud sandbox" | Not used | NOT ADOPTED | A third paid reviewer adds cost without a gap to fill | Lead |
| DO28 | Compare | "Claude in your own CI, with GitHub Actions" | Not used | NOT ADOPTED | Would duplicate Code Review and need API keys in CI | lab-automation |
| DO29 | Compare | "Your own reviewer, as a subagent or skill" | Reviewer and breaker subagents | KEEP | Our every-PR layer | lab-fast-route |

### DS: Set up (https://code.claude.com/docs/en/code-review-setup) (20 rows)

| # | Section | Concept (short quote) | What we have today | Verdict | Why (one line) | Owner lane |
|---|---|---|---|---|---|---|
| DS1 | Intro | "you don't add workflow files to your repositories" | No Code Review workflow | KEEP | Nothing in CI to maintain | lab-ship-security |
| DS2 | Intro | "You spend more at a higher review level and when reviews run more often" | Standard, Manual, US$100 cap | KEEP | Cheapest settings that still cover risky PRs | lab-ship-security |
| DS3 | What you need | Owner role, GitHub org owner, "Write access to each repository" | Set up done | KEEP | Needed again for expat-ready/private | lab-ship-security |
| DS4 | Turn on | steps 1-5: switch, Connect GitHub, Install App, choose repositories, Turn on | Done for xpatready | KEEP | Repeat steps 4-5 for the private repo (P-845) | lab-ship-security |
| DS5 | Turn on | "If Steward is selected ... clear it unless you also want PR Steward" | Steward off | KEEP | Steward pushes fixes; a push drops our label and adds a round | lab-ship-security |
| DS6 | Turn on | "If you close the dialog any other way ... nothing is turned on" | Done correctly | KEEP | Note for the private repo | lab-ship-security |
| DS7 | Turn on | "Each repository starts set to review after every push" | Changed to Manual | KEEP | Every push would multiply cost by pushes | lab-ship-security |
| DS8 | Verify | "Open a test pull request ... A check run named Claude Code Review appears" | Verified on xpatready | KEEP | Repeat once for the private repo | lab-ship-security |
| DS9 | Default level | "Organization default ... One repository ... Default follows the organization" | Org Standard; repo Default | ADOPT | After ~10 reviews read "Cost" per review in the repo's Edit row, then size cap and level (P-845 "resized from the measured average") | lab-ship-security |
| DS10 | Review runs | "Once after PR creation ... After every push ... Manual (@claude review)" | Manual | KEEP | Only risky PRs are reviewed, by the Lead's comment | lab-ship-security |
| DS11 | Review runs | "Manual is useful for high-traffic repositories ... opt specific pull requests" | Exactly our use | KEEP | Matches P-845 "risky paths only" | lab-ship-security |
| DS12 | Review runs | Drafts and forks: "automatic reviews skip both" | Manual anyway | KEEP | Comment works on drafts too | lab-ship-security |
| DS13 | Review runs | "New repositories ... starts at After every push" | Private repo not added yet | ADOPT | Set it to Manual the moment it is added | lab-ship-security |
| DS14 | Review runs | Approvals policy file: "reviews can start that this setting wouldn't start" | Approvals connected, no policy file | ADOPT (P-849) | Founder chose Claude Approvals; approvals.yml names `claude/code_review` on risky paths so those reviews still run | lab-ship-security |
| DS15 | Tip comments | "Show tips on pull requests is on by default" | Tips off | KEEP | Tips would post on every Manual-mode PR; budget comments still post (DK8) | lab-ship-security |
| DS16 | What developers can change | "Request a review ... Subscribe ... Change what reviews flag" | Lead requests; no REVIEW.md | ADOPT | REVIEW.md is the change channel (Top 1); `always` not used (DR14) | lab-ship-security |
| DS17 | What developers can change | "Reviews that developers request are billed to your organization" | US$100 Code Review cap set | KEEP | Cap stops runaway requests | lab-ship-security |
| DS18 | Add more repositories | "click Add above the Repositories table" | One repo | ADOPT | Add expat-ready/private when P-845 step creates it | lab-ship-security |
| DS19 | Cover a whole GitHub organization | "This can raise spend significantly" | Per-repo | NOT ADOPTED | Org-wide coverage would review every repo; we want risky PRs only | lab-ship-security |
| DS20 | Turn off / remove | "a Claude Approvals policy can start billed reviews" even when off | No policy file | KEEP | No surprise spend while we have no policy file | lab-ship-security |

### DC: Customize (https://code.claude.com/docs/en/code-review-customize) (20 rows)

| # | Section | Concept (short quote) | What we have today | Verdict | Why (one line) | Owner lane |
|---|---|---|---|---|---|---|
| DC1 | CLAUDE.md | "A change that violates one of their rules becomes a finding" | Root and folder CLAUDE.md files exist | KEEP | Our rules already reach Code Review | Lead |
| DC2 | CLAUDE.md | "the CLAUDE.md files in the parent directories of each changed file" | Several CLAUDE.md files in folders | KEEP | Keep each short; they are read per changed path | Lead |
| DC3 | REVIEW.md | "REVIEW.md is a file at your repository root" | None | ADOPT | Top 1 | lab-ship-security |
| DC4 | REVIEW.md | finders and verifiers "receive its contents as your repository's review instructions" | n/a | KEEP | Explains why REVIEW.md works; nothing extra to build | lab-ship-security |
| DC5 | REVIEW.md | "/code-review command ... reads your CLAUDE.md files and not REVIEW.md" | Our subagent reads neither unless briefed | ADOPT | Put rules both reviewers need in CLAUDE.md or the reviewer brief; REVIEW.md only for PR-review specifics | lab-fast-route |
| DC6 | Subdirectory REVIEW.md | not applied under "test, tests ... fixtures ... sample ... generated ... vendor" | n/a | KEEP | One root file is enough; no subfolder files | lab-ship-security |
| DC7 | Subdirectory REVIEW.md | "share a limit of 150,000 bytes" | n/a | KEEP | Not relevant with one short root file | lab-ship-security |
| DC8 | Example | "What Important means here ... Cap the nits ... Do not report ... Always check" | n/a | ADOPT | Use these four headings as our REVIEW.md skeleton | lab-ship-security |
| DC9 | Choose what to write | "redefine what 🔴 Important means ... a prototype might want a much narrower definition" | n/a | ADOPT | Important = wrong money, schema/migration not backward compatible, permission leak, wrong immigration value, pipeline break; style is Nit | lab-ship-security |
| DC10 | Choose what to write | "report at most five nits" | Lanes fix every nit | ADOPT | Cap at three: each nit costs an agent round (B57) | lab-ship-security |
| DC11 | Choose what to write | "Comments on generated files or on what CI already checks" | n/a | ADOPT | Skip lockfiles, generated Prisma client, records (`product/*.md` history), anything pr-rules or lint enforces | lab-ship-security |
| DC12 | Choose what to write | "new API routes must have an integration test" | Rules exist in STANDARDS | ADOPT | Add 3-5 "Always check" lines from existing rules only (no new rules) | lab-ship-security |
| DC13 | Choose what to write | "behavior claims need a file:line citation in the source" | Not required | ADOPT | Cuts false positives that cost a round (B22) | lab-ship-security |
| DC14 | Choose what to write | "Keep REVIEW.md to instructions that change review behavior" | n/a | ADOPT | Keeps it short and stops duplicating CLAUDE.md | lab-ship-security |
| DC15 | Include other files | "include at most eight different files ... under 150,000 bytes ... 64 ... links" | n/a | NOT ADOPTED | One short file needs no includes; avoids the link-limit trap that skips the whole file | lab-ship-security |
| DC16 | Include a skill file | "@.claude/skills/<folder>/SKILL.md" only from a protected branch, 30,000 bytes | Our screen-review skill exists | NOT ADOPTED | Our skills carry `!` commands and links Code Review drops; copy the 3-5 needed lines instead | lab-ship-security |
| DC17 | Which branch | "To change review behavior, merge the REVIEW.md change first" | n/a | ADOPT | REVIEW.md lands in its own small PR before relying on it | lab-ship-security |
| DC18 | Which branch | protected default honors "Lowering a finding's severity ... Excluding paths ... Capping nit comments" | Main protection state to confirm | ADOPT | Without protection our nit cap and skips are ignored (Top 2) | lab-ship-security |
| DC19 | What counts as protection | ruleset must "dismiss that approval on a new push" if it requires PRs | P-845 ruleset owed | ADOPT | Build P-845's ruleset with "dismiss stale approvals" (also B98) | lab-ship-security |
| DC20 | Branch setup table | "Code Review can't confirm the protection settings" → "None" read | Unknown | ADOPT | Check the next check run's REVIEW.md message (DT7) to confirm which row we are in | lab-ship-security |

### DR: Read and request reviews (https://code.claude.com/docs/en/code-review-pull-requests) (22 rows)

| # | Section | Concept (short quote) | What we have today | Verdict | Why (one line) | Owner lane |
|---|---|---|---|---|---|---|
| DR1 | Intro | "the check run doesn't conclude as a failure" | Not required in Mergify | KEEP | Same as DO13 | lab-automation |
| DR2 | Severity levels | "🔴 Important ... 🟡 Nit ... 🟣 Pre-existing" | Not used by our reviewer | ADOPT | Same tags in our reviewer (B29) | lab-fast-route |
| DR3 | Severity levels | "a collapsed Why this was flagged section" | Lanes may skip it | ADOPT | Builder reads it before answering a finding (one line in the builder brief) | lab-fast-route |
| DR4 | Respond to findings | "You can merge without responding ... unless your repository's own rules require it" | No rule today | ADOPT | Our rule: Important answered on risky PRs (B30, Top 4) | Lead |
| DR5 | Respond to findings | "Replying alone doesn't dismiss a finding" | n/a | ADOPT | Dismiss = resolve the thread with a reason line (Top 4) | lab-fast-route |
| DR6 | Respond to findings | "The next review ... resolves its earlier thread when it judges the issue fixed" | Lead may re-request | KEEP | Re-request only after a fix to an Important finding | Lead |
| DR7 | Respond to findings | "If the same kind of finding keeps coming back ... add a rule to REVIEW.md" | n/a | ADOPT | Same trigger as B19 | Lead |
| DR8 | Check run output | "findings in one table sorted by severity" in Details | n/a | KEEP | Our script reads this text (DR11) | lab-automation |
| DR9 | Check run output | "It never concludes as a failure, so a finished review doesn't fail a required check" | n/a | KEEP | Same as DO13 | lab-automation |
| DR10 | Keep earlier result | "Code review not repeated — earlier findings still open" | n/a | KEEP | Script handles the title (DR12) | lab-automation |
| DR11 | Read the result from a script | "<!-- bughunter-severity: {"nit":1,"normal":2,"pre_existing":0} -->" | Nothing reads it | ADOPT | A small queue-gate step reads `normal` on reviewed PRs (Top 3) | lab-automation |
| DR12 | Act on the result | "Treat that as no verdict rather than as zero findings" | n/a | ADOPT | Missing line = no verdict (fail closed on risky PRs, report-only first) | lab-automation |
| DR13 | Request a review | "Comment a command ... Click Re-run ... automatic retry" | Lead comments | KEEP | Enough for Manual | Lead |
| DR14 | Comment commands | "@claude review always ... subscribes the PR to push-triggered reviews" | Not used | NOT ADOPTED | Per-push cost on PRs whose rounds we already cap | Lead |
| DR15 | Comment commands | "In a repository set to After every push, you can't stop reviews with a comment" | Manual | KEEP | Not affected | lab-ship-security |
| DR16 | Comment commands | "new top-level pull request comment ... at the start ... write ... permission" | Lead comments from its account | KEEP | Bot comments don't start reviews: the Lead machine user (P-845) must be a user account with write access, not a GitHub App | lab-ship-security |
| DR17 | Comment commands | "look for the check run instead" of the 👀 reaction | n/a | ADOPT | Lead confirms "Code review queued..." appears before moving on | Lead |
| DR18 | Comment commands | "If a review is already running ... a new request doesn't start a second" | n/a | KEEP | No double billing on repeat comments | Lead |
| DR19 | Comment commands | "Before a July 2026 update, @claude review subscribed the PR" | n/a | KEEP | Our use is post-July; one review per comment | Lead |
| DR20 | What a later review covers | "focuses on what changed since the last review ... fewer nits" | Lead re-requests after fixes | KEEP | Same diff-only idea as P-277 | lab-fast-route |
| DR21 | Drafts and forks | "a comment command runs on a draft" | Lanes open PRs as drafts sometimes | KEEP | Lead can request before ready; no change | Lead |
| DR22 | GitHub Action alongside | "set the Action's trigger_phrase input to a different phrase" | No claude-code-action workflow on main | KEEP | No clash today; note if one is added | lab-automation |

### DK: Costs and usage (https://code.claude.com/docs/en/code-review-costs) (9 rows)

| # | Section | Concept (short quote) | What we have today | Verdict | Why (one line) | Owner lane |
|---|---|---|---|---|---|---|
| DK1 | Intro | "has no flat per-review price" | Cost per review unknown | ADOPT | Measure before resizing (DK5) | lab-ship-security |
| DK2 | Pricing | "billed on token usage through usage credits, separately from your plan's included usage" | Billed to the org | KEEP | Counts toward P-845's ~US$1,000 month-one agent cap | Lead |
| DK3 | How often reviews run | "After every push: runs on each push, multiplying cost by the number of pushes" | Manual | KEEP | Cheapest mode | lab-ship-security |
| DK4 | How often reviews run | Approvals policy: "reviews can start that the Review runs setting wouldn't" | No policy file | KEEP | No hidden spend (DS14) | lab-ship-security |
| DK5 | Estimate your spend | "Read its average cost per review under Cost ... Multiply" | Not done | ADOPT | After ~10 reviews: average × risky PRs a month; set cap to that × 1.5 (Top 8) | lab-ship-security |
| DK6 | Limit your spend | "configure the limit for the Claude Code Review service" | US$100/month | KEEP | Right until DK5 gives a number | lab-ship-security |
| DK7 | Limit your spend | "skips reviews once what's left is less than the expected cost of one review" | n/a | ADOPT | The gate script treats a budget skip as "no verdict" so a risky PR is not passed silently (DR12) | lab-automation |
| DK8 | Limit your spend | "developers see a comment on the PR that names the cause" | Tips off; budget comment still posts | ADOPT | Lead watch reads "⚠️ Code review skipped" comments and tells the founder if the cap is hit | Lead |
| DK9 | View usage | "claude.ai/analytics/code-review ... Cost figures in analytics can differ from your invoice" | Not read | ADOPT | Monthly read of PRs reviewed, findings, auto-resolved count; invoice is the money truth | lab-automation |

### DT: Troubleshooting (https://code.claude.com/docs/en/code-review-troubleshooting) (8 rows)

| # | Section | Concept (short quote) | What we have today | Verdict | Why (one line) | Owner lane |
|---|---|---|---|---|---|---|
| DT1 | Check how far | "start with the Claude Code Review check run. Its title says how far" | n/a | ADOPT | The gate script keys on the title first (DR12) | lab-automation |
| DT2 | Comment didn't start | "Code Review isn't on ... doesn't meet a condition ... write access ... budget" | n/a | KEEP | Checklist for the Lead when no check run appears | Lead |
| DT3 | No policy rule | "Code review not run: no policy rule uses it" | No policy file | KEEP | Cannot occur without a policy file | lab-ship-security |
| DT4 | Budget message | "has reached its monthly code review spending cap" (and two other wordings) | n/a | KEEP | Read by Lead watch (DK8); re-request after restore | Lead |
| DT5 | Retrigger | "That review is retried once automatically" else comment or Re-run | n/a | KEEP | Lead re-comments only after "failed"/"timed out" | Lead |
| DT6 | Issues not inline | "Check run Details ... Files changed annotations ... Additional findings" | n/a | KEEP | Script reads Details, so inline misses don't matter | lab-automation |
| DT7 | REVIEW.md messages | "default branch, which is not protected against direct pushes" / "branch protection could not be confirmed" | n/a | ADOPT | After REVIEW.md lands, read this message on the first review to confirm it applied (Top 2) | lab-ship-security |
| DT8 | Setup problems | "A repository isn't listed ... No check run appears on the test pull request" | Set up done | KEEP | Checklist for adding the private repo | lab-ship-security |

---

## Row counts

* Page 1 (blog): 106 rows (B1-B106).
* Page 2 (docs, six pages): 108 rows: Overview 29, Set up 20, Customize 20, Read and request 22, Costs 9, Troubleshooting 8.

## Top changes for our lab (ordered by value, at most 8)

1. **A short root `REVIEW.md`, merged first, on its own** (from B21, B22, B89, DC3, DC8-DC14, DC17, DO24). Four headings from the docs example: what Important means here (wrong money, migration not backward compatible, permission leak, wrong immigration value, pipeline break; style is Nit at most), cap nits at three, do not report (lockfiles, generated client, records files, anything CI enforces), always check (3-5 lines copied from existing rules), plus "behaviour claims need file:line" and "summary starts with a count". Generic wording only (public repo, P-504). Owner lab-ship-security. **Cost:** one small PR, US$0 runtime, under an hour. **Risk:** low; a badly worded "do not report" could hide a real bug, so keep it to paths and CI-enforced classes.
2. **Confirm main counts as protected, so the nit cap and skips are honoured** (from DC18-DC20, DT7, B98). Read the first review's REVIEW.md message after item 1; when P-845's ruleset is built, include "dismiss stale approvals on push". Owner lab-ship-security. **Cost:** one settings read plus a line in the P-845 ruleset work. **Risk:** none; without it, REVIEW.md is read only in part or not at all.
3. **Read Code Review's verdict by script on PRs the Lead sent to `@claude review`** (from B32, DO3, DO13, DR11, DR12, DK7, DT1). Title first ("not repeated" = block, "no new changes" = pass), then `normal` > 0 = block, missing line = no verdict. Report-only first per P-717 (b), then the Lead adds it to the risky-path gate. Owner lab-automation. **Cost:** one small CI PR, a few seconds per run, US$0. **Risk:** false blocks on wrong findings, eased by item 4's resolve-with-reason path; never make the check run itself required (it can't fail).
4. **Every Important finding on a risky PR is fixed or resolved with a one-line reason before approval** (from B30, B33, DR4, DR5). Not GitHub's repo-wide "require conversation resolution" (B92: too tight). Owner lab-fast-route. **Cost:** one line in the builder and reviewer briefs. **Risk:** low; adds minutes on 10-15% of PRs.
5. **PR template: add "Risk" and "How to revert" lines** (from B37, B80, B90). Risk names the path tier (ordinary or risky list); revert names the one step back (revert PR, migration down or "additive, nothing to undo"). Owner lab-automation. **Cost:** a few lines; pr-rules may need to accept them. **Risk:** none, small template growth.
6. **Our reviewer converges faster: three lines in its brief** (from B24, B29, B56, B64, B65, DR2). Tag findings Important/Nit/Pre-existing; flag the class of bug, not one line; no repeats of earlier findings; on fix PRs name the root cause; priority "real bugs first, fewer rounds second". Keeps P-293's two-round cap and P-277's diff-only re-review (B62, B63). Owner lab-fast-route. **Cost:** one small edit, no extra tokens. **Risk:** low; check with item 7's set before and after.
7. **A small reviewer eval from our own reverts and main-red PRs** (from B49, B52, B53, B100). 10-20 past cases, each with the layer that should have caught it; run only when the reviewer brief, tools or model change, not daily (B66 not adopted). Owner lab-automation. **Cost:** about one builder day to assemble; tokens per run measured on the first run before it becomes routine (P-295b if paid). **Risk:** stale cases; keep it small and add one case per new revert.
8. **Measure noise, rounds and Code Review cost monthly, with reverts as the guardrail** (from B2, B9, B12, B54, B61, B67, B101, B105, DS9, DK5, DK9). Builder answers each finding with one of four words (fixed / wrong / intentional / not worth it); count rounds-to-pass from review-rounds.yml; read the per-review average cost after ~10 reviews and resize the US$100 cap as P-845 already asks. Owner lab-automation. **Cost:** a small counting script and a monthly read. **Risk:** low; numbers stay advisory, no new gate.

**One founder decision surfaced (not in the list above, because it re-opens a decided row):** B42. The source says "An agent's approval never counts as a person's"; P-845 chose a Lead machine user (an agent) as the second approver on risky paths, with the founder's account as emergency override. Recommendation: keep P-845 (one-founder company, the human would rubber-stamp code he does not read), and record that this differs from the source on purpose. Two smaller founder choices: B35 (a separate paid security-review pass, recommend not yet) and DO18 (review level for the private factory repo, recommend Standard until cost is measured).
