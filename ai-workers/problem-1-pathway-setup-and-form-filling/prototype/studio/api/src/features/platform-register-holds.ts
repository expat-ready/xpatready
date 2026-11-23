// PF-21b part 2 (R1.85): legal holds. Our console's routes (/api/system/register/holds), the service, and LegalHoldPort's
// real adapter, which is also what AUD-5's delete check asks first (KEEP_CHECK_HOLDS: KeepPeriods.check refused with
// KeepCheckNotBuilt until this was wired). Every feature's providers share one module, so the token reaches KeepPeriods.
import type { Feature } from "../features.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { KEEP_CHECK_HOLDS } from "../platform/keep-period/service.ts";
import { PgLegalHolds } from "../platform/register/holds/adapter.ts";
import { LegalHoldController } from "../platform/register/holds/routes.ts";
import { LEGAL_HOLD_AUDIT, LegalHolds } from "../platform/register/holds/service.ts";

export default {
  controllers: [LegalHoldController],
  providers: [PgLegalHolds, { provide: KEEP_CHECK_HOLDS, useExisting: PgLegalHolds }, { provide: LEGAL_HOLD_AUDIT, useValue: auditEvent }, LegalHolds],
} satisfies Feature;
