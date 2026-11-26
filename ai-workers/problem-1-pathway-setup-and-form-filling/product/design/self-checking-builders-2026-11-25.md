# Self-checking builders: testing design (approved 25 Nov 2026, 12:56 IST)

Founder's approval, word for word: "Approve and send" (25 Nov 12:56 IST), after "I would follow your recommendations". Live doc with both diagrams: https://claude.ai/artifact/L8nMu4MsP7H6LV1trZCD5f (private to the founder; this file is the repository copy).

Builders check their own change in a real browser before every commit, five more checks become measurable, and people keep only meaning, taste and real-user walks.

## Founder's recommendation and plan

Adopt all six items, in three build phases from 27 Nov to 6 Dec, built by the pipeline owner lane (OS-PM) and the qa lane. Each check runs as a warning before it can block anything. **Founder ruling 25 Nov 13:04 IST ("Yes, start now"): phase 1 starts now**, with verify (item 1), the budgets (item 2) and the sign-in sweep (item 6b) in Tier 1 of the OS backlog. Nothing changes the merge queue, gates A and B or the required checks during the 48-hour plan. Windows confirmed by Lead 5.

| Phase | Window (IST) | Items | Owners | Gate to the next phase |
| --- | --- | --- | --- | --- |
| 0 Approve | 25 to 26 Nov | founder's decisions; six rows in `design/os-backlog.md`; budgets into `STANDARDS.md` §9 | founder, Lead | founder's go (given 25 Nov 12:56) |
| 1 Verify loop trial | 25 Nov to 27 Nov 12:00 | verify skill (item 1); LCP and CLS budgets (item 2); sign-in sweep (item 6b); one builder lane on a non-critical row from 26 Nov morning, warning only; at 27 Nov 12:00 the Lead decides from the trial numbers | OS-PM, one builder lane | trial: about 5 minutes a commit or less, fewer red runs |
| 2 Widen | 27 Nov 12:00 to 30 Nov | verify on all lanes (if the trial passes); visual compare (item 3) and the design-system rules list: qa starts both at 27 Nov 12:00 | OS-PM, qa lane | each check clean for 24 h or 10 pull-request runs, then required |
| 3 Deepen | 1 to 4 Dec | design-system check (item 4); mutation testing (item 5); first-time-user agent (item 6a) | OS-PM, qa lane | all six live by 4 Dec (mutation after its §1 gate entry) |

| Who | Does | When |
| --- | --- | --- |
| Founder | the five decisions (approved); the Stryker install approval (approved in principle for phase 3, version pinned at install) | 25 Nov |
| Tech lead | adds the six rows to `design/os-backlog.md`; writes the §9 budgets and a decision row; tracks progress at every 30-minute check | 26 Nov |
| OS-PM | builds the verify skill, the budget helper, the sign-in sweep, the mutation workflow and the first-use agent: one pull request each, under 800 lines | 27 Nov to 6 Dec |
| qa lane | makes the reference screenshots and the design-system rules list; scores the trial | 30 Nov to 6 Dec |
| One builder lane | runs the verify trial for 2 days; reports minutes per commit and red runs | 27 to 29 Nov |
| Reviewer and breaker agents | review every pull request; a breaker pass on anything that can block | each pull request |

**How the pipeline stays safe:** every new check starts as a warning (P-717 (b)) and becomes required only after 24 hours or 10 clean pull-request runs, through the Lead's own pull request · verify runs on one lane first; if it adds more than 5 minutes a commit or misses what it should catch, it is switched off by removing one file · pipeline work goes through the pipeline queue (P-827), one item per pull request, under 800 changed lines (P-610) · nothing changes the merge queue, gates A and B or the required checks before the 48-hour plan ends · live AI stays off (US$0 model spend in checks) · verify spends builder tokens, so the trial measures that cost before every lane uses it.

## Why

Our checks are strong after a pull request, but nothing makes a builder prove the change works in the app before it commits. Today a builder is asked to walk its own screens, then the browser checks (109 acceptance packs, 67 recorded walks, accessibility checks in 288 test files, console checks in 283) run only in CI. A miss found there costs a red run and another review round. Three things still need a person's eye: whether the page looks right, whether it jumps or loads slowly, and whether the tests would catch a broken rule.

**Target:** no person clicks to check function, looks or speed. People keep three things: what "correct" means, approving a changed reference screenshot, and the first-use and real-benefit walks (D17, D20).

