# PF-28 parts 2b–2c: independent review (PR #2794, head 0c6608fd81793897b626a75db1923920cc88e34b)

Reviewer: Opus 5.5, 21 Nov. Scope: only `git diff claude/runtime-pf28p2..0c6608fd8` (36 files). Part 2a (#2787, approved at 85fa4cb9) is the base. I changed no code. Live AI was off; cost US$0. This is an API change with one web line (`verify-page.tsx:52`) and no new screen, so D1–D20 and the BIC table are N/A. The screens that call these doors were walked; see `journey-test-reviewer-2026-11-21-part-2b.md`.

## Checks run (isolated copy `rv_pf28b` on :4438, runtime ports; never :4400)
- **Sweep:** `check_pf28_inputs.ts 4438 xr_studio_rv_pf28b` gives **34/34**.
  - Code half: 97 inputs, 44 unparsed (43 listed, plus 1 exception). Running copy: 187 routes, 467 probes, 165 failing (157 listed, plus 8 exceptions). No 500, and the row counts are unchanged.
  - Both ceilings are met exactly: 43 code entries and 157 probes.
- **Suites, run here:** pf21w 83, pf5t_terms 42, aud4 33, pf18a_notifications 72, pf18a_offices 87, pf13 30, aud5 57, pf5_signup_billing 54. All are green.
- **Builder's walk** (`part-2b-walk/walk.cjs`, 1440 px) on my copy: exit 0, 4/4.
- **Live probes, all as described in the PR:**
  - An unknown or repeated query key gives 422 with the key named, on the complaints list, audit and export, messages, notifications (items, read, read-all), terms acceptances and the suggestion door. The known keys still answer 200.
  - Audit filter refusals give 422.
  - Branding `{}` and branding refusals give 422 with `fields`, and `issues` is kept.
  - A keep-period below 6 years with no reason gives 422 REASON_NEEDED, with `warning` kept.
  - Terms accept with a malformed id gives 422 CHECK_FIELDS, with `errors` kept.
- **Callers.**
  - Web: `signup-page.tsx` reads `p.errors` through `byField`, and `call()` always fills `errors`, whatever the status. The verify page checks `CODE_WRONG` before the 422 branch, so a wrong code stays on the form. `terms-gate.tsx:74` refreshes the terms only on 400; TERMS_NOT_CURRENT stays 400, and the gate only ever sends pending uuids, so the new 422 cannot reach it there.
  - Web query strings: `list-page.tsx:21` sends `view` and `cursor`. `messages-panel.tsx:37` sends `subjectKind`, `subjectId` and `cursor`. `home-page.tsx:20` sends `seen`. `acceptances-page.tsx:15` sends `limit` and `cursor`. All are allowed. `frontOfficePerson` and `name` are read from the browser's own address on the complaints page and are never sent to the API.
  - Tests: every key that tests, journeys and qa send to these routes is in its `query(...)` list. For audit, the keys the tests send (from, to, person, ours, area, action, entityKey, cursor) all appear in the list, which also matches what `parseFilter` reads.
- **The `extends` follower** (`tests/lib/routes.ts:144-149`). I printed where each of the 15 booking inputs reaches a parse, and every one is a real whole-value parse in the parent class:
  - `AvailabilityService.createSet/updateSet/addTimeOff/chooseHostSet` use `parse(SetCreate|SetPatch|TimeOffCreate|HostSet, body)`.
  - `BookingTypesService.create/update/preview` use `parse(CreateBody|PatchBody)` and `SlotsQuery.safeParse`.
  - `BookingService.staffCreate/staffReschedule/staffList/recordAttendance` and `ConsultRecordService.put` (`ConsultBody.safeParse`) also parse in full.
  - Sign-up reaches `FirmSignUp.signUpDoor/verifyDoor`. The booking probes stay listed for part 4, so the code half and the probe half remain honest.
- **The verify door's 422.** The 422 depends only on the body's shape (`VerifyBody`: a 43-character token and 6 digits), and the token's shape is public. A well-formed unknown token still gets the same 404. The per-IP limit still runs first. Nothing that the 404 used to hide is exposed.
- **Would each fail case catch its fix being removed? Yes, for all of them:**
  - The complaints list query: `cq` and the probe would get 200.
  - The body before the Idempotency-Key: `cNoKey` and the probe would get 400.
  - `complaintId()` and the support id check: the service parses the body before its lock (`complaints.ts:376`, `support.ts:186`), so the answer would be 422, not 404.
  - Sign-up and verify: the `su`/`vf` checks and the probes would get 400/404.
  - `read`/`read-all`, audit, messages, the suggestion door and terms: their probes would get 200.
  - The exceptions still have to fail the way they say, because `judge` merges them.

## Findings
### Blocker
None.
### Major
- **M1. Two checked-in suites now fail: R1.100's journey and the qa platform walk.**
  - `tests/journeys/j_100.ts:93`, `:95` and `:113` still expect 400 for sign-up field errors and for CODE_WRONG. I ran it on this head: **24/27, 3 FAIL**.
  - `tests/qa/check_qa_r1_platform_fo_walk.ts:42-50` expects 400 for the same sign-up refusals (no terms, two of three, an old version, a long firm name, an empty form). These now answer 422 (verified by curl).
  - Nothing in this PR's CI runs them: walks.yml runs only when `tests/journeys/` changes. They would fail on main at the next gate A walk or item-proof.
  - Fix: change those expectations to 422 (keep the `errors` checks), and run both.
- **M2. The SNS exception's written reason is not true, and it moves a fixable gap out of the fix list.**
  - The exception for `platform/messages/public-routes.ts POST /api/public/messages/ses-notices body` says `bounces.ts` "checks its exact field set per Type (FIELDS) before reading". It does not. `FIELDS` (`bounces.ts:42-53`) only builds the string to sign: it requires those fields to be strings and refuses no extra field. `SigningCertURL`, `SignatureVersion`, `Signature` and `TopicArn` are read before it (`:60-70`), and the SES `Message` is `JSON.parse`d and read by hand (`:97-101`).
  - PF-28's amendment (1) in BACKLOG says a webhook door's "zod schema runs **after** the signature check". So this is the unfinished part-2 fix the line used to name, not a by-design case.
  - Fix, either of:
    - put it back on `unparsed` as `PF-28 part 2 (platform)` and raise `UNPARSED_CEILING` to 44;
    - add a zod schema of the envelope (and of the fields read from `Message`) after `verify()`. A non-strict schema is fine there, since AWS may add fields.
  - The four `ses-notices` probe exceptions (400 "not signed" before any field) are true, and match the amendment's "400 for a bad webhook signature".

### Minor (Should)
- **m1. The `exceptions` section has no ceiling.** `PROBES_CEILING`/`UNPARSED_CEILING` count only `unparsed` and `probes` (`check_pf28_inputs.ts:315-316`). A failing line can therefore move to `exceptions` with any 40-character "By design" sentence, and the test does not change. Pin `EXCEPTIONS_CEILING = 9` (it may only fall until the lead accepts).
- **m2. Two audit refusals name the wrong field.**
  - `bad()` takes the field from the first quoted word of its detail (`audit/firm-read/service.ts:50`).
  - BAD_CURSOR therefore answers `fields: { filter: … }`, not `cursor`. RANGE_TOO_LONG answers `filter`, not `from`/`to` (both verified).
  - Fix: pass the field to `bad()`.
- **m3. A bad `?seen=` is still a 400 field error with no `fields`.**
  - `notifications/routes.ts:17-21` throws `BadRequestException`, and it is not on the PR's "kept at 400 on purpose" list. This is the same kind of value refusal that this PR moves to 422 elsewhere (terms `limit`/`cursor`).
  - Fix: answer 422 with `fields: { seen }`, and update `check_pf18n_notifications.ts:271`.
- **m4. The `extends` follow has no pass or fail case of its own.**
  - No case shows that an inherited method with no parse stays unparsed.
  - Inside a base method, `this.x()` is followed to `Base.x` even when the derived class overrides `x`. That is a possible false pass, though none exists today.
  - Fix: add a throwaway pair like DW1's, and either note the limit or resolve `this.` calls against the class the follow started from.
- **n1 (nit).**
  - Sign-up's new `fields` values are the raw lower-case texts ("give your work email (name@example.com)", "CA only for now", "not a field of this form"), while the PR says "in the page's own words". The page reads `errors`, so no person sees them.
  - The invitation exception says that any token that is not live answers `NOT_VALID`, but an expired one answers `EXPIRED` (`session/service.ts:83`). Reword it.
  - Journey plain-words ½: a cut-short link shows "expired or already used" (see the journey report).

## What held
- The guard still runs before any parse.
- A public firm host still gets its 404 on the suggestion door before the query is read.
- `__proto__` and `constructor` keys are named, never accepted.
- The 9 exceptions were each checked against the code:
  - DELETE complaint: 405 COMPLAINT_KEPT for any id (`complaints.ts:449`).
  - Invitation GET 200 and accept 410 (PF-4b). Tokens are `randomBytes(32)`.
  - `resend {}` is a valid body.
  - The four SNS probes.
  - Only the SNS body line is wrong (M2).
- Graph (P-86): `graph.mjs` lists none of the changed routes under G3.
- My test runs overwrote the J-100 screenshots in the worktree; I restored them with `git checkout`. The worktree is clean apart from my two report files.

## Not checked
A real screen reader, and an intended user's own walk (D17/D20 stay with the founder). I did not re-run pf18n, pf21, pf21i/j/v, pf25, pf5v, pf6m2, pf19b2_ses or csv1, nor the browser suites pf21s, pf18h, pf19b3, pf5t_terms_browser, fo4_sales and pf5s1. The builder reports them green, and my own browser walk covers the sign-up, verify, complaints and terms screens. I did not run the qa walk (M1); its lines assert the same door answers that I checked by curl.

## Journey score (reviewer, the one score for this check)
**9.5/10, pass.** Plain words is ½, for the cut-short verify link. Details are in `journey-test-reviewer-2026-11-21-part-2b.md`.

**Verdict: Block** (Changes requested) for 0c6608fd81793897b626a75db1923920cc88e34b. To fix: M1 (j_100 and the qa walk to 422) and M2 (the SNS body line back on the fix list, or a schema after `verify()`). m1–m4 should be fixed in this PR if cheap, or carried to part 3.

## Round 2 (head fc6a5dea37b82608c8bedc0e83951eddf8fee2dd, diff `0c6608fd8..fc6a5dea3` only)
Scope: 7 code and test files: audit `service.ts`, `notifications/routes.ts`, `check_pf18n`, `check_pf28_inputs`, `j_100`, the allow-list and the qa walk. The commit also adds my two round-1 reports unchanged. I ran everything on a fresh copy, `rv_pf28b2` on :4438. Live AI was off; cost US$0.

**Checks**
- `check_pf28_inputs` gives **36/36**: 44 code entries listed out of 44 unparsed, 157 probes, 8 exceptions. All three are at their ceilings, and the DW7 size check now counts the exceptions.
- `j_100` gives **27/27**.
- The qa walk gives **30/37**:
  - All 5 sign-up refusals (lines 42–50) pass at 422.
  - The 7 failures are gap probes outside this diff: the sign-up pages "not on main", the Stripe trial end, `billing/invoices` 404, and the lead filters and FO-7b checks (`/api/front-office/leads`). None touches a door this PR changed.
- Both runs overwrote checked-in screenshots, which I restored with `git checkout`.
- Live probes, all as stated:
  - m2: `cursor=bad` gives 422 BAD_CURSOR `fields: {cursor}`; a range over one year gives 422 RANGE_TOO_LONG `fields: {to}`.
  - m3: `read-all?seen=yesterday` gives 422 INVALID `fields: {seen}`. `:id/read` with the same bad value gives the same answer, because the query is still read before the id.
  - The `BadRequestException` import is gone, and no other 400 is left in these two files.

**Fixes**
- **M1 closed.** `j_100.ts:93`, `:95` and `:113`, and `check_qa_r1_platform_fo_walk.ts:42-50`, now expect 422, and their `errors`/`code` checks are kept.
- **M2 closed.** The SNS body is back on `unparsed` as "PF-28 part 2 (platform)", and `UNPARSED_CEILING` is 44. The untrue exception text is gone, and the four probe exceptions (400 "not signed" before any field) stay. The schema after `verify()` remains part 2's open fix, as amendment (1) asks.
- **m1 closed.** `EXCEPTIONS_CEILING = 8`.
- **m2 and m3 closed** (probes above). `check_pf18n:271` now asserts 422 with `fields.seen`.
- **m4 closed for the case asked.** There are two planted cases:
  - an inherited method that parses gives `BaseThings.put`;
  - the same method without a parse gives `null`.
  - The pass case would fail without the `extends` follow (`Things` has no `put` of its own), so it proves the change. The derived-class override limit is written down as known; no route has it today.
- **n1:** the invitation reason now names EXPIRED. The raw `fields` texts on sign-up and the verify page's closed-link words are left as they are. Nobody sees them; they are listed in the PR and accepted as a nit.

**Round-2 findings:** no Blocker, no Major, and no new Minor.

**Journey score:** 9.5/10 stands. This round changes no screen, and the round-1 walk covers these screens. Plain words stays ½, for the verify page's words on a cut-short link (n1, left as it is).

**Verdict: Approve** for fc6a5dea37b82608c8bedc0e83951eddf8fee2dd (no open Blocker or Major).
