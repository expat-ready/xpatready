# Wake on merge: design (Lead O 2, 24 Nov 13:35 IST). Design only, nothing built, US$0

**Need (founder, through Lead 25):** when a pull request merges, the lane that waits for it starts its next step without a person noticing first. Today a merge wakes nobody.

**Duplicate check (origin/main fa337044c):** `proof-read-watch.py` (a): a merged "Completes:" with no qa PR after 30 min is an ACT. `sle-watch.py` L: an open PR quiet 30 min. `app-view-check.sh` (A334): a cloud lane idle 10 min with work left. `owed-watch.py` starts: starts owed at a typed turn. `lane-cleanup.py`: lanes whose PRs all merged. `comment-run.yml`: a comment starts test runs, not sessions. **None links a merge to who waits for it.**

**What limits it (our own records, not re-tested today):** an idle cloud lane does not act on a message from another session; only text typed in its claude.ai prompt box wakes it (the Lead does that). New sessions start only in a founder-typed turn. So "wake" today means: the Lead types, and the tool says whom, why and what to type.

| Option | How | Wakes by itself? | Cost and risk |
|---|---|---|---|
| A. Merge line in the Lead's check | `merge-wake.py`: each PR merged since the last check, who waits for it, the words to type | No, the Lead types; at most one check late (10 min) | Small; report only; the Lead's check must run main's tools |
| B. A GitHub workflow on merge comments on the waiting PRs | The session that owns a PR may be woken by its PR's activity | **Unknown for our cloud lanes; must be tried first** | A write token (comments) in CI; a comment is public; noise |
| C. A scheduled or event-started cloud routine | One small session per merge looks and acts | Yes | Plan usage for every merge (about 25 to 40 a day); a new session per merge; the founder's yes |
| D. Our own service with a key | Not looked at | | New vendor and cost: out |

**Recommendation: A now; try B by hand on one lane; not C.** A removes the part that is ours (nobody knows that #n was the last thing a lane waited for). B is worth one free test, because if a PR comment wakes the owning lane, the same script can post it later, with the founder's yes to the write.

**A in detail.** `product/tools/merge-wake.py`, a step of lead-watch.sh, git and the open PRs already read, no new API call:
1. Merged since the last check: first-parent "Merge pull request #n" on origin/main (as lane-cleanup.py reads them).
2. Who waits: an open PR, draft included, whose body has a line of its own "Waits on: #n" (also "Stacked on: #n"; the same strict reading as "Retry fix:"), or whose base is the merged branch; the cycle plan's `waits_on`; the capability's qa when the merged PR says "Completes:" (points to proof-read-watch's line, never a second ACT).
3. One ACT per waiting PR or row: `wake: #n merged 13:22 IST; #m waited for it (lane <title from the app view, or "lane not found">, idle 41 min). Type: "#n is on main: merge main once and go on"`. All its waits merged, not only one; a wait on a closed unmerged PR is its own ACT.
4. It stays an ACT until the waiting PR has a commit or comment after the merge, or is closed. What was told is kept in the state folder, as the other watches do.
5. Nothing waits: one info line with the merges, so a silent run and an empty run differ.

**Limits:** a wait that is only prose ("after FO-7b lands") is not seen; finding the lane needs the title or detail of the app view to name the PR; no time is saved if the Lead does not type.

**Done when:** `check-merge-wake.sh` passes: a merged wait is one ACT with the words to type; two waits with one merged, none; a closed unmerged wait, an ACT; after the waiting PR's next commit, none; prose, code fences and quotes, none; an unreadable PR list or main, an ACT; each rule has a mutation row. Report only for 24 h; then measured: minutes from merge to the waiting PR's next commit, the ten before against the ten after (the "before" read from this week's merges, not guessed).
**For B's test (Lead and founder, 10 minutes, nothing installed):** on one idle cloud lane with an open PR, post one comment on that PR and look whether the lane's session starts a turn within 10 minutes; write the result here either way.
**Needs from you:** the words "Waits on: #n" in lane briefs (a convention, no skill write by me), and your yes to build A as one small PR (estimate half a day, not measured).

## Result of B's test (24 Nov 2026)
One comment on #3371 at 14:13:46 IST, asking only for a one-line reply. Read at 14:44:33 IST, 30 min 47 s later: **no reply, no new commit** (head f70556b1c, last change to the PR 14:13:46, the comment itself). So no visible wake in this one test.
What it does not show: whether the owning session is still alive or was subscribed to the PR (not looked at in the app); whether it started a turn and did not answer; whether another account's comment would do it (the comment came from the account the sessions use too, which also opened this PR); any other lane (a sample of one).
Conclusion: B is not shown to work, so it is not built on; A (#3456) stands.
