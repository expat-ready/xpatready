Entry points: `/api/platform/complaints` (PF-21i: `POST` needs an `Idempotency-Key` header and is idempotent by it: one complaint per firm and key, the same key and body answers the first (200, nothing written), another body 422, STANDARDS §4); `idempotency.ts` (PF-21i: `readIdempotencyKey`, `requestHash`, `lockRequestKey`, for every idempotent create).
Tests: tests/check_pf21i_idempotent.ts
