# Context diet research, 16 Nov 2026

Status: research only. No settings were changed. The file is not committed.
Question: how to cut the fixed cost every Claude Code session pays before any message, without losing what this project needs.

Sources: official Claude Code docs at code.claude.com (settings, MCP, skills, memory, costs, prompt caching, desktop app, env vars, plugin measurement, features overview, permissions). One web search for forum reports. Items marked **unverified** are not confirmed by the docs.

Token figures: the tech lead's `/context` baseline is measured. Every other number is an estimate. The estimate rule is about 4 characters per token.

---

## 1. Bottom line

- Fixed cost at session start is about 72k tokens (measured): system tools 21.4k, MCP tools 19.8k, system prompt 12.8k, skills 9.9k, memory 8.5k.
- The system prompt cannot be turned off. Built-in tool schemas can only be trimmed a little.
- Realistic cut with folder-level settings: about 8k to 14k (estimate). That leaves roughly 58k to 64k.
- If the 19.8k MCP figure is mostly loaded schemas instead of deferred names, fixing tool search could save up to about 15k more. Check this first with `/context`. It is the biggest open question.
- Biggest safe wins, all scoped to this folder:
  1. Stop syncing claude.ai plugins and unused skills into this folder.
  2. Turn off the user-level clawmem MCP server for this folder.
  3. Shorten the memory index (`MEMORY.md`, 119 lines, 20.6 KB, close to the 25 KB cap).
  4. Deny built-in tools this project never calls.
