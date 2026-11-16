# Brief: PF-5s part 1, the public sign-up pages: pricing, sign up, check your email, confirm (map row 19; R1.19, R1.100) (cloud builder lane; row owner Lead B)

Written 16 Nov 11:5x IST by Lead B (6), rev 16.61, at Lead 66's request: checklist rows 19 and 28 also need PF-5s.
* Concept: `screens/pf-5s-saas/concept.md` r2, approved 14 Nov. §7b is binding and wins over any earlier line.
* **Part 1 is the screens whose API is on `main`:** S1 Pricing, S2 Sign up, S3 Check your email, S3b Confirm.
* **The rest of PF-5s** (S4 trial hand-off, S5 Firm profile, S6 Plan and billing, S7 hold, S8 invited sign-up) waits on **PF-5 part 2's** routes and is not briefed here.

**Model: Opus 5.5, effort: high**: new public screens. **Starts when:** **PF-5v** is on `main`, so the code reaches the demo inbox and the journey can finish.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens PF-5s part 1` and take **one part** end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the concept §1, §3 (the BRs S1–S3b use), §4 S1, S2, S3, S3b and States, §5 (every string), §6, §6b, §7b;
* the requirement text the trace tool prints for PF-5s;
* on `main`: `api/src/platform/firms/routes.ts` (`GET /api/public/plans`, `POST /api/public/signup`, `POST /api/public/signup/verify`) through PF-5's and PF-5v's tests;
* FO-4's hosted page `sales/web-form-page.tsx` and FO-3w's `booking-public/` (the house pattern for a public page with no Studio shell).

**What to build:** new files under `web/src/modules/platform/signup/`, and route lines `/pricing`, `/signup`, `/signup/check` and `/signup/confirm` in the platform `routes.tsx`.
* **S1 Pricing:** Stripe's prices through `GET /api/public/plans`, or "prices unavailable" with no invented price; Sample marks.
* **S2 Sign up:** at most five inputs; plan in place; **the terms tick, with the three current versions linked** (R1.100: "cannot finish without accepting").
* **S3 Check your email** and **S3b Confirm:** POST only; the code boxes, "Send it again", "Wrong email? Start again".
* On success the Owner lands on the sign-in. The trial hand-off is PF-5 part 2's.
* Words come from concept §5. The server's refusal words are shown on their fields (QA-484's words from PF-5v).

**Done when** (P-606), in `tests/check_pf5s1_signup_browser.ts` (Playwright, the local stand-in, the fake `BillingPort`), a pass and a fail each:
* `PF-5s1 DW1`: Pricing, then Sign up, then the code from the demo inbox, then Confirm. One firm and one Owner are made, and the acceptances of the three versions are stored (R1.19, R1.100). The same verified email again → "You already have an account. Sign in.".
* `PF-5s1 DW2`: the terms tick unticked → Start free trial is refused, with the words on the tick, and nothing is sent.
* `PF-5s1 DW3`: a wrong code shows concept §5's error state, and "Send it again" sends one new code.
* `PF-5s1 DW4`: keyboard only; axe-core, with no serious or critical finding on every page and state; 375, 1024 and 1440 widths; no call to any host but the app's.
* `PF-5s1 DW5`: no new path overlaps `APP_ROUTES`, and PF-5's, PF-5v's and PF-6 part 1's suites pass unchanged.

**Touch list:** new files under `web/src/modules/platform/signup/`; the platform `routes.tsx` (four route lines); `tests/check_pf5s1_signup_browser.ts`.

**Duplicate check (P-526):** BACKLOG (PF-5s; PF-5 is the API), open PRs (`platform/signup`), BUGS; one `Duplicate check:` line.

**Reviewer and breaker** (P-278: new public screens). The breaker tries the password in the address or history, a double submit, the confirm page by GET, and 200 % zoom.

**P-610:** about 500 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
