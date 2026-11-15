# Governance research: keeping many Claude Code sessions in order

Prepared 15 Nov 2026. Read-only on the repo. All claims below come from a page I fetched this session; anything I could not confirm is marked **Uncertain**.

---

## A. Best practice from Anthropic's own sources

### A1. Keep instruction files short and layered
Source: Claude Code docs, "How Claude remembers your project", https://code.claude.com/docs/en/memory (read 15 Nov 2026; undated page).
* Target **under 200 lines per CLAUDE.md**; longer files "consume more context and reduce adherence".
* Anything that is a multi-step procedure, or matters for only one part of the code, goes to a **skill** or a **path-scoped rule** in `.claude/rules/` (a rule file can carry a `paths:` list so it loads only when matching files are touched).
* `@imports` help organise a file but **do not reduce context cost** (imported files load with the parent). Max four hops.
* Contradicting instructions: "Claude may pick one arbitrarily". The docs suggest periodic audits and a `/doctor prompt-audit` command.
* AGENTS.md: if a repo has both AGENTS.md and CLAUDE.md, Claude reads **only CLAUDE.md** unless CLAUDE.md imports AGENTS.md (this repo does, so fine). Reading AGENTS.md directly needs v2.1.277+.
* Auto memory loads only the first 200 lines or 25 KB.

Source: Skills docs, https://code.claude.com/docs/en/skills (read 15 Nov 2026).
* Keep **SKILL.md under 500 lines**; put detail in side files that are opened only when needed; scripts are executed, not loaded, so they cost almost nothing.
* A skill body stays in context for the rest of the session ("every line is a recurring token cost").
* Skill description plus when-to-use text is cut at 1,536 characters in the listing.
* After compaction each invoked skill keeps only its first 5,000 tokens.
* `disable-model-invocation: true` for skills with side effects.

Source: Anthropic Engineering, "Effective context engineering for AI agents", https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (29 Sep 2025).
* Start with a minimal prompt and add instructions only for failures you observed; load data just in time via file paths; keep notes outside the context window; use sub-agents with clean contexts that return short summaries. "Do the simplest thing that works."

### A2. Enforce rules mechanically, not in prose
Source: memory docs (above): CLAUDE.md is "context, not enforced configuration. To block an action regardless of what Claude decides, use a PreToolUse hook."

Source: Hooks guide, https://code.claude.com/docs/en/hooks-guide (read 15 Nov 2026).
* Hooks give "deterministic control: certain actions always happen rather than relying on the LLM".
* Exit code **2** blocks and feeds the reason back to Claude; exit 0 does not approve a PreToolUse call.
* Four hook kinds: `command`, `http` (POST to a URL), `prompt` (one-shot model judgement) and `agent` (multi-turn check with tools; documented as experimental).
* A **Stop hook** can refuse to let the session finish (the docs example asks a model "are all tasks complete?" and keeps Claude working if not; a command Stop hook can also scan the working tree each turn).
* **SessionStart with matcher `compact`** re-injects critical context after compaction.
* Events relevant here: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop, TaskCreated, TaskCompleted, TeammateIdle, PreCompact, InstructionsLoaded.
* Caveat: when several hooks match, all run to completion; one `deny` does not stop the others' side effects.
* Caveat: Claude can change files through shell commands, so file hooks should also match Bash or add a Stop-time scan.
* Newer controls: `permissions.denyInsteadOfPrompting` (v2.1.319, 6 Nov 2026) and `permissions.blockWritesOutsideWorkingDirectories` (v2.1.314, 30 Oct 2026), per the changelog summaries cited in section C.

Source: GitHub Actions docs, https://code.claude.com/docs/en/github-actions (read 15 Nov 2026): CI-side checks via `anthropics/claude-code-action`; run a repo skill with `prompt: /skill-name`; cap with `--max-turns`, workflow timeouts and concurrency controls. This is a model-based check, so cost minutes plus tokens.

### A3. Hand-over and memory across sessions
Source: Anthropic Engineering, "Effective harnesses for long-running agents", https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (26 Nov 2025).
* A **progress file** (`claude-progress.txt`) that every session updates at its end.
* A **feature list in JSON**, every item starting as failing; agents may change only the `passes` field. JSON chosen because models are less likely to overwrite it than Markdown.
* **Git commits with descriptive messages** so a bad change can be reverted.
* An **init script** that starts the app so the next session wastes no time.
* A **start-up routine**: check the directory, read git log and progress notes, read the feature list, run a basic end-to-end test, then work on one feature.
* Failure modes named: declaring victory too early; leaving undocumented progress; marking features done without testing.

