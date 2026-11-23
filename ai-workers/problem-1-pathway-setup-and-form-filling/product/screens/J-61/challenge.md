# J-61 challenge: not ready to build (runtime lane, 23 Nov)

Row: BACKLOG J-61, "One link that signs, then pays" (map row 61, R1.61). Its **waits on** line names FO-6 routes, **FO-7c part 2 (pay link)** and **FO-7t part 4 or FO-7b part 1b (the invoice made on signing)**.

## What is on main (origin/main, 23 Nov) and in open PRs
| Needed by J-61 | State | Evidence |
|---|---|---|
| FO-6 routes, `signing.completed` | FO-6 part 3 open, #3065 (head a255e0321) | `retainers/on-signing-completed.ts` there only makes the prospect WON; no money call |
| FO-7c part 2: `POST /api/front-office/invoices/:id/pay-link`, the public pay page, payment by webhook | **Not built; no open PR** | `api/src/client-money/card/` holds only `account.ts`, `rail.ts`, `routes.ts`, `stripe-rail.ts` (part 1, #2938); `git grep -i "pay-link\|payLink\|pay_link" api/src` finds nothing but a comment |
| PF-27 `firmAllows(firmId, 'pay')` (FO-7c part 2's own "ready when", brief FO-7c.md line 7) | **Not on main** | `git grep firmAllows api/src` empty |
| The invoice made on signing (the retainer's "On signing" fee) | **Not built** | `git grep -i retainer api/src/client-money` empty; no FO-7t part 4 row or PR found |
| FO-7c's pay-link token carrying a `signing_envelope_id` | **No**: the ruled store is FO-7ts's `pay_link_token_hash` on `money_invoice` (brief FO-7c.md line 16) | the row says: "if it cannot, ask first (that would be a migration)" |
| `tests/journeys/j_61.ts` | qa's open draft #3044 writes it (4/20 today, failing on exactly these parts) | the same file J-61 names in **Touches** |

## Why not build it anyway
J-61's Touches are "the hand-off only: one call from FO-6's `signing.completed` handling to FO-7c's pay-link maker". With no pay-link maker, pay page, payment webhook or invoice-on-signing, building J-61 now means building FO-7c part 2, PF-27 and FO-7t part 4 inside one PR: scope the row does not name (P-604, P-606), on money and a public door.

## Recommendation
1. Start FO-7c part 2 after PF-27 merges (runtime lane), and shape/start the "invoice made on signing" part (FO-7t part 4 or an FO-7b part) now, in parallel.
2. Rule now, so FO-7c part 2 is built ready for the join: **no new column**: the signing door, once a retainer request is COMPLETED, looks up the invoice that signing made for that retainer and mints that invoice's `pay_link_token_hash` link; the signing token itself becomes the single-use entry (its state: used once the invoice is paid, credited or written off). This needs the invoice to carry its retainer id (FO-7t part 4's column, if it adds one); if it cannot, that is the migration the row says to ask about.
3. J-61 then takes #3044's `j_61.ts` (baton from qa) once #3044 merges, rather than a second copy.
