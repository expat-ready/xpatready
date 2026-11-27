# Lean team plan: three founders, one developer, AI agents

Written 26 Nov 2026, 00:3x IST, by the tech lead for the founder and his co-founders (ask A395). Read-only study: nothing was changed, run or merged. Every number names its source. Where we have no number, it says so.

**The question, as we understood it.** What have we learned from the team's production code and from our AI "lab"? If the company were rebuilt lean, the way a YC-style startup that wants to raise money would be, what team would it need: how many developers, how much QA (manual and automated)? How would one developer and three founders split the work from shaping to building to testing? How much human guidance does the lab really need, given that the founder mostly asks for status? What skills does each role need?

**The short answer.** Four people are enough: three founders plus one senior developer who runs AI agents. Code is no longer the scarce thing. The scarce things are five jobs only people can do today: deciding what "done" means, judging risk, keeping the agent pipeline steady, testing like a real customer, and opening outside accounts. Give each job one named owner and the lab's main delays go away. Our own numbers show that.

---

## 1. What we learned from the team's production code

Sources: `reference/private/a32-team-integration-study-2026-11-13.md` (a32) and `reference/private/factory-plan-A29-parts-A-B-poc-vs-team-app.md` (A29).

**What it is.** It uses the same technology as our lab, at the same versions: NestJS, Prisma, React, TypeScript and Zod. It is one backend with about 35 business areas, plus a separate web app. The backend is about 1.86 million lines, half of them tests. The web app is about 0.53 million lines (A29).

**What the team does well. We should keep these habits.**
* Serious safety rails. The backend has about 37,000 test cases in about 2,800 files. About 60 automatic checks confirm that every route has a permission, a firm boundary, an audit trail and input checks (a32).
* Strong foundations: firms kept apart at the database row level, a permission catalogue, an audit log that cannot be edited, and a generated contract of 678 API operations with checks that catch breaking changes (a32).
* A clear way of thinking: registries rather than habits, generated code rather than hand-written, "fail closed", and one person who rules on risk.

**What holds them back.**
* **Bus factor of one.** One person approves, releases and holds the emergency bypass, with no backup. In the history bundle we hold, 89% of commits come from one author address (a32). We treat that last figure only as a hint, because the sample is weak (P-516).
* **Breadth before finish.** Of 176 feature cards, 1 is built, 56 are partly built and 119 are not built (A29, a32; not re-checked since 13 Nov). There is still no Case record, and filing and form preparation both depend on it.
* **No speed measures.** Nobody records how often they release, how long a change takes, how often a change fails or how fast they recover. Their web app has no automatic checks we can see.
* The second-reviewer step for pull requests is only about 5 weeks old.

**What we reuse.** Their libraries and conventions, their requirements (they are our spec), their style guide and components, and their XFA form engine as a base. Head to head, theirs wins on running a form's own checks and on showing the filled form. Ours wins on writing, reading and signing the PDF (`design/xfa-reuse-analysis-2026-11-11.md`). Moving our work into their product was paused on 14 Nov and can be resumed (P-569).

**The lesson.** Their code is well engineered but slow to finish, because a few people spread over many areas, and everything waits on one approver. More rules would not fix that. Narrower scope would, plus a second trusted reviewer and finishing one thing before starting the next.

## 2. What we learned from the lab (AI agents building the product)

Sources: `design/why-targets-missed-2026-11-24.md` (W), `reports/pipeline-pain-points-2026-11-09.md`, `reports/bottleneck-audit-2026-11-03.md`, `git log origin/main`, `qa/CAPABILITIES.md`, `DECISIONS.md`. The weekly counts come from merge commits on main. GitHub's own figures could not be read from this machine tonight.

**AI produces code fast and cheaply.**

| Measure | Number | Source |
|---|---|---|
| Changes merged, 19 Oct to 25 Nov | 1,776 pull requests (about 1,490 by builders) | git log |
| Busiest weeks | 520 (week of 3 Nov), 518 (week of 17 Nov) | git log |
| Size of the lab app | about 0.19 million lines, 48% tests, 0.1-0.6% repeated code | A29 |
| First capability list | 54 of 98 working on 3 Nov, 99 of 112 working on 25 Nov | qa/CAPABILITIES.md history |
| Release 1 list | 63 of 110 working (26 Nov) | STATE |
| AI usage cost | about US$4,200 a month | P-554 |

