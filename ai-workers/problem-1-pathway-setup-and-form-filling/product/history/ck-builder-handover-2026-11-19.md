# CK builder: hand-over, 19 Nov 2026 08:3x IST

**Why:** the tech lead (Lead 86, `local_bb67266d-be45-4ab8-9ba8-b4f3b4596ebe`) asked at 62% context (P-565, over the 50% replace line). A fresh session takes over from this file.

**Where the work lives:**
- **This file:** the shared notes folder (`side-session-notes/local_c3e4ea74-…/`), with a committed copy on branch `claude/ck-builder-handover-2026-11-19`.
- **Full log:** `ck-builder-notes.md` in the same folder.
- **Reports go to:** the current Lead (STATE.md `current_lead:`; Lead 86 now) and the founder's setup agent (`local_c3e4ea74-99af-4b49-a4a8-d4c6b6b916db`, only when something changes).
- **Board keeper:** `local_d01fe726-49e3-493f-8fd3-f2a8a83fe739`, told of heartbeat and card shape changes.

## The rules this lane works under
| Rule | What it means here |
|---|---|
| P-683 | Opus Approve on the branch first, then open the PR as ready for review |
| P-423 | the Lead reads every `.github`, `.mergify.yml`, tools and manifest diff, and labels |
| — | never self-label, never merge by hand, never cancel CI; commit and push every step (P-557) |
| P-716 | pipeline freeze until Release 1 Proven reaches 30 |
| P-717 | pipeline work through its own lane; P-715 the one exception |
| P-387 | **this copy cannot write `.claude/skills/`**, and no routing round it with git objects (Lead 84's ruling) |
| — | `RULES.md` and `DECISIONS.md` are the Lead's (P-314) |

## Open PRs (repo expat-ready/xpatready), as read at 08:30 IST
| PR | What | Head | State |
|---|---|---|---|
| #2176 | five scheduled workflows re-registered; label-guard and queue-gate can run by hand (workflow_dispatch) | `b36bef847dfa` | labelled, queued |
| #2195 | P-712 module-card row fragments (`<card>.rows/<ROW>.md`; frozen Tests./Tables./Entry points. lines; module-cards.py pr/tree) | `7b0169845e02` | labelled, queued (est. ~09:14 IST earlier) |
| #2200 | heartbeat honours the `parked` label with a dated `Parked:` note; manifest 1.3.0 | `8e7528f364e8` | labelled, queued (est. 10:20 IST) |
| #2207 | P-715 Mergify parallel mode, 7 scopes, a pipeline queue; manifest 1.4.0; **stacked on #2200** | `ab5cee879aec` | labelled, queued (est. 10:20 IST); Mergify "Configuration changed": valid |
| #2209 | label sweep keeps queue-gate's label (sweep step gets REVIEWERS; org-move bug) | `ffff28cdb491` | Approve posted; **waits on Lead 86's P-423 read and label** |

Change-log rows (setup notes `…/local_fa783599…/founder-setup/engineering-change-log-2026-11-17.md`):
- C25 is #2080, C27 is #2081, C28 is #2139.
- C30 (#2176) and C31 (#2195) are added, marked "(open)". Give them merge times when they merge.
- #2200, #2207 and #2209 have no rows yet: ask the Lead for the numbers when they merge.

## The P-715 48 h watch (starts when #2207 merges)
Send Lead 86 the first numbers at **+2 h**, then at +24 h and +48 h.

**What to measure:**
1. Batches per scope, read from the batch PRs `mergify/merge-queue/*`: their scope or queue, PR count, and ci result.
2. Red batches, per scope.
3. Approved-to-merged median and P95. The heartbeat's report lines already give the P95 queue wait and batch wait.
4. Red `ci` on main, which would be a cross-scope break. Watch above all the scope-less lane (web, unfenced api, tests, engine, unscoped schema).
5. Any scope stalled over 60 min.
6. Whether batch branches still start `mergify/merge-queue/`. Label-guard, the heartbeat and module-cards key on that prefix.
7. How the four named queues (verdicts > product > pipeline > records) behave; Mergify does not document this.

**Trip-wire:** `ci` red on main, or a scope stalled over 60 min, means propose `mode: serial` to the Lead **at once**. The undo is one line in `.mergify.yml` plus `"mode"` in the manifest.

## #2176's scheduled-run count
After #2176 merges, count scheduled runs per workflow for 1 hour: label-guard (every 10 min), queue-gate (7,37), pipeline-heartbeat (11,41), and nightly and xfa-engine at their daily times. Send the counts to the Lead.
- **If they are still missing:** a PR shifting each cron by one minute (`*/10` → `1-59/10`, `7,37` → `8,38`, `11,41` → `12,42`, and so on), with the same review and the Lead's read.
- **If that fails too:** the off-and-on commands go to the founder. They are on the agents' deny list.

**Brief's done-when:** "the scheduled heartbeat has one green run" is **not yet met**. Lead 84's manual run 44412400220 (22:31Z, 18 Nov) was green, but scheduled runs are still missing.

## The parked-label item (held, waits on the founder)
This session's permission checker refused creating the repository label `parked` and posting the six `Parked:` notes, as outgoing communication. The Leads won't post them for us. Exact texts:
- `parked-notes-2026-11-19.md` in the shared notes folder;
- PRs #2129, #2152, #2112, #2109, #2001, #2038, all resuming 2026-11-26, with Lead 85's owners;
- #2129's owner is Build Lead C, confirmed by Lead 85.

**Next:** the founder approves the step in a builder session, or posts them himself. The note must be posted by an owner, member or collaborator account, or #2200's heartbeat will not count it.

## Skill lines for the founder (one settings item, via the Lead)
`skill-lines-for-founder-2026-11-19.md` in the shared notes folder has two lines, each with its exact place in `next`, `screen-build` and `qa`:
- **P-712:** the frozen card lists;
- **P-719:** work one Release 1 item's whole chain.

## Paused or queued items
- **P-715 follow-up (c):** #2112 resumes in the pipeline lane once #2207 has merged. Its owner is "the checks builder", this lane.
- **After #2195 merges:** about 18 open PRs that append to a frozen card line go red on module-cards. Each moves its item into a row fragment. Re-measure card-only conflicts 48 h after the merge, with the same `merge-tree` simulation as `design/module-card-conflicts-2026-11-19.md`.

## Lessons (this session)
- **zsh:** `"$H:refs"` mangles via `:r`, so write `"${H}:refs/…"`. `$N` with newlines does not split; use `${=N}`.
- **The worktree cannot check out branches that change `.claude/settings.json`.** Build commits in a scratch clone (`git clone --shared` into `$TMPDIR`), or with `git merge-tree` + `commit-tree`, then fetch and push from the worktree.
- **`check-guards.sh` holds its mutations in one single-quoted MUT string.** After an edit, run `bash -n` **and** that guard's MUT lines through the real loop (a filtered copy with TESTS empty), not only by hand.
- **A studio test matches nightly's cron line exactly**, so never append a comment to a cron line.
- **Some suites fail identically on main in the sandbox:** comment-run, flaky, g4-rules, select-suites, isolated-ttl, rule-triage. Compare with main before blaming a change.

## Next 3 steps for the fresh session
1. **When #2200 and #2207 merge:**
   - start the 48 h watch above, first numbers to the Lead at +2 h;
   - fill in the change-log rows, asking the Lead for the numbers;
   - tell the board keeper that heartbeat.json gained the report id `parked` and the alarm `parked-expired`.
2. **When #2176 merges:** count the scheduled runs for 1 hour and report them. Shift the crons by a minute only on the Lead's go.
3. **When #2209 is labelled and merges:** check that the next queue-gate label survives a sweep (the label-guard sweep log line `kept … eligible`). Then resume #2112 in the pipeline lane.
