# Review: FO-2 part 4, calls, notes and the timeline (API only), reviewer, 18 Nov 2026

Verdict: Changes needed (Block). I reviewed `git diff origin/main..7f7da9e48` (head 7f7da9e486b71124b5519b1368cde85c1dc44bf9, base 9d440b2f4). I checked it against the wave 1 Sales start sheet (`origin/lead-b-front-office`, "FO-2 part 4": Build, DW1-DW4, touch list), AG-2-37a, AG-2-26 rule 7, concept fo-4-sales r2 BR-6, FO-1a's `fo_call`, `fo_note` and `fo_lead` first-response columns and checks, and AUD-1a's audit trail. I am an independent reviewer and did not build this.

## What I ran
* `tsx … check_fo2p4_calls_timeline.ts`: **22 passed, 0 failed**.
* Unchanged suites: PF-6b 33/33 (with the two new sweep rows), FO-2 113/113, FO-2p3 44/44, FO-2v 14/14, FO-2b 61/61.
* `tsc --noEmit` on the API: no error in a changed file. The 15 errors it reports are in older, unrelated tests.
* `graph.mjs`: G3 lists all six new routes as "no test reaches" (see m9).
* My own probes, kept in the scratchpad and not committed:
  * in-process on a scratch database: races and edge inputs;
  * HTTP journeys on an isolated copy at :4436 (runtime range, local sign-in, stopped afterwards). Details in `journey-test-reviewer-2026-11-18.md`.

## Findings
### Major
**M1. The first response goes to the wrong leads (AG-2-37a rule 5, which concept BR-6 cites).**
* What rule 5 says: a call is "the first response of every OPEN lead of that person that has no first response yet … A person with two open leads gets it on both". Rule 13a says the same.
* What the code does: `calls.ts:70-73` sets it on the one lead in context, whatever that lead's state. `locked()` (`calls.ts:43-49`) never reads `state`.
* *Failing scenario 1 (over HTTP):* close L-00002 ("Cannot reach") with no call yet. Then `POST leads/:id/calls {outcome: WRONG_NUMBER}` answers 201 with `firstResponse: true`, and the CLOSED lead now has a first response. The dashboard measure (AG-2-87) counts it.
* *Failing scenario 2 (in-process):* add a second lead for the same person (`personId`). Both are OPEN. Log a call on the first. The second keeps `first_response_at` null, so its reply reminder (rule 14) would keep running.
* A smaller related point: a call on a prospect sets the ENGAGED lead's first response. That is a fair reading of "a call logged from a prospect screen counts too", but not the letter of "OPEN". Record it for Lead B.
* README rule line 17 describes only the narrower behaviour. This is a silent deviation from the cited rule.
* *Fix:* under the lead lock, set the first response on every OPEN lead of `t.personId` in the firm that has none. Lock those leads in id order first to avoid deadlocks. Set nothing for a CLOSED lead. Add a pass test (two open leads, both set) and a fail test (a closed lead stays empty). If the person-wide part is held back, record it in `challenge.md` or the PR for Lead B's OK. The closed-lead part needs a fix either way.

### Minor
* **m1. A call can be dated years before the lead arrived** (`calls.ts:63-64`). `when: 2005-01-01` on a lead that arrived today is accepted, and `first_response_at` lands 21 years before `arrived_at`. That makes rule 6's open minutes negative. A call a few minutes before a hand-added "Phone call" lead is real, so clamp the first response to `max(when, arrived_at)`, or refuse a `when` well before arrival. Record the choice.
* **m2. `when` accepts any `Date.parse` text** (`calls.ts:62`). "Nov 1 2026 10:00" is accepted and read in the server's zone. Require ISO 8601 with an offset, as `TimelineLine.at` does.
* **m3. A note sorts before the audit line written in the same transaction** (`timeline.ts:60-62`).
  * Over HTTP, a hand-added lead with a note shows `NOTE "Asked about a study permit."` before `AUDIT lead.created`. Its close note `NOTE "Closed (Cannot reach): …"` comes before `AUDIT lead.closed`.
  * The two timestamps differ by milliseconds, so the "same moment" tie-break never applies.
  * Sort a note or call that comes from a transaction with an audit line after that line.
