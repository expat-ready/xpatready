# qa after each merge — the scheduled task (lab lane automation-measures, 27 Nov)

**Replaces:** the Lead starting a qa lane by hand after merges (audit row "qa after each merge", `design/software-factory-2026-11-27.html`).

**What runs:** one Claude Code scheduled task, "qa after merge". Each firing starts a fresh cloud session in the `xpatready` environment, which has this repository attached. The session's prompt is the text in the box below, word for word.

**Model:** the account's cloud default must be Opus 5.5 medium (P-788). `.claude/settings.json` also sets `"model": "opus"` and `"effortLevel": "medium"` for the session (#3896).

## When it fires

**Now: hourly (cron).**
- qa starts within an hour of an app-code merge, with nobody involved.
- A firing with nothing owed ends after one script call (`NONE` or `BUSY`).

**Target: the GitHub trigger.**
- Docs: code.claude.com/docs/en/web-scheduled-tasks, read 27 Nov 2026. "A GitHub trigger starts a new session automatically when a matching event occurs on a connected repository"; a `pull_request.closed` trigger "filtered to merged PRs"; "Base branch" filter.
- The tech lead attaches it on the web (claude.ai/code/routines → this task → add trigger: Pull request · closed · Is merged = true · Base branch = main), then removes the cron.
- The docs offer no file-path filter, so every merged PR fires a session. `qa-due.sh` ends the ones that touched no app code.
- The docs warn "GitHub webhook events are subject to per-task and per-account hourly caps. Events beyond the limit are dropped". A dropped event is not lost: the next firing still finds the merge, because `qa-due.sh` compares against the last qa merge, not against the event.
- Neither route can be set up from a cloud session's tools: the GitHub trigger only on the web or with `/schedule` on the Mac.

**Cost:** subscription tokens only, no paid API runs. Scheduled tasks are a research preview: "Behavior, limits, and the API surface may change."

## The prompt

```
Scheduled qa after merge (lab lane automation-measures; ops/qa-after-merge-task.md). Model: Opus 5.5, effort: medium (P-788).
1. In this session's checkout of expat-ready/xpatready: git fetch origin main, then
   bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/qa-due.sh
2. If its line starts with NONE or BUSY: reply with that one line and stop. Do nothing else (no files, no PR, no messages).
3. If it starts with DUE: you are the qa lane for this round. Run the skill /qa after-merge on main, with the DUE line as
   the message that started you (it names the newest app-code merge and the last qa merge). Follow AGENTS.md and the qa
   skill exactly: test what is on main, one qa PR titled "qa: ..." or "records: qa ...", questions as
   "Question for the tech lead" PR comments, never app-code fixes, no paid AI runs.
```

## How to check it works

- The task's run list on claude.ai/code/routines shows one session per firing.
- A `DUE` firing ends in a qa PR whose body names the run.
- `qa-due.sh` then prints `NONE` until the next app-code merge.
- Test: `bash product/tools/check-qa-due.sh`.
