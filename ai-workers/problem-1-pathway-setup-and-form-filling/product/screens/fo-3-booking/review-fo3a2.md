# Review: FO-3a part 2a, the consult record and ConsultRecordPort (PR #2102) at a0bc261c7

Reviewer: Opus 5.5, effort high, fresh context (did not build it). 17 Nov 2026, ~19:10 IST. Skill `screen-review`, applied to a runtime row: API, schema and a shared port, with no UI, so the screen-only dimensions are N/A. Journey test: `journey-test-reviewer-fo3a2-2026-11-17.md`, **8/10** (6.5 of 8 scorable).
**First reviewed** c8c75af02; **re-reviewed** a0bc261c7 at the coordinator's request. The diff since c8c75af is two things: PF-12's `0_pf12_firm_first` trigger, and MODULE.md back to 40 lines.
**The bar:** brief `lead-b-briefs/FO-3a2.md` part 2a; AG-4-49 rules 1-9, §7, §8, §11, §12, and AG-4-50 as the brief quotes it (trace tool); concept r2 BR-15, BR-16, "Who sees what", Q3, Q4; STANDARDS §3-§7.

**Verdict: Block** (Changes requested). Two Majors: M1 and M2 below. Everything else in DW1-DW7 holds.

## Runs (no app server: the suite's Nest harness binds an ephemeral 127.0.0.1 port; never :4400)
- `check_fo3a2_consult_record.ts`: **21/21, exit 0**, on c8c75af and again on a0bc261.
- Neighbours on a0bc261, each exit 0:
  - `check_pf12_walls` 100/100;
  - `check_fo3_booking` 133/133;
  - `check_fo3sr_routes` 29/29;
  - `check_fo3sa_any_time` 39/39;
  - `check_fo3pa_public_answers` 45/45;
  - `check_fo3a_booking_types` 48/48.
