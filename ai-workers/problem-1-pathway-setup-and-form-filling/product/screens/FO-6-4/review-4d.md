# FO-6 part 4d — review, round 1 (d192b8313)

Independent reviewer, round 1, PR #3536, branch `claude/trusting-goodall-rteeoh`, code at d192b8313. While I worked, the breaker's records commit f9820e9e4 landed on the branch. It adds only `screens/FO-6-4/break-report-4d.md`, so the code is unchanged. Nothing was committed or pushed. Every mutation below was undone, and `git status` was clean at the end. No screen, so no journey score. Port 4400 was not used.

## What I ran

* PR suite: `npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo6_4d_signed_downloads.ts` gives `21 passed, 0 failed`.
* Regressions: `run-suites.sh --only "check_fo5_retainers.ts check_pf28_inputs.ts check_pf6b_permission_rules.ts"` gives PASS 248/248, PASS 51/51, PASS 41/41.
* Wiring: `run-suites.sh --only check_screen01_api.ts` (the whole app booted on a copy port, +14000) gives PASS 135/135. The suite rewrote `evidence/screen01/api-checks.json`, and I restored it with `git checkout`.
* Module cards: `module-cards.py tree` gives `PASS module cards: 15 cards, tree checked`.
* Scope: the diff has no migration, no Prisma schema change and no new permission key. The route keeps `agent/retainer:download`.
* Odd bodies, using `asksESigned` and `parseInput` directly (scratch script):
  * `null` goes to the old path (`{}`).
  * `[]` and `["signed"]` give 422 `body`.
  * `{file:["signed"]}` and `{file:"SIGNED"}` give 422 `file` (old `FileLinkBody`).
  * `{file:"signed",version:1}` gives 422 `version`.
  * None of them reaches the e-signed path by mistake.
* `this.signed!`: Nest injects it as required (not `@Optional`), and the app boots. The only controller built by hand with 4 arguments is in `check_fo5_retainers.ts:846`, which never sends an e-signed body. No finding.
* Read rule and firm scoping: `Retainers.assertFileVisible` calls private `visible` (`firmId` + id, then owner, representative or everyone-sees-all). Both new queries filter on `firmId`. `files.get` is per firm. Tokens are tied to the firm and the person by HMAC. Error answers never contain a key.

### Mutations (rule removed, suite re-run, then restored)

| # | Rule removed (`retainers/e-signed-files.ts` unless noted) | PR suite result |
|---|---|---|
| M3 | `:32` `assertFileVisible` in `fileKey` | red: unknown id, other firm, hidden colleague (3 FAIL) |
| M4 | `:46` `assertFileVisible` in `assertKeyVisible` | red: "a link made while they saw it … second check" |
| M9 | `:31` `parseInput(ESignedLinkBody…)` | red: "a field beside file signed (version) → 422" |
| M11 | `:36` signed and evidence swapped | red: 3 lines |
| M14 | `routes.ts:97` no second check for `signing/` keys | red: 3 lines |
| M13 | `routes.ts:97` the old `assertFileVisible` for every key | red (the suite crashes on the first download) |
| M16 | `:30` `idParam` | red: "a malformed retainer id → the one 404" |
| **M1** | `:44` `documentKind: "RETAINER"` in `assertKeyVisible` | **green, 21/21** |
| **M2** | `:45` key-equality check | **green, 21/21** |
| **M6** | `:33` `documentKind: "RETAINER"` in `fileKey` | **green, 21/21** |
| **M15** | `:31-32` order swapped (visibility before body) | **green, 21/21** |
| M5 / M10 | `:33` `status: "SIGNED"` / `evidence: { isNot: null }` | green, 21/21 |
| M7 / M8 | `:33` / `:44` `firmId` | green, 21/21 |
| M12 | `:21` `KEY` loosened to `^signing\/<uuid>\/` | green (key equality at `:45` still holds) |

## Findings

**Major 1: the key-equality rule has no failing line, and the case it guards is real.**
* Where: `e-signed-files.ts:45`.
* Evidence:
  * M2 leaves the suite at 21/21. The "another attempt's folder" line (`check_fo6_4d_signed_downloads.ts:157-158`) passes only because no file exists at `…/abcdef/sealed.pdf`.
  * Part 3 stores the files before its transaction (`signing/service.ts:186`), and that transaction can still end as a duplicate (`:190`) or `NOT_YET` (`:198`). So other `signing/<request>/<attempt>/` folders really exist.
  * In a temporary copy of the suite, I stored a file at that key (`files.put(A, stray, …)`) and called `forge(stray)`. Result: PASS with the code, FAIL under M2 (the file was served).
