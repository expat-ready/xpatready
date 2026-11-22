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

## Round 2 (diff 853f37a32..46791a083)

Commit reviewed: **46791a08357619f3ab162c6d45846fac447c0862** (branch `claude/loving-fermi-c75sij`). Diff only: `git diff 853f37a32 46791a083 -- . ':(exclude)*/product/screens/PF-F1/*'`, 7 files, +97/−22 (`s3-files.ts`, `choose.ts`, the test, the fake, `errors.json`, the fixture README, the gate page). This is still a runtime row: **no screen, no route, nothing bound in the app.** **Journey test: does not apply; no journey score; no journey-test report.** I did not start the app or run `run-suites.sh`.

### What I ran (Node 24.22.3, no network, no AWS)
* `check_pff1_s3_files.ts` on the working tree at 46791a083: **72 passed, 0 failed.** The working tree was clean before and after.
* **Mutations** on a scratch copy outside the repository: 71/0 green there, because case 6's `origin/main` line prints NOT TESTED in a copy. Each round 2 fix was removed one at a time:

| Fix removed | Result |
|---|---|
| `ResponseContentDisposition: "attachment"`; `ResponseCacheControl: "no-store"` (s3-files.ts:178) | 1 FAIL each ("break m1 pass") |
| `Number.isFinite(nowMs)` guard (:221) | exit 1 by a crash (`signedGetUrl` throws on NaN seconds), not by the named line (r2-m4) |
| `contentType.trim()` (:113) | exit 1 by a crash (`FileKeyTaken` on the retry), not by the named line (r2-m4) |
| printable-ASCII refusal (:112) | 1 FAIL ("break m3 fail") |
| `name === "NoSuchKey"` on GET (:136) | 1 FAIL ("break m6 fail") |
| integrity check on `get` (:138) | 1 FAIL ("m4 fail"). Round 1's m4 is closed |
| Canada-only region, chooser / constructor | 2 FAIL / 1 FAIL |
| KMS key region = bucket region, chooser (choose.ts:42) | 1 FAIL |
| **KMS key region = bucket region, constructor (s3-files.ts:75)** | **still green** (r2-m2) |
| production in any case / `prod` (choose.ts:21) | 1 FAIL each |
| dots allowed again in `BUCKET_NAME` | 1 FAIL |

