# PF-F1 break report (S3 FilesPort adapter, links, chooser; R1.65)

Breaker, 22 Nov 2026. Commit `853f37a32` (branch `claude/loving-fermi-c75sij`). No screen and no route, so all tests ran at code level: tsx scripts against `S3Files`, `S3FileLinks`, `chooseFiles` and the recorded fake (`tests/fixtures/pff1-s3/fake-s3.ts`). The app was not started. No network, no AWS call. The row's check gives **58 passed, 0 failed**. Paths below are under `prototype/studio/`. My scripts are in the breaker's scratchpad (`breaker/attack1.mts`, `attack2.mts`, `attack3.mts`); run each from `studio` with `./node_modules/.bin/tsx --tsconfig api/tsconfig.json <script>`.

**Totals: 0 Blocker · 0 Major · 9 Minor.**

## Minor

**m1. The signed address serves a hostile upload inline, with the type it was stored under.** `api/src/platform/files/s3-files.ts:160`
Steps: `put(A, "s/one.html", "<script>alert(1)</script>", "text/html")`, then sign and open a link and fetch the address. Actual: the address has no `response-content-disposition` or type override, and the fake answers 200 with `text/html`. Expected: the same rule as the local download route (`api/src/platform/support/routes.ts:56` sends `attachment`, `nosniff`, `no-store`). HTML or SVG would render on the bucket's host. That host holds no app session, so this is not a firm-wall break. A route cannot add these headers later, because the browser fetches from S3 directly. Fix it before a route binds `S3FileLinks`.

**m2. A link serves an object that `get` refuses.** `s3-files.ts:200` (open checks only `exists`, a HEAD) against `:123` (get checks the sha256)
Steps: `rawPut` an object under firm A whose `x-amz-meta-sha256` does not match its bytes (another bucket writer), then sign and open a link to it. Actual: `get` throws `S3FilesError … (Error)` ("never served"), but the link gives 200 and serves `<html>planted</html>`. Only someone who can write to the bucket outside the adapter can trigger this.

**m3. A real retry is refused when the content type ends in whitespace. The fake hides this.** `s3-files.ts:105` (`had.ContentType !== f.contentType`)
The port's regex accepts `"text/plain; "`. A real HTTP hop strips trailing OWS from header values. I modelled that with a handler that trims `content-type` on PUT. Actual: the second identical put gives `FileKeyTaken` ("same bytes and type are a retry" is broken). The fake stores the value untrimmed (`"text/plain; "`), so the contract passes. Also, `"text/plain; name=中"` passes the port and the fake, but Node's HTTP layer refuses it (`ERR_INVALID_CHAR`), so on a real bucket every such put fails with `S3FilesError`.

**m4. A delete whose tombstone landed but whose answer was lost reports `deleted: false`.** `s3-files.ts:138-139`
Steps: in the fake's `before` hook, store the tombstone, then answer that PUT with 500. Actual: the SDK retries with the same `If-Match`, gets 412 and returns "taken", so delete answers `{"deleted":false}` while the file now reads as absent and its tombstone is in place. The port says `false` means "nothing changed". (A put in the same situation is handled correctly: the re-sent 412 is followed by a HEAD that finds the same sha256 and accepts the retry.)

**m5. Two concurrent deletes of a 0-byte file both answer `deleted: true` on the fake.** `s3-files.ts:135-139`; `fake-s3.ts:91` (ETag = MD5)
Steps: `put(A, "race/empty", new Uint8Array())`, then `Promise.all([delete, delete])`. Actual: `[{"deleted":true},{"deleted":true}]`. The tombstone's ETag (MD5 of nothing) equals the file's, so the second `If-Match` still holds. For a non-empty file the answer is correctly `[true,false]`. Real SSE-KMS ETags are not MD5, so S3 may not show this (unverified). Either way, the delete's safety rests on ETags differing.

**m6. A wrong or deleted bucket reads as "no such file".** `s3-files.ts:94`, `:121`
Steps: answer every call with S3's 404 `NoSuchBucket`. Actual: `get` gives `null`, `exists` gives `false` and `delete` gives `{"deleted":false}`, all with no error. Only `put` fails, with `(Error)`. A misconfigured bucket silently looks like missing documents, and nothing at start-up checks that the bucket exists.

**m7. The settings checks are looser than "a malformed one is refused".** `api/src/platform/files/choose.ts:34-38` (and `s3-files.ts:61-64`)
All of these start: bucket `a..b`, `192.168.1.1` or `xn--bucket` (S3 forbids each). KMS key `::::`, or a pasted 40-character secret (the KMS regex accepts it). KMS ARN in `us-east-1` while the region is `ca-central-1`. Region `us-east-1`: the row makes the region configuration, but P-559 says data stays in Canada and nothing refuses a non-Canadian region. A dotted bucket (`pff1.recorded.bucket`) also starts: the SDK then switches to path-style and the fake refuses every call.

