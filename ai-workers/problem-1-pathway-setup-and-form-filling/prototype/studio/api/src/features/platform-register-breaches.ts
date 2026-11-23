// PF-21c (R1.86): ExpatReady's breach register and the notices to affected firms. Our console's routes
// (/api/system/register/breaches) and the service; the notices go through PF-19b's MessagePort (MESSAGE_PORT).
import type { Feature } from "../features.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { BreachController } from "../platform/register/breaches/routes.ts";
import { BREACH_AUDIT, BREACH_MESSAGES, Breaches } from "../platform/register/breaches/service.ts";
import { MESSAGE_PORT } from "./platform-messages.ts";

export default {
  controllers: [BreachController],
  providers: [{ provide: BREACH_AUDIT, useValue: auditEvent }, { provide: BREACH_MESSAGES, useExisting: MESSAGE_PORT }, Breaches],
} satisfies Feature;
