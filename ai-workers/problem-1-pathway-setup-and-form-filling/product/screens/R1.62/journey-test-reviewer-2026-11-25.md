# Journey test (reviewer): R1.62 PF-4p part 1, head 2e8acf6987ce2c3cbef01ec730a4afb741b81855

Reviewer, 25 Nov 2026. Part 1 is API only, so the "walk" is a client's requests against the full app. I ran `api/src/main.ts` on :4447 with `PLATFORM_IDENTITY=local`, every migration and the Sample seed. Portal accounts were seeded by SQL, since the invite is part 2.
I seeded:
* Amélie Đỗ-Nguyễn (firm A), with case C-2026-09001;
* Client B (firm A), with C-2026-09002 and the stage words "Client B secret stage";
* Client C (firm B), with C-2026-09003.

Every request went through the real middleware and all guards (ConfigReadGuard, PF-4, PF-4s, ClientGuard, PF-12's interceptor). The copy was stopped and its database dropped afterwards. Never :4400.

## Journeys (persona: client; "staff" = the firm's Case Manager)
| # | Journey (goal in their words) | Steps | Expected | Happened |
|---|---|---|---|---|
| 1 | "Let me in and show me my case" (main) | sign in with `"  Amelie@Example.TEST "` → `/me` → `/cases` → `/cases/<own>` | 200 each; my name, firm, one case with its stage in client words | 200 in 12-22 ms; name kept accents; `stage: "Getting your application ready"`, `open: true` |
| 2 | Alternate: capital id | `/cases/<OWN ID IN CAPITALS>` | the same case | 200 (suite DW2) |
| 3 | Empty: a person with no cases | read the code path | empty list, no error | not walked or tested directly; `ownCases` returns `[]` early (`service.ts:145`) |
| 4 | "Show me someone else's case" (wrong person by URL) | `/cases/<Client B's id>`, `/cases/<firm B's id>`, `/cases/not-a-uuid` | one neutral 404; nothing of B anywhere | 404 "No such case." each, the same bytes; B's number and stage words absent from my list |
| 5 | Wrong plane: staff token on the portal; my token on staff routes | `/api/portal/me` with staff token; mine on `/api/platform/me`, `/api/front-office/money/...`, `/api/system/me`, `/api/runtime/cases` | 401 / 401 / 401 / 403 | as expected; the staff token's detail: "not one this server issued for a client portal" |
| 6 | Error: no token, forged token | no header; `sub` swapped with the old signature; `alg:none` | 401 each | 401 NOT_SIGNED_IN; 401 token-refused (twice) |
| 7 | Recovery: sign out, sign in again; reload after sign-out | `session/end` → old token → new sign-in | old 401 SESSION_ENDED; new works | as expected; a second `session/end` with the old token → 401 |
| 8 | Paused while signed in | account set SUSPENDED mid-session, then ACTIVE | 401 "paused, contact your firm"; restored | as expected (title says "Sign in again", review m6) |
| 9 | Firm closed | firm B set DELETED: Client C's token and door | 401 "This firm's portal is closed" | as expected, both; **no suite test** (review m1) |
| 10 | Across the boundary | the token and `/me` are what part 4's Home reads; the case list shape is part 4's input | stable shape | `{caseId, caseNumber, title, stage, open, openedAt, closedAt}`; `/me` `{accountId, email, name, firm{key,name}}` |

## Data underneath
* After journey 1, `platform_client_account.last_sign_in_at` is set once, and one `audit_event` line exists:
  - `actor_type CLIENT`, `actor person:<fo_person id>`, `action platform.client.sign_in`;
  - before and after values present, no email on the line.
* Ten parallel sign-ins: 10 × 200, 11 lines in total with 11 distinct sign-in times (the row lock holds).
* Nothing else changed: the account count stayed at 3, and no case or person row was written.

## Break it
| Try | Result | Severity |
|---|---|---|
| 10 parallel sign-ins | each recorded once, times strictly increasing | none |
| 400-character email; array body; missing email; unknown field `password` | 422 naming the field each; unknown field (suite) 422 naming it | none |
| Forged `sub`, `alg:none`, changed signature, token of another plane | 401 | none |
| `/API/PORTAL/CASES/<B's id>` in capitals | 200 web app HTML, no data (same for `/API/SYSTEM/me`: BACKLOG PF-4pc) | none for this part (note in review) |
| Path traversal `/cases/../../api/platform/me` | normalised by the client; plain 404 | none |
| Suspend mid-session, sign out twice, closed firm | refused at the next request | none (titles: review m6) |

## Replay (automated)
`tests/check_pf4p_client_identity.ts` covers journeys 1, 2 and 4-8 as pass/fail checks: 51/51 at head, run three times, no flake. Journey 9 has no check (review m1).
There is no browser, axe or width run: no screen exists in this part. Part 4 owns 375/1024/1440, keyboard and axe.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1: signed in, own case listed and opened |
| Next step obvious | 1 | Each refusal says what to do: "Sign in again", "Contact your firm", "Open the invitation your firm sent you" |
| Plain words | ½ | Details are plain. Paused and closed refusals carry the title "Sign in again", which cannot help (m6) |
| Feedback and state | 1 | A distinct code per state: NOT_SIGNED_IN, SESSION_ENDED, CLIENT_PAUSED, CLIENT_REVOKED, CLIENT_NOT_ACTIVE, FIRM_CLOSED |
| Correct data | 1 | Exactly my cases; one line per sign-in under a race; nothing else written |
| Error recovery | 1 | Sign-out then sign-in in the same millisecond works; reactivation restores the session |
| Accessibility and screen sizes | 1 | No screen: scored as a consumable contract (RFC 9457, field-level 422) |
| Speed | 1 | 7-22 ms per call on the Sample data |
| Visual quality | 1 | No screen: one consistent answer shape for list and item |
| Trust and sources | 1 | No AI. Who acted is on every audit line, typed CLIENT |

**Score: 9.5 / 10. Pass** (8 or more, no 0).
To raise it, give paused, revoked and closed refusals their own title (m6).

## Not tested
Cognito (not wired), a real screen reader, any screen (part 4), and an intended client's unaided walk (D17/D20 stay with the founder).
