# Brief: FO-1p, `FoPersonPort`: the case side gets a front-office person or company for a case client (for CS-K1 part 2) (cloud builder lane; row owner Lead B / Build Lead A)

Written 18 Nov 19:xx IST by Lead B (6). Lead 80 assigned it, at Build Lead C's request in `build-lead-c-briefs/CS-K1.md` (question 2). It is the "Contract gap" in the draft `product/design/briefs/CS-K1.md` on `main`, line 7.

**Source:**
* P-607 and the Lead's ruling on S1 Q10: every case client gets an `fo_person`, so a person has one portal login. Lead B agreed (`lead-b-shaping-approvals-2026-11-15.md` item 10).
* Contracts §1 rule 4: the case side never writes front-office tables itself.

**Model:** Opus 5.5 high (a shared contract, P-423: the Lead reads the port file). **PR title:** `runtime: FO-1p — FoPersonPort for case clients`.
**Starts when:** now (P-663 permitting). It touches no file of CS-K1 part 1 or CS-W1. CS-K1 part 2 starts after this one and CS-K1 part 1 are on `main`.

## Lead B's rulings (the draft's open questions)
1. **The port and who builds it:** a port-only row like PF-18np. `ports/fo-person.ts` holds the type and the fake, `ports/contracts/fo-person-port.contract.ts` holds the shared contract test, and the adapter lives in `api/src/front-office/`. One PR, this row.
2. **A `COMPANY` client** gets an **`fo_company`**, not a person (the draft's question (b)). This follows `case_client`'s CHECK (at most one of `fo_person_id` and `fo_company_id`) and FO-2b's model: a company's people are `fo_company_contact` rows. A contact person gets their own `fo_person` (and so a portal login) only when added as a contact through FO-2b's routes, never by this port.
3. **No automatic linking to an existing person.** A same-email person already in the firm is **not** reused (BR-2: "a possible match is shown, never linked"; FO-9a owns the warning and the safe merge). The one exception is a client from a won prospect: when `prospectId` is given, the prospect's own subject person (or company) is returned, because that is the same party, not a guess.

## The port (`ports/fo-person.ts`)
```ts
export interface FoPersonPort {
  /** A person client: the won prospect's subject when prospectId is given, else a new fo_person. In the caller's tx. */
  ensureForClient(tx, a: { firmId: string; actor: string; displayName: string; givenNames?: string; familyName?: string;
                           email?: string; phone?: string; prospectId?: string }): Promise<{ foPersonId: string }>;
  /** A company client: the won prospect's company when prospectId is given, else a new fo_company. In the caller's tx. */
  ensureCompanyForClient(tx, a: { firmId: string; actor: string; name: string; prospectId?: string }): Promise<{ foCompanyId: string }>;
}
```
* **Same transaction:** it runs in the caller's transaction (the case opening's), so a refused opening leaves no person.
* **Idempotency is the caller's:** CS-K1 part 2 calls it only while `case_client.fo_person_id` and `fo_company_id` are null, in the same transaction that sets them. The port promises no de-duplication beyond the `prospectId` rule.
* **`actor`** is a typed audit actor (`staff:<id>` or `system:<door>`, #2003). The adapter writes `created_by` from it and one audit line, `front_office.person.created_for_client` or `…company…`, with **no** personal data in the line (ids only).
* **The phone** goes through FO-9a's normalisation (`phone_readable` false when unreadable; never refused). The email is stored lower case, as in FO-2.
* **No front-office sales setup row yet** (a firm before `seedCreatedFirms` ran) → the adapter creates the setup row once, through FO-1a's own helper (named in the PR). It never fails the case opening over a missing setup.
* **Errors:**
  * `prospectId` belongs to another firm or does not exist → `FoPersonNotFound` (the case side answers 404 "No such client.");
  * `prospectId` whose type does not match the call (a CORPORATE prospect to `ensureForClient`) → `FoPersonKindMismatch`.

## Done when (P-606; `ports/contracts/fo-person-port.contract.ts` run against the fake **and** the adapter, plus `tests/check_fo1p_person_port.ts`)
* **DW1:** `ensureForClient` without `prospectId` makes one `fo_person` in the firm with the given fields, and `created_by` is the typed actor. A rolled-back transaction leaves none.
* **DW2:** the same email as an existing person in the firm → a **new** person (no auto-link). FO-9a's duplicate check then flags the pair.
* **DW3:** with a won Individual prospect's id → that prospect's subject person, and no new row. With a Corporate prospect → `ensureCompanyForClient` returns its `fo_company`. A kind mismatch → `FoPersonKindMismatch`.
* **DW4:** firm B's prospect id → `FoPersonNotFound`, and nothing is written.
* **DW5:** a firm with no sales setup row → the person is made and the setup row exists once. A second call adds no second setup row.
* **DW6:** the fake passes the same contract test. The audit line carries ids only (no name, email or phone).
* FO-1a's, FO-2's, FO-2b's and FO-9a's suites pass unchanged.

## Touch list (nothing else)
* new `ports/fo-person.ts` and `ports/contracts/fo-person-port.contract.ts`;
* new `api/src/front-office/people/fo-person-port.ts` (the adapter);
* its binding line in the runtime ports file (`runtime-ports.ts` or wherever ports are bound; named in the PR, flagged as a shared-file line);
* `api/src/front-office/MODULE.md` (one line, within the card limit);
* `tests/check_fo1p_person_port.ts`.

No schema change. **Size (P-610):** about 350 lines.

## Duplicate check (P-526; 18 Nov 19:xx IST)
* **`main`:** `ports/` has no person port (`arrival.ts`, `consent.ts` and `person-merge-port.contract.ts` exist; person-merge is FO-9b's merge and is not reused here). `git grep FoPerson` under `api/src` finds only `front-office/sales/common.ts` and the module card.
* **Open PRs:** none names FO-1p or FoPersonPort.
* **BACKLOG:** no row. Lead 80 adds the row line.
* The PR writes its own `Duplicate check:` line.

## For Build Lead C (CS-K1 part 2)
* Call `ensureForClient` for a `PERSON` client and `ensureCompanyForClient` for a `COMPANY` client.
* Do it in the opening transaction for a new client, and in a one-time `JobPort` backfill for existing clients, each guarded by the null check above.
* FO-8 (won prospect → client) passes `prospectId`.

## Rules
The standard PF/FO rules at the end of `wave1-sales.md` apply.
