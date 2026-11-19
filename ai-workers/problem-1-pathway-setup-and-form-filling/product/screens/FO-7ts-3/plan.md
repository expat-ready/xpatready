# FO-7ts part 3: the pick guard plan, for the tech lead's read before coding (P-423)

Brief: `product/design/build-lead-c-briefs/FO-7ts-3.md`. Branch `claude/trusting-fermat-ejsqdh-fo7ts3`, from #2204's approved head 7ea0132d. The brief asks for this plan as the PR's first comment, but the PR opens only after #2204 merges. So the plan is here, and goes to the tech lead in chat.

## The guard: what the new refusal accepts (in `money_trust_entry_write`, one `CREATE OR REPLACE` from part 2's text)
Today, part 2's text at migration.sql:139:
```sql
IF (d.person_id, d.company_id, d.currency) IS DISTINCT FROM (NEW.person_id, NEW.company_id, NEW.currency) THEN
  RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency' ...
```
The plan (the invoice read also takes `i.case_id`):
```sql
IF d.currency IS DISTINCT FROM NEW.currency
   OR ((d.person_id, d.company_id) IS DISTINCT FROM (NEW.person_id, NEW.company_id)
       AND NOT (NEW.picked_other_funds_by IS NOT NULL                -- a pick, by a person ...
                AND NEW.picked_other_funds_by = NEW.created_by        -- ... the writer themself
                AND money_text_ok(NEW.picked_other_funds_reason, 200) -- ... with a reason
                AND NEW.case_id IS NOT NULL AND d.case_id IS NOT NULL
                AND NEW.case_id = d.case_id))                         -- ... on one and the same non-null case
THEN
  RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency, or of another payer on the same case with a pick (who, why)' ...
```
* **Every other check stays as it is**, and it runs on the paying party's own balance (`NEW.person_id` / `NEW.company_id`):
  * the outflow check ("Only % % is available"), so a pick never takes the payer below zero (P-634, DW25);
  * the "open on the invoice" cap.
* **Columns** (`WITHDRAWAL_TO_INVOICE` only; a CHECK enforces it):
  * `picked_other_funds_by` and `picked_other_funds_reason`: both set or both null;
  * `picked_other_funds_at`: the database's `now()` when `by` is set, and never the caller's time (Lead 82's F3 rule on #2106).

## Question for the tech lead 1: the lock (DW26 against FO-7a's `money_issued_invoice`)
**The problem:**
* For a pick, the trust entry takes the payer A's lock. Then `money_issued_invoice` (FO-7a) takes the **invoice party B's** lock before it touches the invoice row.
* So a pick holds A's and B's locks, and DW26's "a pick from A and a deposit to B do not wait on each other" fails.
* Two crossed picks on one case (A pays B's invoice while B pays A's) would take A→B and B→A, a new 40P01.

**Recommended:**
* For a pick only, the trust entry touches the invoice row through a new helper. The helper has `money_issued_invoice`'s body without its lock line, so a pick takes **only the payer's lock**, then the invoice row.
* Writers on B's invoice (credit note, write-off, B's own withdrawal) take B's lock and then the same row. They wait for each other on the row, with no cycle.
* `money_issued_invoice` itself is unchanged.

**The other way:** keep both locks in a fixed order (lowest party id first) and drop DW26's second half.

## Question for the tech lead 2: the same party on another case
The draft says: "another case of the same party is a pick too: record it the same way. FO-7a's guard already allows it."

* **Recommended:** keep it allowed with or without the pick columns (as today), and store them when given. No new refusal for the same party.
* **The other way:** require the pick columns whenever the entry's case and the invoice's case differ.

## Answered by the brief, not asked again
* `CARD_TERMINAL` refused as a trust refund method, in words, with a test (Build Lead C's ruling).
* QA-482 (an exact line-tax CHECK): no, by default.
* P-701: GST/HST only. Part 3 adds `tax_treatment` only; the rules that use it are FO-7g part 2's.
