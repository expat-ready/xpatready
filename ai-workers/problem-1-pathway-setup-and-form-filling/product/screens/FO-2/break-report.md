# FO-2 part 1 break report (PR #1813: the public web-form door, the leads API, permissions)

Breaker run 15 Nov 2026, from 08:50 UTC. Isolated copy `brk_fo2` on :4434 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), front-office seed, a consent wording published through `ConsentStore.publishWording` (temporary script under `tests/`, deleted), both firms' `fo_web_form` turned on with `allowed_sites` `{https://maple.example}` / `{https://solo.example}`, one `fo_service` per firm. The copy was stopped at the end. No code was changed.
**Commit note:** the run started on b4db3a009. The builder pushed 8498a4977 and b9424b88b to the same branch during the run (route-scoped 32 KB parser). After the copy's `restart`, it ran **b9424b88b**. Each finding says which commit it was seen on. Scope: API only (BACKLOG FO-2 row, part 1). Add by hand, Close and Reopen are part 2 and are not findings.

## Findings

**M1 (Major): a restart or deploy silently drops every enquiry typed on a page that was already open. Seen on b9424b88b; the code is the same on b4db3a009.**
- Did: drew the form (`GET /api/public/forms/:token`), restarted the copy (`isolated.sh … restart`), then posted a valid enquiry with that `submissionId` and `loadStamp` from an allowed Origin, more than 2 s later.
- Expected: the header says "a restart asks open pages to reload", so the visitor should be asked to reload (for example the 400 "Please reload the page"), or the stamp key should survive a restart.
- Actual: `201 {"thankYouText":"Thank you. We have your enquiry…"}`. Counts before and after were the same (lead, person, receipt, event, audit: 8/8/8/12/12), and there was no `fo_person` for restart@example.org. The real person is thanked and the enquiry is lost.
- Same thing for a page open longer than 24 h (`stampHours`).
- Cause: `public.ts` (b4db3a009 lines 140 and 179; b9424b88b line 59). The key is `randomBytes(32)` unless `FO_FORM_STAMP_KEY` is set, and nothing sets it (grep of the studio: only `public.ts`). A stamp that does not verify gets the bot answer.
- Should have happened: a stamp signed with an old key, or an expired one, but well-formed, is answered with "reload". Or the key is persisted or configured, so only a forged or too-fast stamp is treated as a bot.

**M2 (Major): an Assign that races a Take silently overwrites the taker, and lets an assigner change a lead they cannot see. Seen on b9424b88b; `leads.ts` is the same on b4db3a009.**
- Setup: `platform.everyone_sees_all=false` for sample-firm. user-T (Case manager: assign, not an admin) and user-O (Case officer).
- Did: 40 rounds. Each round set lead L-00004 to unassigned, then fired O `POST /leads/:id/take` and T `POST /leads/:id/assign {"staffId":T}` at the same moment (a thread barrier).
- Result: in 13 of 40 rounds both answered 200 and T ended as owner. O was told "you took it", then lost it with no 409. T was not allowed to see O's lead (everyone-sees-all off), yet T changed it. In the other 27 rounds the take got 409 and the assign 200 (correct).
- Cause: `leads.ts` `change()`. Visibility (`this.visible`, b4db3a009 line 110) is checked before the transaction against the unlocked row. Inside the lock, `assign` only refuses `owner === to` (line 100). It never re-checks visibility against the locked `owner_staff_id`, and never sees that an active owner appeared since the read.
- Should have happened: inside the lock, re-check that the viewer still sees the lead as it is now. A lead that gained an owner since it was read should get 409 "<owner> already has this lead" (or a stale-read 409), never a silent overwrite.

**m1 (Minor): a bot can tell it was caught. Seen on both commits.**
- Did: posted invalid fields (`givenNames:""`, or `email:"nope"`) with no wait. Answer: `201` and the thank-you text.
- Then posted the same body after 2.1 s. Answer: `422 "First name: this is required."`
- Expected (AG-2-49 rule 7): a bot is answered exactly as a real sender of the same body would be. A real sender of that body gets 422, so the 201 shows that the fast or honeypot path was taken. A bot can probe its own timing and honeypot detection this way.
- Cause: `public.ts` b4db3a009 line 179. The bot check runs before field validation.
- Should have happened: validate first, then give the bot answer.

