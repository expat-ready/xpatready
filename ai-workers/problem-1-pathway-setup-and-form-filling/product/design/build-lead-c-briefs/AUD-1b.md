# Brief: AUD-1b, every audit line carries firm, actor type and correlation from the request (cloud builder lane; row owner Build Lead C)

Written 16 Nov 21:0x IST by Build Lead C (P-644). **Approved for building**: the case-side shaping lane's draft `product/design/briefs/AUD-1b.md` on `main` is the specification; where this page and the draft differ, **this page wins**. Release 1 row: **R1.8 (map 8), part 2 of 3**.
**PR title:** `runtime: AUD-1b — …` (board rule, Lead 69: "<ID> part N"; a title without "part" counts as the whole id)
**Model: Opus 5.5, effort: high (audit, request-context concurrency).** Decisions: SA-11-2, P-278, P-607.
**Ready when:** after **AUD-1a** is on `main`. One PR, ~450 lines.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime AUD-1b` and take **this one part** end to end on a fresh branch from `origin/main`, one PR. Read the draft brief named above for what to build, the touch list, the named test cases and the duplicate check; read only the files it names.

**Done when** (P-606): `tsx studio/tests/check_aud1b_adapter.ts` exits 0 with DW1-DW7 each passing and failing as named; `check_pf0p_ports.ts`, `check_pf23_observability.ts`, `check_pf23w_jobs_wired.ts`, `check_pf14_jobs.ts`, `check_pf4_identity.ts`, `check_pf4b_session_reads.ts`, `check_pf3_platform_schema.ts`, `check_pf19a_messages_schema.ts`, `check_case_feed.ts`, `check_aud1a_insert_only.ts` pass; full `ci` green.

**Review:** Opus reviewer **and breaker**: DW5 with 500 concurrent requests across awaits and a pg-boss handler, a firm switch mid-request, an audit failure inside an FO transaction.

**Holds / parallel safety:** Touches Lead B's `platform/observability/log.ts`, `hook.ts`, `identity/guard.ts` (one line) and `identity/audit.ts`: tell Lead B at the start line.

**Note:** AUD-1m (3 PRs) follows it; AUD-4 needs AUD-1a+1b.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
