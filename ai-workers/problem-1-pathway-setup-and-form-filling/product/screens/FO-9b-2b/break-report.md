# FO-9b part 2b: break report (PR #3527, head ed63b3ab7)

**Scope:** the BACKLOG row "FO-9b part 2b". Every arrival door queues a job. After the arrival commits, the job merges a new safe duplicate through part 2's `mergeIfSafe`. The PR is API-only: no screen, keyboard, zoom or upload surface.

**How it was run** (US$0, live AI off, never :4400):
* **Running copy:** isolated copy `brk2b` on :4434 with `PLATFORM_IDENTITY=local`, stopped at the end. This is the real PF-14 runner, with walls (row-level security) on and over HTTP. The front office was seeded with `seedSampleFirmsFrontOffice`. The web form was switched on with a Sample wording.
* **Scratch databases:** `xr_studio_brk2bu_<pid>`, with the fake runner, as in `tests/check_fo9b_auto_merge.ts`. They were dropped at the end.
* **Scripts:** in the session scratchpad (not committed): `http_attack.mjs`, `http_attack2.mjs`, `u.mts`, `u2.mts`.
* **The PR's own suite:** `check_fo9b_auto_merge.ts` passed 17/17 at this head.

## Findings

### B1 (Blocker): a stranger on the public web form takes over an existing person's record
* **Steps (H2, running copy, HTTP):**
  1. Visitor V submits the web form: Victoria Victim, `victoria.<run>@victim.example`, `+1 416 555 0123`.
  2. Later a second visitor submits: "Mallory Attacker", `mallory.<run>@attacker.example`, `416-555-0123`, with the message "Please send all documents to this new email."
  3. The second submission answers 201.
* **Actual:** 2.2 s later the job merged the second person into V's record. V's record then read `Mallory… Attacker | mallory…@attacker.example | +14165550123`. Mallory's note was on V's record, and both leads were V's.
* **Same with the email (T1):** a stranger used V's email with their own name, phone and consent tick. V's record became `Mal… Other | <V's email> | +16475550999`, with a live marketing consent V never gave.
* **Why:**
  * `mergeIfSafe` (review.ts:206) calls `mergeRecords` with no choices, so part 1's `defaultPick` decides each value (ports/person-merge.ts:91-94).
  * Under that rule the newer record's values win. The newer record is always the unauthenticated arrival, so its name, email and phone replace those already on file. The audit line lists `fieldsFromLoser: [givenNames, familyName, email, phone, language, timeZone]`.
* **What follows (traced in the code, not run):** booking confirmations and reminders read `person.email` when they are sent (booking/service.ts:731, :765). The victim's consultation mails, including the self-service link, would therefore go to the attacker's address.
* **Expected:** an exact match on one key never lets the newer arrival overwrite what is already on file. A family member who shares a phone number is the honest version of the same case.
* **Fix direction:**
  * In the automatic merge, the survivor's values win. The loser's value only fills an empty field, and differing values stay on the review card.
  * Or refuse the automatic merge when the other contact key or the name conflicts (a new `Unsafe` reason), so the pair waits on To review.

### M1 (Major): an automatic merge that copied a consent cannot be undone
* **Steps (T1):** after the merge above, the Owner calls `POST /api/front-office/duplicates/merges/<ref>/undo`.
* **Actual:** 409 `UNDO_REFUSED`: "The merge copied a live consent to the merged record … it cannot be undone while that copy is live" (service.ts:300).
* **Why it now matters:** the web form and the booking page both carry consent ticks. The PR's own j_28 W3-W4 note says the merge copies the booking's consent row. So from now on, the usual automatic merge is one that Undo refuses.
* **The only way out:** withdraw the copied consent first. That takes a consent decision on the person's behalf, just to reverse a merge the system made.
* **Expected:** Undo of the system's own merge works (BR-10), or the automatic merge does not copy consent until a person has confirmed it.
* **Fix direction:** an automatic merge records copied consents so that Undo may end exactly those copies; or the consent copy is deferred.

### M2 (Major, already raised in the PR's own question): money can be written on a record that was merged away
* The BACKLOG row FO-9b part 2m says "No money is ever written on a merged-away person … **before FO-9b part 2b**". Part 2m is not built.
* `fo_dup_live_party` guards only seven `fo_*` tables, none of the `money_*` tables. review.ts:207-209 leaves this to "the money side's check".
* With 2b, a merged-away id now appears seconds after any public arrival, with no person involved. A deposit or invoice that holds the loser's id (for example a booking page that is still open) lands on the tombstone, out of sight of the survivor.
* **Fix direction:** keep this PR's label off until part 2m lands, as the row's order says.

