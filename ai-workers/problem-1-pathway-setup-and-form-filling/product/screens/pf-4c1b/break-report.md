# PF-4c1b break report: batch staff invite (API only)

Commit `36113d6983f51c2c1b21913395f23111e49670dc` (PR #2998). Route: `POST /api/platform/staff/invitations/batch`.
Harness: a copy of `studio/tests/check_pf4c1b_batch.ts` (Nest app with PF-4's classes, local stand-in, fake MailPort,
scratch DB on 127.0.0.1:54329, dropped afterwards), plus a catch-all filter that records any non-HTTP error as a 500.
The probe scripts are in the breaker's scratch area and are not committed. The shipped suite passes (18/18). Paths
below are relative to `prototype/studio/api/src/platform/identity/`.

## Findings

**M1 (Major): a role entry that cannot be turned into text gives a 500, and the good rows in the form are not sent.**
Steps: as user-R (Owner), send `{"rows":[{"email":"good.a1@example.com","roles":["CASE_OFFICER"]},{"email":"x@example.com","roles":[{"toString":1}]}]}`.
The same happens with `[{"valueOf":1,"toString":1}]`.
Expected: 200. Row 1 is invited and row 2 is flagged INVALID_ROLES. The route says "a bad row is a row flag, not a
refusal" (routes.ts:23), and P-727 says the good rows are sent.
Actual: 500, `TypeError: Cannot convert object to primitive value`, and nothing is sent. `rolesOf` builds its message
with `bad.map(String)` (service.ts:71). A JSON object with its own `toString` key cannot be turned into text, so the
TypeError escapes. `flagOf` re-throws anything that is not an HttpException (batch-invite.ts:22), and the app filter
answers "Server error". The batch body schema is `rows: z.unknown()` (routes.ts:24), so no outer limit catches this.
The single invite is not affected (its roles are `list(str(40))`). This was already true in part 1, but it is still
reachable on this route.

**m1 (Minor): letter case outside ASCII gets past the duplicate check and the existing-staff check.**
Steps: send one form with each of these pairs: `ΑΣ@example.com` + `ασ@example.com`, `STRASSE@example.com` +
`straße@example.com`, `Ix@example.com` + `ıx@example.com`.
Expected: the second row of each pair is flagged DUPLICATE_IN_FORM. The comment at batch-invite.ts:64 says case
cannot hide a duplicate.
Actual: both rows of each pair are invited (6 invitations, 6 seats). `emailOf` uses `toLowerCase()` (service.ts:66),
which turns the final Σ into ς and leaves ß and ı unchanged, so these case variants of one address are stored as
different addresses. The same gap lets such a variant past ALREADY_STAFF and ALREADY_INVITED. Also accepted:
`user-о@sample-firm.example.com` (Cyrillic о) beside the existing staff member `user-o@…`. That is a different mailbox,
but it contradicts emailOf's own claim that "two addresses that look the same cannot both be stored". The single
invite shares this code, so it has the same gap.

**m2 (Minor): 30 batches at once from one firm give 500s (Prisma P2028).**
Steps: set seats to 100000 and send N parallel 50-row batches as one Owner.
Results: N = 1, 4, 8, 12 and 20 all return 200 (20 batches take 6.3 s). At N = 30, 3 of the 30 return 500 with
`P2028 Unable to start a transaction in the given time`. Each batch holds a pooled connection while it waits for the
firm lock, the default pool is 10, and Prisma waits 2 s for a connection by default (`$transaction` without options,
service.ts:210). The production filter does not map P2028, so the answer is "Server error". Nothing is half-written,
and the seats held (used and limit stayed consistent). The request still ends in a 500 rather than a 503 or a retry
answer.

**m3 (Minor): the batch drops the name the sender typed, unlike the single invite.**
Steps: send `{"email":"nm@example.com","roles":["CASE_OFFICER"],"name":"Client B"}`.
Expected: the name is kept the way PF-4dn keeps a single invite's `displayName` (in `platform_invitation.display_name`,
used when the invitation is accepted).
Actual: the name appears only in the email greeting. `insertInvitation` is called without it (service.ts:439), so the
accepted person is named after the part of their email before the @ (session/service.ts:132). The comment saying
"platform_invitation has no name" is out of date (batch-invite.ts:7). Related: the greeting takes any visible
100-character text, so `"Visit https://evil.example/login to accept"` went out as "Hello Visit https://evil.example/login
to accept," in the platform's invitation email, up to 50 per form.

