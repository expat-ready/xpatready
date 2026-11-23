Entry points: PF-30s: `FindBox` (`modules/platform/find/find-box.tsx`; words and grouping in `find-words.ts`), the one find box in PlatformFrame's and SalesFrame's top bar: "/" opens it, it reads `GET /api/platform/find` (PF-30a) only and stores nothing typed.
Tests: tests/check_pf30s_find_box_browser.ts
