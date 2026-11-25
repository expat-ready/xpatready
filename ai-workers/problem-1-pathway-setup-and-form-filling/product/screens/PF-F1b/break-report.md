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

## Round 2 (diff 4f6e08001..4ae0c919e)

Diff only, code level. The working tree had the builder's uncommitted edits to settings.ts and choose.ts, so every run
used a `git archive` copy of head `4ae0c919ec7efa73206482b313f57a9ab070b552`, with node_modules linked. No app server;
port 54329 not touched. Scripts are in the scratchpad `breaker-f1b/`: `r2_drive.ts` + `r2_child.ts` (all 71 feature
files merged by `registerFeatures`), `r2_keys.ts`, `r2_pf24.ts`, `r2_seam.ts`. Row check on head: 30/0.

### M1 (Major): the variety rule breaks PF-24's suite about 3 runs in 4 and refuses strong hex keys
- **Did:** ran `tests/check_pf24_secrets.ts`'s own `generated()` (lines 26-45) 1000 times against the head's loader
  (`r2_pf24.ts`). It makes `PLATFORM_FILES_LINK_KEY: rand(40)`, which is 40 hex characters (line 44).
- **Expected:** the assertion "PLATFORM_ENVIRONMENT=test with every setting loads" (line 55) passes, as it did before
  this diff.
- **Actual:** 751 of 1000 sets were refused with "PLATFORM_FILES_LINK_KEY is set but not valid: … 16 or more different
  ones". Hex has only 16 symbols, so `new Set(v).size >= 16` (settings.ts:57) needs every hex digit to appear. The suite
  is in CI (`suite-times.tsv:336`), so the merge-queue batch goes red about 75% of the time, or main becomes flaky.
- **The same root cause refuses real keys** (`r2_keys.ts`, 2000 draws each): `openssl rand -hex 32` 25.4%,
  `-hex 24` 55.8%, `-hex 16` 93.0%, two UUIDs 2.0%. `openssl rand -base64 32` 0%.

### m1 (Minor): round 1's m4 is only partly closed; patterned keys still pass
- Accepted: `"abcdefghijklmnop"×2`, `"0123456789abcdef"×2`, `"abcdefghijklmnop"+"a"×16`,
  `"Expat-Ready-Files-Link-Key-2026!!"`, `"correct horse battery staple 2026!"`, 16 emoji ×2, and `"a"` followed by
  31 combining marks. A count of different characters measures neither randomness nor length in bytes.

### m2 (Minor): on the seam, the store and the links are different S3Files instances
- In `r2_child.ts`, local with the seam: `links.files === store.store` is false, and so is `=== boundFiles()`.
  choose.ts:77 rebuilds on every call while `recorded` is set. Both use the same handler, so links still work (own
  firm 200, other firm 404). In production `links.files === store.store === boundFiles()` is true. Because of this,
  the row check (case 2 and case 4) cannot pin that the links are bound to the store's own instance.

### Held in round 2
- **B1 fixed (merged app, all 71 features, `r2_drive.ts`):**
  - Local adapter, no key: EntitledFiles over LocalFiles, links null. The same happens in production with
    `PLATFORM_FILES=local`.
  - s3 without a key is refused at start: local with the seam, test, and production. An empty key and a key of 40
    spaces are refused the same way.
  - s3 with a key: EntitledFiles over S3Files, S3FileLinks bound. Own firm 200, other firm 404.
  - One merged S3FileLinks provider; PlatformClock is a default-scope singleton, so the links factory runs eagerly.
  - Round 1's `b1_merged.ts` now gives the named refusal.
- **Seam only on local (`r2_seam.ts`):**
  - Refused: `PLATFORM_ENVIRONMENT=test` or `production` (at feature import, by platform-messages); local with
    `NODE_ENV=production` or `' Prod '`; and, given directly to `boundFiles`, `Local`, `' local '`, unset or empty.
  - A seam planted after a clean production bind is refused on the next call, and the cache is kept.
  - No code in `api/src` passes its own env to `boundFiles` or changes `PLATFORM_FILES*` at run time.
- **Key hidden:**
  - No sign of the key, as text, hex or base64, in `inspect(showHidden)`, `JSON.stringify`, `String`,
    `Object.entries` or `structuredClone` of the links, nor in tokens, signed URLs or the sign error.
  - Refusals and their inspect/JSON never contain the value. 15 different characters (×3) are refused.
- **No regression** in round 1's fail-closed, cache and link checks; the diff does not touch them.

**Verdict: Block** (head `4ae0c919ec7efa73206482b313f57a9ab070b552`). M1: settings.ts:57 makes
`tests/check_pf24_secrets.ts` fail about 75% of runs and refuses strong hex keys.

## Round 3 (diff 4ae0c919e..b66e603f4)

Diff only, code level, on the clean working tree at head `b66e603f484637e752cad6c966497cc81582515a`. No app server;
port 54329 not touched (an unreachable `DATABASE_URL` in every child). New scripts in the scratchpad `breaker-f1b/`:
`r3_env.ts` + `r3_env_child.ts` (one fresh process per configuration; `full` registers all 71 features as main.ts
does), `r3_cache.ts`, `r3_dump.ts`; round 2's scripts re-run as `r3_pf24.ts` (with the test's new `key32()`),
`r3_keys.ts`, `r3_seam.ts`, `r3_drive.ts` + `r3_child.ts`. Row check on head: 33/0, twice.