### Each fix judged
* **break m1, links download:** works. The presigner puts both overrides into the signed query, so a browser cannot remove them without breaking the signature. S3 honours `response-*` overrides only on signed requests, which a presigned GET is. This matches the local route's `attachment`. The "break m1 fail" line removes the parameter and fetches from the fake. It shows what the fake would answer, not what the adapter does. The guard is the "pass" line, which fails when the fix is removed.
* **review m5 / break m6, NoSuchBucket:** works on GET. The SDK names a GET error after the XML `Code`, so `NoSuchKey` → null and any other 404 → error. That is fail-closed, also for a 404 with no body. HEAD and PUT are unchanged: see r2-m3.
* **break m7, settings:** works. The bucket regex rejects dots, IP shapes and S3's reserved prefixes and suffixes. Banning dots is stricter than S3 itself, but the reason is sound: TLS on the virtual host. The KMS regex accepts a key ARN, an alias ARN, an alias, a uuid or an `mrk-` id, and an ARN's region must match. **The Canada limit does not conflict with "the region is configuration":** the region is still a setting with a default of `ca-central-1`. The row's own source line names "P-559 (data in Canada)". AG-9-19 says region-configurable *for data residency*. The requirements' complexity register (row 17) says "One Canadian region for all firms". This is not new scope. (Note only: P-559's own text in DECISIONS.md does not contain the word Canada. The label comes from the row.)
* **break m8, production in any case:** works. `productionish` stays local. Adding `prod` is a small extra, but it only makes the refusal stricter, so I do not raise it.
* **break m3, content type:** the ASCII refusal works and fires before any request. The trim keeps S3 consistent with itself, but see r2-m1 for how it fits the port.
* **break m9, NaN clock:** works. NaN and Infinity give 404. Before the fix, open threw (still closed, but a 500).
* **Named errors** (`IntegrityMismatch`, `KeyUnsettled`, `ListWithoutToken`): each is a fixed name that passes the existing name regex. No SDK message leaks.
* **Fake:** trimming header values matches the HTTP hop. The made-up ETag for SSE-KMS objects stays consistent with the `If-Match` on delete, and the delete cases are still green. The overrides are answered on GET only. Nothing the adapter relies on was loosened.
* **README (review m2):** both of round 1's items are listed, `s3:ListBucket` is named for PF-F1c's role, and the new ETag and header assumptions are listed too. Closed.
* **Gate (review m3):** the line shows the six checks under P-587 (1), which defines them ((3) requires that they be shown). Two are honestly left open: the security policy (to confirm on the Mac) and Scorecard (not verified). I could not re-check the release count (no network). Closed.
* **Nothing else changed:** the diff touches no `ports/`, FO-5 or feature file and adds no package. Nothing is bound.

### Findings
No Blocker. No Major.
* **r2-m1 (Minor) Trimming makes S3 differ from the port's "same type" rule and from the other two adapters.** `FilePut` lets a space sit at the end only after a `;` (for example `text/plain; charset=utf-8 `). For that input, S3 `get` returns a different string than the one put, and a later put *without* the space counts as a retry on S3 but is `FileKeyTaken` on `LocalFiles` and `fakeFiles`. The ASCII rule has the same kind of split: S3 refuses types the other two accept, although a real HTTP hop would have failed anyway. No caller sends such a type, and the contract tests only `application/pdf`, so this is an edge case. **Fix:** refuse a type with spaces at its ends, as the ASCII check does, instead of storing it trimmed: what is stored is then exactly what was put. Or record the difference in the PR body for a later port row (`ports/` is outside this row's touch list).
* **r2-m2 (Minor) The constructor's KMS-region check has no failing test.** Removing s3-files.ts:75 leaves everything green, because the m7 line tests only the chooser's copy. **Fix:** add `/in the bucket's region/` for `new S3Files({ bucket: BUCKET, kmsKeyId: KMS, region: "ca-west-1" })` to the m7 fail line.
* **r2-m3 (Minor) A missing bucket is an error on GET only.** `send` (:96) still reads any PUT 404 as "absent". With `IfNoneMatch: "*"`, a 404 can only mean a missing bucket, so `put` against a wrong bucket now ends as `KeyUnsettled`, a specific and wrong name. `exists`, `delete` and `open` still read as absent, because HEAD has no error body. All of this is fail-closed. **Fix (optional):** in `send`, return "absent" on 404 only for the `IfMatch` condition, or only when the name is `NoSuchKey`. Add HEAD's limit to the README's list.
* **r2-m4 (Minor, test quality) Two fixes are caught only by a crash.** Removing the NaN guard or the trim fails the run with exit 1 because an exception stops it. Their named lines never print FAIL, and the 20 or so lines after them never run. CI still goes red, so this is acceptable. **Fix (optional):** wrap those two calls in `refused`/try so each mutation shows its own FAIL line.
* **Carried, as the builder lists them:** round 1's m1 (the chooser is not wired to start-up, so no production stop yet) stays open and must be in the PR body. So must break m2, m4 and m5 (see `break-report.md`). None of them blocks.

### What I could not check
CI on this commit; the registry figures on the gate line (222 releases, maintainers); real S3 answers (PF-F1c); FO-5's PostgreSQL suites.

**Verdict: Approve** (no open Blocker or Major; r2-m1 to r2-m4 and the carried Minors go in the PR body or a follow-up) for commit 46791a08357619f3ab162c6d45846fac447c0862.

Reviewer: Approve 46791a08357619f3ab162c6d45846fac447c0862

## Round 3 (diff 46791a083..cc2058171)

Diff-only, as standing permission A277 allows (round 2 fixed only Minors). I read only `git diff 46791a083 cc20581717993c08c8f920a2a5cb1dd065b4d03b` without `product/screens/PF-F1/*`: `s3-files.ts` (+20/-8), `check_pff1_s3_files.ts` (+14/-6) and the fixture README (+2/-1). This is a runtime row with no screen and no route, so there is no journey test and no journey score. Run: `tsx --tsconfig api/tsconfig.json tests/check_pff1_s3_files.ts` on Node 24 gave **74 passed, 0 failed**. No network, no app, US$0.

I ran each mutation on a scratch copy outside the repo. The tree is unchanged. The baseline there is 73 passed: case 6 says NOT TESTED because the copy has no `origin/main`.

| Mutation | Result |
|---|---|
| any PUT 404 → "absent" again (round 2 code) | **FAIL** on the r2-m1 line (`putSaid` is ""): the fix is caught |
| `get` reads `r.ContentType` instead of the `type` metadata | **FAIL** on the r2-m2 pass line |
| `headerTypeOf` always passes the type through | **FAIL** on the r2-m2 pass line (served header) |
| `headerTypeOf` always `application/octet-stream` | **FAIL** on case 2 (stored object): a normal type is still served as itself |
| constructor KMS-region check removed (s3-files.ts:83) | **FAIL** on the m7 fail line: round 2's r2-m2 is closed |
| NaN guard removed (:228) | **FAIL** on its own named line, and the run goes on (72/1): round 2's r2-m4 is closed |
| retry compares the header copy (`had.ContentType !== headerTypeOf(...)`) instead of `Metadata.type` | **still green** (r3-m1) |
| 768-byte cap in `typeOf` removed | **still green** (r3-m2) |
| tombstone `send` no longer returns "absent" at all | still green. This path is older than this diff (Info below) |
| tombstone drops `type` | still green. Harmless: `get` and `put` stop at `retired` first |

