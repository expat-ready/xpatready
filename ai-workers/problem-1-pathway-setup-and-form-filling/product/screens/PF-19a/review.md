# PF-19a review: messages schema and the consent store

Reviewer: independent (Opus), fresh context, did not build it. Reviewed exactly `git diff origin/main..deb03f13f` (PR #1754, branch `claude/upbeat-planck-my1i4g`), against the brief (`lead-b-briefs/PF-19a.md` on `lead-b-front-office`), the BACKLOG row (rows rev 14/16), AG-2-83, AG-10-22..27 and SA-11-29. PF-0p's `ports/{audit,clock,staff}.ts` and `api/src/platform/audit/audit-event.ts` were in the tree untracked so the code runs. They were not reviewed.

Path prefix: `studio/` = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/`.

## What I ran
* `npx tsx tests/check_pf19a_messages_schema.ts`: **59 passed, 0 failed** (17 s; scratch databases created and dropped by the test).
* `npx tsx tests/check_prisma_schema.ts`: 8 passed, 0 failed.
* My own scratch database (every migration, then dropped): an unfiltered `prisma migrate diff` shows only drift that is older than this PR (`fact_source`, `form_edition_accept`, `person_role`, `validated_copy` defaults; `canonical_field_name`). So filtering the test's diff to `msg_` lines (test:48) is justified. Inserting a `msg_consent` row that is already withdrawn is accepted (the trigger fires only on UPDATE/DELETE). That matters for finding M1's fix.
* A probe of the shared rule through `fakeConsent()`, which uses the same `decide()` and the same `record()` semantics as the adapter. It reproduced both Majors below, then was deleted.
* Journey test (`.claude/skills/journey-test`): **N/A, no score.** This row has no screen, route or user-facing step, and the task said not to do a browser walk. The port's call sequences are covered by the scripted test and the probes above.

## What holds (checked)
* **Gate rules** (`ports/consent.ts:153-170`, `consent-store.ts:93-106`):
  * marketing needs a live consent on that channel;
  * WhatsApp SERVICE needs the opt-in (a SERVICE consent on WhatsApp), and the opt-in never counts as marketing;
  * transactional and service email are allowed;
  * a suppression stops every class, and the consent read is skipped when suppressed;
  * the decision names its reason and the consent id (AG-10-27).
* **Firm walls.** `firmScope` is used on every query and raw SQL binds `firm_id`. Composite keys:
  * consent → wording, on (firm, id, channel, purpose);
  * copy → consent;
  * outbox → consent;
  * event → outbox.
  * Triggers keep template versions and outbox rows in their template's firm. Firm A cannot read, withdraw or copy firm B's rows (tested).
* **Triggers.**
  * Wording, template versions and events refuse UPDATE, DELETE and TRUNCATE.
  * On a consent, only the three withdrawal columns may ever change, once (the `to_jsonb` comparison). No delete, no truncate.
  * The `withdrawn_at >= given_at` check and the "all three withdrawal columns or none" check are both present.
* **Migration.** Additive: only `msg_` tables, types, functions and triggers. All 7 functions and 11 triggers are `msg_`-prefixed. The stamp is later than `main`'s newest. No data is written. Demo-copy rows are unchanged (tested).
* **Audit.**
  * Fail-closed inside the caller's transaction (forced failure rolls back `record` and `publishWording`, tested).
  * Detail holds ids and enum words only. No address appears in the suppression line (tested). The wording text is not in the detail, only its hash.
* **Concurrency.**
  * `publishWording` holds an advisory lock per key, backed by a unique index.
  * `ensureMessagesFirm` and `suppress` use `ON CONFLICT DO NOTHING`.
  * A `record` that races a `withdraw` is still judged correctly by the "given after the latest withdrawal" rule.

## The builder's five choices
1. **`msg_firm` hub: agree.** It keeps `PlatformFirm` to one slot line, a RESTRICT chain and a lazy upsert inside the caller's transaction. Tested, including P2003 for an unknown firm.
2. **Set-once `withdrawn_at` instead of AG-2-83 rule 7's "new row": agree only with fixes.** The brief binds it, and the PR records the conflict openly. But the model leaves two holes against cards the row cites: **M1** and **M2**.
3. **`allows` derives the purpose from the class, takes db/tx first, and adds `suppress()`: agree.** A separate `purpose` argument could only contradict the class. Without `suppress()` nothing could write `msg_suppression`.
4. **Per-firm suppression, with SA-11-29's platform-wide bounces left for PF-19b: agree to defer, as a Minor (m4).** `msg_suppression.firm_id` is NOT NULL (`platform-messages.prisma:208`), so a platform-wide list needs another migration. The PR's question to Lead B must be answered before PF-19b starts.
5. **Two partial indexes not led by `firm_id`: agree.** Rows with no firm cannot be led by one. The test pins exactly these two and catches a probe index.

## Findings

**M1, Major: a Merge or Link copy of a withdrawn consent comes back live** (AG-2-83 rule 8: "Merge copies every consent row the same way, including withdrawals").
* **Where:** `ports/consent.ts:66-69` and `api/src/platform/messages/consent/consent-store.ts:32-44`. `record()` always writes the copy unwithdrawn. Neither the port nor the adapter carries the source row's `withdrawn_at`, `withdrawn_by` or `withdrawn_via`. The port says it supports "a Link or Merge copy".
* **Failure (reproduced):** Client B is P1. P1 gives web-form consent, then unsubscribes, so P1's gate answers WITHDRAWN. Staff then merge P1 into P2. Merge calls `record({copiedFromId: c1, recordedKind: "SYSTEM", givenAt: c1.givenAt})`. P2 has no withdrawal of its own, so `allows(P2, MARKETING)` answers `{allowed: true, reason: "CONSENT"}`, and marketing goes to a person who withdrew.
* **Calling `withdraw()` afterwards does not repair it.** It would also withdraw any later consent of P2's own (`greatest(at, given_at)`, `consent-store.ts:60`).
* **Fix:** a copy whose source is withdrawn is written with the source's three withdrawal columns. The schema already accepts this (verified). Do the same in the fake. Add a pass and a fail test.

**M2, Major: an unsubscribe or STOP with no live consent row stores nothing and audits nothing** (AG-10-24: an unsubscribe "SHALL write a withdrawal and permanently halt marketing on that channel"; SA-11-29: withdrawals and unsubscribe/STOP "always block sending on every route"; AG-2-83 rule 8: "a copy never undoes a later withdrawal").
* **Where:** `consent-store.ts:59-71`. When the UPDATE matches 0 rows, it returns `{withdrawn: 0}`, writes no row and no audit line.
* **Failure (reproduced):** Client C has no marketing consent. Client C gets one own-mailbox "Send anyway?" email (AG-10-22) and clicks unsubscribe. Nothing is stored, so the next "Send anyway?" sends again.
* **A second failure (reproduced):** after that unsubscribe, a Link copies an older grant onto Client C, and `allows` answers CONSENT.
* **Why it matters:** the set-once model has no row to set, so the withdrawal is lost. Suppression with reason UNSUBSCRIBE is not a substitute, because it would also stop transactional mail.
* **Fix, either:**
  * (a) `withdraw()` with no live row writes a withdrawal-only row (`given_at = withdrawn_at`, with a check that relaxes the wording requirement for exactly that shape). `decide()` already treats it as "latest withdrawal".
  * (b) Lead B rules in writing, in the PR, where such a withdrawal lives. Then add its test.
* An audit line for every withdraw call, including one that matches 0 rows, is needed in either case.

**m1, Minor: a late-processed withdrawal also withdraws a re-consent given after it.**
* **Where:** `consent-store.ts:56-62`.
* **Failure:** a STOP at 10:00 is processed at 10:05 with `at` = 10:00. A web-form tick at 10:02 is then withdrawn "at its own given time", although the newest act was consent (AG-2-83 rule 7: the newest row decides).
* **Fix:** skip rows with `given_at > at` instead of using `greatest`.

**m2, Minor: `givenAt` and `at` accept future times** (`ports/consent.ts:30, 69, 87`).
* **Failure:** a capture passes a browser timestamp a year ahead. Its withdrawal is then stamped a year ahead (`greatest`), and every real re-consent before that date stays "not live".
* **Fix:** refuse times later than the clock plus a small skew.

**m3, Minor: TRANSACTIONAL on WhatsApp needs no opt-in** (`ports/consent.ts:153-157`).
* AG-10-22 and SA-11-29 say a WhatsApp service message needs `WHATSAPP_OPT_IN`. If PF-19b classes a business-initiated WhatsApp message (for example a booking confirmation) as TRANSACTIONAL, the opt-in is bypassed.
* The brief does say "transactional allowed unless suppressed". So either state in the port's doc that TRANSACTIONAL on WhatsApp means replies only, or route it through the opt-in. Ask Lead B which.

**m4, Minor: platform-wide hard bounces and complaints (SA-11-29) cannot be stored as built.** `firm_id` is NOT NULL (`platform-messages.prisma:208, 218`). This is already raised as a PR question. The answer must come before PF-19b.

**m5, Minor: AG-10-26 asks consent capture to record jurisdiction.** `msg_consent` has no jurisdiction column (`platform-messages.prisma:167-202`). The brief's column list omits it too. List it as a known gap in the PR (CASL only for now; Unconfirmed: no counsel) rather than adding scope here.

**m6, Minor: process.** The PR is 1,434 lines, over the brief's "~800 lines: split schema → ConsentPort (P-436 (4))". It is one PR with no stated reason; about 400 of those lines are migration SQL. Say why in the PR, or split.

## Tests vs the Done-when lines
Every Done-when line has a real pass and a real fail, and removing each rule would turn a check red:
* wording edit and delete refused;
* withdrawal makes `allows` false at once;
* marketing without a row is false;
* transactional is true unless suppressed;
* a suppressed address is false for every class;
* events refuse update and delete;
* `firm_id` first in every index (with a probe index proving the check works);
* firm A never reads firm B's consent;
* migration on empty and demo copies, with `migrate diff` showing no `msg_` lines.

The brief's "web form pointing at another firm's wording" is tested on its twin, a consent naming firm B's wording (23503). That is acceptable while FO-1k owns the `fo_web_form` key.

Missing tests: M1 (copy of a withdrawn row) and M2 (withdraw with no live row). The fake-parity check covers one story only; add M1 and M2 to it as well.

## Not checked
PF-0p's files; CI on this head; the demo-DB shard suites and FO-1a's suite (they need `main` with PF-0p merged); the `fo_web_form` key (FO-1k's).

Verdict: Changes needed (fix M1 and M2, each with a pass and a fail test; Minors m1 to m6 at the builder's judgement).

## Round 2: diff-only re-review of `deb03f13f..922474295` (P-277)

I read only that diff (7 files), with the breaker's `break-report.md` (on `deb03f13f`) to see what each fix answers.

**Runs on `922474295`**
* `npx tsx tests/check_pf19a_messages_schema.ts`: **71 passed, 0 failed**.
* `tests/check_prisma_schema.ts`: 8 passed, 0 failed.
* PF-0p's untracked files were still in the tree.

### Round 1 findings
* **M1, closed.**
  * A copy now takes the original's time (`consent-store.ts:42-50`); a different time is refused (`copyKeeps`, `ports/consent.ts:183-187`).
  * A copy of a withdrawn row is written with the source's withdrawal columns.
  * The fake does the same (`ports/consent.ts:246-252`).
  * The test fails if the copied withdrawal is removed: the Merge-copy check reads `withdrawn_at`, `withdrawn_via` and `withdrawn_by`. This also closes break 1, 2 and 3.
* **M2, closed.**
  * New insert-only `msg_consent_withdrawal` table (`migration.sql` new table, its checks, and the two `msg_write_once` triggers).
  * `withdraw()` always writes the row and one audit line (`consent-store.ts:76-93`).
  * `allows()` passes the withdrawal times to `decide()` (`:124-125`, `ports/consent.ts:200-207`).
  * Tested: an unsubscribe with no consent gives WITHDRAWN and leaves an audit line, and a later Link copy of an older grant stays WITHDRAWN. Either check fails if the withdrawal times are dropped from `decide()`.
  * The new table is `firm_id`-led, in MSG_TABLES and under the index check.
  * Merge can carry a withdrawal-only row across faithfully with `withdraw(target, at = original time)`: it ends only consents given at or before that time.
* **m1, closed.** `greatest()` is gone. Only rows with `given_at <= at` are ended (`consent-store.ts:83-87`, fake `:259`). Tested: a withdrawal processed an hour late leaves a later consent live.
* **m2, closed.**
  * `At` accepts only a Date or an ISO time with offset, from year 2000 (`ports/consent.ts:31-32`).
  * `notInFuture` allows at most 5 minutes ahead of the clock.
  * The database refuses `infinity` (`isfinite` checks), NUL in free text, and an invisible-only wording.
  * Tested pass and fail. This also closes break 4, 10 and 11.
* **m3, closed: TRANSACTIONAL on WhatsApp now needs the opt-in** (`purposeNeeded`, `ports/consent.ts:176-180`). Tested. One consequence is in R2-m1 below.
* **m4, open as a question for Lead B** (platform-wide bounces). Accepted as listed-known.
* **m5, closed.** `msg_consent.jurisdiction` (`CA`, `CA-QC`), with checks in the port and the database. Tested.
* **m6, open.** The builder will justify the size in the PR. Accepted as listed-known.

### Break-report items this diff answers
* **Break 5 (UK "(0)" trunk) and break 6 (`<…>`, trailing dot, zero-width space):** closed.
  * `normaliseAddress` now does NFKC, strips invisible characters, `<>`, a trailing dot and `(0)` (`ports/consent.ts:49-59`).
  * `EMAIL_KEPT` is mirrored in `msg_address_ok`, so the database refuses the other forms.
  * Tested.
* **Break 9 (bare client as `tx`):** closed. `inTransaction()` refuses a client that has `$disconnect` (`consent-store.ts:23-26`). Tested.
* **Break 7 (same-millisecond re-consent):** listed as known. It fails closed, so I agree.
* **Break 12 (fake has no firm table):** listed as known. Minor, and I agree.
* **Break 13 (deadlock on opposite-order publishes):** listed as known. Postgres aborts one transaction and the caller retries; Minor, and I agree.
* **Break 14 (outbox consent/channel match):** listed as known. It belongs to PF-19b, which writes the outbox, and I agree.
* **Break 15 (locale differs from the wording's):** not mentioned. Minor; add it to the PR's known list.

### New in this diff
**R2-m1, Minor: the m3 change leaves no path for a WhatsApp reply to a person who wrote first.**
* **Where:** `ports/consent.ts:176-180`. Every non-marketing WhatsApp message now needs the opt-in.
* **The cards:** AG-2-83 rule 2 ("Inbound WhatsApp message: none. The firm may reply") and AG-10-22 ("… and replies are not affected").
* **Failure:** a firm's answer to Amina, who only wrote in on WhatsApp, gets `NO_CONSENT`.
* **Why Minor:** it fails closed (no unlawful send), and nothing sends until PF-19b. I take my share: round 1's m3 left both readings open.
* **Fix:** one doc line on `purposeNeeded`/`AllowsQuery` saying a reply to an inbound WhatsApp message is PF-19b's to route (for example a reply flag or class added then), and an entry in the PR's known list. Do not change the gate now.

**R2-m2, Minor: a trunk 0 written without brackets is still a different number.** `+44 07700 900123` keeps its `0` (`ports/consent.ts:56`) and does not match the suppressed `+447700900123`. That form is less common than "(0)". List it as known or strip a `0` after the country code for the codes that use a trunk prefix.

Nothing else in the diff weakens a round-1 "holds" item:
* firm walls are intact (the new table keys on `msg_firm` and every read is `firmScope`d);
* audit detail is still ids and enum words;
* the migration is still additive and `msg_`-prefixed (7 functions; the trigger count grew to 13);
* the stamp is unchanged.

Verdict: Approve

## Round 3 (diff since the Approve): `922474295..92f8982cc` (head `92f8982ccdfb510920df6f4013414236c4b70fac`)

I read only that diff. `4f5e64f9e` changes only `review.md`. The code changes are in `consent-store.ts`, `ports/consent.ts` and the test. I also read the breaker's "Round 2" in `break-report.md` to see what each change answers.

**Runs on `92f8982cc`:** `npx tsx tests/check_pf19a_messages_schema.ts` gave **75 passed, 0 failed**. PF-0p's untracked files were still in the tree.

### What the diff answers
* **R2-1 (Major, breaker): closed.**
  * **How it works:** `record()` now writes a row as withdrawn when a withdrawal at or after its time already exists (`endingWithdrawal`, `ports/consent.ts:199-207`; `consent-store.ts:49-63`). It looks in three places, and the earliest withdrawal found wins:
    * the copied row's own withdrawal;
    * a `msg_consent_withdrawal` row for the copied row's person, channel and purpose;
    * one for the new row's person, channel and purpose.
  * **Why this is sound:**
    * `>=` matches `withdraw()`'s `given_at <= at` and `decide()`'s strict `>`, so all three agree on a tie.
    * `withdrawn_at >= given_at` holds by construction.
    * The two lookups are `firmScope`d and use the `firm_id`-led withdrawal index.
  * **The race case:** a row the record/withdraw race leaves with no `withdrawn_at` can no longer be copied back to life, because the lookup on the copied row's person finds the withdrawal. The gate itself was already right through `decide()`.
  * **The fake** does the same.
  * **Tested:** an older import recorded after an unsubscribe is stored withdrawn, and its Merge copy leaves the other person WITHDRAWN.
* **R2-2 (Major, breaker) and R2-4: closed.** `notInFuture` stores a time inside the 5-minute slack as the clock's now, and still refuses anything later. So:
  * a consent stamped ahead can be withdrawn;
  * a withdrawal stamped ahead no longer blocks a real re-consent.

  Both are tested.
* **R2-6: closed.**
  * The invisible set now covers U+034F, the Hangul fillers and U+2060-206F.
  * A wording needs a letter or a digit after those are removed.
  * Tested with fillers, bidi isolates and combining-accent-only text.
* **My R2-m1: closed as a doc line** on `purposeNeeded` (`ports/consent.ts:174-177`). See R3-m1.

### Left as known (each needs a line in the PR)
* R2-3 = my R2-m2 (`+44 07700…`), R2-5 (no time ceiling in the database; the adapter clamps), R2-7 (non-ASCII addresses refused), R2-8 (fake parity), R2-9 (jurisdiction checked for format only), break 15 (consent locale vs wording locale).
* I accept them all as Minor:
  * Each of R2-5, R2-7, R2-8, R2-9 and break 15 either fails closed or sits behind the only writer, which is the adapter.
* On R2-3:
  * `+4407700900123` is not a valid UK E.164 number.
  * The Italian argument is right against a general trunk-0 strip.
  * A strip for each country that has a trunk prefix (UK +44, Germany +49, and similar) would be safe.
  * PF-19b should confirm what the provider does with such a string before WhatsApp sending goes live.

### New in this diff
**R3-m1, Minor: the reply doc line says PF-19b allows a reply "before asking this gate"** (`ports/consent.ts:175-177`).
* **The card:** AG-10-41 says the reply "passes the consent gate".
* **Failure, read literally:** a STOP-suppressed number that writes in again could get a reply that no suppression check ever saw.
* **Fix:** reword it to "PF-19b adds a reply path that still checks suppression (AG-10-41)". This is doc only and does not block.

**R3-m2, Minor: test gap.** The R2-1 test's Merge copy takes its withdrawal from the copied row itself, which the import already has. So the lookup on the copied row's person (`consent-store.ts:59`) is never exercised, and the test would still pass with it deleted. Add one check: a source row whose `withdrawn_at` was left empty (insert it by SQL, then write a withdrawal row for its person), then copy it, and expect the copy withdrawn.

Nothing in the diff weakens an earlier "holds" item:
* no schema or migration change;
* audit detail is still ids and enum words (`writtenWithdrawn` is a boolean);
* writes are still refused without the caller's transaction.

Verdict: Approve (head 92f8982ccdfb510920df6f4013414236c4b70fac)

## Round 4 (diff since the Approve at 92f8982cc)

Head `34aeabbe94057a390eea2b6534c5d9ed13e40eb6`. I read only the PR's own files: `git diff 92f8982cc 34aeabbe9 -- $(git diff --name-only origin/main...34aeabbe9)`. The merge base is `origin/main` at `40dde3502`. The diff holds:
* `cee7ecd9d`: the doc line, the test and review.md;
* the merge `de7330a6e`;
* `34aeabbe9`: the slot line.

Against main, the PR's only change to `platform.prisma` is the one line `messages MsgFirm?`.

**Runs on `34aeabbe9` (mine):**
* check_pf19a: 76/0;
* check_pf0p_ports: 71/0;
* check_case_feed: 39/39;
* check_prisma_schema: 8/0;
* pf3: 75/0;
* fo1b: 80/0;
* `tsc --noEmit` (api): no error in any PR file or port. The errors it reports are older, in `check_vv_checklist` and `check_x2b`.

I did not repeat fo1a, pf24, g1 or the isolated start; the builder's runs stand for those. Journey test: N/A, no score, as in round 1 (no screen, route or user step).

### What the diff answers
* **R3-m1: closed.** `ports/consent.ts:175-178` now says the reply path "skips only the opt-in, and still checks the suppression list (AG-10-41: the reply passes the consent gate)". That matches the card.
* **R3-m2: closed, and the test bites.**
  * **The test:** `tests/check_pf19a_messages_schema.ts:266-273` adds the raced source row by SQL, live, with a later STOP withdrawal row for its person. It then copies the row to T9.
  * **What it expects:** the copy is stored `withdrawn_via = STOP`, and T9's marketing mail is `WITHDRAWN`.
  * **Mutation, in a scratch worktree:** I replaced the lookup on the copied row's person (`consent-store.ts:59`, `from ? await firstOut(from.subjectKind, from.subjectId) : null`) with `null`. Exactly this check failed, 75/1.

### The slot line (`prisma/schema/platform.prisma:87-88`): agree with keeping the comment
* **The brief's wording:** it said our line "replaces" the slot.
* **What the merged test requires:** PF-0p's merged `check_pf0p_ports` (`slotProblems`) requires each `// back-relation slot: <area>` line exactly once in `PlatformFirm` and `PlatformStaff`.
* **Mutation, in scratch:** I replaced the comment with our line. The test failed: "PlatformFirm: slot messages (PF-19a)".
* **So:** a literal "replace" contradicts the merged test. Keeping the comment and putting the field directly under it is the only reading that passes, and it keeps the slot findable.
* **No schema change:** the field is the same `MsgFirm?` back-relation as at the Approve.
* **Merge safety:** the blank line under it is kept, so the next slot is still separated. I ran a 3-way `git merge-file` of our head against a sibling branch from main that fills `money (FO-7a)`, and one that fills `compliance (FO-13)`. Both merged clean.
* **`PlatformStaff`:** its messages slot stays empty. That is correct: no `msg_` model points at staff by key.

### Fit with PF-0p's ports as merged on main
* **Imports now resolve on main's files.** At `92f8982cc`, `ports/audit.ts` and `ports/clock.ts` were not in the tree (round 3 ran with PF-0p's untracked copies). Now they come from main, and `tsc` and the suites pass against them, so that dependency is closed.
* **Audit entities:** all four `AuditPort.record` calls (`consent-store.ts:73-74`, `100-101`, `120-121`, `154-155`) use literal `msg_` entities. These are `msg_consent`, `msg_consent_withdrawal`, `msg_suppression` and `msg_consent_wording`, and all four match `AREA_ENTITY` (`ports/audit.ts:28`).
  * **The entry fields:** each entry carries exactly the fields of `AuditEntry`'s strict object. The summaries are under 600 characters and never name a case. The details are ids and enum words.
