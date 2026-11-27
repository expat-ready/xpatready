# A414 brief for Factory v3 (Lead 4, 26 Nov 17:1x IST)

The founder's words: `product/history/STATE-2026-11-26-A412-founder-words.md` (A414 section; pushed e87f4b806).

**The product repo STAYS PUBLIC** (free hosted machines and other facilities); he never meant to make it private. Only the factory (pipeline tools, records, decisions, Lead work) moves out of the product repo's main, to local or a separate repo "from where lead works out". **Hard rule:** use an industry-standard, best-practice mechanism where one exists; never force-fit our own, even one we're sure would work.

Compare the mechanisms from several angles, each cited from official docs, with the limits that bite us:
* (a) A private "factory" repo (expat-ready/private exists) that the Lead and lanes clone beside the product repo. CI checks it out with a read-only token or GitHub App when a workflow needs a tool. Secrets on a public repo: fork PRs get no secrets, which suits the fork-approval setting (already on for all outside contributors, read 17:0x).
* (b) Reusable workflows or composite actions kept in a private repo. Check whether a PUBLIC repo can call them at all. GitHub may only share private-repo actions with other private/internal repos, so verify.
* (c) Org rulesets with "required workflows" stored in another repo (Enterprise Cloud). Can the source be private when the target is public?
* (d) Skills, agents, hooks and commands packaged as a private Claude Code plugin or marketplace installed from a private git repo (Claude's own standard for sharing agent config). The product repo then keeps only CLAUDE.md, REVIEW.md and approvals.yml.
* (e) What MUST stay in the public repo to work: .github/workflows, .mergify.yml, CODEOWNERS, dependabot.yml, REVIEW.md, .claude/approvals.yml.
* (f) Records and decisions: the private repo as the "memory" (P-557 holds: always committed and pushed, just to the private repo).
* (g) The effect on lanes: cloud sessions get two repos; check that claude.ai/code cloud sessions can use a second private repo.

Recommend one, with the migration order and rollback. Fix any line in v3 that still reads as "make the product repo private" (v3 v4 already says keep public).