### Each fix
* **Round 2 r2-m1 / break r2-m2 (content type):** fixed, and better than the fix I suggested. The exact type is kept as base64url metadata, so it is ASCII and loses nothing. `get` gives it back byte for byte, and a retry compares it. LocalFiles and S3 now answer the same, and the new line proves it on both adapters. S3 serves the type as the header only when the header can carry it unchanged (printable ASCII, no space at either end). Otherwise it serves `application/octet-stream`, which is safe because links force `attachment`. The 2 KB metadata limit is S3's documented limit for user metadata. `sha256` + `type` + `retired` stay well under it.
* **Round 2 r2-m3 / break r2-m1 (PUT 404):** fixed. A 404 is "absent" only for the tombstone's `IfMatch` put named `NoSuchKey`. Any other 404 throws and names `NoSuchBucket`. The README now states the HEAD limit (`exists`, `delete` and `open` cannot tell a missing bucket from a missing key) and points to a start-up check outside this row. That limit is fail-closed.
* **Round 2 r2-m2 (constructor test):** fixed. See the table.
* **Round 2 r2-m4 (crash-only mutations):** fixed for the NaN guard. The trim no longer exists, so the second half is gone.
* **Nothing invented:** no new package, setting or immigration value. The base64url metadata and the neutral header are adapter internals behind the unchanged `FilesPort`.

### Regression check
* **Objects written before this change** have no `type` metadata. `get` reads them as `IntegrityMismatch`, and a retry put of the same bytes gives `FileKeyTaken`. **Acceptable:** nothing is deployed. PF-F1c (the bucket) still waits on PF-8 and the founder's AWS account, so no S3 object exists anywhere. Put one line about it in the PR body so PF-F1c does not load data written by an older build.
* The port contract and the row's six cases stay green. Case 2 now also pins the stored `type` metadata.

### Findings (round 3)
* **r3-m1 (Minor, test quality) The retry's type comparison is not pinned to the metadata.** Swapping `had.Metadata?.type !== type` (s3-files.ts:130) for a comparison of the served header leaves everything green. Every "other type" in the test differs in its header too (`exact.trim()`, `text/csv`, `name=ete`). Under that swap, two different non-ASCII types would count as a retry, and `get` would then return the first type. **Fix:** add one more case to the r2-m2 fail line: `put(FIRM_A, "types/u.txt", bytesOf("u"), "text/plain; name=étè")` → `FileKeyTaken`. Both types map to `application/octet-stream`.
* **r3-m2 (Minor, test quality and port difference) The 768-byte cap has no test.** Removing `if (t.length > 1024) throw` leaves everything green. The cap also makes S3 refuse a type that `FilePut`, LocalFiles and `fakeFiles` accept, because `FilePut` sets no length limit. That is the kind of split round 2's r2-m1 was about, although no caller sends a 769-byte media type. **Fix:** add a pass at 768 bytes and a fail at 769 (refused before any request), and record the difference in the PR body for a later port row (`ports/` is outside this row's touch list).
* **Info: the `NoSuchKey` name on an `IfMatch` 404 is unverified.** The README lists "a put with `If-Match` on an absent key (404 here)" as not checked against a real bucket. The new rule now also depends on the error code being `NoSuchKey`. If real S3 names it otherwise, a `delete` racing an out-of-band removal throws instead of answering `deleted: false`. That is fail-closed and rare. Add the code to that README bullet so PF-F1c checks it. The tombstone "absent" path has no test, but that predates this diff.

Neither Minor blocks. Both go in the PR body or a follow-up, with round 2's carried Minors.

**Verdict: Approve** (no open Blocker or Major; r3-m1 and r3-m2 are Minor) for commit cc20581717993c08c8f920a2a5cb1dd065b4d03b.

## Re-review after merge batch shard 22 (diff 8212d3ff8..01b79a79b)
Diff only: one file, `studio/tests/check_pff1_s3_files.ts` (15+/6-). Runtime row with no screen, so there is no journey test and no journey score (no user journey changed). Everything ran in a separate scratch clone, never the main working tree, with no network, no AWS and no cost.

