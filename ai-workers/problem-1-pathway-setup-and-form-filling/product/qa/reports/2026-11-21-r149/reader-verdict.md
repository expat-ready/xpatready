# R1.49 reader verdict: consent gate before every send; unsubscribe

Reader: fresh reader (Opus, P-303). Ran nothing: I only read files, git history and diffs, and grep. Main 19fdf28d7. Live AI off, US$0.
Paths below are relative to `prototype/studio/` unless they start with `product/`.

**Verdict: Works, on one condition: the GitHub recorded walks of j_49 (walks.yml) pass on main's head.** Nothing I read holds the row. The findings below are all Minor and none blocks the Done when.

## Evidence checked
* `ci-44874048135.md`: I checked its claim with `git diff --name-only 3a91af672b 19fdf28d7`. 94 files differ. Under `prototype/` they are: `api/src/runtime.ts` (QA-621: a production guard in `createCase`, with no mail in it), the booking settings and calendar pages in `web/src`, `deploy/cdk/*`, the restore runbook, `tests/journeys/j_32.ts`, `j_42.ts` and `j_49.ts`, the QA-621 and FO-3st3 checks, and two MODULE.rows notes. None of them is under `platform/messages`, `ports/messages.ts`, `ports/consent.ts`, `person-link.ts`, `prisma/` or the features. **The claim holds.**
* `pack-local-{a,b}.txt`: all 8 suites passed in both runs, with the same counts (94, 29, 42, 68, 21, 21, 27, 22).
* `j49-local-{a,b}.txt`: 30/30 in both runs. They differ only in ids and times. Note that `product/qa/built/J-49.md` says "29 checks", but the file has 30 `ok(` calls.

## 1. Is a send refused before it leaves, on every path?
**Yes, for every send call in `api/src`.**
* **One gate, checked twice.** `MessagePort.send` asks the gate at `api/src/platform/messages/send/messages.ts:113`. A refused message is written SUPPRESSED, never QUEUED (`:118`). The worker asks the gate again before the adapter (`:214-215`), so a message queued before an unsubscribe, or held by the daily cap, is stopped too.
* **The consent rule.** `ports/consent.ts:181-185` and `:216-226`. Marketing needs marketing consent. WhatsApp needs the opt-in. Email that is not marketing needs none, but the suppression list always applies.
* **The scan of every sender.** `tests/check_pf19r_every_sender.ts` reads every `.ts` file under `api/src` (`:112-113`) and finds six kinds of send call (`:25-32`):
  * any `.send(` or `.sendIn(`, under any name, in a file that holds a mail or message port (`:70-71`, `:84-86`);
  * writes to `demoMessage`;
  * nodemailer and the SES SDK.
  
  The counts per file are exact (`:42-58`, `:101`). A file that is not in the table fails (`:100`). A new direct send therefore fails S1, and the probes at `:126-159` prove it, including nine send shapes that a name-based scan misses. S2 (`:180-219`) loads the real features and proves that MAIL_PORT, SIGNUP_PORTS, COMPLAINT_PORTS and BOOKING_PORTS are bound to MESSAGES_MAIL. MESSAGES_MAIL is MailPort over MessagePort (`api/src/features/platform-messages.ts:34-35`), and MAIL_PORT uses it (`features/platform-staff-read.ts:18`).
* **The case side.** `api/src/person-link.ts:95-103` sends each link and code email through `this.msg.send`, as TRANSACTIONAL for the CASE_PARTY. The `demo_message` copies at `:211-212`, `:226-227` and `:341-342` are written only after MessagePort accepts (S1 checks this at `:105-108`).
* **My own grep.** I searched `api/src`, `engine`, `ports` and `web/src`:
  * nodemailer, `createTransport`, `sendMail`, the SES SDK: found only in `channels/email/ses.ts`, MessagePort's own adapter.
  * `demo_message` and `msg_outbox` writes: found only in `person-link.ts` (guarded) and `send/messages.ts:121,154`.
  * `fetch(` to a mail host: none (`bounces.ts` only fetches SNS certificates).
  * `LocalMail` and `fakeMail` in app code: only the allowed unit-test default (`platform/firms/runtime-ports.ts:23`).
  * MARKETING or WHATSAPP senders outside `platform/messages`: none on main.
  
  **I found no bypass.**
