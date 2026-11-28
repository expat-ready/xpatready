Reviewer: Changes 5abc7c410dae6ebcb397200d2103eefc6b0df25f

# J-57 review: PR #3692 (`tests/journeys/j_57.ts`, R1.57 part 0), fresh reviewer, 25 Nov

**Verdict: Ship after fixes.** This PR adds a test file and nothing else. I measured it against `screens/FO-7c/shape-r1.57.md` (W1-W9, parts 0-5), CAPABILITIES R1.57's done-when, `j_56.ts`, walks.yml/walk.mjs, part 2a (#3633 head 5ea245dd) and the FO-7s money concepts. Its scaffolding is sound. The header line is one walk.mjs can parse (`isolated.sh j57 4457 start --ttl 30 PLATFORM_IDENTITY=local &&`). It refuses :4400, takes its name and port from argv, uses `recorder()`, and exits through `summary()`. It writes only to its own database `xr_studio_<name>` and to `product/screens/J-57/screenshots/`. It costs US$0, makes no model call, uses only Sample data, and is marked "Unconfirmed: no counsel". Stripe is reached only when `J57_STRIPE_ACCOUNT` holds an `acct_…` id, and then only through the browser (the server refuses a live key outside production, `settings.ts:153`). Without that id it makes no network call: the public read, `card/pay.ts` `read()`, reads only the database.

