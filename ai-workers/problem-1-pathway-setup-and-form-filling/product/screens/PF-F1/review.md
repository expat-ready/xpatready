# PF-F1 review: the S3 FilesPort adapter on a recorded fake client (independent reviewer, 22 Nov 2026)

Commit reviewed: **853f37a3226383c66f1c58b1b77d66fe4f8deda4** (branch `claude/loving-fermi-c75sij`). Diff `origin/main...853f37a32`: 13 files, +737/−0. Checked against BACKLOG row PF-F1 (line 1046), the brief `design/briefs/track-b/PF-F1.md` (on `origin/lead-b/2026-11-22-track-b`), `ports/files.ts`, its contract, `LocalFiles`, STANDARDS §1/§3/§7/§8, P-587, AGENTS rules 4-5.
**No screen, no route, nothing bound in the running app:** no browser walk, no 1440/1024 px or keyboard pass, BIC table N/A, D8-D15/D17/D20 N/A. **Journey test: does not apply (no screen); no journey score is given** and no journey-test report was written. `graph.mjs --check`: 0 hard gaps; nothing in its output names PF-F1, R1.65 or `platform/files`.

## What I ran (Node 24.22.3, no network, no AWS, US$0)
* `check_pff1_s3_files.ts`: **58 passed, 0 failed** (1.9 s). `check_pffd_delete.ts` 24/0. `check_pffp_pdf.ts` 41/0 (live line NOT RUN, as designed). `check-port-contracts.mjs`: 26 ports, FilesPort ×3, 0 problems.
* **Mutations** on a scratch copy outside the repository (the working tree was never changed). Each one makes the check exit 1:

| Mutation of `s3-files.ts` / `choose.ts` | Caught by |
|---|---|
| no firm prefix in `objectKey` (:52) | 11 FAIL (contract wall, case 1) |
| put without `IfNoneMatch` (:101) | 10 FAIL (contract write-once, race case) |
| no SSE, or SSE `AES256` instead of KMS (:79) | 11 FAIL each (bucket policy 403) |
| no person check / no firm check in `open` (:197) | case 4 person / firm line |
| expiry check removed, or `left < 0` (:199) | exit 1 by a crash: `signedGetUrl` refuses 0 s (:159), so it still fails closed |
| retry accepts any taken key / ignores the content type (:105) | 8 / 5 FAIL |
| MAC check removed; `exists` ignores the tombstone; `open` skips `exists` | case 4 altered-link / deleted-file lines |
| the signed address always 300 s (:201) | 2 FAIL (the 4 min 59 s line, the expired-address line) |
| production with `PLATFORM_FILES` unset falls back to local (choose.ts:24) | case 5, both the in-process and child-process lines |
| default region `us-east-1`; SDK message leaked into the error | 3 FAIL / 1 FAIL |
| **`get` integrity check removed (:123)** | **still green** (m4) |

* Probe of the real SDK's output: the PUT carries `if-none-match: *`, `x-amz-server-side-encryption: aws:kms`, the key id, `x-amz-meta-sha256` and the SDK's own CRC32. The presigned URL is signed on `host` only (`X-Amz-SignedHeaders=host`; `x-amz-checksum-mode` is a query parameter), so a browser can use it.

## The row's six cases (pass and fail each)
1. **Firm wall:** met. Pass: test lines 49-51. Fail: path tricks and non-uuid firms are refused before any request (:52), and a no-prefix adapter fails the contract's wall case (:54-56). The key is built in one place (`objectKey`, s3-files.ts:52) from `FirmId.parse` (lower-cased) and `FileKey.parse`, so a fixed-length uuid prefix cannot be escaped.
2. **Write-once by a conditional put:** met. Pass: :64, :67-69. Fail: other bytes or type give `FileKeyTaken` (:65); a racing writer wins and this put gets `FileKeyTaken` (:71-75); an unconditional-put adapter fails the contract (:77-79). Every put goes through one `send` with `If-None-Match: *` (:74-90); on a 412 it reads back the sha256 metadata and the type (:102-106).
3. **KMS on every put:** met. Pass: 3 files and the delete's tombstone all carry the header and key (:100-101). Fail: the bucket policy refuses a missing or different key (:103-104); the check over the requests finds a plain put and an AES256 put (:105-110); an adapter without a KMS key cannot be made (:111, s3-files.ts:62).
4. **Links, 5 min (Sample), one firm and one person:** met. Fail: another firm, another person, an altered token, another server's key, at 5:00 and an hour later, deleted and never-written keys, all 404 (:128-144). Pass: own person at 0 s and at 4:59, with the address expiring at the same instant (:122-136). HMAC-SHA256 with domain separation `pf-s3-file-link:` (distinct from FO-5's `fo-file-link:`); `timingSafeEqual` on fixed 43-character MACs; the JSON is parsed only after the MAC is verified; a link key under 32 characters is refused.
5. **Fails closed:** met at the module level. `NODE_ENV=production` or `PLATFORM_ENVIRONMENT=production` (an existing setting) with `PLATFORM_FILES` unset or blank throws, and a child process exits non-zero (:152-155). Any other value is refused everywhere, and refusals never echo a value (:160-163). See m1: nothing calls it at start-up yet.
6. **FO-5 unchanged:** met by construction. The chooser's local adapter is `LocalFiles` and passes the full contract (:168-170). The diff touches no FO-5, `ports/` or sibling test file (:171, confirmed by `git diff`). I did not run `check_fo5_retainers.ts` (it needs PostgreSQL); CI does.