## The verify loop (diagram in the live doc)

Builder edits app code → the project `verify` skill runs automatically before the commit → five checks at one screen width (walk the journeys the change touches; no console errors and no axe violations; loads within 2.5 s with layout shift under 0.1; screenshot matches the reference; data saved exactly once) → all pass: commit with evidence, then the pull request, where CI gates A and B still decide → a failure: fix and run again, at most 3 rounds, then stop and report.

## The six items

| # | Item | Claude Code base | What we add | Proof it passed | New tool |
| --- | --- | --- | --- | --- | --- |
| 1 | Project `verify` skill, run before every app-code commit | built-in `/verify` and its saved recipe; a project skill named `verify` runs before each commit except docs or tests (Claude Code 2.1.286+; the Mac has 2.1.325) | starts the app on the builder's own copy (`isolated.sh`, never :4400); walks only the journeys the change touches (the packs `gate-b.mjs --diff-groups` already picks); live AI off; about 5 minutes; at most 3 fix-and-retry rounds, then stop and report | items 2-3 plus 0 console errors, 0 axe violations, data saved exactly once; screenshots and scores on the pull request | No |
| 2 | Load and layout-shift budgets | the video's performance trace | LCP within 2.5 s and CLS at most 0.1 (Google's "good" line) added to `STANDARDS.md` §9 beside today's < 1 s first view and < 200 ms filter | the browser's own counters read in the Playwright packs; a miss fails the check | No (Chrome DevTools MCP only later, to diagnose a miss) |
| 3 | Visual compare | Playwright's built-in screenshot comparison | a reference screenshot per screen state at 1024 and 1440 px, dates and ids masked | pixel difference under a set limit; a changed reference needs an approval label | No |
| 4 | Design-system rules as a check | the video's "design system's rules" | the measurable `EXPERIENCE.md` rules: team tokens only, Inter for UI, 14 px text on the 12/16/18/24 scale, at most three type sizes and one primary button per panel, red only for errors, 4.5:1 contrast, 44 px buttons at 375 px, no sideways scroll | read from each screen's computed styles; any breach names the element | small script |
| 5 | Test the tests | none | mutation testing on `engine/` and the rule validators, nightly (today only pipeline guards, `guards.yml`) | mutation score per area; the floor may only rise | Yes: Stryker, through the §1 gate |
| 6 | First-time-user agent (6a) and sign-in sweep (6b) | none | 6a: a fresh agent gets only the goal in a user's words and the screen, records wrong turns and help needed (a stand-in before the founder's D17 walk); 6b: every API route called signed out and with the wrong role | 6a: wrong turns per task; 6b: every route refuses (401 or 403), which also settles Floorplan's 40 "no sign-in" warnings | No |

## Who does what

| Work | Agent | Person | Both |
| --- | --- | --- | --- |
| Functional and end-to-end journeys, regression, API, data underneath, roles | builder (verify), CI packs, qa lane | | |
| Accessibility, screen sizes, speed and layout-shift budgets | builder (verify), CI packs | | |
| Edge cases and break-it | screen-breaker agent, qa lane | | |
| How a screen looks | screenshot compare finds every change | | the Lead approves a changed reference on the founder's behalf |
| Words and tone | terms list and reading level checked | | the founder judges tone on a walk |
| Recorded walk at gate A | records video and trace | | a 2-minute watch instead of clicking |
| What "correct" means (requirements, decisions) | | founder | |
| First use without help (D17) and real benefit (D20) | first-time-user agent filters the obvious confusion | founder or an intended user | |
| Immigration and legal points | cited from official sources | founder, while no counsel is booked | |

## How we will know it worked

| Measure | Today | Target after 2 weeks |
| --- | --- | --- |
| CI runs on pull requests that fail | 12 of the latest 260 judged runs (5%), app and records mixed (GitHub API, 25 Nov ~12:4x IST); app-only rate to be measured before the build | lower on app pull requests |
| Review rounds per app pull request | to be measured before the build | lower |
| Defects found after merge by qa that a builder could have caught | to be counted from `qa/BUGS.md` | lower |
| Minutes a builder spends on verify per commit | 0 | about 5 or less |
| Checks that still need a person's eye | looks, layout shift, whether tests catch a broken rule | only D17, D20 and approving changed references |

## Decisions (all approved as recommended, 25 Nov 12:56 IST)