Source: Anthropic Engineering, "How we built our multi-agent research system", https://www.anthropic.com/engineering/multi-agent-research-system (13 Jun 2025).
* The lead saves its plan to external memory because context past 200,000 tokens is truncated; agents summarise finished work, store it externally, then spawn fresh agents.
* Sub-agents write output to files and pass back **lightweight references**, not copies.
* "Resume from where the agent was when the errors occurred"; combine adaptive behaviour with deterministic safeguards (retries, checkpoints).
* Every delegated task needs: objective, output format, tool/source guidance, clear boundaries; vague tasks caused duplicated work.

### A4. Communication between agents
Source: Cross-session messaging, https://code.claude.com/docs/en/cross-session-messaging (read 15 Nov 2026; feature arrived week of 3-7 Aug 2026 per the weekly digest).
* Claude can list and message your other sessions (`ListAgents`, `SendMessage`), including cloud sessions **only while the sender is connected to Remote Control**. Plain text only.
* Delivery: read between tool calls if the receiver is busy; a new turn starts if it is idle.
* **A cloud session cannot use SendMessage to answer a message from another machine**; read its reply in its transcript. (This matches the "builders get messages but cannot reply" experience.)
* A message **never counts as consent**: it cannot approve permissions, change CLAUDE.md or settings, or run slash commands.
* **Watch for idle**: ask another local session to send one notice when it next goes idle or exits (v2.1.236+); the subscription drops after 12 hours. Only local sessions, only from the main conversation.
* Receiver limits: queue of at most 50 messages, 100 held messages, loop throttling.
* Inbound control: setting `crossSessionInbound` = accept / hold / refuse. Held messages in a non-interactive session expire after `dialogExpiry` (default 5 minutes).

Source: Agent teams, https://code.claude.com/docs/en/agent-teams (read 15 Nov 2026; **experimental, off by default**).
* Architecture: a lead, teammates, a **shared task list** (pending / in progress / completed, with dependencies, claimed under file locking) and a **mailbox** per agent (a JSON inbox file).
* Quality gates by hooks: `TeammateIdle`, `TaskCreated`, `TaskCompleted` (exit 2 blocks and sends feedback).
* Honest limits: no session resume for in-process teammates, **task status can lag**, **the lead is fixed for the session's life**, one team per session. Start with 3-5 teammates; 5-6 tasks each. "Letting a team run unattended for too long increases the risk of wasted effort."
* The "no leader change" limit means it does not solve the Lead hand-over problem; its design (file-based task list plus inbox) is still the pattern to copy.

### A5. Not losing work items
Sources above, combined:
* One **shared task list with states and dependencies**, claimed with a lock (agent teams).
* The feature list with a single writable field (`passes`) (long-running harness post).
* Quality gates that **refuse completion** until a check passes (TaskCompleted, Stop hooks).
* Timeouts: notice subscription ends after 12 h; held inbound messages expire after 5 min. Anthropic's own docs expire things; none gave an "escalate after N minutes" rule. **Uncertain / not found:** no Anthropic page I read prescribes acknowledgements or escalation timers for work items. That part is general engineering practice, not an Anthropic recommendation.
* Cloud scheduled tasks (formerly routines), https://code.claude.com/docs/en/routines (research preview): triggers on a schedule, an API call, or **GitHub events** (pull request opened/closed/labeled/synchronised, with filters on labels, base and head branch, regex). The Pull request and Issue event categories are listed; **I did not see issue or PR *comment* events in the list I read** (Uncertain: check the page's supported-events table). Runs count against hourly limits; webhook events past the cap are dropped.

---

## B. Gap list for this repo

What I read: `.claude/skills/lead/SKILL.md` (10.2 KB, 63 lines), `.claude/skills/lead-watch/SKILL.md` (5.9 KB), the hook set, and the first 40 lines of `product/RULES.md`.

**Correction to the brief:** `.claude/hooks/` does not exist. Hooks are declared in `.claude/settings.json` and call scripts in `product/tools/`: SessionStart `session-start.sh`; PreToolUse on Bash `merge-guard.sh`; PreToolUse on start_session `lane-preflight.sh`; PreToolUse on CronCreate `lead-check-guard.sh`; Stop `stop-check.sh`; UserPromptSubmit `ai-workers/tools/prompt-log.sh`. Plus `.githooks/pre-push` and about 25 `check-*.sh` scripts. (I listed names from settings, not first comment lines.)

