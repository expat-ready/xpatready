# A9: why pull requests lost their place in the merge queue, 24 hours
Lead O 2 for Lead 27. Window 23 Nov 15:58 to 24 Nov 15:58 IST (10:28 UTC). Read-only, US$0.
**Counted:** every `queued` label taken off with no merge within 3 minutes, on PRs updated in the window: 25. Three (#3283, #3323, #3324) were merged four minutes earlier and only tidied, so **22 losses on 20 PRs, against 118 merged PRs** (Mergify's own records and tooling PRs included). A batch that is red and put back without its PR losing the label is not counted.

| Rank | Cause | Losses | PRs | Minutes from loss to merge, each |
|---|---|---|---|---|
| 1= | The PR's own defect, found only by the batch | 7 | 3203, 3291, 3193, 3289, 3209, 3302, 3367 | 349, 142, 675, 155, 478, 117, 102 |
| 1= | Not the PR: main's fault or a test race | 7 | 3321, 3040, 3202, 3366, 3379, 3385, 3421 | 58, 53, 187, 107, 82, 96, open |
| 3= | Conflict with main while waiting | 4 | 3185, 3203, 3312, 3451 | 122, 232, 51, 58 |
| 3= | Label on too early, then off (no batch lost to it: 2 min in the queue on #3408 and #3433; #3209's landing order, #3429's Lead B read, #3433's fixes; #3408 was mine, a draft) | 4 | 3209, 3429, 3433, 3408 | 254 to its next loss, 64, 53, 58 |

The minutes include fixing, review and later losses; they are not queue time alone. Causes are as read by the Leads in the batch logs and from Mergify's own reason; I read #3202's log myself (check_pf4s_system_signin, the race #3366 fixed). #3385 (C9.5) and #3040's pf5s1 step have no proven cause and are placed under "not the PR" because a full run on the same head was green.

## Cause 1: the red was already on the PR
`pr-suites` (report only) ran on the exact head. Its log:
* **6 of 7: the same suite was red there**: 3203 (csw3 census), 3291 (b164), 3193 (pf6a frame), 3289 (csdl3), 3302 (pf30s find box), 3367 (fo6ds).
* #3209: not checked; the head I could match is the later one (green there).
**How often it is red on a good PR:** of the 82 PRs merged in the window whose merged head has a finished pr-suites run that ran suites, **4 have a red suite (5%)**: fo3st3_types twice, pf18ns_bell, pf5s_firm_profile or c83_review (5 reds on 4 PRs, all "failed twice"). So of about 10 red heads, 6 were real. Limits: one day; the check's run must be finished before the PR is queued (not measured here); a PR merged after its fix shows its fixed head.
**Fix 1 (proposed):** the queue gate does not put `review: approved` on by itself while the head's pr-suites has a red suite, or is still running; a comment line `PR suites covered: <suite> <reason>` from the Lead clears it. Report only for 24 h first (the gate's comment names it), then the founder's and your yes to block. One PR in queue-gate.sh, half a day (estimate). #3313, approved and waiting for a Lead's read since 24 Nov 01:18 IST, adds two guards to pr-suites under `--direct` and says the same thing of three more reds; it needs the read, and a rebase check.

## Cause 2: main's fault or a race
Five of the seven have a merged fix: csd5_flags date fault (3321, 3040 partly; #3355), bk3 connection reuse (3379; #3408, hang of 3366 not proven to be the same), pf4s race (3202; #3366), first calls (3421; #3454, merged 14:42 IST). Left without a proven cause: **C9.5** (3385), **pf5s1 keyboard step** (3040), the bk3 hang (3366).
**Fix 2 (proposed):** trace those three from their logs, one fix each, no retries widened (P-502); same-cause.py (#3397) already names a second occurrence. One day (estimate). Then the remaining rate tells whether anything more is needed.

## Next, not proposed now
Conflicts: 2 of 4 are qa/BUGS.md and qa/CAPABILITIES.md rows added at one place by two PRs (#3451, #3312); one file per finding would end them, a records change that is the Lead's. Label timing: 3 of 4 were labelled by the gate before a Lead's order, a Lead B read or a round was settled; the cost was small.
