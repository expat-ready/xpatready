Entry points: PF-16 trial banner: `modules/platform/trial-banner.tsx` (TrialBanner, mounted once in `modules/platform/frame.tsx` for every signed-in page; asks only with `agent/subscription:pay`; query key `["pf", "billing-banner", token]`)
Tests: `tests/check_pf16_banner_browser.ts`
