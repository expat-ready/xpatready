// PF-6 part 1: the My account menu, one entry per line. A later row adds its own entry here (FO-3st2's Availability,
// PF-6 part 2's Team, Licences and Security, FO-3s5) and never edits PlatformFrame. No imports, so a test reads it in Node.
export type AccountSection = { label: string; path: string; /** The permission key a person needs to see the entry; null: everyone. */ key: string | null };

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { label: "Home", path: "/home", key: null },   // PF-18h: the staff Home, everyone's own
  { label: "Profile", path: "/account", key: null },
  { label: "Licence", path: "/account/licence", key: null },   // PF-6 part 2b: everyone's own
  { label: "Availability", path: "/account/availability", key: null },   // FO-3st2: own hours need no key (AG-4-62 §8)
  { label: "Notifications", path: "/account/notifications", key: "agent/notification:manage-preferences" },   // PF-18s part 3: everyone's own (all six roles hold the key)
  { label: "Team", path: "/platform/team", key: "agent/staff:manage" },   // PF-6 part 2a
  { label: "Licences", path: "/platform/licences", key: "agent/firm-credential:manage" },   // PF-6 part 2b
  { label: "Security", path: "/platform/security", key: "agent/security-policy:manage" },   // PF-6 part 2b
  { label: "Terms", path: "/platform/terms", key: "agent/settings:list" },   // PF-5t part 2
  { label: "Firm profile", path: "/platform/firm-profile", key: "agent/settings:list" },   // PF-5s S5 (R1.92): everyone with the settings read; Owner and Admin edit
  { label: "Offices", path: "/platform/offices", key: "agent/settings:edit" },   // PF-18s part 1: Owner and Admin (challenge M1)
  { label: "Branding", path: "/platform/branding", key: "agent/settings:edit" },   // PF-13 part 2: Owner and Admin (AG-16-2)
  { label: "Templates", path: "/platform/templates", key: "agent/template:list" },   // PF-19s (R1.46): every role but Billing / Finance (AG-12 §10)
  { label: "Import", path: "/platform/import", key: "agent/import:view-report" },   // PF-10s (R1.35): Owner and Admin (Lead 5 on #3644: under My account until a Contacts list exists)
  { label: "Plan and billing", path: "/settings/billing", key: "agent/subscription-invoice:view" },   // PF-5s part 2: Owner, Admin, Billing / Finance
  { label: "Activity log", path: "/platform/activity-log", key: "agent/audit:read" },   // AUD-4s (concept C5): Owner and Admin; PF-11s moves it under Security & your data
  { label: "Help & support", path: "/platform/support", key: "agent/support-ticket:list" },   // PF-18s part 2: everyone's own tickets (AG-16-63)
];

/** The entries this person sees: those with no key, or whose key they hold. */
export const visibleSections = (sections: readonly AccountSection[], keys: readonly string[]) => sections.filter((s) => s.key === null || keys.includes(s.key));
