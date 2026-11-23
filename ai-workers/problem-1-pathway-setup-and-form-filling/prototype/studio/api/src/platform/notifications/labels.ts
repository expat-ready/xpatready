// PF-18n part 2 (screens/PF-18ns/concept.md M-2, M-3; challenge M2): the words and page of a notification's item, built
// when the person's list is read (rows hold ids only, AG-7-39 r10). The module that owns an item kind registers one
// labeller for it at start-up (front-office/sales/lead-notification-labels.ts for `lead`), as modules register their
// finder on the find door (platform/find/registry.ts), so the platform imports no module's tables or rules. A labeller
// answers only the items the reader may open by its own view rule; any other id is left out, and the list then shows
// `label: null, link: null` for it (the row stays: it happened). A labeller that throws leaves its items unlabelled and
// is logged by item kind only; the list still answers.
import { Injectable, Logger } from "@nestjs/common";
import { NOTIFICATION_ITEM_KIND, type NotificationItemKind } from "../../../../ports/notifications.ts";
import type { StaffContext } from "../identity/keys.ts";

/** What one item shows: its words (a lead's name and number) and the app page that opens it. */
export type ItemLabel = { label: string; link: string };
/** One module's labeller: the reader and the ids of its kind (all in the reader's firm) → the ones the reader may open. */
export type ItemLabeller = (reader: StaffContext, ids: string[]) => Promise<Map<string, ItemLabel>>;

/** An app path only: one leading slash, never "//" (a browser reads //host as another site; break m3). */
const PAGE = /^\/(?!\/)[A-Za-z0-9/_-]{1,200}$/;

@Injectable()
export class NotificationLabels {
  private readonly labellers = new Map<NotificationItemKind, ItemLabeller>();
  private readonly log = new Logger("notifications");
  /** One labeller per item kind: a second registration for a kind is refused (one module owns each kind). */
  register(kind: NotificationItemKind, labeller: ItemLabeller): void {
    if (!(NOTIFICATION_ITEM_KIND as readonly string[]).includes(kind)) throw new Error(`NotificationLabels: ${kind} is no item kind of ports/notifications.ts`);
    if (this.labellers.has(kind)) throw new Error(`NotificationLabels: ${kind} already has its labeller`);
    this.labellers.set(kind, labeller);
  }
  /** The labels of these items for this reader, keyed `<item kind>|<id>`; a kind with no labeller gives none. */
  async of(reader: StaffContext, items: { kind: string; id: string }[]): Promise<Map<string, ItemLabel>> {
    const out = new Map<string, ItemLabel>();
    const byKind = new Map<string, Set<string>>();
    for (const i of items) if (this.labellers.has(i.kind as NotificationItemKind)) (byKind.get(i.kind) ?? byKind.set(i.kind, new Set()).get(i.kind)!).add(i.id);
    await Promise.all([...byKind].map(async ([kind, ids]) => {
      try {
        const got = await this.labellers.get(kind as NotificationItemKind)!(reader, [...ids]);
        // Only asked ids with a well-formed answer (a labeller can never add another item or an outside link).
        for (const [id, l] of got) if (ids.has(id) && typeof l.label === "string" && l.label.length > 0 && l.label.length <= 200 && PAGE.test(l.link)) out.set(`${kind}|${id}`, { label: l.label, link: l.link });
      } catch {
        this.log.warn(`notifications: the ${kind} labeller failed; its items are shown unlabelled`);
      }
    }));
    return out;
  }
}
