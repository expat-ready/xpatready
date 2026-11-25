# AUD-3 breach read (R1.87 P6) review: reviewer, 25 Nov 2026

**PR #3660, head `dd8df1ca7f0588a50954033873eecc88f1eeedfb`.** Runtime, API only, no screen. I reviewed against the row `BACKLOG.md` AUD-3 (1) ("every `/api/system/*` route … writes … one line on the touched firm's chain … reads included", map row 87) and the probe's step P6 (`tests/qa/probe_r187_firm_sees_our_read.ts`). The Lead's scope ruling holds: only the breach read is covered, and `support/tickets/:id` and `register/requests/:id` are unchanged, as stated in `report.ts:24-28`. There is no `concept.md`: the row is the concept.

**Skill verdict: Ship after fixes.** One Major, no Blocker. Journey score **8.75/10, pass** (`journey-test-reviewer-2026-11-25.md`).

## What I ran (exact head; Postgres 127.0.0.1:54329; an isolated copy on :4437, never :4400)
* `check_pf21c_breaches.ts` **52 passed, 0 failed**. `check_aud3_access.ts` **49 / 0**.
* R1.87 probe on :4437: **P6 PASS**. Three checks are red, and each is a part labelled missing outside this row: AUD-3b's reason, AUD-3 part 3's search and AUD-3b's session.
* My API journeys J1-J9 on :4437, run twice: see the journey report.
* **Mutations** (a scratch worktree at the same head, one change each):

| Rule removed | Result |
|---|---|
| `noteFirmsRead(...)` call (`service.ts:226`) | DW6 pass goes red (51/1) |
| Set dedupe → array (`tracker.ts:22-28`) | DW6 pass goes red (2 lines on A) |
| firm lines moved out of the platform line's transaction (`lines.ts:176-179`) | **52/0 and 49/0: nothing fails** |
| firm-line failure swallowed (`.catch(() => undefined)`, `lines.ts:178`) | **52/0 and 49/0: nothing fails** (Major 1) |

## Issues, ranked
1. **Major (Must): no test pins "no line, no answer" or "all or none" for the new firm lines.**
   * `lines.ts:172-179` claims both. It holds at this head: in J8, a scratch trigger refused firm B's `firm_read`, the read answered 500, the body had no breach, and neither firm line nor the platform line committed.
   * The scenario: a later refactor writes each firm's line in its own transaction and catches the error (the "write the others anyway" instinct). Then `GET /api/system/register/breaches/:id` answers the breach, with each notified firm's message subject and text, without firm B's line, and both suites stay green.
   * This is P-607 (3) fail-closed, and the row's "no route can forget". `check_aud3_access.ts:408` (DW4) covers only the `@ReadsFirm` path.
   * **Fix:** in `check_pf21c_breaches.ts` add a fail case: one breach naming A and B, and a scratch-DB trigger (or a `recordFirmRead` that throws) that refuses B's `platform.system.firm_read`. Expect 500, no breach text in the body, 0 `firm_read` lines for that correlation id on A, 0 `cross_tenant.access` for it, and one `audit_write_failed` alert.
2. **Minor (Should): a firm learns a breach record names it before any notice decision.**
   * The scenario: our Platform Owner opens a DRAFT breach (pre-filled from an integrity alert), an UNDECIDED one, or one decided "no notice". Firm A's Owner then sees under "ExpatReady staff access" → Advanced (`firm-read/render.ts:56`): `route: /api/system/register/breaches/:id, scope: "one breach and the firms it names"` (J9).
   * SA-11-12 (our reads are shown to the firm) and SA-07 Appendix A's notice decision pull against each other here. Per AGENTS rule 2 that goes to the Lead or the founder, not settled in code. Unconfirmed: no counsel.
   * **Fix:** state it in the PR body under "Questions" with a recommendation. No code change asked.
