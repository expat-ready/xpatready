Entry points: FO-5d part 1: signing/decline.ts `declineSigning(tx, audit, { firmId, signerId, reason?, at, via })` (no route: FO-6 part 4's door and FO-5d part 2 call it in their transaction, as the firm) and `declineReasonOf` (optional, trimmed, 1-500; else DeclineReasonInvalid → 422)
Tables: foSigner (FO-5d part 1: decline_reason, migration 20261123000000_fo5d_decline_reason: set only with declined_at, never changed)
Tests: tests/check_fo5d_decline.ts
