# qa hand-over, 19 Nov 2026 08:30 IST (P-565: context at 49%; for the next qa session)

**From:** the Mac qa session "qa · after-merge (17 Nov afternoon)", worktree `lucid-bardeen-f90377`. **Current Lead:** Lead 86 (local_bb67266d). **Model:** Opus 5.5, medium (P-608). Main is c600f2150.
**Rules in force:**
* P-339: Works = the pack green on main's head on GitHub, plus an independent re-run, a fresh Opus reader and gate A.
* P-606: no verdict while parts are missing.
* P-683: open records PRs only after the reviewer's Approve, as non-draft.
* P-707: Proven first.
* **P-719 (founder, 19 Nov): finish by capability. When an item's last part merges, its proof jumps the queue (after Blockers).**
* Live AI off; never :4400; times only from `TZ=Asia/Kolkata date`.

## The P-719 list: all of it is qa's now (Lead 86, 09:0x: qa-4 is archived, no other qa session runs)
Each item: the parts left → its J-row (the last part, proved by its walk). PR states as of 08:30 IST.

| Item | Parts left → last part | State 08:30 IST | qa action when it lands |
|---|---|---|---|
| R1.77 | #2169 CS-C1s part 2 (open, not queued) → J-77 | closest to done | prove on J-77's merge |
| R1.74 | #2000 CS-DL1 part 1 (queued) → CS-DL1b → J-74 | in flight | prove on J-74 |
| R1.8 | #2124 AUD-1b (queued) → AUD-1m 1, 2a, 2b → J-8 | in flight | prove on J-8 (qa-4 carried it forward 01:4x) |
| R1.109 | #2012 PF-21i (queued) → J-109 | in flight | prove on J-109; QA-506 (no menu entry) is J-109's |
| R1.28 + R1.37 | FO-2 part 3b → J-37 | in flight | prove on J-37. R1.28's gate A walk is done (below) |
| R1.41 | #2103 FO-3a 1b-i (queued) → FO-3st2 → J-41 | in flight | prove on J-41 |
| R1.48 | PF-19b part 3 → J-48 | in flight | prove on J-48 |
| R1.59 | FO-7ts part 2 (no PR yet), then held | in flight | score when its parts land |
| R1.105 | #2197 AUD-5 part 2 (queued) | **out of flight** (waits on PF-11, PF-11c) | nothing to prove yet |
| Merging only | R1.4 #2029, R1.19 #1959, PF-15 part 1a #2130 (all queued) | — | score each on merge |

**Proven today:** R1.6 (Works on c600f2150; record PR #2205). STATE reads 12 of 101 (Lead 86).
**R1.14** stays Partial: it waits on PF-8rc (the AWS account, founder). The drill passed 10/10 in nightly 44412299740 (job 135183381279).

## Open records PRs (both labelled `records` and `review: approved`, both queued)
* **#2193**, head 262a450da (Reviewer: Approve 262a450da): the gate A night 18-19 Nov.
  * 8 platform rows PASS, none to Works.
  * Rows R1.6, R1.14, R1.67, R1.92, R1.93 and R1.109 updated.
  * QA-508 and R1.58 point at P-694 (P-694 reaches main with #2173).
  * QA-187 and QA-504 evidence; 3 built/ files deleted.
* **#2205**, head f93ef1f13 (Reviewer: Approve f93ef1f13; **stacked on #2193**): R1.6 to Works, plus QA-512 (Gap, Minor: no live licence-class route) and QA-513 (Ambiguity, Minor: a keyless route refuses at start-up, not "403").
  * QA numbers: QA-511 is taken on `claude/qa-r128` (R1.28, Major, ArrivalPort). The next free number is **QA-514**. Scan every remote branch before using one: BUGS.md and BUGS-CLOSED.md on all non-mergify branches.

## How R1.6 was proven (repeat it for each J-row)
1. Find the CI run whose tree equals main's: a merge batch `mergify/merge-queue/*` with head tree = main's tree (`/commits/<sha>` → `commit.tree.sha`). Read its shard logs for the parts' checks.
2. CI does not run `tests/journeys/j_*.ts`. Dispatch walks.yml on main twice (`{"ref":"main","inputs":{"journeys":"j_<n>"}}`) for the pack run and the independent re-run. Read each `walk j_<n>` job log for "N/N passed" and the step that ends at the next capability's first step.
3. Check BUGS.md for an open Major or Critical on the row: one keeps it Partial.
4. A fresh Opus reader subagent that ran nothing gets the row, RULES, the BACKLOG parts and the downloaded logs, and gives WORKS / PARTIAL with gaps.
5. A records commit: the row's status, tested sha, the note with run and job ids, and the reader file in `qa/reports/<date>…/`. Log the gaps as QA rows when the Lead asks. A reviewer subagent checks it; open the PR after Approve; ask the Lead for the `review: approved` label.

## Watcher
Background job `bjrb0byfq` (this session only; it dies with it). It scans newly merged PR titles every 5 minutes for the items' parts and J-rows, and #2169 #2000 #2124 #2012 #2103 #2130 #2029 #1959. A new session should start its own; the loop is in this session's transcript.

## Sandbox facts (Mac qa)
* `isolated.sh` as written cannot start here: the tsx CLI's IPC pipe and nohup fail. A scratch copy, `$TMPDIR/qa/isolated-m.sh`, runs `node --import tsx` with `STUDIO=/private/tmp/claude-501/m/...`. #2137 made main's launcher use pg_isready.
* **Never call `isolated.sh stop` from a later command.** It ends the copy's own TTL timer, cannot kill the server, and the port stays at 503 for good. Let `--ttl` end each copy. :4476 is still stuck (the founder's kill list).
* Export main with `git archive origin/main ai-workers/problem-1-pathway-setup-and-form-filling packages`: the whole solution folder, since the demo load reads `official-sources/ircc/manifest.json`. Link `.tools` and `studio/node_modules`.
* Chrome cannot launch here (ProcessSingleton). Browser steps use the app's browser pane; scripted browser checks run on GitHub (walks.yml, ci).
* gh's own TLS fails; use curl with `gh auth token`. Allowed hosts: api.github.com, github.com, *.blob.core.windows.net, *.actions.githubusercontent.com.
* Records commits are made in the clone `$TMPDIR/rec` (this worktree cannot switch branches: `.claude/` is read-only).

## Next steps
1. As each P-719 item's last part merges (watch the list above), prove it, in that order.
2. Score R1.4 (#2029), R1.19 (#1959) and PF-15 part 1a (#2130) as each merges (no J-row: score on its checks plus a walk).
3. After #2193 and #2205 merge: nothing left from this session.
4. Not checked yet:
   * the PF-18b support-inbox email (test it on PF-18s's walk);
   * the 220 s checkpoint load (88 s on 17 Nov): one line in the next records PR if it repeats.
