# PF-19r part 2: break report (the case side's link and code emails through MessagePort)

**Commit broken:** `ed070da45a76249fe12407ec9469a47cbbec0510` (branch `claude/runtime-pf19r-case-links`). **Breaker:** fresh context, 18 Nov, 21:36-21:47 UTC.
**Copy:** `brk_pf19r2` on :4439 (never :4400), `setup_visitor_visa.ts` 15/15, then HTTP attacks modelled on `tests/check_pf19r_case_links.ts` (user-P the client, user-O the case officer, `/api/link/*`, `GET /api/demo/inbox`, `GET /api/demo/platform-inbox`), psql on 54329 for setup and reading. Scratch scripts only (not committed). Copy stopped; its log is in `var/isolated-logs/brk_pf19r2-api.log`.
**Note:** at 21:44 UTC uncommitted edits appeared in this working tree (`person-link.ts`: the resend key becomes `again:${email.id}`, the code key a fresh `randomUUID()`; the suite grows). My copy ran the commit above, started before those edits. B1 and B2 below match the reviewer's M1 and M2 (`review-part2.md`); the uncommitted edits look aimed at them. Not verified: whether those edits fix them.

## Breaks

**B1 Major: the client's same-link Resend sends nothing from the third press on, but answers 201 and records "sent the same link again".** `person-link.ts:206` keys it `case.link:<link>:again:${sent.length}`, and `sent` is `take: 2` (`:198`), so the key is `again:2` from the second resend on. That key is "repeated", so `mail()` returns false: no outbox row, no demo copy, no gate check.
Steps: Client A sends to C. The partner accepts with a code. The officer sends to D. Client A presses Resend (no address), waits 62 s, presses it again, waits 62 s, presses it a third time. Actual on the third press: 201 `created:false`, outbox for D still `[link, again:1, again:2]`, demo inbox still 3 links, a fourth `resent` audit line. Also: after D was added to the suppression list, the same press still answered **201** (a refused address reported as sent).

**B2 Major: two "Send me a code" presses in one millisecond share a key; the code that works may never be emailed, and the answer says `sent: true`.** The key is `code:${expires.getTime()}` (`:331`), and `expires` comes from the request's `now` in ms. Each press still writes `code_hash` (`:328`) and deletes the demo copy (`:329`).
Steps: open a link, then fire 6 × `POST /api/link/code/send {token}` at once, three runs. Run 2 (`cb1`): 6 × 200 but 5 outbox rows. Run 3 (`cb2`): 6 × 200, 5 outbox rows, **no email holds the code in force** (sha256 of each rendered code ≠ `person_link.code_hash`), and the demo inbox has 0 codes. The address has also used its 6 codes per 15 min, so the person cannot sign in for 15 minutes.

**B3 Major: firm A's case sends as firm B, past firm A's suppression list.** `sendingFirm()` (`:80`) trusts `runtime_case.firm_id` and never compares it with the case's `firm_key`. `case-close.ts:65-66` does compare them ("the case's firm key names another platform firm" → not found). No database check stops the two from disagreeing.
Steps: new case (key `sample-firm`). Add `supp6f…@example.com` to firm A's (`sample-firm`) suppression list. Officer sends to it: 409 `ADDRESS_NOT_SENT` (control). Then `update runtime_case set firm_id = <sample-solo id>`. Send again: **201**, outbox row `SENT` under firm B, From "Sample solo practice", counted on B's day. Also `firm_id null, firm_key sample-firm` sends as A (correct). A key naming another firm (`sample-solo`) gives a 404 at `reach` (held).

**B4 Major: a non-English or unusual address gives a bare 500 (a regression; before PF-19r it was sent to the demo inbox).** `normalAddress` (`engine/runtime/privacy.ts:38`) accepts addresses that MessagePort's `normaliseAddress` (`ports/consent.ts:55`, `EMAIL_KEPT`, ASCII only) rejects with a `ZodError`. `inTx` and `ProblemErrors` turn that into 500 "Something went wrong on the server". The link is rolled back, so nothing is lost, but the officer gets no words.
Steps: officer sends to `josé.x@example.com`, `a.x@exämple.com`, `a.x@ex_ample.com`, `a.x@-bad.com`: each 500, 0 outbox rows. Side effect: `console.error` writes the raw address to the log. The redactor masked the first (`josé[email]`) but not `a.mwmnd6k0@ex_ample.com` (api.log line 1362).

