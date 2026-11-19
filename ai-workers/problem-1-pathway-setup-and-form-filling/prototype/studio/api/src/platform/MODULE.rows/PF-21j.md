Entry points: `/api/platform/complaints` (PF-21j, QA-517: only active staff whose roles grant `agent/complaint:record` can be made handler, on record and on handler change (422 at `handlerStaffId` otherwise), and `GET handlers` lists only them; a handler changes their complaint only while holding that key (403 otherwise), and still reads it).
Tests: tests/check_pf21j_handler_key.ts
