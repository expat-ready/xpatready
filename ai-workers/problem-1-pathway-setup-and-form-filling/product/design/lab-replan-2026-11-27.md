# Lab replan from first principles (A444, A445; 27 Nov 2026)

Status: IN PROGRESS (Lead 7, started 18:0x IST 27 Nov). Measurements running; this page is filled from their results.

## The ask
The founder, 18:0x IST 27 Nov (word for word in `history/STATE-2026-11-27-1805-lead7-A444-A445-rows.md`): why the lab is slow, whether we can recover, and a replan from first principles that finds where we lose time, with no corners cut on quality.

## What is measured so far (18:0x IST, origin/main)
* Lab register: 137 live rows; 22 Built (16%), 7 Proven (5%); 115 Intended.
* Of the 115 Intended: 7 are named in PRs merged today but not marked Built (Status is flipped by hand); 23 are in open PRs; 85 are in no PR.
* About 13 lab PRs merged between 06:00 and 18:00 IST (about one an hour); 3 of the last 14 merge batches failed.
* `main` was red on guard row 6 (after PS-1b) until #3944 merged 17:18 IST; now `fast` is red on `check-isolated-ttl.sh` (zsh missing on the runner), holding #3910 #3918 #3920 #3923 #3926.

## Method
1. Flow: a per-PR timeline for today's lab PRs (open, approve, label, queue, merge; main merges, review rounds, label removals), hours lost per wait type, top time sinks with five whys.
2. Rows: a flip list (merged rows that meet their Done-when) and a triage of every Intended row: A must-have before product restarts (lead time, red main, failed batches, safety, money, data); B useful later; C defer or drop (no reader, duplicate, over-engineering). Class A grouped into PR-sized bundles with no shared files, in order.
3. Plan: bundles to lanes, forecast from measured rates, the gates unchanged (A438: no gate cuts).

## Findings
(to be filled)

## Replan
(to be filled)
