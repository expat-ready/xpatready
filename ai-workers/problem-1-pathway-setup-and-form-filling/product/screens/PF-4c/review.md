# Review: PF-4c part 1, the batch staff invite (PR #2052)

Reviewer: Opus 5.5, effort high, fresh context (I did not build this). Commit reviewed: `30bf02ccbcf3395160f417395761e40314f5208c`, 17 Nov 2026. The PR head is now `f75c3d481`, which adds only `product/qa/built/PF-4c.md` (no code). US$0, live AI off, no model call. :4400 was not used.
Brief: `main:product/design/lead-b-briefs/PF-4c.md` (part 1). Rules (trace tool): AG-1-69 @e9c22468, SA-3-39 @2df8fe48; SA-3-5 as the brief quotes it.

* **Not a screen.** There is no UI, so D1-D20, the BIC table and the browser steps do not apply. In their place:
  * the row's suite, plus mutation runs, on a scratch worktree at the commit;
  * the PF-4, PF-4b, PF-6m, PF-6b, PF-6r and PF-12 suites;
  * throw-away probes on scratch databases;
  * an isolated copy of the real `main.ts` on **:4431** (runtime range), stopped afterwards.
* Journey score (reviewer): **9.5 / 10, pass**. See `journey-test-reviewer-2026-11-17.md`.
* I read the breaker's report (`break-report.md`, 8 Minors) after my own pass. My findings 1 and 2 overlap its 2 and 1.

## Runs at 30bf02ccb (this machine)
* `check_pf4c_batch_invite.ts`: **19 passed, 0 failed**. Run 5 times in all, never flaky.
* `check_pf4_identity.ts`: **119/119**, with part B on the isolated copy :4431.
* `check_pf4b_session_reads.ts`: **55 passed** (with :4431).
* `check_pf6m_money_line.ts` 12/0 · `check_pf6b_permission_rules.ts` 29/0 · `check_pf12_walls.ts` 100/0 · `check_pf6r_roles_read.ts` 17/0.
* **Mutation A:** `for update` removed from `inFirm` (`service.ts:169`). Both DW3 checks FAIL, 3 of 3 runs: `[201,201,7,6]`, i.e. 7 seats used with a limit of 6. The DW3 test bites on the lock.
* **Mutation B:** seats counted over all rows (`service.ts:369`) and `rows` dropped from the 409 (`:370`). The suite still gives 19/19 (finding 2).

## Done when, ticked
| Line | Test (name in `tests/check_pf4c_batch_invite.ts`) | Verdict |
|---|---|---|
| DW1 | "PF-4c DW1 fail: 3 rows with 2 seats left → 409 …" (l.81); "DW1 pass: 3 rows with 3 seats left → 201, 3 invitations, 3 audit lines, 3 emails" (l.88); "no token in the answer" (l.92) | Met |
| DW2 | "DW2 fail: the same email twice (other letter case) → … DUPLICATE_IN_FORM; … ALREADY_STAFF; … ALREADY_INVITED" (l.103); "DW2 pass: … all sent" (l.110) | Met |
| DW3 | "DW3: two batches of 2 at once with 3 seats left" (l.115); "a batch of 2 and a single invite at once" (l.119); mutation A | Met |
| DW4 | "DW4 fail: an Owner row … ROLE_BEYOND_OWN_KEYS … INVALID_EMAIL … INVALID_ROLES … INVALID_NAME" (l.132); "no Owner in a batch, even from an Owner" (l.136); "single invite of an Owner by an Owner … 201" (l.138); "0 rows, 21 rows … 422 ROWS_COUNT" (l.140); 20 rows pass; 403 and 401 | Met |
| DW5 | "forced failure on the third row's insert" (trigger, l.157); "a failed email on one row → that row emailed: false … pending" (l.163) | Met |
| PF-4/PF-4b unchanged | the suites above: 119/119 and 55/0 | Met |

