# Journey test (reviewer), PF-19b part 1: one sending path behind `MessagePort`

Reviewer: Opus 5.5, fresh context. Commit `8064504e471d44b89b9665c69d813fd294aa8ba1`, 15 Nov 2026. Own copy `rv_pf19b` on :4491 (never :4400), stopped afterwards. Live AI off, US$0.

This row has no screen. Its "users" are:
* a module that sends through `MessagePort` (caller code);
* the demo viewer reading `GET /api/demo/platform-inbox`;
* a client persona (wrong role);
* our team, which gets the cap alert.

So the browser, axe, width and keyboard steps do not apply; each criterion says so.

## Journeys
1. **Main path (caller → worker → inbox).** A caller commits a transactional send; the app's own pg-boss sweep delivers it; the inbox shows it.
   * Result: `SENT`, one `SENT` event, counter 1, job 37 ms.
   * The inbox lists it with "Sample immigration firm <messages@mail.expatready.example>" and Reply-To "representative@sample-firm.example.com".
   * Non-English text (Größe, 你好, مرحبا) is kept; `<script>` is escaped in the HTML. **Held.**
2. **Alternate, marketing.** Without a consent → `SUPPRESSED` "NO_CONSENT: MARKETING", nothing sent. With a live consent → `SENT`, with `consent_id` set (DW1). **Held.**
3. **Error, suppressed address.** Suppressed before the send → `SUPPRESSED`. Suppressed after queueing → the worker stops it (DW2). **Held.**
4. **Error, caller rolls back.** No row; dispatch and the sweep send nothing (DW3). **Held.**
5. **Recovery, double run / crash.**
   * `deliver` ×6 in parallel → 1 adapter call.
   * A row committed with no dispatch is sent by the sweep, once (DW4).
   * Under load the sweep is starved by another firm's 500 held rows, and firm A's row was never queued. **Failed under load (M1).**
6. **Cap (our team).** A trial firm at 49 with 5 rows in parallel → 1 sent, 4 held "daily limit", counter 50, one alert key per firm per day (DW5 and the probe). **Held.**
7. **Tampered content.** The file is changed after commit → `FAILED` "content changed", nothing sent (DW6). **Held.**
8. **Two firms, one address.** Each message carries its own firm's sender and Reply-To; firm B cannot use firm A's template (DW7). **Held.**
9. **Wrong role.**
   * `x-actor: user-P` → 403 with plain words; a bad address → 400 "Enter an email address like name@example.com."
   * `x-actor: client` (a persona name) → **200** (m1).
10. **Across the boundary (CI / other suites).** `check_forms_qa53` fails because the new open read is not on its reviewed list. **Failed (B1).**

## Data underneath
* After each journey the database was read: one row per idempotency key (8 parallel sends → 1 row); `msg_event` lines only for `SENT`/`FAILED`; the counter is exact.
* `demo_message` is unchanged.
* Alerts carry rule, firm id and day only. Job payloads carry ids only.
* The API log has no address.

## Break it
* Parallel same-key sends, parallel delivery and a race for the last place under the cap: no duplicates.
* HTML/script text: escaped.
* Persona name in place of id: let through (m1).
* Another firm's held backlog: starves recovery (M1).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | journey 1 end to end on the running app through pg-boss |
| next step obvious | ½ | no screen; a held row's "daily limit" and a suppressed row's reason are readable but are not shown anywhere yet |
| plain words | 1 | refusals and the inbox words are plain ("Enter an email address like name@example.com.", the client inbox text) |
| feedback and state | ½ | every row has a state and reason; there are no event lines for `SUPPRESSED` or held, because the schema has no kind for them (breaker m8) |
| correct data | 1 | exact under three races; sender and Reply-To per firm; hash re-computed |
| error recovery | ½ | the sweep starves across firms (M1) |
| accessibility and screen sizes | 1 | N/A: no UI in part 1 |
| speed | 1 | send to `SENT` in 37 ms; suite 5 s |
| visual quality | 1 | N/A for a screen; the one fixed layout is escaped and consistent |
| trust and sources | 1 | Sample labelled (`DAILY_CAP`, `PLATFORM_FROM`); stand-in SI-20 named; `consent_id` kept |

**Score: 8.5 / 10. Pass** (8 or more, no 0). Most valuable fixes:
* M1, to raise error recovery.
* B1 (CI), from journey 10.
* The persona-name 403 (m1).

## Could not test
* A real screen reader, and an intended user's unaided walk: D17/D20 stay with the founder. There is no screen.
* CI on this head (draft, skipped).
* SES / part 2.

## Addendum: re-run on 1a016939b (diff-only, 15 Nov 2026)
Own copy `rv2_pf19b` on :4494 (stopped afterwards), plus a scratch copy of `studio/` for the probes. US$0.
* **Journey 5 (crash):** 510 rows another firm's cap holds plus one crash row of firm A. The next sweep sends A's row (`break M1`). **Held.**
  * **New, under load:** a firm A row held "daily limit", with room today, behind firm B's 505 held rows. Still `QUEUED` after 3 sweeps and 3 hourly passes. **Failed under load (review M2).**
* **Journey 9 (wrong role):** `client` and `client-b` → 403, `user-O` → 200 (suite). Client 403, bad address 400 and Bearer 403 over HTTP (QA-53). **Held.**
* **Journey 10 (CI):** `check_forms_qa53` 40/0 on two fresh copies; one earlier run stopped with `fetch failed`, which I could not reproduce. `check_c616_privacy` 48/48. **Held.**
* **Break it:** a CRLF subject, a 300-character filled subject, a `msg/` attachment and an unknown firm are each refused plainly. Parallel same-key sends, delivery and the cap race give no duplicates, now under test.

Criteria unchanged: error recovery stays ½ (held rows starve across firms). **Score: 8.5 / 10. Pass.** The most valuable fix is review M2.
