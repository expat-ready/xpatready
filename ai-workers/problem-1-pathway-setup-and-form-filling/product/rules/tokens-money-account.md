# Tokens, money, account and budget, process freeze, compass — word for word from RULES.md as of P-612 (15 Nov), moved by G-3 (P-611, P-615; nothing cut, P-188)

The rule register is `RULES.md`; this file holds the long text its rows came from. The whole page as it was: `history/RULES-2026-11-15-1415-before-register.md`.

## Tokens: hard rules (P-440; measured in `reports/pipeline-pain-points-2026-11-09*.md`)
* **Cost is context size.** About 75% of spend is long sessions re-reading 300k+ contexts on every call; output is ~11% (P-436). So:
* **Lead: hand over at the first check after 200k tokens beyond its own start read** (P-446; replaces P-445 (1), P-440's 250k, P-314's 400k), sooner on losing track, never compact; at ~150k beyond the start read, tell the first standby to read RULES+STATE once. Unused connectors stay off (P-445 (2)).
* **Context by session type (P-446 (6)):** builders end with the row and split one that would pass ~400k; qa at ~300k with the walk unfinished writes findings and hands the rest to a fresh lane; reviewers and fresh readers always fresh, given the diff, ~150k. Nobody reaches auto-compact; work after a compaction is re-checked by a fresh reader. A qa or builder session ends with its row (one row per session).
* **The start read is one page:** this page plus the DECISIONS rows newer than "as of" (P-440). Never re-read big files on a check; read only what changed, by line range (P-372 (3)).
* **No raw dumps into a Lead's context:** filter every tool output (`head`, `grep`, JSON fields); a PR body or log is read only in the section needed (P-440).
* **Burn watch every check:** weekly % and the rate per hour from `get_usage`. Over 3%/h at two checks in a row: read each working session's context share, end idle ones, hand over any over 250k, and tell the founder the cause in one line (P-440).
* **Models:** Opus for builders, reviewers, breakers, fresh readers and qa verdicts; Sonnet or Haiku for read-only side work (searches, inventories, measurements) (P-436 (6)). Standbys stay idle: no checks, no reads (P-286). **Fable** only for planning, challenges and independent read-only review, never builds or reviews (P-455 (5)). Unused connectors stay off (P-445 (2)): Notion, Google Drive, Claude Docs turned off 11 Nov 08:2x IST (A11).

## Money (paid AI)
* **Live AI is off on every copy** (lanes, qa, checks, the Mac's test copies): a live call happens only as a paid run the Lead approved under these rules, from a Terminal tab (P-175; the lead skill's money line before P-440).
* Day cap **US$30** (P-295, P-309), **US$50 on 9 Nov** (P-429, P-434). The Lead approves each run inside it; above it, the founder.
* Every run (P-295): usual and worst cost first; worst case reserved in the shared ledger (`.tools/p2-ledger`, `p2/ledger.ts`) before the call; cheapest and most certain first; one attempt, retries only for temporary errors; an independent check; one PR per result; qa labels it (P-275). Job cap US$5 per two attempts unless a worst case is stated first (P-232).
* Live runs need network the sandbox does not give child processes: the product's launcher runs from a Terminal tab (P-377 (7)); a single scratch read can go by curl from Bash with `allowed_domains` (9 Nov, #1444). A paid run happens on the data Works counts on, never fixture-only.

## Account and budget
* Use the plan to its limit (P-344). **New account, 11 Nov (P-461): the weekly meter is not a stop line; plan as if the full plan is left; at 98% the Lead tells the founder, who resets; lanes still push after every step.** Before that, **this week (P-458): lanes push after every step; at 96% weekly every lane finishes its step, pushes and stops; by 98% STATE and `RESUME-ON-NEW-ACCOUNT.md` are pushed; 2% buffer** (was P-431: 93%/95%). On a switch: `get_usage` first, then the resume page; these rules carry over because they live in the repository.

## Process freeze (P-312)
No change to the workflow, tools or these rules until **10 Nov 22:30 IST**, except on a measured number and the founder's word (P-420, P-436, P-440), each with the number it should move, checked after a fixed period, kept or undone.

