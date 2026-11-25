# PF-28 A3 (R1.10, front-office sales and retainers): independent review, round 1

PR #3531, head **36a0f9441b25bc8cfdbf85a0237bb697ba02d4dc** (branch `claude/runtime-pf28-a3-fo-sales`, base main 4cd0091f4). Reviewer: Opus 5.5, 24 Nov. I did not build it and changed no code. Live AI off; cost US$0. Scope: `git diff origin/main...36a0f9441` (13 files, +182 −37). The hand-over (#3487 comment 7130450458) was read through the REST API.

**Verdict: Ship.** No Blocker, no Major; 3 Minors (below), none needing a fix before merge. This is an API-only change with no screen changed, so D1–D20 and the BIC-01–20 table are **N/A** (as for parts 2a–5). The journey score is for the API journeys (j_10 and the suites), not a screen walk: `journey-test-reviewer-2026-11-24-part-a3.md`, **8/10, pass**.

## Checks run (isolated copies on :4436–:4439 only; never :4400; each copy stopped after)
- **j_10 on this head** (`rva3` :4436; the name must be lower case, so `rva3`, not `rvA3`; PLATFORM_IDENTITY=local, PLATFORM_SYSTEM_IDENTITY=local): **15/19**.
  - **PASS W2 front-office sales: 291 probes, 0 not as ruled.**
  - **PASS W2 retainers: 72 probes, 0 not as ruled.**
  - Also PASS: W2 platform (419), W2 money (140), every route probed (303), W4 nothing stored and no 500, W6, W7, W8.
  - Still red, as expected (A2 and A5): W2 booking (20 of 200), W3 over-long, W3 schema (9 public booking and web-address doors), W5 case side.
  - The W3 list holds **no** sales, conflict, identity, signature or retainer item. Only booking and the 14 platform items remain, and the PR's Question already gives those to A2.
  - qa's last main score (`CAPABILITIES.md` R1.10) had sales at 5 of 272 off and retainers at 12 of 72 off.
- **`check_pf28_a3_fo_fields.ts`** by its usage line, on `runtime_pf28a3` :4437 (db `xr_studio_runtime_pf28a3`): **6/6, exit 0**.
- **It bites:** I ran the same test file against origin/main's code (a worktree of 4cd0091f4 on :4438). Result: **3/6, exit 1**.
  - W fails: `documentNumber` was named as `requestId`; `signerPersonIds` "Invalid input".
  - L fails: `disclosureText` was named as `requestId`, and confirm answered 404.
  - The empty signature request failed: `prospectId` "This must be text.", `signerPersonIds` "Invalid input".
  - P and N pass on main by design: they guard against tightening, so they cannot fail there.
- **`check_fo2_leads_prospects.ts`**: **119/119, exit 0**, including the 3 new A3 lines. The two "fail" lines would fail on main, by reading the code:
  - On main, `website: {pf28:1}` passes `z.unknown()` and gets the thank-you, so there is no 422.
  - On main, a 5001-character message passes `s(20_000)`, and `givenNames` answers first.
  - The "pass" line holds on both by design.
- **`check_pf28_inputs.ts`** (the sweep, :4439): **51/51**.
- **Static checks:** typecheck exit 0 (15 known, 0 new). `count-any --against origin/main`: 416 = 416. `graph.mjs --check` exit 0. Module cards: `tree` PASS (15 cards; MODULE.md is 40 lines); `pr` with BASE=origin/main PASS.
- **35 break probes of my own** (reviewer script, scratchpad only), described below.

## 1. Correctness: does each new parse rule mirror its service rule? (nothing tightened)
- **`textUpTo`** (`sales/common.ts:186`) counts `[...v.normalize("NFC").trim()].length`, exactly as `text()` does (`common.ts:194-195`). Its words are `text()`'s field words ("at most N characters.").
  - The limits match each service call: lead note 5000 (`leads.ts:141`); close note 2000 (`:206`); reopen reason 2000 (`:218`); lost note 2000 (`prospects.ts:305`); undo reason 2000 (`:345`); call notes 5000 (`calls.ts:84`); lead and prospect note text 5000 (`calls.ts:114`); web-form message 5000 (`public.ts:123`).
  - My probes: 5000 characters with spaces around them pass. `e`+U+0301 ×5000 (10,000 code points, 5000 after NFC) passes. U+0958 ×2600 (5200 after NFC) is refused, as `text()` refuses it. 5000 × U+1D400 passes.
  - null, "" and undefined are unchanged: `.nullish()` where the old `s()` had it. Reopen stays a required string, and `{reason:null}` answers "This must be text." exactly as on main.
