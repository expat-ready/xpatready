# FO-7c part 1: break report, round 2 (diff only)

Breaker, 22 Nov 2026. Commit `2766ef4f06b5e55c65adab61197e9fe80d286e33` on `claude/dazzling-thompson-1ndong`. Diff `786d1a323..2766ef4f0`: m1 (outbox), m2 (alert until Connected), m4 (fake header reading), the plain 503, the optional connect secret, the two route lists. m3 stays listed for part 2 and is not counted again here.

**How it was run.** The round-1 harness was extended to `/tmp/claude-0/-home-user-xpatready/81c54141-b9ea-50d9-8153-5d646637e907/scratchpad/break/attack2.ts`, with its output in `r2out3.txt`. Two small scripts sit beside it: `sig.ts` (the fake rail against stripe-node 23.1.0, same secret) and `cfg.ts` (`loadPlatformConfig`).
- What it uses: the suite's set-up and main.ts's parser order. Mail goes through the **real** outbox: `MessagesMail` over `Messages` with `ConsentStore`, the local email adapter, `LocalFiles` and `fakeJobs`. It also uses the real `PrismaNotificationPort`.
- Fault injection: `Messages` is subclassed to throw on `dispatch` or to run a failing SQL statement inside `send`. A second Owner (user-T) is granted on firm A.
- How it was started: from `prototype/` with `studio/node_modules/.bin/tsx --tsconfig studio/api/tsconfig.json`.
- Safety: scratch database `xr_studio_fo7c_break_<pid>`, dropped afterwards (0 left). :4400 was not touched. No network, no key, no paid call.
- One harness limit: `fakeJobs` runs handlers with no firm context. Under the walls, the job's `deliver` therefore skips the row, which stays QUEUED. `PlatformJobs` wraps each handler in `withFirm` (`platform-jobs.ts:69`). A direct `withFirm(A, deliver)` on a break row answered `sent`, so delivery itself works.

## Findings

All three are Minor. None is Blocker or Major.

**n1 (Minor): a second "Payment account disconnected" email goes out while the first alert is still showing.**
- Where: `account.ts:153` still decides a break with `!isBroken(prev)`. The m2 change means the alert now carries on through PENDING-after-break, but this line was not changed to match.
- Repro (harness block "re-onboarded account deauthorized while PENDING"):
  1. ACTIVE → deauthorize. The alert shows, 1 email per Owner.
  2. The Owner re-onboards. The status is PENDING and the alert still shows (correct since m2).
  3. The new account is deauthorized before it is ever connected.
- Actual: 200 and DISCONNECTED. **2 new break emails (one per Owner)** and a new `payment_account.broke` line, but 0 new home items (the item de-duplicates). GET showed the alert without a break throughout.
- Expected: one email per break, "Alert: Sent (once) → Cleared on reconnect" (AG-16-16 rules 3-4). The alert never cleared, so no second email. Email and home item should also agree. One fix is to compute "was broken" the way `view` does.
- In round 1, this same case (deauthorize while PENDING after a re-onboard) was acceptable, because the alert had cleared then. The m2 change is what made it a repeat.

**n2 (Minor, tests only): the m4 rewrite turns one class of bad signature into a 500 on the fake rail.**
- Where: `rail.ts:109` compares `v.length` (string length) with `want.length` (bytes), then calls `timingSafeEqual(Buffer.from(v), want)`. The old code compared the two Buffer lengths.
- Repro: a raw socket sends `Stripe-Signature: t=<now>,v1=` + byte `0xE9` + 63 × `0`.
- Actual: **HTTP 500** `Internal server error`. Directly, `verifyEvent` throws `RangeError: Input buffers must have the same byte length`, which `receive` re-throws.
- Expected: 400 `SIGNATURE`. That is what `StripeCardRail` answers, because its try/catch wraps stripe-node, which throws the same RangeError.
- No production effect: a server without keys answers 503 before it verifies anything.
- The fake still differs from stripe-node on headers Stripe never sends (`sig.ts`):
  - `t=<t>.0`, `t=+<t>` and `t=1,t=<t>` → fake refuses, stripe-node accepts.
  - `t=<t>,t=1` → fake accepts, stripe-node refuses.
  - A timestamp 10 minutes in the future → fake refuses, stripe-node accepts.
- The part m4 named does now match: any one of several `v1` values may pass.