1. Approve this design, so it goes to the Lead as six rows in `design/os-backlog.md`: yes.
2. Budgets: LCP 2.5 s and CLS 0.1 now; tighten once the screens meet them.
3. A changed reference screenshot: the Lead approves on the founder's behalf; the founder sees each change in the recorded walk.
4. Verify at every app-code commit, trialled on one lane for 2 days first.
5. Stryker: yes, in phase 3, version pinned, through the §1 gate.

## Risks and guards

- Verify slows builders: only the touched journeys at one width, about 5 minutes, never on records-only commits.
- Flaky screenshots: fonts are already local; dates and ids masked; a diff retried once before it fails.
- Token spend: verify uses the builder's own turn, live AI off (US$0 model spend).
- False confidence: CI gates A and B stay the authority; verify is the early catch, not a replacement.
- Our launch is not standard (database and sample data), which the built-in `/verify` guesses badly, so the recipe is written by hand from its template.

## Sources

- Claude Code skills docs, https://code.claude.com/docs/en/skills: bundled `/verify`, its saved recipe at `.claude/skills/verify/SKILL.md` (repo root or the touched package in a monorepo), a project `verify` skill running before each commit (2.1.286+).
- Building verification loops in Claude Code with skills (Anthropic), https://claude.com/resources/articles/building-verification-loops-in-claude-code-with-skills
- Chrome DevTools MCP for your AI agent (Google), https://developer.chrome.com/blog/chrome-devtools-mcp?hl=en: performance trace with LCP, CLS and INP.
- Auditing Core Web Vitals with Chrome DevTools MCP, https://sitebulb.com/resources/guides/auditing-core-web-vitals-with-chrome-devtools-mcp/
- Ours on main: `STANDARDS.md` §7 and §9, `EXPERIENCE.md`, `QUALITY.md`, skills `journey-test` and `qa`, workflows `ci.yml`, `nightly.yml`, `walks.yml`, `guards.yml`.

## Six rows for `design/os-backlog.md` (ids to be assigned by the Lead; OS-67 is the last on main)

| ID | What | Rule | Kind | Owner | Status | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| OS-V1 | Project `verify` skill in the studio package (`prototype/studio/.claude/skills/verify/SKILL.md`), run by Claude Code before each app-code commit: own isolated copy, touched journeys only, five checks, evidence on the PR, 5-minute cap, 3 retries | this design, P-717 (b) | hook (skill) | OS-PM; one builder lane trials | Open (phase 1, from 27 Nov 12:00 IST) | trial lane's commits run it 2 days; minutes per commit and red runs reported; then on for all lanes |
| OS-V2 | LCP 2.5 s and CLS 0.1 budgets measured in the Playwright packs and in verify; `STANDARDS.md` §9 amended by the Lead | §9 | CI (warning first) | OS-PM; Lead writes §9 | Open (phase 1) | budgets read on every pack run; clean 24 h or 10 PR runs, then required |
| OS-V3 | Visual compare: reference screenshots per screen state at 1024 and 1440 px, masks for dates and ids; a changed reference needs the Lead's approval label | EXPERIENCE visual system | CI (warning first) | qa lane (references), OS-PM (check) | Open (phase 2) | every Works screen has references; a deliberate change shows as a diff with an approval |
| OS-V4 | Design-system check from computed styles: tokens, fonts, type scale, one primary button per panel, red only for errors, 4.5:1, 44 px at 375 px, no sideways scroll | EXPERIENCE [M] lines, BIC-19, BIC-20, UXL-09, UXL-10 | CI (warning first) | qa lane (rules list), OS-PM (script) | Open (phase 3) | first five rules checked on every screen state; each breach names the element |
| OS-V5 | Mutation testing (Stryker, version pinned, §1 gate) on `engine/` and the rule validators, nightly; score floor may only rise | STANDARDS §7 "a rule's test fails when the rule is removed" | CI (nightly report) | OS-PM | Blocked: §1 gate entry first (phase 3) | nightly score per area published; floor set from the first run |
| OS-V6 | (a) first-time-user agent before each milestone walk: goal and screen only, wrong turns recorded; (b) all-routes sign-in sweep: every API route signed out and with the wrong role refuses 401/403 | QUALITY D17; roles on the server | CI (b, warning first); agent (a) | OS-PM | Open (b phase 2, a phase 3) | (b) every route listed and refusing; Floorplan's 40 warnings proven or turned into bugs; (a) report per milestone |
