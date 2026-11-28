// AUD-3b part 1 (R1.87): our staff's read-only support session into one firm (api/src/platform/support-session/): its
// start route and the interceptor that checks and marks each /api/system call made in a session. Loads after
// audit-access.ts (by file name), so its interceptor runs inside AUD-3's SystemAccessLines.
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { Feature } from "../features.ts";
import { SupportSessionCalls, SupportSessionController, SupportSessions } from "../platform/support-session/service.ts";

export default {
  controllers: [SupportSessionController],
  providers: [SupportSessions, SupportSessionCalls, { provide: APP_INTERCEPTOR, useExisting: SupportSessionCalls }],
} satisfies Feature;
