# FO-7c part 1: break report, round 3 (diff only)

Breaker, 22 Nov 2026. Commit tested: `0c16c91dd07deabdcfc7cd0242c29f94953ace63` on `claude/dazzling-thompson-1ndong`. Diff: `2766ef4f0..0c16c91dd -- '*.ts'`, 4 files: `alertOn` (round-2 n1), Stripe's own `verifyHeader` on both rails (n2), and the not-set-up warning logged once (n3). The branch head is now `0644dc6db`, which only adds the reviewer's record, so the code is the same.

**How it was run.**
- Harness: `/tmp/claude-0/-home-user-xpatready/81c54141-b9ea-50d9-8153-5d646637e907/scratchpad/break/attack3.ts`, output in `r3out3.txt`. It uses round 2's set-up: the real outbox (`MessagesMail` over `Messages`), the real `PrismaNotificationPort` and the walls interceptor. Firm A has 2 Owners, so one break = 2 emails.
- Also run: `sig.ts` (the fake against stripe-node 23.1.0) and `now.ts` (the fake's clock option).
- Started from `prototype/` with `studio/node_modules/.bin/tsx --tsconfig studio/api/tsconfig.json`.
- Safety: scratch database `xr_studio_fo7c_break_<pid>`, dropped afterwards (0 left). :4400 was not touched. No network, no key, no paid call. No repository file was edited apart from this report.

## Findings

One finding, Minor. Nothing is Blocker or Major.

**r3-1 (Minor, tests only): the fake rail's `now` option no longer applies when it checks a header, but still applies when it signs one.**
- Where: `rail.ts:105` calls `verifyHeader(rawBody, signature, signing)` with no `receivedAt`, so the age is measured against the real clock. `rail.ts:113` (`sign`) still uses `opts.now`.
- Repro (`now.ts`): build `fakeCardRail({ webhookSecret: "s", now: () => 10 minutes ago })`, then call `verifyEvent(body, rail.sign(body))`. The fake **refuses its own header** (RailSignatureError).
- Effect today: none. No caller passes `now` (`client-money-card.ts:29` and both rails in `check_fo7c_card_payments.ts` leave it out). But a later test that sets a clock to check the 300-second window would get a misleading answer.
- Expected, either way: pass `receivedAt: now().getTime()` to `verifyHeader`, or remove the option.

**Outside this diff, not counted (for the part-2 list):** `onboard` answers **500** when the processor has already dropped the account but its webhook has not arrived yet.
- Why: the row is still ACTIVE or PENDING, so `onboard` returns that account, and `accountLink` throws `RailAccountGone`, which nothing catches (`account.ts:77`, `:89`).
- When it happened: in 2 of 3 runs of "deauthorize + 3 onboards at once". The stack trace is in `r3out1.txt` and `r3out2.txt`.
- This code did not change in this diff. The same window exists with real Stripe: `stripe-rail.ts` maps `account_invalid` to `RailAccountGone`.

## What held

**n1: one rule for the alert and for a new break.** Every new break got 1 `broke` line and 2 emails; every repeat of the same break got 0. The alert showed whenever expected.
- **n1 reproduction** (ACTIVE → deauthorize → re-onboard → deauthorize the new account while PENDING): 200 and DISCONNECTED, with the alert shown throughout.
  - It now writes `status_changed` instead of `broke`: 0 emails and 0 home items. Round 2 saw 2 emails here.
- **A reconnect completes, then another break:** PENDING-after-break → ACTIVE clears the alert. Then a deauthorize is a **new** break (+1 line, +2 emails).
  - The same holds when reconnecting to RESTRICTED with charges on, followed by charges off (Failed).
- **Failed, then re-onboard:**
  - Failed + "connect" → same account, no line, no email.
  - Failed → deauthorize → same break, 0 emails.
  - Re-onboard → PENDING with the alert. ACTIVE → charges off → new break (+2 emails).
  - Charges back on → cleared. Charges off again → a new break.
- **Two firms:** with A PENDING-after-break, firm B's first-time PENDING account deauthorized → a break for B (+1 email: the round-1 rule is unchanged).
  - B re-onboard → ACTIVE → deauthorize → a new break for B.
  - A's pending account deauthorized → 0 emails for A. A's row and alert were never affected by B.
  - The firm id comes from a uuid column (always lower case), so the lock key and the trail key match between `onboard` and the webhook.
- **An audit line written by something else:** the only writer of `payment_account.onboarding_started` is `account.ts:82`; grep finds no other in `api/`, `ports/` or `prisma/`.
  - A planted newer line saying `afterBreak:false` on A's own trail does make the next PENDING deauthorize send emails. So the rule trusts that one writer.
  - `audit_event` is insert-only, and `at` is the database's own time (`DEFAULT CURRENT_TIMESTAMP`), so there is no clock skew between app servers.
  - Two lines tying on `at` cannot happen: each line needs a DISCONNECTED → PENDING change, with a webhook between any two.
- **Events racing an onboarding:**
  - ACTIVE, with the deauthorize event and 3 onboards at once, 4 rounds: exactly 1 `broke` line and 2 emails per round. The end state is PENDING with the alert.
  - PENDING-after-break, with the deauthorize event and 3 onboards at once, 4 rounds: 0 emails every round. The end state is PENDING or DISCONNECTED, both with the alert.
  - 10 distinct deauthorize events at once from ACTIVE: 1 break and 2 emails.
  - No 40P01 and no deadlock in any run.
- **The extra read inside the transaction:**
  - It runs only when the next state is a break (`isBroken(next) && …`, short-circuit), and only does a query when the previous state is PENDING. It is a plain SELECT taken after the per-firm advisory lock, so it adds no new lock and no new lock order.
  - With 300 k newer audit lines on the firm, the whole deauthorize took 49-105 ms; EXPLAIN ANALYZE shows 23-26 ms for the trail read.
  - 10 non-break events at once took 87 ms in total.

**n2: Stripe's own check on both rails.**
- `sig.ts`: the fake and stripe-node now agree on all 9 headers from round 2. The suite's own header-table test also passes.
- `attack3.ts` tried 29 headers on the fake and on `StripeCardRail` with the same secret: **0 differences.** The headers were:
  - missing, empty, garbage, `t` only, `v1` only;
  - several `v1` values, `t` as `t.0`, `+t`, hex, or given twice;
  - 10 minutes in the future; ages of 290 s and 310 s;
  - upper-case hex; 63- or 65-character `v1`; non-ASCII; byte `0xE9`;
  - a leading space; joined duplicate headers; `v0`; 150 junk `v1` values; `=x`; `V1`.
- Over HTTP, every answer was 200 or 400. **No 500 in the run.**
  - Round 2's n2 repro (a raw socket sending byte `0xE9`) now answers **400 SIGNATURE**.
  - Two `Stripe-Signature` lines on the wire are joined by Node and read like Stripe's library reads them.
- Signed bodies that are not events:
  - Non-JSON, BOM + JSON or a truncated body → **400 NOT_AN_EVENT** (SyntaxError).
  - `null`, `[]`, `42`, `"evt"`, `object:"charge"`, a bad account id, 100 k nested arrays or 50 k nested objects → 400 NOT_AN_EVENT (ZodError). `JSON.parse` did not overflow the stack.
  - A signed empty body → 400 SIGNATURE (stripe-node refuses an empty payload).
  - No account, or duplicate keys → 200, ignored or handled as JSON reads them; the signature covers the bytes.
- The signing value appears in no log line or answer.

**n3: the warning once.** 200 unsigned posts plus 5 onboarding attempts on the server with no key → 200 + 5 answers of 503, and **1** `payment_account_not_set_up` line.
- The flag lives on the instance: a second `PaymentAccounts` built by hand logs one more line. In the app the feature provider is a Nest singleton (`client-money-card.ts:25`), so it is once per process.
- The 503 words still name no setting.

**Verdict: Approve.** No open Blocker or Major at `0c16c91dd07deabdcfc7cd0242c29f94953ace63`. r3-1 is test fidelity only. The onboarding 500 is outside this diff and is noted for part 2.
