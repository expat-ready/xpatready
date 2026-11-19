// PF-6 part 1: the My account menu, one entry per line. A later row adds its own entry here (FO-3st2's Availability,
// PF-6 part 2's Team, Licences and Security, FO-3s5) and never edits PlatformFrame. No imports, so a test reads it in Node.
export type AccountSection = { label: string; path: string; /** The permission key a person needs to see the entry; null: everyone. */ key: string | null };

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { label: "Profile", path: "/account", key: null },
  { label: "Licence", path: "/account/licence", key: null },   // PF-6 part 2b: everyone's own
  { label: "Team", path: "/platform/team", key: "agent/staff:manage" },   // PF-6 part 2a
  { label: "Licences", path: "/platform/licences", key: "agent/firm-credential:manage" },   // PF-6 part 2b
  { label: "Security", path: "/platform/security", key: "agent/security-policy:manage" },   // PF-6 part 2b
  { label: "Terms", path: "/platform/terms", key: "agent/settings:list" },   // PF-5t part 2
  { label: "Booking types", path: "/front-office/booking-types", key: "agent/booking-event-type:list" },   // FO-3st3 part 1 (P-626 A3)
];

/** The entries this person sees: those with no key, or whose key they hold. */
export const visibleSections = (sections: readonly AccountSection[], keys: readonly string[]) => sections.filter((s) => s.key === null || keys.includes(s.key));
