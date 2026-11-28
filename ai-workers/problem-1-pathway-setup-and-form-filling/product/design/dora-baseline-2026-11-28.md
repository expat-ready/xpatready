# DORA baseline before the switch: 7 days to 28 Nov 00:00 IST (LR-097, lab bundle A6)

The numbers the switch (A10, LR-072) is judged against. Every value below was measured from GitHub or main's git history
on 28 Nov 2026 (cloud session, read-only, US$0); none is estimated. Each names the exact tool or API query, so anyone can
run it again and get the same number (runs that were still open at measuring time can move a count by one).

* **Window:** 21 Nov 2026 00:00 IST → 28 Nov 2026 00:00 IST (`2026-11-20T18:30:00Z` .. `2026-11-27T18:30:00Z`), 7 days.
* **Main at measuring:** `5eb375d1c61c667ccad711b40e29664bb7e3883d` (origin/main, 28 Nov 03:32 IST).
* **Deployment (ours, LR-097):** a merge to main. Every merge starts `demo-update.yml` (`on: push` to main), which moves
  the founder's demo (:4400) to the new main. There is no production deploy yet. A demo-update run that is cancelled was
  replaced by a newer merge's run (`cancel-in-progress`), so the demo still reached that merge.

## The five DORA values

| # | DORA metric | Baseline value | Tool or query |
|---|---|---|---|
| 1 | Deployment frequency | **575 merges to main = 82.1 a day** (app code: 238 = 34.0 a day) | A |
| 2 | Lead time for changes | **median 3.0 h, p90 23.9 h** (first commit → merge, n = 575 PRs) | A |
| 3 | Change failure rate | **1% (3 failures / 238 app-code deployments)**: 2 reverts, 1 capability Works → Partial. Second reading, the deploy job: **86 of 435 finished demo-update runs failed (19.8%)** | A; B |
| 4 | Time to restore (failed deployment recovery time) | **median 15.9 h, n = 1** (too few to judge; the 2 reverts have no readable start, see the limits). Second reading, the deploy job red → green: **median 0.3 h, longest 20.1 h, n = 12** | A; B |
| 5 | Deployment rework rate | **6% (37 of 575 merges were fixes or reverts)** (proxy: titles starting Revert, fix, hotfix, or naming a regression or a qa bug) | A |

The two readings of rows 3 and 4 disagree widely. Reverts and regressions (tool A) count a change that had to be undone.
A red deploy job (query B) counts a merge whose demo did not update or failed its smoke walk, for any reason, including the
runner. Which reading the switch is judged on is a question for the tech lead on this file's PR. Both stay measured.

## The 7-day flow numbers

| Measure | Value | Tool or query |
|---|---|---|
| Merges to main | **575** first-parent merge commits (tool A); **588** PRs merged in the window (tool C: GitHub's merged PRs, which also counts PRs merged outside main's first-parent line) | A; C |
| Merge-queue batches | **748 batch runs finished: 518 green, 230 failed (30.7%)** | D |
| Batch failures by IST day (green / failed) | 21 Nov 111 / 54 · 22 Nov 88 / 60 · 23 Nov 62 / 28 · 24 Nov 97 / 37 · 25 Nov 88 / 44 · 26 Nov 36 / 1 · 27 Nov 36 / 6 | D |
| Approved → merged | **median 44 min, p90 152 min; 63.4% under 1 h** (n = 582; target under 1 h) | C |
| Records share of merges | **36.4%** (214 records-only of 588; 26 notes only) | C |
| Main red time (deploy job) | **29.3 h of 168 h (17%)** in 12 red spells; none open at the window's end. Longest: 21 Nov 09:00 → 22 Nov 05:07 IST (20.1 h; runs 44861367776 → 44961670003), 23 Nov 04:35 → 10:28 IST (5.9 h; runs 45081228478 → 45114853208) | B |
| Deploy job runs on main | 574 runs: success 349, failure 86, cancelled (replaced by a newer merge) 139 | B |
| Review rounds (code PRs merged) | median 2, mean 2.62; 40.6% over 2 rounds (n = 374) | C |
| Queue bounces | 244 dequeues of 184 PRs | C |

Main has no `ci.yml` run on a plain push (P-85): main is tested by the merge-queue batch before each merge and by the
nightly. "Main red" here is the deploy job (demo-update, with its health check and smoke walk), the only check that runs on
every push to main.

## The queries

