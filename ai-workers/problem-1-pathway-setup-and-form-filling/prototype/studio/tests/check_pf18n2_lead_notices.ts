// PF-18n part 2 (BACKLOG row PF-18n "this row's callers: a lead assigned to me (FO-10)"; Lead 10 on #3279; R1.50's
// prerequisite M-1 to M-4 of screens/PF-18ns/concept.md; AG-10-29a, AG-10-36, AG-16-10 test 1, AG-7-39 r2-r4, r7, r10):
// a lead handed to someone (by the firm's rule at arrival, or by hand with Assign) gives that person one in-app notification,
// kind lead-assigned in group Work handed to me; their list names the lead and links to it, with their time zone; a lead
// later reassigned away shows neither name nor link to the person who lost it (FO-2's own-versus-all rule, common.ts
// `sees`); another person never sees it. Each Done when line has a pass and a fail. One scratch database (every migration,
// PF-3's and FO-1a's Sample seeds), dropped at the end. Services and the route's own controller are called directly, as
// check_fo10_assignment.ts does; the feature files' wiring is read as the app reads it. No browser, no model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf18n2_lead_notices.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { AssignmentRules } from "../api/src/front-office/assignment/rules.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { arrive } from "../api/src/front-office/sales/arrival.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { LeadNotificationLabels } from "../api/src/front-office/sales/lead-notification-labels.ts";
import { SALES_PORTS, type SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { withFirm } from "../api/src/platform/firm-scope.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { NotificationLabels } from "../api/src/platform/notifications/labels.ts";
import { MyNotificationsController } from "../api/src/platform/notifications/routes.ts";
import { MyNotifications, NOTIFICATION_PORT, PrismaNotificationPort } from "../api/src/platform/notifications/store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { OfficeClock } from "../api/src/platform/settings/offices/clock.ts";
import { PrismaNotificationPrefs } from "../api/src/platform/settings/notifications/prefs.ts";
import { NOTIFICATION_GROUP, NOTIFICATION_ITEM_KIND, NOTIFICATION_KIND } from "../ports/notifications.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf18n2_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
async function refusal(fn: () => Promise<unknown>): Promise<number | null> {
  try { await fn(); return null; } catch (e) { const x = e as { getStatus?: () => number }; if (!x.getStatus) throw e; return x.getStatus(); }
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("PF-18n2 setup: both Sample firms have a front office", fo.failed.length === 0, fo);

  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}' and ended_at is null`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id!, firmId: firmId!, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  // R: Owner (assigns; sees own and Unassigned, not all: "everyone sees all" is off). O, T: staff who work leads.
  const R = ctxOf("user-R"), O = ctxOf("user-O"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  ok("PF-18n2 setup: R holds agent/prospect:assign; O and T hold the sales key and not view.all; the firm's everyone-sees-all is off",
    R.keys.includes("agent/prospect:assign") && [O, T].every((c) => c.keys.includes("agent/prospect:edit") && !c.keys.includes("agent/prospect:view.all"))
    && sql(`select count(*) from platform_firm_setting where firm_id = '${A}' and key = 'platform.everyone_sees_all' and value = 'true'::jsonb`) === "0");
  sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${B}', 'helper@pf18n2.example.com', 'Helper (Sample)', 'ACTIVE', now())`);   // firm B is no one-user firm (X-4)

  const port = new PrismaNotificationPort((tx) => new PrismaNotificationPrefs(tx));
  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), now: () => Date.now(), publicOrigin: "http://localhost:4400", formKey: Buffer.from("pf18n2-test (Sample, not a secret)"), notifications: port };
  const rules = new AssignmentRules(db, ports), leads = new Leads(db, ports);
  const labels = new NotificationLabels();
  new LeadNotificationLabels(db, labels).onModuleInit();
  const route = new MyNotificationsController(new MyNotifications(db), labels, new OfficeClock(db));
  const list = (c: StaffContext, q: Record<string, unknown> = {}) => withFirm(c.firmId, () => route.items({ platform: c }, q));
  type Item = { id: string; kind: string; group: string; item: { kind: string; id: string }; label: string | null; link: string | null; createdAt: string; readAt: string | null };
  const itemsOf = async (c: StaffContext) => (await list(c)).items as Item[];
  const rowsOf = (staffId: string, leadId: string) => Number(sql(`select count(*) from msg_notification where staff_id = '${staffId}' and item_kind = 'lead' and item_id = '${leadId}'`));
  const webForm = sql(`select id from fo_web_form where firm_id = '${A}' limit 1`);
  let n = 0;
  const arrival = (o: { audit?: SalesPorts["audit"]; given?: string } = {}) => {
    const i = n++;
    return db.$transaction((tx) => arrive(tx, { firmId: A, door: "WEB_FORM", intakeKey: `form:${webForm}:${randomUUID()}`, webFormId: webForm,
      person: { givenNames: o.given ?? `Person${i}`, familyName: "Sample", email: `p${i}@pf18n2.example.org`, phone: null }, source: "WEB_FORM", actor: "system:web-form", payloadHash: `h${i}` },
      { ...ports, audit: o.audit ?? ports.audit }));
  };
  const ownerOf = (leadId: string) => sql(`select coalesce(owner_staff_id::text, 'none') from fo_lead where id = '${leadId}'`);

  // ------------------------------------------------------------------------------------------- the port's new lines
  ok("PF-18n2 port: lead-assigned is a kind in Work handed to me, and lead an item kind (lines added, none renamed)",
    NOTIFICATION_KIND.LEAD_ASSIGNED === "lead-assigned" && NOTIFICATION_GROUP[NOTIFICATION_KIND.LEAD_ASSIGNED] === "WORK_HANDED_TO_ME" && (NOTIFICATION_ITEM_KIND as readonly string[]).includes("lead")
    && NOTIFICATION_KIND.CASE_STAGE_DEADLINE === "case-stage-deadline" && NOTIFICATION_ITEM_KIND[0] === "case");

  // ------------------------------------------------------------------------------------------- DW1 by a rule at arrival
  await rules.save(R, { door: "WEB_FORM", strategy: "OWNER", ownerStaffId: O.staffId });
  const ruled = (await arrival({ given: "Client A" })).leadId!;
  const oItems = await itemsOf(O), oLead = oItems.find((i) => i.item.id === ruled);
  const number = sql(`select number from fo_lead where id = '${ruled}'`);
  const zone = (await list(O)).zone;
  ok("PF-18n2 DW1 pass: a lead placed on O by the firm's rule gives O one notification, kind lead-assigned, group Work handed to me, with the lead's name and number and its page",
    ownerOf(ruled) === O.staffId && rowsOf(O.staffId, ruled) === 1 && oLead?.kind === "lead-assigned" && oLead.group === "WORK_HANDED_TO_ME" && oLead.item.kind === "lead"
    && oLead.label === `Client A Sample (${number})` && oLead.link === `/front-office/leads/${ruled}` && oLead.readAt === null, oLead);
  ok("PF-18n2 DW1 pass: the list answers the person's time zone (no office: the firm's, America/Toronto by the Sample default, as Home's Needs you does)", zone === "America/Toronto", zone);
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${A}', 'platform.time_zone', '"America/Edmonton"', 'seed:PF-18n2-test') on conflict (firm_id, key) do update set value = excluded.value`);
  ok("PF-18n2 DW1 fail: the zone is read, never a constant: the firm's zone set to America/Edmonton answers it", (await list(O)).zone === "America/Edmonton");
  ok("PF-18n2 DW1 fail: nobody else is told: not R (who wrote the rule), not T", rowsOf(R.staffId, ruled) === 0 && rowsOf(T.staffId, ruled) === 0);
  await rules.off(R, (await rules.list(R))[0]!.id);
  const unruled = (await arrival()).leadId!;
  ok("PF-18n2 DW1 fail: a lead no rule places (Unassigned) tells nobody", ownerOf(unruled) === "none" && Number(sql(`select count(*) from msg_notification where item_id = '${unruled}'`)) === 0);
  const mine = (await withFirm(A, () => leads.add(R, { givenNames: "Client M", familyName: "Sample", email: "m@pf18n2.example.org", source: "Referral", requestId: randomUUID() }))) as { id: string };
  ok("PF-18n2 DW1 fail: a lead added by hand belongs to its adder and tells nobody (no one handed it to them)", ownerOf(mine.id) === R.staffId && Number(sql(`select count(*) from msg_notification where item_id = '${mine.id}'`)) === 0);

  // ------------------------------------------------------------------------------------------- DW2 by hand (Assign)
  await withFirm(A, () => leads.assign(R, unruled, { staffId: T.staffId, expectedOwnerStaffId: null }));
  const tLead = (await itemsOf(T)).find((i) => i.item.id === unruled);
  ok("PF-18n2 DW2 pass: R assigns an Unassigned lead to T by hand: T gets one notification with the lead's name and page",
    ownerOf(unruled) === T.staffId && rowsOf(T.staffId, unruled) === 1 && tLead?.kind === "lead-assigned" && tLead.link === `/front-office/leads/${unruled}` && !!tLead.label?.includes(sql(`select number from fo_lead where id = '${unruled}'`)), tLead);
  ok("PF-18n2 DW2 fail: the person who assigned it (R) is not told", rowsOf(R.staffId, unruled) === 0);
  const own = (await arrival()).leadId!;
  await withFirm(A, () => leads.assign(R, own, { staffId: R.staffId, expectedOwnerStaffId: null }));
  ok("PF-18n2 DW2 fail: assigning a lead to oneself tells nobody (as Take it, AG-7-39 r4)", ownerOf(own) === R.staffId && Number(sql(`select count(*) from msg_notification where item_id = '${own}'`)) === 0);
  const refused = await refusal(() => withFirm(A, () => leads.assign(R, own, { staffId: T.staffId, expectedOwnerStaffId: O.staffId })));
  ok("PF-18n2 DW2 fail: an Assign refused (the owner changed meanwhile, 409) leaves no notification", refused === 409 && rowsOf(T.staffId, own) === 0, refused);

  // ------------------------------------------------------------------------------------------- DW3 reassigned away
  await withFirm(A, () => leads.assign(R, ruled, { staffId: T.staffId, expectedOwnerStaffId: O.staffId }));
  const lost = (await itemsOf(O)).find((i) => i.item.id === ruled), gained = (await itemsOf(T)).find((i) => i.item.id === ruled);
  ok("PF-18n2 DW3 pass: a lead reassigned from O to T: O's row stays (it happened) but shows neither the lead's name nor its link",
    !!lost && lost.label === null && lost.link === null && JSON.stringify(lost).indexOf("Client A") === -1, lost);
  ok("PF-18n2 DW3 fail: T, who now owns it, sees the name and the link", gained?.label === `Client A Sample (${number})` && gained.link === `/front-office/leads/${ruled}`, gained);
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${T.staffId}'`);
  const back = (await itemsOf(O)).find((i) => i.item.id === ruled), oRead = await refusal(() => withFirm(A, () => leads.read(O, ruled)));
  sql(`update platform_staff set status = 'ACTIVE' where id = '${T.staffId}'`);
  ok("PF-18n2 DW3 fail (one rule, the lead page's own): T deactivated makes the lead Unassigned; O (no view.all, no assign key) still sees no name, exactly as GET leads/:id answers O (404)",
    back?.label === null && back.link === null && oRead === 404, { back, oRead });

  // ------------------------------------------------------------------------------------------- DW4 another person never sees it
  const rIds = new Set((await itemsOf(R)).map((i) => i.id)), tIds = (await itemsOf(T)).map((i) => i.id);
  ok("PF-18n2 DW4 pass: R's list holds none of T's or O's rows", tIds.every((id) => !rIds.has(id)) && oItems.every((i) => !rIds.has(i.id)));
  const bList = await itemsOf(SOLO);
  const steal = await refusal(() => withFirm(A, () => route.read({ platform: O }, tIds[0]!, {})));
  ok("PF-18n2 DW4 fail: firm B's person sees an empty list; O marking T's row read is 404 and it stays unread", bList.length === 0 && steal === 404 && sql(`select coalesce(read_at::text, 'unread') from msg_notification where id = '${tIds[0]}'`) === "unread", { bList, steal });

  // ------------------------------------------------------------------------------------------- DW5 the person's switch and the caller's transaction
  await withFirm(A, () => db.platformNotificationPreference.create({ data: { firmId: A, staffId: O.staffId, group: "WORK_HANDED_TO_ME", inApp: false, email: true } }));
  const quiet = (await arrival()).leadId!;
  await withFirm(A, () => leads.assign(R, quiet, { staffId: O.staffId, expectedOwnerStaffId: null }));
  ok("PF-18n2 DW5 pass: O turned in-app off for Work handed to me: an Assign to O writes no row (the lead is still O's)", ownerOf(quiet) === O.staffId && rowsOf(O.staffId, quiet) === 0);
  await withFirm(A, () => db.platformNotificationPreference.update({ where: { staffId_group: { staffId: O.staffId, group: "WORK_HANDED_TO_ME" } }, data: { inApp: true } }));
  await rules.save(R, { door: "WEB_FORM", strategy: "OWNER", ownerStaffId: O.staffId });
  const before = Number(sql(`select count(*) from msg_notification where staff_id = '${O.staffId}'`));
  const broken: SalesPorts["audit"] = { record: async () => { throw new Error("audit down (test)"); } } as never;
  const crashed = await arrival({ audit: broken }).then(() => "kept", () => "rolled back");
  ok("PF-18n2 DW5 fail: an arrival whose transaction rolls back (audit fails closed) leaves no lead and no notification",
    crashed === "rolled back" && Number(sql(`select count(*) from msg_notification where staff_id = '${O.staffId}'`)) === before, { crashed });

  // ------------------------------------------------------------------------------------------- DW6 the app's wiring
  const sales = (await import("../api/src/features/front-office-sales.ts")).default as { providers: unknown[] };
  const salesPorts = sales.providers.find((p) => (p as { provide?: unknown }).provide === SALES_PORTS) as { inject?: unknown[] } | undefined;
  ok("PF-18n2 DW6 pass: the sales feature hands NOTIFICATION_PORT (optional) to SALES_PORTS and registers LeadNotificationLabels",
    !!salesPorts?.inject?.some((i) => (i as { token?: unknown }).token === NOTIFICATION_PORT && (i as { optional?: boolean }).optional === true) && sales.providers.includes(LeadNotificationLabels));
  const notif = (await import("../api/src/features/platform-notifications.ts")).default as { providers: unknown[] };
  ok("PF-18n2 DW6 fail-safe: NotificationLabels is one app-wide registry, provided once (by the notifications feature)", notif.providers.includes(NotificationLabels) && !sales.providers.includes(NotificationLabels));
  const twice = (() => { try { new LeadNotificationLabels(db, labels).onModuleInit(); return "accepted"; } catch { return "refused"; } })();
  ok("PF-18n2 DW6 fail: a second labeller for the same item kind is refused (one module owns each item kind)", twice === "refused");
} catch (e) {
  fail++;
  process.stderr.write(`FAIL  PF-18n2: the check crashed — ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
