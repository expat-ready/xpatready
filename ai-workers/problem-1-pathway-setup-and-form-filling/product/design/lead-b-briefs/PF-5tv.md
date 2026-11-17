# Brief: PF-5tv, one rule for "the current terms" at sign-up and at the gate (cloud builder lane; row owner Lead B)

Written 17 Nov by Build Lead A (Lead B, 6), rev 16.99, from **#1957's PR body, point 3** (PF-5t part 1, breaker m3). It reports that two versions of one kind with the same `published_at` are ordered differently by sign-up's `currentTerms` (`signup.ts`) and by the gate, so a firm that has just signed up could be asked again at once. The row's own recommendation: "a small row: one shared 'current' ordering (or a unique key on kind + published_at)". **Ruling: one shared ordering, and no unique key.** A key would need a migration, and it would refuse a legitimate same-instant publish rather than order it.

**Model: Opus 5.5, effort: medium.** **Breaker: no** (no wall, key or money).

**Starts when:** #2029 (PF-12b part 1) is on `main`, because it also edits `api/src/platform/firms/signup.ts` (P-526). It never runs beside PF-12b part 2, which edits the identity guard that reads the gate. Check open PRs at start.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-5tv` and take **one row** end to end on a fresh branch from `origin/main`, in one PR titled `runtime: PF-5tv — one rule for the current terms at sign-up and at the gate`.

**What `main` has (read only these):**
* `api/src/platform/firms/signup.ts` `currentTerms` (line ~90): `findMany({ where: { publishedAt: { lte: now } }, orderBy: { publishedAt: "desc" } })`, then the newest of each kind. With a tie on `publishedAt`, the order is whatever the database returns.
* `api/src/platform/terms/service.ts` `current` (line ~47): `distinct on (kind) … order by kind, published_at desc, version desc`. Its comment already says it is "the same rule as PF-5's currentTerms". With a tie, the two can disagree.
* `api/src/platform/terms/gate.ts` and `identity/guard.ts`: callers of the gate only. Read them; do not change them.

**What to build:**
* One exported read in `terms/service.ts`, for example `currentVersions(q)`: the newest of each kind published at or before now, ordered `published_at desc, version desc, id desc`. The last key makes it total, so no tie is left to chance.
* The gate's own reads and sign-up's `currentTerms` both call it.
* `signup.ts` keeps its return shape (`id`, `kind`, `version`, `url`) and its transaction (`db: Tx | PrismaClient`).
* No migration, no new key, and no change to the 428 `TERMS_PENDING` wording.

**Done when** (P-606; list in the PR body; the reviewer ticks each), in `tests/check_pf5tv_current_terms.ts`:
* `PF-5tv DW1` fail, before the fix: two firm-terms versions with the same `published_at` (versions "2.0" and "2.1"). Sign-up, then the gate on the new firm's first request: today it may answer 428. Show that red once on `main`'s code (paste it), then fix.
* `PF-5tv DW2` pass: the same setup after the fix. The firm accepted exactly the version the gate calls current, and its first request passes with no 428. Run it 20 times with the rows inserted in both orders.
* `PF-5tv DW3` neither: a later version published after sign-up still gives 428 `TERMS_PENDING`, as PF-5t requires. `check_pf5t_terms.ts` and `check_pf5_signup_billing.ts` pass unchanged.

**Touch list:** `api/src/platform/terms/service.ts` (the one exported read; the gate's reads call it), `api/src/platform/firms/signup.ts` (`currentTerms` calls it), `tests/check_pf5tv_current_terms.ts`, `api/src/platform/MODULE.md` (the Tests line).

**Not in scope:** #1957's point 1 (accepting the current privacy notice at invitation acceptance, a PF-4b follow-up). It is a separate row, not this one.

**PR:**
* Keep it a **draft** until `Reviewer: Approve <head>`, then mark it ready once.
* Opus reviewer (P-303); the re-review reads only the diff (P-277).
* Label `review: approved` only after Approve and green CI (P-385).
* P-610: about 150 lines.

**Standard rules:**
* P-559: one row, one session, one PR.
* Merge `main` only on a conflict (P-270).
* Live AI off, US$0, never a priced button (P-175).
* Push after every step (P-557).
* Questions go in a PR comment headed "Question for the tech lead".
* Report to the current Lead (`tools/current-lead.sh`) and to Build Lead A (branch `lead-b-front-office`, `product/design/lead-b-state.md`).
* Never ask for or wait on a network or environment change.
* Read only the files named here and the code you change (P-556).
