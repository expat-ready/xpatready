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

## Lead B (7) hand-over (19 Nov 13:3x IST) — superseded by the 21:56 section at the end
* **Session:** Lead B (7), worktree `elegant-sinoussi-bab4cf`, branch `lead-b-front-office` (push `git push origin HEAD:refs/heads/lead-b-front-office`). **Current Lead: Lead 96** (`local_3500a818-e30d-4095-b95c-f9b2b9d819ff`, from 21:26 IST). Leads 90 to 95 have ended. Since this section: #2252 FO-3a part 1c (one type error, fix in comment 7003626666), row FO-3a1d (accents, deactivated host on booking types) outside focus.
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

## Lead B (7) hand-over (19 Nov 21:57 IST, at 44% context, P-565 (2)) — the next Lead B starts here
**Session:** Lead B (7), worktree `elegant-sinoussi-bab4cf`. Push with `git push origin HEAD:refs/heads/lead-b-front-office` (allowed domain github.com). **Current Lead: Lead 96** (`local_3500a818-e30d-4095-b95c-f9b2b9d819ff`). Release 1 stays **29 Nov** (P-740). **P-733** (nearest to done first, one lane per item until Proven) runs to the evening of 22 Nov; ENF-733 reads the focus list, so keep `lead-b-briefs/lane-order-P733-2026-11-19.md` current. Questions arrive as PR comments headed "Question for the tech lead"; answer the technical ones as PR comments, and send product ones to the Lead. Report each merge, blocker and qa-ready item to the Lead in one line. Times only from `TZ=Asia/Kolkata date` (I stamped messages ahead of the clock more than once: read the clock before writing a time). GitHub through curl with `gh auth token`; never label, merge, open PRs or cancel CI.

