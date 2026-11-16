# Brief: PF-5t, a new version of our terms asks again at the next sign-in, and acceptances are shown (checklist row 100; R1.100) (cloud builder lane; row owner Lead B)

Written 16 Nov 11:5x IST by Lead B (6), rev 16.61, at Lead 66's request.
* qa #1950 scored R1.100 Partial because "a new version asks again at the next sign-in" is built by no part, and "acceptance not shown".
* The source is our checklist row A46 100: "Sign-up cannot finish without accepting the current versions; who, when and which version stored and shown; a new version asks again at the next sign-in". The requirements name no rule beyond it. The wording and versions are Sample. **Unconfirmed: no counsel.**

**Model: Opus 5.5, effort: high**: it touches the shared platform guard; reviewer and breaker at high, P-605. **Two PRs:** part 1 is the API and the guard; part 2 is the screens. **Starts when:** part 1 now, as no open PR touches `identity/guard.ts` (check at start); part 2 when part 1 and PF-6 part 1 are on `main` (PF-6 part 1 already is).

**Who accepts what (Lead B's structure ruling):**
* **The terms of service and the data-processing terms** bind the firm, so **an Owner** accepts each new version for the firm. Until one Owner has accepted, each Owner is asked at sign-in.
* **The privacy notice** is about each person, so **every staff member** accepts each new version once.
* A person with nothing pending is never stopped.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-5t` (part 1) or `/next screens PF-5t part 2` and take **one part** end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** on `main`: `prisma/migrations/20261115180000_pf5_signup_terms/migration.sql` (`platform_terms_version`, `platform_terms_acceptance`, keyed on firm and staff, insert-only), `firms/signup.ts` (`currentTerms`, the acceptance at confirm), `identity/guard.ts`, `identity/keys.ts` (`AnyStaff`), `staff-read/` (`me/account`), and for part 2 PF-6 part 1's `web/src/modules/platform/` (`frame.tsx`, `session.ts`, `account-sections.ts`).

**Part 1, API and guard (no schema change):**
* `GET /api/platform/me/terms` (`@AnyStaff`) answers the person's **pending** versions, by the rule above. Each has its kind, version, link and published date: the current version of each kind (`currentTerms`) that the person, or for firm terms any Owner of the firm, has not accepted.
* `POST /api/platform/me/terms/accept { versionIds }` (`@AnyStaff`):
  - It accepts only pending versions the person may accept. A non-Owner accepting firm terms → 403 "Only an Owner can accept these terms for the firm.". An unknown or old version → 400.
  - It writes one `platform_terms_acceptance` row per version and the audit line `platform.terms.accepted` (who, version ids), in one transaction. A replay is a no-op that answers the same.
* **At the next sign-in the person is asked.** While a person has pending versions they must accept, every staff route except `GET /api/platform/me`, `/me/terms`, `/me/terms/accept` and `/session/sign-out` answers **428** with the code `TERMS_PENDING` and "Please accept the updated terms to continue.".
  - It is checked in the platform guard after sign-in, one cached read per request.
  - The guard's other rules are unchanged, and `assertEveryRouteDeclared` still holds.
  - A non-Owner is never blocked by firm terms an Owner has not yet accepted.
* `GET /api/platform/terms/acceptances` (`agent/settings:list`): the firm's acceptances, with who, when and which version (**"shown"**).

**Part 1, Done when** (P-606), in `tests/check_pf5t_terms.ts`, a pass and a fail each:
* `PF-5t DW1`: a new terms-of-service version is published (inserted with `published_at` now). The Owner's next request answers 428 `TERMS_PENDING`. Accepting clears it. A Case Officer is not blocked by it.
* `PF-5t DW2`: a new privacy-notice version blocks every staff member until each accepts their own. One person's acceptance never clears another's.
* `PF-5t DW3`: a Case Officer accepting firm terms → 403. An old version id → 400. A replay → the same answer and no second row.
* `PF-5t DW4`: the acceptances list shows who, when and which version, firm A only. A sign-up's own acceptances (PF-5) appear in it.
* `PF-5t DW5`: `/me`, `/me/terms`, accept and sign-out still answer while pending. PF-4's, PF-4b's, PF-5's, PF-6b's and every guarded suite pass unchanged with no pending terms (the seed accepts the current Sample versions).

**Part 1, touch list:** `api/src/platform/identity/guard.ts` (the pending check), new `api/src/platform/terms/*.ts` (service and routes), `api/src/features/platform-terms.ts`, the demo seed's acceptance lines (so the seeded firms have none pending), `tests/check_pf5t_terms.ts`, `api/src/platform/MODULE.md`.

**Part 2, screens** (inside PF-6 part 1's `PlatformFrame`):
* On `TERMS_PENDING`, the frame shows one page instead of the content: "We've updated our <kind>." with the link, "I accept" and Sign out. Accepting returns the person where they were.
* **Settings → Terms** shows the acceptances list. It is one entry, through the frame's list.
* Part 2's Done when: `PF-5t DW6`, the journey (publish a version, sign in, accept, carry on), plus `PF-5t DW7`: keyboard only; axe-core; 375, 1024 and 1440.
* Part 2's touch list: new files under `web/src/modules/platform/terms/`, `routes.tsx` and the list file (one entry), `tests/check_pf5t_terms_browser.ts`.

**Duplicate check (P-526):** BACKLOG (PF-5 made the tables; PF-5s's sign-up tick), open PRs (`guard.ts`, `terms`), BUGS; one `Duplicate check:` line per part.

**Reviewer and breaker** (P-278: the shared guard). The breaker tries:
* a pending person calling every route, including the public and webhook doors, which must be untouched;
* accepting another firm's version;
* two Owners accepting at once.

The release holder reads the guard diff (P-423).

**P-610:** part 1 about 400 lines, part 2 about 250.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