## The reviewer's two checks
* **DW3, read from `inFirm` (`service.ts:166-177`).**
  * It is one `$transaction`. Its first statement is `select id from platform_firm … for update`, at READ COMMITTED, so every later statement sees what the earlier holder committed.
  * `invite`, `resend` and `inviteBatch` all run `rowCheck` / `seatCheck` / `insertInvitation` inside it. Two batches, or a batch and a single invite, therefore run one after the other.
  * Every row error is a JS `HttpException`, not a SQL error, so the transaction stays usable after a row is flagged. A database error is re-thrown by `flagOf` (`batch-invite.ts:18`) and rolls everything back.
  * The partial unique index on open invitations also gives one row per address: on a double submit, probe m left exactly 1 invitation.
* **No flag skipped by letter case or spaces.**
  * `emailOf` (`service.ts:49-57`) refuses rather than trims any whitespace or invisible character, and any text that is not NFKC. Those rows are flagged `INVALID_EMAIL`, never passed through. Seen in the test at l.107 and in probes: tab, U+200B, full-width a, Kelvin sign.
  * Accepted emails are lowercased, so `Dup@Example.COM` gives `DUPLICATE_IN_FORM` and an upper-cased staff email gives `ALREADY_STAFF` (l.103; probe g).
  * The database CHECKs `platform_staff_email_lower` and `platform_invitation_email_lower` (pf3 migration l.356, 358) keep every stored email in lower case with no spaces. The exact-match lookups in `rowCheck` (`service.ts:333-338`) therefore cannot miss a stored spelling.
  * Rows that skip `rowCheck` (`:363`) are already flagged.
  * Held.

## The builder's decisions
* **Seats counted over unflagged rows.** Agreed: the brief says "n = the rows that would be sent". Not pinned by a test (finding 2).
* **409 carries every row's flags.** Agreed: it shows all problems at once (probe f: 409 with the row 3 `INVALID_EMAIL` flag). Not pinned by a test (finding 2).
* **`INVALID_NAME` as a row flag.** Agreed: within the brief's "1-100 characters, header-safe". The name goes into the body text only, never the subject or a header.
* **`emailInvitation` widened by `name = null`.** Agreed: it is needed for the greeting, and the default leaves the single invite and resend unchanged (the PF-4 and PF-4b suites pass).
* **`inviteBatch` in `PlatformIdentity`.** Agreed: `rowCheck`, `seatCheck`, `roleRules` and `insertInvitation` are private. The database-free row reading is in `batch-invite.ts`. The two files import each other, which is safe: every use is at call time.
* **No personal value logged.** On the :4431 copy, `api.log` (22 lines) has 0 hits on the test names or emails. The request lines carry firmId, route and status only. The audit `detail` is `{invitationId, roles, reason:null, batch:true}`.
* **Name never stored.** Test l.93, plus a sweep of every text or jsonb table on the copy for "Zed Quill": 0 rows. `LocalMail` keeps mail in memory only.
* **No token returned.** The 201, 409 and 422 answers have no token (test l.92; probes).
* **US$0.** Fake mail and LocalMail only.
* **Touch list kept**, as foreseen: one route, the `MODULE.md` line, and in `service.ts` `seatCheck`, `rowCheck`, `inviteBatch`, plus the one widened method.

## Findings (no Blocker, no Major)
1. **Minor: a row's database checks stop at the first problem, so its problems can surface one submit at a time.**
   * Where: `service.ts:363` skips `rowCheck` for a row whose email or roles are invalid. `rowCheck` (`:333-338`) throws at the first of: role rules, then already on staff, then already invited.
   * Fail case: `[{email:<a staff member's email>, roles:["CHIEF"]}]` gives only `INVALID_ROLES` (probe c). After the role is fixed, the next submit shows `ALREADY_STAFF`.
   * Breaker 2 is the same issue for the email: a bad email hides `ROLE_BEYOND_OWN_KEYS`.
   * The brief: 422 "with every row's flag, so the screen shows all problems at once".
   * Fix: in the batch, run the staff and invited lookups whenever the email is valid, and `roleRules` whenever the roles are valid and contain no Owner. Collect each result as its own flag. The single invite can keep throwing at the first.
