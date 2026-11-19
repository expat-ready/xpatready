# Lead B (Build Lead A) hand-over, 19 Nov 10:50 IST

For the next Lead B session. Read `lead-b-state.md` and the last revs (17.30-17.45) of `lead-b-rows-2026-11-14.md` first.

## Role and rules
* Lead B (6) is now **Build Lead A** (P-644), owner of the PF and FO rows. It does not run /lead.
* **Reports go to the current Lead: Lead 87** (`local_019a74ed-6dba-4a9c-9188-04a3e34bda5a`). Build Lead C is `local_d5287293-a27e-4cd2-a533-ca1949bdf430`.
* **How to work:**
  * Rulings go on PR comments.
  * Push every step: `git push origin HEAD:refs/heads/lead-b-front-office`.
  * Never open PRs.
  * I can't type into cloud lanes (I'm signed out of claude.ai), so the Lead types for me. Send it the session ids, which are in each branch's `Claude-Session` trailer.
  * Check migration stamps against **every open PR's files**, never by title (#2167 clash, rev 17.37).
* **Binding now:** P-719 (a lane owns one item's whole chain), P-721 to P-724 (protect the merge path, proof per item, the drain to ~13:30 IST, then journeys), P-726 (my track: J2, then J3 to J6).

## In flight (P-721 sprint, then J2)
* **R1.19, #1959:** waits for #2195 to fold the platform card. Then its lane (`session_018BSQJnvhgfTkPP1HqhHhJV`) merges main using its 04:13Z plan. Lead 87 types the continue line.
* **R1.4, #2029:** labelled at 5500148d3.
* **R1.109, #2012:** labelled at 2973a8f9b. Then J-109 (branch `claude/vibrant-meitner-3t1yfe`, session `018BSQJrpKJpZUx8Ls5iLzQi`) opens its PR. Send the sha to Lead 87.
* **R1.28 + R1.37, #2196** (FO-2 part 3b): queued. Then J-37 on #2011's lane (`session_018BSQJpkUaoUdnoS5RSif6V`) opens.
* **R1.48:** PF-19b part 3 (branch `claude/intelligent-mayer-ymi4sl`, session `018BSQJo9hHGemaYv7zS7fqE`), then J-48 (Build Lead C's `J-48.md`). Tell Lead 87 when part 3 merges.
* **Queued:** #2102 and #2103 (FO-3a), #1961 (PF-19p), #2181 (FO-2 part 4; red only on main's card until #2195).
* **J2 plan from 13:30:** `lead-b-briefs/J2-lane-plan-2026-11-19.md`, with `PF-16.md` written. R1.20 waits on the founder's D4.

## Scratch tools (in $TMPDIR; they may be gone after a restart)
* `scan.sh`: the PR question scan, with an exclusion list of handled comment ids.
* `apwatch2.sh`: run with `PR=` and `OLD=`. It fires on an Approve on a new head.
* `mergewatch.sh`: run with `PRS=`.
* Re-create them from `lead-b-tools/scan-pr-questions-gql.py` if they are gone.

## Update 10:52 IST
* **P-727** (D4: 1-50 rows, send the good ones) is quoted in `PF-15.md` and `PF-4c.md`. A new **PF-4c part 1b** is shaped. R1.20's chain is PF-15 p2 → PF-4c p1b → PF-4c p2 → the invite screen. The BACKLOG row is owed by the Lead.
* **J-19's Stripe walk:** no test account or keys exist. Lead 87 asks the founder (P-551).
* **The next Lead B starts fresh from this file** on the new account (A196), or at 50% context. Keep this file current at each step.
