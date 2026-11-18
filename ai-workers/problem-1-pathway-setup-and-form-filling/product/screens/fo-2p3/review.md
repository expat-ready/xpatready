# Review: FO-2 part 3, prospects (API only), commit d09490d99

Verdict: Changes needed (Block). Reviewed `git diff origin/main..d09490d99` (base 15c75cd52) against the wave 1 Sales start sheet (`origin/lead-b-front-office`, "FO-2 part 3": Build, DW1-DW6, touch list), AG-2-26, AG-2-44, AG-2-47 and AG-2-75, contracts §2.1 and §2.6 (+ §7 on the Lead B branch), and FO-1a's schema and triggers. Independent reviewer; I did not build this. Note: commit 2d0c3128d ("breaker fixes: race losers get 409 not 404 …") landed on the branch while I was reviewing. This verdict covers d09490d99 only. The new head needs a diff-only re-review.

## What I ran
* `tsx … check_fo2p3_prospects.ts`: **40 passed, 0 failed** (about 8 s, scratch database made and dropped).
* Unchanged suites: FO-2 (113/113), FO-2b (61/61), FO-2v (14/14), FO-6 port (16/16), PF-6b (31/31, with its new sweep rows), FO-4sf (34/34, on an isolated copy on :4431, runtime range, stopped afterwards; screenshots it rewrote restored), `check-module-cards.sh` PASS.
* My own probes, from the scratchpad and not committed: three races in-process, plus the API journeys over HTTP on :4431 (`journey-test-reviewer-2026-11-18.md`).

## Findings
### Major
**M1. A race loser gets 404 "No such prospect", not 409.** Applies to move, Mark lost, Convert and Undo (`api/src/front-office/sales/prospects.ts:158-163`). `locked()` runs `select … from fo_prospect p join fo_stage s on s.id = p.stage_id … for update of p`. Under READ COMMITTED, a transaction that waits on the lock re-checks the updated `p` row against the old `s` row. The join no longer matches, so the row drops out, `!p` is true, and `notFound` is thrown.
* *Failing scenario, reproduced 3/3 in-process and once over HTTP (J7):* two tabs move P-00001 with the same version. First: 200. Second: **404** "No such prospect in your firm." The sheet says a stale version must get 409 with a reload. AG-2-26 §12 asks for the "moved by" message.
* Move then Mark lost at the same moment: the lost call gets 404.
* Convert clicked twice at once: the second gets 404, but AG-2-47 §12 says "the second sees 'Already a client'". Data stays correct: one `prospect.won`, one WON.
* *Fix:* lock `fo_prospect` alone (`select … from fo_prospect where … for update`), then read the stage in a second statement. Add a test with two concurrent moves or Converts (one 200, one 409 STALE / ALREADY_WON). No current test reaches this path.

**M2. The new shared event payloads fall short of the contract** (`ports/events.ts:163-169`, `:185-190`; `prospects.ts:244`).
* **`prospect.won`:** §2.6 (binding, "unchanged" in §7) lists `firm_key`, `interested_in`, `answers` (canonical keys), `consent_ids` and `owner_staff_id`. FO-2b's comment on main at `events.ts:171-173` says "the rest of the payload (§2.6: won_via, owner, answers…) is the writer's (FO-2 part 3, FO-6)". `ProspectWonPayload` is a strict object with only ids, `wonVia`, `retainerSigned` and `subject`, so the case side's "nothing the person typed is asked again" has nothing to read.
* **`prospect.stage_moved`:** §2.1 says it carries a cause ("with cause"). `ProspectMovePayload` has no `cause`.
* **`prospect.unconverted`:** a new name that is not in §2.1's events list. AG-2-47 §9 calls it `prospect.convert-undone`.

Nothing records these deviations, which breaks "never deviate silently". *Failing scenario:* Convert P-00001, then read the `module_event` payload: no `firm_key`, no answers, no `interested_in`. *Fix:* either write the §2.6 fields that apply to a Convert (and `cause` on stage_moved), or list the deviation and the new event name under "Shared-file lines" for Lead B (P-423). Then add a test that reads the payload keys.

