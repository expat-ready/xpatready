# PF-21i review: a complaint create is idempotent by Idempotency-Key (PR #2012)

Reviewer (Opus 5.5, did not build it), 16 Nov.

**What I reviewed:** head **44f28ba6fd25b73de3f9c59e0dd1847d06d8d350** on `claude/dazzling-feynman-x03cc8`.
* It is 010579b6b plus three migration lines: `plat_complaint_request_kept()` becomes SECURITY DEFINER, with its path pinned and owned by `xr_wall_reader`.
* The studio working tree equals 44f28ba6f, so every run below is that head's code.
* I did not run the walls suite at 010579b6b. "It failed there" is the builder's word.

**The bar:** the brief `lead-b-briefs/PF-21i.md` on `origin/main`, STANDARDS §4 "[M] Idempotent creates", and the "Who" lines in `complaints.ts:8-10`.
* **No screen** (that is PF-21s), so D1–D20 and BIC-01–20, keyboard, 1024 px and 200 % zoom are N/A.
* I did not re-run the graph (`graph.mjs` rewrites GRAPH.md). The PR reports `--check` exit 0.
* US$0, live AI off. :4400 was never touched.

## What I ran
| Suite | Result |
|---|---|
| `check_pf21i_idempotent` | 25/0 |
| `check_pf21_complaints` | 107/0 (unchanged file) |
| `check_pf21w_routes` | 83/0 |
| `check_pf21v_views` | 54/0 |
| `check_pf12_walls` | 100/0 |
| `check_pf3_platform_schema` | 75/0 |

All six exited 0, each on its own scratch database on :54329.

**Probes** (a scratch copy of the suite with the probes added; see the journey report):
* Raw-socket repeated headers.
* 5-way and different-body races.
* NFC/NFD, whitespace and number forms.
* The read rule (journey 9).

I also queried `pg_proc` on a scratch database with every migration applied.

## Done when (P-606)
- [x] **DW1.** Three posts → 201, 200, 200 with one id. Exactly one row, event, audit line, outbox row and job (`check_pf21i:133-137`). The key-order case is also covered (`:141-143`). Removing the lookup gives a 500 from the unique index, so the test goes red (reasoned).
- [x] **DW2.** 422 with the brief's words and code, nothing written (`:151-154`). Removing the hash comparison turns it into a 200, so red.
- [x] **DW3.** 20 of 20 parallel pairs gave one 201 and one 200 (`:164-170`). My 5-way runs gave `200×4,201` in 5 of 5. Without the lock, both transactions miss the row and the index refuses the second insert (500), so red (reasoned, not mutated).
- [x] **DW4.** No key → 400 `IDEMPOTENCY_KEY_MISSING` with the brief's sentence; 256 characters → 400; 255 → 201; nothing written (`:175-191`).
- [x] **DW5.** One complaint per firm; firm B never sees A's id (`:198-204`). Making the index `(request_key)` alone would give B a 500, so red.
- [x] **DW6.** Up-migration over a held complaint (it keeps NULL), a partial index, no second apply, the trigger and the check (`:89-107`). PF-21, 21w and 21v pass; the only test edits are the header lines in 21w and 21v (diff).

## The five differences from the brief
1. **Key optional in the service, required at the route: accepted.**
   * HTTP is the only outside door, and `routes.ts:32` always passes a key.
   * PF-21's 41 direct calls stay unchanged, as DW6 asks. The record comment says so (`complaints.ts:243-247`).
2. **Same key and body from another recorder → 422: accepted.** It is stricter than the brief, and it is the right instinct: one person's complaint is never handed to another. Two caveats:
   * The wording is wrong for this case (m3).
   * It does not close the read gap on its own (M1).
3. **The view hides `requestKey`/`requestHash`: accepted.**
   * `view()` strips them (`complaints.ts:143`), and every answer (list, detail, steps) goes through `view`.
   * The outbox and audit payloads name their fields one by one (`:274-275`), so neither carries the key.