**Finishing is slow.**

| Measure | Number | Source |
|---|---|---|
| Capabilities proven per day | 4.7 (target was 10-15) | W |
| Merges needed per proven capability | about 10 | W |
| Merge test runs that fail | 33% (121 of 368) | W |
| Of the real defects, already visible before the queue | 18 of 33 (the check only warned) | W |
| Pull requests changed again after approval | 38% (94 of 249) | bottleneck audit |
| Review rounds per builder pull request | median 3, worst 16 | W |
| Capabilities demoted after being "working", 1-3 Nov | 18 | bottleneck audit |
| Capabilities that need an account only the founder can open | 14 of the 46 unproven | W |

**How much human guidance the lab needed.** This answers "I don't talk much; I only ask for status."

| Measure | Number | Source |
|---|---|---|
| Founder asks recorded since 21 Oct | about 395 (A1 to A395), about 10 a day | STATE "Founder asks" |
| Decision rows written | about 700 in 5 weeks, about 25 a day | DECISIONS.md |
| Rows that cite the founder | 444 of 702 | DECISIONS.md |
| Recent rows that are product choices | about 3 of 34 (20-22 Nov) | sample read |
| Recent rows that are process rules or corrections of agent mistakes | about 20 of 34 | sample read |
| Rules enforced by a machine | 38% (62% are prose only) | W |
| Merges that were the pipeline itself, not product | 19% | W |
| "Lead" agent sessions in 35 hours | 32 (median life 60 minutes) | W |

**What this means, plainly.**
1. **A short status question still costs a lot of guidance.** Every status answer surfaced a problem, and every problem became a new rule. About 10 asks a day turned into about 25 decisions a day, and most of them were about the process, not the product. Without a steady human owner of the process, agents build process around themselves. One merge in five was the pipeline working on itself.
2. **The real limit is steering, not typing.** Code, tests and reviews were plentiful. The delays were these: rows not shaped well enough (about 10 merges per capability), checks that warned instead of blocking, one coordinator agent replaced every hour, and outside accounts that only a person can open.
3. **AI agents need a human for five things.** (a) Writing a clear "done when" for each piece of work. (b) Ruling fast on money, permissions and the database. (c) Owning the pipeline, so rules become checks and not paragraphs. (d) Testing like a real customer, with taste. (e) Opening accounts, signing terms and paying.
4. **Quality from agents is real, but only when checks force it.** The lab's best results came where a machine checked the work: the merge queue, independent qa verdicts and cited immigration values. Its worst came where a rule lived only in text.

## 3. The lean team: three founders plus one developer

Public context (labelled; we did not verify it ourselves): in YC's W25 batch, a quarter of startups had codebases that were about 95% AI-written ([TechCrunch](https://techcrunch.com/2025/03/06/a-quarter-of-startups-in-ycs-current-cohort-have-codebases-that-are-almost-entirely-ai-generated)). One blog analysis of the YC directory puts the median 2026 team at two people ([DEV post](https://dev.to/eliofbm/yc-2026s-most-telling-number-is-2-the-two-person-company-is-the-new-default-10oi)); that is not an official YC figure. A four-person team with AI agents is normal for a seed-stage pitch today.

### Who does what

The founders' names and strengths are not in our records. The three founder seats below are roles, and which founder takes which seat is your choice.

| Seat | Owns | Time on the product | Never does |
|---|---|---|---|
| **Founder A: product owner** (CEO) | What we build and why. Shapes every piece of work (job, examples, "done when"). Accepts or rejects it on the demo. Fundraising and the story for investors. | About 1.5-2 hours a day: 30 minutes shaping, 30-45 minutes of acceptance walks, and decisions in one batch | Watching pipelines, asking for status (the dashboard answers) |
| **Founder B: customer and domain** | Immigration practice and rules from official sources, customer interviews, pilot firms. Manual "customer" testing: walks real cases end to end each week. | About 1 hour a day of testing and domain answers | Writing tests or code |
| **Founder C: business and operations** | Accounts and vendors (payments, e-signature, cloud, sign-in), legal and counsel, security questionnaires, pricing, release notes to customers. Second manual tester before each release. | About 30-60 minutes a day on product matters | Product scope decisions (Founder A owns them) |
| **The developer: engineering lead and agent operator** | Architecture, the agent pipeline (builders, reviewer, qa and breaker agents), CI and the merge queue, risky reviews (money, permissions, schema, migrations), releases, on-call, security basics, and the dashboard of measures. | Full time. About 70% steering and reviewing agents, about 30% hands-on | Product choices on their own; being the only copy of any knowledge (everything lives in the repository) |
| **AI agents** | Writing code and tests, first review, automated customer journeys (browser tests), regression runs, documentation, first drafts of shaping. | Around the clock, 3-6 builders at a time | Merging risky paths without the developer; deciding product questions |

