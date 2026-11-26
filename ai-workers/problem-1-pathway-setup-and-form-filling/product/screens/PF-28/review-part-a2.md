# PF-28 A2 (R1.10, booking and the platform's last fields): independent review, round 1

PR #3544, head **a68a942c27bfd94d401cfc1020ab9b496315d0b7** (branch `claude/runtime-pf28-a2-booking`, merge base with main a040b46d5). Reviewer: Opus 5.5, 24 Nov. I did not build it and changed no code. Live AI off; cost US$0. Scope: `git diff origin/main...a68a942c2` (19 files; the first commit holds only the A3 reviewer's records). I read the hand-over (#3487 comment 7130450458) through the REST API.

**Verdict: Ship.** No Blocker and no Major. 5 Minors (below); none needs a fix before merge. This is an API-only change with no screen changed, so D1–D20 and the BIC-01–20 table are **N/A**, as for parts 2a–5 and A3. The journey score covers the API journeys: `journey-test-reviewer-2026-11-24-part-a2.md`, **8/10, pass**.

## Checks run (copies on :4436–:4438 only; never :4400; each stopped after; at most 2 of mine at once)
- **j_10 on this head** (`rva2`, :4436, PLATFORM_IDENTITY=local, PLATFORM_SYSTEM_IDENTITY=local): **15/19**.
  - **PASS W2 booking**: 206 probes, 0 not as ruled.
  - **PASS W2 platform**: 420 probes, 0 not as ruled.
  - **PASS W3 schema**: 0 inputs reach no schema. The SES notice door is printed as a NOTE.
  - **FAIL W3 (over-long)**: 22 items. **All 22 are A3's** (#3531): conflict-checks `disclosureText` (×2, one a 404), identity-checks `documentNumber`, retainer-templates `kind`, retainers (×10), the web form's `message` and `website`, leads `note`, close `note`, reopen `reason` (404), prospects lost `note`, and lead and prospect call `notes`. **No booking or platform item remains.** A3's reviewer saw, on A3's head, only booking and the platform items left; together, the two heads cover the whole list.
  - Also red: W2 front-office sales (5 probes) and W2 retainers (12), both A3's; W5 is A5's. Passing: W2 money, every route probed (303), W3 run-time schemas (19 ≤ 19), W4 (nothing stored, no 500), W6, W7, W8, and no page error.
- **`check_pf28_a2_fields.ts`** by its usage line on :4437 (db `xr_studio_rva2f`): **6/6, exit 0**.
- **It bites:** I ran the same file against main's code (a worktree of a040b46d5, `rva2m`, :4438): **3/6**.
  - W/L fails: booking types answer "Invalid input: expected array, received undefined".
  - L fails: the keep-period answer names only `years`.
  - Q fails: 400 with no `fields`.
  - P and N pass on main by design (they guard against tightening).
- **Decorator move, Reflect metadata compared with main.** I dumped every metadata key on both controllers' classes and methods, on main and on the head, and diffed them. They are **identical**: paths, methods, `__routeArguments__` (index and type), `studio:read-scope` "open" on the same 9 routes, `__httpCode__` 200 on reschedule, cancel and the system change, `platform:system-access {kind:"keys", keys:["system/firm:address"]}`, `platform:system-firm-data {changes-firm}`, and `platform:system-reason` (a schema with keys address and reason).
  - The one difference: `self:paramtypes` lists its two entries in the other order (the `@` form applies them right to left). Each entry still maps the same index to the same token (0 → WebAddresses, 1 → Db).
  - `check_pf25w_routes.ts` **11/11**; `check_pf4s_system_signin.ts` **104/104**.
- **Touched suites (in-process, all 0 failed):** fo3a_booking_types 48, fo3pa_public_answers 45, fo3_booking 133, fo3a1c_set_names 20, fo3a_hours_timings 47, pf25_web_address 72, aud5_keep_periods 57, pf18a_offices 87, pf18b_support 41, pf17_support 34, pf5_signup_billing 107, pf5v_signup_mail 13, fo5f2_template_safety 72, fd1_find 61.
  - On isolated copies: r192_firm_profile **58/58** (:4436) and pf28_system_reason **5/5** (:4437).