* **m4. Outbox events are de-duplicated by name across the whole subject** (`timeline.ts:49,55`). Once any audit line called `lead.taken` exists, every `lead.taken` event is hidden; my probe showed an extra event-only line dropped. Today no event-only writer exists, but FO-3's automatic moves will be one. Match each event to its own audit line (by count per type, or by time), and test it.
* **m5. The cap can drop lines that should be shown** (`timeline.ts:39-48`). `call.logged` and `note.added` are filtered out after the SQL `limit 501`. With many calls, the 501 rows can be mostly hidden ones, so visible audit lines inside the newest 500 fall out, and `audited` is built from a cut-down set. Filter them in SQL. No test covers `more` or the cap.
* **m6. Durations round to "(0 min)"** for a 20-second call (`timeline.ts:57`). Show seconds under a minute.
* **m7. The shared line has no plain text for AUDIT and EVENT lines.**
  * An AUDIT `summary` is the audit sentence with a raw staff id ("Staff e975c2dd-… engaged lead L-00001 as Individual.").
  * An EVENT `summary` is the type name.
  * FO-4 part 2b will need a words map. Flag this in the shared-contract note for the Lead's read of `ports/events.ts`.
* **m8. No `call.logged` outbox event**, although AG-2-37a §9 produces one and rule 13 makes it the input of the one lead service. Deferring it is reasonable, but list it under the README's open points or the PR's questions, not only in a code comment (`calls.ts:4`).
* **m9. Test gaps.**
  * No test calls the six routes over HTTP: graph G3, and the guard's 403 is inferred from the decorator metadata only.
  * No race test for the set-once first response. My probe of 8 concurrent first calls held: exactly one `firstResponse: true`, 8 rows, no 409.
  * No test for a closed lead (M1).
* **m10. Shared-file lines.** No PR exists yet. The sheet asks that `TimelineLine` be listed under "Shared-file lines" in the PR body.
* **m11.** README line 20 says "still open on 19 Nov". Today is 18 Nov.
* **m12. Field messages repeat the field name and list raw codes** (`calls.ts:19`; "outcome: one of CONNECTED, NO_ANSWER, …"). `text()` gives "this is required." Keep one style.
* **m13. The two timelines miss each other's lines.** A call logged on a prospect sets its lead's first response, but the lead's timeline shows no call to explain it (probe H). AG-2-94 rule 7 describes one timeline per person, tagged by lead or prospect. Per-record routes are what the sheet asked for. Note this for FO-4 part 2b and Lead B; it is not a fix for this row.

## Decisions judged
* **Prospect call sets the lead's first response:** acceptable as a lead fact. The state check is missing (M1).
* **`when` defaults to now, refused more than 5 min ahead or before 2000:** right. The parse is too loose (m2), and the "before arrival" case needs a rule (m1).
* **An event is shown only with no same-name audit line, and call or note audit lines are hidden:** hiding is right. Matching by name is too coarse (m4).
* **Notes:** INTERNAL only; their text appears in the staff-only timeline and never in audit lines. Right: checked over HTTP, no note or call words in `audit_event`.
* **No module_event:** acceptable if listed (m8).
* **Keys:** log-call for calls is right (AG-2-37a §8, seeded to Owner, Admin, CM and CO). Edit for notes, show for the timeline. Read-only gets 403, 403, 200 over HTTP.
* **The prospect timeline leaves out the lead's lines:** follows the sheet (m13).

## What held
* **Locking.** The order is prospect, then lead. No other path locks a lead and then an existing prospect: engage locks the lead and inserts a new prospect, and corporate and retainer code lock the prospect alone. A mixed run of 9 concurrent writes (prospect calls, a second Engage, notes, lead calls) finished with no deadlock.
* **Set-once under a race.** The lead row lock comes before the read, so concurrent first calls serialise.
* **Firm scope and visibility.** They apply on every path: the lead and prospect checks match the reads, and the timeline uses the reads themselves. The audit filter is by `detail->>'firmId'`, the same as `leads.ts:248`. The module, call and note queries are firm-scoped, and so are staff names. Other firm, own-only, a bad id and an unknown id all get 404 over HTTP.
* **Audit.** It is written inside the transaction with a typed actor (actor_type FIRM_STAFF) and rolled back when the audit write fails. Audit lines carry no free text.
* **Database checks hold:** `fo_call_context_check`, `fo_note_context_check` and the insert-only notes.
* **Speed.** Timeline p50 15 ms and p95 19 ms; a call takes 37 ms. There is no per-row query.