* **Limits, by design.** Platform account mail (sign-up's two emails) has no gate (`messages.ts:144-160`). It is forced to TRANSACTIONAL, and MARKETING is refused by the schema (check_pf19p DW1 `:131-133`). The scan reads text only, as its own header says (`check_pf19r_every_sender.ts:10-12`).

## 2. Is there a fail case for each path?
**Mostly, but not literally one for each sender.**

| Path | Fail case |
|---|---|
| Marketing with no consent | check_pf19b_sending DW1 `:79`; j_49 W2 |
| Staff invitation | check_pf19r_senders DW2 `:131` |
| Two-step reset notice | DW3 `:141` |
| Identity-provider code email | DW3 sender 3 `:160` |
| Complaint reminder | DW4 `:202`, `:210` |
| Booking mail | check_pf19b_mail BM3, BM7, BM10 `:103`, `:144`, `:186` |
| Case-side links and codes | check_pf19r_case_links DW7, DW8, DW9 `:71`, `:85`, `:126` |
| Withdrawn consent | j_49 W4; check_qa518 Q1, Q4, Q6, Q7 |

Support-ticket mail (`platform/support/support.ts:162`) and the storage-over emails (`platform/entitlements/storage.ts:80,83`) have no refusal check of their own. They are proven to reach MESSAGES_MAIL structurally (S2 `:205-206`), and that same adapter's refusal is proven by BM3. See F2.

## 3. Does one-click unsubscribe withdraw only that purpose? Is QA-518 fixed?
* **Only that purpose: yes.** `api/src/platform/messages/channels/email/unsubscribe.ts:113` withdraws EMAIL and MARKETING only. GET records nothing (`:97-101`). A token works once (`:90-91`). No suppression row is written, so service and transactional email still go. J-49 W3 walks this by screens. check_qa518 Q7 (`:141-142`) shows WhatsApp marketing is untouched.
* **QA-518: fixed, but not where the brief says.** `withdraw()` still ends only that person's rows (`consent-store.ts:100-103`). The fix is a check made when a send is judged, in `allows()` (`consent-store.ts:141-162`). That check finds the latest one-click unsubscribe from the address, by any person of the firm, through `msg_outbox.address` and `withdrawn_by = system:unsubscribe:<outbox id>`. It then refuses ADDRESS_UNSUBSCRIBED unless the person gave a fresh consent afterwards, in their own words, on a public page (`ports/consent.ts:234-237`). This matches the tech lead's ruling as written in BUGS.md:261.
* **The QA-518 check proves it, with a pass and a fail for each part:**
  * Q1: the second person record at the address is refused, whatever the address's spelling;
  * Q2: another address, and another firm, still get marketing;
  * Q3: service and transactional email still go;
  * Q4: a consent recorded by staff does not lift the stop;
  * Q5: a fresh public tick lifts it for that person only;
  * Q6: a second unsubscribe puts the stop back;
  * Q7: the worker's re-check stops a message queued before the unsubscribe;
  * Q8, Q9: older, copied, imported or staff-typed consents do not lift it;
  * Q10: the query uses its indexes (`check_qa518_unsubscribe_address.ts:78-164`).
  
  22 passed in CI and in both local runs.
* **Does anything still reach the address?** Marketing does not, unless a fresh public tick lifts the stop. Its known limit is m4: the stop lasts only as long as the outbox row that carries the address. Withdrawals made by other means stay per person: see F3.

## 4. Do service messages still go after an unsubscribe?
**Yes.** A service or transactional email needs no purpose (`ports/consent.ts:219`), and the unsubscribe writes no suppression. The proof is:
* j_49 W4: a SERVICE email to A is SENT and arrives, and A's lead page reads "Sent";
* check_qa518 Q3 (`:98-99`): SERVICE and TRANSACTIONAL email to the unsubscribed address both go.

**But no check sends to a person on an active case.** Both tests send to front-office persons. The case side's emails are TRANSACTIONAL for a CASE_PARTY (`person-link.ts:97`), so they pass by the same rule, but that is shown by the code, not by a test (F4).

## 5. j_49.ts read critically
* **W2 sends in process: acceptable, not a hole.** No screen or door on main sends marketing or WhatsApp, and my grep found none. A walk by screens can only reach transactional and service sends, which the gate never refuses for consent.
* **W2 uses the real classes on the copy's own database and files** (`j_49.ts:137-140`). The real `Messages` and `ConsentStore` read the consent the booking screen wrote, and the inbox and lead page shown by screens read the result. Jobs and the clock are stand-ins. S2 and `platform-messages.ts:34` cover the app's own wiring.
* **The walk is honest about this** (`:8-10`, `:16`). It ends on A's lead page because row 50 is not built.
* **Re-walk later.** When a marketing (campaign) screen is built, it must be walked through the gate.
* **Vacuous checks: none that carry the claim.** The "not in inbox" parts of W2 B (`:152`) and W4 (`:200`) are read at once, for rows `send()` never dispatched. They add little, but the SUPPRESSED state and its reason carry the claim.
* **The DW/NR stand-in lines are weak but true.**
  * DW1 NR (`:159-162`) uses an empty `fakeConsent`, so any judge that needs A allowed fails on it.
  * DW2 NR (`:205-208`) uses a fresh store that is never connected to the door, so it cannot see the withdrawal by construction.
  
  Both prove that the judges can fail, which is P-606's purpose. That the real store is read is proven by the pass lines: A SENT and B SUPPRESSED NO_CONSENT (DW1, `:149-161`), and WITHDRAWN after the copy's own door wrote it (DW2, `:201-202`).
* **QA-518's address-wide stop is not walked in J-49.** It is left to its own check (`:20-21`). That is acceptable, because it is not in R1.49's Done when.

## 6. Do QA-495 and QA-518 close?
* **QA-495: close.**
  * The case side's link and code emails now go through MessagePort (`person-link.ts:95-103`, PF-19r part 2).
  * Staff and system mail is on MESSAGES_MAIL (`features/platform-staff-read.ts:18`; check_pf19r_senders DW1-DW4).
  * Every sender is classified with no open entry (`check_pf19r_every_sender.ts:42-58`; no `open:`).
  * MessagePort renders the one layout (S3 `:222-229`).
  
  PF-13's logo is R1.47's own matter, not this bug. Not verified: the deployed identity provider's custom email sender (see below).
* **QA-518: close.** The fix and its check (§3) give the behaviour the ruling asks for, and they are on main (#2618, 19fdf28d7).

## Findings
* **F1 · Ambiguity · Minor.** Who decides the class: the caller names it (`ports/messages.ts` MessageSend.class; e.g. `storage.ts:83` SERVICE, `person-link.ts:97` TRANSACTIONAL). Nothing checks that promotional content is never sent as SERVICE or TRANSACTIONAL, which skip consent. No such sender is on main. Suggest a rule in STANDARDS, or a scan when campaigns arrive.
* **F2 · Gap · Minor.** "Fail case each" is met for each sending adapter, not for each sender. Support-ticket mail (`support.ts:162`) and the storage-over emails (`storage.ts:80,83`) have no refusal check of their own (see §2).
* **F3 · Ambiguity · Minor.** The address-wide stop covers only the one-click unsubscribe (`consent-store.ts:153-157`: `via = UNSUBSCRIBE`, `withdrawn_by system:unsubscribe:`). A withdrawal recorded by staff ("asked by phone"), by PORTAL or by COMPLAINT on one person record leaves a second record at the same address live (AG-2-84). The ruling names only the unsubscribe: this needs the tech lead to confirm it. Unconfirmed: no counsel.
* **F4 · Gap · Minor.** "Service messages for an active case still go" is shown by the code, not by a test. No check or walk sends a case party a message after that address unsubscribed (§4).
* **F5 · UX · Minor.** SERVICE email carries `List-Unsubscribe` (`unsubscribe.ts:57-60`), but pressing it stops only marketing. A mail client's "Unsubscribe" button on a service email therefore does not stop that kind of email. The page says so in words (`:100`, `:116`). AG-2-59 rule 11 is cited; the ruling should be confirmed.
* **F6 · Gap (records) · Minor.** `product/qa/built/J-49.md` says 29 checks; `j_49.ts` has 30, and the runs show 30/30.

## What I could not check
* **The GitHub walks of j_49.** They had not run. The verdict depends on them.
* **The shards that CI reports only as "job success".** I did not read their logs.
* **How the CI runners reach PostgreSQL.** The checks hard-code `/opt/homebrew/opt/postgresql@18/bin` (e.g. `check_qa518_unsubscribe_address.ts:36`), and I did not trace how CI provides it.
* **The deployed identity provider's custom email sender.** It is not in the repository (`check_pf19r_every_sender.ts:45`; `product/qa/built/PF-19r.md`). In production Cognito sends its own sign-up code (`signup-identity` entry, `:57`), outside MessagePort and the suppression list. It is transactional, so no purpose consent applies.
* **Anything that sends outside `api/src`** under a name the text scan cannot see: the known limit at `check_pf19r_every_sender.ts:10-12`.
