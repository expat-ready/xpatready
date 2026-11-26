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
