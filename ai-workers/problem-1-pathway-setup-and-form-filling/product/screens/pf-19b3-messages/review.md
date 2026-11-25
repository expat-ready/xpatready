# Review: PF-19b part 3, delivery state and the staff message list (independent Opus, high effort, P-303)

**Scope:** `git diff 2aa433a4e..9c5207100` (head `9c5207100dd10cf7961c737f51b498cf5e1aeb10`) against the brief `lead-b-briefs/PF-19b3.md` (c5bf956f9, DW1-DW6, touch list) and `notes.md`.

**Verdict (skill scale):** Ship after fixes. One Major (M1) is open.

## What I ran
* `tests/check_pf19b3_delivery.ts`: **24/0**. This includes `check_pf19b2_ses.ts` run unchanged.
* `check_pf19b_sending` 42/0, `check_pf19b_mail` 29/0, `check_pf19p_platform_mail` 68/0.
* `tests/check_pf19b3_panel_browser.ts` on my own isolated copy (`rv_pf19b3`, :4541, stopped afterwards): **20/20**. The test overwrites the builder's PNGs, so I restored them with `git checkout`.
* Probes (scratch scripts; nothing kept in the repo):
  * a concurrent Bounce and Delivery on one row, and a doubled Delivery;
  * `created_at` precision;
  * cursor edge cases;
  * 51 rows through the copy's own sweep with the local test events. All 51 became DELIVERED with no "test event failed" log line.
* Journey test: `journey-test-reviewer-2026-11-18.md`, **8/10, pass**.

## Findings
**Blocker:** none.

**Major**
* **M1. Raw codes on the panel, which breaks EXPERIENCE §2 [M] "plain words; no IDs/codes on the main path" (BIC-20 plain words).**
  * Where: `web/src/modules/platform/messages/messages-panel.tsx:46` renders `stateReason` exactly as stored.
  * What staff see: for a suppressed send the stored value comes from `gateReason()`, so the panel reads "Not sent **(SUPPRESSED: HARD_BOUNCE)**" or "Not sent **(NO_CONSENT: MARKETING)**". A message held at the cap reads "(daily limit)". (Screenshot: my journey run, J2.)
  * Why it matters: DW4's "the next send to it is suppressed" is exactly the row J-48 will show.
  * Fix: a `REASON` map in `contract.ts`, the same way `STATE`/`EVENT`/`CLASS` are mapped, with a fallback that hides any unknown code. Suggested words:
    * hard bounce → "the address bounced";
    * complaint → "marked as spam";
    * `SUPPRESSED: *` → "this address is blocked after a bounce or complaint";
    * `NO_CONSENT: *` → "no consent for this kind of message";
    * daily limit → "held: the firm's daily sending limit".

**Minor**
* **m1. Focus is lost when the last page loads.** `messages-panel.tsx:74`: the "Show older messages" button unmounts once `hasNextPage` turns false, and focus falls to `<body>` (J6, keyboard). Fix: move focus to the first newly loaded row (give it `tabIndex=-1`), or keep a focusable end-of-list note.
* **m2. The error state has no recovery control.** `messages-panel.tsx:71` says "Please try again" but there is no Try again button (`retry: false`), so the only option is a page reload. Fix: add a Try again button that calls `q.refetch()`.
* **m3. An impossible cursor gives 500.** `staff-routes.ts:19,67-70`: a cursor that matches `CURSOR` but holds an impossible date (`2026-13-45T99:99:99.999Z_…`) or an all-dash id answers 500 (PrismaClientValidationError), where it should give the 400 BAD_CURSOR. Fix: check `!Number.isNaN(Date.parse(c[1]))` and use the strict `UUID` pattern for `c[2]`.
* **m4. Most rows have no purpose.** `staff-routes.ts:31-35`: any row without a template key, and without a `mail:<head>` sending key, reads "Message". Booking mail all reads "Booking" (confirmation, reminder and host copy look the same). The builder's question 3 is sound. Record it as a follow-up row, since storing the purpose is `mail.ts` (PF-19e's area).
* **m5. Sweep and PR-body items.**
  * The missing `@OwnOrAll` marker (builder Q5) means the PF-6b sweep does not cover this route. The service applies the leads' rule exactly as `leads.ts:122-131` and `:161-166` do (an inactive owner counts as unassigned, view.all sees unassigned, everyone-sees-all needs the setting plus view.all), and DW5 proves it with a pass and a fail. Acceptable for this row, but the PR must carry the Question for the tech lead so that a sweep entry is added.
  * `module-cards.py pr` fails for the `api-features` and `web-shell` cards. The PR body needs `Card unchanged: <reason>`.
  * The front-office card at 42 lines is a base problem, already fixed on `main` (40 lines).
