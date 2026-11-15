# PF-5 part 1 — review (API only: money row, public door, schema)

Reviewer (Opus, did not build it), 15 Nov 2026. Commit `1cd85d6c7d16a774ab0a099e3b4368d95f0b0eef`, branch `claude/upbeat-ptolemy-wfwnl1`, PR #1815, against `origin/main` (12 files, +976). Read: brief `lead-b-briefs/PF-5.md`, BACKLOG row PF-5 (l. 266) + rev 13 note, `screens/PF-5/step0.md` (split, Lead B's rulings), contracts §7 §1.1, the diff, and the untracked `screens/PF-5/break-report.md` (breaker, same commit). I re-checked each breaker finding I adopt against the code. Ran: `tests/check_pf5_signup_billing.ts` **42 passed, 0 failed**; isolated copy `rev5` on :4561, curl journeys (journey report: `journey-test-reviewer-2026-11-15.md`), stopped after.
Result: changes requested (screen-review scale: Ship after fixes). 4 Major, 11 Minor, no Blocker. Journey score 7/10 (below the pass mark).

## What holds (checked)
* **Password:** goes only to `identity.register`; no column (test + `information_schema`), no audit line, no email, no log (zod messages carry no values; the 500 filter logs the error only, and Prisma's `data` has no password). Pending rows on the copy: no password text.
* **Same body and status** (202 `check-email`) for new, known, live-pending, honeypot and too-fast. Field errors come before the branch, so they are the same on every path. Timing is not the same (Major 4).
* **Honeypot, fill time, rate limit:** silent 202 with nothing stored; 429 after 10 tries in 10 min on the copy; same pattern as the merged booking door.
* **One pending + one email:** advisory lock per email + partial unique index `WHERE used_at IS NULL`; expired unused rows deleted first; mixed-case email normalised (copy: one row).
* **Verify:** POST only (GET → 404 on the copy); token 256-bit, kept as a sha256 hash, sent in the `#fragment`; `updateMany … usedAt: null` makes one firm (concurrent test); used, expired or unknown → the same 404.
* **One transaction:** firm `PROVISIONING`, Owner + `OWNER` grant, acceptance rows (kind, version, time, who), `TRIAL` subscription, each with its `AuditPort` line; `module_event` `EVENT.FIRM_CREATED` written last (m8). A forced audit failure rolls back everything and the link stays unused (test).
* **Checkout params** (`stripe.ts:42-49`): `mode=subscription`, `payment_method_collection=if_required`, `trial_settings.end_behavior.missing_payment_method=pause`, `trial_period_days` from the plan, `automatic_tax.enabled`, `billing_address_collection=required`, `customer_update[address]=auto` (Lead B, fact 3), idempotency keys on both creates. Contract run on the fake and on recorded answers through the library's fetch client (no network).
* **Migration:** additive only (3 tables, 2 enums, checks, triggers, seed); stamp `20261115090000` later than main's newest `20261115013000_fo13…`, unique; checked right after its own migration (rev 16.7); functions `platform_*`; insert-only and no-truncate triggers on both terms tables; `migrate diff` empty for its tables. Demo reset never deletes firms or staff (`identity/demo-reset.ts`), so the RESTRICT keys break nothing.
* **Imports:** none from `engine/` or case-side files. Event names come from `ports/events.ts`. `ports/billing.ts` imports only zod and `./audit.ts`. Rev 13: no Customer Portal in part 1 (part 2), so there is nothing to check yet.

## Issues (each: file:line, the scenario that fails, the fix)
**Major 1 — the running ports skip PF-24's config and PF-4's environment guard.** `api/src/platform/firms/runtime-ports.ts:14-19`; `signup-identity.ts:4` says "never in test or production" but nothing enforces it. The feature mounts in every environment. Scenario A: `PLATFORM_ENVIRONMENT=test`, `PLATFORM_IDENTITY=cognito`. `POST /api/public/signup` answers 202, the password goes to the in-memory `LocalSignUp`, the code "email" sits in memory, and the person never gets a message. Scenario B: production with `sk_live_…`. The regex `/^(sk|rk)_test_/` picks `fakeBilling()`, so every trial silently ends "Sign in to finish". The brief's key route is "read through PF-24's `Secret`"; this reads `process.env` directly. Fix: build the ports from `platformConfig().stripe.secretKey` and `identityConfig()`. Use the fake and `LocalSignUp` only when `environment=local` and `PLATFORM_IDENTITY=local`; otherwise the door answers 503 `SIGN_UP_NOT_SET_UP`, like PF-4's `SIGN_IN_NOT_SET_UP`. Add a pass and a fail test for `runtimeSignUpPorts`.

**Major 2 — the account can be taken before its owner signs up** (breaker M2, confirmed). `signup.ts:119-120` (`if (live) return;`). Scenario: an attacker signs up `owner@victim` with a password they chose. The victim signs up next with their own password and gets 202 and no new email. The only email in their inbox is the attacker's, and it looks like the one they expected. They confirm it, `verify` makes a firm whose provider identity has the attacker's password, and the attacker signs in and enrols TOTP. Even without an attacker, a person who mistyped their password cannot start again for 24 h. The row's Done-when ("one pending sign-up and one email") is met as written, so this needs a **ruling from Lead B**. Fix inside the row: `verify` also takes the password and checks it with the provider (a sign-in) before the firm is made. Fix that changes the row: a new sign-up replaces the live one.

**Major 3 — a real sign-up is dropped silently after a restart, on a second instance, or when the form was open over 2 h** (breaker M3, confirmed). `signup.ts:65` (`formKey ?? randomBytes(32)`), `:109`, `:196-201`. Scenario: GET plans, a merge redeploys the demo, then POST. The stamp's HMAC fails, the answer is 202 "we have sent a message", and no row and no email exist. Fix: the key comes from config (PF-24) and is the same on every instance. A stale or foreign stamp gets a visible 400 "Reload the page and send again"; only the honeypot and a too-fast fill stay silent. (The booking door has the same pattern; out of scope here.)

**Major 4 — response time shows whether an email is known** (breaker M1; contracts §7 §1.1 "answers the same whether or not an email is already known"). `signup.ts:110-128`: a known email does one mail send; a new email does a locked transaction plus `identity.register`. The breaker measured a 3.0 ms vs 10.6 ms median with no overlap, and part 2's Cognito call widens the gap. Fix: send the known-path email through `JobPort` (this also fixes Minor 6's 500), and give every non-error answer the same minimum time.

