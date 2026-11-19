# AUD-5 part 2 — independent review (Opus, P-303)

**Commit reviewed:** `94d27d3cae4d05badcf63038a8fd572cbd1e1aa7` (branch `claude/happy-lovelace-p1mlh5`), against brief `build-lead-c-briefs/AUD-5-2.md` (on `claude/build-lead-c-647b40`) and "Part 2 (AUD-5b)" of `design/briefs/AUD-5.md` on `main`. API-only (no screen, no route): the code and tests were reviewed, not a UI. Date 19 Nov 2026.
**Note:** someone else edited the shared checkout's working tree during this review (uncommitted edits to the same 4 files; `break-report.md` is in this folder). Every result below comes from a clean copy of `94d27d3`, checked byte for byte against `git show`. I did not read the uncommitted edits or judge them.

**Verdict: Ship after fixes (Block).** Three Majors, all the same kind of fault: a legal hold that covers the record does not win (BR-7, BR-12).

## What I ran (clean copy of 94d27d3, Postgres 127.0.0.1:54329, never :4400)
* `tests/check_aud5_check.ts`: 38 passed, 0 failed. `tests/check_aud5_keep_periods.ts` (part 1, unchanged): 57/0. `tests/check_pf21b_port.ts`: 32/0. `tests/check_pf0p_ports.ts`: 120/0. `tools/check-port-contracts.mjs`: exit 0. `tsc -p api/tsconfig.json`: no errors in the changed files.
* Mutation pass. I removed one rule at a time and re-ran the new suite:
  * Caught: removing the subject-kind gate; renaming the unknown-class code; putting the College's 6 in as a default; dropping the CASE subject.
  * Caught only by the source-text check at test:179: reading the setting through `this.db` instead of `tx`.
  * **Not caught (38/38 still pass):** dropping the DATE subject, the CATEGORY subject, the PERSON subject or the FIRM subject (keep-period.ts:147-150); dropping the invisible-filler strip in `warnReason`; changing `now < until` to `<=`.
* Break probes on the fake (scripts kept in the scratchpad only).

## Builder choices, judged
1. **Optional `KEEP_CHECK_HOLDS` token, `KeepCheckNotBuilt` when nothing is wired (service.ts:81, 94).** Sound. The feature registers `providers: [KeepPeriods]` only, so check() refuses in production until PF-21b part 2 wires it. It is never a silent OK. Limit: the real-adapter run uses `bridge` (test:115), which opens its own fake transaction and ignores `tx`. So "the shared lock is held until the deleter commits" is not proven on the real path. PF-21b part 2 must run `keepPeriodCheckContract` against its real adapter.
2. **Part 1's test unchanged; the fake's unwired `check()` still throws.** Accepted. Test:51 pins that exactly that one part-1 case fails on a wired fake.
3. **String subject accepted by the TS type, refused at run time (keep-period.ts:117).** Accepted. Test:55 tests it.
4. **SUBJECT_KINDS, plus FIRM and DATE subjects on every record.** FIRM is harmless but redundant, because a FIRM hold matches any subject. DATE and CATEGORY are where the Majors below come from.
5. **No MODULE.md line (P-712).** Accepted on the Lead record (`build-lead-c-state.md:236`, "minus the MODULE.md line"). The PR body must carry `Card unchanged: P-712 …` or `module-cards` CI fails (STANDARDS §2 [M]). `check_aud5_check.ts` is not in the card's Tests list either.

## What held
* BR-7 order: the hold comes first, and an adapter that checks the floor first fails DW9 (test:58-66). Every matching reason is returned, oldest first, and a first-hold-only adapter fails DW10.
* Another firm's hold never counts: DW11 has a broken adapter, and break: cross-firm returns WARN.
* The firm comes from the session: `checkFor` refuses a body that names a firm (service.ts:103-106), and the strict schema refuses any extra key.
* Refused in words: an unknown class, a REFERENCE row and a subject kind with no hold check each get the exact words from the brief ("…has no hold check yet, so it cannot be deleted.").
* The College's number never decides anything. WARN needs a reason: empty, whitespace, U+200B and Hangul fillers are refused; a 501-character reason is refused; Japanese is accepted.
* Date maths: whole UTC years, 29 Feb rolls to 1 Mar. DW6 gives FLOOR until +6 years at 5 years and OK at 7. The activity log is a FLOOR at any setting.
* No answer says "legal obligation" or "required by law".
* One transaction: check() opens none, and the setting is read through `tx` at READ COMMITTED.
* Each of DW6-DW11 has a pass and a fail that really fails.

## Issues (ranked)
**Major 1 (Must): a category hold on part of a client file does not hold the file.** `ports/keep-period.ts:150` adds only `CATEGORY case_files` for `closed_client_file`.
* Scenario: Firm A has a CATEGORY hold on `case_documents`. Check `closed_client_file`, subject CASE c, closed 8 years ago. The answer is **OK**, but deleting the file deletes its documents, so it should be HELD.
* The same happens with `case_answers`, `case_notes` and `case_tasks`: all of CS-X3's case-side categories are inside a client file (CS-X3.md:40).
* Fix: push every case-side `LEGAL_HOLD_CATEGORY` name for a closed client file, and add a contract case for it.

