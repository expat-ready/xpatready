# FO-7c part 1: break report (the firm's payment account on the fake card rail)

Breaker, 22 Nov 2026. Commit `786d1a32376a15ce57893b7eae42264fa09b35e5` on `claude/dazzling-thompson-1ndong` (diff `origin/main...786d1a323`). API only, so there was no screen pass.
Specification: `design/briefs/FO-7c.md` part 1 (rulings, "What to build → Part 1", DW1-DW3, DW4's wall part, DW10, "Reviewer and breaker") and `briefs/track-b/FO-7c-1.md` (`origin/lead-b/2026-11-22-track-b`). Requirement text read for the alert: AG-16-16 (rules 1-4, tests) and the AG-16 §B lifecycle.

**How it was run.** I wrote my own harness outside the repository: `/tmp/claude-0/-home-user-xpatready/81c54141-b9ea-50d9-8153-5d646637e907/scratchpad/break/attack.ts`, with its output in `out2.txt`, `out3.txt` and `out4.txt` in the same folder. It is the suite's set-up (a scratch database `xr_studio_fo7c_break_<pid>` with every migration, PF-4's guard, PF-12's walls, the local sign-in stand-in, the API as `xr_app`) with main.ts's parser order (PF-28 JSON limit, PF-5 raw, this row's raw, the 5 MB JSON parser). It uses the fake rail, `fakeMail` and the **real** `PrismaNotificationPort`. Wrapped ports throw on demand (audit, the N-th notify, the rail read, mail) or slow the rail read down. A second Owner (user-T) is added to firm A for the multi-Owner cases.
Run: from `prototype/`, `studio/node_modules/.bin/tsx --tsconfig studio/api/tsconfig.json <harness>`. The scratch folder holds `package.json {"type":"module"}` and a `node_modules` link to `studio/node_modules`.
Also run: the full `api/src/main.ts` on port 4517 against its own scratch database with no Stripe key, for the 503s, the 413 and the guard. No network, no key, no paid call. Both scratch databases are dropped, and the shared :4400 server was not touched.

## Findings

All four are Minor. None is Blocker or Major.

**m1 (Minor): a break email can go out for a change that rolls back. If the retry finds the account healthy, the Owner has an email for a break that was never recorded.**
- Where: `account.ts:137` and `:149`. `tellOwners` calls `mail.send` inside the `$transaction` opened at `:110`. The real `MessagesMail.send` (`platform/messages/send/mail.ts:43`) commits its outbox row in its own transaction on a second pooled connection and dispatches at once. That file's own header gives `mailIn(tx)` / `sendIn` plus dispatch after commit for callers that are inside a transaction.
- Repro (harness block "email for a break that is never recorded"):
  1. ACTIVE with 2 Owners. The rail says charges are off.
  2. `evt_g1` arrives and the 2nd Owner's notify throws. Answer 500, and the status rolls back to ACTIVE.
  3. The rail says charges are back on. Stripe retries `evt_g1`.
- Actual: retry 200, outcome "no change", **1 email "Payment account disconnected" already sent to an Owner**, 0 `payment_account.broke` audit lines.
- Expected: no email unless the break commits (AG-16-16 rule 2: "at that moment").
- Retries never send a second copy, because the idempotency key holds.

**m2 (Minor): the break alert clears as soon as the Owner *starts* reconnecting, not when the account is reconnected.**
- Where: `account.ts:70-74` moves a DISCONNECTED row to PENDING on the onboarding call. `view` (`:89`) shows the alert only for `isBroken`, and PENDING is not broken.
- Repro:
  1. Deauthorize. GET shows `alert.code PAYMENT_ACCOUNT_DISCONNECTED`.
  2. `POST …/onboarding`, then abandon the hosted sign-up.
- Actual: GET answers `{"status":"PENDING",…,"alert":null}`. Card payments are still impossible, and the alert never comes back.
- Expected: AG-16-16 rule 4 and its States line ("Alert: Sent (once) → Cleared on reconnect"), and AG-16-15 (Pending is not Connected). The alert should stay until the new account reaches ACTIVE.
- The home item in `msg_notification` is never cleared at all. That is the brief's own contract gap (5) ("NotificationPort has no clear"), so it is noted here and not counted.

**m3 (Minor): one firm's burst of account events fills the shared connection pool, because the rail read runs inside the transaction while the per-firm lock is held.**
- Where: `account.ts:110-128`. Each event takes a pooled connection, then waits on `pg_advisory_xact_lock` (`:111`), then calls `rail.readAccount` (`:128`; network, up to 3×10 s on Stripe) before it commits. `onboard` does the same with `createAccount` (`:66-72`).
- Repro (harness block "pool"): 30 distinct signed `account.updated` events for firm A at once, with each rail read taking 1 s. After 300 ms, firm B's Owner sends `GET /payment-account`.
- Actual: 17 of the 30 got **500** (`P2028 Unable to start a transaction in the given time`) and 13 were handled. Firm B's unrelated GET waited **3.8 s**.
- Nothing is lost or doubled: the 500s store no receipt, and Stripe retries them.
- Expected: one firm's events do not starve other firms' requests. For example, read the account before taking the lock and connection, and apply under the lock.

**m4 (Minor, tests only): the fake rail's signature check does not behave like the processor's, although the suite says the two share one contract.**
- Where: `rail.ts:104-106`. The header is put into a Map, so only the **last** `v1` counts, and `t` is read with `Number()`.
- Repro (the harness's "signature probes"):
  - `t=<t>,v1=<valid>,v1=<junk>` → 400. Stripe's library accepts it: any matching v1 passes, which is how Stripe signs while a secret is being rolled.
  - `t=0x<hex>` and `t=<t>.0` → accepted (the HMAC still has to match).
  - A timestamp 10 minutes in the future → refused by the fake, but accepted by the Stripe adapter (`stripe-node` checks age only).
- No effect in production: a server without a key answers 503 before verifying, and the live door uses `StripeCardRail`.

## What held

- **Signature first.** All of these got 400 `SIGNATURE` with nothing stored:
  - no header, an empty header, garbage, `t` only, `v1` only
  - signed with the platform webhook's secret
  - upper-case hex, a `v0`-only header, spaced-out pairs
  - signed 301 s ago, or 10 minutes in the future
  - a valid signature over a changed body
- **Header and body edge cases.**
  - Accepted, as they should be: a timestamp 299 s old, Stripe's `generateTestHeaderString`, and 150 junk v1 values followed by the valid one.
  - A 20 KB header → 431.
  - Bodies over 1 MB and a gzip bomb (50 MB inflated) → 413. In the full app this is Problem Details `BODY_TOO_LARGE`, with the body never echoed. An unknown encoding → 400.
  - Correctly signed bodies that are not events (not JSON, an array, `null`, no `object`, a bad `evt_` id, a bad `acct_` id, a 101-character type) → 400 `NOT_AN_EVENT`, on both rails. An object body (the JSON parser ran first) → 400.
- **Raw body.** The raw body survives main.ts's parser order for every content type. With no content type the answer is 400, never 500.
- **Duplicates and order.**
  - 25 copies of one event at once → 1 receipt and 1 audit line.
  - 10 distinct break events at once → 1 email per Owner, 1 `broke` line and 1 item per Owner.
  - Charges-off while PENDING → stays PENDING, with no email, even when Stripe says payouts are on.
  - Deauthorize after Failed → DISCONNECTED with no second email.
  - An update after a disconnect does not revive the account.
  - After a reconnect, the lost account's events (update and deauthorize) match no firm.
  - The same event id under another firm's account → treated as a duplicate and does nothing.
- **Failure mid-handling.** When the audit, the rail read or the notify threw, the answer was 500 and the receipt, status, audit line and item all rolled back. The next retry handled the event exactly once, with no second email (2 Owners).
- **Mail down.** The status and both home items still change and the failure is logged by event id only, as AG-16-16's "Failure" test asks. The log line has the error class and frames, with no address and no message.
- **Deauthorize while PENDING (never connected).** This sends the break email. That is consistent with AG-16-16 rule 1 (a break is "status becomes … Disconnected") and the §B lifecycle (`Pending --> Failed`). The email's words are Sample.
- **Permissions and step-up.**
  - Case Officer and Case Manager → 403 on onboarding and on GET. A garbage bearer or no sign-in → 401.
  - The Owner with a sign-in of about 4 min 58 s → 200. At 5 min 01 s → 401 `STEP_UP_REQUIRED`.
  - A body naming firm B or an account is ignored, because the firm is the session's. An upper-case firm id is handled.
  - Only `OWNER` holds `agent/payment-rail:connect`, and there are no custom roles or role-permission writers on main.
  - A future `auth_time` passes, but it can only come from a verified token.
- **Onboarding races.** 8 concurrent onboardings across firms A and B → one account and one audit line per firm. Onboarding racing two webhooks gave no 500 and no second account.
- **Walls.**
  - Firm B's Owner sees `NOT_CONNECTED`.
  - An event for B's account that carries A's firm id, metadata or account id in its body changes only B. A deauthorize for A's account with B's account in `data.object` changes only A.
  - The GET and onboarding answers carry no account id.
- **The lookup function.**
  - Owner `xr_wall_reader`, `SECURITY DEFINER`, `search_path=pg_catalog, public, pg_temp`. EXECUTE is held only by `xr_app`, `xr_staff_bypass`, the owner and the migration role; `xr_case_lookup`, `xr_data` and PUBLIC have none.
  - `xr_app` cannot ALTER it, replace it or add an overload (no CREATE on public). A pg_temp shadow table is ignored.
  - Equality only: `acct_%`, NULL, 100 k characters and upper case each return null.
  - `rollback.sql` followed by `migration.sql` re-applies cleanly.
- **No key.**
  - The full app with no Stripe key → 503 `PAYMENT_ACCOUNT_NOT_SET_UP` on onboarding and on the door. It names the settings, never a value. GET answers `NOT_CONNECTED`.
  - With the secret key set but no connect secret → still 503 on both, and no account is made.
- **Database rules.** `money_payment_account`'s CHECKs were never hit across the whole sequence (PENDING, ACTIVE, RESTRICTED charges on and off with payouts on, DISCONNECTED, re-onboard three times). No 500 came from the database except the pool case in m3.
- **DW10.** Neither signing value nor any `sk_` or `whsec_` value appears in any answer, log line, email, `money_payment_account`, `webhook_receipt` or `audit_event` row. Outcomes read like "ACTIVE → RESTRICTED (break)".

**Verdict: Approve.** There is no open Blocker or Major at commit `786d1a32376a15ce57893b7eae42264fa09b35e5`. m1-m3 are worth a follow-up line, and m4 is test fidelity only.