* Fix: store a file in another attempt folder of the same request before the forged-link line, then expect 404.

**Major 2: the "only a RETAINER request" filter has no failing line in either method, and a consultation agreement reaches it.**
* Where: `e-signed-files.ts:33` and `:44`.
* Evidence:
  * A consultation agreement is an `fo_retainer` row whose request is `documentKind: "CONSULTATION", documentId: <that fo_retainer id>` (`booking/consultation-agreement/service.ts:236`, `:240`). `visible` does not filter by kind.
  * So without these filters, this route would serve a consultation agreement's sealed and audit files under `agent/retainer:download` and the retainer's read rule, not under the consultation route's own (`service.ts:331-335`).
  * The suite's OTHER line (`check_fo6_4d_signed_downloads.ts:166-167`) passes for a different reason: an OTHER request's `documentId` is a `fo_signing_document` id, so `visible` misses it. That is why M1 and M6 stay green.
  * In a temporary copy, I disabled the `fo_signing_request_write` trigger and set q1's `document_kind = 'CONSULTATION'`. With the code, the link gives 409 and the download gives 404 (PASS). Under M6 the link is issued (FAIL). Under M1 the file is served (FAIL).
* Fix: add lines using a real consultation agreement (sent and signed through `ConsultationAgreements`), or at least this crafted row, for both `{file:"signed"}` (409) and a minted link to its sealed and audit keys (404).

**Major 3: the order "body 422 before the read rule 404" has no failing line.**
* Where: `e-signed-files.ts:31-32`.
* Evidence: M15 (visibility checked before the body) leaves the suite at 21/21. Every 422 line uses a retainer the person sees, and every 404 line sends a valid body. The breaker's attack 4 checked the order by hand, but no suite line pins it. The PR's plan and the module card both name it ("strict body 422 → the retainer's own read rule 404"; PF-28 "the body before the retainer is looked up").
* Fix: one line such as `link(RB, r1, { file: "signed", version: 1 })` (another firm's retainer, bad body) expecting 422 naming `version`.

**Minor 1: `status: "SIGNED"`, `evidence: { isNot: null }` (`:33`) and both `firmId` filters (`:33`, `:44`) have no failing line (M5, M7, M8, M10 green).**
* Why Minor and not Major (this differs from the review brief on purpose): with real data none of these can be reached today.
  * Evidence is written only in the transaction that sets SIGNED (`signing/service.ts:232-233`).
  * A link is HMAC-tied to the firm and the person, and `files.get` is per firm.
  * So they are defence in depth.
* Fix: one crafted-row line each, or name them as defence in depth in `MODULE.rows/FO-6-4d.md`.

**Minor 2: the row file records a fact about code that is not on main.**
* Where: `MODULE.rows/FO-6-4d.md:1`.
* Evidence: the "Known limit (breaker m5 on #3490 …)" sentence is about part 4c's stand-in signing page. `gh api repos/expat-ready/xpatready/pulls/3490` gives `open merged=false`, and `git diff origin/main...d192b8313` has no 4c code.
* Fix: move the sentence to part 4c's PR or row file, so this row's facts match this diff.

**Minor 3: dead error text.**
* Where: `e-signed-files.ts:17`.
* Evidence: `asksESigned` (`:19`) sends only `"signed"` or `"evidence"` to `ESignedLinkBody`, so its `{ error: "signed or evidence." }` can never be shown. `{file:"certificate"}` gets the old `FileLinkBody`'s "This is not one of the allowed choices." (scratch script output above), and `words()` ignores the message for `invalid_value` anyway.
* Fix: drop the message, or say in the comment that the old schema answers every other value.

The breaker's m1 and m2 (the 409 says "yet" for an agreement that can never be e-signed, and for an e-signed consultation agreement) are already recorded in `break-report-4d.md`. I do not count them again here.

## Not checked

* The UI: no screen in this part.
* HTTP over a running copy: the breaker did this (break report, attack 20). I relied on the booted copy of `check_screen01_api.ts` for the wiring.

Verdict: Changes
