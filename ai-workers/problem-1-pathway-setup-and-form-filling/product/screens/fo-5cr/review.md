# FO-5cr review: the retainer draft filled in from a consult record

Reviewer (did not build it), 2026-11-24. PR #3424, branch `claude/runtime-fo5cr`, reviewed commit **a894ca308d9450aaf067920f10580d70c0659bad** (`git diff origin/main...a894ca3`). The later head 77b767fd8 adds only the builder's five screenshots. I read those as evidence and did not review any code past a894ca3.
Row (rev 16.43): AG-4-49, AG-4-50; concept fo-3-booking BR-16, Q3. Journey score: **8/10, simulated** (`journey-test-reviewer-2026-11-24.md`).

**Verdict: Ship after fixes (Changes).** The server part is correct, and firms are kept apart. It does not leak, and both Done-when lines have a passing and a failing test (19/19). One Major is open: no automated test covers the screen path that the row is named after.

## What I ran
* `tests/check_fo5cr_consult_prefill.ts`: 19 passed, 0 failed. `tests/check_fo5_retainers.ts` (regression: same `draft`, constructor and DraftBody): 248 passed, 0 failed.
* `tsc --noEmit`: no error in api or web for any changed file. The api errors left are older ones in unrelated tests. `graph.mjs --check` found no hard gap.
* Rule-removal spot checks, by reading the code. If `belongs` is set to true, d5 and d6 fail. If the fake's firm filter is removed, d2 fails. If the 422 "not both" check is removed, its case fails. If the UI's `consultRecordId` is removed, **no test fails** (M1).

## Builder's decisions (P-628), judged
* **A USD quote is not converted.** The items are filled, the amount is left empty, and a notice appears. Agreed. Fee rows are CAD under the DB CHECK, X-6 allows CAD or USD only, and inventing an FX rate would break rule 4 of AGENTS.md.
* **`consultRecordId` together with `fees` returns 422.** Agreed. Two sources for one row would be ambiguous. The 422 comes before any read, and no retainer is written (case p9).
* **One notice for an unknown id, another firm's record and another person's record.** Agreed and verified. d2, d3, d5 and d6 give the same words, the same default row and no record id in the audit (`service.ts:490-491` names the record only when it matched). The body of d2 contains none of the record's text or amount.
* **Entry hooks outside the touch list** (`consult-record.tsx:243-244`, `lead-page.tsx:89,92,99`). Accepted. Without them nothing opens the draft "with `?consultRecord=<id>`", as both the row and BR-16 require. Each hook is one line, and the PR declares them.

## Correctness, checked and holding
* Firm isolation: `consult.read(this.db, ctx.firmId, id)` (`service.ts:480`) reaches `ConsultRecordService.read`, which filters on `firmScope(firmId, {id})` and returns null for another firm. That matches the port's contract (`check_fo3a2`).
* Party match (`service.ts:482`): `prospect` matches on `p.id`; `lead` (the person id, `partyOf`) matches on the subject person or the primary contact; `client` never matches (AG-4-50 rule 3). Case d4 shows the lead path. The builder's screenshot fo5cr-5 shows it end to end.
* Label (`service.ts:142-147`): at most 120 UTF-16 units. A surrogate pair is never split, and "…" counts as one unit. Control characters are turned into spaces, so `str()` and `fo_retainer_text_ok("label",120)` accept the result. The DB counts characters, and that count is never more than the UTF-16 units.
* Hooks (`retainer-card.tsx`): every hook runs before the moved early return (`:49`), so the hook order is the same on every render. The effect waits for the retainer rows only when the list key exists (`:43`, because a disabled TanStack query stays pending). Without the key it removes the param and shows a toast. It runs once: the param is removed with `replace` and keeps `state`. The manual button resets `recordId` (`:74`).
* Nest DI injects 3 arguments (`features/front-office-retainers.ts:15`), so the defaults for audit and consult apply in the app, the same way the existing audit default already does.

