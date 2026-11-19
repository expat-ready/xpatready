# Brief: R1.110's chain: FO-13i part 2 (QA-510) → FO-13s part 1 (the Identity check panel), with its J-test (J4 lane 3) (row owner Lead B / Build Lead A)

Written 19 Nov 11:23 IST by Lead B (6). **R1.108 (the conflict check) is not in this chain.** FO-13c waits on FO-9a's match service and the case side's CS-S1b (`PartySearchPort`), so it is out of flight. R1.110 is the item here.

## Part A: FO-13i part 2, an expired document is refused (QA-510) (`runtime: FO-13i part 2 — an expired document is refused (QA-510)`)
* **The bug (QA-510, Major):** `POST /api/front-office/people/:id/identity-checks` with `documentExpiry` before today (the firm's clock) answers 201 and stores the check. The Code expects a valid, current document (SOR/2022-128 s. 24(2)(a)). *Unconfirmed: no counsel.*
* **The fix:** an expiry **before the firm's today** (the firm's zone, the injected clock) → **422** with `fields: { documentExpiry: "This document has expired. Check a current one." }` (PF-28's rule, not the 400 the bug suggests), and nothing is stored. Today or later still records. No expiry is accepted where the document type has none (FO-13i's rule, unchanged).
* **Done when:** `tests/qa/check_qa510_expired_id_document.ts` passes, after being changed to expect **422**. A pass case covers today's date, and a fail case shows that removing the check makes the suite fail. FO-13i's suite passes.
* **Touch list:** the identity-check service and schema file under `api/src/front-office/` (named in the PR), and the qa test. No migration. About 80 lines.

## Part B: FO-13s part 1, the Identity check panel (`screens: FO-13s part 1 — the Identity check panel`), with its J-test (P-728)
* **Concept first** (the screen-concept skill, a fresh challenge, then my approval, P-223 (4)) for the **Identity check panel only**: on the lead and prospect page (`web/src/modules/front-office/sales/lead-page.tsx`, one mount line) and the client view if it exists on main.
  * It lists the person's checks (type, document, expiry, who, when) and records one with FO-13i's routes (`POST people/:personId/identity-checks`, multipart with an optional copy and a `requestId` uuid).
  * It shows the copy through the download link.
  * It shows **"No identity check is recorded for <signer>."** where `POST retainers/:id/send` answers `warnings`.
  * The expired-document 422 shows its sentence on the field.
* **Not in this part:** the Conflict check panel (it waits for FO-13c) and the Complaints list (PF-21s covers it).
* **The J-test (J-110) in this PR:** walk record a check → see it listed → open the copy → a retainer send shows the warning before any check and none after. Also an expired expiry → the field's sentence, with nothing stored.
* **Gates:** keyboard only, axe-core, and 375, 1024 and 1440 px. Breaker yes (new screen).
* **Touch list:** new `web/src/modules/front-office/compliance/identity/*`, the mount line in `lead-page.tsx`, `tests/check_fo13s_identity_browser.ts`, and `tests/journeys/j_110.ts`. No hand edits to shared card lines (P-712).
* **Size:** under 800 lines with the J-test. Split the J-test into its own PR only if it is over.

**Order:** Part A, then Part B (B shows A's error). Then qa proves R1.110 (P-722).
