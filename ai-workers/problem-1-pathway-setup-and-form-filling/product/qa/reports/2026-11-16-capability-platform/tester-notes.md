# Tester's notes (facts only) · qa capability platform group · main e593acccc · 16 Nov 2026 (00:3x IST)

Rows: R1.11 Server framework (PF-7), R1.12 Screen framework, one UI kit (PF-1), R1.16 Automated testing (PF-7). Previous verdicts (main d52b7274e): Not tested, Partial, Partial. 174 commits on main since d52b7274e.

## Main's head and its merge batch
* main = e593acccc (merge of #1822, FO-4 part 1). ci run **43742297658** (Mergify batch "merged #1822", head 3e36ca662): `git rev-parse` gives tree 32ac4601f for both 3e36ca662 and e593acccc (the batch tested main's exact code).
* Jobs of 43742297658 (GitHub API): 20; 18 success, 2 skipped (`guard`, `packs`). 8 shards, 5 checkpoint regression jobs, `types`, `regression-plan`, `ci` all success.
* Suite lines from the 8 shard logs: `ci-43742297658-suite-lines.txt`. 493 PASS, 0 FAIL, 17 "quarantined" (shard 1 lists the whole quarantine: nightly only, P-205, or "passed only on retry in 2+ runs in 7 days", each with an owner and a back-on date; among them `check_bk3_frame_browser.cjs`, back on 21 Nov; `check_c42_marking_browser.cjs`, `check_c613…`, `check_c83…` back on 16 Nov).
* Platform packs in it: `check_pf1_module_routes.ts` 28/28 (shard 7, job **132899216252**); pf3 75, pf4 118, pf14 92, pf23 100, pf24 84.

## R1.11 / PF-7 container proof
* `skeleton.yml` triggers: `pull_request` (paths list) and `workflow_dispatch` only. Mergify batch PRs skip it by design (file header). The batch run for main's head, **43742297506**, concluded **skipped**. Same for 43739772940 (#1843) and 43738575716 (#1849, #1816).
* Latest green skeleton runs are PR heads: 43747509665 (#1818 CS-C1a, head e59e0c03, a merge of main's previous commit 194b10a41 into that branch, so without #1822's module; corrected after the reader's check; not main's tree), 43741639089 (#1848), 43739832729 (#1830), 43738993207 (#1815).
* qa's `workflow_dispatch` of `skeleton.yml` on `main` from this cloud session: **403 Resource not accessible by integration** (not retried).
* **qa's local replay on main e593acccc** (`skeleton-local-replay.sh`, output `skeleton-local-replay-e593acccc-mine.txt`): the workflow's steps one for one. Two deviations, both forced by this sandbox, never by the app: (1) Docker Hub answered 429 to `build --pull`, so the pinned base (`node:24.21.0-bookworm-slim@sha256:d6aa75…`) was pulled first with retries and the build ran without `--pull` (same digest); (2) `npm ci` inside the build met this sandbox's TLS-intercepting proxy (SELF_SIGNED_CERT_IN_CHAIN), so the build used `Dockerfile.qa` (`skeleton-local-Dockerfile.qa.diff`): the two build-stage RUNs take the proxy CA as a BuildKit secret mount (`NODE_EXTRA_CA_CERTS`, never in a layer); the run stage is byte for byte main's. Result: migrations applied; app healthy; smoke 6/6 PASS (health 200, first page and bundle 200, `/api/platform/me` 200 with firmId, non-root `node` uid 1000, no secret in 7 env names and 17 layers); seeded fail 1, database stopped → `FAIL health … 503` (exit 1); seeded fail 2, root image with a key → `FAIL non-root` and `FAIL no secret`. Not GitHub's runners.

## R1.12 / PF-1
* `web/src/modules/` on main now holds `_example` and **`front-office`** (FO-4 part 1, #1822): `routes.tsx` adds `/front-office/web-form/:token`, `/front-office/leads`, `/front-office/leads/:id`.
* `git diff d52b7274e..e593acccc` on `web/src/App.tsx` and `web/src/modules.tsx`: **empty**. The web diff is only `modules/front-office/**` and five `MODULE.md` files.
* The module's pages import `@/components/frame` (`Frame`, `useWhere`), `@/components/ui/controls` (`Button`, `Field`, `Input`, `Notice`), `@/components/ui/skeleton`; no inline `style={{}}` and no hex colour in `modules/front-office`. Its menu uses Tailwind tokens (`bg-primary/10`, `text-text-link`, `bg-warn/15`).
* qa re-run of `check_pf1_module_routes.ts` on an isolated copy at e593acccc: 28/28 (`check_pf1_module_routes-mine.txt`; also 28/28 in a first run).
* qa walk `tests/qa/check_r112_module_seam_walk.ts` (new; headless Chromium, isolated copy `PLATFORM_IDENTITY=local`, Sample firms seeded by PF-3 and FO-1a seeders): 71/71 in two first runs; after the reader asked for axe on Leads too, **74/74 twice** (`r112-module-walk-1-mine.txt`, `-2-mine.txt`). Per width 400, 1024, 1440, two rounds: `/front-office/leads` opens "Sign in to your firm" inside `[data-frame="outside"]` with a 56 px header (`/cases`: `data-frame="cases"`, 56 px); place line names "Sales"; no sideways scroll; axe WCAG 2.2 A/AA no violation on the sign-in and on Leads (round 1); wrong firm key → Notice "Not signed in · No staff member of that firm signs in with that name." and still the sign-in; typing `sample-firm` + the Case Manager's work email and pressing Sign in opens h1 "Leads" in the same frame; `/`, `/sign-in`, `/cases` keep their headings; no page error. Screenshots `shots/`.
* The refusal wording comes from PF-4's `api/src/platform/identity/service.ts:145` (UNKNOWN_STAFF), used for an unknown firm and an unknown staff email alike; the person typed a firm key and an email, not a name.
* The R1.12 Done when ("… later screens judged against the one kit in qa's walks") was written by qa in commit 510b9352d (14 Nov), the same round that opened QA-450.
* No headed walk: this cloud session has no visible browser; the walk is Playwright headless only.

## Open bugs naming these rows
QA-449 (Gap, Major: skeleton never runs on what reaches main), QA-450 (Gap, Minor: no pack for the "one UI kit" half), QA-451 (Ambiguity, Minor: PF-1 row says a clash stops `vite build`; it stops the app at load).

## After the reader (16 Nov)
* Walk extended: axe on the Leads page at each width (round 1): 74/74 twice.
* QA-476 check `tests/qa/check_qa476_signin_words.ts` (`qa476-mine.txt`): 2/3, fails today as intended. The control signs in (200); both refusals are 401 `UNKNOWN_STAFF` with identical words (good: which half was wrong is not told); the words name a "name", not the firm key and work email.
* Not added (the reader's other weak points; kept as known limits): the public web-form page is not walked against the kit; no line asserts a kit component by name; headless only.
