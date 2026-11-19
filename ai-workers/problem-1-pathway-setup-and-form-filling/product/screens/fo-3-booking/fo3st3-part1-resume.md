# FO-3st3 part 1: resume note (stopped 19 Nov by Lead 85, P-716)

**Where it stands.** Branch `claude/screens-fo3st3`, head after this note. Branched from `claude/runtime-fo3a1b` (#2103, FO-3a 1b-i) under `lead-b-briefs/overlap-starts-2026-11-18.md`. **No PR yet:** it opens only after #2103 merges and `origin/main` is merged in.

**Scope taken (decided inside the brief, P-628).** FO-3st3 part 1 by the brief's own P-610 split: the Booking types page and its drawer (Definition, Hosts with each host's set, Advanced allow flags, Share, Preview) with J-T1..J-T4, DW6, DW7. **Part 2 waits on FO-3a 1b-ii** (the timings API, not built): the Timings page and the per-type timing overrides (J-T5).
* A3 over the brief: inside PF-6's `PlatformFrame`, with one `ACCOUNT_SECTIONS` entry (`agent/booking-event-type:list`), not a new Bookings frame.
* Read-only (`:list` only): values as text; the link and embed code as text without Copy buttons; no Preview.
* Host names come from `/platform/staff` (`agent/staff:manage`); others see the number of hosts (the type view has no names: an API gap, to name in the PR).

**Done so far.**
* Files: `web/src/modules/front-office/booking/settings/{contract.ts,types-page.tsx,type-panel.tsx}`, one route line, one menu line, `tests/check_fo3st3_types_browser.ts`, and screenshots `screenshots/fo3st3-*.png`. 477 changed lines against the base.
* At 11b4dfc: `check_fo3st3_types_browser` 28/28 twice; `check_pf6a_frame_browser` and `check_pf1_module_routes` exit 0; typecheck has no new errors; graph passes; the `any` count is unchanged.
* Breaker (Opus, high) on 7f32e88: 0 Blockers, 1 Major, 9 Minors (`fo3st3-part1-break-report.md`). All are fixed in 11b4dfc, with tests for M1, m1 and m7. Not changed: the embed code names the firm key, because the frame has no firm name.
* Reviewer (Opus, high) on 7f32e88: **stopped before a verdict** (Lead 85, P-716). No review exists yet.

**Next steps.**
1. Rerun the reviewer on the branch head: the full diff against `origin/claude/runtime-fo3a1b` (or against main, once #2103 is in), including the breaker fixes.
2. Fix Blockers and Majors with a fail test; re-review the diff only.
3. Once #2103 is on main: merge `origin/main` in (P-270), rerun the suites and get a diff-only re-review. Then open the PR **non-draft** after `Reviewer: Approve <sha>` (P-683), with `Duplicate check:` and Done-when lines, and Card unchanged for web-shell (no MODULE.md hand edits, P-712).
4. Run the suite with `zsh studio/tools/isolated.sh screens_fo3st3 4581 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3st3_types_browser.ts 4581 xr_studio_screens_fo3st3`, rebuilding the web first (`cd studio/web && npx vite build`).
