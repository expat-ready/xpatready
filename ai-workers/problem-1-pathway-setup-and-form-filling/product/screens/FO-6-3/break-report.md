# FO-6 part 3: break report (API only: send, state, signing webhook, signing.completed)

Head attacked: c1c7d32bd6ba82b618fe080aefbfef729f3dc7ba (branch claude/jolly-curie-wjyd6o). Brief: `git show 098153d17:…/design/briefs/track-b/FO-6-3.md`. Starting list: part 1's break report m1-m6.
Method:
- A scratch script outside the repo copied the harness of tests/check_fo6_signing_api.ts: a scratch DB `xr_studio_fo6brk3_<pid>` (every migration plus the Sample seeds) at :54329, fakeSigning and fakeMail. Every call went through the real `SigningHooksController`, `SigningController`, `Retainers.send/withdraw/signedOffline/edit` and `Signing`.
- Hostile HTTP bodies went to an isolated copy (`tools/isolated.sh brk_fo63 4471`, TTL 25 min, then stopped and dropped).
- No repo file was edited except this one. :4400 was not touched.
- `S` = api/src/front-office/signing/service.ts, `H` = …/signing/hooks.ts.

## Major

**M1. An event that is refused is stored as handled, so a correct redelivery never applies and the request is stuck for good** (S:139-142, S:167, S:190-192).
Repro A (webhooks out of order):
1. Send, then record consent.
2. `act(client,"signed")` gives `cS`. `act(firm,"signed")` gives `[fS, completed]`.
3. POST `fS` first, then `cS`, then `completed`, then `fS` again, then `completed` again.

Observed:
- `fS`: `200 {applied:false, reason:"the firm signs last, after every client"}`. The receipt is written.
- `cS`: applied, CLIENT_SIGNED.
- `completed`: `409 NOT_READY`.
- `fS` again: `200 {duplicate:true}`.
- `completed` again: `409 NOT_READY`.

End state: request and retainer CLIENT_SIGNED, firm signer unsigned, no evidence. The provider says everyone signed, and `completed` gets 409 on every retry.
Repro B (the webhook arrives before the consent row): POST the client's `signed` with no consent recorded gives `200 refused "no consent…"`. Record consent, POST the same event again: `200 {duplicate:true}`. The client stays unsigned and the request stays SENT. Any later `completed` gets 409 for good.
Expected: a refusal that depends on order or timing leaves no receipt. It answers non-2xx (or stores nothing) so the provider's redelivery can apply. The brief's "refused, state unchanged" still holds. Real vendors do not promise delivery order.
Note: the suite itself works around this ("a fresh request: the fake kept the firm's out-of-order signature", tests/check_fo6_signing_api.ts:176).

**M2. Whether a fully signed retainer is recorded depends on the conflict gate at the moment of completion. If the gate refuses, the evidence is never stored** (S:221, retainers/on-signing-completed.ts:361, sales/prospects.ts:92, compliance/conflict/gate.ts:85-88).
Repro I:
1. Send, consent, the client signs (applied).
2. Correct the client's email: `update fo_person set email='ida.corrected@example.com'` stands in for a staff edit.
3. The firm signs (applied). POST `completed` twice.

Observed: both answer `409 CONFLICT_CHECK_STALE`. There is no evidence row, no "Your signed agreement" email and no signing.completed. Request and retainer stay CLIENT_SIGNED. The same happens for no check and for CONFLICT_CANNOT_ACT.
The client and the representative have both signed at the provider, but we keep no sealed copy or audit file (P-561: "stored with us"). Nobody is told: it is a webhook, with no person to read the 409. It recovers only if someone happens to redo the check while the provider is still retrying.
Expected: storing the evidence and moving to SIGNED does not depend on the win. If the win is refused, that is recorded and surfaced, not used to roll back the signature.

## Minor

**m1. An unsigned, deeply nested JSON body answers 500** (H:28, `hookBytes` → `JSON.stringify`).
Repro: `curl -X POST :4471/api/hooks/signing/fake -H 'content-type: application/json' --data-binary '{"a":[[[…5000 levels…1]]]}'` (about 10 KB, no signature).
Observed: `500 Server error`. The log shows `RangeError at JSON.stringify … hooks.ts:28:78`. 4000 levels gives 400 and 5000 levels gives 500 (200 000 levels also gives 500).
This contradicts H's header "never a 500 for a hostile call". It is rate limited and nothing is stored.

**m2. A `viewed` that arrives after that signer's `signed` answers 500 for good** (S:183-184; the `tx()` patterns at S:148 do not match).
Repro L: `act(client,"viewed")` gives `v`, `act(client,"signed")` gives `s`. POST `s` (applied), then POST `v`.
Observed: `500 DriverAdapterError: fo_signer: a signer who signed or declined does not change`. The receipt is rolled back, so every retry of a genuine event answers 500. State is correct.

