# PF-6m2 journey test: reviewer, 16 Nov 2026 (PR #2045, head 51fb031e6)

**Scope.** An API and audit fix with no screen in the diff and no Accept page on `main` yet. The journeys follow people through the API doors they use, and the data underneath.

**Where it ran.**
* An isolated copy `rev6m2` on :4447, as the caller set it, with `PLATFORM_IDENTITY=local` and `PLATFORM_SAMPLE_SEED=on`. It ran as the real app, on the `xr_app` role and the named bypass. It was stopped after use.
* Scratch databases on :54329. Never :4400. US$0.

**How the token was reached.** The local mail keeps the link in memory and has no inbox route. Each invitation was therefore made through the real invite door, and only its token hash was then swapped by SQL for one I knew. The roles and `invited_by` stay as the door wrote them.

**Score rule.** The screen criteria are scored ½ ("not exercised"), never 1.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | An Admin: "add our bookkeeper" | Admin T invites Billing/Finance; invitee opens it, then accepts | VALID, 200, one money line (12 keys) by `staff:<T>` | Held (accept 42 ms) |
| J2 error | Owner deactivates T before the invitee accepts | GET, accept, GET, accept | 410 with BR-4's words; nothing granted; invitation revoked; one `refused_inviter` line, reason `inactive` | Held: 410 "This invitation is no longer valid." (13 ms), 0 staff, revoked, 1 line, retry 410 with no second line. **But the GET before the accept said VALID, "Continue to set your password"** (m5). |
| J3 error | Admin O demoted to Case Manager after inviting | accept | 410; line `role_no_longer_givable` [BILLING_FINANCE] | Held |
| J4 alternate | Owner invites `[BILLING_FINANCE, READ_ONLY]` | accept | 200; money line actor `staff:<Owner>` | Held |
| J5 break | The inviter is deactivated, or demoted, at the same moment as the accept | 6 races each, staggered 0–15 ms | one outcome or the other, never both, never 5xx | Held. Demotion race: 3 accepted, 3 refused, each consistent. Deactivation race: 6 accepted, each consistent. 0 5xx in the log. |
| J6 recovery | Double click, or a replay | 3 accepts racing a deactivation | one 200, the rest 410 | Held (1 staff member, 1 money line) |
| J7 wrong input | Junk token, 43 characters and 500 characters | accept | 410, no 5xx | Held |
| J8 break | `invited_by` set by SQL to `system:seed` | accept | 410, refused cleanly | Held (reason `inactive`: m3) |
| J9 break | `invited_by` set by SQL to an active staff member of another firm | accept | 410; the firm wall holds under the bypass | Held (reason `inactive`, which is false here: m3) |
| J10 handoff | Firm signup's first Owner (the door to the Team screen) | DW3, in-process | 1 line `system:signup`, 16 keys; a refused signup writes none | Held (suite). Not walked live, because the local mail has no inbox route. |

## The data underneath
* **Refusal line.** Actor `system:invitation-accept`. Detail holds only `invitationId`, `invitedBy` (a staff id), `reason`, `roles` and `firmId`. No key name, no email.
* **Invitation.** `accepted_at` null, `revoked_at` set.
* **Seats.** A deactivated inviter's other pending invitations still count as seats until someone tries them (m5; this is older behaviour).
* **Accepted path.** It is unchanged: one staff member, the grant rows by the inviter, one money line.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | J1, J4 accepted; J2, J3 refused as the brief says |
| next step obvious | ½ | the GET says "Continue" for an invitation the accept will refuse (J2, m5) |
| plain words | 1 | BR-4's fixed words, exactly |
| feedback and state | 1 | the 410 code `INVITATION_NOT_VALID`; the GET after the refusal says NOT_VALID |
| correct data | 1 | in every journey and race, each record exists once, with nothing extra |
| error recovery | 1 | a retry writes no second line; a reactivated inviter's invitation accepts (suite break line) |
| accessibility and screen sizes | ½ | not exercised: no screen |
| speed | 1 | accept 13–42 ms |
| visual quality | ½ | not exercised: no screen |
| trust and sources | 1 | the refusal reason is recorded with role names only; the money line's actor is named (m4: two signup actor words) |
| **Total** | **8.5 / 10** | **Pass** (no 0) |

To raise it:
1. Make the GET state agree with the accept (m5), if the row owner rules so.
2. The screen criteria are scored once the Accept page exists.

## Could not test
* A real screen reader, a browser walk, 1024 px and zoom: no page exists.
* Real Cognito: only the local stand-ins ran.
* An intended user's unaided walk: D17 and D20 stay with the founder.
