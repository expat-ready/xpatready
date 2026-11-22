# Technology gate: private file storage on Amazon S3 (PF-F1, 22 Nov 2026)

Row **PF-F1** (`product/BACKLOG.md`; capability R1.65, map row 65: storage in Canada), STANDARDS §1 ("a new tool only for a concrete, evidenced gap; record problem, options, integration and upkeep cost, data/licence impact, and when to reconsider"). Two entries, numbered on from `tech-gate-platform-front-office-2026-11-14.md` (entries 1 to 17). **Approval:** Lead B (Track B) reads and approves in the PR (the row says so); the Lead reads `package.json` and this page before the label (P-423); the tech lead records the lines in `ENVIRONMENT.md`.

**How this was checked (22 Nov 2026, 11:5x to 12:3x IST, runtime lane, cloud):** versions, publish times, licence fields and dependencies from the npm registry (`npm view <name> time|license|dependencies`); licence texts opened in the published packages (`node_modules/@aws-sdk/<name>/LICENSE`) and in the project's repository at the release tag (`https://raw.githubusercontent.com/aws/aws-sdk-js-v3/v3.1161.0/LICENSE`). **Age rule:** at least 14 days old on 22 Nov, so published on or before 8 Nov 2026. **Same line rule (the brief):** the same 3.x line as the two `@aws-sdk/*` clients already in `package.json`, 3.1161.0.

**Licences: Unconfirmed: no counsel.** "Read at source" means the licence file was opened and read on the date given; it is not a legal opinion.

**Not verified: `docs.aws.amazon.com` blocked on the cloud network.** S3's behaviour below is quoted from the SDK's own published documentation inside the installed package, not from the API reference pages.

## Summary

| # | Need | Pick | Exact version (published) | Licence (read at source) | Our data leaves to | Added by |
|---|---|---|---|---|---|---|
| 18 | `FilesPort` on S3 in Canada (PF-F1; AG-9-17, AG-9-18, AG-9-19; map row 65) | `@aws-sdk/client-s3` | 3.1161.0 (30 Oct 2026, 18:46 UTC) | Apache-2.0 | the firm's files, their keys, types and sha256 to Amazon S3, region by configuration, default `ca-central-1` | PF-F1 |
| 19 | Short-lived signed GET links (PF-F1; AG-9-16) | `@aws-sdk/s3-request-presigner` | 3.1161.0 (30 Oct 2026, 18:44 UTC) | Apache-2.0 | nothing (the address is computed in-process; no call) | PF-F1 |

New runtime libraries in the API: 2, with 2 transitive packages new to the lockfile (`@aws-sdk/checksums`, `@aws-sdk/middleware-sdk-s3`). Everything else they need was already in the lockfile through entries 13 and 14.

## 18. `@aws-sdk/client-s3`

* **Problem (evidenced gap).** `FilesPort` (`ports/files.ts`) has one real adapter, `LocalFiles` (`api/src/front-office/files.ts`): a folder on the server's own disk. Its own header says "In the test environment and production the adapter is S3 in Canada (PF-8); this port stays." A deployed server's disk is lost on every new task, is not shared by two tasks, and is not the encrypted, access-logged store AG-9-17 to AG-9-19 and SA-8-6 ask for. The row needs a conditional put (write-once), KMS server-side encryption on every put, and a region fixed by configuration.
* **Options.**
  1. **`@aws-sdk/client-s3` (picked).** AWS's own client; the same family, version line and shared core as the two clients already in `package.json` (`client-sesv2`, `client-cognito-identity-provider`, both 3.1161.0), so the credential chain (the task's role), retries and the `requestHandler` test seam are the ones the team already runs. It has the three things the row needs as typed fields: `IfNoneMatch`, `ServerSideEncryption` + `SSEKMSKeyId`, `region`.
  2. **Node's own `fetch` with a hand-written Signature Version 4.** No package, but we would own request signing, the credential chain for the task's role, XML error parsing and retries: security-sensitive code we would have to keep right. Refused: a small library beats our own cryptographic plumbing.
  3. **Another S3 client (`minio`, `s3-lite-client` and the like).** A second vendor's code for a service whose own client we already ship the core of; no gain. Refused.
  4. **Keep `LocalFiles` on a network disk (EFS).** No per-object encryption key choice, no conditional put across tasks beyond what the file system gives, no signed links; not what the capability map's row 65 names. Refused.
* **Version and age.** 3.1161.0, published 30 Oct 2026 18:46 UTC (23 days old on 22 Nov). The newest is 3.1175.0 (21 Nov), 1 day old: too young, and it would move the shared core away from the two clients we have.
* **Licence.** Apache-2.0 (registry field). `LICENSE` in the package opened and read 22 Nov 2026: "Apache License Version 2.0, January 2004". The repository's `LICENSE` at tag `v3.1161.0` opened the same day: the same text.
* **What it brings (lockfile).** Installed with npm 11.19.1 on Node 24.22.3, `--save-exact`, `--before=2026-10-31T23:59:59Z` (the cut-off entries 13 and 14 used, so nothing already in the lockfile moves). **4 lockfile entries added, none changed, none removed** (74 lines added, 0 removed):

  | Package | Version | Published | Licence |
  |---|---|---|---|
  | `@aws-sdk/client-s3` | 3.1161.0 | 30 Oct 2026 | Apache-2.0 |
  | `@aws-sdk/s3-request-presigner` | 3.1161.0 | 30 Oct 2026 | Apache-2.0 |
  | `@aws-sdk/checksums` | 3.1002.1 | 30 Oct 2026 | Apache-2.0 |
  | `@aws-sdk/middleware-sdk-s3` | 3.972.85 | 30 Oct 2026 | Apache-2.0 |

  A first try with the cut-off at 8 Nov (the latest the age rule allows) picked `@aws-sdk/checksums` 3.1002.3, which asks `@aws-sdk/core` ^3.980.1 and so **moved the shared `@aws-sdk/core` from 3.979.1 to 3.980.1** under the SES and Cognito clients. That was undone: with the 31 Oct cut-off the shared core stays at 3.979.1 and no existing entry changes. On disk: about 6.6 MB (`client-s3` 4.6 MB). No install script in any of the four.
