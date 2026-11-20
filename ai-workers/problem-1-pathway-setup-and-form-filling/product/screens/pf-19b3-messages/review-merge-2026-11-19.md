# PF-19b part 3: merge re-review, 19 Nov 2026 (diff only, P-610, P-293)

Independent reviewer, not the builder. Scope: the two commits since the Approve on `5890bcc2f`: merge `801181365` (#1961 at `6c775f43c`, which carries main `8cefcc6c6`) and fix `30c459762`. Code that did not change was not re-reviewed.

## What I read
- `git show --remerge-diff 801181365`: the one conflict is `studio/api/src/platform/MODULE.md`, in three places (Entry points., Tests., the PF-19b part 2 section). Each was resolved to the incoming side.
- `git diff 6c775f43c 30c459762 -- MODULE.md` is empty, so the card is byte-identical to #1961's tip. `git diff 6c775f43c 30c459762 --stat` lists only part 3's 14 files: 692+/12-, 704 changed lines, as the builder said. Nothing from #1961 or main is reverted.
- `MODULE.rows/PF-19b3.md` carries everything part 3's old card lines said: the `GET messages?subjectKind=&subjectId=` entry, with its read rule, no body, the masked address and 404. It also carries the Delivery notice moving SENT to DELIVERED (forward only, BOUNCED and FAILED final), the local adapter's test events with `SAMPLE_BOUNCE_ADDRESSES`, and both tests. Part 3 added no table, so no `Tables:` line is missing.
- `git diff 88d03c665 6c775f43c` across part 3's dependencies. Nothing changed in `platform/messages/**`, `features/platform-messages.ts`, `ports/messages.ts`, `ports/mail.ts`, `front-office/sales/**` (`visibilityOf`, `sees`), `identity/keys.ts`, `tests/runtime/api.ts` or `lead-page.tsx`. What did change:
  - `settings.ts` now writes `firmId` on the audit line. It still has `platform.account_mail_from` (line 209).
  - `firm-scope.ts` gains one PF-15 bypass entry.
  - The AUD-1b audit adapter now checks firm and actor against the request or job context. Part 3's tests run outside any context and use `seed:…` actors, which are typed SEED (`audit/context.ts:41`).
  - CS-K1 makes `runtime_case.client_id` NOT NULL. `staff-routes.ts` reads only `caseParticipant` joined to `case.firmKey`, so the new column does not touch it.
  - The PF-15 seat check counts invitations. The tests insert staff with SQL, so it is never hit.
  - I found no semantic conflict.
- Exit codes. `30c459762` changes `check_pf19b3_panel_browser.ts:165` to `process.exit(summary() ? 1 : 0)`. That is correct, because `recorder().summary()` returns the failure count (`tests/runtime/api.ts:31`). `check_pf19b3_delivery.ts:221` (`fail ? 1 : 0`) was already right, and its child run at :124 asserts `status === 0` and `N passed, 0 failed`. No other inverted exit. A wait without a catch (:109, :139) throws, and an error thrown at top level exits non-zero.
- Every `.catch(() => undefined)` after a wait, checked one by one:
  - :113 is covered by :114 (panel and URL) and :116 (exactly 4 state words).
  - :142 is covered by :146 (51 messages, with focus on the 51st).
  - :152 and :155 are covered by `offered` and the count of 4 at :156.
  - :159 is covered by :160.
  - Delivery :156 is the deliberate rollback, asserted at :158 (QUEUED, no event, a log line).
  - None of these catches can let a timeout pass silently.

## What I ran (on `30c459762`, from `prototype/`)
- `tsx --tsconfig $PWD/studio/api/tsconfig.json studio/tests/check_pf19b3_delivery.ts`: **exit 0**, 24 passed, 0 failed (the part 2 suite runs inside it and passes).
- `isolated.sh runtime_pf19b3r 4438 start --ttl 30 PLATFORM_IDENTITY=local`, then `check_pf19b3_panel_browser.ts 4438 xr_studio_runtime_pf19b3r`: **exit 0**, 24/24. Then `stop`: the copy, its database and its files were removed, and port 4438 is free. The run re-renders the three tracked screenshots, so I put the originals back byte for byte; `git status` is clean.
- The 375 px screenshot shows the four states in words, masked addresses, no body text and no sideways scroll.
- `python3 product/tools/module-cards.py tree`: exit 0 (PASS, 15 cards; the fragment's format is valid).
- `node product/tools/graph.mjs --check`: exit 0.
- `BASE=6c775f43c module-cards.py pr <changed files>` with no PR body: **exit 1**. See m1.

## Findings
- **Blocker:** none.
- **Major:** none.
- **Minor m1 (PR body):** the `pr` module-card check fails unless the body explains why the cards stay as they are. Two modules are touched without their cards changing: api-features (`api/src/features/platform-messages.ts`) and web-shell (`web/src/modules/front-office/sales/lead-page.tsx`, `web/src/modules/platform/messages/*`). Failure scenario: the PR opens without that line, `module-cards.yml` goes red, and it can never merge itself. Fix: put `Card unchanged: <reason>` in the PR body, or add a row fragment for each card. This needs no code change.
- **Touch list (D):** P-712 is met; the fragment is the only card change. The departures already declared stand and need no new action: one filter line in `demo-inbox.ts`, a two-line lead-page edit, and `MODULE.rows/PF-19b3.md` instead of an edit to MODULE.md.

## Journey
I did not re-run the journey test: this is a diff-only round, and no web or route code changed since `5890bcc2f`. The earlier reviewer's journey report (`journey-test-reviewer-2026-11-18.md`, moved to the records PR) and its score stand.

Reviewer: Approve 30c459762bc6d825d0be6e49252103eb8c644645
