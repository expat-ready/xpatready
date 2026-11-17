# AUD-5 part 1: break report (PR #2008, commit 34686f28)

This is an API-only adversarial pass. I ran an isolated copy `aud5brk` on :4561 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, database `xr_studio_aud5brk`), checked the audit lines with psql (`audit_event`, entity `platform_firm_setting`) and stopped the copy afterwards. I fixed nothing.
Sessions used: R (Owner, sample-firm, second step), O (Case Officer, sample-firm), S (Owner, sample-solo). Paths are relative to `prototype/studio/`.
**Result: no Blocker, no Major, 7 Minor.** All of the brief's required attacks held, except two edges in the reason check (m1, m2).

## Findings

| # | Attack and request | Expected | Actual | Sev. | Where |
|---|---|---|---|---|---|
| m1 | Below-6 save whose reason is an invisible character: `PUT {"years":5,"reason":"​"}`, and the same with `­`, `⁠`, `ㅤ` | 400 REASON_NEEDED (no reason was typed) | 200, saved. The audit line reads `... Reason given: ​` (blank to the eye). `　`, `﻿`, tabs and NBSP are refused correctly, because `trim()` strips those | Minor | `api/src/platform/keep-period/service.ts:83,86` |
| m2 | Reason containing NUL or a lone surrogate: `{"years":3,"reason":"a\u0000b"}`, `{"years":3,"reason":"\ud800"}` | 400 INVALID_REASON | NUL returns **404** "Not found (it may have been removed by a reset)": Postgres "invalid byte sequence" is mapped to 404. The lone surrogate returns **500** (Prisma P2007 in the log). Nothing was written, because the transaction rolled back | Minor | `service.ts:83-86` (no character check); 404 mapping at `api/src/main.ts:213` |
| m3 | A reason sent with a save of 6 or more: `PUT {"years":7,"reason":"Our policy is seven years"}` | Reason kept on the audit line, or refused as "nothing else" | 200. The reason is **silently dropped**: the summary is "changed" and `detail` has no `reason` | Minor | `service.ts:89` (reason only when `below`) |
| m4 | Below-6 save in a single request, with no earlier 400 to show the warning: `PUT {"years":3,"reason":"ok"}` | The audit line records only what happened | The line says "**Warning shown:** This is less than the College's rule ... Reason given: ok", but no warning was ever returned to this caller. Fine once a screen shows it first. For the API alone, the line claims something it cannot know | Minor | `service.ts:89` |
| m5 | Concurrent saves: 24 parallel `PUT {"years":7..30}` as R | Each response reports its own saved value | 10 of 24 responses said `saved:true` with **another request's years** (sent 11, got `years:30`; sent 15, got 19). The read runs after the transaction has committed, so the `warning` in the response can also be wrong (a 3 saved while the response shows 8 with `warning:null`) | Minor | `service.ts:91` |
| m6 | Demo reset when a Sample firm has no stored row (row deleted in psql; it cannot be cleared through the API) | Reset returns sample-solo to 6 (the docstring says "returns the Sample firms' settings to their seed values") | `POST /api/demo/reset` gives 201, but sample-solo stays "Not set". The reset only loops over rows that exist. `reset-to-six` behaves the same. Only a database edit or a run without the start-up seed can reach this | Minor | `api/src/platform/identity/demo-reset.ts:25` |
| m7 | Reason of 300 emoji (300 characters a person sees) | Accepted ("500 characters") | 400 "Keep the reason to 500 characters": `length` counts UTF-16 units (600) | Minor | `service.ts:85` |

## What held

