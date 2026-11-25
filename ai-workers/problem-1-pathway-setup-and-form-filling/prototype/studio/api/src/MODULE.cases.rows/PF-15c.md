Entry points: `POST /api/runtime/cases` (PF-15c: `Runtime.createCase` reads the firm's active individual or corporate case limit through the EntitlementPort made on its own transaction (`CaseLimits`); over it, or with no live plan, 409 `PLAN_LIMIT_REACHED`, nothing written; an unbound Runtime throws, never an allow-all).
Tests: tests/check_pf15c_case_limits.ts
