# PF-Fd review: `FilesPort.delete` (independent reviewer, 16 Nov 2026)

Commit reviewed: **4388547cd** (branch `claude/zen-knuth-ondp0m`, PR #1997). Diff `origin/main..4388547`: 6 files, +157/−9 (166 changed lines, under P-610's 200). I checked it word for word against the brief `design/lead-b-briefs/PF-Fd.md` (on `origin/main`), SA-11 §3.5, BR-7 and BR-12 (lines 626 and 631 of the 02-Nov SA-11 file), and PF-21b's `isHeld(tx, …)` shape. This is a port method: no screen, route or door. So there is no 1440/1024 px walk and no keyboard walk, the BIC table is N/A (no case-side screen), and the graph (`graph.mjs --check`) shows 0 hard gaps, with no page or route belonging to PF-Fd. The journey test is in `journey-test-reviewer-2026-11-16.md`: **8.5/10**.

## What I ran
* `tsx --tsconfig api/tsconfig.json tests/check_pffd_delete.ts`: **22 passed, 0 failed**. `node tools/check-port-contracts.mjs`: 13 ports, FilesPort ×2, **0 problems**. I did not rerun PF-0p (117/0) or FO-5 (247/0). `check_pffd_delete.ts` runs the same shared contract on both adapters, and every new case passed there.
* The new suite's usage line `tsx studio/tests/check_pffd_delete.ts` matches `run-suites.sh`'s no-server form (line 33), so CI's shards pick it up.
* **Mutation probes** (on a scratch copy, outside the repo), each measured against the scratch baseline:
  * removing the tombstone from `put` (lines 44 and 57) → DW3 fails twice;
  * removing the realpath and lstat checks → both DW4 symlink lines fail;
  * removing the lstat checks only → the symlinked-file line fails;
  * removing line 44 alone → still green (line 57 catches it; the line is redundant, which is fine);
  * removing `deletedAt` from `get`, or unlinking before the tombstone → still green (m3).
* **Edge and race probes** on `LocalFiles` (scratch):
  * two deletes in the same tick → `true`, then `false`;
  * a child key put under a retired key's path → the retired key stays absent, and a `put` of it gets `FileKeyTaken`;
  * deleting a key that is only a folder → `deleted: false`;
  * no `.tmp` files are left behind after a delete.

## Done when (PR body lines)
* [x] **DW1**: contract case on `fakeFiles` and `LocalFiles` (`files-port.contract.ts:83-93`): true, then `get` null and `exists` false, then a second delete false, plus a key that was never written. Fail: `keepsBytes` fails it (`check_pffd_delete.ts:29,39`).
* [x] **DW2**: firm B's delete answers false and firm A's bytes and sha256 are unchanged (`contract:94-103`). Firm B's own key under the same name is still free. Fail: `noWall` fails it. `deleted: false` rather than a refusal is the brief's choice, left for Lead B to confirm; the PR says so.
* [x] **DW3**: `FileKeyTaken` for other bytes, for the same bytes and type, and for the firm id in upper case; a different key still saves (`contract:104-117`). Fail: `reusable` fails it. A fresh `LocalFiles` on the same folder still refuses the key (`check_pffd_delete.ts:57`).
* [x] **DW4**: `..`, `a/../../b`, upper case, a leading slash and a non-uuid firm are refused on both adapters (`contract:118-125`). `LocalFiles` refuses a symlinked folder and a symlinked file that point out of the firm's folder, and the outside file is kept (`check_pffd_delete.ts:52-53`).
* [x] **DW5**: the guard exits 0 (run by me and inside the suite). For the PF-0p and FO-5 suites I accepted the PR's result lines.

## The reviewer's points
* **Can a crafted key get past the tombstone?** No. `FileKey` (`ports/files.ts:9`) allows only lower-case ASCII segments, each starting `[a-z0-9]`, with no empty segment, no `.`/`..` segment and no leading or trailing slash. `pathOf` lower-cases the firm id after `FirmId.parse` (`files.ts:35`) and refuses keys ending `.meta`/`.tmp` (`:34`). So one key maps to exactly one path: no alias such as `Docs/`, `//`, `./` or a trailing slash reaches the same file without its `.meta`. The delete's temporary file ends in `.tmp.meta`, so it can never be a key. All three readers honour `deletedAt` (`:44`, `:57`, `:65`, `:69`).
* **Can a race get past it?** Not within one process. `delete` is fully synchronous, and `put`'s only `await` (the sha256) comes before it reads `.meta`, so the two cannot interleave. Across processes sharing one folder there are two narrow windows (m1, m2). Neither ever makes `get` or `exists` return a deleted file.
* **Does `LocalFiles` ever remove anything outside the firm's folder?** No. Before anything changes (`:77-79`):
  * the firm folder's realpath must equal `realpath(root)/<firm>` (a symlinked firm folder is refused);
  * the file's folder must resolve inside it;
  * neither the file nor its `.meta` may be a symlink.
  * Even on the remaining TOCTOU path, `renameSync` and `unlinkSync` act on the link itself, never its target. A folder swapped for a symlink between the check and the unlink would need write access inside the store, which is outside this port's threat model.

## Brief fit
The method, the comment's rule (no hold check in the port; record first, then delete; never delete-then-roll-back; PF-F2 cleans up; the firm-wall reason; key retirement), the fake's `put`/`delete`, `LocalFiles.put`'s tombstone check including the old re-link branch, and the MODULE.md entry-point sentence all match the brief. Nothing outside the touch list except `qa/built/PF-Fd.md`, which WAY-OF-WORKING line 34 requires. S3 is correctly left to PF-F1. Both "for Lead B to confirm" choices are raised in the PR.

## D1–D20 (1–5; port row)
* D1 5: every brief line is met.
* D2 4: write-once is kept across delete; m1 and m2 apply across processes only.
* D3 5: one contract checks both adapters.
* D4 N/A.
* D5 4: the tombstone is written first, so a crash between the two steps leaves the key retired; m1.
* D6 4: `deletedAt` is stamped; the audit belongs to the callers.
* D7–D14 N/A (no UI).
* D15 5: synchronous filesystem calls, no per-row work.
* D16 4: a pass and a fail per line; m3.
* D17, D20 simulated only.
* D18 5: SA-11 BR-7 is cited in the port comment.
* D19 N/A: an enabler for CS-X3, CS-D6, PF-F2 and FO-5p.

## Issues
**Blockers:** none. **Majors:** none.

**Minors (Should)**
* **m1** `api/src/front-office/files.ts:83`: two processes deleting the same key at once can both pass line 76. The second `unlinkSync` then throws ENOENT instead of answering `deleted: false`. That is not a false success (BR-12), but a caller's retry gets an error. *Fix:* catch ENOENT on the unlink and return `{ deleted: false }`.
* **m2** `api/src/front-office/files.ts:56-58`: a cross-process `put` retry that read `.meta` at line 56 before a delete's tombstone can re-link its bytes at line 58 after the delete. The bytes then stay on disk under a retired key. The port still reads the key as absent and PF-F2 would sweep the bytes, but the disposal said `deleted: true`. *Fix:* after `linkSync(tmp, path)` in that branch, re-read `.meta`; if it is tombstoned, unlink `path` and throw `FileKeyTaken`.
* **m3** `tests/check_pffd_delete.ts` has no line that fails when the `deletedAt` check in `get`/`exists` (`files.ts:65,69`) is removed, or when the tombstone-before-unlink order (`:81-83`) is reversed. Both mutations stayed green. *Fix:* plant a tombstone `.meta` with the bytes still present (the crash-between-steps state) and expect `get` null, `exists` false, `put` `FileKeyTaken` and `delete` false.
* **m4** `ports/files.ts:25`: the comment says the caller asked `isHeld` "in its own transaction". The brief says "in the same transaction", meaning the same one as the record's disposed mark, and PF-21b's `isHeld(tx, …)` relies on that to serialise against a hold being placed. *Fix:* "in the same transaction that marks the record disposed, and been told not held".

**Outside this row (seen, not this PR's finding):** on `main`, `LocalFiles.put` of a key whose path is already a folder (for example `d/b` after `d/b/c.txt`) answers success with no bytes, and `get` then throws EISDIR. Its `delete` throws EISDIR after writing the tombstone, so this is still no false success. This is a candidate for `qa/BUGS.md` through the qa lane. The fake does not refuse `.meta`/`.tmp` keys, which `LocalFiles` does (from PF-0p/FO-5).

## Could not check
A real multi-process race (m1 and m2 come from reading the code, not from a reproduction); the S3 adapter (PF-F1); any caller (none yet).

**Verdict: Approve** (no open Blocker or Major), for commit 4388547cd.
