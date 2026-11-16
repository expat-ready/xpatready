# FO-3pa break report (public booking answers)

Breaker, 15 Nov. Target: branch `claude/loving-mendel-8uv0hs` at b1899c3a7, plus the two uncommitted files (the three type flags in `front-office-booking.prisma`, migration `20261115110000_fo3pa_booking_type_flags`). Scope: the brief's five items and DW1-DW8, focus DW1, DW2, DW5, DW6. Method: a copy of `tests/check_fo3pa_public_answers.ts` (scratch DB `xr_studio_brk3pa_<pid>` on 127.0.0.1:54329, Nest on port 0, never :4400). One change from that harness: it runs on the **real** `AuditEventAdapter` (`api/src/platform/audit/audit-event.ts`, the one `runtime-ports.ts` wires), not `fakeAudit`. Baseline: the row's own suite, run unchanged against my copy, gives 31 passed, 0 failed. All scratch databases are dropped (`pg_database` has no `xr_studio_brk3pa_%` left). No paid calls.

## Findings

### B1 (Blocker): a cancel reason of 201 to 500 characters gives a 500, and the booking is not cancelled
* **Repro:** book on `free`, then `POST /api/public/bookings/<token>/cancel` with `{"reason":"<201 × a>"}`. The same happens with 500 × `a`, and with 250 emoji (500 UTF-16 units).
* **Expected:** 200 CANCELLED, with the reason in the audit entry. The brief says "up to 500 characters", and `CancelBody` accepts up to 500 (`service.ts:126`).
* **Actual:** `500 {"statusCode":500,"message":"Internal server error"}`. The transaction rolls back, so the booking stays SCHEDULED and no audit line is written. 200 characters works.
* **Cause:** `cancelBooking` puts the reason into `detail` (`service.ts:484`). `AuditEntry.parse` then rejects it, because `ports/audit.ts:16` (`DetailScalar = z.string().max(200)`) caps each detail string at 200. The ZodError is thrown inside the transaction, and nothing turns it into a 4xx.
* **Why the suite misses it:** DW7 only sends 37 characters (pass) and 501 characters (400). Nothing between 201 and 500 is tried.
* **Effect:** on a public page, a booker who writes two sentences cannot cancel.

### B2 (Blocker, same root): a reason containing an email address gives a 500, and the booking is not cancelled
* **Repro:** `{"reason":"Please email me at ana@client.example instead"}`.
* **Expected:** 200, or a 400 that says what is wrong.
* **Actual:** 500, and the booking stays SCHEDULED.
* **Cause:** the `EMAILISH` refine on `AuditDetail` (`ports/audit.ts:15-22`). Its contract says "Ids and facts only, never personal data (no names, emails, phone numbers … addresses)". A free-text reason from the booker is personal data by its nature, so storing it in `audit_event.detail` conflicts with the port's own rule. That decision belongs to the row owner (challenge it, or give the reason its own column, as the concept §6 line 54 says: "a cancel reason (body and column)"). It is not the breaker's to settle.

### M1 (Major): a lone UTF-16 surrogate in the reason gives a 500
* **Repro:** send the JSON text `{"reason":"x\ud800y"}`.
* **Expected:** 400 (`CancelBody` checks control characters but not unpaired surrogates).
* **Actual:** 500, booking unchanged. PostgreSQL refuses the jsonb (`select '{"a":"x\ud800y"}'::jsonb` → `invalid input syntax for type json`).
* **Note:** with `fakeAudit` this would pass, so the row's harness cannot see it.

### M2 (Major): the .ics route sends its error answers as a calendar file
* **Repro:** `GET /api/public/bookings/x/ics`, or a voided or moved link's `/ics`, or the 5th call within the limit (429).
* **Expected:** the one not-found, served like every other door (`application/json`, no attachment), so the browser shows "This link is no longer valid".
* **Actual:** the body is the right one-not-found JSON (identical bytes), but the headers are `content-type: text/calendar; charset=utf-8; method=REQUEST` and `content-disposition: attachment; filename="invite.ics"`. These come from `public.controller.ts:58`, because Nest's `Header()` is applied before the handler runs, so it covers errors too. A booker who opens an old email's "Add to calendar" link downloads an `invite.ics` holding JSON, and their calendar app shows an import error instead of the not-found text. The same headers come back on 429 and on any 500.
* **What is not affected:** every /ics not-found looks the same, so this does not reveal which link is valid.

### m1 (Minor): the reason length is counted in UTF-16 units, not characters
* 500 emoji (500 characters) is refused with "expected string to have <=500 characters" (`service.ts:126`, zod `.max` counts `.length`). Non-Latin text from outside the Basic Multilingual Plane gets half the limit. B1 hides this today, because anything over 200 units already fails.

