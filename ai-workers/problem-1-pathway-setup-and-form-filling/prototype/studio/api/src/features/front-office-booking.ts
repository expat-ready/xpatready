// FO-3: the booking API (public door; FO-3sr: the staff routes behind PF-4's guard).
import type { Feature } from "../features.ts";
import { Booking, BOOKING_PORTS, BookingPublicController } from "../front-office/booking/public.controller.ts";
import { runtimeBookingPorts } from "../front-office/booking/runtime-ports.ts";
import { BookingStaffController } from "../front-office/booking/staff.controller.ts";

export default { controllers: [BookingPublicController, BookingStaffController], providers: [Booking, { provide: BOOKING_PORTS, useFactory: runtimeBookingPorts }] } satisfies Feature;
