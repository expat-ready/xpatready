Entry points: FO-9a phone part (R1.33): `PATCH /api/front-office/people/:personId` with `{ phone }` only (key `agent/prospect:edit`; own or all as FO-2v, else 404), in `people/edit.ts`; an unreadable number → 422 `fields.phone`, nothing saved; a readable one kept in E.164 (Fix number cleared); one audit line `front_office.person.phone_changed`, ids only, never the number
Tables: foPerson
Tests: tests/check_fo9a_phone_edit.ts, tests/journeys/j_33.ts