**m3. A completion that cannot apply still stores a new sealed and audit file on every attempt** (S:158-165, files written before the transaction).
- E: 6 parallel identical `completed` give 1 applied and 5 duplicates. That leaves 1 evidence, 1 event, 1 win and 1 mail (good), but 5 orphan file pairs.
- G: withdraw from CLIENT_SIGNED, then the firm signs and `completed` is sent 3 times. Each answers `409 CHANGED` ("withdrawn or signed on paper") and writes a file pair: 3 orphan pairs.
- H: Signed offline, then `completed` gives the same 409.
- I (M2) and NOT_READY (M1) do the same.

The 409 can never become 2xx, so the provider retries until it gives up, and each retry adds two files. Stopping the envelope at withdraw is FO-5d's job. The endless 409 and the file growth are this part's.

**m4. Part 1 m2 is not enforced by the API: signatures after `expires_at` are applied** (S:190-193 has no window check).
Repro X: `new Signing(db, files, { now: () => +20 days })`. The client signs, the firm signs, then `completed`.
Observed: all applied. Request and retainer are SIGNED, `prospectWon:true`, and `signed_at > expires_at` for both signers. Until part 5's expiry job exists, nothing stops a day-15+ signature from making a client.

**m5. The provider's document id is written into audit detail** (S:176 `eventId`). The fake's event id is `<providerDocumentId>.<n>`. Lines `signing.viewed` and `signing.signed` carry `"eventId":"fake-07bda5ff-….1"`. The state answer is clean. This is informational: whether it matters for FO-6v depends on BoldSign's event-id format.

**m6. The rate limit uses `req.ip` with no trusted proxy** (H:287-313). Good: rotating `X-Forwarded-For` over 125 calls gave 107×400 and 18×429. But behind a load balancer every caller shares the balancer's address, and unsigned junk uses up the same 120/min as the provider's signed calls. It is a deployment note: whoever sends 120 unsigned calls a minute can delay genuine webhooks.

## What held (expected = actual)
- **Forgery**:
  - all of these give 400 SIGNATURE with nothing stored: an event from another `fakeSigning()` instance re-pointed at our document; the right signature over reordered keys; an extra key; an upper-case hex signature; an array signature header.
  - provider `boldsign` and `..%2fstripe` give 404. `FaKe` is accepted (it is the same provider).
- **Replay and races**:
  - 8 parallel copies of one `viewed` give 1 applied and 7 duplicates: 1 receipt, 1 audit line.
  - `completed` racing the firm's `signed`, 4 runs out of 4: SIGNED, 1 evidence, and the retry is a duplicate.
  - 6 parallel completions give 1 evidence, 1 `signing.completed`, 1 `prospect.won` and 1 email.
- **Send**:
  - 3 Sends at once of one retainer give 1 ok and 2×409 CHANGED: 1 request, 3 adapter sends, 2 cancels.
  - Edit, then Send of version 2: the old request is `CANCELLED:UPDATED` and its envelope is cancelled once.
  - A Send with a signer name over 300 characters gives 500 ZodError from `port.send` (S:58-59). Today the API cannot reach this (first name at most 100 characters, 422), so it is noted only.