* **m6. The case-party rule has no pass test.** `staff-routes.ts:58-61`: the CASE_PARTY path has only fail tests. It fails closed, and outbox rows stay firm-scoped by `ctx.firmId`, so nothing leaks across firms. Note that `case.firmKey` defaults to `sample-firm`. Recorded only; this is Build Lead C's row to tighten.
* **m7. The graph tool misses the new route.** It lists `GET /platform/messages` under G3 ("no test reaches it"). This is a false negative: the browser test calls it through `/api${path}` built at run time, and the web calls it through `staffApi` with a template string. Not a code gap.

## Builder's deviations (judged)
* **demo-inbox.ts filter, `SENT` → `SENT|DELIVERED`: sound and needed.** Without it the local test events would empty the demo inbox for sign-up, booking and unsubscribe. A BOUNCED Sample row drops out of the inbox, which is correct. No other app code or suite filters outbox rows on `SENT` (checked by grep).
* **Purpose derivation: sound as a stop-gap** (see m4).
* **Case-party rule: sound for now** (see m6).
* **No @OwnOrAll marker: acceptable, with the question on the PR** (see m5).
* **Two lines in lead-page.tsx (the import and the mount): fine.**
* **DELIVERED → BOUNCED is allowed: sound.** SES can bounce after a delivery. BOUNCED and FAILED stay final, and DW2 tests both directions.

## Correctness, races, walls
* **The row lock comes first** (`bounces.ts:118-120`, `FOR UPDATE`, then the advisory lock). The worker holds the same row lock for its whole transaction (`messages.ts:148-150`). The local event (`local.ts:42`, `setImmediate`) therefore always waits for the commit, and a rolled-back send leaves QUEUED, which is ignored and logged (tested).
  * Removing `FOR UPDATE` would fail DW4 pass, because the event would read the uncommitted QUEUED row.
  * A Bounce and a Delivery are serialised on the row. My probe gave BOUNCED, with the Delivery ignored and logged.
* **Idempotency:** the notice id goes under the advisory lock, then the event lookup. The local ids are stable (`local-delivery:<outbox>`).
* **Part 2 is unchanged:** the signature and the topic are checked before `apply()`; SES rows match only `ses:` ids and local rows only `local:` ids; part 2's suite runs unchanged inside DW3. The only behaviour change is that a hard bounce no longer marks FAILED/SUPPRESSED rows BOUNCED, and those rows carry no provider id in practice.
* **The local events are wired only when the adapter is local** (`features/platform-messages.ts:40`), never with SES.
* **Firm walls:** every read goes through `firmScope(ctx.firmId)`. Another firm, an unseen lead or person, a missing key, a kind not offered, a malformed id, or a doubled query value all give the same 404 words. The answer selects no body and no file. The address is masked (`maskAddress`). Tested in the service and through the guard.
* **No per-row requests:** one outbox query with nested events, plus visibility and the firm name.

## D1-D20
D1 5 (DW1-DW6 each have a pass and a fail) · D2 5 (idempotent, race serialised) · D3 5 (one handler for SES and local events) · D4 N/A · D5 4 (retried sends safe; no retry control, m2) · D6 N/A · D7 N/A · D8 5 (panel on the lead page) · D9 4 (purpose mostly "Message", m4) · D10 3 (raw codes, M1) · D11 5 (states in words; status and alert roles) · D12 5 (team cards, tokens, Pill) · D13 4 (axe clean; 375/1024/1440 px and 200 % fine; focus slip, m1) · D14 5 (same look as the lead page) · D15 5 (300 ms to the first row) · D16 5 (pass and fail per Done-when line; re-run by me on this commit) · D17 and D20 simulated only · D18 4 (event times and from-name; no purpose) · D19 4 (J-48 booking walk not done here).

## BIC (EXPERIENCE §6)
The lead page is front office, not a case-side screen, so §6 scope is partial and only the applicable checks are scored.

| Check | Result | Evidence |
|---|---|---|
| BIC-11 | Met | no primary button in the panel; "Show older messages" is secondary |
| BIC-13 | N/A | the panel takes no input |
| BIC-14 | Met | every chip carries its word, and the reason sits beside it |
| BIC-18 | Partly (Should) | the loading state is text, not a skeleton; the empty state says nothing about what will appear |
| BIC-19 | Met | one heading and no primary button, at 1440 and 1024 px |
| BIC-20 | Partly (Must, see M1) | keyboard and zoom fine; plain words fail (M1); focus slip (m1) |
| Others | N/A | no case-side questions, documents, signing or review here |

