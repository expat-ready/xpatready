// FO-3: the booking API (public door; FO-3sr: the staff routes behind PF-4's guard).
import type { Feature } from "../features.ts";
import { Booking, BOOKING_PORTS, BookingPublicController } from "../front-office/booking/public.controller.ts";
import { runtimeBookingPorts } from "../front-office/booking/runtime-ports.ts";
import { BookingStaffController } from "../front-office/booking/staff.controller.ts";
import type { MailPort } from "../../../ports/mail.ts";
import type { OfficeClockPort } from "../../../ports/offices.ts";
import { OFFICE_CLOCK } from "../platform/settings/offices/clock.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

export default { controllers: [BookingPublicController, BookingStaffController], providers: [Booking, { provide: BOOKING_PORTS, useFactory: (mail: MailPort, offices: OfficeClockPort) => runtimeBookingPorts(mail, offices), inject: [MESSAGES_MAIL, OFFICE_CLOCK] }] } satisfies Feature;
