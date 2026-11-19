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

**P-728 (founder, 19 Nov 11:2x IST):** J-72, R1.72's join and walk, merges in the **same PR** as this part, as `tests/journeys/j_72.ts`. It replaces the "Then: J-72" line above. The 800-line limit still stands; ask first if it would pass it.

## Added 19 Nov 14:0x IST by Build Lead C (2), from FO-8's PR #2255 (comment 7003786783)
* **Live delivery of `prospect.won`** is in this part. Add one `BYPASS_USES` line for FO-8's catch-up running outside a request (the Lead reads it: it touches firm scope) and an app-start provider that runs the catch-up, as PF-25's `WebAddressCatchUp` does. J-72's walk then sees a won prospect's client appear with no hand-run command.
* **The module card's `Tests:` line** for FO-8 (dropped from #2255 because of the card-tool fault) goes back in this PR once #2240 is on `main`.
* FO-8 serves Convert only until Lead B's row makes paper-signed wins raise `prospect.won`. J-72 walks a Convert.

**Update 19 Nov 21:0x IST (Build Lead C (3)), Lead B's FO-2w joins R1.72's chain:** today only Convert raises `prospect.won`. A Signed offline win moves the prospect to WON but raises only `retainer.signed_offline`, so no case opens from it, against R1.72's "a won prospect hands over into a case". Lead B's **FO-2w** (one shared win helper, `prospect.won` once per prospect in the win's transaction) is part of R1.72 before its proof.
* J-72 walks **both** wins: a Convert win and a Signed offline win, each handing over into one case with its applicants, representative and pinned release.
* If FO-2w is not on `main` when this PR is otherwise ready, build and get the Approve on the branch, say so in a PR comment, and open the PR after FO-2w merges (merge `main` once, then a diff-only Approve).
* FO-5rp (retainer read port) and FO-2u (undo convert refused once a case exists) are **not** in R1.72's chain. They are follow-ups after its proof. Keep FO-8's "Port owed:" line.

## Answers to the FO-8 lane's resume note, 20 Nov 00:3x IST, Build Lead C (4) as row owner (asked by Lead 96)
Read with `screens/CS-K1/RESUME-part-2.md` on `claude/epic-ritchie-4ybdwg` (bcc3bdd59). These four rulings win over the note where they differ.

1. **J-72's walk: confirmed as the note proposes, with these points.** "Open a case?" does **not** need a screen before R1.72 can be proven. FO-8 is "API only" in BACKLOG, and R1.72's line is the case: "Case with applicants, representative, pinned release". J-72 lives in `tests/journeys/j_72.ts` and mixes screen and API, as `j_77.ts` does. There is no separate `J-72.md`: this section is its brief.
   * **W1:** Convert on the Pipeline screen (FO-4 part 2a).
   * **W2:** the client appears with no hand-run command (ruling 2).
   * **W3:** `POST /api/runtime/clients/:id/open-case` with a staff session. Label it in the walk and the PR body as "API step: the offer has no screen yet", never as a screen step.
   * **W4:** the case page on screen shows the applicant, the representative of record and the pinned release.
   * **W5–W8:** the same four steps for a **Signed offline** win, signed on paper through the retainer screen's own action (not SQL). W8 also asserts that the representative is the one in the signed version's merge value `representative.staff_id`. This is FO-8's first real run of that branch: another person there is an FO-8 fault, fixed in this PR with a failing case.
   * **DW lines,** each with its stand-in (pass and fail):
     * a second delivery or catch-up run makes no second client;
     * firm B's staff get 404 on firm A's client;
     * a second open-case answers 409 and opens no second case;
     * a Signed offline win after a Convert of the same prospect raises nothing new (FO-2w's once per prospect).
   * Keyboard only, axe-core clean on the screens walked, 1024 and 1440 px.
   * **Follow-up for the Lead to add** (not part of R1.72): an "Open a case?" screen on the client, so a person can open the case without the API.
2. **Delivery during the walk: a polling publisher in the app-start provider** (the Transactional Outbox pattern, polling-publisher variant). The provider runs FO-8's catch-up at start, as PF-25's `WebAddressCatchUp` does, and **then again every `PROSPECT_WON_POLL_MS` ms** (default 10000, labelled Sample).
   * Single-flight: a run never starts while the last one is still going.
   * It stops on application shutdown.
   * It goes through the same one `BYPASS_USES` line.
   * A prospect that fails is logged by id, and the poll keeps going.
   * J-72 sets the interval low and waits for the client by reading the API with a bounded wait (at most three intervals), never a fixed sleep. A mid-walk Convert is then delivered with no restart.
   * No cross-module import and no in-process call from the front office: the case side reads the outbox only.
   * When PF-14's real `JobPort` exists, a later row moves this onto it. The cron there is minute-level, so not now. Say this in a code comment.
   * The timer counts in the PR's 800-line limit. If the limit is at risk, ask first.
3. **Migration stamp:** use a stamp later than every migration on `main` when the PR opens. Main's newest at 00:2x IST was `20261119144500_csnk1_field_name_key`. **Recommended:** `20261120100000_csk1_client_link_check`. On a clash, re-stamp with the SQL unchanged and say so in the PR. The current Lead confirms the slot at PR open (P-600) and reads the migration before the label (P-423).
   * **Write the check as `NOT VALID`.** A database migrated before the backfill job runs must not fail at migrate.
   * The check still refuses new and changed rows, which is what DW13 tests.
   * DW10's job ends by running `VALIDATE CONSTRAINT` once it reports zero missing. Its re-run changes nothing.
   * Any seed or demo reset that writes `case_client` rows directly must write the link too.
4. **FO-2w's payload: settled by #2321 as built, so there is nothing to choose.** `winProspect` (`sales/prospects.ts`) builds the same `ProspectWonPayload` for every win, with `won_via: SIGNED_OFFLINE` and `retainer_id` set to the signed retainer for a paper-signed win. FO-8 needs no second path. If #2321 changes the payload before it merges, the lane re-reads it.

**Order unchanged:** build and get the Approve on the branch, then open the PR only after #2321 (FO-2w) is on `main`. Merge `main` once and get a diff-only Approve.