- Biggest unknown: the clawmem `UserPromptSubmit` hook (`context-surfacing`). It is set in the user-level settings, so it runs on every prompt in every project. If it prints text, it adds tokens on every turn. Its size is not yet measured.
- Never set these. Each one breaks something the Lead needs: `disableAllHooks`, deny of `ToolSearch`, `ENABLE_TOOL_SEARCH=false`, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`, `CLAUDE_CODE_DISABLE_CRON`.
- Cloud sessions read different settings. The folder-local files do not reach cloud builders. See section 3.

---

## 2. What costs tokens every turn

| Item | When it loads | Every turn? | Already deferred? | Size | Lever |
|---|---|---|---|---|---|
| Built-in tool schemas (Bash, Read, Edit, Write, Agent, ToolSearch, cron, and others) | Session start | Yes | No | 21.4k measured (system tools) | Deny unused tools by bare name (section 7, row 16) |
| Claude Code system prompt | Fixed | Yes | n/a | 12.8k measured | None. The docs say the system prompt is not published. |
| MCP tool schemas | Server connects | Names only, if tool search is on | Yes, by default on Opus 4 / Sonnet 4 / Haiku 4.5 and later | 19.8k measured. Too high for deferred names alone. | Disable servers per folder; check `/context` labels |
| MCP server instructions | Session start | Yes, even when deferred | No | Part of the 19.8k; size not split out | Disable the server |
| Skill descriptions | Session start | Yes | Bodies load only when used | 9.9k measured | Turn off skills (section 7, rows 1 to 5) |
| Skill bodies | When invoked | Only in turns that use them | Yes | Not a fixed cost | None needed |
| CLAUDE.md files (global 6 lines, project 14 lines, `@AGENTS.md` 3 KB) | Session start, in full | Yes | No | About 5.3 KB, roughly 1.3k tokens | Trim wording, keep every rule |
| Auto memory index `MEMORY.md` | Session start, first 200 lines or 25 KB | Yes | No | 119 lines, 20.6 KB, roughly 5k tokens | Shorten each line to a pointer |
| Memory topic files | When Claude opens them | No | Yes | Not a fixed cost | None needed |
| Hook output (SessionStart, UserPromptSubmit) | At each event | Yes if the hook prints text that is added as context | No | Unknown. The docs say hooks cost nothing unless they return output. | Measure the hook output |
| System reminders (git status snapshot, MCP instructions) | Session start | Yes | No | Small | `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS` removes the git snapshot and built-in commit guidance |
| Deferred tool names | Session start | Yes | Names only | Small | Same as MCP |

Key rule from the docs: MCP tool schemas are deferred by default, so only names and server instructions load at start. Skill descriptions load every turn. Skill bodies load only when used.

---

## 3. Off switches, by scope and by surface

### Precedence (docs)

Managed settings beat `--settings`, which beats `.claude/settings.local.json`, which beats `.claude/settings.json`, which beats `~/.claude/settings.json`. List values such as `permissions.deny` merge across files. Any deny rule from any file applies.

### Where each lever lives

| # | Goal | Exact setting | Scope to write it in | Honoured by | Notes |
|---|---|---|---|---|---|
| 1 | Turn one MCP server off for this folder | `/mcp` toggle. It writes `disabledMcpServers` into the folder's entry in `~/.claude.json`. | This folder (per-folder by design) | CLI documented. Desktop Code tab **unverified**. | Works on user, plugin and claude.ai connector servers. The entry is personal, not in git. |
| 2 | Reject a server in a folder `.mcp.json` | `"disabledMcpjsonServers": ["name"]` | Any settings file | CLI and desktop | Applies in every permission mode. This folder has no `.mcp.json`, so this row does not apply today. |
| 3 | Stop loading claude.ai-enabled plugins | `"syncClaudeAiPlugins": false` | `.claude/settings.local.json` in this folder | CLI and desktop local sessions. Not cloud. A `false` in the shared file is ignored. | Stops the plugins synced from the account (product-management, engineering, productivity, auth0, and their MCP servers). Also stops downloading new ones. |
| 4 | Stop loading claude.ai-enabled skills | `"syncClaudeAiSkills": false` | `.claude/settings.local.json` in this folder | Same as row 3 | Stops all synced skills, including the ones you want to keep (artifact, dataviz). Prefer row 5 first. |
| 5 | Turn off one skill without editing it | `"skillOverrides": {"name": "off"}`. Values: `on`, `name-only`, `user-invocable-only`, `off`. | Any settings file. The `/skills` menu writes to local. | CLI and desktop | Docs say it does **not** apply to plugin skills. Expected to work on synced skills. **Unverified**; test on one skill first. |
| 6 | Turn one plugin off | `"enabledPlugins": {"name@marketplace": false}` | Per scope | CLI and desktop | Expected to override a user-level `true` for the same plugin. **Unverified**; confirm in `/plugin`. |
| 7 | Turn off claude.ai connectors | Account-wide: Customize > Connectors. Per folder: row 1. | Account or folder | Desktop docs confirm the Customize page. Cloud sessions use the claude.ai authorisation. | There is no documented per-session connector switch in the desktop app. |
| 8 | Remove a built-in tool from the request | `"permissions": {"deny": ["NotebookEdit"]}` (bare name) | `.claude/settings.local.json` | CLI and desktop. Cloud project threads ignore repo permissions. | A bare-name deny removes the schema. That resets the cache once. Scoped rules like `Bash(rm *)` do not change the tool list. |
| 9 | Turn auto memory off | `"autoMemoryEnabled": false` or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | `.claude/settings.local.json` | All surfaces | Not recommended. Shorten the index instead (section 7, row 13). |
| 10 | Skip some CLAUDE.md files | `claudeMdExcludes` | Any settings file | All surfaces | Already in use for `code/`, `sources/`, `archive/`. |
| 11 | Remove git instructions and the git snapshot | `"env": {"CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS": "1"}` | Local settings `env` block (verify it is honoured there) | CLI and desktop | Removes built-in commit and PR guidance. `AGENTS.md` rule 1 already covers commits. |
| 12 | Remove bundled skills | `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` or `disableBundledSkills` | User or local | CLI and desktop | Removes bundled skills and workflows. Plugin and `.claude/skills` skills are unaffected. The Lead's `/loop` and `/schedule` may go too. Keep off. |
| 13 | Turn off all hooks | `disableAllHooks` | Any | All | **Do not use.** It also kills the project's guardrail hooks (merge-guard, lane-preflight, agent-model-guard, lead-check-guard, stop-check, session-start, prompt-log). Remove one hook entry instead. |
| 14 | Turn off tool search | `ENABLE_TOOL_SEARCH=false`, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, or denying `ToolSearch` | Env or settings | All | **Do not use.** All MCP schemas load upfront, and the prompt cache resets. |

### Surface matrix

| Surface | Reads `~/.claude/settings.json` | Reads folder `.claude/settings.json` | Reads `.claude/settings.local.json` | Per-folder MCP toggle | claude.ai connectors and sync |
|---|---|---|---|---|---|
| CLI (terminal) | Yes | Yes | Yes | Yes (documented) | Account-wide sync. Folder toggle writes `disabledMcpServers`. |
| Desktop app, Code tab, local | Yes (documented) | Yes (documented for permissions; the same files per the settings page) | Yes (same files) | **Unverified** | Account-wide. Customize > Connectors. Loads account-enabled skills and plugins in terminal sessions signed in to the same account. |
| Cloud (claude.ai/code) | No | Only in a session with one repository, and only the shared file. In project threads, repo permissions, hooks and `env` do not apply. | No | Not applicable | Set in claude.ai. Cloud environment `env` variables are set on the environment. |

**Implication:** rows 3 and 4 are local-only. Cloud builders keep the full synced set, so their cost is not reduced by folder-local files. Use claude.ai-side settings for cloud if that matters.

---

## 4. What applies to this folder only, and what is global today

| Scope | What is in it today |
|---|---|
| Global (every project on this machine) | `~/.claude/CLAUDE.md` (6 lines: graphify rule, missing-tools rule). `~/.claude/settings.json`: 7 clawmem hooks (one `UserPromptSubmit` context-surfacing, two `SessionStart`, one `PreCompact`, three `Stop`). Plugins `playwright` and `claude-md-management` enabled. Top-level `clawmem` MCP server in `~/.claude.json`. Account-level sync of claude.ai plugins and skills. Bundled skills. |
| This folder only (already) | Project skills (12 folders) and agents (2). Project hooks (9 entries, the guardrails). Project deny rules (39). `claudeMdExcludes`. The memory index path (keyed to this folder). Per-folder MCP toggles. Two worktrees under `.claude/worktrees`. |

**Gap:** the clawmem hooks are global. To keep them only for this folder, move the entries from `~/.claude/settings.json` into `<project>/.claude/settings.local.json`. That is a scope move, not an off switch.

---

## 5. Other proven savings

### Prompt caching: does a smaller fixed prefix matter when cached?

Yes, for three reasons.

1. **Reads still cost.** Cached tokens bill at the cache-read rate, below the normal input rate, but they still count. The docs say a long-running session "still draws usage for the whole conversation". Every turn re-reads the whole fixed prefix.
2. **Cold starts cost more.** A cache write costs more than a read. Every new session, every worktree, and every resume after the TTL pays a full write. Main-conversation TTL is one hour on a subscription within the plan, and five minutes on usage credits, API keys and cloud providers. Subagents get five minutes.
3. **Headroom.** A smaller prefix leaves more room before auto-compaction. Compaction is itself an expensive request.

### What breaks the cache (docs list)

| Action | Cache effect |
|---|---|
| Switch model with `/model` | Full miss. Each model has its own cache. |
| Change effort level | Full miss on most models. Kept on Opus 5.5, Sonnet 5.5 and Haiku 5.5 with API key or subscription. |
| Connect or remove an MCP server | Miss only when tool search is off. When tool search defers the tools, the prefix survives. |
| Enable or disable a plugin with MCP servers | Same rule as MCP. Plugin skills, commands, agents and hooks do not break the cache. |
| Deny a whole tool (bare name or `mcp__*`) | Miss when tool search is off. Scoped deny rules never break it. |
| Compact | Miss on the conversation layer. The summary request reads the old history. |
| Edit CLAUDE.md mid-session | No cache miss, but the edit does not apply until `/clear`, `/compact` or restart. |
| Skill invocation, permission-mode change, subagent start, `/rewind` | No miss. |

**Practical rule:** make MCP, plugin and tool changes at session start, not mid-session.

### Cache scope

- The system prompt embeds the working directory and the memory path. A git worktree is a different directory, so a worktree session builds a different prefix and cannot reuse this folder's cache. This folder has two worktrees under `.claude/worktrees`. Each builder worktree pays the full fixed cost on its first request.
- Sessions run in parallel in the same directory can share the cache.

### Subagents

- A subagent starts with its own system prompt and does not read the parent's cache.
- An agent definition with `omitClaudeMd` starts without the user, project or local CLAUDE.md files (docs). Test this only for read-only reviewers, and put the standards they need in their prompt. **Unverified** for this project.

### Measure first (all read-only)

| Tool | What it shows |
|---|---|
| `/context` | Breakdown by category. Tools labelled `(deferred)` or `(loaded on-demand)` are cheap. |
| `/context all` | Tokens per loaded MCP tool. |
| `/mcp` | Server status, and the per-folder toggle. |
| `/usage` | On Pro, Max, Ultra, Team and Enterprise: share of usage by skill, subagent, plugin and MCP server. The `Prompt cache (main)` line shows hit rate and misses. |
| `claude plugin details <name>` (shell, not in a session) | Always-on tokens per plugin, plus per-skill rows. |
| `/skill-doctor` | Skills in the listing that never run. Available in this session. |
| `/doctor` | Lists unused skills, MCP servers and plugins. It may propose changes; read the output and do not accept blindly. |

### Model choice and thinking

- Opus costs more per token than Sonnet or Haiku. Haiku is fine for read-only checks and file lookups.
- Lowering effort or thinking reduces output tokens. It is not a fixed-cost lever. Changing effort mid-session breaks the cache on most models.

---

## 6. Risks: what breaks if each change is made

| Change | What breaks for this project |
|---|---|
| Deny `ToolSearch`, or set `ENABLE_TOOL_SEARCH=false` | All MCP schemas load upfront. Cost goes up, not down. |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` | Tool search is off. Also strips other beta features. |
| `disableAllHooks` | Lead guardrails stop: merge-guard, lane-preflight, agent-model-guard, lead-check-guard, stop-check, session-start, prompt-log. Dangerous. |
| `CLAUDE_CODE_DISABLE_CRON=1` | Scheduled checks stop firing. `CronCreate` and `/loop` become unavailable. |
| `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` | Bundled skills go, possibly including `/loop` and `/schedule`. |
| `syncClaudeAiPlugins: false` (folder-local) | This folder loses the synced plugin skills (product-management, engineering, productivity, auth0) and their MCP servers (slack, github, datadog, and others). The project does not use these. Cloud builders are not affected. |
| `syncClaudeAiSkills: false` (folder-local) | Also removes artifact, dataviz and any other synced skill. Check which ones the founder board or charts need first. |
| Turn off the Google Drive connector here | No Drive reads or writes from Claude in this folder. The project already blocks Drive writes, and sources are local snapshots. Check that no requirement read depends on it. |
| Turn off clawmem here (`/mcp`) | clawmem MCP tools are gone in this folder. Its hooks still run, because hooks are separate from MCP. |
| Remove the clawmem context-surfacing hook globally | Per-prompt memory recall is lost in every project. Moving it to this folder only keeps it here. |
| `autoMemoryEnabled: false` | This folder's memory index is no longer loaded or written. Rules still live in CLAUDE.md and product docs. |
| Shorten `MEMORY.md` | Facts are lost if they are deleted rather than moved. Move detail to topic files, which load on demand. |
| Trim CLAUDE.md or AGENTS.md | Rules are lost if cut. Trim wording only. |
| Deny a built-in tool | The model cannot call it. Only safe for tools the project never uses. Cache resets once. |
| `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1` | Built-in commit and PR guidance and the git snapshot go. `AGENTS.md` must carry the rules. |
| Any change made mid-session | Cache miss. Do it at session start or after `/clear`. |
| Folder-local files for cloud | Not read in cloud sessions. Cloud keeps the full claude.ai set. |

