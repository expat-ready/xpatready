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


# Round 2 (diff only): the CodeQL #148 fix

Head **2c7df159581e5ac483681731089063e113f4299d** (same branch). Reviewer: Opus 5.5, 24 Nov. I did not write it and changed no code. Scope: `git diff a68a942c2..2c7df1595`, 5 files:
- `web-address/service.ts`: a 4000-unit bound and `trimEdges`;
- one new line in `check_pf28_a2_fields.ts`;
- two comments in `find/routes.ts` (round 1's m4);
- round 1's two records files, added as written.

Live AI off; cost US$0. Ports: only :4436 for the copy; the PF-25 check starts its own server on a free port (`listen(0)`). Never :4400.

## Checks run
- **`check_pf28_a2_fields.ts`** by its usage line, `rvr2` on :4436 (db `xr_studio_rvr2`, stopped after): **7/7, exit 0**.
  - The new line: slowest reason 0.3 ms; the line's own stand-in for the old pattern took 159 ms on one input.
- **`check_pf25_web_address.ts`** (tsx, its usage line): **72/72, exit 0**.
  - This includes the reason lines: break m9 (padded, direction control, over 500), Devin on #1763 (emoji counted as code points), and the database refusing a padded or direction-changing reason.
- **`typecheck.mjs`**: exit 0 (15 known, 0 new).
- **CodeQL on this head**: `Analyze (javascript-typescript)` was still in progress when I read the check runs. The alert API answers 403 to this session, so I could not see whether #148 has closed (see "Could not check").

## (1) Is `trimEdges` exactly the old replace?
**Yes.**
- **The class.** I tested every UTF-16 unit from 0 to FFFF against the class. It holds 30 units, none of them a surrogate: 9-D, 20, A0, 1680, 180E, 2000-200D, 2028, 2029, 202F, 205F, 2060, 3000, FEFF. So one unit is one class character, and testing `s[a]` one unit at a time matches the old regex, which had no `u` flag and also read units.
- **`EDGE_CHAR` has no `g` flag**, so `.test` keeps no `lastIndex` state between calls.
- **The old regex's behaviour:**
  - With `/g` and no `m`, the old pattern removes the longest run at the start, and then the longest run that ends the string.
  - A string made only of spaces becomes "". At the end position nothing matches, because `C+` needs at least one character.
  - `trimEdges` does the same from each end, and its `b > a` stops the two runs from overlapping.
- **Fuzzing (scratch script):** 3,457,437 inputs, **0 differences** between old and new:
  - every string up to 6 characters over 12 sample characters (spaces, no-break, zero-width, FEFF, 3000, a letter, both surrogate halves, 85, 180E, newline);
  - 200,000 random strings up to 60 units, half from the class and half any unit.
- **The database rule** (`20261114230000_pf25_web_address/migration.sql:79-82`, `platform_web_address_reason_ok`) is unchanged and uses the same class.
  - I ran it on the local PostgreSQL (port 54329, read-only query, function body inlined). Its class matches exactly the same 30 code points from 1 to FFFD.
  - Its `length` counts code points, as `[...reason]` does.
  - It checks the reason the service has already trimmed, so its own trim changes nothing. Service and database agree.

## (2) Does the 4000-unit bound refuse a reason the old code kept?
**Only one kind: a reason padded with more than about 3000 edge spaces.** That does not matter in practice.
- A kept reason is at most 500 code points, which is at most 1000 units. So the bound can only refuse input that has more than 3000 units of edge spaces around a valid reason.
- Measured:
  - "Sample reason" followed by 4000 spaces (4013 units): the old code kept "Sample reason"; the new code refuses it.
  - 500 emoji (1000 units) with 1500 + 1500 spaces is accepted; with 1501 + 1500 it is refused.
- It does not matter because no client sends such a reason:
  - The change is a system-console call: `reason` comes from the body, and no web screen posts it.
  - The guard upstream (`system-identity/guard.ts:36-39`) lets this input through, because it trims before counting. The service then refuses it with a 422 on the reason field, in its existing words ("Keep the reason to 500 characters."). That is true of the text as sent, and nothing is written.
- The same order explains two smaller changes in the message (n3). Both inputs are refused before and after:
  - an input over 4000 units that also holds a control character gets the length message instead of "Remove the control…";
  - one that trims to fewer than 3 characters (10k tabs and "a") gets the length message instead of "at least 3".

## (3) Is any polynomial regex left on readReason's path?
**No.**
- `readReason` checks, in order: the type, `input.length` (no regex), then `BAD_CHARS.test`. `BAD_CHARS` is one class with no quantifier, so it is linear.
- `trimEdges` tests one character at a time against a single class, at most once per unit, so it is linear.
- `[...reason]` is linear too.
- Upstream on the HTTP path, the guard's `lineText` uses one class with `/gu`, then the built-in `.trim()`, and `reasonOf` uses `/[\p{L}\p{N}]/u`. All three are linear, and none is in the diff.
- Measured worst cases at the bound (4000 units), new code: 0.57 ms, 0.16 ms and 0.21 ms.

## (4) Would the new line fail on the old code?
**Yes, through its first case. The margin is about 2 to 3 times (n1).**
- I ran a68a942c2's `readReason`, copied verbatim into a scratch script, on the line's five inputs. Times are on this machine:

| Input | Old code | New code |
|---|---|---|
| a + 10k tabs + a | **110.6 ms** | 0.14 ms |
| 10k tabs + a | 0.1 ms | 0.01 ms |
| a + 10k tabs | 3.3 ms | 0.01 ms |
| a + 3990 tabs + a | 21.7 ms | 0.24 ms |
| space + 3000 tabs + x | 0.0 ms | 0.17 ms |

- So `ms.every(x => x < 50)` fails on the old code, and only because of the first case.
- The growth is quadratic: a + 100k tabs + a took 10,949 ms on the old code and 0.03 ms on the new.
- Both versions give the same answers on these inputs. The two meaning checks (10k tabs refused; "Sample reason" kept with its tabs and spaces trimmed) hold on both, so only the timing tells them apart.

## Issues (all optional; no Blocker, no Major)
- **n1 (optional): the line catches a regression only on a machine like this one.**
  - The old code took 110 ms against the 50 ms bound; the line's own stand-in took 159 ms.
  - On a CI runner about twice as fast, a return of the old regex could pass.
  - Fix: about 20k tabs in the first case. The old code would then take about 440 ms (quadratic), and the new code still refuses at the bound in under 0.1 ms.
- **n2 (optional): the "old pattern" the line prints is not the old pattern.**
  - The line times `OLD = /^[\s\u00a0]+|[\s\u00a0]+$/g`, a shorter class, on `a…!`, while the comment says "the old edge-space pattern is timed too".
  - It is only information, not asserted. Fix: say "a stand-in for", or copy the old class.
- **n3 (no action):** over-bound input now gets the length message before the control-character or too-short message. Both are refused before and after, and the length message is true of the raw input.
- **Outside this diff (for the lead's CodeQL list, not this PR):** `api/src/case-notes/service.ts:44` trims a note with the same shape, `v.replace(/^[\s]+|[\s]+$/g, "")`, before any length check. I did not check whether its body is bounded upstream.

## Round 1's minor m4
Done: `find/routes.ts:3` and `:14` now say 422 (QUERY_LENGTH). The check's Q line confirms it: 422 naming q.

## Journey score
**8/10, pass**, carried forward from round 1 (`journey-test-reviewer-2026-11-24-part-a2.md`).
- The diff changes no screen and no journey. The only behaviour it changes is a refusal for a crafted reason over 4000 units.
- J7 (the system address change) is re-covered by the PF-25 check, 72/72.
- As the brief limits me to this file, I wrote no new journey report.

## Could not check
- Whether CodeQL alert #148 closed on this head. JS analysis was in progress, and the code-scanning API answers 403 here.
- The full CI on 2c7df1595.

**Verdict: Approve** — commit 2c7df159581e5ac483681731089063e113f4299d. No open Blocker or Major.

Reviewer: Approve 2c7df159581e5ac483681731089063e113f4299d
# Round 3 (diff only): check_forms_qa53 after merge-queue batch #3564

Head **ba5a294d6926eef1fa4acc4d686beac63476797f** (branch `claude/runtime-pf28-a2-booking`). Reviewer: Opus 5.5, 25 Nov. I did not write it and changed no code. Round 2 (Approve, 2c7df1595) is on `claude/runtime-pf28-a2-review-records`; this branch's copy holds round 1 only, so this section follows it.
- Scope: `git show ba5a294d6`, 3 files: the booking page's controller and the web-address doors' (decorators moved), and `tests/check_forms_qa53.ts` (the open-mark regex, 9 reads on REVIEWED, 3 writes on PUBLIC_WRITES).
- b7da25098 is a pure merge of main (parents 2c7df1595, e0be451c4). It does not touch the two controllers; it brings main's copy of the check (#3460, the signing door's writes).
- Live AI off; cost US$0. Ports: run-suites.sh at each usage line's port +14000, and one copy of mine on :4436. Never :4400.

## (1) Does the decorator move change anything? No.
- **Reflect metadata.** I loaded both files on this head and on 2c7df1595 (a scratch worktree, removed after), then dumped every metadata key on every controller in them: `BookingPublicController`, `WebAddressController`, `SystemWebAddressController`. For each class I took the class keys, each method's keys, and each method's `__routeArguments__` on the class. The two dumps are **identical (505 lines, `diff` empty)**. They cover:
  - path and method for all 13 routes;
  - `studio:read-scope` "open" on exactly the 9 GETs;
  - `__httpCode__` 200 on reschedule, cancel and the system change;
  - `__responsePassthrough__` on ics;
  - every argument's index, type and `data` (firmKey, slug, token, id);
  - `self:paramtypes`;
  - the system change's access, firm-data and reason keys.
- **Reasons.** OpenRead keeps only "open" at run time (`core.ts:86`), so I compared the reason text in the source. The (reason, path) pairs are identical in both files: 9 and 4 pairs, the same order and the same text.
- **Body and behaviour.** Each file's whitespace-split token multiset is identical between b7da25098 and ba5a294d6. Only the order of decorators and lines changed. Nothing in a method body moved, and one trailing comment moved to the end of its line.
- Order: `@OpenRead` and `@Get` set different keys on the same method, so applying them in the other order cannot change either.

## (2) Does the new regex weaken the check? No. It reads more marks, never fewer.
- It is linear. The two choices, a quoted string or any character other than `)` and `"`, can never start on the same character, so no input backtracks. 100k-character lines took 1.5 ms.
- **The planted fail lines pass on this head:**
  - "QA-53 fail (B120)": the unmarked planted GET is found.
  - "QA-65 fail (B120)": the planted write that names nobody is caught.
  - "C6.16 fail": `/api/link/bare` stays unmarked, and `/api/link/sneaky` is read as open but is not on OWN_GUARD.
  - "C6.16 fail": the sneaky write is caught.
  - "PF-4t pass/fail": `/api/platformx/…`.
- **Planted lines run through the file's own regex** (taken from the source) and the old one:
  - an unmarked GET: null under both;
  - `@OpenRead("planted (QA-1)") @Get(…)`: open under the new regex, null under the old;
  - an identifier reason: open under both;
  - a mark that is not right before `@Get`: null under both;
  - round 2's form, `@Get(…) @OpenRead(…)`: null under both;
  - `@CaseRead()`: case under both;
  - a controller-level mark: open under both.
  - The only difference is a reason with parentheses, now read as open. That route must then also be on REVIEWED, so a planted open mark that is not on the list still fails "exactly the reviewed list".
- **It bites.** I put the old regex back in a scratch worktree of ba5a294d6 and ran the check by its usage line on :4436 (`rvr3m`, stopped after): **46/48, exit 1**.
  - "exactly the reviewed list" fails.
  - "every configuration read (101) refuses nobody…" fails: booking-site, book, slots, bookings/:token and ics answer 404, not 401. The head's count is 96.

## (3) Are the 9 reads and 3 writes open by design, with accurate reasons? Yes.
- **Booking (FO-3, FO-3pa; contracts §0.6).** Each of the 6 reads and 3 writes starts with its own per-IP limit (`service.ts:266,284,293,316,347,359,372,382,392`), and the booking form also has a per-firm limit (`:325`). Each answers the one `notFound()` (`:88`) for an unknown firm, slug, inactive type, held firm or bad link.
  - `check_fo3_booking.ts` asserts this, for example "FO-3 http fail: unknown firm, unknown slug, inactive type and a bad link → 404 with the identical body", and the token, cancel and hold lines.
  - The comment's "asked in check_fo3_booking.ts, check_fo3pa_public_answers.ts" is true.
- **QA-756 `site`, and the sign-up lookups `availability` and `suggestion`.** These are public by design. On a firm's address the lookups answer the plain not-found; `site` answers it everywhere else (`routes.ts:70,78,86-89`).
  - They have **no rate limit**. That is PF-25 review m4, already known and still the PF-25 PR's Question 3, and it is not this diff. The new comment does not claim a limit for them.
- These are the same 9 routes that carried OpenRead at round 2. The PR adds no open door; it only makes them visible to this scan.

## (4) Suites (run-suites.sh --only, each by its own usage line): all pass, exit 0
`check_forms_qa53.ts` **48/48** (found 266 = declared 266; FO-2 public writes exactly PUBLIC_WRITES), `check_fo3_booking.ts` **133/133**, `check_fo3pa_public_answers.ts` **45/45**, `check_pf25w_routes.ts` **11/11**, `check_pf1_module_routes.ts` **28/28**.

## Issues (all optional; no Blocker, no Major)
- **o1 (Should, optional): the controller-level test still swallows a pair alone on its line.**
  - The test is `/^@OpenRead\(.*\)$/` (`check_forms_qa53.ts:42`). It still reads `@OpenRead("…") @Get("…")` on a line by itself, with the method on the next line, as a controller mark, and that GET disappears from the scan.
  - It fails loudly ("none left unseen", the count of 266), so nothing is weakened. But the PR works around it by layout, and the next builder who writes the usual Nest layout will hit the same red batch.
  - Fix: `/^@OpenRead\((?:"[^"]*"|[^)"])*\)$/`. I tested it: true for `@OpenRead("a (b)")`, `@OpenRead(SIGN_UP)` and `@OpenRead("planted")`; false for `@OpenRead("x") @Get("hidden")`.
- **o2 (optional):** the 9 entries share one block comment instead of one reason each, and PUBLIC_WRITES' "per-address limits" means per IP, which reads ambiguously next to "web address". Both are accurate.

## Journey score
**8/10, pass**, carried forward from round 1 (`journey-test-reviewer-2026-11-24-part-a2.md`).
- The metadata is identical, so no route, answer or journey changed. Only the check's reading of the code changed.
- The booking journeys are re-covered by fo3_booking and fo3pa (178 lines).
- The brief limits me to this file, so I wrote no new journey report.

## Could not check
- **CI on ba5a294d6:** `ci` success, CodeQL success, parts 1-12 success. But **`walk j_10` is red** (16/19), on routes outside this diff:
  - W2 and W3: `/api/public/sign/:token/*`, main's signing door, which came in with the merge;
  - W3: `/api/system/switches/:key`;
  - W5: case-side runtime ids answering 400.
  - j_10 was red on 2c7df1595 too. None of the routes it names is in ba5a294d6.
- The merge queue's full run on this head.

**Verdict: Approve** — commit ba5a294d6926eef1fa4acc4d686beac63476797f. No open Blocker or Major.

Reviewer: Approve ba5a294d6926eef1fa4acc4d686beac63476797f
## Round 4 (merge resolution)
Diff-only review of head 20e47581b10facac5b8e6b8a19cd12bcb5516526, a merge of origin/main 63f5cc913 into the last approved head ba5a294d6 (round 3). The tech lead asked for this check. I did not write the merge.

1. **`PUBLIC_WRITES` is exactly the union.** ba5a294d6 has 12 entries and origin/main has 10. Their union has 13 entries, and HEAD has the same 13. I checked this with node, reading each side's array from `git show`. The order is what the check compares against: `[...h].sort()` equals `h`. `/api/public/sign-fake/:doc/:signer/:nonce` comes before `/api/public/sign/:token/code` because `-` (0x2D) sorts before `/` (0x2F). No entry is lost. Both trailing comments are kept: the PR's PF-28 A2 comment first, then main's. `git diff ba5a294d6 HEAD` on the file shows only main's two changes: the FO-6 4c `REVIEWED` row and its unknown-nonce 404 probe. `git diff origin/main HEAD` on the file shows only the PR's three changes: the `@OpenRead` regex, the nine open-read rows, and the three booking writes.
2. **The merge changes no other PR file.** `git diff origin/main HEAD --stat` lists the same 23 files, with the same line counts, as the PR's diff from merge base e0be451c4 to ba5a294d6. With `check_forms_qa53.ts` left out, the two patches are byte-identical (`diff` of the two `git diff` outputs is empty).
3. **Suites pass on this head.** I ran `run-suites.sh --only` with prefix runtime and ports +14000, never :4400. All four pass: `check_forms_qa53.ts` 49/0, `check_fo3_booking.ts` 133/0, `check_pf28_a2_fields.ts` 7/7 and `check_pf21rs_r0.ts` 24/0, including both R0-3 (requests) lines.
   - The PR does not touch what `check_pf21rs_r0.ts` R0-3 (requests) tests. No PR file is under `platform/register/` or `erasure/`.
   - The PR's one shared file on that path is `http/input.ts`, which `register/requests/service.ts` imports. That change only adds a new export, `plainIssue`. `fieldsOf`, which the register uses, is unchanged.
   - The shard-11 failure on ba5a294d6 has a cause outside this PR. Main's d22607db2 (25 Nov, 01:07 UTC: "check_pf21rs_r0 sends a request's day as Toronto's today on the app clock, never the UTC date") is not in ba5a294d6's history but is in HEAD's. Before that commit, the test sent the UTC date, which the route refuses as the future between 00:00 and 05:00 UTC. The merge brings the fix in.

Journey score: still **8/10** from round 1 (`journey-test-reviewer-2026-11-24-part-a2.md`). The merge changes no behaviour of this PR, since its own patch is byte-identical, so I did not walk the journeys again. No new findings.

**Verdict: Approve** — commit 20e47581b10facac5b8e6b8a19cd12bcb5516526. No open Blocker or Major.
