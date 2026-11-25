# R1.80 / C7.2 gate A walk by screens — qa 6, 19 Nov 2026 18:3x–18:4x IST

**Copy:** isolated, port 4473 (`xr_studio_qa6_r180b`), main **6f2caced0** exported (includes #2235 and every app merge since 3ab13f559); live AI off, US$0, no priced button; :4400 untouched. Browser pane at 1024 × 768. Personas by the app's own "Acting as" switch (simulated).

## Setup (through the product's screens)
1. Configuration author › Demo › **Load the configured checkpoint** (US$0): every row Done except row 2 (Parked, P-102). Row 12: "IMM 5257 generated for 4 of 4 applicants on release 1 (C7.1); 4 validated in Adobe on the Mac and read back equal".
   On that data the family case's IMM 5257 for Client A shows "Validated in Adobe on the Mac and read back equal (Sample)", but **"Not yet: 10 facts to answer or confirm before filing"**: the configured checkpoint leaves the case before filing, so the walk cannot reach the next capability there.
2. Configuration author › Demo › **Load the finished story** (type RESET; US$0; 202): every step Done. It includes "IMM 5257 for Child 18 or over (Sample) filed on Paper… its copy validated in Adobe on the Mac and read back through the upload door". It is the data Build Lead C's Adobe run used (result.json).
   (A first copy on :4472 had a stale generated Prisma client in qa's sandbox export; the checkpoint's row 12 failed there with "reading 'create'". Regenerated; the fault was qa's set-up, not the app's.)

## Walk (Case officer)
| Step | Screen | Seen | Result |
|---|---|---|---|
| 1 | Cases › C-2026-00001 SAMPLE-VV-FAMILY-1 › Prepare application › **IMM 5257 for Child 18 or over (Sample)** | chip **"Validated copy read back"** (its title: **"Read back 75 of 75 values; barcodes 5 of 5 read"**), "Validated copy uploaded back", "Filed"; Print and sign in pen: 1. Validated in Adobe: done (validated copy of 19 Nov 18:44, read back 18:44), 2. Printed: done, 3. Signed in pen: done; "To write by hand in Adobe: Province or state…" | PASS · `r180-walk/01-paper-imm5257-validated-read-back.jpg` |
| 2 | **Ready to file** | the rule in words: "Only a barcode form without its validated copy read back, or a document its release says can never be waived, blocks"; all 4 filings Submitted · Approved, reviewed by the Representative (licence R000000) | PASS |
| 3 | **Submission to IRCC** (C8.2, the next capability) | "One submission for 4 people applying · Recorded · read-only": application numbers V300000001–4, through APR Portal, our references, UCIs; **Correct a number…** opens its dialog for Child 18 or over (V300000004, reason field); cancelled, nothing changed | PASS · `r180-walk/02-c82-recorded-submission-correct-a-number.jpg` |
| 4 | An upload whose barcodes cannot be read, refused on screen | not walked: the browser pane has no file picker. Covered underneath by C7.2's pack Part 1 ("a copy whose barcodes cannot be read … is never ready for filing; the words say to press Validate in Adobe Reader"), 11/11 in nightly 44525657410 and 44525774127 | by API only |

## Notes for the reader
* The barcode result is on screen only as the chip's hover title ("barcodes 5 of 5 read"), not as visible text on the line (UX, Minor at most; not a hold).
* The finished story records the submission itself, so C8.2's first step (Record the submission) is already done there; the walk reached C8.2's recorded panel and opened its correction control.
