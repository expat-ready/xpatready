# PF-30a break report: the one find door (`GET /api/platform/find?q=`) and the front office's finder

Breaker, 21 Nov 2026. PR #2884, branch `claude/runtime-pf30a`, head `62fe3273d8a5c81e81e4f550d8a0cabbe7592dfb`. Isolated copy on :4487 (db `xr_studio_runtime_pf28`), US$0, no live AI, no code changed.
Data I added: R's leads Zelda Secretary (P-00001), Carl Contact (corporate P-00002, company "Northwind Hush Holdings Ltd"), Lucy Losthope (P-00003, Lost), 55 "Annika Bulk…", José García, 明 李, Ünal Öztürk, Mary-Jane O'Brien. T's leads Tina Teammate (Closed) and Anneliese Mine. Temporary changes, all undone: 50,000 role-less `fo_person` rows, the "everyone sees all" row, owner of L-00004 set to null, `agent/prospect:show` taken off CASE_OFFICER.
Paths are under `prototype/studio/`.

## Breaks

**M1 (Major): the 50-row limits apply before the view rule, so the finder silently drops records the caller may open.** No "partial" line is shown.
- Code: `api/src/front-office/find.ts:237-239` (name prefix: `take: 50`, oldest first, no view rule). The same shape is at `:234-236` (`fo_sales_person_matches(... 50)`), `:271-272` (prospect number prefix: `take: 50`, `orderBy number asc`, filtered afterwards) and `:284-285` (company: 50 and 50).
- Repro 1 (view.own): "everyone sees all" off. R owns 57 older people whose names start with "Ann". T owns "Anneliese Mine".
  `GET /api/platform/find?q=ann` as T → `{"groups":[],"partial":false,"message":null}`.
  `q=anne`, `q=anneliese` and `q=mine` as T → Anneliese Mine. So T's own lead disappears once another owner has 50 older "Ann…" people.
