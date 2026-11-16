# FO-2b review: Corporate prospects (API only)

Reviewer: independent Opus reviewer, 16 Nov 2026. Commit reviewed: `1c49b2c972e543dfc8ea0adcb65cfb87ee74e714` (PR #2019, branch `claude/charming-darwin-clue3f`).
Judged against: the row FO-2b Done-when line (BACKLOG on main, l.315), the brief `lead-b-briefs/FO-2b.md`, AG-2-52, -53, -75, -76, -77 and -79, and contracts §2.1, §2.6, §7 §2.1/§2.6. Read for context: FO-1a's triggers, FO-2's `common.ts`/`leads.ts` and FO-5's `retainers/service.ts`.

**Verdict: Changes needed** (two Majors are open; this is a Block for the label).

## What I ran
* `tests/check_fo2b_corporate.ts`: **42 passed, 0 failed** (my own run on 127.0.0.1:54329).
* A scratch break-it probe against the same services on its own database (dropped afterwards; it is not committed). Results:
  * Two Engages of two leads into the same new company name, run at once, made 2 companies. Each company has exactly 1 live PRIMARY.
  * A double click on Engage made 2 prospects. This is PR question 3 and is not counted as a finding.
  * 10 rounds of Make primary, Engage-into-company and Change type, run at once on one company: no deadlock, no error other than a 409, and 1 live PRIMARY at the end.
  * The probe also confirmed findings M2, m1 and m2 below.

## Done-when lines (each needs a pass and a fail)
| Line | Proven? |
|---|---|
| Corporate Engage with no company name → refused at the field | yes (`:72-74`), plus the pass at `:75-78` |
| A near-identical name is offered; nothing links by itself | yes (`:89-103`) |
| The enquirer becomes PRIMARY and stays labelled Lead | yes (`:79-80`, `:98-100`) |
| One person may hold two roles at one company | yes (`:106-109`) |
| Change type after a signature → refused | yes for the WON stage (`:146-151`). **The refusals that depend on the retainer's status are not tested** (see m5) |
| Each board lists only its own type | yes (`:154-162`) |
| The won payload carries the company and its contacts | proven on `wonSubjectOf` only. Nothing writes `prospect.won` on main yet (PR question 1, accepted) |
| One audit line per change, and a forced audit failure rolls the change back | the pass side holds for all 5 writers. The fail side is tested for 3 of 5: **Change role and End contact have no forced-failure test** (see m5) |

## Findings

### Major
**M1. A draft or declined retainer makes Change type impossible, and the error tells staff to do something the product refuses.**
* Where: `corporate/service.ts:278-281`. The refusal message is "Withdraw it in Agreements first". But Withdraw refuses a DRAFT ("A draft has not been sent: edit it or leave it.") and a DECLINED retainer (`retainers/service.ts:36` WITHDRAWABLE = SENT, VIEWED, CLIENT_SIGNED; the refusal is at `:522`). Editing a DECLINED retainer only turns it back into a DRAFT (`:35`).
* Failure scenario:
  1. Staff prepare a retainer on an Individual prospect.
  2. They then see it is an employer matter and click Change type. They get 409 RETAINER_OPEN.
  3. They try Withdraw. They get 409 NOT_WITHDRAWABLE.
  4. The only way out is to **send the wrong-subject agreement to the client** and then withdraw it.
* The same happens with DECLINED, although AG-2-76 rule 2 and §11 say outright that a declined retainer allows the change.
* PR question 2 chose to refuse on a draft on purpose. That choice is fine, but it needs a remedy that works.
* Fix:
  * Let DECLINED through, as the card says.
  * For a DRAFT, give a remedy that exists, or let the change go ahead and leave the draft for FO-5 to re-subject.
  * Test each state (see m5).

**M2. Make primary silently rewrites other people's prospects, and those prospects get no audit line.**
* Where: `corporate/service.ts:233` repoints every open Corporate prospect of the company. The one audit line (`:237`) is on `fo_company_contact` and does not name the prospects it changed. `seenCompany` (`:169-173`) lets anyone who sees *one* prospect of the company change its contacts.
* Probe result, with "everyone sees all" off:
  1. Staff T owns one prospect of a shared company.
  2. T makes their contact primary.
  3. R's P-00001 now names T's contact as its primary contact.
  4. T still gets a 404 when reading P-00001.
  5. P-00001's audit trail (entity `fo_prospect`) has no line for the change.
* This breaks the own-versus-all rule (AG-2-64; MODULE invariant "a change never lands on a … the person may not see"). It also breaks the row's "every change writes one audit line" for the prospects that changed: their timeline, which reads `audit_event` (contracts §2.6 timeline), will not show it.
* Fix (either is enough with the audit line):
  * Repoint only the prospects the person sees, and refuse with a 409 listing how many others are affected (no numbers) when some are hidden.
  * Or keep each prospect's primary contact unchanged.
* In both cases, list the ids of the repointed prospects in the audit detail, or write a line per prospect.

### Minor
* **m1. The audit line records a match that never happened.**
  * `service.ts:72` returns `offered: 1`, and `:118` then writes `matchedOn: "ORG_NAME"`, even when the person picked a company by id with no name typed. The probe showed `{"offered":1,"matchedOn":"ORG_NAME"}` for exactly that case.
  * AG-2-79 rule 9 requires the audit to record the company offered and the key it matched on. The id of the company that was offered is never written, including when staff choose New company despite an offer.
* **m2. A 409 leaks the number of a prospect the person may not see.**
  * Where: `service.ts:250-251`, "This person is the primary contact of P-00005…".
  * The probe showed this to T while T's read of P-00005 answered 404.
  * Fix: name it only if the person sees it, or say "an open prospect".
* **m3. The lead gets no audit line when Engage fills its owner.**
  * Engage fills an empty lead owner and emits `lead.taken` (`:120`), but writes no `fo_lead` audit line.
  * FO-2v's race answer reads exactly that line (`leads.ts:244-247`). So a colleague whose Take races the Engage gets a 404 instead of the 409 "already taken".
  * AG-2-75 §7 also asks for the Engage audit entry on the lead.
  * A second Engage also overwrites the lead's first `engagedAt`/`engagedBy` (`:112`).
* **m4. Race with Prepare retainer.**
  * FO-5's `draft` reads the prospect's type before it renders the document and never locks or re-reads it (`retainers/service.ts:365`, `:380`). Change type checks the retainers without a lock (`:278`).
  * So a Change type that commits while a draft is rendering leaves a CORPORATE prospect with a PERSON retainer.
  * The fix belongs in FO-5 (lock the prospect FOR SHARE and re-check the type in its transaction, as AG-2-76 rule 14 does for signing). Record it as a follow-up.
* **m5. Test gaps.**
  * Nothing creates a real retainer, so RETAINER_SENT, CLIENT_SIGNED→SIGNED, DRAFT and DECLINED (`service.ts:278-281`) are never exercised. `qa/built/FO-2b.md` nonetheless claims RETAINER_SENT.
  * There is no forced-audit-failure test for `changeRole` or `endContact`. `changeRole` is the writer with the most writes.
* **m6. The board drops the newest prospects with no sign.**
  * `service.ts:158` takes the first 1000 prospects in ascending number order, with no cursor. This goes against STANDARDS §6 [M], cursor pagination.
  * Once a firm has 1000 prospects of one type, including WON and LOST ones, every newly engaged prospect is missing from the board with no indication. AG-2-52 §10 says nothing is hidden.
* **m7. KNOWN_PERSON gives the person nothing to pick.**
  * Add contact's 409 KNOWN_PERSON (`:194`) carries no matches. Staff cannot choose the existing person; the only way through is `confirmedNew`, which makes a duplicate.
  * AG-2-77 rule 5 says the check works "as in AG-2-4", which returns the matches the person may see.

## Contract and data checks that held
* Every transaction keeps the order: lock the row, see it again, write, one audit line, then the outbox rows.
* The company is locked before every contact change, and FO-1a's deferred checks act as the backstop.
* Change type locks the prospect first.
* Signed offline cannot slip past Change type, because any live retainer already blocks it.
* All reads are scoped to the firm: another firm gets a 404, and own-only viewers get a 404 and an empty board.
* Audit details carry ids and roles only, with no names, emails or company names. Event payloads are strict zod schemas with ids only.
* `ProspectWonSubject` matches §7 §2.6: `subject` is PERSON or COMPANY, and a company carries its name and its live contacts with roles, linked rather than copied.

## Journey score (reviewer; API only, so walked as API journeys)
* Journeys: Engage new; Engage with a match then pick; New company despite a match; two roles; Make primary; End contact; Change type both ways; Change type after a signature; the boards with visibility on and off; another firm; a wrong role.
* Scores: task completed 1 · next step obvious ½ (M1) · plain words 1 · feedback and state 1 · correct data ½ (M2, m1) · error recovery ½ (M1, m7) · speed 1 (the suite runs in seconds; no budget measured) · trust and sources 1 (no AI; Sample only).
* Accessibility and screen sizes, and visual quality: N/A, because there is no screen (FO-4c builds it).
* **Score: 6.5 of 8 applicable criteria (8.1/10 scaled), no 0.** Raise it by fixing M1 first, then M2.
* Not tested: any screen, a real e-signature (FO-6 is not on main), and a real Prepare-retainer race (m4 comes from reading the code).
* No separate journey-test file was written: the task limited me to this file.

## Re-review at c0819939

Read only the diff `1c49b2c97..c08199395`: `corporate/service.ts`, `tests/check_fo2b_corporate.ts` and `qa/built/FO-2b.md`. Ran `tests/check_fo2b_corporate.ts`: **55 passed, 0 failed**. `tsc` on the api project reports no error in `corporate/`.

**Verdict: Approve** for `c081993957463e3ec21a92fb2fc07e70ec264746`. No Blocker or Major is open.

### Earlier findings
* **M1: accepted as carried; now Minor (follow-up for FO-5).**
  * FO-5's status trigger confirms there is no in-scope remedy (`fo5_retainer_tables/migration.sql:323-330`): DRAFT can only move to SENT or SIGNED_OFFLINE, and DECLINED only back to DRAFT. A subject changes only through an edit.
  * Letting Change type through would leave a draft that names the wrong client and can only be sent. Refusing is the safer choice.
  * The message (`service.ts:315`) now says plainly why it refuses and that Change type waits. It no longer points at a Withdraw that would fail.
  * The test drives real retainer rows: draft → RETAINER_OPEN, sent → RETAINER_SENT with the card's words, withdrawn → allowed.
  * The deviation from AG-2-76 rule 2 for DECLINED is raised with the tech lead (PR question 2), not settled silently.
  * Condition: a follow-up row for FO-5's Discard draft exists before the Corporate panel (FO-4c) offers Change type.
* **M2: fixed.**
  * Make primary locks and reads the open prospects that name the old primary. If any of them is hidden from the person, it answers 409 HIDDEN_PROSPECTS, names no prospect, and changes nothing (`:258`).
  * Each prospect it repoints gets its own `prospect.primary_contact_changed` line, and the role line lists `repointedProspectIds` (`:267`).
  * Both sides are tested.
  * Lock order is company, then prospects. Change type locks the prospect and then the company only when the prospect is not yet the company's, so the two never wait on each other.
* **m1: fixed.** The match key is recorded only when a typed name matches, and `companyPicked` is recorded.
* **m2: fixed.** The prospect number is named only when the person sees it; this is tested.
* **m3: fixed.**
  * Engage writes a `lead.taken` line on the lead when it fills the owner (`fromUnassigned`, `via: ENGAGE`).
  * A second Engage keeps the first engaged time and person.
  * Both are tested.
* **m4: carried** as an FO-5 follow-up.
* **m5: fixed.** Retainer-state refusals and forced audit failures for Change role and End contact are now tested.
* **m6: carried.** Cursor paging comes with FO-4c.
* **m7: fixed.** KNOWN_PERSON names the match when the adder may see that person.

### New (Minor, does not block)
* **n1. HIDDEN_PROSPECTS asks for a person who may not exist.**
  * The message says "Ask someone who sees all prospects". But with "everyone sees all" off, nobody sees all: `common.ts:61` requires the setting as well as `view.all`.
  * Scenario: the setting is off and R and T each have an open prospect naming Lena. Then no one can make another contact primary until an Owner turns the setting on.
  * Fix: name that way out in the message, or take it to the tech lead with M1's question.
* **n2. A company with more than 50 repointed prospects cannot change its primary.** The audit detail takes at most 50 array entries (`ports/audit.ts:21`). Beyond that, the audit line fails and the change rolls back (it fails closed). This is unlikely in month one; a count plus the per-prospect lines would avoid it.
* **Journey score (API):** next step ½ and error recovery ½ (M1 carried, n1); correct data is now 1. **7 of the 8 applicable criteria (8.8/10 scaled), no 0.**
