# PF-6r journey test (reviewer, 16 Nov IST): GET /api/platform/roles

Head **f4cfd153130b1647f4370762bda572cb3a0127e9** (the J1-J7 walks were on 77e419b33. f4cfd1531 changes only `roles()`'s integrity checks and
its sort, and its suite re-ran green, 17/0). API only, no screen: each journey is walked over HTTP the way PF-6 part 2's
role picker will call it, on an isolated copy at :4437 (`isolated.sh pf6rjt 4437 start PLATFORM_IDENTITY=local
PLATFORM_SAMPLE_SEED=on`, stopped afterwards). Local sign-in stand-in, Sample firms, US$0.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Owner (user-R, sample-firm): "show me what each role gives before I invite someone" | sign in, GET roles | 200, six roles in order, each key with class and scope | 200 in 22 ms, 51.5 KB. Keys and money/licence counts per role: OWNER 233 keys (16 money, 3 licence), ADMIN 215 (15, 0), CASE_MANAGER 146 (4, 3), CASE_OFFICER 99 (4, 0), BILLING_FINANCE 46 (12, 0), READ_ONLY 40 (0, 0). Scopes OWN, ALL and NONE all appear (`case:view.all` is ALL, `case:view.own` is OWN) |
| J2 alternate | Owner of firm B (user-S, sample-solo) | GET roles | the same starter roles, nothing of firm A | 200, byte-identical to J1 |
| J3 wrong role | Case Officer (user-O): "can I see the roles?" | GET roles | 403 | 403 `MISSING_PERMISSION`, "Your roles do not include the permission this needs (agent/staff:manage)." |
| J4 error | someone signed out | GET roles, no token | 401 | 401 `NOT_SIGNED_IN`, "Sign in first: this needs a staff member's session (a bearer token)." |
| J5 odd paths | Owner | `/ROLES`, `/roles/`, `?firmId=x&role=OWNER` | same answer, query ignored | 200 each, identical body. Case Officer 403, no token 401 |
| J6 recovery | Owner, 10 calls at once (double click, reload) | 10 parallel GETs | same body each time | all identical, 14-46 ms |
| J7 wrong verb | Owner | POST roles | no write door | 404 |
| J8 held data | Owner, after a role key with no catalogue row is inserted | GET roles | fails closed, nothing invented | 500 RFC 9457, "Something went wrong on the server. Refresh to see the current state, then try again." The key is not in the body. Row removed afterwards |
| J9 hand-off | Owner, next step: change a person's roles | compare the answer's role names with what `PATCH staff/:id/roles` accepts | the same names | `rolesOf` accepts exactly `Object.values(PlatformRole)` (`identity/service.ts:25,56-59`), which is the same six names |

## Data underneath
The suite (DW1) checks the answer row-for-row against the role-permission rows joined to the catalogue (779 rows), and checks the money keys
against `moneyKeysOfRoles`. This is a read: nothing is written and there is no audit line to expect. Roles are enforced on the server (J3, J4, and the
suite swaps grants live for all six roles).

## Break it
Done by the breaker (`break-report.md`, 4 Minors, all fixed at f4cfd1531 with fail tests). I repeated case variants,
parallel calls, a wrong verb and an uncatalogued key (J5-J8). The only new point: the 500's cause is not written to `api.log` (the line has
the status and correlation id only). See review Minor 1.

## Score (0, ½ or 1 each)
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | J1: every role, key, class and scope a role picker needs |
| next step obvious | 1 | J9: the role names are exactly what the role change accepts |
| plain words | ½ | 401/500 wording is plain. The 403 detail names the raw key `agent/staff:manage` (the guard's shared wording, outside this row) |
| feedback and state | 1 | RFC 9457 type, title, status and code on 401/403/500 |
| correct data | 1 | 779 rows exact. Billing and finance has 12 money keys, as `moneyKeysOfRoles` says. Read-only has 0 |
| error recovery | ½ | Fails closed with "Refresh…", but the server log does not say which key or role caused the 500 |
| accessibility and screen sizes | N/A | no UI in this row (PF-6 part 2 owns it) |
| speed | 1 | 13-46 ms and 51.5 KB, one query (STANDARDS §9) |
| visual quality | N/A | no UI |
| trust and sources | 1 | class and scope come from the catalogue, checked against PF-6b's rules. No label invented |

**7 of 8 applicable = 8.75/10 (scaled; 2 N/A). No criterion at 0. Pass.**
To raise it: log the thrown message with the 500's correlation id (app-wide logging), and give a plain-words 403 detail without the raw key (guard).

## Not tested
A real screen reader, browser widths and axe: there is no page. An intended user's unaided walk: D17 and D20 stay with the founder, at PF-6 part 2.
