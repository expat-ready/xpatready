# PF-19s break report (independent breaker, 23 Nov)

Commit `e263986fc8dc16c794b003d3466e612b9b4eb190`, branch `claude/screens-pf19s-templates`. Isolated copy `brk_pf19s` on :4465
(`xr_studio_brk_pf19s`, AI off, `PLATFORM_IDENTITY=local`, US$0), stopped afterwards. The suite ran once on it first (28/28 passed),
then API scripts, a 300,000-case fuzz of the publish check against `ports/messages.ts` `fillFields`, and Playwright with axe-core.
People: Owner user-R, Case Officer user-O, Case Manager user-T, the suite's READ_ONLY and BILLING_FINANCE people, Owner user-S of
sample-solo. "Everyone sees all" was off, as the suite sets it. Scope: concept "What gets built" only; drafts, French, history,
platform starter rows and send callers are on the "Not built" line and are not findings.
Note: at 05:27 someone else left an uncommitted edit in the working tree (`templates/routes.ts`, `templates.ts`: `parseInput` moves
to the controller). The copy was started before that edit, so it ran HEAD. By reading, the edit does not change behaviour.

## Verdict: Approve (no Blocker, no Major; 6 Minor)

## Findings
| # | Sev | What I did | Expected | Actual | Where |
|---|-----|-----------|----------|--------|-------|
| m1 | Minor | Owner `PUT /api/platform/templates/lead.acknowledgement` {subject:"ok", body:"a\u0000b", baseVersion:current} | 422 on `body` ("remove the control character") | **404 "Not found (it may have been removed by a reset)."**. The global filter maps Postgres "invalid byte sequence" to 404. The editor would show "Not published. Not found …". Nothing was stored. | `templates.ts:76-77` (no control-character check on the body); `api/src/main.ts:220` |
| m2 | Minor | Editor at 1024 px, Subject = 200 × "W" (no spaces; a long URL behaves the same) | No sideways scroll (the 375/1024/1440 rule) | The preview's Subject line does not wrap: **2,508 px of sideways scroll**. The body wraps (`[overflow-wrap:anywhere]`), but the subject `<p>` has no wrap rule. | `web/.../templates-page.tsx:96` |
| m3 | Minor | Publish body `"a\ud800b"` and subject `"ok\udc00x"` (lone surrogates) | Refused, or stored as typed | 200. Stored silently as `a�b` / `ok�x`, so the published wording differs from what was sent, and nothing says so. | `templates.ts:70-84` (no well-formed check: `str.isWellFormed()`) |
| m4 | Minor | Lead "Ann⇥B Lee" (a tab is accepted by lead create). Subject `Hello {{ lead_full_name }} {{ lead_full_name }}`. Also two names of 100 characters each with the subject `{{ lead_full_name }}` | The preview warns that this subject cannot be sent to this lead | The preview shows the subject with no warning and publish accepts it. The send path refuses after filling (`messages.ts:110`: a control character, or longer than 200 characters after the fill). It throws a typed `MessageRefused`, not a 500 and not a raw placeholder. | `templates.ts:118-137` (preview runs no check on the filled subject) |
| m5 | Minor | A lead whose given name is `{{ firm_name }}`; body `Dear {{ lead_first_name }}` | SA-05 §3.6.1: a raw placeholder is never sent | `fillFields` fills in one pass, so the send reads "Dear {{ firm_name }}", the lead's own data, sent raw. The preview shows the same, so the two are consistent. | `ports/messages.ts:102-106` |
| m6 | Minor | Body of 4,000 × "a\r\n" (12,000 raw characters; 8,000 after normalising) | Counted as 8,000 and accepted | 422 "too long: at most 11000". The schema counts before CR/LF normalising. API only: the browser textarea sends `\n`. | `templates.ts:28` vs `:89` |

By reading, not proven with a screen reader: `aria-live="polite"` covers the whole rendered preview, which re-renders 250 ms
after each keystroke. Long messages would be re-announced while the person types (`templates-page.tsx:95`).

