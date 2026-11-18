// PF-6 part 1: the My account menu, one entry per line. A later row adds its own entry here (FO-3st2's Availability,
// PF-6 part 2's Team, Licences and Security, FO-3s5) and never edits PlatformFrame. No imports, so a test reads it in Node.
export type AccountSection = { label: string; path: string; /** The permission key a person needs to see the entry; null: everyone. */ key: string | null };

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { label: "Profile", path: "/account", key: null },
  { label: "Availability", path: "/account/availability", key: null },   // FO-3st2: own hours need no key (AG-4-62 §8)
  { label: "Team", path: "/platform/team", key: "agent/staff:manage" },   // PF-6 part 2a
];

/** The entries this person sees: those with no key, or whose key they hold. */
export const visibleSections = (sections: readonly AccountSection[], keys: readonly string[]) => sections.filter((s) => s.key === null || keys.includes(s.key));