### Minor
* **m1. A bad year gives a 500.** `from=0000-01-01` passes `dayOf` (`prospects.ts:30-34`), then Postgres raises 22008, so the answer is 500, not 400 (HTTP J4). Bound the year, for example 1900-2999.
* **m2. The second-Engage message counts prospects the person cannot see** (`prospects.ts:104-107`). Own-only O engages a lead whose earlier prospect is T's and gets "This lead already had a prospect." with no number. This shows a prospect exists, not its content. Count only the visible ones, or accept this and record it.
* **m3. `version` is a number from one sequence shared by all firms** (`prospects.ts:72-75`, `fo_stage_move.seq`). It jumps with other firms' moves, so a firm can roughly read the platform's activity from it. It is correct for the stale check. Prefer a per-prospect count.
* **m4. Open totals can count a prospect the board does not show** (`board-totals.ts:12`). They include ACTIVE stages that are turned off, while the board lists only live stages. Filter on `active: true`, or state why not.
* **m5. Two weak test lines.** The DW5 fail line's "a Corporate prospect is not on the Individual board" is always true (`check_fo2p3_prospects.ts:188`, `every(p => p.id !== undefined)`); it should engage a Corporate prospect and assert it is absent. Nothing tests the Undo fallback (its earlier stage removed) or Mark lost from NURTURE.
* **m6. The Undo reason in the README is imprecise.** README and code say cases and invoices "hold no prospect link". That is true, but `money_invoice` does carry `person_id`/`company_id` (fo_person/fo_company), and AG-2-47 rule 18 is about the client's invoices, not the prospect's. The real blockers today are that no invoice can be raised on main and there is no `ClientMoneyPort`. I accept "retainers only" for now. The follow-up should name `ClientMoneyPort` and rule 18's "invoice raised after becoming a client".
* **m7. Pre-existing, outside the diff, made reachable by this PR.** FO-6's `winProspect` (`retainers/service.ts:610-614`, on main) uses the same join-and-lock pattern. A person's move committed at the same moment as Signed offline makes it see no row and return `false`: the retainer is SIGNED_OFFLINE but the prospect is not won. Same pattern as M1; I did not run this one. Raise a follow-up row for FO-6's owner.
* **m8. Process.** The `corporate/service.ts` hook (`:13`, `:173-176`) is the minimal correct change: three additive lines, the board's own visibility, firm-scoped, and no second board route. The sheet asks for Lead B's OK on the PR. The PR (none open yet) must also list `ports/events.ts` and this hook under "Shared-file lines".

