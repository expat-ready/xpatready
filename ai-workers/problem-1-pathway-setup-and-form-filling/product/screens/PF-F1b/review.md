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
