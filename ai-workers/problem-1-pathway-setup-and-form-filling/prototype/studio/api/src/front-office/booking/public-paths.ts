// QA-756 (R1.24; AG-04 S3 "https://maple.expatready.com/book/free-consultation", AG-4-16, AG-4-17): the booking pages on a
// firm's own address. PF-25's host routing serves only the paths registered for it there (host.ts); this module registers
// the booking pages, the files they load and their public doors. Everything else on a firm's address stays the one plain
// not-found (the studio's pages and API, `/book/<a>/<b>`, any other door). Which firm a page is for comes from the Host
// alone (`req.publicFirm`); a door named for another firm, by its key in the path or a link's token, is refused by the
// walls (PF-12, review R2) as the one not-found (service.ts `enterPublicFirm`).
//   /book                         the firm's booking page (its listed types)
//   /book/<type slug>             one type's page; `/book/manage` the booker's own page (its token in the fragment)
//   /assets/…, /brand/…, /fonts/inter/…   the web app's built files (one bundle; no data)
//   /api/public/booking-site      which firm's address this is (its key, the page's public slug)
//   /api/public/firms/<key>/book[/<slug>/slots|/<slug>/bookings], /api/public/bookings/<token>[/slots|/reschedule|/cancel|/ics]
import { registerPublicPath } from "../../platform/web-address/host.ts";

export const BOOKING_PUBLIC_PATHS: readonly RegExp[] = [
  /^\/book$/,
  /^\/book\/[a-z0-9-]+$/,
  /^\/assets\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.(js|css|woff2|svg|png)$/,
  /^\/brand\/[A-Za-z0-9_-]+\.svg$/,
  /^\/fonts\/inter\/[A-Za-z0-9_-]+\.woff2$/,
  /^\/api\/public\/booking-site$/,
  /^\/api\/public\/firms\/[a-z0-9-]+\/book$/,
  /^\/api\/public\/firms\/[a-z0-9-]+\/book\/[a-z0-9-]+\/(slots|bookings)$/,
  /^\/api\/public\/bookings\/[A-Za-z0-9._~-]+(\/(slots|reschedule|cancel|ics))?$/,
];
for (const p of BOOKING_PUBLIC_PATHS) registerPublicPath(p);
