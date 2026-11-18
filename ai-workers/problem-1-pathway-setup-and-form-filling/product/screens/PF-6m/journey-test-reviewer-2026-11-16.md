# PF-6m journey test: reviewer, 16 Nov 2026 (PR #1945, head ff0ef12a8)

Scope: an API and audit fix (QA-478), with no screen in the diff. The journeys below follow people through the API doors they use, plus the audit data underneath. No visible-browser walk was possible, because no page changed; the screen criteria are scored ½ ("not exercised"), never 1. Isolated copies ran on :4436 and :4437 (runtime ports) and scratch databases on :54329. Never :4400. US$0.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Owner: "add our bookkeeper, and have the money access on record" | Owner invites a Billing/Finance person; invitee opens the link; accepts | 200, set-password hand-off; one `platform.staff.money_keys_granted` line with 12 keys, actor = the Owner | Held (qa QA-478 on :4436: before 0, after 1; PF-6m DW1) |
| J2 alternate | Owner invites a Read-only helper | accept | 200; no money line | Held (DW1 fail line) |
| J3 alternate | Owner invites a Case Officer (4 money keys) | accept | one line, 4 keys | Held |
| J4 two roles | Invite `[READ_ONLY, BILLING_FINANCE]` | accept | one line naming only BILLING_FINANCE | Held |
| J5 error | Invitee accepts while the sign-in provider refuses | accept → 500 | nothing kept: no staff row, no line, invitation still usable | Held (DW2); a later accept commits with one line |
| J6 recovery | Invitee double-clicks or replays the link | second accept | 410 "not valid", no second line | Held (sequential here; 12 in parallel in the break report) |
| J7 other door | Admin changes O's roles to add Billing/Finance | PATCH roles | the same line as before PF-6m, byte for byte | Held (DW3; also against main's own service.ts) |
| J8 wrong role | Case Officer tries to change roles | PATCH | 403, no line | Held (break report; PF-6b 24/24) |
| J9 boundary | Accepted invitee goes on to set a password and sign in | hand-off → session | unchanged | Held (PF-4b 53/53, PF-4 119/119) |

## Data underneath
For every accept, I read the line from `audit_event`. Entity `platform_staff`, key = the new staff id. Summary "Firm sample-firm: money permissions given with BILLING_FINANCE: 12 keys". `detail` = {firmId, firmKey, staffId, roles, moneyKeys}, key names only. The actor `staff:<inviter>` equals the grant rows' `granted_by`. Mutations confirmed that each check fails when its rule is removed (see review.md).

## Break pass (from review mutations and the breaker's report)
* Minor F2: two parallel first accepts on an empty DB, and one answers 500. Only an empty DB can reach it.
* Minor F1: a deactivated inviter's open invitation still grants money keys. Older code, now visible in the audit.
* Nothing at Blocker or Major.

## Score (0 / ½ / 1, with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J4 lines written; QA-478 PASS on :4436 |
| Next step obvious | 1 | the accept answer still carries `handOff: set-password` (QA-478 output); PF-4b 53/53 |
| Plain words | ½ | the audit summary names role codes ("BILLING_FINANCE"), not role names; the format is frozen by DW3 |
| Feedback and state | 1 | 200 / 410 / 500 answers unchanged; replay gives 410 INVITATION_NOT_VALID |
| Correct data | ½ | the line is exact, and mutations prove it; but the line can name a deactivated inviter (F1), and keys already held are counted (F3, frozen) |
| Error recovery | 1 | J5: full rollback, and a retry commits |
| Accessibility and screen sizes | ½ | no screen in the diff; not exercised |
| Speed | 1 | accept 27–48 ms, role change 52 ms (timed on this head); no per-row request |
| Visual quality | ½ | no screen in the diff; not exercised |
| Trust and sources | 1 | names the actor and the keys only; no token, email or licence number (break-report scan); no AI |
| **Total** | **8 / 10** | **Pass** (8 or more, no 0) |

To raise it (most valuable first; none is scope for this row): record the invitation on the money line or end the inviter's open invitations on deactivation (F1, a BUGS row). Use role names in audit summaries (a later audit row).

Could not test: a real screen reader, an intended user's unaided walk (D17 and D20 stay with the founder), real Cognito.