- Repro 2 (also view.all): I added 50,000 people with no front-office role (key `ann<n> bulkperson`, older; like company contacts or other modules' people).
  `q=ann` as R → `[]`, with "everyone sees all" both on and off. R owns Anna Walk, Annabel Walk and 55 Annika. `q=a.` → `[]` too.
  `q=annika` and `q=anna` still work. They come through the trigram path, which ranks visible people first.
- Why it matters: the finder answers "nothing found" for a record the caller owns, and says nothing about it. In a firm with a few thousand leads, a view.own staff member typing a common first-name prefix will often get an empty list. `P-0` loses prospects past the firm's first 50 numbers in the same way. Fix direction (not mine to make): filter by owner or role inside the query, or keep paging until 8 visible hits are found.

**m1 (Minor): the 2-character minimum can be bypassed. Punctuation, symbols or zero-width marks turn the query into a 1-letter prefix search.**
- `q=a.`, `q=a%25` (that is `a%`), `q=%25a`, `q=w_`, `q=c_` and `q=a%E2%80%8B` (a + zero-width space) each give 200. They return the first 8 people with a word starting with that letter. `q=a%20` correctly gives 400.
- A single emoji (`q=%F0%9F%98%80`) also passes, because `FindText` counts UTF-16 code units (`ports/find.ts:23`). For the same reason 51 emoji (102 units) are refused.
- Not a leak: the view rule still applies. It does defeat the row's "1-character query → 400" rule.

**m2 (Minor): a query longer than 500 characters gets a different refusal from one of 101-500 characters.**
- `q=` with 101 to 500 characters → 400 `QUERY_LENGTH`. With 501 characters → 422 `INVALID` "q: This is too long: at most 500 characters".
- Cause: `query("q")` caps at 500 (`api/src/platform/http/input.ts:25`) before the route's own 2-100 rule (`routes.ts:171-172`). One rule, two answers.

**m3 (Minor): a value sent as a query *key* is echoed in the answer.**
- `GET /api/platform/find?anna.walk%40example.com` → 422 with `"detail":"One field needs a change: anna.walk@example.com: …"` and `"fields":{"anna.walk@example.com":…}`.
- `?q=xx&zelda.secret%40example.com=1` gives the same echo.
- It is not written to api.log (checked). It only happens with a malformed URL, but the answer then repeats searched personal data, against "the answer never repeats the query" (`input.ts:33` caps the echoed key at 64 characters, it does not remove it).

**m4 (Minor): names with letters and a digit, and names in Chinese, Japanese or Korean script, skip the name and company search.**
- `NUMBER_LIKE` (`ports/find.ts:40`) reads anything shaped like up to 6 letters followed by digits as a file number. `front-office/find.ts:233,282` then skips the name and company search. Example: `q=zelda5` runs no query at all. A company called "Q4" or "AB12" can never be found by its name.
- Names in Chinese, Japanese or Korean script turn into hex keys that contain digits, so `:237` skips the prefix search and only an exact key matches. Lead "明 李":
  - `q=明 李` finds it;
  - `q=李明` (family name first) → `[]`;
  - `q=李` → 400.
  The row asks for "prefix and trigram similarity". `q=obrien` also does not find O'Brien (`q=o'brien` and `q=brien` do).

**m5 (Minor): a finder dropped by the budget keeps its database work running and holds its connection.**
- Repro: one psql session holds `LOCK fo_person IN ACCESS EXCLUSIVE MODE` for 8 s. During it I sent 30 parallel `q=zelda` requests as T:
  - 11 came back in about 0.44 s with `partial:true` and "Some results could not be loaded" (correct);
  - the other 19 waited about 7 s;
  - an unrelated `GET /api/front-office/prospects/lost-reasons`, which does not touch `fo_person`, took 5.5 s.
- `runFinders` (`ports/find.ts:94-102`) races a timer but never cancels the finder. Each dropped finder keeps its pool connection until its query ends. A typing finder sends a request per keystroke, so a slow database or a lock fills the pool for the whole app.

**m6 (Minor, latent): the finder never checks `agent/prospect:show`, which every page it links to requires.**
- `front-office/find.ts:225-227` checks only `view.all`/own. Repro: I took `agent/prospect:show` off CASE_OFFICER (temporary SQL; no shipped role lacks it today) and set "everyone sees all" on.
  As user-O, `q=anna` → Anna Walk and Annabel Walk with lead URLs. `GET /api/front-office/leads/64a14ea0-…` as user-O → 403 "missing-permission (agent/prospect:show)".
- So the finder would name people to a role that cannot open them. Not reachable with today's fixed role matrix. It becomes a leak the day roles can be edited.

## What held
- Firm walls: as user-S (sample-solo) I searched with firm A's exact email in both cases (`anna.walk@…`, `ANNA.WALK@…`), phones (`+14165550144`, `4165550144`, `416 555 0144`, `+16475550199`), names (`Anna Walk`, `walk`, `ann`, `明 李`, `José García`), prospect numbers (`P-00001`, `P-00002`, `P-0`), company names (`northwind`, the full name) and `li.ming@…`. Every one → `[]`. Timing is the same either way.
- View rule ("everyone sees all" off): as T I searched R's Zelda by email, `+16475550199`, `zel`, full name, `secretar`; `P-00001`, `p00001`, `P-0`; `northwind`, `hush`, the full company name; `anna`; `lucy.lost@…`; `carl`. Every one → `[]`. T's own closed lead is found and labelled "Closed L-00006". T creating a lead with R's email gets "A person you cannot see". An unassigned lead is found by T (who has view.all) and opens (200), the same as the read route.
- Labels: a Lost prospect is found and labelled ("Lost P-00003"), by name and by number. Nothing in the front office is deleted (no deleted column), so there is nothing to leave out.
- LIKE and SQL: `%%`, `__`, `\\`, `x%`, `P-%`, `P_0`, `%@example.com`, `_@example.com`, `' or 1=1--`, `"; select`, `**` and `..` all → `[]` or a correct 1-letter prefix match only (m1). `x%` → `[]`, so `%` is never a wildcard. Every value goes through the name/company key or an exact match. Prisma is parameterised.
- Input: `?q=a&q=b` → 422 "q: This must be text". `q[]`, `q[a]`, `q[0]&q[1]`, `q[__proto__][x]`, `__proto__=1`, `constructor=x`, `extra=1` and `Q=` → 422 naming the key. Empty, missing and only-spaces → 400. 100 characters → 200; 101 → 400 (m2 aside).
- Phones: an unencoded `+14165550144` (read as a space, then trimmed) finds the person. So do `+1 (416) 555-0144`, `416.555.0144` and `1-416-555-0144`. With letters (`416-555-01ab`, `416555O144`), an `ext 12`, or `00014165550144` → `[]` with no error.
- Unicode: `José`, `jose`, `garcía`, `Özt`, `ozturk` and `unal` match. A NUL byte inside an email (`nulmarker%00x@example.com`) → 200 with `partial:true` (the front-office finder fails and is dropped, no 500, the error is not logged). NUL in a name, lone surrogates and `%FF%FE` → `[]`.
- Auth: no token → 401 `NOT_SIGNED_IN`. A forged token → 401 `TOKEN_REFUSED`.
- No echo, no log: no 200, 400 or 401 answer repeats the query. `var/isolated-runtime_pf28/api.log` was grepped for every value I searched (anna, walk, zelda, secret, 4165550144, nulmarker, northwind, hush, the 100/500-character runs, anneliese, annika, lucy, `or 1=1`, select, example.com). Zero hits: request lines name `/api/platform/find` only. (The "416" and "647" hits are inside UUIDs and timestamps.)
- Budget: with 50,000 extra people every query answered in 11-95 ms, well inside 400 ms.

Verdict: Changes (M1 has to be fixed: the finder must not report "nothing found" for records the caller may open. m1-m6 can be fixed in the same PR or ticketed) — sha 62fe3273d8a5c81e81e4f550d8a0cabbe7592dfb
