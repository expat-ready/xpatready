# QA-621 (R1.108): challenge before building (runtime builder, 21 Nov 2026; US$0, live AI off)

**Ask.** Opening a case for a new client runs FO-13c's conflict check, or refuses until it is run. Done when `tests/qa/check_qa_r108_case_open_ungated.ts` (qa, #2706, brought here unchanged) passes, and FO-13c, FO-13s and `j_108` stay green.

**Why I did not build it.** The qa check requires the dialog's exact body (no `clientId`) to answer 409 `CONFLICT_CHECK_REQUIRED` with no client made. A brand-new client has no front-office person until the opening makes it, so no check can exist beforehand. The only fix that passes the check is to refuse every opening that names no client. That reverses a recorded case-side rule:
* CS-K1 contract §5, P-588 (2), and the `MODULE.cases.md` invariant: "The opening reuses a client of the opener's firm or **makes one named after the principal**".

**Evidence (fact, measured on origin/main a6604469 in isolated copies).**
1. The qa check fails on main as qa reported: 201, 1 client made, 0 checks.
2. A spike gate in `api/src/runtime.ts` `createCase` (refuse when `clientId` is absent and the opener's firm has a platform firm; 409 `CONFLICT_CHECK_REQUIRED`; before the transaction): the qa check **3/3 passed**, and `j_108` **15/15 passed**.
3. With that same spike, `tests/check_csk1_client.ts` fails its setup and DW2, DW3 and DW4. DW2 is "a directly opened case gets a new client", the agreed behaviour.
4. Callers that open with no `clientId` today, which would all be refused: the Open a case dialog (`web/src/runtime/cases.tsx:213`, which has no client picker), the demo's sample case (`api/src/sample-case.ts:64`) and **96 of the 96** test files that POST `/runtime/cases` (none sends a `clientId`). Sample firms exist on every copy and in CI (`PLATFORM_SAMPLE_SEED` defaults to on in `start.sh` and `tools/isolated.sh`), so a "platform firm only" scope does not narrow the reach.
5. The signed-in product path already passes the gate: the only staff-session opening is `openCaseFromOffer` (`runtime.ts:261`), from a client made by a gated win (`clearForWin`). The ungated door is the simulated `x-actor` route `POST /api/runtime/cases` (`runtime.ts:1098`).

The spike was reverted, and no case-side code is changed in this PR.

**Options (judgement; confidence medium-high on the costs).**
* **A. Refuse openings with no client (qa's check as written).** The dialog gains a client picker (new people come in as Leads, then a check, then Convert). The sample case opens on a checked Sample client. CS-K1 DW2/DW4 are rewritten. The 96 test files move to a helper that seeds a checked client. That needs a new decision superseding CS-K1 §5, and several PRs well past 800 lines. The demo story breaks until it lands.
* **B. Run the check inside the opening.** The dialog collects email and phone. The server runs FO-13c's search in the opening transaction and records the check with who and when. A match, a hidden match or `CONFLICT_CANNOT_ACT` refuses with 409, and nothing is written. Weakness: a "Clear" result is recorded without a person's judgement, which FO-13c's check normally carries. qa's check would need changing, because an unmatched name would open.
* **C. Rule the `x-actor` door scaffolding (qa's question 2 on #2706).** The signed-in product already has no ungated way to a client (point 5). R1.108 moves to Works on the walks. QA-621 becomes a Later item: retire the persona door's new-client branch when the persona door goes.

**Recommendation: C now. A when the persona door is retired.** B weakens the check's human judgement to save one step.

## Ruling and what was built (21 Nov, after Lead 11's ruling on #2716, P-294 Option C)
* CS-K1 §5 / P-588 (2) stands. Neither A nor B is built.
* **Finding (fact):** nothing refused the persona door in a production configuration. `core.ts ConfigReadGuard` passes any non-GET request with no read scope, and `createCase` trusts `x-actor`. Demo routes check only the workspace key, so `POST /api/demo/sample-case` could also open a case and make a client in production. That was the real Major.
* **Fix:** `Runtime.createCase` refuses every opening whose actor word is not `staff:<id>` when the loaded configuration is production: 403 `SIMULATED_PERSON_REFUSED`, before anything is read. The one way through is `openCaseFromOffer` (a staff session, on a client made by FO-13c's gated win). Local and test copies are unchanged.
* **Proof:** `tests/check_qa621_persona_door_production.ts` (16 cases; boots one copy as local, the control, then production on the same database; a code sweep of who writes a client or a case). qa's check stays in qa's records (#2706) as the open-finding check for the persona door.
* **Left open (judgement):** a `PLATFORM_ENVIRONMENT=test` deployment keeps the door open, as ruled ("production"). The rest of the persona-driven studio (configuration writes, other case routes) is not gated by environment either. Retiring the persona door is the X-row (P-582).
