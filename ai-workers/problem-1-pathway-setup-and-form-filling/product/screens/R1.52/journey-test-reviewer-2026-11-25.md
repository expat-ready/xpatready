# R1.52 part 1 (PF-19m): journey test, reviewer role, 25 Nov 2026

Head ca2e17127b1830b458544077e39ec7c31705ab43 (I also re-ran 4e2c002: 35/35). This item is schema-only, so there is no page to walk.
The person's journeys are walked at the database surface that parts 3–5 will use: the API's role `xr_app`, with the session's firm set
exactly as `firm-scope.ts` sets it. I used my own scratch databases (`xr_studio_rv_pf19m` plus the test's `_<pid>` copies) and started no
server or port (never :4400). Probe script: `/tmp/claude-0/-home-user-xpatready/e001dfb8-0ec6-5c8f-b421-8a78eb293e01/scratchpad/probe/probe.sh`.

## Journeys (persona, goal, steps, then what happened)
1. **Main path, the Admin connects the firm mailbox:** insert info@ as CONNECTED with a sealed value and is_main. Accepted. Its row is
   readable in firm A's session only.
2. **Alternate, an Agent connects their own mailbox:** insert with owner_staff_id. Accepted. Trying to make it main gets 23514.
   Owning it as firm B's staff member gets 23503.
3. **Inbound email files itself:** insert the email, then update only its filing (by RULE with the rule `thread`). Accepted. Changing
   the subject or sender afterwards gets 23514. The same provider id again gets 23505.
4. **Unknown sender lands in Unmatched, the Admin links it:** an Unmatched row with suggestions as a list is accepted. An object instead
   of a list gets 23514. LINKED without who resolved it gets 23514. The address link is stored in lower case.
5. **Empty:** a session with no firm reads 0 rows, and its insert gets 42501.
6. **Error, a raw token:** writing `plain-access-token…` to the credential gets 23514. CONNECTED with no credential gets 23514.
7. **Wrong firm:** firm B's session reads, updates and inserts nothing of firm A's (0 rows or 42501). An email naming another firm's
   mailbox gets 23503.
8. **Recovery, disconnect and connect again:** DISCONNECTED with its credential cleared. The purge deletes unfiled email and its
   Unmatched row goes too (under the walls). Filed email is kept. Reconnecting the same address is a new row. **But** a late sync
   insert into the DISCONNECTED mailbox is accepted (review m1).
9. **Boundary to part 3, the Admin changes the main address "in one click":** a one-statement swap gets 23505; two statements in one
   transaction work (review m7).
10. **Reload or double click:** a second identical insert gets 23505 on (firm, mailbox, provider id), so a double-run sync makes one row.

## Replayed as automated checks
`tests/check_pf19m_mailbox_schema.ts` covers journeys 1–8 and 10 (35 lines, run at both heads, 0 failures, about 20 s each). Six
mutations were run: five fail as they should; the DISCONNECTED-not-main rule has no failing case (review m8). axe, widths,
keyboard and timings are N/A because there is no page.

## Data underneath
After each journey the rows exist once with exactly the values written. Demo rows (firms, staff, msg_firm, audit_event) are unchanged
by the migration. A full `prisma migrate diff` reports no difference. The migration writes no data.

## Break it (15 min)
Accepted when it should not be: an insert into a DISCONNECTED mailbox (m1); an OPEN Unmatched row on a filed email (m3); a `fake1.` value
that carries the token in base64 (m6); upper-case `to_addresses` (m5). A two-step un-file and delete removes a filed email (m2;
probably intended). TRUNCATE as xr_app is refused (42501). No Blocker or Major came from breaking it. The one Blocker (the SPD-2
folder name) is a pipeline refusal, fixed in 4e2c002.

## Score (each 0, ½ or 1; N/A where nothing is visible; scaled to 10 over the 8 that apply)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Every Done-when line holds with a pass and a fail case (35/35) |
| Next step obvious | ½ | Hand-over to PF-19mc: shape.md is stale against Lead 5's rulings (m9); the swap and purge race are unstated (m1, m7) |
| Plain words | 1 | Errors read "a filed email is kept (only unfiled email is purged)" and "a disconnected mailbox stays disconnected …" |
| Feedback and state | 1 | Each rule has its own SQLSTATE (23505 / 23514 / 23503 / 42501) that the later parts can map |
| Correct data | ½ | No drift and demo rows kept; a late insert after disconnect and inconsistent Unmatched rows are accepted (m1, m3) |
| Error recovery | ½ | Disconnect and reconnect work; a one-statement main swap fails (m7) |
| Accessibility and screen sizes | N/A | No page |
| Speed | 1 | The migration applies in well under a second on the demo copy; the suite takes about 20 s with three databases |
| Visual quality | N/A | No page |
| Trust and sources | 1 | Every rule cites AG-10 / AG-16 / SA-11 and P-600; the credential is sealed only (with the m6 caveat) |

**Score 6.5 of 8 applicable, which is 8.1/10. Pass (8 or more, no criterion at 0).**
To raise it, most valuable first: refuse inserts into a DISCONNECTED mailbox and freeze its cursor (m1); record Lead 5's rulings in
shape.md (m9); add the missing failing case and the exact-code asserts (m8).
Could not test: a real screen reader and an intended user's unaided walk (D17 and D20 stay with the founder). There is no UI in this part.
