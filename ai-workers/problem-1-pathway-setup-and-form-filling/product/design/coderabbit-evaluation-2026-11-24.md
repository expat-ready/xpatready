# CodeRabbit and CodeAnt AI for our pull requests: evaluation, 24 Nov 2026

Read-only study for the tech lead. Nothing installed, no account, US$0. Web pages read 24 Nov 2026. **[V]** = the vendor's own claim, not tested by us. **[I]** = our inference. "Unknown" = not stated on the pages read. Draft settings: `coderabbit-draft-2026-11-24.yaml` (not live).

**Names.** "Code Rabbit" is read as CodeRabbit. "Code and AI" is read as **CodeAnt AI**; the founder has not confirmed this. It could be Codium AI, now Qodo (section 5). **Budget (founder, 24 Nov):** at most US$100 a month, a cap and not a target.

## Recommendation

**Buy nothing and install no GitHub App today. On 25-26 Nov, replay our own known misses through three reviewers on the same 28 PRs: our Opus reviewer with a better checklist, CodeRabbit's command line and CodeAnt AI's command line. Keep only what finds something the others miss. Spend: US$0.**

| His question | Answer |
|---|---|
| Best fit for us | **Our own Opus reviewer, given the requirement clause and a checklist of escaped Majors.** No per-author limit, no new access, already the gate. It must still prove it in the replay |
| Best outside fit | **CodeRabbit's free route**, if he accepts that it may train on our code: US$0, published limits, a review can be run without giving it write access. **CodeAnt AI if he does not accept that** |
| Best in class experience | **CodeRabbit, by its documentation:** on-demand review, deepest settings, published limits, structured output for agents. Nobody's quality on our code is proven |
| Where CodeAnt AI is better | Its data promise ("We never train AI models on your data"), a flat price with no published per-author limit, no write to workflows, security scanning and quality gates sold with review |
| Two side by side? | **No, until the replay shows each finds true Majors the other missed.** Two paid seats would be US$60 a month, inside the cap but not justified |

* **The need is real.** qa logged 11 Majors from 17 to 24 Nov that a reader of the diff could arguably have seen (section 6). Our own reopen rule was "3+ diff-visible Majors in a week". Even the strict count is 5.
* **The fit is awkward.** One account opens all our PRs. CodeRabbit's limits follow that account, and its docs call this "a trap when automation opens the pull requests".
* **The price of free is our code.** Its privacy policy says of open source: "We use OSS to train our systems." Our repository is public but "All rights reserved". Whether we count as "OSS" is unknown; its OSS page says being public is "the whole bar", so assume yes.
* **The App asks for a lot:** write access to code and workflow files. P-662 (17 Nov) limited Apps to three because of "fewer apps with write access to a public repository". Installing needs the founder to reverse that by name.
* **Independent proof of quality is thin.** The only per-tool figures we could read are a rival's.
* **Cost:** recommended now **US$0 a month, US$0 a year**. If one later earns a seat: CodeRabbit Essentials **US$30 a month (US$360 a year; US$288 paid yearly)** or CodeAnt review **US$24-30 a month (US$288-360 a year)**. Usage charges off either way.
* **First founder click:** none on GitHub yet. Answer one question: may CodeRabbit receive our code, knowing it may train on it? Yes leads to step A1. No leads to the CodeAnt steps only (C1).

## 1. CodeRabbit products, under today's names

The names the founder gave all exist: Review, Explain, Verify, Agent, Triage. Plans were renamed: Pro is now Essentials, Pro+ is now Team (docs.coderabbit.ai/management/plans).

