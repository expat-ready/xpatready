# Build Lead C hand-over (2 → 3), 19 Nov 2026 17:27 IST

Written by Build Lead C (2) (Opus 5.5 medium; worktree branch `claude/build-lead-c-2-89c29d`; pushes to `claude/build-lead-c-647b40`) at 45% context (P-565 (2)), on Lead 94's word. It replaces `build-lead-c-handover-2026-11-19-b.md`. The dated log is `build-lead-c-state.md`. The ordered focus list (P-733; it feeds P-734's guard ENF-733 until the evening of 22 Nov) is `build-lead-c-p733-list-2026-11-19.md`: keep it current. Times are IST from `TZ=Asia/Kolkata date`.

**Current Lead:** Lead 94, `local_8d88d9c8-bb18-4895-af87-797aa32c61bf`. All reports and questions go there by SendMessage to that id. Lead 94 starts Build Lead C (3) at the founder's next typed turn.

## Rules that bit today
* **P-731 (2) / P-733 (4):** a PR that failed a merge batch is relabelled only after its failing suites are named and covered. A PR's own `ci` is the fast check, not the full run. When asking for a relabel after a failed batch, give the batch, the failing suite and the fix.
* **P-733:** work the items nearest to done, one lane per item. PRs stay near 800 lines. An item's parts run back to back in one lane, with the J-test in the last PR. Proof is automatic at the last merge (#2233); qa walks money, permissions, walls, schema and IRCC forms.
* **P-737:** password-protected PDFs are refused as the app's own rule, never called IRCC's.
* **Lane starts happen at merge triggers**, in a founder-typed turn. Tell the Lead the moment a trigger PR merges.
* **Old-account cloud lanes are gone** (e.g. the money lane `session_018BSQ…`). The Lead re-homes work to fresh lanes or card-conflict fixer B.
* **Migration stamps:** when main moves, check each open PR's migration is still later than main's newest. Main's newest at 17:2x is `20261119051500`; #2000 has `20261119071700`, #2204 has `20261119080000`.
* **Only push to your own branch.** For a lane's branch, post the instruction on its PR and ask the Lead to type it into the lane (cloud lanes may not read PR comments).
* **"Reviewer: Approve" counts only as a line of its own** (anchored at a line start). Lanes quote it in "follows if it agrees" sentences.

## Items (17:27 IST)
| Item | PR | Head | State | Next |
|---|---|---|---|---|
| R1.80 IRCC forms | #2235 evidence | 16286b647 | queued | auto proof at merge; qa 4 proves it; Lead dispatches nightly C7.1/C7.2/C7.8 on main's head (P-439) |
| R1.77 decide/close | #2263 J-77 (last part; #2169 merged 15:20) | 6ef02a932 | queued | auto proof at merge |
| R1.74 deadlines | #2000 CS-DL1 part 1 | bd19821aa (migration 071700) | queued | **trigger: CS-DL1b with J-74** (`CS-DL1b.md`), fresh lane |
| R1.8 audit | #2214 AUD-1m part 1 | 7b68d9cdc | queued | **trigger: AUD-1m 2a then 2b with J-8 and PF-0a** (`AUD-1m-2.md`), fresh lane |
| R1.67 file type | #2253 CS-D1t + J-67 | 3a2b58918 | queued (batch #2266's c617 fixture fixed) | auto proof at merge; follow-ups in CS-D1 part 1 |
| R1.72 case + applicants | #2255 FO-8 | 0f1a6ad1a | queued (batch #2267 fixes: mergify scope, zod body) | its lane goes straight on to **CS-K1 part 2 with J-72** (`CS-K1-2.md`; adds live delivery, a BYPASS_USES line the Lead reads, two Minors from FO-8's reviews) |
| R1.59 money | #2204 FO-7ts part 2 | ed15879a4 (migration 080000) | **labelled but dequeued**: types red from a pre-#2250 run; fixer B is merging main | then FO-7ts-3 (DW28-30 added), FO-7b, FO-7g with J-59, behind the nearer items, fresh lane |
| R1.10 inputs | CS-V1 PR 3 | — | no brief; after AUD-1m 2a | write the brief |
| R1.65 storage | CS-D1 parts 1-2 | — | shaped (`CS-D1-shaping.md`: flags column, 25 MB, per-case reader cap, line-state order, note wording) | after the nearer items |
| R1.105 keep periods | #2197 merged | — | J-105 waits on Lead B's PF-11 and PF-11c; AUD-2 is mine | — |

**Owed or open:**
* Lead B rows from FO-8 (Lead 94 passed them on): paper-signed wins should raise `prospect.won`; a read port for the signed retainer version; undoConvert refused once a case exists.
* A case-side row later: `case.opened` for a directly opened case (FO-8 question 5).
* The bisect of batch #2266: check_c617's line-82 timeout (the Passport line never appeared) did not reproduce on #2253 plus main. The suspect member is unknown; I asked Lead 94.
* Briefs not yet written: CS-V1 PR 3, CS-D1 part 1, J-105, AUD-2.

## Watches (end with this session; restart in the new one)
* `$TMPDIR/mergewatch.sh` (env `PRS="2000 2204 2214 2235 2253 2255 2263"`): wakes on a merge or head change.
* `$TMPDIR/approvewatch.sh <pr> <old-head|none>`: wakes on a new head with an anchored "Reviewer: Approve <head>".
* `$TMPDIR/prwatch.sh '<regex>'`: wakes on a new open PR whose title or branch matches.
* `scratchpad/gh.sh <api path>`: curl with `gh auth token`; allow `api.github.com`. Posting a comment: POST JSON to `issues/<n>/comments`. zsh refspecs: `"${C}:refs/…"`.
