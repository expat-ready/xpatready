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

## Log

(One line per account as it opens: date and IST time, account, where the value lives by name, rows unblocked.)
