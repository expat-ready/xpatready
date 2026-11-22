# PF-F1: the recorded fake S3 client

`fake-s3.ts` is the AWS SDK's `requestHandler` (the seam the SES adapter's test uses). The real `S3Client` builds every HTTP request; the handler keeps it and answers from memory. Nothing reaches the network; no AWS account is used (US$0).

**What "recorded" means here, plainly:** the requests are recorded for real (they are what `@aws-sdk/client-s3` 3.1161.0 sends). The **answers were not captured from a live bucket** (no AWS call is allowed in this row; the founder's AWS is an outside dependency). Their shapes are written from the SDK's own published documentation, read in the installed package on 22 Nov 2026:

| Fixture | What it is | Source |
|---|---|---|
| `errors.json` `PreconditionFailed` 412, `ConditionalRequestConflict` 409 | the conditional put's refusals | `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`, `IfNoneMatch`: "Otherwise, Amazon S3 returns a `412 Precondition Failed` error. If a concurrent operation occurs during the upload S3 returns a `409 ConditionalRequestConflict` response. On a 409 failure you should retry the upload." |
| `errors.json` `NoSuchKey` 404, `AccessDenied` 403, `InternalError` 500 | S3's standard error codes | the SDK's error classes and its XML error parser (the test proves the SDK reads each into `name` and `$metadata.httpStatusCode`) |
| `error.xml` | S3's error document (`Error/Code/Message/Resource/RequestId/HostId`) | read by the SDK's own parser in the test |
| `list-objects-v2.xml`, `list-objects-v2-contents.xml` | `ListBucketResult` with `Contents`, `IsTruncated`, `NextContinuationToken` | read by the SDK's own deserialiser in the test (`ListObjectsV2CommandOutput`) |

**Not verified:** `docs.aws.amazon.com` is blocked on the cloud network, so the S3 API reference pages were not opened. **Not verified against a real bucket** (round 1's review m2 and break report):
* the status a bucket policy gives an unencrypted put (403 `AccessDenied` here), and the code of an expired signed address (403 here);
* a put with `If-Match` on an absent key (404 here);
* a missing key answers 404 only when the role holds `s3:ListBucket`; without it S3 answers 403 (`HeadObjectCommand` documentation in the SDK) and the adapter would throw instead of answering absent. PF-F1c's role needs `s3:ListBucket` (also for `usedBytes`);
* an SSE-KMS object's ETag (not the MD5 of its bytes: here a made-up one per put);
* header values: the fake trims spaces at their ends, as an HTTP hop does; it does not refuse characters Node's HTTP layer refuses (the adapter keeps the exact content type in metadata, base64url, and sends only a safe Content-Type header);
* a HEAD has no body, so the SDK names every HEAD 404 `NotFound`: `exists`, `delete` and a link's `open` cannot tell a missing bucket from a missing key and answer absent (GET and PUT name `NoSuchBucket` and throw). A start-up check of the bucket would close this: not in this row (listed in the PR);
* the CRC32 checksum the SDK sends on every put is not checked; signatures are not checked; a signed address that dies early because the task role's temporary credentials end is not modelled; a body that never ends is not modelled. PF-F1c runs the same contract (`ports/contracts/files-port.contract.ts`) against the real bucket and replaces any answer here that differs.

The fake does not check request signatures. Ids, keys and the bucket name in tests are made up (`pff1-recorded-…`), never real.
