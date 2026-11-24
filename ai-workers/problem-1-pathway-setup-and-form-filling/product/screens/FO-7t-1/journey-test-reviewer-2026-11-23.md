# Journey test, reviewer role: FO-7t part 1, trust on and money in (head 60ae8f158)

Run 23 Nov by the Opus 5.5 reviewer. The row is **API only, with no screen**, so every journey is **simulated through the routes**: no browser walk. How it was run:
* The check's own Nest app (PF-4's guard, PF-12's walls, the fake mail) on a scratch database on :54329 named by pid. The database was dropped afterwards, and :4400 was not touched.
* The journeys are the check's 44 cases plus my probe copy of it, which appends 11 probes and lives in the scratchpad, never in the repository.

## Journeys
1. **Main path (the Owner):**
   * The Owner turns trust on and fills in the trust details.
   * They send a request for CAD 600.00 to Client A, then record the e-Transfer against it.
   * Client A gets DR- by email and then R- with its PDF.
   * The ledger shows the deposit, and the request reads Paid.
   * **Held.**
2. **Alternate (a cheque):** a cheque is recorded "Not yet cleared", and its receipt says so. **Held.**
3. **Empty state:**
   * With no trust details, the request is saved as Waiting with "Add your trust payment details".
   * **Partly held:** the answer promises "is sent once they are filled", and nothing sends it (review m3).
4. **Error cases:**
   * A card into trust gets a field error.
   * A duplicate reference gets a 409 warning, then records on confirm.
   * A cancel with no reason gets a field error.
   * A deposit on a cancelled or unsent request gets 409 in the database's words.
   * **Held.**
5. **Wrong role:**
   * A Case Manager or a Case Officer creating a request or a deposit → 403.
   * A non-Owner changing the answer → 403.
   * Firm B naming firm A's records → 404.
   * **Held.**
6. **Recovery:**
   * A double click on the same key gives one payment (201 and 200), concurrently too.
   * The same key with different money → 409.
   * **Partly held:** a retry after the Owner switched to No answers TRUST_OFF instead of the recorded payment (m2).
7. **Trust off with money held:**
   * The reads answer, and new money gets 409.
   * The answer lists the held amount per currency ("CAD … is held for N cases. Trust screens stay visible until it is settled.").
   * **Held** (To move lines are not counted, m4).
8. **Visibility (C5):**
   * A Case Officer with no team and no prospect gets an empty ledger.
   * On the case's team, they get the case's entry, **but with the party-wide running balance 1,225.00 against a visible 300.00** (review M2).
9. **Wrong input that the server takes:**
   * A deposit on a case id that does not exist → 201, and the money is then invisible to everyone, the Owner included (review M1).
10. **Across the boundary:**
    * The `trust.deposited` event is written once per deposit, with ids, amount and currency only.
    * Part 2 (Pay from trust) will read these balances.
    * **Held.**

## Data underneath
For each deposit I read the database: one payment, one DEPOSIT entry, one TRUST receipt joined by `trust_entry_id`, one audit line by `staff:`, and one event.
* The receipt series has no gap and no repeat.
* No mail had a Cc, a link or the word "card" (0 of each).
* Paging by `after` in pages of 3 returned every visible row exactly once.

## Break-it (Blocker / Major / Minor)
* **Major:** M1, the case id is not checked (`service.ts:35, 103, 165-170, 181`).
* **Major:** M2, the running balance leaks past C5 (`reads.ts:57-64`).
* **Minor:**
  * m1: ordering by `created_at`.
  * m5: one reference raced across CAD and USD is recorded twice without a warning.
  * m2: the replay is refused after trust turns off.
* **Held:**
  * Long or control-character text gets a field error (`money_text_ok`, zod).
  * Two tabs sending the same key get one payment.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1 end to end; 44/0 twice |
| Next step obvious | ½ | m3: the Waiting answer promises a send that never happens |
| Plain words | 1 | "Not yet cleared", "Only … Record anyway?", the database's words on a refusal |
| Feedback and state | 1 | 201/200 on a replay; `receiptEmail` SENT, NO_ADDRESS or NOT_SENT; derived status with "CAD 20.00 more than requested" |
| Correct data | ½ | M1 (invisible money) and M2 (wrong balance shown) |
| Error recovery | ½ | m2; the rest recover cleanly |
| Accessibility and screen sizes | ½ | No screen (N/A); field errors name the field |
| Speed | 1 | One query per read, no per-row requests; the whole check runs in about 10 s |
| Visual quality | ½ | No screen (N/A); the receipt is FO-7b's plain text page |
| Trust and sources | 1 | Sample wording file, "Unconfirmed: no counsel", stored figures only |

**7.5/10. Below the pass bar of 8, with no criterion at 0.** Fixes in order of value:
1. M1 and M2. They raise correct data to 1, giving 8/10.
2. m2, which raises error recovery.
3. m3, which raises next step.

Not tested here:
* A real screen reader, an intended user's unaided walk, and widths or zoom: there is no screen, and D17/D20 stay with the founder.
* The real mail adapter: only the fake was used.
* F7's database half: this machine has no PostgreSQL 18 `initdb`.
