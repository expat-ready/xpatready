// AUD-4 (SA-11-30, AG-16 §3.6 "Activity log"): the words of the firm's activity log. Each module registers its own
// actions' words (`AuditActionNames.register(module, { action: words })`, one line on its module card); an action no
// module has named is still shown, by its code under Advanced, with its line's own summary (never blank). The area a
// line belongs to comes from its entity: the AREA_ENTITY prefixes (ports/audit.ts) and the case side's lists.
import { CASE_ENTITIES, CONFIG_ENTITIES, isConfigEntity } from "../../../case-feed.ts";

const named = new Map<string, { module: string; words: string }>();
const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export const AuditActionNames = {
  /** Names a module's actions. An action already named by another module is a start-up error (one owner per action). */
  register(module: string, actions: Record<string, string>): void {
    for (const [action, words] of Object.entries(actions)) {
      if (!ACTION.test(action) || !words.trim()) throw new Error(`AuditActionNames: ${module} names "${action}" badly (a dotted lower-case action and its words)`);
      const had = named.get(action);
      if (had && had.module !== module) throw new Error(`AuditActionNames: "${action}" is already named by ${had.module}`);
      named.set(action, { module, words: words.trim() });
    }
  },
  /** The action's words, or undefined when no module named it. */
  label: (action: string): string | undefined => named.get(action)?.words,
};

/** The areas, as the filter offers them (code → words). */
export const AREAS = { team: "Team and settings", "front-office": "Front office", money: "Money", messages: "Messages", cases: "Cases", configuration: "Configuration", other: "Other" } as const;
export type AreaCode = keyof typeof AREAS;

/** The table prefixes of the four platform areas (ports/audit.ts AREA_ENTITY): the one list areaOf and the area filter's
 *  query both read, so the words and the filter never drift apart. */
export const AREA_PREFIXES = { team: ["platform", "plat"], "front-office": ["fo"], money: ["money"], messages: ["msg"] } as const satisfies Partial<Record<AreaCode, readonly string[]>>;
export const prefixPattern = (prefixes: readonly string[]) => `^(${prefixes.join("|")})_`;
export const ALL_PREFIXES = prefixPattern(Object.values(AREA_PREFIXES).flat());

/** The area of an entity. */
export function areaOf(entity: string): AreaCode {
  for (const [code, prefixes] of Object.entries(AREA_PREFIXES)) if (new RegExp(prefixPattern(prefixes)).test(entity)) return code as AreaCode;
  if (CASE_ENTITIES.has(entity)) return "cases";
  if (isConfigEntity(entity)) return "configuration";
  return "other";
}

/** The case side's and the configuration's entities, for the area filter's query (exact lists; configuration also
 *  takes "library …"). */
export const caseEntities = (): string[] => [...CASE_ENTITIES];
export const configEntities = (): string[] => [...CONFIG_ENTITIES].filter((e) => !CASE_ENTITIES.has(e));

// The platform module's actions. Other modules register theirs from their own files.
AuditActionNames.register("platform", {
  "platform.setting.change": "Changed a firm setting",
  "platform.staff.owner_created": "Created the firm's first Owner",
  "platform.staff.roles_changed": "Changed a person's roles",
  "platform.staff.deactivated": "Deactivated a person",
  "platform.staff.reactivated": "Reactivated a person",
  "platform.staff.credential_saved": "Saved a licence record",
  "platform.staff.sign_in": "Signed in",
  "platform.staff.signed_out": "Signed out",
  "platform.staff.signed_out_everywhere": "Signed a person out everywhere",
  "platform.staff.two_step_reset": "Reset a person's two-step sign-in",
  "platform.staff.notice_not_sent": "Could not email a person their reset notice",
  "platform.staff.only_owner_refused": "Refused: the firm's only Owner",
  "platform.staff.money_keys_granted": "Gave a role with money permissions",
  "platform.invitation.created": "Invited a person",
  "platform.invitation.resent": "Re-sent an invitation",
  "platform.invitation.revoked": "Withdrew an invitation",
  "platform.invitation.accepted": "Accepted an invitation",
  "platform.invitation.refused_inviter": "Refused an invitation (inviter no longer allowed)",
  "platform.office.add": "Added an office",
  "platform.office.change": "Changed an office",
  "platform.office.staff": "Changed an office's people",
  "platform.subscription.created": "Started the subscription",
  "platform.subscription.customer_linked": "Linked the billing account",
  "platform.terms.accepted": "Accepted terms",
  "firm.created": "Created the firm",
  "firm.web_address.set": "Set the firm's web address",
  "firm.web_address.changed": "Changed the firm's web address",
  "support.ticket.raised": "Raised a support ticket",
  "support.ticket.message_added": "Added to a support ticket",
  "support.ticket.replied": "Support replied to a ticket",
  "audit.exported": "Exported the activity log",
});