---

## 7. Recommended set-up

Estimates are per cold start, measured against the 72k baseline. Test one change at a time with `/context` before and after.

| # | Item | Keep or turn off | Scope | Exact setting | Expected saving (est.) | Risk |
|---|---|---|---|---|---|---|
| 1 | Synced claude.ai plugins | **Turn off** | This folder | `.claude/settings.local.json`: `"syncClaudeAiPlugins": false` | 3k to 5k (most of the 9.9k skills block is synced) | Loses plugin skills the project does not use. Not read in cloud. |
| 2 | Synced skills this project does not use: `docx`, `pptx`, `xlsx`, `pdf`, `morning`, `import-memory`, `setup-claude`, `setup-cowork`, `skill-creator`, `google-workspace`, `explain-usage`, `chrome-browser`, `computer-use`, `consolidate-memory`, `deep-research` | **Turn off** (test `skillOverrides` first) | This folder | `"skillOverrides": {"docx": "off", ...}` in local settings | 1k to 2k | `skillOverrides` on synced skills is unverified. If it fails, use row 4 for those skills and keep artifact and dataviz. |
| 3 | Built-in browser skill (`built-in-browser`) | **Keep** | — | — | — | Used for claude.ai and local app checks. |
| 4 | Artifact and dataviz skills (`artifact-*`, `dataviz`, `design`, `slides`, `motion`, `whiteboard`) | **Keep** (founder question 3) | — | — | — | Used for the founder board and charts. |
| 5 | `claude-md-management` plugin | **Turn off** | This folder | `"enabledPlugins": {"claude-md-management@claude-plugins-official": false}` in local settings | About 0.3k | `/revise-claude-md` unavailable here. |
| 6 | `playwright` plugin | **Keep** here. Optional: move to folder scope if no other project needs it. | This folder (optional) | Set `false` in `~/.claude/settings.json`, `true` in local | About 0.3k in other projects | Test runs need it here. |
| 7 | clawmem MCP server | **Turn off** for this folder | This folder | `/mcp` toggle (writes `disabledMcpServers` in `~/.claude.json`) | 0.5k to 1.5k (names and instructions; more if loaded upfront) | clawmem MCP tools gone here. |
| 8 | Google Drive and docs connectors | **Turn off** for this folder unless requirement reads need them (founder question 2) | This folder, or account in Customize > Connectors | `/mcp` toggle | 0.5k to 1.5k | Lose Drive reads in this folder. |
| 9 | Computer-use | **Keep off** (default in the CLI; desktop grants per session) | — | — | About 1k (long server instructions) | Desktop app work needs a grant. |
| 10 | clawmem `UserPromptSubmit` context-surfacing hook | **Measure first.** Then keep for this folder only, or keep globally (founder question 1). | Move from global to this folder if it is large | Edit hook entries in `~/.claude/settings.json` and `.claude/settings.local.json` | Unknown. Per turn. Possibly the largest per-turn item. | Memory recall lost in other projects if moved. |
| 11 | clawmem `SessionStart` postcompact-inject | **Keep.** It re-injects context after compaction. | — | — | — | Loss of context after compaction. |
| 12 | clawmem `SessionStart` curator-nudge | **Measure output size.** Keep if small. | — | — | Unknown | Loss of curator reminders. |
| 13 | Memory index `MEMORY.md` | **Shorten** each entry to a one-line pointer (about 80 characters). Move detail to topic files. | This folder (path is keyed to it) | Edit the index file (no setting) | 2k to 3k (from about 5k) | Facts must move, not disappear. |
| 14 | Project CLAUDE.md and `AGENTS.md` | **Trim wording**, keep every rule | This folder | Edit | About 0.5k | Rules must not be cut. |
| 15 | Global `~/.claude/CLAUDE.md` | **Keep** (6 lines; both rules are needed) | Global | — | — | — |
| 16 | Unused built-in tools (for example `NotebookEdit`, plus any listed unused by `/context`) | **Turn off** after `/context` confirms | This folder | `"permissions": {"deny": ["NotebookEdit"]}` in local settings | 0.3k to 0.8k | One cache reset. Check no skill uses the tool. |
| 17 | Git built-in instructions | **Turn off only if the founder agrees** (founder question 4) | This folder | `"env": {"CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS": "1"}` in local settings (verify honoured) | 0.5k to 1k | Built-in commit guidance goes. `AGENTS.md` covers it. |
| 18 | Bundled skills, including `/loop` and `/schedule` | **Keep** (founder question 5) | — | — | — | Lead's scheduled checks may break. |
| 19 | Subagent reviewers (`screen-breaker`, `screen-reviewer`) | **Test** `omitClaudeMd` on read-only checkers only | Agent file | `"omitClaudeMd": true` in agent frontmatter | About 1.3k per spawn (estimate) | They lose project rules unless the prompt carries them. |
| 20 | Tool search, `disableAllHooks`, `ToolSearch` deny, `CLAUDE_CODE_DISABLE_CRON`, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | **Never** | — | — | — | Large breaks (section 6). |

