# PF-F1b break report (commit 4f6e08001)

Breaker run, 22 Nov 2026. Code level only: Nest contexts and child processes built from scripts on the recorded fake S3
client; no browser, no app server, no database (a stub or an unreachable `DATABASE_URL`; port 54329 not touched). Scope:
the row's diff `origin/claude/loving-fermi-c75sij...4f6e08001` and the BACKLOG row (d84797c45). Scripts are in the
breaker's scratchpad (`breaker-f1b/`: `b1_merged.ts`, `drive.ts` + `child.ts`, `b3_inproc.ts`, `drive_prod.ts`). The
row's own check `tests/check_pff1b_bind.ts` passes 26/0 here.

## Findings

### B1 (Blocker): in the app as merged, `S3FileLinks` is null and `PLATFORM_FILES=s3` starts without the link key
- **Did:** called `registerFeatures` on an empty module (all 76 feature files, the way `main.ts` does), took the
  providers for the `LocalFiles` and `S3FileLinks` tokens in their merged order, and built a Nest context from them with
  `PLATFORM_FILES=s3`, bucket and KMS key set, and no `PLATFORM_FILES_LINK_KEY`. Ran it twice: `PLATFORM_ENVIRONMENT=local`
  with the recorded client, and `PLATFORM_ENVIRONMENT=production` with a full generated configuration and no seam.
- **Expected:** the start-up stops, naming `PLATFORM_FILES_LINK_KEY` (settings.ts:59 text, choose.ts:11-12, MODULE.rows/PF-F1b.md),
  and with a key set `S3FileLinks` is bound (the row: "`S3FileLinks` is bound beside it with the server's link key").
- **Actual:** in both runs the context starts: `LocalFiles = EntitledFiles`, `inner = S3Files`, `S3FileLinks = null`.
  With a valid key set, `S3FileLinks` is still `null`.
- **Cause:** merged order is `filesProviders[0]` (index 39), `filesProviders[1]` (40), then the retainers' own `LocalFiles`
  factory (43, `front-office-retainers.ts:16`), which wins the token. `filesProviders[1]` injects `LocalFiles`
  (choose.ts:91), so it gets the `EntitledFiles` wrapper. `boundLinks` returns null for anything that is not
  `instanceof S3Files` (choose.ts:83), so the key is never checked. `boundLinks(new EntitledFiles(…, s3Files))` gives null directly too.
- **Why the check misses it:** case 3 (check_pff1b_bind.ts:126-140) and case 4 (:155-158) build their modules from
  `[...filesProviders, PlatformClock]` only, with no retainers override. Case 2 uses the merged shape but never
  reads `S3FileLinks`.
- **Repro:** `b1_merged.ts` (local) or `drive_prod.ts` → `b1_prod.ts` (production): prints
  `STARTED with PLATFORM_FILES=s3 and NO PLATFORM_FILES_LINK_KEY … S3FileLinks = null`.

### m1 (Minor): the files settings are read from `process.env` on every call, not once (PF-24w card rule)
- **Did:** called `boundFiles()` in one process, then changed `process.env.PLATFORM_FILES` / `NODE_ENV` and called it again.
- **Expected:** MODULE.md: "Every setting … is read by the one loader `config/settings.ts` once per process".
- **Actual:** `S3Files`, then `LocalFiles` after `PLATFORM_FILES=local`, then a refusal after `NODE_ENV=production`.
  `appEnv` (choose.ts:67) re-reads `PLATFORM_FILES`, `_BUCKET`, `_KMS_KEY_ID`, `_REGION`, `FO_FILES_DIR` and `NODE_ENV`
  on each call: the messages import, each feature factory, and later calls. Only `PLATFORM_ENVIRONMENT` comes from the loader.
  Today nothing changes `process.env` after start, so this has no effect at run time. One consequence: `PLATFORM_FILES` is
  not a loader setting, so `PLATFORM_ENVIRONMENT=test` (where the loader requires every setting) starts on the container's
  local disk when it is unset. The row and PF-F1 require refusal in production only, so this is allowed. Flagged for the lead.

