// FO-3: the booking API (public door; FO-3sr: the staff routes behind PF-4's guard; FO-3a part 2b: the staff read feed,
// registered before the staff routes so `feed` is never read as a booking id).
import type { Feature } from "../features.ts";
import { BookingFeed, BookingFeedController } from "../front-office/booking/feed.ts";
import { Booking, BOOKING_PORTS, BookingPublicController } from "../front-office/booking/public.controller.ts";
import { runtimeBookingPorts } from "../front-office/booking/runtime-ports.ts";
import { BookingStaffController } from "../front-office/booking/staff.controller.ts";
import type { MailPort } from "../../../ports/mail.ts";
import type { OfficeClockPort } from "../../../ports/offices.ts";
import { OFFICE_CLOCK } from "../platform/settings/offices/clock.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

export default { controllers: [BookingPublicController, BookingFeedController, BookingStaffController], providers: [Booking, BookingFeed, { provide: BOOKING_PORTS, useFactory: (mail: MailPort, offices: OfficeClockPort) => runtimeBookingPorts(mail, offices), inject: [MESSAGES_MAIL, OFFICE_CLOCK] }] } satisfies Feature;