**Paid help, not hires:** a security test before launch, immigration counsel (a regulated consultant) for legal points, and short design reviews. Each is a few days a quarter.

**When to hire the second engineer.** When any one of these holds: paying firms need someone on call outside the developer's hours; the developer's review queue is the bottleneck for more than a week; or the seed round closes. Investors will ask about the bus factor of one. The answer is "everything is in the repository, and engineer two is the first hire after the round".

### QA: who tests what

| Layer | Who | When |
|---|---|---|
| Unit and API tests | Builder agents write them; CI runs them on every change | Every change |
| Automated customer journeys (browser) | qa agent writes them ahead of the build from the "done when"; the developer owns the framework | Every change; full run nightly |
| Independent verdict per capability | A fresh qa agent that did not build it | When the last part merges |
| Break-it pass | Breaker agent, only for money, permissions, schema and new screens | Before merge |
| **Manual acceptance** ("does it feel right?") | Founder A, 30-45 minutes a day on the demo | Daily |
| **Manual customer walk** (real cases, edge cases) | Founder B weekly; Founder C before each release | Weekly and before each release |
| Security test | Outside firm | Before launch, then twice a year |

So we do not need a full-time QA person. Automation is done by agents, the framework is owned by the developer, and taste and real-world cases come from the founders. One rule from the lab: **a check that finds a real defect must block, not warn** (18 of 33 lab defects were visible early and were let through).

## 4. The way of working, start to finish

| Step | What happens | Owner | Proof it is done |
|---|---|---|---|
| 1. Shape | One page per piece of work: the job, 2-3 real examples, "done when" in a customer's words, what is out of scope. An agent drafts it; Founder A edits and approves. The developer adds the files it touches and the risk. | Founder A + developer | Approved shaping page |
| 2. Slice | Cut it into pieces a builder can finish in a day, at most 3 pieces per capability and about 400 changed lines each. (The lab averaged about 10 merges per capability, which was too long a chain.) | Developer | Each piece has its own test |
| 3. Build | Builder agents work in parallel, one piece each, in areas that do not overlap. | AI, steered by the developer | Pull request open with tests |
| 4. Check | Full tests on the pull request itself, reviewer agent, and the developer's own read for risky paths. | AI + developer | Green and approved |
| 5. Merge | Merge queue, small batches. Flaky tests are fixed the same day, not retried forever. | Developer | Merged to main |
| 6. Prove | qa agent verdict plus the automated journey, then Founder A's acceptance walk on the demo. | AI + Founder A | "Works" on the dashboard |
| 7. Release | Local, then staging, then production, weekly at first. Founder C sends the customer note. | Developer + Founder C | Live, with a rollback plan |
| 8. Learn | One page a week: the four delivery measures (how often we release, how long a change takes, how often a change fails, how fast we recover), customer feedback, and the next week's order. | Developer + all founders | Monday review |

**Weekly rhythm.** Monday: 45 minutes, all four people, to agree the week's order. Daily: 10 minutes, the developer and Founder A, on decisions only. Friday: 30 minutes, a demo to all four. No other meetings. Status comes from the dashboard, not from asking.

## 5. How much guidance is right

The lab ran on "ask for status", and it cost about 10 asks and 25 decisions a day, mostly about process. The lean model swaps that for a fixed, smaller set of moments:

| Who | Guidance a day | What kind |
|---|---|---|
| Founder A | about 1.5-2 hours | Shaping, acceptance, about 3-5 product decisions in one batch |
| Founders B and C | about 30-60 minutes each | Domain answers, manual walks, accounts and vendors |
| Developer | full time | Turns every repeated problem into a check, not a rule in text; steers the agents |

