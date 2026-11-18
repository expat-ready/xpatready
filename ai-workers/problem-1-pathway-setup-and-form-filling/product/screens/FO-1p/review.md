# FO-1p — review (reviewer, 18 Nov 2026)

PR #2138, branch `claude/awesome-thompson-z31fq6`, **commit 6f65706d0**, against `origin/main` (merge base 15c75cd52; it merges cleanly onto main 9cea7c02d). Read against the brief `lead-b-front-office:…/lead-b-briefs/FO-1p.md` (DW1–DW6, touch list) and the tech lead's rulings: a COMPANY client gets an fo_company; no auto-link by email; a prospectId returns that prospect's own party; the actor is typed.

**Adapted skill.** This row adds a port with no screen, no route and no schema. So I skipped the browser walk, the 1024 px and 200 % zoom pass, the menu and words check (§3–§4), the BIC-01–20 scorecard and the screen-only D-dimensions. All of these are N/A. I reviewed the code, the contract and the data instead. The journey test is in `journey-test-reviewer-2026-11-18.md`: **8.5/10, no criterion at 0 (pass).**

## What I ran (studio folder, node 24.21, Postgres :54329)
* `tests/check_fo1p_person_port.ts`: **30 passed, 0 failed** (fake 10/10, PrismaFoPerson 10/10 as xr_app under the walls).
* The neighbouring suites, unchanged:
  * FO-1a 124/0, FO-2 113/0, FO-2b 61/0, FO-9a 53/0;
  * `check_case_feed` 39/39 (the audit sweep accepts the literal `entity: "fo_person"` / `"fo_company"`);
  * `check_pf0p_ports` 120/0, `check_fo9b_port` 20/0, `check_features_registry` 27/0.