## Fixes (one line each)
m1: in `refusals`, refuse `[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]` in the body as a 422 on `body`.
m2: add `[overflow-wrap:anywhere]` to the preview subject `<p>` (`templates-page.tsx:96`).
m3: refuse a subject or body that is not `isWellFormed()` as a 422 on its field.
m4: in preview, check the filled subject against the send rule and add a `warnings` line ("This lead's subject would be over 200
characters / has a tab: it would not be sent").
m5: when the caller is built, refuse or escape values that hold `{{`/`}}`, or have preview mark them. Otherwise record it as accepted.
m6: apply the `.max` after normalising (`z.string().transform(...).pipe(z.string().max(...))`), or normalise in the schema.

## What held (attempted, passed)
* **Roles (API matrix):** Owner: list, show, preview, records, publish. Case Officer and Case Manager: list, show, preview, records; PUT 403.
  READ_ONLY: list and show only; preview, records and PUT 403; `canPreview:false`. BILLING_FINANCE: everything 403, and the page
  shows "Not available". Anonymous: 401. Templates is in the menu only with `:list` (the suite).
* **Another firm:** sample-solo's lead previewed by every sample-firm role gives 404 (403 for roles without preview). The Owner's
  records search for "Solo" is empty. sample-solo's first publish created its own `msg_firm`, template and version 1, separate
  from sample-firm's.
* **Lead visibility:** the Case Officer previews their own lead and gets 404 for the Owner's (the lead read agrees). With the owner
  SUSPENDED and then DEACTIVATED, the Owner and the Case Officer get the same 200/200 for the read and the preview, and the lead
  appears in records search. Case Manager user-T, with no leads, gets an empty search. A non-UUID, empty or other-firm id gives 404
  or the Sample lead.
* **Wording injection:** NUL, U+2028 and RTLO in the subject are refused ("one line"). `{{ LEAD_FIRST_NAME }}`, `{{  }}`, a
  zero-width space inside braces, `{{ Lead.Name }}` and a lone `{{` are refused by name. Whitespace-only text (ideographic space,
  BOM) is refused ("Write a subject/message"). 201 characters, or 150 "e"+U+0301 (300 units), are refused, matching the send
  path's `.length`. 2 MB gives 413; bad JSON 400; a string, negative or huge `baseVersion` and extra keys give 422. The keys
  `__proto__`, `constructor`, `LEAD.FOLLOW_UP`, `..%2F` give 404. `{{ __proto__ }}`, `{{ constructor }}` and `{{ toString }}` in
  preview are shown as unknown, with value null. Markup in a lead name shows as text (the suite).
* **Publish check vs send:** a fuzz of 300,000 random strings (braces, U+2028, NBSP, BOM, full-width braces, field names). Of the
  155,012 the publish check accepted, `fillFields` threw on 0 and left `{{`/`}}` in the output on 0. `{{{ f }}}` sends `{V}`, the
  same as the preview. A missing value (`owner_name`, unassigned) throws a typed `MessageRefused`, as the preview's "is not sent" says.
* **409 and races:** two browser tabs: the second Publish shows the 409 "Someone published version 5 …" and keeps the typed text.
  20 parallel PUTs from one base: 1 × 200 and 19 × 409. 40 PUTs with mixed bases: 2 × 200 and 38 × 409, versions 2 and 3. 15
  parallel first publishes on sample-solo: 1 × 200 and 14 × 409. No 500 anywhere. Audit lines = versions (11 = 11).
* **Write-once:** `UPDATE` and `DELETE` on `msg_template_version` are refused by the `msg_write_once` trigger.
* **Reload and Back with unsaved edits:** the leave warning shows; after a reload the newest published wording shows.
* **Layout and access:** 1024 px, and 1024 at 200 % (512 CSS px): no sideways scroll with normal text. axe-core is clean on the
  422 state, the 409 state, the Officer's read-only view, the READ_ONLY view, the BILLING 403 view and the 404.
* **Budgets:** list 12 ms, open 14 ms, records 11 ms, preview (400 fields) 9 ms, real-lead preview 10 ms; all under 200 ms.
