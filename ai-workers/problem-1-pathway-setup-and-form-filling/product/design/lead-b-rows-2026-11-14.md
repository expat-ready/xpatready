# Lead B rows — platform (PF) and front office (FO), ready two ahead (13-14 Nov 2026)

Shaped by Lead B for Lead 37 to copy into `BACKLOG.md` (P-558: Lead 37 keeps the shared records). Contracts these rows build: `platform-and-front-office-contracts-2026-11-14.md` (sections cited as §). Paths are under `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/` unless they start with `product/`.

**Rev 3.1 (14 Nov):** Lead 37's ruling folded: one audit trail (`audit_event` + `AuditPort`, AUD-1, Lead 37; no audit table here), timeline owned by front office as a read view, typed firm settings home in PF-3; audit line added to every PF/FO API row's Done when. **Rev 5.1 (14 Nov):** FO-4 may lift Atomic CRM presentational pieces (tech gate `tech-gate-atomic-crm-2026-11-14.md`); P-563 (BoldSign confirmed) releases FO-6v from the FO-5r hold. **Revision 3 (14 Nov, ~00:xx IST):** every PF/FO row traced to the team's requirements (AG-01, -02, -04, -05, -06, -13, -16, -18; SA-02, -03, -04, -06, -07, -11) and the regulator's Code; register `lead-b-requirements-trace-2026-11-14.md`; contracts draft 4 §7; FO-1 split into FO-1a and FO-1b; new FO-2b (Corporate) and FO-4b (embed), both by the founder's 22:3x answer; PF-3, PF-4, PF-5, FO-2, FO-3, FO-4 rewritten. **Revision 2 (13 Nov late):** FO-1, FO-2 and FO-4 rewritten to follow the team's requirement AG-02 (neutral lead, Engage makes a prospect, a person opens the case); contracts draft 3. **Duplicate check, all rows (13 Nov 22:2x IST):** `BACKLOG.md` on `main` and on Lead 37's branch `lead/2026-11-07-lead31`: no row on Stripe, Cognito, BoldSign, docxtemplater, enquiry, leads, prospects, pipeline, booking, retainer, subscription or a container; `main`'s code: no `stripe`, `cognito`, `boldsign`, `docxtemplater`, `enquiry`, `subscription` (the "stripe" hits are CSS stripes); "booking"/"retainer" appear only in old test fixtures' words; `Firm` exists only as Sample data (`samples/firms.json`, `engine/runtime/team.ts`, `api/src/firms.ts`), which these rows do not edit; open PRs (15, read 22:2x): none on these areas; BUGS: none. Each builder repeats the check before building (P-526).

**Brief rules for every row (paste into each brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357); one row, one session, one PR, fresh branch from `origin/main`; new files only, outside the touch list nothing (a needed edit elsewhere → "Question for the tech lead" on the PR, to Lead B); Opus reviewer (P-303); breaker only where the row says (money, schema, permissions, new screens); re-review reads only the diff (P-277); label after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); live AI off, US$0, never a priced button (P-175); outside services only through their `fake` adapter in CI, never a real key in a lane; push after every step (P-557); report to Lead B (branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md` names the current session) for these rows, the current Lead (`tools/current-lead.sh`) for the merge queue; every token earns its outcome (P-556).

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-1 | screens (seam, no new screen) | **Modules add their own pages without editing `App.tsx`:** a new `web/src/modules.tsx` gathers `web/src/modules/*/routes.tsx` (Vite `import.meta.glob`, eager) into one `<Routes>` block that `App.tsx` renders ahead of its catch-all; `web/src/modules/README.md` says how (like `api/src/features/README.md`); a fixture module under `web/src/modules/_example/` (not shipped in the build) proves it. **Touch:** new `web/src/modules.tsx`, `web/src/modules/README.md`, `web/src/modules/_example/routes.tsx`, `tests/check_pf1_module_routes.ts`; **one line** in `web/src/App.tsx` (Lead 37's OK) | the fixture's page opens at its path in a browser check with no `App.tsx` change beyond the one line; two modules claiming one path, or a module path equal to an existing route (`/sign-in`, `/cases/*`, `/link`, `/inbox`), stops `vite build` with both names (pass and fail tests); every existing route still opens as before (browser check of `/`, `/sign-in`, `/cases`) | contracts §0.1, §5.1 · **waits on:** Lead 37's OK for the `App.tsx` line · decisions: none · reviewer only (no breaker) · **start now** |
| PF-2 | records (research, read-only) | **Technology gate for the platform and front-office tools (STANDARDS §1):** one file, `product/design/tech-gate-platform-front-office-2026-11-14.md`, one entry each for: Stripe's Node library; the Cognito token checker (`aws-jwt-verify` vs `jose`); BoldSign (REST by `fetch` vs its SDK; **Canadian data residency confirmed at the vendor's own source** — documents, signatures and evidence stored only in Canada — as the condition the team's RFP line 243 sets for a swappable signing adapter; if not confirmed, the same entry for a Canadian-hosted alternative); `docxtemplater` + `pizzip` (core only, no paid modules); the date picker / calendar view for booking; the time-zone library; the `.ics` invite writer (library vs our own ~100 lines); the infrastructure-as-code tool for the Canadian cloud; the container base image. **Touch:** that file only | each entry has: the problem it solves (from the contracts), at least two options, the pick, integration and upkeep cost, licence **read at its source** (URL, date, licence name), where data goes and in which country, the exact version and its publish date (at least 14 days old), and when to reconsider; Lead B reads and approves it in the PR | contracts §0.3, §5.4; STANDARDS §1; P-553 (3) · **waits on:** nothing · decisions: none (licences: Unconfirmed: no counsel) · Sonnet lane (read-only research, P-556); reviewer only · **start now** |
| PF-3 | schema (platform) | **Platform tables (contracts §1.1, §1.2, §0, §7):** `platform_firm` (operating and legal name, immutable `country_code` (trigger), owner contact, business address, billing email, unique contact email, status `PROVISIONING | TRIAL | ACTIVE | PAYMENT_HOLD | SECURITY_LOCK | ABANDONED | DELETED`), `platform_setting_definition` + `platform_firm_setting` (typed settings home: registered key, schema, default; first keys time zone, language, currency CAD, business hours, closed days, everyone-sees-all, two-step switch), `platform_plan` (Sample Solo, Team, Firm; seats limit; `trial_days` 14), `platform_subscription` (status `TRIAL | ACTIVE | OVERDUE | PAYMENT_HOLD | ENDED`, Stripe ids, period end; no seat copy), `platform_signup_link` (single use, 14 days, one email and country), `platform_staff` (+ `actor_id`), `platform_staff_credential` (one per person: representative type, licensing body, number), `platform_role_grant` (roles `OWNER | ADMIN | CASE_MANAGER | CASE_OFFICER | BILLING_FINANCE | READ_ONLY`), `platform_role_permission` (seeded keys), `platform_invitation` (72 h), `platform_session_revocation`, `webhook_receipt`, `module_event`; `api/src/platform/firm-scope.ts`; `api/src/platform/settings.ts` (register, read with default, write audited); `api/src/platform/seed-sample-firms.ts` (Sample firms keep keys `sample-firm`, `sample-solo`; users keep `actor_id` `user-R`, `user-O`, `user-T`, `user-S`; `user-R` and `user-S` get a Case Manager grant and a licence record, P-559 (4), Lead 37 13 Nov). **Touch:** new `platform.prisma` in the schema folder, one new migration folder, the three new `.ts` files (firm-scope, settings, seed), `tests/check_pf3_platform_schema.ts` | the migration applies to an empty and to a demo-data copy, `migrate diff` empty after; tested with a pass and a fail each: `country_code` cannot change; one licence record per person; a contact email belongs to one firm; one open invitation per firm and email; `webhook_receipt` unique by service and event id; `module_event` refuses update and delete; a setting value that fails its registered schema is refused, an unset key reads its default, and a setting change writes one audit line in its transaction; every table but `platform_plan`, `platform_role_permission` and `platform_setting_definition` has `firm_id` first in an index; `firmScope(A)` never returns a firm B row; the seed run twice changes nothing; after the seed every `Case.firm_key` matches a `platform_firm.key` and every Sample user has one `platform_staff` row with its `actor_id` | contracts §1.1, §1.2, §7; SA-2-1, -4, -9, -24, -25; SA-3-41, -46; SA-4-11; SA-6-27, -31; AG-1-17, -30; AG-16-3, -24, -59 · **waits on:** DB-SPLIT · decisions: founder questions 2 and 3 do not change the tables (link table built either way; switch default is data) · **breaker: yes (schema)** |
| PF-4 | runtime (permissions, API only) | **Staff sign-in, roles and permission keys behind `IdentityPort` (contracts §1.2, §7):** a Nest guard for `/api/platform/*` and `/api/front-office/*` reads a bearer token from the `local` stand-in (only when `PLATFORM_IDENTITY=local`) or Cognito (verified by PF-2's pick), loads the person, grants and keys, refuses a deactivated person or a revoked session at once, and checks the route's declared **permission keys** (default deny; firm routes accept only `agent/*` keys); `GET /api/platform/me` (keys and duties derived from keys); `POST /api/platform/session/local`; invitations (create, list, resend, revoke, accept; 72 h; seat check); `PATCH /api/platform/staff/:id/roles`; `POST /api/platform/staff/:id/deactivate|reactivate` (reason); `PUT /api/platform/staff/:id/credential`; the firm switch "Require two-step sign-in for all staff" enforced at sign-in; one session at a time; every change calls `AuditPort.record(tx, …)` (Lead 37's AUD-1; until it merges, the existing `audit_event` columns). **Touch:** new `api/src/platform/identity/*.ts`, `api/src/features/platform-identity.ts`, `tests/check_pf4_identity.ts`; the library line in `package.json` + lockfile (after PF-2) | tested with a pass and a fail each: Cognito path with a test key set (wrong issuer, audience, expired, ID token for access token, unknown subject → 401); a deactivated person's next request → 401 at once; a second sign-in revokes the first session ("You signed in on another device"); a route with no declared keys stops the start-up with its name; a firm route given a `system/*` key → refused; nobody changes their own roles; an Admin cannot give a role holding a key it lacks; only an Owner gives or removes Owner, with a reason and an identity check under 5 minutes; removing or deactivating the only active Owner → 403 with the fixed message and an audit entry; an invitation over the seat limit → 409 `PLAN_LIMIT_REACHED`, a revoked one frees the seat; a licence number never appears in a log line, event payload or email (scanned in the test); with the firm switch on, a sign-in without the second step is refused; firm A's Owner acting on firm B's staff → 404; `user-R` maps to a Case Manager with a licence and its duties include `represent`; the simulated-person header and every existing case suite behave as before; every change writes one audit line in its transaction through `AuditPort` (pass: the line is there; fail: a forced audit failure rolls the change back) | contracts §1.2, §7; SA-6-14, -18, -29, -44; AG-1-12, -13, -15, -19, -22, -30, -31, -40, -42, -55, -66; AG-16-24 · **waits on:** PF-3, PF-2 · decisions: question 3 **decided by Lead B under P-566 (3)**: two-step required for every staff member of every firm (contracts §7 §1.2: OWASP, NIST SP 800-63B-4); the switch is fixed on · **breaker: yes (permissions)** |
| PF-5 | runtime (money, API only) | **Firm sign-up and subscription behind `BillingPort` (contracts §1.1, §7):** **self-serve sign-up, the industry-standard SaaS flow (P-566):** `POST /api/public/signup` (work email, password (to `IdentityPort` only, never stored or logged), firm name, country `CA`, plan and period (default Sample Team, monthly), terms accepted; an email that already has an account gets "You already have an account. Sign in." and the page answers the same; honeypot, minimum fill time, rate limit; the same answer whether or not the email is known) registers the Owner through `IdentityPort` with the identity provider's own email verification (Cognito user-pool sign-up; its email goes through the custom email sender to `MailPort`, PF-4b; the local stand-in mirrors it), recording acceptance of the current terms of service, privacy notice and data-processing terms (kind, version, time, who; A46 row 100); `POST /api/public/signup/verify` creates the firm in `PROVISIONING` and its Owner, then starts the trial through Stripe Checkout with no card (`payment_method_collection=if_required`, trial-end behaviour set; A46 row 90); plan changes, cancel, invoices and card update through Stripe's Customer Portal, our own invoices' tax through Stripe Tax (A46 rows 91, 21); the public pricing page reads Stripe's prices through `GET /api/public/plans` (no Stripe pricing table: it cannot put sign-up before Checkout); `GET /api/platform/billing` (plan, status, trial or period end, seats used of the limit, card on file, cancel at period end, deletion date; Owner, Admin) and `GET /api/platform/billing/invoices` (our invoices with hosted links; Owner, Admin, Billing / Finance; SA-4-54, -67); the business address is asked in the billing step before any card or payment and saved by `PUT /api/platform/billing/address` (Owner or Admin; works on hold; same `platform_firm` columns; updates the Stripe customer through `BillingPort`), shown and edited also on `PUT /api/platform/firm/profile`; the email verification confirms only by a POST from our page (a GET of the link changes nothing); a card added to a paused (held) subscription resumes it through `BillingPort`, the hold ending on the paid invoice; the invited sign-up carries a plan and period; the trial reminders switch wording when a card is on file and Stripe's own trial reminder is off; prices are shown "+ applicable taxes"; the data download is reported only once PF-11 exists, and **no real firm goes live before PF-11** (beside the tax gate); trial reminders at 7, 3 and 1 days and a trial-ended notice by `MailPort` (SA-4-30, -79, -82); a trial ending with no card → Stripe's pause, mapped to Payment hold, and the 90-day deletion clock starts (SA-4-79); step 0: confirm at Stripe's docs the no-card trial set-up and Stripe Tax's GST, HST and QST coverage, pages and dates in the PR; `GET|PUT /api/platform/firm/profile` (the tenant profile: firm record fields; legal fields Owner-only, AG-1-65) and the plan choice; the invited sign-up stays for our staff and sales-led firms (`POST /api/platform/signup-links`; `GET|POST /api/public/signup/:token`); **plans, pricing, billing and the tenant profile use the proven components picked in stream 4 (2)'s A46 map through STANDARDS §1 (for example a hosted checkout, billing portal and pricing table), nothing invented where a component exists**; firm `PROVISIONING → TRIAL` (no card) `→ ACTIVE`; `GET /api/public/plans`; `POST /api/platform/billing/checkout|portal` (Owner; Admin may update the card and pay an overdue bill); `POST /api/hooks/stripe` (signature first, stored once, handlers converge out of order); subscription statuses and moves as §7; payment hold = billing and data download only, 402 elsewhere, in the guard; day-0, 7, 12 notices by `MailPort`; cancel → hold at period end → closed after 90 days (live data leaves only after its export is in the write-once archive and the firm's download was offered all 90 days with notices on days 0, 30, 60, 85; contracts §7 §1.1 "Firm exit"); the tax go-live gate; events `firm.created`, `firm.activated`, `firm.subscription_changed` (old, new, reason), `firm.payment_hold`, `firm.ended`. **Touch:** new `api/src/platform/billing/*.ts`, `api/src/platform/firms/*.ts`, `api/src/features/platform-firms.ts`, `tests/check_pf5_signup_billing.ts`; Stripe library already added by PF-L; `platform_terms_version` and `platform_terms_acceptance` added to `prisma/schema/platform.prisma` with one migration folder (holds the schema baton) | tested with a pass and a fail each: a sign-up without accepting the current terms versions → refused at the field, and an acceptance row records kind, version, time and who; a trial starts with no card on Stripe's test mode (A46's weak point: tested, not assumed); an unverified sign-up creates no firm; a verification link used twice or expired → 404; a second sign-up for the same email while a link is live → one pending sign-up and one email; the honeypot or a too-fast fill → answered like any other, nothing stored; an unused invited link signs up once, a used or expired one → 404; double submit and a replayed checkout event → one firm and one Owner invitation; an unsigned webhook → 400, nothing stored; the same event twice → handled once; paid-before-created arrives in either order and ends Active; a trial ending with no card → hold that day; paid within grace → Active with the billing date unchanged; hold ends only on a paid invoice and starts a new period; a held firm's staff get 402 on a case route and 200 on billing and export; day-0/7/12 notices sent once each (clock injected); a refused move (e.g. `DELETED → ACTIVE`); no paying invoice while tax is not configured; each change and its event in one transaction; every change writes one audit line in its transaction through `AuditPort` (pass: the line is there; fail: a forced audit failure rolls the change back) | contracts §1.1, §7; SA-2-4, -6, -7, -21, -22, -24; SA-3-19, -46; SA-4-4, -8, -11, -20, -21, -22, -25, -26, -27, -35, -52, -79 · **waits on:** PF-4; A46's component picks (STANDARDS §1) · decisions: **P-566** (self-serve SaaS flow, invited link kept); D-1 Sample prices; the founder's Stripe test keys only for the Mac check · **breaker: yes (money)** |
| PF-7 | runtime (walking skeleton, CI) | **The app builds into one container and proves itself on every relevant change:** `Dockerfile` (Node 24.21.0 base pinned by digest, non-root, web built by Vite and served with the API, the builder's choice recorded), `.dockerignore`, `deploy/compose.test.yml` (app + PostgreSQL), `tools/skeleton-smoke.sh` (health, first page, and `GET /api/platform/me` with the local stand-in once PF-4 is on `main`), `.github/workflows/skeleton.yml` running only when the app's code, `Dockerfile` or `deploy/` change. **Touch:** those new files only | from a clean clone in CI: the image builds, compose starts it, migrations apply, `/api/health` and the first page answer 200, the smoke script passes and fails on a broken health check (seeded fail); the workflow does not run on a records-only PR (shown on this PR's own records commit); `docker history` and the image's environment hold no secret; the container runs as a non-root user | contracts §1.3, §5.5; B190 (CI minutes: path filter) · **waits on:** Lead 37's diff read of the workflow (P-423) · decisions: the cloud deploy waits on the founder's Canadian cloud account (P-558 (5)) and is row PF-8 · reviewer only · **start now** |
| FO-1a | schema (front office: sales) | **Sales tables (contracts §2.1, §7; AG-02):** `fo_person`, `fo_arrival_receipt` (unique by intake key: form + submission id, or `booking:<id>`), `fo_lead` (no stage, type or value; BR-22), `fo_lead_attribution` (write-once, trigger), `fo_company`, `fo_company_contact` (roles `PRIMARY | SIGNATORY | HR | BILLING | OTHER`), `fo_prospect` (subject person or company, one primary contact, type `INDIVIDUAL | CORPORATE`), `fo_stage` (two pipelines, AG-02's eight keys each), `fo_reason`, `fo_call`, `fo_note` (`visibility`, add-only), `fo_stage_move` (cause), `fo_consent`, `fo_consent_wording` (versioned, hashed), `fo_web_form`, `fo_service` (the firm's "Interested in" list); per-firm `L-`/`P-` numbers; a subscriber seeding each new firm's two pipelines, Sample reasons, one web form (off) and the services list from released combinations' names. **Touch:** new `front-office-sales.prisma`, one migration folder, one line of `prototype/studio/DEVELOPING.md` (the stale one-migration rule, per P-559 (3); Lead 38 ruling), new `api/src/front-office/firm-seed.ts`, `tests/check_fo1a_sales_schema.ts` | migration on empty and demo-data copies, `migrate diff` empty; tested with a pass and a fail each: a lead has no stage/type/value column; a prospect's stage belongs to its own firm and its type's pipeline (composite key); a Corporate prospect needs a company and a primary contact linked to it; a repeat enquiry makes a second lead for the same person; the same intake key twice → one receipt; attribution and consent wording refuse update and delete; `L-`/`P-` numbers never repeat under 20 parallel inserts; every table has `firm_id` first in an index; a new firm gets 16 stages, reasons, one form and its services once | contracts §2.1, §7; AG-2-52, -77, -84, -8a, BR-22; AG-13-21; SA-11-29; AG-16-76 · **waits on:** DB-SPLIT, PF-3 · decisions: none · **breaker: yes (schema)** |
| FO-1b | schema (front office: booking) | **Booking tables (contracts §2.2, §7; AG-04), in their own area file so FO-1b can run beside FO-1a (P-559 (2)):** `fo_consultation_type` (slug, purpose `FREE_CONSULT`, modes, hosts, minutes, gap before/after (Sample 0/10), shortest notice 4 h, window 60 days, self-service limit 4 h, slot interval, meeting link), `fo_availability` (per person, zone; seeded from firm hours), `fo_time_off`, `fo_booking` (status `SCHEDULED | RESCHEDULED | CANCELLED | COMPLETED | NO_SHOW`, `sequence`, visitor zone, person and prospect ids) with an exclusion constraint (`btree_gist`) over each host's active bookings (`SCHEDULED`, `RESCHEDULED`) on the range padded by the gaps, `fo_booking_token` (hash, expiry, voided). **Touch:** new `front-office-booking.prisma`, one migration folder, `tests/check_fo1b_booking_schema.ts` | migration on empty and demo-data copies; tested with a pass and a fail each: overlap refused for `SCHEDULED` and for `RESCHEDULED` rows, allowed once `CANCELLED` and for two hosts; a booking ending 09:55 blocks a 10:00 start when the gap after is 10 min; slugs unique in the firm; several live tokens per booking; times `timestamptz`; `firm_id` first in every index | contracts §2.2, §7; AG-4-1, -4, -9, -26, -36, -62, BR-3 · **waits on:** DB-SPLIT, PF-3 · decisions: none · **breaker: yes (schema)** |
| FO-2 | runtime (API only) | **Leads and Individual prospects API (contracts §2.1, §7; AG-02 thin):** `GET /api/public/forms/:token` (open read: wording, options, a fresh `submissionId` and load stamp) and `POST /api/public/forms/:token/submissions` (form token, allowed site, honeypot, minimum fill time, rate limit, size limits; arrival path writes receipt, person, lead, attribution, consent in one transaction); "Add a lead" by hand (checks for a known person first; the adder owns it, no "Call now"); Unassigned leads (visible to people who may see all or assign), Take it, Assign to; close and Reopen a lead with a reason; Engage (Individual); move with a cause (no move into a WON stage by a person); Mark lost with a reason and a Lost filter; Convert to client and Undo convert while the client is empty; log a call (seven outcomes, start time, `Fix number` for an unparsable phone) and add a note; the lead, prospect and client activity timeline as a read view over `audit_event`, `module_event` and the activity rows (front office owns it; Lead 37 ruling); web-form settings (on/off, allowed sites, consent wording version, thank-you text) and reasons (Owner, Admin); events `lead.created`, `lead.taken`, `lead.closed`, `lead.reopened`, `lead.engaged`, `prospect.stage_moved`, `prospect.lost`, `prospect.won` (`CONVERTED`), `prospect.unconverted`; every change through `AuditPort`. **Touch:** new `api/src/front-office/sales/*.ts`, `api/src/features/front-office-sales.ts`, `tests/check_fo2_leads_prospects.ts` | tested with a pass and a fail each: the honeypot or a too-fast fill → answered like any other, nothing stored; the same `submissionId` twice → one lead; the sixth post a minute from one address → 429; a form that is off → "This form is not available"; a page outside the allowed sites → refused (and the served page carries `frame-ancestors`); the answer never says whether the person is known; a repeat enquiry → a new lead flagged as a possible match, never linked, and the match line names no one the viewer may not see; Take it on an owned lead → 409 with the owner's name; the first logged call sets the first response once; no call moves a stage; Engage makes one prospect in Engaged; a person's move into Won → refused; Lost without a reason → refused at the field; Convert twice → 409; Undo convert once the client has a case → refused; a Read-only person cannot write; firm A's staff reading firm B's lead → 404; attribution present on a form lead, empty on a hand-added one; every change writes one audit line in its transaction through `AuditPort` (pass: the line is there; fail: a forced audit failure rolls the change back) | contracts §2.1, §2.6, §7; AG-2-4, -5, -8a, -13c, -26, -37a, -44, -47, -49, -75, -80, -84, -94; AG-13-30 · **waits on:** FO-1a, PF-4 · decisions: none · **breaker: yes (public door, permissions)** |
| FO-2b | runtime (API only) | **Corporate prospects (founder 22:3x; AG-02):** Engage as Corporate (company name required, company match by normalised name, pick or create; the enquirer linked as `PRIMARY`; the Corporate pipeline's Engaged stage); add, change and end contacts with roles; Change type until signed (keeps number, owner, history); `prospect.won` with `subject: COMPANY`, the company and its contacts. **Touch:** new `api/src/front-office/sales/corporate/*.ts`, `api/src/features/front-office-corporate.ts`, `tests/check_fo2b_corporate.ts` | tested with a pass and a fail each: Corporate Engage without a company name → refused at the field; a near-identical company name is offered as a match and nothing links by itself; the enquirer becomes `PRIMARY` and stays labelled Lead; one person may hold two roles at one company; Change type after a signature → refused; the Corporate board lists only Corporate prospects and the Individual board only Individual; the won payload carries the company and its contacts; every change writes one audit line in its transaction through `AuditPort` (pass: the line is there; fail: a forced audit failure rolls the change back) | contracts §2.1, §2.6, §7; AG-2-52, -53, -75, -76, -77, -79 · **waits on:** FO-2 · decisions: none · **breaker: no (no new door; reviewer only)** |
| FO-3 | runtime (API only) | **Booking API (contracts §2.2, §7; AG-04):** public `GET /api/public/firms/:firmKey/book/:slug/slots` and `POST …/bookings` (first name, last name, email always; phone when phone mode; consent tick with the firm's wording); staff create, reschedule and cancel; self-service reschedule and cancel by token (several live, all voided on change, expire at meeting end; inside the 4 h limit the page says to reply or call); slots honour hours, time off, closed days, gaps, shortest notice, window, interval, DST (skip a missing time, offer a doubled one once), active hosts only, first free host; the `.ics` invite with a stable UID and SEQUENCE (METHOD:CANCEL on cancel); reminders 24 h and 1 h; mail sent after commit and never losing a booking; the attendance question 30 min after the end, answered by a person; the arrival path keyed `booking:<id>`; a booking moves the person's only open prospect forward to Consult with the cause shown; events `booking.scheduled`, `booking.rescheduled`, `booking.cancelled`, `booking.completed`, `booking.no_show`. **Touch:** new `api/src/front-office/booking/*.ts`, `api/src/features/front-office-booking.ts`, `tests/check_fo3_booking.ts`; the time-zone libraries already added by PF-L | tested with a pass and a fail each, including: 20 parallel requests for one slot → exactly one booked; a slot on a firm closed day is not offered; 1 Nov 2026 in America/Toronto offers 01:30 once; a slot inside the shortest notice is not offered; changing hours never moves an existing booking; a used or voided token → identical not-found; an unknown firm, slug or inactive type → the same answer; a throwing mail adapter still saves the booking; nothing marks a no-show by itself; a booker with an open prospect makes no new lead and the prospect moves to Consult once; firm A's staff reading firm B's bookings → 404; every change writes one audit line in its transaction through `AuditPort` (pass: the line is there; fail: a forced audit failure rolls the change back) | contracts §2.2, §7; AG-4-1, -4, -5, -7, -9, -11, -12, -14, -16, -19, -22, -26, -29, -32, -34, -36, -37, -39, -47, -62, -63, -67; AG-2-10, -26 · **waits on:** FO-1b, FO-2, PF-4, PF-2 (time-zone library) · decisions: none · **breaker: yes (public door)** |
| FO-4 | screens (new screens) | **The firm's sales screens (AG-02; concept `screens/fo-4-sales/concept.md` r2, approved by Lead B after the fresh challenge, P-223 (4)):** web form page (hosted) and its settings panel; Leads (Unassigned leads, Mine, All open, Lost/Closed, search) with Take it, Assign, Add a lead; the pipeline board and list (Individual / Corporate switch; moves by a "Move to…" menu on the app's existing dropdown, no drag library); the one lead-and-prospect screen; right panels for Engage (Individual or Corporate with company match), Log a call, Add a note, Close lead, Mark lost, Assign, Add a lead, contacts; confirms for Convert to client and Undo convert. In `web/src/modules/front-office/` through PF-1's seam. Split into FO-4 (Individual) and FO-4c (Corporate panels and the board switch) if over ~800 lines. **Atomic CRM is a design reference only (Lead 39 ruling, 14 Nov):** its layout and interaction patterns (board columns and cards, three-column record, notes list and composer) are written fresh on our Radix components, contracts and hooks; **no code is copied**, so no licence notice; a builder who needs to copy code word for word stops and asks the release holder (`tech-gate-atomic-crm-2026-11-14.md`). **Touch:** new files under `web/src/modules/front-office/` (no licence file), `tests/check_fo4_sales_browser.ts` | the concept's journeys pass as browser checks (form on → sent at phone width → Unassigned leads with waited time → Take it → Log a call → Engage → prospect on the board → Move to… → Mark lost with a reason and found under Lost; a second prospect Converted and Undone; a Corporate Engage with a match offered); every BR's pass and fail; keyboard-only path; axe-core clean; screenshots at 375, 1024 and 1440 px | contracts §2.1, §7; AG-2-4, -5, -13c, -18, -44, -47, -53, -75, -77, -80, -94; P-392 · **waits on:** FO-2 (FO-4c also FO-2b), PF-1 · decisions: none open (founder answered Corporate and embed; Undo convert is AG-02's, not a question) · **breaker: yes (new screen)** |
| FO-4b | screens (embed script) | **The script embed with campaign capture (founder 22:3x; AG-2-5 rules 2 and 7, AG-2-8a, AG-2-49):** a small script served by our API that draws the firm's form on the firm's own site, takes a fresh `submissionId` per draw from FO-2's open read, and sends the page's campaign fields, click id, landing and referring page with the submission; no cookies, no storage, no tracking after the form; the settings panel shows the snippet. **Touch:** new `web/src/modules/front-office/embed/*`, one served-file route in `api/src/front-office/sales/embed.ts`, `tests/check_fo4b_embed_browser.ts` | a test page on an allowed site with `?utm_campaign=spring` sends one enquiry and the lead's attribution reads `spring` with the landing page; the same page on a site not allowed → refused; the browser holds no cookie or storage entry from the script afterwards; a blocked script leaves no broken page (the hosted link still works) | contracts §7 §2.1 · **waits on:** FO-2, FO-4 (settings panel) · decisions: none · **breaker: yes (public door)** |

## Order and what can start (rev 3)
* **Start now (unchanged):** PF-1, PF-2, PF-7.
* **After DB-SPLIT merges:** PF-3; then FO-1a and FO-1b **at once** (different area files, P-559 (2)).
* **Then:** PF-4 → PF-5; FO-2 → FO-2b; FO-3 (after FO-1b and FO-2); FO-4 after FO-2 and PF-1; FO-4b after FO-4.
* **Shaped next:** PF-11 firm data download (before any real firm goes live) · FO-3b paid consults (after FO-7c; **held for card at booking** except where the fee is earned at booking, the firm's choice, default off, A46 row 44 [REG]) · FO-5s retainer and signing screens (concept first, after FO-5/FO-6) · FO-7 invoices, receipts, payments (AG-06; trust as decided under P-566 (3), contracts §7 §2.5) · PF-5s public pricing, sign-up and tenant-profile screens (P-566; concept first, after PF-5) · FO-8 `prospect.won` with the case side · PF-8 cloud deploy · PF-9 firm set-up checklist and settings screen · PF-10 import with a dry run (AG-18).

## Rev 4 (14 Nov, after P-561): retainer, signing, staff screens — rev 5: PF-4b added and PF-6 rewritten from the approved PF-6 concept r2 · rev 4.1: FO-6 vendor-neutral, vendor adapter held as FO-6v (Lead 39, 14 Nov: FO-5r re-checks the vendor)
**Duplicate check (14 Nov ~07:xx IST):** BACKLOG and `main` have no retainer, signing, storage or staff-screen row or code (`git grep -i 'retainer\|boldsign\|docxtemplater\|signature_request'` on `main`: tests' fixture words only); open PRs: none on these areas.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| FO-5 | schema + runtime (API only) | **Retainer agreements (contracts §2.3, §7; AG-05 rules kept whatever the signer):** new area file `front-office-retainers.prisma` + one migration: `fo_retainer_template` (firm, name, **kind `RETAINER | CONSULTATION`** (FO-3c uses the second), version, stored `.docx` key, placeholders, active), `fo_retainer` (firm, prospect, person or company signer, representative person, status `DRAFT | SENT | VIEWED | CLIENT_SIGNED | SIGNED | SIGNED_OFFLINE | DECLINED | WITHDRAWN | EXPIRED`), `fo_retainer_version` (version n, bound merge values snapshot, fee rows with `when` (`ON_SIGNING | ON_DATE | WHEN_SUBMITTED | WHEN_DECIDED | WHEN_DONE`), currency CAD, `original_sha256`, file key), a `FilesPort` (`api/src/front-office/files.ts`: firm-prefixed keys, local folder in the reference app, short-lived checked download links; S3 Canada in PF-8); `DocumentRenderPort` on `docxtemplater` + `pizzip` (PF-2's versions); routes (permission keys AG-05 C5: `agent/retainer:list|show|draft|send|void|offline-sign|download|configure-template`, checked against PF-4's seeded keys): template upload (Owner/Admin; placeholders read and unknown ones refused; a missing client-name or fee placeholder is a warning; an unreadable file refused with "We could not read this file."), `GET /api/front-office/retainer-templates/placeholders` (the known list), `GET /api/front-office/retainer-templates/starter` (one Sample starter `.docx` built at run time from a committed text source by `DocumentRenderPort`, no binary in git; Unconfirmed: no counsel), draft from a prospect (client or, for Corporate, the `SIGNATORY` contact; representative = an active person with a licence and the case-manager keys), edit (before any signature makes version n+1; after the first signature refused; **from Declined or Expired, Edit and resend makes version n+1**, AG-5-65 r1), a Corporate prospect with no `SIGNATORY` contact gets a warning and a pick from the company's other contacts, never a block (AG-5-50); the retainer's representative may read that retainer and the prospect's header whatever the visibility setting; for Corporate the must-fill client name is the company's, withdraw with a reason, Signed offline with an uploaded PDF (AG-5-47's size limit) and a reason (filed "Signed on paper", no seal; cannot be undone); events `retainer.drafted`, `retainer.withdrawn`, `retainer.signed_offline` (makes the prospect WON `SIGNED_OFFLINE`), every change through `AuditPort`. **Touch:** new `prisma/schema/front-office-retainers.prisma`, one migration folder, new `api/src/front-office/retainers/*.ts`, `api/src/front-office/files.ts`, `api/src/features/front-office-retainers.ts`, `tests/check_fo5_retainers.ts`; `docxtemplater` and `pizzip` already added by PF-L | tested with a pass and a fail each: no active licensed person → no draft ("No active licensed consultant", AG-5-49); client name or fee empty → send refused at the field (AG-5-9), everything else only shows "missing"; merge values are copied into the version and a later change to the person never alters it (AG-5-3); `original_sha256` matches the stored file; an edit before any signature makes version 2 and ends version 1's request; an edit after a client signed → refused (AG-5-65); withdraw without a reason → refused, after Signed → refused (AG-5-34); Signed offline needs a file and a reason and makes the prospect WON once; a template with an unknown placeholder → refused with its name, one without a fee placeholder → accepted with a warning; the representative of a retainer reads it with "everyone-sees-all" off, another case officer without the prospect does not; a download link expires and is refused for another firm; firm A reading firm B's retainer → 404; every change writes one audit line in its transaction through `AuditPort` | contracts §2.3, §7; AG-5-3, -9, -16, -28, -34, -39, -49, -64, -65; trace t5 · **waits on:** FO-1a, PF-4 · decisions: the s. 24(3) checklist is FO-5b (founder question 4) · **breaker: yes (schema, money: fee rows)** |
| FO-5b | runtime (API only) | **Retainer checklist from the regulator's Code (question 4 decided by Lead B under P-566 (3): build it, non-blocking; contracts §7):** a fixed list of the Code's s. 24(3)(a)-(z) items, each with its section, official URL and "current to" date, mapped to template placeholders or clause markers; the template panel shows "24 of 26 items marked in this template" and each unmarked item with a "how we check" note (`GET /api/front-office/retainer-templates/:id/checklist`), the draft one quiet line with a link, **never refusing send** (only AG-5-9's two fields block). **Touch:** new `api/src/front-office/retainers/code-checklist.ts`, `samples/cicc-code-s24-items.json` (official text, cited), `tests/check_fo5b_checklist.ts` | a template missing (k) shows it missing with its section; send still allowed; the list's source line names the Code and its "current to" date; legal reading labelled "Unconfirmed: no counsel" on screen data | Code SOR/2022-128 s. 24(2)-(5) (trace t8); AG-05 lines 539-550 · **waits on:** FO-5 · decisions: none open (the deviation from AG-05 lines 539-550 goes to the founder as one line) · reviewer only |
| FO-6 | runtime (API only) | **Signing, vendor-neutral (contracts §2.4, §7; held vendor work is FO-6v):** `SigningPort` (send, embedded signing link, cancel, fetch sealed file and audit file, verify a webhook) with a `fake` adapter only; new area file `front-office-signing.prisma` + one migration: `fo_signature_request` (**document kind `RETAINER | CONSULTATION` and its version id** (FO-3c sends consultation agreements through the same port), provider, provider document id, status), `fo_signer` (role client or firm, person, order, signed at), `fo_signing_evidence` (sealed file key + sha256, audit file key + sha256, consent text version); send = one person's click, emitting `retainer.sent` (the prospect moves to Retainer sent with the cause shown; a system move), consent "I agree to sign electronically" recorded with its text version before signing; **an email one-time code before signing, decided P-564: a firm setting, on by default, a firm may switch it off** (code sent by our `MailPort`, single use, short expiry, attempts limited; tested on and off); **every signing email sent by us** through `MailPort` with embedded links (the port has no vendor-email option); clients sign in any order, the firm signs last (checked on our server); **the public signing door** `GET /api/public/sign/:token` (state), `POST …/code`, `POST …/code/verify` (starts a signing session bound to the browser: http-only cookie on the door's path, Sample 30 minutes; consent and session refuse without it; with the code off the session starts at consent), `POST …/consent`, `GET …/session` (the adapter's embedded link) — rate limited; an unknown, malformed or other firm's token → one plain "This link does not work."; an ended request → its state (updated, withdrawn, declined, signed, expired) and the firm's name, no personal data; a link lives until its signer signs or declines (AG-5-21); too many code tries lock the link for 15 minutes (Sample); a send is refused unless the version is Draft; **Send updated version**: version n+1, the end of the old request, the new request and one "Updated agreement — please sign this version" email in one go (AG-5-65 r2-r4); every email Reply-To the firm's contact address; the firm signer's embedded link declares `agent/retainer:show` and checks the caller is the retainer's representative; when the client has signed, one email and one "needs you" item to the representative (AG05-D4(2)); **Expired** 14 days after sending with no client signature (AG-05 C3; firm setting, Sample 14; clock-injected job), never once a client signed; on `retainer.withdrawn` for a sent version: the request is cancelled at the adapter and the client gets "Agreement withdrawn" by `MailPort` (AG-5-34 r3); `POST /api/hooks/signing/:provider` (verified by the adapter, stored once by provider document id + event); on completion: both files stored with us and hashed, "Your signed agreement" emailed to each client signer, **`signing.completed`** (document kind `RETAINER | CONSULTATION`, document version id, signer person ids, file keys; for a retainer also the agreed total and currency) — the one completion event (A51 §12: `envelope.completed` and `retainer.executed` retired) — on which the retainers module makes the prospect WON `E_SIGNED` once; decline → `DECLINED` for all, shown on the prospect, one item for the owner; never expires once a client has signed. **Touch:** new `prisma/schema/front-office-signing.prisma`, one migration folder, new `api/src/front-office/signing/*.ts` (no vendor file), `api/src/features/front-office-signing.ts`, `tests/check_fo6_signing.ts` | tested with a pass and a fail each, on the `fake` adapter: an unknown token and another firm's token give the same answer, an ended token gives its state and no personal data, a link reopens until signed or declined; consent or session without a verified code (setting on) → refused; a forwarded link in a fresh browser needs the code; the sixth wrong code locks for 15 minutes; a second send of one version → refused; a send updated version leaves exactly one live request and sends one email; a case officer who is not the representative cannot get the firm signer's link; the code on and off (P-564); send moves the prospect to Retainer sent once; a request with no client signature expires on day 14 (clock injected) and one with a client signature never does; withdraw of a sent version cancels at the adapter and emails the client once; the firm signer cannot sign before every client (forced out-of-order webhook → refused, state unchanged); no consent → no signature; an unverified webhook → 400, nothing stored; the same event twice → handled once; completion stores both files and hashes and emails each client once; `signing.completed` for a retainer makes one WON and a second completion makes none; a consultation-agreement completion makes no WON; an amendment-kind document never makes a client; decline ends the request for all; firm A's webhook cannot touch firm B's request; every change writes one audit line in its transaction through `AuditPort` | contracts §2.4, §7; AG-5-20, -25, -26, -28, -31, -37, -41, -62, -68, BR-21 · **waits on:** FO-5, PF-4, FO-5r (Lead 39) · decisions: none (P-563 vendor, P-564 email code) · **breaker: yes (makes the client; permissions; external door)** |
| FO-6v | runtime (API only) | **The signing vendor's adapter behind `SigningPort` (held: P-561 stands until the founder confirms or amends it after FO-5r):** today BoldSign by `fetch` on `https://api-ca.boldsign.com`, its four conditions checked first and stopping the row if any fails (Canada-region account; vendor emails off on every request; no vendor AI or ID verification; no vendor integration; `tech-gate-boldsign-residency-2026-11-14.md`); webhook verification; fetch of sealed and audit files. **Touch:** new `api/src/front-office/signing/adapters/<vendor>.ts`, `tests/check_fo6v_adapter.ts` (recorded vendor responses, no network in CI) | the adapter passes FO-6's port contract tests unchanged; a request with vendor emails on is refused by the adapter; **plus one Mac check** (Lead B, vendor sandbox, the founder's test key): the conditions shown true on a real sandbox request, and three answers recorded: does the vendor view show its own consent (agreeing twice), how long its embedded link lives against our 30-minute session, how Decline appears; the page's frame policy allows only the vendor's Canada host and the frame has a title | P-561; FO-5r (Lead 39) · **waits on:** FO-6; the founder's BoldSign sandbox key for the Mac check (P-563 confirmed BoldSign; FO-5r done) · decisions: the vendor (founder) · reviewer + breaker (external door) |
| FO-5s | screens (new screens) | **The firm's retainer and signing screens (concept `screens/fo-5s-retainer-signing/concept.md` r2, **approved by Lead B after the fresh challenge** (2 Blockers, 6 Majors, 10 Minors fixed), P-223 (4); founder's look follows):** Retainer templates (Settings › Retainer templates; upload panel with placeholders found and the known list; versions; active/inactive); the retainer card on FO-4's prospect screen (status, one next step; Sign as the firm for the representative only); Prepare retainer sub-page (template, signer, representative, fee rows with When; Check before sending with "missing" marks; the FO-5b checklist panel, non-blocking); Send panel; the retainer page after sending (who signed, versions, activity; Edit, Withdraw, Signed offline, downloads); Withdraw and Signed offline panels; the client's public signing page (375 px first: email code when on, consent, the adapter's embedded view, all end states); in `web/src/modules/front-office/` through PF-1's seam; no in-app `.docx` preview (download instead). **Touch:** new files under `web/src/modules/front-office/retainers/` and `web/src/modules/front-office/sign/`, `tests/check_fo5s_retainer_screens_browser.ts` | the concept's journey as a browser check on the `fake` adapter (upload → prepare → send → client page with the code on and off → consent → sign → Sign as the firm → both files downloadable → prospect Won); BR-1…BR-18 pass and fail; keyboard-only; axe-core; 375/1024/1440 | AG-5-4, -7, -8, -9, -20, -26, -27, -31, -34, -39, -49, -50, -55, -57, -62, -64, -65, -68, BR-21; P-564; P-473 · **waits on:** FO-5, FO-6, FO-4 (prospect screen), PF-1; the checklist panel on FO-5b · decisions: none open · **breaker: yes (new screens, public page)** |
| PF-4b | runtime (permissions, API only) | **Staff reads, web session and invitation acceptance (concept `screens/pf-6-staff/` r2; contracts §1.2, §7):** first verify at AWS's own docs, and stop and report to Lead B if any fails: Cognito custom email sender trigger (our function plus an encryption key, set up by script, F6); MFA required per user pool with an authenticator app; passkeys with user verification as a **replacement** for password plus second step under `FactorConfiguration` = `MULTI_FACTOR_WITH_USER_VERIFICATION` (never a second step to a password; contracts §7 §1.2); `auth_time` in tokens; (record the pages and dates in the PR). Routes: `GET /api/platform/staff` (list + seats used of the limit, `agent/staff:manage`), `GET /api/platform/staff/:id`, `GET /api/platform/licences`, `GET|PUT /api/platform/me/account` (own licence, own two-step state), `GET /api/platform/settings/two-step` (shows "Required for all staff"; no switch, question 3 decided), `POST /api/platform/staff/:id/reset-two-step` (Owner or Admin after their own step-up; the person is emailed; the reset is audited; nobody resets their own), `GET /api/public/invitations/:token` (valid, expired, used) and `POST …/accept` (creates the provider user with its email suppressed, returns the hand-off to set a password), `GET /api/platform/session/callback` (code → session), `POST /api/platform/session/sign-out`, `POST /api/platform/staff/:id/sign-out-everywhere`, the step-up check (`auth_time` ≤ 5 min, else 401 `step_up_required`), and the provider's custom email sender handler sending through `MailPort`; the local stand-in implements the same flow for CI. **Touch:** new `api/src/platform/identity/session/*.ts`, `api/src/platform/staff-read/*.ts`, `api/src/features/platform-staff-read.ts`, `tests/check_pf4b_session_reads.ts` | tested with a pass and a fail each: a staff list for firm A never shows firm B (404 on a guessed id); the seat line counts active + suspended + pending; a used or expired token → the right state, never a second account; accept creates one provider user and sends no provider email of its own; an Owner-role change with `auth_time` older than 5 min → 401 `step_up_required`, within → allowed; sign-out-everywhere ends every session of that person at once; a person without `agent/staff:manage` gets 403 on the list and 200 on their own account; a licence number never appears in a log or email (scanned); every change writes one audit line in its transaction through `AuditPort` | AG-1-10, -12, -13, -30, -40, -41, -42, -55, -70; SA-6-29 · **waits on:** PF-4 · decisions: question 3 decided (required for all; recovery by an Owner/Admin reset with step-up, OWASP "Resetting MFA") · **breaker: yes (permissions, public door)** |
| PF-6 | screens (new screens) | **Staff, roles and licences screens (concept `screens/pf-6-staff/concept.md` r2, approved by Lead B after the fresh challenge, P-223 (4)):** Team, Invite people (rows, role summaries and Compare roles written from SA-06 Appendix C, seat line, picker obeying the inviter's limits, no Owner at invite), Person panel (roles with the Owner reason and "Confirm it's you", licence, resend/revoke, Sign out everywhere, deactivate with reason, reactivate with the seat check), Licences, My account (own licence, own two-step), Security (two-step required for all staff, shown, no switch; question 3 decided), Reset two-step on the Person panel (Owner/Admin, Confirm it's you), Accept invitation (public), Signed in elsewhere, Confirm it's you; own frame component inside `web/src/modules/platform/`; licence types from IRPA s. 91(2) and bodies from `samples/representative-bodies-ca.json` (each body's official site and date read). **Touch:** new files under `web/src/modules/platform/`, `samples/representative-bodies-ca.json`, `tests/check_pf6_staff_browser.ts` | the concept's journey as a browser check on the local stand-in (invite → accept in a second browser → roles → licence → sign out everywhere → deactivate → refused → reactivate); BR-1…BR-10 pass and fail; keyboard-only; axe-core; 375/1024/1440 | AG-1-10, -12, -13, -15, -22, -30, -31, -40, -41, -42, -55, -66, -69, -70; SA-6-29, -44, Appendix C; IRPA s. 91(2) · **waits on:** PF-4b, PF-1 · decisions: none open (question 3 decided) · **breaker: yes (permissions, new screen)** |

## Rev 6 (14 Nov, Lead B (2)): P-566 and questions 3-5 decided
* **PF-5** rewritten to P-566 (self-serve sign-up with email verification, free trial, tenant profile and plan; invited link kept; components from A46 through STANDARDS §1); waits on A46's picks.
* **PF-4, PF-4b, PF-6:** question 3 decided by Lead B under P-566 (3) (two-step required for every staff member of every firm; the switch fixed on; PF-4b adds `reset-two-step` by an Owner or Admin with step-up; PF-6 shows it).
* **FO-5b:** question 4 decided: build the non-blocking s. 24(3) checklist (no longer "closes unbuilt").
* **FO-7 (shaped next):** question 5 decided: per-client trust ledger, receipts, offline trust deposits, invoice before withdrawal, 30-day reminder; card only for invoiced fees into operating; card into trust waits on a verified fees-to-operating processor set-up (contracts §7 §2.5).
* **New shaped next: PF-5s** public pricing page, sign-up, email-verified landing and the tenant profile screens (concept first; after PF-5 and A46).
* Evidence and the three deviations for the founder (AG-1-40; AG-05 l.539-550; AG-6-70's optional trust card account): contracts §7 and register §C items 6-9.
* **Rev 6.1 (14 Nov):** FO-5s concept r1 (gaps the drafter found, decided by Lead B): FO-5 gains the placeholder list, Edit and resend after Declined, the no-signatory rule and AG-05 C5's permission keys; FO-6 gains the public signing door, `retainer.sent`, Expired at 14 days, the representative's notice and the "Agreement withdrawn" email; new row **FO-5s** (screens). Staff `.docx` preview Not built in month one.
* **Rev 6.2 (14 Nov):** FO-5s concept r2 approved after the fresh challenge; FO-5, FO-5b, FO-6, FO-6v and FO-5s amended (signing door answers and browser-bound session, atomic updated send, representative access and Sign as the firm, Expired editable, 15-minute code lock, starter template, checklist on the template panel, no-signatory warning per AG-5-50, Mac check questions).

## Rev 7 (14 Nov, Lead B (2)): FO-7 client money, split by layer (P-436 (4)); trust as decided under P-566 (3)
**Duplicate check (14 Nov ~09:xx IST):** BACKLOG on `lead/2026-11-07-lead31` has no invoice, receipt, trust or payment-account row; `main`'s API and schema have no `money_invoice`, `trust_request`, `money_receipt`, `payment_account` or credit note; open PRs: none on these areas. Each builder repeats it (P-526). **Lead B decisions inside these rows (P-566 (3), reversible):** Stripe Connect with **controller properties** set like the old "Standard" type (Stripe now calls account types a "Deprecated feature" for platforms that already use them and recommends controller properties: docs.stripe.com/connect/accounts, per the A49 challenge F7, 14 Nov): the firm has its own full Stripe Dashboard, pays Stripe's fees, carries disputes and refunds, direct charges on its account ("the charge amount – less the Stripe fees … is deposited into the connected account"); we never hold money; no platform fee and Stripe sets pricing, so no Connect charge to us (stripe.com/en-ca/connect/pricing: CA$2 per active account plus 0.25 % + CA$0.25 per payout only if the platform sets pricing); AG-6-14 rule 13; trust per contracts §7 §2.5 (ledger, receipts, offline deposits; card only for invoiced fees into operating; card into trust waits); invoice taxes from rates the firm sets (Sample HST 13 %), government-fee lines never taxed (AG-6-4 rule 3); tax treatment Unconfirmed: no counsel.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| FO-7a | schema (front office: money) | **Money tables (contracts §2.5, §7; AG-06; trace t6 M1-M14), own area file:** `money_payment_settings` (firm: operating details block, tax number, tax rates list, `trust_enabled` default false, AG-6-59), `money_payment_account` (Stripe connected account id, status lifecycle `NOT_CONNECTED | PENDING | ACTIVE | RESTRICTED | DISCONNECTED`, charges and payouts enabled, AG-16-14..18; no secret stored), `money_invoice` (party = `fo_person` or `fo_company`, optional case id, number `INV-0001` taken at issue (null in draft), issued_at, due date, currency CAD, frozen once issued; **no stored status**, AG-6-1 r7), `money_invoice_line` (kind `FEE | DISBURSEMENT | GOVERNMENT_FEE`, amount in minor units, tax in basis points; a government fee is never taxed), `money_credit_note` (`CN-` series, part or full, reason), `money_payment` (method `CARD | E_TRANSFER | CHEQUE | WIRE | CASH | OTHER`, amount minor units, `received_into` `OPERATING | TRUST`, Stripe payment intent id unique, reference, recorded_by, idempotency key unique), `money_refund` (payment, amount, reason, card or offline), `money_receipt` (`R-` series, kind `PAYMENT | TRUST`, payment or trust entry), `money_trust_request` (`DR-` series, party, amount, purpose), `money_trust_entry` (per party: `DEPOSIT | WITHDRAWAL_TO_INVOICE | REFUND_TO_CLIENT | CORRECTION`, amount, invoice id for a withdrawal, insert-only), per-firm number series (no gaps, never reused). **Touch:** new `prisma/schema/client-money.prisma`, one migration folder, `tests/check_fo7a_money_schema.ts` | migration on empty and demo-data copies, `migrate diff` empty; tested with a pass and a fail each: an issued invoice's lines, tax, party, currency and number refuse change (trigger); `INV-`, `CN-`, `R-`, `DR-` numbers never repeat or skip under 20 parallel issues; a payment intent id or idempotency key twice → refused; trust entries refuse update and delete; a trust withdrawal without an invoice → refused; a party's trust balance can never go below zero (check in the same transaction, tested under parallel withdrawals); every amount is an integer; `firm_id` first in every index | contracts §2.5, §7; AG-6-1, -4, -19, -44, -46, -59, -60, -61, -63, -69; AG-16-14..18; Code s. 32(d), s. 33(3) (t8) · **waits on:** FO-1a (party tables), PF-3 · decisions: none open · **breaker: yes (schema, money)** |
| FO-7b | runtime (money, API only) | **Invoices, receipts, offline payments, credit notes and refunds (no card yet):** draft an invoice from a signed retainer's fee rows or by hand (party = the won person or company, never a prospect, AG-6-1 r1); **a deposit (an `ON_SIGNING` fee row, an advance) is never a card-payable invoice**: with trust on it becomes a trust request in FO-7t (Code s. 32: advance payments held in trust), with trust off it is billed like any row once the service is given (s. 33(1); AG-6-61), and a deposit invoice never carries a pay link (A46 row 60, [REG]); edit only a draft; issue (number, freeze, due date default 14 days, AG-6-46); status derived from facts (`Draft | Open | Part paid | Paid | Overdue | Credited | Refunded`); record an offline payment (idempotent; warns on a duplicate reference, AG-6-19); receipt `R-` emailed by `MailPort` to the bill-to with a PDF from `DocumentRenderPort`, no Cc (AG-6-63); credit note part or full with a reason (AG-6-48); refund with a reason and its own key (AG-6-23); the invoice email waits while the operating details block is empty (AG-6-71 r3); events `invoice.issued`, `invoice.paid`, `invoice.voided`, `invoice.overdue`, `payment.succeeded`, `payment.refunded`; keys `agent/invoice:issue`, `agent/payment:record`, `agent/payment:refund` (AG-06 C5); every change through `AuditPort`. **Touch:** new `api/src/client-money/invoices/*.ts`, `api/src/features/client-money-invoices.ts`, `tests/check_fo7b_invoices.ts` | tested with a pass and a fail each: an invoice on a prospect → refused; editing an issued invoice → "use a credit note"; double click on Record payment → one payment; a payment over the balance → refused with the balance; status follows payments, credits and refunds (table test); a government-fee line carries no tax; a refund without a reason or without the key → refused; overdue appears the day after the due date (clock injected); one receipt per payment, numbered; the invoice email held while the details block is empty; firm A reading firm B's invoice → 404; every change writes one audit line in its transaction | contracts §2.5, §7; AG-6-1, -4, -19, -23, -44, -46, -48, -63, -71; t6 M1-M5, M7, M9, M11-M13 · **waits on:** FO-7a, FO-5 (retainer fee rows), PF-4 · decisions: none open · **breaker: yes (money)** |
| FO-7c | runtime (money, API only) | **Card payment of invoiced fees through the firm's own Stripe account (Connect, controller properties: firm-paid fees, firm-carried disputes, full Stripe Dashboard):** step 0: confirm at Stripe's own docs the current Connect set-up by controller properties (fees payer = the account, losses and disputes with the account, full Dashboard, Stripe sets pricing so no Connect fee to us), direct charges, and availability in Canada; record pages and dates in the PR. `POST /api/front-office/payment-account/onboarding` (Owner only, step-up, hosted onboarding link), `GET …/payment-account` (status, break alert, AG-16-14..18), `POST /api/front-office/invoices/:id/pay-link` (client pays the full open amount only, AG-6-14 r2; the hosted page; payment intent with amount, CAD, `firm_id` and invoice id metadata, idempotency key, AG-6-14 r10), the public pay page (no login; when the account is unusable it shows the operating details or the firm's contact line, never a card form, AG-6-49 r1), `POST /api/hooks/stripe` routed by connected account (signature first, stored once in `webhook_receipt`, paid by the webhook never the redirect), a reconciliation poll for missed webhooks (AG-6-16 r5), card refunds through Stripe; **card never on a trust request or a deposit (advance) invoice**, only on invoices for services given or disbursements made (contracts §7 §2.5; Code s. 32-33; A46 rows 60, 94, [REG]); no application fee. **Touch:** new `api/src/client-money/card/*.ts`, `api/src/features/client-money-card.ts`, `tests/check_fo7c_card_payments.ts`; uses the Stripe library added by PF-L | on Stripe's test mode fakes and recorded events (no network in CI), tested with a pass and a fail each: a pay link for a part amount → refused; a redirect without the webhook marks nothing paid; the same event twice → one payment; a missed webhook is found by the poll once; an unsigned webhook → 400, nothing stored; firm A's event cannot pay firm B's invoice; a restricted account → the pay page shows the offline details, no card form; a pay link on a trust request or a deposit invoice → refused; connecting without step-up → 401 `step_up_required`; a non-Owner → 403; no secret in a log, column or response | contracts §2.5, §7; AG-6-14, -16, -17, -49; AG-16-14..18; t6 M8, M10, M14 · **waits on:** FO-7b, PF-5 (Stripe library and hook route), PF-4b (step-up); the founder's Stripe test keys only for one Mac check · decisions: Connect by controller properties (Lead B, above; A49 F7) · **breaker: yes (money, public door)** |
| FO-7t | runtime (money, API only) | **Trust ledger, month one (contracts §7 §2.5; Code s. 32-33; Unconfirmed: no counsel):** the Owner's trust question (`trust_enabled`; no trust word anywhere until Yes, AG-6-59); a trust request `DR-` (deposit asked of the client by email with the firm's trust-account details for e-transfer, cheque or wire; never a card); record a trust deposit paid straight into the firm's trust bank account (bank transfer, e-transfer, cheque; offline, idempotent, with a reference and an optional evidence file through `FilesPort`; trust money never routed through Stripe, A46 row 94) → a `TRUST` receipt emailed (s. 32(b)); per-client trust ledger and balance (s. 32(d)); apply trust to an invoice only after it is issued (s. 32(f)), never more than the balance or the invoice's open amount, recorded as a withdrawal with its invoice; refund trust to the client with a reason; a "to move" list and one reminder to the client's owner when an invoiced amount is still in trust 25 days after the invoice (s. 32(g): 30 days; Sample); events `trust.deposited`, `trust.applied`, `trust.refunded`; keys `agent/trust:record`, `agent/trust:apply` (AG-06 C5); every change through `AuditPort`. **Touch:** new `api/src/client-money/trust/*.ts`, `api/src/features/client-money-trust.ts`, `tests/check_fo7t_trust.ts` | tested with a pass and a fail each: with trust off no route answers and no screen data names trust; applying trust before the invoice is issued → refused; applying more than the balance or the open amount → refused; parallel applications never overdraw; every deposit gets one `TRUST` receipt; the ledger per client sums to its entries; a refund without a reason → refused; the 25-day reminder fires once (clock injected); firm A reading firm B's ledger → 404; every change writes one audit line in its transaction | contracts §7 §2.5; AG-6-59, -60, -61, -62, -69; Code SOR/2022-128 s. 32(a)-(g), s. 33(3) (t8) · **waits on:** FO-7b · decisions: card into trust waits on a verified fees-to-operating processor set-up (not this row) · **breaker: yes (money)** |

* **Order:** FO-7a → FO-7b → FO-7c and FO-7t side by side (different files). **Shaped next:** FO-7s invoice, payment and trust screens (concept first, after FO-7b); FO-3b paid consults after FO-7c (card at booking held, as above).
* **Rev 8 (14 Nov, Lead B (2)):** PF-5 aligned with stream 4 (2)'s capability map draft 2 (A46): Cognito sign-up with email verification (through PF-4b's custom email sender), Stripe Checkout no-card trial, Customer Portal, Stripe Tax; terms acceptance records (row 100) add two tables to `platform.prisma` (PF-5 holds the schema baton); the sign-up route's firewall rate rule is PF-8's. To re-check at the map's founder-ready version (12:00 IST).
* **Rev 8.1 (14 Nov):** checked against stream 4 (2)'s map draft 3: FO-7b never makes a deposit (advance) a card-payable invoice (trust request with trust on; billed once earned with trust off); FO-7c refuses card on deposits as well as trust requests; FO-7t records direct trust-bank deposits with a reference and optional evidence; FO-3b's card at booking held (earned-at-booking only, firm's choice, default off). FO-3 itself takes no money: unchanged.
* **Rev 8.2 (14 Nov):** PF-5 gains what the PF-5s concept r1 needs (password to `IdentityPort`, plan and period, billing and invoice reads, profile → Stripe customer, trial reminders, pause on a no-card trial end with the deletion clock, "already have an account"); the pricing page reads Stripe's prices through our plans list (no pricing table); new shaped row PF-11 firm data download.
* **Rev 8.3 (14 Nov):** PF-5s concept r2 approved after the fresh challenge (1 Blocker, 6 Majors, 9 Minors fixed); PF-5 gains the billing-step address route that works on hold, POST-only email confirmation, resume on a card added during hold, the invited plan line, card-on-file reminders, tax-extra prices and the PF-11 go-live gate. New screens row **PF-5s** below.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-5s | screens (new screens) | **The firm-as-customer screens (concept `screens/pf-5s-saas/concept.md` r2, approved by Lead B after the fresh challenge, P-223 (4); §7b binding):** public pricing (our page reading Stripe's prices, one filled button), sign-up (email, password, firm name, plan in-place picker, terms), check-your-email and confirm (POST only), the move to Stripe Checkout and back (states while the webhook is pending), the Owner's first sign-in with two-step enrolment, Firm profile (legal fields Owner-only), Plan and billing (trial line with and without a card, Customer Portal hand-off, invoices), the business-address panel before any card or payment, Payment hold (pay; download only once PF-11 exists), invited sign-up; public pages in a public layout, signed-in pages in `web/src/modules/platform/` through PF-1's seam. **Touch:** new files under `web/src/modules/platform/saas/` and `web/src/modules/platform/public/`, `tests/check_pf5s_saas_screens_browser.ts` | the concept's journey as a browser check on fakes (pricing → sign-up → confirm → trial started → profile → hold on a no-card trial end → address → card → Active), the invited path, every BR's pass and fail, keyboard-only, axe-core, 375/1024/1440 | P-566; SA-2-1, -24; SA-3-46; SA-4-4, -5, -30, -52, -54, -67, -79, -82; AG-1-65 · **waits on:** PF-5, PF-4b, PF-6 (frame), PF-1 · decisions: none open · **breaker: yes (new screens, public door, money)** |

## Rev 9 (14 Nov, Lead B (2)): A49 challenge findings F5, F7, F11, F15
* **F5 (passkeys):** contracts §7 §1.2, PF-4b and the PF-6 concept now say: password plus an authenticator-app second step for everyone; a passkey with user verification **replaces** password plus second step (pool `FactorConfiguration` = `MULTI_FACTOR_WITH_USER_VERIFICATION`), never a second step to a password; no SMS or email-code second step; the custom email sender is our function plus scripted set-up, proven on the founder's AWS account (F6).
* **F7 (Stripe Connect):** "Standard" replaced by Connect **controller properties** (firm-paid fees, firm-carried disputes, full Dashboard, direct charges, Stripe sets pricing so no Connect fee to us) in contracts §7 §2.5, the rev 7 decisions line and FO-7c (step 0 confirms).
* **F11 (consultation agreement):** new row **FO-3c** below; FO-5's template and FO-6's signature request become kind-aware (`RETAINER | CONSULTATION`) so one port and one template store serve both.
* **F15 (audit chain):** the release holder's (AUD-1); Lead B's recommendation sent to Lead 40: AUD-1 builds the hash chain (contracts §7 §0 already says "Hash chain and retention are AUD-1's") plus a daily export to a write-once store; no PF/FO row changes.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| FO-3c | runtime (API only) | **Consultation agreement before the first consultation (Code SOR/2022-128 s. 23; contracts §7 §2.2; Unconfirmed: no counsel):** the firm keeps a consultation-agreement template (FO-5's template store, kind `CONSULTATION`; placeholders for s. 23(2)(a)-(e): licensee name, registration number, address, phone, email; the potential client's name and contact; the fee or a pro bono statement; the College's role as regulator; purpose and scope); a booking of a consultation type sends the filled agreement for signing through `SigningPort` (FO-6, email by our `MailPort`, P-564's code when on): the client signs, then the consultation's licensed host; the signed copy is stored, hashed and emailed to the client (s. 23(3)); the booking and the person show "Agreement signed" or "Agreement not signed yet"; the host gets one "needs you" item and the reminder 24 h before the meeting while it is unsigned; nothing cancels a meeting by itself; a template missing an s. 23(2) placeholder shows it on the template panel (never blocking); a firm with no active consultation template sees a warning on its booking settings; events `consultation_agreement.sent`, `consultation_agreement.signed`. **Touch:** new `api/src/front-office/booking/consultation-agreement/*.ts`, `api/src/features/front-office-consultation-agreement.ts`, `tests/check_fo3c_consultation_agreement.ts` | on the `fake` adapter, tested with a pass and a fail each: a booking sends one agreement and a reschedule sends none; the host cannot sign before the client; the signed copy and its hash are stored and emailed once; a booking whose host has no licence record → the agreement goes to the firm's representative of record instead and says so; an unsigned agreement 24 h before the meeting gives one reminder and one item; a template without the fee placeholder → accepted, with the missing item shown; firm A's agreement unreadable by firm B (404); every change writes one audit line in its transaction through `AuditPort`; the outbox row written last | Code s. 23(1)-(3) (trace t8, current to 2026-10-19); AG-4-22..24; A49 F11 · **waits on:** FO-3, FO-5, FO-6 · decisions: none open (signature volume: one more signing request per consultation, costed in FO-6v's vendor plan) · **breaker: yes (public door, signing)** |

## Rev 9.1 (14 Nov, Lead B (2)): P-571 and stream 4 (2)'s two asks
* **PF-4:** P-571 (1) demo reset (never deletes platform audit lines; returns the Sample firm's settings to seed through the settings write path, one audit line, actor system, reason "demo reset"; fail test) and P-571 (2) the seed line behind an explicit Sample/demo setting that defaults off, with a test that a production configuration never runs it (already in BACKLOG by Lead 41; brief updated).
* **PF-5:** "deleted after 90 days" becomes "closed after 90 days" with the archive and download conditions (contracts §7 §1.1 "Firm exit"); keep periods are map row 105's.
* **New row PF-12** (database walls), below.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-12 | schema (walls) | **Database-enforced walls between firms on every PF and FO table (contracts §0 rule 2; map row 3; AG-1-1, -3, -45):** PostgreSQL row-level security with `FORCE ROW LEVEL SECURITY` on each `platform_*` (except `platform_plan`, `platform_role_permission`, `platform_setting_definition`) and `fo_*` table, policy `firm_id = current_setting('app.firm_id')::uuid`; `firmScope` opens each request's transaction with `SET LOCAL app.firm_id`; the app connects as a role that owns no table (the migration role owns them); the public doors and the webhook handler resolve the firm first, then set it; platform staff (`system/*`) go through one audited bypass role used only by named routes. **Touch:** one migration folder (policies and roles only, no table change), `api/src/platform/firm-scope.ts` (the `SET LOCAL`), `tests/check_pf12_walls.ts` | tested with a pass and a fail each: a raw query with no `app.firm_id` set returns nothing; firm A's session reading firm B's row by id through SQL returns nothing; the table owner role is never the app's role (checked at start-up); every PF and FO suite passes unchanged; the cross-firm tests of every PF/FO row run as the release gate; the bypass role is refused on any route not on its list | contracts §0 rule 2; map row 3 [REG]; AG-1-1, -3, -45 · **waits on:** PF-4 (the guard sets the firm), FO-1a, FO-1b; runs after each later schema row adds its tables (a new table ships with its policy from then on) · decisions: none open · **breaker: yes (schema, permissions)** |

## Rev 10 (14 Nov, Lead B (2)): P-574 — branding extras, duplicates, assignment rules, WhatsApp, payment plans
**Duplicate check (14 Nov ~09:2x IST):** BACKLOG on `lead/2026-11-07-lead31`: no WhatsApp, duplicate, merge, round-robin, payment-plan or favicon row; `main`'s API, schema and web: no `whatsapp`, `pg_trgm`, `libphonenumber`, round robin or favicon. Open PRs: none on these areas. Each builder repeats it (P-526). **Size (Hypothesis, to be settled by the 19 Nov count):** 12-16 small PRs, about 30-45 changes; WhatsApp is the largest (4-5 PRs) and carries outside clocks that are the firm's (Meta business verification, template approval). Not counted: the automation row (map row 36) that FO-10 plugs into, and the case side's sending layer and consent gate (map rows 48, 49) that FO-11 plugs into.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-13 | runtime + screens (platform) | **Firm branding, with the extras (P-574 (1); map row 23):** logo, one brand colour (refused below WCAG AA contrast on white, with the reason), sender name, **favicon and banner**, stored through `FilesPort` (size and type limits, images re-encoded, no SVG scripts); applied to client pages, emails (header) and generated PDFs; a **live preview** beside the fields (a client page header, an email header and a PDF header drawn from the unsaved values); `GET|PUT /api/platform/branding` (Owner, Admin; `agent/firm-branding:manage`); a branding panel in `web/src/modules/platform/`. **Touch:** new `api/src/platform/branding/*.ts`, `api/src/features/platform-branding.ts`, new files under `web/src/modules/platform/branding/`, `tests/check_pf13_branding.ts` (API + browser) | tested with a pass and a fail each: a colour failing contrast → refused with the ratio; an SVG with a script → refused; a 6 MB logo → refused with the limit; the preview changes before save and nothing is stored until Save; a saved logo shows on the client signing page, an email header and a PDF; firm A's branding never on firm B's pages; every change through `AuditPort`; keyboard-only, axe-core, 375/1024/1440 | AG-1-6, -9; AG-16-2; P-574 (1) · **waits on:** PF-4, FO-5 (`FilesPort`), PF-1 · decisions: none open · reviewer + breaker (uploads) · **size:** 2 PRs (API, panel) |
| FO-9a | schema + runtime (API only) | **Duplicate warning on key fields (P-574 (2)):** `pg_trgm` enabled in one migration with trigram indexes on person and company names; a normalised phone column (E.164 by `libphonenumber-js`, through STANDARDS §1 in the PR) and a lower-cased email index on `fo_person`; one match service (email exact, phone exact, name similarity at or above a Sample threshold 0.6; a match score 0-100 with the reasons); `POST /api/front-office/duplicates/check` used by Add a lead, Engage, add contact and the arrival path, returning matches the caller may see, each with "use the existing one"; a `DuplicateCheckPort` the case side calls when it creates a client (warn only); the public form never reveals a match (FO-2's rule stands). **Touch:** `prisma/schema/front-office-sales.prisma` (the column and indexes) and one migration folder (schema baton), new `api/src/front-office/duplicates/*.ts`, `api/src/features/front-office-duplicates.ts`, `tests/check_fo9a_duplicates.ts`; `libphonenumber-js` already added by PF-L | tested with a pass and a fail each: `+1 (416) 555-0101` and `416.555.0101` match; a different person with the same first name only scores below the threshold; a match the viewer may not see is never named; "use the existing one" links the new activity to the existing person and creates nothing; the public form answers the same with or without a match; 20 parallel checks stay under the speed budget at 100 firms of Sample data | AG-2-16, -78, -96..99; P-574 (2) · **waits on:** FO-2 · decisions: none open · **breaker: yes (schema)** · **size:** 1-2 PRs |
| FO-9b | runtime (API only) | **Safe merge and the duplicate review list (P-574 (2)):** **automatic merge only for leads and prospects with no case, no stored document, no invoice and no money** (no `client.created`, no retainer file, and `ClientMoneyPort.hasMoney` false: no invoice, payment or trust entry; contracts §8), when email or phone matches exactly; every merge writes a merge record with the loser's full snapshot and moves activities, calls, notes, consents and stage history to the survivor (attribution kept, both rows, write-once); **Undo merge** restores the loser from the snapshot while nothing new was added to the survivor from it; everything else goes to a **review list** (score, reasons, first seen) with a **guided manual merge** (pick the surviving value field by field, preview, confirm); a match that involves a client with a case is listed for review and its merge is handed to the case side's merge (named by the release holder), never done here; keys `agent/duplicates:review`, `agent/duplicates:merge`; events `person.merged`, `person.unmerged`. **Touch:** new `api/src/front-office/duplicates/merge/*.ts`, `api/src/features/front-office-merge.ts`, `tests/check_fo9b_merge.ts` | tested with a pass and a fail each: two safe leads with one email merge by themselves once, logged; a lead with an invoice is never merged automatically and appears on the review list; Undo restores both and their activities; Undo after the survivor got a new note from the loser's channel → refused with the reason; a guided merge keeps the chosen value for each field; consent and attribution rows are never lost; a client with a case is never merged here; firm A never sees firm B's matches; every change through `AuditPort`, outbox row last | AG-2-16, -78, -96..99; P-574 (2) · **waits on:** FO-9a, FO-7a (money tables to check) · decisions: the case side's client merge is Lead 41's (shaped after the case-side contract v0, P-575 (4)); until then a manual path · **breaker: yes (merging records)** · **size:** 2 PRs |
| FO-9s | screens | **Duplicate warning and review screens (concept first, skill screen-concept):** the inline warning on Add a lead, Engage and add contact with "use the existing one"; the review list (score, reasons); the guided merge (side by side, field by field, preview, confirm, Undo). In `web/src/modules/front-office/duplicates/`. **Touch:** those files, `tests/check_fo9s_duplicates_browser.ts` | the concept's journeys as browser checks; keyboard-only; axe-core; 375/1024/1440 | P-574 (2) · **waits on:** FO-9b, FO-4 · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1-2 PRs |
| FO-10 | runtime (API) | **Assignment rules (P-574 (3); AG-2-13a, -13b, -13d), as actions of the automation row (map row 36, P-570):** a default owner per source (web form, booking, embed, by hand) or per program/service; **round robin** among active staff holding the sales keys (skips deactivated and suspended people; a fair pointer per firm, safe under parallel arrivals); a rule that names an inactive person falls back to Unassigned leads with a "needs you" item; the panel lives in the automation settings. **Touch:** new `api/src/front-office/assignment/*.ts` registered as automation actions, `tests/check_fo10_assignment.ts` | tested with a pass and a fail each: three leads from the web form go to three people in turn; 20 parallel arrivals give each person 6 or 7, never 9; a deactivated person is skipped; a program rule beats the source rule; a rule naming an inactive person → Unassigned plus one item; every assignment on the timeline with its rule | AG-2-13a, -13b, -13d; P-574 (3) · **waits on:** FO-2, FO-12a (the automation engine; map row 36, Lead B's by Lead 41, 14 Nov) · decisions: none open · reviewer only · **size:** 1 PR |
| FO-11 | runtime + screens (messages) | **WhatsApp beside email (P-574 (4)), behind our message layer (map row 48, the case side's sending; consent gate row 49):** (a) a STANDARDS §1 entry in the PR: Meta's WhatsApp Cloud API direct vs a provider (licence, data location: Meta processes in the US, a privacy-notice line; cost to the firm; template and webhook handling); (b) each firm connects **its own WhatsApp Business account** (Meta's embedded sign-up; verification, template approval and per-conversation fees are the firm's); its token in the secrets store, never a column (AG-16-18); (c) approved templates synced; follow-ups and reminders (FO-3's 24 h and 1 h, the consultation-agreement and signing reminders, FO-7 pay reminders) go by WhatsApp when the person has opted in, by email otherwise, chosen per person; inside Meta's 24-hour window a free-text reply, outside it a template only; (d) inbound messages by a verified webhook onto the person's timeline; delivery states; (e) **opt-in recorded** (wording version, source, time) and **opt-out** (the STOP word and by staff) honoured by the consent gate; no SMS; CASL reading Unconfirmed: no counsel. **Touch:** new `api/src/front-office/whatsapp/*.ts` (adapter, connect, templates, webhook), `api/src/features/front-office-whatsapp.ts`, one channel registration line in the sending layer (map rows 48/49: the release side's file, **OK'd by Lead 41**, 14 Nov; the channel sits behind the existing port; the consent gate stays the case side's), new files under `web/src/modules/front-office/whatsapp/` (connect panel, opt-in tick text, channel choice), `tests/check_fo11_whatsapp.ts` (recorded Meta responses, no network in CI) | tested with a pass and a fail each: a person without opt-in gets email only; after STOP, nothing goes by WhatsApp and the timeline says why; a free-text send outside the 24-hour window → refused, a template allowed; an unverified webhook → 400, nothing stored; an inbound message lands on the right firm's person once; firm A's account never sends for firm B; the token never appears in a log, column or response; **plus one Mac check** by Lead B on a Meta test number with the founder's test business (no live client) | P-574 (4); A11 5.8; AG-10 (channels), AG-16-18 · **waits on:** map rows 48 and 49 (the case side's sending and consent gate), FO-2; the screens part also PF-1 · decisions: the service by STANDARDS §1 in (a) · **breaker: yes (public door, external service, secrets)** · **size:** 4-5 PRs (gate, connect + templates, send + routing, inbound + timeline, panel) |
| FO-7p | runtime (money, API) | **Payment plans for earned fees (P-574 (5); map row 96):** an issued invoice for services given can be split into instalments (amounts summing exactly, dates, at most 12, Sample); each instalment gets a pay link sent by email or WhatsApp on its date; **optional autopay**: the client saves a card at the first payment with explicit consent (wording versioned) on the firm's own Stripe account, and each later instalment is charged on its date by a job; a failed charge retries once, then the instalment is overdue with a notice; the client or staff can stop autopay; cancelling a plan leaves paid instalments untouched; **never on a deposit, a trust request or trust money** (row 94 Held, P-567). **Touch:** new `api/src/client-money/plans/*.ts`, `api/src/features/client-money-plans.ts`, `tests/check_fo7p_plans.ts` | on Stripe test-mode fakes, tested with a pass and a fail each: instalments not summing to the open amount → refused; a plan on a deposit invoice or a trust request → refused; autopay without the consent record → no card saved; a charge on the date happens once (clock injected, job retried twice); a failed charge retries once then marks overdue and notifies once; stop autopay prevents the next charge; every change through `AuditPort` | P-574 (5); map row 96; AG-6 · **deviation:** the team's requirement had withdrawn saved-card autopay and payment plans (trace t6: H:65, A:1200 rule c); P-574 (5) brings them back, **confirmed by the founder as P-578** ("Yes, keep them"; consent recorded, the firm's own Stripe account, never on deposits or trust) · **waits on:** FO-7c · **breaker: yes (money)** · **size:** 1-2 PRs |
* **Rev 10, part 2 (14 Nov): P-575 (1) and A51 §12.** (1) **Client money is its own module** (contracts §8): FO-7a's tables are renamed `money_*` in `prisma/schema/client-money.prisma`, code in `api/src/client-money/`, features `client-money-*.ts`, in FO-7a, FO-7b, FO-7c, FO-7t and FO-7p; nothing else writes them (FO-9b asks `ClientMoneyPort.hasMoney`); the row ids stay FO-7* until the release holder names the module's owner. (2) **One signing completion event, `signing.completed`** (document kind `RETAINER | CONSULTATION`), replacing `retainer.executed` and `envelope.completed`, in FO-6 and contracts §2.4, §2.6, §7. (3) **Governance:** recommendation in contracts §8 (audit tables to `audit.prisma` under AUD-1; `governance.prisma` the configurator's alone); no PF/FO row changes.

## Rev 11 (14 Nov, Lead B (2)): FO-12 automation (map row 36, Lead 41: Lead B's), PF-14 background jobs and PF-L libraries (unblockers), and the order of work by P-576
**Duplicate check (14 Nov ~09:4x IST):** BACKLOG on `lead/2026-11-07-lead31` has no automation, recipe, job-queue or library row; `main` has no `pg-boss`, `graphile-worker` or `bullmq` and no job runner; open PRs: none. Map row 9 (background jobs) was unshaped and every reminder, expiry and notice in PF-5, FO-3, FO-3c, FO-6, FO-7 and FO-12 needs it, so Lead B shapes it as PF-14 (platform; the case side may use it too).

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-L | records + runtime (libraries) | **All gate-approved libraries in one small PR, so no two lanes edit `package.json` and the lockfile (P-576 (4)):** add `stripe`, `docxtemplater`, `pizzip`, `date-fns`, `@date-fns/tz` (PF-2's exact versions) and two new STANDARDS §1 entries in PF-2's gate file: **`pg-boss`** (map row 9: on our PostgreSQL, no second store; Node 22.12+; MIT) and **`libphonenumber-js`** (FO-9a); `aws-jwt-verify` stays in PF-4. **Touch:** `package.json`, the lockfile, `product/design/tech-gate-platform-front-office-2026-11-14.md` | every library at its exact gate version with its publish date at least 14 days old and licence read at source; `npm ci` and every suite pass unchanged; no code uses them yet | PF-2; map rows 9, 2; STANDARDS §1 · **waits on:** PF-4 merged (its library line first) · decisions: none · reviewer only · **size:** 1 PR |
| PF-14 | runtime (platform) | **Background jobs, schedules and reminders behind `JobPort` (map row 9; AG-10-1, AG-11-17..20):** `pg-boss` on our PostgreSQL in its own schema (created by the app at start, not by Prisma); `JobPort` (enqueue with a key so a job is never queued twice, schedule at a time, cancel, recurring) with a **fake that runs on an injected clock** for every PF/FO test; one worker process started with the app; retries with back-off and a dead-letter list; every job carries `firm_id` and runs inside `firmScope`; a job never sends a message itself, it calls the module's own port. **Touch:** new `api/src/platform/jobs/*.ts`, `api/src/features/platform-jobs.ts`, `tests/check_pf14_jobs.ts` | tested with a pass and a fail each: the same key twice → one job; a job scheduled for 09:00 Toronto runs once at the right UTC instant across the 1 Nov 2026 clock change; a failing job retries then lands on the dead-letter list with its error; a crash mid-job reruns it once (idempotent handler test); firm A's job never reads firm B's rows; the fake clock drives every scheduled job in tests with no real waiting; the worker stops cleanly on shutdown | map row 9; AG-10-1, AG-11-17..20 · **waits on:** PF-L · decisions: none · reviewer only · **size:** 1 PR |
| FO-12a | schema + runtime (automation engine) | **The automation engine (map row 36; AG-2-31 rules 4-9, AG-11's recipe model as AG-02 uses it):** own area file `front-office-automation.prisma` + one migration: `fo_automation_recipe` (key, firm, on/off, steps with wording, timing and per-step on/off/"Ask me first"), `fo_automation_run` (person, lead or prospect context, state `QUEUED | RUNNING | AWAITING_APPROVAL | ENDED`, exit reason), `fo_automation_step_run` (`SUCCESS | SKIPPED | AWAITING_APPROVAL | FAILED` with the reason); the **Conductor** on `JobPort` runs each step; **actions** registered by modules (send a message through the sending layer, make a task, set a reminder, assign: FO-10); **each step checked when it runs**: live consent (the case side's gate), quiet person (AG-2-59), rate caps and quiet hours; a run ends the moment its goal is met (reply, booking, Engage, close, lost, won, unsubscribe); no AI step; no builder. **Touch:** new `prisma/schema/front-office-automation.prisma`, one migration folder, new `api/src/front-office/automation/*.ts`, `api/src/features/front-office-automation.ts`, `tests/check_fo12a_engine.ts` | tested with a pass and a fail each, on the fake clock: a step for a person without consent is skipped with the reason; a quiet person is never enrolled in a client-facing step; a reply ends the run and no later step sends; an "Ask me first" step waits for approval; a step switched off never sends and the next still runs; a step's action failing marks it Failed and retries per PF-14; two triggers for one person never make two runs of one recipe; firm A's runs invisible to firm B; every change through `AuditPort`, outbox row last | AG-2-31, -33, -59; map row 36 · **waits on:** PF-14, FO-2, map rows 48/49 (message action) · decisions: none · **breaker: yes (schema, sends to clients)** · **size:** 2 PRs (schema, engine) |
| FO-12b | runtime (recipes) | **The four lead recipes and the going-cold mark (AG-2-31 rule 1, AG-2-39, AG-2-56):** new-lead (on from the start: "Call now" task, thanks email as a service message, reply reminder), no-show recovery (`booking.no_show`), going-cold follow-up (on the going-cold mark after the firm's set number of open days; never closed, lost or Nurture), post-consult follow-up (`booking.completed`); the last three off by default; wording and timing per step editable, a step can be switched off; **Add to follow-up** on a lead or prospect (`agent/prospect:sequence`); "Enrolled in" read; channel by the person's preference (email or WhatsApp with an approved template, else email). **Touch:** new `api/src/front-office/automation/recipes/*.ts`, `tests/check_fo12b_recipes.ts` | the card's tests (AG-2-31 §11, AG-2-39, AG-2-56) each with a pass and a fail, on the fake clock | AG-2-31, -39, -56 · **waits on:** FO-12a, FO-3 (booking events) · decisions: none · reviewer only · **size:** 1-2 PRs |
| FO-12c | runtime (message many) | **Message many with consent (AG-2-90, AG-2-91):** one message to a filtered list of leads, prospects or clients; at send time each person is checked for consent, quiet state and a frequency limit (Sample: one marketing message per 7 days); a preview with counts ("will send to 41, skipped 7: no consent 5, quiet 2"); no bulk sending for a firm in trial (map row 48's guard); sent through the sending layer in batches by `JobPort`. **Touch:** new `api/src/front-office/automation/bulk/*.ts`, `tests/check_fo12c_bulk.ts` | tested with a pass and a fail each: people without consent are skipped and counted; the frequency limit holds across two sends; a trial firm → refused with the reason; a 2,000-person send finishes in batches without blocking requests; every send on each person's timeline | AG-2-90, -91 · **waits on:** FO-12a · decisions: none · **breaker: yes (bulk sends)** · **size:** 1 PR |
| FO-12s | screens | **Automatic messages, timings, follow-up and message-many screens (concept first, skill screen-concept):** recipes with on/off and per-step Send automatically / Ask me first / Off; timings; approvals waiting; Add to follow-up; Enrolled in; message many with the preview; assignment rules (FO-10). **Touch:** new files under `web/src/modules/front-office/automation/`, `tests/check_fo12s_automation_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440 | AG-2-31, -90, -91; AG-2-13 · **waits on:** FO-12b, FO-12c, FO-10, FO-4 · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1-2 PRs |

### Order of work (P-576: critical first; then contracts, ports with fakes and schema files before code; unblockers; risky outside services early as small proofs; never two lanes on one busy file; warm lanes keep related rows; fixtures before screens)
**Lanes keep their rows warm:** identity PF-4 → PF-4b → PF-5 → PF-12 · sales FO-1a → FO-2 → FO-2b → FO-9a → FO-9b · booking FO-1b → FO-3 → FO-3c · signing FO-5 → FO-6 → FO-6v · money FO-7a → FO-7b → FO-7c ∥ FO-7t → FO-7p · jobs and automation PF-L → PF-14 → FO-12a → FO-10 → FO-12b → FO-12c · messages FO-11 · screens FO-4 → FO-4b → FO-5s, PF-6 → PF-5s → PF-13, then FO-9s, FO-12s, FO-7s.
1. **When PF-3 merges:** FO-1a ∥ FO-1b ∥ PF-4 (different files).
2. **Then the unblockers:** PF-L (right after PF-4, one lockfile PR) → PF-14 (jobs, with the fake clock every later row tests on). **Risky outside services as small proofs, against fakes now:** FO-11's tool gate and adapter against recorded Meta responses; FO-6v's adapter against recorded BoldSign responses; PF-5's and FO-7c's step 0 Stripe checks at Stripe's docs. **Live proofs wait on the founder's account openings (P-551):** an AWS account (Cognito pool for PF-4b's passkey and email-sender proof), a BoldSign sandbox key (FO-6v), a Stripe test account for the platform (PF-5, FO-7c), a Meta developer account with a test business and number (FO-11).
3. **Then, by lane:** PF-4b; FO-2; FO-5; FO-3 (after FO-1b, FO-2, PF-14); FO-7a (schema, own file).
4. **Then:** PF-5 (schema baton on `platform.prisma`); FO-6; FO-2b; FO-9a (after FO-1a, same area file); FO-7b; FO-12a.
5. **Then:** FO-7c ∥ FO-7t; FO-10; FO-12b; FO-12c; FO-3c; FO-9b; FO-6v; FO-11 (b-e); FO-7p; PF-12 (walls, after the PF/FO tables exist); PF-11.
6. **Screens after their APIs and fixtures:** FO-4 (after FO-2) → FO-4b; PF-6 (after PF-4b); FO-5s (after FO-5, FO-6); PF-5s (after PF-5); PF-13; FO-9s; FO-12s; FO-7s (concept first).

## Rev 12 (14 Nov, Lead B (2)): P-579 — conflict check, complaints record, client identity check (intake and engagement, first build)
**The College's duties, read at the source** (Code of Professional Conduct for College Licensees, SOR/2022-128, laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/FullText.html, "current to 2026-10-19", read 14 Nov 2026; legal reading **Unconfirmed: no counsel**): **conflicts** s. 5 ("loyal to their clients, including by avoiding conflicts of interest"), s. 15(1) (only after disclosing "the nature and extent of the conflict to the client in writing" and "free and informed consent in writing"), s. 15(2) and s. 16(1) (conflicts a client cannot consent to), s. 24(3)(o) (the service agreement describes "any conflict of interest or potential conflict of interest"), s. 35(1)(c) (must end services if continuing would create one); the Code names **no duty to run a search before accepting a client**, so the search is best practice for meeting s. 5 and s. 15, not a quoted rule. **Complaints** s. 29 ("must promptly respond to any complaints made to the licensee by a client"), s. 24(3)(r) (the agreement states "the licensee's complaint-handling procedure"), s. 24(3)(v) (the College's complaints process), s. 37 (records kept "in accordance with the by-laws"); **no Code line requires a complaints register**: the by-laws and the College's guidance are not yet read (to read at the College's own pages before FO-13k is built; until then the record's fields are Sample). **Identity** s. 24(2)(a) ("confirm the following information … seeking corroboration of the information if possible": full name, home address, phone, email, business details); the Code names **no identification document**: the document fields are best practice, Sample, and never block. **Duplicate check (14 Nov ~09:5x IST):** BACKLOG on `lead/2026-11-07-lead31` and `main`'s API and schema: no conflict-check, complaint or identity-check row or table; open PRs: none. **Order (P-576):** the schema first (one area file for the three, so the APIs can then run side by side), then the three APIs, then the screens.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| FO-13 | schema (front office: compliance) | **Tables for the three records, own area file `front-office-compliance.prisma` + one migration:** `fo_conflict_check` (party: person or company; searched terms; matches found with their kind and record; result `NO_CONFLICT | POTENTIAL_CONFLICT | CONFLICT_CANNOT_ACT`; for a potential conflict the disclosure text and the written-consent reference; checked by, at); `fo_complaint` (complainant: client, prospect or other; received at, channel, summary, category (Sample list); acknowledged at; response sent at; outcome `RESOLVED | UPHELD | NOT_UPHELD | WITHDRAWN | REFERRED_TO_COLLEGE`; closed at) and `fo_complaint_event` (each handling step, insert-only); `fo_identity_check` (person; method `IN_PERSON | VIDEO | DOCUMENT_COPY | OTHER`; document type (Sample list), issuing country, expiry, **last 4 characters only** of the number, an optional copy through `FilesPort` with restricted access; details corroborated (name, address, phone, email); checked by, at). **Touch:** new `prisma/schema/front-office-compliance.prisma`, one migration folder, `tests/check_fo13_compliance_schema.ts` | migration on empty and demo-data copies, `migrate diff` empty; tested with a pass and a fail each: a full document number never fits (only 4 characters); complaint events refuse update and delete; a closed complaint refuses a change to its outcome (a new event instead); a conflict check with `POTENTIAL_CONFLICT` needs a disclosure text; `firm_id` first in every index | Code s. 5, 15, 16, 24(2)(a), 24(3)(o)(r)(v), 29, 35(1)(c), 37; P-579 · **waits on:** FO-1a (party tables), PF-3 · decisions: none · **breaker: yes (schema, personal data)** · **size:** 1 PR |
| FO-13c | runtime (API) | **Conflict-of-interest check before a person becomes a client:** search past and current clients, prospects, company contacts and **other parties on cases** (sponsors, employers, family members: through the case side's read port, named by Lead 41) by name, email and phone, reusing FO-9a's match service; record the result and who checked; **a retainer cannot be sent, nor a prospect converted or signed offline, without a recorded check for that party**; `CONFLICT_CANNOT_ACT` blocks those steps with the Code's reason (s. 15(2), 16(1)); `POTENTIAL_CONFLICT` puts the disclosure text into the retainer's s. 24(3)(o) placeholder and records the client's written consent by the signed retainer (s. 15(1)); a new check is asked when the party's details change before signing; keys `agent/conflict:check`; events `conflict.checked`. **Touch:** new `api/src/front-office/compliance/conflict/*.ts`, `api/src/features/front-office-conflict.ts`, `tests/check_fo13c_conflict.ts` | tested with a pass and a fail each: Send without a check → refused at the step with the reason; a match with a current client's sponsor is found and named only to people who may see it; `CONFLICT_CANNOT_ACT` blocks Convert and Signed offline; `POTENTIAL_CONFLICT` without disclosure text → refused; the disclosure appears in the retainer's filled version; changing the person's name after the check asks for a new one; every check on the timeline and through `AuditPort` | Code s. 5, 15, 16, 24(3)(o), 35(1)(c) · **waits on:** FO-13, FO-9a, FO-5; the case side's parties read port (Lead 41) for the "other parties" search (until then clients and prospects only, said on screen) · decisions: none · **breaker: yes (blocks engagement, permissions)** · **size:** 1 PR |
| FO-13k | runtime (API) | **Complaints record:** record a complaint (by a client, prospect or other person), each handling step, the outcome and the dates; an acknowledgement reminder to the handler on `JobPort` (Sample: 2 business days, to set from the by-laws once read) for s. 29's "promptly respond"; closed complaints stay readable and change only by a new event; visible to Owner and Admin, and to the handler; keys `agent/complaint:record`, `agent/complaint:read`; a list with open, overdue and closed; kept for row 105's keep period, never deleted by staff; events `complaint.received`, `complaint.closed`. **Before building:** read the College's by-laws and its guidance on complaint handling at the College's own pages (page, quote, date in the PR); fields that the by-laws require become must-fill. **Touch:** new `api/src/front-office/compliance/complaints/*.ts`, `api/src/features/front-office-complaints.ts`, `tests/check_fo13k_complaints.ts` | tested with a pass and a fail each: a complaint without a received date or summary → refused at the field; the acknowledgement reminder fires once after the Sample period (fake clock); a closed complaint's outcome cannot change; a case officer who is not the handler cannot read it; delete → refused for everyone; every change through `AuditPort` | Code s. 24(3)(r)(v), 29, 37; P-579 · **waits on:** FO-13, PF-14 · decisions: none (fields Sample until the by-laws are read) · reviewer + breaker (personal data) · **size:** 1 PR |
| FO-13i | runtime (API) | **Client identity check:** record how identity was verified (method), which document was seen (type, issuing country, expiry, last 4 characters), which details were corroborated (s. 24(2)(a): name, home address, phone, email, business details), the date and who checked; an optional document copy stored through `FilesPort` with access only for people who may see the client's documents, never in a log or email; **before a retainer is sent, a missing check shows a warning, never a block** (the Code's "if possible"); keys `agent/identity-check:record`; events `identity.checked`. **Touch:** new `api/src/front-office/compliance/identity/*.ts`, `api/src/features/front-office-identity-check.ts`, `tests/check_fo13i_identity.ts` | tested with a pass and a fail each: a full document number is refused; the copy's link expires and is refused for another firm; Send without a check → allowed with the warning recorded; the corroborated details are listed on the timeline; a person without the key cannot read the copy; every change through `AuditPort` | Code s. 24(2)(a); P-579 · **waits on:** FO-13, FO-5 (`FilesPort`) · decisions: none · reviewer + breaker (personal data, uploads) · **size:** 1 PR |
| FO-13s | screens | **Compliance panels and the complaints list (concept first, skill screen-concept):** a Conflict check panel and an Identity check panel on the lead-and-prospect screen (FO-4) and the client view, the step messages on Send, Convert and Signed offline, and a Complaints list with its record page. In `web/src/modules/front-office/compliance/`. **Touch:** those files, `tests/check_fo13s_compliance_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440 | P-579 · **waits on:** FO-13c, FO-13k, FO-13i, FO-4 · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1-2 PRs |

* **Rev 12 order (P-576):** FO-13 (schema) as soon as FO-1a merges (its own file, beside other lanes) → FO-13c (after FO-9a, FO-5) ∥ FO-13k (after PF-14) ∥ FO-13i (after FO-5) → FO-13s with the screens wave. **Size:** 5-6 small PRs (Hypothesis).

## Rev 13 (14 Nov, Lead B (3)): P-581's minimums for platform and front office (map §0 C groups 1-8, the founder's "Take recommended set")
**Requirements read at source** (newest snapshot `domain/requirements-2026-11-02/02-functional-requirements/`, read 14 Nov ~09:5x IST): SA-02 (v2.24), SA-03 (v2.29), SA-04 (v2.22), AG-01 (v1.26), AG-04 (v2.1), AG-05 (v2.1), AG-06 (v2.1), AG-12 (v2.11), AG-15 (v1.15), AG-16 (v1.24). **Three corrections to the map's group C IDs:** AG-12-91 is "Send me a test"; the preview with a real record is **AG-12-89 to -91 (AG-12 §3.8)**. AG-15-33 is **withdrawn** (do not build). AG-1-68 is the "default lead representative" setting, not a licence check; the licence-number check is **AG-1-34** (a soft typo warning against the body's format, "never a hard block", and AG1-D19 forbids any validity or expiry monitoring).
**Already covered, no new row:** failed-payment hold and recovery (PF-5: overdue day 0/7/12 notices, hold on day 14, hold ends only on payment, held firm gets 402 outside billing and download; SA-2-6..8a, SA-4-20..23, -25..27); private sign-up links (PF-5's `platform_signup_link`, 14 days, single use; the console part is PF-17 below); trial reminders 7/3/1 and trial-ended (PF-5); the trust "to move" list (FO-7t; widened below to AG-6-73 in full).
**Duplicate check (14 Nov ~09:5x IST):** BACKLOG on `lead/2026-11-07-lead31` (incl. X-1..X-22), `main`'s API, web and schema, and the 11 open PRs: no write-off, statement, export, video or meeting link, notification preference, office, support ticket, plan limit, storage limit, downgrade, yearly change, refund console, progress stream, "last update", licence format or batch-invite code or row. Each builder repeats it (P-526).
**Size (Hypothesis; the 19 Nov count settles it):** about 19-25 small PRs over the 14 rows below, ~45-65 changes; stream 4 (4) said "roughly 2-6 more days" for all of P-581 (two conversions). The largest: PF-16 billing rules (2), PF-17 console (2-3), PF-18 settings (3-4), FO-3v video (2), FO-7r money (2).

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-4s | runtime (permissions, API only) | **Sign-in for our own staff (the Super Admin side) behind `IdentityPort`:** a second identity pool for ExpatReady staff (the local stand-in mirrors it), two-step required, separate from every firm's staff; `system/*` keys only (`system/firm:read`, `system/billing:manage`, `system/billing:refund`, `system/signup-link:manage`, `system/support:reply`, `system/security:lock`), granted by fixed roles Platform Owner, Billing, Support (Sample, from SA-06); `/api/system/*` routes accept only `system/*` keys and every call writes an audit line with a reason where the row asks one; the PF-12 bypass role is used only by these named routes. **Touch:** new `api/src/platform/system-identity/*.ts`, `api/src/features/platform-system-identity.ts`, `tests/check_pf4s_system_signin.ts` | tested with a pass and a fail each: a firm token on `/api/system/*` → 403; a system token on a firm route → 403 (PF-4's rule); a Billing person without `system/billing:refund` → 403 on refund; no two-step → refused; every `/api/system/*` call has one audit line with the actor; the simulated configurator people (`user-A` …) unchanged | SA-02, SA-04 roles; SA-06; contracts §1.1 ("our support staff only") · **waits on:** PF-4 · decisions: whether the configurator's own staff later sign in here is the release holder's (asked) · **breaker: yes (permissions)** · **size:** 1 PR |
| PF-4c | runtime (permissions, API only) | **Multi-row invite and the licence-number check (AG-1-69, AG-1-34):** `POST /api/platform/invitations/batch` (1-20 rows of name, email, roles; Case Officer pre-selected by the screen): the seat check runs **once for the whole form** ("7 of 10 seats after these invites"), over the limit nothing is sent and the answer names how many to remove; duplicates inside the form and existing staff flagged per row; one invitation per row, all in one transaction, outbox rows last; no spreadsheet upload. **Licence-number check:** each body in `samples/representative-bodies-ca.json` (PF-6) gains an optional `numberPattern` read at the body's own official page (page, quote, date in the PR; where a body publishes none, no pattern and no warning); a mismatch returns a **warning, never a refusal** ("This doesn't look like a College licence number. Check it."); no validity, expiry or register look-up (AG1-D19). **Touch:** new `api/src/platform/identity/batch-invite.ts`, `api/src/platform/identity/licence-format.ts`, `samples/representative-bodies-ca.json` (the `numberPattern` field), `tests/check_pf4c_batch_invite.ts` | tested with a pass and a fail each: 3 rows with 2 seats left → nothing sent, "remove 1 person or upgrade"; 3 rows with 3 left → 3 invitations; the same email twice in a form → flagged on the second row; an existing staff email → flagged; two parallel batches never pass the limit together; a mismatching licence number saves with the warning; a body with no pattern gives no warning; a licence number never in a log, event or email | AG-1-34, -69; AG1-D19; SA-3-39 · **waits on:** PF-4, PF-4b · decisions: none · reviewer only · **size:** 1 PR |
| PF-15 | schema + runtime (platform: limits) | **Plan limits and the downgrade check (SA-3-39, -40, -58..62, SA-4-56):** `platform_plan` gains `active_individual_cases_limit`, `active_corporate_cases_limit`, `storage_limit_mb` (Sample values, set by the founder later) and `platform_subscription` gains the booked lower plan and its effective date, in `platform.prisma` with one migration (schema baton); one `EntitlementPort.check(firm, metric)` for seats, active individual cases, active corporate cases (hard limits) and storage (warn; **hard for that firm once 14 days over**, nothing deleted or locked, existing documents keep working; day-one alert to our team inbox and the "Storage over limit" email to the Owner); usage read through the case side's case-count read port (named by the release holder) and `FilesPort`'s per-firm bytes; `checkDowngrade(firm, targetPlan)` returns every conflict (usage, target limit, amount to reduce); while a lower-plan move is booked every check uses the lower limit per metric; a limit lowered by us on a live plan is not a downgrade (SA-3-62: over-limit firms keep what they have, new items refused). Over a hard limit → 409 `PLAN_LIMIT_REACHED` with the metric and limit. **Touch:** `prisma/schema/platform.prisma` + one migration folder, new `api/src/platform/entitlements/*.ts`, `api/src/features/platform-entitlements.ts`, `tests/check_pf15_limits.ts` | tested with a pass and a fail each: the 11th active individual case on a 10-case plan → 409, a closed case frees one; storage over → warning on day 1, uploads refused on day 15 (fake clock), back under → allowed; 8 staff to a 3-seat plan → the conflict "remove 5"; a booked lower move makes the lower limit apply at once; a limit we lower leaves existing items and refuses new ones; every limit change audited | SA-3-39, -40, -58..62; SA-4-56 · **waits on:** PF-5 (schema baton after it), FO-5 (`FilesPort`), PF-14 (the day-15 job), the case side's case-count port (release holder) · decisions: none · **breaker: yes (schema, money)** · **size:** 2 PRs (schema + port, checks) |
| PF-16 | runtime (money: our billing rules) | **Plan changes, trial controls and billing emails on our own screens, not Stripe's portal (SA-4-28..31, -49..50, -53, -55, -62, -79..82, -91):** plan changes move **off the Customer Portal** (its plan switching is turned off in the portal set-up; card, invoices and cancel stay there), because the portal cannot run `checkDowngrade` (SA-3-58: "no override"); `POST /api/platform/billing/change-plan` (Owner only) with a preview from Stripe's upcoming invoice: a change that raises the price applies at once with Stripe's proration; same or lower applies at the next renewal with no refund (a Stripe subscription schedule), only after `checkDowngrade` passes; monthly → yearly at once with a fresh year; yearly → monthly at the anniversary; during a trial any public plan switch is immediate and free, the trial end unchanged; **"Start my subscription now"** (`agent/subscription:upgrade`, card required; on failure the trial continues and the Owner is told); `GET /api/platform/billing/banner` (days left, card on file, amber in the last 3 days; Owner and Admin) for the trial banner on every page; **billing emails as fixed ExpatReady templates** (English; versioned in code; firms cannot edit) to SA-4-53's two recipient sets (documents to the billing email; every other notice to billing email, Owner and Admins), incl. plan change, lower plan booked, subscription started (early), trial extended, card expiring 30 days ahead (a PF-14 job reading the card's expiry), cancellation confirmation, yearly to monthly; Stripe Smart Retries set within the 14 days (set-up script, said in the PR). **Touch:** new `api/src/platform/billing/plan-change/*.ts`, `api/src/platform/billing/emails/*.ts`, `api/src/features/platform-billing-rules.ts`, the Stripe set-up script under `api/src/platform/billing/`, `tests/check_pf16_billing_rules.ts` | on Stripe test-mode fakes, tested with a pass and a fail each: an Admin changing plan → 403; a raise charges the prorated difference once; a lower move with too many staff → refused with the conflict; a lower move books for the renewal and the lower limits apply at once (PF-15); monthly → yearly starts a fresh year; a trial switch charges nothing and keeps the end date; Start now with no card → refused; a failed early start leaves the trial unchanged; each notice to the right set, once (fake clock); card-expiring 30 days before, once | SA-4-28..31, -53, -55, -56, -79..82, -89, -91; SA-3-58 · **waits on:** PF-5, PF-15, PF-14 · decisions: Lead B (P-566 (3)): plan changes on our page, not Stripe's portal (evidence: SA-3-58 "no override"; the portal books a downgrade without our check) · **breaker: yes (money)** · **size:** 2 PRs (plan changes and trial controls; emails) |
| PF-17 | runtime + screens (our staff console) | **Our team's console for running the service (SA-2-14, -22, -23; SA-4-24, -49, -50, -62, -80):** on PF-4s's sign-in, under `/api/system/*` and a small `web/src/modules/system/` area: **firms list with health and usage** (status, plan, trial end, payment state, usage against each limit, over-limit state, last staff sign-in; read only, `system/firm:read`); **overdue list** (every firm Overdue or on hold: day of the timeline, amount, last notice; "send reminder now" and "send update-card link", never a second timeline or a duplicate notice); **extend a trial** (`system/billing:manage`, pre-filled 7 days, reason, whole trial ≤ 90 days, the "Trial extended" email, reminders and banner moved; nobody shortens a trial); **refund** (`system/billing:refund`, all or part, reason, back to the original card through Stripe with a credit note reversing tax in proportion, the "Refund and credit note" email; the 30-day first-yearly refund ends the subscription into hold); **private sign-up links** (create for one email and country, revoke; states sent, opened, used, expired, revoked; no discount in the first build); **support tickets** from PF-18b (list, reply). Concept first for the screens (skill screen-concept), plain and internal. **Touch:** new `api/src/platform/system-console/*.ts`, `api/src/features/platform-system-console.ts`, new files under `web/src/modules/system/`, `tests/check_pf17_console.ts`, `tests/check_pf17_console_browser.ts` | tested with a pass and a fail each: a Support person cannot refund; an extension past 90 days → refused with the latest allowed date; a refund larger than the charge → refused; a refund writes one credit note and one email; a reminder sent twice in a minute → one notice; usage figures match PF-15's counts; every action audited with its reason; screens keyboard-only, axe-core, 1024/1440 | SA-2-14, -22, -23; SA-4-24, -49, -50, -62, -80 · **waits on:** PF-4s, PF-5, PF-15, PF-16; the screens PF-1 · decisions: none · **breaker: yes (money, permissions)** · **size:** 2-3 PRs (API, refunds, screens) |
| PF-18a | schema + runtime (firm settings) | **Personal notification settings and offices with their time zones (AG-16-10, AG-16-59, AG-16-68, AG-1-74):** `platform_notification_preference` (person, group, in-app on/off, email on/off) for the eight groups of AG-16 §3.3 with its defaults, a person seeing only the groups that can reach them, security emails always on, no firm ceiling, no digest; `NotificationPrefsPort.allows(person, group, channel)` that every sender calls (the case side's in-app notifications, map row 50, call it too); `platform_office` (firm, name, address province, IANA time zone pre-filled from the province by a short pack list, own business hours and closed days) shown only once a firm adds a second office; `OfficeClockPort.zoneFor(officeId)` and `hoursFor(officeId)` (the firm's own when one office); times shown in the item's office time with the office named, never converted; government dates stay calendar dates. **Touch:** `prisma/schema/platform.prisma` + one migration folder, new `api/src/platform/settings/notifications/*.ts`, `api/src/platform/settings/offices/*.ts`, `api/src/features/platform-settings-personal.ts`, `samples/province-time-zones-ca.json`, `tests/check_pf18a_settings.ts` | tested with a pass and a fail each: email off for a group → no email of that group, in-app still; a security email ignores the switch; a person never sees a group that cannot reach them; an office in Calgary pre-fills `America/Edmonton`; a closed day in one office does not close the other; one office → the firm's hours; firm A never reads firm B's offices; every change audited | AG-16-10, -11, -59, -68; AG-1-74 · **waits on:** PF-3, PF-4 (schema after PF-15 on the baton) · decisions: none · reviewer + breaker (schema) · **size:** 2 PRs (schema, API) |
| PF-18b | schema + runtime (support) | **Support tickets from every screen (AG-16-63):** `platform_support_ticket` and `platform_support_message` (insert-only) in `platform.prisma`; a firm user raises a ticket (one text box, optional attachments through `FilesPort`, the current page noted, no priority); each user sees their own, Owner and Admin see the firm's and may reply; status incl. "Waiting on firm"; our team replies from PF-17; an email to our support inbox by `MailPort`; keys `agent/support-ticket:create`, `agent/support-ticket:list`. **Touch:** `prisma/schema/platform.prisma` + one migration folder, new `api/src/platform/support/*.ts`, `api/src/features/platform-support.ts`, `tests/check_pf18b_support.ts` | tested with a pass and a fail each: a Case Officer sees only their own tickets; an Owner sees all the firm's; firm A never sees firm B's; an attachment over the size limit → refused; a message cannot be edited or deleted; our reply sets "Waiting on firm" | AG-16-63 · **waits on:** PF-4, FO-5 (`FilesPort`) · decisions: none · reviewer only · **size:** 1 PR |
| PF-18s | screens | **My account → Notifications, Advanced → Offices, the "?" button and Help & support (concept first):** in `web/src/modules/platform/settings/`; the "?" sits in PF-6's frame on every page. **Touch:** those files, `tests/check_pf18s_settings_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440 | AG-16-10, -63, -68 · **waits on:** PF-18a, PF-18b, PF-6 · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1 PR |
| FO-3v | runtime + screens (booking) | **Video meeting links (AG-4-58, AG-4-59, AG-16-73):** each person sets their own in My account → Video: **"My meeting link"** (one `https` URL, ≤ 2,048 characters, else "Enter a full link starting with https://") and **Connect Zoom** (OAuth to the person's own Zoom; each booking gets its own Zoom meeting; tokens in the secrets store, encrypted, never logged; hidden until Zoom approves our app: an outside clock, on the founder's account list under P-580); "Use for my video bookings" lists only the sources the person has (Zoom → My meeting link; Meet and Teams come with the calendar connection, map row 43, not shaped yet); disconnecting moves the choice to the next source; no firm video account, no Webex; only one's own connection (another person's → 403, no `agent/*` key); FO-3's confirmation email, `.ics` LOCATION and reminders carry the link; a reschedule moves the Zoom meeting, a cancel deletes it. STANDARDS §1 entry for Zoom's API in the PR (data location: Zoom processes in the US; a privacy-notice line; Unconfirmed: no counsel). **Touch:** new `api/src/front-office/booking/video/*.ts`, `api/src/features/front-office-video.ts`, new files under `web/src/modules/front-office/video/` (the My account panel), `tests/check_fo3v_video.ts` (recorded Zoom responses, no network in CI) | tested with a pass and a fail each: `http://…` → refused with the message; a booking with My meeting link carries it in the email and `.ics`; with Zoom, two bookings get two meetings; a reschedule updates the meeting once, a cancel deletes it; Zoom disconnected → the next booking uses My meeting link; another person's connection → 403; the token never in a log, column or response | AG-4-29, -58, -59; AG-16-73 · **waits on:** FO-3, PF-6 (My account frame) · decisions: Meet and Teams links wait on map row 43 (calendar sync; owner to name, release holder) · **breaker: yes (external service, secrets)** · **size:** 2 PRs (My meeting link + choice; Zoom) |
| FO-5p | runtime (retainers) | **Preview a retainer or consultation agreement with a real record (AG-12-89..91, the front office's own templates):** pick a prospect or client the person may open; download the filled `.docx` marked "Preview — not sent" across each page, must-fill gaps listed beside the download, nothing stored and no version made; without a record, a Sample record; "Send me a test" emails the preview to the person's own staff email with "[Test]" in the subject, noted on the template's history, never on a client record. (The firm's email and WhatsApp templates are the case side's, map row 45: their preview line is sent to the release holder.) **Touch:** new `api/src/front-office/retainers/preview/*.ts`, `tests/check_fo5p_preview.ts` | tested with a pass and a fail each: a record the person may not open → 404; the preview shows the real values and the mark; a missing must-fill value is listed; nothing stored, no version; "Send me a test" goes only to the caller's own address | AG-12-89..91 · **waits on:** FO-5 · decisions: none · reviewer only · **size:** 1 PR |
| FO-6d | runtime (signing) | **Send any document for signature (AG-5-61):** the signature request's document kind gains `OTHER` (a PDF the firm uploads through `FilesPort`, or a PDF in the client's documents through the case side's documents read port); signers picked at send: one or more people on the prospect or case and optionally one firm person (no firm signer unless added; a retainer keeps the firm signature by default); the same door, consent, email code (P-564), reminders, expiry, void, signed offline and signed copy as FO-6; the retainer-only effects (won, invoice warning) never fire for `OTHER`; key `agent/portal:request-work`; government forms are never sent this way; nothing is sent until a person clicks Send. **Touch:** new `api/src/front-office/signing/any-document/*.ts`, one enum value in `prisma/schema/front-office-signing.prisma` + one migration folder, `tests/check_fo6d_any_document.ts` | tested with a pass and a fail each: an uploaded PDF signed by two people ends with the sealed copy filed; `OTHER` never moves a prospect or makes a client; a non-PDF → refused; a person without the key → 403; another firm's document id → 404 | AG-5-61 · **waits on:** FO-6; the case-documents part waits on the case side's documents read port (until then uploads only, said on screen) · decisions: organisation signatory and stored signature stay out (X-15) · **breaker: yes (signing, schema)** · **size:** 1 PR |
| FO-6ds | screens | **"Send for signature" on a prospect, client or document (concept addendum to FO-5s r2, challenged):** pick the file, the signers, optional firm signer, Send; the request's state list. **Touch:** new files under `web/src/modules/front-office/sign/`, `tests/check_fo6ds_send_browser.ts` | the addendum's journey; keyboard-only; axe-core; 375/1024/1440 | AG-5-61 · **waits on:** FO-6d, FO-5s · decisions: concept addendum and challenge first · **breaker: yes (new screen)** · **size:** 1 PR |
| FO-7r | runtime (money, API) | **Money summary and client statement, write-offs, period exports (AG-6-28, AG-6-76, AG-6-31):** per case and per client, per currency (never summed): billed, paid, paid from trust, credited, written off, refunded, owed, days the oldest invoice is overdue, trust balance, credit, unbilled; it supplies the owed figure the case side shows; **"Send statement"** for a period (default all, incl. trust movements) as a PDF through `DocumentRenderPort`, emailed by a person with a fixed "Your statement" wording until the case side's template library (map row 45) holds it; no automatic statements; **write off a small balance** of one issued invoice with a reason (`WRITTEN_OFF`; reminders stop; a later payment counts as extra money; a draft cannot be written off; a credit note on it → "Already settled by write-off"; key `agent/invoice:void`; no automatic threshold); **exports per period**: one CSV each for invoices, payments, refunds, credit notes, write-offs and trust ledger, the minimum columns of AG-6-31, own currency, built by a `JobPort` job with a download link, header-only when empty, audited, key `agent/billing:export`, no accounting sync. **Touch:** new `api/src/client-money/reports/*.ts`, `api/src/client-money/write-offs/*.ts`, `api/src/features/client-money-reports.ts`, `tests/check_fo7r_reports.ts` | tested with a pass and a fail each: two currencies never summed; a statement PDF for a period lists trust movements; a write-off on a draft → refused; a credit note after a write-off → refused; reminders stop after a write-off; an export for an empty period gives header-only files; an export of 10,000 rows finishes in the background without blocking requests; firm A's export never holds firm B's rows | AG-6-28, -31, -76; AG-6-12, -21 · **waits on:** FO-7b, FO-7t, PF-14; the write-off table in FO-7a (amended below) · decisions: none · **breaker: yes (money)** · **size:** 2 PRs (write-offs + summary/statement; exports) |
| FO-14 | schema + runtime (client activity) | **The client's progress stream and "last update" (AG-15-29, -30, -54):** `fo_portal_activity_event` (insert-only: sign-in, view, upload, questionnaire progress, submit, signed, paid) recorded through `PortalActivityPort.record(...)` by every client door we own (the signing door, pay links, booking self-service) and by the client portal when it exists (map row 62) and the case side's upload and questionnaire links (row 101); the per-client engagement strip read (last seen, activity, pending items with their age, the pending list read from the case side's request port); **"last update"**: the date the firm last told the client something, set only when a "Tell the client" message (AG-10-73, the case side's send) succeeds on any channel, via its event, never by a government email arriving and never by an automatic message. Not here: the stalled-clients dashboard and nudges (AG-15-31, -32: X-13); AG-15-33 is withdrawn. **Touch:** new `prisma/schema/front-office-activity.prisma` + one migration folder, new `api/src/front-office/activity/*.ts`, `api/src/features/front-office-activity.ts`, `tests/check_fo14_activity.ts` | tested with a pass and a fail each: a signing-door visit and a payment each add one event; a client never sees another client's events; "last update" moves on a successful Tell-the-client send and not on a failed one or a filed government letter; events refuse update and delete | AG-15-29, -30, -54; AG-10-73 · **waits on:** FO-6, FO-7c; the portal page that shows it waits on map row 62 (client login portal: **no owner yet**, asked of the release holder) and the case side's Tell-the-client event · decisions: owner of row 62 (release holder) · reviewer + breaker (schema, client data) · **size:** 1-2 PRs |

**Amended rows (rev 13):**
* **FO-7a** gains `money_write_off` (invoice, amount, reason, by, at; one per invoice) and `money_move_batch` + `money_move_line` (AG-6-73: line kind trust-applied, wrong-account, card-fee; batch date, by; insert-only; undone only by a reversing batch with a reason), so FO-7r and FO-7t need no schema of their own. Its brief (next to write) carries them.
* **FO-7t's "to move" list becomes AG-6-73 in full:** lines added automatically (trust applied to an invoice, money received into the wrong account, card fees on the trust account), totals per currency and direction, "I moved these" (tick lines, bank-transfer date, one click → one `MoveBatch`; we move no money), a line returned before moving (dispute or credit note) removed, one home-screen item only when a line is older than 25 days for `agent/payment:record` holders, batches never edited, only undone with a reason. Tests add: two people ticking the same line at once → one batch; undo without a reason → refused.
* **PF-5:** the Customer Portal's plan switching is off (card, invoices and cancel stay); plan changes are PF-16's (Lead B decision above). No other change; its brief gets one line.

**Left out of the first build by this revision** (for the "After the end-to-end production-grade system" section, P-582; the release holder adds them): a discount on a private sign-up link (SA-2-22, SA-4-43); our billing emails editable in a template catalogue and in French (SA-4-89; the first build has fixed English templates in code); "Add holidays for [province] [year]" suggestions (AG-16-74); the email/calendar connected column on Team (AG-1-76).
**Rev 13 order (P-576):** PF-4s and PF-4c after PF-4 (identity lane) · PF-15 after PF-5 on the schema baton, then PF-18a, then PF-18b · PF-16 after PF-15 · PF-17 after PF-4s, PF-16 · FO-5p after FO-5 · FO-6d after FO-6 · FO-3v after FO-3 · FO-7r after FO-7b, FO-7t · FO-14 after FO-6, FO-7c · screens with their wave: PF-18s, FO-6ds, PF-17's screens.

## Rev 14 (14 Nov, Lead B (3)): P-584 module homes, P-585 owners, P-586 items
**What changed and why.** P-584 (Lead 41, from A51 rev 3 §12) makes **messages and templates (email, WhatsApp) with the consent gate, automation, custom fields and views, client portal login and the complaints register platform services** (Lead B's under P-558), so the case side never depends on the front office to reach a client. P-585 gives Lead B map row 62 (client portal) and row 43 (calendar sync). P-584 (10): `money_*` tables join PF-12's walls now. P-584 (9): the listed one-line hooks (contracts §5, PF-3's case-feed line) are the written exception to one change, one module; a new hook needs both owners. Binding text: contracts §9.
**Duplicate check (14 Nov ~10:0x IST):** `main` has no sending layer, consent gate, template store or automation engine: only the demo inbox stand-in (`api/src/person-link.ts` `DemoInboxController`, `demo_message` in `links.prisma`, SI-20), which the platform's `local` adapter keeps working. BACKLOG: map rows 45-49 had no row (case side, unshaped); FO-11 and FO-12a named "map rows 48/49" as the case side's. Open PRs: none on these areas.
**Size:** no new scope (rows 45-49, 36, 62 were already in the map's 881); about 9-11 PRs move into Lead B's lanes (Hypothesis).

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-19a | schema + runtime (platform: messages) | **Messages schema and the consent gate's store (map rows 48, 49; P-584 (1)):** own area file `platform-messages.prisma` + one migration: `msg_consent` (firm; subject kind `FO_PERSON | CASE_PARTY | STAFF` and id; channel `EMAIL | WHATSAPP`; purpose `SERVICE | MARKETING`; wording version; given at, withdrawn at; source and evidence), `msg_consent_wording` (versioned, hashed, write-once; SA-11-29; **moved here from FO-1a**), `msg_suppression` (address or number, reason `HARD_BOUNCE | COMPLAINT | UNSUBSCRIBE | STOP | STAFF`), `msg_template` + `msg_template_version` (owner `PLATFORM | FIRM`, key, kind, channel, language, body, must-keep fields, published; versions write-once), `msg_outbox` (firm, recipient, channel, template version, rendered hash, class `TRANSACTIONAL | SERVICE | MARKETING`, state `QUEUED | SENT | DELIVERED | BOUNCED | FAILED | SUPPRESSED`, provider id), `msg_event` (insert-only delivery events), `msg_send_counter` (firm, day); **`ConsentPort`** (`record`, `withdraw`, `allows(subject, channel, purpose)`, wording publish) so FO-2 writes consent at capture through it. **Touch:** new `prisma/schema/platform-messages.prisma`, one migration folder, new `api/src/platform/messages/consent/*.ts`, `api/src/features/platform-consent.ts`, `tests/check_pf19a_messages_schema.ts` | migration on empty and demo-data copies, `migrate diff` empty; tested with a pass and a fail each: a consent wording version refuses edit and delete; a withdrawn consent makes `allows` false at once; `allows` for marketing without a consent row → false, for a transactional class → true unless suppressed; a suppressed address → false for every class; events refuse update and delete; `firm_id` first in every index; firm A never reads firm B's consent | AG-10-22..27, AG-2-83; SA-11-29; P-584 (1) · **waits on:** PF-3; runs as the third schema slot after FO-1a or FO-1b merges (P-559 (3): two at once) · decisions: Lead B: the consent store is the platform's, one place for proof of consent (CASL reading Unconfirmed: no counsel) · **breaker: yes (schema, consent)** · **size:** 1-2 PRs |
| PF-19b | runtime (platform: sending) | **One sending path for both sides behind `MessagePort` (map rows 47, 48, 49):** `MessagePort.send({ firm, subject, channel preference, class, template key + values | body })` writes the outbox in the caller's transaction and a `JobPort` worker sends after commit; the consent gate checked at send time (class, purpose, suppression; marketing needs consent; a quiet person (AG-2-59) is the caller's check); **Amazon SES ca-central-1 through Nodemailer** (map row 48's pick; PF-L adds both libraries) and a `local` adapter writing the existing demo inbox (SI-20 stays working for the case side's links); the firm's sender name, Reply-To the firm's contact address, one fixed layout (row 47); one-click unsubscribe (List-Unsubscribe and List-Unsubscribe-Post) on marketing and service mail, landing on a page that records it; SES bounce and complaint notifications verified and turned into suppressions; **a daily send cap per firm, tight in trial** (Sample 50 a day in trial, 2,000 active; row 48's F14 risk); channels register (email here; WhatsApp is FO-11's registration); `MailPort` (PF-4b's interface for staff and system email) becomes a thin caller of `MessagePort` with class `TRANSACTIONAL`. **Touch:** new `api/src/platform/messages/send/*.ts`, `api/src/platform/messages/channels/email/*.ts`, `api/src/features/platform-messages.ts`, the `MailPort` adapter file from PF-4b (one line: route through `MessagePort`; Lead B's file), `tests/check_pf19b_sending.ts` (recorded SES responses, no network in CI) | tested with a pass and a fail each: a marketing message without consent → `SUPPRESSED` with the reason, nothing sent; a transactional message to a suppressed address → not sent; a send in a rolled-back transaction never goes out; a crash after commit sends once (idempotent job); a hard bounce suppresses the address once; an unverified bounce notice → 400, nothing stored; the 51st trial message of the day → held with a "daily limit" reason and one item to our team; unsubscribe by one click records the withdrawal and the next marketing send is suppressed; the demo inbox still shows the case side's link emails; firm A's sends never carry firm B's sender | AG-10-1, -3, -5..7, -20, -22..27, -25; AG-16-17; P-584 (1) · **waits on:** PF-19a, PF-4b, PF-14, PF-L · decisions: none · **breaker: yes (sends to clients, external service, public unsubscribe door)** · **size:** 2 PRs (outbox + gate + local; SES + bounces + unsubscribe) |
| PF-19c | runtime (platform: templates) | **Templates for every module, with preview (map row 45; AG-12; P-584 (1), Lead 42 14 Nov: the preview sits here):** modules register template kinds and the fields each provides (`TemplateRegistry`); a firm copy of a starter ("use until you edit"); **plain named-field replacement, a few lines of our own** (row 45's pick: no Handlebars), fed only by the field picker; an unknown field blocks publishing (AG-12-70); must-keep fields cannot be removed; versions write-once; English required, French optional; the WhatsApp version field (FO-11 syncs approval); **preview with a real record** (pick a lead, client, case or organisation the person may open; their language; conditional sections resolved; must-fill gaps highlighted; without a record, a Sample record) and **"Send me a test"** (to the person's own staff email, "[Test]" in the subject, on the template's history, never a client record) (AG-12-89..91); ExpatReady's own kind-1 emails (staff account, billing (PF-16), unsubscribe confirmations) are platform templates firms see read-only. **Touch:** new `api/src/platform/messages/templates/*.ts`, `api/src/features/platform-templates.ts`, starter text under `samples/templates/`, `tests/check_pf19c_templates.ts` | tested with a pass and a fail each: publishing with an unknown field → refused naming it; removing a must-keep field → refused; a preview of a record the person may not open → 404; the preview resolves a conditional section both ways; "Send me a test" reaches only the caller; a published version never changes; a firm cannot edit a platform template | AG-12-44, -45, -65, -66, -70, -89..91, -95, -99 · **waits on:** PF-19b · decisions: none · reviewer + breaker (firm-supplied text) · **size:** 2 PRs |
| PF-19s | screens | **Templates area, the editor (a plain text box with the field picker, row 46) and the preview (concept first, skill screen-concept).** In `web/src/modules/platform/messages/`. **Touch:** those files, `tests/check_pf19s_templates_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440 | AG-12 §3.1-3.8 · **waits on:** PF-19c, PF-6 (frame) · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1-2 PRs |
| PF-20 | schema + runtime (platform: automation) | **The automation engine, moved from FO-12a (P-584 (2)); same Done when as FO-12a (rev 11)** with these changes: area file `platform-automation.prisma`, tables `auto_recipe`, `auto_run`, `auto_step_run`, code `api/src/platform/automation/`; **each module registers its own triggers, actions and recipes** (`AutomationRegistry`): the front office registers FO-10's assignment and FO-12b's four recipes, the case side registers its own; the message action sends through PF-19b's `MessagePort`. **Touch:** new `prisma/schema/platform-automation.prisma`, one migration folder, new `api/src/platform/automation/*.ts`, `api/src/features/platform-automation.ts`, `tests/check_pf20_engine.ts` | FO-12a's tests, plus: a module's action registered twice → start-up stops naming it; a recipe of an unregistered module is never run | AG-2-31, -33, -59; AG-11; map row 36; P-584 (2) · **waits on:** PF-14, PF-19b · decisions: none · **breaker: yes (schema, sends to clients)** · **size:** 2 PRs |
| PF-20s | screens | **The Automatic messages page and Advanced → Timings (AG-12 §3.3, AG-16-50, -51; moved from FO-12s's settings part):** one row per automatic message from every registered module with Send automatically / Ask me first / Off and its timing in one plain sentence, linking to Timings; approvals waiting. **Touch:** new files under `web/src/modules/platform/automation/`, `tests/check_pf20s_automatic_messages_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440 | AG-12 §3.3; AG-16-50, -51 · **waits on:** PF-20, PF-19s · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1 PR |
| PF-21 | runtime (platform: complaints register) | **The complaints record as a firm-level platform register, moved from FO-13k (P-584 (8)); same Done when as FO-13k (rev 12)**, with its tables `plat_complaint` and `plat_complaint_event` (insert-only) in a new area file `platform-register.prisma` (the fields Sample until the College's by-laws are read, as before), code `api/src/platform/complaints/`; a complainant may be any front-office person, case party or other person (subject kind + id). **Touch:** new `prisma/schema/platform-register.prisma`, one migration folder, new `api/src/platform/complaints/*.ts`, `api/src/features/platform-complaints.ts`, `tests/check_pf21_complaints.ts` | FO-13k's tests, plus migration on empty and demo-data copies, `migrate diff` empty | Code s. 24(3)(r)(v), 29, 37; P-579, P-584 (8) · **waits on:** PF-3, PF-14 · decisions: none · reviewer + breaker (schema, personal data) · **size:** 1-2 PRs |
| PF-21s | screens | **Complaints list and record page (moved out of FO-13s; concept first).** In `web/src/modules/platform/complaints/`. **Touch:** those files, `tests/check_pf21s_complaints_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440 | P-579, P-584 (8) · **waits on:** PF-21, PF-6 · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1 PR |

**Amended rows (rev 14):**
* **FO-1a:** drops `fo_consent` and `fo_consent_wording` (now `msg_consent` and `msg_consent_wording` in PF-19a); `fo_web_form` keeps a reference to the wording version. Brief updated.
* **FO-2:** writes the consent given on the public form through `ConsentPort.record` in its one transaction; **waits on PF-19a** as well as FO-1a and PF-4. Brief updated.
* **PF-L:** also adds `nodemailer` and `@aws-sdk/client-sesv2` (map row 48's pick) with STANDARDS §1 entries in the gate file. Brief updated.
* **PF-4b:** `MailPort` is created there as the interface for staff and system email with the `local` adapter (demo inbox); PF-19b later routes it through `MessagePort`. No brief change needed beyond that note (added).
* **PF-12:** **`money_*` tables join the walls now (P-584 (10))**, with `msg_*`, `auto_*`, `plat_complaint*` and every later PF/FO table; **no money route before money walls:** FO-7b waits on PF-12 (with FO-7a merged), so PF-12 moves up to run right after FO-7a. A table added after PF-12 enables its policy in its own migration (same pattern, PF-12's test extended).
* **FO-11:** registers its WhatsApp channel in PF-19b (platform), not in a case-side file; its "map rows 48/49" waits become PF-19b; the release-side line OK is no longer needed. Touch list: `api/src/front-office/whatsapp/*.ts` plus one registration line in `api/src/platform/messages/channels/` (Lead B's own file).
* **FO-12a → PF-20; FO-12b, FO-10, FO-12c** stay in the front office and register with PF-20 (FO-12c sends through PF-19b); **FO-12s** keeps Add to follow-up, Enrolled in, message many and the assignment panel; its settings part moves to PF-20s.
* **FO-13:** drops the complaint tables (now PF-21); keeps `fo_conflict_check` and `fo_identity_check`. **FO-13k → PF-21. FO-13s** keeps the Conflict and Identity panels; the complaints list moves to PF-21s. **FO-13i:** the identity check's result (method, date, by; never the document) is carried on `prospect.won` (P-584 (8)); contracts §2.6.
* **FO-7r (P-586 (5) item 14):** adds **AG-6-30** (every list, ledger and statement paginated and filtered on the server, no in-memory scan; 10,000 invoices → page 1 within the read budget; a request without a page size gets the default) and **AG-6-29's facts** (refunds, credit notes, write-offs and trust movements kept as separate facts; a disputed invoice stays in ageing; dashboards are AG-14's, not here).
* **PF-18a (P-586 (5) item 15):** reconciled with PF-3: **PF-3's firm-wide business-hours and closed-days keys are the firm's single office's values** (no copy, no second store); PF-18a's per-office hours and closed days apply only once a second office exists; adds `platform_staff.office_id` (a host's office; none → the firm's zone) and `OfficeClockPort.closedDaysFor(staff, date)`, which FO-3's slot service calls (one call in FO-3's files, Lead B OK as owner of both) so **the host's office decides closed days (AG-4-60)**; business hours never limit slots (AG04-D22).
* **FO-5p:** stays for the retainer and consultation agreement `.docx`; the email and WhatsApp template preview is PF-19c's.

**Narrowed X-14 (P-586 (5) item 15; for the release holder):** "Booking extras: caps per host, group sessions, round robin, several hosts (AG-4-6, AG-4-12, AG-4-51, AG-4-65); case calls and handing over future bookings (AG-4-54, AG-4-55, AG-4-64). Closed days per firm and per office are in the first build (AG-4-7 in FO-3 and PF-3; AG-4-60 in PF-18a); holiday suggestions are X-25."

**Shaped next (owners named by P-584/P-585; rows two ahead):** PF-4p client portal identity (a client pool walled from staff, P-584 (4); map row 62's login part; the portal's pages stay with the module that owns each) · PF-22 custom fields and views with per-module registration (P-584 (2); cards to read first) · FO-3s calendar sync, two-way, behind a `CalendarPort` (map row 43, P-585 (4); also brings Meet and Teams links to FO-3v) · PF-19m connected mailbox with messages (map row 52, P-584 (3); Google's review is an outside clock) · FO-15 AS-1 record and screen (P-584 (7): the rules run in the configurator through its door; the front office never imports the engine).
**Rev 14 order (P-576):** PF-19a in the third schema slot after FO-1a or FO-1b, before FO-2 · PF-12 right after FO-7a, before FO-7b · PF-19b after PF-4b, PF-14, PF-L · PF-19c after PF-19b · PF-20 after PF-19b (replacing FO-12a's place) · PF-21 any time after PF-14 (its own file) · screens with their wave.

## Rev 14.1 (14 Nov, Lead B (3)): waits pointed at the case-side contract v0.1 (P-588)
Source: `product/design/case-side-contract-v0.1-2026-11-14.md` on `lead/2026-11-07-lead31` (§1 rule 3-4, §2.7, §3.1-§3.5, §4, §7). No new rows; amendments only.
* **Every row and brief:** cross-module port interfaces, their fakes and shared event payload types go in **`prototype/studio/ports/`** (`*.port.ts`, `fakes/*.fake.ts`, `events.ts`; imports `zod` only); adapters stay in the module's own folder. Ours there: `EntitlementPort`, `ConsentPort`, `MessagePort`, `MailPort`, `JobPort`, `FilesPort`, `DocumentRenderPort`, `ClientMoneyPort`, `PersonMergePort`, `OfficeClockPort`, `NotificationPrefsPort`, `PortalActivityPort`. The front office never imports `engine/` or case-side files; the CI import-boundary check is the release side's (contract §1 rule 4). Added to the brief rules line.
* **PF-15:** waits on the case side's **`CaseCountPort`** and its `case_decision` row (contract §3.4); "active" is **SA-3-47** (from creation until decision or withdrawal; a reopened case counts again), individual vs corporate by **SA-3-4**; the hard limit is checked **inside the case side's case-open transaction** (advisory lock on the firm, then `EntitlementPort.check` with the count read in that transaction); the platform keeps its own tally from `case.opened`, `case.closed`, `case.reopened` and the port reconciles. PF-15 ships `EntitlementPort` in `ports/` with its fake, and its tests add: two parallel case openings at the limit → one opens.
* **FO-9a:** the shared match rules (normalise email and phone, name similarity score) are **`ports/matching.ts`** (pure), created by FO-9a and also used by the case side's `PartySearchPort`; **no `DuplicateCheckPort`**: the duplicate result travels on `prospect.won` (contract §4). Brief updated.
* **FO-9b:** implements **`ports/person-merge.port.ts`** (`PersonMergePort`), called inside the case side's merge transaction; a match involving a client with a case goes to the case side's **`ClientMergePort`** (`mergeImpact` shown before anyone confirms; `mergeClients`, `undoMerge`); the manual path stays until that door exists. Waits on `ClientMergePort` for the client part only.
* **FO-13 / FO-13c:** the conflict search calls **`PartySearchPort.search`** (contract §3.1); when it returns `hidden_count` > 0 the check **cannot be recorded as `NO_CONFLICT` until a person who may see the matches confirms** (`needs_confirmation_by_role`); `fo_conflict_check` gains `hidden_count`, `confirmed_by`, `confirmed_at`. FO-13 brief updated; until the port exists FO-13c searches clients and prospects only, said on screen.
* **FO-15 (shaped next):** AS-1 on the lead calls **`EligibilityPort`** (`listAssessable`, `requiredFacts`, `assess` with `persons` per role; contract §3.2); the front office stores the result with `rules_version` on the lead and carries it on `prospect.won`; override is the front office's record until a case opens.
* **FO-14 / timeline / FO-7 screens:** read cases through **`CaseSummaryPort.forClient`** (contract §3.5; accepts `fo_person_id` and `fo_company_id`, so client money needs no mapping table).
* **Contracts §2.6 `prospect.won`:** carries the assessment result (when one exists), the identity-check result and the duplicate result. Consumers listen also to `case.closed`, `case.reopened`, `client.merged` (front-office timeline; PF-15's tally).
* **PF-4s:** **`PersonPreference`** (`person_preference`: actor, key, value; a person's view choices, `api/src/studio.ts` C11.10) is owned by platform identity (contract §2.7). It stays in `cases.prisma` until the identity join (the release Lead's row) re-keys `actor` from the simulated ids to platform staff ids; that row moves it into `platform.prisma` with a firm set from the staff member (none for our own staff) and a `PreferencePort`; PF-12's walls cover it then. PF-4s itself does not move it.

## Rev 14.2 (14 Nov 12:26 IST, Lead B (3)): FO-1b keys now; PF-4t type checks for module folders

**FO-1b, amended (answer on #1741, comment 6873446019; release holder agrees):** FO-1b adds the four back-relation lines on `platform.prisma` itself: `PlatformFirm.foConsultationTypes`, and `PlatformStaff.foAvailability`, `foTimeOff` and `foBookings`. It counts as a one-line hook with both owners' OK (contracts §9). The real foreign keys, `(firm_id) → platform_firm(id)` and `(firm_id, staff_id) → platform_staff(firm_id, id)`, both RESTRICT, go in its one migration folder. There is no follow-up migration. The stand-in staff and firm triggers are dropped; a host-list trigger stays only if hosts are an array. Done when adds, with a pass and a fail each: a cross-firm staff reference gives 23503; deleting a staff member who has a booking is refused. If FO-1b and PF-4 both touch `platform.prisma`, the second to merge re-applies its lines on main's file and shows `migrate diff` empty.

**PF-4t, new (from PF-4 #1744 item 4, which the release holder sent to Lead B): module folders under the type check.** *Why:* `api/tsconfig.json` `include` is `src/*.ts`, `src/features/**`, `../engine/*.ts` and `../tests/*.ts`. So CI's "types" job (`tsc --noEmit`, P-291) never checks `src/platform/`, `src/front-office/` or `src/client-money/`, the module code PF/FO rows add. *What:* add `"src/platform/**/*.ts"`, `"src/front-office/**/*.ts"` and `"src/client-money/**/*.ts"` to `include`, and fix any type errors this shows, in those folders only. Step 0: check whether the runtime loader (tsx 4.23.15) runs `@` decorators in those folders. If it does, PF-4's `decorate(...)` calls may become decorators; if not, they stay, and the PR says why. *Touch list:* `api/tsconfig.json` (one line, the release holder's OK as a shared file) and existing files under `api/src/platform/`, `api/src/front-office/` and `api/src/client-money/` for type fixes only; no behaviour change. *Done when:* the "types" job passes with the new includes; a deliberate type error under `src/platform/` fails it (shown once in the PR, then removed); every existing suite, the demo reset and C10.1 pass unchanged. *Waits on:* PF-4 merged. *Size:* S. *Breaker:* no (no door, no schema); Opus reviewer. *Duplicate check:* BACKLOG, open PRs and `git grep -n '"include"' -- '*tsconfig*.json'`; one line.

## Rev 15 (14 Nov 12:44 IST, Lead B (3)): MVP-CHECKLIST §A gaps for platform and front office (Lead 44's ask)

**Asked:** Lead 44 (release holder) asked for these, from the draft `MVP-CHECKLIST.md` §A "Flags" on `lead/2026-11-07-lead31`:
* map rows 13, 15, 24, 34, 39, 50 (the list itself), 85 and 86;
* the booking-screen part-gaps of 37, 41 and 42.

**Requirements read at source:** newest snapshot `domain/requirements-2026-11-02/`, read 14 Nov 12:3x IST by a read-only helper and checked by Lead B. Files:
* SA-02 v2.24, SA-08 v2.13, SA-11 v2.16;
* AG-02 v2.6, AG-04 v2.1, AG-07 v3.12, AG-10 v1.26;
* `01-techno-functional/` ADR NFR5-05 and NFR5-14, Doc-1 §8.4;
* `07-Founder-Decisions-Log.md` L304-306 ("CloudWatch first").

**Module decision on 85 and 86: yes, both are Lead B's, but they go in Platform, not Front office.**
* SA-11 puts the breach register, the register of requests made to us, and legal holds in our own console (`system/*` keys, the Platform Owner).
* A client's request to their firm is no register in Release 1. It is the person export (PF-26 below) plus a case-side task with the category "Client request" (AG-13; map row 75, the release holder's tasks row).
* This matches complaints (P-584 (8), PF-21): the registers share `platform-register.prisma`.

**Map item 8 (sub-domain or one address) is settled by the requirements, so it is no founder question.**
* SA-2-27 and SA2-D8 give each firm `<firm>.expatready.com`.
* AG-4-16 r5 and AG-15-27 put custom domains in Release 2.

**Duplicate check (14 Nov 12:4x IST):**
* Searched: BACKLOG on `lead/2026-11-07-lead31` (incl. X-1..X-26), this rows file through rev 14.2, `main`'s API, web, schema and `package.json`, and the open PRs (#1741, #1742, #1744, #1728).
* Not found: no log redaction, metric, alarm, secret loader, field encryption, web address, person export, notification list, data-request, legal-hold, breach, booking-screen, staff-calendar, availability-screen or consult-record row or code.
* Partial overlaps, named on each row:
  * PF-7 checks images for committed keys.
  * PF-18a stores notification preferences (in-app on or off per group); its `NotificationPrefsPort` is what the list below calls.
  * FO-3 is the booking API, with no type, hours or consult-record routes.
  * FO-1b has the booking tables.
  * FO-3v says its Zoom tokens sit "in the secrets store, encrypted": PF-24 below is that store, so FO-3v now waits on it.
  * PF-8 (cloud deploy) is only named, and needs the founder's Canadian cloud account (P-558 (5)).

**No new library in any row below.**
* Logs: NestJS 11's own `ConsoleLogger` with `json: true`.
* Metrics: CloudWatch's embedded metric format, written as log lines.
* Encryption: `node:crypto` AES-256-GCM.
* Calendar grid: our own components.
* Any builder who finds one needed stops at STANDARDS §1 first.

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-23 | runtime (running it: logs, metrics, alarms) | **Logs nobody can read personal data from, metrics and alarms (map row 13).** (1) **One logger:** NestJS `ConsoleLogger` `json: true` behind `LogPort`; every line has time, level, `correlationId` (from `X-Request-Id` or new), `firmId` when known, route, status and duration; a redaction step at the logger drops personal fields by name and pattern (email, phone, names, document numbers, tokens, `Authorization`, cookies, message bodies, subjects, attachment names; SA-11-37, BR-16): entries carry record ids and rule names only. (2) **Metrics** as CloudWatch embedded-metric-format lines (request count, errors and latency per route; job runs, failures and age per queue; mail sent and bounced; audit-write failures). (3) **`AlertPort.raise(kind, detail)`** (fake in CI, CloudWatch alarm via the log line in the cloud) for: audit-write failure after retry and a hash-chain break (SA-11 BR-2, BR-5), a stuck job (SA8-D40's constant), and a privacy-request or breach clock near its date (NFR5-14). (4) `GET /api/health/live` and `/api/health/ready` (database and job queue). (5) **CI check "no personal data in logs"** (Doc-1 release gate): run the suites with a capturing logger and fail on any seeded personal value in the captured lines. **Touch:** new `api/src/platform/observability/*.ts`, `api/src/features/platform-observability.ts`, `tests/check_pf23_observability.ts`, one CI step; the one-line logger hook in `api/src/main.ts` (release holder's OK as a shared file) | tested with a pass and a fail each: a request logs one JSON line with its correlation id, and a supplied `X-Request-Id` is kept; a seeded email, phone, name and bearer token in a request, an error and a job never appear in captured output; the no-personal-data check fails on a deliberately leaking line (shown once, then removed); an audit-write failure raises one alert and a second within 5 min raises none (Sample); ready answers 503 when the database is down; metric lines parse as embedded metric format | NFR5-14; Doc-1 §8.4; SA-8-27; SA-11-37, BR-2, BR-5, BR-16; Founder log L304-306 · **waits on:** PF-4 (actor and firm on the request), PF-14 (job metrics) · decisions: **error reports in CloudWatch, not Sentry** (Sentry stores data in the US or the EU, never Canada; map row 1 keeps data in Canada) · reviewer only · **size:** 2 PRs (logger and redaction with the CI check; metrics, alerts and health). The cloud half (log groups in ca-central-1, 90-day retention, alarms, the on-call address) is PF-23c, with PF-8. |
| PF-23c | deploy (running it, cloud) | **Log groups, retention and alarms in the cloud:** log groups in ca-central-1, kept 90 days (NFR5-14 "≥ 90 days"); metric filters and alarms for 5xx rate, job failures and age, bounces, audit-write failure, chain break, privacy and breach clocks; alarms to the on-call address the founder names; all as code in `deploy/`. **Touch:** `deploy/` files only | a test alarm fires to the on-call address in the founder's account; retention reads 90 days; nothing outside ca-central-1 | NFR5-14 · **waits on:** PF-8 and the founder's cloud account (P-558 (5)) · decisions: the on-call address (founder) · reviewer only · **size:** 1 PR |
| PF-24 | runtime (running it: secrets) | **Secrets supplied at deploy, never stored, and firms' own connection keys encrypted (map row 15).** (1) **One typed configuration loader** (`zod`) for every secret the app reads (database URL, Cognito, Stripe, SES, BoldSign, Zoom app, field key): read from the environment once at start, **the app refuses to start when a required one is missing** (names the missing setting, never a value); values never logged (PF-23's redaction knows their names) and never returned by any route. In the cloud the deploy injects them from AWS Secrets Manager (SA-8-1, "supplied at deploy"; PF-8's task definition); rotation is an engineer runbook with no downtime (SA-8-4, SA8-D1), written as `deploy/RUNBOOK-secrets.md`. (2) **`SecretBoxPort`** for a firm's or a person's own connection credentials (FO-3v's Zoom tokens, FO-3s's calendar tokens later): AES-256-GCM by `node:crypto`, key from the loader, **key version stored with each value** so a rotation re-encrypts by a `JobPort` job; shown masked, never decrypted into a response. KMS per-firm keys (NFR5-05) wait until a Restricted field is stored (X-27). **Touch:** new `api/src/platform/config/*.ts`, `api/src/platform/secret-box/*.ts`, `api/src/features/platform-config.ts`, `deploy/RUNBOOK-secrets.md`, `tests/check_pf24_secrets.ts` | tested with a pass and a fail each: a missing required secret stops start with its name and no value; a seeded secret value never appears in captured logs or in any route's response (route sweep); an encrypted token round-trips and a tampered one is refused; after a key change the re-encrypt job moves every value to the new version and the old key then reads nothing; firm A's credentials never decrypt for firm B | SA-8-1, -4, -6, BR-4, SA8-D1; SA-08 §3.1; NFR5-05 · **waits on:** PF-4 · decisions: none · **breaker: yes (secrets)** · **size:** 1-2 PRs |
| PF-25 | schema + runtime (platform: firm web address) | **Each firm's own web address `<firm>.expatready.com` (map row 24; SA-2-27, SA2-D8).** `platform_firm.web_address` (DNS-safe label: lowercase letters, digits and hyphens, 3-63 characters, no leading or trailing hyphen; unique; a reserved list `www`, `api`, `app`, `admin`, `mail`, `status`, `help`, `book`, `portal`, Sample) and `platform_firm_address_history` (old address, until; insert-only). Suggested from the operating name at sign-up and editable there with a live availability check (PF-5's sign-up; a route here, PF-5s's field later); **afterwards only our staff change it**, with a reason, audited (`system/firm:address`, PF-17's console), and **the old address redirects for 90 days** (301), then answers like an unknown one. **Host routing:** a request to `<address>.expatready.com` (and `<address>.localhost` locally) resolves the firm for its public pages (FO-3's booking page `/book` and `/book/<slug>`, FO-2's web form, the portal later); an unknown address → the same plain not-found page as an unknown slug (AG-4-17). No custom domain (AG-4-16 r5, AG-15-27: Release 2, X-28). The portal shows the address read-only in Branding (AG01-1). **Touch:** `platform.prisma` (Lead B's) + one migration folder, new `api/src/platform/web-address/*.ts`, `api/src/features/platform-web-address.ts`, `tests/check_pf25_web_address.ts` | migration on empty and demo-data copies (the Sample firm gets an address from its key); tested with a pass and a fail each: `maple` free → offered; `Maple`, `-maple`, `ma`, `www` → refused with a plain reason; a taken address → "taken" and a suggestion; a firm's staff changing it → 403; our staff with a reason → changed, audited, the old address 301s for 90 days on the fake clock and is not-found after; an unknown host → the same answer as an unknown slug; firm A's address never serves firm B's page | SA-2-1, -2, -27, SA2-D8, SA2-D21; AG-4-16; AG01-1; AG-15-27 · **waits on:** PF-3, PF-4s (our staff's keys) · decisions: wildcard DNS and certificate are PF-8's (the founder's account) · **breaker: yes (schema, public routing)** · **size:** 2 PRs (schema; routing and change) |
| PF-26 | runtime (platform service, per-module registration) | **One person's data as an export, logged (map row 34; AG-2-93, SA-11-36, SA-11-40).** "Export personal data" on a lead, prospect, client or past-client record: key `agent/data-export:request` (seeded to Owner, Admin, Case Manager) **and** the requester can see that person (or holds `agent/prospect:view.all`), checked on the server; **one person record only** (a family member never swept in; for a minor the firm acts; duplicate names show both records to pick from); merged records included; recently-deleted items included and marked; complete and unmasked. **Per-module registration** (like automation, contracts §9): `PersonExportPort.register(module, exporter)` in `ports/` (zod), where each module returns its sections for `(firmId, partyId)`; this row registers the platform's and front office's (person, consents, messages, bookings, retainers, signing evidence, conflict and identity checks, invoices, payments, trust entries); **the case side registers its own** (the release holder's row). A `JobPort` job builds JSON plus a PDF (`DocumentRenderPort`), stored by `FilesPort`, download link for the requester only, expiring (Sample 7 days); the audit line holds requester, party id, time and file hash, apart from list exports (AG-2-49a), never the content. No client portal button (SA-11-36). **Touch:** new `api/src/platform/person-export/*.ts`, `ports/person-export.ts`, `api/src/features/platform-person-export.ts`, `tests/check_pf26_person_export.ts`; the record screen's "Export personal data" action is **PF-26s** (one panel in FO-4's record screen, concept addendum) | tested with a pass and a fail each: a Case Manager who can see the person exports; one who cannot see the person → 404; no key → 403; a family member of the person is not in the package; a merged record's data is in it; a deleted note is in it and marked; the package holds every registered module's section (a test module registers and appears); the link expires and another staff member's download → 404; the audit line has no personal content; firm A never exports firm B's person | AG-2-93, -49a; SA-11-36, -40 · **waits on:** PF-4, PF-14, FO-5 (`DocumentRenderPort`, `FilesPort`), FO-9b (merged records) · decisions: none · **breaker: yes (personal data, permissions)** · **size:** 2 PRs (port, job and package; then each module's exporter grows with its module) |
| PF-18n | schema + runtime (platform messages: the notification list) | **The in-app notification list itself (map row 50's missing part; AG-10-29a, -29b, -36, §3.7; AG-7-39).** `msg_notification` (firm, recipient person, kind, item kind and id, deep link, created at, read at; **one per person per item and kind**, AG-7-39) in `platform-messages.prisma`; `NotificationPort.notify(tx, recipient, kind, item)` in `ports/` that every module calls inside its own transaction and that asks PF-18a's `NotificationPrefsPort.allows(person, group, IN_APP)` first; routes: my list (newest first, paged), unread count, mark one read, mark all read; scoped to firm and recipient; the Individual/Corporate switch never filters it (AG-10-36). **This row's callers:** a lead assigned to me (FO-10), a client reply or new inbound message and a bounce or send failure (PF-19b), signed (FO-6), payment received (FO-7b), @mention when it exists; the case side's four (AG-7-39) are the release holder's. Read items older than 90 days removed by a `JobPort` job (Sample: the requirements give no period). **The bell and list** in PF-6's frame are **PF-18ns** (concept addendum to PF-18s). **Touch:** `platform-messages.prisma` (PF-19a's file) + one migration folder, new `api/src/platform/notifications/*.ts`, `ports/notifications.ts`, `api/src/features/platform-notifications.ts`, `tests/check_pf18n_notifications.ts` | tested with a pass and a fail each: notify twice for one item and kind → one row; in-app off for a group → no row, and a security group ignores the switch (PF-18a); my list never shows another person's items; mark all read → unread count 0; a rollback in the caller's transaction leaves no notification; the 90-day job removes only read items; firm A never reads firm B's list | AG-10-29a, -29b, -36, §3.7; AG-7-39; AG-16-10 · **waits on:** PF-19a (its file), PF-18a, PF-4 · decisions: none · reviewer + breaker (schema) · **size:** 1-2 PRs |
| PF-21b | schema + runtime (platform register: requests to us, legal holds) | **The register of privacy requests made to us, and legal holds (map row 85; SA-11 §3.5, §3.8, SA11-D4, BR-6, BR-7, BR-12).** In `platform-register.prisma`: `plat_data_request` (type `ACCESS | CORRECTION | DELETION`, requester, received, target date = received + 30 days (a code constant; **a reminder, not enforced**, SA-11 §3.8; legal reading Unconfirmed: no counsel), status `PENDING | IN_PROGRESS | COMPLETED | OVERDUE | HELD`, actions taken; insert-only events) for requests made to ExpatReady itself; `plat_legal_hold` (scope `FIRM | CASE | CATEGORY | DATE_RANGE | PERSON` with its target, reason, placed by, placed at, released by, released at, reason). **`LegalHoldPort.isHeld(firmId, subject)`** in `ports/`, which **every deleter calls** (a manual delete, the erasure job PF-21d, a cancelled firm's purge PF-11, the case side's deletes): a held item is never deleted, and the caller shows `HELD` with the reason disclosed, **never a false success** (BR-12). Order: a hold beats the keep-period warning, which beats a deletion request (BR-7). Only our staff place or release holds (`system/compliance:legal-hold`); the firm route `agent/legal-hold:manage` stays dormant (no firm screen, SA-11). An `AlertPort` alert when a request nears its date (NFR5-14). Screens in our console: **PF-21rs**. **Touch:** `platform-register.prisma` (PF-21's file) + one migration folder, new `api/src/platform/register/requests/*.ts`, `…/holds/*.ts`, `ports/legal-hold.ts`, `api/src/features/platform-register-privacy.ts`, `tests/check_pf21b_requests_holds.ts` | tested with a pass and a fail each: a request past its date shows `OVERDUE` on the fake clock and raises one alert; a firm key placing a hold → 403; a person hold makes a manual delete of that person's record answer `HELD` with the reason and leaves the row; a released hold lets it proceed; a firm hold blocks PF-11's purge; a hold on firm A never blocks firm B; every change audited | SA-11 §3.5, §3.8, -14, -18, -40 r4, SA11-D3, SA11-D4, BR-6, BR-7, BR-12; NFR5-14 · **waits on:** PF-21 (its file), PF-4s · decisions: none · **breaker: yes (schema, deletion)** · **size:** 2 PRs |
| PF-21c | schema + runtime (platform register: breaches) | **The breach register and firm notices (map row 86; SA-11 §3.7, SA11-D8, BR-11, SA-11-25).** `plat_breach` (discovered at, description, affected firms, data categories, root cause, containment, notification decision with who and why, "other notifications made" free text; kept 7 years, SA-11-14) and `plat_breach_notice` (breach, firm, recipients, template version, sent at; insert-only). Opened by our staff (`system/breach:manage`) by hand or from a PF-23 integrity or security alert (pre-filled, never sent by itself). **Notice to each affected firm's Owner and Admins** through `MessagePort` (PF-19b) from a template our Platform Owner publishes (PF-19c; wording by counsel, **Sample until then; Unconfirmed: no counsel**); each notice linked on the record and audited; we notify people directly only for our own users (firm staff); the firm decides about its clients (starter A.14 in the template library, "Good to have"). Screens in our console: **PF-21rs**. **Touch:** `platform-register.prisma` + one migration folder, new `api/src/platform/register/breaches/*.ts`, `api/src/features/platform-register-breaches.ts`, `tests/check_pf21c_breaches.ts` | tested with a pass and a fail each: a firm key → 403; a breach naming two firms sends one notice to each firm's Owner and Admins and none to a third firm; a notice can't be sent twice to one firm for one breach; a notice row can't be changed; an integrity alert pre-fills a draft breach and sends nothing; the record and notices are audited | SA-11 §3.7, -14, -25, SA11-D8, BR-11; SA-05 B.6 · **waits on:** PF-21, PF-19b, PF-19c, PF-23, PF-4s · decisions: notice wording by counsel before the first real firm (founder's counsel list) · **breaker: yes (schema)** · **size:** 1-2 PRs |
| PF-21d | runtime (platform service, per-module registration: erasure) | **An approved "delete my data" request carried out (SA-11 §3.4, -16, BR-18; completes map row 85).** `ErasurePort.register(module, eraser)` in `ports/` (each module erases or anonymises its rows for one party; this row registers platform and front office; the case side registers its own); the job runs only for an approved deletion request, **7 days after approval** ("Erasing on <date> - Cancel"), behind the "Data erasure" switch (its kill switch); every eraser asks `LegalHoldPort` first (held → `HELD`, disclosed); **the 7-year financial floor is kept** (invoices, payments, trust entries stay, with the party's name replaced by a reference); the request's events record each module's result. **Touch:** new `api/src/platform/erasure/*.ts`, `ports/erasure.ts`, `api/src/features/platform-erasure.ts`, `tests/check_pf21d_erasure.ts` | tested with a pass and a fail each: the job never runs before day 7, and cancel on day 6 stops it; switch off → nothing erased; a held person → `HELD`, nothing erased; money rows stay with the name replaced; a test module registers and is erased; firm A's erasure never touches firm B | SA-11 §3.4, -16, BR-18 · **waits on:** PF-21b, PF-14, FO-7b · decisions: none · **breaker: yes (deletion, money)** · **size:** 2 PRs |
| PF-21rs | screens (our console) | **Our console's Privacy pages: requests to us, legal holds, breaches and their notices** (concept first; in PF-17's `web/src/modules/system/`). **Touch:** those files, `tests/check_pf21rs_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440 | SA-11 §3.5, §3.7, §3.8 · **waits on:** PF-21b, PF-21c, PF-17 · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 1 PR |
| FO-3a | runtime (booking settings API) | **The routes FO-3 does not have, which the booking screens need (map rows 37, 41, 42):** booking types: create, edit, duplicate and retire (`agent/booking-type:manage`, Owner and Admin; name 1-80 characters, length 5-480 minutes, slug unique in the firm; case types never public; AG-4-9, -10); **My availability**: several named sets of weekly hours, each with its own time zone, one the default ("Normal hours", copied from business hours) (AG-4-62); time off whole or part days, and an Owner or Admin entering a colleague's (AG-4-62); existing bookings never moved; firm **Timings** defaults in PF-3's settings home, overridable per type (AG-4-4, -5, -66: reminders 24 h and 1 h, shortest notice 4 h, window 60 days, gaps 0 and 10 min, self-service limit 4 h); "Preview as a booker" returns the public page's data for a type without booking (AG-4-8); **the consult record** (AG-4-49: opens only after the host answers Attended; time spent pre-filled, notes, recommended items, optional quoted fee CAD or USD only; editable later with `agent/booking:edit`; each save audited); the staff calendar feed (my bookings, or the team's when `agent/booking:list` and visibility allow; AG-4-67). FO-1b's tables hold one hour set per person: **named sets and the consult record are one migration in `front-office-booking.prisma`** (FO-1b's file). **Touch:** that file + one migration folder, new `api/src/front-office/booking/settings/*.ts`, `…/consult/*.ts`, `api/src/features/front-office-booking-settings.ts`, `tests/check_fo3a_booking_settings.ts` | tested with a pass and a fail each: a name of 81 characters, length 4 or 481, a duplicate slug → refused; a Case Manager creating a type → 403; a case type → never on the public list; two hour sets, the default's zone used for slots; a colleague's time off by an Admin → saved, by a Case Manager → 403; changing hours or time off never moves a booking; a consult record before Attended → refused; a fee in EUR → refused; a staff member without `agent/booking:list` sees only their own bookings in the feed; firm A never reads firm B's types | AG-4-4, -5, -8, -9, -10, -49, -62, -66, -67 · **waits on:** FO-3, FO-1b, PF-3 · decisions: none · **breaker: yes (schema)** · **size:** 2 PRs (schema with the settings routes; consult record and feed) |
| FO-3w | screens (public booking pages) | **The public booking pages (map row 37's screens; AG-4-16, -17, -18, -19, -20, -36, -37, -38):** on the firm's address (PF-25) `/book` (active public types) and `/book/<slug>` → slot picker (month view; slots in the visitor's browser zone with a "(change)" picker; AG-4-18) → form (first and last name, email, phone in phone mode, the firm's consent sentence and agreement tick) → confirmation (add to calendar, reschedule and cancel links, join details); the **reschedule and cancel pages** by link with no login (inside the self-service limit the page says reply or call; a bad, expired or voided link shows one plain message); the firm's branding (PF-13); embeddable by iframe; English first. **Touch:** new files under `web/src/modules/front-office/booking-public/`, `tests/check_fo3w_booking_browser.ts` | the concept's journeys incl. a DST day and a zone change; a double click books once; keyboard-only; axe-core; 375/1024/1440; no network call to outside services | AG-4-16..20, -36..38 · **waits on:** FO-3, PF-25 (or the `/book/<firmKey>` path until it lands), PF-13 · decisions: concept and challenge first (P-223 (4)) · **breaker: yes (new screens, a public door)** · **size:** 1-2 PRs |
| FO-3st | screens (staff booking) | **The staff calendar and booking screens (map row 39; rows 41 and 42's screens):** **Bookings calendar** (day, week and list views on our own components, no calendar library; my bookings or the team's by permission; times in the item's office time with the office named, PF-18a); **New booking** (outside my hours allowed with a warning, AG-4-63); booking detail with reschedule and cancel; the **attendance question** answered by a person (never guessed, AG-4-39) and then **the consult record** (AG-4-49), whose next step is a button (AG-4-50); **My account → Availability** (named hour sets, time zone) and **Time off**; **Settings → Booking types** (list, edit, duplicate, retire, Preview as a booker) and **Advanced → Timings**. **Touch:** new files under `web/src/modules/front-office/booking/`, `tests/check_fo3st_booking_browser.ts` | the concept's journeys; keyboard-only; axe-core; 375/1024/1440; the week view holds 60 bookings without overlap errors | AG-4-4, -8, -9, -39, -49, -50, -62, -63, -67 · **waits on:** FO-3a, PF-6, PF-18a · decisions: concept and challenge first · **breaker: yes (new screens)** · **size:** 2-3 PRs (calendar and booking detail; availability and time off; types and timings) |

**Amended:**
* **FO-3v:** it waits on PF-24, because its Zoom tokens use `SecretBoxPort`.
* **PF-18a's "the case side's in-app notifications, map row 50, call it too"** now reads: they call PF-18n's `NotificationPort`, which asks PF-18a.

**New X lines (for the release holder):**

| X | Left out | Source | Why |
|---|---|---|---|
| X-27 | KMS key hierarchy (platform key, per-firm and per-person keys) | NFR5-05 | Needed before any Restricted field is stored; PF-24's versioned key covers connection tokens until then. |
| X-28 | Custom domain for the booking page and the portal | AG-4-16 r5, AG-15-27 | Release 2. |
| X-29 | The "real risk of significant harm" assessment on a screen, the 72-hour countdown, and the composer for regulator and individual notices | SA-11 §3.7, old SA-11-25/-26 | Parked by SA-11; whether the Commissioner is told is counsel's matter, done outside the product. Unconfirmed: no counsel. |
| X-30 | A firm's own breach and legal-hold screens | SA-11-35, G-Q3 | The routes are dormant in Release 1. |
| X-31 | Console health graphs and an alert-rules engine | SA-9-12..-15a, -20 | Parked; engineers use the cloud's own monitoring. |

**Order (P-576):**
* **Identity lane:**
  * PF-23 and PF-24 after PF-4.
  * PF-25 after PF-4s.
* **Booking lane:**
  * FO-3a after FO-3.
  * Then FO-3w and FO-3st with the screens wave.
* **Messages:** PF-18n after PF-19a and PF-18a.
* **Registers:**
  * PF-21b and PF-21c after PF-21.
  * PF-21d after PF-21b and FO-7b.
  * PF-21rs with PF-17.
* **Per-module registration:** PF-26 after FO-5 and FO-9b.
* **Cloud:** PF-23c with PF-8.

**Size (Hypothesis):** about 22-28 small PRs over the 13 rows, plus the two screen addenda PF-26s and PF-18ns.

**For the release holder's own rows:**
* the case side's exporter (PF-26) and eraser (PF-21d);
* its `LegalHoldPort` calls before any delete;
* its four notifications through `NotificationPort` (AG-7-39);
* the "Client request" task category (AG-13, map row 75).

**Rev 15 rulings by the release holder (Lead 44, 14 Nov; BACKLOG c334a7618):**
* **85 and 86 go in Platform:** accepted.
* **PF-23's logger hook in `api/src/main.ts`:** yes, as a one-line hook. The PR shows that `main.ts` changes by exactly that hook, and that every existing suite and the demo reset pass unchanged.
* **PF-23's CI step "no personal data in logs":** yes, on two conditions:
  * it adds no new required job;
  * the PR states the minutes it adds per run (B190, P-589 (2)). Over ~1 minute per run, it goes into an existing job.
* **The case-side asks** (an exporter for PF-26, an eraser for PF-21d, `LegalHoldPort` before any delete, the four AG-7-39 notices through `NotificationPort`) go into the release holder's CS- rows.

## Rev 15.1 (14 Nov 15:17 IST, Lead B (3)): FO-1a's two questions (#1742); shared event names; qa-testable Done when (P-592)

**FO-1k, new: front-office keys to the platform.** It follows FO-1a (#1742), and Lead B answered its question 1 on the PR (comment 6875438964).
* **What it changes:**
  * Three one-line hooks on `platform.prisma`:
    * `PlatformFirm.frontOfficeSales FoSalesSetup?`;
    * `PlatformStaff.ownedLeads FoLead[] @relation("LeadOwner")`;
    * `PlatformStaff.ownedProspects FoProspect[] @relation("ProspectOwner")`.
  * Lead B owns both files, so this is the contracts §9 exception.
  * One migration with the foreign keys, all RESTRICT:
    * `fo_sales_setup (firm_id) → platform_firm (id)`;
    * `(firm_id, owner_id) → platform_staff (firm_id, id)` for leads and prospects.
  * It drops `fo_sales_setup_firm_exists` and `fo_owner_in_firm`.
* **Touch:** those three lines, the matching relation fields on `front-office-sales.prisma`, one migration folder, and `tests/check_fo1k_keys.ts`.
* **Done when** (a pass and a fail each):
  * deleting a firm or staff row that has front-office rows → refused (closes review m2, break B5);
  * an owner from another firm → 23503;
  * migration on empty and demo-data copies, with `migrate diff` empty;
  * every FO-1a and PF-3 test unchanged.
* **Waits on:** FO-1a.
* **Schema slot:** the next free one after PF-19a and FO-7a, ahead of FO-13 (the release holder may rule otherwise). PF-19a also touches `platform.prisma` and `front-office-sales.prisma`: the second to merge re-applies its lines.
* **Breaker:** yes (schema).
* **Size:** S, 1 PR.

**FO-2, amended (FO-1a question 2; brief updated):**
* The demo reset runs PF-3's sample seed, then `seedSampleFirmsFrontOffice`. These are one-line hooks, and need the release holder's OK.
* `seedCreatedFirms` runs once at start, and as a `JobPort` recurring job when PF-14 is on `main`.
* The web form's message is the lead's first `INTERNAL` note.
* A version column for the stale-save rule is added only where an edit form needs it.
* Done when adds: after a reset, both Sample firms have both pipelines; a new `firm.created` seeds that firm once, and a second run adds nothing.

**Shared event names:**
* FO-1a added `prototype/studio/ports/events.ts` (`EVENT.FIRM_CREATED`, zod only), which is case-side contract v0.1's events home.
* Every PF/FO row takes its event names from there. A new event (`prospect.won`, `signing.completed`, `invoice.*`, `payment.*`, `booking.*`, …) is added to that file by the row that first emits it, never as a string literal.
* The sentence is in every brief.

**qa-testable Done when (P-592: MVP-CHECKLIST.md is the one Release 1 tracking page; a qa cloud lane is adding PF, FO, money and audit capabilities to `qa/CAPABILITIES.md`).**
* Every Done when line in rows rev 3.1 to 15 names an observable pass and fail: a route's answer, a database refusal, an email in the demo inbox, a screen state.
* **Which row closes a capability for qa:** a capability becomes testable by a person when the row that serves it merges.
  * That is the screen row (the "s", "st" or "w" rows) or, where there is no screen, the API row.
  * Schema-only rows close no capability themselves: FO-1a, FO-1b, FO-1k, FO-7a, FO-13, PF-12, PF-19a and PF-3.
  * qa tests their rules through the first API row that uses them, and through the row's own pass and fail suite on `main`.
* Lead B gives the qa lane the row → map-row list on request; MVP-CHECKLIST §A already holds it.

## Rev 15.2 (14 Nov 16:19 IST, Lead B (3)): function names per area; FO-1a's red run

**What happened:**
* FO-1a #1742 went red on every shard and on `types`: `P3018` on `20261114120000_fo1b_booking_tables`, `function "fo_firm_fixed" already exists` (42723; run 43580456554).
* FO-1b merged first with its own `fo_firm_fixed()`.
* FO-1a's migration was stamped `20261114063000`, earlier than FO-1b's, so it ran first and created the same name.

**The fix, posted on #1742 (comment 6876146313) and sent to the lane:**
* merge `main`;
* re-stamp FO-1a's migration later than the newest on `main`;
* rename `fo_firm_fixed` to `fo_sales_firm_fixed`, and FO-1a's other generic helpers (`fo_insert_only`, `fo_has_word`, `fo_next_number`, `fo_number_fixed`) to the `fo_sales_` prefix;
* `migrate diff` empty, every suite, then a diff-only re-review.

**Standing rule (in every brief):**
* A database function in an area's migration carries the area's prefix: `fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`.
* A migration's stamp is later than the newest on `main` when it merges.
* FO-1b keeps `fo_firm_fixed()` as built. It is the only bare `fo_` helper, and no later row uses a bare `fo_` name.

## Rev 16 (14 Nov 18:23 IST, Lead B (3)): rows that start now on port fakes (P-599: Release 1 (production grade) by 24 Nov)

**Asked:** Lead 47 (release holder). The board showed 0 ready rows, because every next PF/FO row waited on PF-4 #1744 or FO-1a #1742. Lead 47 wants rows shaped against port fakes (P-576), each with the port it fakes, its touch list (no two on one schema file) and a brief, at least 10.

**How (one contract-first row, then parallel lanes):**
* **PF-0p** puts the shared port interfaces and their fakes in `prototype/studio/ports/`: audit, staff context, clock, jobs, mail, files, document render. It also adds one real interim `AuditPort` adapter over `audit_event` (AUD-1 swaps it later).
* It adds **reserved back-relation comment lines** in `PlatformFirm` and `PlatformStaff`, separated by blank lines. Each later row replaces only its own line, so parallel schema PRs don't collide in git.
* Every other row below codes to PF-0p's signatures at once and merges `main` when PF-0p lands.
* Services take a `StaffContext` argument. Staff routes are wired with PF-4's `@PermissionKeys` once PF-4 is on `main`.
* People and company keys to FO-1a's tables are added when FO-1a is on `main`; otherwise **FO-1k collects them** (FO-1k's scope grows to those keys).

**Start now (12 rows; brief for each in `lead-b-briefs/`):**

| Row | What | Port it fakes (until the real one lands) | Schema file (one each) | Touch list (code) |
|---|---|---|---|---|
| PF-0p | shared port contracts and fakes | defines them all; the real `AuditPort` adapter (interim) | `platform.prisma`: comment lines only | `ports/*` (not `events.ts`), `api/src/platform/audit/`, `tests/check_pf0p_ports.ts` |
| PF-L | the approved libraries | none | none | `package.json`, lockfile, gate file |
| PF-14 | background jobs (pg-boss adapter, worker) | builds the real `JobPort` behind PF-0p's fake | none (pg-boss's own schema) | `api/src/platform/jobs/`, `api/src/features/platform-jobs.ts`, test |
| PF-19a | messages schema and consent store | `ConsentPort` (creates it); `AuditPort` fake | `platform-messages.prisma` | `api/src/platform/messages/consent/`, `ports/consent.ts`, test |
| FO-7a | client-money tables | `AuditPort` fake; FO-1a's people keys by FO-1k if needed | `client-money.prisma` | migration and test only |
| FO-13 | compliance tables (conflict, identity) | `PartySearchPort` fields only; FO-1a keys by FO-1k if needed | `front-office-compliance.prisma` | migration and test only |
| PF-21 | complaints register | `JobPort`, `AuditPort` fakes; `StaffContext` fake | `platform-register.prisma` | `api/src/platform/complaints/`, test |
| PF-23 | logs, redaction, metrics, alarms | `AlertPort` (creates it); `StaffContext` optional | none | `api/src/platform/observability/`, `ports/alert.ts`, one line in `main.ts`, one CI step |
| PF-24 | secrets loader and `SecretBoxPort` | `JobPort` fake (re-encrypt) | none | `api/src/platform/config/`, `secret-box/`, `ports/secret-box.ts`, runbook, test |
| FO-5 | retainer schema, API and documents | `StaffContext`, `AuditPort`, `FilesPort`, `DocumentRenderPort` (builds the real render and files adapters) | `front-office-retainers.prisma` | `api/src/front-office/retainers/`, test |
| FO-3 | booking API (public door first) | `ArrivalPort` (creates it; FO-2 implements), `JobPort`, `MailPort`, `AuditPort` fakes | none (FO-1b's tables) | `api/src/front-office/booking/`, `ports/arrival.ts`, test |
| PF-25 | firm web address | `StaffContext` fake for the staff-only change | `platform.prisma`: its slot line and new model (**after PF-0p merges**) | `api/src/platform/web-address/`, test |

**Still waiting on PF-4 or FO-1a, and why:**
* FO-2 needs FO-1a's tables for its whole body.
* PF-4b, PF-4s, PF-4c, PF-5, PF-6 and PF-18a extend PF-4's own files.
* PF-12 needs every table to exist first.
* FO-1k comes after FO-1a.
* FO-7b, FO-6 and FO-2b come after their schema rows.

**Decisions for the release holder (not Lead B's to make):**
* **The two-at-once schema limit (P-559 (3)).** Six rows above add migrations at the same time: PF-19a, FO-7a, FO-13, PF-21, FO-5 and PF-25. Each is in its own file, re-stamps at merge, and touches `platform.prisma` by its own slot line only. Running them in parallel needs the limit raised, e.g. "any number, each in its own file, the second to merge re-stamps". Otherwise the order is PF-19a + FO-7a, then FO-13, PF-21, FO-5, PF-25.
* **PF-0p's interim `AuditPort` adapter** sits in AUD-1's area. It is an OK or a no.

**Every brief now has (Lead 47, 14 Nov):** before asking for the label, run, on `main` merged into the branch, the suites of every CI part that was red on any earlier head, plus every suite in the shard that shares the demo database, and paste the results.

**Rev 16 ruling (Lead 47, P-600, 14 Nov 18:25 IST):**
* **Schema rows run in parallel, any number at once**, under five conditions:
  1. each has its own schema file and migration folder;
  2. it adds only to its own tables; a shared model changes only through its own slot line;
  3. its functions and triggers carry the area prefix;
  4. its stamp is later than `main`'s newest; the later PR re-stamps and re-runs CI when an earlier one merges;
  5. the release holder reads each migration diff before the label.

  Every schema brief now has the re-stamp step.
* **PF-0p's interim `AuditPort` adapter:** OK. AUD-1 swaps it behind the port later, with no caller change.
* Cloud lanes for the 12 start at the founder's next typed turn. **PF-0p goes first.**

**PF-21 amended (Lead 47, P-601, #1753 comment 6877890040, 14 Nov):**
* **Keys:**
  * `agent/complaint:record` goes to OWNER, ADMIN and CASE_MANAGER;
  * `agent/complaint:read` goes to OWNER and ADMIN;
  * the handler reads their own complaints without the key.
* **Catalogue rows:** PF-21's migration adds them to `platform_role_permission`. This is P-600's one written exception, and the release holder reads those lines.
* **Fail test per role:** each role without the key is refused.
* **Events:** `EVENT.COMPLAINT_RECEIVED` and `EVENT.COMPLAINT_CLOSED` (ids only) in `ports/events.ts` after #1742 merges.
* **Back-relations:** both PF-21 slot lines; the handler is a real `(firm_id, handler_staff_id)` foreign key.

## Rev 16.1 (14 Nov 19:18 IST, Lead B (3)): PF-23's open review minors (Lead 48; #1759 reviewer comment 6878168159)

| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |
|---|---|---|---|---|
| PF-23r | runtime (running it: redaction hardening) | **The four review minors PF-23 left open, in PF-23's own files only:** (1) `redact.ts`: a **budget of 2,000 values per call**, and a value already seen in this call is written as `"[shared]"` (no repeated walk); (2) `alerts.ts` `alertIds`: spaces become `_` only in `entity` and `queue`; a space in `entityKey` or `firmId` is **refused** (they are ids, and the port promises to refuse names); (3) `logText`: when any stack-frame line is present, keep **only the frame lines** plus the first line's error class, so a message that spans several lines (Prisma-style) never leaks; (4) the `UCI8` pattern no longer catches time ranges like `0900-1700`; `Cookie sid=abc` with no `:` is redacted; the `health.ts` comment is fixed. **Touch:** `api/src/platform/observability/*.ts`, `tests/check_pf23_observability.ts` | tested with a pass and a fail each: a graph with 20 shared references per level over 10 levels finishes under the budget, and shared values show `[shared]`; `entityKey: "Jane Doe"` → refused; `entity: "case fact"` → `case_fact`; a 3-line error message with a stack logs frames only, never the message lines; `0900-1700` stays; `Cookie sid=abc` is redacted; the no-personal-data CI check stays green | #1759 review minors 1-4 · **waits on:** PF-23 merged · decisions: none · reviewer only · **size:** S, 1 PR |
| PF-23m | runtime (log call sites outside the platform) | **About 20 `e.message` plain console calls move to `logPort.error(event, e, ids)`** (e.g. `fill-case.ts:379`, `rounds.ts:178-205`). Names can't be caught by pattern, only by structured fields. **These files are case-side, so the touch list needs the release holder's OK as their owner** (Lead B rows never edit case-side files without it). The PR lists every call site with before and after. **Touch:** the listed call sites only (one line each), `tests/check_pf23m_log_calls.ts` | tested with a pass and a fail each: `git grep` finds no `console.(log\|error\|warn)` with `e.message` / `err.message` under `api/src` (the test is that grep, kept as a check); a seeded person's name in a thrown error at each moved site never reaches captured output; every existing suite is unchanged | #1759 review "also open" · **waits on:** PF-23 · decisions: **release holder OK on the case-side touch list** · reviewer only · **size:** S-M, 1 PR |

## Rev 16.2 (14 Nov 19:23 IST, Lead B (3)): FO-7a and FO-13 lane questions (#1758, #1755)

* **FO-7a:**
  * `PlatformFirm.moneySettings MoneyPaymentSettings?` is OK as the money module's one root back-relation (moves onto PF-0p's money slot).
  * The rule line follows `check_prisma_schema.ts`'s form (em dash, closing full stop); the guard wins.
* **FO-1k, amended:** it adds every key a row left because FO-1a wasn't on `main`, read from each merged PR's "Keys FO-1k adds" list. Known so far:
  * FO-7a: six keys on `money_invoice`, `money_trust_request` and `money_trust_entry` to `fo_person` and `fo_company`;
  * PF-19a's `fo_web_form` → `msg_consent_wording`, if it shipped without it;
  * any that FO-13 and FO-5 list.
* **PF-12, amended (FO-13 breaker break 4):**
  * the app role owns no table, is not a superuser, has no `BYPASSRLS`, and can't set `session_replication_role` or disable triggers;
  * migrations run as the owner;
  * the demo, CI and test databases use the same split;
  * the app role gets `log_error_verbosity = terse` (break 11).

  Done when adds a fail test per refusal.
* **PF-23r, amended (break 11):** `logPort` and the API's error mapper strip PostgreSQL `DETAIL` and Prisma `meta` values. Done when adds: a refused insert of a seeded name logs and answers without it.
* Break 10 (an explicit cast truncates) is PostgreSQL's behaviour: recorded, no row.
* FO-13c sets `checked_at` and `confirmed_at` from one `ClockPort` (Devin's minor on #1755).
* **Lead B's watch is fixed:** it missed these because Python's HTTP reads failed through the proxy and the errors were swallowed. It now uses curl with retries and reports its own errors.

## Rev 16.3 (14 Nov 19:34 IST, Lead B (3)): FO-7a's tax rate unit; PF-0p's job key

* **FO-7a amended (#1758):**
  * The tax rate is stored in parts per million (`tax_rate_ppm`; settings `ratePpm`), not basis points, because basis points can't hold QST 9.975 %.
  * A line's tax must be within a cent of amount × rate, and GST and QST may be rounded apart.
  * Returns to trust net out of an invoice's trust cap.
  * **FO-7b follows** (brief updated).
  * Lead B's view on the third review round, which is the release holder's call (P-293): a diff-only third round by the same reviewer plus the breaker on the same diff (money, lock order).
* **PF-0p (#1752):** "a job key never queues twice" means never twice **under one job name** (pg-boss keys by name; PF-14 confirmed). Rows that need a key unique across names put the name in the key.

**FO-7a / FO-7t trust rule (recorded as P-603 by Lead 48; Lead B, 14 Nov 19:53 IST, from FO-7a round 3's B-12, #1758 comment 6878721249; Code reading Unconfirmed: no counsel):**
* **Money leaves trust only** as `WITHDRAWAL_TO_INVOICE` (to an issued invoice, within its open amount) or `REFUND_TO_CLIENT` (with a reason).
* **A CORRECTION** names only a WITHDRAWAL (a positive return) or a DEPOSIT. A negative one names a deposit and never exceeds it. A correction never names a correction.
* **AG-6-73 move lines map onto these entry kinds:**
  * `TRUST_APPLIED` → its `WITHDRAWAL_TO_INVOICE`;
  * `WRONG_ACCOUNT` from trust to operating → a negative CORRECTION of the wrongly placed deposit;
  * `CARD_FEE_ON_TRUST` is operating to trust (money in).

  A move from trust to operating from any other entry kind is refused. **FO-7t follows this.**

## Rev 16.4 (14 Nov 20:02 IST, Lead B (3)): routes split from start-now rows while PF-4 is open

**Rule:** a start-now row (rev 16) whose schema and service are reviewed, broken and green while PF-4 is still not on `main` may merge as **part 1 of 2**. Its staff routes go in a small next PR, **`<row>w`**.
* **`<row>w` holds:** the `api/src/features/<row>.ts` registration, the controller with PF-4's `@PermissionKeys`, and route tests (a pass and a fail per key, a 403 for each role without the key, a 404 across firms).
* **When it starts:** the day PF-4 is on `main`.
* **Size:** S. **Reviewer only**, unless the route is a public door.
* **For qa (P-592):** part 1's PR body says "part 1 of 2 (routes in `<row>w`)", and the capability counts as done only after `<row>w`.
* **Applies to:**
  * **PF-21w** (asked on #1753, comment answered);
  * FO-5w and FO-3w-staff (FO-3's staff create, reschedule and cancel routes), if their lanes ask;
  * PF-25w (the staff-only address change).

**Shared check:** `check_pf3_platform_schema.ts:80` leaves out the keys later rows add through a named list, `ADDED_BY_LATER_ROWS` (P-601 first: `agent/complaint:`). Each later row that adds catalogue keys extends that list, and asserts its own rows exactly.

## Rev 16.5 (14 Nov 20:27 IST, Lead B (3)): the environment setting fails closed (Lead 49, from PF-4 #1744)

**Why:**
* PF-4's `identityConfig` defaults `PLATFORM_ENVIRONMENT` to `local`, and `local` allows the local sign-in stand-in.
* A production deploy that forgets the setting would run as `local`.

**Best practice:** fail closed. Never default to the most permissive setting.
* **PF-24w (new, S, reviewer only):**
  * after PF-4 and PF-24 merge, PF-24's configuration loader takes over PF-4's environment reads (`PLATFORM_ENVIRONMENT`, `PLATFORM_IDENTITY`, `PLATFORM_LOCAL_SECRET`, the Cognito settings);
  * `PLATFORM_ENVIRONMENT` becomes **required, with no default**: missing → the app refuses to start, naming the setting;
  * `start.sh`, `deploy/compose.test.yml`, CI and the test helpers set `local` or `test` explicitly.
  * **Touch:** `api/src/platform/identity/port.ts` (the read only), `api/src/platform/config/*.ts`, those launch files (one line each; the release holder's OK as shared files), `tests/check_pf24w_environment.ts`.
  * **Done when** (a pass and a fail each): an unset `PLATFORM_ENVIRONMENT` stops start with its name; `local` with `PLATFORM_IDENTITY=local` starts; `production` with `PLATFORM_IDENTITY=local` is refused (already PF-4's rule, kept); every existing suite and the demo reset pass with the explicit settings.
  * **Waits on:** PF-4, PF-24.
* **PF-8 (cloud deploy, only named so far): Done when adds:**
  * the task definition sets `PLATFORM_ENVIRONMENT=production` and `PLATFORM_IDENTITY=cognito` explicitly;
  * the deploy smoke test proves the running service refuses the local sign-in stand-in (a local token → 401) and that `/api/health/ready` reports `environment: production`, never `local`.

**Rev 16.5 ruling (Lead 49, 14 Nov 20:28 IST; BACKLOG 03b87cc7b):**
* PF-24w's one-line edits to `start.sh`, `deploy/compose.test.yml` and the test helpers are OK'd as shared files.
* Any line under `.github/` still needs the release holder's own diff read before the label (P-423). The PR body lists those lines.

**Lesson (14 Nov 21:51 IST):**
* **What happened:** Lead B's own suggestion on #1742 (a pg_proc test allowing only FO-1a's and FO-1b's `fo_` names) made `main`'s `check_fo1a_sales_schema.ts` reject later areas' correctly prefixed functions, and FO-13 #1755 was dequeued for it.
* **Fix:** FO-5 #1761 (`2b087d7ad`).
* **Rule:** an area's own checks only look at its own prefix (`fo_sales_` for FO-1a). They never list other areas, and new areas need no edit to old tests.

**Rev 16.4 follow-up (14 Nov 22:21 IST):**
* FO-3's staff routes row is named **FO-3sr**, not "FO-3w-staff", so it isn't confused with FO-3w, the public booking screens.
* **PF-25w waits on PF-4s**, not PF-4: the address change is our own staff's `system/*` key.
* **FO-5** needs no `w` row: its part 2 is its own API PR.
* One brief covers PF-21w, FO-3sr and PF-25w: `lead-b-briefs/ROW-w.md`.

**PF-25 amended (Lead B, 14 Nov 22:52 IST, #1763 comment 6881377523):**
* The address is its own table, not a `platform_firm` column: agreed.
* **No trigger on `platform_firm`** (P-600 (2): PF-3 owns it, and address generation must never fail a firm's creation). Instead:
  * a `firm.created` consumer with a catch-up over `module_event`, idempotent, run at start and by the demo reset;
  * the migration backfills existing firms;
  * PF-5's sign-up sets the chosen address itself.
* **Tests:** one address per new firm; a re-run adds nothing; a collision takes the next suggestion and creation never fails.

## Rev 16.6 (14 Nov 22:59 IST, Lead B (3)): slot-line convention; one reset step for the seeds

* **Slot lines:**
  * PF-0p's `// back-relation slot: …` comments **stay**, as markers; an area's back-relation lines go directly under its own slot;
  * `check_pf0p_ports.ts` keeps requiring all six comments;
  * the briefs are updated (they said "replace").
* **One demo-reset step** (FO-2 adds it, under the release holder's rev 15.1 conditions): PF-3's sample seed, then FO-1a's `seedSampleFirmsFrontOffice`, then PF-25's `catchUpFirmAddresses`. PF-25 adds no reset hook of its own.
* **PF-25 #1763:** the trigger is gone (c4d3f5a8e), replaced by a `firm.created` consumer with catch-up and a backfill, and a re-review is running.

**FO-5 part 2 answers (Lead B, 15 Nov 01:21 IST, #1777):**
* Send → SENT now; FO-6 adds the `SigningPort` call in the same transaction, and moves the "Retainer sent" stage once.
* **FO-8 amended:** when it lands, it writes `prospect.won` once for every prospect already WON without one (catch-up by id, idempotent).
* Size limits are set as product limits, not Sample: template ≤ 5 MB, signed paper PDF ≤ 10 MB, checked before `FilesPort.put`.
* No withdrawing a draft (BR-10).

## Rev 16.7 (15 Nov 02:11 IST, Lead B (3)): migration tests in a parallel world

* **Rule:** a row's migration test measures **right after its own migration** (apply up to and including it, check, then apply the rest), and never assumes its migration is the newest of all.
* **The stamp check:** "later than every migration before it, and unique", not `all.at(-1)`.
* **Applied:** PF-21 #1753 fixed its own test, and fixes PF-25's `check_pf25_web_address.ts:89-90` (merged) in the same PR (Lead B's OK, #1753 comment). Until that lands, later schema PRs are red on PF-25's suite.
* **Lead B (4):** add this sentence to every schema brief beside the P-600 re-stamp step.

**Rev 16.7 applied (15 Nov, Lead B (4)):** the rule's sentence is in every schema brief that has the P-600 re-stamp step (FO-1k, FO-5, FO-6, FO-7a, FO-9a, FO-13, PF-5, PF-12, PF-19a, PF-21, PF-25).

## Rev 16.8 (15 Nov 07:4x IST, Lead B (4)): follow-up rows from the review Minors (FO-5f, FO-3f, PF-4f)

**Why:** the Minors left open on FO-5 part 2 (#1777; lists in comments 6883913744, 6884091038, 6884260179), FO-3 (#1760, the PR body's "Open items for Lead B") and PF-4t (#1775 round 2, m1 and m2) become rows, so nothing found in review is lost. One row per area, each S, reviewer only unless marked. None needs a migration.

**Lead B decisions inside these rows (P-566 (3), best practice with evidence):**
* **An edit that ends a sent request writes an event.** Today it writes only an audit line, so nothing outside FO-5 learns that the signing request is void. New name `RETAINER_REQUEST_ENDED: "retainer.request_ended"` in `ports/events.ts`, payload `RetainerEventPayload` with `version` = the ended version and a `reason` of `UPDATED`. FO-6's brief already puts the `SigningPort` call inside FO-5's transactions; it adds the cancel in the same step for this edit and for Withdraw.
* **The stale check covers the state, not only the version (B-25).** Send does not raise the version, so an edit made on a Draft page passes after a colleague sent it, and ends the request. Edit and Withdraw also require `expectedStatus` (the status the page showed); a mismatch is 409 `CHANGED`. No migration: the pair (version, status) already names one state.
* **Signed offline on paper signed against an earlier version.** The paper is the legal record, so the record must file exactly what was signed (the B-24 rule). Signed offline takes an optional `signedVersion` (default: the current one). When it names an earlier version, the service writes a new version that copies that version's values, fees and file (marked "copied from version k, signed on paper"), and files that as signed, in one transaction. History stays forward-only (part 1's triggers unchanged), and the newer unsigned versions stay visible, marked "not signed". The panel shows the chosen version's fees and says plainly that the newer version will not be the signed one. `expectedVersion` stays required as the stale check.
* **HTML inside a PDF wrapper (B-15) is an accepted risk, no fix:** downloads already send `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. FO-5f adds the test that asserts both headers on the signed-paper download, so the protection cannot be removed silently.
* **FO-3's slot read limit is per IP only** (R2-1: a per-firm read cap let a few addresses close a firm's page). Agreed on #1760; Lead B notes it in contracts §0.6.

| Row | What | Touch | Done when (a pass and a fail test each) | Waits on |
|---|---|---|---|---|
| **FO-5f** | runtime (retainer hardening, FO-5 part 2's Minors) | 1. `RETAINER_REQUEST_ENDED` written by an edit that ends a live request (above). 2. `expectedStatus` on Edit and Withdraw; Withdraw also requires `expectedVersion` (B-25, the Withdraw gap). 3. `signedVersion` on Signed offline (above). 4. Placeholders in equations (`m:t`) and drawings or SmartArt (`a:t`) are found and **refused** with a plain message ("Placeholders inside equations, drawings or SmartArt are not filled. Move it into normal text."), never printed blank (r3-m1 / B-21). 5. The placeholder cap is counted **before** docxtemplater compiles, from the text runs, and a refusal says why (B-19 rest). 6. Parts that lie about their size are a 422 "This file is damaged or is not a Word file", never a 500 (B-20). 7. Name lengths are checked after NFC normalization, so a name that grows past 120 is a 422 (B-22). 8. The glossary part is not read for placeholders, since it is never rendered (B-23). 9. An agreement's "missing" list uses the placeholders of the template version it was made from, not the template's newest (Devin 4575579359). 10. The `tx()` log line carries only the error code and the constraint name, never Prisma's `meta` (r3-m2). 11. A refused download says "No such file" (B-26). 12. The shared upload filter's message in `main.ts` names no size ("This file is too large for this upload."); each route's own limit message names its number (B-8; one line in `main.ts`, flagged in the PR body for the release holder's read as a shared file). 13. The B-15 header test above. | `api/src/front-office/retainers/*.ts`, `ports/events.ts` (one name), `api/src/main.ts` (one line), `tests/check_fo5_retainers.ts` | each numbered item has its pass and fail test in `check_fo5_retainers.ts`; two staff on the same retainer: Draft page edit after a colleague's Send → 409 `CHANGED`; Signed offline naming version 1 while version 2 exists files version 3 = copy of 1, marked signed, and the audit names 1 and 3; a request ended by an edit writes exactly one `retainer.request_ended`; `graph.mjs --check` and the type check pass. **Breaker: yes** on items 2 and 3 only (money and the signed record). | FO-5 part 2 (#1777) on `main` |
| **FO-3f** | runtime (booking hardening, FO-3's Minors) | 1. The name rule allows U+200C and U+200D between letters (a Persian name such as "علی‌رضا" books; m10). 2. The confirmation email goes through PF-14's `JobPort`, so a failed send retries after commit (m3). 3. `staffCreate` no longer returns the visitor's link token (staff never need it; m7). 4. One form stamp books once: a used stamp is refused with "This form was already sent. Reload the page to book again." (B-8 of the breaker; if no existing column can hold a used stamp, item 4 needs schema: it then leaves this row as **FO-3f2** with a migration slot from the release holder, and FO-3f lands without it). 5. The firm's 200 cap holds under bookings in flight: the count runs under a per-firm transaction lock (`pg_advisory_xact_lock` on the firm id) (breaker's cap race). | `api/src/front-office/booking/*.ts`, `tests/check_fo3_booking.ts` | each item has its pass and fail test; 20 parallel bookings at cap − 1 give exactly one success; `check_fo3_booking.ts` and the type check pass. | FO-3 on `main` (done), PF-14 on `main` (done) |
| **PF-4f** | runtime test (sign-in door checks, PF-4t's Minors) | In `tests/check_forms_qa53.ts`: the door rule asserts the exact status each door returns, not `status < 400`, so a 404 or 5xx fails (m1); the doors list is asserted to be exactly `["POST /api/platform/session/local"]` (m2). | `tests/check_forms_qa53.ts` only (a case-side file: **the release holder's OK is asked with this revision**) | a door answering 404 or 500 fails the check (shown once by a fail test); an added door fails the list check. | PF-4t (#1775, done) |

**Carried to other rows (no new row):**
* **FO-3's m4** (`bookingConsentWording` and `contactOf` on ArrivalPort): move to PF-19a's `ConsentPort` and FO-2's people read when those land. Added to FO-2's Done when; PF-19a is in flight, so it is not touched there.
* **FO-3's m8** (the prospect move is proved on the fake only): FO-2's Done when proves the real move once.
* **FO-3's B-12** (no trust-proxy setting in `main.ts`): PF-8's Done when sets it for the load balancer and tests that a forged `X-Forwarded-For` does not change the per-IP limit.
* **FO-3a's brief** (when written) adds: field names avoid program words (B164; FO-1b's `visitorTimeZone` became `bookerTimeZone`).
* **FO-3 size** (~1,000 lines against ~800): accepted once on #1760; no rule change.

**Order:** FO-5f after #1777 merges; FO-3f now (both its waits are done); PF-4f now if the release holder OKs the case-side file. All three are schema-free and may run beside any schema row.

**Rev 16.8 ruling (Lead 51, 15 Nov 07:5x IST):** PF-4f's `tests/check_forms_qa53.ts` OK (keep the `PLATFORM_PATH` pattern and its exact-source guard); FO-5f's one `main.ts` line OK as a shared-file hook (P-584), named in the PR's touch list. FO-5f decisions noted. Order: FO-3f and PF-4f start now; FO-5f after #1777. Lead 51 copies rev 16.7 and 16.8 into BACKLOG at its next records pass.

## Rev 16.9 (15 Nov 08:0x IST, Lead B (4)): a `Source:` for every PF/FO row (P-595; Lead 51's ask)

**How:** each row's Source lists (1) the team's fine requirement ids it already cites, every one checked by script to exist in the newest name-free copy `domain/requirements-2026-11-02/` (shorthand such as "AG-4-16, -17" expanded; one slip, `AG-2-13` in FO-12s, dropped as not found); (2) the P-decisions that set or changed it (process rules such as P-223 and P-423 left out); (3) the regulator's Code with its official page and read date where the row cites it. Rows no requirement asks for (engineering seams, tools) carry the P-decision that created them. Rows that cited only a section got fine ids by hand: PF-21b, PF-21c, PF-21d, PF-21rs (SA-11 §4), PF-4s (SA-7), PF-19s (AG-12). **Content hashes** are left to TR-1's `trace-requirements.py`, which computes them from these ids. FO-13k is left out (moved to PF-21 by P-584 (8)).

**Copy rule for BACKLOG:** append `Source: <value>` to the row's last column (decisions or sources), unchanged.

| Row | State | Source |
|---|---|---|
| FO-3f | new lane row (rev 16.8) | AG-4-1, AG-4-4, AG-4-5, AG-4-7, AG-4-9, AG-4-11, AG-4-12, AG-4-14, AG-4-16, AG-4-19, AG-4-22, AG-4-26, AG-4-29, AG-4-32, AG-4-34, AG-4-36, AG-4-37, AG-4-39, AG-4-47, AG-4-62, AG-4-63, AG-4-67, AG-2-10, AG-2-26; PR #1760 review and break reports (the items harden these rules) |
| FO-5f | new lane row (rev 16.8) | AG-5-65, AG-5-50, AG-5-47, AG-5-49, AG-5-9, AG-5-3, AG-5-34, AG-5-16, AG-5-28, AG-5-39, AG-5-64; P-566 (3) (the Lead B decisions in rev 16.8); PR #1777 review and break reports |
| PF-4f | new lane row (rev 16.8) | P-291, P-599; PR #1775 round 2 m1, m2 |
| FO-5 | open PR | AG-5-65, AG-5-50, AG-5-47, AG-5-49, AG-5-9, AG-5-3, AG-5-34, AG-5-16, AG-5-28, AG-5-39, AG-5-64 |
| FO-13 | open PR | P-579; Code SOR/2022-128 s. 5, 15, 16, 24(2)(a), 24(3)(o)(r)(v), 29, 35(1)(c), 37 (laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, current to 2026-10-19, read 13 Nov 2026; Unconfirmed: no counsel) |
| PF-19a | open PR | SA-11-29, AG-10-22, AG-2-83; P-584, P-559 |
| FO-7a | open PR | AG-6-59, AG-16-14, AG-6-1, AG-6-4, AG-6-19, AG-6-44, AG-6-46, AG-6-60, AG-6-61, AG-6-63, AG-6-69; Code SOR/2022-128 s. 32(d), 33(3) (laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, current to 2026-10-19, read 13 Nov 2026; Unconfirmed: no counsel) |
| FO-5r | not built | P-561, P-562 |
| PF-4b | not built | AG-1-10, AG-1-12, AG-1-13, AG-1-30, AG-1-40, AG-1-41, AG-1-42, AG-1-55, AG-1-70, SA-6-29 |
| PF-5 | not built | SA-4-54, SA-4-67, SA-4-30, SA-4-79, SA-4-82, AG-1-65, SA-2-4, SA-2-6, SA-2-7, SA-2-21, SA-2-22, SA-2-24, SA-3-19, SA-3-46, SA-4-4, SA-4-8, SA-4-11, SA-4-20, SA-4-21, SA-4-22, SA-4-25, SA-4-26, SA-4-27, SA-4-35, SA-4-52; P-566 |
| PF-5s | not built | SA-2-1, SA-2-24, SA-3-46, SA-4-4, SA-4-5, SA-4-30, SA-4-52, SA-4-54, SA-4-67, SA-4-79, SA-4-82, AG-1-65; P-566 |
| PF-7 | not built | P-558 |
| PF-23c | not built | NFR5-14; P-558 |
| PF-26 | not built | AG-2-93, SA-11-36, SA-11-40, AG-2-49a |
| PF-18n | not built | AG-10-29a, AG-10-29b, AG-10-36, AG-7-39, AG-16-10 |
| PF-21b | not built | NFR5-14, SA11-D4, SA11-D3, SA-11-18, SA-11-27, SA-11-28, SA-11-40 |
| PF-21c | not built | SA-11-25, SA-11-14, SA11-D8, SA-11-24, SA-11-35 |
| PF-21d | not built | SA-11-16, SA-11-18, SA-11-28, SA-11-40 |
| PF-21rs | not built | SA-11-18, SA-11-24, SA-11-27, SA-11-34 |
| FO-3a | not built | AG-4-9, AG-4-10, AG-4-62, AG-4-4, AG-4-5, AG-4-66, AG-4-8, AG-4-49, AG-4-67 |
| FO-3w | not built | AG-4-16, AG-4-17, AG-4-18, AG-4-19, AG-4-20, AG-4-36, AG-4-37, AG-4-38 |
| FO-3st | not built | AG-4-63, AG-4-39, AG-4-49, AG-4-50, AG-4-4, AG-4-8, AG-4-9, AG-4-62, AG-4-67 |
| FO-1k | not built | P-559, P-600 |
| FO-2 | not built | AG-2-4, AG-2-5, AG-2-8a, AG-2-13c, AG-2-26, AG-2-37a, AG-2-44, AG-2-47, AG-2-49, AG-2-75, AG-2-80, AG-2-84, AG-2-94, AG-13-30 |
| FO-2b | not built | AG-2-52, AG-2-53, AG-2-75, AG-2-76, AG-2-77, AG-2-79 |
| FO-3c | not built | AG-4-22; P-564 |
| FO-4 | not built | AG-2-4, AG-2-5, AG-2-13c, AG-2-18, AG-2-44, AG-2-47, AG-2-53, AG-2-75, AG-2-77, AG-2-80, AG-2-94; P-392 |
| FO-4b | not built | AG-2-5, AG-2-8a, AG-2-49 |
| FO-8 | not built | P-560, P-558, P-559 |
| FO-5b | not built | AG-5-9; P-566 |
| FO-6 | not built | AG-5-21, AG-5-65, AG-5-34, AG-5-20, AG-5-25, AG-5-26, AG-5-28, AG-5-31, AG-5-37, AG-5-41, AG-5-62, AG-5-68, AG05-D4; P-564, P-563 |
| FO-6v | not built | P-561, P-563 |
| FO-5s | not built | AG-5-4, AG-5-7, AG-5-8, AG-5-9, AG-5-20, AG-5-26, AG-5-27, AG-5-31, AG-5-34, AG-5-39, AG-5-49, AG-5-50, AG-5-55, AG-5-57, AG-5-62, AG-5-64, AG-5-65, AG-5-68; P-564, P-473 |
| PF-6 | not built | AG-1-10, AG-1-12, AG-1-13, AG-1-15, AG-1-22, AG-1-30, AG-1-31, AG-1-40, AG-1-41, AG-1-42, AG-1-55, AG-1-66, AG-1-69, AG-1-70, SA-6-29, SA-6-44 |
| PF-12 | not built | AG-1-1, AG-1-3, AG-1-45 |
| PF-13 | not built | AG-1-6, AG-1-9, AG-16-2; P-574 |
| FO-7b | not built | AG-6-1, AG-6-61, AG-6-46, AG-6-19, AG-6-63, AG-6-48, AG-6-23, AG-6-71, AG-6-4, AG-6-44 |
| FO-7c | not built | AG-16-14, AG-6-14, AG-6-49, AG-6-16, AG-6-17 |
| FO-7t | not built | AG-6-59, AG-6-60, AG-6-61, AG-6-62, AG-6-69 |
| FO-9a | not built | AG-2-16, AG-2-78, AG-2-96; P-574 |
| FO-9b | not built | AG-2-16, AG-2-78, AG-2-96; P-574, P-575 |
| FO-9s | not built | P-574 |
| FO-10 | not built | AG-2-13a, AG-2-13b, AG-2-13d; P-574, P-570 |
| FO-11 | not built | AG-16-18; P-574 |
| FO-7p | not built | P-574, P-567, P-578 |
| FO-12b | not built | AG-2-31, AG-2-39, AG-2-56 |
| FO-12c | not built | AG-2-90, AG-2-91 |
| FO-12s | not built | AG-2-31, AG-2-90, AG-2-91 |
| FO-13c | not built | Code SOR/2022-128 s. 5, 15, 16, 24(3)(o), 35(1)(c) (laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, current to 2026-10-19, read 13 Nov 2026; Unconfirmed: no counsel) |
| FO-13i | not built | P-579; Code SOR/2022-128 s. 24(2)(a) (laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, current to 2026-10-19, read 13 Nov 2026; Unconfirmed: no counsel) |
| FO-13s | not built | P-579 |
| PF-4s | not built | SA-7-1, SA-7-2, SA-7-3, SA-7-10, SA-7-11, SA-7-14, SA-7-20 |
| PF-4c | not built | AG-1-69, AG-1-34, SA-3-39, AG1-D19 |
| PF-15 | not built | SA-3-39, SA-3-40, SA-3-58, SA-4-56, SA-3-62 |
| PF-16 | not built | SA-4-28, SA-4-49, SA-4-53, SA-4-55, SA-4-62, SA-4-79, SA-4-91, SA-3-58, SA-4-56, SA-4-89; P-566 |
| PF-17 | not built | SA-2-14, SA-2-22, SA-2-23, SA-4-24, SA-4-49, SA-4-50, SA-4-62, SA-4-80 |
| PF-18a | not built | AG-16-10, AG-16-59, AG-16-68, AG-1-74, AG-16-11 |
| PF-18b | not built | AG-16-63 |
| PF-18s | not built | AG-16-10, AG-16-63, AG-16-68 |
| FO-3v | not built | AG-4-58, AG-4-59, AG-16-73, AG-4-29; P-580 |
| FO-5p | not built | AG-12-89 |
| FO-6d | not built | AG-5-61; P-564 |
| FO-6ds | not built | AG-5-61 |
| FO-7r | not built | AG-6-28, AG-6-76, AG-6-31, AG-6-12, AG-6-21 |
| FO-14 | not built | AG-15-29, AG-15-30, AG-15-54, AG-10-73, AG-15-31, AG-15-32, AG-15-33 |
| PF-19b | not built | AG-2-59, AG-10-1, AG-10-3, AG-10-5, AG-10-20, AG-10-22, AG-10-25, AG-16-17; P-584 |
| PF-19c | not built | AG-12-70, AG-12-89, AG-12-44, AG-12-45, AG-12-65, AG-12-66, AG-12-95, AG-12-99; P-584 |
| PF-19s | not built | AG-12-4, AG-12-15, AG-12-16, AG-12-19 |
| PF-20 | not built | AG-2-31, AG-2-33, AG-2-59; P-584 |
| PF-20s | not built | AG-16-50, AG-16-51 |
| PF-21s | not built | P-579, P-584 |
| PF-23r | not built | SA-11-37, NFR5-14 |
| PF-23m | not built | SA-11-37 |
| PF-1 | merged | P-558, P-559 |
| PF-2 | merged | P-553, P-556 |
| PF-3 | merged | SA-2-1, SA-2-4, SA-2-9, SA-2-24, SA-2-25, SA-3-41, SA-3-46, SA-4-11, SA-6-27, SA-6-31, AG-1-17, AG-1-30, AG-16-3, AG-16-24, AG-16-59; P-559 |
| FO-1b | merged | AG-4-1, AG-4-4, AG-4-9, AG-4-26, AG-4-36, AG-4-62; P-559 |
| FO-1a | merged | AG-2-52, AG-2-77, AG-2-84, AG-2-8a, AG-13-21, SA-11-29, AG-16-76; P-559 |
| PF-L | merged | P-576 |
| PF-0p | merged | P-599, P-600 |
| PF-24 | merged | SA-8-1, SA-8-4, SA-8-6, NFR5-05, SA8-D1 |
| PF-4 | merged | SA-6-14, SA-6-18, SA-6-29, SA-6-44, AG-1-12, AG-1-13, AG-1-15, AG-1-19, AG-1-22, AG-1-30, AG-1-31, AG-1-40, AG-1-42, AG-1-55, AG-1-66, AG-16-24; P-566, P-571 |
| PF-23 | merged | SA-11-37, SA-8-27, NFR5-14, SA8-D40 |
| PF-14 | merged | AG-10-1, AG-11-17 |
| PF-25 | merged | SA-2-27, AG-4-17, AG-4-16, AG-15-27, SA-2-1, SA-2-2, SA2-D8, SA2-D21 |
| FO-3 | merged | AG-4-1, AG-4-4, AG-4-5, AG-4-7, AG-4-9, AG-4-11, AG-4-12, AG-4-14, AG-4-16, AG-4-19, AG-4-22, AG-4-26, AG-4-29, AG-4-32, AG-4-34, AG-4-36, AG-4-37, AG-4-39, AG-4-47, AG-4-62, AG-4-63, AG-4-67, AG-2-10, AG-2-26 |
| PF-4t | merged | P-291, P-599 |
| PF-21 | merged | P-584, P-579; Code SOR/2022-128 s. 24(3)(r)(v), 29, 37 (laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/, current to 2026-10-19, read 13 Nov 2026; Unconfirmed: no counsel) |

## Rev 16.10 (15 Nov 09:3x IST, Lead B (4)): rows from qa's R1 findings (#1789, #1792; Lead 52's list)

**Duplicate check first (P-526):** each item was checked against BACKLOG on `lead/2026-11-07-lead31`, the three shaping lanes' files, and the release holder's `design/case-side-rows-draft2-2026-11-14.md`.

| Lead 52's item | Result |
|---|---|
| (1) PF-14b, the readiness probe and job metrics (QA-452) | **No new row: S1's PF-23w is this row** (approved, batch 4, with amendment C: after FO-3f). Its Done when adds: "qa's `tests/qa/check_qa452_*.ts` passes (ready counts the job queue, every handler is wrapped by `observeJob`, `stuckJobs` runs)". |
| (2) FO-3's `fakeJobs` swapped for `PlatformJobs` (QA-453, QA-473) | **No new row: PF-23w's swap of `runtime-ports.ts`** (after FO-3f #1785 merges). Its Done when adds: "qa's `tests/qa/check_qa453_real_jobport.ts` passes 2/2; a booking reminder and the attendance question queued before a restart still run after it (QA-473)". |
| (3) "own versus all" and "money and licence apart" (R1.6) | **New row PF-6b** (below), plus two lines in PF-6's Done when. |
| (4) QA-474, decision, close and reopen (map row 77) | **No new row: the release holder's CS-C1** (draft 2) is exactly this. |
| (4) QA-471, deadlines that remind (map row 74) | **New case-side draft CS-DL1** (below; the release holder approves). Nothing in BACKLOG, the lanes or draft 2 covers it. |
| (4) QA-472, notes and one timeline per record (map row 76) | **Front-office half: FO-2** already builds Add a note and the lead, prospect and client timeline (a read view, Lead 37's ruling). **Case half: new case-side draft CS-NT1** (below). |
| (5) FO-3w-staff | **No new row: FO-3sr** (rev 16.4; brief `lead-b-briefs/ROW-w.md`). Its waits are done (PF-4 and #1760 on `main`), but FO-3f #1785 has the booking files open, so it **starts the moment FO-3f merges**. |
| (6) The QA-470 fix | **New row FO-3h** (below), after FO-3f. |

| Row | Area | Item | Done when (a pass and a fail test each) | Source · waits on · decisions |
|---|---|---|---|---|
| **PF-6b** | runtime + catalogue data (platform: permission rules) | **Own versus all, and money and licence apart, made checkable (map row 6; R1.6).**<br>(1) **Catalogue facts as data:** every key in PF-4's catalogue carries `scope` (`OWN`, `ALL` or `NONE`) and `class` (`GENERAL`, `MONEY` or `LICENCE`), as catalogue rows by migration (P-601 (1)).<br>(2) **Money apart:** a `MONEY` key (payments, invoices, refunds, trust, billing export) is never implied by another key and never comes along with another key. A role holds one only when it is ticked explicitly. Copying a starter role into a custom role never carries a money key unless ticked. Granting a money key writes its own audit line.<br>(3) **Licence apart:** a `LICENCE` action needs both its key and the person to be a licensed user (SA-6-27; College ID on file, AG-1-26). Examples are signing as the representative and the s. 23/24 agreements' representative line. A key alone answers 403 "Only a licensed consultant can do this".<br>(4) **Own versus all, by sweep:** `tests/check_pf6b_permission_rules.ts` reads every route that declares an `OWN`/`ALL` key pair (PF-4's decorator metadata). With two staff members who each own records, the `OWN` holder sees only their own, the `ALL` holder sees the firm's, and neither sees firm B. The routes on `main` today are swept (FO-3 bookings, FO-5 retainers, PF-21 complaints), and later rows are swept automatically.<br>**Touch:** PF-4's catalogue files under `api/src/platform/identity/` (the two fields and the two checks), one migration folder (catalogue rows only), `tests/check_pf6b_permission_rules.ts` | a role copied from a starter role with no money tick has no money key; a direct grant of a money key without its tick → refused; a `LICENCE` action by an unlicensed Case Manager holding the key → 403, and by a licensed one → allowed; the sweep fails on a test route that returns another person's record to an `OWN` holder (shown once, then removed); every existing PF/FO suite passes unchanged; the migration test follows rev 16.7 | **Source:** SA-6-24, SA-6-27, SA-6-12, SA-6-13, AG-1-26, AG-1-31; checklist R1.6; qa #1789 · **waits on:** PF-4 (merged) · decisions: none · **breaker: yes (permissions); the release holder reads the diff (P-423)** · **size:** 1 PR |
| PF-6 (Done when, two added lines) | — | — | "The role editor shows money keys and licence actions in their own groups, each ticked one by one, never by a group tick; a custom role copied from a starter role shows its money keys unticked unless the starter had them." "A Case Officer without `view.all` sees only their own items in every list the screens show (PF-6b's sweep, in the browser)." | R1.6 |
| **FO-3h** | runtime (booking: the host's time zone in mail) | **The host's booking emails show the host's office time (QA-470).** The confirmation, reschedule and cancel emails to the **host** state the time in the host's office zone with the zone named ("10:00 a.m. (America/Toronto)"). The booker's own emails stay in the booker's zone, and the `.ics` stays in UTC. **Touch:** `api/src/front-office/booking/service.ts` (the mail lines), `tests/check_fo3_booking.ts` (cases added) | qa's `tests/qa/check_qa470_host_mail_zone.ts` passes 3/3; a booking from Asia/Dubai for 10:00 Toronto mails the host "10:00 a.m. (America/Toronto)" and the booker "7:00 p.m. (Asia/Dubai)"; a host in an office with a different zone from the firm's gets their office's zone (PF-18a) | **Source:** AG-04 Part B rule 9, AG01-24; qa #1792 (QA-470) · **waits on:** FO-3f #1785 merged (same file) · decisions: none · reviewer only · **size:** S |
| **CS-DL1** (case side: the release holder approves) | runtime (case side: government deadlines that remind) | **Deadlines that remind, in calendar or working days (map row 74; QA-471).**<br>(1) A stage's or milestone's deadline (AG-7-10's `deadlineOffsetDays`; AG-7-33's deadline-bearing milestones) gets a counting mode from pack data: `CALENDAR` (today's rule) or `WORKING`. `WORKING` skips weekends and the firm's and office's **closed days** (AG-4-7 in PF-3, AG-4-60 in PF-18a). The helper is one platform function, moved from PF-21's `api/src/platform/complaints/business-days.ts` to `api/src/platform/calendar/working-days.ts`, which Lead B OKs as its owner.<br>(2) **Reminders:** a `JobPort` job per deadline (key `deadline:<case>:<item>`) notifies the case officer and the representative through `NotificationPort` (PF-18n) at 7 days, 2 days and on the day (Sample), and puts one "Needs you" item on their home. A reminder is never sent twice.<br>(3) **Close and reopen stop and restart them** (AG-7-35; CS-C1's `case.closed` and `case.reopened`). A moved deadline re-arms with the new date. A missed deadline shows "Missed" in red on the case.<br>**Touch:** the case side's stage and milestone files (named by the release holder), the moved helper, new `api/src/case-deadlines/*.ts`, `tests/check_csdl1_deadlines.ts` | a 10-working-day deadline across a weekend and a firm closed day lands on the right date; the same in `CALENDAR` mode counts every day; the 7-day, 2-day and on-the-day reminders each fire once on the fake clock (a re-run sends nothing new); closing the case cancels pending reminders and reopening re-arms them; a moved deadline re-arms; firm A's job never reads firm B's cases; PF-21's complaint clock gives the same results after the helper moves | **Source:** AG-7-10, AG-7-33, AG-7-35; map row 74; qa #1792 (QA-471) · **waits on:** PF-14 (merged), PF-18n, CS-C1, PF-3/PF-18a closed days · decisions: the release holder (case side). Holiday suggestions stay X-25 · **breaker: yes (deadlines a client can lose a case on)** · **size:** 1-2 PRs |
| **CS-NT1** (case side: the release holder approves) | schema + runtime + screen (case side: notes and the case timeline) | **Notes on a case and on a case client, and one timeline per case (map row 76; QA-472, the case half).**<br>(1) `case_note` in a case-side area file (firm, case or case client, author, text 1-5,000 plain, visibility `INTERNAL` (default) or `CLIENT_VISIBLE`, pinned, created). It is add-only like FO-1a's `fo_note`: an edit writes a new version and keeps the old one (AG-13-24 author or admin only, firm-scoped). Portal reads return only `CLIENT_VISIBLE` notes (AG-13-21). An @mention notifies through PF-18n (AG-13-22).<br>(2) **The case timeline** is a read view, newest first, over the case's `audit_event` lines, its notes, its documents' events and its deadlines and decisions (CS-DL1, CS-C1), paged, with filters by kind. It replaces "go to the workspace Activity page" for one case.<br>(3) A screen panel on the case page: add a note, pin, and the timeline.<br>AG-13-25's single polymorphic notes service across both sides is **left as an X row**: front office keeps `fo_note`, and the case side gets `case_note` with the same shape and rules.<br>**Touch:** new case-side area file + one migration folder, `api/src/case-notes/*.ts`, the case page's panel files (named by the release holder), `tests/check_csnt1_notes_timeline.ts` | a note is added and listed; an edit keeps the earlier version; another firm's note → 404; a Case Officer cannot edit another person's note, and an Admin can; a `CLIENT_VISIBLE` note appears in the portal read and an `INTERNAL` one never does; an @mention notifies once; the timeline lists a document upload, a note and a decision in order and pages at 50; the migration test follows rev 16.7 | **Source:** AG-13-20, AG-13-21, AG-13-22, AG-13-23, AG-13-24; map row 76; qa #1792 (QA-472) · **waits on:** CS-W1 (walls), PF-18n; the timeline's decision lines after CS-C1 · decisions: the release holder (case side); AG-13-25 to X · **breaker: yes (personal data, portal visibility)** · **size:** 2 PRs (notes; timeline and panel) |

## Rev 16.11 (15 Nov 09:3x IST, Lead B (4)): P-606, finish whole and name every test (Lead 52's ask)

### (a) Every Done when line names its test: rule for every Lead B row, the Batch 5 rows and the qa rows
* Each Done when line becomes **one named case** in the row's test file: `"<ROW> DW<n>: <the line in short>"`, numbered in the order the lines are written. Example: `tests/check_fo3h_*.ts` holds `"FO-3h DW1: host mail in host's office zone"`.
* A pass and a fail case share the number (`DW3 pass`, `DW3 fail`).
* The brief lists the case names before building (P-606 (4)), and the reviewer ticks one case per line. A line with no case is a red review finding, never a Minor.
* Journeys are named the same way in the join row's walk file (`J-<cap> W<n>`).
* This holds for every row already shaped (no row is rewritten; the builder adds the names in step 0 and the reviewer checks them), and for every new row.

### (b) One "join and walk" row per multi-part capability
* A **J-row** is the last row of a capability. It owns:
  1. the **wiring** no part owns (QA-452's lesson);
  2. **every swap from a port fake to the real adapter** that the capability's running path needs (QA-453's lesson);
  3. the **screen**, if the capability has one, either built in the J-row or named as its one waits-on screen row;
  4. the **walk**: one browser journey from the capability's first step to the next capability's first step (gate A), in `tests/journeys/j_<cap>.ts`.
* qa scores the capability when its J-row merges (P-606 (2)).
* **Size:** S to M. It adds no new feature, only the joins.

### (c) Front-office screens first in the ready order
No front-office screen exists yet. These go to the top of ready, each built on its API contract in parallel with the API row (P-606 (9)):
1. **FO-4** (sales screens; concept r2 approved) beside **FO-2** (its API).
2. **FO-3sc**, then FO-3w and FO-3st1-3.
3. **FO-5s** (concept r2 approved) after FO-6.
4. **PF-6** (staff screens; concept approved) beside PF-4b.
5. **PF-5s** after PF-5.

### (d) CI guard: one shared contract test per port, row **PF-0c**
| Row | Area | Item | Done when | Source · waits on |
|---|---|---|---|---|
| **PF-0c** | CI + tests (ports: contract tests) | **Each port's fake and its real adapters pass one shared contract test** (Fowler's ContractTest; P-606 (8)). It covers `ports/contracts/<port>.contract.ts` for every port in `ports/` that has both a fake and a real adapter on `main` today: `JobPort` (fake, pg-boss), `FilesPort` (fake, local), `SecretBoxPort`, `IdentityPort` (local stand-in; Cognito later), `MailPort` (fake, demo inbox), `ClockPort`, `AuditPort` (interim adapter), `ConsentPort` (PF-19a). Each contract is a function taking an adapter factory; the fake's suite and the real adapter's suite both call it. **The CI guard** `tools/check-port-contracts.mjs` fails when a file under `ports/` declares a port that has a real adapter but no contract file, or a contract that one of its adapters does not run. **Touch:** new `ports/contracts/*.ts`, `tools/check-port-contracts.mjs`, one CI step (the release holder reads it, P-423), the adapters' own test files (one call each) | `PF-0c DW1`: the guard fails on a test port with a real adapter and no contract (shown once, then removed). `DW2`: each listed port's fake and real adapter pass its contract. `DW3`: a deliberately wrong fake (a `JobPort` fake that runs a keyed job twice) fails the contract. `DW4`: the guard runs in under 10 s. | P-606 (8); QA-452, QA-453 · **waits on:** nothing · reviewer only · **size:** 1 PR |

### (e) Finish order: the started capabilities, with their missing parts
**Counted from MVP-CHECKLIST §A** (lead branch, 15 Nov) against `main`: every capability in Lead B's areas with **at least one part merged and at least one part missing**. That makes **19**; Lead 52's "11" is probably qa's Partial verdicts, a subset of these. They are ranked by fewest missing parts, so lanes close the nearest ones first. A lane takes no new capability in its group while one of these is open (P-606 (3)).

| Rank | Map row | Capability | Merged | Missing parts → J-row |
|---|---|---|---|---|
| 1 | 9 + 13 | Background jobs; logs, metrics and alerts | PF-14, PF-23 | **PF-23w** (it is this pair's J-row: the probe, `observeJob`, the stuck alarm, FO-3's swap to `PlatformJobs`; after FO-3f) · PF-23r · #1782 (CI step) · later PF-23c (cloud) |
| 2 | 15 | Secrets in a managed store | PF-24 | PF-24w · the cloud half in PF-8b (founder's AWS) → **J-15** = PF-24w's walk (start fails closed; a secret is read once) |
| 3 | 24 | Each firm's own web address | PF-25 | PF-25w (after PF-4s) · DNS in PF-8b → **J-24**: a firm address opens its booking page (walk to row 37) |
| 4 | 109 | Complaints record | PF-21 part 1 | PF-21w (routes) · PF-21s (screen) → **J-109**: log a complaint, its 30-business-day clock, close it |
| 5 | 38, 40 | Time zones; calendar invite files | FO-3 | FO-3h (QA-470) · FO-3f (#1785, open) → **J-38**: book from another zone, both mails and the `.ics` right |
| 6 | 6 | Permissions: own versus all; money and licence apart | PF-4 | **PF-6b** (rev 16.10) · PF-6's two Done when lines → **J-6**: the R1.6 walk on screen and API |
| 7 | 5 | Staff sign-in, two-step, lock-out | PF-4, PF-4t, PF-4f (#1784 labelled) | PF-4b (Cognito proof needs the founder's AWS) · PF-4s · PF-6 (screens) → **J-5**: invite → accept → two-step → sign in → lock-out on leaving |
| 8 | 49 | Consent gate before every send | PF-19a | PF-19b (sending) → **J-49**: a send without consent is blocked; unsubscribe works |
| 9 | 28 | Consent recorded per purpose | PF-19a | FO-2 (the web form records it) → **J-28** (inside J-27's walk) |
| 10 | 27 | Every lead carries a source | FO-1a | **FO-2** (API) · **FO-4** (screens) → **J-27**: web form → lead with source and consent → Unassigned → Take it → Engage (walk to row 37) |
| 11 | 37 | Public booking page; no double booking | FO-1b, FO-3 | FO-3f · FO-3sr · FO-3sc → FO-3w · PF-23w (real jobs) → **J-37**: the public page books a slot, and a second booker of the same slot is refused |
| 12 | 41 | Staff hours and time off | FO-1b, FO-3 | FO-3a part 1 · FO-3st2 → **J-41** |
| 13 | 42 | Reschedule or cancel by link; outcomes; consult record | FO-3 | FO-3sr · FO-3a part 2 · FO-3st1, FO-3st3 → **J-42**: reschedule by link → attendance → consult record → the next step button (walk to row 53) |
| 14 | 53 | Retainer with the regulator's items; versioned until signed | FO-5 parts 1 and 2 | FO-5f (#1791, open) · FO-5b · FO-6 (signing) · FO-5s → **J-53**: draft from template → send → sign → WON (walk to the case side's `prospect.won`, FO-8) |
| 15 | 104 | Consultation agreement before the first consult | FO-5 | FO-3c · FO-6 · FO-5s → **J-104** |
| 16 | 19 | A firm is created once, with plan, trial and owner | PF-3 | PF-5 (Stripe needs the founder's test account) · PF-5s → **J-19**: sign up → trial → first staff invite (walk to row 5) |
| 17 | 29 | One person record; duplicate warning; safe merge | FO-1a | FO-9a · FO-9b (the case side's client merge) · FO-9s → **J-29** |
| 18 | 1 | Hosting in Canada | PF-7 | PF-8a, PF-8b, PF-8c, PF-23c (founder's AWS) → **J-1** = PF-8c's deploy smoke |
| 19 | 48 | Sending, delivery state, bounces | PF-L (libraries) | PF-19b → **J-48** (with J-49) |

**J-row texts (one pattern, so the table is the spec):**
* **Item:** "Join and walk for map row N: the wiring and fake-to-real swaps listed, the screen named, and the walk named".
* **Touch:** the swap lines named by the parts, plus `tests/journeys/j_<N>.ts`.
* **Done when:** each listed swap is shown real by a test that fails on the fake (`J-N DW1..`), and the walk passes in a visible browser and as a scripted check (`J-N W1..`), ending at the next capability's first step.
* **Waits on:** the listed parts.
* **Size:** S to M, reviewer and breaker.
* Rows 9+13 and 15 need no separate J-row, because PF-23w and PF-24w already are their joins; their walks are added to those rows' Done when.

**Pull order for the PF/FO lanes, finish first** (P-606 (3), (9)):
1. PF-23w → FO-3h → FO-3sr (as FO-3f merges);
2. PF-6b;
3. PF-21w → J-109 after PF-21s;
4. FO-2 beside FO-4 (screens first);
5. FO-3sc → FO-3w;
6. FO-5f → FO-6 → FO-5s;
7. PF-19b;
8. then the rest of the table.

PF-0c can run beside any of them. New capabilities (shaping Batches 1-5) start in a group only after that group's started rows are closed.

## Rev 16.12 (15 Nov 09:3x IST, Lead B (4)): edits to existing rows and the X additions, as exact copy text (Lead 52's "not applied" list; P-607)

**P-607 (founder, 15 Nov), noted:**
* All nine answers follow Lead B's recommendations, except **LMIA: row 98's CS-98* rows are in Release 1, scheduled last in the case-side lane** (amends P-568 for row 98).
* Q4 and Q7 are upheld, so the government-fee line is typed in R1 and ZIP is refused in R1.
* The domain is `<firm>.expatready.com` on Route 53. PF-8b's domain parameter is `expatready.com`, and its question 1 is closed.

**Already written, to copy as they are:**
* **Batch 5, consolidated:** `design/lead-b-shaping-approvals-2026-11-15.md`, section "Batch 5: consolidated" (b1c10da9d, time fixed in a8a2fe9ae).
* **P-606's join rows and the test-naming rule:** this file's "Rev 16.11" (abe049146).
* **The qa rows:** "Rev 16.10" (5fd3862a3).

### Edits to existing BACKLOG rows (replace or append exactly as written)

| Row | Where | Text |
|---|---|---|
| **FO-3st** | replace the whole row's Item | "**Split into FO-3st1 (bookings calendar and booking detail), FO-3st2 (My account → Availability and Time off) and FO-3st3 (Settings → Booking types and Timings)**, shaping S2, approved in batch 1; no new scope. This row is a pointer only, so build the three." |
| **FO-6** | append to Done when | "`FO-6 DWn`: a locked firm's signing door answers PF-27's neutral refusal through `firmAllows(firmId, 'sign')` (test; batch 2, amendment 5)." Also append: "`FO-6 DWn+1`: an Edit that ends a live request and a Withdraw each cancel the signing request through `SigningPort.cancel` in the same transaction; signing after either is refused (rev 16.8)." |
| **FO-7c** | append to Done when | "`FO-7c DWn`: a locked firm's pay link answers PF-27's neutral refusal through `firmAllows(firmId, 'pay')` (test; batch 2, amendment 5)." |
| **PF-4p** | append to Done when | "`PF-4p DWn`: a locked firm's portal lets a client sign in, see status and download their own documents, while uploads, signing, messaging and payments answer PF-27's neutral refusal (test; batch 2, amendment 5)." |
| **PF-21rs** | replace Done when (S3's text, approved in batch 3) | "Browser check, in our console as the Platform Owner (`PF-21rs W1`-`W6`): (W1) log a data request, see its target date of received + 30 days, move it to In progress then Completed, and see each event listed; (W2) on the fake clock, a request past its date shows Overdue with one alert; (W3) place a person hold, then try to delete that person's record in a firm and see `HELD` with the reason; release it and the delete proceeds; (W4) open a breach naming two firms, send the notices, and see exactly one notice per firm and none to a third, with no second send offered; (W5) a firm user opening any of these pages gets 403; (W6) keyboard only, axe-core with 0 serious, at 1024 and 1440 widths (console)." |
| **PF-6** | append to Done when (rev 16.10) | "`PF-6 DWn`: the role editor shows money keys and licence actions in their own groups, each ticked one by one, never by a group tick; a custom role copied from a starter role shows its money keys unticked unless the starter had them." "`PF-6 DWn+1`: a Case Officer without `view.all` sees only their own items in every list the screens show (PF-6b's sweep, in the browser)." |
| **PF-23w** | append to Done when (rev 16.10) | "`PF-23w DWn`: qa's `tests/qa/check_qa452_*.ts` passes: ready counts the job queue, every handler is wrapped by `observeJob`, and `stuckJobs` runs." "`PF-23w DWn+1`: qa's `tests/qa/check_qa453_real_jobport.ts` passes 2/2; a booking reminder and the attendance question queued before a restart still run after it (QA-473)." Also add to waits on: "FO-3f #1785 merged (batch 4, amendment C)". |
| **FO-3sr** | append to waits on | "FO-3f #1785 merged (same booking files)." |
| **PF-8b** | replace "decisions: the domain name and where its DNS lives (founder; question 1)" | "decisions: P-607, `<firm>.expatready.com` on Route 53 in the founder's AWS account, with a `staging.` sub-zone." |
| **FO-7v** | replace "decisions: P-603; Q2" | "decisions: P-603; P-607 (trust never negative, departing from AG-6-75 r4)." |
| **AS-2c** | replace "Question 5" | "P-607 (review before sharing on by default, departing from BR-16's default)." |
| **PF-F4** | replace "decisions: Q7" | "decisions: P-607 (plain ZIP refused in R1, departing from SA-8-37 and SA-8-49)." |
| **FO-7s1** | replace "Q4" | "P-607 (the government-fee line is typed in R1; one-click is X-S3-6)." |

### X additions (batch 3, Q11; add to "After the end-to-end production-grade system", P-582)

| X | What | Requirement ids | Why later |
|---|---|---|---|
| **X-20 (widened)** | LMIA after approval (AG-17-62 to -68), inspection pack (AG-17-53), corporate dashboard (AG-17-56), quick LMIA check (AG-17-77, -78), candidate CSV import (AG-17-80), outstanding-items request (AG-17-82), ad cost as an expense (AG-17-83), filing summary (AG-17-70), employer portal views (AG-17-21's portal part, AG-17-90) | as listed | Row 98's core is in R1 (P-607); these extras follow. |
| **X-Tasks** | Task extras: subtasks (AG-13-3), templates (AG-13-4), tasks from dated items (AG-13-65), working-day due dates (AG-13-69), Overdue by person (AG-13-68), tasks from email and "Remind me if no reply" (AG-13-71, -72), Recently deleted (AG-13-70), stand-alone reminders (AG-13-10 to -16) | as listed | PF-29's core first. |
| **X-Assess** | Assessment extras: what-if recommendations (AG-3-22 to -24), the cut-off band (AG-3-15; P-236), the stale queue and run diff (AG-3-29, -30), pinned re-runs (AG-3-31), bulk and automatic re-runs, the client copy in the client's own language (BR-17, French first) | as listed | FO-15 and AS-2c first. |
| **X-Notes** | One polymorphic notes service across front office and case side (AG-13-25) | AG-13-25 | Rev 16.10 (CS-NT1): two tables with the same shape in R1. |
| **X-S3-1** | Annotations on a document preview; a "please re-take" annotation that re-requests | AG-9-25 | The preview is enough to review in R1. |
| **X-S3-2** | ZIP unpacking | AG-9-54; SA-8-49 | P-607: refused in R1. |
| **X-S3-3** | Password-protected uploads unlocked on the client's device | AG-9-69 | Needs client-side PDF handling. |
| **X-S3-4** | Previews of HEIC, TIFF, Word and Excel by conversion | AG-9-24 | A conversion service is new technology. |
| **X-S3-5** | Reports extras: scheduled reports, XLSX, saved and shared views, stage durations, SLA, productivity and compliance analytics, Rep and Compliance layouts, rollups | AG-14-2, -3, -10 to -12, -16, -21, -23 to -25 | Q8 (live reads in R1). |
| **X-S3-6** | One-click government-fee line from a case fee | AG-6-40 | P-607: typed in R1. Waits on the case side's fee record. |
| **X-Backup** | AWS Backup vault lock in compliance mode | — | Batch 1: governance mode in R1 until the first cloud drill passes. |
| **X-Zip-xlsx** | `.xlsx` import, if no reader passes P-587 at PF-10b's gate | AG-18-4 | S1 question 7. |

## Rev 16.13 (15 Nov 09:5x IST, Lead B (4)): FO-5f's row answers carried into FO-6 and FO-8 (#1791 comment 6889086217)

| Row | Where | Text |
|---|---|---|
| **FO-6** | append to Done when | "`FO-6 DWn`: Signed offline also requires `expectedStatus` (the status the page showed); a Signed offline from a page still showing Draft after a colleague's Send → 409 `CHANGED`, and the just-sent request is untouched (FO-5f breaker m-2)." "`FO-6 DWn+1`: the signer, representative and template of a signed agreement are read from the **filed version's** merge values, never from the retainer row (FO-5f question 1); a version copied from an earlier one with a different signer names that signer." |
| **FO-8** | append to Done when | "`FO-8 DWn`: `prospect.won`'s payload takes the signer and the representative from the filed (signed) version's merge values, never from the retainer row (FO-5f question 1)." |

FO-5f questions 2 (the optional `reason` on `RetainerEventPayload`) and 3 (the shared 413 wording) are accepted as built.

## Rev 16.14 (15 Nov 10:14 IST, Lead B (5)): FO-7a split after round 4 (P-603; #1758 comments 6889306601, 6889325432)

**Duplicate check (P-526):** BACKLOG on the lead branch, open PRs, `main` and the release holder's case-side draft 2. Nothing else holds `money_move_*` or AG-6-73. **Name corrected to FO-7mv by Lead 53 (bfd5425a3): FO-7m is already the monthly trust check (AG-6-74). Lesson: the duplicate check covers row ids too.**

| Row | Area | Item | Done when (a pass and a fail test each, named `FO-7mv DWn`) | Source · waits on · decisions |
|---|---|---|---|---|
| FO-7a (amended) | — | **FO-7a keeps** the 11 base tables plus `money_write_off`, and fixes B-20 (a reused prefix repeats a printed number) and B-21 (invisible characters in text). `money_move_batch` and `money_move_line` leave the PR and go to FO-7mv. The removal gets one diff-only reviewer pass at high effort, with no new rules. | as before, minus the move-list lines; plus a B-20 and a B-21 fail test | P-603 · the release holder confirms the split and reads the migration (P-423) |
| **FO-7mv** | schema + runtime (client money: the "To move" list) | **The "To move" list from trust to operating, safe against returns and corrections (AG-6-73; B-18, B-19 from #1758).**<br>(1) `money_move_batch` and `money_move_line` in FO-7a's money area file. Its own migration folder, with a stamp later than `main`'s newest (P-600), additive.<br>(2) **Cap:** a `TRUST_APPLIED` move line is at most its withdrawal less the money returned from it. A return of money already moved is refused unless that move is undone first. `money_move_line_write` takes the party trust lock.<br>(3) **Correction kinds:** a deposit correction carries `BOUNCED`, `WRONG_ACCOUNT` or `ENTRY_ERROR`. Only a `WRONG_ACCOUNT` correction, linked to its deposit, permits a `WRONG_ACCOUNT` move out of trust, capped at that correction's amount. `BOUNCED` and `ENTRY_ERROR` never permit a move.<br>(4) The party's trust balance never goes below zero (P-607).<br>**Touch:** the money area file and one migration folder, `api/src/client-money/` move files (as FO-7a names them), `tests/check_fo7mv_move_list.ts` | `DW1`: "withdraw 100, move 100, return 100" three times on one 100.00 invoice moves 100.00 once; the second move and the return of moved money are refused (B-18). `DW2`: the cap and the trust lock hold under two parallel moves. `DW3`: a bounced cheque corrected −300 (kind `BOUNCED`), then a 300 move → refused (B-19 a). `DW4`: a 200 deposit refunded and then corrected −200, then a move → refused (B-19 b). `DW5`: a `WRONG_ACCOUNT` correction of 150 permits a move of 150, and 151 is refused. `DW6`: no path takes a party's trust below zero. `DW7`: the migration test follows rev 16.7. | **Source:** AG-6-73, P-603, P-607; #1758 round 4 (B-18, B-19) · **waits on:** FO-7a merged · decisions: correction kinds (Lead B, row owner, 15 Nov; reversible, best practice: a correction states why) · **breaker: yes (money); builder, reviewer and breaker at high effort; the release holder reads the migration (P-423)** · **size:** 1 PR |

## Rev 16.15 (15 Nov 10:24 IST, Lead B (5)): FO-5f2, the placeholder cap's rest (split from FO-5f; Lead 53's ruling, #1791 comments 6889263876, 6889408627)

**Duplicate check (P-526):** row ids FO-5f2 and the "placeholder cap" in BACKLOG (lead branch), open PRs, `main`, BUGS and the release holder's case-side draft 2. There are no matches.

**Root cause (P-502):** four review rounds failed the same way. Each one copied docxtemplater's part typing into our own pre-scan, and each copy missed a path (`.rels` names, customXml types, the property-text tags, CDATA, delimiter changes, and a parse before the cap). Copying the library's typing is the wrong design: any difference is a crash for every firm. **Ruling (row owner):** stop mirroring the library and bound the compile by construction. Three standard defences, used together:
1. **an allowlist of parts** (OWASP File Upload Cheat Sheet: allowlist, never denylist);
2. **process isolation with resource limits** (Node `worker_threads` `resourceLimits` and a timeout, standard library);
3. **the library's own parsed tags** for the placeholder check.

| Row | Area | Item | Done when (`FO-5f2 DWn`, a pass and a fail each) | Source · waits on · decisions |
|---|---|---|---|---|
| **FO-5f2** | runtime (retainers: template safety) | **A firm's Word template can never take down the API, and no unknown placeholder prints blank (FO-5f item 5's rest; review M-1 and N-1, breaker round 3).**<br>(1) **Allowlist before any parse:** a template is accepted only when every part in `[Content_Types].xml` is one of the types a Word template uses: main document, header, footer, footnotes, endnotes, styles, settings, font table, theme, numbering, web settings, core, app and custom properties under `docProps/`, relationships, and images. Every templated part must be named in the standard place. An Override typing a `.rels`, `[Content_Types].xml`, `customXml/` or any unlisted part as a templated type → 422 "This Word file has parts a template cannot have". `[Content_Types].xml` and each `.rels` are refused over 256 KB **before** they are parsed (N-1).<br>(2) **Isolation:** every docxtemplater `compile`, render and placeholder read runs in one `worker_threads` worker with `resourceLimits` (Sample 256 MB old space) and a 5 s timeout. A breach kills the worker only, the request answers 422 "This Word file is too complex to use as a template", and the worker restarts. The API process never runs `compile`.<br>(3) **Placeholders from the library:** inside the worker, the template's tags come from docxtemplater's own parse (`InspectModule` / `getAllTags`), so every tag it will fill is checked against the placeholder list, including property-text tags, CDATA and customXml. An unknown tag → 422 naming it.<br>(4) **No delimiter change:** the options set `delimiters` to `{ }` and turn off the change-delimiter syntax. A `{=` in the text → 422.<br>(5) The brace pre-count from FO-5f stays as a cheap first gate.<br>**Touch:** `api/src/front-office/retainers/docx.ts`, a new `api/src/front-office/retainers/docx-worker.ts`, `tests/check_fo5f2_template_safety.ts` | `DW1`: every way in from the hand-over (`.rels`-named header, `[Content_Types].xml`-named part, customXml typed core/diagramData, the six round-3 ways) → 422, with the API still answering a concurrent page read. `DW2`: a 9 KB `[Content_Types].xml` with 2 M `<a/>` and a 25 MB one → refused before parse, in under 1 s (N-1, Minor). `DW3`: a template built to exhaust memory inside an allowed part kills only the worker (422), and the next request works. `DW4`: `{client.passport}` in `dc:title` in a header, `Company` in settings, CDATA in a header, and customXml → 422 naming it. `DW5`: `{=<< >>=}` → 422 (each delimiter case run alone with a timer). `DW6`: a real Word file from Word and one from LibreOffice, each with headers, footers and an image, are accepted, and they render byte-identically to today. `DW7`: 1.5 M lone `{` is refused in under 2 s in every way in. `DW8`: the breaker re-runs every way in over HTTP. | **Source:** FO-5f item 5; AG-05 (templates); #1791 review rounds 1-4, breaker round 3 (`product/screens/FO-5f/fo5f2-handover.md`); OWASP File Upload Cheat Sheet; Node `worker_threads` · **waits on:** FO-5f #1791 merged (`docx.ts`) · **not** `retainers/service.ts`, so it runs beside PF-6b · decisions: the allowlist and isolation design (Lead B, row owner, P-502; reversible) · **breaker: yes (availability for every firm); builder, reviewer and breaker at high effort** · **top of the front-office pull order (Lead 53)** · **size:** 1 PR |

## Rev 16.16 (15 Nov, Lead B (5)): three code-versus-contract mismatches settled (Lead 54's refresh to `main` e888e0add, c8c58d646), and P-610 in briefs

**(a) One signing event: `signing.completed`. `retainer.executed` is retired.**
* Two names for one fact is a duplicate (P-526). The case side already listens to `signing.completed`, and its payload already carries the retainer's agreed total.
* **Ruling:** FO-6 adds `EVENT.SIGNING_COMPLETED = "signing.completed"` in `ports/events.ts`. Its payload is the union of both contracts: document kind (`RETAINER`, `CONSULTATION_AGREEMENT`, `DOCUMENT`), the document id and version, signer person ids, the document and certificate file keys, and the sealed file sha256. For `RETAINER` it also carries the retainer id, prospect id, representative staff id, fee lines, and the agreed total and currency.
* The front office's WON path listens to it with kind `RETAINER` (`won_via E_SIGNED`).
* Both contracts read `signing.completed` wherever they said `retainer.executed`. The platform contract keeps one line: "`retainer.executed` (14 Nov) = `signing.completed` with kind RETAINER; retired 15 Nov, rev 16.16".
* **FO-6's Done when adds:** "`FO-6 DWn`: one `signing.completed` per completed envelope, schema-checked by `ports/events.ts`; a retainer's completion makes the prospect WON once; no `retainer.executed` name anywhere in code (a grep test)."

**(b) `prepareRetainer` on the booking outcome: optional, added by FO-3a part 2.**
* The contract promised `booking.outcome` with `prepare_retainer`. The code built `booking.completed` (attended) and `booking.no_show` instead, which is the better split, and they stay.
* **Ruling:** `BookingEvent` gains an optional `prepareRetainer: boolean` (camelCase like its other fields; absent = false, so every earlier event stays valid). It is set on `booking.completed` when the host's consult record picks the next step "Prepare a retainer".
* That record is FO-3a part 2's (outcomes, map row 42). **Its Done when adds:** "`FO-3a DWn`: Attended with the next step 'Prepare a retainer' emits `booking.completed` with `prepareRetainer: true`; any other outcome omits it; an earlier event without the field still parses."
* The platform contract's line reads `booking.completed` (`prepareRetainer?`) and `booking.no_show` in place of `booking.outcome`.

**(c) The case side's audit-line prefix: `case_`. Proposed by Lead B; the release holder agrees (it is their side).**
* The case side's tables are already named `case_client` and `case_note` (CS-NT1).
* **Proposal:**
  * case-side entities written through `AuditPort` use the `case_` prefix;
  * `AREA_ENTITY` in `ports/audit.ts` gains `case`, in the **first case-side row that writes through `AuditPort`** (the release holder names it: CS-W1 or AUD-1). That is a one-line shared-file hook (P-584);
  * configuration entities stay on their own writer until AUD-1, as `audit.ts` says today;
  * `tests/check_case_feed.ts` keeps proving that a firm's case feed never reads an area entity as its own.

**(d) P-610 in every Lead B brief from now on.** Each brief keeps a PR under 800 changed lines, tests included, and names its split point if it may pass that; re-review reads only the new commits (P-277). This is applied now to the unstarted briefs PF-6b, FO-5f2 and the J-rows shared brief.

## Rev 16.17 (15 Nov 13:46 IST, Lead B (6)): FO-3sr gets its own BACKLOG row and brief (P-611: it had none)

Rev 16.10 named FO-3sr only in a note, and Lead 52's "not applied" list says "FO-3sr has no BACKLOG row". Its waits are all on `main` (PF-4 #1744, FO-3 #1760, FO-3f #1785, FO-3h #1799), so it is ready. Copy text for BACKLOG, after FO-3a:

| FO-3sr | runtime (staff booking routes; FO-3 part 2; map rows 37, 41, 42) | **The staff routes for FO-3's staff services:** create, reschedule, cancel (`agent/booking:create`, `agent/booking:edit`), and list, get, attendance-due and attendance declared `@AnyStaff` with a reason, because a host always sees and answers their own (AG-4-67, AG-4-39) and the service checks `agent/booking:list` / `:edit` for others. No rule moves into the controller. **Touch:** `api/src/front-office/booking/staff.controller.ts` (new), `api/src/features/front-office-booking.ts` (one line), `tests/check_fo3sr_routes.ts` | `FO-3sr DW1-DW10` and walk `W1` as the brief names them: a pass and a fail per key on the six seeded roles; a host without the list key sees only their own; 404 across firms and for another host's booking; 401 without a token; PF-4's start-up check; no link token in the create answer | **Source:** FO-3 (AG-4-67, AG-4-39, AG-4-63); rev 16.4, rev 16.10; brief `lead-b-briefs/FO-3sr.md` · **waits on:** nothing (all merged) · Opus high, reviewer and breaker (permissions) · **size:** S (~350 lines; split point in the brief) |

**Rev 16.17 also: J-38's waits on is short in BACKLOG.** BACKLOG has "the listed parts (FO-3h (QA-470) · FO-3f (#1785, open))", and both are merged (#1799, #1785; QA-470 #1805), so the row reads as ready. It is not: the J-rows brief says it also waits on PF-23w (#1800, queued), FO-3w (no public booking page on `main`) and PF-4b's sending adapter (booking mail is `fakeMail` in memory, so a walk cannot read it). **Copy text for J-38's waits on:** "the listed parts (FO-3h (QA-470, #1805) · FO-3f (#1785) · PF-23w (#1800) · FO-3w (the page) · PF-4b (the demo-inbox sending adapter))".

**J-row check 15 Nov 13:47 IST (Lead B (6)):** no J-row has every part on `main`. Missing: J-24 PF-25w, PF-4s, PF-8b · J-109 PF-21w, PF-21s (corrected 14:13: PF-21w is not built; only PF-21 part 1 #1753 merged) · J-38 PF-23w, FO-3w, PF-4b · J-6 PF-6, PF-6b · J-5 PF-4b, PF-4s, PF-6 · J-49 and J-48 PF-19b · J-27 FO-2, FO-4 · J-37 FO-3sc, FO-3sr, FO-3w, PF-23w · J-41 FO-3a, FO-3st2 · J-42 FO-3a, FO-3sr, FO-3st1, FO-3st3 · J-53 FO-5b, FO-5s, FO-6 · J-104 FO-3c, FO-5s, FO-6 · J-19 PF-5, PF-5s · J-29 FO-9a, FO-9b, FO-9s.

**Rev 16.18 (15 Nov 14:13 IST, Lead B (6)): briefs for map rows 48, 49, 109 (Lead 56's ask).** `lead-b-briefs/PF-19b.md` (part 1 ready now; part 2 after PF-4b), `PF-21w.md` (ready now; supersedes its `ROW-w.md` line), `PF-21s.md` (concept now; build after PF-21w; the PF-6 wait to be dropped if the concept uses no PF-6 piece). **Lead B ruling in PF-19b:** `msg_outbox` has no subject or body column, so the rendered message is kept through `FilesPort` at `msg/<firm>/outbox/<id>.json` and checked against `rendered_hash` before sending; no schema change. **J-109 waits on PF-21w too** (BACKLOG already lists it; my 16.17 check line is corrected above).

**Rev 16.18 also: the test-key route and two outside-clock facts (Lead 56's ruling; provider pages read 15 Nov 2026, P-170).**
* **Key route before AWS exists (Lead 56):** the founder types each test key (Stripe for PF-5's Mac check, BoldSign sandbox for FO-6v's, Google/Microsoft OAuth clients, Meta, Zoom) into a git-ignored local env file on the Mac, read through PF-24's `Secret`; never in chat, the repo or a PR; moved to AWS Secrets Manager under PF-24's names once AWS exists (PF-8b). **FO-6v's Done when adds:** "the sandbox key reaches the adapter only through PF-24's `Secret` from the local env file; no key in the PR, its logs or the test fixtures (PF-23's scanner)." Written into `lead-b-briefs/PF-5.md`.
* **Microsoft publisher verification** (FO-3s3, PF-19mc) needs a verified Microsoft AI Cloud Partner Program account first (learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview, read 15 Nov 2026). This adds a founder step to the C21 list; its vetting time is not on that page.
* **Google's restricted-scope verification** "can potentially take several weeks", and server-stored Gmail data needs an annual third-party security assessment (developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification, read 15 Nov 2026). PF-19m stores email, so it applies.

**Rev 16.19 (15 Nov 14:22 IST, Lead B (6)): PR rulings on FO-2 (#1813, comment 6891947640) and PF-5 (#1815, comment 6891947481).**
* **FO-2's Done when, the rate-limit line (copy text):** replace "the sixth post a minute from one address → 429" with "AG-2-49 rule 1's defaults: the 31st post in 60 s from one address → 429; the 61st in 60 s on one form token → 429". The requirement ranks above the row (AGENTS rule 2); this was a shaping error, not a founder decision. **Add:** "a 33 KB body → 413 before the handler runs (AG-2-49 rule 2), by a one-line route-scoped limit in `main.ts` (release holder's OK on #1813)".
* **FO-2 reads use `agent/prospect:show`** with `view.all`/`view.own` (PF-3's seeded keys); FO-4's concept §6 `agent/prospect:list` is read as `show` (FO-4 brief updated). FO-2 is three PRs as #1813 sets out; FO-4 follows the same three parts.
* **PF-5:** three PRs (sign-up to trial with schema; webhook, hold and billing routes; clock, notices and gates). `platform_signup_pending` added in part 1 (no password, a live-email partial unique index, expiry and purge sweep, no `firm_id`, insert and token-hash read only). **Added Done-when lines:** "a trial reaching its end with no business address on the Stripe customer is held ('business address needed') and never invoiced untaxed" (docs.stripe.com/tax/customer-locations, read 15 Nov 2026: without a location, subscription invoices "finalize automatically but without calculating taxes"); "our own trial reminder from `trial_will_end`, once per event". **Founder step (P-580):** switch off Stripe's "Send a reminder email 7 days before a free trial ends" in the Dashboard (docs.stripe.com/billing/revenue-recovery/customer-emails, read 15 Nov 2026). Stripe calls Manitoba's provincial tax RST.

**Rev 16.20 (15 Nov 14:28 IST, Lead B (6)): PF-4b rulings (#1816, comment 6892000038; the release holder pre-approved small edits to PF-4's own files that Lead B accepts).**
* **PF-4b's Done when adds (copy text):**
  * "step-up older than 5 min → **401** `STEP_UP_REQUIRED` on the Owner-role change and reset-two-step; PF-4's `stepUp` and `check_pf4_identity.ts:242` changed to match";
  * "PF-4's invite and resend hand the plain token to `MailPort` after commit: one invite gives one email whose link opens VALID; a rolled-back invite sends none; after a resend the first link gives NOT_VALID; no token in a log line";
  * "`staff.joined` (`EVENT.STAFF_JOINED`, ids only) is written once per accept".
  * Split point: the invitation email moves to PF-4b part 2 if the PR would pass 800 lines.
* **PF-4b's local mail stays in memory until PF-19b.** `demo_message.link_id` is a required foreign key to `person_link`, so no staff or platform mail goes there.
* **PF-19b part 1 (brief corrected):** the `local` adapter marks rows `SENT`, and a demo-only `GET /api/demo/platform-inbox?address=` reads `msg_outbox` plus the stored rendered message (DW0). No schema change. J-37/J-38's "demo inbox" means this route.
* **New rows, copy text for BACKLOG:**

| Row | Area | Item | Done when | Source · waits on |
|---|---|---|---|---|
| PF-Lc | records + runtime (libraries) | **`@aws-sdk/client-cognito-identity-provider` through the STANDARDS §1 gate, in one small PR** (the PF-L rule: one lane edits `package.json` and the lockfile). Same AWS SDK v3 family as `@aws-sdk/client-sesv2` (already in). **Touch:** `package.json`, the lockfile, the gate file | the exact version, with its publish date at least 14 days old and its licence read at source; `npm ci` and every suite pass unchanged; no code uses it yet | #1816 Q4; STANDARDS §1 · **waits on:** nothing · reviewer only · **size:** S |
| PF-4bc | runtime (permissions, API only) | **The `cognito` side of PF-4b's `IdentityAdminPort`:** create user with the message suppressed, reset MFA, global sign-out, code exchange, all on recorded responses (no network in CI). **Touch:** PF-4b's `cognito` adapter file, `tests/check_pf4bc_cognito_admin.ts` | the port's contract tests pass on the adapter as on the `local` stand-in; AdminCreateUser always sends `MessageAction=SUPPRESS`; a provider error maps to the port's error, never a raw AWS message; no credential in a log line; **one live proof in the founder's AWS account (C21) recorded later**, not a merge gate | #1816 Q4; PF-4b · **waits on:** PF-4b, PF-Lc · reviewer + breaker (sign-in) · **size:** S-M |

**Rev 16.21 (15 Nov, Lead B (6)): FO-2 and FO-4 gaps found by FO-4's lane (#1813, comment 6892106486).** **FO-2's Done when adds (copy text):**
* "`waitedOpenMinutes` on each lead list row, counted on the server in the firm's open hours, zone and closed days by a pure `sales/open-minutes.ts`: Fri 16:30 → Mon 09:30 in Sample hours = 60; a closed-day arrival counts from opening; across DST the minutes are real minutes";
* "`GET /api/front-office/leads/assignees` (`agent/prospect:show`): `oneUser` is true when the firm has one active staff member; `assignees` are the active staff holding `agent/prospect:edit`, listed only for a viewer with `agent/prospect:assign`; a Case Manager gets them, a Case Officer gets [], READ_ONLY never listed, firm A never sees firm B".

Both go in FO-2 part 1 if it stays under 800 lines, else they open FO-2 part 2. **FO-4:** the Closed chip, Assign, the one-user hiding and the open-hours wait move to FO-4 part 2 (DW17-DW19); part 1 shows the time since arrival (brief updated).

**Rev 16.22 (15 Nov, Lead B (6)): FO-3sr corrected against AG-4-67, and three follow-up rows (#1811, comment 6892225144).**
* **Correction of my own brief.** AG-4-67, read in full: "`agent/booking:list` plus the record rule"; rule 4: the list key "is needed to open booking lists at all"; rule 2: the host "always sees it".
  * The FO-3sr list and attendance-due routes declare `agent/booking:list`; get-by-id and attendance stay `@AnyStaff`, so a host sees and answers their own.
  * In FO-3sr's BACKLOG row (rev 16.17 copy), replace "list, get, attendance-due and attendance declared `@AnyStaff` …" with "create (`agent/booking:create`), reschedule and cancel (`agent/booking:edit`), list and attendance-due (`agent/booking:list`, AG-4-67 rule 4); get and attendance `@AnyStaff`, because the host always sees and answers their own (rule 2, AG-4-39)".
  * Not a requirement conflict, so nothing goes to the founder.
* **New rows, copy text for BACKLOG:**

| Row | Area | Item | Done when | Source · waits on |
|---|---|---|---|---|
| FO-3vr | runtime (booking visibility) | **A booking follows the visibility of the record it hangs on (AG-4-67 rules 1, 3), or its host sees it (rule 2).** Today `staffList` with `agent/booking:list` returns every firm booking. Lists and calendar queries filter by the lead's or prospect's AG-2-64 rule (own or all, PF-6b), a case's AG-7-90 rule once the case side links bookings, and a not-yet-linked booking by AG-2-64's unassigned-lead rule; always OR "I host it". Filters are in the query, server-side. **Touch:** `api/src/front-office/booking/service.ts` (list, calendar and attendance-due queries), `tests/check_fo3vr_visibility.ts` | AG-4-67's own tests: a Case Officer with "own only" does not see a booking on someone else's lead unless they host it; the host sees it; after a host change the old host no longer sees it unless the record rule allows it; a not-linked booking follows the unassigned-lead rule; firm walls unchanged | AG-4-67; #1811 · **waits on:** FO-2 (lead ownership), PF-6b (own versus all) · reviewer + breaker (permissions) · Opus high · **size:** S-M |
| FO-3m | runtime (booking service minors) | **FO-3's service answers, from #1811's review and break:** the attendance 400 names `outcome`; a cancelled booking before its start answers not-active, not too-early; the service's own 403 carries `MISSING_PERMISSION` like the guard; the 400 titles say what was refused; the attendance body is `z.strictObject({ outcome })`. **Touch:** `api/src/front-office/booking/service.ts`, `tests/check_fo3m_answers.ts` | a pass and a fail for each of the five | #1811 Q4, Q5 · **waits on:** FO-3sr merged (same feature) · reviewer only · **size:** S |
| PF-4pc | runtime (identity guard, path case) | **Mixed-case paths get the same guarded answer.** `core.ts:92` and `main.ts:244` match `/api/front-office` and `/api/platform` case-sensitively, so `/API/Front-Office/...` gets the link-only 403 or the web app's page. It fails closed today. **Touch:** `core.ts`, `main.ts` (the two matches), `tests/check_pf4pc_path_case.ts` | `/API/Front-Office/bookings` with a valid token gives the same answer as the lower-case path, and without one gives 401 `NOT_SIGNED_IN`; no route is reachable unguarded under any letter case | #1811 Q6 (breaker m5) · **waits on:** nothing · reviewer + breaker (security) · **size:** S |

**Rev 16.22 note (Lead 58, in BACKLOG):** PF-4pc now waits on CS-C1a (#1818), whose one-line PLATFORM_ACCESS hook is on the same `core.ts:92` line; PF-4pc goes after it. Lead B agrees.

**Rev 16.23 (15 Nov, Lead B (6)): FO-3sc r2 approved (#1819, comment 6892339436), with its four rulings.**
* **New rows, copy text for BACKLOG:**

| Row | Area | Item | Done when | Source · waits on |
|---|---|---|---|---|
| FO-3pa | runtime (public booking answers) | **What the public booking pages need from the API (concept `screens/fo-3-booking/concept.md` §6, Row X1):** `GET api/public/firms/:firmKey/book` (the list of shown types); the types' `showOnBookingPage`, `allowReschedule`, `allowCancel`; the **consent tick optional** (AG-4-19 rule 3, "Booking never needs the tick"; `main` requires it today); the firm's name, phone, email and address and the self-service limit hours in the answers; the join link; an `.ics` download; an optional cancel reason. **Touch:** `api/src/front-office/booking/public.controller.ts`, `service.ts` (public answers), `tests/check_fo3pa_public_answers.ts` | the concept's FO-3w journeys' API halves: a pass and a fail per item; booking without the tick succeeds and records no marketing consent; a hidden type is not listed and its page gives the one not-found; the answers carry no internal id (BR-2) | AG-4-16..20, -36..38; #1819 Q1 · **waits on:** FO-3sr merged · reviewer + breaker (public door) · **size:** S-M |
| FO-3sa | runtime (staff booking at any time) | **Staff book and reschedule at any time with warnings (AG-4-63, concept Row X2):** the warnings (closed day, outside the host's hours, overlap), "Book anyway" recorded (`overlapConfirmedByUserId`, the reasons in the audit entry), choosing the host, staff reschedule to any time. **Touch:** `service.ts` (staff create and reschedule), `staff.controller.ts` (body fields), `tests/check_fo3sa_any_time.ts` | AG-4-63's tests: a closed day lists "Closed day" and Book anyway saves with the reason in the audit; an overlap keeps both bookings with the confirmer recorded; Cancel on the warning saves nothing; the public page never offers that time; a deactivated host is not offered | AG-4-63; #1819 Q1 · **waits on:** FO-3sr merged · reviewer + breaker (permissions) · **size:** S-M |

* **Row corrections (copy text):**
  * **FO-3w** waits on FO-3pa; "agreement tick" → "consent tick".
  * **FO-3st1** waits on FO-3sa and FO-3a part 2; "sees only their own" → "a host without `agent/booking:list` has no Bookings menu and opens their own booking by its link".
  * **FO-3a and FO-3st3:** key `agent/booking-type:manage` → `agent/booking-event-type:edit` (types, Timings) and `agent/booking-event-type:configure-availability` (per-type gaps, notice, window).
  * **FO-3a part 2:** rev 16.16 (b)'s `prepareRetainer` line is withdrawn. Instead: "the consult record's 'Prepare a retainer' button opens FO-5's retainer draft with the record id; FO-5 reads the record's items and fee through a read port with a fake in `ports/`; nothing is sent from the record".
  * **FO-3m** adds: "the attendance job makes the due item and sends no mail (AG-4-39 rule 2, 'Shown, not pushed (no email, no alert)'); no `booking.attendance_ask` mail is sent".

**Rev 16.24 (15 Nov, Lead B (6)): PF-21w's M1 deferred to a row with a date (#1823, comment by Lead B), and two small rows.**

| Row | Area | Item | Done when | Source · waits on |
|---|---|---|---|---|
| PF-21i | schema + runtime (complaints: one create per request) | **Recording a complaint is idempotent (STANDARDS §4 [M]).** `POST /api/platform/complaints` requires an `Idempotency-Key` header (IETF httpapi draft form), stored as `plat_complaint.request_key` with a unique `(firm_id, request_key)` (a migration in `platform-register.prisma`, stamp later than `main`'s). **Touch:** `platform-register.prisma` + one migration folder, `api/src/platform/complaints/complaints.ts` (`record`), PF-21w's route (header read), `tests/check_pf21i_idempotent.ts` | three posts with one key → one complaint, one reminder job, one `complaint.received`; same key with a different body → 422 "This request key was already used for a different complaint."; two parallel posts with one key → one row; no key → 400 | STANDARDS §4; #1823 M1 · **waits on:** PF-21w merged · before PF-21s's build and J-109 · reviewer + breaker (schema) · **size:** S |
| PF-0bp | runtime (platform: body errors) | **Body-parser errors are problem answers, never 500:** a malformed JSON body → 400 and an oversized body → 413, both as problem JSON on every API route. **Touch:** `main.ts` (the parser's error handler), `tests/check_pf0bp_body_errors.ts` | malformed JSON → 400 with a plain message; over the limit → 413; neither reaches a handler; neither answer echoes the body | #1823 (pre-existing) · **waits on:** FO-2 part 1 #1813 (same `main.ts` lines) · reviewer only · **size:** S |

* **PF-4pc** adds a test: ConfigReadGuard's 403 on upper-case platform paths becomes the same guarded answer as the lower-case path (#1823).
* **PF-21s** adds: "the Record click sends a fresh `Idempotency-Key` and reuses it on retry".

**Rev 16.25 (15 Nov, Lead B (6)): PF-19b part 1 rulings (#1824, comment by Lead B).**
* **PF-19b part 2's Done when adds (copy text):**
  * "firm status: `DELETED` and `ABANDONED` send nothing (QUEUED, 'firm not sending'); `SECURITY_LOCK` sends TRANSACTIONAL only; `PAYMENT_HOLD` keeps the trial cap";
  * "at most once to SES: a new `SENDING` state (additive enum value, own migration, P-600) committed before the call; stuck over 1 h → `FAILED` 'outcome unknown' with one alert and no automatic resend; 3 provider errors → `FAILED`; a 4xx → `FAILED` at once";
  * "`msg_event` gains the kinds for SUPPRESSED and held rows".
  * Part 2 is now **schema + runtime**, so the release holder reads the migration (P-600, P-423).
* **New row, copy text:**

| Row | Area | Item | Done when | Source · waits on |
|---|---|---|---|---|
| PF-19ad | runtime (messages: the address is the person's) | **A MARKETING send's address must belong to its subject.** The consent gate asks a per-side resolver port (`FO_PERSON` → FO-2's person record; `CASE_PARTY` → the case side's) whether the address is the subject's current one; if not, SUPPRESSED, "address not the person's". Ports and their fakes in `ports/`. **Touch:** `ports/messages.ts` (resolver type), `api/src/platform/messages/send/gate.ts`, the front office's resolver adapter (one file), `tests/check_pf19ad_address.ts` | marketing to P1's own address with consent → QUEUED; to another address on P1's consent → SUPPRESSED with the reason; SERVICE unchanged; a subject kind with no resolver → SUPPRESSED (fail closed) | #1824 M2; AG-2-83; CASL Unconfirmed: no counsel · **waits on:** PF-19b part 1, FO-2 part 1 · **before any row that sends MARKETING** (FO-10, campaigns) · reviewer + breaker · **size:** S |

* **PF-19c's Done when adds:** "template values are HTML-escaped in the rendered body; a value with `<script>` renders as text".
* **P-610 reading (Lead B, for the release holder):** the 800 counts code and tests; generated review, journey and break records don't count.

**Rev 16.25 note (Lead 58, in BACKLOG):** P-610 reading confirmed: the 800 lines count code and tests only, and generated review, break and journey records do not count. G-4's `pr-size.sh` will skip those record paths when it merges. Every Lead B brief's "under 800 changed lines, tests included" reads this way.

**Rev 16.26 (15 Nov, Lead B (6)): a late Take it names the winner (#1813, FO-4 breaker Major).** AG-2-86 rule 3 decides it ("If someone else got there first, it shows 'Client F already has this lead' … and changes nothing"). **FO-2's Done when adds:** "a losing Take it by someone who could see the lead while unowned (AG-2-64's unassigned-lead rule) answers 409 with the owner's name whatever the sharing mode or delay; someone who could never see it answers 404". This is in part 1 if it fits the 800, else first in part 2. FO-4 DW4 covers both sharing modes.

**Rev 16.27 (15 Nov, Lead B (6)): schema for FO-3pa and FO-3sa (#1830, #1828).**
* **FO-3pa** becomes schema + runtime. It adds `show_on_booking_page`, `allow_reschedule` and `allow_cancel` (boolean NOT NULL DEFAULT true) to `fo_consultation_type`, and makes `BookingArrival.consent` optional in `ports/arrival.ts` (AG-4-19 rule 3). New case DW9: `allowCancel: false` refuses a cancel by link.
* **FO-3sa** becomes schema + runtime. It adds `fo_booking.overlap_confirmed_by_user_id` and narrows `fo_booking_no_overlap` to rows where it is NULL (AG-4-63 rule 4, AG-4-26 O4); a reschedule clears it. New cases: DW9, a public booking never overlaps a confirmed row; DW10, two parallel Book-anyway posts both save.
* **FO-2 part 3's Done when adds:** "the real `ArrivalPort` accepts a booking with no consent and records none".
* **Open with the release holder:** both PRs add to the one file `front-office-booking.prisma` (different models, additive). P-600 asks for a file of its own per row; whichever merges second re-stamps.

**Rev 16.27 note (Lead 59, BACKLOG a842bddc6):** the P-600 exception is granted. FO-3pa #1830 and FO-3sa #1828 may share `front-office-booking.prisma`; the second to merge merges `main`, re-stamps and re-runs CI. Lead 59 reads both migrations before the labels.

## Rev 16.28 (15 Nov 18:1x IST, Lead B (6)): PF-21s concept ruling (#1821, comment 6894543666)
* **PF-21s approved for stage 2 once the concept takes the changes** (challenge: 1 Blocker, 5 Majors and 8 Minors, all accepted). The row's **waits on** becomes "PF-21w, PF-21v, PF-6 part 1" (it was "PF-6").
* **New row PF-21v** (runtime, API only, under 800 lines; waits on PF-21w; Opus high, since it touches permissions). Name: complaint view fields for the screen. It adds three things:
  - `businessDaysLeft` on each view, negative when late. A pure function beside `acknowledgeBy` in `business-days.ts` computes it, reading the firm calendar once per request.
  - A `people` map (id to display name, including deactivated staff) and `firmTimeZone`, both on the list and on `GET /:id`.
  - `GET /api/platform/complaints/handlers`: active staff, id and display name only, `@PermissionKeys` record key.
  - **Done when** (DW1–DW4): each of the three has a pass and a fail case, a keyless handler sees names only on their own rows, and PF-21's suite passes unchanged except for the added cases.
* **PF-6 split:** **part 1** is the platform frame and staff session holder in `web/src/modules/platform/`. It keeps the token, carries one fetch helper, handles 401 with "Signed in elsewhere", and puts the `/me` name in the header with no simulated-person controls. It waits on PF-4b. The rest of PF-6 follows as part 2 and later. Lead B's PF-6 brief will set this out.
* **J-109's walk text is corrected:** "its 30-business-day clock" becomes "its acknowledge-by date (2 business days, Sample)". The 30 was Lead B's own slip in the PF-21s brief and J-109, and `domain/requirements-2026-10-19/` names no complaint period. A response-by period becomes a row only once the College's by-laws are read and cited (page, quote, date; AGENTS rule 4). This is not a founder question.
* **Counts per view (G1)** are made in the browser from one `view=all` page, showing "100+" when `next` is set. A server `counts` field becomes a row only once a firm passes 100.
* **PF-21w (#1823) is unchanged** (approved, touch list kept).

## Rev 16.29 (15 Nov 21:2x IST, Lead B (6)): FO-2 assignees corrected to the requirement (#1843, comment 6897258247)
* **Supersedes rev 16.21's assignees line.** `GET /api/front-office/leads/assignees` now lists **every active staff member of the firm, whatever their role**. The `agent/prospect:edit` filter is gone.
* **Source:** AG-02 v2.6 (28 Oct), AG-2-13c rule 11: "The everyday picker lists active users of this firm, not filtered by role (AG1-D6)." The only role filter is in the deactivation handover (AG-1-48). AGENTS rule 2 puts the requirement first, so this is a correction, not a deviation, and not a founder question.
* **Unchanged:** the list is empty unless the viewer holds `agent/prospect:assign`; the new owner must be active and in the same firm (rule 2); `oneUser` and the firm scope as before.
* **Named tests now:** a Case Manager gets READ_ONLY and BILLING_FINANCE members too (no deactivated or suspended person); a Case Officer gets []; assigning to a READ_ONLY member returns 200; firm A never lists firm B.
* **FO-4 DW17** is corrected to match.
* **The lesson (Lead B):** read the newest snapshot (`requirements-2026-11-02`) for every PF/FO rule before ruling. Rev 16.21 was ruled from the row text alone.

## Rev 16.30 (15 Nov 22:3x IST, Lead B (6)): FO-3pa cancel reason kept on the booking (#1830, comment 6898083510)
* **This supersedes rev 16.23's "cancel reason: audit only".** FO-3pa's migration adds `fo_booking.cancel_reason text NULL`, checked by `char_length <= 500`.
  - Only the booker's cancel writes it, in the transaction that sets CANCELLED.
  - The audit summary says only "Consultation cancelled by the booker." and, when there is a reason, "A reason was given.". The reason's text never goes in the audit entry.
  - `cancelled_at` is not added (not asked; the audit line has the time).
* **Source:** AG-04 v2.1 (25 Oct), the `Booking` entity "`cancelReason`?", and the manage-link card's rule 8 ("an optional reason"). AGENTS rule 2 makes this a correction, not a founder question.
* **The shared schema file** stays under Lead 59's P-600 exception (FO-3sa #1828 adds `overlap_confirmed_by_user_id` to the same `fo_booking`). Whichever merges second re-stamps its migration.
* **New DW10** (pass and fail): a reason is stored, no reason stores NULL, 501 characters returns 400 with the booking unchanged, and the audit entry holds no part of the reason's text.

## Rev 16.31 (16 Nov 01:1x IST, Lead B (6)): case-side shaping batch 1 answers (#1867, comment 6900265123)
* **FO-7mv / FO-7t split agreed.**
  - FO-7mv is the schema, the database guards and the derived list `money_to_move`, all tested at the database.
  - FO-7t is the move routes ("I moved these", "Undo this batch", the read with totals) and the 25-day home item. FO-7t calls `money_move_line_write` and reads `money_to_move` only, with no move rule of its own. It waits on FO-7mv, FO-7b and PF-12.
  - FO-7mv's brief is approved as row owner at `design/briefs/FO-7mv.md` (#1867). Lead B writes no second copy.
* **CS-DL1's move to `api/src/platform/calendar/working-days.ts` is OK,** for the general calendar logic only:
  - What moves: the business-day test, the zone helpers, `FirmCalendar`, `businessDaysBetween`, `countBack`, and `readFirmCalendar`.
  - What stays: `ACK_BUSINESS_DAYS` and `acknowledgeBy` remain in `complaints/business-days.ts`, which imports from calendar. That file is not removed and does not become a re-export.
  - It starts after PF-21v #1848. The PF-21, PF-21w and PF-21v suites must pass unchanged.
* **New row PF-18np** (runtime, a shared contract; the release Lead reads it):
  - It is `ports/notifications.ts`, zod plus a fake, with PF-18n's exact `notify(tx, {staffId}, kind, {kind, id})`.
  - `NOTIFICATION_KIND` is a typed list, with each kind added by its consumer.
  - The fake keeps one per person, per item and kind.
  - No preference check, no table and no routes: those stay with PF-18n, which may add to the interface but not change `notify`.
  - Tests: a duplicate gives one record, and an unknown kind is refused. Under 150 lines.
  - Once it merges, CS-DL1b, CS-NT1b and CS-N1 may build on it.

## Rev 16.32 (16 Nov 01:1x IST, Lead B (6)): PF-19b booking mail swap confirmed (#1860, comment 6900280637)
* **Booking mail now runs on `MessagePort`'s `MessagesMail` in PF-19b part 1**, per the current Lead's brief (P-622 (1), qa #1855). That supersedes the PF-19b brief's line "do not move FO-3's `runtime-ports.ts`".
* **PF-19b part 2 reuses `MessagesMail`** (no second adapter). Its only move is from the demo outbox to SES: at most once, with the SENDING state (rev 16.25).
* **J-37 and J-38's swap list** marks booking mail as already swapped by PF-19b part 1.
* **A suppressed address is a final refusal, never retried.** The fix goes in #1860 if it fits the touch list, otherwise it is part 2's first item. Test: one record, zero further attempts, the booking unchanged.
* **Part 2 also takes**, each with a test: the orphan invite file and the unmailed manage link on a rerun, and the 64 KB inbox cap.

## Rev 16.33 (16 Nov 02:0x IST, Lead B (6)): client-money batch 8 answers (#1878, comment 6900887428), against AG-06 v2.1
* **FO-7t's trust answer: Owner only, three states.**
  - The states are `UNANSWERED | YES | NO` (AG-6-59 §7–8). It is a role check in the service, since no key exists (MS-D24(4)).
  - Until YES the firm behaves as trust off.
  - FO-7a's boolean `trust_enabled` is replaced in FO-7ts.
* **The 25-day To-move item** counts a line's age from its source date, the withdrawal (AG-6-73 r5). The s. 32(g) reading is Unconfirmed: no counsel.
* **Money routes use `/api/front-office/money/*`,** where the existing staff guard covers them; no new prefix.
* **The Connect webhook** gets its own route and its own signing secret through PF-24. The builder cites Stripe's Connect webhook page first (P-170).
* **Tax rates are ExpatReady province data, never firm-edited** (AG-6-4 §3, §13).
  - FO-7a's `tax_rates` goes unused and is dropped in FO-7ts.
  - FO-7g reads `ProvinceTaxRate`, with values cited from CRA or marked Sample.
  - "Registered for tax" is its own boolean, and registered requires a tax number.
* **FO-7b correction: an overpayment is never refused** (AG-6-21 §13, MS-D11(5); AG-6-76 r4).
  - With trust YES the extra goes to trust as a `RECEIPT`.
  - With trust off a person chooses "Refund · Keep as credit".
  - When two payments arrive at once, the second becomes extra, noted "Paid twice?".
* **FO-7q**: the hard test is the query plan; the 300 ms (AG-6-30 r4, the requirement's own example) is measured and reported. A Case Officer sees only invoices on cases and people they can see (C5), and an empty list if that helper isn't on `main` (fail closed).
* **New row FO-7ts** (schema, client money; waits on FO-7mv; Opus high; the release Lead reads the migration). It covers:
  - `trust_answer`, `trust_answered_by` and `trust_answered_at`, replacing `trust_enabled` (existing rows map to UNANSWERED);
  - `tax_registered`, `qst_number` and `prices_include_tax`, and dropping `tax_rates`;
  - the pre-case → case trust transfer, as one pair of entries that nets to zero under the party lock;
  - the deposit request's retainer version, unique per version.

## Rev 16.34 (16 Nov 02:1x IST, Lead B (6)): case-side batch answers for platform rows (#1872, #1875, #1877, #1870, #1878)
* **#1878 reconciled** (comment 6900912668):
  - The trust answer is stored as the enum from AG-6-59 §7 (structure, Lead B).
  - **The 25 days count from the invoice date** (Lead 61's money ruling). This replaces rev 16.33's line.
  - Tax rates and the overpayment rule have no DECISIONS row behind FO-7a's list or FO-7b's refusal, so the requirement stands. A setting is built only if Lead 61 takes the tax point to the founder.
  - **Open with Lead 61:**
    - the `/api/client-money/` prefix: the guard covers only `/api/platform/*` and `/api/front-office/*`, so either use `/api/front-office/money/*` or widen `PLATFORM_PATH` with a test;
    - firm-wide invoice visibility against AG-06 C5.
* **PF-12 creates `xr_case_lookup`** (#1872 Q10):
  - no login, with IF NOT EXISTS, since CS-W3 may create it first;
  - it owns only the three case firm-lookup definer functions and gets no table grant;
  - it is added to PF-12's brief.
* **New row PF-6sb** (screens, platform; waits on PF-6 part 1 and AUD-3b's API; #1875 Q4): the "Expat Ready support — name" banner shown while our staff are in a firm, and the Owner's support-access switch screen.
* **PF-F3 aligned** (#1877 Q1, Lead 61's contract §4 ruling):
  - `onClean` only makes the document reviewable;
  - **the officer's acceptance (CS-D1) writes `document.accepted`, not the scan**;
  - the row text "(where the case side writes `document.accepted`)" becomes "(where the case side marks the file ready to review)".
* **New row PF-0a** (runtime, platform; #1870 Q3; waits on AUD-1b):
  - the three direct audit writes in `api/src/platform/identity/audit.ts` and `settings.ts` move onto `AuditPort`, in the same transactions;
  - every suite passes unchanged, and a test shows each write lands through the port.

**Rev 16.34 note (16 Nov 02:2x IST): Lead 61's final answers on #1878 (comment 6900938081) replace the open points above.**
* **Routes:** `/api/front-office/money/*`, with no change to `PLATFORM_PATH`.
* **Invoice visibility:** scoped as AG-06 C5 says, failing closed.
* **The 25-day item:** counts from the line's source date (AG-6-73 r5), as rev 16.33 said. **This undoes 16.34's "invoice date" line.** The Code s. 32(g) point is "Unconfirmed: no counsel" in the brief.
* **Tax rates and overpayments:** the requirement stands, and no founder question is needed.
* **What holds from 16.33:** everything else in rev 16.33, and the enum storage of the trust answer.

## Rev 16.35 (16 Nov 02:1x IST, Lead B (6)): batch 8 follow-ups (#1878, comment 6901029156; citation fix 4 corrected to AG-6-61 §7)
* **FO-7q:** no role has invoice visibility of its own. An invoice is visible when its parent case or person is (AG-06 C5, "record visibility follows the parent record"); Billing / Finance included. The list calls the case side's helper and fails closed.
* **FO-7ts gains a credit ledger** (AG-6-21 r5):
  - insert-only; kinds `KEPT | APPLIED | REFUNDED`; held per case or person and currency;
  - the balance never goes below zero, checked under the party lock;
  - applying credit needs `agent/invoice:issue`.
* **New shared port `RetainerStatusPort`** (`ports/`, zod and a fake; the release Lead reads it):
  - `signedVersion(tx, firmId, retainerId)`, implemented by the front-office retainer module;
  - client money never reads `fo_retainer*` directly;
  - FO-7t part 5 uses it.
* **The pay-link token:** FO-7ts adds `pay_link_token_hash` (unique where not null, the hash only) on the trust request and on `money_invoice` (AG-6-61 §7). There is no separate link table and it is not PF-27.
  - It is not single-use (part payments are allowed).
  - It stops when the item is paid in full, voided or cancelled.
  - The page gives one not-found for all of those.

## Rev 16.36 (16 Nov 02:1x IST, Lead B (6)): money screens batch 10 answers (#1879, comment 6901053560)
* **FO-7s2:** `GET /payment-account` takes `agent/payment-rail:connect` (Owner, C5). Other screens get only a `cardPayments` boolean in their own reads.
* **FO-7s3b:**
  - The Money views get their own pages under `/money/…` in `web/src/modules/client-money/`, linked from the case page.
  - "Pay from trust" is pre-ticked, using same-payer money only (AG-6-68 r2).
* **FO-7ts gains** `BANK_TRANSFER` and `CARD_TERMINAL` (AG-6-19 r1; `CARD` is online only), and `invoice_payments_go_to` (`OPERATING` default | `TRUST_FIRST`), with changed by and at (AG-6-69 §7).
* **"Invoice payments go to"** (AG-6-69 §8):
  - The rule and the setting route are FO-7b's: Owner only, offered only when trust is YES, audited.
  - The screen is FO-7s2's Getting paid page, under Advanced.
* **The inline trust question:** one component, built by FO-7s3a. FO-3's and FO-5's screen rows each place it as one line of their own.
* **FO-7s4p's payment plans use `agent/invoice:issue`.** The requirement withdrew plans and `agent/payment-plan:manage` (D3); the founder kept plans as a recorded departure (P-578); no new key is added.
* **FO-7s5:** the export is a background job, stored through `FilesPort` behind a 24 h expiring download link (Sample) and audited (AG-6-31 r4). The key is `agent/billing:export`.
* **The To-move route:** `/api/front-office/money/trust/to-move`.

## Rev 16.37 (16 Nov 02:1x IST, Lead B (6)): client money batch 9 answers (#1881, comment 6901148452)
* **FO-7ts** keeps the migration's refusal for `trust_enabled = true` rows.
* **`ProvinceTaxRate`** is a cited code table (`api/src/client-money/tax/canada-gst-hst.ts`), not schema.
* **FO-7ts part 3: all four steps are accepted** (P1 refund details, P2 tax treatment, P3 cross-payer pick, P4 newest-issued index). P3 starts only after the release Lead's money read.
* **File order:** FO-7mv → FO-7ts parts 1–2 → part 3 → FO-7v part 1 and FO-7m part 1, one at a time.
* **FO-7s0's concept** is split into an index file plus one file per screen group, each under 100 lines. One challenge and one approval cover the set.
* **Questions 4–8 (FO-7v reversals, `CARD_TERMINAL`, FO-7m "at that date", FO-7p and trust)** are the release Lead's money rules. Lead B's recommendations are on the PR.
  - If Lead 61 accepts 5c, FO-7ts's credit ledger gains a `REVERSED` kind.

**Rev 16.37 note (16 Nov 02:2x IST): Lead 61's money rulings on #1881.**
* **Lead B's recommendations 4–8 stand.** Because 5c is accepted, **FO-7ts's credit ledger gains `REVERSED`**.
* **P3, the cross-payer pick, narrowed by Lead 61:**
  - It is manual only and never pre-ticked.
  - It is allowed only between payers on the same client's matter (the same case), never across clients.
  - It is audited with a reason (reason required).
  - The database guard widens only to "same case, same currency, pick recorded".
  - DW16 adds a refusal test for each case: another case, another currency, no pick, and no reason.
  - Unconfirmed: no counsel.

## Rev 16.38 (16 Nov 02:3x IST, Lead B (6)): LMIA items (#1883, comment 6901285182; #1882, comment 6901285389)
* **FO-7b adds `ClientMoneyPort.addGovernmentFeeLine`.**
  - It puts an untaxed `GOVERNMENT_FEE` line on the open draft for the case's Bill-to party, or on a new draft.
  - The line is linked to the fee record, and the same fee twice makes one line.
  - With no signed retainer there is no line (AG17-D79). The release Lead reads the port change.
* **New row PF-6vt** (screens; waits on PF-6 part 1): the Individual / Corporate view toggle in the staff frame (AG-17-2).
  - Pages read the view from one hook and decide their own menu entries and filters.
  - Leads are never filtered by it (AG02-D0).
  - The brief reads AG-17-2 in full for where the choice is kept.
* **AG-7-86 is the staff client screen's corporate panels, not the client portal.**
  - Lead B's reading: it is the case side's row (FO-8, AG-07, BR-27). Money and company panels read through ports.
  - The release Lead is to confirm. If the client screen is front office's, Lead B takes it as FO-4c.
* **`fo_company` is the employer master** (agreed). Case-only facts are keyed to its id, with no copies of its facts. The case side never writes `fo_company`.

## Rev 16.39 (16 Nov 02:4x IST, Lead B (6)): row-owner approval of the shaping batches, and the FO-7b amendments
* **#1866 (batches 1–3, 15 briefs, head 2f0834add):** approved as row owner.
  - PF-6 part 1 matches rev 16.28: the platform frame plus FO-4's session holder moved into `modules/platform/`.
  - FO-3w takes option (b): it ships with the firm's name, and PF-13 adds the logo and colour as its own Done when line (AG-4-16 r3).
* **#1878, #1881, #1879 (heads fee55143e, 6df11ec1a, 77de1078f):** approved as row owner. The heads apply revs 16.33–16.37 (checked by term for each ruling).
* **FO-7b's brief** (on `lead-b-front-office`, written at rev 16.3) gets an amendment header. It covers:
  - overpayments never refused, including credit and "Paid twice?";
  - "Invoice payments go to" (rule and route);
  - `addGovernmentFeeLine`;
  - routes under `/api/front-office/money/*`;
  - `ClientMoneyPort`'s interface in `ports/`;
  - the recorded-by-hand methods.
  - It now starts after FO-7ts parts 1–2.

## Rev 16.40 (16 Nov 04:2x IST, Lead B (6)): shaping batch 4 (#1894, head 826cc680), row-owner ruling (comment 6902726103)
* **Approved:** PF-18a, PF-18n and FO-5p. **Approved with corrections:** PF-13 and FO-3c part 1. The lane pushes the corrections together with its three Minors, and re-review reads only that commit.
* **PF-13:**
  - The key is `agent/settings:edit` / `agent/settings:list` (AG-16-2; both seeded). The row's `agent/firm-branding:manage` is dropped.
  - **Footer and email signature are in PF-13 part 1** (AG-16-2 SHALL; the requirement wins, AGENTS rule 2):
    - settings `platform.branding.footer` (at most 1,000 characters) and `platform.branding.email_signature` (at most 2,000), both plain text;
    - the footer is drawn in `layout()`; new case DW8.
  - **Images: no new library.**
    - Metadata is stripped by reading the file's structure. JPEG keeps APP0, APP14 and the image segments, and drops APP1–13, APP15 and COM. PNG keeps the critical chunks plus tRNS, cHRM, gAMA, iCCP, sRGB and pHYs.
    - A file whose structure does not parse gets 415. Images are served with `nosniff`.
    - The row's "re-encoded" becomes "metadata stripped". Re-encoding waits until a real need.
  - **Banner and tagline are held (part 3). This goes to the founder through the tech lead.** AG-16-2 and AG-16 §7 `FirmBranding` say "no banner or tagline"; P-574 (1) lists the banner. Lead B recommends dropping them. The favicon stays in.
* **PF-19c (amended):** a `firm.email_signature` field in its `TemplateRegistry`, read from PF-13's setting (AG-16-2).
* **PF-18a:** DW1 adds AG-1-74 §12 (AG16-55): an address with no province, or outside Canada, pre-fills the firm's zone. The row's "`platform.prisma`, after PF-15 on the baton" becomes a new area file, `platform-offices.prisma` (P-600).
* **PF-18n (amended):** **one unread notification per person per item** (AG-7-39 rule 2 and its "Duplicate beats a miss" edge case), not "per item and kind".
  - A new event for an unread item updates that row's kind and time.
  - Once the item is read, a new event makes a new row.
  - Read items older than 90 days are removed (Sample).
* **FO-3c (amended, part 1 = AG-4-15's accept flow; part 2 held):** e-signature through `SigningPort` moves to part 2.
  - Part 1 records the version and time, through a tick on the public page or a no-login `AGREEMENT`-purpose link after a staff booking.
  - It never blocks a staff booking.
  - The accepted copy reads "Accepted by <name> on <date and time>, version N", and is emailed and filed.
  - **Question for the founder (through the tech lead), with the evidence from trace t8:**
    - Code s. 23(3) speaks of the "signed consultation agreement".
    - The College's Guide says it "must be dated and signed by the client and the licensee".
    - AG-4-15 §13 says "No e-signature of the agreement".
    - Does a recorded acceptance meet s. 23(3)? The founder asks the immigration expert or counsel.
    - Recommendation: build the accept flow now. Add signing by the client and the host (part 2) only if the answer is no.
    - Unconfirmed: no counsel.
* **FO-3w (amended):** after FO-3c part 1, the public booking page shows the agreement's link and the "I accept" tick when the type requires it (AG-4-15 r3).
* **For the release holder (P-423):**
  - the case's `officeId` calling `OfficeClockPort` (AG-1-74, "the case's office decides");
  - AG-7-39's four case notifications calling `NotificationPort`.
  - Both are the case side's rows.

## Rev 16.41 (16 Nov 04:2x IST, Lead B (6)): the government-fee method withdrawn (Lead 62's catch), the unsigned-retainer warning, PF-18n on PF-18np's port, and the table rows for five new rows
* **Rev 16.38's `ClientMoneyPort.addGovernmentFeeLine` is withdrawn.**
  - It was the one-click line from a case fee, which the founder kept out of Release 1: P-607 (7) chose "Typed line now", with one-click as X-S3-6 (AG-6-40).
  - No AG-17 or LMIA requirement needs a programmatic call beyond AG-6-40 (AG17-D4/D13 "government fee line from the case" is AG-6-40 itself). So there is no founder question.
  - FO-7b: staff type `GOVERNMENT_FEE` lines by hand, never taxed. FO-7b's amendment 3 is rewritten.
* **Lead B's second slip in the same item:** rev 16.38's "no line without a signed retainer (AG17-D79)" was out of date. **MS-D13 (25 Oct) replaced AG17-D79.** Invoicing on an unsigned retainer is a warning, never a block, government-fee lines included (AG-6-42 r1–r5, r7). FO-7b now has:
  - `unsignedRetainerAcknowledged: true`, or a 409 with "<Party>'s retainer isn't signed. Invoice anyway?";
  - who and when stored on the invoice: `unsigned_retainer_confirmed_by` and `unsigned_retainer_confirmed_at`, two columns **FO-7ts part 1 adds** (AG-6-42 §7);
  - lines typed by staff when no signed retainer exists (r5); deposits still only from a signed retainer (r7).
  - The firm-service exception (r2) waits for the Services model. Until then every party needs one, so the warning shows more often, never less.
  - **For the tech lead:** add one line to `design/briefs/FO-7ts.md` part 1 for the two columns (nullable `uuid` and `timestamptz` on `money_invoice`, both set or both null, by a CHECK).
* **PF-18n builds on PF-18np's port. It does not create its own `ports/notifications.ts`.** This corrects batch 4 (#1894), whose PF-18n brief drafted a second port with another shape. The case-side briefs (CS-DL1, CS-N1, CS-D6, CS-98c, CS-98d) already call `notify(tx, { staffId }, NOTIFICATION_KIND.X, { kind, id })`.
  - PF-18n's adapter takes the group from `NOTIFICATION_GROUP[kind]`.
  - It builds the deep link from the item kind through its own map: an app path, and an unknown item kind gets no link but still makes a row (duplicate beats a miss).
  - It reads the recipient's firm from the staff row, and refuses a staff id that is not found.
  - PF-18n starts after **PF-18np** and PF-18a part 2.
  - **PF-18np's rule is now "one per person per item"** (AG-7-39 r2; rev 16.40 already set this for PF-18n), replacing rev 16.31's "per item and kind".
* **PF-18np's brief:** `lead-b-briefs/PF-18np.md` (new). It covers:
  - the eight groups as an enum;
  - `NOTIFICATION_KIND` and `NOTIFICATION_GROUP`, typed so a kind without a group fails the type check;
  - `NOTIFICATION_ITEM_KIND`;
  - the fake, keeping one per person per item, with `markRead`;
  - the shared contract; DW1–DW4; under 150 lines.

**Table rows (Lead 62's ask; BACKLOG's Full MVP table, then the status table):**

| PF-18np | runtime (platform: shared port, no table) | **The notification port only (map row 50; rows rev 16.31, 16.41):** `ports/notifications.ts`, zod only, with its fake.<br>• `NotificationPort.notify(tx, { staffId }, kind, { kind, id })` inside the caller's transaction; ids only (AG-7-39 r10).<br>• `NotificationGroup`: AG-16 §3.3's eight groups.<br>• `NOTIFICATION_KIND`, plus `NOTIFICATION_GROUP` (a kind without a group fails the type check) and `NOTIFICATION_ITEM_KIND`; each consumer adds its own lines.<br>• The fake keeps one per person per item (AG-7-39 r2), with `markRead`.<br>• A shared contract in `ports/contracts/`.<br>• No table, no route and no preference check: those are PF-18n's, which never changes `notify`'s shape.<br>**Touch:** new `ports/notifications.ts`, `ports/contracts/notification-port.contract.ts`, `tests/check_pf18np_port.ts` | DW1–DW4, a pass and a fail each:<br>• a second notify for the same person and item gives one record with the newer kind, and a new record after it is read;<br>• an unknown kind, an unknown item kind, or a non-uuid id is refused with nothing recorded;<br>• a kind without a group fails the type check;<br>• `check-port-contracts.mjs` passes, and `ports/` imports only zod | AG-7-39 r2, r10; AG-16 §3.3 · **waits on:** nothing · brief: `lead-b-briefs/PF-18np.md` · **model:** Opus medium · reviewer only; the release Lead reads it (P-423) · **size:** under 150 lines, 1 PR · Source: rows rev 16.31, 16.41 |
| FO-7ts | schema (client money) | **Money settings and ledger schema steps, in three parts in series (rows rev 16.33, 16.35–16.37, 16.41):**<br>• **Part 1:**<br>  ◦ the trust answer `UNANSWERED \| YES \| NO`, with who and when, replacing `trust_enabled`; the allowed moves are a trigger, and Owner-only is a service role check;<br>  ◦ `tax_registered`, `qst_number` and `prices_include_tax`; `tax_rates` dropped (`ProvinceTaxRate` is cited code);<br>  ◦ `invoice_payments_go_to` (`OPERATING` default \| `TRUST_FIRST`), with who and when;<br>  ◦ methods `BANK_TRANSFER` and `CARD_TERMINAL`;<br>  ◦ `pay_link_token_hash` (hash only, unique where not null) on the trust request and `money_invoice`;<br>  ◦ the deposit request's retainer version, unique per version;<br>  ◦ `unsigned_retainer_confirmed_by` and `unsigned_retainer_confirmed_at` on `money_invoice` (AG-6-42 §7).<br>• **Part 2, under the party lock:** the pre-case → case trust pair, netting to zero; the credit ledger, insert-only, `KEPT \| APPLIED \| REFUNDED \| REVERSED`, per party and currency, never below zero.<br>• **Part 3:** P1 trust refund details; P2 tax treatment; P3 the same-case pick of another payer's money (manual, with a reason, audited); P4 the newest-issued index.<br>• The migration keeps its refusal for `trust_enabled = true` rows.<br>**Touch:** `prisma/schema/client-money.prisma` + one migration folder per part, its tests | each part's DWn cases from the brief, a pass and a fail each, tested at the database, including the migration test in a parallel world (rows rev 16.7) | AG-6-59 §6–8, AG-6-4, AG-6-19 r1, AG-6-21 r5, AG-6-42 §7, AG-6-61 §7, AG-6-68, AG-6-69 §7 · **waits on:** FO-7mv (part 1); each part on the one before · brief: `design/briefs/FO-7ts.md` (#1881) · **model:** Opus high · **breaker: yes (money)**; the release Lead reads each migration, and P3's guard before it starts (P-423) · **size:** each part under 800 lines · Source: rows rev 16.33, 16.35, 16.36, 16.37, 16.41 |
| PF-6sb | screens (platform: staff frame) | **The support banner and the Owner's support-access switch (rows rev 16.34; #1875 Q4; P-607 (4)):**<br>• while ExpatReady staff are in a firm, every staff page shows "Expat Ready support — <name>", with the mode (read-only, or change mode) and the time left;<br>• the Owner's screen turns support access on and off, and grants change mode for the 60-minute session;<br>• every step shows on the firm's audit chain.<br>Reads AUD-3b's API only, with no rule of its own.<br>**Touch:** new files under `web/src/modules/platform/support/`, one frame slot line, `tests/check_pf6sb_support_browser.ts` | a pass and a fail each:<br>• the banner shows during a support session and not otherwise;<br>• a non-Owner sees no switch, and the API refuses with 403;<br>• change mode ends at 60 minutes and the banner says so;<br>• keyboard-only; axe-core; 375/1024/1440 | AG-16 support access (AUD-3b's cited ids) · **waits on:** PF-6 part 1, AUD-3b's API · brief: shaping lane, then Lead B · **model:** Opus high (permissions) · **breaker: yes (permissions)** · **size:** under 800 lines · Source: rows rev 16.34 |
| PF-0a | runtime (platform: audit) | **The platform's three direct audit writes move onto `AuditPort` (rows rev 16.34; #1870 Q3; P-607 (3), fail-closed):** the writes in `api/src/platform/identity/audit.ts` and `settings.ts` call `AuditPort.record(tx, …)` in the same transactions, with no behaviour change.<br>**Touch:** those two files, `tests/check_pf0a_audit_port.ts` | a pass and a fail each: each of the three writes lands through the port (a spy), and a failing audit write rolls back the change (fail-closed); every existing suite passes unchanged | SA-11-7 (departure P-607 (3)) · **waits on:** AUD-1b · brief: shaping lane, then Lead B · **model:** Opus medium · reviewer only · **size:** under 300 lines · Source: rows rev 16.34 |
| PF-6vt | screens (platform: staff frame) | **The Individual / Corporate view toggle in the staff frame (rows rev 16.38; AG-17-2):**<br>• one toggle in the frame; where the choice is kept follows AG-17-2, which the brief reads in full;<br>• pages read the view from one hook (`useClientView()`) and decide their own menu entries and filters;<br>• leads are never filtered by it (AG02-D0), and notifications are never filtered (AG-10-36).<br>**Touch:** the frame's toggle slot, new `web/src/modules/platform/client-view/*`, `tests/check_pf6vt_view_browser.ts` | a pass and a fail each:<br>• switching changes the hook's value on every page, with no reload;<br>• the leads list is the same in both views;<br>• keyboard-only; axe-core; 375/1024/1440 | AG-17-2; AG02-D0; AG-10-36 · **waits on:** PF-6 part 1 · brief: shaping lane, then Lead B · **model:** Opus medium · reviewer only · **size:** under 400 lines · Source: rows rev 16.38 |

Status table:

| PF-18np | not built | AG-7-39, AG-16 §3.3 |
| FO-7ts | not built | AG-6-59, AG-6-4, AG-6-19, AG-6-21, AG-6-42, AG-6-61, AG-6-68, AG-6-69 |
| PF-6sb | not built | P-607 (4); AUD-3b |
| PF-0a | not built | SA-11-7; P-607 (3) |
| PF-6vt | not built | AG-17-2, AG02-D0, AG-10-36 |

## Rev 16.42 (16 Nov 06:1x IST, Lead B (6)): shaping batch 5 (#1901, head 1a29b129), row-owner ruling (comment 6904223946)
* **Approved:** FO-13i, FO-13c, PF-21b, PF-21c and PF-19c, plus the batch 4 follow-ups. The lane pushes the corrections together with its m12 and n1–n5.
* **Code ss. 5, 15, 16 and 35(1)(c) read at source** by Lead B on the Mac (Justice Laws, current to 2026-10-19, read 16 Nov 2026). They are added to trace t8 as §1b.
* **FO-13c (amended):** the gates are no longer conditional.
  - `CONFLICT_CANNOT_ACT` blocks send and signed-offline, and convert when it is on `main` (s. 15(2), s. 16).
  - `POTENTIAL_CONFLICT` goes ahead only with disclosure text. The signed retainer carrying it is the written consent (s. 15(1)).
  - A conflict found after signing is shown for the representative, and nothing ends by itself (s. 35(1)(c)).
  - "A check before send" is our product rule, which the PR says. Unconfirmed: no counsel.
* **PF-19c (amended):** a send refused for a missing field value is never silent. It is recorded as refused, with the field named, in the firm's message log, and the sender sees the reason.
* **PF-21b:** `LegalHoldPort` takes CS-X3's shape:
  - `isHeld(tx, firmId, subjects[])`, with every match reported;
  - the real adapter takes the lock itself;
  - `LEGAL_HOLD_CATEGORY` ships with CS-X3's five names.
  - Its keys are `system/compliance:legal-hold` and `system/compliance:dsr-manage` (Sample), Platform Owner only.
  - The release holder confirms the CS-X3 side and the category list before part 1 merges.
* **PF-21c:** the Auditor gets `system/breach:read` (ours). `breach_clock_near` stays in `ALERT_KINDS`, unused (SA11-D8). A later notice to the same firm carries `supersedes` (our rule).
* **New row PF-Fd** (runtime, platform files: the delete door).

| PF-Fd | runtime (platform files: delete) | **`FilesPort.delete(firmId, key)`** (rows rev 16.42; the contract gap from #1901): in `ports/files.ts`, with its fake, the front office's local adapter (`api/src/front-office/files.ts`) and a shared contract case (PF-0c). The port's rule: the caller checks `LegalHoldPort.isHeld` first; the port itself holds no legal-hold logic. Deleting a missing key is a no-op that answers `false`; another firm's key is refused. The S3 adapter's delete is PF-F1's. **Touch:** `ports/files.ts`, `ports/contracts/files-port.contract.ts` (one case), `api/src/front-office/files.ts`, `tests/check_pffd_delete.ts` | a pass and a fail each: a stored file is deleted and `get` then answers not found; a missing key → `false`; firm B's key from firm A → refused, nothing deleted; the contract passes on the fake and on the local adapter | SA-11 §3.5 (callers' order, BR-7) · **waits on:** nothing · brief: shaping lane (next batch), then Lead B · **model:** Opus medium · reviewer only · **size:** under 200 lines · Source: rows rev 16.42 |

| PF-Fd | not built | SA-11 §3.5, BR-7 |

## Rev 16.43 (16 Nov 07:2x IST, Lead B (6)): P-626 order, two new briefs, new row FO-5cr, R1.6 answered

The founder's P-626 (Lead 63, 07:3x): finish the Partial capabilities first. The order, every row's waits checked on `main`, and amendments A1 to A6 are in `lead-b-briefs/P-626-order.md`. In short:
* **PF-6 part 1 is the critical path** (PF-21s, FO-3st1-3 build in its frame): ready now.
* **FO-3w** does not wait on PF-13 (option (b) taken). The FO-3c agreement tick is FO-3c part 2's line, not FO-3w's. It is ready on #1830.
* **FO-3a part 1a** is ready on #1830.
* **FO-3a part 2** has a brief at last (`FO-3a2.md`): 2a, the consult record and `ConsultRecordPort`, in a new area file `front-office-consult.prisma` (structure ruling: may run beside 1b, the second merges main and re-stamps); 2b, the staff read feed, calls FO-3vr's filter.
* **FO-3st1** has a brief (`FO-3st1.md`, two parts). It does not wait on PF-18a (the firm's zone until then, concept §6b) or on PF-6 part 2.
* **J-38** waits only on FO-3w part 1 (PF-23w, #1860 and FO-3h are on `main`).
* **PF-21s stage 2** waits only on PF-6 part 1.
* **R1.6:** PF-6b (on `main`), PF-6's two Done when lines and J-6 own it. J-6 is split: part 1 now (API plus FO-4's Leads screen), part 2 the role editor with PF-6 part 2.

New row for BACKLOG, after FO-5p:

| FO-5cr | runtime + screens (retainer pre-fill) | **The retainer draft is pre-filled from a consult record (AG-4-49, -50; concept FO-3sc BR-16, Q3):** FO-5's draft opened with `?consultRecord=<id>` reads `ConsultRecordPort.read` and pre-fills the party, the recommended items and the quoted fee; nothing is typed twice, nothing is sent. **Touch:** FO-5's retainer draft files only, its test | a pass and a fail: a record's items and fee appear on the draft; another firm's record id → an empty draft with no error leak | AG-4-49, AG-4-50 · **waits on:** FO-3a part 2a · **size:** S |

## Rev 16.44 (16 Nov 07:2x IST, Lead B (6)): the founder's P-627 answers applied to PF-13, FO-3c and calendar sync

Amendments to paste above the briefs are in `lead-b-briefs/P-627-amendments.md`. In short:
* **PF-13** keeps the banner (P-574 (1) over AG-16-2) as a third image kind, shown on the client portal header only. The tagline is dropped and the favicon stays. New line DW9.
* **FO-3c** has one signing path. Part 1 is AG-4-15's acceptance, now storing the kind, version, time and who (`accepted_via`, `accepted_by_person_id`; new line DW8). Nothing else is signed in FO-3c. Part 2 is signing through FO-6's `SigningPort` once FO-6 lands, and it never blocks a booking. Its brief follows FO-6. Unconfirmed: no counsel (Code s. 23(3)).
* **Calendar:** no Calendly. FO-3s2 (our Google adapter) comes first. FO-3s3 (Microsoft) stays shaped, after it. Cronofy is only a dated fallback behind `CalendarPort`; the date is Lead 63's (P-628), and Google's OAuth verification goes in the outside-dependency register now.
* **Correction to P-626 A1:** FO-3w's agreement tick is FO-3c **part 1**'s line, not part 2's.
* #1875, #1876 and #1886 are case-side batches, not Lead B rows: P-627 (3) to (5) are for the case-side shaping lane.

## Rev 16.45 (16 Nov 07:3x IST, Lead B (6)): PF-13 gains the tagline (P-629 amends P-627 (6))

`lead-b-briefs/P-627-amendments.md` §PF-13 is rewritten:
* the brand set is the logo, colours, favicon, banner and a tagline;
* `platform.branding.tagline` is plain text of 1 to 80 characters on one line, shown under the firm's name on the client portal header and FO-3w's public frame (new line DW10);
* emails and PDFs carry neither the banner nor the tagline;
* part 1 stays under 800 lines, or the tagline moves whole to part 2.

Rev 16.44's "no tagline field anywhere" is withdrawn. One reading is for Lead 64 to confirm (P-628): AG-16-2's legal footer, the sender name and the colour stay in emails.
* Lead 64 confirmed the reading (Lead ruling, P-628, 07:3x IST, listed for the founder's review). Emails keep AG-16-2's legal footer, the sender name and the brand colour. P-629's "only logo and firm name" covers the new extras (banner, tagline, favicon).

## Rev 16.46 (16 Nov 08:0x IST, Lead B (6)): PF-6 part 1 keeps the firm key in the frame; PF-13 part 2 puts the name there (#1912)

The ruling is on #1912, comment 6905670026:
* PF-6 part 1 adds no API line and shows the firm's key as the frame title for now.
* PF-13 part 2 replaces the key with the operating name and logo, read from its public branding answer (AG-1-9 "firm-console chrome"; new line `PF-13 DW11` in `P-627-amendments.md`). This puts no `firmName` on `/me`, which would widen `StaffContext`, a type every guarded route shares.

## Rev 16.47 (16 Nov 08:0x IST, Lead B (6)): P-630 adoptions through the gate; PF-19s, PF-19c, PF-13 and FO-5p amended; new rows PF-Le and PF-Fp

* **Gate entries 15–17** are in `design/tech-gate-platform-front-office-2026-11-14.md` (`main`'s file plus three entries; the Lead copies it whole). They were checked at source on the Mac: npm registry, tarball, GitHub advisories, licence files. Lead B's approval line is in `lead-b-briefs/P-630-amendments.md`.
* **Entry 15, `@react-email/editor` 1.7.18:** approved, with conditions. It is under nine months old, with 133 releases in a year, so it is pinned exactly. We store our own JSON and the server makes the HTML; no Tiptap package below 3.30.5 (GHSA-j95f-988m-3j2f); the editor pulls in `react-email`'s CLI dependencies, which must never be bundled.
* **Entry 16, `react-email` 6.11.6:** approved. `@react-email/components` is deprecated, so it is not used. The layout lives on the adapter side, never in `ports/`.
* **Entry 17, Gotenberg 8.40.0 by digest:** approved only with five conditions. It has 40 advisories, 9 of them critical; every release that passes the 14-day rule is still exposed, so this is a security exception. Only the LibreOffice route is enabled, with no outbound network.
* **Briefs amended** (paste-above blocks in `P-630-amendments.md`):
  - PF-19s: the editor with field chips;
  - PF-19c: a JSON body, the server-side renderer, and WhatsApp's Meta template status stored and checked in `send()` (submission is FO-11's);
  - PF-13: the layout built with `react-email`;
  - FO-5p: its PDF moves to a part 2 after PF-Fp.
* **New rows:** **PF-Le**, the libraries PR (the PF-L rule), and **PF-Fp**, `DocumentRenderPort.toPdf` through Gotenberg, a shared contract (P-423).

## Rev 16.48 (16 Nov 08:3x IST, Lead B (6)): PF-Le's size (#1919)

* **Size exception agreed by the row owner.** Generated lockfile lines in a libraries-only PR don't count toward P-610's 800; the hand-written lines (210 here) do. The DECISIONS row is the Lead's to write, and I asked Lead 64 for it.
* **The 54 lockfile entries leaving `dev` are expected under gate entry 15.** The PR records them by name, with `npm audit` before and after and the browser-bundle check.
* **PF-7 records the image size before and after** when it next builds.
* Lead 64 recorded **P-631** in these words, plus B196 so that `pr-size.sh` applies it by itself. It reaches `main` with #1917. The lane is told on #1919 to add `Size exception: P-631` and to re-run pr-rules after #1917 merges. The 54 dev-flag changes are accepted, with the bundle check as the guard.

## Rev 16.49 (16 Nov 08:5x IST, Lead B (6)): FO-3a part 1a's questions (#1918)

* **`PAID_CONSULT`** is refused until map row 44 (confirmed).
* **A price on `OTHER`** is refused too, until row 44. AG-4-10 rule 4 says it would take payment.
* **The new empty-day and field words** are accepted. FO-3st3 adds them to concept §5.
* **`OTHER` public** is accepted (AG-4-10 rule 4).
* The migration read is Lead 64's (P-423), and I have passed it on.

## Rev 16.50 (16 Nov 09:0x IST, Lead B (6)): #1918's Devin findings go first into FO-3a part 1b

* **Ruling:** #1918 keeps its label, subject to Lead 64's migration read. It merges as it is, with a "Known gaps" line in the PR body.
* **FO-3a part 1b starts with three new cases:**
  - `DW0a`: a reschedule keeps the booking's own length, per AG-4-9 rule 6 (`endsAt − startsAt` in `move`, `manageSlots`, `place`/`warningsFor` and `nextSlots`; staff and self-service; a 30 → 45 edit);
  - `DW0b`: a notice cut-off shows "Inside the shortest notice", not "Fully booked";
  - `DW0c`: a rename between two email-shaped names lists `name` as changed.
* **Why it can merge:** no screen edits a type's length until FO-3st3, which waits on 1b.

## Rev 16.51 (16 Nov 09:3x IST, Lead B (6)): FO-7mv's two deviations accepted (#1924)

* **The three lines changed in `check_fo7a_money_schema.ts`** are accepted. The counts now cover FO-7a's own `TABLES`, and the test helper passes `ck: "BOUNCED"`. A default kind would have left B-19 open.
* **The new AFTER INSERT trigger `money_trust_entry_moves`** is accepted, with a pass and a fail showing that a refused insert leaves no row. The PR also confirms that the "21 `money_` functions" check counts FO-7a's list.
* The money and migration read is Lead 64's (P-423).

## Rev 16.52 (16 Nov 10:0x IST, Lead B (6)): new row FO-7a2 (ledger reversals and credit notes) from FO-7mv's breaker round 2 (#1924, comment 6907485757)

* **Ruling:** FO-7a2 goes first. FO-7mv stays a draft at a45f7d1e3, then shrinks: its party cover check, invoice cap and `least()` go.
* **The money rules are the release holder's to confirm (P-423).**
* **Rejected: "never below the cleared balance".** It contradicts AG-6-68 rule 5 ("The person may continue"), AG-6-63 rule 7 and AG-6-75 rule 4 (a reversal leaves a shortfall, shown).

New row for BACKLOG, before FO-7t:

| FO-7a2 | schema (money: ledger rules) | **Two FO-7a ledger rules the To move list needs (AG-6-60 r7, AG-6-68 r5 and r8, AG-6-75 r2-r4, AG-6-48 r3-r4, AG-6-73 r4, AG-6-63 r7; MS-D20(5), MS-D23(3)):** (1) in `money_trust_entry_write`, **a reversal** (the correction kinds for "Returned", "Recorded by mistake" and "Wrong client") **is always accepted, even below zero**; every other outflow (application, refund, withdrawal) stays never above the ledger balance and never negative ("Only CAD 169.50 is available."); a new view `money_trust_shortfall` lists each party below zero per currency; "Returned" is refused on E_TRANSFER, CARD, CARD_TERMINAL and CASH payments, and a payment reversed as "Returned" can never be ticked cleared; (2) in `money_credit_note_write` (and the write-off), trust paid on the invoice, net of returns, counts as settled, and a credit note that would leave credits plus unreturned trust above the invoice is refused unless the same transaction writes the `RETURN` for the unmoved part; a part already moved follows the overpayment rule (a person chooses). The cleared-money **warning** is the routes' (FO-7t, refunds), never the trigger's. **Touch:** `prisma/schema/client-money.prisma` (only if a column is needed) + one migration folder replacing those two functions (`money_` prefix), `tests/check_fo7a2_ledger_rules.ts`, FO-7a's suite only where a test asserted the old refusal (named in the PR body) | B-10: 500 cleared + 300 cheque, 300 applied and moved, a 500 refund, then the cheque "Returned" → accepted, balance −300, listed in `money_trust_shortfall`; a refund above the ledger balance → refused with the message; AG-6-48's test: INV-0003 credited 282.50 with trust on → `RETURN` 282.50, the To move line removed; a credit note with no `RETURN` on a trust-paid, unmoved invoice → refused; "Returned" on an e-Transfer → refused; ticking cleared after "Returned" → refused; each a pass and a fail; FO-7a's other cases unchanged | AG-06 as listed · **waits on:** FO-7a (merged) · not beside FO-7b's or FO-7mv's migrations (same functions) · **breaker: yes (money)** · release holder reads it (P-423) · **size:** S-M |

**FO-7b amendment** (credit-note route, running now): a credit note on a trust-paid invoice whose To move line is still open writes the `RETURN` entry to the case trust in the same transaction (AG-6-48 rule 4). If the line has moved, the overpayment choice applies (rule 3). The test is AG-6-48's (INV-0003, 282.50).

## Rev 16.53 (16 Nov 10:1x IST, Lead B (6)): FO-7a2 brief (money rules confirmed by Lead 64), and R1.6's fixes FO-2v and PF-6m

* **FO-7a2 brief: `lead-b-briefs/FO-7a2.md`.** It is start-ready for the FO-7mv lane.
  - Rule 1 is confirmed as written.
  - Rule 2 is confirmed with Lead 64's amendment (P-423): once trust-paid money has moved, the choices are **"Refund to the client" or "Move back to trust"** (an operating → trust line). It is never kept in operating (commingling, Code s. 32 as FO-7a cites it; Unconfirmed: no counsel).
  - **Rev 16.52's "keep" is corrected.** With trust on, "keep" meant held for the client in trust, which is the move-back-to-trust choice. With trust off, AG-6-21's "Keep as credit" (FO-7ts `KEPT`) is unchanged.
* **FO-7mv (#1924) does not split.** After FO-7a2 it drops its cover check, cap and `least()` (about −60 lines from 797), and its plan (comment 6907490951) adds only test rewrites. If its next head passes 800, the brief's own split applies: the list view and DW9 go to FO-7t.
* **QA-477 → FO-2v (`lead-b-briefs/FO-2v.md`).** There is one "own versus all" rule, from AG-2-64 and SA-6-24 with PF-6b ruling 4's setting: all = `agent/prospect:view.all` **and** `platform.everyone_sees_all`, else own. The leads' Owner/Admin override goes, because no requirement backs it. The leads routes get `@OwnOrAll` and join PF-6b's sweep.
* **QA-479** is folded into FO-2v. Take on an unseen lead → 404. The owner is named only in AG-2-86 rule 3's real race (owner set within 10 minutes, Sample), and `ownerStaffId` is never in the body.
* **QA-478 → PF-6m (`lead-b-briefs/PF-6m.md`).** One shared money-line helper serves both doors (role change and invitation accept).
* **QA-480 (records):** PF-6b's row (2) is reworded to "**no duty bundle implies a money key; starter roles hold money keys only as SA-06 Appendix C lists (MS-D21(10))**", replacing "No starter-role bundle hands out a money key". SA-06 wins (AGENTS rule 2). The same words go into R1.6's Done when.
* FO-2v and PF-6m share no file and may run at once. After both merge, qa re-scores R1.6. Whether R1.6 can be Works without J-6 part 2 (the role editor, PF-6 part 2) is the Lead's ruling (qa #1929; my P-626 A6).

## Rev 16.54 (16 Nov 10:1x IST, Lead B (6)): PF-6 part 2, new row PF-6r and J-6 part 2, so that R1.6 can close (Lead 64's ruling: Partial until the role screens and J-6 part 2 are on `main`)

* qa is told on #1929 (comment 6907568335).
* **PF-6 part 2: `lead-b-briefs/PF-6p2.md`.**
  - **2a**, the R1.6 half: Team, Invite people with Compare roles, and the Person panel (Roles, Access, Invitation). It waits on PF-6 part 1 (#1912, queued), PF-6r and PF-6m.
  - **2b**: Licences, My account's licence, the Security line and Accept invitation. It comes after 2a.
* **Correction (row owner):** PF-6's rev 16.10 Done when line about "the role editor … a custom role copied from a starter role" assumed custom roles, which are X-1 (concept §2 "Not month one"; PF-6b row, Lead 53). The line is now met by the role picker and Compare roles, as PF-6 DW3:
  - money permissions and licence actions are shown in their own groups, from the catalogue's `class`, never by a group tick;
  - giving a money-bearing role shows its own confirmation line naming the count, and writes PF-6m's audit line.

  The custom-role half moves to X-1.
* **New row PF-6r: `lead-b-briefs/PF-6r.md`.** It adds `GET /api/platform/roles` (`agent/staff:manage`): the six starter roles with each key's `class` and `scope`, and money and licence counts. It starts now, beside PF-6m and FO-2v (no shared file).
* **J-6 part 2 (amendment to the J-rows brief for J-6; waits on PF-6 part 2a, FO-2v and PF-6m):**
  - `J-6 DW1`: PF-6m's money line is shown real, through the audit read.
  - `J-6 DW2`: FO-2v's single rule is shown on the Leads screen. With `everyone_sees_all` off, the Owner sees only their own leads.
  - **Walk `J-6 W1`**, in a visible browser and as a scripted check:
    - The Owner opens Team, then Compare roles, which shows the money and licence groups.
    - The Owner invites a Billing and finance person. The money confirmation line shows, and is saved with its audit line.
    - The new person signs in, and opening `/platform/team` is refused on screen and by the API.
    - A Case Officer with "own" sees only their own leads.
    - It ends at the next capability's first step: My account (row 5).
  - When J-6 part 2 is on `main`, qa re-scores R1.6 with the full walk.
* **Order for R1.6:** PF-6r, PF-6m and FO-2v now, at once. Then PF-6 part 2a once #1912 merges, then J-6 part 2. 2b runs after 2a and is not on R1.6's path.
* Lead 64 agreed rev 16.54. PF-6r goes to the J-6 lane, followed by J-6 part 2 there. PF-6 part 2a goes to the PF-6 part 1 lane once #1912 merges. Custom roles stay X-1, with no scope change.

## Rev 16.55 (16 Nov 10:3x IST, Lead B (6)): FO-2v race time from the audit line (#1933)

The lane's recommendation is accepted. Take's 409 (AG-2-86 rule 3) reads the lead's latest take or assign audit line (written in the same transaction, carrying `previousOwnerStaffId`) in the same lock, so no `owner_set_at` column is added. It shows only when the line is under 10 minutes old (Sample), the lead was Unassigned and the person sees Unassigned leads; anything else answers 404. An added case checks that firm B never reads firm A's lines.

## Rev 16.56 (16 Nov 10:5x IST, Lead B (6)): FO-2v open items (#1933)

* Sequential lead numbers (breaker m3): accepted as AG-02 numbering, with no row.
* With the setting off, an `assign` holder reassigns only Unassigned leads and their own. AG-2-13c rule 1's "every mode" keeps the action on in every mode; it does not widen what a person sees (AG-2-64 is the one home of visibility). This reading goes in the module card.
* The permissions read at e767d9c80 is passed to Lead 65.

## Rev 16.57 (16 Nov 10:5x IST, Lead B (6)): P-634 folded in; Lead 65's reads

* **P-634** (Lead 64's ruling under P-628, for the founder's review) records rev 16.52–16.53's trust rules as a decision. BACKLOG on the Lead branch now has the **FO-7a2** row and P-634's reversal exception on FO-7a and FO-7mv.
  - Read with P-634, `lead-b-briefs/FO-7a2.md` is unchanged. Its rules 1a–1d and 2a–2d are P-634 (1) and (2), word for word in substance.
  - The brief's source line now cites **P-634** as the confirmation.
  - FO-7mv's brief, and FO-7a's row in BACKLOG, read "a reversal may go below zero (P-634)" wherever they said the ledger "never goes below zero".
* **Lead 65's reads are done:**
  - FO-2v #1933 (permissions) at 33b11fbbb. The lane marks it ready once CI is green on that head.
  - PF-12 #1910 (migration) at 4c59bc518.
  - FO-3a 1a #1918 (migration) at 8e62f9dcb.
* **FO-7mv (#1924), from Lead 65:** PF-12's database walls between firms (row-level security) go on the `money_move_*` tables. Read with FO-7a2: FO-7a2's view `money_trust_shortfall` also sits behind PF-12's walls (`security_invoker`, so the reader's firm scope applies), and the same goes for any table FO-7a2 adds.

## Rev 16.58 (16 Nov 11:1x IST, Lead B (6)): P-638's order, FO-7mv first, then FO-7a2

* **P-638** (Lead 65, 11:2x IST) reverses only P-634's order; the money rules are unchanged.
* **FO-7mv (#1924) merges first**, shrunk as its lane proposed (comment 6907573264: the cover check and invoice caps go, and the correction kinds are named as FO-7a2's). **FO-7a2 follows in the same lane**, because its tests need FO-7mv's `money_move_*` tables, `money_to_move` and `correction_kind`.
* `lead-b-briefs/FO-7a2.md` is amended: it starts when FO-7mv is on `main`, with its migration stamp later than FO-7mv's.
* **Known gap until FO-7a2 merges:** a bounced cheque whose money has already moved cannot be recorded (B-10). FO-7mv's PR body names it under "Known gaps", with FO-7a2 as the fix. This supersedes rev 16.52–16.53's "FO-7a2 goes first".

## Rev 16.59 (16 Nov 11:3x IST, Lead B (6)): new row PF-6f (PF-6 part 1's follow-ups), and the J-6 findings answered on #1914

* **PF-6f: `lead-b-briefs/PF-6f.md`.**
  - It fixes the sign-in callback page stuck on "Signing you in…" after Back (Devin on #1912, confirmed). On a mount with no code, the page decides from the current session.
  - It also does the reviewer's three Shoulds (comment 6905937729): one plain refused-while-signed-in notice, axe on that state, and the test's seat given back in a `finally`.
  - It starts now, beside PF-6 part 2a (no shared file).
* **#1914 (J-6 part 1), the breaker's findings:**
  - F2 (an Owner's view differs between leads and retainers): ruled, fixed by **FO-2v** (#1933). There is one rule, from AG-2-64 and SA-6-24 with PF-6b ruling 4's setting.
  - F3 is fixed by **PF-6m** (#1945, the draft Lead 65 opened).
  - F5 is fixed by FO-2v.
  - The licence rule stays proven on PF-6b's test route until FO-6's first licence action lands.
* **PF-6r** gets a fresh runtime builder at high effort (Lead 65). The J-6 lane declined it: its copy is bound to the evidence lane, at medium effort.
* **PF-6 part 2a's brief (`PF-6p2.md`) is ready.** It starts after PF-6r and PF-6m merge, PF-6 part 1 being on `main`.

## Rev 16.60 (16 Nov 11:5x IST, Lead B (6)): #1945 PF-6m's questions, and new row PF-6m2

* Ruling on #1945:
  - **F1** (a deactivated or demoted inviter's invitation still grants roles): fixed in new row **PF-6m2** (`lead-b-briefs/PF-6m2.md`). The accept re-checks that the inviter is active and may still give every role, else 410 "This invitation is no longer valid." PF-6m lists it under "Known gaps", and Lead 66 is asked to log a qa/BUGS row.
  - **F4:** firm signup writes the money line too (PF-6b rule (2) has no exception), also in PF-6m2.
  - **F3:** the line counts the role's keys; kept.
  - **Case Officer and Case Manager** invitations write the line; yes.
* PF-6m's permissions read at 7d3c079a6 is passed to Lead 66.

## Rev 16.61 (16 Nov 11:5x IST, Lead B (6)): rows for checklist 19, 28 and 100: new PF-5v, PF-5t and PF-5s part 1, and PF-19b part 2 placed

* Lead 66's ask follows qa #1950 (R1.100 and R1.19 Partial, R1.28 Partial). The order and states are in `lead-b-briefs/P-626-order.md`, under "Additions, rev 16.61".
* **New rows:**
  - **PF-5v** (`PF-5v.md`): QA-481, the verification email goes through `MailPort` to the demo inbox; QA-484, plain field words.
  - **PF-5t** (`PF-5t.md`): a new terms version asks again at sign-in. Firm terms are accepted by an Owner and the privacy notice by each person. Until then the person gets 428 `TERMS_PENDING`, except on `/me`, the terms routes and sign-out. The acceptances list is shown. Part 2 is the frame's accept page and Settings → Terms. The release holder reads the guard (P-423). This is Lead B's structure ruling; wording Sample, Unconfirmed: no counsel.
  - **PF-5s part 1** (`PF-5s1.md`): the four public sign-up pages whose API is on `main`. S4–S8 wait on PF-5 part 2.
* **PF-19b part 2** (one-click unsubscribe) is ready now from `PF-19b.md`.
* **QA-483's rewording** of R1.19 is given to the Lead.
* Lead 66, 12:0x IST: four cloud builders were requested (PF-5v, PF-5t part 1, PF-19b part 2, PF-5 part 2, with Stripe step 0 first). PF-5s part 1 starts after PF-5v. F1 is logged as **QA-490** (Major, fixed by PF-6m2 after #1945). #1945's permissions read was posted at 7d3c079a6. QA-483's rewording is owed to BACKLOG in Lead 66's next records PR.

## Rev 16.62 (16 Nov 12:1x IST, Lead B (6)): #1955, email before a firm exists, and new row PF-19p

* Ruling on #1955:
  - **Option 1, a reserved "ExpatReady" firm row: rejected.** It would pollute the customer table and every count of firms, including R1.19's.
  - **Option 3: rejected.** P-566 makes the firm only after the code is confirmed.
  - **Taken: platform account messages**, built in new row **PF-19p** (`lead-b-briefs/PF-19p.md`):
    - `msg_outbox.audience` (`FIRM | PLATFORM_ACCOUNT`), with a CHECK that `firm_id IS NULL` exactly for `PLATFORM_ACCOUNT`;
    - `MailPort` takes `firmId` or `platformAccount`;
    - From "ExpatReady";
    - PF-12's walls: system role only.
* **PF-5v splits.** Item 2, QA-484's words, ships now. Item 1 is PF-5v part 2, on top of PF-19p. The same fix serves PF-5 part 2's Cognito sign-up email. The release holder reads PF-19p (P-423).
* Order additions: PF-19p is ready now; it must not run beside PF-19b part 2 on the same files (whichever starts second waits). PF-5s part 1 now waits on PF-5v part 2.
* Lead 66 agreed rev 16.62. **PF-19p starts at the founder's next typed turn**, the first item in STATE. PF-5v ships QA-484's words now. PF-19b part 2 continues. The second of PF-19p and PF-19b part 2 to merge takes `main` in **by a merge, not a rebase** (AGENTS rule 1, P-270).

## Rev 16.63 (16 Nov 12:2x IST, Lead B (6)): qa #1953 answered (comment 6909671971), and new row FO-4sf

1. **Own versus all (QA-478 in #1953):** one rule, built by FO-2v.
2. **R1.27:**
   * The source filter is in Release 1 (AG-2-23 rule 1, THIN SLICE), so new row **FO-4sf** (`lead-b-briefs/FO-4sf.md`) builds it, after FO-2v.
   * Lead import is AG-18's engine (AG-2-7, AG18-D2), so R1.27's text is narrowed to "import when AG-18's engine lands". The Lead copies it.
3. **QA-481 (#1953):** the case side's link and code emails are in row 47. Moving them onto `MessagePort` is a case-side row, which the release holder shapes. PF-13 part 1 is a part of row 47.
4. **J-6 part 2** also moves J-6's API checks into `tests/check_j6_api.ts`, run by CI.
5. **R1.99:** shards 2–8 of run 43801075002 were read on the Mac. All show `retries: 0`, with 445 PASS, 0 FAIL and 19 quarantined (not run). The lines are posted on #1953.
* **Records clash:** #1929 and #1953 both define QA-477 to QA-481, with different meanings, and Lead 66 has QA-490. This is for the Lead to renumber.
* Lead 66 settled rev 16.63's three items: #1929 keeps QA-477 to QA-481, and #1953 renumbers to QA-491 to QA-495 (or points to #1929's row for the same bug); row 27 is narrowed and FO-4sf added on the Lead branch; the case side's person-link email row is in STATE after PF-19b part 2. FO-4sf starts after #1933, at the founder's next typed turn. **Rev 16.63's references to "QA-477" to "QA-481 (#1953)" read as #1953's new numbers once renumbered.**

## Rev 16.64 (16 Nov 12:4x IST, Lead B (6)): #1956 (PF-19b part 2): sealed transactional bodies; new row PF-19e

* **#1956 ships with the `MAIL_PORT` binding on hold**, listed under "Known gaps".
* **New row PF-19e** (`lead-b-briefs/PF-19e.md`):
  - every `TRANSACTIONAL` body is stored sealed by `SecretBoxPort` (per firm, purpose `message-body`; platform account messages under the platform key), and only the worker and the demo inbox open it;
  - the `MAIL_PORT` switch to `MessagesMail` (AG-1-70);
  - account and security mail is exempt from the firm's daily cap of 50, with a platform per-address limit of 5 an hour (Sample);
  - a suppressed staff address on an invitation or reset answers 409 with a plain sentence, never 500.
* The release holder reads it (P-423). It starts after #1956, and not beside PF-19p.

## Rev 16.65 (16 Nov 12:5x IST, Lead B (6)): PF-5 part 2 (#1959)

* **Keys accepted:** `subscription:pay`, `:update-card`, `:cancel` (Owner) and `subscription-invoice:view`.
* **The firm profile moves to part 3.**
* **Condition:** part 2 must store the trial end (R1.19), proven by a named case.
* **For the release holder (P-423):** the `main.ts` raw-body line, which must be limited to `/api/hooks/*`; the money and public-door read; and the case side's 402.

## Rev 16.66 (16 Nov 13:5x IST, Lead B (6)): #1961 (PF-19p) and #1936 (shaping batch 7)

* **#1961, PF-19p's M1: (A).**
  - JobPort takes `firmId` or `platform: true`, never both and never neither.
  - `platform: true` is accepted only for an allow-listed set of queues (today `messages.send`, for `PLATFORM_ACCOUNT` messages).
  - Platform jobs run as the system role.
  - It has a shared contract case.
* **#1936, batch 7, approved with corrections:**
  - **PF-8r:** as is.
  - **FO-3v:**
    - FO-3v part 1 comes after FO-3a 1b and FO-3vr on `service.ts` (not on the P-626 path);
    - the booking type's own link is **dropped as a fallback** (AG-4-29 order; AG-16-73), and the demo seed gives the Sample hosts a My meeting link;
    - Zoom's gate entry goes in the gate file as entry 18;
    - new row **FO-3vm** (paste a link on a booking, AG-4-30) after part 1.
  - **PF-15:**
    - the area file and the `platform_plan_limit` table are confirmed; `seats_limit` is read by nothing after part 1 and its removal is a later item;
    - the features half of SA-3-58 is a named gap on part 2 until PF-17's feature list.
  - **FO-9b's Minors:** accepted.
* **Told to Lead 67:** #1956 merges `main` in its own lane (P-270).
* #1959: the trial-end condition is met ("PF-5 part 2 pass (QA-481)"). Lead 67's re-read was done at e9eae0b40. **Owed by Lead B before PF-5 goes live, not before the merge:** the live Stripe test-mode run on the Mac, which waits on the founder's Stripe test keys.

## Rev 16.67 (16 Nov 14:5x IST, Lead B (6)): PF-5v part 2 waits on PF-19e (Lead 67's condition on #1961)

* Lead 67's read of #1961 is posted at 79248d7d1. The migration, `ports/jobs.ts` (A) and `ports/mail.ts` are all OK.
* **Lead 67's condition:** the verification code must never be stored in clear in the outbox file. So **PF-5v part 2 starts only after PF-19e**, which seals every `TRANSACTIONAL` body, platform account messages included. Its new Done when is `PF-5v DW4`, in `lead-b-briefs/PF-5v.md`.
* **The path for rows 19 and 100 is now:** #1956 and PF-19p merge, then PF-19e, then PF-5v part 2, then PF-5s part 1. **PF-19e should start as soon as #1956 and #1961 are on `main`.**
* **#1962:** the C9.5 failure is a real break on `main`, hidden by the quarantine (kind's quarantine list was empty in that run). Lead 67 takes the fix row, before 20 Nov, with a qa row.

## Rev 16.68 (16 Nov 14:5x IST, Lead B (6)): QA-496, FO-3w part 2 brought forward (#1968)

* **Ruling:** start **FO-3w part 2** (the manage page, J-P6 to J-P8 in `FO-3w.md`) **now**. The email links and buttons are not held back. Holding them would mean new code on `service.ts`, in its queue, removed later, and the bookings made meanwhile would never get a self-service link. Part 2 is screens only, with no API.
* **Folded in:** `/book/:firmKey/manage` is declared before `/:slug`, plus a case that `manage` is a reserved slug.
* qa's walk line is the acceptance line.
* Lead 67 accepted rev 16.68. **FO-3w part 2 is owed at the founder's next typed turn** (STATE), with both fold-ins, on the cloud, P-608.

## Rev 16.69 (16 Nov 17:27 IST): #1952 (PF-6f) is not the C4.11-G5 cause; requeue (Lead 67's question, P-214)
* **Lead 67's guess, checked against the CI evidence:** the new `callback-page.tsx` changes how the C4.11 pack's sign-in lands. The guess does not hold:
  - Batches #1965 (head 9527992aa5) and #1966 (head 10be3d72a1) were stacked on #1952, and their tested `callback-page.tsx` has PF-6f's `let latest`. Both passed the C4.11 regression part, at 08:56 and 09:19 UTC.
  - `acceptance/C4.11.test.ts` uses the API only (`call()` with x-actor; no browser or sign-in page), and gate B gives each pack its own copy, port and database (`tools/gate-b.mjs` lines 22–23).
  - The two red batches, #1964 at 08:26 UTC and #1976 at 11:37 UTC, both show `{"ready":0,"nobody":0}`: the saved run gave no Ready band at all, and the same-job retry was red too. Between them, seven batches passed C4.11 (#1970, #1971, #1973 to #1975, #1977, #1978).
  - **Verdict:** C4.11-G5 fails intermittently; the cause is not found.
* **Ruling (PR comment 6915752025):**
  - #1952 is requeued as it is, with its approval and label standing; the requeue is the Lead's word.
  - The C4.11-G5 `ready:0` failure needs a fix row for the C4.11 owner (not PF/FO). It starts from jobs 133164149062 and 133239231752.
  - Until that fix lands, `ready:0` is a known failure for B202's table, never a reason to take a PR out.
* **Lead 67 accepted, 17:28 IST:** its call is withdrawn. #1952 is labelled and requeued as it is, with the correction posted. C4.11-G5 `ready:0` is now Lead 67's fix row, in STATE beside C9.5. Until it lands it sits in B202's known-failures table, and no PR is dequeued for it.

## Rev 16.70 (16 Nov 18:17 IST): starts under Lead 68 (P-641)
* **P-641:** founder decision to push harder tonight on extra usage.
* **FO-4sf:** Lead 68 asked for its cloud lane at 18:2x IST (name `fo-4sf`), with Lead B's brief word for word. #1933 is merged.
* **FO-3w part 2:** Lead 67 started its cloud lane at 17:41 IST, with both of Lead B's additions (QA-496 ruling, rev 16.68).
* **PF-19e:** waits on #1956 and #1961, both queued. Lead B watches both and tells Lead 68 the moment both are on main, and Lead 68 then starts it.

## Rev 16.71 (16 Nov 18:24 IST): #1972 shaping batch 8 (PF-11, PF-26, PF-15 Minors) approved with corrections (comment 6916991708)
* All ten drafted rulings are confirmed: PF-11 in three parts, the `platform_*` table names, the list key, the release door, client money's own exporter, `pizzip`, the PDF through PF-Fp, the English and French template, and the Sample values (7 days, 72 hours, 500 MB).
* **PF-26 visibility (Lead B reading under P-628, listed for the founder):** the export follows the same visibility rule as every read. `visibilityOf` and `sees` apply FO-2v: all = `view.all` AND `platform.everyone_sees_all`. An export never shows more than the screens do. A person with no lead or prospect needs `view.all` alone.
* **Six binding corrections** (the shaping lane pushes them before the label, or each builder applies them at start):
  1. The list key needs both its catalogue row and its role rows; DW1 adds an Admin 200 case and a Case Officer 403 case.
  2. `system/firm:investigate` goes in PF-4s's system key table, never the `agent/`-only catalogue.
  3. PF-26 cites PF-Fp in P-630-amendments.md and uses `toPdf`; if PF-Fp is late, the JSON half ships first and the PDF follows as part 1b.
  4. The link table is `platform_firm_export_link`, read through a named bypass use.
  5. Both exporters open their read-only transaction inside `withFirm`; DW6 adds this case.
  6. The size cap is checked while each file is added, never after; DW5 adds a small-cap case.
* PF-15's Minors are approved. Starts are unchanged: PF-11 part 1 after #1959; PF-26 part 1 after PF-11 part 1, FO-9b part 1 and PF-Fp (for the PDF).
* Legal points are Unconfirmed: no counsel.

## Rev 16.72 (16 Nov 18:43 IST): FO-4sf is built by #1962; #1985 closed as a duplicate (comment 6917402716)
* **#1962 (FO-4sf, the leads list filtered by source) merged on 16 Nov at 12:53 UTC (18:23 IST).** FO-4sf is done. It must never be briefed or started again.
* **Lead B's error:** revs 16.68 and 16.70 listed FO-4sf as "owed" and "requested", although #1962 was already open. So Lead 68 started a second lane, which became #1985. It started from 47b00ddae, before #1962 merged, and it filtered on `door`, the wrong field. The AG-02 glossary says the source "is not the same as the door".
* **Ruling:** close #1985 as superseded by #1962, either the builder or Lead 68. Nothing from it is carried over, and the branch is left as the record.
* **Lesson (for this file's start-list checks):** before a row is listed as owed, Lead B checks its open and merged PRs by row name. Brief rev 16.63 went out while #1962 was in flight.
* **Lead 68, 18:44 IST:** FO-4sf is recorded as built in STATE, and #1985 is closed. BACKLOG has no FO-4sf row to tick. Merged between 18:35 and 18:52 IST: #1951 (PF-6r), #1955 (PF-5v part 1), #1952 (PF-6f), #1954, #1929, #1967 and #1943.
  - **What these merges unblock:** PF-6 part 2a now waits only on **PF-6m (#1945, open)**, since PF-6 part 1 and PF-6r are on `main`.
  - PF-5s part 1 still waits on **PF-5v part 2**, the verification email to the inbox. Part 2 waits on PF-19e, and PF-19e waits on #1956 and #1961, which Lead B is watching.

## Rev 16.73 (16 Nov 19:59 IST): FO-7a2 (#1991) touch list widened for rule 2c (Lead 69's ruling 6919227996; Lead B concurs, 6919271763)
* **Lead 69's ruling:** FO-7a2 may change `money_move_line_write`, `money_trust_entry_moves` and the `money_to_move` view, and add `money_credit_note.overpaid_choice` (OVERPAID_REFUND | OVERPAID_TO_TRUST) with the moved amount.
  - An operating → trust line is allowed only when it names a credit-note withdrawal, capped at O.
  - PF-12 walls apply, the money breaker runs, and Lead 69 reads the migration before the label (P-423).
  - Under 800 changed lines.
* **Lead B concurs:** the touch-list gap was Lead B's own, from when rule 2c was written.
* **Lead B adds two lines:**
  1. The three FO-7mv functions join `money_trust_entry_write` and `money_credit_note_write` as FO-7a2's alone until it merges; FO-7b, FO-7t and FO-7ts do not touch them.
  2. AG-6-73 rule 1(b) in general (money paid into the wrong account) is not opened. Any operating → trust line naming no credit note → 409, with a test.
* **Also:** #1945 (PF-6m) is labelled; PF-6 part 2a starts when it merges.

## Rev 16.74 (16 Nov 21:06 IST): P-644, Lead B is Build Lead A; rows-left list and the first eight starts
* **P-644 (founder, 21:0x IST, through Lead 69):** the four-seat model. Lead B is Build Lead A for the PF/FO rows: up to 8 cloud builders, 5 rows fully built a day, fewest parts left first, two ready briefs per lane. Lead 69 starts the lanes from "start:" lines.
* The rows-left list, the first eight starts and each lane's second brief are in `design/lead-b-build-lead-a-2026-11-16.md`. They were measured against 1,200 PR titles and checked by row name (the #1985 lesson).
* **The first eight starts:** PF-21s stage 2 part 1, PF-21i, PF-13 part 1, PF-8r, PF-24w, FO-13i, FO-2b, PF-18a part 1.
* **Rows with no PF/FO part left go to the Prove Lead:** 27, 30 and 31 (38 and 40 are with qa, #1968).
* **The FO-7 money rows:** the model gives them to Build Lead C. Lead B keeps FO-7a2 (#1991) until it merges, unless Lead 69 rules otherwise.
* **Lead 69's answers, 21:08 IST:**
  1. **FO-7 money:** agreed. Lead B keeps FO-7a2 (#1991) until it merges; the rest of FO-7 goes to Build Lead C, and Lead 69 is telling C.
  2. **Sub-parts:** Lead 69 is first checking with the board session which form the board counts, then adds them to the checklist on lead/2026-11-07-lead31.
  3. **Starts:** the eight starts and their second briefs are queued. Sessions start only in a turn the founder types, so they go out at the founder's next message.

## Rev 16.75 (16 Nov 21:09 IST): the PR title rule; PF-21s stage 2 becomes parts 3 and 4
* **What Lead 69 did:** added Lead B's sub-parts to MVP-CHECKLIST on lead/2026-11-07-lead31, in the board's form (for example "PF-13 parts 1-2").
* **The title rule:** every PR title names its part exactly, for example "runtime: PF-13 part 1 — …". A title without "part" counts as the whole row.
* **PF-21s:** stage 1 merged as #1821, so stage 2 becomes PF-21s part 3 (the list and the drawer) and part 4 (the record page's actions). Updated in `lead-b-briefs/PF-21s.md` and in the start list.

## Rev 16.76 (16 Nov 21:14 IST): seed-sample-firms.ts check; PF-13 part 1 out of the first eight (overlap found)
* **Lead 69's question (Build Lead C's AUD-5 part 1 adds a line to `seed-sample-firms.ts`):** no queued PF/FO lane touches that file. Every queued brief was checked. PF-24w only reads `identity/sample-seed.ts`.
* **An overlap Lead B found in its own start list (P-526):** PF-13 part 1's touch list holds `ports/messages.ts` and `platform/messages/send/messages.ts`. Open PRs #1956 (PF-19b part 2) and #1961 (PF-19p) both change those files, and PF-19e will too.
  - PF-13 part 1 now starts after #1956, #1961 and PF-19e are on `main`.
  - The order for the messages files: PF-19e, then PF-13 part 1, then PF-19c. None runs beside another.
* **The first eight now hold PF-Fd** in lane 3, in place of PF-13 part 1. Lane 2's second brief is PF-0bp. The start list is updated in `design/lead-b-build-lead-a-2026-11-16.md`.

## Rev 16.77 (16 Nov 21:45 IST): FO-13i (#2011): the Code's s. 24(2)(a) read at source; the warning stands (comment 6922009380)
* **Why Lead B read it:** the cloud lane could not reach laws-lois.justice.gc.ca, because the proxy refused it. Lead B read it from the Mac.
* **The source:** SOR/2022-128, https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/FullText.html, current to 2026-10-19, read on 16 Nov 2026.
  - **s. 24(2)(a):** before entering into a service agreement, a licensee must "confirm the following information in respect of the client, seeking corroboration of the information if possible: (i) their full name, (ii) their home address and their personal telephone number and email address, if any, and (iii) their business address, telephone number and email address, if applicable".
  - **s. 24(3)(b):** the service agreement must include "the information referred to in subparagraphs (2)(a)(i) to (iii)".
* **Ruling:**
  - Corroboration is "if possible", so it is a warning on Send and never a block. This is as built.
  - Confirming the details is a "must". The retainer carries them under s. 24(3)(b), which is FO-5's required items. FO-13i adds the corroboration record and its warning.
  - The requirements snapshot is not edited. Unconfirmed: no counsel on whether a recorded warning meets s. 24(2)(a) in a review.
* **Note:** FO-13i was started from the queued list (PR #2011).

## Rev 16.78 (16 Nov 21:50 IST): PF-18a part 1 (#2009) and PF-8r (#2014) rulings
* **PF-18a part 1 (comment 6922123850):**
  1. **Real foreign keys, not triggers.** Back-relation lines go under a new slot line `// back-relation slot: offices (PF-18a)` in `PlatformFirm` and `PlatformStaff` (`platform.prisma`), following the rev 16.6 pattern; `check_pf0p_ports` keeps every slot line. Composite keys are on (firm, …). The write triggers are dropped. This is done in this PR (P-606).
  2. `Offices.setStaffOffice` has no route. **PF-18s adds `PUT /api/platform/staff/:staffId/office` (`agent/settings:edit`)**, now in PF-18s's row (for the Lead to copy into BACKLOG).
* **PF-8r (comment 6922124215):**
  1. **`main`'s schema drift:** the comparison approach is accepted. The 5 statements (`fact_source`, `form_edition_accept`, `person_role`, `validated_copy`, DROP `canonical_field_name`) are a NOTE. The condition: a fail case where one index or policy is dropped after the restore must be FAIL. The drift fix is case-side, so it is a fix row for Build Lead C / the release holder. PF-8r does not wait for it.
  2. **`nightly.yml` and `run-suites.sh`:** these are the Lead's files, so the Lead decides. The row owner agrees the patch is in scope. The Lead should check the job condition `caps == '[]'` against "runs every night".
* **Lead 69's answers, 21:51 IST:**
  1. **PF-8r (#2014):** the lane has the baton for `nightly.yml` and `run-suites.sh` (comment 6922144923). The drill runs every night, with no `caps == '[]'` condition, and it fails on a dropped index or policy. Lead 69 reads the diff before the label.
  2. **The schema drift row** has gone to Build Lead C.
  3. **PF-18s's BACKLOG row** now carries `PUT /api/platform/staff/:staffId/office` (amendment on lead/2026-11-07-lead31).
  4. **The next Lead:** Lead 69 hands over to Lead 70 shortly (P-446). Whoever is the current Lead is read from `tools/current-lead.sh`.

## Rev 16.79 (16 Nov 22:00 IST): FO-13i (#2011): two test changes outside the touch list, accepted (comment 6922399402)
* `check_pf3_platform_schema.ts`: `ADDED_BY_LATER_ROWS` gains `"agent/identity-check:"`. This is the suite's own rule, as PF-21 did.
* `check_pf12_walls.ts`: "the migration changes no row" now runs only on PF-12's own migration step. It had been measured across every later migration, so it failed any row that seeds a key.
  - **Condition:** the walls checks still run on the fully migrated database: FORCE RLS, `pf12_firm`, `FAMILIES`, and the bypass functions with pinned `search_path`. A later table without a policy must still go red.
  - Counts: 99/1 before, 100/0 after.
* Test-only, so no P-423 read; the Lead was told because the walls check is shared.

## Rev 16.80 (16 Nov 22:07 IST): night-queue lines for Lead 70 (P-645)
* **Lead 70's news:** four queued starts are already running: PF-21s part 3 (#1998), PF-21i (#2012), PF-Fd (#1997) and PF-24w (#2001). FO-2b started at 22:0x and chains FO-9a. Three hourly cloud routines take rows from `design/night-queue-2026-11-16.md` (Lead branch).
* **The night lines Lead B sent:** 18 rows. Three can start now: FO-9b part 0, PF-21b part 1 and PF-Fp part 1. The other 15 each name the PR they wait on.
  - The lines are in `design/lead-b-build-lead-a-2026-11-16.md` §5.
  - Chains on shared files are ordered, never side by side (P-526): booking/service.ts runs FO-3a 1b, then FO-3vr, then FO-3v; the messages files run PF-19e, PF-13 part 1, PF-19c, then PF-19ad.
* **Lead 70, 22:09 IST:** all 18 night lines and both chain rules are in the night queue (7c1560e76, Lead branch). The routines skip a row until its gate is merged. Lead 70 will check the FO-13i walls condition at its P-423 read of #2011.

## Rev 16.81 (16 Nov 22:12 IST): PF-8r (#2014) waits on the founder (P-387)
* **The builder's copy refuses the write:** its own block refuses changes to `nightly.yml` and `run-suites.sh`, despite the baton, so it asked the Lead to push the patch (comment 6922705548).
* **Lead 70 read the patch:** the job is read-only (persist-credentials false, no secrets, no `needs`, runs on every scheduled night), with one SKIP name. The content is fine.
* **Lead 70 will not push it:** a write one copy refused is not routed through another session without the founder's named word (P-387). Lead 70 has asked the founder, and #2014 stays a draft until he answers.
* **Lead B's correction:** forwarding the builder's ask was right, but Lead B should have named P-387 instead of saying "this one is yours". Rule from now on: a refused write goes to the founder through the Lead, never to another session to do.
* **The founder said "Yes, push it" (22:15 IST, through Lead 70).** Lead 70 pushed the patch from comment 6922705548 to #2014's branch as eaaa74fd5, exactly as written, and said so on the PR. Next: the builder runs both tests on that head, then the reviewer reads only that commit. Lead 70 does the Lead read (.github) before the label.
* **PF-8r, a third Lead file (22:51 IST, comment 6923704458):** shard (1) is red because `check-select-suites.sh` line 40 treats `nightly.yml` as smoke-only, while `check_pf8r_nightly_job.ts` reads it. The builder's patch moves `nightly.yml` out of the smoke-only loop and checks it selects the smoke set plus exactly that test; the local run is 83/0. The row owner judges it right and not a workaround. **P-387 applies again** (the founder's yes covered only 6922705548), so Lead 70 puts it to the founder.

## Rev 16.82 (16 Nov 23:03 IST): CI saturation note to 10 lanes; QA-499 shaped as PF-12b
* **CI is saturated** (Lead 70: 68 runs queued at 22:58, no merge since 21:32). "Draft until the reviewer approves, then ready once" went as a PR comment to the 10 unlabelled PF/FO PRs: #2025, #2021, #2019, #2014, #2012, #2011, #2009, #2001, #1998 and #1991 (comments 6923962434 to 6923966108). Labelled PRs were left as they are.
* **QA-499 (R1.4, Major):** Lead 70 ruled on #1999 that a bypass use writes `audit_event` (P-607), with no log-only option. It is shaped as **PF-12b**, `lead-b-briefs/PF-12b.md`:
  - **Part 1 (now):** the cross-firm uses write one `platform.bypass` line per firm touched, in that firm's transaction, or are refused (fail-closed). Every `BYPASS_USES` entry names its `audit` field.
  - **Part 2 (after part 1):** the seven own-firm doors move to narrow `xr_wall_reader` definer lookups and leave `BYPASS_USES`. It splits into 2a and 2b past 800 lines, and never runs beside the `identity/` rows.
  - DW1 to DW7. Opus high, breaker yes, and the release holder reads the SQL.
* **Lead 70, 23:04 IST:** PF-12b part 1 is now the night queue's top row, because it frees R1.4 to be proven. Part 2 waits on part 1, with the `identity/` exclusions kept. The QA-500 rewording is held until part 2 lands.
* **PF-8r, the third Lead file (23:13 IST):** on the founder's word (23:2x), Lead 70 put the `check-select-suites.sh` change on #2014 as 2aa9949e1. It was applied by hand, because the comment's patch text was cut short; the PR comment says so. The nightly check passes in a scratch clone. Next: the builder runs both tests on this head, and the reviewer reads only this commit.

## Rev 16.83 (16 Nov 23:16 IST): FO-7s0 (#2016, Build Lead C's row): facts given, not a ruling (comment 6924325967)
* **P-634 (1) supersedes FO-7v's "never below".** A negative appears only after a reversal's shortfall, red and labelled. Refreshing FO-7v is C's job.
* **The clash:** the lane recommends an operating → trust To-move line that covers a reversal's shortfall. After #1991, `main` accepts only the credit-note operating → trust line (rev 16.73); every other one gets 409. So the shortfall is shown, but no covering line exists. If the concept needs one, it is a new row for C, with a P-423 migration read. Until then, the screen draws no button or line that `main` refuses.
* Unconfirmed: no counsel (whether a firm must cover a shortfall from its own funds, and how soon).
* **Lead 70, 23:17 IST:** passed the facts to Build Lead C. **Ruling on #2016:** the shortfall is shown red and labelled. No covering line that `main` refuses; a covering line would be a new C row after #1991. Build Lead C's full id is `local_d5287293-a27e-4cd2-a533-ca1949bdf430`.

## Rev 16.84 (16 Nov 23:26 IST): Lead 70's network rule posted on the 11 working PF/FO PRs
* **The rule:** never ask for a network or environment change, and never wait on one. A blocked public page gets `Not verified: <site> blocked on the cloud network`; the lane uses what the repository holds and goes on. Build Lead A reads blocked official pages from the Mac when a claim needs it, as it did for FO-13i.
* **Posted on 11 PRs** (comments 6924561016 to 6924564927): #2028 (PF-Fp part 1, new), #2025, #2021, #2019, #2014, #2012, #2011, #2009, #2001, #1998 and #1991. The labelled and queued PRs were left alone.

## Rev 16.85 (16 Nov 23:41 IST): CI jam check for Lead 71
* **Lead 71's figures:** no merge since 21:32 IST, 104 runs queued, about 11–16 jobs at once, and about 16 jobs per full ci run. Lead 71's rule: a PR whose head has no `Reviewer: Approve <head>` stays a draft, and nobody pushes to a ready PR except a fix. The label-guard and records-label start-up failures (16:42–18:00 UTC) were a scheduled GitHub brownout of `pull_request_target`, now over. Lead 71 read #2012's migration (cbf6bebd3: additive, later stamp); it waits only on ci.
* **Lead B's check:** all 11 working PF/FO PRs, by head sha against their comments. All 11 have `Reviewer: Approve` on their current head: #2028, #2025, #2021, #2019, #2014, #2012, #2011, #2001, #1998, #1991 are ready, and #2009 is a draft. None breaks the rule, so no draft change was needed.

## Rev 16.86 (16 Nov 23:45 IST): Build Lead C's three asks on files Lead B owns
* **#2000 CS-DL1 part 1 (comment 6925010919): no new `BYPASS_USES` entry `case.stages.calendar`.** QA-499 makes every bypass use write `audit_event`, so a GET on every case's stages would write a row per view. PF-12b part 2 moves own-firm doors off the bypass anyway.
  - **Either (a), preferred:** a narrow definer, `platform_firm_calendar(firm_key)`. It is owned by `xr_wall_reader` with `search_path` pinned, and returns only time zone, hours and closed days. It needs a P-423 read, keeps DW8, and adds a catalogue check of its return columns.
  - **Or (b):** ship option 2's fallback, with the lookup in CS-W3 part 1.
* **#2003 AUD-1a (comment 6925011408): the PF/FO test-file changes are confirmed.** These are the `system:` actor prefixes, the pf0p workspace-only delete and the pf3 forced failure; no assertion is weakened.
  - **The question raised:** `app.audit_sample_reset` must open only the demo workspace's lines. Platform audit lines stay undeletable, with a fail case. That is C's row and the release holder's read.
* **#2008 AUD-5 part 1 (comment 6925011807): `demo-reset.ts`, `sample-seed.ts` and `seed-sample-firms.ts` are confirmed.** The seed writes only where no value exists, through `writeSetting`.
  - **Two checks to state:** it runs only with the Sample seed, never for a real firm; and the plain `tsx` seed still loads with the new dynamic import.
* **Build Lead C's answer, 23:47 IST:**
  - **#2000 (comment 6925060605):** C took option (a). There is no bypass use, and `firm-scope.ts` stays untouched. The PR adds `platform_firm_calendar(firm_key)`: SECURITY DEFINER, owned by `xr_wall_reader`, `search_path` pinned, returning only the 3 settings, with EXECUTE for the app role only. Tests are DW8 plus DW9, a catalogue check of owner, prosecdef, search_path, result columns and that PUBLIC cannot execute it. It is now a schema PR: the breaker is on, and the Lead reads it (P-423).
  - **#2003 (comment 6925061060):** the fail case is added. With the reset setting on, a platform audit line is refused and a demo line deletes. If needed, the trigger is narrowed to the demo-workspace condition only.
  - **#2008 (comment 6925061558):** the PR body states the Sample-seed guard line and the plain `tsx` seed run (exit 0). Nothing is pushed if both hold, because the head is approved and CI is jammed.

## rev 16.87 (17 Nov 01:20 IST): #2014 PF-8r nightly.yml fix waits for the founder's word
* #2014 comment 6927292457 (head aa5d688b, back to draft): `ci-and-lists.mjs` flags nightly.yml:170 as HIDDEN RED (`cd "$S" && … | tee drill.txt`). The builder's patch puts one command per line, keeps the drill's status (`st=0 … || st=$?`), always writes the summary, and exits red. `check_pf8r_nightly_job.ts` guards it (6/6 with the patch, 5/6 without).
* My read as row owner: correct and minimal. It is a .github write, so it is the Lead's (P-423), and I did not push it (P-387).
* Lead 71: the earlier .github pushes went on the founder's named word, so this one waits for his word at 09:00 IST 17 Nov. It is off tonight's critical path, and #2014 stays a draft until then.

## rev 16.88 (17 Nov 01:44 IST): #2021 FO-9b part 0, the BR-6 red is QA-498, not the PR
* #2021 comment 6927914399: shard 1 red on `check_bk5_start_browser.cjs` BR-6 (the start page's heading after reset and load) on all 4 tries. The calls are right each time.
* The PR changes four files only: `ports/person-merge.ts`, its contract, `ports/events.ts` (16 lines) and `tests/check_fo9b_port.ts`. No web, route or demo code. Changing `ports/events.ts` selects every browser suite, so this fits QA-498's shared demo database order fault.
* Ruling (comment 6928001109): not this PR's. Option 1 is the right call, and the quarantine is Lead 71's (P-205). Asked Lead 71: quarantine BR-6 under QA-498 on main, then `/rerun failed`, then label on green on bdb8484.

## rev 16.89 (17 Nov 01:47 IST): QA-498q and QA-498 briefed (Lead 71's rulings)
* Lead 71 ruled on #2021 (P-205): a whole-suite entry for `check_bk5_start_browser.cjs` in `run-suites.sh` QUARANTINE, with a comment block naming QA-498, the ruling, "remove by 18 Nov or when the QA-498 fix lands", and that the nightly full set still runs it. No per-line skip. Cloud builder, one PR, Ready for Lead read, Opus reviewer, no breaker; the Lead labels it and it lands ahead (P-214).
* Briefs: `lead-b-briefs/QA-498q.md` (the quarantine: start now) and `lead-b-briefs/QA-498.md` (the fix: root cause first, P-502; it starts after QA-498q merges; it takes the name off the list; first among the night lines).
* Until QA-498 lands, BK-5 stays Partial (P-305), and qa does not count the demo doors as Works.

## rev 16.90 (17 Nov 03:38 IST): #1945 merged (03:37 IST), three rows unblocked
* PF-6 part 2a (web only), PF-6m2 (`identity/session/service.ts`, `firms/signup-identity.ts`) and PF-4c part 1 (`identity/service.ts`, `identity/routes.ts`, new `batch-invite.ts`) may run in parallel. Their touch lists do not overlap with each other or with any open PR.
* PF-4c part 1 shares `api/src/platform/MODULE.md` with #2029 (PF-12b part 1): one entry-point line, and whichever opens second merges main on the conflict (P-270).
* New hold: #2029 touches `messages/send/messages.ts`, so PF-19e now waits on #2029 as well as #1956 and #1961.
* PF-12b part 2 waits on #2029, and must never run beside PF-6m2 or PF-4c part 1 (both touch identity).
* Merge watch: #1956, #1961, #1959, #1918, #2029.

## rev 16.91 (17 Nov 03:57 IST): #2044 PF-6 part 2a, both decisions confirmed; PF-4dn briefed; one founder question
* #2044 comment 6931207847, ruled in comment 6931260376.
* (1) No name on the invite rows: confirmed, because the server discards it. New row **PF-4dn** (`lead-b-briefs/PF-4dn.md`): optional `displayName` on the invite, stored at accept, plus one field on the screen. It starts after #2044, and never beside PF-4c part 1 or PF-6m2.
* (2) An Admin cannot give Case Officer: this is a conflict between requirements.
  - SA-6-29 says an Admin gives a role only if it holds every permission in it.
  - SA-06 v3.15 seeds `agent/sqr:verify` on Owner, Case Manager and Case Officer, not Admin.
  - AG-01 AG01-18 asks for "Case Officer pre-selected per row", with the Admin as inviter.
  - The screen follows the server's ceiling (Case Officer hidden, nothing pre-ticked for an Admin); a DW line pins that behaviour.
  - **For the founder** (through the Lead, AGENTS rule 2): (a) Admin gains `agent/sqr:verify` (and `party:view.own`); (b) the ceiling check skips own-scope keys; or (c) the pre-select applies to Owners only. My recommendation is (c) for Release 1. It keeps the SA-06 counts and the SA-6-29 guardrail as written, and the Admin ticks a role it can give.

## rev 16.92 (17 Nov 05:29 IST): #2012 PF-21i widened by three web/test files
* #2012 comment 6933077319: shard 2 is red for a real reason.
  - PF-21s merged first, so on `main` the Record drawer posts `/platform/complaints` without an `Idempotency-Key`.
  - Once PF-21i lands, Record would answer 400 `IDEMPOTENCY_KEY_MISSING`.
* Ruling (comment 6933156196): this PR takes the three changes, about 10 lines.
  - `staffApi` gains an optional `headers` only.
  - The drawer sends one key per opening, and a retry reuses it.
  - The PF-21s test helper adds a fresh key, plus a DW line: a double-pressed Record stores one complaint.
* No open PR touches those files (P-526, checked). Diff-only re-review, then ready once.
* The label is still on from the earlier head. Flagged to Lead 71 (P-385).

## rev 16.93 (17 Nov 06:43 IST): QA-498q merged (#2034, 06:28 IST)
* #2021 (FO-9b part 0): its builder was told to run `/rerun failed` on bdb8484 and label on green (comment 6934646054).
* QA-498, the fix row, is now free in the night queue.
* #1968 and #2006 merged; both are qa records and unblock none of my rows.

## rev 16.94 (17 Nov 07:35 IST): FO-7b amended to match FO-7s0 Q1, Q2 and Q5 (Build Lead C on #2016, comment 6935644111)
* Amendment 1 is rewritten.
  - Extra money received into operating, in every trust state, offers "Refund · Keep as credit" (`KEPT`).
  - Only money received into trust becomes a trust `RECEIPT`.
  - A card overpayment goes to operating as extra, by the same path.
  - FO-7b stores the waiting state that G24 (FO-7q's read) lists.
  - A neither test is added: trust YES plus extra into operating gives no trust `RECEIPT`.
* Amendment 8, new: the payment route takes `receivedInto` (`OPERATING | TRUST`; card is operating only; `TRUST` needs the trust answer YES).
* Amendment 9, new: FO-7b builds the operating details write on Getting paid.
* No conflict with built work: there is no FO-7b PR, and nothing on `main` uses `receivedInto`.
* Two points went back to Build Lead C: how "Invoice payments go to" sets the default `receivedInto`, and FO-7b's size (P-610).

## rev 16.95 (17 Nov 07:36 IST): FO-7b, no default receivedInto, and a split into part 1 and part 2 (Build Lead C, 535bc7fab)
* Amendment 10 added to FO-7b.
  - "Invoice payments go to" only decides whether the pick is asked. With Operating, `receivedInto` is fixed to OPERATING. With Trust first, the pick is required, with no default, and a missing pick gets 400.
  - Part 1: invoices and the payment route (amendments 1, 3, 6, 8); a missing `receivedInto` counts as OPERATING.
  - Part 2: the settings writes (amendments 2, 9) and the 400; it starts after part 1.
* FO-7b is a money row (Build Lead C's); it is not in my night lines. Build Lead C names the two parts on the board.

## rev 16.96 (17 Nov 07:58 IST): founder answers (P-653, through Lead 72)
* #2044: "Owners invite Case Officers", option (c). The screen as built already matches: for an Owner, Case Officer is pre-ticked; for an Admin, it is hidden and nothing is pre-ticked. The DW line pins that. No permission or data row is needed, and SA-06 and SA-6-29 stay as written.
* #2014: "Yes, push #2014's fix". The Lead pushes the nightly.yml patch from comment 6927292457 after re-reading it on the current head.

## rev 16.97 (17 Nov 08:18 IST): PF-18b on the warm PF-8r lane, yes with conditions (Lead 73 asked)
* P-526b against #2009 (PF-18a part 1): the only shared file is `api/src/platform/MODULE.md` (one line each; whichever opens second merges main, P-270).
* Conditions:
  - No `platform.prisma` edit while #2009 is open. Any back-relations go in only after it merges, under `// back-relation slot: support (PF-18b)`.
  - The migration stamp is later than `20261116190000_pf18a_offices`, and the release Lead reads it.
  - The PR stays a draft until Approve.
* GitHub's REST rate limit ran out for our account at about 08:17 IST. The scan now runs every 300 s and the merge watch every 420 s.

## rev 16.98 (17 Nov 08:36 IST): PF-21s part 4 waits on #2012; PF-5tv named
* PF-18b was sent to the PF-8r lane at 08:5x IST with the rev 16.97 conditions, word for word (Lead 73).
* PF-21s part 4 (DW3, DW4), on the idle part-3 lane: yes, but only once #2012 is on `main`.
  - #2012 edits `tests/check_pf21s_complaints_browser.ts`, `complaints/record-drawer.tsx` and `platform/session.ts` (rev 16.92). Part 4 shares that test, and its writes go through `staffApi` (P-526).
  - Its writes send an `Idempotency-Key` through the new `headers`.
  - Start line sent to Lead 73.
* No other ready no-wait row of mine is left: PF-21b part 1, PF-Fp part 1 and FO-9b part 0 are built.
* **PF-5tv**, new (from PF-5t's lane): two terms versions published in the same instant re-ask a firm that has just signed up; the fix is in `firms/signup.ts`. It waits on #2029 (same file). The brief waits for the lane's PR and comment id from Lead 73.

## rev 16.99 (17 Nov 08:40 IST): PF-5tv briefed (#1957 body point 3, breaker m3)
* Evidence on `main`: `signup.ts` `currentTerms` orders by `publishedAt desc` only, while `terms/service.ts` `current` orders by `published_at desc, version desc`. On a tie the two can disagree, so a firm that has just signed up gets 428.
* Ruling: one shared exported read, ordered `published_at desc, version desc, id desc`, used by both. No unique key and no migration.
* Brief: `lead-b-briefs/PF-5tv.md`. It waits on #2029 (`signup.ts`) and never runs beside PF-12b part 2.
* #1957 point 1 (accept the current privacy notice at invitation acceptance, a PF-4b follow-up) is still unruled. It is noted as a separate row to shape.

## rev 17.0 (17 Nov 09:25 IST): #2064 PF-18b, a size exception recommended; m1 carried to PF-17
* #2064 comment 6937701957: head 749708be is 1,002 changed lines. 839 are code and tests; 163 are review records. The brief estimated ~550, and the growth is the breaker's and reviewer's fixes, each with a fail test.
* Ruling (comment 6937748138): recommend a size exception, not a split. The head is approved whole, the breaker passed it, and a split would cost two reviews and a second migration and leave DW3/DW7 open (P-606). The DECISIONS row (as P-617) is the Lead's. No push until it exists; then only the body line `Size exception: P-NNN`.
* m1 (a firm-side database writer could insert a `SUPPORT` message) stays open here. The PR body must show the API refuses it today, with a named test.
* **Binding condition on PF-17 (its brief does not exist yet; whoever shapes it must include this):** once PF-4s gives our team a role, a database rule lets only that role write `SUPPORT` rows in `platform_support_message`. It is a named DW with a fail case: a write as `xr_app` is refused.

## rev 17.1 (17 Nov 09:29 IST): P-654, the size exception for #2064 (Lead 74)
* #2064 adds the body line `Size exception: P-654` only. Lead 74's migration read on 749708be passes (comment 6937825642).
* **PF-17's binding conditions now cover two things:** (1) a database rule so that only our team's role writes `SUPPORT` rows (breaker m1); (2) foreign keys from the support tables to firm and staff, added after #2009 merges, as back-relation lines under `// back-relation slot: support (PF-18b)`.
* **New standard rule for every PF/FO brief:** a migration's stamp must differ from every open PR's stamp, not only be later than `main`'s. #2062 and #2064 both used 20261117030000; that was safe only because Prisma orders by full name.

## rev 17.2 (17 Nov 11:10 IST): P-660 (the founder, ~11:1x IST through Lead 75), the move to the expat-ready org on Wed 18 Nov at 09:30 IST
* Today lanes finish open work and start only near-Proven product PRs and pipeline fixes; no new big rows. The founder's concern: no work done so far may be lost.
* My three rows waiting on merges:
  - PF-5tv starts once #2029 merges (small, no migration).
  - PF-21s part 4 starts only if #2012 merges before ~15:00 IST (the last part of the complaints screen, no schema); otherwise it holds for after the move.
  - PF-12b part 2 holds for after the move (~650 lines, a migration, identity files, a breaker).
* Owed to Lead 75 by 20:00 IST (sending at 19:30): every open PF/FO PR of mine, its head, and whether it merges tonight or waits for the move.

### Rev 17.3 (12:38 IST 17 Nov): #2064 red CI read; P-663 hold
* **#2064 (PF-18b), head 749708be:** red for about 2 h with no push, and not `check_css1_index` DW4. (1) pr-rules: `pr-size.sh` reads main's DECISIONS.md, and P-654 is only on records PR #2071 (labelled, queued). (2) module-cards: the run came before the body's `Card unchanged:` line. No builder fix. Re-run both failed jobs once #2071 merges; otherwise it waits for the move with head 749708be.
* **P-663 admission rule tripped** (Lead 76: P95 queue wait 239 min, batch wait 35 min): no new capability row starts. PF-5tv and PF-21s part 4 are held until both waits fall.

### Rev 17.4 (13:05 IST 17 Nov): current Lead is Lead 77; P-683
* The current Lead is **Lead 77** (`local_baa78a6d-3861-4074-bd82-955fc67e247e`).
* **P-683 (founder, via Lead 77):** a lane gets the reviewer's Approve on the branch first, then opens the PR as non-draft (POST pulls, `draft: false`), so no draft toggle is ever needed. Passed on through the briefs not yet started: PF-4dn, PF-5tv and QA-498 now carry it in place of "keep it a draft". PRs already open as drafts are marked ready once, after their Approve, as before. Every new brief and every start: line carries P-683.
* The open-PR list (P-660) still goes to Lead 77 at 19:30 IST.

### Rev 17.5 (13:07 IST 17 Nov): drafts already open are never toggled by us
* **Lead 77's correction to rev 17.4:** no session or lane marks an open draft ready. The ready toggle is the GraphQL mutation the T7 deny line blocks, and nobody routes around it (P-387). Each such draft goes in the 19:30 list with its Approve sha, and the founder presses Ready unless he allows the mutation himself. This replaces "marked ready once, after their Approve" in rev 17.4.
* Open PF/FO drafts now: **#2062** (FO-9a part 1, head 3f7113b6), told on the PR not to toggle. #2026 and #1994 are records PRs.

### Rev 17.6 (13:35 IST 17 Nov): P-685, the Lead marks drafts ready
* **P-685 (founder, via Lead 77):** the current Lead marks an old draft ready with `tools/pr-ready.sh`, only when the PR has a `Reviewer: Approve <head sha>` line. Drafts are never sent to the founder. Build Lead A sends each draft and its Approve sha to the current Lead, who marks it within 30 minutes. This replaces the "founder presses Ready" line in rev 17.5. Lanes still never toggle themselves.
* **#2062** is already ready (head 3f7113b6, Approve 3f7113b6 at 06:29 UTC), so it has nothing to send. No PF/FO draft is open now.

### Rev 17.7 (13:40 IST 17 Nov): Lead 77's 13:3x sweep of my lanes
* **PF-21i:** yes to pushing `claude/runtime-pf0bp`; open it non-draft only after the reviewer's Approve (P-683). Posted on #2012 (comment 6942...); the lane's claude.ai prompt box could not be reached, see below.
* **PF-6m2 #2045** (queued, head ec1c08f1): four rulings posted (comment 6942420704). Q1 accept the one added audit action. Q2 keep the touch-list slips. Q3 keep `system:signup` now; the rename to `system:sign-up` is a **follow-up row after the move**. Q4 keep the server's invite-time rule; the Owner-into-Owner gap is its own row. **m5/F5** (an invitation still holds a seat after its sender is deactivated or demoted) is a **follow-up row** in `identity/service.ts`, shaped after the move. No push.
* **FO-2b** (no PR): **parked**, because it is blocked on FO-2 Engage, which isn't built. Nothing posted on #1843. It goes in tonight's list as parked.
* **#1961 PF-19p** (head bc10b8c2): shard 6 failed only on `check_css1_index` CS-S1 DW4, the check fault #2077 fixed (merged 07:57 UTC). Re-ran only the failed jobs of run 43999867612; the shard re-run tests on today's main, so it carries the fix.
* **Prompt boxes not reachable:** the built-in browser's claude.ai is signed out, and Build Lead A does not sign in for the founder. Answers are on the PRs instead. Idle cloud lanes need the founder's prompt-box paste or the Lead's own route.

### Rev 17.8 (13:41 IST 17 Nov): lane nudges go through Lead 77
* Lead 77 nudged PF-21i and PF-6m2 in their claude.ai prompt boxes at 14:1x IST, and both show as sent. Lead 77's claude.ai is signed in, so from now on Build Lead A sends every lane that needs a nudge to the current Lead.

### Rev 17.9 (15:07 IST 17 Nov): #1991 FO-7a2 out of the queue
* Build Lead C: #1991 broke batches #2082 to #2084 on shard 4. `check_fo7a2_ledger_rules.ts` DW7 now also sees the `case_party_index_*` functions that CS-S1 (#2035) added. Steps from Lead 78 are on the PR (comment 6944267988): merge main, narrow DW7 to #1991's own migration, keep the planted fail, get a diff-only re-review, then post the new head with its Approve sha. I asked Lead 78 to nudge the lane (cloud session 018BSQJpjUJUBm8pcjZFkpRp, head 8b5dffe0).

### Rev 17.10 (17:06 IST 17 Nov): #2045 merged; #1961 and #2021 dequeued
* **#2045 PF-6m2 merged** at 16:46 IST. Mergify then dequeued #1961 (PF-19p, head bc10b8c2, dirty) and #2021 (FO-9b part 0, head bdb84846, which GitHub shows as clean) for conflicts with main. Merge-main steps posted (6946909801, 6946910495), and Lead 78 is asked to nudge both lanes. Lead 78 re-reads #1961's migration if its path moved.
* **#2009 PF-18a:** Lead 78's read is on 95bd174 (a pure migration rename); it is labelled when ci is green. Once it merges, PF-18b (#2064) takes real foreign keys (the PF-17 condition).
* Follow-up rows waiting for after the move (from #2045): the actor word `system:sign-up`, and m5/F5 (an invitation still holds a seat after its sender is deactivated).

### Rev 17.11 (17:19 IST 17 Nov): stamp clashes
* **#1961 PF-19p:** Approve eeb36706 was posted, but its stamp 20261117120000 clashes with #2009 (pf18a_offices, renamed first), so Lead 78 has not labelled it. Rename to **20261117121500_pf19p_platform_account_mail**, then a diff-only Approve (6947176724).
* **#2012 PF-21i** and #2003 AUD-1a share 20261116150000. At its next merge of main, #2012 becomes **20261117123000_pf21i_complaint_request_key** (6947177190).
* Open-PR stamps per Lead 78: 030000 #2064, 054600 #2000, 060000 #2011, 120000 #2009, 121500 #1961 (planned), 123000 #2012 (planned). Older stamps are renamed when their PR merges main.

### Rev 17.12 (18:38 IST 17 Nov): B1 freeze (P-692); open-PR list sent to Lead 79
* **P-692 B1 freeze** (Lead 79): lanes push no commits, open no PRs and run no re-runs until the Lead says the move is verified. Notice posted on #2012, #1991, #2021, #2064, #1961 and #1959.
* **List sent at 18:38 IST:**
  * **A. Queued, merge tonight if the queue runs:** #1918 9eb809bdb, #1956 4b49c919f, #2052 b4643db04, #2062 3f7113b6b, #2087 b1778e367, #1991 8b5dffe06 (its head to be checked against adcf9c105).
  * **B. Labelled, not queued:** #2009 95bd1747c (ci queued), #2001 ba2ac0134 (needs a requeue), #1959 d3a8a74d3 (unstable, waits), #1961 80ac0e72d (no ci on the new head, waits).
  * **C. Approve, Lead read and green, no label:** #2064 749708beb, #2038 a8e709ecb, #2029 bfa5e31f7, #2014 f5cbdbf87, #2011 7a0335037.
  * **D. Wait for the move:** #2012 c275837d0 (needs the P-423 read and the stamp rename), #2021 63c1b2409 (ci queued, needs the shared-contract read).
  * **No PR:** FO-2b parked. PF-5tv, PF-21s part 4, PF-4dn and QA-498 held by P-663. After the move, the PF-6m2 follow-ups.
* Asked Lead 79 whether the freeze covers records pushes to lead-b-front-office. Until the answer, records are committed locally only.

### Rev 17.13 (18:39 IST 17 Nov): Lead 79 on the list
* Records pushes to lead-b-front-office continue (no PR on that branch, so no CI; P-557).
* Section C (#2064, #2038, #2029, #2014, #2011) gets no labels tonight. Lead 79 labels them after the move is verified, so the drain stays short.
* Lead 79 checks #2001's missed queue and #1991's head. Section D waits for the move.

### Rev 17.14 (18:40 IST 17 Nov): #1956 merged
* **#1956 PF-19b part 2 merged** at 18:39 IST. PF-19e still waits on #1961 and #2029, and nothing starts under P-663 or the B1 freeze, so there is nothing to send now.
* **#1918 FO-3a part 1a merged** at 18:40 IST. It unblocks FO-3a part 1b and part 2a, which start only after the move is verified and P-663 clears. Lead 79 told.

### Rev 17.15 (19:29 IST 17 Nov): PF-15 claim branch
* On #2103 (FO-3a 1b-i), the lane claimed PF-15 part 1 (`claim/PF-15-part-1` at main, no work), then stopped because its context was full. Its delete was refused. Ruling: leave the branch, never delete it through another session (P-387), and the Lead decides after the move. PF-15 part 1 is held (B1 freeze, P-663). The lane's notes went into `lead-b-briefs/PF-15.md`.
* Lead 79 agreed: `claim/PF-15-part-1` stays. It goes on the clean-up list for after the move, where the founder approves branch removals.

### Rev 17.16 (19:50 IST 17 Nov): front-office card over 40 on main; #2109 opened in the freeze
* **Main breaks `module-cards`:** `api/src/front-office/MODULE.md` is 42 lines after #1918 and #2062 merged (f38c6b09b), so every PR tested on main is red. Fix proposed to Lead 79 (P-214): fold the three "Booking settings (FO-3a part 1a)" bullets into one bullet, 40 lines, no fact cut. Lead 79 decides when it lands and who makes it.
* **#2109 PF-4dn** (head 1bfea5051) was opened at 19:45 IST, after the B1 freeze (P-692), while P-663 still held the row. Lane told to stop with the PR kept open (comment posted), and Lead 79 told.
* Lead 79: the module-cards check skips merge-queue batches, so tonight's drain is not blocked. Lead 79 makes the card fold as the first PR after the move (P-214). #2109 stays open, no pushes, and Lead 79 logs the breach.

### Rev 17.17 (12:41 IST 18 Nov): org move verified, freeze lifted
* **Lead 79:** the repository is now `expat-ready/xpatready`, and the B1 freeze is lifted from 13:0x IST. P-663 still holds new capability rows. #2109 waits for Lead 79's read.
* **Merged in the drain:** #1991 FO-7a2 (at 8b5dffe06), #2021 FO-9b part 0, #2052 PF-4c part 1, #2062 FO-9a part 1, #2087 PF-0bp. Earlier: #1956, #1918.
* **Ready for Lead 79's label:** #2014 PF-8r (f5cbdbf87, everything on the head). #2011 FO-13i (Approve 935afda4b, ci green) still needs Lead 79's P-423 re-read of its third main merge.
* **Conflicting with main, merge-main steps posted:** #2064, #2038, #2029, #2009, #2001, #1961, #1959, and #2012 (stamp to 20261117123000_pf21i_complaint_request_key). Lead 79 asked to nudge the cloud lanes.
* **Origin URL:** `.git/config` is shared and outside this session's sandbox, so it still names the old org (which redirects). Records push to `https://github.com/expat-ready/xpatready.git` by name.
* **After P-663 clears:** FO-3a part 1b and part 2a (#1918 merged); PF-15 part 1 (its gates are met, and its claim branch is on the clean-up list); the PF-6m2 follow-ups.
* Lead 79 labelled #2014 and #2011 (re-read posted on #2011), and nudged all 8 lanes to merge main. The card fix is #2114 (40 lines), merged by hand on green ci.
* Records push through `origin`: the old URL redirects to the new org. Pushing by the new URL fails the push guard, which then has no remote refs and scans all history.

### Rev 17.18 (16:5x IST 18 Nov)
* **#2011 FO-13i** (branch `claude/compassionate-einstein-jl1bgi`, head 935afda4b, labelled by Lead 79): batch #2115 (#2003 + #2014 + #2011) failed on shard 3 in `check_fo13i_identity.ts`, because #2003 (AUD-1a) refuses an audit actor with no type, and FO-13i's test writes the actor `test`. Lead 80's comment 6977133616 gives the lane its steps: once #2003 is on main, merge main (P-270), give the test's actor a type from AUD-1a's list, run the suite, get an Approve on the new head, then label. Lead B confirmed to Lead 80 that this is its row. When the new Approve is posted, Lead B sends the sha to Lead 80. #2003 is still open (16:53 IST).

### Rev 17.19 (19:xx IST 18 Nov): Wave 1 start sheets (Lead 80, P-697, P-698)
* **Three start sheets:** `lead-b-briefs/wave1-sales.md` (FO-2 parts 3-5, FO-4 parts 2a, 2b and 3, FO-4b, J-27), `wave1-registers.md` (PF-21s part 4, J-109) and `wave1-terms.md` (PF-5t part 2, PF-5v part 2). Each has its Done when, a duplicate check and a touch list.
* **Corrections to the ask:**
  * PF-21s part 4 needs no new concept (#1821 covers it);
  * PF-5t part 2 waits only on part 1 and PF-6 part 1, both on `main`;
  * PF-5v part 2 waits on PF-19p (#1961) and PF-19e, not on PF-5 part 2;
  * J-109 W2 is the 2-business-day acknowledge-by date, not 30 days (rev 16.28);
  * J-109 starts after PF-21i (#2012).
* **Sales:** FO-2b's `pipelines/:type/board` is reused for the Individual board, and FO-6's `prospect.won` is the only signature Won path.
* **#2102 FO-3a question** (comment 6980059020): part 2b and part 1b-ii cannot start while #2102 and #2103 are open. The recommendation is accepted, and the builder holds. Whether that builder takes FO-2 part 3 is Lead 80's call (P-663).
* **#2127 PF-6 part 2b** (comment 6980434160): the cloud network refuses canada.ca and the law-society sites. Ruled: the 13 law societies stay **Sample** in the picker (AGENTS rule 4); the 2FA panel has no link while the API answers `{method}` only; the brief is `PF-6p2.md`. **Follow-up row (records, on the Mac):** cite each provincial and territorial law society (site, date read) from IRCC's `choose/authorized.html#law-societies` and the societies' own sites into `samples/representative-bodies-ca.json`, then drop the "(Sample)" marks. It is Lead B's to do after #2127 merges.
* **#2130 PF-15 part 1a** (comment 6980543113): the builder rightly undid its BACKLOG edit. Its "Part 2 also" line (`checkDowngrade` feature conflicts wait on PF-17's plan feature list) is now in `lead-b-briefs/PF-15.md`. Lead 80 was asked to add the same line to BACKLOG's PF-15 row. Its red module-cards check is main's 42-line front-office card (P-214, the Lead's fix).

### Rev 17.20 (19:xx IST 18 Nov): two rows Lead 80 assigned (Build Lead C's asks)
* **PF-19b part 3** (`lead-b-briefs/PF-19b3.md`): SES Delivery notices → `DELIVERED` (forward-only states), Delivery test events from the local adapter on the demo copy, a staff read `GET /api/platform/messages?subjectKind=&subjectId=` (no body, masked address, the subject's own show key), and a `MessagesPanel` mounted on the lead page. No schema change. Starts after PF-19p (#1961). It unblocks J-48 W5.
* **FO-1p FoPersonPort** (`lead-b-briefs/FO-1p.md`): a port-only row. `ensureForClient` and `ensureCompanyForClient` run in the caller's transaction. Rulings: a COMPANY client gets an `fo_company`; there is no auto-link by email (BR-2, FO-9a); a `prospectId` returns that prospect's own party; the actor is typed. It starts now and goes before CS-K1 part 2.
* Lead 80 added the PF-15 part 2 line to BACKLOG (d5ae462d5) and new rows PF-19r and CS-C1s. #2114 is in batch #2122.

### Rev 17.21 (19:xx IST 18 Nov): two of qa-2's #2136 questions (Lead 80)
* **R1.33, phones:** Lead 80's ruling is right and matches the briefs. An enquiry or intake keeps an unreadable phone as typed, with `phone_readable` false and a "Fix number" flag (AG-2-84 rule 5: never drop an enquiry over a phone format; the `fo_person` schema says the same). Only a **staff edit field** refuses an unreadable number (422, with the field's words). That edit field arrives with the person edit route (FO-9a's later parts, the Duplicates lane), not built today. No Lead B brief says otherwise. FO-9a.md only adds the E.164 column.
* **R1.10, 400 vs 422:** ruled in `lead-b-briefs/PF-28.md`: 422 with `fields` for field errors (including unknown fields under strictObject); 400 only for an unparseable body (PF-0bp) or a bad webhook signature; 413 too large; 404 for a non-uuid or unseen id; 409 for state. BACKLOG PF-28's "400" and its sweep set are wrong, and the tech lead changes them. PF-28's sweep PR moves existing 400 field errors to 422. `wave1-sales.md` FO-2p3 DW3 is corrected.

## Rev 17.22 (18 Nov 21:38 IST)
* **#2130 PF-15 part 1a:** after #2009 (PF-18a) merged, the PR conflicted in `platform.prisma` and the platform module card. My ruling (comment 6984138054): merge main, keep both sides, keep the stamp `20261118100000` (later than main's newest `20261117124500`, distinct from the open PRs), re-run the suites, then a fresh Approve and the label.

## Rev 17.23 (18 Nov 21:51 IST)
* **#2130 PF-15 part 1a:** new Approve on 3e02affa2 (21:48 IST), which merges main cee72284f. Lead 81 labelled it, and its P-423 migration read is OK. Its two minors go to part 2 in `PF-15.md`: a cross-firm test of the definer function, and the case of several live subscriptions.
* queue-gate now runs on the Mac (#2145, 21:50 IST), so queue-fresh follows green CI within seconds.

## Rev 17.24 (18 Nov 22:10 IST)
* **Lane sweep for Lead 81:** PF-15 part 1 (now #2130), FO-2 part 3 (#2140), PF-5t part 2 (#2135) and PF-21s part 4 (#2134) are done and queued. PF-5 part 2 (#1959) needed the Lead's P-423 read. PF-5s part 1 stays parked behind PF-5v part 2, PF-19e and #1961.
* **#1959 PF-5 part 2:** Lead 81's P-423 read is OK, and it is labelled on b8af607b8. Its two minors are in `PF-5.md`: the Stripe call inside the lock, and P-701's GST/HST-only tax registrations for live Stripe.
* P-699: the Lead does the browser steps. Any "continue" to a cloud lane goes to the current Lead to type.

## Rev 17.25 (18 Nov 22:26 IST)
* **#2125 CS-W1 (Build Lead C's row):** I gave the owner's OK to its one line on `platform_firm` (comment 6985430234): `GRANT SELECT (id, key)` plus the role-only policy `case_lookup_read` for `xr_case_lookup` (NOLOGIN, NOBYPASSRLS), which owns only the definer lookup. I also checked the stamp `20261118090000` (P-600). Notes: keep the role's only member the migration user, and never widen the column grant.

## Rev 17.26 (18 Nov 22:53 IST)
* **Overlapped starts (Lead 81, founder's "start doing it"):** `lead-b-briefs/overlap-starts-2026-11-18.md` holds six start prompts for Lead 81 to paste (P-699): PF-15 part 2 on #2130, FO-3st2 on #2103, PF-19e on #1961, PF-19b part 3 on #1961, J-109 on #2134 plus #2012, and PF-6b from main.
* Correction: PF-5v part 2 waits on PF-19e and #1961, not on #2135, so PF-19e is the row that moves it. PF-6's next part is PF-6b (no chain). J-5 stays blocked on PF-4b.

## Rev 17.27 (18 Nov 23:04 IST)
* Lead 81 requested five fresh cloud sessions from `overlap-starts-2026-11-18.md`: PF-15 part 2, FO-3st2, PF-19e, PF-19b part 3 and J-109. PF-6b waits as a card for the founder, because the app caps starts per message. Their Approve shas go to Lead 81 for the P-423 reads and labels.

## Rev 17.28 (18 Nov 23:29 IST)
* **Overlap lanes, read by Lead 82 on claude.ai/code:** "PF-15 part 2 · plan limits (overlap on #2130)", "PF-19e · messages (overlap on #1961)", "PF-19b part 3 · sending (overlap on #1961)" and "J-109 · complaints journey (overlap on #2134)". FO-3st2 has no session yet; Lead 82 starts it at the founder's next typed turn. PF-6b is still a founder card.
* "PF-5s part 1 · pricing and sign-up screens" is also listed. That row is parked behind PF-5v part 2 (verification email), which waits on PF-19e and #1961. I asked Lead 82 to confirm the lane is idle, not building.
* **Correction (Lead 82):** FO-3st2 does have a session: "FO-3st2 · booking settings (overlap on #2103)" (cloud). All five overlap lanes are running. PF-6b is still a founder card. PF-5s part 1 is confirmed parked: it started nothing and is waiting for PF-5v part 2 and PF-19p.

## Rev 17.29 (18 Nov 23:38 IST)
* **#2064 PF-18b merged at 23:37 IST** (2c9231ab4). Its follow-up brief is `lead-b-briefs/PF-18bk.md`: real foreign keys from the support tickets to firm and staff (`(firm_id, raised_by)` → `platform_staff(firm_id, id)`) and from the messages to firm. All are RESTRICT. The message author stays guarded by the trigger (text, no key), and the triggers stay. It starts from main now and is about 150 lines. It takes these keys out of PF-17.
* **PF-18s:** `lead-b-briefs/PF-18s.md` now holds its owed lines: the office placement route (rev 16.78) and a double-send guard on the Help & support reply. The guard comes from qa's pass of #2064: the reply route has no idempotency key, so the screen must guard as #1998's M1 does. It is proved with a pass test and a fail test.

## Rev 17.30 (18 Nov 23:52 IST)
* **Queue blocker (Lead 82):** six of my PRs went dirty against main and were dropped from the merge queue: #2130, #2128, #1959, #2102, #2011, and #2103 (not labelled yet). Each conflicts only in its module card. I posted a merge-main step on each (comments 6987590851 to 6987593112).
* **P-600 re-stamps:** PF-18b's `20261118073000` is now main's newest migration, so #2102's `20261117140000` and #2103's `20261117130000` are earlier than it. They are renamed to **`20261118150000_fo3a2_consult_record`** and **`20261118143000_fo3a_hour_sets`**. This supersedes my 6982230626 and 6982231047 "keep stamp" steps.
* Cloud session ids went to Lead 82 so it can type "continue" (P-699).

## Rev 17.31 (18 Nov 23:55 IST)
* **#2157 PF-19r part 1 (Build Lead C's row):** my answers to its five questions (comment 6987664663).
  * The binding to `MESSAGES_MAIL` stays now. Rev 16.64 is amended, not reversed: sealing stays in PF-19e, whose lane is running on #1961.
  * An unsealed token in the demo outbox file is OK on demo and test copies only. PF-19e must land before any copy with real people.
  * The reminder's last resort goes out as TRANSACTIONAL with no person.
  * The held-invitation case needs no follow-up, because PF-19e's cap exemption ends it.
  * A reset to a suppressed address stays a 409, with an "update the address first" sentence.
  * The PR also needs to merge main in.
* `PF-19e.md` is amended: it seals all of PF-19r's transactional senders, updates PF-19r's DW5, and holds the real-people gate.
* Owed by the current Lead: the PF-19e BACKLOG row and the DECISIONS line (outbox file holds links and codes until PF-19e).

## Rev 17.32 (19 Nov 00:08 IST): P-707 sort (finish to Proven first; park the rest, nothing lost)
* **KEEP:**
  * PF-15 part 2, FO-3st2, J-109.
  * **PF-19e**: PF-5v part 2 needs it, and it is PF-19r's real-people gate.
  * **PF-19b part 3**: J-48 needs it.
  * The PRs being merged: #2130, #2128, #1959, #2102, #2103, #2140, #2127, and #2011 (park after it merges).
* **Revive:** #1961 PF-19p and #2012 PF-21i, both bases for Wave 1. They are re-stamped for P-600: #1961 → `20261118160000_pf19p_platform_account_mail`, #2012 → `20261118163000_pf21i_complaint_request_key` (comments 6987979738 and 6987980226).
* **PARK:** PF-18bk, PF-5s part 1, #2029 PF-12b part 1, #2001 PF-24w, #2038 FO-6 part 1. Their PRs stay open, and the briefs stay as they are.
* Merged since rev 17.31: #2134 PF-21s part 4 (00:05) and #2135 PF-5t part 2 (00:06).
* **Lead 82 agreed the sort.** It typed "continue" into #1961 and #2012, and the re-stamps are clear of every open PR. PF-18bk already had its PR open with the reviewer running, so it finishes to its Approve, where its brief ends, and then parks. #2029, #2001 and #2038 stay open as they are.

## Rev 17.33 (19 Nov 00:22 IST)
* **All of tonight's swept PRs are labelled again** after new Approves on merged-main heads:
  * #2130 ee2755ff8, #2128 501f3420e, #1959 e8f8d069b and #2011 bbdc669e7;
  * #2102 0258702bd (`20261118150000`) and #2103 3e0bc800d (`20261118143000`);
  * #1961 506e69c16 (`20261118160000`) and #2012 a7db51a90 (`20261118163000`).
* Lead 82's P-423 reads passed on #2011, #2102, #2103, #1961 and #2012.
* The overlap lanes on #1961 and #2103 branched from older heads. Under the overlap rule they merge the new tips in before they open their PRs.

## Rev 17.34 (19 Nov 02:17 IST)
* **#2029 PF-12b part 1 (Wave 0, restarted at Lead 83's request):** my step (comment 6990043408) was merge main once and fix the platform card. The new Approve is on 165a5d2e3, and it went to Lead 83 for the P-423 read and label.
* **PF-19r part 2 (#2157 comment 6991082173), my ruling 6991168647:**
  * **No new bypass use.** The case doors use #2125's `firm_id` or `case_lookup.case_firm_id_of_key`, then `enterFirm`. Part 2 builds on #2125.
  * The seed's option 1 (`PLATFORM_SAMPLE_SEED=on` on demo and test copies) is my recommendation as owner. It amends P-571 (2), so Lead 83 decides it as a DECISIONS line. It needs a scan for suites that expect an empty table and a production-mode test.
* **P-710 (Lead 83) amends P-571 (2):** the Sample platform firms are seeded ON on demo and test copies, and production never seeds. My two conditions are in it (the empty-table scan and a production-mode test). P-571 (2)'s test that production never runs the seed stays. The ruling is posted on #2157, so PF-19r part 2 can build fully on #2125's tip.

## Rev 17.35 (19 Nov 03:28 IST)
* **Merged:** #2128 PF-F4 (02:49), #2125 CS-W1 (02:49) and #2011 FO-13i (02:55; its lane parks, P-707). #2029 PF-12b part 1 was labelled by Lead 84 at 82c1aae55.
* **Re-merged after #2011 and #2125, then lost the label to the label guard:**
  * #2102 a0f253814, #2103 0f634c6cc and #1961 518f7b3f0 are only main merges, so they just need a relabel;
  * #2130 58e2fcb6f also re-stamps to `20261118213000_pf15_plan_limits` and grants `platform_entitlement_limit` to `xr_staff_bypass`. Lead B is OK with that as the walls owner. It needs Lead 84's P-423 read.
* PF-19r part 2 can now build from main, since #2125 is merged.

## Rev 17.36 (19 Nov 04:16 IST)
* **Merged:** #2127 PF-6 part 2b (04:00), #2140 FO-2 part 3 (04:15) and #2157 PF-19r part 1 (04:15). After #2157, PF-19e merges main in and seals PF-19r's senders (the PF-19e.md amendment).
* **Sales chain:** FO-2 part 4 went to the warm FO-2 part 3 cloud lane (Lead 84, P-341). FO-4 part 2a needs a new session at the founder's next typed turn; it is in STATE.
* **All four relabelled by Lead 84:** #2102, #2103, #1961 and #2130. The `xr_staff_bypass` grant on #2130 is accepted.

## Rev 17.37 (19 Nov 04:29 IST)
* **After the 04:00-04:15 merges** (main's newest migration is now `20261118200100_fo7ts`), I posted steps (comments 6994110431 to 6994112231):
  * **P-600 re-stamps:** #2103 → `20261118220000_fo3a_hour_sets`; #2102 → `20261118223000_fo3a2_consult_record` (its 150000 also clashed with open #2129); #1961 → `20261118230000_pf19p_platform_account_mail`; #2012 → `20261118233000_pf21i_complaint_request_key`. I checked all open migration PRs: none uses these.
  * #1961 and #2012 also conflict with #2157 PF-19r part 1 (`send/mail.ts`, `messages.ts`, `complaints.ts`), so each keeps both sides.
  * #2029 and #1959 conflict only in their module card. #1959's red ci is `kind` failing on the merge conflict.
* **#2130:** be291544f has an Approve after a hand-merged module card. It goes to Lead 84 to relabel.
* **Relabelled by Lead 84:** #2130 be291544f, #2029 268b0867d (sent), #1959 c2d231333, #2012 208c1eb59 (a2b89df34's prisma change is only the doc comment naming the stamp) and #2103 c1607c3a6.
* **Correction (Lead 84):** #2103's c1607c3a6 also carries the held fix: `BookingTypesService.get` returns each host's set, read under firmScope. The head's Approve covers it.
* Waiting: #2102 and #1961.
* **Stamp clash, my error:** `20261118230000` (given to #1961) was already held by #2167 CS-K1 part 1. My check covered only PRs titled "migration". **#1961 now takes `20261119003000_pf19p_platform_account_mail`** (comment 6995770907), checked against every open PR's migration folders. Lesson: check stamps across **all** open PRs' files, never by title.
* Not mine to rule: #2000 and #2158 both hold `20261119000000`; reported to Lead 84. #2102 is relabelled at 55da436f3.

## Rev 17.38 (19 Nov 06:38 IST)
* **#1961 PF-19p:** new Approve on 88d03c665, with the stamp `20261119003000`. All six PRs from the 04:4x round now have Approves, and Lead 84 relabelled #2102 (55da436f3), #2103, #2012, #1959 and #2029.
* **J-109:** branch `claude/vibrant-meitner-3t1yfe` has Approve 62b4bcd95 (head 087e51be7). It is stale against #2012 and main (conflicts in `complaints.ts` and `MODULE.md`). I sent Lead 84 a line to type: merge both now and re-review, then open the PR once #2012 merges.
* **P-713 (build in parallel; warm lanes take one row each):**
  * #2103's lane → **FO-3st3** (overlap on #2103);
  * #2011's lane → **FO-4 part 2a** (from main; R1.30).
  * Not assigned: #2102's lane (FO-3a 2b waits on FO-3vr); PF-19r part 2 (Build Lead C's).
  * P-712: no hand edits to shared module-card lines in new work.
* Flag to Lead 84: FO-2 part 4 has four open PRs on the same sales files (#2181 queued, #2185, #2187, #2188).

## Rev 17.39 (19 Nov 06:45 IST)
* **FO-2 part 3b** (`lead-b-briefs/FO-2p3b.md`), shaped on Lead 84's QA-511 ruling (#2189): the real `ArrivalPort` adapter over `sales/arrival.ts`'s `arrive()` (door BOOKING; no consent → no consent row), bound in `booking/runtime-ports.ts` in place of `fakeArrival()`, with a contract test on the fake and the adapter. No schema change, about 350 lines. R1.28 stays Partial until it merges.
* Noted from Lead 84: #2185, #2187 and #2188 are Mergify's batch PRs, not duplicates. FO-4 part 2a is on #2011's lane and FO-3st3 on #2103's lane.

## Rev 17.40 (19 Nov 07:15 IST): P-716 (pipeline frozen until Proven 30; lanes work only the last parts of nearly-proven items)
* **Keep:** #1959 (R1.19/R1.100), #2029 (R1.4), #2012 and J-109 (R1.109), FO-2 part 3b (R1.28).
* **Proposed to Lead 85:** #2011's lane pushes FO-4 part 2a with a resume note and takes FO-2 part 3b now, rather than waiting for the #2181 fix.
* **R1.6:** the last parts are PF-6b (never started), then J-6. Proposed: the #2029 lane takes PF-6b after #2029 merges. I asked Lead 85 who owns `claude/screens-j6p2`.
* **Park:** FO-3st3, FO-3st2, PF-15 part 2 and PF-19b part 3. PF-19e parks unless R1.19 needs PF-5v part 2 (Lead 85 decides). The labelled queue PRs (#2130, #2102, #2103, #1961) merge without lane work.
* **Lead 85's rule:** keep a lane if its R1 item is within 3 parts of Proven and waits on nothing outside. My sort, from the end-to-end review rows:
  * **KEEP:** FO-2 part 3b (R1.28, and R1.37, since J-37 waits on the real arrival); FO-3st2 (R1.41: #2103 queued, FO-3st2, J-41); PF-19b part 3 (R1.48: it plus J-48); PF-19e (R1.100: it plus PF-5v part 2, with PF-5t part 2 merged). PF-19e is kept for R1.100, not R1.19, which needs J-19 and the founder's Stripe account. Flag: R1.100's real terms text (C24/G9) is an outside wait if Proven needs it.
  * **PARK:** FO-3st3 (R1.42 is more than 3 parts: FO-3a 2b waits on FO-3vr, then FO-3st1, FO-3st3, J-42) and PF-15 part 2 (R1.20 waits on the founder's D4 rule).
  * **Redirect:** #2103's lane → **J-37** (R1.37). Its parts are on main except FO-2 part 3b's arrival swap, which it merges in when that exists.
  * PF-6b needs no founder decision and goes to the #2029 lane after #2029 merges. #2172 is J-6 part 2.
* Lead 85 redirected both cloud lanes at 07:2x IST: #2011's lane → FO-2 part 3b, #2103's lane → J-37. The current Lead is now **Lead 86** (`local_bb67266d-be45-4ab8-9ba8-b4f3b4596ebe`).

## Rev 17.41 (19 Nov 08:15 IST): P-719 (finish by capability; a lane owns one item's whole chain; about 4 items for me)
* **In flight:**
  1. **R1.109**: #2012, then J-109 (the J-109 lane).
  2. **R1.28 + R1.37**: FO-2 part 3b, then J-37, both on **#2011's lane**. #2103's lane hands J-37 over with a resume note and parks.
  3. **R1.41**: #2103, FO-3st2, then J-41 (the FO-3st2 lane).
  4. **R1.48**: PF-19b part 3, then J-48. J-48 is Build Lead C's, and who owns the chain is asked of Lead 86.
* **Queued, then qa:** R1.4 (#2029) and R1.19's billing part (#1959).
* **Parked:** the PF-19e lane (R1.100: PF-19e, then PF-5v part 2). I asked whether Proven accepts a Sample terms text (C24/G9).
* **Next when one reaches Proven:** R1.6 (PF-6b, then J-6) on the #2029 lane, then R1.100.
* **Lead 86's P-719 rulings (08:16 IST):**
  * My 4 items are accepted.
  * R1.48: the PF-19b3 lane takes J-48 after part 3 (Build Lead C hands over `J-48.md`); `PF-19b3.md` is amended.
  * R1.100 stays parked. When it starts, Proven may use a **Sample** terms text, labelled Sample, because the item proves the mechanism (accept, version, ask again). The real text is a separate launch item (C24/G9). *Unconfirmed: no counsel.*
  * **R1.6 has been Proven since 08:06 IST**, so PF-6b is not needed for it, and R1.100 is my next item once one of the four is Proven.
* **Build Lead C asked about PF-11c (for its R1.105):** it will not land within a day.
  * PF-11 (the full data download) is not built, and PF-11c's closure requires that export.
  * PF-11c is 2 PRs with a breaker. With PF-11 that is 3 parts after #1959.
  * ETA is 2-3 days once a lane frees. I suggested Lead 86 rank R1.105 against R1.100 for my first free lane.
* **Lead 86 typed both lanes:** #2103's lane pushes J-37 with a resume note and stops; #2011's lane owns J-37 after part 3b, starting from that branch. **Ranking for my first freed lane: R1.100, then R1.105.** R1.105 (PF-11, then PF-11c a and b) is out of flight until then.

## Rev 17.42 (19 Nov 09:25 IST)
* **#2130 PF-15 part 1a merged at 09:04 IST**; qa walks it. The current Lead is now **Lead 87** (`local_019a74ed-6dba-4a9c-9188-04a3e34bda5a`).
* **Main's platform card is over its limit:** `api/src/platform/MODULE.md` has been 41 lines (limit 40) since #2124 (AUD-1b), so `module-cards` is red for every PR that touches api/src (#2181 asked, comment 6999149071).
  * My ruling (6999190860): join the "Do not." lines 37-38 into one line, which gives 40 lines with no fact dropped.
  * It went to Lead 87 as a P-214 CI fix, because I don't open PRs. P-712's card fix may cover it.

## Rev 17.43 (19 Nov 10:27 IST): P-721 proof sprint (5 items until 4 are Proven)
* **My items:**
  * **R1.19** (#1959): it waits for #2195 to fold the platform card, then merges main once (fragment `MODULE.rows/PF-5p2.md`, no card line). This is top priority.
  * **R1.4** (#2029): Approve 5500148d3. The walls owner's check is OK (15 uses, each with an `audit` field). It goes to Lead 87 for the P-423 read.
  * **R1.109** (#2012): Approve 2973a8f9b, then J-109.
  * **R1.28 + R1.37** (#2196 queued, FO-2 part 3b): then J-37 on #2011's lane.
* **Paused:** R1.41 (FO-3st2 starts no new part; #2103 still merges). R1.48 (PF-19b part 3, then J-48) continues.
* **Re-merges sent:** #2012 2973a8f9b and #1961 c27308ea1, both main-merge-only.

## Rev 17.44 (19 Nov 10:42 IST): P-721 to P-724 binding (RULES.md as of P-724)
* **The rules:** protect the merge path (re-merge within 30 min; split a failed batch at once). Proof per item; qa never blocks. **Drain to ~13:30 IST**: lanes only get approved PRs merged, nothing new starts. After it, journeys in dependency order, two in parallel, about 6 items per journey; my journey is likely **B, firm set-up** (item list from Lead 87 by ~13:00).
* Posted word for word on #1959, #2196, #2102, #2103, #2029, #2012, #1961 and #2181 (comments 7000390059 to 7000392038). Lanes without a PR need Lead 87 to type it: J-109, FO-3st2, PF-19b part 3, PF-19e, #2011's (J-37) and the PF-15 part 2 and FO-3st3 parked lanes.
* **Under the drain:** J-37 and J-48 are new parts, so they wait until after ~13:30. J-109 already has its Approve and only opens its PR, so it counts as getting an approved PR merged.

## Rev 17.45 (19 Nov 10:49 IST)
* **The J2 lane plan** is in `lead-b-briefs/J2-lane-plan-2026-11-19.md`:
  1. R1.100 → R1.19 (PF-19e → PF-5v p2 → PF-5s p1 → J-19);
  2. R1.23 (PF-13 p1, p2);
  3. R1.92 (PF-18a p2, PF-18s);
  4. R1.20 (PF-15 p2, PF-4c p2, invite batch; waits on the founder's D4);
  5. R1.91 (PF-16; brief owed by me);
  6. a free slot.
* **Build Lead C:** R1.76's note routes are FO-2 part 4 (#2181, queued, red only on main's card until #2195). R1.72's FO-8 is BACKLOG's "case side, release Lead" and not built; its FO side (FO-1p) is merged.
* **PF-16 brief** (`lead-b-briefs/PF-16.md`): the BACKLOG row is the spec, split into 2 parts (part 1 plan changes and trial controls, part 2 billing emails through `MESSAGES_MAIL` as TRANSACTIONAL). It starts after #1959 merges; `checkDowngrade` for cases waits on PF-15 part 2.

## Rev 17.46 (19 Nov 10:52 IST)
* **The J2 plan is approved** (Lead 87). **P-727** answers D4: 1-50 rows, every valid row invited at once, each flagged row listed with its reason, nothing flagged sent.
  * P-727 is quoted in `PF-15.md` (part 2 also) and in `PF-4c.md`, now on this branch from main.
  * The `PF-4c.md` amendment adds a new **PF-4c part 1b, "send the good rows"**, because #2052 sends nothing while any row is flagged. Over-limit rows are flagged `OVER_SEAT_LIMIT` in row order.
  * R1.20's chain is now PF-15 p2 → PF-4c p1b → PF-4c p2 → the invite screen.
* **J-19's Stripe walk:** no Stripe test account or keys are configured anywhere I can see. #1959 runs on BillingPort's fake and recorded Stripe answers and reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from the environment, with no values committed. The founder creates the account (P-551).

## Rev 17.47 (19 Nov 11:02 IST)
* **Batch #2221 failed** on `check_pf19b_mail` (`page.consent` null). The cause is **#2196**: the real PrismaArrival returns the firm's real booking wording, where the fake gave a Sample one.
  * Ruling (7000698257): `seedFirmFrontOffice` creates the firm's Sample booking consent wording once when the firm has none, and never overwrites the firm's own. Then re-run on main + #2196 + #1961 and get a diff-only Approve.
  * #1961 is cleared (7000698553).
