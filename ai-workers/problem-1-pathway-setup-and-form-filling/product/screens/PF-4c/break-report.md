# Break report: PF-4c part 1, the batch staff invite (PR #2052)

Target: `POST /api/platform/staff/invitations/batch`, branch `claude/runtime-batch-invite`, commit `30bf02ccb`. API only, no screen, so the screen attacks (keyboard, 1024 px, 200 % zoom, reload) do not apply.
Harness: a scratch database on 127.0.0.1:54329 (every migration plus the Sample firms) and a Nest app built from the PR's own pattern (`tests/check_pf4c_batch_invite.ts`), with `LocalMail` wrapped so every send is recorded. No port 4400, no server, US$0. The temporary test files were deleted and the scratch databases dropped. The PR's own suite on this machine: **19 passed, 0 failed** (with `BIN` pointed at `/usr/local/bin`).
Result: **0 Blocker, 0 Major, 8 Minor.** The seat limit, the firm lock, the flag checks, all-or-nothing and "the name is never stored" all held.

## Findings

**1. Minor: a flagged row hides the seat problem; the seat line is missing from 422.**
Request: seats left 1, `rows: [{email:"f1@example.com",roles:["CASE_OFFICER"]},{email:"bad",roles:["CASE_OFFICER"]}]`.
Happened: 422 `ROWS_FLAGGED`, with no `seatsLimit`, `afterInvites` or `removeCount`. Once the typo is fixed, the same form gets 409 `PLAN_LIMIT_REACHED` ("5 of 4 seats"). That makes two round trips, and the screen cannot show "7 of 10 seats after these invites" next to the flags.
Should: the 422 carries the seat line, counting every row that is not refused for good (AG-1-69: "check seats for the whole form"; brief: "the screen shows all problems at once").
`api/src/platform/identity/service.ts:366-372` (the seat check counts only `clean` rows; the 422 has no seat fields).

**2. Minor: a row with a bad email or bad roles skips the role rules, so problems surface one at a time.**
Request: an Admin sends `{email:"not-an-email", roles:["CASE_MANAGER"]}`.
Happened: only `INVALID_EMAIL`. `ROLE_BEYOND_OWN_KEYS` appears only after the email is fixed, because `roleRules` never runs when `r.email` is null.
Should: `roleRules` runs whenever the roles are valid, whatever the email (brief step 1: "`roleRules` run per row").
`service.ts:363`.

**3. Minor: the Owner flag's words are wrong for a non-Owner inviter.**
Request: an Admin sends `{email:"a1@example.com", roles:["OWNER"]}`.
Happened: `OWNER_BY_SINGLE_INVITE`, "Invite an Owner on their own: it needs a reason and Confirm it's you." An Admin can never invite an Owner (the single invite answers 403 `OWNER_ONLY`), so these words send them down a path that fails.
Should: for a non-Owner, the row says only an Owner can invite an Owner (or the flag also lists `OWNER_ONLY`).
`batch-invite.ts:34, :50`; `service.ts:363` (`roleRules` is skipped for Owner rows).

**4. Minor: addresses `emailOf` accepts but MailPort refuses get an invitation and hold a seat, with `emailed:false` and no reason given.**
Request: `rows: [{email:"josé@example.com",…},{email:"a!b@example.com",…},{email:"x@example.c",…}]`; also the Cyrillic lookalike `lоok@example.com`.
Happened: 201, three PENDING invitations each holding a seat for 72 hours, all `emailed:false`. `MailMessage.to` is `z.email()` (ASCII only, a top-level domain of 2 or more letters), so the send can never succeed, and resend fails the same way.
Should: a row whose address the mail port can never accept is flagged `INVALID_EMAIL` before anything is created (brief: "a bad email ... becomes that row's flag").
This is inherited from `main`'s `emailOf` (`service.ts:49-56`), whose rule differs from the mail port's rule (`ports/mail.ts:22`); the single invite behaves the same.

**5. Minor: a name with no visible letters is accepted.**
Request: `name: "ㅤ"` (Hangul filler) or `name: "́́́"` (only combining marks).
Happened: 201, and the greeting reads "Hello ㅤ," or "Hello ́́́,".
Should: a name with no visible character is treated as no name, as `reasonOf`'s VISIBLE check does for reasons (`service.ts:66`).
`batch-invite.ts:25-31`.