| # | Gap against Section A | Concrete mechanical fix | Cost |
|---|---|---|---|
| 1 | **Rules file is far past the size guidance.** `RULES.md` is 59.6 KB / 137 lines, and its first 40 lines are about 26 KB (single paragraphs of thousands of characters); it says "one page". Docs: under 200 lines and adhere better when specific. The lead skill tells every new Lead to read it whole. | Split into a rule register: one line per rule `ID | rule | enforced-by (script/hook/CI name or "prose") | owner | as-of`. Keep history in `history/`. Add a `check-docs.sh` limit (for example max 60 KB total, max 400 chars per line, every rule row names an enforcer). Rules marked "prose" become the to-do list for gap 2. | medium |
| 2 | **Many rules are prose only.** The lead skill lists habits such as "check PR still open before pushing", "Opus for reviewers", "answer prompts only inside brief", "never cancel CI" (the last already has a guard). Memory docs say prose is not enforced. | Take the register's "prose" rows and convert the top five by harm: (a) PreToolUse on `gh pr` / `git push` that checks the PR is open; (b) PreToolUse on Agent/start_session that refuses a reviewer model other than Opus (docs: deny rules can match parameters, e.g. `Agent(model:opus)` pattern, week 25 digest); (c) CI check that every PR body contains "Done when". | medium |
| 3 | **Hand-over state is prose in STATE.md.** The long-running-agent post says use a JSON list where agents may change only one field, plus a progress log. Today `current_lead:` is one line, but in-flight items, lane last-message and "whom it waits on" live in prose. | Add `product/state/items.json` (one object per in-flight item: id, owner, branch, PR, `status`, `waiting_on`, `next_step`, `updated_at`, `last_ack_by`). A SessionStart hook prints a table of items with `updated_at` older than 90 min. `stop-check.sh` refuses to end a Lead turn if an item changed on GitHub (PR merged/closed/labelled) but the JSON did not. | medium |
| 4 | **No single inbox for "needs Lead".** Lanes post free-text PR comments; the cloud lanes cannot reply (docs match: cloud sessions cannot SendMessage back). Today's loss: "ready for Lead to merge" sat 1.5 h. A85's `lead-watch.sh` 3b searches for the phrase, which is a patch on free text. | Define one label-based protocol: `needs-lead` plus `waiting-on:<role>` labels, and a fixed comment first line `LANE-REPORT: <ready\|blocked\|question> <item-id>`. A GitHub Action on `issue_comment` / label events that files these into the single `items.json` queue (or a `needs-lead` issue list). `lead-watch.sh` reads labels only, not phrases. A small CI check fails a lane PR that is Ready but has no label. | small |
| 5 | **No acknowledgement or timeout on a report.** Nothing records that a Lead saw it; a hand-over drops it. Anthropic notice subscriptions and held messages expire; this setup has no equivalent. | Ack-or-escalate rule in the queue: each `needs-lead` item needs a `last_ack_by` + timestamp within 30 min; the 30-min cron prints un-acked items older than 45 min as ACT, and at 90 min posts the founder-box line. The hand-over procedure ends with a script `handover-verify.sh` that lists every open `needs-lead` item and refuses `current_lead:` change if any is un-acked. | small |
| 6 | **Hand-over is a 12-step prose recipe in the lead skill** (line 56 alone is about 1.7 KB). Steps can be skipped when context is nearly full. The post recommends a scripted start-up routine and an init script. | Replace by `tools/handover.sh` (writes `current_lead:`, pushes, prints the one-line message for each lane, checks items.json, renames session text to paste) and `tools/takeover.sh` (SessionStart-style: git log, state diff since last Lead, un-acked items, cron present or not). Skill keeps two lines: "run handover.sh", "run takeover.sh". | medium |
| 7 | **Reviewer fixes on a branch never merged (earlier incident); unmerged work is found by phrase or by memory.** | Add to `lead-watch.sh` (or a nightly GitHub Action) a deterministic sweep: for each remote branch with commits ahead of main and no open PR, or a PR whose head has commits newer than its last approval, emit an ACT line. Record the sweep result in items.json. Branch-name convention check (`lane/`, `board/`, `lead/`) in pre-push. | small |
| 8 | **Skills carry rules that belong in scripts, and some skill lines are long and dated.** Lead skill is 10 KB with dense paragraphs; lead-watch has a "Learned the hard way" section of incident notes and thresholds duplicating `RULES.md`. Docs: a skill body stays in context all session; keep it under 500 lines, details in side files. `/skill-doctor` (week 36 digest) shows what each skill costs. | Move thresholds into `tools/thresholds.json` read by `lead-watch.sh` (the table becomes script output). Move incident notes to `history/`. Cap each SKILL.md at 3 KB with a `check-docs.sh` test. Run `/skill-doctor` once and delete skills that are never used. | small |

