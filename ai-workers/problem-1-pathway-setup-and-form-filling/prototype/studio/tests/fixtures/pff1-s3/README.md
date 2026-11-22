# PF-F1: the recorded fake S3 client

`fake-s3.ts` is the AWS SDK's `requestHandler` (the seam the SES adapter's test uses). The real `S3Client` builds every HTTP request; the handler keeps it and answers from memory. Nothing reaches the network; no AWS account is used (US$0).

**What "recorded" means here, plainly:** the requests are recorded for real (they are what `@aws-sdk/client-s3` 3.1161.0 sends). The **answers were not captured from a live bucket** (no AWS call is allowed in this row; the founder's AWS is an outside dependency). Their shapes are written from the SDK's own published documentation, read in the installed package on 22 Nov 2026:

| Fixture | What it is | Source |
|---|---|---|
| `errors.json` `PreconditionFailed` 412, `ConditionalRequestConflict` 409 | the conditional put's refusals | `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`, `IfNoneMatch`: "Otherwise, Amazon S3 returns a `412 Precondition Failed` error. If a concurrent operation occurs during the upload S3 returns a `409 ConditionalRequestConflict` response. On a 409 failure you should retry the upload." |
| `errors.json` `NoSuchKey` 404, `AccessDenied` 403, `InternalError` 500 | S3's standard error codes | the SDK's error classes and its XML error parser (the test proves the SDK reads each into `name` and `$metadata.httpStatusCode`) |
| `error.xml` | S3's error document (`Error/Code/Message/Resource/RequestId/HostId`) | read by the SDK's own parser in the test |
| `list-objects-v2.xml`, `list-objects-v2-contents.xml` | `ListBucketResult` with `Contents`, `IsTruncated`, `NextContinuationToken` | read by the SDK's own deserialiser in the test (`ListObjectsV2CommandOutput`) |

**Not verified:** `docs.aws.amazon.com` is blocked on the cloud network, so the S3 API reference pages were not opened. **Not verified against a real bucket:** the status a bucket policy gives an unencrypted put (403 `AccessDenied` here), and the exact code of an expired signed address (403 here). PF-F1c runs the same contract (`ports/contracts/files-port.contract.ts`) against the real bucket and replaces any answer here that differs.

The fake does not check request signatures. Ids, keys and the bucket name in tests are made up (`pff1-recorded-…`), never real.
