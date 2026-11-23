# FO-7q part 3: break report (R1.56; runtime, API reads only, money and permissions)

Branch `claude/runtime-fo7q3-parties` at `e51fcc3e5`, PR #3306; diff `git diff origin/main...e51fcc3e5`. Scope: billTo/caseLabel on
`GET /api/front-office/money/invoices` and `…/invoices/:id/detail`, and `GET /api/front-office/money/parties?q=` (agent/invoice:list).
How: the suite runs green (33/33). I ran a scratch script, copied from `tests/check_fo7q_parties.ts`: its own database
`xr_studio_brk_fo7q3_<pid>` on :54329, every migration, the reads feature in a Nest app with PF-4's guard and PF-12's walls, and
the local sign-in. HTTP and direct calls; the database was dropped after each run. I did not use :4400, edit code or commit.
The script is outside the repo (`/tmp/claude-0/…/scratchpad/break_fo7q3.mts`).

## Findings

**M1 (Major): the won check reads fo_prospect by subject with no index. Under the app's own scope the search takes about 0.7 s,
and the plan can tip into a quadratic join.** `parties.ts:79` (`won`) puts `exists (… fo_prospect w … w.subject_person_id = p.id)`
on every candidate. fo_prospect has indexes only on (firm,type,stage), (firm,owner), (firm,id) and (firm,number)
(`20261114153000_fo1a_front_office_sales/migration.sql:389-398`). No index covers subject_person_id or subject_company_id.
- Setup: firm A with 5,000 won people plus 20,000 other people. user-R's real scope from PgMoneyVisibility is 5,038 party ids and
  2 cases (scopeOf alone: 11 ms).
- Search for `q=sample`: median 684 to 786 ms over five runs. HTTP: 732 to 784 ms. The STANDARDS §9 budget for search is 200 ms.
- With the same scope, the invoice list answers in 24 to 30 ms. The search with scope `ALL` answers in 41 ms.
- EXPLAIN ANALYZE (5,000 won): `Nested Loop Semi Join … Join Filter: (p.id = w.subject_person_id) Rows Removed by Join Filter:
  12687501`, 1,675 ms.
- At 7,000 won the app call took 1,420 ms (HTTP 1,335 ms; EXPLAIN 3,609 ms, 24.8 M rows removed by the join filter).
- The plan depends on statistics. At 2,000 won: 17 ms. At 10,000 won the planner picked a hash semi join: 100 ms.
- All timings are re-measured on a `git archive e51fcc3e5` snapshot. Someone else is editing the shared working tree at the same
  time (see the note at the end).
- Standards: §5 [M] "Read paths indexed" and §9 [M] search < 200 ms. §9's budgets are stated "with the sample data". I rate this
  Major for two reasons: it is a new read path, and money reads in this row family are held at 10,000-row scale (FO-7q DW1).

**m1 (Minor): a NUL byte in `q` gives 500 instead of a 422 Problem Details.** `?q=wo%00nbee` and `?q=%00%00` return
`{"statusCode":500,"message":"Internal server error"}`. Cause: `Query` (`parties.ts:62`) accepts U+0000 and PostgreSQL refuses it
in text. This breaks STANDARDS §6 [M] (errors as RFC 9457 Problem Details) and P7's claim of "the query by PF-28's one rule
(422)". Other modules already refuse control characters (for example `platform/settings/offices/service.ts:27`). No data is exposed.

**m2 (Minor): the top 20 are not the first 20 by the order shown.** The SQL picks each half's 20 by
`lower(concat_ws(' ', btrim(given), btrim(family)))` (`parties.ts:86`), which has no `nullif`. JS then re-sorts with
`localeCompare` (`:99`).
- Test: 20 won "B00…B19 Order", a won person with given name `''` and family "Zorder", "Ángel Order", "aaa Order lower" and
  "Aorder"; search `q=order`.
- Result: the 20 include "Zorder", shown last, and drop "B17 Order" (the SQL sort key is " zorder", so it sorts first).
  "Ángel Order" is also dropped. On this C-collation cluster "á" sorts after "z" in SQL, but localeCompare would show it first.
- Effect: a matching party can be missing from a full page. Typing more letters finds it.

