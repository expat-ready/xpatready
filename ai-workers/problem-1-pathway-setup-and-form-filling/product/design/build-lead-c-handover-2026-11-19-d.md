# Build Lead C hand-over (3 → 4), 19 Nov 2026 20:3x IST

Written by Build Lead C (3) (Opus 5.5 high; local session; worktree branch `claude/jolly-chatterjee-f02f6d`; pushes records to `claude/build-lead-c-647b40` with git plumbing, because the sandbox makes `.claude/` read-only and a checkout of this branch fails there). It replaces `build-lead-c-handover-2026-11-19-c.md`. The dated log is `build-lead-c-state.md`, and the ordered focus list (P-733/P-734, read by guard ENF-733) is `build-lead-c-p733-list-2026-11-19.md`. Keep both current. Times are IST.

**Current Lead:** Lead 95, `local_98ab55d2-14dd-45cb-90d8-3bd03b26ec61` (since 20:2x IST). Check `product/tools/current-lead.sh`.
**Target (P-740, founder):** Release 1 on 29 Nov; 89 of 101 left, so about 9 Proven a day. qa has 4 lanes; qa 8 and qa 10 (cloud) cover the case side and client money.

## How I work (what worked)
* Records commits use plumbing, never a checkout: `GIT_INDEX_FILE=$TMPDIR/idx git read-tree <branch head>`, then `update-index --cacheinfo` and `commit-tree`, then push `"${C}:refs/heads/claude/build-lead-c-647b40"`. A plain `git checkout` of that branch here half-fails on `.claude/` and must never be committed.
* GitHub: `gh` over TLS fails in the sandbox. Use `curl -H "Authorization: Bearer $(gh auth token)"` against `api.github.com`, with `allowed_domains: ["api.github.com"]` (and `github.com` for git).
* Watches (scripts in `$TMPDIR`; rewrite them if gone): `mergewatch.sh` (env PRS; exits on a merge or head change), `approvewatch.sh <pr> <head>` (anchored `^Reviewer: Approve <sha>`), `prwatch.sh '<regex>'` (a new open PR).
* The queue gate bot (B194) labels a PR by itself when an anchored Approve names the head, ci is green and no path needs the Lead's read. Paths that need the read (migrations, .mergify.yml) wait for the Lead.

## Items (20:3x IST)
| Item | PR / lane | State | Next |
|---|---|---|---|
| R1.80 IRCC forms | #2235 merged 18:06 | proof due | qa 8 (C7.2 gate A walk, runs 44532804494/44532809449); qa 6's records PR #2283 |
| R1.77 decide/close | #2263 J-77 merged 19:50 | proof due | qa 8 (walks.yml runs 44543164065/44543169280) |
| R1.74 deadlines | #2000 merged 20:24 | trigger sent | **CS-DL1b with J-74** fresh lane (`CS-DL1b.md`); proof at its merge |
| R1.67 file type | #2253 queued (3a2b58918) | — | proof at merge; **same lane then CS-D1 part 1** (R1.65, `CS-D1-1.md`; typed by Lead 94) |
| R1.72 case+applicants | #2255 FO-8 queued (0f1a6ad1a) | — | same lane: CS-K1 part 2 with J-72 (`CS-K1-2.md`) |
| R1.8 audit | #2289 2a queued (30af9c467, diff-only Approve) | gate labels on green | lane task_8b2e00b1: 2b built on `claude/zen-brown-c0s4iz-2b` (identity + PF-0a tests, d812df3b, in review) → **2c** settings: ruling **(A1)** (200-char pieces that join back; reason cut in detail only; 5 Lead B test lines incl. pf4:485; pass: 320-char hours byte-for-byte; fail: piece >200 or >50 items). Order on settings.ts: #1961, PF-19b part 3, then 2c. R1.8 + PF-0a complete at 2c, with J-8 |
| R1.59 money | #2204 queued (4d438586c, migration 080000) | — | one lane: FO-7ts-3 (Lead reads the pick-guard SQL plan first) → FO-7b → FO-7g with J-59 (needs a cited tax table) |
| R1.10 inputs | — | brief `CS-V1-3.md` (5 methods, one PR; Bake tag lifted) | trigger #2289 merge |
| R1.88 audit log | — | brief `AUD-4.md` (AUD-4 API, then AUD-4s part 2 with J-88) | starts at the founder's next typed turn. **Owed by me: `product/screens/AUD-4s/concept.md`** from `concept-draft.md` + `challenge.md` (7 Majors: M1 people source, M3 read-back sentence, M4 support-session lines need AUD-3b, M6 stale integrity, M7 keyboard/focus, and the rest) — before the screen starts |
| R1.3 walls | — | `CS-W3-0.md` spike (records) | starts at the founder's next typed turn |
| R1.76 notes | — | `CS-NT1-1.md` (4 parts) | starts at the founder's next typed turn; shares a runtime.ts hook and a notifications.ts line |
| CS-NK1 bug | #2101 | fixer B: merge main, re-stamp (was 20261117123500), diff-only Approve, Lead's read | watch it |
| R1.105 keep periods | `J-105.md` | no AUD-2 needed (Lead 94) | trigger: Lead B's PF-5 90-day close + PF-11c + PF-11 export all merged |
| R1.97 chain | #2129 AUD-1c p1 parked (P-707); `AUD-2.md` | not ready | Lead's call to unpark |

