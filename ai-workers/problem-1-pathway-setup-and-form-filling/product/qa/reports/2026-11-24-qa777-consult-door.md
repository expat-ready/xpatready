# qa: FO-3c's consultation door is not bound to a browser — QA-777 (24 Nov)

**Run:** qa 6 (cloud qa copy, Opus 5.5 medium), under Lead 24. This was asked on #3433: question 3, ruled as "a BUGS row by qa … give it its severity with the reproduction". Tested on main 3af5fc4b0, isolated copy :4476 with `PLATFORM_IDENTITY=local`. Live AI off, US$0, local email adapter only; :4400 not touched. Unconfirmed: no counsel.

**Verdict: reproduced twice. QA-777, Bug, Major.**

## How it was walked (as a person's browsers would)
On main there is no client page for the door: the emailed link opens at the signing vendor's side, and the door is `POST /api/public/consultation-agreements/open`. The check uses two Playwright browser contexts, each with its own cookies and user agent, posting to that door on the running copy:
1. Client C, a licensed Case Officer, books Client P three days ahead through the staff route. The answer is 201.
2. The copy's poller sends the agreement. Client P's email with the link arrives in the copy's demo inbox.
3. **Browser B**, the person the link was forwarded to, posts `{token, consent: true}` before the client ever opens it. The answer is 200 with `codeNeeded: true`, but **the client's consent is now recorded** (`fo_signer.consented_at`, with the audit line "consent to sign electronically recorded (client)").
4. **Browser A**, the client, posts `{token, consent: true}` and is asked for the code. The code arrives by email; typed back, it returns the signing link. This step is the control, and it passes.
5. **Browser B** posts `{token, consent: true}` again, with no code. The answer is **200 with `codeNeeded: false` and the signing link**. It does the same with no `consent` at all.

| Step | Run 1 | Run 2 |
|---|---|---|
| Set-up and booking, email with the link | PASS | PASS |
| (2) A forwarded link alone records no consent | **FAIL** (consented) | **FAIL** |
| Control: A gets the link after the code | PASS | PASS |
| (1) B, with no code, gets no link | **FAIL** (link given) | **FAIL** |

## Why (code on main)
* `consultation-agreement/service.ts:47`: `CODE_SESSION_MS = 30 * 60_000`.
* `:422-425`: `fresh = codeVerifiedAt within 30 min` gives the link without a code. `codeVerifiedAt` is a column on the signer, so any caller with the token shares it. Nothing ties it to the browser that typed the code: no cookie and no session hash.
* `:408`: consent is written on any `open` with `consent: true`, before the code is checked.

## Severity: Major
* **What breaks:** someone other than the client, holding a forwarded link (a shared mailbox, a forwarded email), reaches the signing step of the client's consultation agreement inside the 30 minutes after the client types the code. The client's consent can also be recorded by whoever opens the link first. Both weaken what "signed by the client" means for R1.104. P-564's code exists to prove the person, and AG-5-21 says "a forwarded link cannot be reused".
* **Why not Critical:** it needs the link and a 30-minute window. The vendor's own page may still apply its own checks, which are not tested here because there is no live vendor (US$0). Data is Sample, and there are no customers yet.
* **Effect on the board:** a Major naming R1.104 keeps R1.104 Partial under gate B (P-305, P-317) until it is fixed. R1.104 is already Partial on QA-772.

## Fix (as ruled on #3433)
Move FO-3c onto FO-6 part 4's `signing/door-code.ts`, with the browser-bound session cookie (4b), after 4b merges. Record consent only once the code has proved the person. `tests/qa/check_qa777_consult_door_not_bound.ts` fails today and passes when that lands.

## Questions for the Lead
1. QA-777 names R1.104, so gate B holds R1.104 on it. Is that wanted? The alternative is to scope it to FO-3c's door hardening. My recommendation: keep it on R1.104, because the signature's integrity is part of "signed".