| Product | What it does | Plan | Writes? | Us |
|---|---|---|---|---|
| Pull request review | Comments on a diff; check named `CodeRabbit` | Essentials and up; OSS free | Comments, check | **Trial (phase B)** |
| Command line (CLI), open beta | "Get AI code reviews directly in your CLI before you commit" | Free: 3 reviews an hour | Nothing in GitHub for a local review | **Trial first (phase A)** |
| Walkthrough and summary | Overview comment; summary put in the PR description by default | All plans | PR text | No: edits re-run our checks |
| CodeRabbit Explain (was Change Stack), preview | A web place to read a PR; can comment, submit a review, merge | Core in all paid plans; chat Team | On a person's click | No |
| CodeRabbit Verify, open beta since 17 Nov | Runs the app and checks behaviour; "free during the beta" | Beta | One PR comment; bugs to Coding Agent | Later: compare with qa walks on a throwaway copy |
| CodeRabbit Triage | One ranked queue of open PRs; rules can merge, close, auto-fix | Team; free for open source | Yes | No: Mergify and the lead board do this |
| CodeRabbit Agent (Slack early access, Discord limited) | Chat agent that can open PRs | US$0.40 a minute | Yes | No |
| Coding Agent, open beta; Fix comments; Autofix; Fix CI; conflicts; unit tests; simplify | Writes code to the branch or a stacked PR | Fix comments Essentials; most others Team; Autofix unknown | Commits | No: our builders own fixes |
| Plan and Issue Planner | Coding plan from an issue | Team | Issue comment | No |
| Pre-merge checks | Title, description, issue checks; own checks from Team | Essentials, Team | Check | Later: we have pr-rules |
| Post-merge actions | Follow-up work after merge | Team | PRs, tickets | No |
| CodeRabbit Security ("Secure" in docs), open beta | PR security review; Deep Scan by usage | Advanced; docs say OSS PRs get security reviews | Check | Later: before first customer |
| Learnings, linked repositories, MCP, API, skills, editor plug-ins, reports, dashboard | Memory, context, access, reports | Varies | Mostly no | No |

Sources: docs.coderabbit.ai pages `/change-stack`, `/verify`, `/triage`, `/agent`, `/code`, `/cli`, `/finishing-touches`, `/plan`, `/pr-reviews/pre-merge-checks`, `/pr-reviews/post-merge-actions`, `/security`, `/changelog`; coderabbit.ai/oss.

## 2. Price and limits

**Not one fixed price: a monthly price per developer who opens PRs, plus optional usage charges.** "you will only be charged for developers who create pull requests" (coderabbit.ai/pricing).

| Plan | Monthly, per developer | Paid yearly, per month | One seat a year | PR reviews an hour | Falls to 1 an hour at |
|---|---|---|---|---|---|
| Free | US$0 | US$0 | US$0 | summary only | - |
| Open source (public) | US$0 | US$0 | US$0 | 1-10, by stars | unknown |
| Essentials | US$30 | US$24 | US$360 / US$288 | 5 | 60 reviews in 7 days |
| Team | US$60 | US$48 | US$720 / US$576 | 8 | 70 |
| Advanced | US$90 | US$72 | US$1,080 / US$864 | 10 | 80 |
| Enterprise | on request | on request | unknown | 12 | by contract |

* **One account opens all our PRs:** one seat. GitHub lists it as a User, not a bot. App bots "never get a paid seat automatically" (`/management/seat-assignment`). More seats do not help: "Capacity follows the identity that opens the pull request" (`/management/rate-limits`).
* **Public repository:** free OSS tier with Team features, "no credit card required". **We have 0 stars. Under 10 stars "CodeRabbit requires reviews to be triggered manually"** (`/management/plans`). The exact hourly limit at 0 stars is unknown; we plan for 1.
* **Whether a paid plan or the trial lifts that manual rule on a public repository: unknown.** Ask CodeRabbit before paying.
* **Trial:** 14 days of Advanced for a new organisation; "No credit card is required". Not subscribing returns it to Free (public repositories then use OSS limits [I]). Over-limit reviews cost US$0 during the trial; charging needs a payment method.
* **Usage charges (optional):** US$0.25 a file. After a paid switch-on the cap defaults to "Unlimited", so leave it off. Coding Agent US$0.40 a minute.

**Our volume** (sample: GitHub public API and `main` history, 17 Nov 06:00 to 24 Nov 06:00 UTC):

| Measure | Value |
|---|---|
| PRs opened by the one account | 600 (busiest hour 29) |
| of those merged | 534 |
| Mergify batch PRs (bot; must be skipped) | 743 |
| PR merges on main | 549, changing 5,980 files |
| of those, changing product source | 234; 1,904 code and test files, median 7, 90% at most 14, largest 53 |
| of those, money, migration or permission paths | 74; 738 files, median 8.5 |

The path rule is a filename match (client-money, migrations, permission), so 74 is an approximation. The API count goes by creation date and the main count by merge date, so 534 and 549 differ.

