# FO-7b — not ready: waits on FO-7mv → FO-7ts part 1 → FO-7ts part 2 (runtime lane, 16 Nov 07:3x IST)

**Finding.** Lead B's brief `design/lead-b-briefs/FO-7b.md` (branch `lead-b-front-office`), amendment 7 (revs 16.33–16.41, which win over the older text): FO-7b "Starts when FO-7ts parts 1–2 are on `main`". The brief also says "No schema change", so FO-7b cannot add what FO-7ts adds.

**What FO-7b needs from FO-7ts** (none on `main` 31f07d910; `prisma/schema/client-money.prisma` is still FO-7a's):
* amendment 1, 2: the three-state trust answer and `invoice_payments_go_to` (FO-7a has one boolean `trust_enabled`);
* amendment 1: the credit ledger (`KEPT`) for "Keep as credit";
* amendment 6: payment methods `BANK_TRANSFER`, `CARD_TERMINAL` (FO-7a's enum lacks them);
* amendment 3: `unsigned_retainer_confirmed_by`, `unsigned_retainer_confirmed_at` on the invoice.

**Order on `client-money.prisma`** (FO-7ts brief on `main`, `design/briefs/FO-7ts.md`, Lead B rev 16.37): FO-7mv → FO-7ts part 1 → FO-7ts part 2 → FO-7b. FO-7mv is not built; no open PR builds FO-7mv or FO-7ts (checked through the REST API, 07:2x IST).

**Not done:** no partial FO-7b (P-606, finish whole).

**Ruling (Lead 64, 07:3x IST 16 Nov, session message):** this lane builds FO-7mv now; FO-7b resumes after FO-7mv and FO-7ts parts 1–2 merge.
