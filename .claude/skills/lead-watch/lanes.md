# Lanes at every check: read, answer, wake, and deaths (A430, LR-154, LR-146, LR-147)

The tech lead's correction, 27 Nov: `app-view.js` on main already reads past "Show more", so LR-154 adds no tool. It enforces the tool's saved line each check, and the signed-out push.

Founder A430 (27 Nov): "this also should be some hook or some code ... You should be reminding me if you're not able to manage these" and "Show more has to be clicked, otherwise you see only half of the lanes. This has to be also enforced."

## 1. Read every lane (LR-154)
* In the built-in browser, open https://claude.ai/code and run `product/tools/app-view.js` with `javascript_tool`.
  * It reads the page's own session list past "Show more" (B204 (4), ENF-761). On 20 Nov the sidebar hid 11 of 45 sessions.
  * It prints one line per session, FLAG or ok.
* Save it the same check: `bash product/tools/lead-watch.sh app-view-read <<'EOF' … EOF`. That refuses a summary without `rows=N`.
* Act on every FLAG in that check: answer a waiting lane inside its brief, or wake it (section 4).
* `list_sessions include_archived` still finds lanes archived with work left.

## 2. Signed out or unreachable: tell the founder at once
* When the page cannot be read, app-view.js prints `UNREADABLE …`. That happens when claude.ai is signed out, the call is refused, or the browser cannot be reached. **Save that line anyway.**
* Then send a **PushNotification 🔴 to the founder in the same check**, with https://claude.ai/login.
* GitHub likewise: on github.com, `document.querySelector('meta[name=user-login]')?.content` is empty → https://github.com/login.

## 3. The enforcer
`tools/lead-check-guard.sh` refuses to end a turn started by `run lead-watch; read STATE Start here` in two cases:
* the saved app view is over 15 min old (B197, P-798);
* the saved view says UNREADABLE and no PushNotification was sent in that turn.

This Stop mode is registered in `.claude/settings.json` since LR-154. It was tested but never registered, so B197's rule never ran.

It runs in the Lead's copy only. Test: `check-lane-read.sh`.

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
