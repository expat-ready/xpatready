// FO-3v part 1: My account → Video (AG-4-58, AG-4-59, AG-16-73), behind PF-4's guard. The booking ports (BOOKING_PORTS,
// for the audit port) come from front-office-booking.ts; the link on each booking is the booking service's (video/service.ts linkFor).
import type { Feature } from "../features.ts";
import { MyVideo, MyVideoController } from "../front-office/booking/video/controller.ts";

export default { controllers: [MyVideoController], providers: [MyVideo] } satisfies Feature;