**Minor 1** — `ports/billing.ts:40` promises "the same firm always gets the same customer". `stripe.ts:35` relies on an idempotency key, which Stripe keeps for about 24 h only, and the same key with other parameters (part 2's address) is an `idempotency_error`. Scenario: Checkout fails after the customer is made, the firm retries 2 days later, and Stripe makes a second customer. Fix: reuse `platform_subscription.stripe_customer_id` (or search by `metadata.firm_id`) before creating; correct the port comment.
**Minor 2** — the pending table's rules can be bypassed by direct SQL (`migration.sql:57,96,122`; breaker m6, NULL case confirmed by psql). (a) `terms_version_ids = NULL` passes the check and the trigger (`cardinality(NULL)` is NULL), and verify would then record no acceptance. (b) A `created_at` far in the future moves the 24 h ceiling. (c) `used_at` can be any time. (d) No truncate trigger. Fix: `coalesce(cardinality(…),0) >= 1`, compare `created_at` with `now()`, and add a truncate rule or a written note.
**Minor 3** — field errors lose their field name. `signup.ts:98`: zod's messages contain ":", so the path is never added. Scenario: `{}` → "Invalid input: expected string, received undefined". Fix: always prefix `path.join(".")` unless the message starts with it.
**Minor 4** — the pending row and its purge have no audit line (`signup.ts:115-127,175-177`), because `AuditPort` needs a `firmId` (`ports/audit.ts:31`). Contracts §0 says every changing transaction is audited. Fix: write the exception into `step0.md`, or record the sign-up's time on the `firm.created` line.
**Minor 5** — the chosen billing period is kept only in the pending row (purged after 24 h) and in audit detail. Scenario: Stripe is down at verify, and part 2's "finish starting your trial" cannot know whether the person picked YEARLY. Fix: keep it on the firm or the subscription through PF-5's slot, or rule that part 2 asks again.
**Minor 6** — every sign-up for a known address sends "You already have an account" again, with no cap per email (`signup.ts:111-112`). A mail failure on that path is a 500 while a new email gets 202, which leaks again (breaker m3, m4). Fix: one such email per address per window, sent through `JobPort`.
**Minor 7** — `signup.ts:168`: `platformSubscription.update({ where: { id } })` does not go through `firmScope` (PF-3 rule). Fix: `updateMany({ where: firmScope(firm.id, { id: subId }) })`.
**Minor 8** — a plan switched off between sign-up and verify still gets a trial (`signup.ts:140`, no `active` check; breaker m7).
**Minor 9** — `identity.register` sends the code inside the DB transaction, before the insert (`signup.ts:122`). If the insert fails, the link answers 404; with Cognito, an unconfirmed user is left behind and blocks the next sign-up. Part 2's interface needs a replace or resend (breaker m9).
**Minor 10** — test gaps: `registerJobs` (the hourly sweep through JobPort, Lead B's ruling) is never exercised; signUp's advisory lock has no concurrent test (without the lock, a race gives P2002 → 409, a different answer). The test also points at the Mac's `psql` path, which is the suite's convention.
**Minor 11** — a password of 12 spaces is accepted (`signup.ts:48`), and no try cap on wrong codes per token (`signup-identity.ts:37-41`; low impact given the 256-bit token). Breaker m5, m8.

## Size (976 > ~800, RULES l. 81, P-610)
Acceptable as is. The 976 lines are 41 of records (`step0.md`), 224 of test and about 711 of schema and code, so the reviewed code is under the limit. Splitting further would separate `BillingPort` from its only caller and its schema baton. If a split is required: (a) `ports/billing.ts` + contract + `stripe.ts` + their checks (~250); (b) schema + sign-up + the rest.

## D1-D20 (API item; one line each)
D1 3: part 1's Done-when lines met; Major 2 is a row gap · D2 3: one pending, one firm under a race; Minor 2 SQL bypasses · D3 4: one port, one adapter, PF-3 tables reused · D4 N/A · D5 2: restart drops sign-ups (Major 3); Stripe down → PROVISIONING (handled) · D6 4: terms versions insert-only, Sample labelled · D7 N/A (no AI) · D8 N/A · D9 3: "check your email" clear; "Sign in to finish" waits on part 2 · D10 4: plain problem texts · D11 2: a silent 202 when nothing was sent (Major 3) · D12-D14 N/A (no screen) · D15 5: 5-55 ms on the copy, no per-row calls (prices fetched once per id) · D16 4: 42 pass/fail checks; Minor 10 gaps · D17, D20 simulated only (no intended user walked it; the running app cannot reach verify, see the journey report) · D18 4: prices only from Stripe, never invented; "+ applicable taxes" · D19 2: in the running app the code exists only in memory, so sign-up → trial cannot be finished there (part 2 brings Cognito; stated in `runtime-ports.ts`).

## BIC-01-BIC-20 (EXPERIENCE §6)
N/A: a platform API item with no case-side screen (§6 scope).

## Could not check
Stripe's real answers for `automatic_tax` on an account without Stripe Tax set up (it may refuse to create the session; the Mac check by Lead B with test keys); the `firm.created` consumers (PF-25 web address) on a `PROVISIONING` self-serve firm; `graph.mjs` was not run because it rewrites `qa/GRAPH.md`, outside this review's write list; no browser or screen reader (API only).

Round 1 outcome: changes requested (superseded by Round 2 below).

## Round 2 — diff only, `1cd85d6c7..373f50ec1fe89e45d9990c0c13c8e30c55ff1ea5` (15 Nov 2026)
Read only the diff (9 files; three of them are this review, the journey report and the breaker's report, committed unchanged). `tests/check_pf5_signup_billing.ts` at the new head: **53 passed, 0 failed** (Prisma client regenerated for the new `outcome` column).

| Finding | Status at 373f50ec1 | Evidence |
|---|---|---|
| Major 1, the running ports | **Fixed** | `runtime-ports.ts:20-29` builds from `platformConfig()` (the key is a `Secret`, `reveal()` only here) and `identityConfig()`. The fake runs only on a local server. Identity not local, or no key outside local, sets `notReady`, and `signup.ts:101` answers 503 `SIGNUP_NOT_SET_UP` on both doors. Pass and fail test: the test environment with Cognito gives 503 and stores nothing; local gives `notReady === null`. |
| Major 2, account taken before sign-up / lock-out | **Mitigated; the rest goes to part 2** | `signup.ts:132-139`: the newest sign-up ends the live one (`outcome REPLACED`, its link 404s, tested). Still one live row. The email names the firm and says "if you did not ask for this, ignore" (`signup-identity.ts:33`). The builder's reading of "one email" is flagged to the tech lead in the PR. Checking the password at verify needs the Cognito adapter; it is a **must for part 2**. |
| Major 3, silent loss | **Fixed** | `signup.ts:117-119`: a foreign, malformed or over-2-hours stamp gives a visible 400 `RELOAD`. Only the honeypot and a too-fast fill stay silent. Test covers both the stale and the foreign stamp. |
| Major 4, timing / m4 | **Fixed** | `signup.ts:121-124`: the work that depends on the email runs after the answer (`later`), so a mail failure no longer changes the answer (tested). |
| Minor 1, Stripe customer | Fixed | `signup.ts:200-206` reuses the stored `stripe_customer_id`; the update goes through `firmScope` (also Minor 7). |
| Minor 2, SQL bypasses | Fixed | `migration.sql`: terms NOT NULL, `created_at` not in the future, `used_at` set to the database's now, outcome check, TRUNCATE refused; all tested. |
| Minor 3 (field names), 6 (flood), 8 (inactive plan), 9 (register in the transaction), 10 (job + race tests), 11 (spaces, code tries) | Fixed | `signup.ts:109`, `:128` + `:241-247`, `:170-171`, `:136`, test lines for `PURGE_JOB` via `fakeJobs` and 3 concurrent sign-ups; `:52`, `:165-170`. |
| Minor 4 (audit of the pending row and purge), Minor 5 (period if Stripe is down) | Deferred to part 2, written in the PR | Accepted: `AuditPort` needs a firm, and the period is in the `platform.subscription.created` audit detail. |

**Left open (none blocks this commit):**
* **m-r2a (Minor):** the per-email cap runs before the replace (`signup.ts:128`). An attacker can send 3 sign-ups for `victim@` an hour, so the victim's 4th sends nothing while the attacker's row stays live. That is a lock-out of at most 1 h, repeatable, and every email the victim receives names the attacker's firm and says to ignore it. Part 2's password check at verify closes it. Until then, consider letting a sign-up whose firm name differs replace without counting toward the cap, or alert on a hit cap.
* **m-r2b (Minor):** a failure in the background step is only `console.warn` (`signup.ts:153`). If the provider is down, the person sees "check your email" and nothing comes. That is acceptable for the same-answer rule, but part 2 should give it a PF-23 alert or metric.
* **Note:** the 503 body carries `reason` with internal wording ("PF-5 part 2: Cognito") on a public route. It is harmless; plain words could replace it.
* **Note:** the Mac demo copy with `PLATFORM_IDENTITY` unset now answers 503 on sign-up. That is honest, and it replaces the earlier dead end.

Size after round 2: about 1,230 lines in all, but the extra lines are records (+130) and tests (+90), and the code grew by about 90 lines. My round 1 view on size stands.
Journey score unchanged at 7/10 (not re-walked; this round reviewed the diff only). Feedback (J9) and recovery would now score 1 each, which would make it 8/10 if re-walked.

Round 2 outcome: approve 373f50ec1 (superseded by Round 3 below).

## Round 3 — diff only, `a38262de8..fcfd5524bb6b9349d265fc5afdaab1df27ae14eb` (15 Nov 2026)
`373f50ec1..a38262de8` changes only this review (records). `a38262de8..fcfd5524b` changes one file: `api/src/platform/firms/signup.ts` (+4 −6). The local `at()` helper is removed, and the four `AuditPort.record` calls in verify's transaction (`signup.ts:179-186`) now name their entity literally. That is what CI shard 8's `check_case_feed.ts` sweep needs.

I compared each call with the old helper line by line. For all four calls (`firm.created`/`platform_firm`, `platform.staff.owner_created`/`platform_staff`, `platform.terms.accepted`/`platform_terms_acceptance`, `platform.subscription.created`/`platform_subscription`), the firmId, actor, action, entity, entityKey, summary and detail are the same. They stay in the same order inside the same transaction, and the `module_event` row is still last. No behaviour change.

Re-run at `fcfd5524b`: `tests/check_pf5_signup_billing.ts` **53 passed, 0 failed**; `tests/check_case_feed.ts` **39/39 passed**. Round 2's open Minors (m-r2a, m-r2b) and notes are unchanged and still do not block.

Round 3 outcome: approve fcfd5524b (superseded by Round 4 below).

## Round 4 — diff only, `4701000279..9d2e0d7c835040f963f69c933124df71b941e466` (15 Nov 2026)
`fcfd5524b..4701000279` changes only this review (records). `4701000279..9d2e0d7c8` changes two files:
* **`api/src/platform/firms/routes.ts:23`:** `@OpenRead("…") @Get("plans") plans()` now sits on one line, with no parentheses in the text, so QA-53's scanner (`check_forms_qa53.ts:33,36`) sees the open mark. Same decorators, same route, same handler: no behaviour change. GET `/api/public/plans` was already open at run time through `ConfigReadGuard`; only the static sweep missed it.
* **`tests/check_forms_qa53.ts`** (a shared test outside PF-5's touch list; the builder names it in the PR):
  * `"/api/public/plans": "open"` is added to `REVIEWED`.
  * `PUBLIC_DOOR_WRITES` is added for the two sign-up POSTs.

**Does the test edit weaken QA-53 or QA-65? No.**
* **QA-53:** it still compares the marked open reads with `REVIEWED` by exact equality (l. 91-94), so one more reviewed entry exempts only that path. A new open read anywhere still fails until it is reviewed.
* **QA-65:** the new exemption is an exact list of two paths, checked against the code: the doors found must equal the list (`JSON.stringify` of sorted arrays), so a third public write fails. The branch sits after `OWN_GUARD_WRITES` and before the platform and unnamed branches. Any other write that names nobody still lands in `unnamed`, and `unnamed.length === 0` is unchanged. Each listed door is asked over HTTP with no person and an empty body, and must answer 400 or 503 and never 2xx.

**One Minor (does not block): the door check will go red when sign-up opens.** At `check_forms_qa53.ts:197-199` the check accepts only `400|503`. On a copy where sign-up is set up (part 2, or a run with `PLATFORM_IDENTITY=local`), POST `/api/public/signup/verify` with `{}` answers **404**: an invalid body gets the same not-found as a bad link (`signup.ts`, `VerifyBody` parse fails → `notFound()`). So this check turns red as soon as the door opens, while the door behaves as designed. Fix, in part 2 or now: accept `400|404|503` for verify, or ask each door for its own expected status. Today's CI copy is shut (503), so the check passes; it does not yet exercise the 400 path, which `check_pf5_signup_billing.ts` covers.

Re-run at `9d2e0d7c8`: `tests/check_pf5_signup_billing.ts` **53 passed, 0 failed**. I did not re-run `check_forms_qa53.ts` myself, because it needs an isolated copy; the builder reports 41/41 on one. Round 2's open Minors (m-r2a, m-r2b) are unchanged and still do not block.

Verdict: Approve 9d2e0d7c835040f963f69c933124df71b941e466
