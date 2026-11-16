---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/platform/**"
---
# Module card: api-platform (P-615)
Firms, staff and sign-in, settings, secrets, jobs, logs, complaints and message consent. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `firm-scope.ts` the one firm filter; `identity/` tokens, staff and the guard (Cognito or local); `settings.ts` and `config/` typed firm settings and app configuration; `secret-box/` AES-256-GCM secrets; `jobs/` the one job runner (pg-boss); `observability/` the one logger, redaction, metrics, alerts; `web-address/` each firm's web address; `complaints/`; `messages/consent/` the consent store; `audit/`; `firms/` self-serve sign-up to a no-card trial (PF-5); `billing/` BillingPort's Stripe adapter (`ports/billing.ts` holds the port and its fake).
**Owner area.** platform module rows PF-* (Unconfirmed: no lane map in code).
**Entry points.** `/api/platform/complaints` (PF-21w; PF-21v adds `GET handlers`); `/api/platform`: `GET me`, `POST session/local`, `POST staff/invitations`, `PATCH staff/:id/roles`, `POST staff/:id/deactivate`, `PUT staff/:id/credential`; PF-4b: `GET staff`, `GET staff/:id`, `GET licences`, `GET|PUT me/account`, `GET settings/two-step`, `POST session/callback`, `POST session/sign-out`, `POST staff/:id/sign-out-everywhere`, `POST staff/:id/reset-two-step`, `/api/public/invitations/:token` (+ `/accept`), `requireStepUp` (401), `MAIL_PORT`, `IDENTITY_ADMIN_PORT`; PF-19b: `MESSAGE_PORT`, `MESSAGES_MAIL` (MailPort over MessagePort: booking mail), `GET /api/demo/platform-inbox` (demo only, with attachments); `firmScope(firmId)`, `PlatformJobs` (`jobs.handle`), `CONSENT_PORT`, the guard of `/api/platform/*` and `/api/front-office/*`; `/api/public` (PF-5, open doors): `GET plans`, `POST signup`, `POST signup/verify`.

**Invariants (set by).**
- Every read and write of a platform or front-office table goes through `firmScope(firmId)`; another firm's row is "not found" (PF-3, contracts §0.2; P-559).
- Sized for about 100 firms in one process (P-562).
- Two-step sign-in is required for every staff member (P-567).
- The audit trail is append-only; demo reset deletes only demo lines, never a platform line (P-571 (1)).
- Personal data never reaches a system log: redaction at the logger (PF-23, NFR5-14).
- A job's key is its pg-boss id: one key never queues a second job (PF-14).
- The consent store is the only writer of the `msg_` tables, inside the caller's transaction (PF-19a, P-584).
- Values for experts to set are labelled Sample, never guessed (P-170).
- A sign-up's password goes to the identity provider only: never in a table, log, audit line or answer; the sign-up door answers the same whether or not an email is known (PF-5, P-566).
- Firms' billing goes through BillingPort only; CI and lanes use its fake or recorded Stripe answers, never a live call (PF-5, contracts §0.3).

**Tables.** platformFirm, platformStaff, platformStaffCredential, platformRoleGrant, platformSessionRevocation, platformFirmSetting, platformFirmWebAddress, platComplaint, platComplaintEvent, msgConsent, msgConsentWording, platformTermsVersion, platformTermsAcceptance, platformSignupPending, moduleEvent, auditEvent.
**Tests.** `tests/check_pf3_platform_schema.ts`, `tests/check_pf4_identity.ts`, `tests/check_pf4b_session_reads.ts`, `tests/check_pf14_jobs.ts`, `tests/check_pf21_complaints.ts`, `tests/check_pf21w_routes.ts`, `tests/check_pf21v_views.ts`, `tests/check_pf23_observability.ts`, `tests/check_pf24_secrets.ts`, `tests/check_pf25_web_address.ts`, `tests/check_pf5_signup_billing.ts`, `tests/check_pf5v_signup_mail.ts` (PF-5v: the empty fields' plain words), `tests/check_pf19b_sending.ts`, `tests/check_pf19b_mail.ts`.

**Do not.**
- Query a firm table without `firmScope`.
- Log a name, email or other personal value; log record ids.
- Start a second job runner or logger.
- Add a package outside STANDARDS §1's gate.
