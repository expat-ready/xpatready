# Brief: Row FO-7t part 1 — trust on and money in: the trust question, trust requests, deposits with their TRUST receipt, the ledger and balances (Track B lane 6; cloud builder)

Written 22 Nov 11:4x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime FO-7t` and take **part 1 only**.
Model: Opus 5.5, effort: high (money; P-608 (2)).
Item: R1.58
**PR title:** `runtime: FO-7t part 1 — trust on and money in`

**Start when:** **FO-7b part 1b is merged** and #2919 is merged or closed (it brings the receipt writer, the derived invoice status and `ClientMoneyPort`, which part 1 calls). The other conditions of `FO-7t.md` part 1 are on `main`: PF-12 (the `money_*` walls) and FO-7ts's trust-answer step (#2106). No migration.

**The specification:** `design/briefs/FO-7t.md` on `main`, **part 1** exactly, with its rulings: the trust answer is `UNANSWERED | YES | NO` and Owner only (`@AnyStaff("Owner only, checked by the service: AG-6-59 r8")`); keys from the catalogue only (`agent/payment:record` for requests and deposits, `agent/invoice:show` for the ledger view); balance per case as ruled; FO-7t **calls `money_move_line_write` and reads `money_to_move` only, adding no move rule of its own**.

**Decisions (word for word):**
* **P-567 (3):** ""Ledger now, trust card later": per-client trust ledger, receipts, offline trust deposits, invoice before withdrawal, 30-day withdrawal reminder; card only for invoiced fees into the operating account; card into trust waits on a verified processor set-up that puts the full amount in trust and charges fees and chargebacks to operating (FO-7 step 0); AG-6-70's optional trust card account is not in month one; Code s. 32(a)-(g), s. 33(3); Unconfirmed: no counsel."
* **P-603:** "Money leaves trust only by a withdrawal to an issued invoice or a refund to the client; a correction names exactly one withdrawal or one deposit, and a negative correction is capped at that deposit; a correction never re-opens an invoice's trust cap"
* **P-634 (1):** "A reversal (Returned, Recorded by mistake, Wrong client) is always accepted, even below zero; the view `money_trust_shortfall` lists every party below zero, shown red; every other outflow stays at or under the ledger balance; the uncleared warning sits in the routes; Returned is refused on e-Transfer, card or cash."

**Touches:**
- `api/src/client-money/trust/`
- `api/src/features/client-money-trust.ts`
- `api/src/client-money/MODULE.rows/FO-7t-1.md`
- `tests/check_fo7t_trust.ts`
- `ports/events.ts`

`ports/events.ts`: the `trust.deposited` line and its payload type only. **Open PR #2919 changes `ports/events.ts`** (seen by the start hook 22 Nov ~11:5x IST): start after it merges, or, if the structure lane has split events into `ports/events/<module>.ts` by then, use the client-money file and say so.

Nothing in `invoices/` (part 2 is the one that edits FO-7b's issue step). Legal readings: **Unconfirmed: no counsel**.

**Done when:** `tsx studio/tests/check_fo7t_trust.ts` exits 0 with part 1's DW cases from `FO-7t.md` each passing and failing as named; `check_fo7a_money_schema.ts`, `check_fo7b_invoices.ts`, `check_fo7mv_move_list.ts` and `check_pf12_walls.ts` pass unchanged (exit 0); the demo reset, the checkpoint load (C10.1) and full `ci` green.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: no `api/src/client-money/trust/`; `git grep -n "trust.deposited\|agent/trust" origin/main -- prototype/studio` finds nothing; no open PR builds trust routes (#2368 is FO-7ts part 3, schema only).

**Review:** an Opus reviewer at high **and the breaker** (money, P-278). The Lead reads every money path before the label (P-423).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
