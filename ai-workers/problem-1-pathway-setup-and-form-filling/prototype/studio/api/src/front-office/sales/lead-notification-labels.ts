// PF-18n part 2 (screens/PF-18ns/concept.md M-2, M-3; challenge M2; Lead 10 on #3279): the front office's labeller for
// notification items of kind `lead`, registered on the platform's NotificationLabels at start-up (as find.ts registers
// its finder). A lead is named and linked only to a reader who may open it now, by the one rule the leads list and
// GET leads/:id use (common.ts `visibilityOf` + `sees`, an inactive owner counting as Unassigned): a lead reassigned away
// from someone, or no longer visible to them, answers nothing, and their row shows no name and no link. The label is the
// person's name (cut to 160 characters) and the lead's number ("Client A Sample (L-00012)"), never an email, phone or note
// (AG-7-39 r10); a reader without GET leads/:id's key (agent/prospect:show) gets none.
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { NotificationLabels, type ItemLabel } from "../../platform/notifications/labels.ts";
import { sees, visibilityOf } from "./common.ts";

const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter(Boolean).join(" ") || "(no name)";
/** The read key GET leads/:id asks (sales/routes.ts); without it nothing is named (break m2). */
const READ_KEY = "agent/prospect:show";
/** At most this many characters of the name, so "<name> (<number>)" stays within labels.ts's 200 (break m1: 100 + 100 at every door). */
const NAME_MAX = 160;
const shortName = (n: string) => { const c = [...n]; return c.length > NAME_MAX ? `${c.slice(0, NAME_MAX - 1).join("")}…` : n; };

@Injectable()
export class LeadNotificationLabels implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(NotificationLabels) private readonly labels: NotificationLabels) {}
  onModuleInit() { this.labels.register("lead", (reader, ids) => this.of(reader, ids)); }

  /** The leads among `ids` this reader may open now, each with its words and page. */
  async of(reader: StaffContext, ids: string[]): Promise<Map<string, ItemLabel>> {
    const out = new Map<string, ItemLabel>();
    if (!ids.length || !reader.keys.includes(READ_KEY)) return out;
    const [rows, vis] = await Promise.all([
      this.db.foLead.findMany({ where: firmScope(reader.firmId, { id: { in: ids } }), select: { id: true, number: true, ownerStaffId: true, person: { select: { givenNames: true, familyName: true } } } }),
      visibilityOf(this.db, reader),
    ]);
    const owners = [...new Set(rows.map((r) => r.ownerStaffId).filter((o): o is string => !!o))];
    const active = new Set(owners.length ? (await this.db.platformStaff.findMany({ where: firmScope(reader.firmId, { id: { in: owners }, status: "ACTIVE" as const }), select: { id: true } })).map((s) => s.id) : []);
    for (const r of rows) {
      const owner = r.ownerStaffId && active.has(r.ownerStaffId) ? r.ownerStaffId : null;   // a deactivated owner's lead is Unassigned (as leads.ts `visible`)
      if (sees(vis, reader, owner)) out.set(r.id, { label: `${shortName(nameOf(r.person))} (${r.number})`, link: `/front-office/leads/${r.id}` });
    }
    return out;
  }
}
