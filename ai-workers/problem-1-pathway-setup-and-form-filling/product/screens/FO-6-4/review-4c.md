# FO-6 part 4c (#3490): review of the stand-in signing page, the firm signer's link and QA-770's signing guard

Commit `cb742468eb2eb489cc03407610a05fd296b8ebb3` on `claude/busy-goldberg-jyerm9`. Diff `fcb8e3ad8..cb742468e` (19 files, +508 −20), stacked on #3460. The reviewer did not build it. Read against plan-4c.md (approved at aa067ebad), Lead 29's three comments on #3490 (read through the REST API), note.md rules 11-12, challenge-4c.md, the BACKLOG FO-6 row and STANDARDS §6-§8. No screen concept (Lead 29, answer 2), so the BIC scorecard is N/A: API only, plus a local-only stand-in page. Journey report: `journey-test-reviewer-4c-2026-11-24.md`.

**Verdict: Block.** On the screen-review scale this is Ship after fixes: one Major, and its fix is test lines only. No code change is needed. 0 Blockers, 1 Major, 6 Minors.

## Runs (every run on its own isolated copy; never :4400)
* `run-suites.sh --only` with the 4 named suites: fo6_door **42/42**, fake_page **16/16**, signing_api **52/0**, qa53 **49/0**.
* Second run with the neighbours: features_registry 27, fo3c 42, fo3c2 55, door_code 24, signing_port 17, fo6d 36, pf12_walls 110, pf28 **51/51**, plus door and fake_page again. All PASS, exit 0.
* **Mutation, QA-770 guard:** `service.ts` set back to fcb8e3ad8. signing_api goes red on exactly the 4c line (`{"wv":{"applied":true},"wsg":{"applied":true}}`). The builder's claim holds.
* **Mutation, firm-link rules** (`firm-link.ts`): removed the CLIENTS_FIRST line, made `SIGNABLE_RETAINER` always true, and made the consent audit line unconditional. door 42/42, signing_api 52/52 and pf28 51/51 all stayed **green**. See Major 1.
* Reviewer journeys (isolated copy `rev4c` on :4437, the runtime range) ran twice with the same results. Details are in the journey report.
* Restored after the runs: `git status` is clean.

## What holds (checked)
* **B1, loopback through the webhook door.** `fake-page.ts:63-76` POSTs the fake's exact bytes and headers to `127.0.0.1:$STUDIO_PORT/api/hooks/signing/fake`, which is the app's own listen address (`main.ts:240,263`). No bypass is widened, so part 3's order, consent, expiry, evidence and win rules apply unchanged. E2 and E6 prove it end to end: the request reaches CLIENT_SIGNED and then SIGNED, with exactly 1 receipt and 1 `signing.signed` line per step (journey J1).
* **Retry rule (challenge m2).** Only a 409 NOT_YET, CHANGED or NOT_READY is retried, at most twice, 200 ms apart (`:72`). Any other answer is final and is shown in words, escaped (`:97`).
* **Nonce.** It is 32 random bytes in base64url. It is checked against a 43-character pattern, then against document and signer, then expiry, then a live envelope and an unsigned signer (`port.ts:254-262`). It is taken synchronously (`port.ts:301`). Two tabs pressing Sign at once give one "Signed" and one 404 page, with 1 audit line (J6). Signing ends that signer's other links, and a cancel or decline ends the document's (`port.ts:281,290,293`; J4 reload). A used, unknown, malformed or path-like nonce, or a POST with a body, all get one 404 (J8).
* **The page itself.** The title is escaped (`fake-page.ts:41`), the page has no script, and it shows no name or email (fake_page and J1). The headers are `no-store`, `no-referrer`, and a CSP of `default-src 'none'; … form-action 'self'; frame-ancestors 'self'; base-uri 'none'`. The CSP blocked the reviewer's injected axe script until `bypassCSP` was set.
* **Local only, failing closed (Lead 29).** `signingFeatureFor` adds the controller and the linked fake only when `env === "local"`. `assertStandInPageAllowed` throws at import (`front-office-signing.ts:196`; tested for production, test and unset in `check_fo6_fake_page.ts:29-30`). Each request checks again, both `local` and `provider === "FAKE"` (`fake-page.ts:35-38`; fake_page m6 lines). The cloud task is `production` or `test` (`deploy/cdk/lib/service-checks.ts:70`).
* **Firm link: permissions and order.** The route takes `agent/retainer:show` plus own-or-all `agent/prospect`. The order is: `idParam` 404, then strict body 422, then `Retainers.read` 404 (`routes.ts:342-343`), then NO_LIVE_REQUEST, then 403, then CLIENTS_FIRST (`firm-link.ts:128-134`). The caller must be both the FIRM signer and the current representative (`:133`). Probes: a case officer who sees everything gets 403, an unknown id or another firm's gets 404, a malformed id gets 404, `{}` or an extra field gets 422 (J3, J4). PF-28 is green.
* **Consent.** It is written under the request's row lock, only while `consentedAt` and `signedAt` are null (`:136-142`). Two calls at once give 2×200 with **1** `signing.consent_recorded` line by `staff:<id>` (J4). It never reaches part 1's write-once trigger.
* **QA-770 guard.** It sits under the request lock and takes `for update` on the retainer, so a withdraw cannot slip in. A withdrawn, signed-offline, declined, expired or newer-version retainer is refused and stored once (`service.ts:201-208`). A withdrawn agreement signed on the page shows "The signature was not recorded (the agreement is withdrawn)". The request stays VIEWED and the signer stays unsigned. The firm link then answers 409 NO_LIVE_REQUEST (J7). Lock order (request, then retainer) is the same as the completed path's. A deadlock maps to 409 CHANGED, which the page retries.
* **QA-53.** The GET has `@OpenRead` on one line with `@Get`, and a REVIEWED "open" row. The POST is in PUBLIC_WRITES and is probed with an unknown nonce (404). The firm link sits behind PF-4's guard.
* **Module row.** It has the three line kinds and the limiter's one-process limit (Lead 28).

