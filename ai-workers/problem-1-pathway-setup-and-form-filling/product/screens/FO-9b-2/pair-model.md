# FO-9b part 2: the pair model and the lock order

This page is the build note Lead 6 asked for on #3174 (23 Nov). Four review rounds each found a new Major in the previous fix: R3-1, then R4-1, R4-2 and R4-3. The cause was one design choice. A Kept separate decision was **copied** onto other pair rows: "carried" onto them, flipped by an upsert, then undone by a tag. Each copy needed its own locking and its own Undo. This model stores no copies.

Code: `api/src/front-office/duplicates/merge/review.ts` (`listed`, `keptBetween`, `rootsOf`, `notePairs`, `lockPeople`). Test: `tests/check_fo9b_pairs_model.ts`.

## 1. Pair states and transitions

**What a row stores.** A pair row (`fo_dup_review`) stores only what was decided **on that pair**:
* OPEN;
* KEPT_SEPARATE, with who and when;
* MERGED, naming its merge.

It also stores `noted_by_merge_id`: the merge that first wrote the row, or null when an arrival wrote it. A Kept separate decision is never changed by any action, and a row is never deleted.

**A root** is the live record a person's chain of merges ends at. `merged_into_id` is never re-pointed, so in B into A, then A into D, the root of A and of B is D.

**What the list shows** (`listed`; `list()` works out the same thing for every pair at once):

| Stored | Condition | Tab |
|---|---|---|
| MERGED | — | Merged |
| KEPT_SEPARATE | — | Kept separate |
| OPEN | its noting merge is undone | not listed |
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
| Undo (only the latest merge naming either record; part 1's rule, so a chain undoes in reverse: A into D first) | Sets the merge's own row back to OPEN. Nothing else is written. | See below. |

**What an Undo gives back.** These all follow from the derivation:
* The merged pair is To review again; it was OPEN, since a merge needs that.
* The loser's pairs are listed again, because the loser is live again.
* The pairs this merge wrote are not listed, because their noting merge is undone.
* A pair blocked only through the loser is To review again.

When the Undo is of the last change, the list is exactly what it was before the merge. A pair whose row did not exist and a pair that is not listed look the same to a person. If a later merge or arrival finds a pair an undone merge wrote, that pair is listed again and names the new noter.

## 2. One lock order for every writer

| Level | Lock | Rule |
|---|---|---|
| L1 | Each person's advisory lock (`fo_dup_merge:<id>`, the same as `service.ts` `lockPair`) | Taken first, sorted, waiting. |
| L2 | The pair row (`for update`) | Taken **only while holding L1 of both its people.** |
| L3 | The merge's and Undo's data rows | `NOWAIT` with back-off, then 503 Busy (Lead 5 on #3042). |

| Writer | L1 | L2 | Other |
|---|---|---|---|
| Keep separate | Both people | Its row | Updates its leads' match flags (it waits on no merge row) |
| Guided merge | Both people | Its row | L3 through `mergeRecords` (L1 again: advisory locks stack) |
| Merge by itself | Both people | Its row | The same |
| Preview | — | — | Reads only |
| Undo | Both people (`unmergeRecords`) | Its own pair row, by `merge_id` | L3 |
| `notePairs` (arrival, after a merge) | — | Never waits | `insert … on conflict do nothing`. Never `do update … where`: that locks the row even when its WHERE is false (R4-1). Noting a pair again uses `for update skip locked`. |

**Why nothing can deadlock.**
* No transaction waits on a pair row. To wait on row (x, y) you must hold L1 of x and y. Another holder of that row would hold them too, and advisory locks are exclusive.
* L1 is taken in one sorted batch, before any other lock.
* L3 never waits.
* An `on conflict do nothing` insert waits only on an uncommitted insert of the same pair. Two writers share at most one such key: a merge writes the survivor's pairs and an arrival writes the new person's. So that wait cannot form a cycle either.

**Why a Kept separate decision is never joined.** A merge reads `keptBetween` under L1 of both people. While it holds them:
* nothing can merge into either record (a merge needs L1);
* nothing can be undone from either record (Undo needs L1);
* no Keep separate can name either record (it needs L1, and it refuses a merged-away side).

An Add as new arrival writes Kept separate only with a person who is new and not yet committed, so no existing pair can be merged across it.

## 3. The test (`tests/check_fo9b_pairs_model.ts`)

Seeded with mulberry32 (`SEEDS=`, `STEPS=`, `BURSTS=`), so a run repeats. Each world has 4 to 5 people sharing two emails and two phones at random. The actions are arrival, Add as new, Keep separate, guided merge (random survivor), merge by itself and Undo (usually the latest merge). After **every** step it checks:
* **I1:** no KEPT_SEPARATE pair has both people under one root.
* **I2:** an Undo of the last change gives back exactly what the list showed before it (every pair's tab, or not listed) and every person's root.
* **I4:** To review never lists people a decision keeps apart.

Then come bursts (**I3** and I1): a fresh trio who all match, with two or three actions started together. At the end the database's deadlock counter (`pg_stat_database.deadlocks`) must not have moved, so mapping 40P01 to 503 cannot hide one.

**What it found.** All runs are in the PR comment.

| Code | Default 8 seeds | Bursts, seeds 4-8 |
|---|---|---|
| fa59de01d (the PR head before this) | I2 in 3 seeds: a merge's new pairs stayed To review after its Undo | **I1 in 3 of 5:** a merge X-Y, a Keep separate Y-Z and a merge X-Z at once joined Y and Z. The guided merge never asked whether a decision keeps the records apart. |
| 744cc7919 | I2 (R4-3) | I3 in 5 of 5: 40P01 (R4-1); the database counted 5 deadlocks |
| This model | 17/17 | Pass; wide run: 30 seeds × 40 steps × 25 bursts, 61/61, no deadlock |

## 4. Limits

* **Part 2b** (the merge by itself at arrival) must call `mergeIfSafe` in its own transaction after the arrival commits. Otherwise it takes L1 while the arrival's row locks are held, which breaks §2. Unconfirmed until part 2b is built.
* Merges made elsewhere (the case side) do not use this model. Today it only reads them.
* Noting a pair again is skipped while another action holds that row. The pair then stays off the list until the next arrival or merge finds it. This has no effect on safety.
* `list()` gains `keptThrough` (null, or the deciding pair's id) for FO-9s's screens. The Merged and Kept separate tabs show decisions whatever their noting merge.
