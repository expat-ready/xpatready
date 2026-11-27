# Memory and rules enforcement audit — 27 Nov 2026

Read-only audit for the tech lead (founder ask A431: every lesson that lives only as text gets a cheap enforcer).
Inputs read: 135 memory files, `product/RULES.md` (as of P-850), the lab register (LR-001..LR-153), `.claude/settings.json`,
`.githooks/`, `.mergify.yml`, the watch scripts and the hooks. Nothing was edited, committed or pushed.

**Where the enforcers were read.** Two copies differ a lot, and that difference is finding no. 1:
* **main** = `origin/main` (last commit 27 Nov 06:45 UTC), read with `git archive`. `T/` below means
  `ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/` on main.
* **Mac** = the Lead's working copy on the Mac (branch `lead/2026-11-07-lead31`). The hooks in `.claude/settings.json` run
  from this copy (`$CLAUDE_PROJECT_DIR`), so here the Mac versions are what runs. `Mac T/` = the same folder in this copy.
* `lane-watch` = `/tmp/claude-501/lane-watch.sh`: the 3-minute event watch. It reads GitHub only and uses no AI tokens.

Enforcer types, cheapest first: **(a)** a bash line in the 3-minute lane-watch that prints only when something is broken · **(b)** a Claude Code hook · **(c)** a CI or queue-gate check · **(d)** a required line in the Lead's check report, checked by a Stop hook · **(e)** cannot be done by code: it stays a judgement.

---

## 1. Summary

| Class | Count | What it means |
|---|---|---|
| ENFORCED | 40 | A hook, CI step, guard or watch line exists. Each one cites a file:line read in this audit. "In check" means it fires only when the Lead's 30-minute AI check runs `lead-watch.sh`. |
| PARTLY | 35 | An enforcer exists but misses a case. The table names the gap. 9 of these are **built but not running** (unwired hooks, or main versions the Mac copy does not run). |
| TEXT ONLY | 16 | No enforcer was found. |
| JUDGEMENT | 18 | Style, framing or judgement. Keep these as text (reason given). Some have a partial helper. |
| RETIRE | 17 | Obsolete, or contradicted by a newer decision (newest wins). Stop enforcing them and correct the text. |
| **Total distinct rules** | **126** | After merging memory duplicates into their RULES rows |

Memory files that hold **history, no rule** (not counted): account-switch-5-nov, -6-nov, -9-nov, -19-nov, -22-nov ·
ag-requirements-plan · ai-workers-workstream · aiw-d121-redirect · blank-sheet-restart · commercial-plan-state ·
finish-program-first · founder-v7-rejection · journey-order-and-seams · lean-finish-m2 · lean-switch · m3-48-hour-sprint ·
merge-flow-trial · ollama-cloud-switch · overnight-run · precompact-state · release1-roadmap / -scope / -team-roster ·
research-stream-4 · solution-1-* (10 files) · switchover-done · token-burn-causes · workflow-freeze · ws2-* (6 files) ·
user-identity · one-pager-shared-link · reread-codex-lines (Codex era) · concurrent-sessions-rule (NEXT.md era; replaced by
`current_lead`).

---

## 2. Top 15 text-only or partly rules, ranked by harm when missed