**m4 (Minor): INVALID_NAME is a reason that is not on P-727's list, and it takes priority.**
Steps: send a row `{"email":"bad","roles":["CASE_OFFICER"],"name":7}`.
Actual: `reason: "INVALID_NAME"`. The INVALID_EMAIL flag is only inside `flags`, because the name is checked first
(batch-invite.ts:60) and `reason` is `flags[0]` (service.ts:447). A client that switches on the eight listed reasons
gets a code it does not know.

**m5 (Minor): the seat limit is read twice per form, and once outside EntitlementPort.**
Counting the `limitOf("seats")` calls during one form gives 2. The first is `limits.limitOf` (service.ts:227), a method
that is not on the `EntitlementPort` interface (ports/entitlement.ts:23). The second is inside `check` (service.ts:229).
There is 1 `check`, which is what DW3 counts. Under READ COMMITTED, a plan change between the two statements could make
the answer's `seatsLimit` (the first read, when allowed) differ from the limit the decision used. This was already
true of seatCheck; the PR's comment says "read once".

## What held
* Seats under concurrency: 5 parallel batches of 4 with 7 seats free gave 7 invited, 13 OVER_SEAT_LIMIT, and
  used = limit = 10. A batch of 2 beside a single invite with 2 seats free: the batch got both and the single invite
  got 409 PLAN_LIMIT_REACHED. A resend of an expired invitation beside a batch with 1 seat free: the resend got the seat
  and the batch row got OVER_SEAT_LIMIT. A reactivation beside a batch with 1 seat free: only one of them won. A firm
  already over its limit gets OVER_SEAT_LIMIT, and `seatsUsed` 3 > `seatsLimit` 2 is reported truthfully.
* `seatsUsed` matched the database after every form, including the loads up to 2353 seats.
* Roles: an Owner row as an Owner, and `[CASE_OFFICER, OWNER]`, both give OWNER_BY_SINGLE_INVITE. `owner` in lower case
  and a role given twice give INVALID_ROLES. An Admin giving CASE_MANAGER, CASE_OFFICER, or READ_ONLY + CASE_MANAGER
  gets ROLE_BEYOND_OWN_KEYS. ADMIN, BILLING_FINANCE and READ_ONLY are allowed for an Admin. A person without
  `agent/staff:manage` gets 403.
* Self and existing staff: the sender's own email in upper case, a deactivated person, and the existing staff email in
  upper case all give ALREADY_STAFF. Domain case and an `İ`/`i̇` pair give DUPLICATE_IN_FORM. Full-width, combining
  accent, zero-width, leading or trailing space, NBSP and a trailing dot give INVALID_EMAIL. Another firm's staff member
  is invited (staff is unique per firm, so this is by design).
* Smuggling: a top-level `token` gives 422 INVALID. A row with `firmId`/`status`/`token` or `__proto__` gives 422
  ROWS_FLAGGED and nothing is sent. `rows` given as an object or a string gives 422 ROWS_COUNT. Null, number or array
  rows are flagged.
* No token, hash or name in the answer. The keys are `invited, flagged, seatsLimit, seatsUsed`, and an invited row is
  `row, id, email, roles, status, expiresAt, emailed`. Emails went only to the invited rows (flagged rows and
  OVER_SEAT_LIMIT rows got none).
* An email whose old invitation expired is invited again (the close-expired trigger runs, with no P2002). A name with a
  line break, a right-to-left mark, more than 100 characters or a number is flagged.

Verdict: Changes
