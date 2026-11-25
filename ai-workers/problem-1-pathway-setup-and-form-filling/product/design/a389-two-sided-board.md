# A389: the two-sided board — design note (for the Lead's approval, in part 1's PR)

**Ask (founder, 25 Nov ~14:5x IST, to Lead 7; ruling ~15:1x IST):** STATE and the control room show "a split of both", product and operating system, "live", "enforced", "the capability shifts", "how many decisions are live, proven or enforced". No flag on everything ("it shows pending… I'm confused"). **Partial % = acceptance clauses the tester has confirmed ÷ all clauses in the row's capability text.** Only independent testing moves it; a merge cannot.

**Duplicate check (P-526):** no `clauses.tsv` and no clause-level status anywhere on main (`grep -ril clause` finds only cockpit-data.py's ask-row parsing). Reused, not redone: `progress.sh` (row counts, the C rows), `waves.py` (R1 parse and `check-waves.sh`'s throwaway-file style), `founder-report.py`, `factory-board.sh`, `sle-watch.py`, `known-failures.tsv`, the control-room page `design/control-room-2026-11-25.html` (A386). Part 2 reads them; it does not copy their logic. OS-PM 3's os-backlog items are not touched: part 2 only reads `design/os-backlog.md`.

## Part 1 — clauses as data (this PR)

* **File:** `qa/clauses.tsv`, one line per clause: `row · no · clause · status · evidence · commit · date`. Status is `confirmed` or `not`. A confirmed clause carries a qa/ report path that exists, the commit it tested and the date (YYYY-MM-DD).
* **Where the clauses come from:** the row's **Done when (what qa tests)** cell, cut at `;` outside brackets. On main that gives 276 clauses over 101 rows (1 to 6 per row; 45 rows have 3). **This differs from the brief's wording, and the Lead needs to rule on it:** the brief says to split the "Capability" cell. In the R1 table that cell is a title ("3 Walls between firms", "56 Client invoices, tax by province, government-fee line"), so it has no acceptance clauses to split. Done when is the row's acceptance text, and qa already tests against it. Changing the source later is one line (`rows()` in `clauses.py`).
* **Seed (`tools/clauses.py seed`):** a Works row's clauses take qa's own row verdict: its Tested-on commit and date, plus the first qa report path in its note that exists. Six rows (R1.63, 73, 82, 83, 84, 101) were judged on their C rows with no report path, so their evidence is the row's note in `qa/CAPABILITIES.md`. The script sets no other status: **every clause of the 17 Partial and 21 Not built rows starts `not`.** The seed copies qa's recorded verdicts only and makes no judgement of its own, so P-219 holds. If a row's Done when is reworded later, the seed splits it again: a clause whose text is unchanged keeps its status, and a new or reworded clause starts `not`.
* **Check (`tools/clauses.py check`; test `tools/check-clauses.sh`, guard 41 with 7 mutation rows):** it refuses:
  * a Works row with an unconfirmed clause;
  * a confirmed clause without evidence, a commit or a date, or whose evidence is outside qa/ or missing;
  * a bad status;
  * an R1 row with no clauses;
  * clauses that no longer match the Done when;
  * a line for a row that is not R1.

  It runs in ci's records step on every PR. That step is in `.github/workflows/ci.yml`, a P-423 path.
* **qa skill:** one line under §4 Record. The skill was at 10,227 of its 10,240-byte limit, so the line went in by trimming four history asides; no rule changed.

**Question for the tech lead (1), the count today:** the 17 Partials show **0 of n** until qa scores their clauses. The note's "parts missing CS-W2…" prose cannot be turned into clause verdicts by a tooling lane (P-219). Proposal: one `/qa capability` paper pass over the 17 Partials. It reads their own reports, runs nothing, sets each clause with its evidence, and fits one qa session. Until then, part 2 prints "0/n, not yet scored by qa", so a 0 is never shown as measured.

## Part 2 — the board, generated (next PR, after approval)

`tools/two-sided-board.py`: stdlib, offline, reads main's files (`git show origin/main:<path>`, using the last fetch).

* **Product**
  * Works, Partial and Not built of 101.
  * Moves since 00:00 IST and in the last 24 h (row, from → to), from `git log -p` of CAPABILITIES.md's Status cell.
  * Each Partial's clause % (from `clauses.py pct`) and its age since the % last moved (`git log` of clauses.tsv per row).
  * "in progress" means a branch on origin whose tip commit is under 90 min old and names the row id, or its backlog item from `waves.tsv`. Otherwise the row shows "stalled N h".
* **Operating system**
  * os-backlog counts: Done, Doing, Open and Blocked.
  * Decisions in DECISIONS.md and RULES.md:
    * **enforced:** "Enforced by" names a file that exists on main;
    * **written only:** no enforcer, or one marked prose or owed;
    * **proven:** the enforcer file is the target of a `check-guards.sh` mutation row, so a test fails without it.
* **Output:** a block between markers in STATE.md (under 1.5 KB) and a JSON file the control-room page reads. lead-watch runs it on each check.

**Question for the tech lead (2), room in STATE:** STATE.md is at 12,267 of 12,288 bytes. Either the Lead frees 1.5 KB when it next rewrites STATE, or the block lives in the control room and STATE holds one line (counts plus the link). The board will be written to fit whichever the Lead picks.

## Part 3 — flags only when real (third PR)

* A red line needs an owner, a next step and a time that has passed. Anything without all three is a plain count, and the word "pending" is never printed.
* A Partial whose % has not moved in 24 h becomes one ACT line naming its lane and its next unconfirmed clause. After 24 h more with no move, the line says "replace the lane".

**Done when:**
* each part's `check-*.sh` exits 0, with failing cases first and mutation rows in check-guards.sh;
* the board on main's data shows 63/101 and a % for all 17 Partials;
* the Lead has approved this note.
