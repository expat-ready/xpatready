# PF-21i break report: complaint create is idempotent by Idempotency-Key, PR #2012 at `44f28ba6f`

Breaker, 16 Nov 2026. Scope: the brief `design/lead-b-briefs/PF-21i.md` (there is no `concept.md`; the brief's "What to build" and "Done when" stand in for it) plus the breaker attacks it names and the ones the tech lead added. The row has no screen, so these attacks do not apply: keyboard, 1024 px, 200 % zoom, uploads and the 100-program budget. I first ran the PR's own suite at `010579b6b` (25 passed, 0 failed). Then I re-ran everything on the new head `44f28ba6f`; its only change is that the trigger function is SECURITY DEFINER, owned by `xr_wall_reader`.

Method: I copied `tests/check_pf21i_idempotent.ts` to `/tmp/claude-0/pf21i/brk.mts`, with absolute imports and the migrations taken from `44f28ba6f` via `git archive`. It uses its own scratch database `xr_studio_pf21i_brk_<pid>` on :54329, which is dropped at the end. The Nest app runs on a random port behind the real PlatformGuard; :4400 was never touched. A raw `node:net` socket sent the repeated headers and control bytes. Short names below: `C` = `api/src/platform/complaints/complaints.ts`, `I` = `api/src/platform/idempotency.ts`, `R` = `complaints/routes.ts`, `M` = `prisma/migrations/20261116150000_pf21i_complaint_request_key/migration.sql`.

## Findings

**Blockers: none. Majors: none.**

**m1 (Minor): a repeat (200) drops `reminderScheduled`, so a retrying client never learns whether the reminder was queued.**
* Did: posted once (201), then repeated the same key and body.
* Expected: the repeat answers what the first answer said. A client usually retries because it lost the first answer.
* Actual: the 201 body has `reminderScheduled`; the 200 body has the same fields minus `reminderScheduled`. If the first schedule failed (`reminderScheduled: false`), the repeat neither says so nor retries.
* Where: C:279 (`repeated ? { ...recorded, [REPEATED]: true } : { ...recorded, reminderScheduled }`).

**m2 (Minor): the hash covers the raw body, not the parsed request, so a repeat of the same complaint written another way is refused with 422.**
* Did: posted with key K, then repeated with key K and the same values written differently:
  * the `handlerStaffId` in upper case (the service lower-cases it, C:82);
  * `receivedAt` as `…+00:00` instead of `…Z` (the same instant, C:78).
* Expected: the stored complaint would be identical, so 200 with the first id.
* Actual: both repeats got 422 `IDEMPOTENCY_KEY_REUSED`.
* Where: C:254 `requestHash(input)` hashes `input`, not the parsed `v`. The brief's "canonical" names only key order, so the brief is met. The risk is a client whose serialiser differs between the first try and the retry (the PF-21s screen).

**m3 (Minor): another staff member's identical request gets wording that is not true, and the answer shows the key exists in the firm.**
* Did: the owner posted with key K. The case manager then posted the same body with K, and also a different body with K.
* Actual: both got 422 "This request key was already used for a different complaint." For the first one the complaint is the same; only the person differs. Neither answer contains the owner's id, so there is no leak.
* Also: with an unused key the same post gives 201, so the 422 tells any recorder in the firm that another person used that key. With UUID keys this is low value.
* Racing the two in parallel gave one 201 and one 422, never a 200 to the wrong person.
* Where: C:261 (one message for both reasons), C:178.

**m4 (Minor): odd header shapes become literal keys instead of being parsed or refused.**
* `"k";p=1` (a Structured-Field string with a parameter) is stored as the literal key `"k";p=1`, a different key from `"k"`. The result is 201, a second complaint.
* A lone `"` is accepted as the key `"`.
* `k,k` on one header line is accepted as one key (201). The same two values on two header lines are refused with 400 `IDEMPOTENCY_KEY_INVALID`, because Node joins them with ", " and the space fails the visible-character check.
* Where: I:31 (quote stripping only when the value both starts and ends with `"`), I:41.

## What held (on `44f28ba6f`)
* **10 parallel posts, one key and one body, 5 rounds:** each round gave one 201, nine 200s and one id. Each wrote 1 row, 1 RECEIVED event, 1 `complaint.record` audit line, 1 `complaint.received` outbox row and 1 reminder job.
* **10 parallel posts, one key, 5 different bodies, 3 rounds:** each round gave one 201, one 200 (the winner's body), eight 422 `IDEMPOTENCY_KEY_REUSED` and one row. The advisory lock works under READ COMMITTED.
* **One key across firms:** 4 parallel posts (A, B, A, B) made one complaint in each firm. Each firm's repeat got its own id, and B never saw A's id.
* **Control bytes in the key:** `\x01`, `\x7f` and NUL are refused with 400 by Node's HTTP parser, before the route (empty body). Tab and Latin-1 `é` get the route's 400 `IDEMPOTENCY_KEY_INVALID`. Spaces around the value are trimmed by HTTP, and the post records normally.
* **Key length:** 255 characters → 201; 256 → 400 `IDEMPOTENCY_KEY_INVALID`. A quoted 255-character key (257 raw) → 201.
* **Quoted versus bare:** `"K"` then `K` are the same key (201 then 200, same id). `"a\"b"` and `a"b` are the same key.
* **Key order, encodings and duplicate members:**
  * A body differing only in key order → 200 (the suite's DW1).
  * A JSON `é` escape versus a literal `é` → 200.
  * Hindi and Chinese text repeated → 200.
  * A 4000-character summary repeated → 200.
  * A duplicate JSON member: the last value wins, both in the hash and in what is stored, so the outcome is consistent.
* **NFC versus NFD summary:** 422. The stored text would differ (nothing normalises), so this is a different body and the refusal is correct.
* **Shapes the schema refuses:** null versus a missing field (`complainantContact: null`) and extra unknown fields are refused by `.strict()` (422 `COMPLAINT_FIELDS`) before the key lookup, so no 1-vs-1.0 case can arise. An `undefined` member is dropped and gets 200.
* **A handler deactivated between the post and the repeat:** 200, the same id, nothing written, 0 jobs. A first post that fails (inactive handler) leaves the key free.
* **Repeats write nothing:** 5 repeats plus 1 reuse changed none of the row, event, audit, outbox or job counts, and `updated_at = created_at`.
* **A repeat after a handler change:** 200, showing the current handler.
* **Roles:**
  * A case officer with the owner's key → 403, and the answer never names the owner's id.
  * No key and no permission → 403, which comes first.
  * No token → 401.
  * A recorder whose role was removed → 403 on the repeat.
* **Direct SQL** (the trigger, now SECURITY DEFINER):
  * Refused: setting the key and hash to NULL, changing the key, changing the hash, upper-casing the hash, a duplicate (firm, key) insert, and a key containing `\x01`.
  * Allowed: ordinary updates, and `POST /:id/handler` (200).
  * The function: `prosecdef = t`, owner `xr_wall_reader`, `search_path` pinned. Calling it directly fails with "trigger functions can only be called as triggers".
* **Index:** with `enable_seqscan=off` the lookup uses `plat_complaint_firm_request_key`; with a tiny table the planner picks a seq scan. Keys are case-sensitive (`Key-X` and `key-x` are two complaints), which is consistent with the draft's opaque key.
* **Brief versus draft:** the draft's 409 for concurrent requests is replaced by the brief's "wait, then 200". That is the brief's answer, not a finding.
