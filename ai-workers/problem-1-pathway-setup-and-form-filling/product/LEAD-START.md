# Lead start read: what a fresh Lead reads, in this order (OS-16; P-615, P-440b, P-446)

A new Lead reads these rows and nothing else before its first act. They hold what is true now: the state, the rules in force, the work in order. `check-docs.sh` adds up the table below (bytes ÷ 4, about one token each) on every run and prints the total. It warns over **40k tokens** and fails over **70k** (P-615's line, until a Lead row amends it to 40k). A row that names a missing file or section fails it too. `tools/start-read.py` does the sum (test: `check-start-read.sh`).

**Never at start** (AGENTS rule 9): `product/history/`, `archive/`, all of DECISIONS.md, all of BACKLOG.md, old STATE pages, closed PRs. Open a DECISIONS row by number only when a task needs it.

The Part column takes `all`, `§ <heading start>` (from that heading to the next heading at the same or a higher level; several separated by ` · `), or `rows newer than RULES as-of` (the DECISIONS rows above RULES.md's "as of **P-NNN**").

| # | File | Part | Why |
|---|---|---|---|
| 1 | `CLAUDE.md` | all | loaded by itself at session start: where things live |
| 2 | `AGENTS.md` | all | loaded by itself: the rules for every agent |
| 3 | `.claude/skills/lead/SKILL.md` | all | loaded by `/lead`: the guard, the start steps, the job |
| 4 | `STATE.md` | all | where we are: Start here, the hand-over block, what is in flight (on the Lead's `lead/*` branch) |
| 5 | `RULES.md` | all | the rules in force, one page (P-440) |
| 6 | `DECISIONS.md` | rows newer than RULES as-of | the newest rulings, word for word (P-314); at most 3 rows (P-440) |
| 7 | `WAY-OF-WORKING.md` | all | the loop, roles and guards; reread each chat (lead skill) |
| 8 | `BACKLOG.md` | § Owners · § Now · § Next | who holds which row, and the work in order |
| 9 | `.claude/skills/lead-watch/SKILL.md` | all | the 30-minute check, run first thing |
