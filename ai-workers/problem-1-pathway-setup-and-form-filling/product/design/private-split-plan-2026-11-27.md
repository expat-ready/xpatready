# Private split: the move plan (lane private-split, 27 Nov 2026)

Status: **Step 1, plan only. Nothing moves until the tech lead approves this plan on its PR.**
Source rows: lab register LR-115 to LR-120 (`design/lab-register-2026-11-27.md`, Lead's branch `lead/2026-11-27-lead3-records2`, PR #3909).
Read at: xpatready `origin/main` e071cb8fa (27 Nov 2026). Reader lists below were produced by `git grep` over every file
GitHub, Claude Code or a person's tool runs: `.github/`, `.githooks/`, `.claude/` (settings, skills, agents), `.mergify.yml`,
`CLAUDE.md`, `AGENTS.md`, `product/tools/`, `ai-workers/tools/`, and `prototype/` (only where it names `product/<path>`).
The raw hit list is in the appendix so every reader can be checked line by line.

Settled before this plan (not reopened): test output goes to GitHub Actions run artifacts (#3898); #3900 and #3901 take
the screenshots out of the tree (LR-118); workflows, `.githooks/`, `.mergify.yml`, `.claude/settings.json` and every script a
required check runs stay in xpatready (LR-119); reusable or org workflows and Mergify shared config from the private
repository are dropped (LR-120).

## 1. The answer in short

1. **Move only what no required check, hook or builder needs.** That is the Lead's running page and its archive:
   `STATE.md`, `history/`, `lanes/`, `inbox/`, `reports/`, `ops/`, `reference/`, `RESUME-ON-NEW-ACCOUNT.md`,
   `SECOND-MAC.md` (PS-1), and the four Lead-only skills `lead`, `lead-watch`, `strategy-desk`, `cto-review` (PS-2).
   951 files, 27.7 MB (26.4 MiB).
2. **Keep public, with evidence (challenge to LR-116's "no records file under product/ except pointers"):**
   `DECISIONS.md` + `decisions/`, `RULES.md` + `rules/`, `BACKLOG*.md`, `focus-list.md`, `WAY-OF-WORKING.md`, `state/`,
   `design/`. Each is read by a required check (`ci`, `pr-rules`) or by builders, who are single-repository sessions
   (LR-115). Details in section 3.
3. **Tools stay in xpatready (challenge to LR-117's "tools run from the private clone").** `lead-watch.sh`,
   `current-lead.sh`, `check-docs.sh` and the ~40 tools they call share libraries with builders and CI (`gh.sh`,
   `waves.py`, `items.py`, `guard-test-lib.sh`) and are tested by xpatready workflows (`guards.yml`, `lead-tools-tests.yml`,
   `enf-803.yml`). Moving them means either private-repository Actions minutes or untested tools. They hold no secrets.
   They are re-pointed to read the moved records from the private clone through one resolver (section 4).
4. **Past content stays public.** No history rewrite (AGENTS rule 1 and 8): every moved file is still readable in
   xpatready's git history. The split makes **new** Lead records private from the move onward; it does not make old ones private.
5. **This cloud session cannot reach expat-ready/private** (GitHub tool answer 27 Nov: "repository expat-ready/private is
   not configured for this session"). The private-repository steps (PS-1a, PS-2a) are the Lead's, from the Mac.

What the founder gains: the Lead's STATE, hand-overs, lanes and reports are written in a repository nobody outside sees,
pushed straight to its main (no Mergify records queue, no CI), so the 40% of merges that touched only records or tooling
(LR-116: 261 of 651 in 7 days) shrink to the few records builders still need (BACKLOG, DECISIONS, RULES).

## 2. The private repository layout (LR-115)

One mirror folder, so every relative path stays the same and a tool needs one root change, not one per file:

```
expat-ready/private/
  notes/  commercial/              already there (P-678, #2427)
  README.md                        what lives here, who writes it (the Lead only), the two clones
  xpatready/product/STATE.md       the Lead's page (was product/STATE.md)
  xpatready/product/history/ lanes/ inbox/ reports/ ops/ reference/
  xpatready/product/RESUME-ON-NEW-ACCOUNT.md  SECOND-MAC.md
  claude/skills/lead/ lead-watch/ strategy-desk/ cto-review/
```

expat-ready/private already holds `notes/side-session-notes/` (private-sync.sh, P-678) and `commercial/` (#2427); the new
folders sit beside them. The Lead's working copy of it is the one private-sync.sh already uses:
`${PRIVATE_HOME_DIR:-$TMPDIR/private-home}` (its comment: "the sandbox refuses .git writes under the repo", so never a
folder inside xpatready). GitHub is the durable home; the working copy is pulled at start and pushed at each step
(AGENTS rule 10).

## 3. Every candidate, with its decision

| Path under product/ | Files | Decision | Why (readers that decide it) |
|---|---|---|---|
| `STATE.md` | 1 | MOVE (PS-1); a one-line public `CURRENT-LEAD.md` stays | Readers: check-docs (ci, required), current-lead.sh, session-start.sh (hook), lead-watch.sh, lane.sh, handover.sh, takeover.sh, cockpit-data.py. The only thing others need from it is the `current_lead:` line: lanes report to the Lead. |
| `history/` | 724 | MOVE (PS-1) | Readers: check-docs (message text only), cockpit-data.py (a label), qa skill (text), AGENTS.md rule 9 (text). No required check opens a file here. |
| `lanes/` | 7 | MOVE (PS-1) | Readers: lane.sh (Lead's table), scout.sh, a comment in test-graph.yml. |
| `inbox/` | 4 | MOVE (PS-1) | Readers: lane.sh; a comment in prototype test check_runtime_n7.cjs (citation only). |
| `reports/` | 205 | MOVE (PS-1) | Readers: change-kind.sh and ci.yml (the rule "a file under reports/ is notes"; still true with none there), flow-measure.py, scout.sh, check-label-guard.sh, check-queue-gate.sh (fixtures in a temp copy), qa and screen-concept skills (text), comments in two journeys and two fixtures. |
| `ops/` | 1 | MOVE (PS-1) | Reader: check-lead-read-gate.sh (fixture). |
| `reference/` | 7 | MOVE (PS-1) | No reader. Factory plan and progress material. |
| `RESUME-ON-NEW-ACCOUNT.md`, `SECOND-MAC.md` | 2 | MOVE (PS-1) | Readers: lead-watch skill (text); prototype/studio/tools/new-machine.sh (a printed hint). |
| skills `lead`, `lead-watch`, `strategy-desk`, `cto-review` | 4 folders | MOVE (PS-2) | Readers: guards.yml path filter, check-lane-preflight.sh, check-lead-cron.sh, check-lead-gap.sh, check-lead-upkeep.sh (grep the SKILL.md text), lead-watch.sh step that diffs skills. |
| `DECISIONS.md`, `decisions/` | 30 | STAY | decision-impact.sh and check-docs (RULES LAG, E14 index) in `ci`; records-only.sh, change-kind.sh, graph.mjs, trace-requirements.py (`trace.yml`); builders read rows by number (AGENTS rule 2 and 9, next skill). |
| `RULES.md`, `rules/` | 11 | STAY | check-docs RULES register (ci), check-rules-settled.sh and check-g4-rules.sh (`pr-rules`, required); every agent's start read (AGENTS rule 9). |
| `BACKLOG*.md`, `focus-list.md` | 4 | STAY | ready-gate.py / check-ready-gate.sh and waves.py in `pr-rules` (required); trace.yml; lane-preflight.sh (hook); the builder's own row (next skill). |
| `state/` | 2 | STAY | items.json is read by waves.py in `pr-rules` (required) and branch-sweep, handover. |
| `design/` | 132 + 9 folders | STAY (this step) | Mixed: builders' screen concepts write `design/draft-*`, `*.dc.html`, `TEAM-PATTERNS.md`; `waves.tsv` and `waves.md` are read by `pr-rules` and `guards.yml`; `engineering-approved-setup.json` by pipeline-heartbeat.yml. A per-file split is possible later (question 3); new Lead-only plans can be written in the private repo from the move on. |
| `WAY-OF-WORKING.md`, `PRODUCT.md`, `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`, `domain/`, `library/`, `research_notes/`, `compliance-trace.md`, `MVP-CHECKLIST.md`, `STAND-INS.md` | — | STAY | The product's bar and content; read by builder skills, red-on-old.yml, route-has-screen.mjs, prototype fact-expiry rules, trace-requirements.py. |
| `cockpit/`, `scout/`, `cycle-plan.json` | — | STAY (later, if wanted) | Each has its own workflow (`cockpit-tests.yml`, `cycle-timeline.yml`) or the push guard (`.githooks/pre-push` reads scout/). Moving them means moving their tests to private CI; not worth it in this step. |
| `screens/`, `qa/` | — | out of scope | Evidence lane (#3898, #3900, #3901). |

## 4. How readers are re-pointed

**One resolver, `product/tools/records-dir.sh`** (new, ~10 lines, PS-1b), prints the root of the moved records:
`$XR_RECORDS` if set; else `${PRIVATE_HOME_DIR:-$TMPDIR/private-home}/xpatready/product` if that folder has `STATE.md`
(the same variable private-sync.sh reads); else `product/` itself when it still holds `STATE.md` (before PS-1c, or after a
rollback); else nothing (exit 1). So every re-pointed reader works with the files in either place, which is what lets the
readers change (PS-1b) before the files go (PS-1c).
Python tools call it once via a 3-line helper. No reader guesses a path of its own.

| Reader | Today | After (PS-1b unless stated) |
|---|---|---|
| `check-docs.sh` CURRENT LEAD block (ci, required; Stop hook) | `$PH/STATE.md`, else current-lead.sh from origin/lead/* | Reads `product/CURRENT-LEAD.md` (public, exactly one `current_lead:` line). Same checks: one line, session id, "Lead N". |
| `check-docs.sh` STATE TOO BIG, STATE `updated:` time | `$PH/STATE.md` | Run only when records-dir.sh finds the private clone (the Lead's copy and the Lead's Stop hook); skipped in CI and builder copies, which no longer write STATE. |
| `check-docs.sh` MISSING LINK | a backticked path must exist under product/ | A reference under a moved prefix (`history/`, `lanes/`, `inbox/`, `reports/`, `ops/`, `reference/`, `STATE.md`, the two moved pages) is checked in the private clone when present, else accepted as moved. DECISIONS.md and RULES.md cite many history/ pages; without this, ci goes red. |
| `check-docs.sh` RULES LAG, register, E14, workflow lock | RULES, DECISIONS, decisions/ | No change (they stay). |
| `current-lead.sh` (lanes, check-docs, lead-watch, lane-preflight) | STATE.md on origin/main and origin/lead/* | Reads `CURRENT-LEAD.md` on origin/main and origin/lead/* (same newest-commit rule), else this copy's file. `--where` unchanged in form. |
| `handover.sh`, `takeover.sh` | rewrite / read STATE's current_lead line | Write the line in `CURRENT-LEAD.md` (xpatready, the hand-over records PR) **and** in the private STATE.md (records-dir.sh); refuse when the private clone is missing. |
| `session-start.sh` (SessionStart hook, every copy) | prints `product/STATE.md` | Lead's copy: prints the private STATE.md (records-dir.sh). Builder copies: prints `CURRENT-LEAD.md` and the builder's pointer line ("work list: product/BACKLOG.md"). Never fails (hook already ends `|| true`). |
| `stop-check.sh` (Stop hook) | runs check-docs; maps STATE lines to STATE.md | Map "CURRENT LEAD" lines to `CURRENT-LEAD.md`; STATE lines only appear in the Lead's copy. |
| `lead-watch.sh` lines 98, 382, 394, 399 | `--state "$TOOLS/../STATE.md"` | `--state "$(bash "$TOOLS/records-dir.sh")/STATE.md"`; one ACT line when the private clone is missing. The four tools it calls (lead-upkeep.py, founder-click-guard.sh, owed-watch.py, founder-wait.py) already take `--state`: unchanged. |
| `lane.sh` (`table`, `state`, lanes/, inbox/) | `$MAIN/$P/product/{STATE.md,lanes,inbox}` | records-dir.sh root. |
| `cockpit-data.py`, `cockpit-reconcile.py` | read STATE.md from this copy and `git show <sha>:…/STATE.md` | Read from records-dir.sh root (and `git -C <private>` for the snapshot sha). Without the private clone: "not measured", as today for a missing file. |
| `flow-measure.py`, `scout.sh` (reports/, lanes/) | `product/reports`, `product/lanes` | records-dir.sh root. |
| `ist-time-guard.py` (not wired to any hook today; tested by check-ist-time-guard.sh, listed in check-guards.sh) | refuses a future time in STATE.md or DECISIONS.md | Also match the private path of STATE.md, so it is ready if the Lead wires it. |
| `records-only.sh`, `change-kind.sh`, `check-mergify-scopes.sh`, `ci-memory.mjs`, `check-select-suites.sh` | name `product/STATE.md` as an example of a record | No change needed (a classification rule; STATE.md simply stops appearing in xpatready PRs). Tests keep their fixture paths. |
| Tests that build their own STATE in a temp copy: check-current-lead, check-state-page, check-handover, check-founder-*, check-ist-time-guard, check-owed-watch, check-lead-upkeep, check-known-failures, check-stop-check, check-guards (mutation list), guard-test-lib.sh, test_cockpit_data.py | temp fixtures | Updated in the same PR as their tool: fixtures write `CURRENT-LEAD.md` and set `XR_RECORDS` to the temp folder. |
| `lead-watch.sh` line 370 (records size snapshot) | `size(P + "/STATE.md")` | records-dir.sh root for STATE.md; RULES.md stays in `P`. |
| `private-sync.sh` (lead-watch each check; lead-upkeep.py) | rsyncs notes into `notes/`, then `git add -A` (line 94) | `git add -A notes` only, so a sync never commits a half-written STATE; the Lead commits records by hand. Its secret scan covers notes/ only, so the Lead runs the push guard's secret check on records commits in the private copy. Its test (check-guards.sh list) gets one case: a file outside notes/ stays uncommitted. |
| `known-failures.tsv` row `size-state` | STATE size near 12 KB | Kept; judged only where records-dir.sh finds the private clone. |
| `CLAUDE.md`, `AGENTS.md` rules 9-10, `lead` skill, `WAY-OF-WORKING.md` | "start from product/STATE.md" | Lead: private STATE; everyone else: `CURRENT-LEAD.md`, RULES.md, own backlog row. AGENTS rule 10 names both repositories. |
| prototype new-machine.sh, check_runtime_n7.cjs, j_13.ts, j_65.ts, two fixture READMEs | comments / printed hints citing moved files | No change (citations; history keeps them). |
| **PS-2** skills `lead`, `lead-watch`, `strategy-desk`, `cto-review` | `.claude/skills/<name>` in xpatready | Copied to `private/claude/skills/<name>`; the Lead's Mac links `~/.claude/skills/<name>` to them (user-level skills load in every project, so they load when the Lead opens xpatready). Then removed from xpatready. |
| check-lane-preflight.sh, check-lead-cron.sh, check-lead-gap.sh, check-lead-upkeep.sh (grep a skill's text), guards.yml path `.claude/skills/lead/**`, lead-watch.sh `skills_off` | `.claude/skills/lead*/SKILL.md` in this copy | The four text checks move into the private repo with the skills (they test the skill, not xpatready); guards.yml drops the path and the four tests from its list; `skills_off` reads `~/.claude/skills/lead/SKILL.md`. |

No required check reads a moved path after PS-1b. In `ci`, only check-docs.sh (and current-lead.sh through it) opens a moved
file, and both are re-pointed above; change-kind.sh, records-only.sh, check-mergify-scopes.sh, check-select-suites.sh and
ci-memory.mjs only name STATE.md as a classification example or a temp fixture. `pr-rules`, `xfa-engine`, `skeleton` and
`queue-gate` (queue-fresh, completes-ready) run no script that names a moved path (appendix).

## 5. Order (each step merged and checked before the next)

| Step | Repository | Who | What | Checked by |
|---|---|---|---|---|
| PS-1a | private | Lead (Mac) | README layout; copy the PS-1 paths from xpatready at a named sha (one commit, message names the sha) | `diff -r` of each moved path against that sha is empty |
| PS-1b | xpatready | builder lane (this lane) | records-dir.sh; `CURRENT-LEAD.md`; every reader in section 4 and its test, each working with the files in either place; `product/PRIVATE-RECORDS.md` pointer; CLAUDE.md, AGENTS.md, WAY-OF-WORKING.md lines. **No file is deleted.** Under 800 changed lines, under 50 deletions. | required checks green; on the Lead's Mac with both copies: `bash tools/lead-watch.sh`, `bash tools/current-lead.sh`, `bash tools/check-docs.sh` pass reading the private copy; without it: check-docs and current-lead.sh pass reading `CURRENT-LEAD.md` and the in-tree files |
| PS-1c | xpatready | builder lane | `git rm` of the 951 files only, plus one row in `docs/PATHS-MOVED.md`. Body: `Clean-up: delete` (cleanup-pr-check.sh, pr-rules: a PR deleting 50+ files must be a pure deletion) and `Size exception: P-NNN` (pr-size.sh: ~99k deleted lines; the moved folders hold .py/.sh/.json files, so it is not records-only). The Lead first records the size-exception row P-NNN in DECISIONS (a 800-line size row). Commit message: `BULK-DELETE-OK: private split PS-1c, files copied to expat-ready/private at <sha>` (bulk-delete-guard.sh via pre-commit, commit-msg and push-guard.sh in ci). The moved paths are **not** added to `stale-paths.txt`: DECISIONS and RULES keep citing them, and check-docs resolves those citations in the private copy (section 4). | required checks green; the same three Lead commands pass; `check-docs.sh` in a copy without the private clone passes |
| — | — | Lead | Records freeze from PS-1a's sha until PS-1c merges: STATE edits go to the private copy only (readers already prefer it after PS-1b) | PS-1c's body names PS-1a's sha |
| PS-2a | private | Lead (Mac) | copy the four skills and their four text checks; link `~/.claude/skills/*` | `/lead` loads in xpatready; the four checks pass in the private clone |
| PS-2b | xpatready | builder lane | `git rm` the four skills; guards.yml list; lead-watch `skills_off`; lane-preflight text test | required checks green; guards.yml green |

The brief's rule holds: no file a check or hook reads is removed before its reader is changed. PS-1b changes every reader
so it works with the files in either place; only then does PS-1c remove them. PS-1b and PS-2b touch `product/tools/` and
`.claude/`, read-first paths: the Lead reads each before it is labelled.

## 6. Roll back

* **xpatready:** `git revert` of the PS-1c merge commit (body `Size exception: P-NNN`, the same row; commit message
  `BULK-DELETE-OK:` is not needed, a revert adds files). The files come back exactly from history, and records-dir.sh
  falls back to the in-tree path where no private copy is set. PS-1b needs no revert (its readers work either way); revert
  it only to drop `CURRENT-LEAD.md`. Prepared as a branch when PS-1c merges (LR-116's "one revert PR per repository prepared").
* **Lead's records written after the move:** copied back from the private repo into the revert PR (`cp -r`), so nothing
  written in between is lost.
* **private:** nothing to roll back (the copy is additive); leave it, or revert its import commit.
* **PS-2:** remove the four `~/.claude/skills` links; revert PS-2b.

## 7. Questions for the tech lead (also on the PR)

1. Records root inside expat-ready/private: `xpatready/product/` beside `notes/` and `commercial/`? Choice used: yes.
2. Agree the challenges: DECISIONS, RULES, BACKLOG, focus-list, state/ and design/ stay public (section 3), and the
   Lead's tools stay in xpatready, re-pointed (section 1 point 3)? Choice used: yes.
3. design/: a later per-file split (Lead plans out, screen concepts and waves in), or leave it? Choice used: leave it in this step.
4. Private repository CI: none (the Lead runs the checks on the Mac; no Actions minutes). Agree?

## Done when

This plan PR is merged with every reader listed (appendix). After PS-1 and PS-2: on the Lead's Mac with both clones,
`tools/lead-watch.sh`, `tools/current-lead.sh` and `tools/check-docs.sh` pass reading from the private clone;
xpatready's required checks (`ci`, `pr-rules`, `xfa-engine`, `skeleton`, `queue-fresh`, `completes-ready`) stay green.

## Appendix: every reader found (git grep, origin/main e071cb8fa)

Format: `moved path | file:line: text` (cut at 200 characters; `product/` = `ai-workers/problem-1-pathway-setup-and-form-filling/product/`).
Regenerate: git grep each moved path over the reader folders named at the top of this page.

```
STATE.md | .claude/skills/lead/SKILL.md:13:3. Check last night's full run first (`gh run list --workflow nightly.yml --limit 1`): a red one is fixed before anything else. Then read `STATE.md`, the Owners, Now and Next of `BACKLOG.m
STATE.md | .claude/skills/lead/SKILL.md:18:* Every founder ask goes into `STATE.md` "Founder asks" the moment it arrives. List each part of a long ask, answer each part, and tick it there.
STATE.md | .claude/skills/lead/SKILL.md:31:* **Records daily, by you alone:** `STATE.md`, `DECISIONS.md` (appended, never rewritten), `BACKLOG.md` Owners, `qa/CAPABILITIES.md` stays qa's.
STATE.md | .claude/skills/lead/SKILL.md:37:Batches, red checks, merges, each builder's activity and questions, the demo at :4400; three to five plain lines to the founder. Each check also asks: did anything I started stop, fail or 
STATE.md | .claude/skills/lead/SKILL.md:55:* **Hand-over by standby (founder, 2 Nov, P-286):** keep two idle standby Leads, started in a founder-typed turn (local, `use_worktree: false`, "Lead N+1 · standby", idle until "take over
STATE.md | .claude/skills/lead/SKILL.md:61:Rewrite `STATE.md` (one page: where we are, what is in flight, what is next), and update `BACKLOG.md` and `DECISIONS.md` if they changed. Run `bash P/tools/check-docs.sh` and `bash P/tools
STATE.md | AGENTS.md:11:9. **Start read (P-545):** start from `product/RULES.md` and `product/STATE.md`, plus your own backlog row. Open `DECISIONS.md` only for a row you need by number (rows are never deleted); never read `product
STATE.md | AGENTS.md:12:10. **Always committed, always resumable (P-557, hard rule).** Every piece of work is committed and pushed at each step; nothing lives only in a session, a chat, a local folder or an account. The repository 
STATE.md | CLAUDE.md:8:* Product home: `product/` — `WAY-OF-WORKING.md` (who does what, the rules), `BACKLOG.md` (work, in order), `STATE.md` (where we are), `PRODUCT.md` (what 
STATE.md | product/tools/check-current-lead.sh:2:# Guard 1 (founder, 6 Nov ~03:00 IST): lanes always report to the current Lead. check-docs.sh refuses a STATE.md with
STATE.md | product/tools/check-current-lead.sh:3:# zero or two current_lead lines; current-lead.sh prints the line from the freshest STATE.md (a lead/* branch newer than
STATE.md | product/tools/check-current-lead.sh:9:docs_copy "$T/c"; S="$T/c/$PRODREL/STATE.md"; CD="$T/c/$PRODREL/tools/check-docs.sh"
STATE.md | product/tools/check-current-lead.sh:12:ok "no current_lead line fails check-docs" "$([ $r = 1 ] && echo "$out" | grep -q 'CURRENT LEAD: STATE.md has 0' && echo 1)" "exi
STATE.md | product/tools/check-current-lead.sh:22:git -C "$T/src" checkout -qb lead/x; sed -i.bak 's/^current_lead: .*/current_lead: local_bbb-0000-1111 Lead 2 · 6 Nov 03:15 IST/
STATE.md | product/tools/check-current-lead.sh:23:rm -f "$T/src/$PRODREL/STATE.md.bak"; sleep 1; git -C "$T/src" commit -qam "hand-over" && git -C "$T/src" -c push.negotiate=false
STATE.md | product/tools/check-current-lead.sh:27:git -C "$T/src" checkout -q main; sleep 1; sed -i.bak 's/^current_lead: .*/current_lead: local_ccc-0000-1111 Lead 3 · later/' "$
STATE.md | product/tools/check-current-lead.sh:30:git -C "$T/src" checkout -q lead/x; sleep 1; sed -i.bak '/^current_lead: /d' "$T/src/$PRODREL/STATE.md"; echo 'x' >> "$T/src/$PRO
STATE.md | product/tools/check-current-lead.sh:33:out=$(cd "$T" && mkdir solo && cp -r "$T/c/ai-workers" solo/ && sed -i.bak '/^current_lead: /d' "solo/$PRODREL/STATE.md" && bash 
STATE.md | product/tools/check-current-lead.sh:36:# Main's STATE.md may carry no line: the tech lead keeps STATE on its lead/* branch (#1136 after #1139). check-docs then
STATE.md | product/tools/check-current-lead.sh:38:docs_copy "$T/m"; sed -i.bak '/^current_lead: /d' "$T/m/$PRODREL/STATE.md"; rm -f "$T/m/$PRODREL/STATE.md.bak"; git -C "$T/m" com
STATE.md | product/tools/check-current-lead.sh:43:git -C "$T/m" checkout -qb lead/y; echo 'current_lead: local_ddd-0000-1111 Lead 4 · 6 Nov 18:00 IST' >> "$T/m/$PRODREL/STATE.md"
STATE.md | product/tools/check-current-lead.sh:48:sed -i.bak 's/^current_lead: .*/current_lead: Lead 4/' "$T/m/$PRODREL/STATE.md"; rm -f "$T/m/$PRODREL/STATE.md.bak"
STATE.md | product/tools/check-current-lead.sh:52:sed -i.bak 's/^current_lead: .*/current_lead: Lead 21 · 6 Nov (took over from Lead 20)/' "$T/m/$PRODREL/STATE.md"; rm -f "$T/m/$
STATE.md | product/tools/check-current-lead.sh:58:git -C "$T/m" checkout -q main; sleep 1; echo 'current_lead: local_eee-0000-1111 Lead 5 · 6 Nov 19:00 IST' >> "$T/m/$PRODREL/STA
STATE.md | product/tools/check-current-lead.sh:60:git -C "$T/mlane" pull -q --ff-only origin main; sed -i.bak '/^current_lead: /d' "$T/mlane/$PRODREL/STATE.md"; rm -f "$T/mlane/$P
STATE.md | product/tools/check-current-lead.sh:63:git -C "$T/m" checkout -q lead/y; sleep 1; printf 'current_lead: local_fff Lead 6 · a\ncurrent_lead: local_ggg Lead 7 · b\n' >>
STATE.md | product/tools/check-docs.sh:14:  # STATE.md (or else the newest origin/lead/* branch's) names the current Lead on exactly one line, so every lane can
STATE.md | product/tools/check-docs.sh:16:  S="$PH/STATE.md"
STATE.md | product/tools/check-docs.sh:19:    # The tech lead keeps STATE on its lead/* branch (P-336), so main's STATE.md may carry no line: then the line must be
STATE.md | product/tools/check-docs.sh:26:        *) echo "CURRENT LEAD: STATE.md has 0 current_lead lines and current-lead.sh read none from an origin/lead/* branch (it read: $w)
STATE.md | product/tools/check-docs.sh:29:    [ "$n" -gt 1 ] && echo "CURRENT LEAD: STATE.md has $n current_lead lines, needs exactly one (current_lead: <session id> <title>)"
STATE.md | product/tools/check-docs.sh:30:    [ "$n" -eq 1 ] && ! grep -qE '^current_lead: [A-Za-z]+_[A-Za-z0-9_-]{8,} .*Lead [0-9]+' "$S" && echo "CURRENT LEAD: STATE.md's curren
STATE.md | product/tools/check-docs.sh:190:# STATE.md has uncommitted changes); an "updated:" line in neither form fails too. It fails when this branch wrote the
STATE.md | product/tools/check-docs.sh:191:# time: STATE.md uncommitted, or changed by a commit not yet on STATE_TIME_BASE (default origin/main; none = this branch).
STATE.md | product/tools/check-docs.sh:193:if [ -f "$PH/STATE.md" ] && grep -q '^updated:' "$PH/STATE.md"; then
STATE.md | product/tools/check-docs.sh:194:  ul=$(grep -m1 '^updated:' "$PH/STATE.md")
STATE.md | product/tools/check-docs.sh:199:  if (cd "$PH" && git diff --quiet HEAD -- STATE.md 2>/dev/null); then
STATE.md | product/tools/check-docs.sh:202:      c=$(cd "$PH" && git log -1 --no-merges --format=%ct "$b..HEAD" -- STATE.md 2>/dev/null)
STATE.md | product/tools/check-docs.sh:203:      [ -n "$c" ] || { mine=0; c=$(cd "$PH" && git log -1 --no-merges --format=%ct -- STATE.md 2>/dev/null); }
STATE.md | product/tools/check-docs.sh:204:    else c=$(cd "$PH" && git log -1 --no-merges --format=%ct -- STATE.md 2>/dev/null); fi
STATE.md | product/tools/check-docs.sh:207:  if [ -z "$u" ]; then msg="STATE TIME: STATE.md's first updated: line cannot be read: write 'updated: YYYY-MM-DD HH:MM IST' (or HH:Mx) 
STATE.md | product/tools/check-docs.sh:213:if m > 30: print("STATE TIME: STATE.md says updated %s IST, but it was committed %s IST (%d min apart): read the time with TZ=Asia/Kolka
STATE.md | product/tools/check-founder-click-guard.sh:109:cat > "$T/STATE.md" <<'EOF'
STATE.md | product/tools/check-founder-click-guard.sh:114:out=$(bash "$G" --state "$T/STATE.md")
STATE.md | product/tools/check-founder-click-guard.sh:119:grep -q 'founder-click-guard.sh" --state "$TOOLS/../STATE.md"' "$TOOLS/lead-watch.sh" && grep -q "grep -c '^ACT' <<<\"\$f
STATE.md | product/tools/check-founder-wait.sh:8:S="$T/STATE.md"; M="$T/mem.json"
STATE.md | product/tools/check-founder-wait.sh:37:rm -f "$S"; run 06:00; ok "no STATE.md: an ACT, never 'no line'" "$([ "$(acts)" = 1 ] && has 'STATE.md unreadable' && echo 1)" "$
STATE.md | product/tools/check-founder-wait.sh:38:mkdir "$S"; run 06:00; ok "STATE.md a directory: an ACT" "$([ "$(acts)" = 1 ] && has 'STATE.md unreadable' && echo 1)" "$o"; rmdi
STATE.md | product/tools/check-guards.sh:55:MUT='1|product/tools/check-docs.sh|/CURRENT LEAD: STATE.md has/d|check-current-lead.sh
STATE.md | product/tools/check-handover.sh:20:ok "a refusal leaves current_lead: as it was" "$(grep -q '^current_lead: local_aaa-0000-1111 Lead 1' "$C/$PRODREL/STATE.md" && echo 1
STATE.md | product/tools/check-handover.sh:24:ok "a dry run writes nothing" "$(git -C "$C" diff --quiet -- "$PRODREL/STATE.md" && echo 1)"
STATE.md | product/tools/check-handover.sh:33:ok "the real run refuses an uncommitted items.json (an ack counts once pushed)" "$([ $r = 1 ] && echo "$out" | grep -q 'commit and pu
STATE.md | product/tools/check-handover.sh:36:ok "the real run rewrites current_lead: and pushes it" "$([ $r = 0 ] && git -C "$T/origin.git" show "lead/x:$PRODREL/STATE.md" | grep
STATE.md | product/tools/check-handover.sh:38:ok "only STATE.md is in the hand-over commit" "$([ "$(git -C "$C" show --name-only --format= HEAD)" = "$PRODREL/STATE.md" ] && echo 1
STATE.md | product/tools/check-handover.sh:41:sed -i.bak 's/^\(current_lead: .*\)$/\1; start read ~100k/' "$C/$PRODREL/STATE.md" && rm -f "$C/$PRODREL/STATE.md.bak"
STATE.md | product/tools/check-ist-time-guard.sh:2:# B193 part 2 (f), P-302: ist-time-guard.py refuses an edit of STATE.md or DECISIONS.md that writes a time ahead of
STATE.md | product/tools/check-ist-time-guard.sh:11:G="$TOOLS/ist-time-guard.py"; S="$T/$PRODREL/STATE.md"; D="$T/$PRODREL/DECISIONS.md"; mkdir -p "$(dirname "$S")"
STATE.md | product/tools/check-known-failures.sh:24:BASE='{"now":"2026-11-16T06:00:00+00:00","files":{"RULES.md":20000,"STATE.md":11000},
STATE.md | product/tools/check-known-failures.sh:31:case_ "size-rules ACT: 25406 B"           size-rules act  '{"files":{"RULES.md":25406,"STATE.md":11000}}'
STATE.md | product/tools/check-known-failures.sh:33:case_ "size-state ACT: 12225 B"           size-state act  '{"files":{"RULES.md":20000,"STATE.md":12225}}'
STATE.md | product/tools/check-known-failures.sh:109:mkdir -p "$T/root/p" "$T/st"; head -c 25406 /dev/zero > "$T/root/p/RULES.md"; head -c 100 /dev/zero > "$T/root/p/STATE.md"
STATE.md | product/tools/check-lead-upkeep.sh:162:ok "lead-watch.sh step 1c reads the context against STATE and counts its ACT lines" "$(grep -q 'lead-upkeep.py" context --state "
STATE.md | product/tools/check-mergify-scopes.sh:211:                    ("product/STATE.md", False),
STATE.md | product/tools/check-owed-watch.sh:77:ok "lead-watch.sh step 13c runs starts on STATE and counts its ACT lines" "$(grep -q 'owed-watch.py" starts --state "\$TOOLS/../STA
STATE.md | product/tools/check-queue-blocked.sh:67:for f in $S/product/tools/lead-watch.sh $S/prototype/studio/web/src/tests.tsx $S/product/STATE.md; do
STATE.md | product/tools/check-queue-gate.sh:266:nofull; files 7 "$REC/STATE.md" "$REC/qa/BUGS.md"; prj 7 $HEAD1 false records; run label 7
STATE.md | product/tools/check-queue-gate.sh:270:prj 7 $HEAD1 false records; files 7 "$REC/STATE.md" "$S/api/src/form.ts"; run label 7
STATE.md | product/tools/check-queue-gate.sh:406:files 8 "ai-workers/x/product/STATE.md"; run fresh 8
STATE.md | product/tools/check-queue-gate.sh:602:files 7 "$TOOLF" "$S/README.md" "ai-workers/x/product/STATE.md"; oldrun $HEAD1 success skipped; SG=block HEADS=" $HEAD1" RELABEL=1
STATE.md | product/tools/check-select-suites.sh:40:for f in "$Q/product/STATE.md" "$T/merge-guard.sh" "$Q/official-sources/ircc/README.md" "$S/screens/x/notes.md"; do
STATE.md | product/tools/check-select-suites.sh:61:for m in sel dsel; do o=$($m "$Q/product/STATE.md" "$S/web/src/main.tsx" "$S/api/src/platform/MODULE.rows/PF-R1.md"); ok "fail (
STATE.md | product/tools/check-select-suites.sh:123:k=$(kind "$Q/product/STATE.md" "$Q/product/reports/build-review-2026-11-03.html" "$S/screens/x/notes.md"); ok "records and repo
STATE.md | product/tools/check-select-suites.sh:125:k=$(kind "$Q/product/STATE.md" "$Q/prototype/p2/prompts/who-can-be.v1.md"); ok "a prompt .md is code" "$([ "$k" = code ] && ech
STATE.md | product/tools/check-select-suites.sh:127:k=$(kind "$S/web/src/pages/history.tsx" "$Q/product/STATE.md"); ok "a page plus notes: code" "$([ "$k" = code ] && echo 1)" "$k
STATE.md | product/tools/check-select-suites.sh:142:o=$(psel "$S/api/src/case-prepare.ts" "$Q/product/STATE.md" .github/workflows/ci.yml x); ok "--packs: an API module (packs call
STATE.md | product/tools/check-state-page.sh:2:# Guards 6 and 7 (founder, 6 Nov ~03:00 IST). 6: check-docs.sh fails when STATE.md is over 12 KB (it reached 34 KB and
STATE.md | product/tools/check-state-page.sh:10:docs_copy "$T/c"; S="$T/c/$PRODREL/STATE.md"; CD="$T/c/$PRODREL/tools/check-docs.sh"
STATE.md | product/tools/check-state-page.sh:18:docs_copy "$T/d"; S="$T/d/$PRODREL/STATE.md"; CD="$T/d/$PRODREL/tools/check-docs.sh"; run
STATE.md | product/tools/check-state-page.sh:23:ok "a committed 'updated:' time 2 hours from its commit fails, naming both times" "$([ $r = 1 ] && echo "$out" | grep -q "STATE TIM
STATE.md | product/tools/check-state-page.sh:25:ok "... the same time already on the base only warns (exit 0)" "$([ $r = 0 ] && echo "$out" | grep -q "^WARN  STATE.md says updated
STATE.md | product/tools/check-state-page.sh:35:ok "an 'HH:Mx' time 2 hours off fails (the form is read, not skipped)" "$([ $r = 1 ] && echo "$out" | grep -q "STATE TIME: STATE.md
STATE.md | product/tools/check-state-page.sh:41:docs_copy "$T/e"; G="git -C $T/e"; S="$T/e/$PRODREL/STATE.md"; CD="$T/e/$PRODREL/tools/check-docs.sh"; $G branch -q base
STATE.md | product/tools/check-stop-check.sh:16:head -c 13000 /dev/zero | tr '\0' 'x' | fold -w 100 >> "$P/STATE.md"; echo 'See `domain/glossary.md`.' >> "$P/STATE.md"
STATE.md | product/tools/check-stop-check.sh:43:  "$([ "$blocked" = block ] && jq -r .reason <<< "$out" | grep -q 'MISSING LINK in .*STATE.md: domain/glossary.md' && echo 1)" "$ou
STATE.md | product/tools/check-touch-overlap.sh:32:to $'Touches:\nDone when: STATE.md updated'; ok "an empty Touches: never reads the next line as its list" "$(y "$r" 0)" "$out"
STATE.md | product/tools/check-touch-overlap.sh:38:to $'- **Touches:**\n- **Done when:** STATE.md shows the row'; ok "a bulleted next field (- **Done when:**) is not read as the l
STATE.md | product/tools/ci-memory.mjs:158:  const app = `${PH}/prototype/studio/api/src/core.ts`, note = `${PH}/product/STATE.md`, starts = (n) => n !== "check_plain.ts";
STATE.md | product/tools/ci-memory.mjs:165:  ok("select-suites.mjs: the smoke set it adds to every choice counts as chosen (never remembered past a change)", (() => { const c = se
STATE.md | product/tools/cockpit-data.py:8:#   Records .......... STATE.md, MVP-CHECKLIST.md, BACKLOG.md, DECISIONS.md, qa/BUGS*.md, tools/flaky-ledger.tsv (this copy)
STATE.md | product/tools/cockpit-data.py:241:    """Founder asks from STATE.md that need the founder now. Known fix (spec §6 10): an ask whose status says it is decided
STATE.md | product/tools/cockpit-data.py:244:    t = text if text is not None else (read("STATE.md") or "")
STATE.md | product/tools/cockpit-data.py:263:                         "src": "STATE.md › Founder asks", "names": item_ids(" ".join(c[1:-1]))})
STATE.md | product/tools/cockpit-data.py:822:    """STATE.md › Founder asks: each row's ask ids and the day its Ask cell names (none: undated). Returns ({day: [ids]}, [ids])."""
STATE.md | product/tools/cockpit-data.py:880:SNAP_FILES = ["MVP-CHECKLIST.md", "BACKLOG.md", "STATE.md", "cockpit/plan.json", "cockpit/history.jsonl", "qa/BUGS.md",
STATE.md | product/tools/cockpit-data.py:1211:    st = git_out("show", f"{rsha}:{REL}/STATE.md") or ""
STATE.md | product/tools/cockpit-data.py:2608:    st_text = snap.file("STATE.md") or ""
STATE.md | product/tools/cockpit-data.py:2647:              "role": "release holder: release, Bake, case side; the pipeline", "src": f"STATE.md current_lead @{rsha}"}]
STATE.md | product/tools/cockpit-data.py:2791:    st_text = snap.file("STATE.md")
STATE.md | product/tools/cockpit-data.py:2794:        FA = num(None, "STATE.md › Founder asks", "parsed", L, "not measured: STATE.md missing from the snapshot")
STATE.md | product/tools/cockpit-data.py:2798:        FA = num(fa.get(today - timedelta(days=1), 0), f"STATE.md › Founder asks @{rsha}: ask ids per day the Ask cell names (a ran
STATE.md | product/tools/cockpit-data.py:2966:        item(3, "Records on main", "amber", "not measured: STATE's this branch: line or the git refs could not be read", "fix STATE.m
STATE.md | product/tools/cockpit-data.py:3521:        ny.append({"key": f"ask-{i['id']}", "id": i["id"], "what": i["line"], "why": "waits on your word (STATE.md)", "unblocks": "th
STATE.md | product/tools/cockpit-data.py:3629:        "tech lead are on the Factory tab.", now_w + " (STATE.md at the records commit)",
STATE.md | product/tools/cockpit-data.py:3632:        band="0 open items", todo=("decide or do each item below (you, the founder); the Lead closes it in STATE.md once done"
STATE.md | product/tools/cockpit-data.py:3931:    put("behaviour.asks", "Your asks a day", "Ask ids in STATE.md's Founder asks table dated on the last full IST day (a row 'A49-A67
STATE.md | product/tools/cockpit-data.py:3996:        put("first.needs", "Needs you", "The steps only you can take that are due now. Set each one's status; the Lead's next check r
STATE.md | product/tools/cockpit-data.py:4572:    asks, forf, waitline = state_needs(snap.file("STATE.md") or "", NOW.astimezone(IST).date())
STATE.md | product/tools/cockpit-data.py:4573:    st_src = f"STATE.md in {copy}"
STATE.md | product/tools/cockpit-reconcile.py:1273:    st_path = snap.find("files/", "STATE.md")
STATE.md | product/tools/cockpit-reconcile.py:1277:        N["founder_asks_day"] = num(None, "not measured: STATE.md missing")
STATE.md | product/tools/current-lead.sh:3:# `current_lead: <session id> <title>` line of STATE.md without its prefix; --id prints the session id only.
STATE.md | product/tools/current-lead.sh:4:# The Lead's records reach main once a day (P-336), so this reads the freshest STATE.md on GitHub: origin/main and every
STATE.md | product/tools/current-lead.sh:5:# origin/lead/* branch, taking the one whose last STATE.md commit is newest; a copy with no origin reads its own file.
STATE.md | product/tools/current-lead.sh:6:# Exit 1 when that STATE.md has no current_lead line or more than one (check-docs.sh refuses both).
STATE.md | product/tools/current-lead.sh:7:# --where prints where the line was read (refs/remotes/origin/main, refs/remotes/origin/lead/<name>, or "STATE.md (this
STATE.md | product/tools/current-lead.sh:8:# copy)") instead of the line; check-docs.sh uses it when main's STATE.md has no line (the Lead keeps STATE on lead/*).
STATE.md | product/tools/current-lead.sh:12:rel="$(git rev-parse --show-prefix 2>/dev/null)STATE.md"
STATE.md | product/tools/current-lead.sh:16:  # Newest STATE.md commit first; read files only until one has the line (a blob:none CI copy fetches each file it reads).
STATE.md | product/tools/current-lead.sh:20:    t=$(git log -1 --format=%ct "$ref" -- STATE.md 2>/dev/null); [ -n "$t" ] && echo "$t $ref"; done | sort -s -k1,1nr)
STATE.md | product/tools/current-lead.sh:23:else lines=$(grep '^current_lead: ' STATE.md 2>/dev/null); src="STATE.md (this copy)"; fi
STATE.md | product/tools/founder-click-guard.sh:11:#   bash product/tools/founder-click-guard.sh --state STATE.md     (lead-watch: asks to the founder that are clicks)
STATE.md | product/tools/founder-wait.py:15:    python3 -I founder-wait.py --state <STATE.md> --memory <file.json> [--now ISO]      Test: check-founder-wait.sh.
STATE.md | product/tools/founder-wait.py:49:        print("ACT   founder wait: STATE.md unreadable (%s), so a 🔴 Waiting on the founder line cannot be judged" % e.__class__.__na
STATE.md | product/tools/guard-test-lib.sh:3:# docs_copy DIR makes a throwaway git copy holding check-docs.sh, a one-page STATE.md and nothing else.
STATE.md | product/tools/guard-test-lib.sh:9:docs_copy() {  # $1 dir → a git copy at $1 with product/tools/check-docs.sh and STATE.md (one current_lead line)
STATE.md | product/tools/guard-test-lib.sh:13:    "$(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M')" > "$1/$PRODREL/STATE.md"
STATE.md | product/tools/handover.sh:5:#  2. rewrites STATE.md's one current_lead: line;  3. commits and pushes it (STATE.md only);
STATE.md | product/tools/handover.sh:8:# items.json and HEAD as they are). Exit 1 on bad input, uncommitted STATE.md or items.json, or a git failure.
STATE.md | product/tools/handover.sh:14:TOOLS="$(cd "$(dirname "$0")" && pwd)"; P="$(cd "$TOOLS/.." && pwd)"; S="$P/STATE.md"
STATE.md | product/tools/handover.sh:20:[ "$(grep -c '^current_lead: ' "$S")" = 1 ] || { echo "handover: STATE.md needs exactly one current_lead: line" >&2; exit 1; }
STATE.md | product/tools/handover.sh:22:  git diff --quiet HEAD -- STATE.md state/items.json || { echo "handover: commit and push STATE.md and state/items.json first (acks count o
STATE.md | product/tools/handover.sh:43:# 3. Commit and push STATE.md only.
STATE.md | product/tools/handover.sh:44:git commit -q -m "Hand-over: ${prev:-?} -> $new (current_lead:, handover.sh, P-611)" -- STATE.md \
STATE.md | product/tools/handover.sh:45:  || { echo "handover: commit failed; STATE.md is rewritten but NOT committed: git checkout -- STATE.md, then run again" >&2; exit 1; }
STATE.md | product/tools/ist-time-guard.py:3:of product/STATE.md or product/DECISIONS.md whose new text holds a time or date ahead of now in IST.
STATE.md | product/tools/known-failures.tsv:7:size-state	size:STATE.md	11776	STATE.md is near its 12 KB wall: move the earlier page to product/history/ before the next records PR	
STATE.md | product/tools/lane.sh:10:#   lane.sh table             the lanes table from each lane's newest copy (else main); STATE.md and the Lead's replies use it
STATE.md | product/tools/lane.sh:11:#   lane.sh state             rewrite the generated table in STATE.md (main copy only, on branch main)
STATE.md | product/tools/lane.sh:176:    [ "$HERE" = "$MAIN" ] || { echo "Only the Lead's main copy writes STATE.md."; exit 2; }
STATE.md | product/tools/lane.sh:177:    S="$MAIN/$P/product/STATE.md"; t=$(mktemp); tb=$(mktemp); table_ > "$tb"
STATE.md | product/tools/lane.sh:178:    awk -v tf="$tb" '/<!-- lanes:start -->/{print; while ((getline l < tf) > 0) print l; skip=1; next} /<!-- lanes:end -->/{skip=0} !skip' "$S
STATE.md | product/tools/lead-upkeep.py:5:  context --state STATE.md
STATE.md | product/tools/lead-watch.sh:98:lc=$(python3 -I "$TOOLS/lead-upkeep.py" context --state "$TOOLS/../STATE.md" 2>&1); echo "$lc"; act=$((act + $(grep -c '^ACT' <<<"$lc")))
STATE.md | product/tools/lead-watch.sh:99:fresh "lead-upkeep.py context: STATE.md in this copy and LEAD_CONTEXT from the Lead's get_usage"
STATE.md | product/tools/lead-watch.sh:370:print(json.dumps({"now": datetime.now(timezone.utc).isoformat(), "files": {"RULES.md": size(P + "/RULES.md"), "STATE.md": size(P + "/STA
STATE.md | product/tools/lead-watch.sh:382:fc=$(bash "$TOOLS/founder-click-guard.sh" --state "$TOOLS/../STATE.md" 2>&1); echo "$fc"; act=$((act + $(grep -c '^ACT' <<<"$fc"))); see
STATE.md | product/tools/lead-watch.sh:383:fresh "STATE.md on $(git rev-parse --abbrev-ref HEAD)"
STATE.md | product/tools/lead-watch.sh:394:so=$(python3 -I "$TOOLS/owed-watch.py" starts --state "$TOOLS/../STATE.md" 2>&1); echo "$so"; act=$((act + $(grep -c '^ACT' <<<"$so")));
STATE.md | product/tools/lead-watch.sh:395:fresh "owed-watch.py starts: STATE.md in this copy"
STATE.md | product/tools/lead-watch.sh:399:fw=$(python3 -I "$TOOLS/founder-wait.py" --state "$TOOLS/../STATE.md" --memory "$STATE_DIR/founder-wait.json" 2>&1); fwrc=$?; echo "$fw"
STATE.md | product/tools/lead-watch.sh:401:fresh "founder-wait.py: STATE.md in this copy, its memory in $STATE_DIR (13d)"
STATE.md | product/tools/owed-watch.py:10:  starts --state STATE.md
STATE.md | product/tools/records-only.sh:35:  t yes "the Lead's records: STATE, DECISIONS, BACKLOG" "$P/product/STATE.md" "$P/product/DECISIONS.md" "$P/product/BACKLOG.md"
STATE.md | product/tools/records-only.sh:38:  t no  "app code" "$P/product/STATE.md" "$S/api/src/core.ts"
STATE.md | product/tools/records-only.sh:43:  t no  "a look-alike name: STATE.md.bak" "$P/product/STATE.md.bak"
STATE.md | product/tools/records-only.sh:45:  t no  "a records name outside product/" "$P/prototype/studio/STATE.md"
STATE.md | product/tools/records-only.sh:51:  got=$(printf '%s\n' "$P/product/STATE.md" | T="$d" is_records 2>/dev/null); rm -rf "$d"
STATE.md | product/tools/session-start.sh:25:ctx=$(echo "$head"; [ -n "$behind" ] && { echo; echo "$behind"; }; echo; echo "--- product/STATE.md ---"; cat "$PH/STATE.md")
STATE.md | product/tools/takeover.sh:10:echo "lead  $(grep '^current_lead: ' STATE.md | sed 's/^current_lead: //')"
STATE.md | product/tools/takeover.sh:12:ho() { git log -1 --format=%H -i --grep='hand-over' -G'^current_lead: ' "$1" -- STATE.md 2>/dev/null; }
STATE.md | product/tools/test_cockpit_data.py:86:        asks, _, _ = cd.state_needs(cd.Snap(FIX).file("STATE.md"))
STATE.md | product/tools/test_cockpit_data.py:642:        put("STATE.md", "s0\n"); put("BACKLOG.md", "b0\n"); git("add", "-A"); git("commit", "-qm", "base")
STATE.md | product/tools/test_cockpit_data.py:644:        put("STATE.md", "s1\n"); git("commit", "-qam", "lead 1", at="2026-11-11T10:00:00+05:30")
STATE.md | product/tools/test_cockpit_data.py:647:        put("STATE.md", "s1\n"); put("BACKLOG.md", "b1\n"); git("commit", "-qam", "records rebuilt on main", at="2026-11-13T10:00
STATE.md | product/tools/test_cockpit_data.py:650:        put("STATE.md", "s2\n"); git("commit", "-qam", "lead 3", at="2026-11-14T10:00:00+05:30")
STATE.md | product/tools/test_cockpit_data.py:655:            self.assertEqual((n, [f["path"] for f in files]), (1, ["STATE.md"]))   # BACKLOG's b1 is on main; STATE's s2 is not
STATE.md | product/tools/test_cockpit_data.py:657:            put("STATE.md", "s1\n"); git("commit", "-qam", "lead 4: back to main's version", at="2026-11-14T12:00:00+05:30")
STATE.md | product/tools/test_cockpit_data.py:765:        return {"id": rid, "ask": text, "status": status, "src": "STATE.md › Founder asks", "names": cd.item_ids(f"{rid} {text}
STATE.md | product/tools/test_cockpit_data.py:768:        needs, lq = cd.needs_split([self.ask("A67")], None, None, self.Q, True, "STATE.md", "GitHub", self.LIN)
STATE.md | product/tools/test_cockpit_data.py:1532:             "| A5, A7 | earlier asks | done or superseded (Lead 52, 15 Nov; nothing waits on him); row in `history/x.md` |\n"  
STATE.md | product/tools/test_cockpit_data.py:1543:        needs, _ = cd.needs_split(asks, forf, wait, [], True, "STATE.md", "g", today=date(2026, 11, 15))
STATE.md | product/tools/test_cockpit_data.py:1853:        self.assertIsNone(run(snap_with(drop=["files/" + cd.REL + "/STATE.md"]))[1]["behaviour"]["founder_asks_day"]["value"])
STATE.md | product/tools/test_cockpit_data.py:1854:        # review Major 1: the fixture table is split by a blank line after A3 (live STATE.md after A82); both scripts read past 
STATE.md | product/tools/test_cockpit_data.py:1856:        st = cd.Snap(FIX).file("STATE.md").replace("| A8 | 18:0x (18 Nov, spoken) older | done |\n",
STATE.md | product/tools/test_cockpit_data.py:1858:        d = snap_with({"files/" + cd.REL + "/STATE.md": st})
history/ | .claude/skills/qa/SKILL.md:30:**Against requirements and decisions:** every capability row names its sources (SA-1B / one-pager IDs from P/`history/TRACE-SA01B-2026-10-23.md`, P-decisions). For each, check the behaviour 
history/ | .claude/skills/qa/SKILL.md:41:* **P/`qa/BUGS.md`** — open findings only: QA-n · **type** (Bug: built but wrong · Gap: requirement or decision not met or not built · Conflict: behaviour, requirement and decision disa
history/ | AGENTS.md:11:9. **Start read (P-545):** start from `product/RULES.md` and `product/STATE.md`, plus your own backlog row. Open `DECISIONS.md` only for a row you need by number (rows are never deleted); never read `product
history/ | product/tools/check-docs.sh:32:    b=$(wc -c < "$S"); [ "$b" -gt 12288 ] && echo "STATE TOO BIG ($((b / 1024)) KB > 12 KB): move the earlier page to product/history/STA
history/ | product/tools/check-docs.sh:40:    elif [ -n "$t" ] && [ $((t - a)) -gt 3 ]; then echo "RULES LAG: RULES.md is as of P-$a but DECISIONS reaches P-$t ($((t - a)) rows be
history/ | product/tools/check-state-page.sh:3:# every Lead re-read it); the earlier page goes to product/history/. 7 (E9, P-302, now a failure): check-docs.sh fails when
history/ | product/tools/check-state-page.sh:16:ok "STATE over 12 KB fails and names product/history/" "$([ $r = 1 ] && echo "$out" | grep -q 'STATE TOO BIG.*product/history/' && 
history/ | product/tools/cockpit-data.py:4933:                    "src": bugs_src, "closed_total": V(len(closed_rows), "qa/BUGS-CLOSED.md rows (older rows are in history/)"),
history/ | product/tools/known-failures.tsv:7:size-state	size:STATE.md	11776	STATE.md is near its 12 KB wall: move the earlier page to product/history/ before the next records PR	
history/ | product/tools/test_cockpit_data.py:774:        needs, _ = cd.needs_split([], "F2, F8 open (demo looks); F14-F19 ruled; word for word in `history/x.md`.", None, [], True
history/ | product/tools/test_cockpit_data.py:780:        pointer = "today's items are in hand-over item 0; the 13 Nov line word for word in `history/x.md`."
history/ | product/tools/test_cockpit_data.py:1532:             "| A5, A7 | earlier asks | done or superseded (Lead 52, 15 Nov; nothing waits on him); row in `history/x.md` |\n"  
lanes/ | .github/workflows/test-graph.yml:7:# belongs to ci and nightly, not here). Coverage slows suites (lanes/qa.md: timing steps), hence 10 parts and 90 min.
lanes/ | product/tools/lane.sh:78:    m="$MAIN/$P/product/lanes/$ln.md"; [ -f "$m" ] || continue
lanes/ | product/tools/lane.sh:85:    f="$m"; rel="$P/product/lanes/$ln.md"; bestn=""
lanes/ | product/tools/lane.sh:160:      ln=$(cat "$wt/.claude/lane" 2>/dev/null || echo unbound); f="$wt/$P/product/lanes/$ln.md"
lanes/ | product/tools/lane.sh:161:      st=$(field stage "$f"); ow=$(field owner "$f"); mo=$(field owner "$MAIN/$P/product/lanes/$ln.md")
lanes/ | product/tools/scout.sh:35:      "$PP/lanes/scout.md")
lanes/ | product/tools/scout.sh:37:        [ "$(note "$base")" = "$(note "$tip")" ] || { echo "SCOUT: the Lead's note in lanes/scout.md was changed (only the Lead writes it)"; b
lanes/ | product/tools/scout.sh:120:  git add -A -- "$PP/scout" "$PS/tests/scout" "$PP/lanes/scout.md" 2>/dev/null
inbox/ | product/tools/lane.sh:13:#   lane.sh inbox             findings dropped for the Lead: files in product/inbox/ on main and unmerged devin/* branches (inbox/README.md)
inbox/ | product/tools/lane.sh:190:  inbox)  # findings dropped for the Lead (inbox/README.md): files on main, then unmerged devin/* branches.
inbox/ | product/tools/lane.sh:193:    git -C "$HERE" ls-tree --name-only origin/main "$P/product/inbox/" | grep -v -e '/README.md$' -e '/DEVIN-PROMPTS.md$' | sed 's|^|main |'
inbox/ | ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/check_runtime_n7.cjs:1:// N7 (runtime lane; Devin 30 Oct, product/inbox/2026-10-30-devin-d1-walk.md): three findings, each with a passing and
reports/ | .claude/skills/qa/SKILL.md:28:Screenshot each decision point and every defect (`P/qa/reports/<date>-<mode>/`).
reports/ | .claude/skills/qa/SKILL.md:42:* **Report** `P/qa/reports/<date>-<mode>.md` (under 150 lines): verdict, what works, bugs, coverage, journey scores where a screen was walked, what you could not test, **Questions for the Le
reports/ | .claude/skills/screen-concept/SKILL.md:19:4b. **Best in class (founder, 4 Nov):** study how the best products handle this job: case-management tools (`reports/verify-2026-11-03/V4-best-in-class.md`), tax-filing interview
reports/ | .github/workflows/ci.yml:4:#   * notes   (only *.md records and files under product/reports/): check-docs.sh and decision-impact.sh, plus the push
reports/ | product/tools/change-kind.sh:4:#   notes    every changed file is a *.md record or under product/reports/ (none under sources/, code/, archive/, .tools,
reports/ | product/tools/change-kind.sh:20:# Notes: *.md or product/reports/; never an excluded path (the push guard refuses those) or a data .md (prompts, the API's
reports/ | product/tools/change-kind.sh:22:other=$(printf '%s\n' "$files" | grep . | grep -vE "\.md$|^$P/product/reports/" || true)
reports/ | product/tools/check-label-guard.sh:147:git checkout -qb q; sed -i.bak 's/^1$/R1.28 Works/' "$QA/BUGS.md"; rm -f "$QA/BUGS.md.bak"; mkdir -p "$QA/reports/2026-11-19-afte
reports/ | product/tools/check-label-guard.sh:148:echo proof > "$QA/reports/2026-11-19-after-merge-r128-works/README.md"; git add -A; git commit -qm "qa proof"; q1=$(git rev-parse
reports/ | product/tools/check-lead-read-gate.sh:134:f "$PR3/screens/R1.58/payment-shot.png" ""; f "$PR3/qa/reports/x/payment-run.txt" "+x"; put; LRP="$T/lrp.txt" run judge
reports/ | product/tools/check-queue-gate.sh:121:for f in "$S/web/src/runtime/fees.tsx" "$S/api/src/rounds.ts" "$PR3/screens/R1.58/fees.json" "$PR3/qa/walks/payment/walk.cjs" "$PR
reports/ | product/tools/check-queue-gate.sh:125:for f in "$PR3/screens/R1.58/payment-shot.png" "$PR3/qa/reports/2026-11-19-fees/invoice-run.txt" "$PR3/qa/reports/2026-11-19-fees/
reports/ | product/tools/check-queue-gate.sh:129:nofull; prj 7 $HEAD1 false records; files 7 "$PR3/qa/reports/2026-11-19-fees/README.md" "$PR3/qa/BUGS.md"; run label 7
reports/ | product/tools/check-queue-gate.sh:284:nofull; prj 7 $HEAD1 false records; files 7 "$REC/qa/BUGS.md" "$REC/qa/CAPABILITIES.md" "$REC/qa/reports/2026-11-19-after-merge-r1
reports/ | product/tools/check-queue-gate.sh:287:files 7 "$REC/qa/BUGS.md" "$REC/qa/reports/2026-11-19-after-merge-r128-works/README.md" "$S/api/src/form.ts"; HEADS="$HEAD1" run p
reports/ | product/tools/check-select-suites.sh:123:k=$(kind "$Q/product/STATE.md" "$Q/product/reports/build-review-2026-11-03.html" "$S/screens/x/notes.md"); ok "records and repo
reports/ | product/tools/flow-measure.py:8:#      no suite would run); notes only (every file a *.md record or under product/reports/) shown beside it.
reports/ | product/tools/flow-measure.py:101:    return bool(files) and all((f.endswith(".md") or f.startswith(f"{P}/product/reports/")) and not RISKY_MD.search(f) for f in files)
reports/ | product/tools/scout.sh:105:  git push -q -u origin "$BR" && echo "Pushed $BR. Tell the Lead: \"scout pushed $BR\" (reports in $PP/scout/reports/)."
reports/ | product/tools/test_flow_measure.py:163:            stand, note = [f"{fm.P}/product/STAND-INS.md"], [f"{fm.P}/product/reports/x.md"]
reports/ | ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/fixtures/pf23c/README.md:5:These six files are **byte-for-byte copies** of AWS reads. The tech lead copied them read-only from AWS CloudShell (ca
reports/ | ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/fixtures/pff1c/README.md:3:These four files are **byte-for-byte copies** of AWS Step 20's raw outputs. The tech lead copied them read-only from A
reports/ | ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/journeys/j_13.ts:128:  // aws/2026-11-22-staging-proof 69b57dc9d, product/reports/aws-evidence/2026-11-24/ (tests/fixtures/pf23c/README.md).
reports/ | ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tests/journeys/j_65.ts:215:  // for byte from branch aws/2026-11-22-staging-proof bcc9a6665, product/reports/aws-evidence/2026-11-24/r165/ (README).
ops/ | product/tools/check-lead-read-gate.sh:100:line "$S/api/src/platform/ops/routes.ts" "+  @PermissionKeys(\`system/firm:suspend\`)"
RESUME-ON-NEW-ACCOUNT.md | .claude/skills/lead-watch/SKILL.md:51:| Weekly plan | 96 / 98% (P-458) | lanes push after every step · at 96% message every running lane "finish this step, push, stop" · by 98% STATE and `RESUME-ON-NEW-ACCOUNT.md` push
SECOND-MAC.md | ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/tools/new-machine.sh:235:[ -n "$(ls -A "${STUDIO_VALIDATED_DIR:-$TOOLS/validated-imm5257}" 2>/dev/null)" ] || say "note: no Adobe-validated Paper form 
skills | .github/workflows/guards.yml:11:      - ".claude/skills/lead/**"
skills | product/tools/check-lane-preflight.sh:63:grep -q 'lane-preflight.sh' "$ROOTD/.claude/skills/lead/SKILL.md"; ok "skill lead runs lane-preflight.sh be
skills | product/tools/check-lead-cron.sh:29:grep -q 'Its prompt is exactly `run lead-watch; read STATE Start here`' "$ROOTD/.claude/skills/lead/SKILL.md" &&
skills | product/tools/check-lead-gap.sh:52:S="$(cd "$TOOLS/../../../.." && pwd)/.claude/skills/lead/SKILL.md"
skills | product/tools/check-lead-upkeep.sh:157:W="$TOOLS/../../../../.claude/skills/lead-watch/SKILL.md"
skills | product/tools/check-proof-read-watch.sh:43:echo '[{"filename":".claude/skills/lead/SKILL.md"}]' > "$F/files_43.json"
skills | product/tools/lead-watch.sh:4:# Exit code = number of ACT lines; step 15 always adds one, the current constraint (P-738), so 1 = only that. Skill: .
skills | product/tools/lead-watch.sh:298:skills_off=$(for f in .claude/skills/next/SKILL.md .claude/skills/qa/SKILL.md .claude/skills/lead/SKILL.md; do git d
```