3. **Minor (Should):** the line's summary, "ExpatReady staff read this firm's records." (`lines.ts:62`), is the generic firm-read wording. Here our staff read our own register's record that names the firm, and the plain scope is only under Advanced. **Fix:** leave as is, or say it in the PR body; a scope-aware summary is a wording choice for the Lead.
4. **Minor (Should): per-firm round trips.** `lines.ts:178` calls `recordFirmRead` once per firm, and each call runs `platformAuditWorkspaceId` plus one insert (`audit-event.ts:64-65`). A 200-firm breach (the cap, `service.ts:74`) reads in 294-571 ms against 14-21 ms for one firm. That is within the bar on Sample data (STANDARDS §9). **Fix:** state it beside the existing per-notice note ("Break m2 (#3492)", `service.ts:217-219`), or batch later.

## D1-D20 (runtime row; one line each)
* D1 Requirement fit 5: the row's "reads included … on the touched firm's chain" is met for the breach read (J1, P6).
* D2 Data integrity 5: duplicate firms removed (Set), no line on unnamed firm C, the list, 404s or refusals.
* D3 Reuse and normalisation 5: it reuses `recordFirmRead` and the same request-scope tracker.
* D4 Rule integrity N/A.
* D5 Stability and recovery 4: 10 parallel reads are fine, and fail-closed holds but is untested (Major 1).
* D6 Freshness and governance 5: header comments in `declare.ts`, `lines.ts`, `tracker.ts` and `report.ts` were updated, including the limit that #3491 had stated.
* D7 AI trust N/A.
* D8-D9 N/A (no screen).
* D10 Language and guidance 4: see minor 3.
* D11 Feedback and state 4: the usual 404, 403 and 500.
* D12-D14 N/A (no screen).
* D15 Speed 4: see minor 4.
* D16 Testability 3: pass and fail cases for the happy path, but the fail-closed rule is untested (Major 1).
* D17 and D20: simulated only.
* D18 Information provenance 5: actor word, route and scope on the line.
* D19 End-to-end capability closure 4: the firm sees our read in its Activity log and in our access report. The scope is limited to the breach read, as the Lead ruled.

## Code checks
* **Correctness:** `noteFirmsRead` runs only after the read succeeded (`service.ts:226`), so a 404 notes nothing. The note is per request (WeakMap on the request scope) and is read only on `@ReadsAcrossFirms` routes. The notices' firms are a subset of the affected firms (the migration's trigger, `pf21c_breaches/migration.sql:165`), so the second list is redundant but harmless. Affected firms must exist (`plat_breach_firms_exist`).
* **No migration.** **Concurrency:** no per-firm chain lock on `audit_event`, so overlapping breaches cannot deadlock. **Server authorisation:** Support → 403 and a firm token → 403, with no line (J5). **Duplicates under race:** N/A (reads).
* **Graph (P-86):** `graph.mjs` lists G3 "no test reaches" for every `/system/register/breaches*` route. That is a false positive: the suite calls them via `call(base, method, path)` (lines 331-341), which the graph's parser does not read. It predates this PR and is not a finding here.
* **Scaffolding (P-33):** none. The journey runs through the product's own routes.

## BIC-01-BIC-20 (EXPERIENCE §6)
N/A for every check: no case-side screen (API only).

## Newer head, not reviewed here
`37de80b1c` (05:46 UTC, "round 1 (breaker)") landed on the branch during this review. All evidence above is from `dd8df1ca7`: the suites, the probe and the journeys ran before it, and the mutations ran in a scratch worktree at `dd8df1ca7`.

From its diff only:
* It takes the route and scope off the firm's line (the route becomes `/api/system`) and keeps them on the platform line. That addresses minor 2's disclosure.
* It sets the transaction's timeout to 60 s.
* It adds no fail-closed or all-or-none test, so Major 1 is still open there.

## Could not check
The browser, keyboard, 1024 px and 200 % zoom (no screen); a screen reader; an intended user's walk (D17, D20); support-session reads (AUD-3b, not built); the CI run at this head (not read).

**Verdict: Block** (one open Major). To fix: Major 1 (one fail case in `check_pf21c_breaches.ts`). Minors 2-4 are PR-body statements.

Reviewer: Changes dd8df1ca7f0588a50954033873eecc88f1eeedfb
