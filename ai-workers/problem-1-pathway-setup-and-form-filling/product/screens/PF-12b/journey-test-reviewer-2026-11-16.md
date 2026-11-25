# PF-12b part 1: journey test (reviewer), 16 Nov 2026

Commit `ccbc1825b`. Runtime row with no screen, so the journeys go through HTTP on an isolated copy at **:4433** (runtime lane; never :4400). The copy ran `main.ts` with `PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on` and its own database `xr_studio_rv12b`. A scratch break script used the app's walled client (xr_app). The database was read after each step.

## Journeys
1. **Platform operator starts the app (main path).** Goal: new firms get a web address, and each firm's trail shows it. Result: 2 `platform.bypass` lines (`platform.web-address.catch-up`), one per Sample firm, actor `system:platform.web-address.catch-up`, method `none`.
2. **Content publisher resets the demo.** Step: `POST /api/demo/reset` (user-A, `RESET`) after firm A's language was set to "fr". Result: 2.5 s; A back to "en"; 1 line per firm, `POST`, correlation id from the request.
3. **Demo viewer opens the platform inbox.** Results:
   - an address with mail from both firms: 1 line per firm, `GET`, 30 ms;
   - an address with no mail: no line (no firm touched).
4. **Someone signs up with an existing staff email (alternate).** Result: 202 "check-email"; firm A's line (`platform.firms.signup`) is written before the "already have an account" mail.
5. **The trail cannot be written (error).** Break script, port fails for firm B only:
   - reset: A committed with its line, B rolled back, `BypassNotRecorded`;
   - sweep: nothing queued, no lines.
6. **Wrong route.** `platform.demo.inbox` called inside `GET /api/platform/staff`: `BypassRefused` before any query.
7. **Recovery.** A second reset after the failure finishes the job. The PR suite's DW2 pass shows the same.
8. **Across the boundary.** Sign-up verify after the email became firm A's staff: 409, with A's line written. A good verify writes the new firm's line in the creating transaction (suite DW4, same `xmin`).

## What held
- One line per firm touched, under that firm (`detail.firmId`), in the platform-audit workspace, so the demo wipe never deletes it.
- Fail-closed in every path tried.
- A hostile email-shaped `x-request-id` is replaced by a uuid.
- PF-4 suite 119/119 against this copy, part B included.

## Findings (full list in `review.md`)
- **Major:** a free-text `x-request-id` from an unauthenticated sign-up is stored verbatim in firm A's trail (`rv-signup-known`; `firm-scope.ts:188-191`, `observability/hook.ts:23`).
- **Minor:**
  - `touchFirm(db)` dedupes across separate uses: 2 uses gave 1 line (`firm-scope.ts:176-193`);
  - a per-firm use can read every firm with 0 lines: 4 staff rows, 0 lines;
  - the half-reset after a failed line (m5).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 to 4: every use touched every firm it read |
| Next step obvious | 1 | 500 "…so nothing was done. Try again in a minute."; a job retries |
| Plain words | 1 | The trail summary: "Our platform read or changed this firm's records across the firm walls (use)." |
| Feedback and state | ½ | The sign-up background refusal cannot be seen (by design). A failed reset answers 500 after the wipe |
| Correct data | ½ | A caller-chosen correlation id is stored. Concurrent touches can write duplicates (breaker m4) |
| Error recovery | 1 | Each firm's share rolls back; a retry finishes |
| Accessibility and screen sizes | 1 (N/A) | No screen; counted as met |
| Speed | 1 | Inbox 30 ms; full demo wipe and reset 2.5 s |
| Visual quality | 1 (N/A) | No screen; counted as met |
| Trust and sources | ½ | The line names the use, method and firm, but the caller can forge its correlation id |

**8.5/10, or 6.5 of the 8 criteria that apply.** Pass on the number, no 0, but the Major above stands. The fixes that would raise it, most valuable first:
1. Keep only server-made correlation ids in the trail.
2. Refuse a `touchFirm` given a client that is not a transaction.
3. Put the reset's platform step before the wipe, or say "partly reset" in the 500.

Could not test: a real user's unaided walk (D17/D20 stay with the founder); CI.
