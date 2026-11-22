# Review: PF-F1b (R1.65, the server uses the file store PLATFORM_FILES names)

Reviewer: Opus 5.5, fresh context, did not build it. Commit `4f6e08001c7fd6d852a0617113ca80f5d7fbf91e`, branch `claude/runtime-pff1b`, draft PR #3041. Only PF-F1b's own diff: `git diff origin/claude/loving-fermi-c75sij...4f6e08001` (14 files, +264/-17). S = `prototype/studio`.

**Verdict: Block.** Two Majors with small fixes. In the real app, on S3, the S3 links are not bound and the server starts without the link key. The tests miss this because they build a provider order the app does not have.

## Journey test
**Does not apply. Score: N/A (not out of 10).** This is a runtime row with no new screen or route, so there was no browser journey and I started no server. I did a code-and-tests review instead. BIC-01 to BIC-20: N/A (no case-side screen). I did not run the graph tool, because it writes `qa/GRAPH.md` and I may write only this file.

## Checks I ran (Node 24.22.3, no network, no AWS, no database)
- `tests/check_pff1b_bind.ts`: 26 passed, 0 failed, exit 0.
- `tests/check_pff1_s3_files.ts`: 74 passed, 0 failed.
- `tools/check-port-contracts.mjs`: exit 0, FilesPort x5.
- Database suites: not run, as instructed. The builder posts them.
- A probe in the scratchpad (outside the repo). It builds `[...filesProviders, <retainers' LocalFiles provider>, PlatformClock, Db]`, which is the order `registerFeatures` gives, and runs with `PLATFORM_FILES=s3`. Output: `STARTED store= EntitledFiles inner= S3Files links= null`, both with a link key and with `NODE_ENV=production` and no link key (exit 0).

## Findings
**M1 (Major): `S3FileLinks` is null in the app on S3, and "s3 with no link key stops the start-up" is not wired.**
- `registerFeatures` sorts the feature files (S/api/src/features.ts:18) and adds each provider object once (:25-26).
- `front-office-identity-check.ts` sorts first, so it adds `filesProviders[0]` and `[1]`. After that, the retainers' own `{ provide: LocalFiles, useFactory: … new EntitledFiles(…, boundFiles()) }` (front-office-retainers.ts:16) wins the `LocalFiles` token, as on main.
- The links provider injects that token (choose.ts:91), so it receives `EntitledFiles`. Then `boundLinks` returns null because `!(files instanceof S3Files)` (choose.ts:82-83).
- Result: the row's "S3FileLinks is bound beside it with the server's link key" does not hold in the app. The production refusal that the PR body, settings.ts:59 and MODULE.rows/PF-F1b.md describe never runs.
- Impact today is limited, because no route injects `S3FileLinks` yet. But the fail-closed claim the Lead reads before the label is false.
- Fix: in `filesProviders[1]`, sign over the bound store itself, `useFactory: (clock) => boundLinks(boundFiles(), () => clock.now()), inject: [PlatformClock]`. `boundFiles()` returns the one per-process `S3Files`, which is the same object inside the retainers' `EntitledFiles`. Another option is for `boundLinks` to unwrap a `.store`.

**M2 (Major): the tests for case 3 (no key) and case 4 do not build the app's provider order, so they cannot catch M1.**
- In `check_pff1b_bind.ts:131` and `:137`, the child process builds `[...filesProviders, PlatformClock]` with no retainers provider.
- Case 4 closes the app-order context (:153-154) and builds a separate `Linked` module without the retainers provider (:155-158).
- In case 1, `links === null` (:88) would also pass under `s3`, and case 2 never checks the links.
- Fix: build cases 2 to 4 the way `registerFeatures` merges the providers (the `context(retainersProvider)` of cases 1-2, or `registerFeatures` over the six feature files). Assert `S3FileLinks` is an instance under `s3` with the key, and assert the start-up refuses without it. Show the new lines fail on 4f6e08001.

**m1 (Minor): `tests/check_pff1_s3_files.ts` changed outside the touch list.**
- The change is +3/-1: #2955's review item r4-m2, which prints the compared range.
- It is outside the widened list, and the brief lists this suite as "pass unchanged". It belongs on #2955 or needs the Lead's OK in the PR.