### What I ran
| Shape | Result |
|---|---|
| Batch shape (`sim` = main with #2980 + this row, origin/main moved back to 8bfb1f76f), full check, run twice, Node 24.22.3 | **74/0** both runs; case 6 measured `0c3f95afd..01b79a79b` |
| Same shape, old range `origin/main...HEAD` | flags `api/src/front-office/MODULE.md` (#2980): the failure is reproduced, and the new range drops it |
| Same shape, full check on **Node 24.21.0** (`npx node@24.21.0`, first on PATH so the tsx child also runs on 24.21.0) | **74/0**; case 5 child line PASS |
| Child by hand, as case 5 starts it, Node 24.21.0 | with `PLATFORM_FILES` empty in production: exits 1 and the stack ends in `chooseFiles`, `configuration: PLATFORM_FILES is not set`, no `STARTED`. With `PLATFORM_FILES=local`: prints `STARTED` and exits 0. Both outcomes are real, so the line can fail |
| Main after a `--no-ff` merge of 01b79a79b | git's history simplification follows the TREESAME parent and picks 01b79a79b, not the merge. Range is empty: PASS |
| Main after a squash merge | anchor = squash commit, range is empty: PASS |
| Main after merge, origin/main still the pre-merge commit | range = this row's commits: PASS (correct) |
| Main after merge plus a later PR that edits FO-5 (and not this check) | anchor stays 01b79a79b, range stays empty: PASS (no false fail for others) |
| Shallow clones: depth 1 without origin/main, depth 1 with origin/main at depth 1, depth 2 and 3 on the batch shape | **NOT TESTED** each time (no merge-base). Never a pass |
| Shallow depth 12 and 50 (fork point reachable) | the true merge-base 0c3f95afd: PASS |
| Main, depth 1, HEAD = origin/main | anchor = HEAD (the grafted root seems to add every file), range empty: PASS. That is the same vacuous pass as full main, not a false one |

I did not re-run the local merge with current main separately. The batch shape already contains #2980 and #2912 on top of 8bfb1f76f.

### The questions asked
* **Is the anchor right on main?** Yes. See the table: after a merge it gives an empty range, through merge commits and after a squash.
* **In a batch: only this row's commits?** Yes, as long as nothing else in the batch edits this check file. The anchor is this row's commit, and its merge-base with any origin/main (old or current) is the row's own fork point. The branch is linear from 0c3f95afd with no main merged in. If a future row merged main into its branch and CI's origin/main were older than that merge, the range would again pull in main's files. That would be a false fail, never a false pass.
* **Shallow clone:** NOT TESTED whenever the fork point is missing, as required.
* **A later row edits this check:** the anchor moves to that row's newest commit that touches the check, and case 6 measures that row's range under the words "this row". I reproduced this: a later commit that changes FO-5 together with the check gives FAIL naming `front-office/files.ts`. That fails safe, and the later row knowingly edits this file. But the line's text no longer names PF-F1, so a reader may think PF-F1 broke FO-5. See m2.
* **Case 5:** still proved by a real process that stops. See the table. It is started the way `run-suites.sh` starts a suite (`node_modules/.bin/tsx --tsconfig api/tsconfig.json <file>`). The CI root cause (tsx's CJS loader on `-e` under 24.21.0) was not reproduced here either, so only the next CI run proves the new start passes there. Info only.

### Findings
* **r4-m1 (Minor, can pass falsely) A row commit after the last edit of this check is outside the range.** The range ends at the anchor, not at the row's head. I reproduced it: on 01b79a79b, one more commit that changes `api/src/front-office/files.ts` and leaves the check alone gives `case 6 pass: this row changed no file of FO-5…` PASS, on the branch and in a batch. The same happens when a later row edits the check first and changes FO-5 in a later commit. **Why it is not Major for this commit:** at 01b79a79b the anchor *is* the row's head, so the measured range is the whole row (`0c3f95afd..01b79a79b`, verified). The approval is bound to this commit, so any later code commit gets a diff re-review where an FO-5 change is visible. FO-5's own suites and the port contract still run. **Fix (a small follow-up or the next touch of this file):** anchor on the newest commit touching any of this row's own paths, for example `git log -1 -- tests/check_pff1_s3_files.ts api/src/platform/files ../../product/screens/PF-F1`. Every round of this row ends with a records commit there, so the anchor reaches the row's head. Also print the measured range in the line.
* **r4-m2 (Minor, wording) After a later row edits this check, case 6 says "this row" but measures that row.** **Fix:** print the anchor's short hash and subject (or the range) in the PASS/FAIL line, so a failure points at the right row.
* **Info:** on main the line passes over an empty range. That was already true of `origin/main...HEAD` and is the design asked for. The 600-character stderr head replaces the 300-character tail. That helps here, because the CI failure's tail showed only loader frames.

Nothing in the diff adds a package, setting, immigration value or scope. Round 3's Minors (r3-m1, r3-m2) are not touched by this diff and stay as recorded.

**Verdict: Approve** (no open Blocker or Major; r4-m1 and r4-m2 are Minor) for commit 01b79a79b20e60b53986849cfd6af582ac630c91.
