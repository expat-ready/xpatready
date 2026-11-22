# PF-28 part 5 (retainers): independent review (PR #2933, head 9e04ee71c4f9aafa0a3b90ddcec2f22ee3d0326d)

Reviewer: Opus 5.5, 22 Nov. Scope: `git diff origin/main...9e04ee71c` (5 files, +66 −46): `retainers/service.ts`, the MODULE.rows fragment, `check_pf28_inputs.ts`, `pf28-allow-list.json`, `check_fo5_retainers.ts`. I changed no code. Live AI was off; cost US$0. This is an API row with no new screen, so D1–D20 and the BIC table are N/A (as in parts 2a–2c). The retainer screens that call these doors were walked; see `journey-test-reviewer-2026-11-22-part-5.md`. Judged against BACKLOG PF-28 (`BACKLOG.md:980`), `design/lead-b-briefs/PF-28.md`, `api/src/platform/http/input.ts` (unchanged), and the pattern of #2794, #2883 and #2908.

## Checks run (isolated copy `rev_pf28p5` on :4492; never :4400, 4487, 4446 or 4472; stopped afterwards)
- **Sweep:** `check_pf28_inputs.ts 4492 xr_studio_rev_pf28p5` gives **45/45**. Both part-5 cases pass. No probe answered 500, and the PF/FO row counts are unchanged.
- **Break probes, by API, 40 calls** (a reviewer script, not committed):
  - **Unknown field gives 422 with the field named** on all 8 doors. On template upload this includes an extra multipart field (`filename`); on Signed offline, an extra multipart `note`.
  - **Bodies that are not objects:** `__proto__` gives 422 named; a list body gives 422 `body`.
  - **Bounds hold:** a 200 KB fee label gives 422 `fees[0].label` "At most 120 characters."; 51 fee rows give 422; 5,000-deep nesting gives 422, never 500.
  - **Malformed ids:** a bad retainer, template or prospect id with a bad body gives 404 first.
  - **"Nothing to change" names `body`** on edit and on the template switch.
- **Order of checks, verified on the copy:**
  - **Permission comes first.** user-O lacks `retainer:void` and `configure-template`, and gets 403 before the body is read, even with a malformed id. No token gives 401.
  - **No firm leak:** firm B editing firm A's retainer with a bad body gets the same 422 as for a random id. With a valid body it gets 404 (`check_fo5_retainers` firm-wall line, with `ed()` adding expectedVersion and expectedStatus, `:326`).
  - **Stale versions:** edit with a stale version and a bad templateId gives 422; with a valid body, 409 CHANGED. Signed offline with a stale version gives 422 `file` with no file and 409 CHANGED with one, so B-24 still holds.
- **Callers:**
  - The web sends only allowed keys: `retainer-card.tsx:25` `{templateId, representativeStaffId}`; `retainer-page.tsx:46` edit; `:50` send `{expectedVersion}`; `:55` link `{version}`; `templates-page.tsx:54` multipart `name`+`file`; `:58` `{active}`.
  - Every body that tests and journeys send to these doors uses only allowed keys (grep). Signed offline in `check_csk1s_clients_browser.ts:154` sends `reason`, `expectedVersion` and `file`.
  - No other code in `api/src` calls the service.
- **Would each case fail with its fix removed? Yes:**
  - With no `parseInput`, `templteId` and the random-id send would answer 404.
  - The malformed prospect id answered 422 "prospectId is not an id." on main.
  - The template `active:"yes"` call would answer 404.
  - The 23 removed probe lines would fail `(b)`.
- **Other parts untouched.** The diff edits no file another part owns. It meets #2908 (part 4) only at `check_pf28_inputs.ts:108` and in the allow-list; whichever merges second re-bases.

## Answers to the questions asked
- **Is a strict shape of `z.unknown()` keys enough?** Yes, under the row's rule ("`z.strictObject` at the top… services that already parse inside keep doing so") and #2908's precedent.
  - Every key's value is bounded before it is used: `nameOf120`/`str` (120, 200), `uuidOf` (regex), `feesOf` (≤50 rows, label 120, amount ≤11 digits, enum, date regex), `expectedVersionOf`/`signedVersionOf` (≤9 digits), `expectedStatusOf` (enum), `active` (boolean), `kind` (enum).
  - JSON bodies are capped at 256 KB.
  - The gap is inside a fee row: see m2.