## The compass (P-312): judged daily from tools, never from prose
| Number | Healthy |
|---|---|
| Capabilities confirmed per day | 10 or more |
| Works on qa's first re-score after merge | 80% or more |
| Major or Critical bugs found after merge | about 0 |
| Works → Partial demotions per day | at most 1 |
| Capabilities in progress | no more than builders |
| Notes PRs as a share of merges | 20% or less |
| Merge batches thrown away | 15% or less (conflicts at most 5 a day) |
| Weekly plan burn per hour (P-440) | 3% or less |

* P-618 enforced-by cell, moved word for word by Lead 69 (21:4x IST 16 Nov, RULES under 25 KB): script: outside-deps-watch.py, run by lead-watch.sh step 9 (part: start date reached, stuck 48 h, blocked without decision date or fallback; the start-date formula is not checked) (test check-outside-deps-watch.sh)

* P-608 enforced-by cell, word for word: hook: lane-preflight.sh --hook (part: a model and effort line in every start brief); agent-model-guard.sh (part: reviewers and breakers Opus high when a model is named; CI checks the agent files) (moved by Lead 69, 21:4x IST 16 Nov, RULES under 25 KB)
* P-605 enforced-by cell, word for word: hook: agent-model-guard.sh --hook (part: reviewers and breakers on Opus; the start brief's model line is not checked for Opus 5.5) (moved by Lead 69, 21:4x IST 16 Nov, RULES under 25 KB)
* P-539 enforced-by cell, word for word: hook: push-guard.sh via .githooks/pre-push; CI: ci.yml push-guard steps (part: sources/, code/, archive/ never pushed) (moved by Lead 69, 21:4x IST 16 Nov, RULES under 25 KB)
* P-303 enforced-by cell, word for word: hook: agent-model-guard.sh --hook (part: reviewer and breaker on Opus high); CI: pr-rules (agent files) (moved by Lead 69, 21:4x IST 16 Nov, RULES under 25 KB)

* **Account facts every Lead reads (founder, 21:4x IST 16 Nov: "we have a unlimited machines on the GitHub, because we are public ... and I am also in the pro account"):** GitHub personal account on **Pro** (P-282, 2 Nov) = **40 concurrent Actions jobs** (Free would be 20; docs.github.com/en/actions/reference/limits, read 16 Nov); the repository is **public** (P-263), so Actions **minutes cost nothing**; it goes private at the gate before the first real firm's data, on own runners (P-589); nothing of the team's app in git (P-504, P-539). The limit that bites is **40 jobs at once, not minutes**: never propose buying Pro again. (Lead 69, 21:4x IST 16 Nov)


## Account facts (Lead 80, 16:4x IST 18 Nov)

Before 18 Nov, RULES.md said word for word: "**Account facts:** GitHub Pro, 40 Actions jobs at once, public repo (Actions minutes free): word for word in `rules/tokens-money-account.md`."

Since 18 Nov 12:31 IST the repository is `expat-ready/xpatready` in the enterprise "Expat Ready" on GitHub Enterprise Cloud (paid, 1 licence). GitHub's limits page lists 500 concurrent standard hosted jobs for Enterprise; on 18 Nov only 1-6 ran at once (measured by Lead 80); Multi-cloud set (P-693); a GitHub Support ticket is with the founder. Public repository, Actions minutes free.

| P-608 | Model and effort at every start: Opus 5.5 medium; high for reviewers, breakers, the fresh reader, risky rows; Fable 5.2 medium for specifying and challenges. | hook: lane-preflight.sh --hook (part; `rules/tokens-money-account.md`) | 15 Nov |  (moved word for word by Lead 80, 16:4x IST 18 Nov)

Moved word for word from RULES.md, 27 Nov (Lead 3, size limit): **Account facts:** `expat-ready/xpatready` on Enterprise Cloud since 18 Nov (500 jobs documented, 1-6 measured); detail and the Pro-era line in `rules/tokens-money-account.md`.