**m3 (Minor): case-insensitive search fails for non-ASCII letters on a C-locale cluster.** "ÉLODIE" and "Élodie" find "Élodie Zoë",
but "élodie" does not. "zoë" finds it, but "ZOË" does not. This cluster is `datctype=C`. `tools/new-machine.sh:182` creates
en_US.UTF-8 clusters, so the result depends on the environment. Nothing in the code or the suite pins it. Other non-English text held:
Arabic "مريم" found, CJK "小明" found. Also, a single CJK character ("王", a whole family name) is refused by min 2.

**m4 (Minor): whitespace and normalisation differ between matching and display.** For given "Ann " and family "Lee" the
search shows "Ann Lee", but `q=Ann Lee` finds nothing. Cause: SQL `btrim` strips spaces only, while JS `trim` also strips NBSP
(`parties.ts:84` against `:38`). An NFD name (`Zoë`) is not found by NFC "Zoë". Nothing is normalised.

**m5 (Minor, for the lead to decide): an invoice billed to a merged-away person shows the tombstone's name.** In both the list
label and the detail, `billTo.name` is "Loser Mergetest", not the survivor's name. `columns.ts:5-6` says "a reader follows
fo_person/fo_company.merged_into_id to the survivor"; `labelsOf` (`parties.ts:49`) does not. This is arguably correct, since the
invoice names whom it billed and P-574 (2) says a person with money is never merged by itself. Raised so the choice is written down.

## Held (attack: evidence)
- SQL injection in `q` (`' or 1=1 --`, `x'); drop table fo_person; --`, `'||pg_sleep(2)||'`, `$1 or true`): 200 with 0 items,
  20 to 37 ms (no sleep ran). fo_person was intact. Every value is bound through Prisma.sql.
- LIKE wildcards and escapes:
  - `%%`, `__`, `_o`, `%a`, `\%`, `\_`, `\\` match nothing.
  - `y%O` and `f_C` find only "Fifty%Off_Co" (literal).
  - `k\s` finds "Back\slash Sample".
- Query shape:
  - These all give 422 Problem Details: `?q=a&q=b`, a duplicate `?q=wonbee&q=wonbee`, `q[]=`, `q[a]=`, `q[0]=`, `Q=`,
    `constructor=x`, `__proto__[q]=`, extra `firmId=`.
  - Over 100 UTF-16 units: 422. 20,000 characters: 431 from Node.
  - Broken UTF-8 (`%ED%A0%80`, `%FF%FE`): 200, empty.
  - Surrounding tabs and newlines are trimmed.
- Cross-firm:
  - Firm B over HTTP and with `ALL` gets only its own won party. Firm A's ids put in firm B's scope find nothing (suite P1).
  - `labelsOf` under firm A gives firm B's company `name: null`.
  - Firm A's ctx inside firm B's wall gives 0.
  - Upper-case ids resolve.
- Won in firm A, prospect in firm B: firm A sees its won record, not firm B's. Firm B sees neither firm A's record nor its own open
  prospect.
- Prospects: open or no prospect: never found. Merged-away person: hidden and the survivor found, after the prospect moves as
  FO-9b moves it (`columns.ts:20`). A tombstone whose prospect did not move, which no merge leaves, finds nobody.
- Never guessing a name: no-name person: not found by email words; `name: null` on the list and the detail (suite P3/P5).
- C5:
  - Scope `{cases:[X], parties:[]}` finds only X's company, not the client of out-of-scope case Y. Unknown ids find nobody.
    Empty scope and failClosed find nobody.
  - Over HTTP, user-O (CASE_OFFICER) finds Y's client too. That is by grant: CASE_OFFICER holds `agent/case:view.all` and
    `agent/prospect:view.all` (pf3 migration lines 605, 985), so the adapter's scope is the whole firm. It is not a leak.
- Permissions:
  - READ_ONLY gets 403 for a valid, a too-short and an array `q`. The key is checked before input, so no input oracle.
  - BILLING_FINANCE gets 200 within its scope. No session gets 401.
  - A token issued before the role change gets 401.
- Count and timing leaks:
  - No count field is returned.
  - Scoped search with 5,000 out-of-scope matches: 21.7 ms; no match: 17.7 ms (within noise, own firm only).
  - Another firm's rows are never scanned, since firm_id is in every predicate.
- N+1: 200-row list: 2 label reads (people, cases; no companies on the page), 33 ms. The detail reads its labels once,
  inside its transaction.

Note: during this run the working tree's `parties.ts` gained uncommitted edits (a case-client branch for "review M1") that
are not mine; every result above is for `e51fcc3e5`. Not tested: concurrent writes (reads only); screens, keyboard and zoom (no screen in this row).

Verdict: Changes
