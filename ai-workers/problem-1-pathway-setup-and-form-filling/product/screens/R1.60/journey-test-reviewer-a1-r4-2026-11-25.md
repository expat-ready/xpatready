# R1.60 a1: journey test, round 4 (reviewer, 25 Nov 2026)

Head: `703c3bdccc43798f9461b747de6d9bd752828e88`. This round looks only at the diff from round 3 (`a2f21789b`): two audit action names, and a GRANT/REVOKE pair in the migration and its rollback. It is API only, so there is no screen and no browser walk.

How the journeys ran:
- through the builder's suite `tests/check_r160_deposit_prepare.ts` (47/0), plus `check_fo7ts_money_settings.ts` (157/0), `check_b164_no_engine_keys.ts` (67/0) and `check_pf8b_f4_migrations.ts` (9/9);
- my own replay of every migration on a scratch database, then this migration's rollback, then the migration again;
- everything on :54329, never :4400.

## Journeys (each: persona · goal · result)
1. **Representative, e-signing, firm on trust Yes** (main). One Prepared request, and one `trust_money.request_prepared` audit line by `system:signing-webhook`, in the completion's transaction. **Held** (case 1, `:144-147`).
2. **The same completion delivered again** (recovery). Still one request, and the count of `trust_money.request_prepared` lines is unchanged. **Held** (case 2, `:163-171`).
3. **Paper signing** (alternate). One `trust_money.request_prepared` line by `staff:<id>`. **Held** (case 3, `:186`).
4. **A deposit too large for one request** (error). Nothing is prepared, and one `trust_money.request_not_prepared` line names why. **Held** (`:247`).
5. **An auditor reads the audit trail** (the boundary to B164). No action reads as a combination key: every client-money trust line has the head `trust_money.`. **Held** (B164 67/0; grep).
6. **The operator deploys to RDS** (break it). The function goes to `xr_wall_reader` only inside a CREATE grant, and the grant is taken back. **Held** (F4 9/9; the probe shows no ACL entry for `xr_wall_reader`).
7. **The operator rolls back, then forward** (recovery). The same pair is in `rollback.sql`. Afterwards the function is a definer owned by the reader, the columns are gone and back, and no CREATE is left. **Held** (`:279-289`; probe).
8. **Raw SQL moves a Prepared request's version** (r3 m11). Unchanged by this diff. **Still open** (Minor, named).
9. **The representative opens Needs you** (the boundary). The item still has no words and no page. **Named gap**, unchanged.

## Data underneath
- The audit lines carry the new names. Each test query is an exact count, so a stale name would fail.
- After up, down and up, `public`'s ACL never lists `xr_wall_reader`.
- No scratch database was left behind.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J3 |
| Next step obvious | ½ | J9: the Needs you item has no words or page (named gap) |
| Plain words | 1 | The not-prepared summary names why and says "Bill it by hand" |
| Feedback and state | 1 | Prepared state; the audit names are readable (J5) |
| Correct data | 1 | J1-J7. m11 is reachable by raw SQL only |
| Error recovery | ½ | J2 and J7 hold; a held listener has no retry (named gap) |
| Accessibility and screen sizes | N/A | API only |
| Speed | 1 | The diff adds no work at runtime; the suite runs in about 10 s |
| Visual quality | N/A | API only |
| Trust and sources | 1 | The actor is named; tax is Sample; "Unconfirmed: no counsel" is in the migration header |

**7 of 8 applicable, scaled to 8.75/10: pass**, with no criterion at 0.

Fixes that would raise the score, most valuable first (unchanged from round 3):
1. Words and a page for the Needs you item.
2. A retry for a held listener.
3. (Data, m11) Hold a Prepared request's version in the database.

## Could not test
- A browser walk: there is no screen.
- A real screen reader.
- A real RDS instance: the local cluster runs as superuser.
- An intended user's unaided walk (D17, D20 stay with the founder).
