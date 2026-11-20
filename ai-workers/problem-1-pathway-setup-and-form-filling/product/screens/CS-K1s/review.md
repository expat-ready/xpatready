# CS-K1s review: Clients list and client page with "Open a case?" (R1.72, QA-593)

Reviewer: a fresh Opus screen-reviewer at high effort, 20 Nov (UTC 10:0x-10:5x). **Reviewed SHA: `47debd8cbf5caa8fc772a24f2eb85a1dae442f26`** (`git diff origin/main...47debd8c`). Concept: the brief `design/build-lead-c-briefs/CS-K1s.md` on `claude/build-lead-c-647b40`.
**The branch moved while I reviewed** (the builder commits in the same checkout): 47debd8c → 3d4787466 (10:16, test-only) → 43d6ad78d (10:34, breaker fixes) → ea3cb1152. I reviewed 47debd8c only. Exact-SHA runs used a `git archive` copy of 47debd8c in my scratchpad on :4444. Two runs made in the shared checkout after 10:30 hit a tree that was being edited mid-run, so I threw them away.
Journey score (skill journey-test, reviewer role): **8.5 / 10**. Report: `journey-test-reviewer-2026-11-20.md`.

## Checks run (all on :4444, isolated, live AI off, US$0)
| Run | Result |
|---|---|
| `check_csk1s_clients_browser.ts` (DW1-DW7) | 31/31, twice: once at 47debd8c in the checkout, once on the exact-SHA copy |
| `journeys/j_72.ts` | 31/31 exit 0, twice: fresh copy in the checkout at 47debd8c-equal code, then the exact-SHA copy |
| `check_csk1_client.ts` · `check_fo8_prospect_won.ts` · `check_bk3_frame.ts` | 64/64 · 43/43 · 156/156 |
| `check_bk4a.ts` at 47debd8c | **21/22: FAIL BR-6** (see M2) |
| `typecheck.mjs` (exact-SHA copy) | web 0 errors; api: no error in any file this diff touches (6 scratch-copy path artefacts only) |
| Own walk (keyboard only, 1440, 1024, 512 css px = 200 %), axe on 9 states, break-it | see the journey report |

## Verdict: Block (on 47debd8c)
Two Majors are open. The skill's scale would make this "Ship after fixes". Both look addressed on later heads: 3d4787466 changes the BK-4a count, and 43d6ad78d's message says "breaker M1: land on the opened case as the signed-in staff member's own person". I have not reviewed those heads. A re-review should read only `47debd8c..<new head>`.

### Major
* **M1. "Open the case" lands on a refusal after the success toast when "Acting as" is not a person of the signed-in firm.** `web/src/runtime/clients.tsx:205` sends `nav(/cases/<id>)`. The case page reads the case as the simulated person (`xr-actor`), not as the staff session that opened it. Seen at 47debd8c, signed in as firm A's representative:
  * Acting as Solo representative (firm B): the case page shows "This case could not be opened · No such case." beside the toast "Case C-2026-00008 opened" (screenshot `land-user-S.png`).
  * Acting as Client A: "This page is for the case officer".
  * Acting as Configuration author (chosen): "Cases are worked by the firm".
  * The case itself is right: one case, created_by user-R. Only the landing fails.
  * This breaks the brief's "Success goes to /cases/<new id>" / DW3 "lands on it". It also breaks the demo route in the PR body (firm B staff with the default Case officer picker). Not tested: DW3 and J-72 always set `xr-actor=user-O`.
  * **Fix:** before navigating, make the case area act as the signed-in staff member's own person. Or, when they differ, land on a page that says so with one button. Add a DW3 line with a mismatched `xr-actor` (pass and fail).
* **M2. A required suite is red at this SHA.** `tests/check_bk4a.ts:99` (BR-6) counts `<KnownPerson>` in App.tsx as 2. The new `/clients/*` route makes it 3, so the suite fails 21/22. That breaks the brief's "Full ci green". **Fix:** commit 3d4787466 (the count becomes 3, with its reason). It is test-only and I re-ran the check's logic against it.