## Issues (ranked)
**Major**
* **M1 (Must): nothing tests the screen path.** The UI rule sits in `retainer-card.tsx:31` (`consultRecordId` in the POST), `:42-48` (open once from the param), `consult-record.tsx:243-244` and `lead-page.tsx:92,99`, and no test fails if any of these is removed. `check_fo3st1_consult_browser.ts:157` checks only the URL, and `journeys/j_42.ts:318` still says "the walk ends at the prospect". Scenario: a later edit drops the spread at `:31`, every suite stays green, and the host types the quoted fee again, which is the pain AG-4-49 §12 and AG-4-50 §11 test 1 remove. This breaks STANDARDS.md:48 [M] ("a rule's test fails when the rule is removed"; axe on every screen state). The builder's screenshots prove one manual walk, not a regression check. Fix: after fo3st1:157 (prospect) or j_42 W9 (lead, which matches the AG-4-50 test word for word), assert that the dialog shows `[data-from-consult]`, submit it, and assert that the retainer's first fee row is "Quoted at the consultation: …" with its amount. Run axe on that panel. Declare it beside the hooks.

**Minor**
* **m1 (Should): j_42 race.** In `journeys/j_42.ts:312-316`, `waitForURL(/\/front-office\/prospects\//)` resolves on `…/prospects/<id>?consultRecord=<rid>`. The `?consultRecord` param is removed only after both the prospect and the retainer-rows GETs return (`prospect-page.tsx:83` Loading, then `retainer-card.tsx:43`). The `endsWith(prospects[0].id)` check runs after only one DB read and a screenshot, so it can fail on a slow runner. Fix: `waitForURL(/\/prospects\/[0-9a-f-]+$/)`. (fo3st1:157 already waits for a URL that ends in the id, so it holds.)
* **m2 (Should): the action notices disappear.** The USD and over-limit notices, and "No consultation record…", are `info` toasts pushed just before navigating away (`retainer-card.tsx:32`). They vanish after 4.5 s (`lib/api.ts:78`), and the retainer page does not repeat them. Scenario: a host who looks away lands on a row with the items and an empty amount, and does not know that a USD 2,500.00 quote existed (D11). Fix: carry `warnings` in the navigation state and show them as a `Notice` on the retainer page, or keep this toast until it is dismissed.
* **m3 (Should): the real wiring is not tested.** The pass case and the other-firm case go through the fake (`check_fo5cr_consult_prefill.ts:191,212-227`). The default `PgConsultRecords` is used only for an unknown id (`:229`), so no test covers a real `fo_consult_record` row filling a draft, or a real firm-B row through `plain`. Fix: write one record of each kind with `ConsultRecordService` or SQL and draft it with `plain`.

**Nit**
* n1: The panel's sentence at `retainer-card.tsx:95` promises a fill before the server has decided. For an unknown or foreign id, the toast corrects it.
* n2: Under StrictMode (`main.tsx:9`), development pushes the refusal toast twice (`:47`). Production is not affected.
* n3: `lead-page.tsx:99` keeps the record id after Cancel, so a later manual Engage on that page still pre-fills. This is harmless and arguably intended.
* n4: Case p8 (`:260-261`) checks only that the length is at most 120. It would not catch a split surrogate pair. The code is correct.
* n5: A `lead` record also fills a corporate prospect where that person is the primary contact (`service.ts:482`). The read uses the firm scope, not the booking's visibility (AG-4-49 §8). Only the items and fee reach a drafter who already sees the prospect.

## D1-D20 (this row's scope)
D1 4: AG-4-50 rule 4 and MS-D18(4) are met (label "Quoted at the consultation", the quote wins over the default); rule 5 is untouched. D2 4: CAD only, 422s are field-named, one-live rule unchanged. D3 4: reads the existing port; nothing typed twice. D4 N/A. D5 4: param removed with `replace`, so a reload does not reopen it; double submit is held by `fo_retainer_one_live_per_prospect`. D6 N/A. D7 N/A (no AI). D8 4: panel title, then the retainer page breadcrumb. D9 4: the panel opens by itself, and the lead path goes Engage → panel (fo5cr-4). D10 4: plain notices, no ids. D11 3: m2, n1. D12 4: fo5cr-2/3/5 use the team panel and fields. D13 3: not walked by keyboard, at 1024 px or at 200%; no axe on the new state (M1). D14 4: same components. D15 4: one primary-key read; no per-row request. D16 2: server rules pass and fail, the UI rule has no test (M1). D17 simulated only. D18 4: the label names the source; the audit names the record id. D19 4: booking → record → Engage → draft, shown in screenshots fo5cr-1..5. D20 simulated only.

## BIC-01..20
N/A: this is a front-office sales screen, not a case-side screen (EXPERIENCE.md §6 scope).

