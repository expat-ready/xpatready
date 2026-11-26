# R1.60 part a1: independent review (PR #3681)

Head reviewed: `bd28f653a0f508470097d38ef67fa4efc2d468c0` (`claude/runtime-r160-a1`) against `origin/main`. Rules: `screens/R1.60/rules.md` on `claude/sleepy-turing-xp6tvw` (a1 = R1-R6, R8, R16, B1-B6, cases 1-7, 15, O5). API only: the UI checks (D8-D14, BIC-01-20, 1024 px and 200 % zoom, keyboard) are N/A. Part a2 and part b were not counted.

**Verdict: Changes (Ship after fixes).** One Major (the migration records no rollback, a [M] line). No Blocker. Every rule checked holds in code and, where it matters, under the walls.

## What I ran
- `tests/check_r160_deposit_prepare.ts`: **36 passed, 0 failed** (about 10 s).
- Regression suites at this head, all 0 failed: `check_fo7a_money_schema` 122, `check_fo7t_trust` 62, `check_fo6_signing_api` 57, `check_fo5_retainers` 248, `check_ports_events` 31, `check_bypass_uses` 52, `check_fo7ts_money_settings` 157, `check_pf18np_port` 11.
- A reviewer probe in my scratch folder, not committed. It ran on a scratch database through the app's own `Db` (`xr_app`, PF-12 walls), on both real paths:
  - Signed offline in firm A's scope, and the fake vendor's webhook door (bypass lookup, then `withFirm`).
  - Results:
    - each path made one Prepared request of 123,457 cents, with 16,049 tax (13 %, 16,049.41 rounded half-even);
    - no held line;
    - a listener on both paths saw `current_user = xr_app` and `app.firm_id` equal to the signing firm;
    - three concurrent transactions on one version wrote 1 row, 1 audit line and 0 held lines;
    - a call naming firm B inside firm A's scope wrote nothing at B (it fails closed).
  - Function after the migration: `prosecdef = true`, owner `xr_wall_reader`, `search_path=pg_catalog, public, pg_temp`.

## The points asked about
- **Money.** Amounts are integer cents throughout:
  - The signed row's `amountMinor` (a digit string) goes to BigInt. Anything above `MINOR_MAX` gets a `trust.request_not_prepared` line.
  - The tax is `taxForLine` (BigInt, half-even, R1.59) at `taxDefault`'s Bill-to rate, the same path as invoice drafts. It is stored apart in an `integer` column, and the FO-7a count was raised to 12.
  - The currency comes from the row (the database allows CAD only) through `MoneyCurrency`.
  - Holder: the person or the company, with no case (G1, stated).
