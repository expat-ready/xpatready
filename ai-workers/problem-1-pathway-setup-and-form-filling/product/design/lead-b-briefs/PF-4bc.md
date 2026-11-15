# Brief: PF-4bc, the Cognito side of PF-4b's IdentityAdminPort (map row 5) (cloud builder lane; row owner Lead B)

Drafted 16 Nov 01:2x IST by the shaping lane, for Lead B's approval (P-558). Row: BACKLOG **PF-4bc** (rev 16.20, #1816 Q4). It finishes map row 5's API: on `main` every `CognitoIdentityAdmin` method refuses with 503 `SIGN_IN_NOT_SET_UP`. **Model: Opus 5.5, effort: high** (sign-in; reviewer and breaker at high, P-605).

**Starts when:** now. PF-4b (#1816) and PF-Lc (`@aws-sdk/client-cognito-identity-provider` 3.1161.0 in `package.json`) are on `main`.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-4bc` and take **one row, PF-4bc, the Cognito side of IdentityAdminPort**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the BACKLOG row PF-4bc and `design/lead-b-rows-2026-11-14.md` (branch `lead-b-front-office`) rev 16.20;
* the requirement lines, in full, from `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-01-firm-setup-and-onboarding_v1.26_2026-10-25.md`: **AG-1-10** (an invite sends a single-use, expiring set-password invite **via Mailer**), **AG-1-70** (staff account emails are ExpatReady's and go through AG-10's single send path, so the provider's own emails are suppressed), **AG-1-41** and **AG-1-67** (sign-out everywhere; a second-step reset ends the other sessions), **AG1-D20** (4);
* on `main`: `api/src/platform/identity/session/provider.ts` (the port, `LocalIdentityAdmin`, the refusing `CognitoIdentityAdmin`), `session/service.ts` (its callers), `api/src/platform/identity/port.ts` (`identityConfig`), `cognito.ts` (PF-4's verifier: how the pool and client are read), `ports/contracts/contract.ts` and `identity-port.contract.ts` (the PF-0c pattern), `tools/check-port-contracts.mjs`;
* the module card `api/src/platform/MODULE.md`.

**First, verify at source and stop if it differs (P-170; no AWS account exists yet, C21).** Read AWS's own API reference pages for `AdminCreateUser` (`MessageAction`, `UsernameExistsException`), `AdminGetUser`, `AdminResetUserPassword` or `AdminSetUserPassword`, `AdminSetUserMFAPreference`, `AdminUserGlobalSignOut`, and the Cognito managed login token endpoint (`/oauth2/token`, `grant_type=authorization_code`). Quote each sentence you build on, with its URL and the date read, in the PR body. **The hand-off is the open point:** with the invite email suppressed, how the invitee first sets a password (a provider-hosted page, or our page calling `RespondToAuthChallenge` after `AdminSetUserPassword` with `Permanent=false`). If AWS's pages give no path that keeps the provider's own email off and leaves our `MailPort` email as the only invite (AG-1-70), **stop and ask in a PR comment headed "Question for the tech lead"** before writing the hand-off; the other methods do not wait on it.

**What to build (API only; no schema; no new package):**
1. `CognitoIdentityAdmin` implements every method with `CognitoIdentityProviderClient` in `ca-central-1`:
   * `createUser(email)`: `AdminCreateUser` with `MessageAction: "SUPPRESS"` always; on `UsernameExistsException`, `AdminGetUser` and return its `sub` (the port's "reuses the one an earlier, rolled-back accept left");
   * `twoStep(u)`: from `AdminGetUser` (`UserMFASettingList` / `PreferredMfaSetting`): `TOTP`, `PASSKEY`, or null;
   * `resetTwoStep(u)`: clears the person's second step as the verified AWS call says (AG-1-67: the caller's revocation row already ends our access tokens);
   * `signOutEverywhere(u)`: `AdminUserGlobalSignOut`;
   * `redeem(code)`: exchanges the code at the pool's token endpoint, verifies the returned ID token with `aws-jwt-verify` (already in; PF-4's `cognito.ts` verifies access tokens, so use a `tokenUse: "id"` verifier for the same pool and client), and returns `{ firmKey, email }`; a used or expired code → the port's `SIGN_IN_CODE_REFUSED` 401;
   * `handOff(firmKey, email)`: as verified above.
2. `identityConfig` gains the pool's managed-login domain (`PLATFORM_COGNITO_DOMAIN`), read through PF-24's typed loader if that is where `PLATFORM_COGNITO_*` are read on `main`; missing domain with `PLATFORM_IDENTITY=cognito` fails at start, as PF-24w's rule (fails closed).
3. **A shared contract** `ports/contracts/identity-admin-port.contract.ts` (PF-0c pattern; the port stays in `provider.ts`, so the shape is restated as `identity-port.contract.ts` does). Cases from the port file's own comments: create returns a subject; a second create of the same email returns the same subject; `redeem` is one-use and refuses after 5 minutes; `twoStep` after `resetTwoStep` is null; every refusal is a 401/503 problem with a plain `detail` and a `code`, never a raw provider message.
4. Every AWS error maps to the port's problem answer (`SIGN_IN_NOT_SET_UP` 503 when the pool is unreachable or not configured; 401 for a refused code); the AWS message, request id and any token go to no log line (PF-23's redaction test covers it).

**Done when** (P-606: list the cases in the PR body before writing code; the reviewer ticks one per line). In `tests/check_pf4bc_cognito_admin.ts`, the Cognito client stubbed with **recorded responses** (no network in CI; `aws-sdk-client-mock` is not in `package.json`, so use the SDK's own `middlewareStack` or a constructor-injected `send`, no new package):
* `PF-4bc DW1 pass/fail`: the shared contract passes on `LocalIdentityAdmin` and on `CognitoIdentityAdmin` with recorded responses; a deliberately broken stub (create without SUPPRESS) fails it (shown once, then removed).
* `PF-4bc DW2 pass/fail`: every `AdminCreateUser` request carries `MessageAction: "SUPPRESS"` (asserted on the recorded request); `UsernameExistsException` returns the existing `sub`, never a second user.
* `PF-4bc DW3 pass/fail`: `redeem` with a recorded token answer returns the firm key and email; a recorded `invalid_grant` answers 401 `SIGN_IN_CODE_REFUSED`; a second redeem of the same code is refused.
* `PF-4bc DW4 pass/fail`: `resetTwoStep` then `twoStep` → null; `signOutEverywhere` sends `AdminUserGlobalSignOut` for the person's own username only.
* `PF-4bc DW5 pass/fail`: a recorded `NotAuthorizedException`, `ResourceNotFoundException` and a network error each map to the port's problem; the response body and the captured log lines hold no AWS message, request id, token or email.
* `PF-4bc DW6 pass/fail`: `PLATFORM_IDENTITY=cognito` without the domain refuses to start with a plain line naming the setting; with it, `identityConfig` returns it.
* `PF-4bc DW7`: `node tools/check-port-contracts.mjs` passes with the new contract (both adapters call `runContract`), and `check_pf4_identity.ts`, `check_pf4b_session_reads.ts` and PF-0c's suite pass unchanged.
* **Not a merge gate:** the one live proof against the founder's pool (C21) is recorded later as NOT TESTED until it runs (P-405).

**Duplicate check:** BACKLOG (PF-4b, PF-4bc, PF-Lc, PF-8b), open PRs (none touching `provider.ts`, `cognito.ts` or `ports/contracts/` at 01:2x IST 16 Nov), `main` (the refusing `CognitoIdentityAdmin`; no `identity-admin-port.contract.ts`), BUGS (none); one `Duplicate check:` line after re-running it.

**Touch list:** `api/src/platform/identity/session/provider.ts` (the Cognito class only; the `LocalIdentityAdmin` gains only its `runContract` call in the test), `api/src/platform/identity/port.ts` (`identityConfig`'s domain line), new `ports/contracts/identity-admin-port.contract.ts`, `tests/check_pf4bc_cognito_admin.ts`, `api/src/platform/MODULE.md` (tests line). **Must still be true:** every PF-4, PF-4b, PF-0c, PF-23 and PF-24 suite.

**Contract used:** PF-4b's `IdentityAdminPort` (`provider.ts`), contracts `platform-and-front-office-contracts-2026-11-14.md` §1.2 (IdentityPort, Cognito in ca-central-1); PF-0c's contract-test rule.

**Parallel safety:**
* `provider.ts` and `port.ts` are touched by no open PR. PF-4s (our own staff's sign-in, a second pool) will add its own adapter files and must not edit `provider.ts`; if PF-4s needs a shared change there, it starts after this row merges.
* `ports/contracts/` is shared: this row only adds a new file. PF-19b's open #1860 changes `ports/mail.ts`, not `contracts/`.
* `api/src/platform/MODULE.md` is shared by every platform row (PF-21v #1848 may edit it too): change only the tests line; whichever merges second merges `main` in.

**Reviewer and breaker** (P-278: sign-in): the breaker tries a replayed code, a code for another client, an error string carrying an email, and `MessageAction` dropped on retry.

**P-610:** under 800 changed lines, tests included (estimate ~450). Split point if it would pass: part 1 contract, create, two-step, reset, sign-out, errors (DW1, DW2, DW4, DW5, DW7); part 2 `redeem`, the domain setting and the hand-off (DW3, DW6).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
