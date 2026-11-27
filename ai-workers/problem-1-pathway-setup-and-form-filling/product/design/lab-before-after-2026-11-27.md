# Lab: before and after — started 27 Nov 2026 (Lead 3)

Founder ask (A425, 27 Nov): at the end of the lab, show where we started, what we were doing, and how it changed; none of the loops-article hand-offs may get lost; each must be fixed in as part of the lab. This page is the anchor: "Before" is written now from today's facts; "After" is filled only with evidence (merged PR + the Done-when check passing on main). The lab is not done, and product does not restart, while any row here lacks its After evidence. The Lead checks this page at every lab PR's read and at the final lab audit.

## Before (27 Nov 2026, from `design/software-factory-2026-11-27.html` "Life of one change", "Still by hand" and the Lead's own records today)
1. **Labels by hand.** A PR merges only with the label `review: approved`, put on after the reviewer agent's Approve; the Lead labels records PRs and risky PRs; a queue gate labels ordinary ones.
2. **Relabels by hand.** Any new push removes the label (label guard); the Lead relabels after reading again (today alone: #3895 twice).
3. **Money, schema, permission reads by hand.** The Lead reads each diff before the label.
4. **Red PRs wait for the Lead.** A red or dequeued PR waits for the Lead's 30-minute check, which nudges or restarts the lane.
5. **qa started by hand.** After a merge the Lead starts the qa lane.
6. **Lanes are not held to their Done when.** A lane decides by itself when it is finished.
7. **Watches live on the Mac.** The Lead's check (session cron) and lane-watch (polling) stop when the Mac session ends.
8. **Every change takes the product route.** Records, docs, hooks and tooling run the 24 product test parts and the product queue.
Also before: verification has no console-error or page-speed gate; library docs are not read before coding; no usage breakdown in the measures; watches never end by themselves.

## The hand-offs that must land (from `design/loops-article-mapping-2026-11-27.md`; founder: never lost)
| ID | Hand-off | Article row | Owner lane | Done when (pass/fail) | After (evidence) |
|---|---|---|---|---|---|
| L-1 | /goal on every builder and lab brief: "Done when test passes, stop after N tries" | 10, 26 | lab-automation | the brief template and `/next` carry it; a check fails a brief without it | |
| L-2 | Lead's manual checks encoded: labels via Claude Approvals (the approver, P-849, no machine account), relabels gone, risky paths need Code Review pass (Lead after-read stays, P-823) | 5, 33 | ship-security + lab-automation | a PR merges with no Lead label; approvals.yml routes risky paths to review | |
| L-3 | Watches off the Mac: queue/CI health and qa-after-merge as cloud routines or GitHub events; Lead's judgment check stays | 13, 15 | lab-automation | a merge starts qa with no person (run link); health watch runs with the Mac off | |
| L-4 | Routines for recurring work: dependency upgrades, qa after merge (Opus 5.5 medium, founder 27 Nov) | 16, 17 | ship-security + lab-automation | a scheduled run opens an upgrade PR; qa routine log | |
| L-5 | Stricter self-check: zero new console errors, Core Web Vitals budget (web.dev, cited), rerun every check after a failure | 7, 8 | lab-automation | journey-test fails on a planted console error and a slow page | |
| L-6 | Library docs before coding via Context7 | 22 | lab-automation | builder skill step + a lane log showing the lookup | |
| L-7 | Watches end when their work completes; events over intervals | 12, 15 | lab-automation | a watch exits on merge/empty queue (log) | |
| L-8 | Pilot before any large multi-agent run; /usage breakdown in the daily measures | 27, 30 | lab-automation | rule in RULES; measures line shows usage by skill/subagent | |
| L-9 | Every change takes its own route: records and tooling skip the 24 product parts, one review kept on pipeline files | — | lab-fast-route | records-only and tools-only PRs green without the 24 parts (run links) | |

## After (filled at the end of the lab, with evidence only)
The same eight "Before" points, each with what replaced it, the PR, and the measured change (approved-to-merged time, Lead hand steps per day, red-PR wait), from `tools/` measures, never prose.
