# Tester's notes (facts only) · qa capabilities R1.19 and R1.59 · main fe388b643 (tree 2e59e250b) · 16 Nov 2026, 10:4x IST

Asked by Lead 64 (score now, or name the missing part). The checklist rows: 19 "A firm is created once, with plan, trial and owner" (PF-3 merged; PF-5); 59 "Money arithmetic" (FO-7a).

## R1.19 (Done when: self-serve sign-up makes exactly one firm with plan, trial end and one Owner; the same verified email or firm key again is refused in words; firm, subscription and invitation stored as entered, with audit lines)
* PF-5 part 1 (#1815, merged 07:39 IST 16 Nov) is "sign-up to trial" (`screens/PF-5/step0.md` line 31): terms tables, the pending sign-up store, BillingPort and its fake, `GET /api/public/plans`, `POST /api/public/signup`, `POST /api/public/signup/verify` → firm PROVISIONING + Owner → no-card trial (TRIAL), `firm.created`. Parts 2 (Stripe events, hold, billing routes) and 3 (clock, notices, gates, invited sign-up) are not on main.
* GitHub: `check_pf5_signup_billing.ts` 53 passed, 0 failed (ci 43801075002, job 133082253309). qa re-run 53/53 (`check_pf5_signup_billing-mine.txt`). In-process (FakeClock, local identity stand-in, fakeMail): no server, no browser.
* **qa's walk by API on an isolated copy (PLATFORM_IDENTITY=local), `r119-signup-walk-mine.txt`:**
  * `GET plans`, then `POST signup` with the form stamp and the 3 current terms → 202 "If this email can be used, we have sent a message to it…";
  * the pending sign-up is stored (email, firm, plan team, 3 terms, 1 day);
  * **the platform inbox for that address is empty**, no log line names the link, and no firm exists;
  * verify with a made-up token → 404 in words.
* Cause: `api/src/platform/firms/runtime-ports.ts` gives sign-up `mail: fakeMail()` (comment: "mail is PF-0p's fakeMail until PF-4b's sender"); PF-4b (#1744 line, `MAIL_PORT`) and PF-19b's `MESSAGES_MAIL` with `GET /api/demo/platform-inbox` are on main (module card). PF-5's PR body: "The verification code of the local stand-in is in memory only, so a person cannot finish sign-up in the demo until PF-5s or part 2."
* So no person can confirm a sign-up in the running app; the firm, its Owner and the next capability's first step (the Owner signs in, R1.5) are reached only inside the pack.

## R1.59 (Done when: integer cents with currency; tax rounded per line by one stated rule; mixed currencies refused; a pass and a fail test per rule)
* FO-7a (#1758, merged 15 Nov) is the client-money tables and database rules (no API, no screen; FO-7b's service is the next user).
* GitHub: `check_fo7a_money_schema.ts` 123 passed, 0 failed (ci 43801075002, job 133082253305). qa re-run 123/123 (`check_fo7a_money_schema-mine.txt`).
* Integer cents: `*_minor Int`; "10.5" refused. Currency on every amount (CAD, USD); a line in USD on a CAD invoice refused ("invoice's currency").
* **Tax:** `money_invoice_line_tax_check` (`prisma/migrations/20261115042334_fo7a_client_money_tables/migration.sql:583-584`): `abs(tax_minor - amount_minor * tax_rate_ppm / 1000000) <= 1`. It is a one-cent bound, not one rounding rule: on a 100-cent line at 13 % (exact 13), 12, 13 and 14 all pass. The pack's fail cases are 2,000,000,000 on 1 cent and 130.02 on 1,000.00 (2 cents off). The Quebec case (two taxes rounded apart: 0.17 + 0.33 = 0.50 against 0.4987) is why the bound is one cent. FO-7a's BACKLOG row names no rounding rule (no "round" in its Done when). No code on main computes a line's tax (no FO-7b service).