**m8. Production is detected by exact, case-sensitive text.** `choose.ts:24`
Actual: `NODE_ENV=Production`, `" production"` or `prod`, and `PLATFORM_ENVIRONMENT=PRODUCTION`, with `PLATFORM_FILES` unset, all give `LocalFiles`. This is mitigated because `api/src/platform/config/settings.ts:117` refuses any `PLATFORM_ENVIRONMENT` other than the exact three values, provided that loader runs first. Nothing binds `chooseFiles` yet, so that order is not enforced. (`PLATFORM_ENVIRONMENT=test` also gives the local disk. The row names only production, so that is not a finding.)

**m9. The link's expiry check is not NaN-safe.** `s3-files.ts:198-199`
Steps: an injected clock returns `NaN`. Actual: `left < 1 || left > 300` is false for `NaN`, so the check passes. Only `signedGetUrl`'s integer check (`:159`) stops it, by throwing. The link still does not open.

## Where the fake differs from a real bucket (could make a test pass falsely)
- It keeps header values byte for byte: no OWS trimming and no character rules (m3).
- ETag is MD5 even for SSE-KMS objects (m5).
- It does not check signatures. Case 4 checks the address's parameters, not that S3 would accept it.
- It does not verify the CRC32 checksum the SDK sends on every PUT (`x-amz-checksum-crc32`). Its sha256-checksum branch never runs.
- It always answers 404 for a missing key. Real S3 answers 403 when the role lacks `s3:ListBucket`, and the adapter would then throw on `get`/`exists`/`delete`/link of an absent key instead of answering null/false/404. PF-F1c's IAM policy must grant ListBucket (`usedBytes` needs it anyway).
- A presigned address made with the task role's temporary credentials stops working when the session token expires, which can be inside the 5 minutes. The fake does not model this.
- It has no deadline. A body that never ends leaves `get` pending (still pending after 3 s). The real handler only sets a 20 s idle timeout, and `get` buffers the whole object.

## Held
- **Firm wall:** each of these gives null, false, 0 or a refusal before any request: firm B get/exists/delete/usedBytes on A's key; key `<A>/docs/a.pdf` used as firm B; `../`; `%2f`; `./`; trailing `/`; `\`; NUL; a 301-character key; firm id with a space or a trailing `/`; a Cyrillic `а` in the firm id. An upper-case firm id maps to the same lower-case prefix. Firm ids have a fixed length of 36, so no prefix overlap is possible. The longest object key is 337 characters. Error messages never echo the value.
- **Write-once:** three concurrent puts (`one`, `two`, `one`) give ok, FileKeyTaken, ok, and `one` stays stored. Delete against two puts gives deleted true, then both puts are refused. Delete against delete (non-empty) gives `[true,false]`. A same-bytes put after a tombstone gives FileKeyTaken. An object the adapter did not write: put is refused, get throws. An object with forged metadata: get throws "integrity". One SDK-retried 500 is accepted as a retry, and so is a 500 after the put was stored. Three 409s are retried; four throw `(ConditionalRequestConflict 409)`.
- **Encryption:** every PUT (file, retry, tombstone, refused put, 0-byte put) carried `aws:kms` and the configured key. `send` is the only PutObject path.
- **Links:** another firm's link is refused; padded, standard-base64, upper-case-MAC, whitespace and double-dot tokens all give 404; a token MAC'd with the local `fo-file-link:` prefix under the same key gives 404. Clock 1 s backwards gives 404. At +299.000 s the link opens with `X-Amz-Expires=1`; at +299.001 s it gives 404. A deleted file gives 404, and an address made before the delete serves the empty tombstone (0 bytes). No token, address or error contains the link key or the AWS secret. A person id differing only by case opens the link: this is lower-cased by design, the same as FO-5's `FileLinks`, and person ids are uuids.
- **Errors:** a hostile S3 `<Message>` holding the secret reaches the caller only as `files: S3 get failed (InvalidArgument 400)`. A truncated body gives "integrity". A list page that is truncated with no continuation token throws.
- **Chooser:** `PLATFORM_FILES` unset with `NODE_ENV=production` refuses, and so does `PLATFORM_ENVIRONMENT=" production\n"`. `Local`, a Cyrillic `lоcal` and `S3` are refused. `" s3 "` without settings refuses, naming the missing setting. Refusals never print the value (`SECRETVALUE` was absent from both messages I tried).

**Verdict: Approve** (commit `853f37a32`; no open Blocker or Major. Fix m1 and m2 before a route binds `S3FileLinks`).