**Major 2 (Must): the class-to-subject map has no failing test except for CASE.**
* DW9 places only a FIRM hold (contract:87), and a FIRM hold matches any subject. So "HELD for every class" says nothing about each class's subjects.
* The harness's `placeHold` cannot even place a CATEGORY or PERSON hold (contract:69).
* Removing the DATE, CATEGORY or PERSON line at keep-period.ts:147-150 keeps 38/38 green. That is a deletion rule with no failing case (P-606, D16).
* Fix: for each class, a hold of each scope it maps to (DATE_RANGE over `startedAt` for every class; CATEGORY for the closed file; PERSON for `client_financial` and `activity_log`), plus a broken adapter that sends only `[FIRM]`.

**Major 3 (Must, or a recorded ruling from the tech lead): the input cannot name the record's own date, or both its case and its person, so a hold over either is missed.** keep-period.ts:107-114 and 147.
* (a) A DATE_RANGE hold for Mar-Jun 2020. An invoice dated Apr 2020 is checked as `our_billing` with `startedAt` = its fiscal-year end, 31 Dec 2020. It is not HELD: FLOOR today, OK from 2027 on.
* (b) A PERSON hold (SA-11-40) on Client A. Client A's closed file is checked as CASE and gets **WARN**, so it goes ahead with a reason. Asking as PERSON is refused (`NO_HOLD_CHECK`).
* (c) PF-11c's purge cannot send `ALL_FIRM_DATA`.
* CS-X3 step 1 asks holds itself, but PF-21d's erasure and the FO deletes would rely on check() alone.
* Fix: ask "Question for the tech lead" on the PR. Either widen `KeepCheckInput` (record date, the case and the people named), or record in the PR body that every named caller must ask `isHeld` for those itself.

**Minor 1 (Should): `warnReason` accepts NUL, a lone surrogate and bidi overrides** (keep-period.ts:182-187), which part 1's `reasonOf` refuses (service.ts:63, part 1's breaks m1 and m2). Postgres refuses `\u0000` in the audit line's JSON, so the deleter would get an error, not words. The transaction rolls back and nothing is lost. Fix: one reason rule shared by both.

**Minor 2 (Should): reading the setting through `tx` is proven only by a regex over the source** (test:179). The mid-request test passes with `this.db` too. Fix: write the setting uncommitted inside the deleter's transaction and assert that check() sees it.

**Minor 3 (Should): `checkFor` calls `ask` "a body"** (service.ts:101-105). If a later door passes the request body straight in, the client picks `class` and `startedAt`; for example `our_billing` with 1990 gives OK. Fix: one sentence saying class, start date and subject come from the stored record, never the request.

**Minor 4 (Should): words.**
* The INVALID_INPUT text includes zod's own message ("Invalid input: expected date, received string", keep-period.ts:144).
* The billing FLOOR answer drops the row's "Unconfirmed: no counsel" (keep-period.ts:162; AGENTS rule 4).

**Minor 5:** the DW7 "invisible only" input `"​\t"` is refused by the `\p{L}\p{N}` test anyway, so the Hangul-filler strip has no failing case.

## D1–D20 (API-only; screen dimensions N/A)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 3 | Order, all reasons, firm wall and refusals are met. BR-7 "a hold wins" is broken for category, date and person holds (Majors 1 and 3). |
| D2 Data integrity | 3 | Refused deletes delete nothing (DW7 fail). A held record can still get OK. |
| D3 Reuse | 4 | `answer()`, `readSetting` and the table are reused. Two reason rules (Minor 1). |
| D4 Rule integrity | 3 | Unknown class and REFERENCE are refused. The subject map is incomplete. |
| D5 Stability and recovery | 4 | Everything runs in one transaction and rolls back. A NUL reason gives an error, not words. |
| D6 Governance | 4 | The WARN reason goes on the delete's audit line, trimmed. |
| D7 AI trust | N/A | No AI. |
| D8-D13 | N/A | No screen. Words are scored under D10 only: 3 (Minor 4). |
| D14 Team look | N/A | No screen. |
| D15 Speed | 5 | One hold read and at most one setting read per check. |
| D16 Testability | 3 | Each of DW6-DW11 passes and fails. The subject map is untested (Major 2). |
| D17, D20 | Simulated only | No intended user walked it. |
| D18 Provenance | 4 | HELD carries reason, placedBy and placedAt. FLOOR carries the row's words. |
| D19 Closure | N/A | No caller yet, by design. |

**BIC-01–BIC-20:** N/A. No case-side screen (the brief says "no screen").
**Graph (P-86):** not run. It rewrites `qa/GRAPH.md`, and this change adds no page or route. Its one capability, check(), is named by `check_aud5_check.ts`.
**Journey score (reviewer, the one score for this check):** 7.5/10, Fail on correct data. See `journey-test-reviewer-2026-11-19.md`.
**Could not check:** the real LegalHoldPort's lock (not built); the PR body (caller rows, `Card unchanged`, PF-21d floor note); full `ci`.

**Verdict: Block.** Fix Majors 1-3 (Major 3 can instead be closed by a recorded ruling from the tech lead, put in the PR body); the Minors should be fixed.