## Scores (API only)
D1 3 (M1, a rule-5 gap) · D2 3 (closed lead gets a first response) · D3 4 (reuses the reads, `visibilityOf` and `text()`) · D4 N/A · D5 4 (field errors, 404s; loose `when`) · D6 4 (audit and who; m7) · D7 N/A (no AI) · D8-D14 N/A (no screen; FO-4 part 2b) · D15 5 · D16 3 (pass and fail per DW; no race, cap or HTTP test) · D17 and D20 simulated only · D18 4 · D19 4. There is no BIC table: no case-side screen.

**Journey score (reviewer, the one for this check): 8.1/10** (6.5 of 8 applicable criteria; accessibility and visual N/A). Details are in `journey-test-reviewer-2026-11-18.md`.

## Could not check
* There is no screen, so no browser, axe or screen sizes.
* I did not run CI or `run-suites.sh --changed`.
* No PR body to check (m10).

**Verdict: Changes needed** (Block) for 7f7da9e486b71124b5519b1368cde85c1dc44bf9.
* To fix: M1. Set nothing on a CLOSED lead; set every OPEN lead of the person, or record that part for Lead B; add the pass and fail tests.
* Fix the Minors or list them in the PR. m1, m3 and m4 are the most valuable.

## Re-review 2d55dcbba (diff only: `git diff 7f7da9e48..2d55dcbba42ade3aea3c73aedba70141b48b02b1`)
**Ran:** `check_fo2p4_calls_timeline` 27/0, plus an in-process probe on a scratch database (scratchpad only, dropped).
**Closed:**
* **M1** is done as rule 5 says. Locks: the prospect, then every lead of the person in id order; the lead path rechecks the person under the lock. Only OPEN leads with none are set, and the count is checked. The tests cover two OPEN leads, the CLOSED lead, a call on a CLOSED lead, a prospect call and four concurrent first calls. No lead-then-prospect path exists, so no deadlock.
* **m1, m2, m4, m5, m6** are fixed and tested; **m8, m11, m13** are fixed or listed in `sales/README.md`. I accept the reasons for leaving m3, m7, m9's HTTP part, m10 (to check on the PR body) and m12.
**New, from the fix:**
* **R1 (Major). `firstResponseFor` names a lead the caller cannot see** (`calls.ts:95`). The answer lists every lead the call answered, but visibility is checked only for the lead in context.
  * *Failing scenario (probe):* "everyone sees all" is off; Case Officer O owns L2 and R owns L1, same person. `GET leads/L1` as O answers 404, yet O's call on L2 answers `firstResponseFor: [L2, L1]`.
  * This breaks the one visibility rule (AG-2-64; FO-2v; FO-9a names a record only to a caller who may open it; FO-2p3's m2). *Fix:* return only the ids the caller `sees()`, the rest as a count (the audit line may keep all); test it with the setting off.
* **R2 (Minor). A backdated call answers a lead that arrived after it** (`calls.ts:60`, the `unanswered` filter; the arrival check at `calls.ts:83` reads only the context lead). *Probe:* L1 arrived 2 days ago, L2 today; a call on L1 dated yesterday sets L2's first response a day before L2 arrived (m1 again). *Fix:* count a lead only when `arrived_at <= when + 60 s`.

**Verdict: Changes needed** (Block) for 2d55dcbba42ade3aea3c73aedba70141b48b02b1. To fix: R1; fix R2 in the same push. A re-review of that diff only is enough.

## Re-review e80b65af4 (diff only: `git diff 2d55dcbba..e80b65af483a47c38bd140870f2e2bae9f8d415f`)
**Ran:** `check_fo2p4_calls_timeline` 30/0, PF-6b 33/0, FO-2 113/0, and my R1/R2 probe again on a scratch database (dropped).
* **R1 closed.** O's call names only O's lead; R's lead, which O reads as 404, is counted in `firstResponseOthers` and its id is not in the answer. Seeing uses the leads read's rule (active owner); the audit line keeps all ids.
* **R2 closed.** A call on the older lead dated yesterday answers that lead only; the lead that arrived today keeps none. `first` and the audit line use the filtered set. README states both.
* Nothing new found. Open Minors stay as listed above (m3, m7, m9's HTTP part, m10 on the PR body, m12).

**Verdict: Approve** (no open Blocker or Major) for e80b65af483a47c38bd140870f2e2bae9f8d415f.