* **The sweep reads them:** `check_case_feed` reads these calls. Mutation in scratch: `entity: "suppression"` failed it at `consent-store.ts:120`.

### New in this diff
None: no Blocker, Major or Minor. The merge brought no change to the PR's migration, its other schema file or the store. `20261114190000_pf19a_platform_messages` is still the last migration. The known items from round 3 stand as listed there.

Verdict: Approve (head 34aeabbe94057a390eea2b6534c5d9ed13e40eb6)

## Round 5 (re-stamp; diff since 764b14ece)

Head `799ae710c2dbaff98d5598b0e70767fefbb238df`, which is also the remote branch head. The last Approve was at `764b14ece7380edb5ae5f4685cd607c952b9cb9f`. The diff holds two commits:
* `548a660b7`: merges origin/main at `2b7fe0060` (PF-21 #1753). That is still origin/main's tip and the merge base, so main has nothing past it.
* `799ae710c`: the re-stamp to Lead 50's slot `20261115004500` (PR comment 6883915878, P-600 (4)).

I read only the PR's own files, with `git diff -M 764b14ece 799ae710c -- <PR files>`. That filter lists only the new migration path, so git shows the migration as 433 added lines. Run on the migrations folder, `-M` shows the real change, a rename.

**What changed in the PR's files since the Approve:**
* the folder rename;
* `prisma/schema/platform-messages.prisma:9`, the header comment's stamp;
* `tests/check_pf19a_messages_schema.ts:23`, `NEW`.

Nothing else changed. `consent-store.ts`, `ports/consent.ts`, `platform-consent.ts`, `messages-firm.ts`, `index.ts` and the slot line are unchanged.

### The five checks
1. **The rename is 100%.**
   * `git diff -M --summary` says `{20261114190000_pf19a_platform_messages => 20261115004500_pf19a_platform_messages}/migration.sql (100%)`.
   * Both blobs are `ac9c93572f55eb6c9d3c7ad842eb542b6f6e80a9`, sha256 `2cf39683…cb157e1d25` for both, mode 100644. The SQL is byte-identical.
   * The folder holds only `migration.sql`, and no `20261114190000` folder is left in the tree.
2. **The stamp is later than every migration on main.**
   * Main's newest migrations are `20261114230000_pf25_web_address` and then `20261114234500_pf21_complaints`. `20261115004500` is later than both.
   * No folder on origin/main or at head shares the 14 digits. Nothing even starts `202611150045`.
   * At head, ours is the last folder before `migration_lock.toml`.
3. **No stale reference is left.** `git grep 20261114190000 799ae710c` finds the old stamp only in `review.md` and `break-report.md`, which are records. It is in no code, schema or test file.
4. **The merge brings nothing that conflicts with this PR's schema.**
   * Against main, the PR's only change to `platform.prisma` is still the one line at `:90`, `messages MsgFirm?`. It sits directly under `// back-relation slot: messages (PF-19a)` (`:89`), with the blank line kept before `money (FO-7a)`.
   * PF-21's own lines fill only its own slots: `platComplaints` at `:96-97`, and `platComplaintsHandled` in `PlatformStaff` at `:235-236`. PF-25's lines are at `:101-103`.
   * No other schema file defines a `Msg*` model or a `msg_` map. The other `messages` field (`links.prisma:39`, `DemoMessage[]`) is on another model.
   * Only one other migration mentions `msg_`, the FO-1a migration (`20261114153000_fo1a_front_office_sales/migration.sql:5`). That is a comment that hands consent to PF-19a, not a name.
   * PF-21's and PF-25's migrations create no `msg_` object.
5. **The migration still applies after PF-21's.** I ran both suites on `799ae710c`. The local Postgres is at 127.0.0.1:54329, and port 4400 was not touched.
   * `check_pf19a_messages_schema`: **76 passed, 0 failed**. The stamp check reads "later than every one before it (newest before it: 20261114234500_pf21_complaints)". The scratch databases were dropped afterwards, and none is left.
   * `check_prisma_schema`: **8 passed, 0 failed**. The migrations give the schema, apart from the 5 known differences.

### Findings
None: no Blocker, Major or Minor. The known items from round 3 stand as listed there.

Journey test: N/A, no score, as in rounds 1 to 4. This PR has no screen, route or user step.

Verdict: Approve (head 799ae710c2dbaff98d5598b0e70767fefbb238df)