**What US$100 a month would cover (a cap, not a target):**

| Way of paying | Inside the cap? |
|---|---|
| Essentials, one seat | Yes, US$30; US$70 unspent |
| Team, one seat | Yes, US$60; US$40 unspent |
| Advanced, one seat | Yes, US$90; US$10 unspent |
| Extra files only | 400 files, about 49 product PRs at our mean of 8.1 files |
| Every product PR by usage only | 1,904 x US$0.25 = US$476 a week: about 1.5 days |
| Only the 74 risky PRs by usage | 738 x US$0.25 = US$184.50 a week: about 3.8 days |
| Every merged PR by usage | 5,980 x US$0.25 = US$1,495 a week: about half a day |

These usage rows are a ceiling: one review per PR and nothing included in a seat. A seat's slowest band is 1 an hour, at most 168 a week: enough for 74 risky PRs, not enough for 234 plus re-reviews. A busy hour of 29 would wait.

## 3. Access, data and attack surface

| Question | Answer | Source |
|---|---|---|
| Read | Actions, discussions, members, metadata, merge queues | `/platforms/github-com` |
| Read and write | Checks, **code**, commit statuses, issues, pull requests, **workflows** | same |
| Can part be refused? | Repositories can be chosen. The page lists the permissions as required; refusing some is not described | same |
| Why workflows? | For an agent asked to fix CI; "Reviewing does not modify workflow files" [V] | same |
| Approve | Can, off by default (`auto_approvals.enabled`). If on, PR authors may run `@coderabbitai approve` by default | `/pr-reviews/automatic-approvals` |
| Merge | Automatic Approvals does not merge. Triage rules and Explain can | same; `/triage`, `/change-stack` |
| Start our workflows | Its comments start `issue_comment` runs. Its labels would start label runs. Pushed commits would start CI [I] | our workflow files |
| Outsiders talk to it | **Yes by default** (`chat.allow_non_org_members` true). Commands that change a branch need write access | `/reference/configuration`, `/reference/review-commands` |
| Our settings file | By default read from the trusted PR's own branch, so a lane could change its own review rules. Pin the source | `/configuration/branch` |
| Retention | No source kept after review, except cache up to 7 days, "encrypted (except for OSS projects)". Learnings stored unless opted out | `/reference/caching`, privacy policy |
| Training | Customer code: no. **"The above representation does not apply to open-source projects (OSS). We use OSS to train our systems."** The terms (3.3) say customer code is not used; the two texts conflict for us | privacy policy; terms |
| Model providers | OpenAI, Anthropic or others; zero-retention policy with them [V] | terms 3.3 |
| Certificates | SOC 2 Type II claimed [V]; report not seen; ISO not found | privacy policy |
| Terms | Auto-renews; 45 days' written notice; no refund for ordinary ending; liability capped at 12 months' fees; California. The FAQ has a self-serve cancel: the two texts differ | terms 5.1, 5.4, 11.2, 13; FAQ |
| Past incident | Kudelski Security: code execution through a PR's linter settings, disclosed Jan 2025, published 19 Aug 2025; "about 1 million repositories" reachable (their article, part read through a summary). CodeRabbit: fixed within hours, "no evidence that any customer data was accessed" [V] | kudelskisecurity.com; coderabbit.ai/blog |
| Prompt injection | No statement found on the pages read. It reads attacker-controlled PR text on a public repository, so assume it can be steered; its comments can in turn steer our lanes [I] | - |
| Fork PRs | Settings come from the base commit; Fix comments does not run. General fork review: unknown | `/configuration/branch` |

## 4. Where it would fit

Builder's PR, then in parallel CI and **the fresh Opus reviewer (the only approver)**; breaker for risky PRs; queue gate; Mergify batch; qa on main. CodeRabbit would be a second opinion beside the Opus reviewer, reading after that verdict is posted, so the comparison stays fair.