### m1 (Minor): a burst of arrivals leaves safe exact duplicates unmerged
* **Steps (H5, running copy):** 12 web-form submissions with one email arrive at once, from 12 addresses. All answered 201, in 0.6-1.6 s.
* **Actual:**
  * All 12 jobs ended "done", with no failures. Even so, **3 live records** remain with the same email.
  * They are joined by 3 OPEN pairs of score 100, and the review list still holds 56 OPEN pairs.
* **Why:**
  * `fo_person.created_at` is the time each transaction started (`CURRENT_TIMESTAMP`), not the time it committed. The arrivals were lined up one after another on the `fo_sales_match` lock, so the two orders differ.
  * The job takes the first OPEN pair (at-arrival.ts:61) and "the first merge ends it" (:67). A person whose transaction started earlier therefore becomes the survivor of a later-committed match, and is never merged into its own older match.
  * No job is ever queued for a survivor.
* This fails safe: the pairs stay on To review. It still misses the Done-when line "two safe arrivals become one record".
* **Fix direction:** after a merge, queue the survivor's job too (or loop until the person has no safe OPEN pair left). Choose the survivor among the person's live roots.

### m2 (Minor): a slow enqueue fails the arrival, and the lead is lost
* **What happens:** `queue.enqueue` (at-arrival.ts:47, pg-boss `send` on its own pool of 3 connections) is awaited **inside** the arrival's transaction, with no time limit. The web form and Add a lead have Prisma's default timeout of 5 s.
* **Steps (U6):** an enqueue that takes 6 s, standing in for a pg-boss pool stall.
* **Actual:** the arrival threw "A commit cannot be executed on an expired transaction … 5000 ms", and 0 persons were written. The "never refuses the arrival" claim covers thrown errors, not delays.
* **Fix direction:** enqueue after commit, as booking's `afterCommit` does, or through an outbox row; or put a short time limit on the send.

### m3 (Minor): a second run of the job re-merges a pair that a person had just undone
* **Steps (U3):**
  1. The job merges U2 into U1.
  2. The Owner undoes it. The pair goes back to OPEN (review.ts:378).
  3. The same job runs again (`attempt: 2`).
* **Actual:** merged again, so there are 2 merge records for U2.
* **When a real retry happens:** a Busy first try with a manual merge and Undo in between; a stop during the handler (8 s limit); a crash or expiry before pg-boss completes the job.
* **Fix direction:** the job merges nothing once any merge record names the person, undone or not.

### m4 (Minor): queue throughput against the budget
* On the running copy one job ran about every 2 s (batch 1, polled every 2 s). 12 arrivals were merged over about 22 s. At that rate, 100 arrivals would take about 3.5 min and 400 about 13 min before their duplicates merge.
* **Fix direction:** a larger batch or `localConcurrency` for this queue.

## What held
* **Audit context, staff side:** Add a lead raced by a second Add a lead with the same email (H3) answered 201 twice and wrote one OPEN exact pair. The job merged it in 1.6 s, outside the staff request. The audit line was `system:fo-duplicates SYSTEM job:fo-dup-auto:<id>`, and the staff-request context refused nothing.
* **"Add as new":** Add a lead's "Add as new" against an earlier web-form person (H4) wrote the pair Kept separate by `staff:<id>`. Nothing was merged.
* **Kept separate after arrival:** a pair decided Kept separate after the arrival committed but before the job ran (U1) was refused, and both records stayed.
* **Money and case on the running copy:** a tax treatment on the earlier person (T2) blocked the merge, with the walls on. So did a `case_client` row (T3). `case_client` has no row-level security.
* **Repeats and three people:** no person was merged twice (one standing merge per loser). Three people arriving close together (T4, U2) became 1. A rolled-back arrival or a booking retry leaves a job that finds no person (PR suite).
* **Cross-firm:** a job for firm B that names firm A's person returns `arrived:false` (U5).
* **Personal data:** no email or phone in the job payload or key, in the 29 completed jobs or in api.log. The audit detail and the `person.merged` event carry ids only.
* **Lock wait:** the job's wait on the arrival lock is bounded at 30 s. That is longer than the slowest arrival transaction, booking's 20 s.
