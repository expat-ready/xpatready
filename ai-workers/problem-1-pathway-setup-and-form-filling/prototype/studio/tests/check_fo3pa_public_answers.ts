// FO-3pa (rows rev 16.23; concept fo-3-booking r2 §3 BR-1..BR-11, §6; AG-4-16..-20, -36..-38): the public booking
// answers. Named cases (P-606), each with a passing and a failing case, written before the build:
//   DW1 the list shows only active shown types, no id; an unknown firm gives the one not-found (BR-2)
//   DW2 a hidden type's page gives the same not-found as an unknown slug
//   DW3 booking without the tick succeeds and records no marketing consent; with the tick, one consent with the wording id
//   DW4 the answers carry the firm's contact details and the limit hours, never a staff or firm id
//   DW5 allowCancel false refuses a cancel by link, booking unchanged
//   DW6 the .ics download equals the mailed invite (UID, SEQUENCE, UTC instants); a voided token gives 404
//   DW7 the cancel reason is kept in the audit only, never shown back on the public page
//   DW8 the join link is shown only after confirmation, never on the type page
// Not built yet (PR #1830 waits on the question for the tech lead: three type columns and the arrival port's consent):
// until then every case reports FAIL, so this file never passes by being empty.
//   tsx studio/tests/check_fo3pa_public_answers.ts
const CASES = ["DW1", "DW2", "DW3", "DW4", "DW5", "DW6", "DW7", "DW8"];
for (const c of CASES) console.log(`FAIL  ${c} — not built yet (PR #1830)`);
console.log(`\n0 passed, ${CASES.length} failed`);
process.exit(1);