**6. Minor: the greeting carries free text, including links, into a firm-branded email.**
Request: `name: "Click https://evil.example/login to confirm your account. Thanks"`.
Happened: 201. The email starts "Hello Click https://evil.example/login to confirm your account. Thanks," and sits above the real invitation link. Only an inviter holding `agent/staff:manage` can do this, so it is insider risk, but this text reaches any address.
Should: Lead B decides whether a name may contain a URL, `@` or `/`. Line breaks and headers are already blocked, which held.
`service.ts:325-326`.

**7. Minor: emails go out one after another with no time limit, and a client retry after a timeout reads as failure.**
Request: 20 rows against a slow or hung MailPort.
Happened, from reading the code: the invitations commit, then `emailInvitation` runs 20 times in sequence, each with its own firm read and no timeout. If the caller gives up and resends the same form, every row comes back `ALREADY_INVITED` (422), although all 20 invitations exist.
Should: sends that do not block the answer (or a bounded wait). Failing that, the screen's reload path needs a note (an `invitations` read).
`service.ts:382` (the send pattern is inherited from PF-4b).

**8. Minor: `removeCount` is misleading when there is no live subscription.**
Request: the subscription set to ENDED, one row.
Happened: 409, with the correct words ("no live subscription") but `removeCount: 4`, `seatsLimit: 0`. A screen that builds its sentence from the number would say "Remove 4 people".
Should: with no subscription, `removeCount` is null (or the screen is told to use `detail`).
`service.ts:187`; `batch-invite.ts:58`.

## What held (attempted, refused correctly)

- **Seat limit under races.** Three batches of 2 sent at once with 3 seats left gave `[409, 201, 409]`, and used seats stayed below the limit. A batch against a reactivate (2 seats left): the reactivate got 200 and the batch 409, and the limit was never passed. A batch against a single invite: one got through (the PR's own DW3). The firm row lock serialises every caller (`inFirm`, `service.ts:166-176`).
- **The same email three ways at once** (two batches and one single invite, one of them in upper case): exactly one open invitation. The others got `ALREADY_INVITED` on their row, or 409.
- **Re-inviting an expired, unrevoked email**: 201, with no clash on the unique index (the `platform_invitation_close_expired` trigger closes the old one).
- **Flag bypass.** These rows were flagged `DUPLICATE_IN_FORM`: `Look@example.com`, `look@EXAMPLE.com`, `LOOK@…`, and `İnfo@` after `i̇nfo@`. These were flagged `INVALID_EMAIL`: a trailing space, a tab, a zero-width space, a full-width `ｌ`, and a trailing dot. An existing staff member's email in upper case was flagged `ALREADY_STAFF`. The database CHECK keeps every stored email in lower case. Cyrillic lookalikes are separate mailboxes and correctly not counted as duplicates (see finding 4 for why they still fail).
- **Roles.** `["CASE_OFFICER","OWNER"]` was flagged `OWNER_BY_SINGLE_INVITE`. `["OWNER","OWNER"]`, `["owner"]`, `[]`, `"OWNER"` and `[null]` were flagged `INVALID_ROLES`. An Admin giving `CASE_MANAGER` got `ROLE_BEYOND_OWN_KEYS`. A Case Officer got 403 `MISSING_PERMISSION`. A token from before a demotion got 401 `SIGNED_IN_ELSEWHERE`.
- **Name.** These were flagged `INVALID_NAME`: CRLF with `Bcc:`, U+0085, U+2028, 101 characters, only spaces, U+202E, a lone surrogate, and the non-strings `123`, `{}`, `["a"]` and `true`. 100 emoji were accepted (counted in code points). The name appears only in the email's body text, never in the subject or a header. A search of every table for every test name found none, and no log line held a name.
- **Body shapes.** Rows of `null`, `1`, `"x"`, `[]` and `{}` were each flagged on their own row. A `__proto__` key carrying roles was ignored (`INVALID_ROLES`). A `constructor.prototype` key polluted nothing. A body that is an array got 422 `ROWS_COUNT`, and `null` got 400. 20 rows, each with 10 000 roles and a 20 000-character name, answered 422 in 56 ms. 20 emails of 240 KB each answered 422 in 51 ms. The 20-row maximum took 136 ms.
- **Cross-firm.** Firm B's batch used only firm B's seats. Firm A may invite an address that firm B has also invited, or that is on firm B's staff, which is allowed by design (the unique key is firm plus email). Each audit line carries its own firm.
- **All-or-nothing and after-commit email.** These are the PR's own DW5 cases, and both passed.
- **Audit and token.** Each invitation got one `platform.invitation.created` line, holding `{invitationId, roles, reason:null, batch:true, firmId, firmKey}` and no email or name. That is the single invite's detail plus `batch`. No answer (201, 409 or 422) contains a token or a `#t=` link.
