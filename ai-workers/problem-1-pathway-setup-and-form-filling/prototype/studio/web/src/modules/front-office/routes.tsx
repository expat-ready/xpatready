// FO-4 (concept screens/fo-4-sales r2): the front office's pages through PF-1's seam. Part 1: the hosted enquiry form
// (public), Leads and one lead. Part 2a: Pipeline (board and list) and one prospect. Settings (part 3) joins here. FO-3w (concept screens/fo-3-booking
// r2): the public booking pages, in their own frame with no Studio shell. /book/:firmKey/manage is declared before
// /book/:firmKey/:slug so "manage" is never read as a type (QA-496, Lead B rev 16.68; "manage" is a reserved slug, BR-19). FO-3st2: My account → Availability.
// FO-3st1: the staff Bookings area (Calendar; a booking by its link), inside PF-6's PlatformFrame. FO-3st3: its Settings → Booking types; FO-3st3b: Timings.
import type { ModuleRoute } from "@/modules";
import { AvailabilityPage } from "./booking/availability/availability-page";
import { BookingsPage } from "./booking/calendar/calendar-page";
import { TimingsPage } from "./booking/settings/timings-page";
import { BookingTypesPage } from "./booking/settings/types-page";
import { BookingManagePage } from "./booking-public/manage-page";
import { BookingTypePage } from "./booking-public/type-page";
import { BookingEntry } from "./booking-public/site";
import { LeadPage } from "./sales/lead-page";
import { LeadsPage } from "./sales/leads-page";
import { PipelinePage } from "./sales/pipeline-page";
import { ProspectPage } from "./sales/prospect-page";
import { RetainerPage } from "./retainers/retainer-page";
import { RetainerTemplatesPage } from "./retainers/templates-page";
import { ConflictConfirmPage } from "./compliance/conflict/confirm-page";
import { WebFormSettingsPage } from "./sales/web-form-settings-page";
import { WebFormPage } from "./sales/web-form-page";
import { PeopleToMergePage } from "./duplicates/people-to-merge-page";

export const routes: ModuleRoute[] = [
  { path: "/front-office/web-form/:token", element: <WebFormPage /> },
  { path: "/front-office/leads", element: <LeadsPage /> },
  { path: "/front-office/leads/:id", element: <LeadPage /> },
  { path: "/front-office/pipeline", element: <PipelinePage /> },
  { path: "/front-office/duplicates", element: <PeopleToMergePage /> },   // FO-9s part 2: Sales › People to merge (R1.29)
  { path: "/front-office/prospects/:id", element: <ProspectPage /> },
  { path: "/front-office/retainers/:id", element: <RetainerPage /> },   // FO-5s part 1: one retainer (S3, S4, S5)
  { path: "/front-office/conflict-checks/:id", element: <ConflictConfirmPage /> },   // FO-13s part 2 PR B: a manager confirms a check with hidden matches
  { path: "/front-office/settings/retainer-templates", element: <RetainerTemplatesPage /> },   // FO-5s part 2: Settings › Retainer templates (S1)
  { path: "/front-office/settings/web-form", element: <WebFormSettingsPage /> },   // FO-4w: Settings › Web form (Owner, Admin)
  { path: "/account/availability", element: <AvailabilityPage /> },   // FO-3st2: My account → Availability
  { path: "/front-office/bookings", element: <BookingsPage /> },
  { path: "/front-office/bookings/:id", element: <BookingsPage /> },
  { path: "/front-office/settings/booking-types", element: <BookingTypesPage /> },   // FO-3st3 part 3a: Settings → Booking types
  { path: "/front-office/settings/timings", element: <TimingsPage /> },   // FO-3st3b: Settings → Timings
  { path: "/book", element: <BookingEntry /> },   // QA-756: a firm's own address (site.tsx)
  { path: "/book/:firmKey", element: <BookingEntry /> },   // the list here; on a firm's own address a type, or manage
  { path: "/book/:firmKey/manage", element: <BookingManagePage /> },
  { path: "/book/:firmKey/:slug", element: <BookingTypePage /> },
];
