# STATE block moved word for word (Lead 2 → Lead 3 hand-over, 22 Nov 13:0x IST)

## Hand-over Lead 1 → Lead 2 (new account), 11:2x IST 22 Nov (Lead 1 at 370k context, 250k beyond its start read, P-446; Lead 2 runs on Opus 5.5 medium, founder A283)
**Goal (founder): nothing below 12 proven by 07:00 IST 23 Nov, target 15; plus Track B and the structural changes in parallel (P-785, P-786).** Proven this cycle: 0 so far. **Board, one line per capability with its lane, PR, wait and walk: `product/design/board-lead-a-2026-11-22.md`.** Earlier Lead 1 lines word for word: `product/history/STATE-2026-11-22-1120-lead1-lines-before-handover.md` and the two history pages it names.
**Local sessions:** Lead B · Track B `local_96f8a15e-44c7-498b-a59e-fd442ef477a9` (branch `lead-b/2026-11-22-track-b`; reads Track B PRs every 30 min, first read of money diffs; never starts or labels) · AWS · staging proof `local_3f051647-c21d-4f76-beb5-c0d1bc340180` (branch `aws/2026-11-22-staging-proof`; A = domain move running, B = CodeBuild approved by the founder; **it will send 4 NameServers: show them to the founder, then add 4 NS records named `staging.lab` in Cloudflare zone expatready.com through the founder's Chrome (Claude in Chrome is connected; the built-in browser fails Cloudflare's human check)**; founder is signed in to AWS in the built-in browser).
**Cloud sessions by PR, the owed list and the enforcement notes for Structure 2:** word for word in `product/history/STATE-2026-11-22-1150-lead1-handover-cloud-sessions-and-owed.md`.
**How to steer a cloud lane:** PR comment first (lanes read them); if idle, claude.ai/code in the built-in browser: open the session, `find` "textbox", click the one named Prompt, type, Return, confirm the bubble.
**Earlier Lead 2 lines (AWS recovery, NS, models, usage, #2754 merge, P-789 text):** word for word in `product/history/STATE-2026-11-22-1235-lead2-aws-and-early-lines.md`. P-789 in short: Show more fully expanded every 10-min check, act on every waiting lane, record with the row count.
**Waiting on the founder:** on-call role address for alarms (P-782) · Stripe test-mode key or a re-worded done-when for R1.21 · FO-9s Q1-Q3 (duplicate people) · Lead B's Q1 bill-to province, Q2 Stripe test Connect account, Q3 signing sandbox · whether to make the `staging.` address prefix a setting (one small row; today's address is `<firm>.staging.lab.expatready.com`, service.ts line 76).



## Start-here lines moved word for word (covered by the Lead 2 → Lead 3 block)

**P-791 (founder 12:4x IST):** unclog playbook: find the bad PR from Mergify's tested-alone summary; **never merge by hand while batches run** (12:1x #2754 restarted 9 batches, ~30 min lost) unless it unblocks them; drain levers a) green-only labels b) Completes-first priority c) batch size 3-4 d) AWS runners priced. Enforcers owed to `enf-land`.

**AWS proofs 12:3x IST (main 5d866c746, domain mode):** R1.15 Pass (10 secrets by valueFrom ARN, KMS); R1.13 AWS half Pass (9 alarms to SNS, test alarm delivered 2/2; app lines need the running service); TLS valid on *.staging.lab. Blocked: app start on PF-8b-f5 (pf12 grant loop on RDS PG 18; builder started 12:3x IST by the founder, cloud session_01Ln6TiUA3bRfVtQHPp4TFry, branch claude/runtime-pf8bf5, Opus 5.5 Medium checked). Report on branch aws/2026-11-22-staging-proof (2dfa3ea8f): **take it in the next records PR** so qa rates R1.15/R1.13 from main. Two unused older secrets kept (decide with R1.21).

**Next records batch (after #2952 merges):** take Lead B's branch `lead-b/2026-11-22-track-b` commits 64434d1dc (8 briefs, plan, rows FO-7g part 1w, J-61, CS-NT1t) and d84797c45 (BACKLOG PF-F1b, PF-Fw after PF-F1); records only.
