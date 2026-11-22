# Question for the tech lead: R1.42's "staff outcome route and consult record" are already on main (runtime builder, 20 Nov)

Asked: build "the staff outcome route and the consult record (FO-3a's later parts, FO-3w-staff)" for R1.42.

Finding: both are merged; qa's Partial (18 Nov 12:xx IST, main 39c1203cd) was read before the consult record merged.

| Part | Route | Merged | Proof on main (568e240fd, run 20 Nov, scratch databases, US$0) |
|---|---|---|---|
| Outcome (FO-3sr = FO-3w-staff; FO-3m) | `POST api/front-office/bookings/:id/attendance` (`COMPLETED` / `NO_SHOW`; host or `agent/booking:edit`) | e96a6f5a6, 15 Nov (in qa's snapshot) | `check_fo3sr_routes.ts` 29/29 (DW5: READ_ONLY on another's → refused; W1 attendance → `booking.completed`); `check_fo3m_answers.ts` 14/14 (`MAYBE`, `{}`, extra `note` key → 400; READ_ONLY → 403 `MISSING_PERMISSION`) |
| Consult record (FO-3a part 2a) | `GET`/`PUT api/front-office/bookings/:id/consult-record` | 0092492a7, merged 18 Nov 18:27 UTC (after qa's run) | `check_fo3a2_consult_record.ts` 39/39 (DW1 only after Attended; DW2 EUR / no currency refused; DW3 wrong role → 404; DW7 one audit line per save, fail-closed; `createdBy`/`updatedBy` + timestamps stored) |

Who and when for the outcome: AG-4-39 rule 3 asks only for the status, the event and (rule 4) re-emit on change. The audit line (`booking.completed` / `booking.no_show`, actor, time, from → to) holds who and when; there are no attendance columns on `fo_booking`. That matches the requirement; it is not a gap.

Duplicate check: open PRs (REST, 20 Nov) — #2322 (FO-3st1 part 1, the screen, R1.38/R1.39) and #2108 (records) only; no open PR names R1.42; FO-3a1c/1d are other parts.

Recommendation: no build PR. Send R1.42 to qa for re-proof (`/qa capability R1.42`) against current main. The client-link half was proven by QA-496's walk. What's left is a J-42 walk (attendance on FO-3st1's booking detail, #2322; the consult record has no screen yet: FO-3st1's consult record part is not built), which is J-42's row, not FO-3a's.
