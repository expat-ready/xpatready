# PF-6b journey test (reviewer role, 15 Nov 2026, commit 4e2fddb2)

API + schema row, no screen: journeys are walked through the API of an isolated copy of the real app (`studio/tools/isolated.sh pf6bjt 4437`, `PLATFORM_IDENTITY=local`, `PLATFORM_SAMPLE_SEED=on`), never :4400, and through the row's suite where the copy has no front-office data. No browser steps, no axe, no widths: nothing to render (N/A). Copy stopped afterwards (database and files removed).

## Journeys (persona · goal · steps · expected)
1. **Owner (user-R) gives a Case Officer (user-O) Billing/Finance** · "let O cover billing" · sign in, `PATCH /api/platform/staff/:O/roles` `["CASE_OFFICER","BILLING_FINANCE"]` · 200, one roles line, one separate money-keys line naming the keys.
2. **Double click** · the same PATCH again · `changed:false`, no second money line.
3. **Wrong role** · user-O (no `agent/role:assign`) tries to give user-R Owner · 403 `MISSING_PERMISSION`.
4. **Own versus all on a retainer** · Case Officer without `prospect:view.all`, view.all holder, representative, firm B · see the suite's DW6 (the isolated copy has no prospects: `fo_prospect` 0 rows).
5. **Unlicensed Case Manager signs off** · a route declaring `agent/case:form-approve` · 403 `NOT_LICENSED` "Only a licensed consultant can do this"; 200 once the licence record exists (suite DW5; no route in `api/src` declares a LICENCE key yet).
6. **Error / bad input** · `GET /api/front-office/retainers/<unknown uuid>` and `/retainers/not-a-uuid` as user-O · 404 "No such retainer in your firm.", never 500.
7. **Across the boundary** · the app boots with the catalogue (guard start-up check) · PF-4 part B against the real `main.ts` on :4436 (113/113).

## What happened
* J1: 200 `{"roles":["CASE_OFFICER","BILLING_FINANCE"],"changed":true}`. `audit_event` for O: `platform.staff.roles_changed` "roles changed: CASE_OFFICER → CASE_OFFICER, BILLING_FINANCE" and `platform.staff.money_keys_granted` "money permissions given with BILLING_FINANCE: 12 keys", detail `{roles:[BILLING_FINANCE], moneyKeys:[billing-report:view, billing:export, expense:create, invoice:create/edit/issue/list/show/void, payment:online, payment:record, refund:create]}`: key names only, no values.
* J2: `changed:false`; money lines for O still 1.
* J3: 403 `MISSING_PERMISSION` "Your roles do not include the permission this needs (agent/role:assign)."
* J4: suite DW6 green; the rule fails when either the setting or the key is removed from `seesAll`.
* J5: suite DW5 green (403 `NOT_LICENSED`, then 200; without the key stays `MISSING_PERMISSION`).
* J6: 404 both, 8 ms.
* J7: copy started; catalogue 233 rows (16 MONEY, 3 LICENCE).

## Break-it (15 min)
Double submit (J2, held) · wrong role by URL (J3, held) · malformed id (J6, held) · a bundle that hands out a money key stops start-up (suite DW3, held) · a leaky reader is caught by the sweep (DW6 fail half, held) · a database update that breaks scope/suffix is refused by the CHECK (DW2, held). Found: the licence set is read from data only, so a hand-edited catalogue row turns the licence check off silently (review Minor 2).

## Score
| criterion | score | evidence |
|---|---|---|
| task completed | 1 | J1, J4, J5 |
| next step obvious | ½ | 403 texts name the missing key; "Only a licensed consultant can do this" does not say a licence record is what is missing (wording fixed by the ruling) |
| plain words | 1 | NOT_LICENSED text as ruled; audit summaries plain |
| feedback and state | 1 | `changed:false` on repeat; one line each |
| correct data | 1 | exactly one money line, keys = the role's MONEY catalogue rows, nothing else changed |
| error recovery | 1 | 403/404 with codes, no 500 |
| accessibility and screen sizes | 1 (N/A) | no screen in this row |
| speed | 1 | 8 ms 404; one extra small query per visibility check |
| visual quality | 1 (N/A) | no screen in this row |
| trust and sources | ½ | SA-06 quote verified; P-612 (departure from SA-6-27) recorded in the PR comment but not yet cited at `guard.ts:89` |

**9 / 10, pass** (no 0). On the eight applicable criteria: 7 / 8. Raise it: cite P-612 at the guard check (trust); nothing else in scope.

## Not tested
A real screen reader, any UI (none in the row), Cognito sign-in, an intended user's unaided walk (D17/D20 stay with the founder).
