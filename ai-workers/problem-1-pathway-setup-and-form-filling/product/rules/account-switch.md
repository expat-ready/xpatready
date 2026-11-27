# Account switch: the checklist and the ledger (OS-86, LR-143; founder A417, 27 Nov)

Founder A417, typed 06:0x IST 27 Nov: "make the account-switch best practice enforced, refreshed at every switch, so no tokens, work or rework are wasted".

The design is Lead 7's, in `RESUME-ON-NEW-ACCOUNT.md` (the A417 block). The steps come from the runbook `design/account-switch-runbook-2026-11-27.html`. RESUME and the paste prompt point here; they never copy this list.

**Enforced by `tools/switch.sh`** (test: `check-switch.sh`):
* **Detect.** `session-start.sh` runs `switch.sh detect`. A change of `oauthAccount.accountUuid` in `~/.claude.json` against the last one seen opens a switch and prints this checklist. Only a hash of the id is kept, outside the repository.
* **Gate.** While a switch is open, `lane-preflight.sh` refuses every lane start until `switch.sh baseline <pct>` records the minute-0 meter. After that it allows at most 4 starts in any 15 minutes and 12 in the first 2 hours.
* **Old side.** At 94% weekly, lead-watch runs `switch.sh close-prep <pct>`. It writes the ledger row with the old account's meter and checks that STATE and RESUME are pushed. It is an ACT line until done.
* **Refresh.** `switch.sh close` closes the switch only when this switch's ledger row is complete. Every switch's lesson lands here before the next one.

The credit meter is not readable by a hook: `get_usage` is the Lead's tool. So the meter is typed into `switch.sh` by the Lead, by script, never as prose.

## The checklist

| Step | Who | What | Done when |
|---|---|---|---|
| AS-1 | Old Lead, at 94% weekly | `switch.sh close-prep <pct>`: STATE.md and RESUME-ON-NEW-ACCOUNT.md pushed, the ledger row written. Tell every lane to finish its step, push, and leave a hand-over comment on its PR (done, next step, head SHA) | close-prep prints "close-prep: done" |
| AS-2 | Old Lead, at "switching now" | private-sync; delete its timers; stop its event watch; rename itself "(ended)" | no timer or watch left in the old session |
| AS-3 | Founder | Switch the desktop app, then claude.ai in Chrome, to the new account. Open or message no old session after this: each would run on the new account | both show the new account |
| AS-4 | New Lead, first action | `get_usage`, then `switch.sh baseline <pct>`. Above 5%: stop and ask the founder whether this account was used this week | baseline recorded; lane starts are unblocked |
| AS-5 | New Lead | Set `current_lead` in STATE and push; create the check (cron 3,33, prompt exactly `run lead-watch; read STATE Start here`) and the event watch | STATE pushed; the check is listed |
| AS-6 | New Lead | Archive every old-account session (Leads, standbys) after checking each has nothing unpushed | the sidebar shows only the new Lead and live lanes |
| AS-7 | Founder | Sign in to claude.ai in the browser pane, so `claude-lanes.js` can read the lanes | lead-watch's `claude.ai:` line says "signed in" |
| AS-8 | New Lead | One canary cloud lane that must push; then wave 1: 4 lanes ranked by nearness to Works, qa first | the canary pushed; `get_usage` read again |
| AS-9 | New Lead | Waves 2 and 3, 15 min apart, only while a wave cost under 4% of the meter; 12 lanes at most; no tooling lanes unless one blocks the queue | the gate never refused a start |
| AS-10 | New Lead | One standby Lead at the founder's next typed message; a second only past 150k context | one standby |
| AS-11 | New Lead, 2 h after the baseline | `switch.sh close <pct now>`: fills the burn and the lanes started; the Lead writes work lost and the lesson in the row; close succeeds only when the row is complete | "switch closed" |

## Ledger (one row per switch; written by `switch.sh`, the lesson by the Lead)

| Switch (IST) | Old meter at close-prep | New meter at minute 0 | Burn first 2 h | Lanes started first 2 h | Work lost | Lesson |
|---|---|---|---|---|---|---|
| 2026-11-27 06:0x | 95% (05:58) | not recorded | not recorded | not recorded | none on GitHub | Built OS-86: record the meter at minute 0 and gate starts until it is recorded (the 26 Nov account showed 39% before any work, unexplained) |
