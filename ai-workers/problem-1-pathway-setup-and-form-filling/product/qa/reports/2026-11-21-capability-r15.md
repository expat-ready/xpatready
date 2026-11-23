# qa capability R1.5 Staff sign-in with two-step, passkeys, lock-out on leaving: 21 Nov 2026 (cloud qa lane, asked by Lead 11 / Lead 13 (series 3); Opus 5.5, medium; US$0, live AI off)

Main tested: **039b77ed3**, which includes #2627 (merged 05:33 UTC: the lock-out holds while the person signs in, and J-5 part 1). Main's head 19fdf28d7 changes none of these paths (#2716 touches case opening in `runtime.ts` only). Isolated copies only (PLATFORM_IDENTITY=local, ports 4471-4472); :4400 was not touched.

## R1.5: **Partial**
By the Lead's ruling, R1.5 is Partial at best: the identity provider's lines (wrong code, expired code, repeated wrong tries, passkey on the real pool) happen on the real Cognito pool's pages and are **Not proven in CI**. The rest is scored below.

**Journeys**
* Local, on main 039b77ed3's exact tree: `tests/journeys/j_5.ts` passed **28/28 twice** on fresh isolated copies, exit 0. Screens: invitee signed in, sign-in refused, ends at the Person panel's roles (R1.6's first step).
* GitHub's runners (P-339, P-700): run **44881942787** on main's head 562754777, dispatched by Lead 14. Attempt 1 job 136779057927 and attempt 2 job 136783813001: `j_5` **28/28 each**, exit 0.

**Fresh Opus reader (P-303; read only, ran nothing):** "Verdict: R1.5 is Partial. Confidence: high."

| Done when clause | Status on main 039b77ed3 | Evidence |
|---|---|---|
| Sign-in only with the second step | Met through the **API**; no screen shows the refusal | The local door refuses the second step missing, false or the text "true" (`api/src/platform/identity/service.ts:174`; J-5 DW2 `j_5.ts:205-210`). The guard refuses a token without `otp` in `amr` (`service.ts:118`, `local.ts:42`; `check_pf4_identity.ts:145`). The sign-in card always sends it. On the real pool, `cognito.ts:93` takes the second step from the setting `PLATFORM_POOL_MFA_REQUIRED`, not from the token: **QA-623**. |
| A wrong code, an expired code and repeated wrong tries refused in words | **Not proven in CI** | The provider's own pages (`screens/J-5/shape.md` L2, L3). This needs the real pool (live proof C21). |
| A passkey signs in on the real pool | **Not proven in CI** | Same. The reader notes an Unconfirmed risk: Cognito may not allow passkey sign-in on a pool that requires two-step for everyone (P-567). Check it at the live proof. |
| A removed or deactivated member is signed out of every device at the next request | Met for `/api/platform`, `/api/front-office` and keyed `/api/runtime` routes; **not for case work** | W3 and DW1: the deactivated person's unexpired token gets 401 at once, with the revocation row and the audit line read from the database. The race is covered by `check_pf4r_lockout_race.ts:75-98`. The check is on the person, so it covers every device (`service.ts:122,129-130`; `keys.ts:19`; `core.ts:98`). **About 127 `/api/runtime` routes run as the simulated person**, so the lock-out never reaches case work: **QA-622**. "Removed" has no action in the product (Deactivate is the only way to leave) and is untested: Question 2. |
| Walked by screens once a sign-in screen exists | Met on the local stand-in | W1 invite and accept; W2 one session at a time, then Sign out everywhere; W3 deactivate, then refused on screen in words; W4 reactivate, ending at R1.6's first step. After a deactivation the card gives no reason (known review m1). |

**Verdict: Partial.** Not proven in CI: the provider lines. Not met: lock-out on case work (QA-622, Major). Weakened: on the real pool the second step comes from a setting, not the token (QA-623, Minor).

## The CI retry rated at the Lead's ask (B122 F5)
* **QA-624** · Bug · Minor. `check_c83_review_browser.cjs` walk 10 timed out on its first try in merge-queue batch #2707 (run https://github.com/expat-ready/xpatready/actions/runs/44864550194, artifact `suite-retries-16`, commit 075990a45) and passed on retry. The tooltip that `waitFor()` saw was gone before `innerText()` read it (`tests/check_c83_review_browser.cjs:141-142`). A possible race in the check, or the tooltip closes on its own. One occurrence.

## Bugs
* **New QA-622** · Gap · Major · R1.5: a deactivated member's lock-out does not reach case work, because the `/api/runtime` routes run as the simulated person.
* **New QA-623** · Gap · Minor · R1.5: on the real pool, the second step is assumed from a setting, not read from the token.
* **New QA-624** · Bug · Minor · C8.3: the review browser suite's walk 10 passed only on retry.

0 Blocker · 0 Critical · 1 Major · 2 Minor.

## Could not test
* The provider lines (Not proven in CI, as ruled). The GitHub walks (dispatch). Coverage (c8) was not rerun.

## Questions for the Tech Lead
1. Please dispatch `j_5` twice on main and post the run ids on this PR.
2. "Removed" member: the Done when says "removed or deactivated", but the product has only Deactivate. Is "removed" covered by Deactivate? If so, the clause is met for platform routes. Or should a remove action exist?
3. QA-622: is case work under staff identity part of R1.5? Or does it belong to the Known gap Q2 row, with R1.5 scored without it?

## Suggestions
* Read the second factor from the Cognito token's `amr`, or check the pool's MFA setting at start (*Needed for the proof* at the live pool; *Capability*).
* C8.3 suite: read the tooltip once, with an assertion that waits for its text (*Later*, *Scaffolding*).

## The tech lead's rulings (Lead 14, P-294, on #2762)
* **"Removed" is covered by Deactivate.** The member's history stays for the audit trail, sign-in is refused and the seat is freed. No separate remove action is needed. With that, the lock-out clause is met for the platform and front-office routes.
* **QA-622 belongs to the Known gap Q2 row**, the set of routes that run as the simulated person. It does not count against R1.5's own clauses. It is listed on the R1.5 row as a linked open Major, so nobody reads R1.5 as covering case work.

**Verdict (unchanged): Partial.** The provider lines (wrong code, expired code, repeated wrong tries, passkey) are Not proven in CI. Everything else is met, with the walks green twice on GitHub's runners.