## Findings

### Major
1. **STANDARDS §7 [M] "a rule's test fails when the rule is removed" is not met for three of plan row 4's rules.** Removing them leaves every suite green (mutation above):
   * (5) CLIENTS_FIRST: `firm-link.ts:134`. No test sends the firm link before every client has signed.
   * (3) the firm link refuses a withdrawn, signed-offline, declined or expired retainer (`SIGNABLE_RETAINER`, `:122,128`). The plan says "the firm link refuses on the same states". No test covers it. The request filter hides it today, but the rule is the plan's own.
   * (6) consent recorded once, with one audit line (`:139-140`). No test calls the link twice and counts `signing.consent_recorded` for the FIRM signer.

   **Fix:** add the lines to `check_fo6_door.ts` E or `check_fo6_signing_api.ts`. Each is a few lines with the existing helpers:
   * CLIENTS_FIRST: a second sent retainer, firm link before the client signs, 409 CLIENTS_FIRST with FIRM `consented_at` still null.
   * Consent once: the firm link called twice (ideally at once), then exactly 1 FIRM consent line.
   * Retainer states: firm link on a withdrawn retainer gives 409 NO_LIVE_REQUEST. Journeys J4, J5 and J7 show that all three already behave correctly.

### Minor
1. **The nonce is taken before delivery, which differs from the approved plan.** Plan row 2 (a) and (e) say "checked, not consumed … after a 2xx, the nonce is consumed". The code claims it first (`fake-page.ts:91`). That is the safer choice (J6), and since `act` has already marked the signer signed, a retry could not work either way. But it is a silent change. **Fix:** one line in plan-4c.md or note rule 11.
2. **A wrong consent version gets 409 CONSENT_CHANGED, not the plan's 422** (`firm-link.ts:127`; plan row 4 (2): "anything else is 422"). This matches the door (`door.ts:159`) and is defensible. Record it in the module row or note rule 12.
3. **The QA-770 test covers only WITHDRAWN.** The `current_version` branch (`service.ts:205`) and SIGNED_OFFLINE have no line. **Fix:** loop the signing_api line over withdrawn and signed-on-paper. A newer version needs an Edit after Send.
4. **The firm link's state is read before the lock** (`firm-link.ts:128-135`). A request that ends between the read and `tx` still gets the firm signer's consent written. The webhook refuses any later signature, so no harm is done. **Fix:** add `request: { status: { in: [...] } }` to the `updateMany` where clause, or re-read under the lock.
5. **Refusal words on the page.** The fallback shows the raw code, e.g. "(NOT_YET)" or "(CHANGED)", when the door's problem body has no `reason` (`fake-page.ts:71,97`). "Ask the firm to send it again" is also shown for a withdrawn agreement, where sending again is not the remedy. This is local only. **Fix:** map the codes to words.
6. **The fake's nonce map is swept only when a nonce is looked up** (`port.ts:252-258`), so links issued and never opened stay in memory. This is local only and bounded by the door's limiter. Note it in the card's known limits or sweep on issue.

## D1–D20 (API only; the stand-in page is not a product screen)
D1 4: rules 11-12 and the QA-770 guard are as approved, with Minors 1-2 as deviations. D2 5: consent is written once under a race, the nonce is taken once, receipts are stored once. D4 N/A. D5 4: reload, double click and retry are safe. A failed delivery leaves the fake ahead of the database (local only). D6 4: the audit lines are present. D3, D7 N/A. D8-D9 N/A (no screen). D10 4: plain words, but see Minor 5. D11 5: role=status and role=alert, a readable 404 page. D12 4: plain, as planned. D13 5: axe finds 0 on 5 states, keyboard works, 400 and 1024 px have no sideways scroll. D14 N/A (a stand-in, with no brand work by plan). D15 5: under 40 ms to load and under 90 ms to sign. **D16 3: Major 1.** D17 and D20 are simulated only. D18 4: "no real signature" and a note box. D19 4: Send to SIGNED on one copy, with the firm's button left to FO-5s.

## Could not check
* An intended user's unaided walk, and a real screen reader.
* j_54 W2 and W3: not run again. W3's 422 comes from qa's `{}` body, as the plan says.
* `module-cards.py pr`: it printed only its usage here, so CI's run is relied on.
* `graph.mjs`: it lists the three new routes with `testedBy: []`, as it does 4b's door routes. Its matcher does not follow template URLs. The routes are tested in door E and qa53.
* The breaker's report (`break-report-4c.md`, untracked, from a parallel session) was not read.

Reviewer: Block cb742468eb2eb489cc03407610a05fd296b8ebb3
