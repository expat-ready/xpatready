Entry points: PF-18s part 1: `PUT /api/platform/staff/:staffId/office` (`agent/staff:manage`; `{officeId: uuid | null}`; another firm's person or office 404; no change writes nothing), `GET /api/platform/offices/provinces` (`agent/settings:edit`; the pack's codes and pre-filled zones), `officeId` on `GET /api/platform/staff` rows.
Tests: tests/check_pf18s_offices_browser.ts