### Minor (fix, or list a follow-up row)
* m1. **Won prospect with no program is a dead end** (`clients.tsx:196`). The card says why and shows no button. QA-593 stays open for those wins: only the API, with `combinationId`, can open them. The builder raised this as a question on the PR; the tech lead decides the follow-up row. Not new scope here.
* m2. **Demo chrome inside the card.** The row "Questionnaire login: Client A (simulated)" (`clients.tsx:27, 223`) sends a fixed `user-P` (deviation 1, justified: `NewCase.clientActor` is required). It is labelled "(simulated)" but is not visually separate, and is not listed as not-for-porting in `MODULE.rows/CS-K1s.md` (EXPERIENCE §1 [M]). Fix: style it as demo chrome, the same as the picker's "Simulated" chip, and add the not-for-porting line.
* m3. **"None yet" wraps to two lines** in the Cases column at 1024 and 1440 px (`clients.tsx:137`), so row heights are uneven (EXPERIENCE §1). Fix: `whitespace-nowrap`.
* m4. **The USED words name a step this page lacks.** "Open another case for the client instead." (`prospect-won.ts:171`) has no control on the client page. The brief keeps the texts, so fix it on the page: under the alert, link to Cases.
* m5. **New response fields lack a shared schema.** `cases` and `file_owner` exist only as local zod in the web (`clients.tsx:32-35`); STANDARDS §6 is contract-first. Fix: move `ClientList` and `ClientView` into `contracts/runtime.ts` (add-only).
* m6. **Focus drops to `<body>`** when the button turns off after a refusal. The alert is announced, so the keyboard user can recover. Fix: focus the alert.

## Deviations from the brief (my reading)
1. `{clientActor:"user-P"}`: agree, but see m2.
2. `CHANGED` reason: agree; it shows the right words.
3. No program: agree; see m1.
4. Representative null wording: agree.
5. Menu shown before sign-in: agree. DW1 holds for a signed-in member without the key.
6. Route in App.tsx: needed (and caused M2).
7. DW4 "changed" mocked in the browser: acceptable. The server rule is covered by FO-8.

## Scorecard BIC-01-20 (EXPERIENCE §6; screenshots in my scratchpad walk, step numbers in the journey report)
| BIC | Score | Evidence |
|---|---|---|
| 01 Ask once | Met | Card pre-fills program, principal, representative from the offer and says where from ("won from prospect P-00011 by Convert to client"); `05-card-1440.png` |
| 02-10, 12, 15-17 | N/A | No questions, facts, AI values, applications, roles, filing or review on this screen |
| 11 One primary, named | Met | One filled button "Open the case" per card; `05b-card-focus-1440.png` |
| 13 Errors what + fix | Partly (Should) | 409 words say what and how. m4: USED names a step with no control. m1: no-program has no fix |
| 14 Tooltips | Met | No chips or icon-only buttons; the counts say what they count |
| 18 States drawn | Partly (Must, via M1) | Skeletons, empty, no match, 404, error with Try again, read-only "Ask someone who can open cases." are all good. But a success toast sits over a "could not be opened" page (M1) |
| 19 Low load | Met | One h1, then h2 per panel; one primary; no internal ids; `10-list-1024.png`. m3 is cosmetic |
| 20 Accessible | Met | Keyboard-only path; axe clean on 9 states; 1024 and 512 css px (200 %) with no sideways scroll; headings h1 › h2 |

## D1-D20 (independent reviewer, browser and script)
D1 4: every brief element is present, deviations argued (M1 aside) · D2 5: one case under double click, two tabs at once and reload; firm B gets 404 · D3 4: `offerOf` reused, `principalNameOf` one rule for read and open · D4 N/A · D5 4: race, reload and withdraw recover; M1 · D6 N/A (case.opened and audit by the staff member) · D7 N/A · D8 4: "Clients › name" trail · D9 3: next step obvious, but M1 and m1 · D10 4: plain words; m2 · D11 3: M1 contradictory feedback · D12 4: team look; m3 · D13 5 · D14 4 · D15 5: list 78 ms, client page 83 ms, press → case content 517 ms · D16 4: DW pass/fail pairs, but M2 red, and no mismatch case in DW3 · D17 simulated only · D18 4 · D19 4: closes QA-593 for won prospects with a program · D20 simulated only.

## Graph (P-86)
`graph.mjs` lists `GET /runtime/clients/:id/offer` (and the existing `:id` and `open-case`) under G3, "no test reaches". This is a parsing gap, not a coverage gap: the tool skips `/clients/*` pages and template-literal `staffApi` calls. I saw `check_csk1s_clients_browser.ts` reach all three. Not a finding against this row.

## Could not check
A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder). The real `OFFER_CHANGED` race in a browser. The full `ci` run.
Outside this diff: the existing list search does not fold case for "ñúñez" vs "Ñúñez" (CS-K1 part 2's API).
My first row-check run wrote its screenshots into `screens/CS-K1s/screenshots` and `screens/CS-K1/screenshots` in the shared checkout, as the check does by design. The builder's later commits may contain those files.