**A: `tools/measures.py`** (DORA five, from main's git history; demo-update counts from the runs API).

```bash
git fetch --shallow-since=2026-10-20 origin main
python3 -I ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/measures.py --days 7 --until 2026-11-27T18:30:00Z --ref 5eb375d1c61c667ccad711b40e29664bb7e3883d --line
```

If the fetch fails on a clone that is already shallow (`error in object: unshallow`), the tool still runs when its
history check passes. Its output on 28 Nov (tabs shown as `|`; without `--line` the same values print as a block): `deploys 575 (82.1/day), app 238 (34.0/day) | lead time median 3.0 h p90 23.9 h (n 575) | change
fail rate 1% (3/238) | recovery median 15.9 h (n 1, open 0) | rework rate 6% (37/575) | newly Works 42 (6.0/day), net
+42, 67/110 | tokens unreadable (cockpit/usage-log.tsv has no reading in the window; last 15 Nov 22:04 IST) | deploy job
cancelled 139, failure 86, success 350`. The three failures: revert of cf67c2bde (merged 27 Nov 22:23 IST), revert of
4d2170774 (27 Nov 15:29 IST), R1.53 Works → Partial (24 Nov 16:14 IST, Works again 25 Nov 08:07 IST).

**B: demo-update runs on main** (GitHub REST, read-only), then the red spells:

```bash
for p in 1 2 3 4 5 6 7; do curl -sS "https://api.github.com/repos/<owner>/<repo>/actions/workflows/demo-update.yml/runs?branch=main&event=push&per_page=100&page=$p&created=2026-11-20T18:30:00Z..2026-11-27T18:30:00Z" | jq -c '.workflow_runs[]|{id,created_at,updated_at,conclusion}'; done > du.jsonl
```

```python
# red spells: runs in creation order, cancelled ones skipped; a spell runs from the first failure's end to the next success's end
import json, statistics; from datetime import datetime
t = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
rs = [r for r in sorted(map(json.loads, open("du.jsonl")), key=lambda r: r["created_at"]) if r["conclusion"] in ("success", "failure")]
spells, start = [], None
for r in rs:
    if r["conclusion"] == "failure" and start is None: start = t(r["updated_at"])
    elif r["conclusion"] == "success" and start is not None: spells.append((t(r["updated_at"]) - start).total_seconds() / 3600); start = None
print(len(spells), round(sum(spells), 1), round(statistics.median(spells), 2), round(max(spells), 1))   # 12 29.3 0.3 20.1
```

Change failure rate, second reading: failure / (success + failure) = 86 / (349 + 86). Tool A read 350 successes in the
same window (one run at the window's edge); the share is 19.8% either way.

**C: `tools/flow-measure.py`** (merged PRs, labels, review rounds, queue bounces):

```bash
python3 -I ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/flow-measure.py --since 2026-11-20T18:30:00Z --until 2026-11-27T18:30:00Z --max-runs 3000 --json
```

Fields used: `merged`, `records_merged`, `notes_merged`, `records_share`, `approved_to_merged_min`, `review_rounds`,
`queue_bounces`. Not used: its run-based fields (`pr_check_hours`, `thrown_share`, `queue_runs`, `queue_failed`), because
GitHub's runs list returns at most 1000 runs per query (`runs_read: 1000`) and the window had 4527 ci.yml runs: those
fields cover only the newest 1000 (from 26 Nov). Query D replaces them for batches.

**D: merge-queue batches** (ci.yml runs on `mergify/merge-queue/` branches), one query per IST day to stay under the
1000-run cap (the daily totals were 754, 828, 724, 865, 795, 297, 264):

```bash
for d in 0 1 2 3 4 5 6; do
  s=$(date -u -d "2026-11-20T18:30:00Z + $d day" +%FT%TZ); e=$(date -u -d "2026-11-20T18:30:00Z + $((d+1)) day - 1 second" +%FT%TZ)
  for p in $(seq 1 10); do r=$(curl -sS "https://api.github.com/repos/<owner>/<repo>/actions/workflows/ci.yml/runs?per_page=100&page=$p&created=$s..$e")
    echo "$r" | jq -c '.workflow_runs[]|{id,head_branch,conclusion,created_at}' >> ci.jsonl; [ "$(echo "$r" | jq '.workflow_runs|length')" -lt 100 ] && break; done
done
jq -r 'select(.head_branch|startswith("mergify/merge-queue/"))|.conclusion' ci.jsonl | sort | uniq -c   # 230 failure, 518 success
```

`<owner>/<repo>` is this repository (`git remote get-url origin`; no names in project files).

**`tools/flow-constraint.py`** was run too (`--now 2026-11-27T18:30:00Z`). It measures the last 6 hours, not 7 days, and
from a cloud session its merge, stages, waiting and rate measures read "not measured" (GitHub GraphQL refused through the
proxy, HTTP 403). What it did read for 27 Nov 18:00 → 28 Nov 00:00 IST: 17 batches, median 10 min, 0 failed. It is the
per-check constraint tool, not a source for this baseline.

## Limits of this baseline (each found while measuring)

* **Revert start times (tool A):** both reverts name a branch commit, not a first-parent merge, so `measures.py` cannot find
  when the reverted change reached main: their recovery time is missing and row 4 has n = 1. This is in the tool as
  merged (pre-existing), not in this file.
* **Tokens per proven capability** is unreadable this week: `cockpit/usage-log.tsv` has no reading after 15 Nov.
* **Lead time** ends at the merge. The few minutes from the merge to the demo answering are not added.
* The window's first day (21 Nov) includes a 20.1 h red spell of the deploy job, which weighs on the main red time.

## After the switch

The same queries over a 7-day window after the switch lands, compared row by row with this file. DORA's own guidance: the
metrics are not targets and not for ranking teams. The cto-review skill (`.claude/skills/cto-review/SKILL.md`) reads
this file for our side's five.