| # | Rule (source) | Today | Harm when missed | Cheapest enforcer · how often · register |
|---|---|---|---|---|
| 1 | **The Lead works on a fresh `lead/<today>` branch cut from origin/main, so its hooks and tools match main** (P-388; memory read-config-from-origin-main) | **PARTLY, and the gap is large.** The Mac copy is on `lead/2026-11-07-lead31`, **7,629 commits behind origin/main**. The hooks run the Mac versions: Mac `stop-check.sh` has 42 lines, main has 97; Mac `lane-preflight.sh` has 34, main has 44. **On the Mac, none of these fire:** main `T/stop-check.sh:80` founder-click-guard, `:84-88` question-gate, `:90` resource-claim-guard; main `T/lane-preflight.sh:24-26` touch-overlap. Three Stop-hook guards and the lane-start touch-list guard exist but never run for the Lead. | Every rule enforced "by hook" since about 7 Nov is silently off for the Lead, and the Lead is the copy that made the mistakes. | **(a)** lane-watch line `STALE-LEAD-COPY` when `git diff --quiet origin/main -- .claude/settings.json $T` fails, every 3 min. Also **(b)**: the SessionStart hook prints the same line. **LR-032** (#3506: Lead tools are main's, copy under 24 h old) covers it. Land LR-032 first. |
| 2 | **Hooks that were built are wired:** ist-time-guard (P-302), wip-guard (P-622/623), queued-push-guard (P-619), lead-read-guard (P-423), lead-act-check (P-388/389) | **PARTLY (built, not wired).** Each file's header says "PreToolUse hook" or "Stop hook" (`T/ist-time-guard.py:4`, `T/wip-guard.py:4`, `T/queued-push-guard.sh:2`, `T/lead-read-guard.sh:5`, `T/lead-act-check.sh:4`). None of them appears in main's or the Mac's `.claude/settings.json`; only `check-guards.sh` tests call them. | Pushes to queued PRs reset the queue (15 Nov). Future times reach the records. WIP caps are passed at lane start. Missed checks go unseen. | **(c)** a CI check: every tool whose header declares a hook is either named in `.claude/settings.json` or marked retired. Then wire them in one settings PR, which needs the founder's OK (P-387). Runs on every PR. **LR-004** (guard review) / **LR-046**. |
| 3 | **A missed Lead check is caught within about 40 min** (P-388/P-389 heartbeat; memory no-prompting-calls-unattended) | **PARTLY.** `Mac T/lead-heartbeat.sh:14-17` runs only inside a standby Lead, and STATE says "Standby: none". `T/lead-watch.sh:47` catches the gap only when the next check runs, which is too late. lead-act-check is unwired (no. 2). | Checks stopped for 7.4 h on 6-7 Nov and 7.2 h on 9 Nov. PRs sat ready and lanes sat idle. | **(a)** lane-watch reads `/private/tmp/claude-501/lead-watch/last-check`. Age over 40 min prints `LEAD-CHECK-MISSED <min>`, every 3 min, with zero tokens. This replaces the standby heartbeat. **LR-105** (anti-stall, launchd heartbeat). |
| 4 | **claude.ai lanes waiting or failed are seen, with "Show more" clicked until gone** (P-339b, P-789 (2); memory claude-ai-sidebar-show-more, app-view-and-prompt-approvals, cloud-lanes-silent-outage) | **PARTLY.** Main already has the click loop (`T/app-view.js:27,65`) and refuses a saved read without `rows=N` (`T/app-view-check.sh:19-20`, called at `T/lead-watch.sh:320-325`). The new `Mac T/claude-lanes.js` (A430) **duplicates** it. The gap: the read needs the AI's browser at every check. If the Lead skips it, the only result is an ACT at the next check. | Lanes wait hours (20 Nov: 4 hidden waiting lanes; 27 Nov: the founder had to remind the Lead). | Use main's app-view.js plus app-view-check. Fold claude-lanes.js into it, or retire it, so there are not two scripts. Long term, use the scripted nudge **LR-146** and the StopFailure hook **LR-147**. A430 / **LR-154** is already in flight; cite it. |
| 5 | **No personal names in anything public** (AGENTS rule 5; memory no-personal-names-rule; P-504 no team-app detail) | **PARTLY.** Commits are scanned: `Mac T/push-guard.sh:18` NAMES_RE, `.githooks/pre-push`, main `ci.yml:83`. **PR bodies and comments are not scanned**, and the repository is public. | Names, or detail from the team's app, published in a public repo. Cannot be taken back. | **(a)** lane-watch already reads every new comment (`lane-watch.sh:10-22`). Add a NAMES_RE match that prints `NAME-IN-COMMENT #n`, every 3 min, zero tokens. **(c)** run the same match on the PR body in pr-rules. No LR row: add it under LR-046 (small hook and check fixes). |
| 6 | **No unapproved paid AI: no live switch on check copies, no priced-button clicks** (P-175, P-175b; memory no-live-switch, no-priced-button-clicks) | **PARTLY.** Live AI is off unless `STUDIO_AI_LIVE=approved` (main `prototype/studio/api/src/people-ai.ts:56`), and the ledger reserves before each call (`prototype/p2/ledger.ts:1`). A copy *started* with the switch on goes around both (US$0.17 on 30 Oct, US$0.27 on 29 Oct). | Money spent without approval. | **(a)** lane-watch counts the lines in `prototype/p2/ledger/spend.jsonl`. Any growth without an approved-run marker prints `SPEND +n lines`, every 3 min. No LR row: add under LR-066 (spend caps). |
| 7 | **Burn watch: over 3% of the weekly plan an hour, twice, is an act** (P-440d) | **TEXT ONLY.** `Mac T/usage-log.sh:2-9` only logs. Only `get_usage` can read the meter, and only the AI can call it. | Weekly plan burned unseen (2 Nov: 26% in 5 h). | **(d)** the check report must carry `weekly N% (+x/h)`. usage-log.sh computes the rate and prints `ACT` when it is over 3 twice. A Stop hook on check turns refuses a report without the line. Every check. **LR-099**. |
| 8 | **Never run guard or test suites in the main copy** (F-7Nov; memory guard-tests-not-in-main-copy) | **TEXT ONLY.** The temp-folder fix stops one cause; nothing stops the command itself. | 7 Nov: 3,511 files removed from disk in the main copy, and uncommitted work was committed on the lead branch. | **(b)** a PreToolUse Bash hook denies `check-*.sh`, `check-guards.sh` and `run-suites.sh` when the command's top-level folder is the main copy. Fires on every call, zero tokens. No LR row; add to the LR-153 after-the-lab list. |
| 9 | **No tool call that can wait on a permission prompt while the founder is away** (P-388; memory no-prompting-calls-unattended) | **TEXT ONLY.** | Two nights lost (7.4 h and 7.2 h). | **(b)** a PreToolUse hook. In a turn the founder did not type (away flag), it denies, rather than prompts on, writes under `.claude/` and the session's first `run_in_terminal`. **LR-105** (away-flag hook) and **LR-006** (deny instead of prompt). |
| 10 | **Shell traps:** `pkill -f` kills its own shell (exit 144); zsh `"$C:refs/…"` mangles refspecs; zsh `set -- $var` does not split (memory shell-self-kill-pkill, zsh-colon-modifier-refspec, zsh-cancel-runs-incident) | **PARTLY.** Cancelling runs is denied (`Mac .claude/settings.json:43-45`). The other two traps are not caught. | A wrong commit went out (B83). A records PR had to be rebuilt. An hour of CI was cancelled. | **(b)** a PreToolUse Bash regex that denies `pkill -f` and an unbraced `\$[A-Za-z_]+:(refs|r|h|t|e)\b`. Fires on every call. No LR row; add to LR-046. |
| 11 | **Every step is committed and pushed** (P-557, AGENTS rule 10; memory save-work-often, scratch-worktree-push-and-staging) | **PARTLY.** `T/stop-check.sh:92-93` only *notes* uncommitted or unpushed work. Its count uses `@{upstream}`, so a branch with **no upstream** (the B168 failure: six commits left local) gets **no note at all**. | Lost work, and reviewers reading stale heads. | **(b)** fix the Stop hook: when there is no upstream, compare with `git ls-remote origin <branch>`. **(a)** lane-watch: the Lead copy holding uncommitted records for over 30 min prints a line. **LR-046** (push-before-stop test OS-29). |
| 12 | **Founder asks:** a question goes through the selectable-question tool, one at a time with a recommendation, and gives a full clickable link and the plain purpose next to every code. **Reports:** open with "Needs you"; carry the ETA board, the factory view, and the sample and time window next to every number (P-478, P-338, P-503; memory questions-apart-from-text, founder-wants-clickable-links, purpose-next-to-codes, capability-eta-rule, factory-view-in-every-report, numbers-from-todays-environment) | **TEXT ONLY.** Only the related "founder clicks" part is checked (`T/stop-check.sh:80`, and that does not run on the Mac; see no. 1). | The founder misses questions, re-asks, and loses trust in the numbers. Repeated corrections on 5, 11, 17 and 19 Nov. | **(d)** a Stop hook on check turns (the prompt equals the canonical check line) refuses a report missing its required headings (Needs you, ETA, factory, `window:`, `claude.ai:`). **(b)** extend founder-click-guard: a founder-facing `#NNNN` with no `https://` link blocks. **LR-050**, **LR-051**, **LR-090** (codes with plain names). |
| 13 | **Scratch disk cap: 3 GB per lane** (memory qa-scratch-disk-cap, enforce-rules-not-text) | **PARTLY.** `T/capacity-watch.py:6-7` lists folders over 100 MB only once free space is under 10 GB. `Mac T/lane-preflight.sh:29` refuses Mac starts under 7 GB free. Nothing caps one lane. | 19 Nov: 137 MB free, and every session stopped. | **(a)** lane-watch: `du -sk` of each session folder under `/private/tmp/claude-501`; over 3 GB prints `SCRATCH <session> <GB>`. Every 3 min, cheap. No LR row; add under LR-046. |
| 14 | **Context hand-over: the Lead at 200k beyond its start read (P-446); lanes at 45% hand over and 50% replace (P-565); builders ~400k, qa ~300k (P-446f, P-486b)** | **PARTLY.** `T/lead-watch.sh:96-98` (lead-upkeep.py) needs the AI to type `LEAD_CONTEXT`; a missing value gives an ACT. Lane context is read only through the browser app view (`T/lead-watch.sh:322-323`). | Lead 3 handed over at about 460k on 27 Nov, more than twice the line. | **(b)** a Stop hook reads the transcript size and warns at the line, in every session, zero tokens. **LR-053**. |
| 15 | **PR rules are required checks: 800 lines, "Duplicate check:", "Done when"** (P-610, P-526, P-606) | **PARTLY.** `T/pr-size.sh:2` and `T/brief-check.sh:2-4` run in `pr-rules.yml:55`, but pr-rules is not a required check. Lane starts check only the *form* of the duplicate check, not that it was actually done. | Oversized PRs (15 of 25 over 800 lines took 4.3 h) and duplicated lanes (22 Nov). | **(c)** make pr-rules required once its false failures are fixed. **LR-043**. |

---

## 3. Full table

Status: E = ENFORCED · P = PARTLY · T = TEXT ONLY · J = JUDGEMENT · R = RETIRE. "In check" = it fires only when the AI's 30-minute check runs `lead-watch.sh`, so tokens are spent; it is not an event.

### 3.1 Git, push and repository safety

| # | Rule | Source | St | Enforcer evidence / gap | Proposal · how often · LR |
|---|---|---|---|---|---|
| 1 | No force-push, no deleting remote branches, no history rewrite | AGENTS 1 | E | `Mac .claude/settings.json:4-17` deny lines | — |
| 2 | Never push to main; every change goes by PR | P-87 | E | `Mac .githooks/pre-push:10-11` | — |
| 3 | Push and commit hooks cannot be skipped (`--no-verify`, hooksPath) | P-82 | E | `Mac .claude/settings.json:60-67` | — |
| 4 | Never push sources/, code/, archive/, PDFs, databases, secrets | AGENTS 1, P-81/82 | E | `Mac T/push-guard.sh:11-15`; main `.github/workflows/ci.yml:83` | — |
| 5 | No personal names | AGENTS 5 | P | `Mac T/push-guard.sh:18` covers commits only; PR bodies and comments are not scanned | (a)+(c), top 15 no. 5 |
| 6 | Public repo: no team-app specifics; a PR that ever carried them never merges | P-504, P-505 | P | `T/push-guard.sh:25` names only; no detail scan | (e) with (a) keyword list from `T/requirements-names.txt` in lane-watch comments · 3 min |
| 7 | No Drive create, edit, share or delete | AGENTS 1 | E | `Mac .claude/settings.json:38-42, 69-73` | — |
| 8 | No email sent; no issues or PRs in the team's repositories | AGENTS 1; memory read-only-access-rule | P | Issues denied (`Mac .claude/settings.json:21-24`); `gh pr create --repo <team repo>` and mail tools are not denied | (b) PreToolUse: deny `gh pr create`/`gh api` whose repo is not `expat-ready/*`, and `mcp__*__send*` · every call · none |
| 9 | Never cancel a CI run; re-run the failed part | P-371; memory zsh-cancel-runs-incident | E | `Mac .claude/settings.json:43-45` | — |
| 10 | Shell traps (pkill -f, zsh `:r` refspec, `set -- $var`) | memory 3 files | P | cancel part only (row 9) | (b), top 15 no. 10 |
| 11 | Guard or test suites only in a throwaway copy | F-7Nov | T | — | (b), top 15 no. 8 |
| 12 | Stage paths by name; check `diff --stat` after suites | memory scratch-worktree-push-and-staging | J | The reviewer catches stray files | (e): which files belong to a row is a judgement · LR-118 moves bulky evidence out |
| 13 | Push confirmed with `ls-remote`; no upstream must not hide unpushed work | same, P-557 | P | `T/stop-check.sh:93` is silent with no upstream | (b) fix, top 15 no. 11 |
| 14 | Always committed, always resumable; STATE says what is in flight | P-557, AGENTS 10; memory always-committed, save-work-often | P | `T/stop-check.sh:92` note only, never blocks | (a) Lead-copy dirty for over 30 min · 3 min · LR-046 |
| 15 | Read main's behaviour from origin/main, never the stale branch | memory read-config-from-origin-main | P | Root cause is row 16 | Becomes moot once LR-032 lands |
| 16 | Fresh `lead/<today>` branch from origin/main each day | P-388 | P | Branch is 20 days old and 7,629 commits behind; hooks run stale copies | (a)+(b), top 15 no. 1 · **LR-032** |
| 17 | Records keep their facts; size trims drop only duplicates | AGENTS 8, P-188; memory size-limit-trims-keep-facts | T | `T/check-docs.sh:32` forces the trim but does not check what was lost | (c) on records PRs: every line removed from STATE or RULES appears in a `history/` file in the same PR · every records PR · LR-091 |

### 3.2 Merge flow and the queue

| # | Rule | Source | St | Enforcer evidence / gap | Proposal · how often · LR |
|---|---|---|---|---|---|
| 18 | Only the Lead merges, closes or reviews PRs | P-87, P-163, P-293 | E | `Mac T/merge-guard.sh:11,17-18`; wired at `Mac .claude/settings.json:100-123` | — |
| 19 | Label only on "Reviewer: Approve <head sha>" and green CI | P-385 | E | `T/label-guard.sh:7`; label-guard.yml | — |
| 20 | Relabel after a failed batch only after a green full run and the "Batch failures covered" line | P-731, G-848 | E | `T/label-guard.sh:13` (RULES still says "owed"; update the register) | Bot writes the line: **LR-056** |
| 21 | pr-suites green before the label | P-822 | E | `T/queue-gate.sh:8` (RULES says "owed"; update the register) | — |
| 22 | The Lead reads the diff before labelling risky paths | P-423, P-823, P-637 | P | `T/queue-gate.sh:394` lists owed after-reads; the `T/lead-read-guard.sh:5` hook is unwired | Superseded in direction by P-849: **LR-122/LR-144** |
| 23 | Claude Approvals is the approver; risky paths need a Code Review pass | G-849 | T | approvals.yml is owed | **LR-070, LR-122, LR-144** |
| 24 | Never push to a PR labelled `queued` | P-619 | P | `T/queued-push-guard.sh:2` unwired | wire (b), top 15 no. 2 |
| 25 | Records PRs go only through the records queue, never batched with code | P-371 (4); memory records-merges-reset-queue | E | `Mac .mergify.yml:16-20, 38-46`; `T/records-only.sh` via records-label.yml | — |
| 26 | Mergify requeue is a bare comment | memory mergify-command-bare-comment | E | `T/lead-pr.sh:12,93` posts exactly `@mergifyio requeue` | Add (a): lane-watch flags a non-bare requeue comment · 3 min |
| 27 | gh.sh fallback never posts `@file` paths; check posted bodies | memory gh-fallback-body-file | T | `T/gh-fallback.py:150` parses `input` but nothing checks for an `@/` body | (a) lane-watch: a Lead comment whose body starts with `@/` prints `BAD-BODY #n` · 3 min · LR-060 |
| 28 | Dequeued, approved-then-red, nothing merged for 60 min, CI jam | P-646 | E (in check) | `T/lead-watch.sh:120` (red after approval), `:171` (queue blocked); `lane-watch.sh:21` DEQUEUED (3 min) | Move "nothing merged 60 min" to (a) · LR-123 |
| 29 | Check or pipeline fixes may land ahead; emergency hand merge only while the queue is broken | P-214, P-691; memory unblock-merge-flow-rule | J | ruleset bypass log | (e): needs a reason; LR-049 detects human-cancelled runs |
| 30 | PRs under 800 lines; "Duplicate check:"; "Done when" | P-610, P-526, P-606 | P | `T/pr-size.sh:2`, `T/brief-check.sh:2-4`, `pr-rules.yml:55`; not required | (c) **LR-043**, top 15 no. 15 |
| 31 | Approve on the branch first, then open the PR non-draft | P-683 | T | — | **LR-047** |
| 32 | Merge main in only on a conflict; a PR that merged main three times lands next | P-270 | T | — | **LR-148** removes most of the churn; (c) count merge commits in pr-rules |
| 33 | Re-review reads only the diff since Approve; at most two rounds | P-277 | P | review-rounds.yml exists on main (not read line by line) | **LR-135, LR-148** |
| 34 | Gate B: an open Major or Critical holds the capability | P-317, P-305, P-488 | E | main `ci.yml:23-24` gate B | — |
| 35 | A mutating route needs a screen caller | P-348d | E | main `ci.yml:285` route-has-screen.mjs | — |
| 36 | No PR-controlled code runs with a write token | P-312a | E | `T/check-write-token.sh:2` | — |
| 37 | Schema and migrations additive; one builder on schema.prisma | P-600, P-438b | P | main `ci.yml:308-315` own-migration-guard is report-only; `T/lane-preflight.sh:24-26` touch-overlap (main only; see row 16) | **LR-045** |
| 38 | Overlapping touch lists never run at once | P-526b, P-576 | P | `T/lane-preflight.sh:24-26` on main, not in the Mac hook | Fixed by LR-032 |
| 39 | Flaky retries or sleeps need a reason | — | T | — | **LR-151** |

### 3.3 Lanes, sessions and the Lead's check

| # | Rule | Source | St | Enforcer evidence / gap | Proposal · how often · LR |
|---|---|---|---|---|---|
| 40 | Check prompt is exactly `run lead-watch; read STATE Start here`; the only recurring job | F-6Nov | E | `Mac T/lead-check-guard.sh:10,16,22-25`; wired `Mac .claude/settings.json:150-154` | — |
| 41 | A missed check is caught | P-388, P-389 | P | `T/lead-watch.sh:47` (next check only); heartbeat needs a standby | (a) top 15 no. 3 · LR-105 |
| 42 | Lane briefs name model, effort, Done when, Duplicate check | P-608, G-4 | E | `Mac T/lane-preflight.sh:15-16` | — |
| 43 | No Mac lane starts without room (disk, load, copy cap) | P-348e, P-462 | E | `Mac T/lane-preflight.sh:29-32`; wired `:128-132` of settings | — |
| 44 | Reviewers and breakers on Opus | P-303, P-605 | E | `Mac T/agent-model-guard.sh:12-18` | Effort part: see R-row 105 |
| 45 | Builders and qa never edit the Lead's files | P-314, P-521 | E | `Mac T/stop-check.sh:15-22` (main `:24-30`) | — |
| 46 | Session start pulls main and binds the copy | P-82 | E | `Mac T/session-start.sh:13-19` | — |
| 47 | Questions for the tech lead answered fast (10 to 20 min) | P-778, P-798 | P | `lane-watch.sh:17` QUESTION (3 min, zero tokens); `T/lead-watch.sh:156`; question-gate Stop hook `T/stop-check.sh:84-88` not on the Mac | Fixed by LR-032 |
| 48 | Lane reports and hand-overs to the Lead are seen | A85, P-611b | E | `lane-watch.sh:18,20`; `T/lead-watch.sh:192-210` items.py | — |
| 49 | claude.ai waiting lanes, Show more | P-339b, P-789 | P | `T/app-view.js:27,65`, `T/app-view-check.sh:19-20`; needs the AI's browser | top 15 no. 4 · LR-154 / LR-146 / LR-147 |
| 50 | Sent message confirmed as a bubble; Return, not Cmd+Return; one send per check | memory claude-ai-prompt-box-send | J | — | (e) until **LR-146** (scripted `claude -p --cloud`) replaces typing |
| 51 | Local lane stalled or messages paused (10-message cap) | P-420; memory local-lane-silent-stall, watcher-trial | E (in check) | `T/lead-watch.sh:218`; `Mac T/local-lanes.sh:7-9` | — |
| 52 | A lane counts only after a push | P-326, P-339b | P | `T/lead-watch.sh:216` prints pushes; no ACT for a started lane with no push in 20 min | (a) lane-watch: a new session with no branch push after 20 min · LR-147 |
| 53 | App starts at most 10 sessions per message, 5 at once | memory app-session-start-cap | T | — | (b) PreToolUse on start_session counts starts this turn and refuses the 6th with "use cards" · every call · LR-104 (turn cap) |
| 54 | Context lines (Lead 200k, lanes 45/50%) | P-446, P-565, P-446f, P-486b | P | `T/lead-watch.sh:96-98`, `:322-323` | (b) **LR-053**, top 15 no. 14 |
| 55 | Two ready rows per lane | P-599 | E (in check) | `T/lead-watch.sh:388` | — |
| 56 | Starts owed at the founder's next typed turn are raised | P-772 | E (in check) | `T/lead-watch.sh:392` | — |
| 57 | Founder clicks done by the Lead in the browser | P-752, P-763, P-699; memory lead-labels-on-founder-behalf, do-it-yourself-first | P | `T/lead-watch.sh:380-382` (in check); Stop hook `T/stop-check.sh:80` not on the Mac | Fixed by LR-032 |
| 58 | Planned steps whose trigger fired are raised at once | memory surface-founder-clicks-at-trigger | P | `T/lead-watch.sh:380-392` covers clicks and starts, not other triggers | (d) "Owed with fired trigger" line · LR-050 |
| 59 | Red "Waiting on the founder" re-pushed after 30 min | P-530 | E (in check) | `T/lead-watch.sh:397-400` founder-wait.py | — |
| 60 | WIP caps; finish before starting | P-622, P-623, P-745 | P | `T/lead-watch.sh:130` ACT; `T/wip-guard.py:4` start hook unwired | wire (b), top 15 no. 2 |
| 61 | Build or move a builder when a step is twice its median | P-798 | E (in check) | `T/lead-watch.sh:272` | — |
| 62 | Measure the one constraint each check | P-738 | E (in check) | `T/lead-watch.sh:407` flow-constraint.py | — |
| 63 | No claim about machines or capacity without a measured number | P-771; memory github-account-facts | P | `T/resource-claim-guard.sh` via `T/stop-check.sh:90`, not on the Mac | Fixed by LR-032 |
| 64 | Records (DECISIONS, skills) reach main | P-606, A76 | E (in check) | `T/lead-watch.sh:292` | — |
| 65 | Lead hand-over lists each lane's last message | P-532 | P | `T/handover.sh:6` prints lane lines; completeness not checked | (d) · LR-020 |
| 66 | One needs-Lead queue with ack and timeout | P-611b | E (in check) | `T/items.py:2`, `T/lead-watch.sh:204` | — |
| 67 | Outside dependencies started 2 weeks ahead; red when due | P-618; memory outside-dependencies-early | E (in check) | `T/outside-deps-watch.py:4`; called in lead-watch | — |
| 68 | Library masters current | P-593 | E (in check) | `T/library-freshness.py:3`; `T/lead-watch.sh:304` | — |
| 69 | Private notes synced; private backup under 24 h | P-678, P-589 | E (in check) | `T/lead-watch.sh:277,287` | — |
| 70 | Board and check verify each other | P-639, P-591 | E (in check) | `T/lead-watch.sh:338` | — |
| 71 | Weekly human sample | P-782 | E (in check) | `T/lead-watch.sh:152` human-sample.py | — |
| 72 | Account switch: get_usage first, connection checklist (GitHub connected, newest lane pushed) | P-458; memory cloud-lanes-silent-outage, account-switch-* | T | — | **LR-143** (SessionStart detects a new account) |
| 73 | Weekly plan is never a limit; prepare the switch at about 90% | P-461; memory weekly-plan-never-a-limit | P | `T/lead-watch.sh` prints the plan only through `get_usage` (AI) | (d) "switch ETA" line at ≥90% · LR-143 |
| 74 | Burn watch, 3%/h twice | P-440d | T | `Mac T/usage-log.sh:2` logs only | (d) top 15 no. 7 · **LR-099** |
| 75 | No prompt-waiting calls while the founder is away | P-388 | T | — | (b) top 15 no. 9 · LR-105, LR-006 |
| 76 | Scratch cap 3 GB per lane | memory qa-scratch-disk-cap | P | `T/capacity-watch.py:6-7` | (a) top 15 no. 13 |
| 77 | Disk under 10 GB: free space; temp packs deleted | P-308 | E (in check) | `T/lead-watch.sh:83-95`, `:107` | Move to (a): `df -g /` in lane-watch · 3 min |
| 78 | No live AI and US$0 in lanes; live only as a Lead-approved paid run | P-175, P-175b, P-377 | P | `prototype/studio/api/src/people-ai.ts:56`; `prototype/p2/ledger.ts:1` | (a) ledger watch, top 15 no. 6 |
| 79 | Day cap US$30/50; over it goes to the founder; never drop needed work silently | P-295; memory budget-shortfall-ask-founder | P | `prototype/p2/ledger.ts:8` caps per experiment | (e) for the ask; LR-066 caps |
| 80 | No new account, key or purchase by anyone but the founder | P-551, P-821 | J | Built-in safety rules also forbid it | (e): the Claude safety rules already enforce it; no code needed |

### 3.4 Records and the register

| # | Rule | Source | St | Enforcer evidence / gap | Proposal · how often · LR |
|---|---|---|---|---|---|
| 81 | STATE ≤ 12 KB | P-336 | E | `T/check-docs.sh:32` | — |
| 82 | RULES lags DECISIONS by ≤ 3 rows | P-440 | E | `T/check-docs.sh:39` | — |
| 83 | Each Lead rule names its enforcer; the register fails on a missing file | P-611a | P | check-docs register field; no check that "owed" or "prose" rows are still true (rows 20, 21 above are stale) | (c) **LR-003** (register fails on a missing enforcer) + this audit's list |
| 84 | Every process rule the Lead recommends gets an enforcer in the same breath | memory enforce-rules-not-text | P | Same as row 83 | (c) check-docs: a new RULES row with "prose" needs an LR row or a reason · every records PR · LR-003 |
| 85 | Times only from `TZ=Asia/Kolkata date`, labelled IST | P-302, P-607; memory times-in-ist | P | check-docs warns only; `T/ist-time-guard.py:4` hook unwired | wire (b), top 15 no. 2 |
| 86 | Every R1 row has `Source:`; domain values carry a source | P-595, P-801 | E | main `trace.yml:51`; `T/source-check.py:2-5` via brief-check | — |
| 87 | Builders read only `trace-requirements.py --brief` text | P-604 | T | — | (e): what a session reads cannot be checked cheaply; LR-106 generated task spec makes it moot |
| 88 | Every left-out item is a BACKLOG X-row in the same change | P-582 | T | — | (c) pr-rules: a PR body with "left out" / "later" and no X-row diff fails · per PR |
| 89 | No ruling only in an unmerged PR: records PRs over 24 h merged or closed | P-526c | T | — | (a) lane-watch: open `lead:` / `qa:` records PR older than 24 h prints a line · hourly · LR-082 |
| 90 | Held parts listed in STATE; nobody builds them | P-251 | T | — | (c) pr-rules: a PR naming a held row fails · per PR |
| 91 | No combination key, form number or program branch in engine code | P-319 | T | slice guards retired 8 Nov | (c) a static sweep in `ci.yml:299-307` (static-sweeps.mjs) · per PR · LR-152 |

### 3.5 Judgement rules (keep as text, with the reason)

| # | Rule | Source | St | Why it stays judgement / partial helper |
|---|---|---|---|---|
| 92 | No hit-and-trial: evidence, root cause, named framework | P-502; memory no-hit-and-trial, every-ask-framework | J | Quality of reasoning. Helper: resource-claim-guard (row 63) covers machine claims |
| 93 | Right sample for the purpose; numbers from today's pipeline with window and sample | P-500; memory right-sample, numbers-from-todays-environment | P | `T/lead-watch.sh:115` app-code-prs.sh enforces product speed. Other analyses: (d) "window: … n=…" line |
| 94 | Evidence, not self-report; independent re-run for Works | memory evidence-not-self-report | P | Gate A/B and qa own the verdict (rows 34, 71). The rest is judgement |
| 95 | Immigration and domain facts from official sources, never asked of the founder | P-170, P-294, P-797, P-801; memory founder-is-immigration-expert, domain-*, requirements-delegation | P | `T/source-check.py` (row 86) checks a source line exists. Whether the source is right is judgement |
| 96 | The founder gives product direction only; the Lead owns the pipeline; check RULES before saying "stays with you" | P-384, P-486; memory founder-product-only | J | Founder-click-guard covers the click case (row 57) |
| 97 | Consultant mode: decide what sources settle, ask only preference | P-390, P-628; memory consultant-mode | J | Framing |
| 98 | Strategy desk and Lead talk directly; the founder never relays | P-511, P-514 | J | Conversation routing |
| 99 | Business language; explain jargon | memory business-language-rule, communication-style | J | Wording |
| 100 | Visual pages keep all information; fewer words never cuts detail | memory visual-review-style, keep-depth-in-visuals | J | Content judgement |
| 101 | Design before build; board is intent; best-in-class section for new screens | P-352, P-44; memory design-before-build, board-is-intent | P | (c) possible: pr-rules requires `screens/<item>/concept.md` with a best-in-class heading for a new screen · LR-107 |
| 102 | UX style; modern design, information first; test like a human, improvements to the founder first | P-473; memory modern-design, test-like-human, lead-owns-outcome-and-ux, surgical-screen-by-screen | J | LR-112 adds visual and design-system checks later |
| 103 | Reuse POC research; verify claims about the team's design against sources | memory reuse-poc-research, verify-against-sources | J | Briefing judgement |
| 104 | Coach role, grill the founder; missing tools are asked about and installed, never worked around | memory coach-role, missing-tools-ask-and-install, P-632 | J | Behaviour. A Stop-hook regex for "not installed / unconfirmable" would be cheap but noisy |
| 105a | Tokens like money: filter output, no re-reads, no raw dumps | P-440b, P-440c; memory tokens-like-money | J | LR-052 (start output under 1.5 KB) and LR-034 (start-read sum) measure part of it |
| 105b | Founder deck and plan wording style; team R&R by responsibility | memory founder-deck-wording, founder-plan-style, team-rr-mapping | J | Document style |
| 105c | Organised folders, never work out of Downloads | memory organised-folders-no-downloads | J | Push-guard keeps excluded paths out (row 4) |
| 105d | POC is production tech; judge readiness without tenants or environments | memory poc-production-scope, P-335 | J | Scoping judgement |
| 105e | Interview one question at a time with a recommendation | memory interview-one-question, interview-selectable-questions | J | Part of top 15 no. 12 (d). Content quality stays judgement |

### 3.6 Retire: obsolete or contradicted by a newer row (newest wins)

| # | Rule | Source | Contradicted by | Action |
|---|---|---|---|---|
| R1 | Keep two idle standby Leads | P-286; lead skill main `:55`; `T/capacity-watch.py:3` raises an ACT under 2 | STATE "Standby: none"; LR-003 lists P-286 | Retire. Replace the heartbeat with lane-watch (top 15 no. 3) and stop the capacity ACT noise |
| R2 | 10-minute check cadence and 10/15-minute targets | P-798, P-761; main lead-watch `:8,156,322` | LR-031 (DROP); cron 3,33 is 30 min | Retire the 10-minute wording. Re-time the app-view ACT (15 min fires at every 30-min check) |
| R3 | A 10-minute idle-sweep cron sends "continue" | memory no-idle-builders (P-259) | `Mac T/lead-check-guard.sh:23`: the Lead's only recurring job is its check | Retire. LR-146 nudge plus app view |
| R4 | Sonnet or Haiku for read-only analysis or mechanical work | memory tokens-like-money; main `lead-watch/SKILL.md:72`, `cto-review/SKILL.md:22` | A428, P-850, G-850: Opus 5.5 medium everywhere | Retire those lines |
| R5 | Reviewers and breakers at effort **high** (`agent-model-guard.sh` refuses medium) | P-608 (2); `Mac T/agent-model-guard.sh:15,25` | P-788, A428: Opus 5.5 **medium** everywhere | Align the guard: **LR-103** |
| R6 | Strategy desk on Fable 5.2 | P-597, P-605 | A428 "everywhere the Opus latest model 5.5" | Tech lead to confirm whether A428 covers the desk; if yes, retire |
| R7 | GitHub Actions US$10 budget; spend runs sparingly | memory github-ci-budget | Enterprise Cloud since 18 Nov (memory github-account-facts) | Retire the note |
| R8 | Cancel CI runs on records branches | memory records-merges-reset-queue | P-371 never cancel; deny lines (row 9); Mergify records queue | Retire that sentence (keep the queue lesson) |
| R9 | Ask the founder to name a PR so the Lead may label it | memory lead-lessons-2026-11-04 | P-752, P-637 (bot labels), P-849 | Retire the line |
| R10 | Fresh lane sessions for each new Lead chat | memory fresh-sessions-per-lead-chat (29 Oct) | P-532: lanes carry across hand-overs | Retire |
| R11 | Cloud builders cannot be woken by a message | memory cloud-builders-one-way, cloud-lanes-not-woken | Its own 5 Nov correction; LR-146 | Retire the old part |
| R12 | Back up records to a no-PR branch | memory save-work-often | P-557 plus `T/lead-pr.sh` records PR flow (LR-033) | Retire the backup-branch part |
| R13 | Ask the founder when a budget does not fit (weekly plan) | memory budget-shortfall-ask-founder | memory weekly-plan-never-a-limit (25 Nov) | Keep for money caps only; retire for the weekly plan |
| R14 | No product row waits on pipeline work | P-542 | P-847: product stops until the lab is done | Suspend until P-847's restart condition |
| R15 | P-733/P-734 run to 22 Nov; FULL_RUN_FROM to 22 Nov; Namespace trial; cloud lanes cannot dispatch Actions (comment-run.yml now lets them: `T/lead-watch.sh:186`) | P-734, IDX-17, P-651, P-439 | Dates passed; tools changed | **LR-003** already lists them |
| R16 | One maker plus a Cowork reviewer; only the founder starts replacements | memory session-handover-rule | P-64, P-532 | Retire (already marked superseded) |
| R17 | GitHub through curl with `gh auth token` (P-363) | P-363 | gh.sh fallback, LR-060 one allow-list door | **LR-003** |

### 3.7 Notes for the tech lead

* **Register text is stale in at least two places:** P-822 says "queue-gate (owed)", but `T/queue-gate.sh:8` enforces it; P-731 says "label-guard (CI-PRE, owed)", but `T/label-guard.sh:13` has it. A register that understates enforcement makes the gap look bigger than it is. A register that overstates it (IDX-21 "hook: founder-click-guard": a Stop-hook part on main, not a registered hook, and not running on the Mac) is worse.
* **Cost:** 15 of the 40 ENFORCED rows are "in check", so they fire only when the AI runs the 30-minute check. Moving the GitHub-only ones to lane-watch (rows 28, 77, plus the new (a) lines in rows 3, 5, 6, 13, 14, 27, 89) gives zero-token detection, and an AI wake only on an event. The AI check then shrinks toward judgement, as LR-073 and LR-123 plan.
* Nothing in this audit was run against GitHub live (the sandbox blocked github.com). All main reads come from the local `origin/main` ref as fetched at 27 Nov 06:45 UTC.