2. **Minor: two of the builder's decisions have no test that fails when they are removed.**
   * Where: `service.ts:369` (seats over `clean` rows) and `:370` (`rows` on the 409). Mutation B still passes 19/19.
   * Fix: add two cases.
     * 2 clean rows, 1 flagged row and 2 seats left → 422 `ROWS_FLAGGED`, not 409.
     * The same rows with 1 seat left → 409 `PLAN_LIMIT_REACHED`, whose `rows` lists the flagged row's code.
3. **Minor: a blank name blocks the whole form.**
   * Where: `batch-invite.ts:26-29`. `""` counts as no name, but `"   "` is flagged `INVALID_NAME` (probe e, row 4).
   * Fail case: a stray space in the optional name field gives "Give the person's name in 1 to 100 characters" and nothing is sent.
   * Breaker 5 is the reverse case: a name with no visible letter (Hangul filler) is accepted.
   * Fix: treat a name with no visible character as absent, as `reasonOf`'s `VISIBLE` does (`service.ts:66`).
4. **Minor (records): the PR body cites only AG-1-69, with no hash.**
   * The brief: "cite each in the PR". SA-3-39 and SA-3-5 apply to part 1.
   * Fix: add AG-1-69@e9c22468, SA-3-39@2df8fe48 and SA-3-5 to the PR body.

Noted, not findings for this PR:
* Breaker 4: `emailOf` accepts addresses that `MailMessage.to` (`z.email()`, `ports/mail.ts:22`) refuses, so such an invitation holds a seat with `emailed:false`. This is inherited from `main`'s single invite. Its own row is for Lead B.
* Breaker 6 (a URL in the greeting) is a Lead B ruling.
* Breakers 7 and 8 (sequential sends; `removeCount` with no subscription, where the words are right) are polish.

## Could not check
* The graph tool (`graph.mjs`): it rewrites `qa/GRAPH.md`, which is outside my two files.
* CI on this head.
* A real MailPort (SES) under load.
* Lead B's confirmations the brief asks for: the route path, the name not stored, and the touch list widened.

Verdict: Approve 30bf02ccbcf3395160f417395761e40314f5208c

## Re-review at 48ffb93eb
Reviewer: Opus 5.5, fresh context, 17 Nov 2026. P-277: only the diff `30bf02ccb..48ffb93eb` under `prototype/studio`: `batch-invite.ts`, `service.ts` and the row's test. The other commits add records only. US$0, no model call, :4400 not used. Scratch worktree at `48ffb93eb`, removed afterwards.

* **The journey score stands at 9.5 / 10** (`journey-test-reviewer-2026-11-17.md`). The diff adds no screen and no step, and it removes the two one-submit-at-a-time frictions that cost the half point's worth of retries.

### Runs at 48ffb93eb
* `check_pf4c_batch_invite.ts`: **24 passed, 0 failed**. This matches the builder's 24/0: 19 old checks plus m1, the two m2 checks, m3 and break 3.
* `check_pf6m_money_line.ts`: **12 passed, 0 failed**.
* Each mutation was applied in the worktree and then reverted. Each new test fails when its fix is undone:
  * **M1, the old loop restored** (skip a row whose email or roles are invalid, `rowCheck` stopping at the first throw): "review m1" FAILs, 23/1. Row 1 shows only `INVALID_ROLES` and row 2 only `INVALID_EMAIL`.
  * **M2, my earlier mutation B** (seats counted over all rows, `rows` dropped from the 409): both "review m2" checks FAIL, 22/2. My finding 2 is now pinned.
  * **M3, `nameOf` back to `v === ""` only**: "review m3" FAILs, 23/1 (`INVALID_NAME` on both rows).
  * **M4, `batchRowsOf(body, true)`**: "break 3" FAILs, 23/1.

