# Private records (private split, 27 Nov 2026)

The tech lead's records move from this public repository to the private one, github.com/expat-ready/private, folder
`xpatready/product/`. The plan, its readers and its rollback: `design/private-split-plan-2026-11-27.md` (merged #3911).

| Moves | Where it goes | Who reads it after |
|---|---|---|
| `STATE.md`, `history/`, `lanes/`, `inbox/`, `reports/`, `ops/`, `RESUME-ON-NEW-ACCOUNT.md`, `SECOND-MAC.md` | expat-ready/private `xpatready/product/` | the tech lead, from the private copy at `${PRIVATE_HOME_DIR:-$TMPDIR/private-home}` |
| skills `lead`, `lead-watch`, `strategy-desk`, `cto-review` (later step, PS-2) | expat-ready/private `claude/skills/` | the tech lead, through `~/.claude/skills` links |

What stays here and is public: the product, DECISIONS, RULES, BACKLOG, focus-list, state/, design/, reference/, every
tool, hook and workflow, and `CURRENT-LEAD.md`, the one line lanes read to find the tech lead.

How tools find the records: `tools/records-dir.sh` prints the private copy, else this copy's `product/` while the files
are still here; `--private` prints the private copy only. Past content stays readable in this repository's git history.

Order: PS-1a (the Lead copies the files into the private repository), PS-1b (readers re-pointed; this page), PS-1c (the
files are deleted here in one pure clean-up PR). Rollback: `git revert -m 1` of PS-1c.