- `module-cards.py tree`: PASS. The card is 40 lines.
- `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0.
- My probes, in the scratchpad, on the suite's own set-up:
  - lost update;
  - 8 parallel first saves;
  - a Case review booking of a person with an open prospect;
  - 10,000 and 10,001 Devanagari characters;
  - duplicate items;
  - fees 0, "100" and 1.5;
  - a malformed id;
  - an array body.

## The builder's decisions
1. **partyRef: agree in part. The order is wrong (M2).** Reading the party from the booking is right. So is the person's id for `lead` and `client`: the port's doc says so (`ports/consult-record.ts:259-266`), and no lead or case id is stored on `fo_booking`. The won-prospect gap is recorded in the PR. But `prospectId` is checked before the type's purpose, so a case booking can answer `prospect`.
2. **404 for Billing and finance on a booking they do not host: agree.** It matches `staffBooking` exactly (`booking/service.ts:774-779`: not the host, no list key → 404) and the module's "404, never 403" rule. The 403 then goes to the person who sees the booking but lacks edit, as `staffCancel` does with `need`. It differs from the brief's DW3 line, and the PR raises it for Lead B (P-628). Not a finding.
3. **Agree** on all four points:
   - A currency without an amount is dropped. Rule 6 pre-fills the currency, and the database refuses a currency stored alone (`migration.sql` fee_check).
   - PUT replaces the whole record. This is the brief's "creates or replaces", but see M1.
   - Saving while the booking is No-show → 409, consistent with rule 1 ("not offered for No-show").
   - GET still answers the record with `attendanceChanged` (§12).
4. **Agree.** AuditDetail allows ids and facts only (`ports/audit.ts:16-22`). Notes are free text about a person. The probe shows the before and after facts plus `notesChanged`.
5. **Superseded by a0bc261.** The card is at 40 lines and no fact was removed (I compared the two lines that were joined). Agree.

## Issues
**M1 (Major, STANDARDS §4 [M] "Optimistic concurrency (version column; stale save → 409 with what changed)").**
- **Where:** `consult/service.ts:182-208`; `front-office-consult.prisma:400-419` has no `version`; `ConsultBody` takes none.
- **What happens:** rule 9 lets anyone with `agent/booking:edit` edit the record, and PUT replaces the whole record, so the last save wins silently.
- **Failing scenario (probe):**
  1. The host saves notes.
  2. A Case Officer reads the record and saves CAD 3,500.00 (`quotedFeeMinor` 350000).
  3. The host, from the form they had open before, saves their notes again → **200**, and `quoted_fee_minor` is now **NULL**. The Case Officer's fee is gone with no warning.
- **Precedent:** the sibling area already does this (`booking/settings/types.ts:290-298`, `STALE_VERSION`).
- **Fix:**
  - add `version Int @default(1)` (the same migration is fine: it is not on `main`);
  - require `version` on a save that replaces a record; a mismatch → 409 `STALE_VERSION` with the current version, nothing saved;
  - return `version` in the answer;
  - add a pass test and a fail test.

**M2 (Major, brief DW5 "case → none of the retainer steps"; AG-4-49 rule 8 and §11 test 3).**
- **Where:** `consult/service.ts:150-154`. `partyOf` returns `prospect` whenever the booking carries a `prospectId`, before it looks at the purpose.
- **Why it happens:** staff create links the person's open prospect for every type, including case types (`service.ts:365`; `ports/arrival.ts:58`).
- **Failing scenario (probe):**
  1. A staff member books a **Case review** for Client P, who has an ENGAGED prospect.
  2. Attended, then a save → `partyRef {kind:"prospect"}` and `nextSteps ["PREPARE_RETAINER"]`.
  3. On a case call, the screen would offer a new retainer.
- **Fix:**
  - test the purpose (FOLLOW_UP, CASE_REVIEW → `client`) before `prospectId`;
  - in the suite, add a case-type booking for `pros` that expects `client` and `[]`.

**m1 (Minor, STANDARDS §7 [M] "a rule's test fails when the rule is removed").**
- **Where:** `service.ts:160`, the `draft ?` on the prospect branch.
- **Failing scenario:** remove that check and the suite stays 21/21. DW5's fail case runs only on Billing and finance's *lead* booking (`check…:196-201`).
- **Fix:** add a prospect booking read by a person who has no `agent/retainer:draft`, expecting `[]`.

**m2 (Minor, AG-4-49 rule 6 and §11 test 5; BR-15 "currency pre-filled").**
- **What is missing:** the answers carry no currency to pre-fill. `NO_RECORD` gives `bookedMinutes` only (`service.ts:178`). The record answer gives none either.
- **Why the server should give it:** the data exists on the server (`FoProspect.currency`, `front-office-sales.prisma:381`, and a firm default for a lead), and BR-12 has the screen read from the server. Decision 3 assumes a form pre-fill that has no source.
- **Failing scenario:** for a USD prospect's booking, FO-3st1 cannot pre-fill USD without reading the prospect itself.
- **Fix:** answer `currencyDefault`, or Lead B places it in 2b or FO-3st1. It is not in the brief's DW list, so it does not block.

**m3 (Minor, a question for Lead B, not a builder defect).**
- **The conflict:** AG-4-49 §8 says "Seeing it follows the booking (AG-4-67)". The brief narrows reading to the host or `agent/booking:edit`, so Read-only, who sees the booking, gets 403 on its record (`check…:172`).
- **Why it matters:** the requirement outranks the brief (AGENTS rule 2), so Lead B should confirm the narrowing before 2b's feed says whether a record exists.

**m4 (Minor, plain words).**
- **Where:** a currency of EUR → `issues: ["quotedFeeCurrency: Invalid option: expected one of \"CAD\"|\"USD\""]`, zod's own words.
- **Fix:** a field message "Choose CAD or USD."

**m5 (nit, graph P-86).** G3 lists both consult-record routes as reached by no test. The suite does call them, but through built paths (`check…:99,106`), so the graph cannot see it. One literal path in the suite would clear the false gap.

## Code (sound)
- **Who may:**
  - the access check runs before the lock and again under it (`service.ts:188-191`);
  - firm B → 404;
  - no sign-in → 401;
  - both routes declare AnyStaff and the service decides (deny by default holds).
- **One record per booking:** 8 parallel first saves → all 200, **1 record, 1 "created" audit line**. The booking's `FOR UPDATE` lock and the unique (firm_id, booking_id) key both hold.
- **Refusals:**
  - −1, 1e12, 1.5, "100", 0 minutes, 21 items, an unknown field, an array body, and 10,001 characters → 400, with the record unchanged;
  - 10,000 Devanagari characters save in full;
  - duplicate items are removed and trimmed (`["A","A"," A "]` → `["A"]`).
- **Nothing sent:** a save writes no mail, no `module_event` and no `msg_outbox` row (DW5).
- **Audit:** a forced audit failure rolls the save back.
- **Migration:**
  - a new table only, with no data change and a recorded rollback;
  - its stamp, 20261117140000, is later than main's newest, 20261117030000;
  - the checks, the composite FK, PF-12's policy and the firm-first trigger are all present;
  - the database refusals are tested (`check…:154-161`).
- **The port:** zod only, with the fake in the same file. The contract case runs on both the fake and the adapter. Another firm's id, an unknown id and a non-id string all read null. The adapter reads inside the caller's transaction.
- **Nit:** `read(tx, "x", id)` with a malformed *firm* id throws (firmScope) instead of answering null. That is the caller's bug, so it is acceptable.

## Done-when ticks (P-606)
| Case | Result |
|---|---|
| DW1 | ✔ pass and fail |
| DW2 | ✔ pass, fail and the database refusals |
| DW3 | ✔, with decision 2 accepted |
| DW4 | ✔ |
| DW5 | ✔ as written, but M2 breaks it for case bookings that carry a prospect, and m1 |
| DW6 | ✔ |
| DW7 | ✔: audit lines, the neighbour suites and PF-12's walls |

## D1-D20 and BIC-01..20
Screen dimensions (layout, keyboard, 1024 px, 200 % zoom, menu, look) and the BIC scorecard are **N/A**: there is no UI in this part. Its screen is FO-3st1.
- **D (code and data):** correctness and authorisation Met; duplicates under race Met; concurrency **Not met** (M1); migrations keep data Met; field errors Met (m4 on the wording).
- **D17 and D20:** simulated only.

## What I could not check
- A real screen reader, or any screen: none exists yet.
- `prisma migrate diff` (the builder reports it empty); I did not re-run it.
- CI on a0bc261.
- An intended user's own walk (stays with the founder).

**Verdict: Block.** To fix: **M1** (version and stale 409) and **M2** (purpose before prospect), each with a fail test. Then fix m1-m4, or list them in the PR.

## Round 2: re-review of `git diff a0bc261c7..6df95cd40` (17 Nov 2026, ~19:40 IST)

Head **6df95cd40da093829ada41cdd4b06b3e46245883**. I read the diff only (P-277). The working tree was at this head and clean.

**Runs:**
- Suites, each exit 0:
  - `check_fo3a2_consult_record` **38/38**;
  - `check_pf12_walls` 100/100;
  - `check_fo3sr_routes` 29/29;
  - `check_fo3_booking` 133/133.
- `module-cards.py tree`: PASS.
- `graph.mjs --check`: G1, G2, G4 and G5 all 0.
- PR size: 740 changed lines against main, under P-610's 800.

### Round 1's findings
- **M1: fixed.**
  - What changed: a `version` column (with a check that it is at least 1). PUT names the version it read. The check runs under the booking's `FOR UPDATE` lock (`service.ts:131-132`). A stale save, or a "first" save once a record exists, → 409 `STALE_VERSION` naming the current version. The answer carries `version`.
  - Probe, round 1's scenario:
    1. The host saves (v1).
    2. The Case Officer saves CAD 3,500 → v2.
    3. The host saves naming v1 → **409**. The fee stays 350000.
  - Races:
    - 8 parallel first saves → 1×200 and 7×409, with 1 record;
    - 5 parallel saves naming the same version → 1×200 and 4×409, and the version is now 2.
  - Tests: `check…` "version pass" and "version fail".
- **M2: fixed.** The case purpose is read first (`service.ts:81-86`), and the port's doc gives the order. The suite's DW5 fail case is a Case review booking that names a prospect → `client`, `[]`.
- **m1: fixed.** A prospect booking read with `agent/booking:edit` but no `agent/retainer:draft` → `[]`; with the draft key → `PREPARE_RETAINER`.
- **m4: fixed.** EUR → "Choose CAD or USD."
- **m2 and m3:** now questions for Lead B in the PR body. Accepted, since neither is in the brief's DW list.
- **m5: not cleared, nit only.** G3 still lists both consult-record routes: the graph cannot read the template-literal paths at `check…` (`${bCasePros.id}`). G3 is not gated (119 across the repository). One literal string would do it.

### The breaker's fixes (round 1, m1-m7)
- Holds:
  - NFC; control characters refused; lengths counted in code points (10,000 emoji save, 10,001 → 400);
  - one item per name, case-insensitively and across NFC forms;
  - blank notes → null;
  - 415 for text/plain and for no content type, while `application/json; charset=utf-8` → 200;
  - 400 for a body that is not an object;
  - the fee check is NULL-safe (a currency with no fee is refused by the database);
  - the items list must be one-dimensional;
  - the adapter answers null for a firm id that is not one (`x`, `""`, null).
- The contract file `ports/contracts/consult-record-port.contract.ts` runs through `runContract` on `PgConsultRecords` and on the fake. An adapter that ignores the firm fails it. Agreed.

### New Minors (neither blocks)
- **n1. The port's schema counts UTF-16 units; the API and the database count characters.** `ports/consult-record.ts:275` uses `recommended: z.array(z.string().min(1).max(120))`.
  - Failing scenario (probe):
    1. An item of 100 × "𝒜" (100 characters, 200 UTF-16 units) saves with 200.
    2. `PgConsultRecords.read` returns it.
    3. `ConsultRecordRead.safeParse` of that answer fails ("Too big: expected string to have <=120 characters"). So would `fakeConsultRecords().add`, and any FO-5cr caller that parses with the port's schema.
  - Fix: count code points in the port schema too, e.g. `.refine((s) => [...s].length <= 120)`.
- **n2. ZWNJ and ZWJ are stripped from items.** `service.ts` `INVISIBLE` includes U+200C and U+200D, which carry meaning in Persian, Hindi and emoji sequences.
  - Failing scenario (probe): the item "اقامت‌دائم" (Persian, with a ZWNJ) is saved as "اقامتدائم". The spelling changes, so it no longer matches its "Interested in" name.
  - Fix: use the invisible marks only for the "is it empty" test, or keep U+200C and U+200D inside the text.
- **n3 (nit).** The MODULE.md card's invariant line does not yet say that a save names its version (409 `STALE_VERSION`). The card still passes `tree`.

**Journey score, round 2:**
- Next step → 1 (M2 fixed).
- Plain words → 1 (m4 fixed).
- Correct data → ½ (M1 is fixed, but n2 changes the spelling of an item as typed).
- Total: **7.5 of 8 scorable = 9.4, reported as 9/10**. No criterion is at 0.

**Verdict: Approve 6df95cd40da093829ada41cdd4b06b3e46245883.** No Blocker or Major is open. Fix n1-n3 here, or list them in the PR as follow-ups.

## Round 3: re-review of `git diff 6df95cd40..20bb53fbc` (17 Nov 2026, ~20:00 IST)

Head **20bb53fbc91f78fad7c845013e2ad6ff1e342c6a**; the working tree was at that head.

**Runs:**
- `check_fo3a2_consult_record`: **39/39**, exit 0.
- `module-cards.py tree`: PASS. The card is 40 lines.
- PR size: 744 changed lines against main.

### Round 2's Minors
- **n1: fixed.** The port's `recommended` items are now counted in code points (`ports/consult-record.ts:26-27`), as the API and the database count them. The new suite case reads a saved record holding 100 × "𝒜" through `read` and checks that `ConsultRecordRead.safeParse` accepts it.
- **n2: fixed.**
  - `INVISIBLE` no longer strips U+200C or U+200D (`service.ts:59`).
  - An item made only of ZWNJ/ZWJ is still refused (`/[^‌‍]/`).
  - Checked by hand:
    - "اقامت‌دائم" keeps its ZWNJ;
    - "👩‍💻" keeps its ZWJ;
    - "‌" alone → refused;
    - " ​ " → refused.
  - The suite case expects the Persian name with its ZWNJ.
- **n3: fixed.** The card's invariant line now says that a save names the version it read (else 409 `STALE_VERSION`).

### Nit (does not block; no change asked)
An item of "‌ ‍" (a ZWNJ, a space and a ZWJ) passes the item rule (the space is a character other than the two marks) and the database's `btrim` check. It shows as blank. Nobody types this, and fixing it needs a rule for each script; leave it.

**Journey score, round 3:** correct data → 1 (n2 fixed). Total: **8 of 8 scorable, 10/10**. Accessibility and visual quality stay N/A: there is no UI.

**Verdict: Approve 20bb53fbc91f78fad7c845013e2ad6ff1e342c6a.** No Blocker, Major or Minor is open. m5 (the graph's G3 false gap) and the nit above remain nits.
