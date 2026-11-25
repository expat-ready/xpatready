// FO-3a: the booking settings API, behind PF-4's guard: booking types (part 1a); named sets of hours, time off and a
// type's set per host (part 1b-i); the firm's timings and a type's own (part 1b-ii, FO-3a1e). The Booking provider and
// its ports come from front-office-booking.ts.
import type { Feature } from "../features.ts";
import { Availability, AvailabilityController } from "../front-office/booking/settings/availability.controller.ts";
import { FirmTimings, TimingsController } from "../front-office/booking/settings/timings.controller.ts";
import { BookingTypes, BookingTypesController } from "../front-office/booking/settings/types.controller.ts";

export default { controllers: [BookingTypesController, AvailabilityController, TimingsController], providers: [BookingTypes, Availability, FirmTimings] } satisfies Feature;
