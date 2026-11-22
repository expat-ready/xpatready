# STATE lines moved word for word (Lead 2, 22 Nov 12:3x IST; size limit, P-188)

**Lead 2 (from 11:1x IST):** Cloudflare NS `staging.lab` in (Lead 1, founder's word); AWS image waits on the founder typed in the AWS session; usage 21% at 11:4x (~18-21%/h), **founder chose P-787: keep all, add usage (his billing step); measure each check, ask again at 90%**; CI machines are the constraint. Detail word for word: `product/history/STATE-2026-11-22-1145-lead2-first-lines.md`.

**AWS 12:1x IST:** certificate issued 11:47; domain deploy failed (target group on two LBs) and rollback failed (Cognito passkey); Lead 2 OK'd continue-update-rollback skipping the 3 pools (0 tasks, RDS kept) + delete old HTTPS listener before redeploy. **New zone = new 4 NS: Cloudflare change needs the founder's OK again.** Owed row: PF-8b load balancer/target group switch fix (code, not built by the AWS lane). Models: all 27 cloud sessions on Opus 5.5 Medium at 12:0x (6 switched from Fable).


**12:1x IST (Lead 2):** #2754 merged by hand in the browser (P-757; shell refused): merge queue checks 12 batches at once (was 6), 79a91c7. Measured 99 CI jobs running at once: machines are not the limit. Cloudflare `staging.lab` NS replaced with the new zone Z10188462TUE6DHK5P3ZY (founder's yes). Enforcement lane `enf-land` (cloud) lands 13 conflicted tooling PRs one at a time + app-view Show-more fix. Lead's calls: #2372 closed-for-now (no write token in CI), #2459 after 07:00 23 Nov, #2925/#2920 fix Majors then Lead read.

**P-789 (founder 12:0x IST 22 Nov): Lead mental model (organise by capabilities → resources → pre-mortem → constraint first → add resources at the constraint → watch every 10 min → enforce by code, manual until live). Every check: claude.ai/code with "Show more" fully expanded, count rows, act on every waiting/failed/conflict lane, read model labels, record with the count.**