**Why this works where the lab struggled.** The process gets a steady human owner (the developer) in place of an agent replaced every hour. Product rows arrive shaped, so they take fewer review rounds. Outside accounts get an owner (Founder C) and are opened weeks ahead, not when a row is blocked.

## 6. Skills for each role

**The developer** (one senior hire: the most important person after the founders)
* Senior full-stack TypeScript: NestJS, Prisma and PostgreSQL, React. Five or more years, and has shipped a business app to real users.
* System design for a multi-firm product: data separation, permissions, audit trails and database migrations.
* Testing and CI: Playwright browser tests, GitHub Actions, merge queues, handling flaky tests.
* **Runs AI agents in practice:** has used Claude Code or a similar tool in daily work, writes clear briefs, reviews agent code critically, and manages context and cost.
* Security basics: sign-in, secrets, the OWASP top 10.
* Product sense, clear writing, and the confidence to say no to scope.
* **How to test for it:** a paid one-week trial on a real row of our backlog, using our agents. Judge the shaped slices, the review comments and what reached "Works", not the lines written.

**Founder A (product owner):** writes a clear "done when" with examples, cuts scope, and judges a demo quickly and fairly.

**Founder B (customer and domain):** knows the immigration domain or works closely with practitioners, checks facts against official sources, and tests patiently with real cases.

**Founder C (business and operations):** handles vendors and contracts, compliance questionnaires, pricing and customer communication. Organised with accounts and dates.

## 7. The investor story in one paragraph

Four people, with AI agents doing most of the writing and checking of code. Our measured lab shows 1,776 changes merged in five weeks for about US$4,200 a month in AI usage. The humans own only what needs judgement: what to build, risk, real-customer testing and accounts. Quality comes from checks that block, not from headcount. The next hire is a second engineer after the round, to end the bus factor of one.

## 8. Before anyone leaves: points to settle first

* **Keep the knowledge.** Before anyone in the current team leaves, capture what they know into the repository: how releases work, where credentials live, open risks, and the unpushed XFA branches.
* **Code ownership and contracts.** Who owns the code we write into their repository, and who carries the liability for a filing error, is not written down anywhere. *Unconfirmed: no counsel.* Employment and contract steps need a lawyer. This plan is not legal or HR advice.
* **The lab today.** The same changes help the lab now: a steady pipeline owner, blocking checks on pull requests, shaped rows of at most 3 pieces, and outside accounts opened early.

## Recommended split of the seats (founder asked, 26 Nov)

This is the tech lead's recommendation, based on what our records show about each founder. Roles only, no names.

| Founder | Recommended seat | Why |
|---|---|---|
| **The CEO founder** (licensed immigration consultant, an RCIC, according to their email signature; owns the company; already product owner of the specs) | **Founder B, customer and domain, plus CEO and fundraising.** Leads the pitch, rules on immigration facts and on spec changes, signs up pilot firms, and does the weekly real-case walk. | Investors back a regulated domain expert as CEO. They already rule on the specs. Their time is better spent on customers and money than on daily shaping. |
| **The founder who runs the lab** (gave about 395 asks to the agents since 21 Oct and knows the pipeline best) | **Founder A, product owner.** Shapes every piece of work, does the daily acceptance walk, works side by side with the developer, and feeds the CEO the demo and the numbers for the pitch. | This founder already does the job, and the lab shows where it needs to change: fewer status asks, more shaped rows with "done when". |
| **The third founder** (strengths not in our records) | **Founder C, business and operations**, unless their strengths fit B or A better. Owns accounts, vendors, legal and counsel, pricing, and the pre-release manual test. | The 14 lab rows blocked on outside accounts show that this seat must have an owner from day one. |

**What changes from the first draft:** fundraising moves from Founder A to the CEO founder, so the product owner keeps 1.5–2 hours a day for shaping and acceptance. The CEO's product time is about 1 hour a day, plus the time they spend fundraising.

**Confirmed by the founder, 26 Nov (00:44 IST): "Yes, keep it".** Still to agree with the CEO founder: whether the CEO founder agrees to give spec rulings in one weekly batch rather than one at a time.