### Totals (estimate)

| Scenario | Fixed cost after changes | Saving |
|---|---|---|
| Conservative: rows 1, 2, 5, 7, 8, 13, 14, 16 | About 58k to 64k | About 8k to 14k |
| Plus row 10 moved to this folder | Same as above, minus the hook's per-turn size (not yet measured) | Adds the measured hook size per turn |
| Best case: MCP tool search confirmed broken and fixed (depends on the 19.8k check) | About 43k to 50k | Up to about 15k more |

The floor is about 30k to 34k: the system prompt (12.8k) plus the built-in tool schemas (up to 21.4k, less whatever is denied). Settings cannot go below that.

---

## 8. Founder questions (preferences only)

1. **Memory recall in other projects.** Should the clawmem context-surfacing hook run on every prompt in every project, or only in this folder? **Recommendation:** measure its output first. If it adds more than about 300 tokens per prompt, keep it for this folder only.
2. **Google Drive.** Does any session in this folder need Drive reads? **Recommendation:** no. Turn the connector off here. Sources are local snapshots, and Drive writes are already blocked.
3. **Skills for the founder board.** Keep the artifact, dataviz, design, slides and motion skills? **Recommendation:** keep artifact and dataviz. Drop the document-format skills (docx, pptx, xlsx, pdf) unless builders produce those files.
4. **Git instructions.** Remove the built-in commit and PR guidance and the git snapshot in this folder? **Recommendation:** yes, after the Lead confirms `AGENTS.md` covers commits and PRs. Removing the snapshot may also help parallel sessions in the same folder share cache.
5. **Bundled skills `/loop` and `/schedule`.** Keep them? **Recommendation:** keep. The scheduled checks depend on them.

