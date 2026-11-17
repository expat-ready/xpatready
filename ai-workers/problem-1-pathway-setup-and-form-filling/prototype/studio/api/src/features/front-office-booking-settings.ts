// FO-3a part 1a: the booking settings API (booking types; part 1b adds hours, time off and timings), behind PF-4's guard.
// The Booking provider and its ports come from front-office-booking.ts.
import type { Feature } from "../features.ts";
import { BookingTypes, BookingTypesController } from "../front-office/booking/settings/types.controller.ts";

export default { controllers: [BookingTypesController], providers: [BookingTypes] } satisfies Feature;
