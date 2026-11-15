# Best-practice check: are the Lead's and lanes' rules enforced? (15 Nov 2026, read-only)

## Summary (plain words)
* **Met:** the short front-door files (CLAUDE.md 1.5 KB, AGENTS.md 3 KB, both far under the 200-line guidance); 12 skills, all under 100 lines; hooks that block by exit code, not by asking nicely (merge guard, lane start check, Lead check-prompt guard, Stop check, push guard, pre-push); CI guards (label guard, gate B, rules-file checks); a deny list for force-push, repo and secret changes.
* **Not met:** `RULES.md` is 60 KB (139 lines of very long paragraphs) and the lead skill tells a new Lead to read it whole; most rules in it are prose only; nothing yet makes "a lane report was seen" or "a hand-over is complete" a checked fact; the weekly "what's new" check and its board box do not exist yet (no `cockpit/whats-new.json`); decisions P-611 and rows G-1 to G-5 are written but not built.
* Of the 8 sections of RULES.md, about a third of the individual rules have a named enforcer; about a third are enforced only by a skill instruction; about a third are written only (table below, count is my reading, not a tool's).
* Skills use none of the newer controls (`allowed-tools`, `disable-model-invocation`, `paths`); the two sub-agents (reviewer, breaker) have no `model` set, so "Opus, high effort for reviewers" (P-605, P-608) rests on the Lead remembering.
* Not wrong, just absent: no `PostToolUse`, `SubagentStop`, `PreCompact` or `SessionStart`-after-compact hook; no `crossSessionInbound` or `denyInsteadOfPrompting` setting.

**Five highest-value gaps, smallest fix each**
1. **A lane report can still sit unseen** (the 1.5 h board v61 miss). Smallest fix: G-1/G-4 in one go: a fixed first line `LANE-REPORT:` plus `lead-watch.sh` printing every un-acked report older than 45 min as ACT (3b already does the phrase and `board/*` branch part; add the ack timestamp file and the 90 min founder line).
2. **Hand-over is a 12-step prose recipe; it can be skipped when context is full.** Smallest fix: `tools/handover.sh` that refuses to change `current_lead:` while an item is un-acked or a `board/*` or lane branch is ahead of main (G-2), and call it from a Stop hook when the transcript mentions hand-over.
3. **RULES.md is 60 KB and mostly prose.** Smallest fix: the rule register (G-3): one line per rule `ID | rule | enforced-by | as-of`, `check-docs.sh` fails a line with no enforcer field and a page over 25 KB; the long paragraphs move word for word to `history/` or a side file the skill opens only when needed (P-188: nothing cut).
4. **Rules that live only in a skill or the heads of Leads.** Smallest fix: convert five by harm into hooks/CI (G-4): PR still open before a push; reviewer and breaker model Opus high (set `model:` and effort in the two agent files, and have `lane-preflight.sh --hook` refuse a `start_session` brief with no model line, P-608); "Done when" and `Duplicate check:` line in every PR body (a 10-line CI step, P-526); PR under ~800 lines warning; label only on Approve for the current head (label guard exists: verify only).
5. **No weekly "what's new" check exists.** Smallest fix: a scheduled task (Mondays, IST) that runs one read-only Sonnet or Fable watcher with the procedure in `design/governance-research-2026-11-15.md` section D and writes `cockpit/whats-new.json`; add the board box after the first file exists (G-5). Same step can apply the cheap settings the research found: `denyInsteadOfPrompting`, `blockWritesOutsideWorkingDirectories`, `Skill(lead-watch)` allow, which are the founder's to approve (P-611, P-387).

Honest note: much of the gap analysis already exists in `design/governance-research-2026-11-15.md` (section B, 8 gaps, with sources fetched 15 Nov). I did not re-fetch the docs; I rely on that file's quotes of the Anthropic memory, hooks, skills, cross-session and agent-teams pages, and on my own knowledge of the same features. This report adds the rule-by-rule classification and the checks of what exists on disk.

## What the founder asked, exact words
* **A85 (STATE.md, 12:5x IST, 15 Nov):** "(2) the rules a Lead must follow and how they are enforced, per best practice of Claude Code docs (CLAUDE.md, agents, skills, hooks, communication between sessions); (3) a weekly check of new Claude features, with a board box (checked this week? what's new? detail on click); (4) archive lanes and agents that finished; (5) hand-over to the new account with a detailed prompt so no action, decision or build is lost". Lead 55's answer: "(2)+(3) research running -> enforcement plan + RULES lines + board box"; open: (2), (3), (5).
* **P-611 (DECISIONS.md):** "so that nothing get lost ... or nothing get halted because of some blockers or some decisions or some actions or some approvals"; "let's make it a rule to periodically every week check if there is any new functionality came ... and you can put one box on the board for this". Ruling: (1) every Lead rule is enforced by a script, hook or CI check where one can be written, prose-only rules are "a to-do list, not a guarantee"; (2) one queue for every report, question, blocker, approval, with owner, acknowledgement, timeout (45 min ACT, 90 min founder line; no hand-over with an un-acked item); (3) Monday weekly check, each item adopt yes/later/no, `cockpit/whats-new.json`, a board box. Rows G-1 to G-5 in BACKLOG.
* Related: P-605/P-608 (model and effort at every start), P-610 (narrowest fix), P-557 (always committed, resumable), P-387 (settings are the founder's). RULES.md first line says "as of P-612" and carries P-611 as one line.

## What exists (inspected)
| Item | Finding |
|---|---|
| `CLAUDE.md` / `AGENTS.md` | 1.5 KB / 3.1 KB. Good. `check-docs.sh` fails over 60 lines. CLAUDE.md imports AGENTS.md (so Claude reads both). |
| `.claude/hooks/` | Does not exist; hooks are in `settings.json` and call `product/tools/*.sh` (fine; prior research noted the same). |
| `settings.json` hooks | SessionStart `session-start.sh`; PreToolUse Bash `merge-guard.sh` on `gh pr merge/close/review`; PreToolUse `start_session` `lane-preflight.sh --hook`; PreToolUse `CronCreate` `lead-check-guard.sh`; Stop `stop-check.sh`; UserPromptSubmit `prompt-log.sh`. |
| `settings.json` permissions | A long deny list (force-push, branch delete, `gh issue/repo/release/secret/api -X`, Drive writes). Allow: only the two label commands. `settings.local.json` (Lead copy) allows `gh pr merge/close/comment/review`, `start_session`, `archive_session`, `set_setting`; merge-guard refuses them in other copies. No `denyInsteadOfPrompting`, no `blockWritesOutsideWorkingDirectories`, no `crossSessionInbound`. |
| Skills | 12, 14 to 62 lines, 1.5 to 10.2 KB (lead 10.2 KB, qa 9.6 KB, next 6.3 KB, cto-review 6.3 KB, lead-watch 5.9 KB). Frontmatter is `name` + `description` only; descriptions are specific "use when" text (good). No `allowed-tools`, `disable-model-invocation`, `paths`, side files. `lead` has one dense paragraph of about 1.7 KB for hand-over. |
| Sub-agents | 2: `screen-reviewer`, `screen-breaker`; `tools:` restricted (good, isolated context); no `model:` field. No agent for the read-only watcher/inventory side work that RULES says should go to cheap models. |
| `.githooks/pre-push` | Runs `push-guard.sh` on every ref; refuses push to `main` (P-87), PDFs, secrets, personal names, excluded folders. |
| `.github/workflows/` | `ci.yml` (41 KB: push guard, route-has-screen, rules files `check-docs.sh`, typecheck, gate B, packs, regression, test-DB cleanup), `guards.yml` (tests of guards, each fails with its guard off), `label-guard.yml`, `records-label.yml`, `nightly.yml`, `demo-update.yml`, `cockpit-tests.yml`. |
| `tools/check-docs.sh` | Enforces: skills/agents under 100 lines and 10 KB (note: `lead` is 10.2 KB, "10 KB" is read as 10240 bytes so it passes narrowly); CLAUDE/AGENTS under 60 lines; exactly one `current_lead:` line; STATE under 12 KB; RULES "as of P-NNN" at most 3 rows behind DECISIONS; backticked paths exist. It does **not** limit RULES.md size or require an enforcer per rule. |
| Missing files named by P-611/G-rows | `state/items.json`, `tools/handover.sh`, `tools/takeover.sh`, `cockpit/whats-new.json` do not exist yet. |

## Compared with current Claude Code guidance
| Practice | Status |
|---|---|
| Short CLAUDE.md (under about 200 lines, specific) | Met. |
| Progressive disclosure via skills, detail in side files | Partly: skills are short, but `RULES.md` (60 KB) is read whole at every Lead start; skills have no side files. |
| Hooks for must-happen rules (exit 2 blocks) | Partly: six hooks cover merge/close/review rights, lane start room, cron prompt, builder editing Lead files, rules-file size. Most other rules unhooked. |
| Stop hook as completion gate | Partly: `stop-check.sh` checks files and docs; it does not check "any un-acked lane item" or "unmerged lane branch". |
| SessionStart after compaction re-injects critical context | Not used. |
| Permission allowlist / deny, least privilege | Partly: strong deny list; new controls (`denyInsteadOfPrompting`, write boundary) not set; Lead copy allows merge, mitigated by merge-guard. |
| Sub-agents for isolated context, model per agent | Partly: 2 agents, no `model`/effort pinned. |
| Skill hygiene (`disable-model-invocation` for side-effect skills such as `lead`, `next`, `qa`) | Not used (they are triggered by typed commands, so safe to set). |
| Cross-session messaging (messages are plain text, never consent; cloud sessions cannot reply) | Matches the repo's finding that cloud builders are one-way; no protocol on top yet (G-1 proposes label plus first-line format). |
| Weekly review of new features | Decided (P-611 (3)), not built. |
| Instruction contradictions audited | Not seen; RULES.md has many amending rows (P-312, P-440, P-446 ...) that supersede each other inline, which the docs warn can be picked arbitrarily. |

## Rule-by-rule table (RULES.md; E = enforced by tool/hook/CI, S = skill instruction only, W = written only)
| Rule (section, row) | Class | Enforcer, or what is missing |
|---|---|---|
| Goal: M3 order, pick order each check | S | lead / lead-watch skills; no tool |
| Goal: reuse of the team's XFA engine, bake, walk dates | W | decisions; no tool |
| Works: pack green on main, run id, fresh Opus reader, qa verdict | E (part) | gate B in `ci.yml` and `studio/tools/gate-b.mjs`; reader model by skill (S) |
| Works: open Major/Critical keeps Partial; gate B on PRs | E | `ci.yml` gate B |
| Works: no pack/server = Not tested; WAIT/HELD never green | S | qa skill |
| Cloud lanes cannot dispatch Actions; Lead dispatches `nightly.yml` | W | platform limit, no check |
| Builders: one row, one session, one PR, fresh branch | S | next skill; `lane.sh` binding (E, part) |
| No duplicates, `Duplicate check:` line (P-526) | W | no CI check of the PR body (gap 4) |
| PRs under ~800 lines | W | no check (gap 4) |
| One builder at a time on `prisma/schema.prisma`, `case-prepare.ts` | W | Lead names holder in STATE |
| Two PRs with a migration take different stamps | W | P-600 (e) Lead reads diff |
| Merge main in only on a conflict | W | |
| Reviews on Opus; reviewer always, breaker for money/schema/permissions/new screen | S | next skill; agents have no `model:` |
| Re-review reads only the diff since last Approve | S | |
| Label `review: approved` only with `Reviewer: Approve <sha>` comment and green CI; label dies on new commit | E | `label-guard.sh` + `label-guard.yml` (tested by `guards.yml`) |
| New screens: walk before first review; best-in-class section in concept | S | next / screen-concept skills |
| No combination key, form number or program branch in engine code | E (part) | slice guards retired 8 Nov (m3-guard UNUSED); typecheck/explicit-any count only |
| A mutating route a pack calls needs a caller in `web/src` | E | `route-has-screen.mjs` in CI |
| Held parts nobody builds | W | STATE list |
| Questions as PR comment "Question for the tech lead"; briefs say report to current Lead | S | `current-lead.sh` + exactly one `current_lead:` line (E); comment form is prose |
| Builders never edit STATE/RULES/DECISIONS/BACKLOG; qa only its files | E | `stop-check.sh` check (1) (Stop hook; at end of turn, not at write) |
| qa: live AI off, never press a priced button | E (part) | spend ledger `p2/ledger.ts`, STUDIO_*_LIVE off by default; button rule is prose (P-175 incident) |
| Lead: founder actions first (red/yellow) | W | report format, no check |
| Lead: one cockpit, link opens every report; weekly fresh reviewer | S | `cockpit-data.py`, `cockpit-tests.yml` check the data; opening link and weekly review are prose |
| Lead: "Decide when you can" is the Lead's | W | |
| Lead: standing approvals; Lead reads diff before labelling money/permissions/schema/`.github/` | S | P-423; no hook |
| Lead: product questions ruled and recorded; impact stated | W | |
| Lead: checks every 30 min, prompt exactly `run lead-watch; read STATE Start here` | E | `lead-check-guard.sh` (CronCreate hook), `check-lead-cron.sh`, `check-lead-heartbeat.sh` |
| Lead: sessions start only in a founder-typed turn | W | platform/permission prompt only |
| Lead: start only after `lane-preflight.sh` | E | PreToolUse `start_session` hook |
| Lead: two idle standbys | W | |
| Lead: no prompt-waiting call when away; no hand-over with subagent running | W | |
| Lead: never run guard/test suites in main copy | W | one incident (7 Nov); test lib uses scratch clones (E, part) |
| Lead: `.claude/settings.json` as on main; refused write never rerouted | E (part) | sandbox denies writes to settings; `stop-check.sh` flags lane edits; reroute rule is prose |
| Lead: times only from `TZ=Asia/Kolkata date` | W | |
| Lead: records only by Lead; STATE 12 KB; DECISIONS append-only; records PRs merge when queue empty | E (part) | `check-docs.sh` STATE size, RULES lag; `records-label.yml`; append-only and queue-empty are prose |
| Lead: never cancel CI; re-run failed part | E (part) | incident noted (zsh cancel); a cancel guard is not seen in settings (`gh run cancel` is not denied) |
| Lead: CI fixes may land ahead of queue (P-214) | W | |
| Lead: only the Lead merges/closes/reviews | E | `merge-guard.sh` (PreToolUse) |
| Tokens: hand over at 200k beyond start read, never compact | S | lead skill; no hook (no context-size hook exists; a `get_usage`/transcript read would be needed) |
| Tokens: start read is one page | W | RULES.md itself is 60 KB: rule not met by its own page |
| Tokens: filter every tool output | W | |
| Tokens: burn watch every check (over 3%/h two checks) | S | lead-watch skill, `usage-log.sh` |
| Tokens: models by session type; Fable never builds | S | skills; no pinned agent model |
| Money: live AI off on every copy; paid run only approved, in ledger | E | launcher + ledger, `check-write-token.sh`, test copies fake launcher |
| Money: day cap US$30/50 | E (part) | ledger reserve before the call; cap approval by Lead is prose |
| Account: lanes push every step; 96%/98% stop lines; STATE and RESUME pushed before switch | S/W | lead-watch skill; no script that proves it (G-2) |
| Process freeze (expired 10 Nov) | W | |
| Compass numbers daily from tools | E (part) | `lead-watch.sh`, `flow-watch.sh`, `cockpit-data.py` produce them; reading them daily is prose |
| P-557 always committed and resumable | E (part) | `lead-heartbeat.sh`, push-guard on push; "every step" is prose |
| P-611 queue with owner, ack, timeout; hand-over blocked while un-acked | W | G-1, G-2 not built; only the 3b phrase check in `lead-watch.sh` |
| P-611 weekly what's-new check and board box | W | G-5 not built |
| P-608 model and effort at every start | W | `lane-preflight.sh` checks disk/load/copies only (gap 4) |
| P-612 licence record in permission check | n/a | product rule for the app, tested in its own suites |

## Smallest sequence (about one Lead hour plus the founder's settings yes)
1. Add `model:`/effort to the two agent files and a brief-check in `lane-preflight.sh --hook`; add `disable-model-invocation: true` to `lead`, `next`, `qa`, `lead-watch`.
2. `lead-watch.sh`: un-acked report (comment first line `LANE-REPORT:`) older than 45 min is ACT, 90 min prints the founder line.
3. `check-docs.sh`: RULES.md page size limit and register format; then fold the page into the register (nothing deleted, long text moved to `history/`).
4. `tools/handover.sh` with the refuse conditions; call from `stop-check.sh` when the turn is a hand-over.
5. Weekly scheduled watcher writing `cockpit/whats-new.json`; board box after it.
6. Founder yes needed for: `denyInsteadOfPrompting`, `blockWritesOutsideWorkingDirectories`, `Skill(lead-watch)` allow, and a `gh run cancel` deny (the CI-cancel incident).