**n3 (Minor): with no Stripe key or connect secret, the public door writes one warn line per unsigned request.**
- Where: `account.ts:61` logs before the 503, on every call. There is no sign-in, no signature check and no rate limit in front of it.
- Since this diff, `PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET` is optional in production, so a live server can be in this state.
- Repro (harness block "200 unsigned posts"): 200 × `receive("x", no header)` on the feature built with no key.
- Actual: 200 answers of 503 `PAYMENT_ACCOUNT_NOT_SET_UP` with plain words, and **200 `payment_account_not_set_up` log lines**, each naming the two settings.
- Expected: anyone on the internet cannot grow the log at will. For example, log once at start-up, or at most once per interval. Billing's 503 (`webhook.ts:64`) logs nothing.

## What held

- **m1, the change rolls back after the email is written** (2 Owners, the 2nd Owner's item throws): 500, ACTIVE kept, 0 outbox rows, 0 dispatches, no receipt.
  - The retry: 200, RESTRICTED, 2 QUEUED rows. `dispatch` was called only after the commit: another connection could already see both rows at dispatch time.
  - A 3rd delivery of the same event is a duplicate, with no new row and no new dispatch.
- **m1, dispatch failure:** 200 and RESTRICTED. Rows stay QUEUED and the log says "the sweep sends it", with the outbox id only. Stripe's retry is a duplicate and adds no row.
- **m1, a refused email inside the transaction** (the 1st Owner's address suppressed, `HARD_BOUNCE`):
  - The break and both home items were recorded. Rows: SUPPRESSED for that Owner, QUEUED for the other, so no poisoned transaction.
  - Logged by event id, and the address never appears in the log.
- **m1, a database error inside the outbox write** (a forced `1/0` in `Messages.send`): 500 and a clean rollback (ACTIVE, no receipt, no row). The retry records the break once with 2 rows.
  - The `try` at `account.ts:172` cannot rescue a database error, because the transaction is already aborted (25P02). Rolling back plus Stripe's retry is the safe result.
  - Nothing on this path fails every time: `normaliseAddress` and `msg_address_ok` use the same pattern, and `platform_staff_email_lower` is stricter.
- **m1, races:**
  - 10 distinct break events at once → all 200, 1 `broke` line, exactly 1 outbox row per Owner.
  - Firm B's `msg_firm` row was deleted, then 5 break events raced 15 first `MessagesMail.send` calls for B → all succeeded, no 40P01, 1 break row. `mailReady` runs before the lock.
  - Nothing else in the break path takes a row lock on `platform_firm` or `msg_firm`.
- **m2, the alert until Connected:**
  - A first-time connect gives PENDING with no alert (`afterBreak:false`).
  - A Failed (charges off) account: "connect" returns the same account and writes no line, and the alert stays.
  - Disconnected → re-onboard twice → PENDING with the alert. Only 1 new line (`afterBreak:true`); the second call writes none.
  - On the new account, payouts only → alert stays. Charges on with requirements due (RESTRICTED) → alert clears.
  - A re-onboard after a reconnect → alert again.
  - Firm B's first-time PENDING → no alert.
- **m2, the audit trail cannot be fooled:**
  - A newer planted line on firm B's trail that names A's id and says `afterBreak:false` → A unchanged.
  - Only `onboard` writes that action, once per DISCONNECTED → PENDING change, and each such change needs a webhook in between, so a tie on `at` cannot happen. An OUR_STAFF request is refused by the audit adapter (no silent skip), so an older line can never be read in its place.
  - With 200 k newer audit lines on the firm, GET takes 25-39 ms (index `audit_event(firm_id, at)`). When ACTIVE it takes 9-10 ms, with no trail read.
- **Config:**
  - Production with the connect secret unset or blank → it starts, with `connectWebhookSecret` null.
  - Set but invalid → start-up refused, naming only the setting and never the value.
  - The setting is in `SECRET_SETTING_NAMES` and `SCRUBBED_FROM_ENV`.
- **The 503 itself:** plain words with no setting name ("Card payments are not set up on this server yet. Nothing was changed.").
- **Route lists:** `HOOK` names only `client-money/card/routes.ts POST /api/hooks/stripe-connect body`. QA-53 requires the code's door set to equal `PUBLIC_DOOR_WRITES` exactly, and each door to answer 400 or 503.
- **DW10:** the signing value appears in no log line or answer of the run.

**Verdict: Approve.** There is no open Blocker or Major at `2766ef4f06b5e55c65adab61197e9fe80d286e33`. n1 and n3 deserve a follow-up line. n2 is test fidelity only.