---

## 9. Verification steps (read-only, one change at a time)

1. In a new session in this folder, run `/context` and record the baseline. Note which MCP tools show `(deferred)`.
2. Run `/context all`. Record tokens per MCP tool.
3. In a shell, run `claude plugin details <name>` for each synced plugin. Record always-on tokens.
4. Apply one change from section 7 in local settings. Restart the session. Run `/context` again. Keep it if the saving is real and nothing breaks. Roll back if it does.
5. After one week, run `/skill-doctor` and `/usage` to see which skills and servers never run.
6. For the MCP figure: if `/context` lists full schemas for servers that should be deferred, check the tool search setting and the desktop app. Do not set `ENABLE_TOOL_SEARCH`.

---

## 10. Unverified items

| Claim | Status |
|---|---|
| Desktop Code tab honours the per-folder `disabledMcpServers` entry | Unverified. Test: disable clawmem in `/mcp`, then check `/context` in a desktop session. |
| `skillOverrides` works on claude.ai-synced skills (`anthropic-skills:*`) | Unverified. Docs say it does not apply to plugin skills. Test on one skill with `/skills`. |
| `enabledPlugins` per-plugin value in local settings overrides user-level `true` | Expected from the per-scope wording. Confirm in `/plugin`. |
| Denying a bare MCP tool name under tool search removes the deferred name | Unverified. Docs say the request's tool definitions do not change when tool search is active. |
| clawmem context-surfacing prints text on every prompt, and how much | Unverified. Requires reading the hook output, not done. |
| `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS` works from the local-settings `env` block | Unverified. The docs describe it as an env variable. |
| `omitClaudeMd` gives a useful saving for read-only reviewers | Documented option. Saving not measured. |
| Forum or GitHub reports of tool search failing in the desktop app | One search found no confirmed report. An older GitHub feature request (issue 12836) asks for deferred loading. Not read. Treat as unverified. |
| All token savings in section 7 | Estimates at about 4 characters per token. Measure with `/context`. |

---

## 11. Sources (official docs)

- Settings files and precedence: https://code.claude.com/docs/en/settings.md
- Settings reference (keys): https://code.claude.com/docs/en/settings-reference.md
- MCP, tool search and scopes: https://code.claude.com/docs/en/mcp.md
- Environment variables: https://code.claude.com/docs/en/env-vars.md
- Skills: https://code.claude.com/docs/en/skills.md
- Memory and auto memory: https://code.claude.com/docs/en/memory.md
- Manage costs and token use: https://code.claude.com/docs/en/costs.md
- Prompt caching: https://code.claude.com/docs/en/prompt-caching.md
- Desktop app: https://code.claude.com/docs/en/desktop.md
- Permissions: https://code.claude.com/docs/en/permissions.md
- Extend Claude Code (context cost by feature): https://code.claude.com/docs/en/features-overview.md
- Plugin cost measurement: https://code.claude.com/docs/en/plugins/measure.md
- Cloud sessions: https://code.claude.com/docs/en/claude-code-on-the-web.md
- Forum search (unverified): one web search, no page read in full.
