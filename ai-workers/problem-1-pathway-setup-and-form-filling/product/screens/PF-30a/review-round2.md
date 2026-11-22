# PF-30a re-review, round 2: FindPort, the find door and the front office's finder (PR #2884)

Independent re-reviewer, fresh context (I did not build this or review round 1). Reviewed commit `8bea1f6d5c83c8131264404293f346fb787eddf7` on `claude/runtime-pf30a`, 21 Nov 2026. This re-review reads only the diff (P-277): `git diff 62fe3273d8a5c81e81e4f550d8a0cabbe7592dfb 8bea1f6d5c83c8131264404293f346fb787eddf7 -- …/prototype/studio`, which touches 5 files, +72/-21. Inputs: round 1's `review.md` and `break-report.md`, and the builder's answer (PR comment 7070653562). The row is API only, so the screen-review UI parts are N/A.

## What I ran (US$0, no live AI)
* At head, `tests/check_fd1_find.ts` gives **59 passed, 0 failed**, the same as the builder.
* **Old code with the new tests.** I extracted the round-1 sha (62fe327) into the scratchpad, swapped in the new test file and ran it: **51 passed, 8 failed**. The 8 that fail are the new or changed lines: breaker m1, m2, m4, review M1, breaker M1, review m3, review m4. The eighth is the slow-finder line, because on the old code the front office itself went past the 400 ms budget once the crowd rows were in. So the new tests catch the old code.
* **Probe (scratchpad copy only, repository not touched).** I added a Cyrillic person (Иван Петров), a Hebrew-named person (שרה Levi) and the existing 李 明, then searched "04", "043", "05" and "0674":
  * head: each search names those people as NAME hits;
  * old sha: each search returns `[]`.
  * This is finding M1 below.
* **Live :4487.** I could not re-run round 1's live repro. The isolated copy now has an empty database: R's and T's lead lists are `[]`. `POST /api/front-office/leads` answers 500 (Prisma P2003 at `sales/arrival.ts:63` in `var/isolated-runtime_pf28/api.log`), so I could not add the crowd. The same repro, 57 older "Ann…" people of another owner plus T's own Anneliese, runs in the test database instead: it fails on the old sha and passes at head.

## Check (1): M1 from round 1, visibility inside every capped read. Fixed.
* **People prefix read.** `api/src/front-office/find.ts:63,76`: the `take: 50` read now ANDs `personWhere`. That is one of:
  * a lead matching `leadsSeenWhere(ctx, vis, inactive)`, the same function the lead lists use (`sales/source-filter.ts:21`);
  * a prospect as subject, with `prospectWhere`;
  * a prospect as primary contact, with `prospectWhere`.
  
  `prospectWhere` (`find.ts:60`) is the prospects' own-or-all rule (`prospects.ts:128`: `vis.seesAll || owner === ctx.staffId`). A view-all caller gets `some: {}`, so people with no lead or prospect never fill the cap. This is breaker M1, and it is tested at `:172-173`.
* **Prospect numbers.** `find.ts:110` spreads `prospectWhere` into the capped read.
* **Company prefix.** `find.ts:124` adds `prospects: { some: prospectWhere }` and an `orderBy`. This matches the later `if (!p) continue` (`:133`): a company with no prospect the caller may open was never shown anyway.
* **Nothing new is opened.**
  * Every new filter only narrows a read that feeds the unchanged post-filters (`seeLead`, `seeProspect`, `seesCompany`, `:91-92,131-132`).
  * The one widened post-filter is `seeLead` (`:57`), which now treats a deactivated owner's lead as Unassigned. This is the same rule the lead detail route uses (`leads.ts:115-116`), so anything found can be opened, and nothing beyond that.
  * `inactive` is `[]` for a view-all caller, who sees every lead anyway.
  * Both readings of `leadsSeenWhere` agree on view.own, Unassigned-visible and view-all.

## Check (2): the new tests. They fail on the old code and pass now (see above), with one gap (m1 below).

## Check (3): the minor fixes
* **`agent/prospect:show` gate.** Correct. `find.ts:52` returns before any read, and there is a pass and a fail at `:174-175`.
* **Dropped-finder log.** Correct. The registry line is `find: finder <module> dropped (<TIMEOUT|ERROR|SHAPE>)` (`registry.ts:20`):
  * the module name is regex-checked at `register`;
  * the reason is a closed enum;
  * no error text or query reaches it (`ports/find.ts:101-106`);
  * the test plants an error that quotes the query and checks that the line holds only the module and the reason word.
  
  A late rejection after the timeout is already handled by `Promise.race`, so there is no unhandled rejection and no second log.
* **400 for every bad length.** Correct. `routes.ts:14` takes `q` as any string, and `routes.ts:23` answers 400 `QUERY_LENGTH` for missing, short or long text. An array is still 422 "must be text" (PF-28). The schema has no upper bound, but Node's header limit still applies; that is acceptable.
* **Length counted in code points.** Correct (`ports/find.ts:23`), and the same as the house "characters" rule.
* **`nameKey` needs 2 letters or digits.** Correct (`ports/find.ts:52`). "a." and "a%" give `""`, and the company side has the same 2-character floor (`find.ts:121`).
* **Non-Canadian phone.** It adds FO-9a's "possible from its country code alone" re-check (`find.ts:41`). Latent, and fine.
* **The ASCII/accent-folded prefix rule is a regression.** See M1.

## Findings

### Blocker
None.

### Major
**M1. The new prefix rule lets typed digits match the hex escapes of non-Latin names, so "04" finds every Cyrillic-named person.**