### m1 (Minor): the "stricter" dump test drops round 2's hex check, so a hex copy of the key passes
- **Did:** ran the new predicate (check_pff1b_bind.ts:185-187) against planted leaks of other shapes (`r3_dump.ts`).
- **Expected:** at least what the old check (r2 line 174, `!dump.includes(hex(key).slice(0, 32))`) caught.
- **Actual:** it catches a Buffer, a plain string, a Uint8Array and a number[]. A field holding
  `Buffer.from(key).toString("hex")` is NOT caught; the old check caught it. Product code is not affected:
  `S3FileLinks` holds the `Secret` only and derives the MAC per call (s3-files.ts:208, 237).

### m2 (Minor): with NODE_ENV=production and no PLATFORM_ENVIRONMENT, the server's first refusal names the wrong setting
- **Did:** `r3_env.ts full`: `registerFeatures` over the real feature folder with `PLATFORM_ENVIRONMENT` unset, `""`,
  `"   "` or `"\t\n"`, `NODE_ENV=production` and `PLATFORM_FILES` unset.
- **Expected:** the refusal names `PLATFORM_ENVIRONMENT`. That was round 2's behaviour: `appEnv` threw ConfigRefused.
- **Actual:** `configuration: PLATFORM_FILES is not set (local or s3) …`. The loader does not run before the binding:
  `front-office-booking.ts:11` (file 32 in sort order) imports `platform-messages.ts`. Its import-time `boundFiles()`
  (:26) runs before `platform-config.ts` loads the configuration. The comment at choose.ts:68-70 assumes the reverse
  order. The server still fails closed, but an operator fixes `PLATFORM_FILES`, restarts, and only then sees the real cause.

### Held in round 3
- **Unset-environment tolerance (`r3_env.ts`: 8 PLATFORM_ENVIRONMENT values × PLATFORM_FILES unset/local/s3/` S3 ` ×
  NODE_ENV unset/production/` Prod `/development, 128 fresh processes):**
  - Only the loader's `"unset"` is tolerated: unset, empty, spaces, tab or newline. `staging`, `Local` and `PRODUCTION`
    are refused (ConfigRefused "not recognised") with every PLATFORM_FILES and NODE_ENV value. `e.environment` is
    `"unset"` only at settings.ts:117. No other ConfigRefused can carry it, so no other refusal is swallowed.
  - With the environment unset, the binding uses local disk only where round 1's rules allow it: `PLATFORM_FILES=local`
    (explicit), or `PLATFORM_FILES` unset with a NODE_ENV that is not production. NODE_ENV `production` or ` Prod `
    with PLATFORM_FILES unset is refused. `s3` builds S3Files, but `boundLinks` re-reads the loader without the catch
    and refuses (ConfigRefused, PLATFORM_ENVIRONMENT). The seam is refused when the environment is unset or empty.
  - **The whole server never starts** with the environment unset or blank, in all 20 `full` runs. platform-messages.ts:27
    calls `platformConfig()` uncaught right after its `boundFiles()`, and `platform-config.ts` would refuse later in
    the same `registerFeatures`, before Nest starts or the port opens. The momentary LocalFiles does no disk I/O
    (files.ts:29). Only `main.ts` registers features (deploy/container-entry.mjs imports it).
- **Key rule (`r3_pf24.ts`, `r3_keys.ts`):** PF-24's generator with `key32()` gives 0 of 5000 refused, so the suite is
  stable. Base64 32 bytes, hex 32 or 24 bytes, two UUIDs and base64url 24 bytes give 0 of 2000 refused. Hex 16 bytes
  gives 16 of 200000 (0.008%), and the refusal is loud at start. Patterned keys pass as the lead accepted (r2 m1).
  Values never appear in refusals.
- **Cache (`r3_cache.ts`):**
  - The same seam twice gives the same instance. A swapped seam gives a new instance on the new handler. With the seam
    removed, a new instance is built with no seam handler, so no stale client is kept.
  - A change of bucket gives a new instance. A local call does not clear the S3 slot. A late seam in production is
    refused and the cached instance is kept.
  - Test-only, not findings: a seam object whose handler is replaced in place keeps the old handler, and a seam planted
    between the store's and the links' factory splits them. Off `local`, the seam is refused.
- **Store and links are one object (`r3_drive.ts`, 71 features):** `links.files === store.store === boundFiles()` is
  true on local with the seam, on NODE_ENV=test with the seam, and in production (round 2's m2 is closed).
- **Rounds 1 and 2:** own firm 200, other firm 404. s3 without a key, with an empty key or with 40 spaces is refused
  (local, test, production). The seam is refused under test and production, and under local with NODE_ENV production
  or ` Prod `. `PLATFORM_FILES=local` in production starts with null links. The key is not in a dump, token, URL or
  error. `r3_seam.ts` gives the same results as round 2.

**Verdict: Approve** (head `b66e603f484637e752cad6c966497cc81582515a`). No Blocker or Major; m1 and m2 are Minor.
