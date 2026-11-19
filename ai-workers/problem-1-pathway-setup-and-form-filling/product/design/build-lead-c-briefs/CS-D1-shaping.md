# CS-D1 shaped into parts (Build Lead C (2), 19 Nov 13:0x IST, at Lead 91's ask)

BACKLOG `CS-D1` is one big "batch 5" row (FilesPort, upload doors, the type check, schema). It serves three Release 1 items, and they are at very different distances from done. Read on `main` 8cefcc6c6 and the open PRs, 19 Nov.

## What is on main already
* **PF-F4, the file-type and size check** (#2128, merged 19 Nov 02:49 IST): `api/src/platform/files/file-type.ts` with `checkFile(file, allowed)`, `detect(bytes, allowed)`, `checkDeclared`, `correctedName`, refusal reasons (NOT_ALLOWED_TYPE, ZIP, MACROS, TOO_LARGE, TOO_MANY_PIXELS, DAMAGED, EMPTY) and `NOTHING_STORED`. qa: "an enabler, no door calls it yet".
* **FilesPort** (FO-5): `studio/ports/files.ts` and its reference adapter `api/src/front-office/files.ts` (firm folders, write-once keys, signed short-lived links). CS-D1 imports it; it never copies it.
* **The request context**: `api/src/platform/audit/context.ts` (AUD-1's).
* **Not on main, no open PR:** PF-F2 (`UploadDoorPort`, tus uploads) and PF-F3 (`ScanPort`, nothing served while scanning). Both are Lead B's.

## The parts
| Part | Item | What | Waits on | Size | Brief |
|---|---|---|---|---|---|
| **CS-D1t** | **R1.67 file-type check (Partial, this is its one missing part)** | The two case upload doors (`case-documents.ts` `upload()`, `case-checklist.ts` `upload()`) call PF-F4's `checkFile` instead of `mediaOf`; J-67 inside | nothing | ~300 lines | `CS-D1t.md` (ready) |
| CS-D1 part 1 | R1.65 private storage (Not built) | `CaseDocument` gains `storage_key`, `firm_id` (backfilled, counted) and `flags` (PF-F4's "contains scripts", from #2253); both doors move to PF-F4's 25 MB; the case side stores through FilesPort under `<firm_id>/case-documents/…` | a schema slot | ~500 lines | to write when R1.65 comes up |
| CS-D1 part 2 | R1.65 | both upload paths and both readers (`bytesOf` in both files) switch to FilesPort; `path` kept until proven | part 1 | ~500 lines | later |
| CS-D1 doors | R1.64 / R1.66 | the case doors register with `UploadDoorPort`; every read goes through PF-F3's gate | **Lead B's PF-F2 and PF-F3** | small each | after Lead B |
| CS-D1b (row) | R1.65 | signed scans, fee receipts, validated copies move to FilesPort | CS-D1 parts 1-2, PF-F3 | 2 PRs | later |

## Recommendation
* **Start CS-D1t now.** It is R1.67's only missing part, needs nothing from anyone, and touches files no other in-flight part touches. AUD-1m 2a's files are `document-providers.ts`, `document-sets.ts` and `document-supplies.ts`, not these two, but if both run at once, whichever merges second merges main.
* R1.65 (parts 1 and 2) is Not built and three parts away. Under P-733 it waits behind the one- and two-part items.
* The doors part waits on Lead B. Nothing to ask of Lead B now.

## Carried into CS-D1 part 1 from #2253 (19 Nov 14:5x IST)
* A per-case cap on the PDF reader pool (as `ACTIVE_PER_CASE` in `fill-case.ts`): today one client's slow uploads can make another person's PDF answer 503.
* The checklist-line door checks the line's state (takes uploads?) before it reads the PDF.
* The built note's "cut short, even by 10 bytes: refused" is corrected for the ~1 KB window after an earlier end marker of an updated PDF.
* The `flags` column for "contains scripts" and both doors at PF-F4's 25 MB (above).
