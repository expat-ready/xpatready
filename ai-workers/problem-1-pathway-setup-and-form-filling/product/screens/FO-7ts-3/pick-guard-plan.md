# FO-7ts part 3: the pick guard's plan, for the Lead's read before coding (P-423)

Brief: `build-lead-c-briefs/FO-7ts-3.md` (on `claude/build-lead-c-647b40`), over Part 3 of `product/design/briefs/FO-7ts.md`. Rule: AG-6-68 rule 4 and §7 (`pickedOtherFundsBy`). Lead 61's ruling on #1881 (comment 6901156791) wins over Lead B's wider text. P-634 (1) applies: a pick is an outflow, so only a reversal may go below zero. Legal reading: Unconfirmed: no counsel.

The base is `money_trust_entry_write` as #2204 (FO-7ts part 2, `20261119080000_fo7ts_ledgers`) leaves it. That is one `CREATE OR REPLACE`, and only the block below changes. The lock order is unchanged: the paying party's `money_trust_lock` first, then the invoice row through `money_issued_invoice`.

## 1. The columns and their CHECK (on `money_trust_entry`)

```sql
ALTER TABLE "money_trust_entry"
  ADD COLUMN "picked_other_funds_by"     TEXT,
  ADD COLUMN "picked_other_funds_at"     TIMESTAMPTZ,
  ADD COLUMN "picked_other_funds_reason" TEXT,
  ADD CONSTRAINT "money_trust_entry_pick_check" CHECK (
    ("picked_other_funds_by" IS NULL AND "picked_other_funds_at" IS NULL AND "picked_other_funds_reason" IS NULL)
    OR ("kind" = 'WITHDRAWAL_TO_INVOICE'
        AND "picked_other_funds_by" = "created_by"
        AND "picked_other_funds_at" IS NOT NULL
        AND money_text_ok("picked_other_funds_reason", 200)));
```

* The three fields come together or not at all. Only a withdrawal to an invoice may carry them.
* The person who picks is the person who writes (`= created_by`).
* `picked_other_funds_at` is the database's clock: the trigger sets it to `now()` whenever `picked_other_funds_by` is set, and any time the caller sends is overwritten. A row with no `by` keeps a null `at`, so the CHECK refuses a lone time.

## 2. The guard (it replaces the one refusal at #2204's `migration.sql` line 140)

`d` gains `i.case_id`. Two new variables: `other_party boolean`, `picked boolean`.

```sql
IF NEW.kind = 'WITHDRAWAL_TO_INVOICE' AND NEW.invoice_id IS NOT NULL THEN
  SELECT i.issued_at, i.person_id, i.company_id, i.currency, i.case_id INTO d
    FROM "money_invoice" i WHERE i.firm_id = NEW.firm_id AND i.id = NEW.invoice_id;
  IF NOT FOUND THEN PERFORM money_missing('money_trust_entry', 'invoice', NEW.invoice_id); END IF;
  IF d.issued_at IS NULL THEN ... unchanged (Code s. 32(f)) ... END IF;
  other_party := (d.person_id, d.company_id) IS DISTINCT FROM (NEW.person_id, NEW.company_id);
  picked      := NEW.picked_other_funds_by IS NOT NULL;   -- the CHECK keeps by, at and reason together
  -- Same currency, always (no pick crosses currencies).
  IF d.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency' USING ERRCODE = 'check_violation';
  END IF;
  -- Another party: only as a pick, and only within one and the same non-null case.
  IF other_party AND NOT (picked AND NEW.case_id IS NOT NULL AND d.case_id IS NOT NULL AND NEW.case_id = d.case_id) THEN
    IF picked THEN
      RAISE EXCEPTION 'money_trust_entry: another payer''s money pays an invoice only on the same case as the money (a pick never crosses cases or clients)' USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'money_trust_entry: trust pays only an invoice of the same party and currency' USING ERRCODE = 'check_violation';
  END IF;
  open_amount := money_issued_invoice(NEW.firm_id, NEW.invoice_id, NEW.currency, 'money_trust_entry');
END IF;
...
IF NEW.picked_other_funds_by IS NOT NULL THEN NEW.picked_other_funds_at := now(); END IF;   -- beside NEW.created_at := now()
```