- **B4 under concurrency.** The two real paths already queue on the `fo_retainer` row lock. On top of that, `ON CONFLICT (firm_id, retainer_version_id) WHERE retainer_version_id IS NOT NULL DO NOTHING` matches the partial index. Under READ COMMITTED (Prisma's default), the second writer waits and then writes nothing. Proven by the probe, as above.
- **Savepoint.** Each listener runs in `savepoint retainer_signed_listener` (`signed-hooks.ts:31-41`), and every fault is rolled back alone. The suite's planted fault shows the signature, `signing.completed` and the deposit request all standing, with one held line. The `RetainerSigned.parse` at `:30` sits outside the savepoint (m3).
- **Trigger rewrite.** I diffed it against `20261118200000_fo7ts_money_settings` lines 153-203. Only four changes, and nothing was lost:
  - INSERT stamps `prepared_at := now()`;
  - the cancelled freeze adds the 2 columns;
  - `prepared_at` is refused on update, like `number` and `created_at`;
  - the tax is frozen with the amount once money is recorded.

  SECURITY DEFINER, the pinned `search_path` and the `xr_wall_reader` owner are set again (`migration.sql:70-72`, confirmed in pg_proc). The CHECKs hold O1. Existing rows have both columns null, so they pass. Changing `prepared_at` on update is refused, so #3033's unsent request can never become PREPARED in the database (B6).
- **Walls (PF-12).** The raw SQL (`platform_firm` ⟕ `money_payment_settings`, `money_text_ok`, the insert, `RETURNING`) runs under `xr_app` with the signing firm on both paths, including the webhook door (`signing/service.ts:138` `withFirm(found.firmId)`). The real `PrismaNotificationPort.notify` reads `currentFirm()`, which is set on both paths. No new bypass use.
- **Boundaries (contracts §8).**
  - Only `client-money/trust/on-signed.ts` writes `money_trust_request`.
  - The front office imports only `ports/retainer-signed.ts` and its own registry. Client money imports nothing from the front office.
  - The composition root (`features/client-money-trust.ts`) wires the two together.
  - The held line is the front office's own (`fo_retainer`).
- **The deviation (an in-transaction listener, not an outbox poller): sound.**
  - It follows the in-tx `onSigningCompleted` precedent and keeps the event row last (contracts §0.5).
  - A request exists exactly when its signature commits, and it needs no cross-firm bypass (P-423).
  - Its one cost is recovery after a fault; see m2.

## Findings
| # | Sev | Where | Finding and fix |
|---|---|---|---|
| M1 | **Major** | `prisma/migrations/20261125060000_client-money__r160_trust_request_prepared/migration.sql:1-11` | STANDARDS.md:34 [M] "recorded rollback" is not met: there is no Rollback line or `rollback.sql`. The four latest migrations all record one, e.g. `20261124170000_aud3…:10` and `20261124033000_fo7t1…:8`. This migration replaces a SECURITY DEFINER function, so its rollback is not obvious. **Fix:** a `rollback.sql`, or a "Rollback (by hand)" block, that recreates fo7ts's `money_trust_request_write()` body, sets SECURITY DEFINER, the `search_path` and the `xr_wall_reader` owner again, drops both CHECKs, then drops both columns. |
| m1 | Minor | `tests/check_r160_deposit_prepare.ts:44,63` | The suite connects as `xr_studio`, a superuser with BYPASSRLS, so the walls are never exercised. Because the savepoint swallows every fault, a future grant or wall regression would show only as a held line in production while this suite stays green. **Fix:** run one e-sign and one offline case through `Db` (`xr_app`), as `check_fo7t_trust.ts:62-75` does. My probe shows it passes today. |
| m2 | Minor | `front-office/retainers/signed-hooks.ts:40`; PR Q1 | The held line says "tried again by its own catch-up, or by a person", but neither exists in a1. Part b's G3 read runs at the Owner's Yes (R13), so a fault at a firm already on Yes is never retried. **Fix:** say so in the line and the PR, as a named gap the Lead can X-row (a retry job, or G3 also run on a schedule). |
| m3 | Minor | `signed-hooks.ts:30` | `RetainerSigned.parse` runs before any savepoint, so a payload that does not parse would undo the signature. Today the database keeps every payload parseable: label at most 120 (port 200), at most 50 rows, amount at most 10^10, CAD only, a NOT NULL representative. It is fragile coupling. **Fix:** parse per listener inside the try, so a bad payload is held, not fatal. |
| m4 | Minor | `web/src/modules/platform/notifications/contract.ts:30-37`; `platform/notifications/labels.ts` | The representative's Needs you item shows "Something needs you", with no label or page, because nothing labels `trust-request`. The PR says "nothing visible". **Fix:** state it as a gap until FO-7s3 adds the labeller and the words. |
| m5 | Minor (for a2) | `client-money/trust/reads.ts:44-46` | Paid, Part paid and `extraNote` compare the money paid with `amount_minor` alone. A deposit request asks for amount + estimated tax (R4). That is unreachable as Sent in a1, but a deposit can already be recorded on a PREPARED request. **Fix:** in a2, compare with amount + `estimated_tax_minor`. |
| m6 | Minor | `client-money/trust/on-signed.ts:69-70`; PR Q2 | With "Prices include tax" on, the tax is still added on top, while invoices refuse that setting. It is correctly raised as a question for a ruling. Keep it in the PR until the Lead or the founder rules. |
| m7 | Minor | test `:173-179`, `:192-216` | Planted fails are partial:<ul><li>B4: dropping the index makes ON CONFLICT error out; it never shows a second row.</li><li>Case 4: "the row shows in Ready to bill" is not asserted.</li><li>Case 6's `OTHER` path is not exercised. It is safe by construction (`signing/service.ts:139-143` hands `OTHER` to its own handler).</li><li>"Not registered → tax 0" is untested.</li></ul> |
| m8 | Minor | PR body | It names the migration `20261125060000_r160_trust_request_prepared`, which was renamed in 3d1157bd0, and the row files `R1.60-a1.md`, which are actually `R1-60-a1.md`. |

## D1-D20 (API only; 1-5)
- D1 requirement fit: 4. Every a1 rule maps to code and a check. G1 and G2 are stated. m4 is not.
- D2 data integrity: 5. One per version (index, row lock, probe). DB CHECKs. prepared_at is the database's and never changes.
- D4 rule integrity: 5. B1 and B3 gate first, in one place (`notDue`).
- D5 stability and recovery: 4. The signature survives a fault (savepoint). Recovery of a held request is m2.
- D6 governance: 5. `trust.request_prepared` names its actor (webhook, or the staff member) with before and after.
- D15 speed: 5. There is no per-row request, and the listener adds 3 small statements to the signing.
- D16 testability: 4. 36 checks with a pass and a fail each (partly m7). No walled run (m1). No coverage run.
- D18 provenance: 4. The request names its retainer version, the tax source and the reason.
- D19 closure: 3. Send comes in a2.
- D17, D20: simulated only.
- D3, D7, D8-D14: N/A (API only, no AI).

## Journey score: 8.75/10 (pass)
7 of the 8 criteria that apply, scaled to 10. Accessibility and visual quality are N/A for an API-only change. No criterion is at 0. Detail: `screens/R1.60/journey-test-reviewer-a1-2026-11-25.md`.

## Not checked
- `tsc` on `api/` ran out of memory here; CI's types job was skipped on this head.
- `j_59`.
- `graph.mjs`: it rewrites `qa/graph.json`, and this review edits nothing else.
- A real email or notification store with prefs (`check_pf18np_port` passes).
- Any screen (none exists).

Reviewer: Changes bd28f653a0f508470097d38ef67fa4efc2d468c0
