// PF-6 part 1: the platform's staff pages through PF-1's seam: the sign-in link's page (public) and My account.
import type { ModuleRoute } from "@/modules";
import { AccountPage } from "./account-page";
import { CallbackPage } from "./callback-page";
import { TeamPage } from "./staff/team-page";

export const routes: ModuleRoute[] = [
  { path: "/sign-in/callback", element: <CallbackPage /> },
  { path: "/account", element: <AccountPage /> },
  { path: "/platform/team", element: <TeamPage /> },   // PF-6 part 2a
];
