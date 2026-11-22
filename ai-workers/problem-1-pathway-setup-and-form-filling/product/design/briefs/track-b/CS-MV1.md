# Brief: Row CS-MV1 — case visibility for money, behind a port (Track B; cloud builder)

Written 22 Nov 17:3x IST by Lead B (Track B). Row: `product/BACKLOG.md` row **CS-MV1** (on branch `lead-b/2026-11-22-track-b` until the Lead's records PR lands). Run `/next runtime CS-MV1`.
Model: Opus 5.5, effort: high (permissions; P-608 (2)).
Item: R1.56
**PR title:** `runtime: CS-MV1 — who may see an invoice (MoneyVisibilityPort)`

**Why now:** FO-7q (#3001) is fail closed (`reads/visibility.ts` `failClosed`: nothing) because no port answers AG-6-1 §8 C5 on `main`, so every staff member sees an empty invoice list and R1.56 cannot be walked on screen.

**Start when:** now: the port, its fake, its contract and the adapter. **No migration.** The one binding line (the adapter in place of `failClosed` in `api/src/features/client-money-reads.ts`) is **not** in this PR: that file belongs to open #3001; it lands as a one-line follow-up after #3001 merges (say so in the body). FO-7q's DW9 cases are run here against the adapter passed in directly, as FO-7q's own test passes a scope.

**What to build (the row, exactly):** new `ports/money-visibility.ts` (zod only) `MoneyVisibilityPort.scopeOf(ctx) → { cases: string[]; parties: string[] }` (FO-7q's `MoneyScope` shape; never `"ALL"` from the app), its fake and `ports/contracts/money-visibility-port.contract.ts`. The adapter:
* **cases** = the case side's own answer for who sees a case: **read the rule on `main` and cite it in the PR** (the case team, `20261101130000_c611_case_team`, and any firm-wide or role rule the case side applies today; there is no `agent/case:view.all` key on `main`). Do not invent a wider rule: when the case side has none, a person sees the cases they are on the team of.
* **parties** = the front office's own-versus-all for persons and companies with no case: `front-office/sales/common.ts` `visibilityOf` (AG-2-64: all with `agent/prospect:view.all` and the firm's "everyone sees all", else their own), called, not copied.
* Firm-scoped throughout; another firm's ids never appear.
The adapter lives in its own new file (contract v0.1 §1 rule 4: client money reaches the case side only through a port).

**Decisions (word for word):**
* **P-559:** "existing case, forms and runtime code is unchanged until the case side's firm-walls rows." (the adapter only reads; it changes no case or sales code)

**Touches:**
- `ports/money-visibility.ts`
- `ports/contracts/money-visibility-port.contract.ts`
- `api/src/client-money/visibility-adapter.ts`
- `api/src/client-money/MODULE.rows/CS-MV1.md`
- `tests/check_csmv1_money_visibility.ts`

**Done when:** `tsx studio/tests/check_csmv1_money_visibility.ts` exits 0 with the row's six cases each passing and failing as named (a case officer on case X sees X's invoices, not Y's; the case side's firm-wide rule, if any, never crosses firms; an invoice with no case follows its prospect's own-versus-all; `agent/invoice:list` alone sees nothing; fake and adapter pass the contract; FO-7q's DW9 cases pass with the adapter passed in); `check_fo7q_reads.ts`, `check_case_feed.ts`, `check_pf12_walls.ts` and `check_csw3_firm_scope.ts` pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 17:3x IST, main: no `ports/money-visibility.ts`, no MoneyVisibilityPort; `reads/visibility.ts` exists only on #3001 (fail closed); no open PR builds a case-visibility port for money.

**Review:** an Opus reviewer at high **and the breaker** (permissions). The Lead reads the adapter before the label (P-423).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