*Where:* `api/src/front-office/find.ts:75`. The old guard was "no prefix when the key holds a digit" (`!/[0-9]/.test(name)`). The new guard is "the accent-folded text is ASCII", and digits are ASCII.

*Why it matches:* a non-Latin letter's name key is `0` + its code point in hex (`ports/matching.ts:21-23`: "A key with a digit matches only exactly (hex digits are shared by unrelated letters)"). A typed ASCII key such as "04", "05", "06" or "0674" is therefore now a `startsWith` or ` contains` prefix of those escapes. Probe results at head:
* "04" and "043" name Иван Петров (Cyrillic block U+04xx);
* "05" names שרה Levi (Hebrew block U+05xx);
* "0674" names 李 明.

Each is a NAME hit at rank 700. The old sha returns nothing for all four.

*Why it matters:*
* People type short digit fragments into a find box: part of a phone number (Australian mobiles start 04, Israeli ones 05), a year or month, part of a file number.
* Each such search now lists unrelated clients as name matches, and can fill the finder's 8 slots.
* It breaks the shared FO-9a key rule.
* It contradicts the code's own comment (`find.ts:73-74`: non-Latin keys "match by FO-9a's exact key").
* The test at `tests/check_fd1_find.ts:127` claims "a non-Latin letter is never read as a prefix of another", but it only checks a non-ASCII query.

No record is exposed: visibility still applies. This is a wrong answer introduced in this round, not a leak.

*Fix:* run the prefix read only when the typed key cannot line up with an escape. An escape always starts with `0`, so require `!name.includes("0")` as well as the ASCII test. That keeps "zelda5", "Annalise1" and "José". Any key with a `0` falls back to FO-9a's exact key, as before. Add fail tests: "04" does not find a Cyrillic-named person, and "05" does not find a Hebrew-named one. Keep "zelda5" as the pass.

### Minor
* **m1. The M1 test does not prove the prospect-number or company part of the fix.**
  * `tests/check_fd1_find.ts:167-171`: `find(T, "P-0")` already finds T's prospect on the old sha, because the scratch firm has only about 4 prospects (the crowd has leads, not prospects). The line fails on the old code only because of its person half.
  * No test crowds companies at all.
  * The code is plainly right (`find.ts:110,124`), so this is Minor.
  
  *Fix:* add more than 50 of R's prospects (or companies with R-owned prospects) whose numbers or names sort before T's, then assert that T still finds T's own.
* **m2. The person trigram call is still capped before the prospect rule.** `fo_sales_person_matches` (FO-9a migration `20261117030000`) orders by lead visibility (`seen`) first and stops at 50. A person the caller may open only through a prospect can still be crowded out of a typo-only (trigram) match. Prefix, email and phone are not affected. This is the same class as the company trigram cap the builder already disclosed. *Fix:* when a migration next touches FO-9a's functions, add prospect ownership to `seen` (a follow-up row for the tech lead, together with the company one).
* **m3. A small cosmetic overlap.** For number-shaped text ("P-0"), the person prefix now also runs on the name key "p 0". This is harmless today, and M1's fix removes it.

## Items the builder left as they are: acceptable as Minor
* **Reviewer m2** (the prospects' rule restated, now as `seeProspect` and `prospectWhere`, `find.ts:58,60`): acceptable. It is one line beside its source, and exporting it would mean editing another row's file. Worth one shared predicate when `prospects.ts` is next touched.
* **Reviewer m6** (the firm-wall test runs as superuser): acceptable. Round 1 checked the walled `xr_app` copy live, and `firmScope` is in every read in this diff.
* **Breaker m3** (an unknown key is named in the 422): acceptable. It is PF-28 house behaviour, capped at 64 characters, and not logged.
* **Breaker m5** (a dropped finder is not aborted): acceptable for now. It should become a named follow-up (an AbortSignal through FindPort) before CS-S1 adds a second finder.
* **CJK partial names**: acceptable. This is FO-9a's exact-key design.
* **Company trigram cap**: acceptable. The prefix read is filtered, and only typo matches can be crowded. The person trigram cap (m2) should go into the same follow-up.

## Journey score (reviewer, API only)
Re-scored on what this round changed: the test-database journeys, the probe, and round 1's report (`journey-test-reviewer-2026-11-21.md`). No separate report was written: the caller scoped this re-review to this one file.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | A view.own caller finds their own person among 57 older matches; a view-all caller is not crowded by people with no lead |
| Next step obvious | N/A | No screen |
| Plain words | 1 | "Type 2 to 100 characters to search." and the partial line |
| Feedback and state | 1 | The partial line on a drop, now with a log line |
| Correct data | ½ | Own records found and nothing extra shown, but "04" or "05" name unrelated people (M1) |
| Error recovery | 1 | 400 for every length, 422 for a bad key, no echo |
| Accessibility and sizes | N/A | No screen |
| Speed | ½ | Within budget in tests; not re-checked live (the :4487 copy is empty) or at production size |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Matched-on reasons given; nothing labelled AI |

That is 6/7 applicable, **8.6/10 scaled** (a pass, no criterion at 0).

## Could not check
* The live :4487 repro (empty database, 500 on Add a lead).
* The 400 ms budget at production size.

Verdict: Changes
Reviewed sha: 8bea1f6d5c83c8131264404293f346fb787eddf7
Fix M1 (the digit/hex prefix regression, with its fail tests); m1-m3 at the builder's choice.

Reviewer: Changes 8bea1f6d5c83c8131264404293f346fb787eddf7
