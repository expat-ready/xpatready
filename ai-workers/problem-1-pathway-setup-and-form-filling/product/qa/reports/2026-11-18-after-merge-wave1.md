# qa after-merge — wave 1 rows, 18 Nov (main 15c75cd52)

**Scope (P-697, P-698):** the 17 wave 1 rows of `design/release1-end-to-end-review-2026-11-18.md` (R1.6, 8, 16, 20, 26, 27, 28, 30, 37, 41, 47, 48, 49, 59, 77, 100, 109). Merges since the last qa round (39c1203cd, `2026-11-18-after-merge.md` on #2117/#2121): **#2003 AUD-1a** and **#2014 PF-8r**. Opus 5.5; isolated copies only; never :4400; live AI off; US$0.

**Duplicate check:** CAPABILITIES on main and the newest qa branches (`claude/qa-after-merge-1118`, `-1118b`) were read first. Those rounds scored R1.6, 20, 28, 41, 48 and 49 (Partial, parts missing) up to 39c1203cd; no row is re-scored here.

## Verdict
**No wave 1 row has all its parts on main yet, apart from R1.77**, which was scored when its last part merged on 17 Nov (Partial: no screen to decide, withdraw, close or reopen; QA-502, gap G3) and has had no merge since. So: **0 rows to Works this round, no new bugs.**

| Merge | Row it touches | Evidence | Row status |
|---|---|---|---|
| #2003 AUD-1a (13:02 UTC) | R1.8 | ci run 44289990575 green (merge batch; tree f7c7371cb = main fa2c6865c's): 8 shards, 5 regression jobs; run 44290020058 green on main 15c75cd52's tree | **Partial (was Not built): parts missing AUD-1b (#2124 open), AUD-1m parts 1, 2a, 2b, PF-0a** |
| #2014 PF-8r (13:09 UTC) | row 14 (restore drill), not a wave 1 row | run 44290020058 green (tree f7630bac8 = main 15c75cd52's); here `check_pf8r_nightly_job.ts` 6/6; `check_pf8r_restore.ts` needs docker (SKIP list; nightly job runs it) | not scored by this session |

## Parts missing per row (P-606; from the review's map, checked against CAPABILITIES and open PRs at ~19:xx IST)
R1.6: PF-6 part 2b, J-6 part 2 · R1.8: AUD-1b (#2124), AUD-1m ×3, PF-0a · R1.16: QA-449 container smoke (no BACKLOG row, gap G10) · R1.20: PF-4c part 2, PF-15 parts 1-2, the Invite screen's batch · R1.26: FO-4b · R1.27: FO-4b, J-27 · R1.28: FO-2 part 3 · R1.30: FO-4 filters and board · R1.37: J-37 · R1.41: FO-3a part 1b (#2103), FO-3st2, J-41 · R1.47: QA-495 senders (gap G4) · R1.48: PF-L, J-48 · R1.49: QA-495, J-49 · R1.59: FO-7b · R1.77: all merged, Partial (QA-502) · R1.100: PF-5t part 2, PF-5v part 2 · R1.109: PF-21i (#2012), PF-21s part 4, J-109.

## What I could not test
* **Independent local re-run of `check_aud1a_insert_only.ts`:** `studio/tools/isolated.sh` refuses to start ("start the demo database first") because this session's sandbox cannot see the Postgres process for `pg_ctl status`, although Postgres answers on 54329 (`pg_isready`). Port 4474 was already answering (another process). GitHub's runs above are the evidence for now; a re-run outside the sandbox is needed before R1.8 can go to Works.

## Questions for the Lead
* None blocking. R1.16, R1.47 and R1.49 cannot reach Works until gaps G10 and G4 have BACKLOG rows.
