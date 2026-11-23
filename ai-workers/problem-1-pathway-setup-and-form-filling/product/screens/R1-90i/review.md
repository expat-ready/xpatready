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

## Round 2: diff only, bacf188d → `0eb3cdb1410f7afcbe97e960cf61cb06e5879a27`
**Runs.**
* `check_r190_invited_signup` **17/17** on a fresh copy at 4440 (both local stand-ins). Its api.log has no 500 and no error line.
* `check_pf28_inputs` **48/48** on a second fresh copy at 4440.
* Both copies are stopped.

**Round 1, closed.**
* **M1 closed.** Both doors test the token's shape before `asBypass` and answer `linkGone()`. IS6 sends 65 characters, a dot, a % and a tilde on GET and POST: all 404 in the one set of words.
* **M2 closed.** `liveLink` commits the firm-less line for unknown, unused and expired links. A used link gets `touchFirms` on its firm (the same way as the self-serve lookup's line), then the 404. IS7 shows the open lines going 8 → 9 and the firm's lines 3 → 4.
* **Confirm after the link has gone.** `LINK_GONE` rolls the transaction back; then `signup.verify-link-gone` is written and the answer is 404. IS7's fail case: no firm, the link unused, the line kept.
* **m1 closed.** The GET has a per-IP limit (`invite-open:`, 30 per window); IS8 gets 429 from the 23rd call of its burst, once the check's earlier opens are counted.
* **m2 closed.** `rollback.sql` follows the 15 existing ones; `migration.sql` points to it.
* **m3 closed.** Tests added for an Admin making a link, an unknown plan, an unknown field, PLAN_GONE (409) and the link going between the form and Confirm.
* **m4 closed.** `firm.created` says "invited sign-up, from a private link".
* **m5 closed.** The invite door has its own 404 words: "Ask us for a new link, or sign in…".
* **Not changed:** m7 (the PR body) is being rewritten; m8 is the graph tool's gap.

**New finding.**
* **N1 (Major, Must): `tests/journeys/j_90.ts:167` no longer parses.**
  * The m6 edit put a `//` comment in the middle of the call:
    `j("POST", "/api/system/signup-links",   // Lead 6 on #3040: … { email: invited, …, period: "MONTHLY" }, tok);`
  * Everything after `//` is now a comment: the body, `tok` and the closing `);`.
  * TypeScript's parser reports `168: Argument expression expected`. The whole j_90 journey (W1-W6) cannot run in walks.yml or item-proof, which run it.
  * Fix: move the comment to the end of the line, or to its own line above the call. Then run `j_90` once (its W4 lines stay red by design until the screen exists).

**Verdict round 2: Block `0eb3cdb1410f7afcbe97e960cf61cb06e5879a27`.** One open Major, N1, a one-line fix; nothing else is open.

Reviewer: Block 0eb3cdb1410f7afcbe97e960cf61cb06e5879a27

## Round 3: diff only, 0eb3cdb1 → `3b13faf61c560179ea6ae8cbdd04714be51d5067`
**Runs.**
* `check_r190_invited_signup` **17/17** on a fresh copy at 4441 (both local stand-ins).
* `check_bypass_uses` **52/52**.
* `j_90.ts`, the R1.90 check and `firm-scope.ts` parse with 0 errors (TypeScript parser).
* The copy's api.log has **0** answers of 500. The copy is stopped.

**Closed.**
* **N1 closed.** The j_90 W4 comment is on its own line, and the call is whole again (`j_90.ts:167-168`). I did not run j_90's browser walk; the builder reports 29/32, with W3 and W4's last line red for known reasons.
* **The breaker's R2-M1 closed.**
  * Both listed uses now take `[^/]{1,400}` on `/api/public/signup/<token>` (firm-scope.ts:139, :147).
  * The path tested is `req.path` with the query and trailing slashes removed (`routeOf`, firm-scope.ts:406-408).
  * The token's decoded shape is still checked before `asBypass`, so only a 43-character token can reach the bypass.
  * Encoded forms that decode to the shape are under 400 characters (43 × 3 = 129).
  * Probes on 4441:
    * `%41%41%2F…`, 140 × `%41`, and `…%00` → 404 on GET and POST.
    * A valid-shaped token with `?x=a/b`, and one with a trailing `/` → POST 422 (body first, per PF-28), not 500.
    * The GETs answered 429: the check had used up the per-IP limit, which is m1's limit working.
  * IS6 now covers `%41`+42 `A` and `%41`×43.

**Observation (not a finding).** The two frozen-list entries now accept any single path segment of up to 400 characters. This is safe only because the two callers (`invited`, `signUpInvited`) check the shape before `asBypass`. A future caller of these uses on this path must keep that order.

**Open:** none at Major or above. m7 (the PR body) is the builder's, and m8 is the graph tool's gap.

**Verdict round 3: Approve `3b13faf61c560179ea6ae8cbdd04714be51d5067`.**

Reviewer: Approve 3b13faf61c560179ea6ae8cbdd04714be51d5067

## Round 4 (diff only, 35694aca3..2dd912dc0)
**Scope.** The Lead allowed this round. Three commits of this PR's own, plus two merges of main. Context: Lead B 4's reads, and Lead 10's and Lead 11's rulings on #3040.

**Merges are automatic.**
* `git show --remerge-diff` prints 0 lines for d8d32b94f and for 92e1721bf, so nothing was edited by hand in either merge.
* I compared this PR's diff against its merge base, at round 3 and now. The two diffs differ in exactly three ways, and nothing else in its 13 files moved:
  * the migration folder's name;
  * the first line of `rollback.sql`;
  * `createdBy` plus the test's new pass/fail line.
* `origin/main` is now 4742387cd, 25 commits ahead. `git merge-tree` with it is clean, and main has no migration newer than 20261123200000.

**Own commits.**
* **fbe9f2065 is a pure rename** to `20261124070000_r190_signup_link_plan` (0 lines changed), which is Lead B 4's stamp.
  * No other folder shares that timestamp, and it is the newest.
  * Main's `20261123030000` is now `aud_ourstaff_actor_word`.
* **137ab4a6f:** the first line of `rollback.sql` now names the new folder. Nothing else changed.
* **2dd912dc0:** `signup.ts:232` stores `created_by` as `ourstaff:<staffId>`.
  * This is AUD-3a's word, the same one used by `observability/hook.ts:49`, `holds/service.ts:30` and `web-address/routes.ts:103`.
  * `platform_signup_link.created_by` is TEXT NOT NULL with no CHECK (`20261114015002_pf3_platform_tables`), so no constraint needed to change.
  * No code reads the column.
  * The new pass/fail line (`check_r190_invited_signup.ts:75-76`) compares the column exactly against `ourstaff:${OWNER.id}`. Putting back the `system:` word makes this line fail.
* **Audit path after AUD-3c (#3296).** `makeLinkWork`'s `touchPlatform` now goes through the port's narrow `OurStaffPlatformEntry` kind (`firm-scope.ts:360-380`), as Lead 10 ruled. This PR adds no exemption and puts no `system:` word on a staff member's act.

**Runs (my copy `rev_r190i` on :4436, both local identity stand-ins, live AI off; stopped afterwards).**
* `check_r190_invited_signup` **18/18**, exit 0. This includes the new line: `{"by":"ourstaff:3bf42090-…"}`.
* Database, after the run:
  * Three links were made: two by the Owner, one by the Admin.
  * There are three `audit_event` lines with `ourstaff:<id>`, `OUR_STAFF`, `firm_id` null, `platform.bypass` and `plat_bypass_use`.
  * Each line's `detail.key` is its link's id, with `use` = `platform.firms.signup-link` and `step` = `signup-link.create`. No token appears in any line.
* The copy's api.log has 0 answers of 500 and 0 `AuditRefused` or `audit_write_error`. This red was the round's starting fault: `audit-event.ts:86` on d8d32b94f.
* `check_bypass_uses` **52/52**. `check_aud3c_platform_line` **16/16** (it needs `--tsconfig api/tsconfig.json`).
* The working tree was clean after the run: no screenshot was rewritten.

**#3209's firm-data declaration: I agree it belongs to whichever of #3040 and #3209 lands second.**
* `audit/access/declare.ts` is only on #3209's branch (`claude/runtime-aud3-lines`, 8c19e203e), so this PR cannot import it today.
* The rule enforces itself on the second PR to land:
  * `assertFirmDataDeclared` stops the start-up on any undeclared route our staff call (`audit/access/lines.ts:115,128` on that branch).
  * `check_aud3_access.ts:192-195` lists every `@NoFirmData` route exactly.
* So the second PR must add `@NoFirmData(<why>)` on `signup-links.ts`'s POST, and add that route to the list. A link has no firm until it is used, so `@NoFirmData` is the right declaration, not `@ChangesFirm`.

**Findings.**
* **n1 (Nit, Should, not blocking):** `check_r190_invited_signup.ts:114` seeds the expired link with `created_by` = `staff:${OWNER.id}`, which is a firm staff member's word, for a Platform Owner. It is a fixture only, but the check now states the rule as `ourstaff:<id>`. Use `ourstaff:` there too.
* **Lead B 4's Minor (`system:` on `created_by`) is closed.** **Lead B 4's fault (the 500 on POST) is closed** by #3296 being on main, with no change from this PR.

**Journey score.** Round 1's reviewer score stands at **8/10, pass** (`journey-test-reviewer-2026-11-23.md`). Not re-walked: this round changes one stored word and a folder name, nothing a person sees. Journeys IS1-IS8 replay green (18/18).

**Could not check:** the full run on this head, which waits on the Lead (stamp steps), and the j_90 browser walk.

**Open:** none at Major or above.

Verdict: Approve at 2dd912dc07a9f825cedf160bcc8abc79b444ccb9
