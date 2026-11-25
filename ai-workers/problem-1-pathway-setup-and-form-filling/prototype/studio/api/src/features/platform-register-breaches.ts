// PF-21c (R1.86): ExpatReady's breach register and the notices to affected firms. Our console's routes
// (/api/system/register/breaches) and the service; the notices go through PF-19b's MessagePort (MESSAGE_PORT), and their
// words are read back through the same module's MessageWordsPort (PF-21rs R0, QA-757).
import type { Feature } from "../features.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { BreachController } from "../platform/register/breaches/routes.ts";
import { BREACH_AUDIT, BREACH_MESSAGES, BREACH_WORDS, Breaches } from "../platform/register/breaches/service.ts";
import { MESSAGE_PORT } from "./platform-messages.ts";

export default {
  controllers: [BreachController],
  providers: [{ provide: BREACH_AUDIT, useValue: auditEvent }, { provide: BREACH_MESSAGES, useExisting: MESSAGE_PORT }, { provide: BREACH_WORDS, useExisting: MESSAGE_PORT }, Breaches],
} satisfies Feature;