### m2 (Minor): bidi and invisible characters are accepted in the reason
* `"abc‮dcba"`, `"​​"` (a reason made only of zero-width spaces, which survives `trim()`) and `U+2028` are all accepted and stored. The names on the same door refuse these (`Name`, `service.ts` around line 103). A booker can make the staff audit trail render text reversed or blank. The reason is shown only to staff, hence Minor.

### m3 (Minor): the firm's public contact details are passed out without cleaning
* `firmContact` (`service.ts:777-782`) keeps only strings and cuts them at 200, which holds against injection. It does not strip control or bidi characters.
* A business address of `{"city":"Toronto\r\nX-Injected: 1","phone":"‮1234"}` comes back as-is in the list, type page, book and manage answers.
* The JSON is escaped, and the values are typed by staff. It matters only for the page FO-3w draws (RLO in a phone number).

### m4 (Minor): parts of the cancel body are silently ignored
* `{"__proto__":{"reason":"x"}}` passes `strictObject` and cancels with no reason. A `text/plain` or form-encoded body `reason=hi` cancels with the reason dropped (`parse(CancelBody, body ?? {})`, `service.ts:297`).
* `consent:false` with any wording id, or a wording id with no `consent`, books with no consent and says nothing. That matches the rule (no tick → no consent), but a bad id goes unnoticed.
* The consent cases are noted for FO-3w's form. No data is harmed.

## What held
* **DW1/DW2 one not-found:**
  * The list for an unknown firm, a PAYMENT_HOLD firm, a capitalised key, an 81-character key and `fo3pa-a%2F` all return bytes identical to an unknown slug's 404, with identical headers.
  * The hidden and retired types' `/slots` pages and their booking form return the same.
  * Median timings over 60 calls: unknown firm 1.77 ms, held 1.79 ms, unknown slug 2.65 ms, hidden slug 2.49 ms. There is no usable gap between existing and hidden. A badly formed key (0.94 ms) only shows its form was refused.
  * The list carries no id. An active firm with no shown types gets 200 `types: []` with its contact details, which is what the concept BR-1 / §12 asks for ("No bookings are available online … Email <firm>").
* **DW4 address:**
  * A `__proto__` key, non-string values, an array or a plain string as `businessAddress`, a 100,000-character city, a whitespace phone and `constructor`/`toString` keys give no pollution, no 500 and no extra keys.
  * The owner's private keys (`owner_note`) never appear in any answer.
* **DW5 switches:**
  * `allowCancel:false` gives 409 NOT_ALLOWED_BY_LINK with the booking unchanged.
  * Flipping the switch between the manage read and the cancel is obeyed. Flipping it at the same moment as the cancel gives one outcome or the other, never a partial write.
  * `allowReschedule:false` refuses both the move and `/slots`.
  * A type hidden after booking keeps its manage, ics and cancel links working.
  * The manage answer shows `canReschedule:false`, `canCancel:true` correctly.
* **Races:**
  * Three cancels at once give 200, 404, 404, with exactly one audit line and one `module_event`.
  * A cancel and a reschedule at once give 200 and 404, and the booking ends CANCELLED.
* **DW6 .ics:**
  * Semicolons, commas and backslashes in the type name are escaped.
  * A firm name containing `"` and CRLF + `ORGANIZER:` is stripped inside `CN=`, so the file has exactly one ORGANIZER and one ATTENDEE and no bare LF.
  * The database refuses CRLF in a type name or meeting link (`fo_consultation_type_name_check`, `_link_check`).
  * HEAD works. Voided, garbage and moved tokens all give the one not-found body.
* **DW7:** the reason (probe `SECRETREASON-zz`) never appears in the answer, the `module_event` payload, the mails or the jobs. A 2 MB body gets 413. Arrays, JSON strings, null, numbers, `reason:null`/`5` and unknown keys get 400 with the booking unchanged. A garbage token with a bad body gets 400 before 404, which reveals nothing.
* **DW3 consent:** `"true"`, `null` and `1` get 400. A tick with an upper-case wording id is matched and stored in the firm's case. A tick with a wrong id gets 409.
* **Limits:** the list shares the per-IP `slots` bucket (an unknown firm counts too), and `/ics` shares the `token` bucket. Both answer 429 at the limit, and an `X-Forwarded-For` header does not get around it.
* **DW8:** the join link never appears on the type page. It is null for phone bookings and on cancel answers.

Scratch scripts (not in the repo): `/tmp/claude-0/-home-user-xpatready/ecde81be-ee04-586f-8771-3d1179f355e1/scratchpad/breaker/break.mts`, `/tmp/claude-0/-home-user-xpatready/ecde81be-ee04-586f-8771-3d1179f355e1/scratchpad/breaker/lim.mts`.