**m2 (Minor): at b4db3a009, a body over 32 KB got the file-upload message. Fixed at 8498a4977/b9424b88b.**
- Did: posted a 40 KB JSON body (message of 40,000 "a").
- Actual at b4db3a009: `413 "This file is too large for this upload."`, with no `code: TOO_LARGE`. The global `ProblemErrors` filter rewrites every 413 (`main.ts:189-201`), so the form's own words "This form is too long…" never reached the visitor.
- At b9424b88b: `413 "This form is too long. Please shorten your message and try again.", code TOO_LARGE`. This held.

**m3 (Minor): oversized posts are not counted in the per-address flood limit. Seen on both commits.**
- Did: after the window reset, sent 40 posts of 4 MB each from one address in 1 s. Every one got 413. The next normal post got 400, not 429.
- Re-ran at b9424b88b with 35 posts of 40 KB: 413 ×35, then 400.
- The comment says the limit is "counted on every request, refused or not". The size check (and at b9424b88b the route parser) runs before `limit()`.
- At b4db3a009 each refused post was a 4 MB parse with no limit on how many. At b9424b88b the parse is capped at 32 KB, so the cost is small.
- Should have happened: count the request before refusing it for size, or say in the record that this is deliberate.

**m4 (Minor): bidirectional and zero-width control characters are stored in names. Seen on b4db3a009.**
- `givenNames:"‮artnaS"` (RIGHT-TO-LEFT OVERRIDE) and `"​A​"` were accepted (201) and stored as given.
- `CONTROL` in `common.ts:18` covers only C0 and DEL. Staff lists will show a reversed or spoofed name.
- Should have happened: refuse or strip the Unicode format characters (`\p{Cf}`: U+202A-202E, U+2066-2069, U+200B-200F) in one-line fields.

## What held (tried, answered as the rules say)
- **Bot paths.** A filled honeypot, a fill under 2 s, a stamp with its time moved back 10 s, and a forged stamp `123.abc` all got 201 with the same thank-you text and stored nothing. The person, lead, receipt, event and audit counts did not change, and there was no consent row.
- **Origin.** A missing or foreign Origin got 403 SITE_NOT_ALLOWED. The solo firm's form posted from maple.example got 403.
- **Strict body.** An unknown field, `__proto__`, an unknown attribution key, or `consent:"true"` got 400.
- **Rate limit.** The 31st post in a minute from one address got 429, even when the earlier posts were refused (403). A spoofed `X-Forwarded-For` did not bypass it (no `trust proxy`). The per-token limit of 60 needs more than one source address; it was checked by reading the code and by the unit test only.
- **Unknown and off forms.** An unknown token, a malformed token and a form that is off gave the same 404 "This form is not available." on GET and POST.
- **The answer never reveals the person.** A repeat enquiry (same email in upper case, phone in another format) got the same thank-you text. It made a new person and lead L-00002, flagged `possible_match_person_id`, not linked. A match never crosses firms: Lena in sample-solo was not flagged.
- **Duplicate submissions.** 12 parallel posts of one `submissionId` with different messages made one lead, one person, one receipt, one note, one audit line and one event.
- **Fields.** 101-character name got 422. Another firm's `interestedIn` got 422. CJK, Arabic, Cyrillic and umlauts were stored intact. HTML is stored as plain text. A phone of letters is kept with `phone_readable=false` (Fix number).
- **The possible-match line.** With everyone-sees-all off:
  - O (owns L-00002, cannot see R's L-00001) got "Possible match with a person you cannot see" with `personId: null`.
  - R (Owner) got "Possible match: Lena Park (L-00001)".
  - T got 404 for O's lead.
- **Views.** O's All showed own and unassigned leads only. The view `closed`, or a repeated `view`, got 422.
- **Firms are kept apart.** sample-solo's user-S reading, taking or assigning a sample-firm lead got 404.
- **Assign.** Assigning to another firm's staff got 422. Assigning to a SUSPENDED staff member got 422 "Choose an active person of your firm". A suspended owner shows "(Inactive) …" and the lead counts as Unassigned (another person can take it). The suspended person's bearer got 401.
- **Take race.** 6 parallel Take it calls (R, T, O ×2): one 200, and five 409 "Representative (Sample) already has this lead.". One `lead.taken` audit line and one event.
- **Sessions and keys.** No bearer, only `x-actor`, or a forged bearer got 401. O Assign got 403 (missing `agent/prospect:assign`). READ_ONLY: Take 403, Assign 403, Unassigned list 200 (holds `view.all`). An upper-case lead id gives the same lead.
- **Audit and outbox.** Audit lines and outbox rows matched one to one (`lead.created` 7/7; taken plus assigned 4 audit lines / 4 `lead.taken` events). Consent was recorded once (`FO_PERSON`, `WEB_FORM`, the form's wording id) and only when ticked on a stored lead.
