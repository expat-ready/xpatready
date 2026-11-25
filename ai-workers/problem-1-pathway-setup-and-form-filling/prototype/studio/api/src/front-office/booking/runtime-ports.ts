// FO-3: the ports the running app gives the booking service, until each real adapter is on main. Audit is real (PF-0p's
// interim AuditPort over audit_event); the clock is the system's; jobs are PF-14's runner (pg-boss), which the Booking
// provider takes from the app (FO-3f item 2), so they are left out here. Mail is the app's MailPort over MessagePort
// (PF-19b: the outbox, the gate, the worker; the local adapter's mail is read at GET /api/demo/platform-inbox; qa #1855).
// Interim, named for the row that replaces it:
//   * arrival: FO-2 part 3b's PrismaArrival (sales/arrival-port.ts: the one arrival path, door BOOKING); fakeArrival
//     stays for the suites that pass it in.
import { PrismaArrival } from "../sales/arrival-port.ts";
import { systemClock } from "../../../../ports/clock.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import type { OfficeClockPort } from "../../../../ports/offices.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { consentStore } from "../../platform/messages/consent/index.ts";
import type { GivenBookingPorts } from "./service.ts";

/** `offices`: platform's OFFICE_CLOCK (PF-18a DW6: the host's mails state the host's office zone). */
export function runtimeBookingPorts(mail: MailPort, offices?: OfficeClockPort): GivenBookingPorts {
  return {
    audit: auditEvent, clock: systemClock, mail, offices, arrival: new PrismaArrival({ audit: auditEvent, consent: consentStore }),
    publicBaseUrl: process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}`,
  };
}
