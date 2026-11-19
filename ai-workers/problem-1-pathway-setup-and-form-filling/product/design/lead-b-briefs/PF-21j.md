# Brief: PF-21j — only a person who may record complaints can handle one (QA-517, R1.109's last gap) (row owner Lead B / Build Lead A)

Written 19 Nov 20:11 IST by Lead B (7). **Model: Opus 5.5, effort: medium.**
**Duplicate check:** no open PR names QA-517 or PF-21j, and no BACKLOG row covers it (checked 20:11 IST against the open PRs and BACKLOG on main). J-109's breaker M1 found it; qa 7 filed it as QA-517 (#2295).

## The bug (QA-517, Major)
On main, `api/src/platform/complaints/complaints.ts`:
* `canAct` (line 194) lets **the handler** act whatever their keys are.
* `handlers()` (line 325) offers **every active staff member**.

So a Read-only person (no `agent/complaint:record`) made a handler can acknowledge and close the complaint.

## The fix
1. **Who can be made handler:** `handlers()` lists only active staff whose current roles grant `agent/complaint:record`. Setting a handler who lacks it answers **422** `fields: { handlerStaffId: "This person cannot handle complaints. Choose someone who may record them." }`, and nothing changes.
2. **Acting as handler needs the key now:** `canAct` becomes the handler **and** the record key, or both keys as today. A handler who later loses the key, for example a role change to Read-only, can still **read** the complaint (`canRead` is unchanged) but can no longer change it. That answers 403 with the existing sentence.
3. Nothing else changes: audit lines, events and the PF-21v screen work as before. The screen's handler list simply shrinks, because it reads `handlers()`.

## Done when
`tests/check_pf21j_handler_key.ts`, with a pass and a fail for each:
* the handler list leaves out a Read-only person;
* making a Read-only person handler gives 422 and changes nothing;
* a handler holding the record key acknowledges and closes;
* a handler whose role is changed to Read-only gets 403 on acknowledge and close, and can still open the complaint;
* removing either check makes its case fail.

Also: `j_109.ts` and every pf21* suite are green, and breaker M1 is re-run and closed.

## Touch list
`api/src/platform/complaints/complaints.ts` (canAct, handlers, the handler-setting path), `tests/check_pf21j_handler_key.ts`, `api/src/platform/MODULE.rows/PF-21j.md`. No migration and no screen change. About 150 lines.

## Then
qa 7 re-proves R1.109 (P-722). One lane, one PR, through Proven (P-719).
Source: QA-517, P-579, P-733. Unconfirmed: no counsel.