**m2 (Minor): `settings.ts:59` sits between the PF-8b F2b comment (:57-58) and the entry that comment describes (:60).**
- Move it above the comment.
- The 3 additive lines are justified: secrets are scrubbed from `process.env` (settings.ts:185, :196), so the key can only arrive through `PlatformConfig`.
- I agree with the one generator line in `check_pf24_secrets.ts:44` (the Lead's answer is pending).

**m3 (Minor, record for the Lead; inherited from PF-F1): the other files settings are read outside the PF-24 loader.**
- `PLATFORM_FILES`, `_BUCKET`, `_KMS_KEY_ID` and `_REGION` are read from `process.env` on every `boundFiles()` call (choose.ts:66-67). They are not in `SETTINGS`, but MODULE.md:27 says every setting is read by the one loader once per process.
- Because of that, the CDK task check (deploy/cdk/lib/service-checks.ts reads `SETTINGS`) cannot see that the production task sets no `PLATFORM_FILES` (deploy/cdk/lib/service.ts:147-153).
- A production stack built from this commit stops at start-up, as intended (fail closed). A deploy row has to set `PLATFORM_FILES`, the bucket, the KMS key and `PLATFORM_FILES_LINK_KEY`. No change asked here, because settings.ts must change as little as possible.

**m4 (Minor): the PR body is out of date.** It says "13 files, +258/-17". The diff at 4f6e08001 is 14 files, +264/-17 (`check_pf24_secrets.ts` came later). The brief said 15.

## What holds (file:line)
- **One place.** All six features take the store from choose.ts:
  - identity-check :12, branding :14 and support :18-20 use the shared objects;
  - retainers :16 and entitlements :29/:34 call `boundFiles()`, and so does messages :26 (StorageWatch and PlanBookings are PF-15's usage).
  - PF-Fd delete and PF-Fp go through the retainers' injected token.
  - There is no `new LocalFiles(` or `LocalFiles` class provider left in `api/src/features`.
- **Callers keep working on the wrapper.** Callers use only `put`, `get` and `exists` on the injected store (retainers, identity and support routes and services; branding images). `.root` is used only in a test, on `new LocalFiles()` (check_fo5_retainers.ts:580). So `EntitledFiles implements FilesPort`, instead of extending `LocalFiles`, breaks no caller.
- **Provider order is the same as on main.** The first file that names `LocalFiles` is still identity-check, and the retainers' factory comes after it and wins. Branding and support add nothing new. main.ts:232 lists no files provider.
- **PF-15 holds on both stores** (storage.ts:121-141):
  - a retry skips the limit check;
  - a retired key gives `FileKeyTaken`, through `LocalFiles.known` or `S3Files.known`, a HEAD that sees the tombstone (s3-files.ts:153);
  - a new key reaches the limit check.
- **Production fail-closed for an unset `PLATFORM_FILES` is wired.** `boundFiles()` runs at import in platform-messages.ts:26 and in the retainers and entitlements factories, and `filesAdapterOf` refuses (choose.ts:34).
- **PF-24 read-once is kept for this row's own reads:**
  - the link key comes from `platformConfig().files.linkKey` (settings.ts:175, choose.ts:83);
  - the environment comes from `platformConfig()` (choose.ts:67).
- **Link-key rule:** optional; `z.string().min(32)` matches `S3FileLinks`' 32-byte check (s3-files.ts:209-210); scrubbed as a secret.
- **Security:** the `RECORDED_S3` seam is refused when NODE_ENV or PLATFORM_ENVIRONMENT is production (choose.ts:74). Only in-process code can set it, no request can. No secret value appears in any message. Nothing invented.

## Does each test fail when its fix is removed?
I mutated a scratch copy outside the repo, never the working tree. Each mutation made the bind test fail:

no "known" check (run fails, DbReached); `known` ignores `store.known` (2 failures); no limit check (2); recorded seam allowed in production (1); no link-key refusal in `boundLinks` (1); `boundFiles` always local (7, then a crash); retainers drop `boundFiles()` (3); messages back to `new LocalFiles()` (2); identity-check back to `[LocalFiles, …]` (2); `S3Files.known` given `exists` semantics (1); `linkKey: null` in settings.ts (run fails); no production refusal in `filesAdapterOf` (1).

The one gap is M2: injecting the winning `LocalFiles` into the links provider (M1) is not caught.

## Touch list
- Inside the widened list: the six features (provider lines and their imports only), choose.ts, storage.ts, s3-files.ts and settings.ts.
- From the brief: the test and MODULE.rows.
- `check_pf24_secrets.ts`: asked on the PR.
- `check_pff1_s3_files.ts`: outside the list (m1).

## D1-D20
- D1: Partly (M1).
- D2: Met (PF-15 on both stores).
- D5: Met (fail closed when unset).
- D16: Partly (M2).
- D3, D4, D6 to D15, D17 to D20: N/A (no screen; D17 and D20 not walked).

## Could not check
- The database suites (FO-5, PF-Fd, PF-15, PF-24, PF-24w) and full `ci`: the builder is running them.
- Real AWS: none used. The breaker run is separate.

To fix before Approve: M1 and M2. The Minors are for the Lead.

**Verdict: Block** at commit 4f6e08001c7fd6d852a0617113ca80f5d7fbf91e.

Reviewer: Block 4f6e08001c7fd6d852a0617113ca80f5d7fbf91e

## Round 2 (diff 4f6e08001..4ae0c919e)

Reviewer: Opus 5.5, same fresh-context reviewer. I read only the diff `git diff 4f6e08001 4ae0c919ec7efa73206482b313f57a9ab070b552 -- . ':(exclude)*/product/screens/*'`: 4 files, +53/-23 (settings.ts, choose.ts, s3-files.ts, check_pff1b_bind.ts). Journey test: N/A, as in round 1 (runtime row, no screen). I used no database, did not run run-suites.sh and started no server.

**Verdict: Block.** M1 and M2 are fixed, and their tests fail without the fix. But the new link-key rule (break m4) refuses the key that this branch's own `check_pf24_secrets.ts` generates in about 3 runs out of 4, so the PF-24 suite turns red. There is also one Minor: the m3 test passes without its fix.

### Checks I ran (Node 24.22.3)
- `tests/check_pff1b_bind.ts` at head: **30 passed, 0 failed.**
- Mutations, each in a scratch copy of studio outside the repo. I checked that the copy's five touched files are byte-identical to `4ae0c919e`. Baseline in the copy: 30/0.

| Fix removed (in the scratch copy) | Result |
|---|---|
| choose.ts at `4f6e08001` (the builder's claim) | 3 FAIL (case 2 links `null`; case 3 no-key `status 0`; break m2), then case 4 crashes `links.sign` on null (non-zero exit). Confirmed. |
| Only `filesProviders[1]` reverted to `inject: [LocalFiles, PlatformClock]` | case 2 links FAIL, case 3 no-key FAIL, case 4 crash. M1 is caught by three tests. |
| m2: `env.PLATFORM_ENVIRONMENT !== "local"` back to `isProduction(env.PLATFORM_ENVIRONMENT)`, with the new message kept | break m2 FAIL (29/1): `seam("test")` returns "used". |
| m3: s3-files.ts at `4f6e08001` | **30/0: the m3 test does not catch it** (see m5 below). |
| m4: `.refine(...)` removed | break m4 FAIL (29/1). |

### Each fix
- **M1 / B1: fixed.** choose.ts:95 is `useFactory: (clock) => boundLinks(boundFiles(), …), inject: [PlatformClock]`. On S3, `boundFiles()` returns the single per-process `s3Bound.files`, which is the same object that sits inside the retainers' `EntitledFiles`. With the recorded seam there is a new `S3Files` per call, but on the same handler, so that is test-only and harmless. On local it returns null, as before.
- **M2: fixed. The real-merge test mirrors main.ts.** `appFiles()` calls the real `registerFeatures` (features.ts:17-29, the function main.ts:238 calls) over a folder of one-line re-exports of the six features. It keeps only the `LocalFiles` / `S3FileLinks` entries of the merged list.
  - Order: `registerFeatures` sorts file names, so a subset keeps the full folder's relative order. Each object is added once, as main.ts does.
  - Completeness: on main, only identity-check, retainers, branding and support name these tokens in `api/src/features/`. main.ts's own `@Module` list names neither. So the filtered list is exactly the app's: `[filesProviders[0], filesProviders[1], retainers' EntitledFiles]`, and the last one wins `LocalFiles`.
  - Case 3's child process does the same merge, so "s3 with no key refuses" now runs through the app's order.
  - Case 4 now uses that same context, with its own clock.
- **Breaker m2: fixed.** choose.ts:75 refuses the seam unless `PLATFORM_ENVIRONMENT` is `local`. The value comes from `platformConfig()` (validated `local|test|production`, read once), so the exact string comparison is safe. Nothing else in the repo uses `RECORDED_S3`, so no other suite loses it.
- **Breaker m3: fixed in the code.** s3-files.ts:208 holds `linkKey: Secret`. `reveal()` is called in the constructor's length check and in `mac` (:237); there is no field holding the bytes. My probe: the dump at head shows `linkKey: [secret X]`. At `4f6e08001` it showed `macKey: <Buffer 4b 4b …>`.
- **Breaker m4: works as written, but see M3 and m6.** settings.ts:57 is `z.string().min(32).refine((v) => new Set(v).size >= 16)`.
- **My round-1 m2: fixed.** settings.ts:57 now sits above the PF-8b F2b comment (:58-59) and its entry (:60).

### Regressions
- **PF-15:** none. Cases 1-2 still show the limit check reached and FileKeyTaken kept on both stores, now under the app's real order.
- **Contract:** none. The four FilesPort contract runs pass, and the diff does not touch them.
- **PF-24 read-once:** kept. The new code reads `platformConfig()` (once per process), and `S3FileLinks` now holds the `Secret`. **But the new rule breaks the PF-24 suite: M3.**

### Findings
**M3 (Major, new in this diff): the link-key rule refuses the key that `check_pf24_secrets.ts` generates in about 76% of runs.**
- `check_pf24_secrets.ts:44` (this branch's line, round-1 m2) sets `PLATFORM_FILES_LINK_KEY: rand(40)`, and `rand` is `randomBytes(n).toString("hex").slice(0, n)` (:26). That is 40 characters from a 16-letter alphabet. ">= 16 different" therefore means every hex digit must appear.
- P(all 16 appear in 40) = 0.243 (inclusion-exclusion). Probe in the scratchpad: `loadPlatformConfig` with `rand(40)` keys was refused **153/200**.
- That makes section 1's "pass: PLATFORM_ENVIRONMENT=test/production with every setting loads" and the later uses of `generated()` fail about 3 runs in 4. The batch's single retry still leaves the suite red about 57% of the time.
- The builder's 30/0 does not cover this suite. I did not run it, because it uses ports and 54329. The loader probe is the same call that its section 1 makes.
- Fix: make the generator line a base64 key (`key32()`, already in that file) or a longer key. Or change the rule (m6). Then show `check_pf24_secrets.ts` green.

**m5 (Minor): the break m3 test does not fail without its fix.**
- check_pff1b_bind.ts:172-174 looks for the key text and for `Buffer.from(key).toString("hex").slice(0, 32)` as one unbroken string.
- The old leak printed `macKey: <Buffer 4b 4b 4b …>`: spaced hex in `inspect`, and decimal `data:[…]` in JSON. So the "nor its bytes" claim is never tested. With s3-files.ts at `4f6e08001` the run is 30/0.
- Fix: also check that the dump has no `<Buffer` / spaced hex of the key, or check that the dump shows `[secret PLATFORM_FILES_LINK_KEY]` and no other field from the key.

**m6 (Minor, for the Lead): ">= 16 different characters" refuses strong random keys written in hex.**
- `openssl rand -hex 32` (64 characters, 256 bits) is refused **23%** of the time.
- `openssl rand -hex 16` (32 characters, 128 bits) is refused **93%** of the time.
- The `expects` text points to base64, so an operator gets a named refusal, not a silent fault. But the rule rejects keys by their alphabet, not by their strength.
- A lower bound would still refuse "aaaa…"-style keys while letting any random hex key pass. For example, 10 different characters: P(a random 32-hex key has fewer than 10) is about 1e-6. That would also fix M3 without touching the test.
- The threshold itself is the breaker's proposal, not a cited rule, which is fine for a security heuristic. Nothing else new was invented.

**Note (no change asked): `FEATURES` is a hard-coded six.**
- A future feature that binds `LocalFiles` itself and sorts after the retainers would not appear in the merge test.
- One line could catch that: assert that only these six files in `api/src/features/` mention `LocalFiles` / `filesProviders`.

### Left for the PR body (agreed, not re-judged)
- Round-1 m1 (r4-m2 in this PR, per the Lead at 15:53 IST).
- m3 / breaker m1 (the files settings outside the loader, PF-F1's design).
- m4 (line counts).

### Working tree
During this review, uncommitted edits to `settings.ts` and `choose.ts` appeared in the shared working tree (the threshold changed to 10, and a `loadedEnvironment()` helper added). I did not make them, did not review them, and did not touch them. This verdict covers the commit only.

To fix before Approve: **M3**, then show `check_pf24_secrets.ts` green. Fix m5 in the same commit if cheap. m6 is for the Lead, or it is the M3 fix itself.

**Verdict: Block** at commit 4ae0c919ec7efa73206482b313f57a9ab070b552.

## Round 3 (diff 4ae0c919e..b66e603f4)

Reviewer: Opus 5.5, same fresh-context reviewer. Diff only: `git diff 4ae0c919e b66e603f484637e752cad6c966497cc81582515a -- . ':(exclude)*/product/screens/*'`, 4 files, +30/-9 (settings.ts, choose.ts, check_pf24_secrets.ts, check_pff1b_bind.ts). Journey test: N/A (runtime row, no screen). I did not use the database on 54329, did not run run-suites.sh, and did not use :4400. The working tree was clean at head; I changed nothing in it.

**Verdict: Approve.** M3, m5 and m6 are fixed, and breaker r2 m2 is fixed. Each new test fails without its fix, except one: the "malformed link key" line passes even when the narrowing it names is removed (m7, Minor). The unset-environment tolerance is safe on a real server, and the read-once rule is kept.

### Checks I ran (Node 24.22.3)
- `tests/check_pff1b_bind.ts` at head: **33 passed, 0 failed**, in the repo and in a `git archive` scratch copy. I checked that the copy's five touched files are byte-identical to `b66e603f4`.
- `tests/check_pf24_secrets.ts`, scratch copy, port 4436 (runtime range), 7 runs: **78 passed, 0 failed every time**.
  - Sections 1-4 and the first block of section 5 ran in full.
  - The suite's isolated-server block (`tools/isolated.sh`, which creates a database on 54329) was stubbed out in the copy, so I did not run its 6 checks. 78 + 6 matches the builder's 84.
- Loader probe, 2000 draws each, at head:
  - Refused 0 times each: `key32()`, the old `rand(40)`, and random hex of 32 and 64 characters.
  - Refused: `"a"x40`, `"short"`, and 9 different characters repeated.
  - Accepted: 10 different characters repeated (the patterned-key Minor, already accepted by the Lead).

| Fix removed (scratch copy only) | Result |
|---|---|
| m5: s3-files.ts at `4f6e08001` | break m3 FAIL (32/1). Still FAILs with the `/Buffer/` clause also dropped, so the spaced-hex and decimal checks catch it on their own. |
| r2 m2: cache back to `\|\| recorded` | case 2 links line FAIL by name, `{"links":"S3FileLinks","sameStore":false}` (32/1). |
| Tolerance removed (`platformConfig().environment`) | 2 FAIL: support-only with no environment exits 1; the production line fails too (ConfigRefused instead of "PLATFORM_FILES is not set"). |
| Tolerance catches every fault (`catch { return undefined; }`) | **33/0: not caught** (m7). |
| m4 `.refine` removed | break m4 FAIL (32/1). |

### Each fix
- **M3 / m6: fixed.** The rule at settings.ts:57 is now `new Set(v).size >= 10`, which is the lower bound my round-2 m6 proposed. Random hex and base64 keys now pass (0/2000). The `expects` text is updated, and break m4 still fails without the rule.
- **PF-24's generator: fixed.** check_pf24_secrets.ts:44 uses `key32()`. This is the one line the Lead accepted. The new rule alone would also pass the old `rand(40)`, so either change on its own would fix M3.
- **m5: fixed.** check_pff1b_bind.ts:185-187 looks for the key's bytes in the two forms the old leak printed: spaced hex (whitespace-normalised) and JSON decimal. It also refuses `Buffer`, and its self-check shows that the same test sees the old leak.
- **Breaker r2 m2: fixed.** choose.ts:85 now rebuilds when the recorded client changes. With the seam, the links and the store share one S3Files, and case 2 asserts `links.files === inner`. With no seam (`recorded` undefined), production behaves as before. A seam planted later is still refused first at :82.

### Unset environment: safe on a real server
- **Code path:**
  - choose.ts:71-74 returns `undefined` only for `ConfigRefused` with `environment === "unset"`. A blank value trims to unset at settings.ts:114-117; "not recognised" and every other fault are rethrown.
  - With `PLATFORM_FILES` unset and NODE_ENV not production, `filesAdapterOf` (:34) then gives `local`, and `LocalFiles`' constructor does no I/O (front-office/files.ts:29).
- **Does a real server get there?** Yes, but it never runs. main.ts:238 `await registerFeatures(AppModule)` imports every feature before `NestFactory.create` at main.ts:240, which is where provider factories run and before any listen.
  - `features/platform-messages.ts:26` calls `boundFiles()` at import, which now returns a LocalFiles.
  - `:27` then calls `platformConfig()`, which throws `ConfigRefused` (unset).
  - My scratch start of `api/src/main.ts`, with no PLATFORM_ENVIRONMENT and a dead DATABASE_URL (not 54329), exited 1 with the stack `settings.ts:117 <- platform-messages.ts:27 <- features.ts:20 <- main.ts:238`.
- **What guards it:** main.ts has no loader call of its own. The refusal comes from the import-time read in platform-messages.ts:27, and PF-24w DW2 (`check_pf24w_environment.ts:113-115`) pins the whole-server result. NODE_ENV=production still fails closed with the environment unset (the new case 3 line).
- **Which apps it is for:** the tolerance only helps apps built without the full feature set, such as the tests that delete `PLATFORM_ENVIRONMENT` (check_pf18b_support.ts:34, check_fo13i_identity.ts:30).

### Read-once (PF-24)
Kept. PLATFORM_ENVIRONMENT still comes only from `platformConfig()`, and a server whose configuration loads caches it once. One side effect, only when the environment is unset: `platformConfig()` does not cache a refusal (settings.ts:193-199). So in a feature-only test app, each `boundFiles()` re-runs the loader, and no secret is scrubbed from `process.env`. A real server never runs in that state, because it exits at main.ts:238 as above. Note only.

### Findings
**m7 (Minor): the "any other configuration fault still stops the start-up" line does not test the rethrow.**
- In the full six-feature child, the malformed key is refused by `platform-messages.ts:27` whatever `loadedEnvironment` does. With a catch-all tolerance the run is still 33/0.
- My probe: the same malformed key with `PFF1B_FEATURES: SUPPORT_ONLY` started (status 0, STARTED) under the catch-all, and stopped at `choose.ts:72` at head.
- Fix: run that line with `PFF1B_FEATURES: SUPPORT_ONLY`. The behaviour at head is already correct.

**Note (no change asked):** the server's refusal of an unset environment rests on an incidental import-time read (platform-messages.ts:27), not on an explicit main.ts loader call. PF-24w DW2 covers it.

### Regressions and invention
- Regressions: none. Every round-1 and round-2 line still passes, and the PF-24 suite is green (7/7) on everything I could run without the database.
- Invention: none. The claims in the new comments are true: FO-13i's and PF-18b's tests delete PLATFORM_ENVIRONMENT, and platform-messages reads the configuration at import. The three accepted items (settings.ts lines, the generator line, the patterned-key Minor) were not re-judged.

Open: m7 (Minor), for the PR body or a one-line follow-up.

**Verdict: Approve** at commit b66e603f484637e752cad6c966497cc81582515a.