- **Conflict disclosure** (`conflict/routes.ts:37`) counts `[...t.trim()].length`, as `outcome()` does (`service.ts:141,145`), with no NFC on either side. The words are the shared `DISCLOSURE_RULE`. 10,000 × U+1D400 passes.
- **Identity `documentNumber`** (`identity/routes.ts:24`): any present value is refused with `FULL_NUMBER_REFUSED`, the same sentence `parse()` uses (`identity/service.ts:108`). JSON and multipart `""` are refused on main too.
- **Retainers** (`retainers/service.ts:132-154`): every `rule` accepts exactly what its service function accepts.
  - `KIND` takes null, `RETAINER` and `CONSULTATION`, matching `body.kind ?? "RETAINER"`.
  - `ID_OR_NONE` takes null, "" and a uuid, matching `uuidOf`. `representativeStaffId:""` still reaches the service's "Choose the representative.".
  - `FEES` takes a list of at most 50, matching `feesOf`. `fees:null` is refused, as it was by the service.
  - `VERSION` takes a whole number of 1 or more, as `expectedVersionOf` does for JSON (1e21 passes, 1.5 and "1" are refused). `VERSION_TEXT` also takes the multipart digits.
  - `STATUS` matches `expectedStatusOf`.
  - `signedVersion` takes null, "", a number of 1 or more, or digits, as `signedVersionOf` does; the upper limit (the current version) still needs the record.
  - `TemplateVersionBody` takes "", matching the service's skip at `:318`.
  - The service still reads `body`, not the parse output (`:290,437,556,609,657,687`), so no value is transformed.
- **Signature requests** (`any-document/routes.ts:281-292`): only the words change. Missing now answers "This is required."; on main it was "This must be text." for `prospectId` and "Invalid input" for `signerPersonIds`. "abc", 401 characters and "" are each named in plain words. A valid shape reaches the 404.

## 2. Order
Each field sent alone is named on its own field before another field's required rule or a look-up. The A3 test checks this with random ids (17 W probes and 14 L probes). My probes also show combined bodies naming both fields: close `{note: 2001 characters}` names `reasonId` and `note`; identity `{documentNumber:""}` names `requestId` and `documentNumber`; draft `{kind:"", templateId:"x"}` names both. `idParam` still runs before the body (`sales/routes.ts` argument order), so a malformed id stays the one not-found.

## 3. The trap field `website`: the trap still holds
- The honeypot check is unchanged (`public.ts:135`). Any text, null or "" passes the parse, and the thank-you still comes only after every other field check, with nothing stored. Both real callers send a text input's value (`web-form-page.tsx:52`, `form-embed.js:168`).
- A non-text value now gets "This must be text.", the same answer `givenNames: 123` gets.
- Over 1000 characters it gets the same outer-bound words as the name, email and phone fields.
- So the answer never sets the trap apart from an ordinary field. I agree with the PR's recommendation to keep it.

## 4. Rules
- No combination key, form number or program branch: these are front-office doors, not engine code.
- No TypeScript `any` was added. The `any` in `strict({ reason: any })` is the existing zod value `z.unknown().optional()`.
- The module card's frozen `Tests.`, `Tables.` and `Entry points.` lines are untouched. The new tests are in `MODULE.rows/R1-10.md`. One invariant sentence was added (MODULE.md:10).

## Issues (all Minor, Should or optional)
- **m1 (Should, optional):** `textUpTo` and `disclosure` drop the schema's outer length bound.
  - Raw length is now limited only by the body parser (256 KB; 32 KB for the web form). Before, it was limited by `s(20_000)`/`s(40_000)`.
  - Probe: confirm `{result:"POTENTIAL_CONFLICT", disclosureText: 50,000 spaces + "d"}` answered 422 on main and now passes the parse (404 on a random id; stored trimmed as "d").
  - This loosens the old bound, it does not tighten anything, and nothing harmful is stored.
  - Fix: `z.string().max(40_000).refine(...)`. zod 4 runs both checks, so the 20,000-character probe still meets the refine and gets the service's words. The reason given in the comment at `common.ts:183-185` applies to a bound *alone*, not to a bound plus the refine.
- **m2 (optional):** some fields stay `any` at the parse although their rule needs no record: Withdraw's and Signed offline's `reason` (`str`), and the template `name`/`active` (`retainers/service.ts:142-154`).
  - Sent alone, each is still named first, because the service runs `str` and `nameOf120` before the look-up, so A3's Done when holds.
  - Combined with a parse-level error, they are named one round later. Probe: withdraw `{reason: 5, expectedStatus: "x"}` names only `expectedStatus`.
  - The comment at `:125-127` ("a field whose own rule needs no record is also read here") claims more than the code does. Fix: narrow the comment, or add `str`-shaped rules.
- **m3 (no action needed):** confirm `{result:"NO_CONFLICT", disclosureText: 10,001 characters}` now answers the length rule. The service would first have said "A disclosure belongs to a POTENTIAL_CONFLICT result.". It is the same field and the words are true; the more useful sentence appears once the text is shortened.

## Could not check
- A person's unaided walk (D17, D20): N/A, no screen.
- The PR's 22-suite `run-suites.sh --only` set beyond the four suites above.
- CI on GitHub: I did not watch it.

**Verdict: Approve** — commit 36a0f9441b25bc8cfdbf85a0237bb697ba02d4dc. No open Blocker or Major.

Reviewer: Approve 36a0f9441b25bc8cfdbf85a0237bb697ba02d4dc