| Attack and request | Result |
|---|---|
| PUT without the key, as O: `{"years":8}` | 403 MISSING_PERMISSION (agent/legal-settings:manage). Also 403 with a trailing slash and with an upper-case path; 404 with `//` or `%2D` in the path. No token: 401. Bad token: 401. An `x-actor: user-A` header with no bearer: 401 |
| GET as O / R / S | 200 for every staff member. `canChange` is false for O and true for R and S. No token: 401 |
| years `0`, `-1`, `-0`, `1000`, `51`, `"6.5"`, `6.5`, `null`, `true`, `"6"`, `[6]`, `{"v":6}`, `1e400`, `99999999999999999999999` | All 400 INVALID_YEARS. No audit line was written: the count went 2 to 2 before the valid ones |
| `1e1` and `6.0000000000000001` | 200 with 10 and 6. Both are valid JSON numbers, so this is correct. `5.9999999999999999` parses to 6 in IEEE arithmetic and saves as 6 (held: JSON gives no way to tell them apart) |
| Body `{}`, empty, `[]`, `[{"years":8}]` | 400 INVALID_BODY |
| Body `null`, `"8"`, `8`, `NaN`, `Infinity` | 400 from the JSON parser |
| Body `{"years":8,"years":4}` | Last key wins (4): REASON_NEEDED |
| Below-6 save with no reason, `""`, `"   "`, `"\t\n "`, `"　"`, `"﻿"` | 400 REASON_NEEDED, with the warning in `detail` and `warning` |
| Non-string reason (`null`, `5`, `["a"]`, `{"a":1}`, `true`), including on a save of 6 or more | 400 INVALID_REASON |
| Reason 10 kB, 200 kB, 2 MB; 501 x's | 400 INVALID_REASON |
| Reason of exactly 500 x's; reason padded with 600 spaces on each side | 200. The padding is trimmed |
| Audit line for the 500-character reason | Summary cut to 600 characters; `detail.reason` holds all 653 characters |
| Firm in the request: `firmId` or `firmKey` in the body | 400 INVALID_BODY (strict object) |
| Firm in the request: `?firmId=<firm B>` on PUT; `?firmKey=`, `?firmId=` or an `x-firm-id` header on GET | Ignored. The session's firm A was used and firm B was untouched |
| `{"years":8,"__proto__":{...}}` | 200 for 8. The extra key was ignored; no pollution was seen |
| Firm B's value leaking into firm A (A=9, B=2 with a reason) | R and O read 9 with no warning. S reads 2 with the warning. The database rows are separate, and each audit line carries its own firm id, firm key and staff id |
| Read's words for not set, 1, 5, 6, 9 and 50 | Not set: "Not set: your firm has not chosen how long to keep closed client files." 1: "1 year" (singular). 5 or less: a warning without "Give a reason". 6 and 50: no warning |
| Forbidden wording | "legal obligation", "required by law", "obligat", "by law", "must" and "mandatory" appear in no read and no error. In the source they appear only in a comment (`ports/keep-period.ts:35`) |
| Demo reset (`POST /api/demo/reset`, `x-actor: user-A`, `{"confirm":"RESET"}`) with A=8, B=2 | 201, no crash. Both firms went back to 6, with one audit line each: actor `system`, reason "demo reset", from 8 and 2 to 6. A second reset wrote 0 lines. As O: 403 |
| Audit line per save | One line per save, all written in one transaction with the value: actor `staff:<id>`, `from`/`to`, firm id and key. "saved unchanged" when the value was the same. A below-6 save carries the warning and the reason in both the summary and `detail.reason`. The seed lines carry `seed:AUD-5` / "Sample value" with `from: null` |
| Concurrency, 20 parallel saves | All 200. The audit `from`→`to` chain is unbroken, and the last `to` (18) equals the stored value. It is last-write-wins with no stale-write check, which is PF-3's settings design, so I do not count it as a finding |
| Content types: form-urlencoded `years=8` | 400 INVALID_YEARS (the string is refused) |
| Content types: `text/plain`, no content type, multipart, `application/vnd.api+json` | 400 INVALID_BODY |
| Content types: `charset=utf-16` | 400 from the parser |
| Method spoofing: POST, PATCH, DELETE, POST with `X-HTTP-Method-Override: PUT`, `?_method=PUT`, PUT on the collection, GET on the PUT path | All 404. OPTIONS from another origin: 404 (no CORS) |

## Notes
* Pre-existing, not from this PR: the JSON parser's 400 repeats the raw body back ("Unexpected token ... is not valid JSON").
* Out of scope for part 1 and not tested: `check()` (part 2); no screen.
