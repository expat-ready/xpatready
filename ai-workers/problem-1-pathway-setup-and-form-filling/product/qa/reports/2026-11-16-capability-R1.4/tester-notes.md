# Tester's notes (facts only) · qa capability R1.4 · main d66bcfd2d (tree 45abbb60a) · 16 Nov 2026, 21:xx IST

Asked by Lead 69 (Prove plan, P-644). Brief: `design/prove-lead-briefs/R1.4.md` on branch `prove-lead/records`. R1.4's Done when (CAPABILITIES): "A request's firm is set for its database session from the signed-in person only; a query with no firm set returns nothing (fail case); the bypass role is used only by named platform jobs and every use writes an audit line." Its one part: PF-12 #1910 (merged 13:47 IST 16 Nov). BACKLOG PF-12's Done when on the bypass: "the bypass role is refused on any route not on its list".

## On GitHub's runners (P-339)
* ci **43872700544** (merge batch), tree 45abbb60a = main d66bcfd2d's (`git rev-parse`). Jobs 18 success, 2 skipped. Suite lines (`ci-43872700544-suite-lines.txt`): 507 PASS, 0 FAIL, 21 quarantined.
* `check_pf12_walls.ts` 100 passed, 0 failed (**job 133320361478**); pf3 75/75, pf4 119/119 in the same batch.
* Posted on PR #1999 for the second lane's re-run.

## qa's own runs on main d66bcfd2d (isolated copies, never :4400; US$0)
* `check_pf12_walls.ts`: 100/100 (`check_pf12_walls-mine.txt`).
* **New qa check `tests/qa/check_r14_walls_gate_a.ts`, 16/16 twice** (`r14-gate-a-{1,2}-mine.txt`), gate A by API on the real main.ts:
  1. A lead added by firm B (sample-solo) is absent from firm A's list, 404 by id, and a take on it answers 404 and changes nothing (owner and updated_at as before).
  2. A raw session as xr_app with no `app.firm_id` reads 0 rows of `fo_lead` (2 exist) and 0 of `platform_staff`; with firm A set it reads exactly firm A's 1 lead.
  3. An `X-Firm-Id` / `X-Firm-Key` header or `?firmId=` naming firm B → 404. A body `firmId` naming firm B → 201 in firm A (ignored). A lead added with an `X-Firm-Id` header lands in firm A.
  4. xr_app owns no table; the running server's pooled connections are `xr_app`.
  5. The next capability's first step (R1.5's `/me` after sign-in) answers firm A for firm A's person and firm B for firm B's.
  7. All 70 walled tables (`platform_*`, `fo_*`, `money_*`, `msg_*`, `auto_*`, `plat_complaint*`) force row-level security (the 5 catalogues aside); every one but the catalogues and the 4 own registers has a policy `firm_id = platform_session_firm()` for read and write (`id` on platform_firm). The function reads `app.firm_id`.
  6. **Bypass record:** in each run, 26 `platform_bypass` lines in the server log and **0 `audit_event` lines** naming a bypass. Uses seen in the code: `platform.identity.authenticate` (every staff request: `guard.ts:90`), `platform.identity.sign-in`, `platform.identity.invitation`, `platform.web-address.host`, `platform.web-address.catch-up`, `platform.firms.signup`, `platform.demo.reset`, `job:<queue>`.
* Three faults in qa's own first drafts were fixed before these runs, none the app's. A "changes nothing" line compared a value with itself. The policy match looked for the literal `app.firm_id`, but the policy calls `platform_session_firm()`. PostgreSQL's regex has no `\b`.

## The bypass "audit line"
* `firm-scope.ts:129-147`: `asBypass` refuses a use not on `BYPASS_USES` or not on that use's routes (`BypassRefused`, 500), then calls `bypassLine(use, route)`. That is `logPort.info("platform_bypass", { use, method })` through the one logger (PF-23: redacted, with the request's correlation id). The comment: "The audit line for a bypass use: one platform_bypass line through the one logger". The `asBypass` doc: "every use writes one audit line (platform.bypass)".
* Nothing writes `audit_event` for a bypass. The platform module card says the one trail is `audit_event` (append-only, P-571 (1)). Logs are kept 90 days (R1.13's Done when). The firm cannot read the logs; it reads `audit_event` (R1.88).
* R1.4's words: "the bypass role is used only by named **platform jobs**". On main the bypass is also used by named request doors (sign-in, every staff request's authentication, invitation, web address, sign-up), each on its listed routes.
* "Bypass refused on a route not on its list": not reachable through the running app's API (every listed use is called only on its routes). It is proven by PF-12's pack (`BypassRefused` cases) only.
