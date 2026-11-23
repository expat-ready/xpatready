# Resume on the new account (P-344 (1)): one page, kept by the tech lead

**Tested on a real switch, 5 Nov 19:14 IST; corrected the same evening.** Canary requested and pushed inside 5 minutes; nothing on GitHub lost. The work lives on GitHub (P-82), so an account switch loses at most what a lane has not pushed. Every lane pushes after each step (P-344 (1)).

## Switch of 23 Nov (Lead 10 → the new account's Lead), written 10:4x IST 23 Nov: READ THIS BLOCK FIRST
**Why:** weekly 84% at 10:10, 88% at 10:37 IST (about 8%/h with the all-in push the founder approved, A292); stop order at 95%, switch before 97%.
**Truth:** `product/STATE.md` on `lead/2026-11-07-lead31` (Lead 10 lines, founder asks A291-A293). Proven on main: 48/101 at 10:37 (main history: 12 on 20 Nov, 25 on 21, 41 on 22, 46 on 23 at 00:00).
**Founder decisions in force:** full approval to the Lead (A292); goal 70% (+23) in 2-3 days, ask for 25 by 10:00 24 Nov; tabs drawn inside the app (A293, console pattern); push on the new account.
**Cloud lanes on the old account (they stop; re-brief each from its PR or branch, one fresh session per row, Opus 5.5 medium, P-788):**
* Capability builders: R1.70 CS-D7c/CS-D7 · R1.85 PF-21b rest + PF-21d · R1.105 PF-11c + AUD-2 · R1.56 FO-7g part 3 · R1.61 J-61 (on #3065) · R1.46 PF-19s · R1.86 PF-21c · R1.29 FO-9b part 2 (#3174, rulings posted) · R1.93 PF-17 part 1 (#3155, round 3) · R1.58 FO-7t part 1 (#3033: hand-over note on the PR; Lead B's no-case scope fix) · R1.24 staff actor word then PF-25w (QmVh lane) · R1.104 FO-3c part 2 (T38b lane, rulings W4 block, W5 signatory) · R1.23 #3037 (merge main, then /run full) · R1.90 #3040 (to main, reviewer + breaker) · R1.92 #3173 (queued).
* qa: qa Track A 3 (R1.23/90/10/24/104/92 journeys and walks), qa Track B 3 (#3043-#3045 labelled 10:3x).
* Platform: UX PF-31 (in-app tab strip, shared drafts, If-Match/409; session_01Ln6TiU9xPuF2CQL5kWy6VF), Tooling closer (triage of ~25 tooling PRs into ready / one question / close).
**PRs to watch at the switch:** #3065 (/run full on 7d7979437; label when green + Lead B re-read) · #2935 (/run full on 83ebc1265; label when green) · #2933 (re-run of cancelled checks; label when green) · #3173, #3044 queued.
**Local sessions (survive):** Lead 10 `local_d4a6b1cd` (stops at the switch), Lead 11 standby `local_3a0c13fa`, Lead B 2 `local_6d7fefa2` (Track B reads), AWS staging proof `local_3f051647` (ARCHIVED by mistake 10:1x: the founder restores it from Archived; worktree and branch aws/2026-11-22-staging-proof intact).
**First steps on the new account, in order:** (1) `get_usage`, tell the founder. (2) `/lead` in the Mac's main copy; create the check (cron `3,13,23,33,43,53 * * * *`, prompt `run lead-watch; read STATE Start here`). (3) Re-brief the cloud lanes above from their PRs, capability rows first, in the order: nearest to proven first. (4) Founder: AWS root sign-in in the AWS session's pane (R1.1, R1.5, R1.13, R1.15, R1.65). (5) Two standby Leads. (6) Archive finished cloud lanes on the old account only if it is still reachable.
**Prompt for the founder to paste in the new account (Code tab, this folder, a new session):**
> /lead — new account after the 23 Nov switch. Read `product/RESUME-ON-NEW-ACCOUNT.md` block "Switch of 23 Nov" first, then STATE "Start here". Run get_usage and tell me the weekly %. Re-brief every cloud lane in that block from its PR, nearest-to-proven first, then follow the first steps in order. Nothing is lost: everything is on GitHub branch lead/2026-11-07-lead31 and open PRs.

## Switch of 22 Nov, part 2 (Lead 19 → the new account's Lead), written 09:5x IST 22 Nov: READ THIS BLOCK FIRST
**Founder's ask A277 (typed 09:5x):** move to the new account at 95% weekly, lose no work, then **validate this whole plan fresh before acting** and run for 15 proven per 07→07 cycle (8 by 19:00, 7 by 07:00). The plan: `product/design/plan-15-a-day-2026-11-22.md`.
**Nothing is lost (checked 09:5x):** no cloud lane was running at the switch (claude.ai: 81 rows, only the Lead running); every lane pushes after each step and every piece of work is a branch or PR on GitHub. Local sessions survive the switch: Lead 19 `local_69eeb2bd` (old account's current Lead, stops at the switch), Lead B (11) `local_3a725fd1` (46%, hand-over on branch `lead-b-front-office` 198f43adc), AWS session `local_35aacb3f`, standby Lead 20 `local_29230626`. Cloud sessions belong to the old account: re-brief from their PRs.
**Truth:** `product/STATE.md` on `lead/2026-11-07-lead31` (Lead 19 lines, A277), RULES as of P-784 (on main).
**PRs in flight at the switch:** #2883 PF-28 p6 (R1.10), #2884 PF-30a (R1.102), #2885 QA-644 (R1.24): each has the reviewer's Approve on its head plus the P-423 read (Lead B for #2883/#2884, Lead 19 for #2885's migration); marked ready in the browser 09:5x on the founder's word; **label each when its full `ci` is green** (that is all that is left). #2895 qa QA-642 closed and #2896 FO-9s concept, #2332 PF-18s concept: records PRs, label after a read. ~24 tooling PRs and 3 old migration PRs (#2129, #2320, #2368) are stale: see the plan's tooling section.
**First steps on the new account, in order:** (1) `get_usage`, tell the founder the weekly %. (2) `/lead` in the Mac's main copy; create the check (cron `3,13,23,33,43,53 * * * *`, prompt exactly `run lead-watch; read STATE Start here`). (3) Validate the plan (`product/design/plan-15-a-day-2026-11-22.md`) with a fresh independent Opus reader against CAPABILITIES on main, BACKLOG and open PRs; correct it; tell the founder the corrected 8+7. (4) Founder's outside steps first (he has the credentials): AWS root sign-in + CodeBuild approve in the AWS session's pane; Cloudflare + GoDaddy DNS for the staging domain (this puts R1.24 back in reach: `<firm>.staging.<domain>`). (5) Start Lead B (12) from Lead B (11)'s hand-over, two standby Leads, then the cloud lanes in the plan's order (Opus 5.5 medium, P-608; one row per session; cap 12 to 07:00 23 Nov, P-784). (6) Label #2883/#2884/#2885 on green ci.
**Prompt for the founder to paste in the new account (Code tab, this folder, a new session):**
> /lead — new account after the 22 Nov switch. Read `product/RESUME-ON-NEW-ACCOUNT.md` block "Switch of 22 Nov, part 2" first, then STATE "Start here" and `product/design/plan-15-a-day-2026-11-22.md`. Run get_usage and tell me the weekly %. Validate the whole plan fresh with an independent reader before acting, tell me the corrected plan, then do the first steps in order. Nothing is lost: everything is on GitHub branch lead/2026-11-07-lead31 and open PRs.

## Switch of 22 Nov (Lead 18, series 3 → the new account's Lead), prepared 04:1x IST 22 Nov: read this block first
**When:** at ~95% weekly (89% at 03:2x, ~1.5%/h with 9 cloud lanes: ~08:00 IST); hard stop 98% (~10:00). The weekly meter resets 22:30 IST 22 Nov, so the new account carries ~10:00-22:30.
**At 95%:** the Lead messages every running lane "finish this step, push, stop" (prompt box for cloud lanes), pushes STATE, then switches.
**Truth:** `product/STATE.md` on `lead/2026-11-07-lead31`: the "Lead 18 since 03:21" lines, A275-A276, P-784 (cap 12 to 07:00 23 Nov).
**Cloud lanes on the OLD account to re-brief from their PRs (one fresh cloud session per open row, same brief, Opus 5.5 medium):** R1.29 FO-9a next part · R1.102 CS-S1 part 2 · R1.105 AUD-5 part 2 · R1.92 PF-18a part 2 · rescue #2038 FO-6 part 1 (R1.54) · R1.24 PF-25w+QA-642 · R1.5 PF-4b+QA-643 · PF-5s screens (R1.90/R1.92) · PF-18s screens (R1.92/R1.93). Plus qa Q9 (R1.19 Works PR after #2857 merges) and the #2687 DEMO-LINK lane.
**Update Lead 19, 08:2x IST 22 Nov (weekly 95%, ~0.5%/h since 07:00; message lanes at 96%, hard stop 98%):** the current Lead is Lead 19 `local_69eeb2bd` (local, survives). Merged since 04:1x: #2038, #2880, #2881, #2882, #2891, #2897, #2899, #2894 (P-784). Open rows to re-brief from their PRs on the new account: #2883 PF-28 p6 (R1.10; Approve 00711e628 ready, not posted: refused in Lead's shell), #2884 PF-30a (R1.102; Approve + Lead B read on a9a81090a; draft), #2885 QA-644 (R1.24; Approve + Lead read on 243434b00; draft), #2900 FO-9s p1 (R1.29; fixing module-cards + fast on b6ee7c892), #2895 qa QA-642 records (unlabelled), PF-18s parts 2-3 (after #2897), R1.105 AUD-5 p2 and R1.92 PF-18a p2 (no PR seen). Owed at the founder's turn: R1.10 PF-28 parts 3a, 3b, 4, 5 lanes; FO-9s founder questions (STATE 06:4x line); fix rows (start.sh npm ci; C11.15 flake; B194 gate keeps permission routes).
**Local sessions that survive:** Lead B (11) `local_3a725fd1`; AWS proof session `local_35aacb3f` (waits on the founder's root sign-in in ITS browser pane); standbys Lead 19 `local_69eeb2bd`, Lead 20 `local_29230626`.

## Switch of 21-22 Nov (Lead 15, series 3 → the new account's Lead), prepared 17:2x IST 21 Nov: read this block first
**When:** at ~95% weekly or before the founder sleeps, whichever comes first (founder, A271). Weekly was 76% at 17:2x IST, ~3%/h.
**Where the truth is:** `product/STATE.md` on branch `lead/2026-11-07-lead31` (pushed after every step): "Start here", the newest hand-over block, the "Lead 15 since" lines and the A-rows. RULES as of P-783.
**First steps on the new account:** (1) `get_usage`; (2) start the Lead locally in the Mac's main copy, `/lead`; create the check (cron `3,13,23,33,43,53 * * * *`, prompt exactly `run lead-watch; read STATE Start here`); (3) two standby Leads; (4) re-brief each cloud lane below from its PR (cloud sessions belong to the old account: open the PR, read the last comment, start one fresh cloud session per open row with its Done when).
**Cycle commitment (A270):** 8 proven by 21:00 IST, 10 by 00:00, 13 expected by 07:00 22 Nov. Rows, PRs and owners: the A270 line in STATE.
**Local sessions that survive the switch (Mac):** Lead B (11) `local_3a725fd1`; AWS proof session `local_35aacb3f` (idle until "go Phase 2" after #2800 + F2b + F3 merge; AWS case 179475587900349 open; staging domain parked, A266).
**Never lost:** every branch and PR is on GitHub (P-557). Nothing lives only in a session.

## Switch of 15 Nov (Lead 55 → the new account's Lead), written 13:2x IST: read this block first
**Why now:** weekly 93% on A1 (no new row at 93%, A68); the founder leaves within 2-3 h, so the switch is done before 95%. Everything below is on GitHub, branch `lead/2026-11-07-lead31` (P-557). Nothing lives only in a session.

**State at the switch:** Release 1: 7 of 101 capabilities built, 6 proven by qa (Works); proof of concept 93/98 Works on main (M2 60/60, M3 27/29, T 6/8; QA-383 will take C7.8, C6.19, C7.1 back to Partial). Pace needed for all 101 by 29 Nov (P-609): about 13 merged changes a day (board: 178 changes left). Rules as of **P-612** (`RULES.md`); newest decisions P-610 (narrowest fix, PRs under 800 lines), P-611 (nothing gets lost: enforced, not remembered; weekly what's-new check), P-612 (licence check kept, departure from SA-6-27).

**In flight (every item is a branch or PR on GitHub):**
* Merge queue (labelled): #1796 records (P-561 to P-607, skills), #1800 PF-23w, #1802 qa old Majors, #1805 qa QA-470 check. If any is dequeued, its owner merges main.
* Building in the cloud on the OLD account (may keep pushing until its limit; read each head again before a label): PF-6b #1808 (P-612 cited), FO-5f2 #1809 (draft; async + allowlist accepted by Lead B), **BK-383 #1810 (Critical, QA-383)**, FO-7a #1758 (draft, conflict; read its migration before a label), **G-1+G-2** branch `tools/g1-g2-needs-lead-queue`, **G-5** branch `board/v62-whats-new`. G lanes report with a first line `LANE-REPORT: ready <row>` on #1796 (or its successor records PR); merge their branch into the lead branch, run the tests in a scratch clone, publish the board.
* If a cloud lane goes quiet over 90 min after the switch, restart it on the new account from its PR or branch: brief = the row in BACKLOG + "continue from branch <name>, head <sha>".
* Lead B (5) `local_552b9387` on branch `lead-b-front-office`: state in lead-b-state.md in the design folder of branch `lead-b-front-office` (not on this branch; saved at dba387577, opens with "START HERE: hand-over Lead B (5) → Lead B (6)"). Start a new Lead B on the new account from that file.
* **Board (the one link, from 15 Nov 15:49 IST): Version 63 at https://claude.ai/artifact/LceYQnmEWNpqBoUUp4hBbW** (published on account A2 by Lead 59; the founder shares it with edit access to his other accounts, then every account republishes to this link). Before: Version 61 at https://claude.ai/artifact/EUxtzcCPrPEfTWWvLqvyMX (old account) (ⓘ icons + v57 fixes). The banner "numbers disagree: ready rows 7 vs 8; records differ on map rows 9, 11, 16, 38, 40, 99" is real: fix the checklist rows or the script (records fix, first records PR on the new account). `board/v53-top-numbers` has 10 commits not merged: check whether v57/v61 already cover them before merging.
* Library behind: Release 1 checklist (10:47), contracts (12:59): refresh each with a cheap agent, one records commit.

**First steps on the new account, in order:** (1) `get_usage` first (the new account may not be at 0%) and tell the founder. (2) `/lead`; create the check (CronCreate 13,43, prompt `run lead-watch; read STATE Start here`). (3) Two standby Leads (local, medium effort, P-608). (4) A new Lead B from lead-b-state.md on branch `lead-b-front-office`. (5) Read every in-flight PR head above; restart quiet lanes. (6) Then the order agreed: G-1+G-2 and G-5 land first (P-611), then G-3, G-4; new rows by the pick order in RULES with up to ~10 parallel cloud lanes while batch failures stay under 10% (to reach ~13 merged changes a day).

**Prompt for the founder to paste in the new account (Code tab, this folder, a new session):**
> /lead — new account after the 15 Nov switch. Read `product/RESUME-ON-NEW-ACCOUNT.md` block "Switch of 15 Nov" first, then STATE "Start here". Run get_usage and tell me the weekly %. Then do the first steps in that block in order, start two standby Leads and Lead B, and restart any lane that has gone quiet from its branch. Nothing from the old account is lost: it is all on GitHub branch lead/2026-11-07-lead31.

**First row on the new account (P-459, 11 Nov):** B168, the app starts on any Mac (co-founder copy), in a founder-typed turn. Also owed after the switch (founder, 11 Nov 11:3x IST): the fresh barcode check on a Paper IMM 5257 copy made by today's app (Adobe draws the barcode page; `prototype/p1/decode_barcodes.py`, then `prototype/evidence-lane/E1/tools/barcode_compare.py`); proof so far in `design/demo-pdf-proof-2026-11-11.md`.

**State at the switch (Lead 12 (series 2), 11 Nov 11:4x IST; founder: "Keep the stop" at 96%, P-458):** M2 60/60, M3 29/29 Works. Bake (M3.5) merged so far: BK-2, M3-S5, expert pack #1510, BK-10 #1518 (form rules into data), M3-S2 #1513 (conditional extra filing); #1519 BK-3 PR 1 (one frame) queued, merges by itself. Stopped at 96% with work pushed (read each lane's last PR comment for where it stopped): forms lane B169 (`fs.spouse` IRCC account), runtime lane M3-S3 (waivable line with a reason; holds the schema + case-prepare baton), screens lane BK-3 PR 2 (scope in its PR comment). On the new account, in order: B168 (P-459); finish those three rows (restart each lane by its claude.ai session or a fresh session per row); qa re-score of #1518, #1513, #1519 (G5); qa finding to log: after "Load the finished story", other Paper copies (IMM 5475, IRM 0002 for Child …) read "Out of date"; the fresh barcode check (above); **B170, the team's XFA engine reuse lane (founder ask A16; brief `design/xfa-engine-reuse-brief-2026-11-11.md`), in parallel**. Paid US$0.

**Found on the real switch:**
* **Connectors (P-445 (2), A11, 11 Nov):** on a new account check the Lead's start read with `get_usage` (about 115-120k on 11 Nov). Notion, Google Drive and Claude Docs are off by default; a new account can switch them back on: turn them off again (composer + menu, Connectors).
* **Token rules carry over (P-440):** they live in `RULES.md` "Tokens: hard rules" and the `lead` and `lead-watch` skills, not in any account. The new Lead reads `RULES.md` plus only the newer DECISIONS rows, hands over at about 250k context, and watches the burn per hour at every check (over 3%/h at two checks: find the cause).
* **The new account may not be empty.** It read 87% weekly on arrival, not 0%. Run `get_usage` first and tell the founder before starting lanes: the crew depends on it (P-356).
* The app's session list shows nothing from the old account, running or not. A cloud lane on the old account may still push until its limit: read each stack head again before a label.
* The built-in browser keeps its own sign-in, separate from the app's: it was signed out. The founder's step 1 is needed even when the app is signed in, and a sign-in only counts once claude.ai/code reads as text.
* The Lead's last records branch may not be on `main` (84e9b9197 was not): compare `origin/main..origin/lead/*` before starting a records branch.
* The notes folder is `~/Library/Application Support/Claude/side-session-notes/lead10-saved-2026-11-05/`, outside the repository.
* `find ~` runs past the 2-minute limit; `mdfind -name` finds a note at once.

## Ollama Cloud (P-361): read this first if you run on Ollama. Not yet tested on this project.
**Route chosen by the founder, ~23:58 IST: the desktop app (P-362).** Ollama app → Apps → Connect Claude, restart Claude, then a new session in the Code tab in this folder. Models: Ollama → Settings → Apps. Main and Sonnet `glm-5.3`; Opus `kimi-k3.1-pro`, since reviews ask for `opus`; Haiku `glm-5.3-flash`; Fable `glm-5.3`, our flow doesn't use it. "You can use the same model for more than one option" (Ollama's docs). The founder saw a picture of a mapping in that screen; no public page was found with one (5 Nov): if it differs from these, tell the founder and follow the evidence from the canary. Ollama's docs list subagents, web search, Cowork and auto mode; the Code tab and computer use aren't mentioned, and Remote Control and Anthropic-hosted cloud are off on third-party inference. **While connected, every desktop session uses Ollama, standbys and qa included. Disconnecting, quitting Ollama or `ollama launch claude-desktop --restore` puts Claude back, so a quit Ollama means Claude's plan is being spent without notice: check the route at each check.** A Claude re-check or the Acrobat step, if computer use fails on Ollama: disconnect at a clean pause, run it, reconnect. Add to the test below: 7. `start_session`, `list_sessions` and `get_usage` still work; 8. computer use can open Acrobat (the founder approves it). Terminal route, kept as the fallback:

**Start, in a terminal (the desktop app is untouched and stays on Claude; don't set its third-party inference):**
`ollama signin`, then in this folder: `ANTHROPIC_DEFAULT_OPUS_MODEL=kimi-k3.1-pro:cloud ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.3-flash:cloud ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.3-flash:cloud ollama launch claude --model glm-5.3:cloud`.
The `glm-5.3:cloud` tag is on Ollama's page; the other two `:cloud` tags and whether the launcher passes these variables on are inferred: test 2 proves them. **Fallback, by Ollama's docs, with a key from Ollama's settings, never in a file in this repository or in chat:** `ANTHROPIC_BASE_URL=https://ollama.com ANTHROPIC_AUTH_TOKEN="$OLLAMA_API_KEY" ANTHROPIC_API_KEY="" claude --model glm-5.3`, with the aliases named `kimi-k3.1-pro` and `glm-5.3-flash`.

**Connection test, before any lane; exit codes, not prose. Report each line to the founder:**
1. `/status` shows the Ollama base URL. `bash product/tools/lane.sh whoami` says `lead`; `gh auth status` passes; the session-start hook printed STATE; `/lead` loads.
2. An Agent call with `model: opus` works and says which model answered; `model: sonnet` likewise.
3. AskUserQuestion reaches the founder. CronCreate fires once. A commit on the lead branch pushes past the push guard.
4. WebFetch reads a canada.ca page (hosted WebSearch is not fully supported; immigration facts still need page, quote and date).
5. A Playwright screenshot of :4400 can be read back by the qa model (GLM-5.3 lists no vision).
6. After about ten calls read `ollama.com/settings/usage`: cached input or not? Report tokens per call. If uncached, tell the founder the cost per lane-hour before starting lanes.
Any failure goes to the founder at once with a proposal. If tests 1 to 3 cannot pass, use the fallback in STATE.

**Canary row:** B115 when #1052 lands: a new lane on `glm-5.3`, Kimi review, then a Claude qa re-check in the desktop app. Report the misses and the tokens. Only then more lanes. Prefer rows with clear tests first; keep money, permissions and schema PRs for a Claude review while plan remains.

**What is different on the CLI, the terminal route only:** no `mcp__ccd_*` tools, so no `start_session`, cards, sidebar, standbys, `list_sessions` or `get_usage`; lanes are terminals or background `ollama launch claude --model glm-5.3:cloud --yes -- -p "<brief>"` runs, one worktree each, permission rules decide what runs unattended; never `--dangerously-skip-permissions` here. No Remote Control, no claude.ai cloud lanes, no built-in browser. Computer use (Acrobat): desktop app. Concurrency: 3 on Pro, 10 on Max, over that queued, then refused. Claude Code assumes a 200K window for these model names and compacts there: write rulings to PR comments first. Cross-session messages from the CLI to a desktop lane are unproven: use PR comments, and ask the founder if a lane must be woken.

## Before the switch (the Lead, if there is warning)
1. `get_usage`: note the weekly figure and time.
2. Rewrite `STATE.md`, push; message each Mac lane "push now"; check with `gh pr list` that each row's last push is recent.
3. Run `bash product/tools/factory-board.sh` and paste its output under "Board at the switch" in `STATE.md`.
4. A labelled PR needs nothing: Mergify merges it without any account (Mergify and GitHub Actions do not use the Claude account).

If there is no warning, nothing above is needed to resume: read the board on the new account instead.

## What does not depend on the Claude account
GitHub (code, PRs, labels, comments), Mergify, GitHub Actions, the demo at :4400, the Mac's copies under `.claude/worktrees/`, the side-session notes folder `lead10-saved-2026-11-05/`, `product/` records.

## What does
Every Claude session, Mac and cloud. **Assume none carries over**; a session that does is a bonus. Scheduled checks die with their session.

## The founder, on the new account (about 5 minutes)
1. Sign in to the Claude desktop app with the new account and to claude.ai in the built-in browser.
2. In the Code tab open this folder (`Desktop/Xpatready` in the founder's home folder) and type `/lead`.

## The new Lead, in order
0. **No watcher:** the P-354 trial lapsed and was not restarted (P-370 (5)). Before starting a lane, read its PR's comments and check runs: on 7 Nov, A3's Approve line was already on the PR, so it needed a label, not a lane (P-398).
1. **Connection checklist (P-326 (5)):** no "Connect GitHub" on claude.ai/code; `gh auth status`; Mergify sees the repo; Drive read works; the nightly ran. A cloud canary that cloned and pushed comes before any cloud lane is counted as running (20 of 20 cloud lanes died unseen on 4 Nov because this was missed).
2. Read `RULES.md`, the newer `DECISIONS.md` rows, `STATE.md`, per the `lead` skill.
3. Create the 30-minute check; start two standby Leads in the founder's typed turn (P-286).
4. **Restart lanes from `STATE.md` "In flight" plus the board, one per row, critical path first** (the board lists only rows with a PR; a row with no PR yet is only in STATE). Mac memory is full, so cloud first unless a row needs `sources/` or `code/`.
   Brief for each: "Row <id>, PR #<n>, branch <b>. Continue from its last push. Read the PR's comments, including the Lead's rulings. Standard rules (lead skill, Sessions and tokens). Done when: <the row's Done when>."
5. Check for unpushed Mac work before reusing a copy: `git -C .claude/worktrees/<copy> status -s` and `git -C … log @{u}..`. Commit and push any to its own branch first. Never delete a copy until that is done.
6. qa first if its re-scores are behind: the qa lane is the one writer of `qa/CAPABILITIES.md` and `qa/BUGS.md`.
7. Tell the founder in one line what restarted, what did not, and what was lost; then correct this page.

## What could be lost, and the guard
| Risk | Guard |
|---|---|
| A lane's unpushed step | push after each step; at worst one step |
| A running review or breaker | the row's head is unchanged, so re-run it |
| A Lead's unwritten rulings | rulings go on PR comments first (P-336); records follow |
| Paid run in progress | runs only on the Mac paid runner with the ledger; check `prototype/p2/ledger.ts` totals before any retry |
| Notes under a session's id | keep notes in `lead10-saved-2026-11-05/`, never in a folder named for a session (archiving removed Lead 5's) |