* **Its "approve" cannot count as ours.** `queue-gate.sh` (lines 189-190) counts only the owner's or a `REVIEWERS` login with OWNER, MEMBER or COLLABORATOR association. `review-rounds.py` (lines 40-43) ignores bots. Never add it to `REVIEWERS`. Not in `.mergify.yml`: no condition names a `CodeRabbit` check in the queues we read.
* **A label it put on would be removed:** `label-guard` re-checks for our Approve on every `review: approved`.
* **Never make its check required:** a rate-limited review posts a passing check, "Review rate limited".
* **Default settings would hurt us on day one.** Its summary edits the PR description; `pr-rules` and `lead-read` run on `edited`. So the settings file must be on main before the App is installed.
* **Noise:** each comment starts events for four workflows; most jobs skip, but `review-rounds` runs when the text says "reviewer". Automatic review would add up to one walkthrough per PR (600 a week).
* **Token cost to lanes:** unknown until measured. Rule: lanes never read or obey its text. One triage reader judges findings once a day and passes only confirmed ones to the lead.

## 5. Alternatives

| Option | Price, as read 24 Nov | One account, 600 PRs a week | Public repository | Can approve? | Trains on code? | New write app? |
|---|---|---|---|---|---|---|
| Do nothing | US$0 | Fine | - | - | No change | No |
| **Improve our Opus reviewer** (requirement clause plus a checklist from escaped Majors) | No purchase; plan tokens, unmeasured | Fine | - | Already does | No change | No |
| **CodeRabbit CLI** | Free 3 an hour; OSS 3 | Slow but enough for a replay | Unmatched repository falls back to free | No | Assume yes | **No** |
| CodeRabbit App, OSS | US$0 | Manual, 1-10 an hour | Yes | Off by default | Assume yes | Yes |
| CodeRabbit Essentials | US$30 a month | One seat; 1 an hour after 60 a week | Plan rule unknown | Off by default | Conflict in texts | Yes |
| Claude Code Review (managed) | Token usage, "no flat per-review price"; Team or Enterprise | Billed to the organisation | Unknown | Only with a policy file | Not stated there | Claude App already installed; scope not checked |
| Copilot code review | about US$0.25 Lite, US$1.50 Balanced, US$10 Max a review, plus Actions minutes [V] | Bills by usage | Unknown | Not counted by default | Not stated there | GitHub's own |
| Cursor Bugbot | Usage; rate not on the page | Capped for bot PRs | Switch exists | Not described | No in privacy mode [V] | Yes |
| Greptile | US$1 a credit; base review 1 | "no seat fees"; 74 a week = US$74, about US$320 a month | OSS programme needs an OSI licence: not us | Unknown | Unknown | Yes |
| Qodo | US$30 for about 14 reviews | "No rate limits"; 74 a week about US$159 a week | Programme, by application | Unknown | "does not train" [V] | Yes |
| Graphite | US$20-40 a user, yearly | Unknown | Unknown | Unknown | Unknown | Yes |
| Sourcery | Free for public repositories; US$12-24 a seat yearly | Limits unstated | **Yes** | Can auto-approve low risk | "never used to train" [V] | Yes |
| PR-Agent (open source, MIT) | Own model key | Our machines | Yes | Unknown | Provider's terms | Our own workflow with write to PRs |

Arithmetic: Greptile 74 x US$1 x 4.33 = US$320. Qodo US$30 / 14 = US$2.14 a review x 74 = US$158.57 a week. Sources: code.claude.com/docs/en/code-review, docs.github.com/en/copilot/concepts/agents/code-review, greptile.com/pricing, cursor.com/docs/bugbot, qodo.ai/pricing, graphite.com/pricing, sourcery.ai/pricing, github.com/The-PR-Agent/pr-agent.

**Why this order.** Best in class is not proven for our code by any source. The cheapest strong rival is our own reviewer with the misses as a checklist, so the replay runs both on the same PRs. Sourcery is the fallback if training is the founder's blocker (its claim untested).

**Quality evidence.** Martian's Code Review Bench is the open benchmark (50 PRs, 173 known issues) and lists CodeRabbit; its per-tool scores did not load, so we quote none. A rival's blog (Augment, dataset edited by the rival): CodeRabbit precision 36%, recall 43%; Bugbot 60/41; Greptile 45/45; Claude Code 23/51; Copilot 20/34. Read as direction only: about two in three CodeRabbit comments were not on that list of real issues, and over half the issues were missed.

### CodeRabbit and CodeAnt AI, same criteria

