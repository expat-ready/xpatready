// FO-3: the ports the running app gives the booking service, until each real adapter is on main. Audit is real (PF-0p's
// interim AuditPort over audit_event); the clock is the system's; jobs are PF-14's runner (pg-boss), which the Booking
// provider takes from the app (FO-3f item 2), so they are left out here. Interim, each named for the row that replaces it:
//   * mail: PF-0p's fakeMail (kept in memory, nothing leaves the machine) until PF-4b's sending adapter;
//   * arrival: fakeArrival (people kept in memory) until FO-2 implements ArrivalPort in api/src/front-office/sales/.
import { fakeArrival } from "../../../../ports/arrival.ts";
import { systemClock } from "../../../../ports/clock.ts";
import { fakeMail } from "../../../../ports/mail.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import type { GivenBookingPorts } from "./public.controller.ts";

export function runtimeBookingPorts(): GivenBookingPorts {
  return {
    audit: auditEvent, clock: systemClock, mail: fakeMail(), arrival: fakeArrival(),
    publicBaseUrl: process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}`,
  };
}