Not a gap but worth keeping: the stop hook, merge guard, preflight and cron-prompt guard already follow the "hook not prose" advice.

---

## C. What is new in Claude Code / Claude.ai (about 6 weeks: 4 Oct to 15 Nov 2026)

Coverage note: the official weekly "What's new" digest I could fetch stops at **Week 37 (7-11 Sep 2026)**; pages for weeks 41-45 returned 404 (not yet published or different URL). For October to November I used the official changelog summaries (version and dates from third-party trackers that read the changelog; the official changelog page itself shows versions without dates). **Gap: I found no dated item for 4-21 Oct; versions v2.1.299 to v2.1.307 were not readable.**

Sources: https://code.claude.com/docs/en/changelog; https://claude-world.com/articles/claude-code-november-2026-whats-new/ (covers v2.1.308-2.1.318, 22 Oct-3 Nov); https://www.havoptic.com/releases/claude-code/2026/11 (v2.1.317-2.1.325, dates).

| Feature | Date | Adopt? | Why |
|---|---|---|---|
| `permissions.blockWritesOutsideWorkingDirectories` (v2.1.314) | 30 Oct | **Yes** | One setting enforces "lanes write only inside their copy" in every permission mode. Small. |
| `permissions.denyInsteadOfPrompting` (v2.1.319) | 6 Nov | **Yes, for cron and unattended Leads** | The repo's memory notes a Terminal write waiting 7.4 h on a prompt; this denies instead and the turn continues. |
| Scheduled tasks and `/loop` now ask before running a skill that declares `allowed-tools` or hooks; add `Skill(name)` to `permissions.allow` to run unattended (v2.1.325) | 13 Nov | **Yes, check now** | The 30-min check runs the `lead-watch` skill; this can stall it. Verify the allow rule exists. |
| Self-paced `/loop` ends when a turn finishes without rescheduling (v2.1.319); `CLAUDE_CODE_LOOP_KEEPALIVE=1` keeps old behaviour | 6 Nov | **Check** | Could silently end the check loop. |
| Hook heartbeat every 30 s for long hooks in `-p` / SDK (v2.1.323) | 12 Nov | No | Only matters for headless runs. |
| Agent SDK hook callbacks `onFailure: "block"` (v2.1.317) | 2 Nov | Later | Useful only if guards move into SDK code. |
| Prompt and agent hooks capped at 24 concurrent per session (v2.1.312) | 27 Oct | No | Awareness only. |
| `CLAUDE_CODE_SUBAGENT_EFFORT` (v2.1.316) | 31 Oct | **Yes** | Sets effort for reviewer subagents in one place (fits the repo's effort rule). |
| Sandboxed Bash now follows normal permission flow by default (v2.1.325) | 13 Nov | **Check** | May add prompts to lane scripts; set `sandbox.autoAllowBashIfSandboxed` deliberately or not. |
| Security fixes: deny rules not covering `cp`/`mv`, sandbox escape of a read-only Bash command (v2.1.321); `Edit(path)` deny bypass by redirect (v2.1.309) | 22 Oct-9 Nov | **Yes** | Update; guards that rely on deny rules were weaker before. |
| `claude remote-control --settings <file>`, `--hold-idle-file`, `--max-hold-min` (v2.1.321, v2.1.311) | 26 Oct-9 Nov | Later | Relevant if Remote Control sessions are used to start lanes. |
| `/tasks` lists finished subagents (v2.1.319) | 6 Nov | No | Minor. |
| Cloud scheduled tasks load plugins on your account (v2.1.314) | 30 Oct | No | No plugins in use. |
| Code Mode (experimental, Claude writes JavaScript to call tools) (v2.1.323) | 12 Nov | No | Experimental. |
| Claude Fable 5.2 default Fable model (v2.1.321) | 9 Nov | **Maybe** | Repo rules keep Fable for planning only; check effort/cost before switching. |
| Cloud scheduled tasks are the new name for routines; GitHub triggers on PR events; research preview | renamed by 2026 (undated); original Routines launch week 13-17 Apr 2026 | **Later (trial)** | Could run the "acknowledge un-acked reports" sweep without the Mac; limits and account ownership apply (tasks belong to one account). Matches the repo's own open trial item. |
| Cross-session messaging, `notify_when_idle`, `@session` mentions | 3-7 Aug 2026 (Week 32), 10-14 Aug (Week 33) | **Yes, already partly used** | See A4 limits: cloud sessions cannot reply; use for the Lead-to-local-lane path. |
| Agent view (`claude agents`), `/goal`, `/fork` as background session | 11-15 May, 13-17 Jul 2026 | **Yes if not used** | One screen shows blocked / waiting sessions; direct input to the "silent lanes" problem. |
| Agent teams (experimental) | existing, doc read 15 Nov | **No for now** | Fixed lead, no resume, status lag; copy its task-list/inbox design instead. |
| Claude Duet research preview (proactive background agent; US waitlist, Pro/Max) | reported 21 Oct 2026 | No | **Uncertain:** only secondary and one low-reliability source; not a coding-governance tool. |
| `/skill-doctor` (what each skill costs in context) | 31 Aug-4 Sep (Week 36) | **Yes** | Directly measures gap 8. |
| `claude plugin eval` (test a plugin against cases) | 7-11 Sep (Week 37) | Later | Could eval the lead skills if they become a plugin. |

Practitioner discussion: third-party digests (for example https://claude-world.com, https://www.havoptic.com) mainly track the changelog; I found no practitioner post specifically about multi-session governance in the period. **Uncertain.**

---

## D. Weekly "what's new" check procedure

**When:** Monday (IST), 10 minutes, by the Lead or a read-only Sonnet watcher. Record the result in one JSON box (below), commit it, push.

**Sources to read, in this order**
1. https://code.claude.com/docs/en/whats-new (weekly digest; note which week it reached; if the newest week is more than 8 days old, say so).
2. https://code.claude.com/docs/en/changelog or https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md (read the top screen only; filter for hooks, permissions, scheduled tasks, agent view, remote-control, SDK, memory, subagents).
3. https://github.com/anthropics/claude-code/releases (dates; the docs changelog shows none).
4. https://www.anthropic.com/news and https://www.anthropic.com/engineering (new engineering posts).
5. https://claude.com/blog/category/announcements (Claude.ai and plans).
6. One third-party digest for cross-checking (for example claude-world.com monthly page); never rely on it alone.
7. The installed version: `claude --version` against the newest release; list sessions still on an old version.

**10-minute checklist**
1. (1 min) Note installed version vs newest; note any security fix since last check. If yes, update first.
2. (3 min) Scan the digest and changelog for the eight areas above; list each new item.
3. (2 min) For each item mark `adopt`: yes (fixes a known gap or hole), later (useful, needs a trial), no (not relevant). Write one reason in plain words.
4. (2 min) Check three things that can silently break unattended work: scheduled-task and `/loop` prompts for skills with `allowed-tools`; permission-mode defaults; sandbox defaults.
5. (1 min) Write `actions` (maximum three, each with an owner and a backlog row) and set `checked_at` (ISO, IST offset).
6. (1 min) Commit and push the JSON; show the box to the founder only if an `adopt: yes` item exists.

**JSON shape for the board box**
```json
{
  "week": "2026-W47",
  "checked_at": "2026-11-16T10:00:00+05:30",
  "checked_by": "lead-or-watcher-session-name",
  "installed_version": "2.1.3xx",
  "newest_version": "2.1.325",
  "new_items": [
    {
      "title": "permissions.denyInsteadOfPrompting",
      "date": "2026-11-06",
      "source": "https://code.claude.com/docs/en/changelog",
      "adopt": "yes",
      "why": "An unattended turn is denied instead of waiting hours on a prompt."
    }
  ],
  "actions": [
    { "what": "Add Skill(lead-watch) allow rule and test the 30-min check", "owner": "lead", "row": "BK-xxx" }
  ]
}
```
(`installed_version` and `newest_version` are an optional addition to the requested shape; remove if you want the exact shape.)

---

## Sources (all fetched 15 Nov 2026)
* https://code.claude.com/docs/en/memory
* https://code.claude.com/docs/en/hooks-guide
* https://code.claude.com/docs/en/skills
* https://code.claude.com/docs/en/agent-teams
* https://code.claude.com/docs/en/cross-session-messaging
* https://code.claude.com/docs/en/routines
* https://code.claude.com/docs/en/github-actions
* https://code.claude.com/docs/en/whats-new (weeks 13 to 37)
* https://code.claude.com/docs/en/changelog and https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
* https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents (26 Nov 2025)
* https://www.anthropic.com/engineering/multi-agent-research-system (13 Jun 2025)
* https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (29 Sep 2025)
* https://claude-world.com/articles/claude-code-november-2026-whats-new/ ; https://www.havoptic.com/releases/claude-code/2026/11 (third party, for dates)