| Criterion | CodeRabbit | CodeAnt AI |
|---|---|---|
| Products | Section 1 | AI Code Review; Code Quality (gates, coverage, dead code); Code Security (SAST, dependencies, secrets, SBOM, infrastructure code); Cloud Security; DAST; attack surface; pentest; command line; editor plug-ins; MCP; Claude Code skills |
| Which we need | Review only, as a trial | Review only, as a trial. Code Security later, before the first customer |
| Price, one developer | US$30 monthly, US$24 yearly (Essentials) | Review US$24 paid yearly; "$24-30 / user / mo" on its comparison page; an older blog says US$10. **Prices conflict: confirm before paying.** Review plus Security US$40 paid yearly. Cloud, DAST and pentest (US$199 to US$4,000 and up) are outside the cap |
| A year, one seat | US$288-360 | US$288-360 (review); US$480 with security |
| One account, 600 PRs | Slows to 1 an hour | "Unlimited code reviews", "No charge per pull request, ever" [V]; bots and shared accounts: not stated |
| Public-repository plan | Free; manual under 10 stars | **Not found.** GitHub Marketplace shows a US$0 entry, contents not stated |
| Trial | 14 days, no card | 14 days [V blog]; card and what follows: not stated |
| App permissions | Write code, PRs, issues, checks, statuses, **workflows** | Write code, PRs, issues, checks, statuses, **and profile**; read **administration**, hooks, organisation administration. **No workflows write** |
| Approve | Off by default | "The default is Disable" |
| Merge, labels, commits | Triage rules can merge; agents commit | Merge not found; can add labels; commits from a person's click; security fix PRs sold |
| Training | Says OSS is used to train | "We never train AI models on your data"; terms 7.3 the same. No public-code exception found |
| Retention | Cache up to 7 days unless off | Source "Never stored. Deleted when each scan or review completes." Findings kept for the contract |
| Where processed | Providers named: OpenAI, Anthropic | US, UK, India, or EEA if chosen; model vendors not named on the pages read |
| Certificates [V] | SOC 2 Type II | SOC 2 Type II and HIPAA programme |
| Terms | Auto-renews; 45 days' notice in terms; cap 12 months' fees | Auto-renews; cancel any time, ends at period end; no refund; cap 12 months' fees (twice for data protection); California |
| Incident or injection statement | 2025 code-execution finding, fixed; no injection statement found | None found for either; absence proves nothing |
| Set-up and daily use by our agents | Local command line `--agent` output and `--base-commit`; settings file; label and on-demand control | `codeant review --headless` JSON, `--base-commit`, MCP "read-only by default", Claude Code skills. **The command line falls back to a signed-in `gh` token by itself**, so run it with none present |
| Automatic review | Off in our draft | "reviews new pull requests automatically"; setting exists, default and label control not found |
| Merge fit | Advice only, section 4 | Same; its failing status check and auto-labels must stay off. Our gates ignore its Approve for the same reason |
| Security scanning | Security review on Advanced; free for OSS PRs [V] | Broader, as a paid product |
| Quality evidence | Rival's blog: 36% precision, 43% recall | Its own post of a Martian table: 52% precision, 51% recall, third. **CodeRabbit is missing from that table, so the two figures cannot be compared** |

Independent user-review pages were blocked or thin. On set-up and daily experience this table compares documents, not use. Sources: codeant.ai/pricing, codeant.ai/comparison/coderabbit, codeant.ai/lp/coderabbit, codeant.ai/privacy-policy, codeant.ai/terms-and-conditions, github.com/marketplace/codeant-ai, docs.codeant.ai (`/cli/review`, `/cli/setup`, `/cli/mcp-server`, `/pull_request/features/auto_approve_pr`).

## 6. Back-test on our own history

**qa Majors.** Sample: every Major or Critical row in `qa/BUGS.md` and `qa/BUGS-CLOSED.md` whose found or re-raised date is 10 to 24 Nov: 47 rows, sorted by hand by one reader from the row text. The introducing diffs were not opened, and no tool was run. This says what was arguably visible, not what CodeRabbit would find.

| Class | Rows | Share |
|---|---|---|
| Arguably visible in a diff | 14 | 30% |
| of which clear without the requirement text (strict) | 5 | 11% |
| Not visible: feature not built, wording, usability, flaky test, CI or environment | 33 | 70% |

