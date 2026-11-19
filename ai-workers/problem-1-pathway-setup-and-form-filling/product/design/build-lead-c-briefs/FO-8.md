# Brief: FO-8, the case side takes `prospect.won` (cloud builder lane; row owner Build Lead C)

Written 19 Nov 12:4x IST by Build Lead C (2). **Approved by Lead 91 (19 Nov 12:5x IST); a lane starts when the Lead gives the line** (P-733 order: R1.72 is two parts from done). This is the first of R1.72's two parts left ("Case with applicants, representative, pinned …"); the second is CS-K1 part 2 with J-72 (`CS-K1-2.md`), run back to back in the same lane (P-733 (2)). The row text is BACKLOG `FO-8` (tagged "case side, API only; release Lead"); where this page differs, this page wins.

**Model:** Opus 5.5, effort high (events, idempotency, personal data). **Review:** Opus reviewer **and breaker** (repeat delivery, two firms, a company client).

**Ready when:** now, after the drain. Every input is on `main` (checked 19 Nov at 8cefcc6c6):
* The event: `front-office/sales/prospects.ts` `convert()` writes `EVENT.PROSPECT_WON` to the outbox (`module_event`) with `wonPayload` (`ProspectWonPayload`, contracts §2.6): firm id, prospect id, lead id, `won_via`, retainer and representative (only when signed), owner, `interested_in` (service and combination), the person's answers, consent ids, `subject` (person, or company with its primary contact). The retainer path in `front-office/retainers/service.ts` (line ~628) also writes `prospect.won`.
* The person side: FO-1p (#2138), `FoPersonPort` in `front-office/people/fo-person-port.ts`: `ensureForClient(tx, raw)` and `ensureCompanyForClient(tx, raw)`, with its fake and contract.
* The subscriber pattern to copy: `front-office/firm-seed.ts` `onFirmCreated(db, event)` (ignores other types; at least once is safe) plus `seedCreatedFirms(db)`, the catch-up over `module_event` that makes a missed delivery good. `platform/web-address/firm-created.ts` is a second example. **There is no general outbox dispatcher on `main`:** do not build one; follow this pattern.
* CS-K1 part 1 (#2167): a directly opened case's new client already writes its audit line (`runtime.ts` ~352).

## What to build
1. **Subscriber** `onProspectWon(db, event)` in a new file `api/src/case-clients/prospect-won.ts`: ignores any other type; parses the payload with `ProspectWonPayload`; in one transaction:
   * makes the case-side client: for a person subject, through `FoPersonPort.ensureForClient`; for a company, `ensureCompanyForClient` with its contact person (A44);
   * writes `client.created` to the outbox, last in the transaction, and one audit line through `AuditPort.record` (actor `system:prospect.won`);
   * records an "Open a case?" offer pre-filled from the payload (`interested_in.combinationId`, the subject, the representative from the **signed version's merge values, never the retainer row**: Lead B rev 16.13, FO-5f question 1).
   * **Idempotent on the prospect id:** a second delivery of the same `prospect.won` makes no client, no event, no audit line, no second offer.
2. **Catch-up** `catchUpProspectsWon(db)`: every `prospect.won` in `module_event` with no client for its prospect; one failure is named and the rest still run (as `seedCreatedFirms`). Wire it where `seedCreatedFirms` is called (name the place in the PR).
3. **"Open a case?"**: one route, `POST /api/runtime/clients/:id/open-case` (staff session, key `agent/case:create`), which opens the case from the offer through the existing `createCase` path and writes `case.opened`. Nothing opens until a staff member calls it. **Payment is never a condition.** No screen in this part (API only, as the row says); the CS-K1 part 2 / J-72 walk shows it.
4. **Undo convert:** `prospects.ts` `undoConvert` is allowed only "while the client is empty". If FO-8's client exists with no case, say in the PR what happens (recommended: the offer is withdrawn and the client stays, with an audit line); ask first if that needs a change in `prospects.ts`.

**Schema:** if a table is needed for the offer (or a `prospect_id` on the client for idempotency), ask Build Lead C first: CS-K1 part 2 holds `cases.prisma` next, and the two migrations go in order in the same lane.

## Done when (P-606), in `tests/check_fo8_prospect_won.ts` (isolated database, no live calls), each with a pass and a fail
* One `prospect.won` makes exactly one client; the same event delivered again makes none (no event, no audit line, no offer).
* A person client and a company client (with its contact person) both pass.
* The offer opens nothing until `open-case` is called; the call opens one case and writes `case.opened`; a second call refuses (409, plain words).
* `client.created` and the audit line are written once, in the same transaction as their rows; a failure after the client row rolls all of it back.
* Firm walls: firm A's event never makes a client in firm B; staff of firm B get 404 on firm A's client.
* The representative comes from the signed version's merge values (a retainer row changed after signing does not change it).
* The catch-up makes good a missed delivery and names one failing prospect without stopping the others.
* Unchanged: the existing case screens, `check_fo1p_*`, `check_case_feed.ts`, `check_csk1_*`, the demo reset and the C10.1 checkpoint load; `node studio/tools/check-port-contracts.mjs` exits 0; module cards (row fragments under P-712); full `ci` green.

**Touch list:** new `api/src/case-clients/prospect-won.ts`; the route in `runtime.ts` (one route, one service call); the catch-up call site; `tests/check_fo8_prospect_won.ts`; `ports/events.ts` only to add `CLIENT_CREATED` if it is missing (add only). Nothing in `front-office/` except reading its ports.

**Duplicate check:** `git grep -n "onProspectWon\|PROSPECT_WON" origin/main -- api/src` finds only `prospects.ts` (19 Nov).

**Standard rules:** as `AUD-1m-2.md` (one part, one PR, Approve on the branch before a non-draft PR, P-721 within 30 minutes, P-733 (4) full run only after a failed batch, US$0, live AI off, push every step, questions as "Question for the tech lead: …" answered by Build Lead C within 30 minutes). Repository `expat-ready/xpatready`.
