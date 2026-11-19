# Module-card conflicts: the narrowest fix (proposal, 19 Nov 2026)

For the tech lead (Lead 84) to rule on; P-502 (evidence, root cause, a named method), P-214 (a pipeline fix). One tooling PR follows the ruling.

## The problem, measured (19 Nov, 06:3x-06:5x IST)
- **Open PRs:** 33 open PRs (batch PRs excluded); 18 edit a module card (`api/src/*/MODULE.md`, `api/src/MODULE.*.md`, `web/src/**/MODULE.md`).
- **Conflicting now:** 4 open PRs conflict with main, and **all 4 conflict on a card**:
  - #2129 and #2038: only the card;
  - #2109: the card and one screenshot;
  - #2001: the card and two scripts.
- **Knock-on per merge.** For each of the 14 clean card PRs, I merged it into main with `git merge-tree` and re-checked the other 13.
  - One merge puts **on average 3.1 other open PRs into a card-only conflict**, 3.6 into any conflict, and at most 8 (#2000).
  - That matches what the Lead saw ("about 6 per merge").
- **Where the conflict sits.** I ran the simulation twice a few minutes apart, and main moved in between: 52 conflicts, then 54 (46 of them card-only). In the first run, the conflict region includes:

  | Line in the card | Conflicts that include it |
  |---|---|
  | `**Tests.**` | 46 of 52 (88%) |
  | `**Tables.**` | 20 |
  | `**Entry points.**` | 9 |
  | prose and bullets | the rest |

- **On main since 15 Nov:** 44 merges changed a card. 36 of them edited the `Tests.` line, 24 `Entry points.` and 10 `Tables.`.
- **Root cause.** `Tests.`, `Tables.` and `Entry points.` are each **one long line**, and every row appends its item to the end of it. Two PRs editing the same line always conflict. Git merges by line, and the 40-line cap (`module-cards.py tree`) is why the lists were packed onto one line.
- **What it would fix.** If those three lines could never conflict, **34 of the 46 card-only conflicts (74%)** would not happen. Tests and Tables alone would remove 26. The other 12 are real prose edits to the same paragraph, which a person should merge.

## The three options
**(a) Generated Tables/Tests lines, rejected.**
- Tests do not import their module's code; they reach it through HTTP and Prisma (for example `tests/check_fo9a_duplicates.ts`). So no reliable source in the code says which tests belong to a module, and the generator would be a guess.
- A generated line that is committed still conflicts when two PRs regenerate it. If it is not committed, it leaves the card that lanes load.

**(c) `.gitattributes merge=union`, rejected on two grounds.**
- *Hosts:* GitHub's pull-request merge does not honour merge drivers from `.gitattributes`. [Community discussion #9288](https://github.com/orgs/community/discussions/9288), "Pull request conflicts: Support merge=union", is an open request: union applies only in local git. Mergify merges its batch PR through GitHub's merge API ([batches](https://docs.mergify.com/merge-queue/batches), [merge-batch method](https://docs.mergify.com/changelog/2026-04-07-new-merge-batch-merge-method-for-merge-queue/)), so it inherits GitHub's behaviour.
- *Result:* tested locally with git 2.50.1 `merge-tree`, which does honour union. Two PRs appending to the one-line `Tests.` list merge "cleanly" into **two `**Tests.**` lines**, a silently wrong card with no conflict to warn anyone.

**(b) One fragment file per row: recommended, for the three list lines only.**
- *Fragments:* a PR adds its items in a new file `<card folder>/MODULE.rows/<ROW>.md` (for example `api/src/front-office/MODULE.rows/FO-3a.md`), up to 6 lines, for example `Tests: tests/check_fo3a_types.ts` and `Tables: foConsultationType`.
- *Why it cannot conflict:* each PR adds its own new file, so two PRs never edit the same line.
- *The card:* keeps its prose, invariants and "Do not". The existing `Tests.`, `Tables.` and `Entry points.` lines stay and are frozen; one line points to `MODULE.rows/`.
- *`module-cards.py pr`:* a changed fragment of the module counts as "card changed". A PR that grows a frozen list line fails, with the message "add a MODULE.rows/<ROW>.md fragment".
- *`module-cards.py tree`:* every fragment sits in a card's folder, names only files that exist, and is at most 6 lines. The 40-line cap stays on the card alone.
- *Who folds:* the Lead's records PR (one writer, serial) may fold fragments into the frozen lines when a card is next tidied; nothing depends on it.
- *Lanes:* the card's `paths:` rule still loads the card. The card's pointer line tells a lane to read `MODULE.rows/` for the full list.

## Every agent aware (founder P-712, "fixed for once and all, every agent aware")
In (b) the three lines are **frozen**, not generated; the rule is the same.

**The line**, word for word:
> Never hand-edit a card's `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.rows/<ROW>.md` next to the card (P-712; `module-cards.py` fails the PR otherwise).

**Where it goes, in the same tooling PR:**
1. **Every card (15):** the pointer line, so any agent that loads a card through its `paths:` rule reads it, whatever skill it runs. This reaches the most agents.
2. **`.claude/skills/next/SKILL.md`:** the builder's flow, where it says to update the card in the same PR.
3. **`.claude/skills/screen-build/SKILL.md`:** the BUILD stage.
4. **`.claude/skills/qa/SKILL.md`:** qa's own fixes and its review of a row: a frozen list line edited by hand is a finding.
5. **The brief:** there is no separate brief template file on main. The brief's shape lives in the `next` skill and `product/tools/brief-check.sh`. So the line goes into the `next` skill's brief section; `brief-check.sh` gets no new required line, because the card check enforces it.
6. **`RULES.md`:** a P-712 row: the rule, "enforced by: `module-cards.py pr` (CI module-cards)".

**The check is the backstop:** a PR that edits a frozen line fails CI, and its message is the same line. So an agent that missed every document still learns the rule in its first PR.

**One process point for the Lead.** This worktree's sandbox refuses writes to `.claude/skills/`. The skill lines would go into the PR as git objects (commit-tree), not through the local skill files. The `.claude/` paths in the PR then get the Lead's P-423 read like any other. Say if you would rather add the three skill lines in a records PR yourself.

## Recommendation
Build (b), one tooling PR:
- `module-cards.py` `pr` and `tree` changes, with fixture tests in `check-module-cards.sh` and guard mutations;
- one pointer line per card (15 cards).

Open PRs keep their current edits: each merges once more by hand, and new rows use fragments. Expected effect: 74% fewer card-only conflicts at today's mix, measured again 48 h after merge with the same `merge-tree` simulation.

Method: line-level 3-way merge (git `merge-ort`, used by `git merge-tree`). Every number above can be re-run from the open PR heads and origin/main.
