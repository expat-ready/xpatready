# R1.65: fresh reader's verdict (qa 11, 24 Nov 2026, ~01:1x IST 25 Nov)

The reader was a fresh Opus agent in a new context. It only read; it ran nothing and changed nothing. It read main c14d01bec and branch aws/2026-11-22-staging-proof bcc9a6665.

**Reader: Works (conditional on walks j_65 13/13 on main's head)**

**Confidence:** medium-high. The reader could not open GitHub Actions. It took as stated by qa 11:
* gate A, run 45452303616 on aeb644cd9;
* qa 11's own re-run on c14d01bec, 13/13 twice.

## What the reader checked itself
* **The commit.** Main's head is c14d01bec, the merge of #3535 and #3548.
* **The fixtures.** The four files in `tests/fixtures/pff1c/` (07, 08, 11 and 12) are byte-identical to bcc9a6665's `r165/` files by sha256, and the SHA256SUMS lines agree.
* **The parts are merged:**
  * #2955 (cff0a6c24)
  * #3041 (7e084dab2)
  * #3215 (0ac921842)
* **No drift since the AWS read.** `git diff cc349dcfe c14d01bec` is empty for `api/src/platform/files/` and `deploy/cdk/lib/estate.ts`.
* **Gate A walked the same code.** aeb644cd9 is in main, and its j_65 differs from main's in header comments only.
* **The journey's size.** j_65 has 13 steps: setup 1, W1 1, W2 1, W3 5, W4 4, W5 1.
* **Open findings.** No open Major or Critical in BUGS.md names R1.65, PF-F1, S3 or the bucket.

## Done-when, clause by clause
* **Files stored.**
  * W1 (`j_65.ts:134-141`): an upload is answered 201, the key is kept in the database, and the same bytes come back.
  * W3 does the same with the app's file setting on S3.
  * `08` shows a real aws:kms put accepted, with a version id.
* **In ca-central-1.**
  * `07`: the app task's bucket is `ca-central-1`.
  * W3: the PUT is signed for ca-central-1.
  * W4: the adapter uses the ca-central-1 host, refuses us-east-1, and defaults to ca-central-1.
  * W5: reads `07`.
* **Under the firm's prefix.**
  * W3 (`:166-167`) and W4 (`:202-203`) both see `<firm A id>/…`. Both run on fakes.
  * On the real bucket the prefix is only inferred: from `11` (`otherFirmReads=null`) and from the task role's `*/*` scope.
* **Versioned.**
  * `07`: versioning `Enabled` on all three buckets.
  * W5 ties this to the task's own PLATFORM_FILES_BUCKET.
  * Old versions expire after 35 days.
* **Encrypted.**
  * `07`: default encryption is aws:kms under the task's key, and the bucket policy has two Denys.
  * `08`: a put with no header, or with AES256, gets AccessDenied; an aws:kms put is accepted.
  * `12`: the object reads back as aws:kms under that key.
  * W3 and W4 send the SSE-KMS headers, and the fake refuses an unencrypted put (403).
* **Another firm's key refused.**
  * W2 and W3 fail cases: each gives 404 with no bytes.
  * W4 fail case: get is null and exists is false.
  * The real bucket, in the app task (`11`): `otherFirmReads=null pathTrick=refused`, rc=0.

## Findings (none blocks Works)
* **Minor** (`j_65.ts:233,237`): W5 computes `bucketKey` but does not assert it, and does not check the task's `PLATFORM_FILES_REGION`. The bucket's own region is asserted, so the clause holds.
* **Minor:** no committed output shows the real object's key. The commands behind `08`, `10` and `12` are not committed, and `r165-live.sh` did not write `08`. W5 reads only `07` and `11`.
* **Minor (note)** (`service.ts:198`): the task role may read and write every `*/*` object.
  * So a cross-firm read is refused by the app (firm-prefixed keys, and the path trick refused), not by storage.
  * The row is met as worded. A per-firm IAM boundary would be a separate row.
* **Minor:** W5 checks recorded answers from 24 Nov 04:08 UTC, not live AWS. The CDK is unchanged since cc349dcfe, so drift is unlikely, but nothing proves it again.
