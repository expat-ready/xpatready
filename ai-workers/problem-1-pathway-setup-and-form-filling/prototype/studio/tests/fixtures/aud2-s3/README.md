# AUD-2 part 2: the recorded fake S3 bucket with Object Lock

`fake-s3-lock.ts` is the AWS SDK's `requestHandler`, the same seam as PF-F1's fake in `../pff1-s3/`. The real `S3Client` (`@aws-sdk/client-s3` 3.1161.0) builds every request. The handler keeps it and answers from memory. Nothing reaches the network, and no AWS account is used (US$0).

**What "recorded" means here:** the requests are real. They are what the SDK sends for `PutObject` with `ObjectLockMode`, `ObjectLockRetainUntilDate`, `ChecksumSHA256` and `IfNoneMatch`, and for `HeadObject`, `GetObject`, `ListObjectsV2` and `DeleteObject`. The test asserts on them.

**The answers were not captured from a live bucket.** No AWS call is allowed on this lane (P-821: the outside accounts are opened in one sitting by the founder). Each answer comes from the SDK's own model in `node_modules/@aws-sdk/client-s3/dist-types/models/`:

| Answer | Based on |
|---|---|
| The `x-amz-object-lock-mode` and `x-amz-object-lock-retain-until-date` headers on GET and HEAD | `GetObjectOutput.ObjectLockMode` and `ObjectLockRetainUntilDate`, which the SDK reads from those headers, as the test proves |
| A 400 `InvalidRequest` for an Object Lock put with no checksum | The SDK's `PutObjectRequest` documentation: "The `Content-MD5` or `x-amz-sdk-checksum-algorithm` header is required for any request to upload an object with a retention period configured using Amazon S3 Object Lock" |
| A 403 `AccessDenied` for a DELETE of a COMPLIANCE version before its date | The SDK's `ObjectLockRetentionMode` documentation for compliance mode |
| A DELETE with no version id writing a delete marker (204), which hides the current version without removing any; a later PUT adding a new version; `ListObjectVersions` listing both (review M1) | The SDK's `DeleteObjectRequest` and `ListObjectVersionsOutput` documentation (versioned buckets); Object Lock requires versioning |
| A 412 `PreconditionFailed` for `If-None-Match: *` on a taken key | PF-F1's README |

**Not verified against a real bucket (owed, P-821, with AUD-2c's bucket in `ca-central-1`):**
* the exact status and code S3 gives a locked-version delete (403 here);
* the exact `ListVersionsResult` XML S3 sends: the fake's is built from the SDK's model, and the SDK's own deserialiser reads it in the test;
* the retain-until date's precision as S3 returns it;
* the error a bucket without Object Lock gives for the lock headers. Here, `lockless: true` ignores them, and the adapter's own check after the put catches it.

Bucket names and keys are made up (`aud2-recorded-…`), never real.

**Rules for AUD-2c's real bucket** (review round 2, m3). The archive check reads a chain's files from seq 1 for ever, so:
* the bucket has **no expiry rule** that removes an export, even after its keep period. An export removed would read as a hole in every later check. Moving exports to a cheaper storage class is fine;
* there is **one bucket per environment and per database**. A database rebuilt from nothing against a bucket that already holds locked exports would conflict with them on every chain.