4. **Check order 403 → field errors → key lookup: accepted.**
   * The full order is: guard 403, route 400 for no key, service 403, `.strict()` field 422, then the lock and lookup.
   * A repeat of a body that was valid stays valid, so this costs nothing.
5. **No `reminderScheduled` on a repeat: not a Blocker, but m1.**
   * A client retries exactly when it lost the first answer, so the repeat should say what the first one did.

**IETF draft not read:** the PR says so plainly, quotes nothing from memory, and asks the tech lead. That is correct conduct under P-170, but the brief's "quote it" is still open (m2). The brief's own answers stand either way, including "wait, then 200" for concurrent requests.

## Looked at hard
**Concurrency under READ COMMITTED: holds.**
* `commit()` sets no isolation level (`complaints.ts:232-236`), and nothing in `api/src` sets a default, so it is READ COMMITTED.
* `pg_advisory_xact_lock` is the first statement. The loser waits until the winner commits, and its `findFirst` takes a fresh snapshot, so it sees the committed row.
* The index is the backstop.
* Fragile point: under RepeatableRead the snapshot would be taken at the lock statement itself, and the loser would get a 500. That is never a second row. Note only.

**Canonical hash (`idempotency.ts:45-53`): holds.**
* Keys are sorted at every depth; arrays keep their order.
* `undefined` is dropped from objects and becomes `null` in arrays.
* Numbers are normalised by `JSON.parse`, and `.strict()` refuses extra fields anyway.
* NFD against NFC → 422, which is correct, because the stored text would differ.
* It hashes the raw body, not the parsed one (breaker m2): accepted, since the brief names key order only.

**Header parsing: holds in effect, but the comment is wrong (m4).**
* Node joins a repeated `idempotency-key` with ", ". The array branch the comment at `idempotency.ts:25` describes never comes from HTTP.
* The join is refused only because the ", " contains a space (both raw-socket probes → 400).
* The suite's `twice` case (`check_pf21i:187`) tests the array, not the route.

**Walls and RLS: hold.**
* `plat_complaint` was already forced with `pf12_firm`, and the new columns inherit the policy.
* The lookup is `firmScope` plus RLS.
* The trigger function reads only OLD and NEW, and is now `prosecdef=t`, owner `xr_wall_reader`, path pinned (checked in `pg_proc`).
* `0_pf12_firm_first` still fires first.

**Migration: additive and data-keeping.** The rollback is listed in order, including the `_prisma_migrations` row.

**Leaks:** none across firms. Within one firm: M1.

## Findings
**Blockers: none.**

**M1 (Major, server authorisation): a repeat lets a recorder without the read key read the complaint's current state, which the read rule refuses.**
* Where: `complaints.ts:261-263` answers `view(first, …)`, the row as it is now.
* The rule (`complaints.ts:8-10`, Lead 47): Case Manager holds record but not read, and anyone who is neither a reader nor the handler gets 404.
* Scenario (journey 9):
  1. A Case Manager records a complaint with key K; the handler is the Case Officer.
  2. The officer acknowledges it.
  3. The manager's `GET /:id` answers 404.
  4. The manager re-POSTs K with the same body and gets 200, with `acknowledgedAt` and `status`.
* The same answer would also show a later `responseSentAt`, `outcome`, `closedAt` and a changed `handlerStaffId`.
* Fix:
  * On a repeat, answer the complaint as it was recorded, not as it is now. Build the view from `first` with the later fields reset: `handlerStaffId: v.handlerStaffId`, `acknowledgedAt`, `responseSentAt`, `outcome` and `closedAt` null, `status: "OPEN"`, `updatedAt: first.createdAt`. This is also the draft's "same answer" meaning.
  * Or give the current view only when `this.canRead(ctx, first)`.
  * Either way, add a DW line built from journey 9 that goes red without the fix.