* Strict 5: QA-517 (a Read-only handler could act), QA-520 (damaged PDF stored), QA-526 (normaliser on one route only), QA-601 (failed send counted wrongly), QA-770 (withdraw leaves the signing request live).
* Other 9: QA-397, QA-453, QA-499, QA-510, QA-595, QA-608, QA-701, QA-750, QA-751. Most need the requirement clause, which our reviewer could be given and CodeRabbit would not have.
* 17 to 24 Nov: 11 (QA-510, 517, 520, 526, 595, 601, 608, 701, 750, 751, 770); strict 5. **The operating model's reopen trigger (3 in a week) is met.**
* All 14 passed our fresh Opus review, or were built before it read that path [I]; the introducing PR of each is still to be found.

**Batch failures.** The last full cause study (`merge-queue-causes-2026-11-16.md`, 24 failed batches): 11 real breaks, every one "a member's own check meeting newer code"; 8 cascades; 5 flaky. A one-PR diff reader would plausibly have stopped about **0 of 24**. In the newest sample (2,998 PR comments, 22 Nov 06:09 to 24 Nov 05:53 UTC) 37 PRs left the queue on failed checks; their causes were not studied.

**Our reviewer is not idle.** Same sample: 606 verdict comments on 220 PRs: 490 Approve, 64 Changes, 52 Block; 73 PRs had at least one refusal.

