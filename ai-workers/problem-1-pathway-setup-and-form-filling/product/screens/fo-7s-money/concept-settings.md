# FO-7s0 — Getting paid: payment details, tax, card payments, Advanced (group g)

Part of the money concept; index in `concept.md`. Figures **Sample**; legal readings **Unconfirmed: no counsel**. Board: `design/settings.html`. Builds: FO-7s1 part 3 (details, tax), FO-7s2 part 1 (card payments, "Invoice payments go to"), FO-7s3a part 2 (trust question, trust details).

**One page** `/money/settings/getting-paid` (AG-6-82: Getting paid holds the money settings; main sections, then "Advanced" closed by default). Every staff member can read it; each section edits only with its key, otherwise values show read-only with "Only <role> can change this" in words. Sections, in order:

| Section | Fields | Shows when | Edit key | Write route |
|---|---|---|---|---|
| **Trust** | the trust question (`concept-trust.md` f), "Last changed … by …" | Owner only (others see nothing while Unanswered; "Trust: on" once Yes) | Owner (FO-7t `PUT …/trust/answer`) | FO-7t part 1 |
| **Payment details — operating** | free text (bank details, payee), "Interac e-Transfer email" (optional) | always | `agent/billing-config:terms` | **none named: Question 1 / gap G1** |
| **Payment details — trust** | free text, "Interac e-Transfer email" | trust shows | `agent/billing-config:terms` | none named (recommended FO-7t part 1, gap G1) |
| **Tax** | **Registered for tax** (switch, needs a tax number), **Tax number**; QST number hidden (P-568 (1): no Quebec) | always | `agent/billing-config:tax` | none named (recommended FO-7g part 2, gap G1) |
| **Card payments** | status in words, one next step (below) | always (read); the button Owner only | `agent/payment-rail:connect` + step-up | FO-7c part 1 |
| **Advanced** ▸ | **Prices include tax** (off); **Due in N days** (14); **Invoice payments go to: Operating account · Trust first** (Yes only, Owner only, "Last changed …") | always; the last line Yes only | `agent/billing-config:tax`; `:terms`; Owner | none named for the first two (gap G1); FO-7b for the last |

**No rate list and no rate editing** (AG-6-4 §13): the page shows "Tax on invoices comes from the client's province (ExpatReady's table)". Not registered → "Invoices show no tax and no tax number" (AG-6-4 r5). Switching Registered on without a number → on the field: "Add your tax number to turn this on".
**Empty operating details** → a notice at the top of the section: "Invoice emails wait until you add your payment details" (AG-6-71 r3); empty trust details (trust shows) → "Trust requests wait until you add your trust payment details" (r4). Same e-Transfer email in both → hint "Both blocks use the same e-Transfer email." (edge, not a block).

**Card payments** (FO-7c `GET …/payment-account`, Owner; others get only "Card payments: on / off"):
| Status | Words | One next step |
|---|---|---|
| `NOT_CONNECTED` | "Clients can't pay by card yet." | **Connect with Stripe** |
| `PENDING` | "Stripe is checking your details." | **Continue set-up** |
| `ACTIVE` | "Clients can pay invoices by card. Money goes to your own Stripe account." | — |
| `RESTRICTED` (charges on) | "Stripe needs more details. Until you finish, clients see your payment details instead of a card button." (FO-7c offers card only when Active) | **Update details on Stripe** |
| `RESTRICTED` (charges off) / `DISCONNECTED` | "Payment account disconnected — Reconnect" (break alert; clients see offline details, AG-6-49) | **Reconnect** |
Codes never show. The button asks for step-up first: "Confirm it's you: sign in again, then try once more." (401 `STEP_UP_REQUIRED`). A non-Owner opening the section sees "Only the Owner manages card payments". No trust card account in R1 (P-567 (3)): no "Connect your trust payment account" line.

## Walk — replay at 1440 px (Owner, continues `concept-payments.md` walk step 5)
1. Money → Getting paid → operating details empty notice → type the block and "billing@maple.example" → **Save** → the notice clears; INV-0008's waiting email sends.
2. Tax → **Registered for tax** on with no number → "Add your tax number to turn this on" → type the number → Save.
3. Card payments "Clients can't pay by card yet." → **Connect with Stripe** → "Confirm it's you…" → sign in → Stripe test onboarding (fake) → "Stripe is checking your details." → Active.
4. Advanced (trust Yes) → Invoice payments go to → Trust first → Save → "Last changed 16 Nov 2026 by <Owner>". Next capability's first step: the pay page (`concept-pay-page.md` walk step 1).
