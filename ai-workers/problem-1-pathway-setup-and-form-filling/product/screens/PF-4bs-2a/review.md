# PF-4bs part 2a: review, round 1 (PR #3815, head 6ab56db7cb1497bdcf095c46de881dfa473bc33d)

Reviewer: a fresh Opus session that did not build this. Approved design: concept r3 §2 and §6 (PR #3214, the Lead's rulings in comment 7124321686).
This row is API only (no page), so the browser, width, zoom and BIC checks do not apply. Journey test: `journey-test-reviewer-2026-11-26.md` (8.5/10).

**Verdict: Block** (in the skill's terms, Ship after fixes: the design stands and three Majors need local fixes).

## What I ran (on 6ab56db7c)
* `check_pf4bs_sign_in` 27/0, run twice. `check_pf4b_session_reads` 55/0 (Part B was not run: it needs a port). `check_pf12b_doors` 33/0.
  `check_forms_qa53` 49/0 on an isolated copy on :4438. `graph.mjs --check`: G1/G2/G4/G5 0.
* API journeys on an isolated copy on :4439 (`PLATFORM_IDENTITY=local`, Sample seed). The codes came from my own RFC 6238 script, as an app would make them.
* A breaker script and 17 mutations, run on a scratch copy in the scratchpad (the worktree was not changed). 13 mutations were caught and 4 survived (listed below).

## Concept fit (§2 doors 1-5, §6 item 2a)
* Door 1 meets the concept in full except the per-IP limit (M3 below). The answer shape, `key` as text plus the `otpauth://` link, no QR code, and one 401 with the same words: all met.
  On the live copy, the full answers for a wrong password and for an unknown email are byte-identical apart from the date.
* Door 2 meets the concept: token, `CODE_REFUSED`, `ATTEMPT_EXPIRED` with the concept's words, and `SIGN_IN_REFUSED` for a changed attempt.
  AG-1-55 holds: the older token gets 401 after the new sign-in, and one `platform.staff.sign_in` line is written.
* Door 3 meets the concept: the attempt is sealed by the secret box, with the owner's purpose as GCM additional data. A value sealed for `set-password-code` is refused. The attempt is 239 characters, under the 2000 cap. Using the nil uuid in place of "platform" is reasonable.
* Deviations: the `platform_staff_of_email` migration is sound. It follows PF-12b part 2's definer pattern, runs as xr_app, reads the person as their firm, and a shared email gives null.
  The concept said "no migration", but only about the limits, so the Lead's answer to PR question 1 is still needed before merge. The separate controller and the Sample password are fine.

## D1-D20 (1-5)
D1 3: the doors match the concept, but the per-IP limit does not use X-Forwarded-For, and the code limit can be bypassed (M2, M3) · D2 4: one sign-in line and one session, but the per-attempt counter can race (M2) ·
D3 N/A · D4 N/A · D5 4: a double submit gives one 200 and one 401, and the right code works after a wrong one · D6 4: sign-in and refusal lines on the right firm, none for an unknown email ·
D7 N/A · D8 N/A · D9 4: `step` says what comes next · D10 3: m4 · D11 4: a distinct code for each outcome · D12-D14 N/A (no page) ·
D15 5: 54 ms first sign-in, 2-19 ms refusals · D16 3: 13 of 17 mutations caught, but no test for timing, cross-attempt codes or forwarded addresses ·
D17 simulated only · D18 4: Sample and Unconfirmed are labelled · D19 N/A (PRs 3-4) · D20 simulated only.
**BIC-01-20:** all N/A (platform sign-in API, not a case-side screen, no page).

## Issues
**Major 1 (Must). Timing tells a stranger which emails belong to staff.**
* Where: `api/src/platform/identity/session/sign-in.ts:145-148`.
* Cause: for a known email, the door runs `person()` (three queries) and then `refusedLine()` (an audit transaction). An unknown email costs one query.
* Live copy: a known email with a wrong password took 8.5-19 ms (12 tries). An unknown email took 2.1-4.8 ms (8 tries). The ranges do not overlap.
* Test harness: medians 8.03 ms against 2.33 ms; the 10th percentile for known emails (6.77 ms) is above the 90th percentile for unknown ones (3.11 ms).
* Why it matters: the concept's single answer for "wrong password and unknown person" is defeated by timing (STANDARDS [M] ASVS L2).
* Fix: give every door-1 refusal the same cost, for example a fixed minimum answer time (Sample) that covers both paths, or the same database work on both.
  Add a DW1 test that the two medians are within a tolerance; it should go red with the floor removed.

**Major 2 (Must). Someone who has the password can brute-force the second step.**
* Where: `sign-in.ts:115, 163-172`.
* Cause: wrong codes are counted only per attempt. A new attempt costs one correct-password call, and that call counts against no limit. The code door counts nothing against the address or the person.
* Scenario B: 30 attempts with 4 wrong codes each gave 120 wrong codes for one person, from one address, in one window. Nothing was throttled, and the right code still worked (200).
* Scenario C: the counter is read after `await this.port.code(...)` (`:166-170`). With a 50 ms provider (as Cognito will be in 2b), 40 parallel wrong codes on one attempt reached the provider 40 times, against a limit of 5.
* Fix:
  * Count wrong codes per person (the attempt's username) and per address in `Tries`, with Sample numbers, and count refused code-door calls per address.
  * Reserve the attempt's try before awaiting the provider.
  * Tests: many attempts with wrong codes, which must be throttled (red today); parallel codes with a slow port, where the provider is asked at most 5 times.

**Major 3 (Must). The per-IP limit does not use X-Forwarded-For, which concept §2 door 1 requires ("the load balancer as the one trusted hop").**
* Where: `session/routes.ts:13`. `ipOf` takes `req.ip`, and nothing in `api/src` (including `main.ts`) sets `trust proxy`.
* Scenario D: after 25 refusals with `X-Forwarded-For: 203.0.113.1`, another client (`198.51.100.7`) with the right password got 429.
* Behind the load balancer every person shares its address. Once 2b replaces `NotSetUpSignIn`, anyone can lock every staff member of every firm out of sign-in for 15 minutes with 25 bad tries.
  It cannot be exploited at this commit, because servers that are not local answer 503 before the limit.
* Fix: one trusted hop for the deployed stack (Express `trust proxy` = 1 behind the load balancer, or the right-most X-Forwarded-For entry when a setting says so).
  Tests: two forwarded addresses get separate counts, and a forged left-most entry does not escape its count. Or the Lead records in the PR that this moves to 2b.

**Minors (Should)**
* m1 `sign-in.ts:89-90`: memory and the 50,000 cap.
  * `Tries.over()` stores a key for every new address or email, even when nothing failed, and the cap is checked only in `add()`. Old keys are kept even when empty.
  * Run: 2,000 bad-email (422) requests from 2,000 addresses left 2,001 keys, which never leave; a key from a past window stayed with length 0.
  * The cap removes the oldest key first, so 50,000 fresh refusals reset a target email's count. Fix: delete empty keys, and do not store a key in `over()`.
* m2 `sign-in.ts:146`: once an email is over the limit, a stranger writes one refusal line per try (24 lines on one person from one address in one window). No test covers that line (mutation M13 survived). Consider one line per window.
* m3 Tests that survived mutation:
  * removing the `xr_staff_bypass` grant: DW5 (`tests/check_pf4bs_sign_in.ts:161`) does not assert it, or that there is no other grantee (PF-12b's DW6 does);
  * widening the code window to ±10 steps;
  * removing the attempt's shape check (`sign-in.ts:161`).
* m4 Words.
  * An attempt that was already used or double-submitted answers "That email and password don't match." (`:163`), but the person typed no password at this step. The concept names `SIGN_IN_REFUSED` only for a changed attempt.
  * `CODE_REFUSED` carries the title "Sign in again" while its detail says "try again".
* m5 Two tasks: `codesPerAttempt` is not halved per task, unlike the header's rule. `usedNonces` is per task, so an attempt used on one task can be tried on the other.
  Cognito's one-use session covers this in 2b; it should be said in the PR. Major 2's per-person count makes it moot.
* m6 Graph G3 lists both doors as reached by no test. The check calls `call(base, "POST", …)`, and `graph.mjs:73` reads only `call("POST", …)`.

## Held (each of these mutations went red)
* Expiry, attempt marked used, code replay, one session.
* Refusal line for a wrong password, inactive check at the door.
* Per-email, per-address and per-attempt limits, wrong passwords accepted.
* Definer giving the first of two shared rows, door trusting the provider for an unknown person.
* `Cache-Control: no-store` on both doors. The Sample password appears in no output and no audit line.

## Could not check
* Cognito's own behaviour (part 2b), two real tasks, Nest's own logger (the check runs with `logger: false`; the concept puts that scan in 2b).
* D17 and D20 stay with the founder.

**Verdict: Block.** To fix before Approve:
1. Major 1: give known and unknown emails the same answer time on door 1.
2. Major 2: count wrong codes per person and per address, and reserve the attempt's try before the provider call.
3. Major 3: per-IP limit from one trusted X-Forwarded-For hop, or the Lead's ruling moving it to 2b.
Each with a test that goes red without the fix. The Minors are recommended, not required.

Reviewer: Changes 6ab56db7cb1497bdcf095c46de881dfa473bc33d

---

# Round 2 (diff-only, 14754519)

Reviewer: a fresh Opus session that did not build this. Scope: `git diff 6ab56db7c 14754519` (`session/sign-in.ts`, `session/routes.ts`, `tests/check_pf4bs_sign_in.ts`), checked against round 1 and the round 1 break report.
The worktree was checked at `14754519723f231c80edb65e8e5c1fbbaa0abf70` on `claude/runtime-pf4bs-signin`.
While I worked, uncommitted edits to `sign-in.ts` (a `Tries` rewrite), the check and `break-report.md` appeared in the worktree; I did not make them. Every result below is from a scratch copy byte-identical to 14754519 (checked with `cmp`), except where marked.

**Verdict: Block** (one new Major, R2-1; in the PR line, Changes as in round 1). The three round-1 Majors are fixed and pinned.

## What I ran (on 14754519)
* `check_pf4bs_sign_in` **37/0, run twice** (worktree at 07:25 UTC, before the edits; then the scratch copy).
* `check_pf4b_session_reads` 55/0 (Part B was not run: it needs a port). `tsc --noEmit -p api/tsconfig.json`: 0 errors. `graph.mjs --check`: exit 0, G1/G2/G4/G5 0.
* Run on the worktree after the uncommitted edits, so not proof for 14754519: `check_pf12b_doors` 33/0, because it needs git and cannot run in the scratch copy. That diff does not touch what pf12b checks.
* `check_pf28_inputs` (a) 18/18. Part (b) needs an isolated copy on :4487, which I did not start. `check_forms_qa53` was not re-run, because it needs a running copy. The builder's runs of both stand.
* **20 mutations** on the scratch copy: 15 were caught and 5 survived (table below).
* A `Tries` micro-run at the 50,000 cap.
* My scratch databases were dropped by the checks. Six `xr_studio_pf4b_scratch_*` databases from 06:37-06:56 UTC are older than this session and are not mine; I left them alone.

## Round 1 Majors: fixed, and does the test go red without the fix?
| Round 1 | Fix at 14754519 | Mutation | Result |
|---|---|---|---|
| **M1** timing (review M1, break M1) | `settle()` floor of 250 ms (Sample) on every door-1 refusal, including the 429 (`sign-in.ts:120`, `:174-181`) | the floor removed | **red**: DW1 `:109` (medians 11.3 ms known, 3.8 ms unknown) |
| **M2** code brute force (review M2, break M3) | wrong codes counted per person (`codesByPerson`, 10 per task) and per address (`:201-203`) | the per-person count dropped | **red**: DW3 `:183` (the 11th code → 200 token) |
| | | the failed code's try given back | **red**: `:183` |
| **M2-C** parallel codes past the per-attempt count (review M2 C, break m2) | the per-attempt count is reserved before `await port.code` (`:199-203`) | `tries.n++` moved after the await | **red**: DW3 `:192` (provider asked 10 times, limit 5) |
| | | the per-attempt cap removed | **red**: `:192` |
| **M3** X-Forwarded-For (review M3, break M2) | `signInAddressOf` takes the last X-Forwarded-For hop, else the socket's (`routes.ts:14-17`); both doors pass it | reverted to `req.ip` | **red**: 4 checks (`:156`, `:159`, `:169`, `:171`) |
| **M3** count after await | `take()` checks and counts in one step, before any await (`sign-in.ts:174-175`) | `byAddress` split into `over()` before the await and `take()` after it | **red**: DW3 burst `:174` (26 × 401) |
| **Break M4** a named person locked out | the pair key `email\0address` (5) plus a per-email backstop (25) (`:175`) | the pair keyed by email alone | **red**: `:156` (the other address gets 401) |
| | | the pair limit dropped | **red**: DW3 `:154` |

Every Major the caller listed goes red when its fix is mutated away.
* **A note on "move a take() after the await".** Moving the whole atomic `take()` after the await (B2) stays green. This is correct, not a gap: `take` still checks and counts in one synchronous step, so parallel calls cannot slip past it. The race only returns when the check and the count are split across the await (B1 above, red).

## Mutations that survived (test gaps; none is a hole in the code as committed)
* **B5:** the pair and per-email checks split around the await (`over()` before it, `take()` after a wrong password). Nothing tests parallel wrong passwords on one email, so a regression would allow up to 25 guesses per email per address in a burst, instead of 5. Add a parallel burst on one email from one address.
* **B4:** `codesByPerson.take` moved after the provider call. The per-attempt cap still bounds each attempt, and a late refusal returns 429 even for a right code, so nothing leaks. The provider is asked more often, though. Add parallel codes across several attempts for one person.
* **L:** the code door's per-address count removed. No test covers it.
* **F:** the password door's give-back on success removed. No test covers it (an office behind one NAT address would reach 429 sooner).
* **H:** the parallel-success guard (`:211`) removed. The stand-in's `used` map already refuses the second code; Cognito's one-use session covers it in 2b.

## New holes checked
* **The give-back on success cannot be abused.** `give()` hands back only the caller's own try, so the net effect is zero.
  * Interleaving the attacker's own right password with guesses still allows exactly 25 guesses per address. The breaker's round 2 measured the same.
  * A stranger without a password cannot reach the per-person code count: made-up, used and expired attempts are refused before it.
* **429 against 401 tells nothing.**
  * On the password door, the 429 depends only on the address and is checked before any email key.
  * Pair, email and backstop limits all give the same floored 401.
  * On the code door, the person-limit 429 goes only to someone who already holds that person's attempt.
* **Trusting the last X-Forwarded-For hop is sound in the deployed stack.**
  * The load balancer is internet-facing with the default append mode (no `xff_header_processing` set) and is IPv4 only.
  * Tasks have no public IP, and only the load balancer's security group is open (`deploy/cdk/lib/service.ts:256-267`, `service-checks.ts` exposure check).
  * A deployed task forces `PLATFORM_IDENTITY=cognito`, and the door answers 503 there until 2b.
  * Locally, without a proxy, the client writes the header itself. That affects the stand-in only. (See m-c.)
* **The in-memory enrolled set** has no security effect on the stand-in, because `/session/local` already gives tokens without a password there. It does lower fidelity (m-d).
* **The per-email backstop of 25** is a residual lockout (m-a).
* **The `Tries` cap is a new hole** (R2-1).

## D1-D20 changes from round 1
* D1 3→4: doors 1-3 now meet concept §2's limits, with X-Forwarded-For per the concept.
* D2 4→5: there are no count races left on either door.
* D10 3→4: m4's words fixed.
* D16 3→4: 15 of 20 mutations caught, including every Major's fix; the survivors are listed above.
* D15: refusals now take 250 ms by design, and a first sign-in is unchanged.
* All other scores as in round 1.

## Issues

**Major R2-1 (Must, new in this round). At the limiter's cap, sign-in fails closed for everyone, and each new key scans the whole map on the event loop.**
* Where: `sign-in.ts:108` (`take`: at the cap, sweep every key, then `return false`). It is asserted as intended in `tests/check_pf4bs_sign_in.ts:197`.
* Failing scenario:
  1. About 2,000 source addresses × 25 refused tries in 15 minutes (each address stays under its own 25) fill `byEmailAddress` and `byEmail` to 50,000 live keys.
  2. From then on, every staff member's next sign-in is a new key (a success deletes its key through `give`). `take` returns false, so `limited` is set and the answer is a silent 401 "That email and password don't match."
  3. Every new address on `byAddress` gets 429 once that map is full too.
* My micro-run, 50,000 live keys: a new address is refused (`legitNewAddressAllowed: false`). One `take` at the cap costs 15.6 ms of synchronous work, and 100 cost 1,069 ms.
  The breaker's round 2 measured the same (median 14.8 ms per take) and saw an unrelated `GET /api/platform/me` wait up to 5.8 s. About 60 such calls a second stall every route of the task, for every firm.
* Why Major: the fix for round-1 m1/break m5 turned a fail-open edge (a flood could reset a blocked key) into an outsider-controlled global off switch plus a CPU amplifier. Like round-1 M3, it cannot be exploited at this commit (the door answers 503 off the stand-in), but 2b inherits `Tries` as it is.
* Fix:
  * Constant work per call: keep keys in order of their last try, sweep expired keys from the front, and at the cap evict the key tried longest ago.
  * A blocked key that is still being tried moves to the back, so it survives a flood. A full map never refuses a newcomer.
  * Tests: a newcomer is admitted at a full map, a still-tried blocked key stays blocked, and one call stays under 1 ms at 50,000 keys.
  * The uncommitted worktree edit seen at 07:34 UTC appears to do this, but I have not reviewed it. It needs a diff-only check on its commit.

**Minors (Should; none blocks)**
* **m-a. The backstop is still a cheap way to keep one named person out** (`:175`).
  * 5 addresses × 5 wrong passwords (25 calls per 15 minutes per task, about double across two tasks) refuse the victim from every address, and they see a wrong-password message.
  * This is the breaker's round-1 trade-off, made smaller; the tech lead's ruling should be recorded in the PR.
  * For 2b: AWS documents its own per-user lockout after a few failed passwords, growing to about 15 minutes. With the backstop at 25 per task (target 50), the provider can be asked often enough to set off Cognito's lockout, so the PR's "nobody can lock a person at Cognito through our door" may no longer hold.
  * To verify with a cited page in 2b. My source is general knowledge of the Cognito developer guide, not checked today: Unconfirmed.
* **m-b. Someone who has the password can keep the real person out of the code step for 15 minutes** (10 wrong codes, renewable; `:202`). This is inherent to a per-person count. On the stand-in, everyone has the Sample password. Say so in the PR.
* **m-c. Trust in the last X-Forwarded-For hop is hard-coded** (`routes.ts:14-17`).
  * Nothing pins the load balancer's append mode, and nothing protects against a CDN in front later; either would make the key forgeable or shared.
  * Suggest a CDK check for `routing.http.xff_header_processing.mode` (absent or `append`) in 2b, or a setting.
* **m-d. Stand-in fidelity** (`:79`, `:84`, `:92`). A restart shows an enrolled person the set-up step and their same key again. The Owner's reset two-step (`service.ts:227` → `LocalIdentityAdmin`) never clears `enrolled`, so a reset person still gets `step:"code"` with the old key at this door. Stand-in only; note it in the PR.
* **m-e. Tests:** the survivors B5, B4, L and F above. The name of `:142` says "the provider not asked", but `codesAsked` is not asserted. It goes red anyway, because a shapeless attempt would sign in.
* **m-f. Words.** A used or double-submitted attempt now answers `ATTEMPT_EXPIRED` "That took too long. Start again." This is better than the password words, but nothing took too long. Consider separate words when PR 3 shows it.
* **m-g. Parallel tries in flight count against the address**, successes included (breaker round 2 m8). A NAT'd firm signing in all at once can see 429.
* **m-h. The PR body is stale.**
  * It still says "5 wrong passwords per email" and "an attempt that already signed in gets `SIGN_IN_REFUSED`".
  * It omits the per-pair, backstop and per-person counts, the 250 ms floor and the X-Forwarded-For rule.
  * It still reports 27 passed.
  * Update it before Ready.

## Round 1 minors: how each was handled
* **m1 memory:** fixed. Empty keys are deleted and `over()` stores nothing. The cap's replacement is R2-1.
* **m2 refusal-line flood:** fixed (no line over a limit) and pinned (mutations I and J red).
* **m3 survivors:** fixed. DW5 asserts the exact grantees. The ±2-step code is refused (`:125`). The shapeless attempt is refused (`:142`).
* **m4 words:** fixed. `CODE_REFUSED` has the title "Code not accepted", and a used attempt answers `ATTEMPT_EXPIRED` (see m-f).
* **m5 two tasks:** moot, because codes are now counted per person.
* **m6 graph G3:** not fixed. Both doors still show `testedBy: []` in `product/qa/graph.json`, even though the check now calls `call("POST", "/api/platform/session/sign-in", …)`. That suggests `graph.mjs` cannot see through the `signIn`/`code` wrappers. Not blocking.
* **Break m1** (set-up step decided by `last_sign_in_at`): fixed with the enrolled set; m-d remains.
* **Break m4** (nonce per task): moot.
* **Break m5** (eviction): replaced by R2-1.

## Journey test (reviewer role)
Re-scored from the 14754519 runs and the mutation harness, without a new live walk (a diff-only round). The round-1 report, `journey-test-reviewer-2026-11-26.md`, stands for the journeys themselves.
* Plain words ½→1: m4 is fixed, with m-f as a small nit.
* Trust ½ stays ½: the timing leak and the code brute force are fixed, but R2-1 is open.
* Speed stays 1: refusals take 250 ms by design.
* **7.5 of 8 applicable criteria, 9.4 scaled; I report 9/10.** Pass, but the verdict is Block on R2-1.

## Could not check
* Cognito (2b), two real tasks, the page (PR 3), `check_forms_qa53` and pf28 (b) on a running copy.
* D17 and D20 stay with the founder.

**Verdict: Block.** To fix before Approve:
1. **R2-1:** `Tries` at the cap must neither refuse newcomers nor scan the map (`sign-in.ts:108`, test `:197`), with tests that go red without the fix.

The Minors are recommended. m-a needs the tech lead's ruling recorded in the PR, and m-h should be done before Ready.

Reviewer: Changes 14754519723f231c80edb65e8e5c1fbbaa0abf70