## Adapter, fake, gate, packages
* **Security:** errors carry the operation, S3's error name (regex-checked) and the status only (:47-50). No logging. Credentials go only through `Secret.reveal()` inside the provider. The fake's credentials and ids are generated per run. No value is leaked in the chooser's refusals.
* **The fake is honest and labelled.** The requests are the SDK's real ones; the answers are written from the SDK's own docs (the `IfNoneMatch` quote matches `models_0.d.ts` line ~15351). README and gate say plainly that nothing was captured live, that signatures are not checked, and that `docs.aws.amazon.com` was blocked. Two assumptions are not listed (m2).
* **Gate page** (`design/tech-gate-files-s3-2026-11-22.md`): problem, 4 options, integration, upkeep, data, reconsider, licence read at source with "Unconfirmed: no counsel", exact 3.1161.0 (the same line as SES and Cognito), 30 Oct (23 days old), and the no-network CI method. These meet STANDARDS §1 and the brief. The P-587 six checks are not shown (m3).
* **Packages:** `package.json` +2 exact pins only. The lockfile has +74/−0: the root entry, the two packages, and `@aws-sdk/checksums` 3.1002.1 plus `@aws-sdk/middleware-sdk-s3` 3.972.85. Every dependency resolves inside the lockfile, `@aws-sdk/core` stays at 3.979.1, all four are Apache-2.0 with `LICENSE` present, and none has an install script. I did not re-check publish dates (no network allowed).
* **Touch list:** all 13 files are inside the brief's list. `ports/files.ts` and `tools/` are unchanged (the guard finds S3Files by itself). No personal names. 5 minutes is labelled Sample in the code, the card and the gate. `delete`/`usedBytes` are not invented scope: `FilesPort` requires them.

## D1-D20 (1-5; runtime row, no screen)
D1 5 (every row line and all six cases met) · D2 5 (a conditional put; the firm wall built in one place) · D3 5 (the same port and contract as fake and LocalFiles) · D4 N/A · D5 4 (409 retried, fails closed; m5) · D6 4 (gate dated and sourced; m3) · D7 N/A · D8-D15 N/A (no screen) · D16 4 (every case has a pass and a fail, mutations caught; m4) · D17 N/A · D18 4 (the fake is labelled honestly; m2) · D19 2 (R1.65 still needs PF-F1c and the binding; m1) · D20 N/A.

## Findings
No Blocker. No Major.
* **m1 (Minor) The fail-closed start-up is not wired.** `chooseFiles` (choose.ts:44-46) is called by nothing: features inject `LocalFiles` as a class token in at least 6 files (for example `features/front-office-retainers.ts:15`, where `EntitledFiles extends LocalFiles`), so today a production start does not stop when `PLATFORM_FILES` is unset. The brief allows this ("name that one line… if main.ts or runtime.ts, ask first"), but binding S3 takes more than one line, and no backlog row names it. **Fix:** say it in the PR body (not bound; where binding goes; which row will do it) so R1.65's Works proof does not assume it.
* **m2 (Minor) Two S3 behaviours the fake assumes are not in the README's "Not verified" list.** (a) A put with `If-Match` on an absent key answers 404 (fake-s3.ts:678; the SDK doc for `IfMatch` gives only 412/409). (b) HEAD and GET of a missing key give 404 only if the role has `s3:ListBucket`; without it they give 403 (`HeadObjectCommand.d.ts:56-61`), and `exists`, `get` and links would then throw. **Fix:** list both, and name `s3:ListBucket` as a need for PF-F1c's role (`usedBytes` needs it too).
* **m3 (Minor) The gate page does not show P-587 (3)'s six checks** (adoption, licence, upkeep with release count and maintainers, own tests and CI, security policy, Scorecard). **Fix:** add one line, or point to entries 13-14, which recorded them for the same `aws-sdk-js-v3` repository (including the open "security policy: to confirm on the Mac").
* **m4 (Minor) A rule without a failing test** (STANDARDS §7 [M]): `get` refuses an object whose bytes do not match its sha256, or that has no sha256 (s3-files.ts:123), but removing that line leaves every test green. **Fix:** one case that uses `rawPut` with a wrong `x-amz-meta-sha256` and expects `get` to throw.
* **m5 (Minor) Any 404 reads as "absent"** (s3-files.ts:85, :94, :121): a wrong bucket name (`NoSuchBucket`, 404) makes every `get` null and every `exists` false instead of an error, and `put` then fails as "unsettled". That is fail-closed, but it is misleading. **Fix (optional):** on GET, treat only `NoSuchKey` as absent.

## What I could not check
* CI on this commit (no PR yet).
* FO-5's PostgreSQL suites.
* Registry publish dates and `npm audit` counts (no network).
* Real S3 answers (PF-F1c runs the same contract against the real bucket).
* Case 6's diff line prints NOT TESTED on a clone without `origin/main`, for example a shallow CI checkout. It is never counted green.

**Verdict: Approve** (no open Blocker or Major; m1-m5 are for the builder to fix or answer in the PR) for commit 853f37a3226383c66f1c58b1b77d66fe4f8deda4.

Reviewer: Approve 853f37a3226383c66f1c58b1b77d66fe4f8deda4
