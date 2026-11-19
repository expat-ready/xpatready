// FO-3a part 2a: the consult record of an attended booking (AG-4-49, AG-4-50), behind PF-4's guard. The booking ports
// (BOOKING_PORTS, for the audit port) come from front-office-booking.ts.
import type { Feature } from "../features.ts";
import { ConsultRecordController, ConsultRecords } from "../front-office/booking/consult/controller.ts";

export default { controllers: [ConsultRecordController], providers: [ConsultRecords] } satisfies Feature;
