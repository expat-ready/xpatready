Entry points: `case-document-door.ts` (CS-D1u, R1.64 part 4): `CaseStaffDoor` registers the case side's `STAFF` upload door on `UploadDoors` at module start, with the bound `LocalFiles` store; nothing when the rail's feature is absent (so check_pff2_* register their own test door).
Tests: CS-D1u: `tests/check_csd1u_staff_door.ts`.
