# Brief: AUD-2, the daily export of the audit chain to a write-once archive (cloud builder lane; row owner Build Lead C)

Written 19 Nov 20:3x IST by Build Lead C (3). The draft `product/design/briefs/AUD-2.md` on `main` (written by the case-side shaping lane, 16 Nov) is the specification. **This page approves it, as row owner**, with the points below; this page wins where they differ. Release 1 rows **R1.97** ("Tamper-evident audit chain", Not built) and **R1.105** (keep periods, Partial: the archive is one of its missing parts).

**PR titles:** `runtime: AUD-2 part 1 — AuditArchivePort and the daily export of the chain (fake archive)` and `runtime: AUD-2 part 2 — …` (as the draft splits them).
**Model:** Opus 5.5, effort high (audit, deletion, a new library). Breaker on.

**Not ready now. Ready when:**
* **AUD-1c parts 1 and 2 are on `main`.** Part 1 is #2129 (`claude/runtime-aud1c-chain`, head cebeb0fa6, migration `20261118150000`), **parked** by the founder's P-707 (Wave 2) at 00:3x IST 19 Nov. It now conflicts with `main` and its migration stamp is earlier than main's newest (`20261119051500`), so it needs a merge of `main`, a new stamp and a diff-only re-review before the Lead's read. Whether to unpark it under P-740 is the Lead's call.
* **AUD-5 part 1 is on `main`** (#2008, merged): `ports/keep-period.ts`. That condition is met.
* **STANDARDS §1 (new technology):** the AWS S3 client library and S3 Object Lock (compliance mode, ca-central-1) go through the gate before any line is written. Part 1 builds only against the **fake** `AuditArchivePort`, and adds no AWS library. The real adapter is **AUD-2c** (draft `AUD-2c.md`), which waits on PF-8a/8b/8c (AWS accounts) and the gate. No real keys, ever (P-175).

**Points confirmed (the draft's "Points the release Lead confirms"):**
* Build both the daily export of the lines (P-571 (3)) and the off-site anchor of the chain head (SA-11-5). This is no departure from either.
* The lock period equals the longest keep period in `ports/keep-period.ts` (the activity log's 7 years). Read it from that one constant, never a copy.
* The export runs as a `JobPort` job at a fixed time from the clock port; run twice in a day, it writes once (the key refuses a second put).
* Legal point: whether 7 years satisfies the College's rule for audit records is **Unconfirmed: no counsel**.

**Named test cases, touch list and Done when:** as the draft, per part.

**Duplicate check:** `git grep -nE "AuditArchivePort|audit-archive" origin/main -- prototype/studio` returns 0 files (checked 19 Nov 20:3x IST). Open PRs: #2129 (AUD-1c part 1, the wait above).

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head, as a line of its own, **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label after a failed merge batch, name the failing suites and show them covered (P-731 (2)). **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files this page and the draft name and the code you change (P-556).

**PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix.
