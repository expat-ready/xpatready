# Outside-accounts sitting, 25 Nov 2026 (P-821)

Written 25 Nov 08:3x IST by the sitting session (Opus 5.5 medium, P-788), from `origin/main`: `product/qa/CAPABILITIES.md` (the 14 rows), `product/BACKLOG.md`, `product/DECISIONS.md` (P-561, P-580, P-621, P-624, P-818), `prototype/studio/deploy/RUNBOOK-secrets.md`, `prototype/studio/deploy/cdk/lib/service.ts`, `prototype/studio/api/src/platform/config/settings.ts`.

**Purpose:** open every outside account that holds a Release 1 row below Works, so builders and qa can finish those rows. Lifts the ceiling from ~87 to 101 of 101.

**Rules for the sitting:** the founder signs in, types every password, one-time code and key, accepts every term and pastes each secret value into its destination himself. The session only navigates and points to fields. Test or sandbox mode only. Non-essential cookies declined. Anything priced stops and the founder decides. No secret value is ever written here, in a commit or in chat: only the secret's *name*.

## Where values go (found in the code)

* **No GitHub Actions secret is used** for these: `.github/workflows` reads only `GITHUB_TOKEN`; CI tests use recorded vendor replies, no network.
* **Staging reads every secret from AWS Secrets Manager, ca-central-1, named `xr/staging/<NAME>`** (`deploy/cdk/lib/service.ts` line 30-38 and 113-131; `RUNBOOK-secrets.md` §1). The CDK stack already made each secret with a placeholder value ("supplied at deploy"); the founder replaces the placeholder with the real test value (Secrets Manager → secret → Retrieve secret value → Edit). A new ECS deployment picks it up (runbook §3 step 3; the Lead's job).
* **On the Mac and in lane copies** a setting is set in the shell that starts the copy, never in a file (runbook §6).
* Non-secret ids (Cognito pool and client ids, a Google client id) are set by CDK or as plain environment values, not secrets.

## The 14 rows and the account each needs

| Row | Capability | Account it needs | Confirmed in row text? |
|---|---|---|---|
| R1.1 | Hosting, data, backups, logs in Canada | AWS: CloudShell reads committed; PF-8c deploy from CI by OpenID Connect (an IAM role, no keys) | Yes |
| R1.5 | Staff sign-in, two-step, passkeys | AWS Cognito: real-pool lines (wrong, expired, repeated codes; passkey) | Yes |
| R1.13 | Logs, metrics, alerts | Alarm email: **done, P-818** (founder's confirmation 25 Nov) | Yes |
| R1.15 | Secrets in a managed store | AWS: CloudShell reads (secret-value scan of image and log group; missing-secret start-up quote) | Yes |
| R1.22 | Suspend, cancel, failed-payment hold, exit download | **Stripe test mode** (a failed test payment puts the firm on hold; PF-5 part 2, PF-11, PF-27) | No: from PF-5/PF-11 rows |
| R1.43 | Two-way Google calendar sync | **Google OAuth test app** (Calendar), P-580; Microsoft out, P-621 | Yes |
| R1.52 | Connected mailbox; WhatsApp | **Google OAuth test app** (Gmail) + **Meta developer, WhatsApp test number** (P-580, FO-11) | Yes (Google); WhatsApp from P-580 |
| R1.54 | E-signature with evidence | **BoldSign sandbox, Canada region** (FO-6v, P-561) | Yes |
| R1.55 | Withdraw, re-issue, decline, signed offline | **BoldSign sandbox** (withdraw must cancel the vendor envelope, QA-770) | No: from QA-770 and FO-6v |
| R1.57 | Card payment into the firm's operating account | **Stripe test mode with Connect** (FO-7c) | Yes |
| R1.61 | Sign and pay by single-use link | **BoldSign sandbox** + **Stripe test mode with Connect** (FO-6 door, FO-7c) | No: from FO-6 and FO-7c |
| R1.66 | Virus scan | **AWS GuardDuty Malware Protection for S3** (P-624). **Priced** (~US$9-18/month at 50-100 firms; AWS may offer a free trial): stopped for the founder | No: from P-624 |
| R1.91 | Plans, change, cancel, invoices, card update | **Stripe test mode** (PF-5 part 2, PF-5s, PF-16) | Yes |
| R1.112 | Video meeting links | **Zoom developer app** (FO-3v); Meet via the Google OAuth app (FO-3s2) | No: from FO-3v |

## Accounts, most rows unblocked first

| # | Account | Rows it unblocks | Signup or console URL | Mode | Where the value goes (name only) | Cost | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Stripe** (test mode, Connect on in test mode) | R1.22, R1.57, R1.61, R1.91 | https://dashboard.stripe.com/register ; keys at https://dashboard.stripe.com/test/apikeys ; webhooks at https://dashboard.stripe.com/test/webhooks | Test mode only (`sk_test_…`; a live key is refused outside production, settings.ts) | `xr/staging/PLATFORM_STRIPE_SECRET_KEY`, `xr/staging/PLATFORM_STRIPE_WEBHOOK_SECRET`; **gap:** `PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET` is read by `client-money/card/stripe-rail.ts` but has no `xr/staging/` secret in CDK yet (a builder row) | US$0 in test mode | pending |
| 2 | **AWS** (existing staging account): CloudShell reads, Cognito real-pool test, OIDC role for PF-8c | R1.1, R1.5, R1.15 (and R1.66's region check) | https://console.aws.amazon.com/ (region ca-central-1); CloudShell https://ca-central-1.console.aws.amazon.com/cloudshell ; Cognito https://ca-central-1.console.aws.amazon.com/cognito/v2/idp/user-pools | Staging only | Cognito pool and client ids are plain settings set by CDK (`PLATFORM_COGNITO_USER_POOL_ID`, `PLATFORM_COGNITO_CLIENT_ID`, `PLATFORM_SYSTEM_COGNITO_*`), not secrets; CloudShell outputs committed to `aws/2026-11-22-staging-proof` (never only `~/run24/`, P-557); OIDC role ARN as a GitHub repository variable (not a secret) | US$0 for reads; staging already running | pending |
| 3 | **BoldSign sandbox**, Canada region | R1.54, R1.55, R1.61 | https://boldsign.com/esignature-api/ (sign up for the free sandbox); Canada-region app https://app-ca.boldsign.com ; API key under API → API Key | Sandbox only; P-561's four conditions checked (Canada region, vendor emails off, no vendor AI or ID check, no integrations) | `xr/staging/PLATFORM_BOLDSIGN_API_KEY` | US$0 sandbox | pending |
| 4 | **Google Cloud OAuth test app** (Calendar, Gmail, Meet) | R1.43, R1.52 (mailbox), R1.112 (Meet) | https://console.cloud.google.com/projectcreate ; consent screen https://console.cloud.google.com/auth/overview ; clients https://console.cloud.google.com/auth/clients | Consent screen in **Testing** with the founder's own address as test user (no Google review needed) | No setting exists yet (FO-3s2, PF-19mc not built). Proposed: `PLATFORM_GOOGLE_CLIENT_ID` (plain) and `xr/staging/PLATFORM_GOOGLE_CLIENT_SECRET`; the builder adds them to CDK | US$0 | pending |
| 5 | **Zoom developer app** (General app, OAuth, user-managed) | R1.112 | https://marketplace.zoom.us/develop/create | Development mode, not published | `xr/staging/PLATFORM_ZOOM_CLIENT_ID`, `xr/staging/PLATFORM_ZOOM_CLIENT_SECRET`, `xr/staging/PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN` (already in CDK) | US$0 | pending |
| 6 | **Meta developer, WhatsApp Cloud API test number** | R1.52 (WhatsApp) | https://developers.facebook.com/apps/create/ | Test number only (5 test recipients, free) | No setting yet (FO-11 not shaped past its gate). Proposed: `xr/staging/PLATFORM_WHATSAPP_TOKEN` | US$0 for the test number | pending |
| 7 | **AWS GuardDuty Malware Protection for S3** | R1.66 | https://ca-central-1.console.aws.amazon.com/guardduty/home?region=ca-central-1#/malware-protection | — | No secret (IAM role) | **Priced**: stopped; the founder decides | stopped for decision |
| — | Microsoft Entra test app (Outlook) | none in Release 1's first build | — | — | — | — | **deferred by P-621** (founder, 16 Nov: Google only for now) |
| — | Alarm email | R1.13 | — | — | SNS topic `xr-staging-on-call` | US$0 | **done, P-818** |

## Founder rule for every Lead, lane and sub-lane (founder, typed 25 Nov ~09:2x IST, in this sitting)

"Why you are not doing all of these yourself? ... You have all my approvals and computer skills. Do everything yourself in inbuilt browser. And please make this note and keep handing it over to all the leads and future leads and all the sub-lanes."

**How to apply:** every browser step for an outside account (navigate, open tabs, click, choose settings, test or sandbox modes, decline cookies, create test objects, check results) is done by the session itself in the built-in browser, in a tab of its own. The founder is asked only for what no agent may do whatever the approval: typing a password or one-time code, and copying or pasting an API key or secret value (the session opens both pages, the founder copies on one and pastes on the other). If the built-in browser's pane is hidden (the session is not open in a window), the page may not draw: ask the founder once to open the session with its Browser pane showing. Extends P-580 and the Lead's "do it yourself first" rule; the Lead records it as a DECISIONS row and in every hand-over.

## Log

(One line per account as it opens: date and IST time, account, where the value lives by name, rows unblocked.)

* **25 Nov 09:4x IST, Stripe test mode: open.** Account "Expat Ready" was already there (founder signed in). Connect forced its own sandbox, so the working sandbox is **"New business" (`acct_1UbvT1HcKzI5jQfN`, Test)**, with Connect on and business model "platform" chosen; the first sandbox (`acct_1Uc4KPQY3Fc3AOMz`) is not used. Founder pasted that sandbox's test secret key into **`xr/staging/PLATFORM_STRIPE_SECRET_KEY`** (Secrets Manager ca-central-1; new version seen on its Versions tab; value not seen by the session; the loader refuses a malformed or live key at the next deploy, which checks it). Unblocks **R1.22, R1.57, R1.61, R1.91**. **Still to do (builder rows):** the two webhook endpoints need staging's address and the app's webhook routes, so `PLATFORM_STRIPE_WEBHOOK_SECRET` and `PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET` (the latter has no `xr/staging/` secret in CDK yet) are set when PF-5 part 2 / FO-7c register them; the session makes the endpoint, the founder pastes the `whsec_` value. Cost US$0.
* **25 Nov 09:5x IST, AWS: already open** (staging runs; founder signed in to the console in the built-in browser today). No new account: the R1.1, R1.5, R1.15 reads (CloudShell outputs committed, OIDC role for PF-8c, Cognito real-pool lines) are qa/builder work in that signed-in console, the session doing the clicks, the founder typing codes only.
* **25 Nov 09:5x IST, BoldSign sandbox: already open since 16 Nov** (`design/outside-dependencies.md` row 2). Seen today in app-ca.boldsign.com (Canada region): one Sandbox key "expatready-staging", created 16 Nov; `xr/staging/PLATFORM_BOLDSIGN_API_KEY` in Secrets Manager ca-central-1 has a second version (AWSCURRENT) over the placeholder (value not read). The register names the secret `expatready/staging/…`; the live name is `xr/staging/…` (register to correct). Unblocks **R1.54, R1.55, R1.61** (FO-6v still held by P-561's founder confirmation). Sandbox limit 50 requests an hour; live API needs BoldSign's Enterprise API plan (priced, before launch).
* **25 Nov 10:3x IST, Google OAuth test app: open.** New Google Cloud project **expatready-staging** (id `expatready-staging-515804`, under the account's organisation, no billing, US$0), made by the session with the founder's OK; Google Auth Platform: app name "Expat Ready (staging)", audience **External, publishing status Testing**, one test user (the founder's address), Google API services user data policy accepted on the founder's OK. **Calendar API and Gmail API enabled.** OAuth **Web application** client `expatready-staging-web`, Client ID (public) `944392513043-74l9f3bhl99tkiv4e3nt24tf3qfomfj1.apps.googleusercontent.com` (goes in a plain setting, proposed `PLATFORM_GOOGLE_CLIENT_ID`); redirect URI so far `http://localhost:4400/api/front-office/me/calendar/callback` (builders add staging's and PF-19mc's callbacks). Client secret in **`xr/staging/PLATFORM_GOOGLE_CLIENT_SECRET`** (new secret, Secrets Manager ca-central-1, KMS `xr-staging-data`, made by the session; the founder pasted the value from Google's copy button; checked by format only, never displayed). **Gap for a builder:** this secret is not in CDK's `SERVICE_SECRETS` yet (import it by name). Two earlier secrets were not used: the first was never stored; the second (ending `wz8M`) was printed in the session's tool log, so it is **disabled** in Google (delete it after a week). Scopes are not yet listed on the Data access page: FO-3s2 / PF-19mc add the least scopes. Verification (P-628, 4-6 weeks, decision 31 Dec) is not filed. Unblocks **R1.43, R1.52 (mailbox), R1.112 (Meet)**.
* **25 Nov 10:4x IST, Zoom developer app: open.** In the founder's Zoom account (signed in by him), Zoom's API License and Terms accepted on his OK; **General app "Expat Ready staging", user-managed OAuth, Development (Draft, unpublished)**, app id `epOF6wwPSt6QnVjDXKLxGw`; the only app in that account. Client ID (public) `IWyBMCdGSWGb2aw2dZEhtw` typed by the session into **`xr/staging/PLATFORM_ZOOM_CLIENT_ID`**; client secret into **`xr/staging/PLATFORM_ZOOM_CLIENT_SECRET`** and webhook secret token into **`xr/staging/PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN`** (Zoom's copy buttons clicked by the session, pasted by the founder). These three replaced 21 Nov stand-in values that let staging start. **Still for FO-3v's builder:** OAuth redirect URL, scopes (meeting write), event subscription; Zoom's app review only before publishing. Unblocks **R1.112**.

## Key check, 25 Nov 10:4x IST (CloudShell, ca-central-1; values read from Secrets Manager into the command, never printed; US$0)

| Key (`xr/staging/…`) | Test | Result |
|---|---|---|
| `PLATFORM_STRIPE_SECRET_KEY` | test prefix; `GET /v1/balance` | **pass**: test-mode prefix, `livemode=False` |
| `PLATFORM_BOLDSIGN_API_KEY` | `GET api-ca.boldsign.com/v1/document/list` | **failed first (401)**: the name held a 40-character stand-in from 21 Nov; the 16 Nov sandbox key was under the old name `expatready/staging/PLATFORM_BOLDSIGN_API_KEY` (200). The session copied it across inside AWS (`put-secret-value`, never printed); re-test **pass (200)**. The old name can be deleted once a builder confirms nothing reads it |
| `PLATFORM_GOOGLE_CLIENT_SECRET` + client id | token swap with a fake code | **pass**: `invalid_grant` (client id and secret accepted) |
| `PLATFORM_ZOOM_CLIENT_ID` + `_SECRET` | token swap with a fake code | **pass**: `invalid_grant` "Invalid authorization code" |
| `PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN` | format | **pass**: 22 characters, allowed set (proven fully by the first signed webhook) |

**Lesson for every lane:** the other `xr/staging/` provider secrets hold stand-ins made so staging starts; a value "having a second version" does not mean it is real. Test each by a free read call before claiming a row's account is ready.