- **Prepare retainer: is 422 before NO_LICENSED 409 acceptable?** Yes. The 422 depends only on the request and says nothing about the firm. The screen's body is always valid, so a person on a firm with no licensed consultant still sees the 409 words. The malformed-id 404 now also comes before the 409, which is the rule.
- **Signed offline: is 422 (no file) before 409 (stale) acceptable?** Yes. Nothing is filed either way, the stale check still comes before any write, and no screen calls this door yet. `signedVersion` stays after the look-up, because its range needs the current version.
- **Are the two exceptions honest?** Yes. On the copy, `{}` produced a real draft (the defaults: active template, the caller as representative, the prospect's person) and a real download link (the current version). With the sweep's random id, 404 is the true answer. This matches the precedent of the accepted `resend missing` exception. Exceptions go from 9 to 11 under a raised, pinned ceiling while the list falls by 31 lines; the tech lead still has to accept them ("awaiting the tech lead").

## Findings
### Blocker
None.
### Major
None.
### Minor (Should)
- **m1. `service.ts:82`: the download-link `version` refusal uses zod's words.**
  - Scenario: `POST /retainers/:id/download-link {"version": true}` answers 422 `fields: {"version": "Invalid input"}` (seen on the copy). That is not plain words (STANDARDS §6; part 6 cut zod's own words the same way).
  - The web always sends a number, so only API callers see this.
  - Fix: give the union its own message (for example "A version number."), or take `z.unknown()` and refuse anything that is not an integer or digits in the door's own words.
- **m2. `service.ts:129-132`: fee rows are not strict.**
  - Scenario: `fees: [{label, amountMinor, when, junk: "x"}]` gives 201 with `junk` silently dropped (seen on the copy). An API caller who misspells `amountMinor` (as `amount`, say) gets a fee row with no amount and no error until Send is blocked.
  - The rule requires strictness only at the top, so this is not a breach of the row. But AG-18-57 says "every input", and every other unknown key on these doors is now named.
  - Fix: in `feesOf`, refuse any key other than label, amountMinor, when and dueOn, as `fees[i].<key>: "This field is not allowed here."`.
### Note (not this PR's code)
- **n1. `input.ts:40`: a non-object body reads "This must be a object."** This is the shared rule's grammar, and is now reachable on all 8 retainer doors (seen: a PATCH of a template with `[]`). It belongs to the owner of the rule, not this part.

## Not checked
- I did not run the browser suites, because they rewrite checked-in screenshots. My own headless walk covered the changed calls (12/12).
- I did not re-run j_30, j_72, or the 22 suites the builder ran.
- I did not run `graph.mjs`, because it rewrites the tracked `GRAPH.md`. The doors are named by `check_pf28_inputs` and `check_fo5_retainers`.
- No screen reader was used. D17 and D20 stay with the founder.

**Journey score:** 9/10, pass (see the journey report).

**Verdict: Approve** (no open Blocker or Major). m1 and m2 are Should items: fix them here or in a follow-up, at the builder's choice.

Reviewer: Approve 9e04ee71c4f9aafa0a3b90ddcec2f22ee3d0326d

## Round 2 (head 7663cec51a6de80854acef7c06fb7e1956b505f8; diff only)
Read: `git diff 9e04ee71c..7663cec51 -- '*retainers/service.ts' '*check_pf28_inputs.ts'` (+10 −1). The other two files in that range are my round-1 records. I checked the two fixes by calling `FileLinkBody` through `parseInput`, and `feesOf` directly, from a throwaway script (deleted). I did not start a copy and did not re-run the builder's suites.
- **m1 closed (`service.ts:82`).** The `version` refusals for `true`, `1.5`, `null` and `{}` all read "A version number.". `"1"` and `2` still pass, and a 13-character string keeps the length words.
- **m2 closed (`service.ts:129-136`).**
  - Unknown keys are refused and named: `junk` gives 422 `fees[0].junk` "This field is not allowed here.". On a second row, `amount` gives `fees[1].amount`.
  - A 100-character key is named cut to 40. A `__proto__` key inside a row is refused and named `fees[0].__proto__`; the field name is the prefixed text, so nothing is polluted. A list as a row gives `fees[0].0`.
  - A string or null row still gives the label's own words. A good row with `dueOn` still passes.
  - The only callers are the three `feesOf` calls in the service. The web sends the four keys (`retainer-page.tsx:79`), and every test or journey fee row sent to these doors uses only label, amountMinor, when and dueOn (grep). The other `fees: [{line, amount…}]` objects in tests are case-side readiness data, not this door.
- **The new case (`check_pf28_inputs.ts:246-249`) would fail with either fix removed.** Without the fee check, the random prospect answers 404, not 422. Without the message, the answer is "Invalid input".
- **No new finding.** n1 (`input.ts:40`, "a object") stays with the owner of the shared rule.

**Journey score:** 9/10 stands. The m1 fix improves the plain words of one API answer, but n1 keeps that criterion at ½.

**Verdict: Approve** (no open Blocker or Major; m1 and m2 closed).

Reviewer: Approve 7663cec51a6de80854acef7c06fb7e1956b505f8
