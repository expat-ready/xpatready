# FO-9b part 2: the pair model and the lock order

This page is the build note Lead 6 asked for on #3174 (23 Nov). Four review rounds each found a new Major in the previous fix: R3-1, then R4-1, R4-2 and R4-3. The cause was one design choice. A Kept separate decision was **copied** onto other pair rows: "carried" onto them, flipped by an upsert, then undone by a tag. Each copy needed its own locking and its own Undo. This model stores no copies.

Code: `api/src/front-office/duplicates/merge/review.ts` (`listed`, `keptBetween`, `rootsOf`, `notePairs`, `lockPeople`). Test: `tests/check_fo9b_pairs_model.ts`.

## 1. Pair states and transitions

**What a row stores.** A pair row (`fo_dup_review`) stores only what was decided **on that pair**:
* OPEN;
* KEPT_SEPARATE, with who and when;
* MERGED, naming its merge.

It also stores `noted_by_merge_id`: the merge that **wrote** the row, or null (an arrival or an Undo wrote it). It is set at insert and never changed: history only. It cannot by itself say whether a pair should leave the list, because the *other* person can change while one is merged away (the round-11 sweep, Lead 9 on #3174). So **withdrawal is decided from the live match**: an OPEN pair is withdrawn only while its noting merge is undone **and** its two people no longer match (FO-9a's rule asked of that pair, no 10-match cap; the `WITHDRAWN` SQL fragment, which `listed()` and `list()` both read). A Kept separate decision is never changed by any action, and a row is never deleted. A row's facts (firm, kind, its two people, when first seen) never change: the database refuses such an UPDATE (`fo_dup_review_frozen`). `merge_id` and `noted_by_merge_id` can only name a merge of the row's own firm: their keys are `(firm_id, …)` on `fo_dup_merge (firm_id, id)`, because a foreign-key check does not apply row security (Lead 12, on Lead B 4's read).

**A root** is the live record a person's chain of merges ends at. `merged_into_id` is never re-pointed, so in B into A, then A into D, the root of A and of B is D.

**What the list shows** (`listed`; `list()` works out the same thing for every pair at once):

| Stored | Condition | Tab |
|---|---|---|
| MERGED | — | Merged |
| KEPT_SEPARATE | — | Kept separate |
| OPEN | its noting merge is undone and its two people no longer match | not listed |
| OPEN | either side is merged away (not its own root) | not listed |
| OPEN | a KEPT_SEPARATE row has one side in each person's live record (the root and every record merged into it, at any depth) | Kept separate, with `keptThrough` naming that decision |
| OPEN | none of the above | To review |

**The actions:**

| Action | Rows written | Effect on the list |
|---|---|---|
| Arrival | Inserts OPEN pairs, with `noted_by_merge_id` null. | New pairs appear. |
| Add as new | Inserts KEPT_SEPARATE pairs, decided by the adder. | — |
| Keep separate (only on a pair that is To review) | Sets that one row to KEPT_SEPARATE. | Every OPEN pair between the same two live records moves to Kept separate, without being written. |
| Guided merge, or merge by itself (only on a pair that is To review, re-read under the people's locks) | Sets its row to MERGED. `notePairs(survivor)` inserts the survivor's new pairs with `noted_by_merge_id` = this merge. | The loser's pairs leave To review (merged away). The new pairs appear, or show as Kept separate when a decision keeps them apart. |
| Chained merge (B into A, then A into D) | The same as a merge. | Roots follow the whole chain, so B-C's decision still blocks D-C (R4-2). |
| Undo (only the latest merge naming either record; part 1's rule, so a chain undoes in reverse: A into D first; the earlier one answers 409 `UNDO_REFUSED`) | Sets the merge's own row back to OPEN, and writes the loser's pairs (`notePairs(loser)`). Nothing else is written. | See below. |

**What an Undo gives back.** These all follow from the derivation:
* The merged pair is To review again; it was OPEN, since a merge needs that.
* The loser's pairs are listed again, because the loser is live again.
* The pairs this merge wrote are not listed, because their noting merge is undone and the two no longer match. One whose two people still match (the other side changed meanwhile) stays listed.
* A pair blocked only through the loser is To review again.

* Someone who arrived while the merge stood has their pair with the record split off on To review (`notePairs(loser)`).

**What an Undo does not withdraw (a named limit, Lead 8 on #3174).** An Undo withdraws only the pairs its own merge noted. A pair with the survivor written while the merge stood, by an arrival or by a later merge, **stays listed even if it no longer matches**. It is stale but visible: a person can keep it separate or open the guided merge (its preview shows the live values), and the merge by itself refuses it (`NOT_EXACT`, checked on the live records). The rule this protects: **a pair that still matches is never hidden**, whatever the order of Undos. Rounds 7 to 9 tried to withdraw stale pairs and each time hid a valid one.

When the Undo is of the last change (nothing changed on these records in between: no arrival, merge or Keep separate), the list is exactly what it was before the merge, **except that a pair which had no row before and whose two live people match after the Undo is To review** (Lead 10 on #3174). Hiding a pair whose people match would be the worse fault. Such a pair comes from either side:
* **The loser:** `notePairs(loser)` writes a match of the loser that never had a row: one made by an edit, one past an arrival's 10-match cap, or one with someone whose values changed while the loser was merged away (the round-12 sweep, seed 472).
* **The survivor:** the merge's `notePairs(survivor)` writes a match the survivor already had without a row, made by the cap, an edit, or an earlier Undo that gave the survivor back a value. After this merge's Undo the two still match, so the pair stays listed (the round-12 reviewer's sequence; break F1).
 A pair whose row did not exist and a pair that is not listed look the same to a person. A pair an undone merge wrote is listed again as soon as its two people match again, however that came about; its row is not rewritten.

## 2. One lock order for every writer

| Level | Lock | Rule |
|---|---|---|
| L1 | Each person's advisory lock (`fo_dup_merge:<id>`, the same as `service.ts` `lockPair`) | Taken first, sorted, waiting. |
| L2 | The pair row (`for update`) | **Waited on only while holding L1 of both its people.** With L1 of only one of them (or none: an arrival), an existing row is never written; a new row is an `on conflict do nothing` insert, whose only wait is the last bullet below. |
| L3 | The merge's and Undo's data rows | `NOWAIT` with back-off, then 503 Busy (Lead 5 on #3042). |

| Writer | L1 | L2 | Other |
|---|---|---|---|
| Keep separate | Both people | Its row | Updates its leads' match flags (it waits on no merge row) |
| Guided merge | Both people | Its row | L3 through `mergeRecords` (L1 again: advisory locks stack) |
| Merge by itself | Both people | Its row | The same |
| Preview | — | — | Reads only |
| Undo | Both people (`unmergeRecords`) | Its own pair row by `merge_id`, after L3 (it never waits on it: see below) | L3; `notePairs(loser)` |
| `notePairs` (arrival, after a merge) | — | Never waits | `insert … on conflict do nothing`. Never `do update … where`: that locks the row even when its WHERE is false (R4-1). An existing row is never written. |

**Why nothing can deadlock.**
* No transaction waits on a pair row. To wait on row (x, y) you must hold L1 of x and y. Any other transaction holding that row holds L1 of x and y, since only a writer holding both takes an existing row. Advisory locks are exclusive, so the two cannot overlap. This is also why Undo can take its pair row after L3.
* L1 is taken in one sorted batch, before any other lock.
* L3 never waits.
* An `on conflict do nothing` insert waits only on an uncommitted insert of the same pair. Every insert names one person whose pairs it writes: a merge writes the survivor's, an Undo the loser's, an arrival the new person's. Two such writers share at most one key, the pair of those two people. A merge and an Undo never write the same person's pairs at once: each holds that person's L1, and the Undo's loser is never a merge's survivor while it holds it. This rules out a wait between two writers. It does not by itself rule out a ring of three or more writers each waiting on the next one's insert (review r9 m4); none has been seen, and if one formed PostgreSQL would end one transaction with 40P01. That transaction changes nothing and answers 503 Busy. The database's deadlock counter, which the model test reads, would catch one; the test does not itself build a ring of three merges (its bursts use one trio).

**Other waits (review round 7).** None of them closes a cycle, because the transaction that holds the lock never waits on a pair row or on L1 while holding it:
* a merge or Undo waits at commit in the deferred `fo_dup_live_party` trigger;
* every merge and Undo holds the platform-wide `module_event_seq` lock from its outbox row to commit, and so does the work after it (the checks under the locks, `notePairs`);
* Keep separate's update of its leads' match flags waits on any lead writer, which never takes L1 or a pair row;
* an arrival first takes FO-2's own advisory locks `fo_sales_match:<firm>:<email or phone>` (sorted; two first enquiries with one key are serialised). That namespace is not L1: no merge, Undo or Keep separate takes it, so nothing that holds L1 waits on it. The part 2b test counts only `fo_dup_merge:<person>` locks for this reason.

**Why a Kept separate decision is never joined.** A merge reads `keptBetween` under L1 of both people. While it holds them:
* nothing can merge into either live record, nor into any record already merged into it (a merge needs L1 of its survivor, and a merged-away record is never a survivor);
* nothing can be undone from either live record (Undo needs L1 of the survivor);
* no Keep separate can name either live record or anything merged into it (it needs L1, and it refuses a merged-away side).

An Add as new arrival writes Kept separate only with a person who is new and not yet committed, so no existing pair can be merged across it.

## 3. The test (`tests/check_fo9b_pairs_model.ts`)

Seeded with mulberry32 (`SEEDS=`, `STEPS=`, `BURSTS=`), so a run repeats. Each world has 4 to 5 people sharing two emails and two phones at random. The actions are arrival, Add as new, Keep separate, guided merge (random survivor), merge by itself and Undo (usually the latest merge). After **every** step it checks:
* **I1:** no KEPT_SEPARATE pair has both people under one root.
* **I2:** an Undo of the last change gives back exactly what the list showed before it (every pair's tab, or not listed) and every person's root, except that a pair which had no row before and whose two live people match after the Undo is To review (the match asked as I6 asks it; §1). Pinned by two fixed scenarios: the round-12 reviewer's sequence and seed 472's shape. Seed 472 is also in the default seeds. After other changes a pair that stops matching may stay listed (§1, "What an Undo does not withdraw"); I2 does not cover that case.
* **I4:** To review never lists people a decision keeps apart.
* **I5:** every pair's tab in `list()` is the one `listed()` derives for it alone.
* **I6:** a pair is never hidden while its two people are live and still match: every OPEN pair whose two people match (FO-9a's rule, asked of the pair itself, no 10-match cap) is To review or Kept separate. Checked firm-wide after every step and every burst. It holds by construction (§1: a pair whose two people match is never withdrawn), and the test pins it with two fixed sequences first: break B10-1 (red on e44fbad9f) and the round-11 sweep's captured seed-353 sequence (red on e4b5d9058); both green on the live-match rule. A third fixed scenario pins WITHDRAWN's name branch against FO-9a's own `wonDuplicates`: a similar name with no digit brings a withdrawn pair back; a near name with a digit does not; the exact name does.

Then come bursts (**I3** and I1): a fresh trio who all match, with two or three actions started together. At the end the database's deadlock counter (`pg_stat_database.deadlocks`) must not have moved, so mapping 40P01 to 503 cannot hide one.

**What it found.** All runs are in the PR comment.

| Code | Default 8 seeds | Bursts, seeds 4-8 |
|---|---|---|
| fa59de01d (the PR head before this) | I2 in 3 seeds: a merge's new pairs stayed To review after its Undo | **I1 in 3 of 5:** a merge X-Y, a Keep separate Y-Z and a merge X-Z at once joined Y and Z. The guided merge never asked whether a decision keeps the records apart. |
| 744cc7919 | I2 (R4-3) | I3 in 5 of 5: 40P01 (R4-1); the database counted 5 deadlocks |
| This model (e720342c1) | 17/17 | Pass; wide run: 30 seeds × 40 steps × 25 bursts, 61/61, no deadlock. Round 7's breaker: seeds 39-140, `STEPS=50 BURSTS=40`, 207/207 |

Round 7 added **I5** (after every step, every pair's tab in `list()` equals `listed()` for that pair), Undo and arrivals in the bursts, and a deterministic test per rule in `check_fo9b_review.ts`:
* not listed: 409 `NOT_LISTED`;
* a withdrawn pair is never merged by itself;
* a withdrawn pair is To review again once its two people match again (an edit), its noter kept as history;
* a merged-away side is hidden;
* the people's locks come first, with no pair row held while waiting.

The PR comment has the table showing that removing each rule turns a suite red.

## 4. Limits
* Work after a merge's outbox row holds the platform-wide `module_event_seq` lock until commit (review r7-m3). A merge is short, but this is a throughput limit, not a correctness one.
* A pair merged by a merge that is later undone through `PersonMergePort` (not this module's Undo) stays MERGED (review r7-m5). Only this module's Undo reopens it.
* A match made by an edit (FO-9a's phone edit) writes no pair. The list catches up at the next arrival, merge or Undo that finds it.
* A pair that stops matching (after an Undo, or an edit) stays listed until a person decides it (§1, "What an Undo does not withdraw").
* An arrival writes at most 10 pairs (FO-9a's cap, `MAX_MATCHES`), so with more than 10 matches some pairs are first written by a later merge or Undo.

* **Part 2b** (the merge by itself at arrival) must call `mergeIfSafe` in its own transaction after the arrival commits. Otherwise it takes L1 while the arrival's row locks are held, which breaks §2. `check_fo9b_review.ts` holds this today: an arrival takes no person lock. Proposed row text is on the PR for Lead B.
* Merges made elsewhere (the case side) do not use this model. Today it only reads them.
* `list()` gains `keptThrough` (null, or the deciding pair's id) for FO-9s's screens. The Merged and Kept separate tabs show decisions whatever their noting merge.