- **Static checks:** `typecheck.mjs` exit 0 (15 known, 0 new). `count-any --against` the merge base: 416 = 416. `graph.mjs --check` exit 0. Module cards: `tree` PASS; `pr` (BASE=origin/main, the PR's body) PASS. No engine code is touched, so there is no combination key, form number or program branch.

## 1. `plainIssue`: do a schema's own words still win?
Yes. In zod 4.4.3 a schema's own `error` comes before the per-parse map, and an issue that already has a message is never re-mapped. I tested 26 forms on head (scratch script), each with and without `{ error: plainIssue }`. These all keep their own words: `z.string({error})` (wrong type and missing), `z.string({message})`, `.refine(fn,"m")`, `.refine(fn,{message})`, `.refine(fn,{error})`, `z.enum([...],"m")`, `z.enum([...],{error})`, `.max(n,"m")`, `.check(z.maxLength(n,"m"))`, `superRefine` with addIssue message, `z.uuid("m")`, `z.literal(...,{error})`, a `.pipe(...min(2,"m"))`, `z.email("m")` and `.int("m")`.
- An error function that returns undefined falls through to the plain words, as it should.
- Only zod's own words change, for example "Invalid input: expected boolean, received string" → "This must be a boolean.", and "Too big…" → "This is too long: at most N characters.".
- **Answers that used to be in the door's own words:** none changed, because the callers (`availability.ts:68`, `timings.ts:142`, `types.ts:111`, `profile/service.ts:148,155`) keep their own messages for unknown keys and for words set on the field.
- Profile's `plain()` used to turn a wrong-type "Invalid…" into "This value is not allowed."; it now reads "This must be text.". That is plain words either way, and r192 passes.

## 2. New rules at the parse: accept what the service accepted?
- **Support reply** (`system-console/support.ts:49`): the same transform (`\r\n?` → `\n`), the same count (code points), the same limit (`BODY_MAX`) and the same words as `support.ts:70`. Exact.
- **Sign-up and sign-up-link email** (`signup.ts:78`): `emailOf` refuses `v.length > 254` without trimming (`identity/service.ts:65`). Exact; only the words change, now naming the limit.
- **planCode** 40: the only plans are solo, team and firm (migration pf3 :453), and the link and invite bodies were already at 40. It tightens only values that were already refused.
- **keep-period** (`service.ts:136-137`): the count and words are `reasonOf`'s (`:65`). It runs only when the years are also bad, so a body that was already refused now names both fields.
- **office version 40**: compared to `updatedAt.toISOString()` (24 characters), so anything over 40 was already a 409.
- **web-address address**: `checkAddressChoice` is the same function the service calls (`service.ts:148`). Main and head agree on 8 inputs (case, `sample-`, short, null, a number, reserved, 64 characters, a good one).
  - The fields are unchanged, but the problem's title and code are now parseInput's ("Check the details", INVALID) instead of the service's. No web client calls this route.
- **Template body** and **sign-up `website`**: these tighten values that were **not** refused before. See m1–m3.

## 3. find 400 → 422
No client depends on the 400. The find box never sends a wrong-length q (`find-box.tsx:65` stops it in the browser), and it treats every non-401/428 refusal alike (`:72`). `check_fd1_find.ts` is the only test that asserted 400, and it is updated (61/61). `j_102` and `check_pf30s` do not test the status.

## 4. j_10's SES excuse (`j_10.ts:391,420`)
It is tight. It names exactly one route string and excuses only that route's "unparsed" entry. The excuse holds only while the allow-list key `POST /api/public/messages/ses-notices missing` stands (`pf28-allow-list.json:21`, unchanged by this PR). The route is printed in a NOTE and is not counted as passed. Every other W2/W3 probe on that door still runs.
- The door does what the allow-list line says: it verifies the signature (`bounces.ts:97`), then runs `parseInput(SnsNotice, n)` (`:98`). That parse is guarded by `check_pf19b2_ses.ts:247`: a signed envelope breaking the schema → 422 naming Timestamp, and the same body unsigned → 400.
- Gaming would need another edit to j_10 or a new allow-list key, and both would show in a diff. Nit: the gate checks only that the key exists, not its "signature first" text (m5).

## Issues (all Minor)
- **m1 (Should, record it in the PR):** the template **preview** is tightened.
  - `PreviewBody.body` max went from 20,000 to 10,000 (`templates.ts:31`). Preview never applied `refusals()`, so a 10,500-character draft previewed on main and now gets 422 (parse probe: main `ok`, head `Too big`).
  - In the editor (`templates-page.tsx:94`), the preview pane now shows "No preview" with "body: This is too long…" while the person types past the limit.
  - This is consistent with publish and arguably clearer, but the PR's "Before and after: nothing visible" is not quite true. Fix: say it in the PR, or accept it as is.
- **m2 (optional):** the publish refusal at 10,001 or more characters loses its count. It was "The message is 10500 characters; at most 10000."; it is now "This is too long: at most 10000 characters." (the parse runs first).
  - The field and the limit are still named, so j_46's W3 still holds (it needs the limit in the note).
  - Fix if wanted: a `.refine` at `LIMITS.body` with the service's words.
- **m3 (no action):** a sign-up `website` over 1000 characters now gets 422 instead of the trap's quiet "check-email". Only bots fill that field, and 1000 matches A3's ruling for the web form.
- **m4 (Should):** comments still say 400 at `platform/find/routes.ts:3` and `:14`.
- **m5 (optional):** the keep-period over-long rule copies `reasonOf`'s count and words (`service.ts:136-137` vs `:65`), so the two could drift. The j_10 excuse checks that the key exists, not its text.

## Could not check
- A person's unaided walk (D17, D20): N/A, no screen.
- The PR's 33-suite `run-suites.sh --only` set beyond the 18 suites above.
- CI on GitHub (mergeable_state "unstable" when read).
- W2 sales and retainers with A3 merged: not run together; #3531 is not on this branch.

**Verdict: Approve** — commit a68a942c27bfd94d401cfc1020ab9b496315d0b7. No open Blocker or Major.

Reviewer: Approve a68a942c27bfd94d401cfc1020ab9b496315d0b7