Main's newest migration at 20:26: `20261119071700`. #2204 (080000) and Lead B's #2252 (081500) are later.

## Owed
* AUD-4s `concept.md` (above).
* A case-side row later: `case.opened` for a directly opened case (FO-8 question 5).
* The c617 line-82 timeout of batch #2266 is unexplained. If it recurs, name that batch's PRs to the Lead.
* Tell AUD-1m 2c's lane that AUD-4's `render.ts` has one pair reader for its pieces shape, if AUD-4 merges first.

## Update 20:3x IST
* 20:3x IST 19 Nov (Lead 95): **all six lanes were started by Lead 94 at 20:2x IST**: CS-DL1b task 8bc196a8 (so the #2000 trigger is covered), R1.59 FO-7ts-3 chain 55053d4c, CS-V1-3 6f5812c2, CS-W3-0 30f05df7, CS-NT1-1 7f4564af, AUD-4 bb3d9c73. Do not ask for them again. Build Lead C (4) starts from hand-over d at the founder's next typed turn. Lead 95 owes the pick-guard SQL plan read (when #2204 merges) and the #2101 migration read. Next: watch for their first PRs.
* 20:3x IST 19 Nov: **#2303 CS-W3 part 0 rev 3** (records only, one file `design/cs-w3-spike-2026-11-16.md`, 00b508ab1, Approve on the head; the gate labels it on green). Re-census on main: 42 files. Findings: `core.ts` `Audit.log` `caseIdOf` reads `case`, so under the walls with no firm an audit line silently loses its case id (tell AUD-1m 2b/2c and CS-W3 part 1); `person-link.ts` finds the firm by a case read that is blind under the walls (part 1's link door fixes it); `clients.ts`' real table is `case_client_counter`. **Owed: `CS-W3-1.md`** from the PR's proposed part 1 brief lines, after #2303 merges.
* 21:0x IST 19 Nov: **Lead B (7) bug (PF-15c breaker, #2307 comment 7013468221):** `CaseClose.reopen` skips the plan limit and the opening lock, so a reopen can take a firm over its case limit. Shaped as bug row **CS-C1r** (`CS-C1r.md`): one `checkOpening` shared by createCase and reopen; the advisory lock before the row lock; the same EntitlementPort binding; DW1-DW4 (409 at limit, group, race, one rule); ready after #2307 and #2289 (both change case-close.ts or the binding). **Lead B's R1.72 rows:** FO-2w (Signed offline raises prospect.won) is IN R1.72's chain before proof (J-72 walks both wins; CS-K1-2 opens after FO-2w); FO-5rp and FO-2u are follow-ups after proof. CS-K1-2.md updated.