**Earlier outside reviewer.** Devin reviewed two PRs (#1337, #1834, P-662); `pr-rules.yml` line 74 still carries a true find from #1834. One example, not a rate.

## 7. The trial

| | Phase A: replay, command line | Phase B: live, App |
|---|---|---|
| Dates (IST) | 25-26 Nov | 27 Nov to 3 Dec; decision 4 Dec |
| PRs | 14 with a known escaped Major, plus 14 clean controls of like size, each at its original commit | Next 40 PRs touching money, migrations, permissions or a new screen |
| Baseline | Our original verdict (0 of 14 by construction), fresh Opus reviewer with the new checklist, blind; CodeRabbit and CodeAnt command lines, same commits | Our Opus verdict, already posted |
| True finding | Matches the known Major; or a new Major+ that a second fresh judge reproduces or proves from code | Not in our reviewer's text; reproduced or proved; would be qa Major or above |
| False alarm | A Major+ claim the judge refutes | Same |
| Pass | At least 4 of 14 found, at least half of Major+ claims true, **and at least 2 that the improved Opus reviewer missed.** Two tools pass together only if each finds 2 the other missed | At least 3 unique true Majors in 40, at least half true, at most 10 minutes' triage a PR |
| Stop | Any paid prompt; output not attributable; under 4 of 14 | Any write outside comments, any wrong merge, outsider use, over 70% false after 15 PRs, any charge |

Small samples: 14 and 40 can justify more testing, not a rate. Judges do not see which tool wrote a finding. Report limits reached and minutes spent. If B passes: Essentials, one seat, or stay on OSS if it keeps up. If A fails and the Opus checklist does better: adopt the checklist and close this.

**Effort:** A about 9 hours (3 to find introducing PRs, 2 set-up, 4 judging). B about 8 hours over the week. Easy to install (about 10 minutes); harder to keep safe and to measure.

## 8. Risks and rollback

| Risk | Handling |
|---|---|
| Code used for training | Founder's explicit yes first; cannot be taken back |
| App with write to code and workflows | Select one repository; check main's ruleset first (not verified in this study); uninstall ends access |
| Steered by PR text | Outsiders off, lanes ignore its text, no write feature on |
| Default behaviour before settings land | Settings file on main first, source pinned |
| Rate limit looks like a pass | Never a required check |
| Cost surprise | No card; usage off |
| Two reviewers, one blames the other | Opus line stays the only gate |
| Time from Release 1 | 17 hours capped; P-542: no product row waits |

**Rollback (about 5 minutes):** uninstall the App, sign out of the command line and remove it, delete the CodeRabbit organisation, ask privacy deletion in writing, remove the settings file by PR. Old comments stay on PRs. Code already sent cannot be recalled.

## 9. Gate record (STANDARDS section 1)

* **Problem:** diff-visible Majors reach qa (11 in a week by the generous count, 5 strict).
* **Options:** section 5. **Integration and upkeep:** one settings file, one triage reader, 17 hours; then about 1 hour a week [I].
* **Data and licence:** code goes to the vendor and its model providers; may train on it; proprietary service; open beta command line.
* **Decisions it touches:** P-376 (11) deferred a one-week report-only trial to the founder's OK; P-662 allows three Apps only, so phase B needs it changed by name; P-551 account by the founder only; P-423 the settings file is not in `.github/` but is read as if it were; P-504 public repository.
* **Verdict:** gate **passed for phase A only, once the founder answers the data question; not passed for the App or any purchase.**
* **Reconsider:** 4 Dec, or if the repository goes private (OSS tier ends), or if CodeRabbit puts in writing that we are not training data.

## 10. Set-up list for the founder (the tech lead asks before each step)

Phase A, no GitHub App:

| Step | Click | What it grants | Undo |
|---|---|---|---|
| A0 | Answer: may our code go to CodeRabbit, which may train on it? | The decision | None after sending |
| A1 | Open https://app.coderabbit.ai/login and press **Login with GitHub**, then **Authorize coderabbitai**. Read the terms and the GitHub screen first | Read of your organisations, teams and email; an account; possibly the 14-day clock starts (unknown) | github.com/settings/applications, Authorized OAuth Apps, Revoke |
| A2 | If asked to install or choose repositories: **stop, close the page** | Nothing | - |
| A3 | Say yes to installing the command line (version 0.9.6 or the current one, from docs.coderabbit.ai/cli; checksum checked if published) | A program on the Mac, in a throwaway clone | Remove the program |
| A4 | Run `coderabbit auth login` and finish in the browser | A sign-in kept on the Mac; lets reviews send diffs | `coderabbit auth logout` |

CodeAnt AI arm of phase A (can run alone if A0 is no):

| Step | Click | What it grants | Undo |
|---|---|---|---|
| C1 | Yes to sending the 28 sample diffs, and files it reads around them, to CodeAnt AI, after reading codeant.ai/terms-and-conditions and /privacy-policy | The decision | Written deletion request |
| C2 | Open https://app.codeant.ai and sign in. **If it asks to install the GitHub App, stop and tell the tech lead** | An account; the screen's own sign-in scopes (not seen by us); the 14-day trial may start | Revoke at github.com/settings/applications; delete the account |
| C3 | Say yes to installing `codeant-cli` from npm, exact version and hash recorded first | A program, in a throwaway clone with no `gh` sign-in and no tokens | Remove the program |
| C4 | Run `codeant login`, finish in the browser. No card; if a card is asked, stop | A key stored on the Mac | Remove the key; revoke in the app |

Phase B, only after A passes:

| Step | Click | What it grants | Undo |
|---|---|---|---|
| B0 | Yes by name: change P-662 for a one-week trial | The decision | Say stop |
| B1 | github.com/expat-ready/xpatready/settings/rules: confirm main blocks direct and force pushes and has no bypass for new Apps | Nothing, only a look | - |
| B2 | Tech lead merges `.coderabbit.yaml` (the draft) through a normal PR | Settings only | Revert PR |
| B3 | app.coderabbit.ai, pick `expat-ready`, **Only select repositories**, tick `xpatready`, read, **Install & Authorize** | Write to code, PRs, issues, checks, statuses, workflows on that one repository | github.com/organizations/expat-ready/settings/installations, CodeRabbit, Uninstall |
| B4 | CodeRabbit, repository settings: **Configuration source: Default branch**; switch **Allow configuration changes from trusted PRs** off; Save | PRs cannot loosen the rules | Switch back |
| B5 | Subscription and Billing: no plan, no card; usage-based reviews **Off** where shown (trial over-limit reviews are US$0) | Nothing | - |
| B6 | Comment `@coderabbitai configuration` on one test PR; tech lead compares with the draft | One comment | Uninstall |

## 11. Not known

Whether "code and AI" means CodeAnt AI; hourly limit at 0 stars; whether a label starts a review under the manual rule; whether a paid plan lifts it; whether we are "OSS" for training; whether A1 starts the 14-day clock or the sign-in forces an install; real precision on our code; token cost of triage; who may run non-writing commands beyond the chat setting; main's ruleset today (the one command that would have read it was refused and not retried).
