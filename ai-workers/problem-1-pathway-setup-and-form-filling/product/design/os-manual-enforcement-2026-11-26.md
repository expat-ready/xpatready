# OS rows not live, as of os-backlog.md (hand-over 25 Nov ~14:3x IST, rows edited to 25 Nov evening) and RULES.md as of P-842

Age: every row first appears 25 Nov (backlog created that day) unless stated. "Doing" PRs listed as waiting on the Lead's read and label may have merged since; re-check with `gh pr view <n>`.
Not live = anything except Done (OS-10, OS-25, OS-48, OS-52, OS-S1) and Retired (none). OS-73 is Done but still needs its later part (clean 24 h / 10 runs, then required).

## Tier 1
| OS id | Enforces | Status now | Age | Manual action each check | Pri |
|---|---|---|---|---|---|
| OS-01 | pr-suites green on head before label/queue | "Doing (OS-3)" | 25 Nov | Before adding `review: approved`, run `gh pr checks <n>`; refuse label if pr-suites red or missing | P1 |
| OS-02 | Auto-label migration/money/route PRs after Approve + green ci | "Open (after OS-01)" | 25 Nov | Label those PRs yourself within 1 h of fresh `Reviewer: Approve <40-char sha>` plus green ci; read money PRs | P1 |
| OS-03 | Pipeline queue goes before product batches (.mergify.yml) | "Doing (OS-1)" | 25 Nov | `gh pr list --label` / Mergify queue view: check pipeline PRs sit ahead of product PRs | P2 |
| OS-04 | Cloud setup error stops session start | "Doing (#3623)" | 25 Nov | Land #3623; until then open each new cloud lane's first output and check setup exit code | P2 |
| OS-05 | Bot writes "Batch failures covered" line, auto-requeue | "Blocked (P-731 ruling owed)" | 25 Nov | After a dequeue, check full run on head green, comment the covered line naming each failed part, then label | P1 |
| OS-06 | Dispatch full run when a PR asks | "Doing (#3671 waits on Lead's label)" | 25 Nov | Scan open PRs for "Question for the tech lead"; post `/run full` once per ask | P2 |
| OS-07 | Walks after a merged qa PR | "Open" | 25 Nov | After each qa merge, dispatch walks.yml (`gh workflow run walks.yml`) for the R1 items it names | P2 |
| OS-08 | Quarantine suites that pass only on retry | "Blocked (founder ruling, card 8c)" | 25 Nov | Run `retry-watch.py` each check; list suites with 2 retry-only passes in the check report | P3 |
| OS-09 | ENF-778a (queue-gate, after OS-02; row text is bare) | "Open (after OS-02)" | 25 Nov | Read OS-3's brief for scope; no action until OS-02 lands | P3 |
| OS-11 | Lead runs main's tools, not branch copies | "Doing (#3506 waits on Lead's read and label)" | 25 Nov | Run `git fetch && git rev-parse origin/main` vs tools sha; run lead-watch from a main checkout | P1 |
| OS-13 | Graduate 8 report-only checks to blocking | "Open" | 25 Nov | Weekly: list false blocks per warn-only check from `gh run list`; decide graduate or retire | P2 |
| OS-49 | Merge wakes next waiting lane | "Doing (#3674 labelled and queued)" | 25 Nov | After each merge, read merge-wake.py ACT (lead-watch 4b) and send the printed message | P2 |
| OS-50 | Mergify priority for near-Proven PRs | "Open (after OS-03)" | 25 Nov | Hand-order the queue: `gh pr list` near-Proven first, requeue manually | P2 |
| OS-51 | Fix flaky suites and nightly reds | "Open" | 25 Nov (full-power #146, 20 Nov) | Run `retry-watch.py`; assign each flaky suite to its area builder lane | P2 |
| OS-71 | Staging deploy auto after secret change | "Blocked (PF-8c not built)" | 25 Nov | Count Lead deploy steps per day; run deploy by hand after each secret change | P3 |
| OS-72 | Project verify skill before each app-code commit | "Open (phase 1, from 27 Nov 12:00 IST)" | 25 Nov | Ask the trial lane for verify evidence in the PR; check `gh pr view` body | P2 |
| OS-73 | LCP/CLS budgets in packs | "Done (#3729)... OS-73b minors open" | 25 Nov | Read VITALS lines in pack output; count clean runs toward 24 h / 10 runs | P3 |
| OS-S1b | push-guard minors from #3728 | "Open (after OS-S1 merges)" | 25 Nov | None needed; watch for push-guard false blocks in lane reports | P3 |
| OS-77b | All-routes sign-in sweep | "Open" | 25 Nov | Ask qa to run `check_r16_deny_sweep.ts` and grep writes lacking actorOf/need | P2 |
| OS-78 (a) | Comment-triggered workflows skip comments without their words | "Open (after OS-77b)" | 25 Nov | Batch Lead comments; `gh run list --workflow queue-gate.yml` to watch comment-run spikes | P1 |
| OS-78 (b) | check-isolated-ttl self-stop waits on completion, not 20 s | "Doing (branch claude/determined-ritchie-v041bm)" | 25 Nov | On a red guards job, read annotations; rerun once with `gh run rerun --failed` before blaming PR | P2 |

## Tier 2
| OS id | Enforces | Status now | Age | Manual action | Pri |
|---|---|---|---|---|---|
| OS-79 | PF-31/32/33 always have a lane and board line | "Open (Tier 2, first)" | 25 Nov | Read qa/CAPABILITIES.md and board; confirm owner lane for each of PF-31, PF-32, PF-33 | P2 |
| OS-80 | "Release 1 not done: PF-33 not Works" line in reports | "Open (Tier 2, after OS-79)" | 25 Nov | Add the line by hand to each founder report while PF-33 is not Works | P2 |
| OS-14 | lead-watch prints only branches pushed in 7 days | "Blocked on OS-11" | 25 Nov | Run `branch-sweep.sh` from main's copy; ignore branches older than 7 days | P2 |
| OS-15 | Records PR in one script | "Doing (#3693, round-2 fixes wait on Lead)" | 25 Nov | Batch records hourly; run `check-docs.sh` before pushing; refresh RULES as-of line | P3 |
| OS-16 | Start read under 40k tokens (LEAD-START.md) | "Doing (#3696 Approve bc7c0eb55, waits on label)" | 25 Nov | Label #3696 after reading; check start read size with `wc -c` on listed files | P2 |
| OS-17 | Records PRs open over 24 h are an ACT | "Doing (#3699 waits on label)" | 25 Nov | `gh pr list --search "records in:title"` sorted by age; land any over 24 h | P2 |
| OS-18 | Red "Waiting on the founder" line re-sent as ACT | "Doing (#3703 Approve 28a4fa8b3, waits on label)" | 25 Nov | Check STATE top line; re-send push if 30 min passed | P2 |
| OS-18b | founder-wait.py follow-ups | "Open (after #3703 merges)" | 25 Nov | Same as OS-18; time the wait from the line's own time | P3 |
| OS-19 | Human-cancelled CI run is an ACT | "Open" | 25 Nov | `gh run list --status cancelled -L 20`, note any cancelled by a person | P3 |
| OS-20 | PR that merged main three times is an ACT | "Open" | 25 Nov | `gh pr view <n> --json commits`, count "Merge branch 'main'"; land it next | P3 |
| OS-21 | Two open PRs on one hot file is an ACT | "Open" | 25 Nov | `gh pr list --json files` grep schema.prisma / case-prepare.ts; sequence them | P2 |
| OS-22 | Red judged from `ci` only; failed gh call is an ACT | "Open" | 25 Nov | Use `gh pr checks` ci row only; re-run any gh call that errors | P2 |
| OS-23 | Burn watch over 3%/h twice in a row | "Open" | 25 Nov | `mcp get_usage` each check; note two consecutive checks above 3%/h | P2 |
| OS-24 | Hourly batch-failure, come-back, label-wait numbers | "Open (measure first)" | 25 Nov | Run `flow-constraint.py`; record the three numbers with sample | P2 |
| OS-26 | Hand-over at the context line (Stop hook) | "Open" | 25 Nov | Check own context at each check; write hand-over at P-446 line | P2 |
| OS-27 | Lane questions become queue items | "Open" | 25 Nov | Search open PRs for "Question for the tech lead"; add to items.json | P2 |
| OS-28 | WIP limits ACT for lanes outside the hook | "Open (confirm hook first)" | 25 Nov | `mcp list_sessions` count per group against limits | P3 |
| OS-29 | Test for stop-check unpushed-commit note | "Open" | 25 Nov | Run `git status -sb` in each lane copy for ahead counts | P3 |
| OS-68 | lead-watch reads sidebar, ACT per lane idle over 30 min | "Open" | 25 Nov | `mcp list_sessions`; expand "Show more"; nudge lanes idle over 30 min | P2 |
| OS-69 | Lane with merged PR over 1 h, not archived, is an ACT | "Open" | 25 Nov | Run `lane-cleanup.py`; archive lanes whose PRs merged over 1 h ago | P3 |
| OS-53 | Per-stage flow ACT (folded into OS-24) | "Open (with OS-24)" | 20 Nov (#189) | As OS-24 | P3 |
| OS-54 | Routines: turn cap, WIP brake, run log | "Open" | 20 Nov (#176) | `mcp scheduled-tasks list_task_runs`; check each routine's cap | P3 |
| OS-55 | Push alert at 85% plan, trim lanes after 22:00 | "Open (with OS-23)" | 20 Nov (#177) | At 85% weekly, push-notify founder and pause lanes over 4%/h | P2 |
| OS-56 | Anti-stall rest (away flag, heartbeat, etc.) | "Open (split into PRs)" | 20 Nov (#202) | Check last heartbeat/push time each check | P3 |

## Tier 3
| OS id | Enforces | Status now | Age | Manual action | Pri |
|---|---|---|---|---|---|
| OS-12 | pr-rules (800 lines, Duplicate check) required | "Open (precondition #163)" | 25 Nov | `gh pr diff --stat` size and Duplicate-check line per PR before label | P2 |
| OS-30 | Approve before PR leaves draft | "Open" | 25 Nov | Before undrafting, grep PR body for `Reviewer: Approve` | P2 |
| OS-70 | Brief carries "post through GitHub connector if gh refused" | "Open" | 25 Nov | Add the line to each new lane brief by hand | P3 |
| OS-31 | Builders never edit STATE/RULES/DECISIONS/BACKLOG | "Open" | 25 Nov | `gh pr diff --name-only` on non-lead branches for those files | P2 |
| OS-32 | No form number or program branch in engine code | "Open" | 25 Nov | `grep -rE "IMM[0-9]{4}" engine/` per PR | P2 |
| OS-33 | Live AI off by default | "Open" | 25 Nov | `grep -rn "STUDIO_.*_LIVE" ` default values per PR | P2 |
| OS-34 | `guards` required by path; orphan tests wired | "Open" | 20 Nov (#156) | Check `check-guards.sh` covers each new `check-*.sh` | P3 |
| OS-35 | check-docs fails on future time in STATE | "Open" | 20 Nov (#164) | Read STATE times against `date`; fix future times | P3 |
| OS-36 | Schema PRs additive, later stamp | "Open (check #3035 first)" | 25 Nov | Read each migration folder name and look for DROP before label | P2 |
| OS-37 | Every check prints rule id, reason, fix | "Open (last in tier)" | 20 Nov (#215) | None | P3 |
| OS-57 | pr-rules false failures (precondition of OS-12) | "Open (check main first)" | 20 Nov (#163) | Record each pr-rules false failure in the check report | P2 |
| OS-58 | One allow-list door for GitHub writes; workflow lint | "Open" | 20 Nov (#165) | Review `.claude/settings.json` deny lines monthly | P3 |
| OS-67 | Actions pinned by SHA; dependency audit | "Open (check main first)" | 20 Nov (#191) | Run `check-npm-audit-report.sh`; grep `uses:` for non-SHA | P3 |
| OS-59 | Migration stamp check (folded into OS-36) | "Open (with OS-36)" | 20 Nov (#167) | As OS-36 | P3 |
| OS-60 | Pre-push note for branch with commits and no PR | "Open (check main first)" | 20 Nov (#168) | `gh pr list --head <branch>` for every pushed lane branch | P2 |
| OS-61 | Board/measure scripts via GraphQL (speed) | "Open (later)" | 20 Nov (#170) | None | P3 |
| OS-62 | Edit-loop lint hook | "Open (time it first)" | 20 Nov (#214) | Builders run eslint before commit | P3 |
| OS-63 | Factory PRs tested; no PR changes its own judge | "Open (later)" | 20 Nov (#219) | Reject a PR that edits both a check and its judge | P2 |
| OS-64 | Read-only tokens for lanes and routines | "Open" | 20 Nov (#222) | Founder lists token scopes; `check-write-token.sh` | P3 |
| OS-65 | Remaining enforcement-plan rows | "Open (read each against main)" | 20 Nov (#187) | None | P3 |

## Tier 4 (Lead edits RULES, each needs the Lead's yes) and Tier 5
| OS id | Enforces | Status now | Age | Manual action | Pri |
|---|---|---|---|---|---|
| OS-40 to OS-47, OS-66 | Retire or re-word P-734, IDX-17/FULL_RUN_FROM, P-651, P-439, P-363, full-power plan, P-286, P-458/P-461; guard review | "Open" (each) | 25 Nov | Fold into the hourly records PR, one yes each | P3 |
| OS-74 | Visual compare against references | "Open (phase 2)" | 25 Nov | Qa eyeballs screenshots at 1024 and 1440 px per screen | P3 |
| OS-75 | Design-system check from computed styles | "Open (phase 3)" | 25 Nov | Qa walk against EXPERIENCE [M] lines | P3 |
| OS-76 | Mutation testing on engine/ | "Blocked: STANDARDS §1 gate entry" | 25 Nov | Add the §1 gate entry for Stryker | P3 |
| OS-77 (a) | First-time-user agent before milestone walk | "Open (phase 3)" | 25 Nov | Run a fresh-context agent walk before each milestone | P3 |

## (a) The five P1 rows, in order
1. OS-01: 18 of 33 real batch defects showed red on the PR first; refusing label on red pr-suites cuts failing batches.
2. OS-11: the Lead has run stale tools (2,900 commits behind), giving false jams; it also unblocks OS-14.
3. OS-02: 209 label holds waited for a Lead read; auto-label removes the wait (one PR #3035 waited 55 h).
4. OS-05: a third of batches fail; a PR waits for the Lead to type the covered line; ruling on P-731 owed.
5. OS-78 (comment workflows): about 20 runs in 30 min from Lead comments fed a 68-run CI jam.

## (b) RULES.md rules with no enforcer and no OS row (checkable ones; max 10)
P-582 (every left-out item is a BACKLOG X-row), P-604 (builders read only the brief output), P-542 (no product row waits on pipeline work), P-503 gap (P-478/P-338 report shape is OS-25, Done), P-505 (a PR that carried team-app detail never merges), P-504 (no team-app specifics in the public repo), P-473 (no motion library: grep-able), P-607 (trust never negative: product test), P-442 (prose, J), P-251 (prose, J). Also: P-839 and P-840 have OS rows (OS-79, OS-80) but are not yet rows in RULES.md, and P-827 is not a row there either. Most of these are marked J (judgement) under OS-48 "Done", so no row is owed unless the Lead moves one.

## (c) Duplicate, superseded or odd rows
- OS-78 is used twice (comment-triggered workflows; check-isolated-ttl). Rename the second.
- OS-53 folds into OS-24; OS-59 into OS-36; OS-55 pairs with OS-23.
- OS-77 (b) and OS-77b are the same item.
- OS-09 has no real "what" (only "ENF-778a"); OS-41 depends on it.
- OS-45 supersedes the full-power plan items; OS-65 is a catch-all.
- OS-14 is blocked behind OS-11; OS-12 behind OS-57; OS-50 behind OS-03.
- Backlog header says 156 rules as of P-826 while RULES.md is now as of P-842: appendix mapping is stale for P-827 to P-842.
- Several "Doing" statuses (#3728, #3729, #3732 are noted merged in the hand-over) may be stale; verify.
