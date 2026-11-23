Entry points: `GET /api/platform/billing/banner` (PF-16 trial banner: `billing/banner.ts` BillingBanner; Owner and Admin by `agent/subscription:pay`, @HoldOpen; reads our platform_subscription and BillingPort only; days left from the stored trial end, a part day counted, amber in the last 3 days; not in a trial → show false; nothing written)
Tests: tests/check_pf16_banner_browser.ts