- **Firm before clients / no consent**: refused, state unchanged (but see M1). A `declined` event gives 200 unapplied. A `viewed` after a decline is applied (the decline is FO-5d's).
- **Reads**:
  - with "everyone sees all" off, user-O and user-T (not the owner) get 404; firm B gets 404; a bad id and a random id get 404; no session gets 401.
  - the state answer has status, "0 of 2 signed", roles, names and moments, with no token, link hash or provider id. Person and staff ids are present.
- **HTTP bodies**: invalid JSON, `null` and `7` give 400 BODY_NOT_JSON; an array, `__proto__`, text/plain and an empty body give 422; 6 MB gives 413; 4 MB unsigned gives 400. Nothing quotes the body back.
- **Part 1 Minors in the API**:
  - m1 and m4: `ended_at` and `expires_at` come from the server clock (S:74, S:79, S:205).
  - m3: there is always exactly one client before the firm.
  - m5: provider ids come from the adapter; a firm cannot choose one.
  - m6: the hook matches the document id exactly; evidence keys are `signing/<requestId>/…` within the firm.
  - m2: not enforced (m4 above).
- **Retired names and bypass use**: no `retainer.executed` or `envelope.completed` name. `front-office.signing.webhook` is per-firm, scoped to this route only.

Verdict: Changes. M1 and M2 can each leave a request that was genuinely signed unrecorded for good; m1-m4 should be fixed with them.

## Round 2 (head e0d7697658c973a1338cb0f862a84a31b1a76c70; diff from c1c7d32 only)
I re-ran the same scratch harness with the same calls on a fresh scratch DB.
- **M1: fixed.**
  - A: the firm's `signed` sent first gives `409 NOT_YET` and nothing is kept. Then the client's `signed` applies, `completed` gives 409 NOT_READY, the redelivered firm `signed` applies and the redelivered `completed` applies. End state: SIGNED, 1 evidence.
  - B: `signed` with no consent gives 409 NOT_YET; after consent is recorded, the redelivery applies.
- **M2: fixed.** In I (the email changed after the check), `completed` applies with `prospectWon:false`. The request and retainer are SIGNED, there is 1 evidence row and 1 email, and a `signing.win_held` line is written.
- **m1: fixed.** The 5000-deep and 200 000-deep bodies give 400 SIGNATURE. An array, a string or `null` gives 400.
- **m2: fixed.** In L, a `viewed` after `signed` gives 200 "viewed already".
- **m3: mostly fixed.** G and H (withdrawn, signed on paper) now store no files and keep a final receipt (200, then duplicates). Still open, as the code comment says: in E, 6 parallel identical completions leave 5 unused file pairs (24 file entries for 1 evidence).
- **m4: fixed.** In X, at day 20 both signatures give 200 "the request has expired" and the request stays SENT.
- **m5: fixed.** No audit line names the provider id any more. m6 (rate limit by caller address) was not in round 2 and is unchanged.
- **Deadlock probe: no deadlock.** Z ran 15 requests. Each got (client viewed, firm viewed, a provider "other" event) at once, then (client signed, firm signed, completed) at once, then the provider's in-order redelivery. Result: 60 applied, 39 duplicates, 6 NOT_YET, and no 40P01, CHANGED or 500. But all 15 requests ended stuck: see R2-M1.
- **Held again**: C, D, E (1 evidence, 1 event, 1 win, 1 mail), F, J, K, O, P and the part 1 checks, all as in round 1.

**R2-M1 (Major, new in e8dc29499): a `completed` that arrives before the signatures it needs is stored as final, so the signed retainer is never recorded** (service.ts:167-170).
Repro Y:
1. Send, then record consent.
2. `act(client,"signed")` gives `cS`. `act(firm,"signed")` gives `[fS, completed]`.
3. POST `completed`, then `cS`, then `fS`, then `completed` again.

Observed:
- the first `completed`: `200 {applied:false, reason:"the agreement is sent"}`, and its receipt is written.
- `cS` and `fS` apply.
- the second `completed`: `200 {duplicate:true}`.

End state: request and retainer CLIENT_SIGNED, both signers signed, 0 evidence, no email, no win. They can never move. In Z the same thing hit 15 of 15 requests ("the agreement is viewed" when `completed` overtook the client's `signed`).
Cause: the early check treats every retainer status other than CLIENT_SIGNED/SIGNED as "withdrawn or signed on paper: final". SENT and VIEWED are not final: they are this round's "not yet" case (M1).
Expected: only WITHDRAWN and SIGNED_OFFLINE (and perhaps a newer version) are final. SENT and VIEWED answer 409 NOT_READY and keep nothing.

Round 2 verdict: Changes (R2-M1 brings M1's stuck request back for `completed`; everything else from round 1 is fixed except the parallel-only part of m3).

## Round 3 (head 29e8389042589c8950f39423bf389e4f3e40a6f0; diff from e0d769765 only, f2021fe the R2-M1 fix)
I used the same scratch harness on a fresh scratch DB, plus new cases W1-W5 for the final-vs-not-yet rule (service.ts:165-173).
- **R2-M1: fixed.**
  - Y: the first `completed` gives `409 NOT_READY` and keeps nothing. Then the client's `signed` applies, the firm's `signed` applies, and the redelivered `completed` applies. End state: SIGNED, 1 evidence, `prospectWon:true`, 1 completed receipt.
  - Z (15 requests, the two concurrent batches, then the in-order redelivery): 75 applied, 15 NOT_READY, 6 NOT_YET, 24 duplicates. All 15 end SIGNED, with no deadlock, no CHANGED and no 500.
- **W1, while SENT and then VIEWED**: `completed` gives 409 NOT_READY both times, with 0 receipts and no files fetched. After both signatures, the redelivery applies (SIGNED, 1 evidence).
- **W2, Edit to version 2 with no new Send**: version 1 is still signed by both. `completed` gives `200 "a newer version was made"`, then duplicates. 1 receipt, no files. The retainer stays DRAFT v2 and the old request stays CLIENT_SIGNED until FO-5d or part 5 ends it. This is final, as intended.
- **W3, Edit then Send v2 with the old events held**: the old request is CANCELLED:UPDATED. The held `completed` gives `200 "the request is cancelled"` and is stored once.
- **W4, withdraw (G) and signed on paper (H)**: both give 200 and are final ("withdrawn", "signed offline"), with no files, then duplicates.
- **W5, a withdraw racing `completed`**: the withdraw wins. `completed` gives 409 CHANGED, the redelivery gives 200 "the agreement is withdrawn" (final), and there is 0 evidence. Neither side is half-applied.
- **Still open (Minor, unchanged)**:
  - m3's parallel case: 6 identical completions at once leave 5 unused file pairs. The code comment acknowledges this.
  - The W5 race can leave one unused pair.
  - m6: the rate limit keys on the caller address.
  - None of these blocks the PR.
- Held again: D, E (1 evidence, 1 event, 1 win, 1 mail), G, H.

Round 3 verdict: Approve. No Blocker or Major is open.
