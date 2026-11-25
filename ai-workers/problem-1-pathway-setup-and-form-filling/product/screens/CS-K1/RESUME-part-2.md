# CS-K1 part 2 with J-72 (R1.72's last part): resume note (runtime lane)

Written 19 Nov 2026, 16:5x UTC (22:2x IST), by the runtime builder lane that built FO-8. The session stops here on its
context limit (the lane's start rule: near 400k tokens, push a resume note and stop). **No part 2 code exists yet.**

## State
* **FO-8 is merged:** expat-ready/xpatready#2255, head `0f1a6ad1a`, merged 19 Nov 16:41 UTC. On `main`:
  `api/src/case-clients/prospect-won.ts` (subscriber, catch-up, offer, `openCaseFromOffer`), the route
  `POST /api/runtime/clients/:id/open-case`, `OpenCaseFromOffer` in `contracts/runtime.ts`, `client.created` and
  `case.opened` in `ports/events.ts`, `tests/check_fo8_prospect_won.ts` (43 cases).
* **Branch:** `claude/epic-ritchie-4ybdwg`, fast-forwarded to `main` at `21cc0c640`; it holds this note only.
* **Lane line (Build Lead C, word for word):** "Build FO-8 from FO-8.md, then CS-K1 part 2 with J-72 from CS-K1-2.md, back
  to back in one lane, each branched from main after the one before merges."

## Next step
Build CS-K1 part 2 from `design/build-lead-c-briefs/CS-K1-2.md` on `claude/build-lead-c-647b40` (read its two added
sections at the end: 14:0x IST and 21:0x IST) and the draft's part 2 in `design/briefs/CS-K1.md` line 32.

**Order ruled 19 Nov 21:0x IST (Lead 95):** build and get the Approve on the branch; **open the PR only after Lead B's
FO-2w is on `main`** (Signed offline raises `prospect.won`), then merge `main` once and get a diff-only Approve. FO-2w
was not on `main` at `21cc0c640`: `front-office/retainers/service.ts` still writes only the audit action there.

## Scope of part 2 (one PR, under 800 changed lines, else ask first)
1. `createCase` links a new client to its `fo_person` (PERSON) or `fo_company` (COMPANY) through `FoPersonPort`, inside
   the opening's transaction; the link is written only while both columns are null; the firm is the client's own.
2. A one-time `JobPort` job links every existing client with neither column set, each in its own transaction; a re-run
   changes nothing. **It must leave FO-8's clients alone:** they already carry their link.
3. One migration: the check that a PERSON client has `fo_person_id` and a COMPANY client `fo_company_id`, with its
   rollback file. **Ask the Lead for the stamp before opening the PR (P-600)**; asked once on #2255, not answered.
   Newest on `main` now: `20261119081500_fo3a_set_name_unique`. The Lead reads the migration before the label (P-423).
4. DW9 to DW13 in `tests/check_csk1_client.ts` (340 lines today), each a pass and a fail.
5. **Live delivery:** one `BYPASS_USES` line in `platform/firm-scope.ts` for FO-8's catch-up outside a request (the
   Lead reads it: firm scope) and an app-start provider, as `platform/web-address/routes.ts` `WebAddressCatchUp`.
6. **J-72** as `tests/journeys/j_72.ts`, passing in CI; the PR body says `Completes: R1.72`. It walks **both** wins, a
   Convert and a Signed offline, each handing over into one case with its applicants, representative and pinned release.
7. Review: an Opus reviewer in a fresh context **and** the breaker, both high effort (two openings at once for one
   prospect; the job run while a client is opened; a firm id from the request; a company client sent to
   `ensureForClient`). `Reviewer: Approve <head>` as a PR comment, then non-draft; no label (schema): the Lead reads first.

