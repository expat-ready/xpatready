# R1.90 invited sign-up (API only): review

PR #3040 · branch `claude/runtime-r190-invited` · head `bacf188d8a9aa8bf1bdb3afd9f94728775457b9a` · reviewer (fresh context, did not build it) · 23 Nov 2026.
Scope: the PR's API, migration and tests against the PF-5 row ("an unused invited link signs up once, a used or expired one → 404"; "the invited sign-up carries a plan and period"), PF-3's link table, the tech lead's four answers on the PR (keep `/api/system/signup-links`; link shown once, no email from us; same provider email check, link used at Confirm; API only), `api/src/platform/MODULE.md` invariants, P-785 (2), PF-28, STANDARDS. The `/sign-up/invited` screen is a separate row (not a finding).

**Verdict: Rework (Block).** Two Majors: a malformed token gets 500 on a public door, and refused link reads under the bypass leave no audit line.

## What I ran (my own copies, never :4400)
* `isolated.sh rev_r190i 4438 … PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local` + `check_r190_invited_signup.ts 4438`: **11/11**.
* Fresh copy 4439: `check_pf28_inputs.ts` **48/48**. On the 4438 copy, run straight after the R1.90 check, it was 46/48: `POST /api/public/signup/:token` → 429. The invited form shares the self-serve `signup:<ip>` bucket (10 per 10 min). That is by design, but the suites cannot share a copy.
* `check_pf5_signup_billing` 107/107, `check_pf12b_bypass_audit` 70/70, `check_pf3_platform_schema` 75/75, `check_bypass_uses` 52/52. The PF-5 check rewrote 8 tracked PF-5s screenshots, which I restored with `git checkout`.
* Probes by curl and psql on 4438 and on a fresh copy 4440 (below). Graph: `node product/tools/graph.mjs` (no `--write`).

## Findings
**M1 (Major, Must): a malformed token answers 500 on both public routes (PF-28: a bad id is 404, never 500).**
* `GET` or `POST /api/public/signup/a.b`, `…/abc~def` and a 70-character token all → **500**. `api.log` has an `asBypass` error at firm-scope.ts:285 for each.
* Cause: `invited` and `signUpInvited` (signup.ts:247, :258) enter `asBypass("platform.firms.signup")` before the shape check (signup.ts:237, :264). The widened route pattern only allows `[A-Za-z0-9_-]{1,64}` (firm-scope.ts:139, :147), so `BypassRefused` fires first.
* The PF-28 sweep probes only well-shaped tokens and `not-a-uuid`, so nothing catches it.
* Fix: test `LINK_TOKEN` before `asBypass` (in the controller or at the top of both methods). Add an IS line where `a.b` and a 70-character token give 404 on GET and POST.

