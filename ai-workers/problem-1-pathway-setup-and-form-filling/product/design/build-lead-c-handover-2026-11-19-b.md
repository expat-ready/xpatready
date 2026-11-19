# Build Lead C hand-over (2), 19 Nov 2026 ~13:5x IST

Written by Build Lead C (2) (Opus 5.5, worktree branch `claude/build-lead-c-2-89c29d`, pushes to `claude/build-lead-c-647b40`). It replaces `build-lead-c-handover-2026-11-19.md`. The dated log is `build-lead-c-state.md`; the ordered focus list (P-733, feeds P-734's guard ENF-733) is `build-lead-c-p733-list-2026-11-19.md`. Times are IST from `TZ=Asia/Kolkata date`.

**Current Lead:** Lead 93, `local_ce66c66a-3387-466b-9cfa-bcbc781648bd` (since 13:5x IST). Leads 90 to 92 have ended.

## Rules in force (beyond P-719 to P-728)
* **P-731 / P-733 (4):** a PR that failed a merge batch is relabelled only after a green full run on its new head, with every failing suite of that run named. A PR's own `ci` is the fast check, not the full run. Until CI-PRE lands, this is done by hand.
* **P-733 (founder 12:28):** lanes work the items nearest to done, one lane per item until Proven. PRs stay near 800 lines; an item's parts run back to back in one lane, with the J-test in the last PR. Proof is automatic at the last merge (#2233); qa walks money, permissions, firm walls, schema and IRCC forms.
* **P-734:** P-733 runs to the evening of 22 Nov. A guard refuses a brief whose R1 item is off the focus list: keep the list file current.
* **Lane starts happen at merge triggers, in a founder-typed turn (the Lead asks the founder).** Tell the Lead the moment a trigger PR merges.
* **Migration stamps:** when main moves, check every open PR's migration is still later than main's newest (this bit #2000 and #2204 today).

## Items (state at ~13:5x IST)
| Item | PR / lane | State | Next |
|---|---|---|---|
| R1.80 IRCC forms | #2235 (evidence, `claude/r180-adobe-evidence` 16286b647) | queued | auto proof on merge; qa walks it |
| R1.77 decide/close | #2169 39d3310a3 | queued (Approve; P-731 (2) line posted) | **trigger: J-77** (`J-77.md`, `claude/j77-journey` c81ed249d) |
| R1.74 deadlines | #2000 bd19821aa (migration 20261119071700) | queued | **trigger: CS-DL1b with J-74** (`CS-DL1b.md`) |
| R1.8 audit | #2214 7b68d9cdc | queued | **trigger: AUD-1m 2a then 2b with J-8 and PF-0a** (`AUD-1m-2.md`) |
| R1.59 money | #2204 ed15879a4 (migration 20261119080000) | queued after Lead 92's read | then FO-7ts-3, FO-7b, FO-7g with J-59 (behind the nearer items; no second money lane); Lead 91's three read notes are in FO-7ts-3 (DW28-30) and FO-7b |
| R1.67 file type | #2253 CS-D1t, 8a1f42b03 | Approve, NOT ready: no damaged-PDF check; pr-rules red (body lacks "Done when") | my comment 7003542377 asks for the PDF check in this PR, plus a breaker round and the Done-when section; Lead 92 asked to type it into the lane |
| R1.72 case + applicants | cloud lane: FO-8 then CS-K1 part 2 with J-72 | running, no PR yet | `FO-8.md` (Lead 91 meant to read it first), `CS-K1-2.md` |
| R1.10 inputs | CS-V1 PR 3 | no brief; after AUD-1m 2a | — |
| R1.65 storage | CS-D1 parts 1-2 | shaped (`CS-D1-shaping.md`; part 1 gains `flags` and 25 MB) | after the nearer items |
| R1.105 keep periods | #2197 merged | J-105 waits on Lead B's PF-11 and PF-11c (AUD-2 is mine) | — |

Batches #2245 and #2246 failed on a pipeline fault (tsc out of memory). Lead 92 lands an 8 GB heap fix and requeues; no lane changes code for it.

## Watches (background, in `$TMPDIR`; they end with this session)
* `mergewatch.sh` (env `PRS`): wakes on a merge, head change or dequeue of #2000, #2169, #2204, #2214, #2235. Restart it after each wake.
* `approvewatch.sh <pr> <old-head>`: wakes when a new head has a matching "Reviewer: Approve". Running for #2253.
* `prwatch.sh '<regex>'`: wakes when an open PR's title or branch matches. Running for FO-8 / CS-K1 part 2.
* GitHub API helper: `scratchpad/gh.sh <path>` (curl with `gh auth token`; needs `api.github.com` allowed). zsh: write refspecs as `"${C}:refs/…"`.

## R1.80 clean-up done
Database `xr_studio_r180` was dropped, and `/private/tmp/claude-501/r180` removed except `out/` (the PDFs are kept). The screenshots are in the private notes.