**Minors (Should):**
* **m1.** The repeat drops `reminderScheduled` (`complaints.ts:279`). Fix: send it (true on a repeat, since the first post's job is keyed by the complaint), or document that it is absent for PF-21s.
* **m2.** The IETF quotes are still missing (P-170). A session that can reach datatracker adds them as a PR comment, as the PR already asks.
* **m3.** The 422 sentence is untrue when only the person differs (`complaints.ts:178,261`). Use a second sentence, or one neutral one such as "This request key was already used."
* **m4.** Correct the comment at `idempotency.ts:25` (Node joins repeated headers with ", "), and add a route-level repeated-header case to DW4.
* **m5.** Breaker m4: `"k";p=1` and a lone `"` become literal keys. Harmless with UUID keys; note in the helper.

## Could not check
* An IETF reading.
* A mutation run of the lock and the index (reasoned only).
* CI on the head.
* A real screen (PF-21s).
* An intended user's walk (D17 and D20 stay with the founder).

**Journey score (reviewer): 7/10, below the pass mark, no criterion at 0** (`journey-test-reviewer-2026-11-16.md`). M1 and m1 together would bring it to 8.

**To fix before Approve:** M1, with its test.

Verdict: Block

## Re-review (P-277), 16 Nov: `44f28ba6f..b302fe3df71e775e3e76346b92c36938e0ebcca7`, the diff only
The diff touches `complaints.ts` (+9/-3), `idempotency.ts` (+7/-2) and `check_pf21i_idempotent.ts` (+32/-1). The other files in it are records: the break report and this reviewer's two files.

The studio tree equals b302fe3. Re-run results:

| Suite | Result |
|---|---|
| `check_pf21i_idempotent` | 28/0 |
| `check_pf21_complaints` | 107/0 |
| `check_pf21w_routes` | 83/0 |
| `check_pf21v_views` | 54/0 |
| `check_pf12_walls` | 100/0 |

All five exited 0.

**M1: fixed.**
* `complaints.ts:265-266`: a repeat now answers `{ ...first, handlerStaffId: v.handlerStaffId, acknowledgedAt/responseSentAt/outcome/closedAt: null, status: "OPEN", updatedAt: first.createdAt }`.
* These are exactly the fields the service's four later writes change: acknowledge, response-sent, handler and close. No other code in `api/src` writes `plat_complaint`.
* `v.handlerStaffId` is the first handler, because the hash matched.
* `overdue` and `businessDaysLeft` are recomputed from `acknowledgeBy`, which the first answer already showed, so they reveal nothing new.
* **Fail-first, checked by me:** I put 44f28ba6f's `complaints.ts` under b302fe3's test in a scratch worktree. The result was 26/28, with exactly the two DW2b lines red.
* DW2b covers journey 9 and more: acknowledge, response, handler change and close, the manager's GET answering 404, and a field-by-field match. `updatedAt` is left out of that match; that is acceptable.

**m5: fixed.** At `idempotency.ts:33-34`, a value that starts with a quote must be one whole quoted string. A lone `"`, `"k";p=1` and `"abc` are each refused with 400, and DW4 lists all three.

**m4: fixed.**
* The comment at `idempotency.ts:25-27` now says Node joins a repeated header with ", ".
* DW4 now sends two header lines through `node:http` and expects 400.

**Still open (Minor, accepted as listed):**
* m1: a repeat carries no `reminderScheduled`.
* m3: one 422 sentence (the brief's wording).
* m2: the IETF quotes remain the tech lead's question.

No new finding in the diff.

**Journey score (reviewer), re-scored:** correct data rises to 1, so **7.5/10**. That is still below 8, held back by the two Minors and the N/A halves. Under P-26 it does not block, since no Blocker or Major is open.

Verdict: Approve b302fe3df71e775e3e76346b92c36938e0ebcca7

## Re-review (P-277), 16 Nov: `fd95b3c..7151e4e103016248224237486225ab5f702cf8bb`, the diff only
The diff touches the migration's CHECK (+1/-1) and `check_pf21i_idempotent.ts` (+10).

**Devin's finding was real, and I missed it in my first review.**
* The old populated branch was `request_key ~ … AND request_hash ~ …`. With one column NULL, that expression is NULL, and a CHECK accepts NULL.
* So an INSERT of a key without its hash, or a hash without its key, passed `plat_complaint_request_shape`.
* The trigger covers only UPDATE, so nothing else stopped it.
* My first review cited "the check" as holding, but its test (`check_pf21i:105`) tried that pair only as an UPDATE, which the trigger refuses first.

**The fix is correct.** Requiring `IS NOT NULL` on both columns makes the populated branch false, never NULL, for a half-filled pair.

**The new DW6 insert lines:**
* They refuse both half-NULL pairs on INSERT.
* They accept both-NULL and a full pair. That accept test ends in ROLLBACK, so it proves the CHECK accepts the pair, not the deferred event trigger.
* **Fail-first, checked by me:** I put fd95b3c's migration under 7151e4e's test in a scratch worktree. The result was 29/30, with only "DW6 fail (insert)" red. The worktree is removed.

**Re-run on 7151e4e, all exit 0:**

| Suite | Result |
|---|---|
| `check_pf21i_idempotent` | 30/0 |
| `check_pf12_walls` | 100/0 |
| `check_pf3_platform_schema` | 75/0 |
| `check_pf21_complaints` | 107/0 |

**Note:** the migration file was edited in place. That is fine, because it is not on `main`. Any local copy that already applied the earlier version needs a reset, since Prisma would see a changed checksum.

**Still open:** the Minors m1, m2 and m3 as listed. No new finding.

Verdict: Approve 7151e4e103016248224237486225ab5f702cf8bb

## Re-review (P-277), 17 Nov: the widened row (Build Lead A, PR comment 6933156196), head feff0c582b796afa7917c3eb793a49efc935cadb
I read only the PF-21i commit against `origin/main`: `session.ts` +4/-3, `record-drawer.tsx` +4/-2, and `check_pf21s_complaints_browser.ts` +29/-1. The merge of main had no conflict.

**Inside the three bounds:**
1. `staffApi` gains optional `headers`, spread first (`session.ts:69-71`), so a caller cannot replace `accept`, the token or the content type.
2. The drawer has one key per opening: a `useRef`, renewed in the open effect, and the same key is sent on every Record in that opening.
3. The suite's `call` sends a fresh key on POST "".

**The new browser DW is a real fail-first test.** It intercepts the POST, lets it reach the server (`r.fetch()`), then aborts the answer. It checks:
* one complaint after the lost answer;
* the second press carries the same key;
* still one complaint, and the record page opens;
* a new opening sends a new key.

On the server, the 200 is the "as recorded" answer (M1 fix). So the drawer's `onSuccess` opens the record only for someone who can read it, and anyone else gets the list toast.

**What I ran:**
* `web` `tsc --noEmit`: exit 0.
* The browser suite: **not run.** It rewrites the tracked screenshots under `pf-21-complaints/screenshots`, and I was told to change no file. I rely on the builder's isolated-copy result: 68/68, and exit 1 without the drawer/session change.
* The API code is unchanged since 8ef6abede.

**Minors (Should; neither blocks):**
* **n1. Lost answer, then an edit, then Record: a dead end in words.**
  * The drawer keeps the key while the person edits after "Could not record the complaint. Please try again."
  * The retry gets 422 `IDEMPOTENCY_KEY_REUSED`, and the drawer shows `err.message` (`record-drawer.tsx:74`): "This request key was already used for a different complaint." That is not plain words for a person.
  * Their only way on (close, reopen, Record) makes a second complaint beside the one already stored.
  * Not a regression: on `main` the same case made a silent duplicate.
  * Fix: in the drawer, map that code to "This complaint may already be recorded. Check the list before recording it again." with a link to the list.
* **n2. `useRef(crypto.randomUUID())` runs on every render and needs a secure context** (`record-drawer.tsx:33`).
  * On :4400 (localhost) this is fine.
  * Served over plain http from another host, it would throw while the list page renders, for anyone holding the record key (the drawer is mounted with the page).
  * `ai-launch.tsx:32` and `bulk-lines.tsx:21` already guard with a fallback: use `useRef<string>()` plus the same guarded helper.

Verdict: Approve feff0c582b796afa7917c3eb793a49efc935cadb
