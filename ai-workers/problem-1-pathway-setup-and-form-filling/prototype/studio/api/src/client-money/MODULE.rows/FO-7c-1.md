Entry points: `/api/front-office/money/payment-account` (FO-7c part 1): `POST onboarding` (key `agent/payment-rail:connect`, step-up), `GET`; the public door `POST /api/hooks/stripe-connect` (signature first); `card/rail.ts` `CardRail` (client money's own rail, `fakeCardRail`, `card/stripe-rail.ts`).
Tests: tests/check_fo7c_card_payments.ts