## Carried over from FO-8 into this PR
* The card fragment `api/src/MODULE.cases.rows/FO-8.md` gets its `Tests: tests/check_fo8_prospect_won.ts` line back
  (#2240 is on `main`).
* The accent-cut case in `check_fo8_prospect_won.ts` ("breaker R2-m2") never reaches the cut: the front office stores
  names composed (NFC). Use a letter with no composed form (given and family names of "q" + U+0301, 50 each) and assert
  the principal ends on the mark within 120 units; it must fail on a code-point cut.
* The `case.opened` audit line's words now show on the prospect timeline (FO-2 part 4), which shows no detail. Reword to:
  A case was opened from the "Open a case?" offer. (No "case ${…}" in a port line: `check_case_feed.ts`.)
* `OFFER_REFUSED.CHANGED` can say the client updates by itself once the app-start catch-up exists.
* **First real run of FO-8's Signed offline branch:** `offerOf` takes the retainer version ended `SIGNED_OFFLINE`, else
  the sent one not ended, and reads `merge_values["representative.staff_id"]`. Only SQL-written rows have tested it. If
  J-72's Signed offline walk shows another representative, it is an FO-8 fault: fix it here with a failing case.

## Open questions (each with a recommendation)
1. **J-72 has no brief of its own** (no `J-72.md` beside `J-77.md`), and "Open a case?" has no screen (FO-8 and this part
   are API only). Recommendation, as `j_77.ts` mixes screen and API: W1 Convert on the Pipeline screen (FO-4 part 2a);
   W2 the client appears with no hand-run command (app-start catch-up; say in the PR how the walk triggers it, since
   nothing delivers while the app runs); W3 `open-case` through the API with a staff session; W4 the case page on screen
   shows the applicant, the representative of record and the pinned release; then the same for a Signed offline win;
   DW lines with their stand-ins: one client per prospect, firm B gets 404, a second click 409. **Ask Build Lead C to
   confirm this list before building J-72**, and whether the offer needs a screen first.
2. **FO-2w's payload** (asked on #2255, not answered): recommend the Signed offline event carries the same
   `ProspectWonPayload` as Convert's with `retainer_id` set and `won_via: SIGNED_OFFLINE`, so FO-8 needs no second path.
3. **Still with Lead B, not in R1.72's chain:** FO-5rp (the retainer read port; FO-8's "Port owed:" line stays) and FO-2u
   (undo refused once a case exists).

## What a fresh session should know
* This cloud container: `cloud-setup.sh` stalls on `http://archive.ubuntu.com`; put `https://` in
  `/etc/apt/sources.list.d/ubuntu.sources` first. After a container restart the database is down:
  `pg_ctl -D <repo>/.tools/solution-1-prototype/pg18-data -l <that folder>/server.log -w start`.
* Tests: `./node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/<file> <port> <db>` from `studio/`, on a copy from
  `zsh tools/isolated.sh <name> <port> start --ttl 60` (stop it after). The shell is zsh: no word-split variables.
* A test must not sign the same staff member in twice: the second sign-in ends the first session.
* Never force-push: after a merge the branch is an ancestor of `main`, so `git merge --ff-only origin/main` and a plain
  push restart it.
* Guards that caught FO-8: `check_case_feed.ts` (audit words), `check_csv1_inputs.ts` (every case-side body through a
  zod parse), `check-mergify-scopes.sh` and `module-cards.py` (a new folder must be claimed), `pr-rules` (the PR body
  needs a line starting "Duplicate check:" and a "Done when").
* Watch: CS-NT1 also wants `runtime.ts` and `cases.prisma`.

## State at 20 Nov 04:4x IST (23:1x UTC 19 Nov), runtime lane on `claude/awesome-allen-4pfgcj`
* Built: CS-K1 part 2 and J-72. Reviewer **Approve 40639a2de** (Opus; diff-only re-reviews after 2 Majors; `review.md`); breaker found 4 Majors at 17b41633f, F1-F3 fixed, F4 with the tech lead (#2255 comment 7020701579).
* Waiting: **#2321 (FO-2w) not on main** (open, unchanged since 19 Nov 18:42 UTC, no labels). No PR opened yet (order ruled by Lead 95).
* Next when #2321 merges: `git merge --no-edit origin/main` once; `check_csk1_client` and `tests/journeys/j_72.ts` on fresh copies (J-72 a second time: done-when asks exit 0 twice); diff-only Approve; open the PR ready with `screens/CS-K1/PR-BODY-part-2.md` (the PR title in the brief); post `Reviewer: Approve <head>`; "Question for the tech lead: migration read" before the label.
* J-72 runs: `PROSPECT_WON_POLL_MS=500`, copy started with `PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500`.