**B5 Major: under the trial daily cap, a link or code is "sent" and shown in the demo inbox, but held; a held code goes out after it has expired.** `MessagePort.send` answers QUEUED before the worker counts the day (`messages.ts:115-117`), so `mail()` writes the demo copy and the answer says sent. The worker leaves the row QUEUED with reason "daily limit", and the sweep retries it once an hour. A 15-minute code (`LINK_RULES.codeMinutes`) is dead before the next try. The demo inbox shows a working code that the real channel never sent.
Steps: `update platform_firm set status='TRIAL'` for sample-firm, and set `msg_send_counter.sent = 50` for today. Officer sends a link: 201, words "Link sent 18 Nov to c•••@example.com", demo copy 1, platform inbox 0, outbox `QUEUED/daily limit`. `POST /api/link/code/send`: 200 `{"sent":true,…}`, demo code 1, outbox `QUEUED/daily limit`.

**B6 Minor: a person outside the firm can use up a trial firm's day.** Each code email now counts on the firm's shared cap (counter 26 after my runs, code rows included). One link allows 6 codes per 15 min (24 an hour), so one link holder pressing "Send me a code" can fill the trial 50 in about 2 hours. After that, every invitation, booking email, link and code of that firm is held for the day (B5).

**B7 Minor: Take back after the email is queued still sends it.** The worker checks only the row's state and the gate (`messages.ts:96-111`), never whether the link is still alive. `kill()` deletes the demo copy but leaves the outbox row. The address the firm took back gets the firm's email, with a dead link.
Steps: officer sends to `wrong…@example.com` and takes it back at once ("typed the wrong address"). The outbox row was QUEUED at take-back; afterwards it is `SENT`, the platform inbox has 1, and its link opens as "This link was taken back". The same happens with the code: code sent, then take back, then the code email arrives anyway. Under B5's cap hold the window is hours, not seconds.

**B8 Minor: a refused send leaves its rendered file on disk, holding the working token.** `files.put` runs before the row and before the gate's answer is acted on (`messages.ts:72-74`). The rollback leaves `msg/<firm>/outbox/<id>.json` with no row, and nothing cleans it up.
Steps: QA-359 path (accepted, officer sends to D), suppress D, Client A presses Resend: 409. One new orphan file (`420370c6-….json` and `.meta`) holds **the live link token**, and that link still opens. Refused new-link and code sends leave orphans too, but their token or code never took effect.

**B9 Minor: a full-width address goes to a different address than the one the link stores.** For `ｆｕｌｌ.x@example.com`, `person_link.address` and the demo copy keep the full-width form, while the outbox normalises it with NFKC and sends to `full.x@example.com`. The demo inbox and the real email name different addresses.

**B10 Minor: three Resends at once on the new-link path send three real emails, two of them with dead links.** Three presses with no key: 3 × 201, 4 links (1 live), 4 outbox rows all `SENT`, demo inbox 1. The link logic is unchanged, but each superseded link is now a real email to a person outside the firm, and the demo inbox (which deletes dead copies) hides that. The screen sends an idempotency key (`web/src/runtime/privacy.tsx:59`), so the API alone is open to this.

## What held (with evidence)
* Suppression and case variants: `gone.x@`, `GONE.X@…`, ` Gone.x@… ` → 409 `ADDRESS_NOT_SENT` "Not sent: this address does not take email from the firm. Nothing was changed." Trailing dot, `<…>` and a zero-width space → 400 at the contract. The database refuses an upper-case suppression row (`msg_suppression_address_check`). The existing working link stays live, the demo copy stays, no outbox row, no demo copy to G.
* A code to a suppressed address: 409, `code_hash` unchanged, the link still opens. The officer's Resend to a suppressed address: 409, the old link still live.
* Two sends at once to X and Y: one live link (Y), each answer 201, no 500. Two same-link Resends at once: one `again:1` row, demo 2 (break m3 kept).
* The same idempotency key with another address: sequential and at once → 409 "This key was already used…", 0 rows for the second address. The same key on another case: its own link (the key is per case).
* "Send me a code" eight times in a row: 6 × 200, then 429 "Too many codes…". Each sequential code has its own key.
* A rolled-back change: a planted trigger failing the audit insert gave 500 × 3 (send, resend, code), 0 new outbox rows, `code_hash` unchanged, the old link live, nothing dispatched.
* A firm key with no platform firm: the builder's DW10 (not re-run). `firm_id null` → the key's firm (A).
* No token or code (122 secrets taken from the rendered files) in api.log, audit_event summary/detail, msg_outbox key/reason/provider id, msg_event detail, pg-boss job data/output/singleton key, or person_link_try. Job payload is `{firmId, outboxId}`; refusal texts name no secret.
* Roles: user-A/B/C 403, user-S/Q 404 (user-R/T can send: unchanged, not this row).

## Not verified
The builder's suite as a whole (it hard-codes `/opt/homebrew/…/psql`, absent here). SES or real delivery. The uncommitted working-tree edits seen at 21:44.