* **`npm audit`.** 20 before and after (10 moderate, 10 high), none in the four added packages.
* **Integration.** One file, `api/src/platform/files/s3-files.ts` (`S3Files implements FilesPort`), chosen by `api/src/platform/files/choose.ts` (`PLATFORM_FILES=local|s3`). No caller changes: the port is the same. Not bound in any feature in this row (see the PR).
* **Data.** The firm's files go to the bucket in the configured region, default `ca-central-1` (Canada, P-559). Object keys hold ids only (`<firm id>/<key>`), no name or email. The client is given the region; it does not follow a redirect to another region (the SDK's `followRegionRedirects` is off unless set, and this adapter does not set it). No key is a setting: S3 signs with the task's role (PF-24).
* **Gold class (P-587 (1), the six checks; the same repository as entries 13 and 14):** (1) established and widely adopted: AWS's own SDK for S3, the client the team already runs for SES and Cognito; (2) licence Apache-2.0, OSI permissive (above); (3) upkeep: 222 releases of `@aws-sdk/client-s3` in the 365 days to 22 Nov 2026 (npm registry), published by two npm maintainers (`amzn-oss`, `aws-sdk-bot`) for AWS's SDK team; (4) its own tests and CI: the repository runs them on every release (as entries 13 and 14 record; not re-opened here, `api.github.com` is blocked on the cloud network); (5) security policy: no `SECURITY.md` in the repository at tag `v3.1161.0` (404, checked 22 Nov 2026); AWS takes SDK reports through its central vulnerability-reporting page, **to confirm on the Mac** (as entry 14); advisories reach us through `npm audit` in CI; (6) OpenSSF Scorecard: **Not verified: `api.securityscorecards.dev` gave no answer on the cloud network**.
* **Upkeep.** Moves together with the other two `@aws-sdk/*` clients, on one version line, under the 14-day rule.
* **When to reconsider.** If the three clients cannot stay on one line; if an upload must be larger than one request allows (multipart: PF-F2's tus rail decides); if the store leaves AWS.

## 19. `@aws-sdk/s3-request-presigner`

* **Problem.** AG-9-16: a download is a short-lived signed link, not a public object and not the file streamed through our server's memory. A signed S3 GET address needs Signature Version 4 in query form.
* **Options.** (1) **This package (picked):** AWS's own, 100 KB, computes the address in-process from the same client and credentials, no call. (2) Our own query signing: the same refusal as option 2 above. (3) Stream every download through the API: works, but every byte crosses our server and the row names signed links.
* **Version, licence, lockfile.** 3.1161.0, 30 Oct 2026 18:44 UTC; Apache-2.0, `LICENSE` in the package read 22 Nov 2026; part of the four entries above.
* **Integration.** `S3Files.signedGetUrl`, called only by `S3FileLinks.open` after its checks (firm, person, end time, the file exists). The address ends at the same moment as the link (5 minutes after the link is made; **Sample**, the value the local adapter's `LINK_SECONDS` already uses).
* **Data.** Nothing is sent. The address names the bucket, the object key (ids only) and the access key id of the task's role (not secret); whoever holds it can read that one file until it ends.
* **When to reconsider.** If links move to a CDN's signed addresses.

## How CI tests the adapter with no network (the recorded fake client)

* **No new test tool.** No mock library, no LocalStack or MinIO container. The SDK lets a client be given its `requestHandler`; the test gives it `tests/fixtures/pff1-s3/fake-s3.ts`. This is the seam the SES adapter already uses (`tests/check_pf19b2_ses.ts`: "CI and lanes use recorded SES answers: the client takes a `requestHandler`, never the network").
* **What is real in the test.** The whole of `@aws-sdk/client-s3`: it builds each HTTP request, so the test reads the true headers (`x-amz-server-side-encryption: aws:kms`, the KMS key id, `If-None-Match: *`, `If-Match`), the true host (`<bucket>.s3.ca-central-1.amazonaws.com`) and the true signed address; and it parses the answers (errors, object headers, the list XML) with its own code.
* **What is fake.** S3 itself: an in-memory bucket that keeps S3's rules for the calls the adapter makes (conditional put 412, 409, 404, 403; a bucket policy that refuses a put without KMS encryption under the key; a signed address refused once its time has passed).
* **What "recorded" does and does not mean.** The requests are the SDK's real ones. The answers were **not captured from a live bucket** (no AWS call in this row; no account yet); they are written from the SDK's own documentation, quoted in `tests/fixtures/pff1-s3/README.md`. Example (`IfNoneMatch`, `models_0.d.ts`): "Otherwise, Amazon S3 returns a `412 Precondition Failed` error. If a concurrent operation occurs during the upload S3 returns a `409 ConditionalRequestConflict` response. On a 409 failure you should retry the upload."
* **The same contract for fake and real (P-606).** `S3Files` runs the shared `FilesPort` contract (`ports/contracts/files-port.contract.ts`) beside `fakeFiles` and `LocalFiles`; `tools/check-port-contracts.mjs` now lists it. PF-F1c runs the same contract against the real bucket, which is where a wrong fixture would show.
* **Cost.** US$0: no AWS account, no network, no model call. `tests/check_pff1_s3_files.ts` runs in a few seconds with no database and no server.
