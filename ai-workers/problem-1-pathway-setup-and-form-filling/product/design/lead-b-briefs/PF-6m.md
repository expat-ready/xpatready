# Brief: PF-6m, the money-keys audit line on an accepted invitation (QA-478; R1.6) (cloud builder lane; row owner Lead B)

Written 16 Nov 10:1x IST by Lead B (6), rev 16.53, for P-626. qa's QA-478 (#1929, J-6 break F3): an invitation into a money-bearing role (Billing/Finance, 12 MONEY keys) is accepted with no `platform.staff.money_keys_granted` line. The role-change door writes that line (`identity/service.ts:242`, PF-6b rule 2 (b): "Assigning a role that carries a money key writes its own audit line"); the invitation door does not (`identity/session/service.ts`, the accept transaction). **Model: Opus 5.5, effort: high**: permissions and audit. **Starts when:** now. No open PR touches `identity/session/service.ts`; check at start.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-6m` and take **one row, PF-6m**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** BACKLOG PF-6b (rule 2); on `main`: `api/src/platform/identity/service.ts` (the roles-change path with `moneyKeysOfRoles` and its `money_keys_granted` line, about lines 230–245), `identity/session/service.ts` (the invitation accept transaction, about lines 85–100), `identity/audit.ts`; qa's `tests/qa/check_qa478_479_r16_breaks.ts`.

**What to build:**
* **One shared helper** for the money line, used by both doors so they can never differ again: `writeMoneyKeysGranted(tx, { firmId, firmKey, actor, staffId, roles })` in `identity/audit.ts` or a new `identity/money-line.ts`. It names only the roles that bring a money key, and key names only (the role-change door's "break m2" rule).
* The roles-change door calls it instead of its inline lines, with no behaviour change.
* The invitation accept calls it inside the same transaction, after the role grants and before the provider call. The actor is the inviter (`inv.invited_by`), as the grant rows record.

**Done when** (P-606), in `tests/check_pf6m_money_line.ts`, a pass and a fail each:
* `PF-6m DW1`: accepting a Billing/Finance invitation writes one `platform.staff.money_keys_granted` line naming the money keys. Accepting a Read-only invitation writes none.
* `PF-6m DW2`: a refused provider call rolls the whole accept back, money line included (no line, no staff row).
* `PF-6m DW3`: the role-change door's line is byte-for-byte the same as before for the same roles. PF-4's, PF-4b's and PF-6b's suites pass unchanged, and qa's QA-478 line passes.

**Touch list:** `api/src/platform/identity/service.ts` (the call only), `identity/session/service.ts` (one call), `identity/audit.ts` or the new helper file, `tests/check_pf6m_money_line.ts`.

**Duplicate check (P-526):** BACKLOG, open PRs (`identity/`), BUGS (QA-478); one `Duplicate check:` line.

**Reviewer and breaker** (P-278). The breaker tries an invitation with two roles, one with money keys; and a replayed accept. The release holder reads the diff (P-423).

**P-610:** under 800 changed lines (estimate about 150).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
