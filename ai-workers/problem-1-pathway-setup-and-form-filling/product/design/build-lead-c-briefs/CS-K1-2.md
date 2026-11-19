# Brief: CS-K1 part 2 (CS-K1b), every case client linked to the front office's person or company (cloud builder lane; row owner Build Lead C)

Written 19 Nov 11:1x IST by Build Lead C. **Approved for building** under P-719 and P-726 (journey J7). This is Release 1 row **R1.72** ("Case with applicants, representative, pinned release"), part 2 of 2.

The specification is "Part 2 (CS-K1b)" in the draft `product/design/briefs/CS-K1.md` on `main`, line 32. Where this page differs, this page wins.

**PR title:** `migration — runtime: CS-K1 part 2 — every case client linked to its fo_person or fo_company`
**Model:** Opus 5.5, effort high (schema, a one-time job over every client, money-free; breaker yes).
**Lane:** "CS-K1 part 1 · client record (overlap on #2125)", unparked for R1.72.

**Ready when** (Lead 87, 19 Nov):
* After the drain, at about 13:30 IST.
* Only if Lead B's **FO-8** lands on `main` within a day. If it doesn't, this row stays queued.
* Before starting, check `main` for FO-8 and say in the PR what you found.
* What is already on `main`:
  * Part 1 (#2167): `case_client`, with empty `fo_person_id` and `fo_company_id` and a check that at most one is set.
  * FO-1p (#2138): `FoPersonPort` in `api/src/front-office/people/fo-person-port.ts`, with `ensureForClient(tx, raw)` and `ensureCompanyForClient(tx, raw)`, its fake, and its contract.
* **Runs in series with CS-NT1 part 1 on `api/src/runtime.ts`.** Whichever opens first holds the file. The other branches from its head and opens its PR after it merges.

**What to build** (the draft's part 2, with the rulings of 18 Nov):
* **New client, at opening:** `createCase` calls the port inside the opening's transaction, so a rollback removes both.
  * A `PERSON` client calls `ensureForClient(tx, { firmId, actor, displayName, email?, prospectId? })` and gets `{ foPersonId }`.
  * A `COMPANY` client calls `ensureCompanyForClient(...)` and gets `{ foCompanyId }`. It gets an `fo_company`, not a contact person (ruling of 18 Nov).
  * The caller writes the link only while both columns are null.
* **Existing clients:** a one-time `JobPort` job does the same for each client with neither column set.
  * Each client is linked in its own transaction.
  * A re-run changes nothing.
* **After the job reports zero missing,** a second migration step adds the database check that every `PERSON` client has `fo_person_id` and every `COMPANY` client has `fo_company_id`.
* **The firm is always the client's own `firm_id`** (CS-W1), never one taken from the request.
* **No cross-module import or foreign key.** Case-side code reaches the front office only through the port (contract §1 rule 4).
* **Audit actors:** typed words only (`staff:<id>`, `system:<door>`, `seed:<row>`, or the listed simulated people).

**Done when (P-606):** `tsx studio/tests/check_csk1_client.ts` exits 0. The draft's DW1-DW8 still pass, and these new cases pass and fail as named:
* **DW9:** a new person client gets its `fo_person` id in the opening's transaction. A forced rollback leaves neither row.
* **DW10:** after the backfill job, no client is missing its link. A second run changes nothing.
* **DW11:** firm A's client never gets firm B's `fo_person` or `fo_company`.
* **DW12:** a `COMPANY` client gets an `fo_company` and no `fo_person`.
* **DW13:** the check refuses a `PERSON` client with no `fo_person_id` once it is in place.

These must still pass unchanged: `check_fo1p_*` (the port contract), `check_csw1_*`, `check_case_feed.ts`, and the case suites of the touched files (`tools/check-select-suites.sh`). `node studio/tools/check-port-contracts.mjs` exits 0. Full `ci` is green.

**Touch list:**
* `api/src/clients.ts`
* `api/src/runtime.ts` (the `createCase` call)
* the new job file under `api/src/` (name it in the PR)
* `prisma/schema/cases.prisma`, plus one migration with the check, which also needs a rollback file
* `tests/check_csk1_client.ts`

No screen. P-712: no hand edits to shared module-card lines; fold any card line through the card tool, or put `Card unchanged: <reason>` in the PR body.

**Migration stamp:** later than every migration on `main`. Ask the current Lead for a slot before opening the PR (P-600). The Lead reads the migration before the label (P-423).

**Review:** an Opus reviewer **and the breaker** (schema, and a job over every client, P-278). The breaker tries:
* two openings at once for one prospect;
* a job run while a client is being opened;
* a firm id from the request;
* a company client sent to `ensureForClient`.

**Then:** J-72, the join and walk for R1.72. Build Lead C writes it once this PR is queued. qa scores R1.72 from J-72.

**Standard rules:**
* Branch from `origin/main`.
* One part, one PR, under 800 changed lines with tests (P-610). If it must split, ask first in a PR comment.
* P-683: get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft.
* A dequeued PR merges main again within 30 minutes (P-721).
* Live AI off, US$0, never a priced button (P-175). Push after every step (P-557).
* Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes.
* If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on.
* Repository: `expat-ready/xpatready`.
