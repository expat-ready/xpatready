# FO-6d break, round 2, part 1 (PR #3207, head 8162df596)

Breaker, 23 Nov 2026. This round covers only the diff since round 1: `git diff f6d048440 8162df596`. That is the rewritten `isGovernmentForm`/`checkPdf`, the title rule, the list order, the new foreign keys on `fo_signing_document`, and the split (the webhook's OTHER handler moved to part 2). Scope (P-26): the BACKLOG FO-6d row and the PR body's Done-when table. API only.

**How I tested:** a harness copied from round 1, run on part 1's checkout. It uses a scratch database on :54329 (dropped afterwards), the real PlatformGuard, Nest on a random port, the fake adapter and fake mail. `checkPdf` was also run directly on every PDF on disk and on hand-made PDFs; pypdf 6.1 confirmed that each dodge file still holds `/AcroForm` → `/XFA`. The row suite gives 24/24, `check_pf12_walls` 110/110, and `prisma validate` passes. Scripts are in `/tmp/claude-0/-home-user-xpatready/322d1bd4-de69-5b06-ae8b-6b0f184130f9/scratchpad/r2/` (`attack2.mts` PART=1, `mkpdf.py`, `checkall.mts`, `bomb.mts`).

## Blocker
None.

## Major
**M1. With part 1 alone, the retainer handler runs on OTHER requests' webhook events** (`signing/service.ts:129-135`).
- **What changed:** the dispatcher now hands only `CONSULTATION` to a module. Every other kind falls through to `applyRetainer`, and in part 1 that includes `OTHER`.
- **Expected** (the split's promise): the events are stored and answered "no handler", and nothing is applied.
- **Actual,** on a sent OTHER request with two clients and consent recorded:
  - `viewed` ×2 and `signed` ×2 each answer `applied: true`. The signers and the request move to VIEWED and then CLIENT_SIGNED.
  - The audit lines are written by retainer code. Their `detail.retainerId` holds the `fo_signing_document` id, and they say "Opened by the representative" / "Signed by the representative" for the firm signer.
  - `completed`, sent three times, answers **409 CHANGED** "The agreement changed at the same time (withdrawn or signed on paper)" each time (`:225-226`: `moveRetainer` matches 0 rows).
  - Each try fetches and stores the sealed and audit files before the transaction (`:177`): 14 files were on disk after the send and 3 tries.
  - The request stays CLIENT_SIGNED with no evidence and no receipt for `completed`, so the provider retries for ever.
- No prospect or retainer is changed: the ids never match.
- **Why it matters:** under P-610 this PR merges on its own once CI is green and it is approved. Any OTHER request sent between this merge and part 2's then holds wrong state changes and an endless retry loop.
- **Note:** `declined` is answered "applied by FO-5d" and stored, which matches part 2.

## Minor
- **m1. The decompression cap is not a total** (`any-document/service.ts:51-58`).
  - A stream that passes 16 MB throws `RangeError`, which is caught without adding to `out`. So 400 such streams inflate 400 × 16 MB = 6.4 GB, against the comment's "64 MB inflated".
  - **Test file:** `bomb25mb.pdf` (24.6 MiB: 400 streams of 17 MB of zeros, plus filler) → 201.
  - **Measured:** `checkPdf` alone blocks for 2.2-2.5 s, with peak RSS 250 MB against a 108 MB baseline. Through the API the send takes 2.5 s, and `monitorEventLoopDelay` max is **2.1 s**: every request of every firm waits.
  - Any staff member with the send key can repeat it.
- **m2. Hand-made files still dodge the check.** Each file below keeps an XFA form that pypdf reads, and each is accepted with 201 under the name `letter.pdf`:
  - (a) 400 small streams placed before the object stream (`streams < 400` runs out);
  - (b) the word `stream` in a `%` comment just before it, so the scan pairs the wrong start with the next `endstream`;
  - (c) `/FlateDecode` more than 400 bytes before `stream`, using a long `/Pad` entry;
  - (d) a zlib stream without its 4-byte Adler checksum (Node throws; pypdf reads it);
  - (e) an escaped key `/X#46A` (raw and inflated checks look for `/XFA` literally).

  The plain object-stream file (`base.pdf`) is refused, as are **all 87 IRCC forms on disk and the 3 opened copies** (the other 2 IRCC files, a checklist and an instruction sheet, are refused as protected). Real files are now caught: round 1's M1 is fixed for them.
- **m3. Name check dodges** (`:46`). `IMM.5476`, `IMM–5476` (en dash), `IMM  5476` (two spaces), `IMM_-5476`, a Cyrillic `ІММ5476`, a full-width `ＩＭＭ５４７６`, `IMM<ZWSP>5476` in the file name, and `SIMM5476` are all accepted. The underscore case is now caught (`client_IMM5476.pdf` → refused).
- **m4. False positive outside what the PR body declares.** A plain AcroForm with a certification signature (`/Perms /DocMDP`, as Acrobat's "Certify" writes) is refused as a government form. The PR body declares only Reader-extended forms as refused. The LibreOffice plain and form exports and a plain pypdf AcroForm are accepted.
- **m5. The title rule refuses ordinary non-English text** (`routes.ts:20`). `\p{Cf}` includes U+200C ZWNJ, which Persian spelling needs ("نمایندگی‌ها"), and U+200D ZWJ (Devanagari "क्‍ष", family emoji). U+061C (Arabic letter mark) is refused too. Emoji-only titles are now refused, because a letter or digit is required.

## What held
- **Title rule, no 500 left:**
  - The database's `[[:cntrl:]]` (ctype C) matches exactly U+0001-001F and U+007F-009F, and every one is refused by `\p{Cc}` with a 422.
  - Also refused with 422: U+0085, U+2028, U+200B, U+FEFF, U+202E, U+00AD, tag characters, U+180E, combining-only and punctuation-only titles.
  - Accepted and stored exactly: U+FFFF, private use, unassigned, U+FFFD (a lone surrogate arrives as U+FFFD), CJK, Arabic, Hindi, Arabic-Indic digits, 200 characters, and 100 astral letters. 101 astral letters → 422.
- **List:** 23 requests, newest first (`sentAt` descending).
- **New keys** (as `xr_app` in firm A):
  - An uploader from firm B, a random uuid or a person id → refused by `fo_signing_document_firm_id_uploaded_by_fkey`.
  - The same insert as the superuser with firm B's id and firm A's staff → refused.
  - Deleting the uploader, or changing their id → refused.
  - The keys are named as Prisma names them, and the schema validates.
- **Send path unchanged:** LibreOffice exports → 201.

Verdict: Changes
