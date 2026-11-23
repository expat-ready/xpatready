Entry points: PF-18s part 1: `PUT /api/platform/staff/:staffId/office` (`agent/staff:manage`; `{officeId: uuid | null}`; another firm's person or office 404; no change writes nothing), `GET /api/platform/offices/provinces` (`agent/settings:edit`; the pack's codes and pre-filled zones), `officeId` on `GET /api/platform/staff` rows.
Tests: tests/check_pf18s_offices_browser.ts
Entry points: PF-18s part 2: `GET /api/platform/support/tickets` items and `GET …/tickets/:id` answer `subject` (first line, ≤ 80) and `raisedByName`; one ticket's staff messages answer `authorName` (platform_staff in the ticket's firm, no key: AG01-28).
Tests: tests/check_pf18s_help_browser.ts
