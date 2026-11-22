Entry points: PF-18h: `GET /api/platform/me/needs-you` (own only, `@AnyStaff`): my unread `MY_DEADLINES` notifications, newest first, at most 20, with `total`, each item's `caseNumber` and `link` from `linksOf`, and my zone (my office's, else the firm's, `OFFICE_CLOCK`).
Tests: tests/check_pf18h_home_browser.ts
