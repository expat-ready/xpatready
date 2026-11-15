// FO-4 (concept screens/fo-4-sales r2): the front office's pages through PF-1's seam. Part 1: the hosted enquiry form
// (public), Leads and one lead. Pipeline (part 2) and Settings (part 3) join here.
import type { ModuleRoute } from "@/modules";
import { LeadPage } from "./sales/lead-page";
import { LeadsPage } from "./sales/leads-page";
import { WebFormPage } from "./sales/web-form-page";

export const routes: ModuleRoute[] = [
  { path: "/front-office/web-form/:token", element: <WebFormPage /> },
  { path: "/front-office/leads", element: <LeadsPage /> },
  { path: "/front-office/leads/:id", element: <LeadPage /> },
];