**M2 (Major, Must): refused link reads under the bypass write no `platform.bypass` line (MODULE.md: "every bypass use writes platform.bypass … or is refused"; PF-12b, Lead 15's ruling on #2814).**
* `liveLink` (signup.ts:236-243) calls `touchPlatform(… key: row?.id ?? null)` and then throws `notFound()` inside the same `$transaction`. The throw rolls the line back.
* Measured: 120 unknown-token GETs left the `signup-link.open` count at 3 → 3. The R1.90 check's used-link and expired-link calls (IS3 fail, IS4) also left no line. Only successful opens are kept.
* A used link's row carries its firm (`firm_id`, under the `pf12_firm` policy), so reading it is a read of that firm's row with no line on that firm's trail (`platform.firms.signup` is `audit: "per-firm"`).
* Fix: do as `verifyDoor` already does. Return the row from the transaction, write `touchFirm(tx, row.firmId)` when the row has a firm (else `touchPlatform`), and throw after the commit. Add a pass/fail line counting the lines for unknown, used and expired links.
* Once refused opens write lines, the GET needs the per-IP limit from contracts §0.6: `invitedWork` has none (120 GETs, no 429), so every anonymous GET would write a row (m1).

**Minors (Should)**
* m1: `GET /api/public/signup/:token` is not rate limited per IP (contracts §0.6, the header of routes.ts). See M2.
* m2: STANDARDS §5 [M] "recorded rollback": `20261123030000_r190_signup_link_plan/migration.sql` has no Rollback line. Every other recent migration has one except the two pf8b checksum ones. Add `DROP INDEX …; ALTER TABLE … DROP CONSTRAINT/COLUMN …; delete the _prisma_migrations row`.
* m3: some rules have no failing test.
  * Confirm after the link expired (signup.ts:313 `expiresAt: { gt: now }`): I checked by hand on 4440. The verify answered 404, no firm was made, the link stayed unused and the pending sign-up was kept. After the expiry was restored the same code made one firm. No test fails if the guard is removed.
  * `PLAN_GONE` 409 on GET and POST: checked by hand, words fine.
  * makeLink's unknown plan, bad email, unknown field, bad period, long reason: all 422/400 with the field named.
  * Admin (not only Owner) → 201: checked by hand.
* m4: the `firm.created` audit line for an invited firm says "Firm created by self-serve sign-up" (signup.ts:314). Nothing on the firm's trail names the link. The trail is accurate only through `platform_signup_link.firm_id`. Say "from a private sign-up link" and put the link id in `detail`.
* m5: the 404 words for an invited person send them to self-serve ("Sign up again, or sign in.", signup.ts:59), not "ask us for a new link". This is for the screens row's words, or a link-specific detail.
* m6: Lead 6 on the PR: "Put the one-line change for qa's j_90 W4 on this PR". `tests/journeys/j_90.ts:167` still posts to `/api/platform/signup-links`. Carry the change or name it in the PR body for qa.
* m7: the PR body is stale. It names migration `20261122110000_…` (now `20261123030000_…`) and says PF-12b's registry was edited (now a `*.bypass.ts` file). Its first line should say "new bypass use" per DEVELOPING.md's bypass section.
* m8 (graph, P-86): G3 lists `GET|POST /public/signup/:token` as "no test reaches" and G6 lists `features/platform-signup-links.ts` as "nothing imports". These are false positives (template-literal paths; features loaded by glob). `/api/system/signup-links` is not in the graph's route list at all (`@Post()` with an empty path). These are the tool's gaps, not the PR's.

## What held (evidence)
* **Permissions:**
  * Support → 403, a firm Owner's token → 403, no session → 401 (IS1, curl).
  * No reason → 400; reason over 500 characters → 400.
  * The key is `system/signup-link:manage` and the reason lands on `plat_system_audit` (IS5).
  * The new use is in its own `signup-link.bypass.ts`; `BYPASS_USES` keeps its 15 names (`check_bypass_uses` 52/52). The two listed uses are widened only on the token routes, and their names are unchanged.
* **Single use and concurrency:**
  * Two Confirms at once → 200 and 404, one firm (IS3).
  * Two invited forms at once → 202 twice, one live pending sign-up (email advisory lock). On 4440: 1 live of 2 rows.
  * The link is marked used with its firm inside the firm's transaction. PF-3's trigger and the used-with-firm check stay as the backstop.
* **Privacy:**
  * The token is stored only as sha256 (IS1).
  * Neither the token nor the email appears in `api.log` (0 hits on both copies; request lines log the route pattern `/api/public/signup/:token`), in `platform.bypass` details (0) or in `plat_system_audit` (0; `target` is `{}`).
  * The email in `firm.created` and `owner_created` is PF-5's existing behaviour.
* **PF-28:** order is shape → body → link (`check_pf28_inputs` 48/48 with `:inviteToken`). The strict body refuses an `email` field (IS3).
* **Migration:** columns added only, defaults for existing rows, FK with an index, 14-day check unchanged. The PF-5 diff filters exclude only the new columns (107/107).
* **Plan and period carried:** firm `PROVISIONING|firm|YEARLY|TRIAL` (IS3).
* **Speed:** max latency in api.log: GET 25 ms, invited POST 138 ms, verify 65 ms, make-link 29 ms.

## D1-D20 (API only: D8, D12-D14 N/A, no screen; D17 and D20 simulated only)
D1 4 (PF-5 lines met; m3 gaps) · D2 4 (one firm, one live pending, link used once; M2 audit gap) · D3 4 (reuses PF-5's Body, signUpWork, verify) · D4 N/A · D5 3 (double submit holds; malformed token 500, M1) · D6 3 (no rollback note, m2) · D7 N/A · D9 3 (m5) · D10 4 (field-named 422s) · D11 4 (201/202/409 states) · D15 5 (above) · D16 3 (pass+fail for IS1-IS5; m3 and the M1/M2 cases untested) · D17, D20 simulated only · D18 4 (plan "(Sample)", terms versions, tax note on GET) · D19 2 (staff link points at `/sign-up/invited`, not built yet: the screens row).
BIC-01-20 (EXPERIENCE.md §6): N/A, not a case-side screen.

## Journey score (reviewer, the one score for this check)
**8/10, pass** (no criterion at 0): `screens/R1-90i/journey-test-reviewer-2026-11-23.md`.

## Could not check
* Real Cognito's register and confirm (local stand-in only).
* A browser walk: no screen in this PR.
* An intended user's unaided walk (D17/D20 stay with the founder).
* CI on this head (not read).
* This branch is behind main, but main's newer commits add no migration after `20261123030000`.

**Verdict: Block bacf188d8a9aa8bf1bdb3afd9f94728775457b9a**
To fix: M1 (shape check before `asBypass`; 404 test), M2 (keep the refused-read line, touch the link's firm when it has one; test). Minors m1-m7 should be fixed in the same round where cheap (m1 and m2 especially).

Reviewer: Block bacf188d8a9aa8bf1bdb3afd9f94728775457b9a
