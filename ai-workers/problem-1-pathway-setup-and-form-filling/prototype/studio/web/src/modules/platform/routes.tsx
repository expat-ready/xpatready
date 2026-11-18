// PF-6 part 1: the platform's staff pages through PF-1's seam: the sign-in link's page (public) and My account; PF-21s: Complaints.
import type { ModuleRoute } from "@/modules";
import { AccountPage } from "./account-page";
import { CallbackPage } from "./callback-page";
import { complaintRoutes } from "./complaints/routes";
import { TeamPage } from "./staff/team-page";
import { LicencePage } from "./account/licence-page";
import { SecurityPage } from "./account/security-page";
import { AcceptPage } from "./staff/accept-page";
import { LicencesPage } from "./staff/licences-page";

export const routes: ModuleRoute[] = [
  { path: "/sign-in/callback", element: <CallbackPage /> },
  { path: "/account", element: <AccountPage /> },
  ...complaintRoutes,
  { path: "/platform/team", element: <TeamPage /> },   // PF-6 part 2a
  { path: "/account/licence", element: <LicencePage /> },   // PF-6 part 2b
  { path: "/platform/licences", element: <LicencesPage /> },   // PF-6 part 2b
  { path: "/platform/security", element: <SecurityPage /> },   // PF-6 part 2b
  { path: "/invitation", element: <AcceptPage /> },   // PF-6 part 2b (public: the invitation email's link)
];
