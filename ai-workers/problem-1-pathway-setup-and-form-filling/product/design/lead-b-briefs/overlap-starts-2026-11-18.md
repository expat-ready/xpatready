# Overlapped starts, 18 Nov 22:53 IST (Lead 81's request after the founder's "start doing it"; row owner Lead B / Build Lead A)

These are start prompts for Lead 81 to paste into new cloud builder sessions (P-699). **The same rule applies to every row:**
* Branch from the **in-flight part's branch tip**, named below, never from `origin/main`.
* Build, test, and get the reviewer's (and breaker's, if the brief says so) Approve **on your branch**. Push every step.
* **Do not open the PR** until the in-flight part is on `main`. Then merge `origin/main` into your branch (P-270, never rebase), re-run your suites, get a diff-only re-review (P-277), and open the PR non-draft after the Approve (P-683). Its diff must show only your part.
* A migration takes its stamp **at PR time**: later than main's newest and different from every open PR's (P-600). Use a typed audit actor in tests (#2003).
* If the in-flight part changes after review (new commits on its branch), merge its tip in again. Questions go on your branch's draft notes, then the PR, to Lead B.

## 1. PF-15 part 2: case limits, the downgrade check over every metric, lowered limits
Base: `claude/runtime-pf15-limits` (#2130, 3e02affa2). Brief: `design/lead-b-briefs/PF-15.md` on `main` (part 2, DW8, DW9), plus the "Part 2 also" lines on branch `lead-b-front-office`. CS-C1's `CaseCountPort` is on `main`. Feature conflicts in `checkDowngrade` wait on PF-17's feature list, so state that in the PR and do not build a feature list.
> Run `/next runtime PF-15 part 2`. Branch from `origin/claude/runtime-pf15-limits`, not main. Brief: PF-15.md part 2 on main, plus the "Part 2 also" lines on branch lead-b-front-office (a cross-firm definer test, and several live subscriptions). Follow `lead-b-briefs/overlap-starts-2026-11-18.md` on that branch: build and get Approve on your branch, and open the PR only after #2130 merges and you have merged main in.

## 2. FO-3st2: the Availability and Time off screens
Base: `claude/runtime-fo3a1b` (#2103, FO-3a 1b-i; it is re-merging main now). Brief: `design/lead-b-briefs/FO-3st2.md` on `main`, plus amendment A3 in `P-626-order.md`. PF-6 part 1 is on `main`.
> Run `/next screens FO-3st2`. Branch from `origin/claude/runtime-fo3a1b`. Brief: FO-3st2.md on main, plus P-626-order.md A3. Follow `lead-b-briefs/overlap-starts-2026-11-18.md` on branch lead-b-front-office. Open the PR only after #2103 merges and you have merged main in.

## 3. PF-19e: transactional bodies sealed at rest (it unblocks PF-5v part 2)
**Correction to the chain:** PF-5v part 2 waits on **PF-19p (#1961) and PF-19e**, not on #2135 (PF-5v.md line 41). PF-19e has no PR yet, so the overlap that moves PF-5v part 2 is PF-19e. PF-5v part 2 itself chains on PF-19e next.
Base: `claude/funny-edison-0xod9n` (#1961, 2aa433a4e). Brief: `design/lead-b-briefs/PF-19e.md` (branch `lead-b-front-office`).
> Run `/next runtime PF-19e`. Branch from `origin/claude/funny-edison-0xod9n` (#1961). Brief: lead-b-briefs/PF-19e.md on branch lead-b-front-office. Follow overlap-starts-2026-11-18.md there. Open the PR only after #1961 merges and you have merged main in.

## 4. PF-19b part 3: delivery state and the staff message list
Base: `claude/funny-edison-0xod9n` (#1961). Brief: `lead-b-briefs/PF-19b3.md`. Its touch list (`bounces.ts`, `local.ts`, new `staff-routes.ts`, the web panel) does not overlap PF-19e's (`send/messages.ts`, the send worker, `demo-inbox.ts`), so the two may run side by side. The second to merge merges main in.
> Run `/next runtime PF-19b part 3`. Branch from `origin/claude/funny-edison-0xod9n` (#1961). Brief: lead-b-briefs/PF-19b3.md on branch lead-b-front-office. Follow overlap-starts-2026-11-18.md there. If you need a file on PF-19e's touch list, stop and ask Lead B on the PR. Open the PR only after #1961 merges and you have merged main in.

## 5. J-109: join and walk for complaints (R1.109)
Base: `claude/screens-pf21s-actions` (#2134, 4deeaf2ab, queued). J-109 also needs PF-21i (#2012, `claude/dazzling-feynman-x03cc8`, c008ffbfb, not yet labelled). Merge that branch's tip in too. That is the one exception to "one base": it is needed because W1 records a complaint. Brief: `J-rows.md` §J-109 as amended by `wave1-registers.md` (W2 is the 2-business-day acknowledge-by date; the jobs swap goes to `PlatformJobs`).
> Run `/next evidence J-109`. Branch from `origin/claude/screens-pf21s-actions` (#2134), then merge `origin/claude/dazzling-feynman-x03cc8` (#2012) in. Brief: J-rows.md §J-109 plus wave1-registers.md on branch lead-b-front-office. Follow overlap-starts-2026-11-18.md there. Open the PR only after both #2134 and #2012 are on main and you have merged main in.

## 6. PF-6: the next part is PF-6b (own versus all, and money and licence apart, made checkable). It is not a chain.
PF-6b waits only on PF-4, which is merged, so it starts from `origin/main` as an ordinary row. J-6 chains after it. J-5 stays blocked on PF-4b's Cognito proof (the founder's AWS).
> Run `/next runtime PF-6b`. From origin/main. Brief: lead-b-briefs/PF-6b.md on branch lead-b-front-office (breaker yes; the Lead's P-423 read).