**Runs** (copy `j57r` on :4435, started from the checkout at #3633's head, with this PR's file; no Stripe key anywhere in the environment):
* Without `J57_STRIPE_ACCOUNT`: **8/22**, exit 1. Part 2a's steps pass: W2, W2 fail, W3 door, W7, W8, W1 403. Every other step fails.
* With `J57_STRIPE_ACCOUNT=acct_FAKEnotreal000` (fake id, no key, no Stripe call possible): **9/22**, and **W1 passes**. See M1. This is the 9/22 the PR body reports "on #3633's head".

## Blockers
None.

## Majors
* **M1. W1 can pass with nothing proved when the account id is set** (`j_57.ts:89`, `:95`, `:128-129`). The setup writes `money_payment_account` itself: `status 'ACTIVE', charges_enabled true`. `PaymentAccounts.view()` (`card/account.ts:96-99`) only reads that row back. So "the firm's test connected account reads Active" checks the journey's own SQL, not Stripe. I reproduced it with a fake `acct_` id: W1 PASS with no Stripe at all. That is scaffolding standing in for the capability (P-33). The step can never fail, which breaks "no step can pass vacuously". **Fix:** either seed the row as `PENDING` with the id and let the status arrive from Stripe (part 2b/5's account event or poll, or part 5's `GET /v1/accounts/:id` read), or relabel W1's API and screen steps as "seeded (not proof)" and leave the proof to W4/W5.
* **M2. W1's screen step can never pass as the concept is written** (`j_57.ts:126`, `:129`).
  * It opens `/settings/payments`, but the concept's page is `/money/settings/getting-paid` (`fo-7s-money/concept-settings.md:5`).
  * It needs `/active/i` in the status text, but the concept's ACTIVE words are "Clients can pay invoices by card. Money goes to your own Stripe account." and it says "Codes never show" (`concept-settings.md:19-27`).
  * So once FO-7s2 part 1 merges, W1 still fails under a label that blames a part that has merged. **Fix:** use the concept's path and its words, e.g. `/can pay invoices by card/`.
* **M3. W9 depends on a part R1.57's chain does not contain, and its label does not name it** (`j_57.ts:184-187`).
  * Money › Payments (`/money/payments`) is built by FO-7s3a part 1 (`concept-payments.md:3,17`). It is not on main (`web/src/modules/client-money/routes.tsx` has only invoices) and it is not among the shape's parts 1-5.
  * Its "Received into" column shows only while the trust answer is Yes (`concept-payments.md:8,17`). The Sample firm's `trust_answer` defaults to `UNANSWERED`, so `/operating/i` cannot match even when the page exists.
  * **Fix:** name FO-7s3a part 1 in W9's label. Either make the answer Yes in setup (Sample) or read "operating" from the payment detail. Put the dependency in the PR or in a `challenge.md` so the shape's part 5 ("j_57 exits 0") is not blocked without anyone noticing.
* **M4. Failing labels do not always name the missing part.** `T5` (`:41`) is the only label on several steps, and it becomes empty once `J57_STRIPE_ACCOUNT` is set.
  * Without part 2a (main today), **W8** (`:110`) fails with no part named. Its `other.status === 404` also passes when the route is missing.
  * **W3 card offered** (`:106`) names only part 5, though it also needs part 2a.
  * When the id is set, these labels name nothing: **W3 card offered** (`:106`, which failed so in my second run), **W4** (`:149`, needs FO-7s2 part 2's button and part 2a's session), **W5 never trust / one receipt** (`:155`, part 2b), **W5 Paid** (`:160`, part 2b), **W6 declined** (`:171`, FO-7s2 part 2) and **W9** (`:187`).
  * **Fix:** give each step its own part text that does not depend on the `T5` suffix.
* **M5. Two fail cases the shape names are missing, and the header claims one of them** (`j_57.ts:10` vs `:101-102`; shape W2 and W8).
  * W2: "a trust request gives none". The trust request route is on main (`POST /api/front-office/money/trust/requests`), and part 2a answers a trust request's id with the single 404. No step tries it. This is the "never trust" wall of the done-when (P-567 (3)); the step tests a part amount instead.
  * W8: "an unknown **or settled** link → the same not-found". Only the unknown link is tried. After W5, or after a staff payment through FO-7b's route that is already on main, `GET /public/pay/<token>` must give `LINK_NOT_WORKING`.
  * **Fix:** add both checks. The deposit invoice can stay out (no deposit on main, FO-7w1), but say so in the header.

## Minors
* m1 `:105` The label says "creates nothing", but nothing is checked. Compare the counts of `audit_event`, `money_payment` and sessions before and after the GET.
* m2 `:135` The comment says "a phone first (375 px)", but only 1440 px is used. Either drop the claim or add a 375 px context for the pay page (the concept treats 375 px as first-class).
* m3 `:155-156` "no trust entry for the client" is an absolute count across the whole firm. A future seed would break it. Compare before and after, scoped to `PA`.
* m4 `:149` W4 does not show test mode. Assert that the hosted URL carries `cs_test_` (as the shape's part 5 follow-up asks: `livemode: false`).
* m5 `:152-157` W5 proves "operating", but not "the firm's own account". The payment's processor reference should resolve through `money_firm_of_stripe_account` to firm A's `acct_`.
* m6 `:173-176` W6 checks the reason through the public API answer (`lastFailure`, a field no part defines yet) and the audit row. The shape says "the pay page and the invoice show the reason". Add the screen checks, or name the field as part 2b's contract.
* m7 `:153`, `:172` The 90 s wait cannot catch an hourly poll. Part 5 (shape Q5c) has to trigger the poll; a note in the header would help.
* m8 `:129`, `:186` The hooks `data-card-payments`, `data-card-payments-status` and `data-payment-row` are in no concept. Record them for the screens lane, or use role and text locators.
* m9 `:115`, `:142`, `:70` W7 and W3 do not check by screen (no offline-details block, no lines summary). Firm A's operating details are seeded, but no step reads them.

## Screen dimensions (D1-D20, BIC-01-20) and graph
N/A: this PR has no screen. The journey's screens are FO-7s2 parts 1-2 and FO-7s3a part 1, each with its own review. I did not run `graph.mjs`, because it rewrites a tracked file (`qa/GRAPH.md`) and this check writes only review files.

## Journey score (reviewer, the one score for this check): 7.5/10
Report: `screens/J-57/journey-test-reviewer-2026-11-25.md`.

## Not checked
* No Stripe test-mode run (as instructed): W4-W6 on Stripe's page were read, not run.
* No run on pure main. Labels on main were reasoned from main's tree, which has no `card/pay.ts`.
* The main checkout's untracked `product/screens/J-57/screenshots/` (4 files from 05:44) was there before me and I left it untouched. My own screenshots went to the worktree's folder and were removed.

**Verdict: Block** (not approved; Ship after fixes): fix M1-M5.