## Decisions judged (asked)
* **Version = the latest move's seq:** correct, because every stage change writes a move under the row lock (FO-1a). Leak: m3.
* **NURTURE refused:** correct (AG-2-26 rule 5: only through Park, which is not built).
* **Undo checks signed retainers only:** acceptable today (m6). CLIENT_SIGNED counted as signed is a cautious reading of AG-2-47 rule 18.
* **Lost may use DUPLICATE_PROSPECT but not COMBINED_PROSPECT:** correct (AG-2-44 rule 2 seeds Duplicate as a pickable reason; COMBINED is the merge's).
* **Keys:** `agent/prospect:lose` for Mark lost (AG-2-44 §8) and `agent/prospect:convert` for Convert and Undo (AG-2-26 §8, AG-2-47 §8) are correct and seeded to Owner, Admin, Case Manager and Case Officer.
* **Undo reason as an INTERNAL note, not in the audit:** matches the repo's no-free-text rule (FO-3pa precedent) and is recorded in the README. AG-2-47 §9's "<reason>" in the audit is deliberately not followed.

## What held
* Firm scoping on every read and write, including another firm's lead, prospect, reason and owner id.
* Own-versus-all matches FO-2b. The owner and date filters AND inside the visibility on both lists.
* The day range is worked out in the firm's zone by Postgres, DST-safe (the 23:30 and 00:30 Toronto test).
* One audit line per write with actor `staff:<id>`, rolled back on audit failure. The outbox row is last.
* Payloads hold no free text. Lost note and Undo reason stay out of the audit and the events.
* FO-1a's chain and WON triggers hold, and the WON guard reads the stage kind.

## Scores (API only)
D1 4 (rules map, M2 contract gap) · D2 3 (no bad data under race, but wrong answer) · D3 4 (reuses FO-2b board, `wonSubjectOf`, common rules) · D4 N/A · D5 2 (race answer M1; year 0000 → 500) · D6 4 (audit, who moved) · D7 N/A (no AI) · D8-D14 N/A (no screen; FO-4 part 2a) · D15 5 (< 100 ms each, no per-row query) · D16 3 (pass+fail per DW, but no race test, one vacuous line) · D17, D20 simulated only (no screen) · D18 4 (cause and actor on each move) · D19 N/A until FO-4 part 2a. BIC-01-20: N/A (no screen).
**Journey score (reviewer, the one for this check): 8.1/10** (6.5 of 8 applicable criteria; accessibility and visual N/A), details in `journey-test-reviewer-2026-11-18.md`.

## Could not check
No screen exists (the score's a11y and visual criteria are N/A). I did not run the full `run-suites.sh --changed` or CI. m7 is inferred from the pattern I proved in M1, not run.

**Verdict: Block.** To fix: M1 (lock the prospect alone, plus a concurrency test with a pass and a fail), M2 (payloads per §2.1/§2.6, or the deviation recorded for Lead B). Fix the Minors or list them in the PR.

## Re-review 773fd8cf2 (diff only: `d09490d99..773fd8cf22fac41c7f3720679cc48e882ea2a869`)
Verdict: Approve, for head 773fd8cf22fac41c7f3720679cc48e882ea2a869.

### What I ran (this head)
* `check_fo2p3_prospects` 44/0. FO-2 113/0, FO-2b 61/0, PF-6b 31/0, FO-2v 14/0.
* My scratchpad race probe again:
  * two moves on one version → 200 and **409 STALE** "Representative (Sample) moved this to Qualified. Reload it."
  * two Converts at once → 200 and **409 ALREADY_WON**, one `prospect.won`.
  * a move, then Mark lost without a version → both saved (correct: Lost's version is optional).
  * `from=0000-01-01` → 400.
* `tsc --noEmit` ran out of memory on this machine, so I could not check types. CI will.

### My findings
* **M1: closed.** `locked()` locks `fo_prospect` alone, then reads the stage under the lock (`prospects.ts` `locked`). The new tests have a pass and a fail: four moves on one version give one saved and three STALE, three Converts give one and two ALREADY_WON.
* **M2: closed.**
  * `ProspectWonPayload` now carries every §2.6 field. Fields the front office does not hold are null, never guessed: `person.current_residence_country`, `sealed_retainer_sha256`, and the retainer and representative unless one is signed. The FO-2b subject part sits beside them.
  * The answers and consents are read inside the transaction and firm-scoped. Consents are ids only.
  * `ProspectMovePayload` gains `cause`.
  * `prospect.unconverted` matches the BACKLOG FO-2 row's event list. Its difference from AG-2-47's `prospect.convert-undone` goes to Lead B as a PR question, which is acceptable: it is not silent.
  * The DW4 test reads the payload keys.
* **Minors:**
  * m1 (year bounds 1900-2999): fixed and tested.
  * m2 (second Engage): fixed. It names and counts only visible prospects, and an unseen one is "a prospect" (existence only).
  * m3 (version): now a count of this prospect's own moves. Moves are add-only, so the count only grows and an old version can never come back. Tested.
  * m4 (totals): now over live ACTIVE stages only.
  * m6 (README): reworded.
  * m7 (FO-6 `winProspect`): out of this diff; the builder raises it with the Lead as a follow-up row.
  * m8 (shared files): the PR must list `ports/events.ts` and the `corporate/service.ts` hook under "Shared-file lines" and ask Lead B. That is a PR-body task, not code.

### Left open (Minor, do not block)
* **r1.** The DW5 "no Corporate prospect on the Individual board" line now checks each row's type. But this suite never puts a Corporate prospect in the database, so removing the board's type filter would not fail it. FO-2b's suite covers the rule ("a Corporate prospect is never on the Individual board"). Engaging one Corporate prospect here would make the line real.
* **r2.** No test covers m2's message for a person who cannot see the earlier prospect.
* **r3.** `prospect.won` now carries the person's name, email and phone as §2.6 requires (personal data in `module_event`). That follows the contract. Retention and erasure of outbox rows is the platform's (outside this row).

**Verdict: Approve** (no open Blocker or Major) for 773fd8cf22fac41c7f3720679cc48e882ea2a869. List r1-r3 and m7 in the PR.
