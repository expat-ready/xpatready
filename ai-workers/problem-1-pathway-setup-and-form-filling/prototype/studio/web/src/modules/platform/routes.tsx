// PF-6 part 1: the platform's staff pages through PF-1's seam: the sign-in link's page (public) and My account; PF-21s: Complaints.
import type { ModuleRoute } from "@/modules";
import { AccountPage } from "./account-page";
import { HomePage } from "./home/home-page";
import { CallbackPage } from "./callback-page";
import { complaintRoutes } from "./complaints/routes";
import { TeamPage } from "./staff/team-page";
import { LicencePage } from "./account/licence-page";
import { SecurityPage } from "./account/security-page";
import { AcceptPage } from "./staff/accept-page";
import { LicencesPage } from "./staff/licences-page";
import { TermsAcceptancesPage } from "./terms/acceptances-page";
import { PricingPage } from "./signup/pricing-page";
import { SignUpPage } from "./signup/signup-page";
import { VerifyPage } from "./signup/verify-page";
import { BillingPage } from "./saas/billing-page";
import { OfficesPage } from "./settings/offices-page";
import { BrandingPage } from "./branding/branding-page";
import { FirmProfilePage } from "./settings/firm-profile-page";
import { SupportPage, SupportTicketPage } from "./settings/support-page";
import { NotificationsPage } from "./settings/notifications-page";
import { ActivityLogPage } from "./audit/activity-log-page";

export const routes: ModuleRoute[] = [
  { path: "/sign-in/callback", element: <CallbackPage /> },
  { path: "/home", element: <HomePage /> },   // PF-18h: the staff Home (sign-in lands here)
  { path: "/account", element: <AccountPage /> },
  ...complaintRoutes,
  { path: "/platform/team", element: <TeamPage /> },   // PF-6 part 2a
  { path: "/account/licence", element: <LicencePage /> },   // PF-6 part 2b
  { path: "/platform/licences", element: <LicencesPage /> },   // PF-6 part 2b
  { path: "/platform/security", element: <SecurityPage /> },   // PF-6 part 2b
  { path: "/invitation", element: <AcceptPage /> },   // PF-6 part 2b (public: the invitation email's link)
  { path: "/platform/terms", element: <TermsAcceptancesPage /> },   // PF-5t part 2
  { path: "/pricing", element: <PricingPage /> },   // PF-5s part 1 (public)
  { path: "/sign-up", element: <SignUpPage /> },   // PF-5s part 1 (public): Sign up, then Check your email
  { path: "/sign-up/verify", element: <VerifyPage /> },   // PF-5s part 1 (public): the email's link (PF-5's door writes it)
  { path: "/settings/billing", element: <BillingPage /> },   // PF-5s part 2: Plan and billing (PF-5 part 2 returns from Stripe here)
  { path: "/platform/offices", element: <OfficesPage /> },   // PF-18s part 1: Offices (Owner and Admin)
  { path: "/platform/branding", element: <BrandingPage /> },   // PF-13 part 2: Branding (Owner and Admin; R1.23)
  { path: "/platform/firm-profile", element: <FirmProfilePage /> },   // PF-5s S5: Firm profile (R1.92)
  { path: "/platform/support", element: <SupportPage /> },   // PF-18s part 2: Help & support
  { path: "/platform/support/:id", element: <SupportTicketPage /> },   // PF-18s part 2: one ticket
  { path: "/account/notifications", element: <NotificationsPage /> },   // PF-18s part 3: My account → Notifications (everyone's own)
  { path: "/platform/activity-log", element: <ActivityLogPage /> },   // AUD-4s: the firm's Activity log (agent/audit:read)
];
