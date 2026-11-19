// FO-4 (concept screens/fo-4-sales r2): the front office's pages through PF-1's seam. Part 1: the hosted enquiry form
// (public), Leads and one lead. Part 2a: Pipeline (board and list) and one prospect. Settings (part 3) joins here. FO-3w (concept screens/fo-3-booking
// r2): the public booking pages, in their own frame with no Studio shell. /book/:firmKey/manage is declared before
// /book/:firmKey/:slug so "manage" is never read as a type (QA-496, Lead B rev 16.68; "manage" is a reserved slug, BR-19). FO-3st2: My account → Availability.
import type { ModuleRoute } from "@/modules";
import { AvailabilityPage } from "./booking/availability/availability-page";
import { BookingListPage } from "./booking-public/list-page";
import { BookingManagePage } from "./booking-public/manage-page";
import { BookingTypePage } from "./booking-public/type-page";
import { LeadPage } from "./sales/lead-page";
import { LeadsPage } from "./sales/leads-page";
import { PipelinePage } from "./sales/pipeline-page";
import { ProspectPage } from "./sales/prospect-page";
import { WebFormPage } from "./sales/web-form-page";

export const routes: ModuleRoute[] = [
  { path: "/front-office/web-form/:token", element: <WebFormPage /> },
  { path: "/front-office/leads", element: <LeadsPage /> },
  { path: "/front-office/leads/:id", element: <LeadPage /> },
  { path: "/front-office/pipeline", element: <PipelinePage /> },
  { path: "/front-office/prospects/:id", element: <ProspectPage /> },
  { path: "/account/availability", element: <AvailabilityPage /> },   // FO-3st2: My account → Availability
  { path: "/book/:firmKey", element: <BookingListPage /> },
  { path: "/book/:firmKey/manage", element: <BookingManagePage /> },
  { path: "/book/:firmKey/:slug", element: <BookingTypePage /> },
];