* `check-port-contracts.mjs`: 0 problems, `FoPersonPort ×2`. `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0.
* `tsc -p api`: no error in the touched files.
* `module-cards`: red only on the front-office card, which is 42 lines on the base. On the merge with today's main (#2114) the card is 40 lines, so it passes. The features card is covered by the PR's `Card unchanged:` line.
* My own probes (scratchpad; temporary file deleted, nothing tracked changed):
  * a DELETED / ABANDONED / PROVISIONING firm with no setup row;
  * an unknown firm;
  * **3 first calls at once** in a firm with no setup row: all ok, 1 setup row, seeded, 16 stages, 2 persons;
  * a firm-A transaction given firm B's id: refused, nothing written;
  * names with a line break, NUL or no letter; a 5,000-character phone; a `person:` actor; companies "Ltd.", "²", "Co. Inc.";
  * a not-won prospect: returns its person;
  * FOR SHARE: an UPDATE of the prospect waits, then times out (lock held).

## Done when, line by line
| Line | Proof | Would it fail if broken? |
|---|---|---|
| DW1 fields, typed `created_by`, rollback leaves none | contract cases 1–3 + forced audit failure (test:133-138) | Yes. Mutant "own transaction" fails exactly the rollback case (test:60-64); a changed `createdBy` or email case fails case 1. |
| DW2 same email gives a new person; FO-9a flags the pair | contract case 4 (test:81-86) + test:125-131 | The no-link rule: yes (mutant `linksByEmail` fails DW2 alone). "Flags the pair" is only `≥1`: see m4. |
| DW3 won prospect gives its party; kind mismatch 409 | contract cases 5–6 | Yes (party id, row counts and audit count are compared). |
| DW4 firm B's prospect is 404, nothing written | contract case 8, under the walls | Yes. The adapter also filters `firm_id` itself (adapter:49), so the walls are not the only guard. |
| DW5 no setup row: made once | contract case 9, as xr_app | Yes. Without `setup()` the FK refuses the person. Concurrency held in my probe. |
| DW6 the fake passes the same contract; ids only | `fakeFoPerson` 10/10; `noPersonalData` checks name, email and phone | Yes. `AuditDetail` also refuses email-shaped values. |
| Suites unchanged | above | n/a |

Rulings: COMPANY gives `fo_company`, no contact, no person (contract case 7). No auto-link (DW2). prospectId gives its own party with no row and no audit line (case 5). Typed actor: `AuditActor`, and the database types `staff:` as FIRM_STAFF and `system:` as SYSTEM (test:141-144). Only the caller's `tx` is used: the adapter, `seedFirmFrontOffice` and the audit adapter all write through it. `ports/` imports only zod and its own folder (test:157-160). The touch list holds: the 7 files plus the `qa/built` note, nothing beyond it.

## The PR's own decisions
* **`AuditActor` without `person:`.** Sound. The same AuditPort would refuse a `person:` line anyway, so accepting it here would only move the failure. Question 1 is the right route.
* **displayName stored as given_names when no part is given.** Sound with no schema change. When parts are given, displayName is dropped (documented at port:32).
* **A not-won prospect returns its party.** Acceptable: it is the same party, and FO-8 is the only caller. The contract does not pin it. That is fine, because fake and adapter agree.
* **The extra `FoPersonInvalidInput`** (400, a bug in the caller). Sound. It is tested, but the claim "keeps a bad input from reaching a database error" is not fully true (m2).

## Findings
No Blocker. No Major.

**m1 (Minor).** The adapter raises unnamed errors where the fake succeeds. Where: `api/src/front-office/people/fo-person-port.ts:56-58,28`, `firm-seed.ts:88,97-98`, `ports/fo-person.ts:130,141`.
* **Scenario:** a DELETED or ABANDONED firm with no setup row. `seedFirmFrontOffice` declines, and `foPerson.create` then throws a raw Prisma FK error.
* The same happens for an unknown firm ("firm-seed: … is no platform firm"), and for a caller whose walled context is another firm. That last case is refused, which is safe, but with the same misleading text.
* The fake makes a person in all three cases, so the contract's fake and adapter disagree. CS-K1 part 2's backfill over existing clients would hit this, and only on the real database.
* **Fix:** a named refusal (for example `FoPersonNotFound("No such firm.")`, or a `FoPersonFirmClosed`), the same in the fake, plus a contract case.
* **Fail test:** a DELETED firm → `expectRefused(…, refusedAs(FoPersonNotFound))` and nothing written.

**m2 (Minor).** The port's text rule is looser than FO-2's, on the same table. Where: `ports/fo-person.ts:25-26,33,39` vs `sales/common.ts:17-31,46` (AG-2-49 rule 5).
* A display name with a line break, or with direction or invisible marks, is stored.
* "--" is stored with an empty `name_key`, so FO-9a's name match cannot flag it.
* A phone has no length limit (5,000 characters stored; FO-2 allows 40).
* NUL reaches a raw Postgres error.
* A company named "²" passes `hasWord` (`\p{N}`) but fails `fo_company_names_check`. FO-2b has the same edge.
* **Fix:** in the port schema, refuse control and line-break marks, require a letter or digit in `displayName`, and allow at most 40 characters for a phone.
* **Fail test:** `displayName: "Client\nA"`, `"--"` and `phone: "1".repeat(41)` each → `FoPersonInvalidInput`, nothing written.

**m3 (Minor).** "A Change type waits for the caller's commit" has no test. Where: adapter:5, adapter:49. Removing `for share` passes all 30 checks. My probe shows the lock is held.
* **Fail test:** open a transaction, call with prospectId, then run an UPDATE on that prospect with `lock_timeout 500ms` → it times out.

**m4 (Minor).** DW2's "FO-9a flags the pair" is checked as `matches + hidden >= 1`. Where: `tests/check_fo1p_person_port.ts:131`. The old person alone already gives that, and `hidden` is a 0/1 flag. The pair is proven only by the row count.
* **Fix:** check the duplicate result as a seeing-all actor, and assert that both person ids are in `matches`.

**m5 (Minor).** The fake's default phone normaliser disagrees with the adapter's. Where: `ports/fo-person.ts:101-104`.
* "+1 555 0101": readable in the fake, unreadable in the adapter. "1234567": the reverse (libphonenumber gives `+11234567`).
* The contract uses only numbers on which both agree (contract:46,60). A caller's test on the fake can draw the wrong conclusion.
* **Fix:** state it at `fakeFoPerson`, or have the harness pass the adapter's normaliser. This is a note, not a new behaviour.

Size: 569 lines, against about 350 in the brief. The extra lines are dense tests, not scope.

## Could not check
* A real case opening (CS-K1 part 2 is not built).
* A seed with released combinations under xr_app. The scratch database has none, but the configuration tables are not walled.
* A founder or user walk: D17/D20 are N/A for a port.

## Re-review (diff 6f65706d0..00883c41b)
I re-reviewed only the diff, at 00883c41b. `tests/check_fo1p_person_port.ts`: **35 passed, 0 failed**. The diff touches only the port, the contract, the adapter, the test and the `qa/built` line, plus these two review files (unchanged). No other suite's inputs change. The port guard passes inside the suite.

Each finding is closed by a test that fails without the fix. I re-checked by mutation myself, and reverted each change:
* **m1, closed.** `setup()` now does two things. It reads `platformFirm` under `ownFirm` before seeding: a firm that is unknown or walled away is `FoPersonNotFound(NO_FRONT_OFFICE)`. It then checks the setup row after the seed: a DELETED or ABANDONED firm, which FO-1a seeds none for, gets the same error.
  * The fake's `closeFirm` matches this, and the new contract case `firmThatLeft` runs on both.
  * Without the post-seed check, the contract case fails (33/35). Without the platform-firm check, the walled-firm check fails (34/35).
  * Note, not a finding: the fake cannot know platform firms, so it still accepts an unknown firm as a "firm without setup". That is the DW5 hook, and it is documented.
* **m2, closed.** FO-2's text rule is copied into the port: one line, no control, direction or tag marks (NUL included), a letter or digit, and a phone of at most 40 characters.
  * An optional part with no word is empty, as in FO-2's `text()`.
  * Company `hasWord` now uses `\p{Alphabetic}\p{Nd}`, which is ICU `[[:alnum:]]`, so "²" is refused before the database.
  * The regex literals are plain escapes now. Seven new refusals are in the contract.
* **m3, closed.** The new test shows a 500 ms `lock_timeout` while the caller's transaction is open, and that the update runs after commit and after a plain read (the control). Without `for share` it fails (34/35).
* **m4, closed.** `fo_sales_person_matches … where by_email` must return exactly the two ids. The staff check is asserted as `hidden === 1`, with no person named. The builder's reason for not using a seeing-all actor (`seen` needs a lead) matches FO-9a's service (service.ts:69).
* **m5, closed as documented.** A note at `fakeFoPerson` names the differing forms and how to pass the adapter's `phoneE164`.

No new Blocker, Major or Minor.

Verdict: Approve 00883c41bd1f0c1b30d410706cd6c459d13d82a5
