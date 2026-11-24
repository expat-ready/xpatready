// PF-17 part 4 PR B (R1.93; concept r2 §4): our console's pages, under the module's own word /system (PF-1's seam).
// /system opens Firms; PR C adds Support.
import { Navigate } from "react-router-dom";
import type { ModuleRoute } from "@/modules";
import { FirmsPage } from "./firms-page";
import { SupportPage } from "./support-page";

export const routes: ModuleRoute[] = [
  { path: "/system", element: <Navigate to="/system/firms" replace /> },
  { path: "/system/firms", element: <FirmsPage /> },
  { path: "/system/support", element: <SupportPage /> },
];
