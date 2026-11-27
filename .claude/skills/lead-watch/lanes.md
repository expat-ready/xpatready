# Lanes at every check: read, answer, wake, and deaths (A430, LR-154, LR-146, LR-147)

Founder A430 (27 Nov): "this also should be some hook or some code ... You should be reminding me if you're not able to manage these" and "Show more has to be clicked, otherwise you see only half of the lanes. This has to be also enforced."

## 1. Read every lane (LR-154)
* In the built-in browser, open https://claude.ai/code and run `product/tools/claude-lanes.js` with `javascript_tool`.
  * It clicks "Show more" until the button is gone. On 20 Nov, 11 lanes were hidden behind it, 4 of them waiting.
  * It prints one line per WAIT (awaiting input), UNREAD and RUN session, then the summary: `claude.ai: signed in · W waiting · U unread · R running · N listed · Show more ×K`.
* **Quote the `claude.ai:` summary line in the check's report**, word for word.
* **Answer every WAIT in the same check**, inside the lane's brief (the skill's "Prompts in a lane" rule).
* The app view (`app-view.js`, P-326) and `list_sessions include_archived` (for lanes archived with work left) stay as before.

## 2. Signed out or unreachable: tell the founder at once
* The read can fail in three ways:
  * it prints `claude.ai: SIGNED OUT or list not loaded (<url>)`;
  * the browser cannot be reached, in which case write the line `claude.ai: UNREACHABLE (<why>)` yourself;
  * GitHub is signed out: on github.com, `document.querySelector('meta[name=user-login]')?.content` is empty.
* In any of these, send a **PushNotification 🔴 to the founder in the same check**, with the URL to sign in: https://claude.ai/login or https://github.com/login.
* The check does not wait for the next one to say it.

## 3. The enforcer
`tools/lead-check-guard.sh` runs as a Stop hook, in the Lead's copy only. It refuses to end a turn started by `run lead-watch; read STATE Start here` in two cases:
* the Lead's text in that turn holds no `claude.ai:` summary line;
* the line says SIGNED OUT, "not loaded" or UNREACHABLE, and no PushNotification was sent in that turn.

Test: `check-claude-lanes.sh`.

## 4. Wake an idle lane by script (LR-146)
* For each lane lead-watch flags `[idle lane N min ...]`, lead-watch runs `tools/nudge-lane.sh <session-id> "<message>"`. It sends at most once per lane per hour.
* The script sends with `claude -p "<msg>" --cloud <id> --output-format json`. Docs, claude-code-on-the-web, "Send follow-ups from the CLI", read 27 Nov 2026: "The CLI queues the message into the session and exits without waiting for a reply"; JSON `{ok, session_id, url}`, or `{ok: false, session_id, error}` for a missing or archived session.
* The result is logged and printed as `nudge  <id> ok|error <reason>`.
* It needs `claude auth login` on the machine that runs lead-watch.
* An archived lane cannot be woken: start a new one from its PR's hand-over comment.

## 5. Lane deaths are never silent (LR-147)
* `tools/lane-death.sh` is the StopFailure hook (`.claude/settings.json`). Docs, hooks, read 27 Nov 2026: it fires "when the turn ends due to an API error", with `error` one of rate_limit, authentication_failed, billing_error, server_error and others; "Claude Code ignores the hook's output and exit code".
* It writes the time, session, error and branch to `~/.claude/xr-lane-deaths.tsv`.
* When the branch has an open PR, it also comments `Lane stopped (StopFailure): <error> …` on that PR. That makes a cloud lane's death visible from the Mac.
* lead-watch prints one ACT per death since the last check. Read the lane and restart it, or tell the founder when the cause is billing or sign-in.
