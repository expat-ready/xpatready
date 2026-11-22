Entry points: PF-18s part 1: `/platform/offices` (`modules/platform/settings/offices-page.tsx`, My account → Offices for `agent/settings:edit`; `OfficePanel`, `PlacePanel`, `offices-contract.ts`).
Tests: tests/check_pf18s_offices_browser.ts
Entry points: PF-18s part 2: the "?" in PF-6's frame (`modules/platform/settings/help-button.tsx` `HelpButton`, `RaisePanel`; one slot in `frame.tsx`), `/platform/support` and `/platform/support/:id` (`support-page.tsx`, My account → Help & support for `agent/support-ticket:list`; `support-contract.ts`); `staffApi` takes an optional multipart `form`.
Tests: tests/check_pf18s_help_browser.ts