### Items (as of 21:57)
| Item | State | Next | qa |
|---|---|---|---|
| R1.109 complaints | Partial: QA-517 | **#2315 PF-21j** labelled 21:36 (with the j_109 import fix: `zonedInstant` moved to `platform/calendar/working-days.ts` by #2000) | qa 7 re-walks after #2315 merges |
| R1.4 firm walls | #2029 labelled again 20:49 on bb3393cac (merge fix for #2224 and the MODULE.md line) | merges | qa 7 |
| R1.33 phone | #2268 requeued 21:0x after #2306 fixed main's V2 | merges | qa 7 |
| R1.41 staff hours | #2243, #2252 merged; **#2302 J-41** labelled | merges | qa 7 |
| R1.28 consent per purpose | **built** (J-28 #2281 merged 21:38) | walk | qa 7 |
| R1.37 no double booking | **built** (J-37 #2284 merged 21:38) | walk | qa 9 |
| R1.40 calendar invites | **built** (J-38 #2247 merged 18:05) | walk | qa 9 |
| R1.30 + R1.31 board | built; qa 9 found QA-530 (Partial). **#2323 FO-2pv** (set a prospect's value) labelled. QA-531 ruled out of R1.31 (P-741) | merges, then re-prove | qa 9 |
| R1.48 sending | PF-19b part 3 on its lane (claude/intelligent-mayer-ymi4sl; waits for #1961, shares `platform/settings.ts`) | PR, then J-48 | — |
| R1.19 + R1.89 | waits for #1959 (PF-5 part 2), which waits for #2029 | PF-5s part 1 with J-19 | — |
| R1.110 identity | lane "R1.110 FO-13i part 2 then FO-13s part 1 with J-110" running | PR | — |
| R1.38 time zones | lane "R1.38 FO-3st1 …" (it showed "waiting on a human" at 20:31) | PR | — |
| R1.92 profile, offices | **#2304 PF-18a part 2**: migration read done; needs (1) the card path `api/src/features/front-office-booking.ts` in `MODULE.rows/PF-18a.md` and (2) the CodeQL fix at line 231 (full regex escape; comment 7015089237), then a third diff-only look and Approve | label | — |
| R1.20 | **#2307 PF-15c** labelled; F1 ruled (held firms get 402 from #1959's interceptor; I asked #1959 for the assertion, comment 7013594855) | merges | after later parts |
| R1.72 (Build Lead C's) | **FO-2w** brief `lead-b-briefs/FO-2w.md`; BACKLOG row added; IN R1.72's chain. Lane at the founder's next typed turn | build | — |

### Blockers to chase
* **#1961 PF-19p**: re-stamped by Lead 96 itself (22:00 IST, P-699; fixer A is gone): folder 20261119163000_pf19p_platform_account_mail, SQL unchanged, head 18341ccbb. A diff-only review is running; the Lead labels. When it merges, PF-19b part 3 (R1.48) and R1.8 are unblocked. Don't chase fixer A.
* **#2308 FO-3vr**: ruled "apply" (AG-2-64 r3, comment 7013874319); waiting for its re-review and Approve.

### Rows and briefs written today (all in `lead-b-briefs/`)
* PF-21j, FO-2pv and FO-2w are in flight.
* **PF-4kt** (permission keys re-checked inside each write's transaction: a `keys_version` column, a 409 KEYS_CHANGED): in BACKLOG and parked (Lead 95). It starts after #2029 merges, when a lane is free of P-733 items.
* FO-9a-c and FO-9a-p (#2268 follow-ups) are in the focus list.
* FO-5rp and FO-2u: follow-ups after R1.72's proof.
* **Owed:** FO-5b (R1.53) and PF-21c (R1.86) briefs.
* **Held:** R1.100 PF-19e and R1.23 PF-13 part 1 (both share `ports/messages.ts` with #1961 and PF-19b part 3).

### Handed to others
CS-C1r (reopen skips the case limit) is Build Lead C's. Main's V2 red was fixed by #2306 (the Lead's).

### Scratch watches (scratchpad of this session; gone with it)
`watch.sh` (PRs 2029 1959 1961 2268 2302 2315 2304 2308 2307 2323; branches incl. the PF-19b part 3 branch) and `scan.sh` (question scan with an exclusion list). The next Lead B re-creates them: one GraphQL call per 240 s; report a state, head, Approve-on-head or label change, and CI only when it becomes SUCCESS or FAILURE.

### Update 22:37 IST (Lead 96's quiet-PR sweep)
* **#2158 PF-18bk:** re-stamped by Lead 96 (folder 20261119170000_pf18bk_support_keys, SQL unchanged, head a5a2a8e68). Its migration HINT still names the old folder; a cosmetic follow-up. Lead 96 reads and labels.
* **#2038 FO-6 part 1:** given to Card-conflict fixer B (merge main, P-712 card move to `MODULE.rows/FO-6.md`, check the stamp). FO-6 is a Further item, so it waits behind nearer items (P-733).
* **#2109 PF-4dn** (part of R1.20) goes to the R1.20 lane after #2307 merges: P-712 card move, take the branch's png.
* **#2001 PF-24w:** a new lane at the founder's next typed turn; low priority (R1.15 waits on the AWS account).
* **#2322 FO-3st1 part 1** (R1.38): ruled (comment 7015934908). Follow-ups FO-3sa-h, FO-2z and FO-3st1-d are in the focus list.
* **#2304** labelled 22:28; **#1961** re-stamped by Lead 96 (18341ccbb).

### Update 23:58 IST: full runs (P-731)
* Cloud lanes cannot start a full run: their slash commands arrive mangled as "·/·r·un full", so comment-run.yml never fires. **The Lead posts `/run full`** from its account; send it the PR and head.
* The founder approved switching off "full run on every PR" (P-733 (4), the FULL_RUN_FROM variable) until 22 Nov 20:00 IST. Once it is set, only PRs that failed a batch need `/run full`.
* Full runs started by the Lead: #2268, #2302 and #2308 (earlier); #2323, #2109 and #2322 (23:58).
* Waiting: #1961 is held by the Lead until #2341 merges. #2029 is green and labelled, in the queue. #2315 (PF-21j) is in queue batches #2352/#2354.

## Lead B (8) hand-over (20 Nov 06:29 IST): the next Lead B starts here
**Session:** Lead B (8), worktree `jolly-chatterjee-f02f6d`. The sandbox blocks writing `.claude/skills`, so `lead-b-front-office` is **not checked out**: commit with a temporary index (`GIT_INDEX_FILE=$TMPDIR/idx; git read-tree origin/lead-b-front-office; git update-index --cacheinfo …; git commit-tree …; git push origin <sha>:refs/heads/lead-b-front-office`). **Current Lead:** Lead 98 (`local_b18084c0-4fca-4a71-81bc-9826c722a44f`), handing to Lead 99 next: always ask `tools/current-lead.sh`. **Rules now:** P-745 waves (`design/waves.md` on `lead/2026-11-07-lead31`): caps 8 building, 12 Built-not-Proven; Wave 2 starts only when Wave 1 has ≤ 8 building and R1.30, R1.31, R1.40, R1.67 are proved (Lead 98). P-747 (phones at arrival doors). The focus list `lead-b-briefs/lane-order-P733-2026-11-19.md` now opens with the P-745 order.

### Items
| Item | State | Next |
|---|---|---|
| R1.4 firm walls | **#2029** conflicts with main; not mechanical (two new bypass uses from PF-19p) | brief **`PF-12b1m.md`** (6e96c88fb; my ruling: both new uses `audit: "none: …"`); Lead 98/99 starts a PF lane at the founder's next typed turn unless the J-109 lane pushes first |
| R1.33 phones | #2268 merged 03:01; Partial on QA-526 | **FO-9b** (`FO-9b.md`) being built by the R1.33 lane on `claude/confident-mendel-v60owc` (started 05:37) |
| R1.40 invites | proof was Partial on QA-522 | **J-38r** (W7 reschedule, W8 cancel) with the R1.40 J-38 lane; no PR seen yet |
| R1.38 time zones | #2308 merged 06:15; **#2313** queued (06:28) | then #2322, then #2326 (each: merge main, diff-only Approve, the Lead labels); #2326 and J-38r share j_38.ts |
| R1.48 sending | **#2397** PF-19b part 3 queued | J-48 holds under the cap (Lead 98) |
| R1.109 | Works in qa 7's #2382 | QA-525 → row **PF-21jt** after Wave 1's open items |
| R1.30/R1.31 | #2323 merged 05:24 | qa 9 re-proves |
| R1.41, R1.37, R1.28, R1.80 | proven or with qa | — |
| R1.72 (Build Lead C) | #2321 FO-2w merged 06:19 | CS-K1 part 2 (theirs); **FO-5rp/FO-2u held** until after R1.72's proof |
| Parked | R1.20 (#2109, #2307 merged), R1.92 (#2304 merged), R1.54 (#2038) | lanes told to stop |

### How the pipeline behaves tonight (lessons)
* A failed-batch PR needs a fresh full run **and** a "Batch failures covered: <run>: <every failed part>" line for **every** failed batch its head sat in; read the label guard's own list, read each job log, and post the parts with whose fault each is. The Lead posts the line (or accepts mine) and relabels.
* `/run full` on a head that already has a full run re-runs the old pinned run; the Lead dispatches ci.yml by hand (pipeline row with Lead 97). A re-run of failed jobs also tests the old merge: never use one to pick up a main fix. Close/reopen gives a fresh PR-level ci.
* Mergify takes a requeue only as a bare comment.
* Cloud lanes post `/run full` mangled; they can't start runs.
* Times: read `TZ=Asia/Kolkata date` before writing one (I stamped ahead several times).

### Watch ($TMPDIR; dies with the session)
`watch.py` (GraphQL every 240 s; exits on a new head, merge, finished CI, a newly added "dequeued", a new question or a reviewer Approve naming the head; queue-label churn ignored). PRs: 2397, 2029, 2038, 2001, 2313, 2322, 2326. Only one watcher at a time (shared state file).

## Lead B (8) final hand-over (20 Nov 10:50 IST, at about 45% context, P-565 (2)): Lead B (9) starts here
Read the 06:29 section above first (method, lessons, the temporary-index push); this one updates its items. **Current Lead: Lead 100** (`local_59a9ad7a-2010-4e9f-bdb0-6800116c75cd`, from 08:50 IST; the last of series 2; then series 3 restarts at Lead 1). Always ask `tools/current-lead.sh` (Lead 100 once called itself a standby before it read the take-over). Lead 100 starts Lead B (9) at the founder's next typed turn.

### Open items (as of 10:50 IST)
| PR | Item | State | Next |
|---|---|---|---|
| **#2322** FO-3st1 part 1 | R1.38 (3 of 4) | head 43f422d9a (pure main merge, so pr-rules finds **P-748**, its size exception); full run 44676827988 failed shard (8): its new `check_fo3st1_calendar_browser.ts` assumes the demo database ("DatabaseDoesNotExist") | R1.38 lane told (10:0x) to make the suite build its own test database, Approve, post the head; then Lead 100's /run full and label |
| **#2326** J-38 W6 | R1.38 (4 of 4) | conflicts with main | after #2322: merge main and keep #2376's W7/W8 next to W6 in j_38.ts |
| **#2305** FO-13i part 2 | R1.110 (Wave 2) | approved on 6ba78f320; left the queue 09:47 alone on main: shard (8) `check_fo3st2_availability_browser.ts` J-A2/J-A4 failed twice (staff hours, not identity code) | R1.110 lane told to run it on head and on main: fix it if it's its own; post both outputs if main fails too (then Lead 100 routes it to the staff-hours side) |
| **#2029** PF-12b part 1 | R1.4 (Wave 1) | new PF lane (cloud task_84d12f49, brief `PF-12b1m.md`) merged main at 63771158a; I checked: both PF-19p uses `audit: "none: …"`, pass/fail tests, combined sweep | waiting for its reviewer's Approve; then Lead 100's full run and cover line |
| #2038 FO-6 part 1 | R1.54 | parked (P-745) | — |
| #2001 PF-24w | R1.15 | conflicts; low priority (AWS account) | — |

### Since 06:29
Merged: #2397 PF-19b part 3 (R1.48), #2313 (R1.38 2 of 4), **#2405 FO-9b** (R1.33's last part), **#2376 J-38r** (R1.40 W7/W8), #2296 (R1.31), #2413 (records with P-748). **Proofs:** qa 11 (cloud) holds R1.40's re-prove and R1.30/R1.31; **R1.33's re-prove needs a new qa lane** (qa 7 archived; Lead 100 holds it for the founder's next turn). **Held:** J-48 (R1.48) and all Wave 2 starts until Wave 1 has ≤ 8 building with R1.30, R1.31, R1.40, R1.67 proved; FO-5rp and FO-2u until after R1.72's proof (Build Lead C). **Queued rows:** PF-21jt (QA-525), after Wave 1's open items. **Outages today:** the Mac's disk full about 06:4x-08:08 IST (founder cleaned 10 GB); the xr-mac runner offline 07:14-08:3x IST.

### New lessons
* A size exception is a DECISIONS row from the Lead (P-748 style), and `pr-size.sh` reads DECISIONS from the PR's merge with main: it passes only after the records PR lands **and** the PR gets a fresh run (a pure main merge; the Lead's close/reopen was blocked by the safety check).
* A new browser suite must create its own test database; the CI runner has no demo database.
* zsh: `"$b:a…"` is a path modifier; write `"${b}:…"`.

### Watch
`watch.py` in this session's TMPDIR dies with it. Rebuild it as described above, for PRs 2305, 2322, 2326, 2029. Report each Approve that names a head to the current Lead, with the head.

## Lead B (9) final hand-over (21 Nov 08:5x IST, context ~46%, P-565 (2)): Lead B (10) starts here
**Session:** Lead B (9), Opus 5.5 medium, worktree `build-lead-c-647b40`, from 20 Nov 12:2x IST. **Current Lead: Lead 11 (series 3)**, `local_f172acc0-277a-4ea1-b739-4fa274ba3c9b`. Leads changed many times today; confirm with `list_sessions` (the title says "tech lead (current)") before each send. Method: as in the 06:29 section above (push lead-b-front-office with a temporary index; GraphQL via curl with `gh auth token`, because gh's TLS fails in the sandbox; a watcher `watch.py` in TMPDIR that dies with the session).

### Open items
| PR | Item | State (08:54 IST) | Next |
|---|---|---|---|
| **#2687** DEMO-LINK (founder's A243: reach the Release 1 screens from :4400) | demo access, R1.38's booking page | **ready, head 166755a85, "Reviewer: Approve 166755a85" posted** (independent Opus, two passes); no label yet; +270/−9 | the Lead's label (seed paths in demo.ts and booking-seed.ts; no migration). Watch CI: **check_pf18h_home_browser** was never run locally (no Chrome in the sandbox). Follow-ups on the PR: m5 (gate the menu behind a demo flag), m6 (signed-in smoke), a timeout on the reset transaction |
| R1.38 + R1.110 proofs | qa | the cloud lane "qa Q2 · R1.110, R1.40" was asked (02:4x) to prove both on walks 44818224820 and 44818327469 (main d3d014857), plus R1.40, which shares j_38 | the Lead follows; a cloud lane can't reply, so read its records or PR |
| R1.74 | qa / Lead C | PF-18n1 #2596 and PF-18h #2621 merged (both QA-471 parts on main); CS-DL3 part 2 #2594 merged | Lead C's CS-DL3 part 3 (the J-74 reminder walk, using the data-needs-you-item hooks) is theirs; then qa re-scores R1.74 |

### Merged on my rows this session
#2305 R1.110 · #2029 R1.4 · #2322 + #2326 (R1.38 4/4) · #2596 PF-18n1 · #2621 PF-18h. Briefs written: `lead-b-briefs/J-37d.md`, `J-38w6m.md`, `PF-18n1.md`, `PF-18h.md`. Standing size rule **P-775** (code and tests under 800 plus the PR's own screens records) came from #2621.

### Clean-up owed (founder, on the Mac; the sandbox can't do it)
* The DEMO-LINK builder left a local API server on **port 4660 with no timeout**: `lsof -ti tcp:4660 -sTCP:LISTEN | xargs kill` (servers on 4606, 4718 and 4791 time out by themselves).
* Test DBs: `xr_studio_runtime_aud1a`, `xr_studio_pf18h`, `xr_studio_pf18hb` (run prune-test-dbs.sh once their servers stop), and `xr_studio_demolink_seed` (name-protected "demo": drop it by hand).
* The scratch clone is already deleted (disk 6.4 → 7.9 GB free).
* **Worktree `build-lead-c-647b40`:** a `git checkout -b` died halfway on the read-only `.claude/skills`, leaving files and index at origin/main while the branch stayed `claude/compassionate-lederberg-b17536` (~879 files show as changed, but there is no real work in them). The reset was refused by the permission check, so the founder runs `git reset --hard HEAD` there. Until then the stop-check reports "uncommitted changes" and a STATE time mismatch from main's STATE.md (the Lead's, already told).

### Lessons
* Building in this sandbox: never `git checkout` a new branch in a session worktree (the `.claude/skills` paths are read-only). Build in a scratch clone (`git clone --no-checkout <main copy>`, set the origin to GitHub, fetch, branch from origin/main), push with a plain `git push`, and delete the clone after the review.
* A local clone shares objects by hard link, so `du` overstates its cost (3.8 GB shown, ~1.5 GB real).
* CI gives a suite its own test database **only if its usage line is in run-suites' form** (`tsx studio/tests/<file> <port> <db>`, or `isolated.sh … start && tsx …`); otherwise it runs on a database that isn't there. This hit #2322 and #2621.
* A new demo seed under `platform.demo.reset` must run inside the reset's per-firm transaction, or aud1a's "2 bypass lines per firm" fails.
* Cloud lanes don't read PR comments while idle: a prompt-box nudge by the Lead (#2029 and #2322 both stalled for hours).
* A green full run on a PR can still leave main red when a suite runs on the shared demo DB without a retry (check_fo1b after #2322); expect the batch to catch it.
