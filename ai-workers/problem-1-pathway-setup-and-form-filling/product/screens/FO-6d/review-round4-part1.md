# FO-6d part 1, review round 4 (PR #3207, only the diff)

* Reviewer: a fresh reviewer (not the builder), 2026-11-23.
* Branch `claude/nice-curie-tzbprl`, head reviewed **8f418c028a82686d5e2e74526118f3fece537648**.
* Last approved head: 639e2514fd530ab7c42a83cf3ca41b1926e599e7 (round 3: reviewer and breaker Approve).
* Scope, as the tech lead allowed: "the re-stamp and the merge of main only". The screen-review walk and the journey test were **not re-run**. Neither commit changes behaviour, so the round 3 journey score still applies. This round adds no new journey score.

## 1. The re-stamp (645e7ad35 = HEAD^1)

* `git show --stat HEAD^1`: 3 files, +2 / −2. These are `screens/FO-6d/pr-body.md` (line 1), the migration folder rename, and `tests/check_fo6d_any_document.ts` (the `NEW` constant).
* `git diff -M 639e2514f HEAD^1`: `rename …/{20261123120000_fo6d_any_document => 20261123213000_fo6d_any_document}/migration.sql (100%)`. The SQL is byte-identical. The only other changed lines are the two stamp strings.
* `git grep 20261123120000 HEAD`: no matches, so every reference has been updated.
* Order and uniqueness:
  * The newest migration on `origin/main` (6523e7ad4, and also the freshly fetched 5c9b15ed4) is `20261123140000_csd7c_type_defaults`. 20261123213000 is later than every folder on main.
  * It appears exactly once in the tree.
  * The tree does have duplicate 14-digit prefixes (20261025090000, 20261031140000, 20261102010000, 20261121100000, 20261122030000, 20261122060000). All of them already exist on main and none involves this PR.
* #3185's `20261123210000_pf21c_breaches` (branch `claude/eloquent-ptolemy-h9jfsm`) only adds new `plat_breach*` types and tables. It has no overlap with the signing tables. 213000 sorts after 210000, as Lead 11 asked.

## 2. The merge (8f418c028, parents 645e7ad35 + 6523e7ad4 = origin/main at merge time)

* `git diff 639e2514f 8f418c028 -- $(git diff --name-only 7d7979437 639e2514f)` shows only the re-stamp: pr-body line 1, the test's `NEW` line, and the old migration path (it now lives under the new folder name, 100% the same). The merge changed none of the PR's own files.
* What main brought in (merge-base d8e6c7959 to 6523e7ad4, 282 files):
  * **Migrations and schema**: `20261123020000_fo7g3_bill_to_province`, `20261123030000_aud_ourstaff_actor_word`, `20261123140000_csd7c_type_defaults`, `client-money.prisma`, `library.prisma`. None of them mentions `fo_signature_request`, `fo_signer`, `fo_signing_evidence`, `fo_signing_document`, `FoSigningDocumentKind` or `front-office-signing.prisma`.
  * **Routes**: main has no `signature-requests`, `prospects/:id/signers` or `signing-files/` route in `api/src`. The only definitions are in this PR's `signing/any-document/routes.ts`. The route files main changed (booking public paths, invoices, offices, profile, web-address, web routes) do not touch these paths.
  * **Signing port**: unchanged by main.
  * **Files port (PF-Fw)**: main added `FILE_MAX_BYTES = 25 MB`, `parseFilePut` and checks that the content type is well formed. The PR stores through `files.put(…, "application/pdf")` with its own `MAX_BYTES = 25 MB`. These agree, and the merged tree has no remaining `FilePut.parse` call that would break.
  * **Journeys**: main's `tests/journeys/j_54.ts` W7/W8 guess `POST /api/front-office/signature-requests` (multipart: file, title, prospectId, signerPersonIds). That matches this PR's route and fields, so it is consistent, not a conflict. W7's later steps (sealed copy filed on both people) belong to part 2.

## 3. Checks (run on 8f418c028, Postgres 127.0.0.1:54329)

* `npx tsx --tsconfig api/tsconfig.json tests/check_fo6d_any_document.ts`: **26 passed, 0 failed**. It includes "M pass: the migration adds OTHER … and the fo_signing_document table" under the new folder name.
* `npx tsx --tsconfig api/tsconfig.json tests/check_prisma_schema.ts`: **8 passed, 0 failed**. Migrations match the schema, with 0 known differences.

## Findings

* Blocker: none.
* Major: none.
* Minor (no change needed in this PR): `any-document/service.ts` keeps its own `MAX_BYTES = 25 * 1024 * 1024 // the port's limit (Sample)`. Main now exports `FILE_MAX_BYTES` from `ports/files.ts`, cited to SA-8-58. A later item could import that constant so the two numbers cannot drift apart. The value is the same today.

Verdict: Approve
