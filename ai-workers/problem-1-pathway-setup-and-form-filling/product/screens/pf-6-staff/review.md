# PF-6 part 1 — review (platform frame and staff session holder)

Reviewer (Opus, effort high, P-605), 16 Nov 2026. **Commit `8028615d42a422903251666726640ebfe03d7556`**, PR #1912. Inputs:
* the brief `lead-b-briefs/PF-6.md` (part 1) on `main`;
* the concept `pf-6-staff/concept.md` r2 §1, §4, §5, §6 on `lead-b-front-office`;
* the diff, the running copies :4561 (the builder's) and :4562 (my fresh isolated copies);
* the breaker's `break-report.md`, read after my own walk.

Journey test: `journey-test-reviewer-2026-11-16.md`, **8/10, pass**.

**Verdict: Ship after fixes.** The holder move, the end reason, PlatformFrame, Signed in elsewhere, Sign out and My account are correct and well tested. Two Majors remain on the callback page's recovery path (brief item 4).

## Done-when cases (one tick per line)
| Line | Case in `check_pf6a_frame_browser.ts` | Tick |
|---|---|---|
| DW1 | :80 (no-session calls; zero calls, allowed by "except"), :83 fail, :85 header name | ✓ |
| DW2 | :109 pass and :116 button opens the card; :104 B leaves A open; :122 SESSION_REVOKED; :126 TOKEN_EXPIRED | ✓ |
| DW3 | :141 (MutationObserver, A never on B's page), :153 | ✓, but weak: it passes with the `["pf"]` drop removed, because every query key carries the token (`session.ts:85`, `account-page.tsx:24`); m3 |
| DW4 | :131 link, :139 one post, :140 code out of address and history, :143 reload makes no post, :147 refusal words, :149 | ✓; the refused-link recovery is missed (Majors 1 and 2) |
| DW5 | :166 POST with the old bearer and storage cleared, :170 no later call with the old token, :171 server answers 401 | ✓ |
| DW6 | :92 menu = `visibleSections(ACCOUNT_SECTIONS)`; :95 test entry and missing key, on the pure function; :96 and :184 no picker, no `x-actor` | partly; m2 |
| DW7 | the FO-4 and PF-1 suites are unchanged in the diff; my reruns on a fresh copy: 45/45 and 28/28; `/sign-in` is exact, not `/sign-in/*`, so no overlap | ✓ |
| DW8 | :110-116 keyboard on Signed in elsewhere, :162 Sign out by Tab, :174-182 axe and no sideways scroll at 375, 1024 and 1440; my 200 % zoom: axe finds nothing | ✓ |

The suite passed 47/47 on two fresh copies. It cannot rerun on one copy (seat limit, journey finding 5). The builder reported web tsc clean; my tsc ran on a working tree that holds uncommitted fixes, so it does not count for this commit. `graph.mjs --check` passes: G1 0, G4 0. Its G3 lines for `/platform/me`, `me/account`, `session/callback` and `sign-out` are a graph blind spot: it does not see `staffApi` calls (FO-4 has the same), and the suite drives these routes in the browser.

## The builder's five choices
1. Firm key as the title: **accepted**. Lead B ruled on it (PR comment, rev 16.46): the firm name comes with PF-13 part 2, DW11.
2. `platform/session.ts` imports `Me` and `problemOf` from `front-office/sales/contract.ts`: **accepted for this part**, because the touch list forbids moving them. The dependency points the wrong way (platform → a front-office module). Should: move them in the next PR that touches `contract.ts`.
3. DW6 on the pure function: **partly met.** The browser check compares the menu with a one-entry list, so a hard-coded "Profile" link would pass too. The frame's use of the list is proved only by reading `frame.tsx:49` (m2).
4. `/me` re-checked on each navigation (`location.key`): **accepted.** It costs one small request per click, fits "on its next click", adds no polling, and measured no extra call to `me/account`.
5. Code removed before the post, no bearer: **accepted.** Correct for a one-time code. The cost is that a network failure leaves nothing to retry (breaker m5, Minor).

## D1–D20
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | Items 1-6 built; AG-1-55's words exact; menu fed by the list; firm key per the ruling; the callback recovery gap |
| D2 | 4 | Web only; the server enforces one session per person (DW2); one post per code; no writes |
| D3 | 5 | The holder moved, not copied; `sales/session.ts` is a 2-line re-export; one sign-in card |
| D4 | N/A | No questions or rules |
| D5 | 3 | Reload, double-click and storage fully blocked hold; Majors 1 and 2; a late 401 ends the next person's session (m4) |
| D6 | N/A | No content; sign-in audit is PF-4's |
| D7 | N/A | No AI |
| D8 | 4 | Path "My account › Profile"; the person in the header; the firm shown by its key |
| D9 | 4 | One action per state (Sign in, Sign in again here, Sign out); the refused-link card stalls |
| D10 | 3 | "rcic"; "The sales screens are…" on My account; "Not signed in" while signed in (m1) |
| D11 | 3 | Busy buttons; no feedback after the card sign-in on the callback page; a text line, not the skeleton |
| D12 | 4 | BK-3 Frame, tokens, a calm card; screenshots at 375, 1024 and 1440 |
| D13 | 4 | axe clean on every tested state, keyboard path, 200 %; focus drops to body after "Sign in again here" |
| D14 | 4 | The team's Frame and controls; PRODUCT words |
| D15 | 5 | 95 ms sign-in to Profile; no per-row requests |
| D16 | 3 | A pass and a fail per line; reruns clean on fresh copies; DW3 and DW6 cases do not fail when their rule is removed; not rerunnable on one copy |
| D17 | — | Simulated only |
| D18 | 4 | Two-step and licence from the server; "required for everyone" shown as the rule |
| D19 | N/A | Part 1 of a row (invite → accept → callback → My account does work end to end in the suite) |
| D20 | — | Simulated only |

**BIC-01–BIC-20:** N/A. EXPERIENCE §6 scopes them to case-side screens, and this is the firm-staff platform frame. Concept §4b's BIC-09 (deactivate, Sign out everywhere) is PF-6 part 2.

## Standards ([M], the lines that apply)
* STANDARDS §3.10 (a pass and a fail per rule): met. §7 "a rule's test fails when the rule is removed": **partly**, DW3 and DW6 (m2, m3). §7 axe on every state: My account and Signed in elsewhere yes; the callback refusal state is not axed (Should).
* Server authorisation (PF-4's guard): unchanged, and no `x-actor` is sent. Problem Details: the server's words are shown. Strict TypeScript: no `any` added.
* EXPERIENCE §2.12 accessible: met (Should: focus). §4 states: loading is text, not a skeleton (Minor). §5 copy: "rcic" (Minor). §1 demo chrome: none in the frame (P-35): met.
* (6) Retrofit mapping: no `build-notes.md`. The brief asks for none on a web-only move, so this is not scored.

## Issues, ranked
1. **Must (Major): the refused callback page's sign-in card does nothing visible.** `callback-page.tsx:17-41`. The page keeps `"refused"` and never reads the token, so after a successful sign-in on its card the person still sees "Not signed in". This is the exact recovery path brief item 4 adds the card for (breaker M1, confirmed in the code). Fix: read `useStaffToken()` and open `/account` when a new token appears after the refusal. Add a case: used link → sign in on the card → My account.
2. **Must (Major): a new `#code=` opened in the refused tab is never posted and stays in the address.** `callback-page.tsx:19-35`, an effect with `[]` deps. A change only after `#` does not remount the page. This breaks item 4's "posts it … removes the code from the address bar" (breaker M2). Fix: also take the code on `hashchange`. Add a case.
3. Should (Minor, m1): a refused link while signed in says "Not signed in" (`callback-page.tsx:40`). Say the person is still signed in, with a link to My account.
4. Should (Minor, m2): prove DW6 through the frame, for example by rendering `AccountMenu` with a test list in a render test. Today :92 cannot tell a list-fed menu from a hard-coded one.
5. Should (Minor, m3): DW3 cannot fail, because the queries are keyed by token. Add a `["pf"]` key without a token in the test, or record that the token key is the guard.
6. Should (Minor, m4): `staffApi` ends whatever session is current on a late 401 from an older token (`session.ts:77`). End it only when `token === staffToken()` (breaker m2).
7. Should (Minor): the holder prefers stored over in-memory after a refused write (`session.ts:16-19`). This came from FO-4 on `main`, moved unchanged, and is rare (a storage quota error) but shows the last person or loops `/me` (breaker M3). Fix it here, since the file is in the touch list, or file a BUGS row.
8. Should (Minor): plain words: "rcic" (`account-page.tsx:15,34`); the card's "sales screens" sentence (`frame.tsx:32`).
9. Should (Minor): focus after "Sign in again here" and after sign-in (`signed-in-elsewhere.tsx:15`); the skeleton for loading (`account-page.tsx:27`); suite rerun on one copy (`check_pf6a_frame_browser.ts:39-46`: deactivate the invitee at the end).
10. Not a code finding, for Lead B (breaker M4): tab-only storage plus one session per person means a second tab of the same browser is "another device". This follows the brief's storage rule.

**Could not check:** a real screen reader; the real identity provider; other browsers' storage; a re-run of `tsc` on the exact commit (the working tree holds uncommitted fixes; CI's `types` job will). **The running copy :4561 no longer matches this commit.** Its `web/dist` was rebuilt at 02:42:48 UTC from changes that were then uncommitted, and the copy was then restarted on head `674e49364` (the breaker fixes). That head is for the diff-only re-review (`8028615d4..674e493`), not this one.

**Verdict: Block**
1. Major: `callback-page.tsx` — a sign-in on the refused page's card must open My account (with a case).
2. Major: `callback-page.tsx` — a `#code=` opened in an already-open callback tab must be posted once and removed from the address (with a case).