## Could not check
I ran no browser or isolated copy, as the caller instructed, and no app was listening on the builder's ports. So: no keyboard-only walk, no 1024 px or 200% zoom, no axe, no live timing. A real screen reader and an intended user's unaided walk (D17, D20) stay with the founder. I did not rerun j_42 or fo3st1.

Reviewer: Changes a894ca308d9450aaf067920f10580d70c0659bad
Verdict: Changes

## Round 2 (diff only, P-277): a894ca3 → 59020d8371b814e4c95b10200e856b38e9f4c5fa
I read `git diff a894ca3 59020d837`. The code is in e2f6aa923; 77b767fd8 and 59020d837 add only screenshots. I stayed on branch `claude/runtime-fo5cr` and did not detach. `check_fo5cr_consult_prefill.ts` passes 19/19 at the head, and web `tsc` shows no error in the changed files. I did not run the browser suite (the caller's rule). Its 11/11 result and the mutant run are the builder's.

**Round 1 findings:**
* **M1: fixed in substance, not yet run by CI** (see R2-M1 below). `tests/check_fo5cr_prefill_browser.ts` covers the right things:
  * the prospect path (W1/W2) and the lead path after Engage (W3/W4, which is AG-4-50 §11 test 1);
  * a USD record typed in the UI (W5);
  * a real firm-B row given by address, read through the real adapter (W6);
  * `[data-from-consult]`, Fee 1's label and amount, the audit `consultRecordId`, and axe on the panel and the draft. Axe flags only serious or critical problems, which 23 of 66 browser checks also do.
  * If the POST loses `consultRecordId`, W2, W4, W5 and W6 fail (W2 by its label, W4 by its label, W5 because the USD notice never comes, W6 because the neutral notice never comes). That matches the builder's mutant run.
* **m1: fixed.** `j_42.ts:312` now waits for a URL ending in `/prospects/[0-9a-f-]+$`.
* **m2: fixed.** `retainer-card.tsx:32` navigates with `state.warnings`. `retainer-page.tsx:36-37` starts its `warn` Notices from that state; a save then replaces them (`:42`). Screenshot fo5cr-6 shows the USD notice still on the page after 5 s. Hooks still run before the early returns (`:64`).
* **m3: fixed** by real `fo_consult_record` rows through the default adapter (W2, W4, W5, W6).
* **n1: fixed.** The sentence now says "when the record is this prospect's".
* **n3: fixed.** `lead-page.tsx:89` clears the ref in `panel(false)`. Engage success navigates without calling `panel(false)`, so the forward to the next page still works (W3).
* **n4: fixed.** p8 now checks for no lone surrogate, the "…" ending and whole characters.
* **n2 and n5: left as they are, with reasons.** I accept both: n2 shows only under development StrictMode, and n5 reaches only a drafter who already sees the prospect.

**New findings**
* **R2-M1 (Major, Must): CI will not run the new browser suite as an isolated copy, so it will fail there.**
  * Cause: `run-suites.sh:369` recognises an isolated suite only when its usage line reads `isolated.sh <name> <port> start [KEY=V…] && (tsx|node) studio/tests/<file> <args>`. The new line (`check_fo5cr_prefill_browser.ts:8`) puts `&& trap '…stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/…` after `start`. I fed the line to the same regex in bash, and it reports no match.
  * Effect: the runner treats it as a plain suite (`run-suites.sh:380-387`) and starts it with no port or database arguments, so it defaults to port 4443 and database `xr_studio_screens_fo5cr`. No copy is running there, so `seedSampleFirms` throws and the suite exits non-zero. CI goes red, and M1's guard never runs where it counts. (It could also hit a builder's live copy on 4443 on the Mac.)
  * Fix: use the form the other browser checks use (for example `check_fo3st1_consult_browser.ts:10`): `//   zsh studio/tools/isolated.sh screens_fo5cr 4443 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo5cr_prefill_browser.ts 4443 xr_studio_screens_fo5cr`. The runner starts and stops the copy itself.
* **R2-n1 (Nit): the notice can come back after it no longer applies.** Browser history keeps `state.warnings` (`retainer-page.tsx:36`). Back to that history entry, or a reload before any save, shows "enter the amount in CAD" again even after a later version set the amount.

Journey score unchanged at 8/10 simulated. Feedback and state would rise to 1 with m2 fixed, but I did not walk it myself.

Reviewer: Changes 59020d8371b814e4c95b10200e856b38e9f4c5fa
Verdict: Changes
