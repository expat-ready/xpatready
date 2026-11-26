// FO-5d (AG-5-68 r4): the front office's labeller for notification items of kind `retainer` (a client declined it), as
// sales/lead-notification-labels.ts is for `lead`: registered on the platform's NotificationLabels at start-up. A retainer
// is named and linked only to a reader who may open it now, by the retainer page's own rule (`Retainers.canOpen`) and its
// read key; any other id answers nothing, and the row shows no name and no link. The label is "Retainer for <the signer's
// name>" (cut to 160 characters), never an email, a fee or the client's reason (AG-7-39 r10).
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { NotificationLabels, type ItemLabel } from "../../platform/notifications/labels.ts";
import { Retainers } from "./service.ts";

const READ_KEY = "agent/retainer:show";   // GET retainers/:id's key (routes.ts)
const NAME_MAX = 160;
const shortName = (n: string) => { const c = [...n]; return c.length > NAME_MAX ? `${c.slice(0, NAME_MAX - 1).join("")}…` : n; };

@Injectable()
export class RetainerNotificationLabels implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(NotificationLabels) private readonly labels: NotificationLabels, @Inject(Retainers) private readonly retainers: Retainers) {}
  onModuleInit() { this.labels.register("retainer", (reader, ids) => this.of(reader, ids)); }

  /** The retainers among `ids` this reader may open now, each with its words and page. */
  async of(reader: StaffContext, ids: string[]): Promise<Map<string, ItemLabel>> {
    const out = new Map<string, ItemLabel>();
    if (!ids.length || !reader.keys.includes(READ_KEY)) return out;
    const rows = await this.db.foRetainer.findMany({ where: firmScope(reader.firmId, { id: { in: ids }, kind: "RETAINER" as const }), select: { id: true, signerPersonId: true } });
    const people = await this.db.foPerson.findMany({ where: firmScope(reader.firmId, { id: { in: rows.flatMap((r) => (r.signerPersonId ? [r.signerPersonId] : [])) } }), select: { id: true, givenNames: true, familyName: true } });
    for (const r of rows) {
      if (!(await this.retainers.canOpen(reader, r.id))) continue;
      const p = people.find((x) => x.id === r.signerPersonId);
      const name = p ? [p.givenNames, p.familyName].filter(Boolean).join(" ") : "";
      out.set(r.id, { label: name ? `Retainer for ${shortName(name)}` : "Retainer", link: `/front-office/retainers/${r.id}` });
    }
    return out;
  }
}
