Entry points: PF-4s: `platform-system-identity.ts` registers `SystemIdentityController` and `SystemStaffController` (/api/system/*), `SystemIdentity`, `SystemStaffAccess`, `SystemPlaneWall` and `SystemGuard` (APP_GUARD, after PF-4's guard).
Tests: tests/check_pf4s_system_signin.ts (R1.5: sign-in, the /api/system guard, step-up and staff access, DW1-DW8)