## Could not check
* A visible browser and a real screen reader.
* The public booking page into the panel (J-48).
* An intended user's unaided walk (D17, D20).
* CI on GitHub: no PR exists yet.

**Verdict: Block**. To fix: M1 (map `stateReason` to plain words). m1-m3 should be fixed in the same pass, since they are small. m4-m7 are records and questions for the PR.

Reviewer: Changes requested

---

## Re-review (diff only, P-277): `git diff 9c5207100..b7eb6a357`, head `b7eb6a357a8585b970121d737e69c7d494461c98`

**What I ran:**
* `check_pf19b3_delivery` **24/0**, which includes part 2's suite unchanged.
* `check_pf19b3_panel_browser` **24/24**, on my own isolated copy (`rv_pf19b3`, :4541, stopped afterwards; the builder's PNGs restored).

**Each earlier finding:**
* **M1: fixed.**
  * `contract.ts` `reasonWords()` covers every reason that can be stored:
    * the consent gate: `SUPPRESSED: <SuppressionReason>` (all five enum values: HARD_BOUNCE, COMPLAINT, UNSUBSCRIBE, STOP, STAFF), and `NO_CONSENT`/`WITHDRAWN: <Purpose>`;
    * the worker and notices: hard bounce, complaint, daily limit, content changed, send failed (and its "try n of m" form).
  * An unknown code shows nothing.
  * An unknown state now reads "Unknown", not the raw code.
  * Screenshot at 1440 px, my run: "Not sent: an earlier email to this address bounced" and "The address does not exist or refuses email".
  * The new DW6 fail checks that no code text appears. It would fail if the map were removed.
* **m1: fixed.** Focus moves to the first older message, which is `tabIndex=-1`, through `requestAnimationFrame` after `fetchNextPage`. Tested: focused index 50, and the button is gone.
* **m2: fixed.** A Try again button (`variant="outline" size="sm"`, both exist) calls `refetch`. Tested with an aborted request, then recovery.
* **m3: fixed.**
  * The cursor id now uses the strict UUID pattern.
  * The date must parse, be from the year 2000 on, and round-trip through `toISOString`, which refuses Feb 30.
  * Five bad cursors, including year 0000, are tested → 400.
* **Breaker m2: fixed.** The query key is now under `["pf", …]`, which `session.ts` `STAFF_KEYS` removes at sign-out and sign-in.
* **Breaker m4:** the box now says "Every email to this person, from any of their leads." This matches the person read rule.
* **m4-m7:** recorded as questions 3, 6, 7, 9 and 10 in `notes.md`. They are for Lead B on the PR, not code defects in this row. The PR body still needs the two `Card unchanged:` lines (question 7) before module-cards passes.

**New in the diff (Minor, cosmetic, no change asked):** a suppressed row repeats its state word: the pill says "Not sent" and the reason starts "Not sent: …".

No Blocker or Major is open.

Reviewer: Approve b7eb6a357a8585b970121d737e69c7d494461c98

---

## Re-review of the merge (diff only, P-277): `git diff 506e69c16 56ab67c64`, head `56ab67c649bd810bd44b8d431c059cf73b44bb2c`

This head merges #1961's new tip (506e69c16: main merged in, migration re-stamped) into 077d99d09.

* **The diff holds only PF-19b part 3, and every file is unchanged from what I approved.**
  * The diff touches 18 files, none under `prisma/`.
  * I compared each file's blob at 56ab67c64 with b7eb6a357 (approved above): the same for every part-3 code file, both tests, the notes, the break report, the journey file and the screenshots.
  * Only two files differ: `review.md` (records only) and `api/src/platform/MODULE.md`.
* **The MODULE.md resolution is clean.**
  * A word diff against #1961's tip shows exactly three additions: the part-3 entry point, the two part-3 tests, and the part-3 line in the PF-19b part 2 block.
  * Nothing of #1961's text is lost.
  * The card is 40 lines, and `module-cards.py tree` passes.
* **Run in the merge worktree:** `check_pf19b3_delivery` passes 24/0, including part 2's suite. I did not repeat the browser suite: its inputs are the same blobs that passed 24/24 at b7eb6a357, and the coordinator's run on 56ab67c64 is 24/24.

No Blocker or Major is open. The earlier Minors and questions stand as recorded (notes.md items 3, 6, 7, 9, 10). The PR body still needs the `Card unchanged:` lines.

Reviewer: Approve 56ab67c649bd810bd44b8d431c059cf73b44bb2c

---

## Re-review of the second merge (diff only, P-277): `git diff 518f7b3f0 5d4b527a5`, head `5d4b527a5aa96a41ba476d04ea3c4724d23103e1`

This head merges #1961's tip 518f7b3f0 (main 34c5e1e99 merged in, including `20261118090000_csw1_firm_id`) into 88c1d3d80.

* **The diff holds only PF-19b part 3, unchanged.**
  * The diff touches 18 files, none under `prisma/`.
  * Every part-3 code file, both tests, the notes, the break report, the journey file and the screenshots have the same blob as at 56ab67c64 (and so as at the approved b7eb6a357).
  * Only `review.md` (records) and `api/src/platform/MODULE.md` differ.
* **The MODULE.md resolution is clean.** A word diff against 518f7b3f0 shows exactly three additions: the part-3 entry point, the two part-3 tests, and the part-3 line in the PF-19b part 2 block. The card is 40 lines, and `module-cards.py tree` passes.
* **The case-party rule is still right after CS-W1 part 1.** The rule is `staff-routes.ts:59`: `caseParticipant` → `case.firmKey = ctx.firmKey`.
  * csw1 adds a nullable `firm_id` to `runtime_case`, filled from `firm_key` by trigger and backfill. It keeps `firm_key` (P-559 (4)) and adds no row-level security to `runtime_case`.
  * So `firm_key` is still the case side's firm key, and reading `firmId` now would miss rows whose `firm_id` is still null. The outbox read stays firm-scoped by `ctx.firmId` either way, so no other firm's messages can show.
  * Note for CS-W1 part 2 (NOT NULL plus "the code switch"): this line should move to `case: { firmId: ctx.firmId }` there. That is the case side's row, not a finding here.
* **Run in the merge worktree:** `check_pf19b3_delivery` passes 24/0, including part 2's suite. The browser suite runs the same blobs, and the coordinator's run on 5d4b527a5 is 24/24.

No Blocker or Major is open. The earlier Minors and questions stand as recorded (notes.md items 3, 6, 7, 9, 10). The PR body still needs the `Card unchanged:` lines.

Reviewer: Approve 5d4b527a5aa96a41ba476d04ea3c4724d23103e1

---

## Re-review of the third merge (diff only, P-277): `git diff 88d03c665 5890bcc2f`, head `5890bcc2febd45f1eeafb7e78c9935868da65af2`

The merge is 028672c52: #1961's tip 88d03c665 (main with PF-19r part 1 #2157, plus the PF-19p stamp `20261119003000`) into a05d64183. 5890bcc2f then adds the re-rendered screenshots.

* **The diff holds only PF-19b part 3.**
  * The diff touches 18 files, none under `prisma/`.
  * Every part-3 code file and both tests have the same blob as at 5d4b527a5 (and so as at the approved b7eb6a357). The break report and the journey file are unchanged too.
  * What differs:
    * `review.md`;
    * `notes.md` (one added line, item 11, recording the CS-W1 note from my last read);
    * the three screenshots (re-rendered; the 1440 px one shows the same panel and words as before);
    * `api/src/platform/MODULE.md`.
* **The MODULE.md resolution is clean.** A word diff against 88d03c665 shows exactly the three part-3 additions (entry point, two tests, the part-3 line in the part 2 block). The card is 40 lines, and `module-cards.py tree` passes.
* **PF-19r part 1 (send/mail.ts, send/messages.ts) does not touch part 3's path.**
  * **The local adapter's test events still wait for the worker's commit.** The worker's `deliver()` is unchanged: it locks the row `FOR UPDATE` first, stops unless the row is QUEUED, and calls `adapter.deliver(tx, …)` inside that transaction. So the local test event still waits on the commit.
  * **MailPort purposes are unchanged.** The new `sendIn`/`mailIn` path writes in the caller's transaction and dispatches after its commit, so the worker and the test event are the same. The new `capHolds()` reads only and counts QUEUED rows, so DELIVERED and BOUNCED do not affect it. MailPort still stores `idempotencyKey: mail:<key>` and still drops `templateKey`, so `purposeOf()` gives the same purposes (notes item 3 stands).
  * **The demo-inbox filter line is unchanged** (same blob). No new app code reads outbox state: the only `SENT` filters are the unsubscribe page (which already takes DELIVERED and BOUNCED), the demo inbox and part 3's own lines.
* **Run on this head:** `check_pf19b3_delivery` passes 24/0, including part 2's suite. The DW4 MailPort booking email still reaches DELIVERED after the merged send path. The browser suite runs the same blobs, and the coordinator's run on 028672c52 is 24/24.

No Blocker or Major is open. The earlier Minors and questions stand (notes.md items 3, 6, 7, 9, 10, 11). The PR body still needs the `Card unchanged:` lines.

Reviewer: Approve 5890bcc2febd45f1eeafb7e78c9935868da65af2
