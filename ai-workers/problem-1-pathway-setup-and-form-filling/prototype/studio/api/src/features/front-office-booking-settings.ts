// FO-3a: the booking settings API, behind PF-4's guard: booking types (part 1a); named sets of hours, time off and a
// type's set per host (part 1b-i); timings follow (part 1b-ii). The Booking provider and its ports come from
// front-office-booking.ts.
import type { Feature } from "../features.ts";
import { Availability, AvailabilityController } from "../front-office/booking/settings/availability.controller.ts";
import { BookingTypes, BookingTypesController } from "../front-office/booking/settings/types.controller.ts";

export default { controllers: [BookingTypesController, AvailabilityController], providers: [BookingTypes, Availability] } satisfies Feature;
