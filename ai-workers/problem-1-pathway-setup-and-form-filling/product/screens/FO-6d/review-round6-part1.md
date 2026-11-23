# FO-6d part 1: review round 6 (the merge of main only)

PR #3207, branch `claude/nice-curie-tzbprl`. The tech lead allowed this round as "the one merge of main only, diff only".

* Head reviewed: `af317d94fd08e13e048ed3776a14c22f0e16c630` (merge commit). Parent 1 `54041dca7df83073d3b5b316f74bd929ab58b835` (the last approved head). Parent 2 `e72e500e96fc67bfa2e022325ba0eb77698b6344` (= `origin/main` when reviewed; it holds #3065 at `a898fa6e6` and #3185 at `9a18b913b`).
* Scope: only what the merge changed. The screen and journey review of FO-6d part 1 stands from the earlier rounds (the PR has no screen of its own: it is the API and the shared signing core). No journey test was re-run, and no journey score is restated here, because the merge changes no page or route of this PR.

## 1. What the merge did

| Check | Result |
|---|---|
| `git show --remerge-diff HEAD` | **Empty**. Git's automatic 3-way merge needed no hand resolution, and nothing was edited in the merge commit. |
| `git diff 54041dca7 HEAD -- <the PR's 15 files>` | **Empty**. None of the PR's own files changed in the merge. |

## 2. The PR's diff against main

`git diff --stat origin/main HEAD` shows **15 files, 768 insertions, 10 deletions**. All 15 are FO-6d's own files: the pr-body, two MODULE rows, the feature file, `any-document/routes.ts` and `service.ts`, `contract.ts`, `handlers.ts`, `port.ts`, `service.ts`, the migration, two schema files and two tests.

* **No FO-6 part 3 file is left in the diff.** Of #3065's 21 files, only `handlers.ts`, `service.ts` and `check_pf6b_permission_rules.ts` still differ from main, and they differ only by FO-6d's lines (listed below). Three other #3065 files changed between 54041dca7 and HEAD: `retainers/service.ts` (PF-28 part 5, #2933), `check_pf19r_every_sender.ts` (PF-21c, #3185) and `check_pf28_inputs.ts`. Those changes came in from main, and HEAD equals main on all three. Nothing was duplicated or dropped.
* **The files both sides touched** (the main..HEAD diff is only FO-6d's lines on top of main's #3065 version):
  * `signing/service.ts`: `found.documentKind !== "RETAINER"` sends each non-RETAINER kind to its own handler through `signingHandlerFor(found.documentKind)`. Main's "no handler" receipt path is unchanged.
  * `signing/handlers.ts`: `type OtherKind = "CONSULTATION" | "OTHER"`. The rest is main's.
  * `signing/port.ts`: `signers` `.min(1)`; `firm > 1` gives "at most one firm signer"; `firm === s.signers.length` gives "at least one client". The "a signer once" rule is kept.
  * `signing/contract.ts`: the header sentence is updated; the "no firm signer" refusal is removed, and the "two firm signers", "one signer twice" and "a firm signer alone" refusals are kept. The new clients-only case is added: files are refused before the second client signs, and the completed event comes with the last signature.
  * `tests/check_pf6b_permission_rules.ts`: the `AnyDocuments` import, the Q1/Q2/K1/K2 fixtures, `byProspect`, `refusedButSeen`, and the six `AnyDocumentsController.*` sweep entries (send, list, signers, state, link, download). Main's entries are all still there.
* `prisma/schema/platform.prisma`: FO-6d's two back-relation lines sit under the FO-6 slot, next to main's. `npx prisma validate` on HEAD reports the schemas as valid.

## 3. Migration stamp

* `20261123213000_fo6d_any_document` is kept and appears exactly once. It is later than every folder on main (main's newest is `20261123210000_pf21c_breaches`, then `20261123200000_pf21b_data_requests`).
* Six timestamp prefixes are shared by two folders each (for example `20261025090000`, `20261122060000`). All six pairs are already on main, so FO-6d did not introduce them, and none of them is FO-6d's stamp.
* On main, only `20261122020000_fo6_signing_tables` mentions `fo_signing_request_write`, `fo_signing_evidence_write` or `FoSigningDocumentKind`, and it was already the base FO-6d built on. No migration from #3185 or the other incoming PRs mentions `fo_signing`/`FoSigning`, so FO-6d's redefinitions stay the last word.

## 4. Results on this head (re-run by the reviewer, from `prototype/studio`, Postgres 127.0.0.1:54329)

| Suite | Builder | Reviewer re-run |
|---|---|---|
| `check_fo6d_any_document` | 26/26 | 26 passed, 0 failed |
| `check_fo6_signing_port` | 17/17 | 17 passed, 0 failed |
| `check_fo6_signing` | 47/47 | 47 passed, 0 failed |
| `check_fo6_signing_api` | 51/51 | 51 passed, 0 failed |
| `check_fo3c_consultation_agreement` | 42/42 | 42 passed, 0 failed |
| `check_irm_editions` | 13/13 | 13/13 passed |
| `check_pf6b_permission_rules` | 40/40 | 40 passed, 0 failed |
| `check_pf28_inputs` (added: main brought PF-28 part 5) | not listed | **51/51**, against an isolated copy `runtime_pf28` on :4487 started with `PLATFORM_IDENTITY=local` (the suite's documented start) and stopped afterwards. My first two tries failed: the first had no copy running (18/19), the second started the copy without `PLATFORM_IDENTITY=local`, so the probes hit 401 in unrelated areas (28/51). Neither failure was a fault in the code. |
| `check_pf19r_every_sender` (added: main brought PF-21c's sender) | not listed | 21 passed, 0 failed |

I added the last two suites because main's incoming changes (PF-28 part 5's input rule and PF-21c's new sender) are the places where a clean textual merge could still break FO-6d's new routes. Both pass.

## Findings

* Blocker: none.
* Major: none.
* Minor: none from the merge.

Verdict: Approve