### m2 (Minor): the recorded-S3 seam is accepted in the AWS test environment
- **Did:** with `PLATFORM_ENVIRONMENT=test` (full config) and `PLATFORM_FILES=s3`, put a handler on
  `globalThis[Symbol.for("expatready.pff1b.recordedS3")]` and called `boundFiles()`.
- **Expected:** a test seam never reaches a deployed server.
- **Actual:** accepted (`recordedAccepted: true`). choose.ts:74 refuses it in production only. `Symbol.for` is a key in the
  process-wide symbol registry, so any in-process code can set it. Production refuses it (see Held).

### m3 (Minor): the bound `S3FileLinks` keeps the revealed key as a plain Buffer
- **Did:** `util.inspect(app.get(S3FileLinks))` with a 40-character key.
- **Actual:** the output holds the key's bytes in hex (`macKey: <Buffer …>`, s3-files.ts:207-209). PF-23 redacts by value
  and does not match hex. No current code logs the provider. The class is PF-F1's, but this row binds it app-wide.

### m4 (Minor): a link key is checked for length only
- `PLATFORM_FILES_LINK_KEY="a"×32` is accepted (settings.ts:59 `z.string().min(32)`). Secret-box keys get a randomness check.

## What held
- **Fail closed:**
  - With `PLATFORM_FILES` unset, these all refuse: `NODE_ENV` = `production`, `Production`, ` PRODUCTION `, `prod`, `PROD`,
    `production\n`; and `PLATFORM_ENVIRONMENT=production` or ` production ` with `NODE_ENV` unset.
  - The loader refuses `PLATFORM_ENVIRONMENT=Production` and `=prod` outright.
  - With `PLATFORM_ENVIRONMENT` unset, start-up is refused, even with `PLATFORM_FILES=local`.
  - `PLATFORM_FILES` = `S3`, `LOCAL`, `file` or `none` is refused; ` s3 ` is trimmed and accepted.
  - `NODE_ENV=prd` or `live` gives local; that list (`isProduction`) is PF-F1's, not this row's.
- **Import-time bind:** `platform-messages`' `boundFiles()` loads the configuration itself. With production and
  `PLATFORM_FILES` unset, the import throws and `registerFeatures` stops the start-up.
- **One binding:**
  - `new LocalFiles(` appears nowhere in `api/src` outside choose.ts and storage.ts.
  - The shared providers are deduplicated by identity, so the retainers' `EntitledFiles` wins `LocalFiles` for every route.
  - One `S3Files` instance is shared by every feature and the import-time bind.
  - The routes call only FilesPort methods.
- **EntitledFiles over S3:**
  - A new key reaches the limit check. A hard, over-limit firm is refused and nothing is stored.
  - A retry of a stored key goes through. A retired key gives FileKeyTaken.
  - Other bytes under a stored key give FileKeyTaken and nothing is written.
  - The same key is new for firm B.
  - HEAD answers: 403 is refused (fail closed); 500 is retried by the SDK, then the limit check runs; NoSuchBucket 404
    counts as a new key, so the limit check runs (it is not skipped).
  - A key raced in after the HEAD gives FileKeyTaken. A failed list is retried, then the limit refuses.
- **Seam and cache:**
  - The seam is refused under `PLATFORM_ENVIRONMENT=production` and under `NODE_ENV='Prod '`.
  - Once the seam is removed, the next call builds a client without it.
  - The cache rebuilds when the bucket, region or KMS key changes, or when the seam flag flips.
- **Link key and secrets:**
  - Unset with s3 (shared providers alone) gives the named refusal. A short key, or 31 characters padded with spaces,
    gives `ConfigRefused` naming the setting only.
  - The key is scrubbed from `process.env`. No generated value appeared in any refusal's stdout or stderr. The signed
    URL does not contain the key.
- **Links** (built correctly, on the injected clock):
  - Another person, another firm or a tampered token gives 404.
  - The firm id in upper case gives 200 (it is the same firm).
  - At 299 s the link gives 200; at 300 s, 404.

**Verdict: Block** (commit 4f6e08001). B1: in the merged app the S3 links are never bound, and `PLATFORM_FILES=s3` starts
without `PLATFORM_FILES_LINK_KEY`.