### Answers, checked
* **m1, met.**
  * `inviteBatch` (`service.ts:367-369`) runs `roleRules` whenever the roles are valid and hold no Owner. It runs `personCheck` whenever the email is valid and the row is not a duplicate in the form. Each result becomes its own flag.
  * Every refusal is an `HttpException` thrown in JS, so the locked transaction stays usable. `flagOf` still re-throws anything else.
  * `invite` still calls `rowCheck`, which is now `roleRules` then `personCheck`: the same two checks in the same order, so the single invite's answers are unchanged.
  * Skipping `personCheck` on a `DUPLICATE_IN_FORM` row is sound, because the first row with that email already carries the staff or invited flag.
  * An Owner row now also gets `ALREADY_STAFF` / `ALREADY_INVITED`, which it did not get before. This is better.
* **m2, met.** The two tests cover what I asked for:
  * 2 clean rows + 1 flagged row with 2 seats left → 422 `ROWS_FLAGGED`;
  * the same rows with 1 seat left → 409 `PLAN_LIMIT_REACHED` with `removeCount` 1, and `rows` carries row 3's `INVALID_EMAIL`.
  * In both cases nothing is created.
* **m3 and breaker 5, met.**
  * Probed `batchRowsOf` directly, 22 inputs. These are no name: `"   "`, U+3164, U+115F U+1160, U+FFA0, U+3000, NBSP, a lone combining mark, 150 combining marks and 300 spaces.
  * These keep `INVALID_NAME`: `"\n"`, `" \t "`, U+200B, U+FEFF and U+2028. Each holds a control, format or line-break character, which the header-safe rule refuses.
  * `"Á"`, `"é"` and `" Ann "` → `"Ann"` are accepted as before.
  * The test's "no greeting" check is not vacuous. The greeting is the first text of the mail body (`service.ts:326`, `Hello ${name},`), so `^Hello` matches whenever a name is used.
* **breaker 3, met.**
  * An Admin's Owner row now reads "Only an Owner gives the Owner role. Ask an Owner to invite this person." An Owner's Owner row keeps "Invite an Owner on their own: it needs a reason and Confirm it's you." Probed both.
  * The code stays `OWNER_BY_SINGLE_INVITE`, as the brief names it. The words match the single invite's `OWNER_ONLY` rule.
* **The test edit to the DW4 `mixed` row 3** (`row("not-an-email")` → `row("not-an-email", ["READ_ONLY"])`) is needed, not a weakening. Under m1 the default `CASE_OFFICER` role would now also flag `ROLE_BEYOND_OWN_KEYS` for this Admin inviter. The row still asserts exactly `INVALID_EMAIL`.
* **m4** is a PR-body fix. It is outside this diff and I did not check it here.
* **Breakers 4, 6, 7 and 8** go to Lead B, as the builder says. This agrees with my "Noted" list above.

### Nits (not findings; no change asked for this PR)
* A row with Owner plus another role (for example `["OWNER","BILLING_FINANCE"]` from an Admin) skips `roleRules` entirely. Its `ROLE_BEYOND_OWN_KEYS` would therefore surface only after the Owner role is removed. This is an edge of an edge: the Owner flag already tells the person to take that row out.
* U+2800 (braille blank) still counts as a name, so the mail would open with `Hello ⠀,`. A leading filler before a real name is kept (`"ㅤ Bob"`). Both are cosmetic only and cannot add a line or a header.
* The new `VISIBLE` in `batch-invite.ts` is wider than `reasonOf`'s (`service.ts:66`): it also strips marks and Hangul fillers. So "as with reasons" is looser than the code: a reason of fillers only still passes `reasonOf`. That code is from `main` and outside this row.

### Could not check
* CI on this head.
* The PF-4 and PF-4b suites were not re-run (they need the isolated :4431 copy). `rowCheck` keeps the same two calls in the same order, and `roleRules` is unchanged.

Verdict: Approve 48ffb93eb26779fc1da8f6c08ad617abe434ebb8