**What it accepts, as one condition.** A withdrawal to an invoice passes this block only when all of these hold:

```sql
d.currency = NEW.currency
AND (   (d.person_id, d.company_id) IS NOT DISTINCT FROM (NEW.person_id, NEW.company_id)
     OR (    NEW.picked_other_funds_by IS NOT NULL          -- with at (database's) and reason, by the CHECK
         AND NEW.picked_other_funds_by = NEW.created_by     -- the CHECK
         AND NEW.case_id IS NOT NULL
         AND d.case_id   IS NOT NULL
         AND NEW.case_id = d.case_id))
```

**What stays as it is:**
* **Below zero.** The balance stays the **paying party's** (`NEW.person_id`/`NEW.company_id`, the entry's party), under that party's lock. #1991's check `bal < 0 AND NEW.amount_minor < 0 AND NOT reversal AND NOT moving` refuses a pick that would take the payer below zero, with its words "Only % % is available; the trust balance would go below zero". It also refuses any pick from a payer who is already below zero. That covers DW25 and P-634 (1). No new code is needed: a pick is never a reversal or a move.
* **The open amount.** `applied` and `open_amount` are counted per invoice, whoever paid. So two payers' picks on one invoice together never pay more than is open.
* **The lock.** It is the payer's only: a pick from A and a deposit to B do not wait on each other. DW26 proves this with `pg_locks`. The invoice row is still taken second, through `money_issued_invoice`.

## 3. Proposals inside this plan (the Lead's call; I build the recommended answer unless told otherwise)

1. **The same party on another case** (for example the client's money on case J paying the client's invoice on case K). `main` allows this today without a pick. The brief says to "record it as a pick the same way". **Recommended:** the database keeps accepting it with or without the pick fields, and the route (FO-7t part 2) requires the pick. Making it required in the database would change FO-7a's accepted behaviour, outside this part.
2. **Pick fields where nothing is picked** (the same party and the same case). **Recommended:** refuse, in words: "nothing to pick: this money is the invoice's own party's, on its own case". This keeps the audit trail honest: a pick is recorded only when one happened.
3. **Blind spot, found while planning; not changed here:** the below-zero check is per party and currency, not per case. If A holds CAD 100 on case K and CAD 500 on case J, a pick on case K may take CAD 300, because A's party-wide balance is 600. FO-7a's own withdrawals behave the same today. For a pick it matters more, because A's money on J then pays B's invoice on K. **Recommended:** a per-case limit for picks (`sum(amount_minor)` over A's entries on `NEW.case_id` ≥ −`NEW.amount_minor`, read under A's lock), added in this part's guard. It is ~6 lines, with a DW case. DW25's example (A holds 100 on K) works either way.

## 4. Tests (DW17 as amended, DW25, DW26)

Each item has a pass and a fail in `tests/check_fo7ts_money_settings.ts`:
* A on case K pays B's invoice on case K, with the pick → stored, and `at` is the database's.
* The same pick across two cases, or with a null case on either side → refused.
* No reason, `by` ≠ `created_by`, or a lone `at` → refused by the CHECK.
* No pick at all → refused, as today.
* Another currency → refused.
* DW25: CAD 100.00 accepted and A at 0; CAD 100.01 refused with #1991's words; A at −50.00 after a returned cheque → any pick refused.
* DW26: A's pick and A's deposit run in turn, 20 runs, no 40P01. A's pick and B's deposit do not wait (`pg_locks`).

## Lead 95's read (P-423 plan read, 19 Nov 21:0x IST)
Lead 95 (local_98ab55d2; Lead 94 has ended) accepted the plan as written, with all three proposals:
1. The same party on another case: the database keeps accepting it, and the route requires the pick.
2. Pick fields where nothing is picked: refused, in the words above.
3. A per-case limit for picks, under the payer's lock, with its own DW case: added in this part.

All steps are built once #2204 merges. The plan is the PR's first comment. Lead 95 reads the final migration before the label.
