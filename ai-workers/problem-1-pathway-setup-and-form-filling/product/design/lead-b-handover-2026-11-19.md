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
* The BACKLOG row PF-4c1b is added by Lead 87 on lead31. The Stripe test-mode account is asked of the founder: only J-19's live walk waits on it, not J2's other items. Keys go only into the demo copy's environment.
* 11:02 IST: batch #2221 failed because of #2196 (Sample consent wording seed ruled, comment 7000698257). #1961 is cleared.
* 11:07 IST: **#1959 is held until #2029 merges.** #1959 adds 2 bypass uses without the `audit` field that #2029 makes required. Ruling 7000777630: both take `per-firm` (the webhook calls touchFirm for its matched firm; the sweep calls it per event's firm), and both go into check_pf12b's list. Lesson: check an audit-rule PR against every open PR that adds a bypass use, not only against main.

## The two tracks from 13:30 (P-726, P-728)
* **J2 (platform):** `lead-b-briefs/J2-lane-plan-2026-11-19.md` (approved).
* **J4 (front office):** `lead-b-briefs/J4-lane-plan-2026-11-19.md`. The lanes are R1.28 (#2011's), R1.30+R1.31 (#2102's), R1.108+R1.110 (#2103's) and R1.33 (#2181's), then R1.26+R1.27 and R1.29 in series on the same lanes.
* **Briefs owed by me before 13:30:** FO-13s (with QA-510) and the FO-9a phone-part amendment.
* **P-728:** each new item's J-test goes in the same PR as its last part.
* 11:23 IST: both owed briefs are written: `FO-13s.md` (R1.110: FO-13i part 2 for QA-510, then the Identity panel with J-110) and the `FO-9a.md` amendment (R1.33: the staff phone edit with J-33). R1.108 is out of flight (FO-13c waits on FO-9a and CS-S1b).

## Final state at the account switch (11:33 IST 19 Nov)
* **The account switch is now.** The next current Lead is **Lead 90** on the new account; its session id is not known yet. It reads STATE "Hand-over: Lead 87 → the new-account Lead (Lead 90)" on `lead/2026-11-07-lead31`. Send your first report to it once you know its id.
* **Waiting on merges:**
  * **#2195** folds the platform card, which unblocks module-cards everywhere;
  * **#2029** (R1.4, labelled) next. After it, #1959's lane follows comment 7000777630 (audit fields on 2 bypass uses), then Lead 90 reads and labels it;
  * **#2196** needs the wording-seed fix (comment 7000698257), then an Approve;
  * #2012, #2102, #2103, #1961 and #2181 are labelled or queued.
* **Proof PRs to open after their parts:** J-109 after #2012; J-37 after #2196.
* **From ~13:30:** the J2 and J4 lane plans (`lead-b-briefs/J2-lane-plan-2026-11-19.md`, `J4-lane-plan-2026-11-19.md`). The briefs are ready: PF-16, PF-4c part 1b, FO-13s, the FO-9a phone edit. The BACKLOG rows for FO-13i p2, FO-13s p1 and the FO-9a phone edit are asked of the Lead. The Stripe test account for J-19 is asked of the founder.
* **My scratch watches in $TMPDIR stop with this session.** Restart them: merges on #2195 #2029 #2196 #2012 #2102 #2103 #1961 #2181 #1959; Approves on #1959 and #2196; the J-109 PR on `claude/vibrant-meitner-3t1yfe` and the PF-19b3 PR on `claude/intelligent-mayer-ymi4sl`; and the question scan (`lead-b-tools/scan-pr-questions-gql.py`).

## Lead B (7) hand-over (19 Nov 13:3x IST) — the next Lead B starts here
* **Session:** Lead B (7), worktree `elegant-sinoussi-bab4cf`, branch `lead-b-front-office` (push `git push origin HEAD:refs/heads/lead-b-front-office`). **Current Lead: Lead 92** (`local_9e102072-cfa3-44e7-b027-32b06363cdb5`). Leads 90 and 91 have ended.
* **Rules now:** P-733 (nearest to done first, one lane per item, PRs near 800 lines, the J-test in the last PR, automatic proof, a full run only before a relabel after a failed batch, every failing suite named), P-734 (P-733 runs to the evening of 22 Nov; guard ENF-733 reads the focus list), P-735 (FO-13i part 2's expiry is the firm's own rule; never cite s. 24(2)(a)), P-736 (R1.30's drag: native HTML5, no library).
* **The focus list is `lead-b-briefs/lane-order-P733-2026-11-19.md`.** Keep it current: it feeds ENF-733.
* **Running cloud lanes (new account, started 12:43):**
  * FO-3st2 (R1.41): #2243 (labelled) → FO-3a part 1c (M4 unique set names with a migration, m11 deactivated target 404; row FO-3a1c) → part 2 J-41.
  * FO-4 part 2a (R1.30/31): #2251 (`Completes: R1.31`) → FO-4 part 2a-ii drag (row FO-4p2aii sent to Lead 92; P-736) → `Completes: R1.30`.
  * J-38 (R1.40): no push seen yet.
* **Labelled and in the queue (13:3x):** #2029 R1.4, #2012 R1.109, #1961 PF-19p, #2102, #2181, #2224, #2196 (relabelled after batch #2236; fix 942f6895e), #2240 (card-tool fix). Batches #2245 and #2246 died on tsc heap (pipeline, not ours); Lead 92 is landing an 8 GB fix and requeues them.
* **Triggers to report to Lead 92 in one line:**
  * #2012 merged → the J-109 PR opens (branch `claude/vibrant-meitner-3t1yfe`);
  * #2196 → J-37 and J-28 (`J-rows.md` §J-28, R1.28's own walk);
  * #2029 → #1959's lane (merge main, ruling 7000777630), then Lead 92 reads and labels;
  * #2181 → FO-9a phone part (R1.33);
  * #1959 → PF-5s part 1 with J-19 (R1.19 + R1.89);
  * #2243 → FO-3a part 1c;
  * #2251 → FO-4 part 2a-ii.
  * PF-19b part 3, then J-48 (R1.48): due from 13:30; Lead 92 starts it.
* **Card-tool bug:** `MODULE.rows/*.md` names paths without backticks until #2240 is on main.
* **Rows Lead 92 still owes:** FO-4p2aii and FO-2bp (sent 13:3x). FO-3a1c is in #2241.
* **Briefs owed by me (two-part items, after the one-part lanes run):** FO-5b (R1.53), PF-21c (R1.86).
* **Watches (`$TMPDIR` scratchpad; they die with the session):** `watch.py` / `watch.sh` (PRs above plus #2243 and #2251; branches; exits on any change except pending CI and branch pushes) and `scan.sh` (`lead-b-tools/scan-pr-questions-gql.py` with an exclusion list). Re-create them the same way.
* **Lessons:** `mktemp` fails in this sandbox, so use the scratchpad. zsh `${=…}`/`${…%%…}` parsing trips the safety check, so use Python for loops that post. Run only one watcher at a time (two share a state file). Read a batch's failing job log yourself before asking for a relabel. Times only from `TZ=Asia/Kolkata date`: I wrote ahead-of-time stamps three times and fixed each.
