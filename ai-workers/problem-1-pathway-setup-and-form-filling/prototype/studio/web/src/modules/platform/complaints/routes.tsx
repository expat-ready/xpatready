// PF-21s part 3 (concept screens/pf-21-complaints §4 "Routes"): the complaints pages inside PF-6 part 1's frame. PF-1's
// seam reads one routes.tsx per module folder, so platform/routes.tsx spreads these in.
import type { ModuleRoute } from "@/modules";
import { ComplaintsListPage } from "./list-page";
import { ComplaintPage } from "./record-page";

export const complaintRoutes: ModuleRoute[] = [
  { path: "/platform/complaints", element: <ComplaintsListPage /> },
  { path: "/platform/complaints/:id", element: <ComplaintPage /> },
];
