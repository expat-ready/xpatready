# Enforcement plan: hooks and checks for the whole pipeline (16 Nov 2026)

Written by a read-only design agent for the tech lead, 10:0x IST 16 Nov 2026, at the founder's ask (~10:0x IST): "do the detailed analysis of all the rules and everything ... and come up with the hooks we would require to basically have a complete control on all the agents, and ... on each component of our software engineering pipeline." Nothing here is built, committed or wired. Settings and tools were not changed.

**Built on, not redone:** `RULES.md` (as of P-630; 96 rows `prose`), `rules/prose-only-g4-candidates.md`, `design/rule-triage-2026-11-16.md` (every prose row's check and its break count, 13-16 Nov), `design/rule-enforcement-research-2026-11-15.md` (A92: the eight-step plan, P-619), `design/governance-research-2026-11-15.md`, `WAY-OF-WORKING.md`, `.claude/settings.json` (seven hooks, 39 deny rules), the skills and agents, `AGENTS.md`, `CLAUDE.md`, the eight workflows, `.mergify.yml`, `tools/check-guards.sh`, open PR #1865 (six new hooks, local ref `refs/pr/1865` at 823d9afaf; GitHub could not be fetched from this sandbox, so a newer head may exist), DECISIONS P-626 to P-633 and BACKLOG B193 to B198 on `lead/2026-11-07-lead31`. Hook facts: code.claude.com/docs/en/hooks, read 16 Nov 2026 (two parts of the page; points I could not confirm are marked **Unsure**).

## 0. The answer in six lines
1. **"Complete control" by hooks alone is not possible.** A hook sees one tool call or one turn end. It can stop a wrong action. It cannot judge whether a review was careful or a decision was wise.
2. **Best-in-class is three layers:** *prevent* (permissions and hooks, for actions that cannot be undone), *detect* (CI on the PR, the merge queue and lead-watch ACT lines, for everything checkable), *audit* (a sampled, independent read of judgment: reviewer checklist, qa verdict, a weekly fresh-reader audit).
3. **Today's three misses already have code, but it is not switched on.** The board refresh (lead-act-check.sh, #1865), the claude.ai lane read (B197) and the connectors check (B198) need the founder's settings lines once they merge. The start-of-session checks have no enforcer at all: hook 2 below.
4. **The biggest single gap is wiring, not writing.** Guards get built and then sit unwired (G-4's pr-open-guard for days; #1865's six now). Hook 1 makes CI fail when the register names a hook that `settings.json` does not run.
5. **The founder's speed rule (10:2x IST) is a hard design rule here (section 3.0):** under about 1 second per tool call, network only for the commands a hook guards, block only a real break, never wait on a prompt, and prefer CI or an ACT line unless the action cannot be undone.
6. **Board reds get an owner and a time to green (section 6):** each of the seven Health items names its owner role; lead-watch turns a red older than one check into an ACT line naming that owner; the check turn cannot end with a red nobody owns. No standing health-keeper lane for now.

Of the 99 prose rules (96 in the register plus P-631 to P-633): **61 fully checkable (A), 28 partly (B), 9 judgment only (C), 1 retired (P-620, by P-633)** (section 2). Fully checkable still needs building: most A rows are CI or ACT lines, not blocking hooks.

## 1. Map of the pipeline components
Columns: the rules that govern the component, what enforces each today (H = hook, CI, S = script the Lead runs, P = prose only), and the gap.

| # | Component | Rules (IDs) | Enforced today | Gap |
|---|---|---|---|---|
| 1 | Founder asks | P-478, P-503, P-338, P-390, P-512, P-508, P-530, P-613, B193 part 8 | P (lead skill "every ask into STATE"); S: items.py holds times (P-611b) | No check that an ask reached STATE, got an owner, or was answered in 24 h (B193 part 8 is unbuilt); report shape is prose |
| 2 | Shaping and briefs | P-526, P-526b, P-542, P-595, P-604, P-606, P-251, P-352, P-582, P-626, P-608, P-486b | CI: brief-check.sh (Done when, Duplicate check); H: lane-preflight.sh --hook (model and effort line, brief-check --brief) | Touch list, held rows, waits-on tooling rows, Source:, context line are unchecked |
| 3 | Session start | lead skill steps 1-5, P-440b, P-458, P-348e, P-286, P-445b, P-632, P-633, P-462 | H: session-start.sh (copy, command, state, pull, hooks path); H: lane-preflight.sh (Mac caps) | **Nothing checks the Lead's start steps** (whoami, two Leads, nightly red, RULES plus newer rows, account switch). Founder 16 Nov: skipped repeatedly |
| 4 | Build (lanes) | P-278, P-319, P-335, P-470, P-473, P-607, P-621, P-604, P-557, P-337, P-175 | S: lane.sh binding; H: stop-check.sh (no edits to Lead files, any count); pre-push guard | Engine and tenant greps, provider SDK, requirement reads, push-before-stop are unchecked; cloud lanes went to sleep unpushed 15 Nov |
| 5 | Review and breaker | P-303, P-277, P-599, P-502, P-352 | H + CI: agent-model-guard.sh (Opus high) | Breaker for money, schema, permissions, new screen is unchecked; rounds uncounted (4 PRs past two rounds, 14-15 Nov) |
| 6 | PR rules | P-606, P-610, P-526, P-553, P-587, P-600, P-464, P-631 | CI: pr-rules.yml (Done when, Duplicate, 800 lines, agents) | **pr-rules is not a required check** (the queue waits only on `ci`); P-631's lockfile exception is B196 |
| 7 | Labels and merge queue | P-385, P-423, P-402, P-270, P-371, P-384, B194 | CI: label-guard.yml, label-sweep.sh; H: merge-guard.sh (only the Lead merges, closes, reviews); Mergify conditions; #1865: queued-push-guard.sh, lead-read-guard.sh | #1865 unwired; `gh run cancel` is not denied (nightly cancelled 15 Nov; 2 Nov all runs cancelled); main-merge count uncounted |
| 8 | Main and demo | P-339, P-317, P-305, P-488, P-348d | CI: ci.yml gate B, route-has-screen.mjs; demo-update.yml | Mostly held. Red nightly is read only by the lead skill's start step (prose) |
| 9 | qa | P-348c, P-405, P-442, P-616, P-434b, QA-221, P-314 | CI: gate B; H: stop-check.sh (qa alone edits CAPABILITIES, BUGS) | Gate-A walk file, WAIT/HELD lines and API walks are unchecked |
| 10 | Records | P-336, P-440, P-611a, P-254, P-294, P-566, F-12Nov, P-312, P-526c, IDX-1/2/4/5, P-589, P-551, P-582, P-302 | S: check-docs.sh (STATE 12 KB, RULES 25 KB and lag, register field, triage map); decision-impact.sh; CI: records-label.yml; #1865: ist-time-guard.py | Decision fields, index integrity and MVP-CHECKLIST gates unchecked; IST times guarded only in two files, never in messages (17 guessed times 13-15 Nov) |
| 11 | Board and reporting | P-591, P-596, P-500, P-593, P-592, P-611c, P-609, P-614, P-338, P-339b, P-326, P-514, P-418 | S: cockpit-data.py, cockpit-reconcile.py, library-freshness.py; CI: cockpit-tests.yml; S: sle-watch.py; #1865: lead-act-check.sh (board over 45 min, check over 40 min); B197 app view | **Board refresh and the claude.ai lane read are skipped** (founder A110 "lead keep forgetting"); enforcers exist or are planned but not wired |
| 12 | Money, schema, permissions | P-175, P-175b, P-295, P-295b, P-377, P-423, P-486, P-600, P-387, P-312a | S: p2/ledger.ts (reserve first), live AI off by default; CI: check-write-token.sh; sandbox denies settings writes; #1865: lead-read-guard.sh | `*_LIVE=approved` typed by hand is not refused by a hook (US$0.27 29 Oct, US$0.17 30 Oct); migration stamp order unchecked |
| 13 | Outside accounts and tools | P-551, P-580, P-583, P-618, P-632, P-633, P-445b | S: outside-deps-watch.py in lead-watch step 9; deny rules on Drive writes; B198 planned | Required-tools check is B198 (unbuilt); GitHub safety settings unread by any script |
| 14 | Hand-over and context | P-446, P-446f, P-565, P-388, P-409, P-532, P-611b, P-557 | S: handover.sh, items.py; S: lead-heartbeat.sh; #1865: lead-act-check.sh | Context limits are read by eye (Lead 45 handed over ~360k beyond start, Lead 60 ~228k); a hand-over with a subagent running is not refused |
| 15 | Tokens and spend | P-440c, P-440d, P-461, P-605, P-597, P-445b | S: usage-log.sh logs only; H: agent-model-guard.sh | Burn rate and big tool outputs are not flagged; desk model unchecked |

## 2. Every prose rule, classified
**A** = fully checkable by a machine; **B** = partly (the checkable part named); **C** = judgment only (the best control named). Layer codes: **PTU** PreToolUse hook · **STOP** Stop hook · **SS** SessionStart hook · **PTU-out** PostToolUse flag · **CI** a check on the PR · **MQ** a Mergify condition · **ACT** a lead-watch ACT line · **SCR** a script. "Hook n" refers to section 3. Where the triage page already named the check, this table adopts it.

| ID | Class | Layer | Control (what is checked; the rest stays with whom) |
|---|---|---|---|
| IDX-1, IDX-2, IDX-4, IDX-5 | A | CI | check-docs.sh: every ID an index lists exists in DECISIONS (hook 10) |
| P-418 | B | ACT | lead-watch prints the pick list in P-418's order (hook 11); choosing inside a class stays the Lead's |
| P-464 | B | CI | "XFA reuse:" line on PRs under packages/xfa-engine/ (hook 8); the head-to-head is the reviewer's |
| P-470 | A | CI + pre-push | xfa-engine/src change also changes PATCHES.md; push-guard refuses the ER v2 URL (hook 8) |
| P-468 | A | SCR | prune-copies.sh: deletes only pushed, clean copies with no session (section 4, later) |
| P-473 | B | CI | no motion library in web/package.json; "Why we ask" copy test (hook 8); the calm style is a reviewer checklist item |
| P-558 | B | CI | module card names its owning Lead; label-guard refuses a label from a Lead not owning the module (hook 9); the split itself is the founder's |
| P-547 | A | CI | test that check-docs.sh never runs in a product job (hook 10) |
| P-583 | B | ACT (weekly) | settings-read script: secret scanning, private reporting, actions pinned (hook 11); the founder clicks |
| P-589 | A | CI | MVP-CHECKLIST: "repository private" done before any real-firm-data row is green (hook 10) |
| F-12Nov | C | audit | value against cost is judged: weekly audit samples 5 decisions; decision rows must state time, cost, quality (hook 10, with P-254) |
| P-502 | C | reviewer checklist + audit | fix PRs' reviews carry a "Root cause:" line (hook 9 proxy); whether it is the real cause is the reviewer's and the audit's |
| P-503 | B | STOP | report shape: decided (≤5), doing (3-4), one founder line (hook 3); content quality is the Lead's |
| P-504 | B | pre-push + CI | hashed team-app term list on every pushed diff (hook 12); "a classifier refusal is never routed around" stays prose |
| P-505 | A | CI | the same scanner over every commit base..head (hook 12) |
| P-508 | A | PTU | AskUserQuestion guard (hook 6); the reference-folder clause stays prose |
| P-512 | A | PTU | hook 6: a card only while the founder types (last typed prompt under 10 min) |
| P-514 | A | ACT | desk track file changed since the last check (hook 11) |
| P-530 | A | ACT | a founder item over 30 min with no red line atop STATE (hook 11) |
| P-542 | A | CI | brief-check.sh: a product row's "waits on" names no B- or G- row (hook 8) |
| P-551 | B | CI | MVP-CHECKLIST on-call, support, breach owners filled before the gate (hook 10); "no account but the founder's" is held by the deny rules and the agent safety rules |
| P-553 | B | CI | a PR adding a dependency carries "STANDARDS §1:" (hook 8); the gate verdict is judgment |
| P-565 | B | ACT | B197's app view flags context over 45%; vendor facts from public sources is judgment |
| P-566 | B | CI | decision-impact: a Lead-ruled row names what settled it (hook 10); the firm sign-up clause is product |
| P-576 | A | PTU + CI | touch-list overlap guard (hook 7) |
| P-580 | C | platform | the founder types every password: already a platform safety rule for every agent; no hook adds value |
| P-582 | A | CI | every "left out" MVP item names an existing X-row (hook 10) |
| P-587 | B | CI | with P-553 (hook 8) |
| P-592 | A | SCR | library-freshness.py: one tracking page (hook 10) |
| P-595 | A | CI | every Release 1 BACKLOG row has Source: (hook 10) |
| P-597 | A | PTU | lane-preflight.sh: a desk start brief names Fable 5.2 high (hook 13) |
| P-599 | A | ACT + CI | fewer than two ready rows per lane (hook 11); review rounds counted (hook 9) |
| P-600 | A | CI | migration folder new, additive, later stamp than main and other open PRs (hook 8) |
| P-604 | A | PTU | requirement-read guard in builder and qa copies (hook 13) |
| P-607 | A | CI (app tests) | trust ≥ 0, audit fails closed, support read-only: product tests in the studio suites |
| P-611c | A | SCR | cockpit-data.py: whats-new.json over 8 days shows stale (hook 10) |
| P-609 | A | SCR | cockpit-reconcile.py: plan target equals the DECISIONS date (hook 10) |
| P-613 | B | SCR | items.py holds non-urgent asks to 09:00 or 21:00 IST (hook 11); the feeding-Lead part is trimmed (P-622) |
| P-614 | B | SCR + CI | target date reconciled (hook 10); "no gate lowered": gate files are .github/ paths, so lead-read-guard covers their label |
| P-557 | A | STOP + pre-push + ACT | push-before-stop in lane copies (hook 4); pr-open-guard.sh (pre-push) and branch-sweep.sh (lead-watch) already wired: name them in the cell |
| P-348c | A | CI | a Works row in CAPABILITIES names its gate-A walk file (hook 10) |
| P-442 | A | CI | gate-b.mjs: no PDF, no Validate hold |
| P-405 | A | CI | gate-b.mjs: WAIT, HELD, no pack or fixture-only is Not tested |
| P-439 | A | permissions | deny `gh workflow run` outside the Lead copy (settings line, hook 5's family); comment-run.yml stays the door |
| P-526b | A | PTU + CI | hook 7 |
| P-526c | A | ACT | a records PR open over 24 h (hook 11) |
| P-337 | B | STOP (flag) | lane turn after its PR is labelled is flagged (hook 4); a warm lane taking one known row is the Lead's call |
| P-438b | A | PTU + CI | hook 7 with m2-hot-files.txt; check-docs: one named holder in STATE |
| P-270 | A | CI | label-guard counts main merges; the third puts it next (hook 9) |
| P-277 | B | CI | rounds counted, round 3 needs "Lead: round 3" (hook 9); diff-only reading is the reviewer's |
| P-352 | A | CI | brief-check: a new-screen concept has a best-in-class section and a walk file (hook 8) |
| P-319 | A | CI | grep guard on engine code (hook 8) |
| QA-221 | C | qa verdict | who fills a form and what it asks is read from the form's own words by qa; a citation lint (L) later |
| P-335 | A | CI | tenant fields outside PF-* and FO-* fail (hook 8) |
| P-251 | A | PTU | lane-preflight.sh refuses a brief naming a held row (hook 13) |
| P-434b | B | PTU | one row per qa brief (hook 13); "packs on GitHub's machines" is held by the workflow |
| P-478 | A | STOP | hook 3: "Needs you" first, then "Decide when you can"; any spend shows US$ |
| P-486 | B | CI | money, permissions or security PR needs a founder-yes line linked to a DECISIONS row (hook 9); what is "a day or more" is judgment |
| P-486b | A | PTU | brief carries the context-limit line (hook 13); "not over Remote Control" is a platform limit |
| P-423 | A | PTU + CI | #1865 lead-read-guard.sh, once wired; whether the read was real is the weekly audit's |
| P-294 | B | CI | decision-impact "settled by" (hook 10); the ruling is the Lead's |
| P-390 | A | PTU | hook 6: one question, one "(Recommended)" option |
| P-254 | A | CI | decision rows state time, cost, quality (hook 10) |
| P-170 | B | CI (L) + audit | every immigration value in seed and config carries a citation or "Sample" (later, several PRs); a citation's truth is qa's and the audit's |
| P-338 | A | STOP | hook 3: next three with IST times, on time or late |
| P-286 | A | ACT | fewer than two idle standbys (hook 11) |
| P-388 | A | STOP + PTU + SCR | #1865 lead-act-check.sh (check over 40 min); hook 6 (no card while away); handover.sh refuses while a subagent runs (hook 14) |
| F-7Nov | A | SCR | guard-test-lib.sh and run-suites.sh refuse in the main copy (hook 15) |
| P-363 | B | SCR | gh.sh is the helper; a hook would only re-route, so it stays a helper |
| P-302 | A | PTU + STOP | #1865 ist-time-guard.py (STATE, DECISIONS); hook 16 extends it to the Lead's messages as a flag |
| P-371 | A | permissions + PTU | deny `gh run cancel*`; a curl hook for the API cancel path (hook 5) |
| P-616 | A | CI | gate-b.mjs accepts an API walk for a capability with no screen |
| P-619 | A | meta | B193 parts; this plan sequences the rest |
| P-620 | — | retired by P-633 | the start-of-session Gmail check is dropped; #1865's gmail-start-check.sh line stays out |
| P-621 | A | CI | no provider SDK imported outside adapter folders (hook 8) |
| P-622 | B | PTU | #1865 wip-guard.py (finish first); hot-file split is B194; "fewer Leads" is the founder's |
| P-623 | B | PTU | wip-guard.py (2 waiting or 24 h); qa queue order is the release Lead's |
| P-624 | C | stays prose | product and vendor ruling; B195 proves it once |
| P-625 | C | stays prose | infrastructure ruling; read when staging is built |
| P-626 | B | PTU (flag) | lane-preflight flags a builder brief whose row is not on the P-626 list (hook 13); the list itself is the Lead's |
| P-627 | C | reviewer checklist | product answers; briefs and reviews cite them |
| P-628 | B | ACT | Lead rulings tagged "Lead ruling (P-628)"; lead-watch counts ones the founder has not reviewed (hook 11) |
| P-629 | C | qa verdict | product ruling, tested by qa on PF-13 |
| P-630 | B | CI | with P-553 (hook 8); the adopt choice is the Lead's |
| P-446 | A | ACT | context at start read + 200k from saved get_usage (hook 11) |
| P-446f | A | ACT | B197 app view context per session |
| P-440c | A | PTU-out | tool output over 20 KB flagged in the Lead copy (hook 16) |
| P-440d | A | ACT | two readings over 3%/h (hook 11) |
| P-445b | A | ACT | B198 required-tools also lists connected tools not needed |
| P-377 | B | SCR | p2/ledger.ts refuses a fixture-only paid run; "from a Terminal tab" is held by hook 5's live-switch guard |
| P-461 | A | ACT | weekly meter 98% is a Needs you line (hook 11) |
| P-458 | A | SS | account change since the last start prints the resume steps (hook 2) |
| P-312 | B | CI + audit | process-change rows carry "Test after:" (hook 10); whether it was measured is the audit's |
| P-631 | A | CI | B196 (pr-size.sh) |
| P-632 | A | ACT + STOP | B198 |
| P-633 | C | stays prose | Gmail on demand; B198 marks it so |

Also judgment-only by nature, already outside the prose list but worth naming for the audit layer: P-303's review depth, P-339's "fresh reader's verdict", P-348c's walk quality.

## 3. The hook set to build

### 3.0 Hard design rules (founder, ~10:2x IST 16 Nov: "It should not slow down us ... my first priority is quality and speed")
1. **Under about 1 second per tool call on the common path.** A PreToolUse hook on Bash uses an `if` filter so it runs only for the command it guards. (**Unsure:** whether Claude Code skips spawning the process when `if` does not match; the docs say a hook with `if` runs only on tool events. Measure it, section 4.3.)
2. **No network call unless the command is one the hook guards.** GitHub reads are cached in `$TMPDIR` for 5 minutes, keyed by PR and head.
3. **GitHub unreadable → let it through with a visible warning, never a silent pass.** The one exception is the merge path for an irreversible action (a label on money, schema or permissions, #1865's lead-read-guard): the label waits, the warning says why.
4. **Block only on a real break.** Every block names the rule, the fix and the one-line override when one exists.
5. **Never wait on a prompt (P-388).** No hook uses `ask`. A Stop hook blocks a turn at most once per cause, then only flags, so nobody is stuck overnight.
6. **Prefer CI or an ACT line over a blocking hook** unless the action cannot be undone (a push to a public repo, a paid call, a cancelled run, a label that starts a merge, a session start).
7. **Every hook has a test that fails with the hook off** (`check-guards.sh --mutate`), and a "wired" test (hook 1).

### 3.1 What already exists or is being built (no duplicates)
| Already | Event | Covers |
|---|---|---|
| session-start.sh | SessionStart | copy, command, state, pull, hooks path |
| merge-guard.sh | PTU Bash `if` gh pr merge, close, review | P-87, P-384, P-402 |
| lane-preflight.sh --hook | PTU start_session, create_session | P-348e, P-462, P-605, P-608, P-606 (brief) |
| agent-model-guard.sh --hook | PTU Agent, Task | P-303, P-608 |
| lead-check-guard.sh | PTU CronCreate | F-6Nov |
| stop-check.sh | Stop | P-314, P-387 (part), rules files |
| prompt-log.sh | UserPromptSubmit | founder messages logged (never blocks) |
| .githooks/pre-push | git | push-guard.sh, pr-open-guard.sh, no push to main |
| #1865 queued-push-guard.sh | PTU Bash git push + GitHub MCP writes | B193 part 2 (a), P-619 step 3 |
| #1865 lead-read-guard.sh | PTU label writes + CI `--pr` | P-423 |
| #1865 lead-act-check.sh | Stop (Lead copy) | P-388 (check over 40 min), P-619 (board over 45 min) |
| #1865 wip-guard.py | PTU start_session | P-622 (1), P-623 (1) |
| #1865 ist-time-guard.py | PTU Edit, MultiEdit, Write | P-302 (STATE, DECISIONS) |
| #1865 gmail-start-check.sh | Stop | **left out by P-633** |
| B196 | CI | P-631 |
| B197 | script + ACT + Stop line in lead-check-guard.sh | the app view every check (A110) |
| B198 | ACT + Stop via lead-act-check.sh | P-632 required tools |
| B193 parts 3, 4, 7, 8; B194 | CI, script | PR norms, WIP, stall records, founder-ask tracking, queue |

### 3.2 New hooks and checks
Priority: **1** = broken in the records 13-16 Nov or today, or an irreversible action; **2** = checkable, no break recorded; **3** = low value or large. Breaks are from the triage page's section 3 and the records named.

| # | Hook or check | Event · matcher (`if`) | Blocks or only flags | Rules | Runs where | Time added per call | False-positive risk · bypass it cannot stop | Effort | Priority (evidence) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Wired-guards check** and the guard status line | CI (check-docs.sh) + SessionStart line | CI fails; SessionStart flags "guards active n of m; not wired: …" | P-611a, all `hook:` cells | CI; every session | 0 per call; ~50 ms once at start | Low · a founder who chooses not to paste a line (shown, not hidden) | S | **1** (G-4's guards and #1865 built, not wired) |
| 2 | **Lead start check** | SessionStart (Lead copy) prints the start list; Stop blocks once at the first turn end if the transcript has no Read of RULES.md and of the newer DECISIONS rows | Blocks once, then flags | lead skill steps 1-5, P-440b, P-458, P-286, P-348e | Lead copy (lane.sh whoami = lead) | ~0.3 s once at start (one cached `gh run list` for nightly); Stop ~50 ms local grep | Medium: a Lead that read the rows another way (fix: accept `sed`/`cat` of the files too) · cannot prove the rows were understood | S | **1** (founder 16 Nov: start checks skipped; Leads 45, 60 over context) |
| 3 | **Check-turn contract** (extends #1865 lead-act-check.sh; one file with B197 (4) and B198 (3)) | Stop, Lead copy, only on turns whose prompt is `run lead-watch; read STATE Start here` | Blocks once per turn, then flags | P-591, P-339b, P-326, P-478, P-503, P-338, P-440d, P-302 (in the report) | Lead copy | ~100 ms (local files: lead-watch stamp, board `taken_at`, app-view file, connectors file, `last_assistant_message`) | Medium: report wording ("Needs you" spelled another way); accept both emoji and words · cannot judge whether ACT lines were acted on well | M | **1** (A110 "multiple times"; board stale; 17 guessed times) |
| 4 | **Push before stop** (extends stop-check.sh) | Stop, lane copies | Cloud lanes: blocks once when commits are unpushed or tracked files changed; Mac: flags. Flags a turn that starts new work after its PR was labelled | P-557, AGENTS rule 10, P-337 | Every lane copy, cloud too | ~80 ms (`git status`, `git rev-list @{u}..`) | Low · a lane that commits nothing for hours (lead-watch's 90-min rule still catches it) | S | **1** (15 Nov: cloud lanes slept unpushed; P-557 hard rule) |
| 5 | **Irreversible-action guard**: run cancel, `--no-verify`, hand-typed live switch | Deny rules: `Bash(gh run cancel*)`, `Bash(git push*--no-verify*)`, `Bash(git -c core.hooksPath*)`, `Bash(gh workflow run*)` outside the Lead (via merge-guard style check); PTU Bash `if` `Bash(curl *)` for `/cancel` and `/dispatches`; PTU Bash `if` `Bash(*_LIVE=approved*)` | Blocks | P-371, P-439, P-175, P-175b, P-377, P-87 | Every copy, cloud too | 0 for deny rules; ~30 ms for the two `if` hooks, only on curl or the live string | Low · a script file that sets the variable inside it (CI's check-write-token and the ledger still hold) | S | **1** (2 Nov all CI runs cancelled; 15 Nov nightly cancelled; US$0.27 29 Oct, US$0.17 30 Oct) |
| 6 | **Question-card guard** | PTU `AskUserQuestion` (Lead copy) | Blocks: more than one question, no "(Recommended)" option, or the founder's last typed prompt over 10 min old (stamp from prompt-log.sh; cron prompts do not count) | P-388, P-390, P-508, P-512 | Lead copy | ~30 ms, local | Medium: telling a founder turn from a cron turn (UserPromptSubmit also fires on turns Claude starts, per the docs; match the cron prompt text) · a question asked in plain text | S | **1** (Lead 24 stalled ~7.4 h on one prompt, 7 Nov; qa idle 3 h, 8 Nov) |
| 7 | **Touch-list overlap** | PTU start_session (inside lane-preflight.sh) + pr-rules CI | Hot file (m2-hot-files.txt, schema, case-prepare.ts) in two lanes: blocks the start; other overlaps: flag | P-576, P-526b, P-438b | Lead copy (where starts happen); CI everywhere | Start: ~0.5 s (one cached open-PR files read); 0 per normal call | Medium: a brief with no touch list (brief-check already asks for one) · a lane that edits files outside its list (CI flags it on the PR) | M | **1** (4 approved PRs stuck on conflicts, 15-16 Nov) |
| 8 | **PR norms content for B193 part 3** and **pr-rules required in the queue** | CI pr-rules steps; `.mergify.yml` `check-success = pr-rules` | CI fails the PR | P-553, P-587, P-630, P-470, P-464, P-600, P-319, P-335, P-621, P-473, P-542, P-352 | CI (also covers Codex and Devin, which run no Claude hooks) | 0 per call; ~20 s per PR run | Medium for greps (engine words in comments); allow-list file per grep · a check that is not required (fixed by the MQ line) | M (2-3 PRs) | **1** for the required line (pr-rules is advisory today); 2 for the greps |
| 9 | **Label-guard counts** | CI label-guard.sh | Fails the label | P-277, P-599, P-270, P-303 (breaker on money, schema, permissions, new screen), P-486, P-502 (Root cause: line), P-558 | CI | 0 per call | Low · a careless "Root cause:" line (audit samples it) | M | **1** (#1758 round 4, #1760, #1753, #1777 round 3) |
| 10 | **Records checks** | CI check-docs.sh, decision-impact.sh, cockpit scripts | CI fails (records PRs only; never a product PR, P-547) | IDX-1/2/4/5, P-254, F-12Nov, P-294, P-566, P-312, P-589, P-551, P-582, P-595, P-348c, P-592, P-611c, P-609, P-614, P-547 | CI | 0 per call | Low · true but empty fields ("Time: none") | S (2 PRs) | 2 |
| 11 | **lead-watch ACT lines** | SCR lead-watch.sh (flags only) | Flags | P-418, P-514, P-530, P-526c, P-286, P-599, P-461, P-440d, P-446, P-583 (weekly), P-628, P-613 | Lead copy, each check | 0 per call; ~1-2 s per check | Low · a Lead that ignores ACT lines (hook 3 blocks that turn once) | M (2 PRs) | 1 for P-446 (2 breaks), P-599; 2 for the rest |
| 12 | **Team-app term scanner** | pre-push (push-guard.sh) + CI over base..head | Blocks the push; CI fails | P-504, P-505, P-539 | Every copy with the hooks path; CI | ~0.2 s per push | Medium: common words; terms kept as hashes of whole tokens · a term not on the list (the classifier and the reviewer remain) | M | **1** (public repository: a leak cannot be undone) |
| 13 | **Brief content at start** (inside lane-preflight.sh) | PTU start_session | Blocks: held row (P-251), desk not on Fable 5.2 high (P-597), more than one qa row (P-434b), no context line (P-486b); flags a row not on P-626's list | P-251, P-597, P-434b, P-486b, P-626 | Lead copy | ~50 ms, local | Low · a brief that names the row in other words | S | 2 |
| 14 | **No hand-over with a subagent running** | SCR handover.sh reads the transcript for Agent calls with no result | Blocks the hand-over script | P-388 (2), P-409 | Lead copy | 0 per call | Medium: background agents finished outside the transcript (**Unsure** how they appear) · a hand-over done by hand without the script | S | 2 |
| 15 | **No suites in the main copy** | SCR guard-test-lib.sh, run-suites.sh | Blocks the script | F-7Nov | Every copy | ~10 ms | Low · a suite run by hand with node | S | 2 (7 Nov incident: a test's git script ran in the real repo) |
| 16 | **Lead message hygiene** | PostToolUse (output over 20 KB) and Stop (times in `last_assistant_message` ahead of the IST clock; reuse ist-time-guard.py) | Flags only (additionalContext) | P-440c, P-302 | Lead copy | ~20 ms per call (size of the tool response only) | Medium: plan times read as stamps (reuse #1865's plan words) · none: it only flags | S | 1 for P-302 (17 breaks, the top of the queue) |
| 17 | **Requirement-read guard** | PTU Read, Grep, Glob, and Bash `if` `Bash(*sources/*)` / `Bash(*requirements-*)` | Blocks in builder and qa copies; trace-requirements.py --brief is the door | P-604 | Lane copies, cloud too | ~20 ms on those tools | Low · a path built from variables | S | 2 |
| 18 | **Weekly judgment audit** (not a hook) | Fresh Opus reader, read-only, weekly (with the CTO review) | Report and BACKLOG rows | P-502, F-12Nov, P-423 (read was real), P-303 (review depth), P-170, P-312, P-628 | Lead starts it in a founder-typed turn | none | n/a · samples, not every case | S per week | 1 (the only control for C rules) |

**Cloud versus Mac.** `.claude/settings.json` is in the repository, so cloud sessions get its hooks and deny rules. They do not read the Mac's `~/.claude/settings.json` (docs: "Cloud sessions don't read your local `~/.claude/settings.json`"); a `settings.local.json` is not in the repository, so it never reaches a cloud session either. `CLAUDE_CODE_REMOTE=true` marks a cloud machine; `lane.sh whoami` already uses it, so "Lead copy only" hooks are never active in the cloud. **Unsure:** whether cloud sessions honour `onFailure: "block"` on the same Claude Code version; hook 1's status line shows what ran, and a canary lane proves it (section 4).

**What no hook can stop.** Edits made through Bash (`sed`, heredocs) dodge Edit and Write hooks (the docs say so; stop-check.sh's turn-end scan and CI cover it). Codex, Devin or a person push without Claude hooks: only CI, Mergify and the pre-push hook (where the hooks path is set) hold for them. An `if` filter can miss an odd command shape (`env X=… bash -c`); merge-guard.sh already re-checks the command itself, and the others must too. A hook cannot judge quality: section 2's C rules go to the audit.

## 4. Rollout
### 4.1 Order, in small PRs (each one backlog row, each under 800 changed lines)
| Step | PR (one row) | Waits on | Founder does | Proof it works |
|---|---|---|---|---|
| 0 | none: switch on #1865 | #1865 merged | Paste five settings lines from #1865's body (queued-push, lead-read, lead-act, wip, ist-time; **not** gmail, P-633) and the deny lines of hook 5 | `check-guards.sh --mutate` red for each with the line removed; one test push to a `queued` PR refused in a scratch clone |
| 1 | Hook 1 (wired check, status line) and the timing wrapper (4.3) | step 0 | nothing | test: a register cell naming an unwired hook fails check-docs; mutation removes the check and the test goes red |
| 2 | Hook 5's two `if` hooks (curl cancel and dispatch, live switch) | step 1 | paste two lines | tests: each refused shape and two allowed look-alikes; mutation |
| 3 | Hook 4 (push before stop) | step 1 | none (extends stop-check.sh, already wired) | test in a scratch clone: unpushed commit blocks once, second stop passes; one cloud canary lane |
| 4 | Hook 2 (Lead start check) | step 1 | paste one Stop line | test with a fake transcript with and without the RULES read |
| 5 | Hook 3 (check-turn contract) | B197, B198 merged (same file) | none if inside lead-act-check.sh | test: a stale board, a missing app view, a report with no "Needs you" each block once; a good turn passes |
| 6 | Hook 6 (question card) | step 1 | paste one PTU line | test: two questions refused; one with "(Recommended)" passes; a 15-min-old founder stamp refused |
| 7 | Hook 7 (touch list) | B194 hot-file split | none (inside lane-preflight.sh) | test: overlapping hot file refused, other overlap flagged |
| 8 | Hook 8 part a (dependency, PATCHES.md, migration stamp) = B193 part 3 | — | none | each step: a fixture PR that breaks it fails, the fixed one passes |
| 9 | Hook 8 part b (engine, tenant, provider, motion greps) | step 8 | none | as step 8 |
| 10 | `.mergify.yml`: `check-success = pr-rules` | steps 8-9 green for 2 days, no false fails | none (Lead reads the diff, P-423) | check-queue-rules.py case: a PR with red pr-rules does not queue |
| 11 | Hook 9 (label-guard counts) | — | none | check-label-guard.sh cases: round 3 without the Lead line refused |
| 12 | Hook 10 (records checks), two PRs | — | none | check-docs fixtures per field |
| 13 | Hook 11 (ACT lines), two PRs | B197 (context data) | none | fake data per ACT line |
| 14 | Hook 12 (term scanner) | — | none | fixture diff with a hashed term refused; mutation |
| 15 | Hooks 13-17, one PR each | step 1 | paste lines for 16, 17 | as above |
| later | prune-copies.sh (P-468), citation lint (P-170, L), forms lint (QA-221, L) | — | none | as above |

Each new guard joins `check-guards.sh`'s TESTS and MUT lists, so `guards.yml` proves on every PR that its test fails with the guard off. Tests run only in a scratch clone (F-7Nov).

### 4.2 What the founder must do
Only settings lines: the sandbox refuses writes to `.claude/settings.json` (P-387), so each PR body gives the exact JSON block, and the Lead walks him through pasting it in a typed turn. About eight short pastes over the rollout. Nothing to buy, no new accounts, US$0.

### 4.3 How we measure the slowdown after rollout
* **Hook time:** every hook runs through a small wrapper (`hook-time.sh`) that appends event, script, milliseconds and decision (pass, flag, block) to `$TMPDIR/hook-times.tsv`. lead-watch prints, once a day, p50 and p95 per hook and the block count.
* **Limits:** a hook with p95 over 1 second on the common path, or one confirmed false block, is switched to flag-only in that check and gets a fix row.
* **Pipeline speed:** the compass numbers before and after, same measures (P-500): approved-to-merged median (baseline 61 min, p90 157, n = 221, 22:38 IST 15 Nov, B194), batch failures (22% of 111), app-code PRs merged a day, qa verdicts a day (P-623). Compared after 3 days and 7 days (P-312: a fixed period, kept or undone).
* **False blocks:** every block is logged with its reason; the Lead reads all blocks at the daily measures and the weekly audit samples five.

## 5. What stays prose, and the risks of over-enforcing
**Stays prose (the 9 C rules and the judgment halves of the 28 B rules):** product and vendor rulings (P-624, P-625, P-627, P-629, P-633, and the IDX rows' contents), roles and who decides (P-384's "product direction only", P-486's judgment, P-628's choice), quality and style (P-473's calm style, P-502's real root cause, F-12Nov's value), and actions only the founder can take (P-580 passwords, P-583 clicks, P-551 accounts). A hook here would check words, not substance, and teach agents to write the words.

**Risks and how the plan limits them:**
| Risk | Limit |
|---|---|
| Slowing the pipeline | Section 3.0's 1-second rule, `if` filters, cached reads, measured daily (4.3) |
| A false block overnight with nobody to unblock (P-388) | Only irreversible actions block; Stop hooks block once per cause then flag; no `ask`; every block names its fix |
| A Stop hook loop | Block once per cause per turn (stamp file), as lead-act-check.sh already does. **Unsure:** whether the Stop input carries `stop_hook_active` in this version (not in the part of the docs read); the stamp makes it irrelevant |
| A hook timing out and stopping all Bash | `onFailure: "block"` only on irreversible-action hooks; others fail open with a visible warning |
| Box-ticking (writing "Lead read the diff" without reading) | The weekly audit samples these lines against the diffs |
| Hook output filling the Lead's context | Hooks print at most three lines; flags go to lead-watch, not every reply |
| Rules that never break get a hook anyway | Priority 2 items wait until priority 1 is live and measured |
| Agents outside Claude Code (Codex, Devin, people) | CI and Mergify repeat every check that matters |

## 6. Keeping the board's reds green: owners, targets and the hook (founder, 10:1x IST 16 Nov)
The founder asked: "is there any hook to keep checking the data of the board and assign the dedicated resources for the problems, who can keep the reds green as per our set standards?" Today the board's Health strip already computes seven items (`tools/cockpit-data.py` `health()`), and each red already carries an `action` and an `owner` field, but the owner is filled only for board data age ("current Lead"). Nothing turns an old red into work, and nothing stops a check from ending with a red nobody owns.

### 6.1 Each Health item: owner role and time to green
"Red when" is the rule `cockpit-data.py` already uses; the owner and the target are proposed here (the targets reuse existing rules where one exists).

| # | Health item | Red when (cockpit-data.py) | Owner role | First move | Time to green |
|---|---|---|---|---|---|
| 1 | Main CI | a check or the nightly failed on main's head | **Release Lead** (P-558 holds release) | re-run the failed part alone (P-371); flaky → quarantine (P-205); real → a fix row ahead of the queue (P-214) | fix PR open in 60 min; green in 4 h |
| 2 | Board data age | over 2 h (amber at 45 min) | **Current Lead** (already the owner) | refresh and republish at this check (hook 3 enforces it) | this check (under 30 min) |
| 3 | Records on main | the Lead's branch has records main lacks for over 24 h | **Current Lead** | open the records PR; `records` queue (P-336) | 4 h |
| 4 | Guards | a guard run failed | **Tooling owner: the current Lead, done by a tooling lane** | read the failed guard test; fix row under P-214 (merges ahead on green) | fix PR in 2 h; green in 4 h |
| 5 | Burn | over 3% of the weekly plan per hour (P-440) | **Current Lead** | end idle sessions, hand over any session over 250k (P-440d) | under 3%/h by the next check |
| 6 | Major bugs on Works capabilities | an open Major on a Works capability older than 48 h | **The module group's Lead** (release Lead: case side, money, audit; Lead B: platform, front office, P-558), who assigns a builder | a fix row jumps the queue (lead skill: Blocker or Major); qa re-scores (P-305) | builder assigned in 1 check; fix merged in 24 h; qa verdict in 48 h |
| 7 | Data trust, item age, org chart, freshness | reconciliation disagrees or an invariant fails (P-596) | **Board owner: the current Lead, done by the board session** | read cockpit-reconcile.py's reason; fix the feed, never the number | 2 h |

The owner and the target go into `cockpit-data.py`'s `item()` calls as data (one small PR), so the board shows them on tap and lead-watch reads the same values. One source, no second list.

### 6.2 The checks
| Check | Layer | Blocks or only flags | Time added | Detail |
|---|---|---|---|---|
| **Red older than one check** | lead-watch.sh ACT line (new step, reads the newest `cockpit/history.jsonl` entry and the one before) | Flags | ~0.2 s per check (local file) | `ACT health <item> red since <IST time> (> 1 check): owner <role>, target <time>, first move <…>` |
| **Red past its time-to-green** | the same step | Flags as **🔴 Needs you** only when the owner is the founder's decision (none of the seven are) or the target passed twice | 0 | the second miss goes into the report's "Needs you" line, with the cause |
| **A check turn that leaves a red unassigned** | Stop hook: part of hook 3 (the check-turn contract inside lead-act-check.sh) | Blocks once, then flags (section 3.0 rule 5) | ~50 ms | "assigned" = an `items.py` item (P-611b) naming the red, its owner session and a due time; the Stop hook reads `state/items.json` and the board's red ids. No item → the turn's end is blocked once with the line to add |

Rules covered: P-591 (board refreshed and acted on), P-596, P-305, P-336, P-371, P-440, P-611b, P-619 (board-stale alarm). Tests: a fake history with a red in two entries gives the ACT line; one entry does not; a check turn with a red and no item is blocked once, then passes on the second stop; with the item it passes at once. Mutation: remove the step, the test goes red. Fits rollout step 5 (same file as hook 3, after B197 and B198), plus one S-sized PR for the owner fields.

### 6.3 A standing "health keeper" lane, or the owners above?
| Option | What it is | Cost | For | Against |
|---|---|---|---|---|
| **Owners above (recommended now)** | each red goes to an existing role; the Lead assigns at the check; a fresh session only when a fix is needed | ~0 extra tokens when green; a fix session only for real reds | no idle lane; the right expert gets each red (module Lead for bugs, release Lead for main CI) | depends on the Lead acting: which the ACT line and the Stop hook now force |
| Standing health-keeper lane | one cloud session, Opus medium, wakes every 30 min, reads the board, fixes tooling and data reds itself, hands product reds to the module Lead | about 48 wake-ups a day; at ~20-40k tokens each (start read plus board read) about 1-2M tokens a day, a few per cent of the weekly plan a day (**estimate**, not measured; measure on day 1) | someone always on the reds; frees the Lead | duplicates the Lead's 30-minute check (P-622 "fewer Leads"); cloud lanes idle-sleep and are not woken by messages (records, 2 Nov); it cannot start sessions; product reds still need the module Lead |

**Recommendation:** owners above, enforced by the ACT line and the Stop hook. Start a health-keeper lane **only if** a red stays past its time-to-green twice in one week with the hooks live (measured from `history.jsonl`); then run it on demand (started at the first red past target), not standing, so it costs nothing on green days.

## 7. Questions for the founder (preferences only)
1. **Overnight, should a hook block or only flag?** Recommended: block only actions that cannot be undone (public push, paid call, run cancel, a merge-path label, a session start); everything else flags as an ACT line.
2. **Settings lines: paste per PR, or one batch a day?** Recommended: one batch at your first typed turn each day, so you are asked once.
3. **Make `pr-rules` a required check for the merge queue?** Recommended: yes, after two days of it running with no false fails.
4. **The Lead's check turn: block its end once when a step is missed, or only show a red line?** Recommended: block once, then only flag (never twice), so a missed board refresh or lane read is fixed in the same check without any risk of a stall.
