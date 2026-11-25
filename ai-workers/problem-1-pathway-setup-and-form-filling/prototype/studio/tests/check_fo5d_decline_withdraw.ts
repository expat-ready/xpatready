// FO-5d (1) (BACKLOG row FO-5d; AG-5-68, AG-5-21, AG05-D2(6), AG05-D4(7)(8); R1.55 W3 "a decline kept with its reason"): the
// client declines a retainer on the public signing door with a reason of their own, or the provider sends `declined`.
// Each case passes and fails as the row names it, on one scratch database (every migration, PF-3's and FO-1a's Sample
// seeds), dropped at the end. In process: the services and the door's own controller (its schema and its 404), the fake
// adapter, fake mail and fake notifications: no vendor call, no network, no model call (US$0). Sample values.
// (Withdraw and Edit stopping the link, FO-5d (2)-(3), are QA-770's lines in tests/check_fo6_signing_api.ts.)
//   tsx studio/tests/check_fo5d_decline_withdraw.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";
import { fakeNotifications, NOTIFICATION_GROUP, NOTIFICATION_KIND } from "../ports/notifications.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { RetainerNotificationLabels } from "../api/src/front-office/retainers/notification-labels.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import { SigningDoorController } from "../api/src/front-office/signing/door.controller.ts";
import { SigningDoor } from "../api/src/front-office/signing/door.ts";
import { useSigningMail, useSigningNotifications, useSigningPort } from "../api/src/front-office/signing/handlers.ts";
import { SigningHooksController } from "../api/src/front-office/signing/hooks.ts";
import { fakeSigning, type SigningHookCall } from "../api/src/front-office/signing/port.ts";
import { Signing } from "../api/src/front-office/signing/service.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { NotificationLabels } from "../api/src/platform/notifications/labels.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo5d_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo5d-check-${process.pid}`);
const CONSENT = "sign-electronically-v1";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const sqlFails = (q: string) => { try { sql(q); return null; } catch (e) { return String((e as { stderr?: unknown }).stderr ?? e); } };
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    return x.getStatus ? { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> } : { status: 0, body: { error: String(e) } };
  }
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  const dirs = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
  for (const d of dirs) {
    execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
    if (d === "20261125150000_front-office-signing__fo5d_decline_reason")   // measured right after its own migration (the row's rule)
      ok("FO-5d M pass: right after its migration, fo_signer has a nullable decline_reason text column and its check",
        sql(`select data_type || ':' || is_nullable from information_schema.columns where table_name = 'fo_signer' and column_name = 'decline_reason'`) === "text:YES"
          && count("pg_constraint", "conname = 'fo_signer_decline_reason_check'") === 1);
  }
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-5d setup: the Sample firms have their pipelines", fo.failed.length === 0);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const ctxOf = (actorId: string, firmKey: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey, roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R", "sample-firm");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });

  const signing = fakeSigning(), mail = fakeMail(), notes = fakeNotifications();
  useSigningPort(signing); useSigningMail(mail); useSigningNotifications(notes as never);
  const files = new LocalFiles(join(WORK, "files")), clock = { now: () => Date.now() };
  const svc = new Retainers(db, files, clock), api = new Signing(db, files), door = new SigningDoor(db);
  const routes = new SigningDoorController(door), hooks = new SigningHooksController(api);
  clearingConflicts(db, { retainers: Retainers.prototype, prospects: Prospects.prototype });
  const salesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, salesPorts), pros = new Prospects(db, salesPorts);
  const tpl = await svc.uploadTemplate(R, { name: "FO-5d retainer (Sample)" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  let n = 0;
  const prospect = async (given: string) => {
    const l = (await leads.add(R, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string; person: { id: string } };
    const p = await pros.engage(R, l.id);
    return { id: p.id, personId: l.person.id };
  };
  /** A sent retainer and the client's link token, read from the "Please sign" email as the client gets it. */
  const sent = async (given: string) => {
    const p = await prospect(given);
    const rid = (await svc.draft(R, p.id, { templateId: tpl.id, fees: [{ label: "Deposit on signing", amountMinor: 150000, when: "ON_SIGNING" }] })).id;
    const before = mail.sent.length;
    await svc.send(R, rid, { expectedVersion: 1 });
    const body = mail.sent.slice(before).find((m) => m.templateKey === "signing.please_sign")?.text ?? "";
    const token = body.match(/\/sign\/([0-9a-f]{32}\.[A-Za-z0-9_-]{43})/)?.[1] ?? "";
    const [q, d] = sql(`select id || '|' || provider_document_id from fo_signature_request where document_id = '${rid}' order by sent_at desc limit 1`).split("|");
    return { p, rid, token, q, d };
  };
  const ip = (k: number) => ({ ip: `10.9.0.${k}`, headers: { "content-type": "application/json" } });
  const res = { setHeader: () => undefined };
  const decline = (token: string, body: unknown, k = 1) => routes.decline(token, body, ip(k), res);
  const reqOf = (q: string) => sql(`select status || ':' || (ended_at is not null) from fo_signature_request where id = '${q}'`);
  const retOf = (rid: string) => sql(`select status from fo_retainer where id = '${rid}'`);
  const signerOf = (q: string, role: "CLIENT" | "FIRM") => sql(`select id from fo_signer where request_id = '${q}' and role = '${role}'`);
  const post = (c: SigningHookCall) => hooks.receive("fake", { ip: "10.0.0.1", headers: c.headers, body: JSON.parse(new TextDecoder().decode(c.body)) });

  // ---------------------------------------------------------------- D1: the client declines with a reason
  const REASON = "The fee is more than we agreed on the call (Sample)";
  const a = await sent("Ana");
  ok("FO-5d setup: Send emailed the client a link with a firm-first token", /^[0-9a-f]{32}\./.test(a.token), a.token.slice(0, 40));
  const mailsA = mail.sent.length, cancelsA = signing.calls.filter((c) => c.op === "cancel" && c.providerDocumentId === a.d).length;
  const dA = await decline(a.token, { reason: `  ${REASON}  ` });
  ok("FO-5d D1 pass: a decline with a reason answers DECLINED in words; the request and the retainer are DECLINED, the request ended",
    (dA as { state?: string }).state === "DECLINED" && reqOf(a.q) === "DECLINED:true" && retOf(a.rid) === "DECLINED", { dA, req: reqOf(a.q), ret: retOf(a.rid) });
  ok("FO-5d D1 pass: the client's reason is kept once, trimmed, word for word, on their signer row with declined_at",
    sql(`select decline_reason || '|' || (declined_at is not null) from fo_signer where request_id = '${a.q}' and role = 'CLIENT'`) === `${REASON}|true`);
  ok("FO-5d D1 pass: the retainer's version ended DECLINED", sql(`select end_reason from fo_retainer_version where retainer_id = '${a.rid}' and n = 1`) === "DECLINED");
  ok("FO-5d D1 pass: the envelope is cancelled at the vendor once; nobody is emailed (the firm signer gets nothing)",
    signing.calls.filter((c) => c.op === "cancel" && c.providerDocumentId === a.d).length === cancelsA + 1 && mail.sent.length === mailsA);
  const told = notes.sent().filter((x) => x.item.kind === "retainer" && x.item.id === a.rid);
  const owner = sql(`select owner_staff_id from fo_prospect where id = '${a.p.id}'`);
  ok("FO-5d D1 pass: one \"needs you\" item (retainer-declined, NEEDS_YOU) to the prospect's owner, pointing at the retainer",
    told.length === 1 && told[0].kind === NOTIFICATION_KIND.RETAINER_DECLINED && told[0].staffId === owner && NOTIFICATION_GROUP[NOTIFICATION_KIND.RETAINER_DECLINED] === "NEEDS_YOU", told);
  ok("FO-5d D1 pass: one audit line each for the request and the retainer, in the decline's transaction; neither holds the reason",
    count("audit_event", `entity_key = '${a.q}' and action = 'signing.declined'`) === 1 && count("audit_event", `entity_key = '${a.rid}' and action = 'retainer.declined'`) === 1
      && count("audit_event", `(entity_key in ('${a.q}', '${a.rid}')) and to_jsonb(audit_event)::text like '%fee is more%'`) === 0
      && sql(`select count(distinct xmin::text) from audit_event where entity_key in ('${a.q}', '${a.rid}') and action in ('signing.declined', 'retainer.declined')`) === "1");
  const st = await api.retainerState(A, a.rid);
  ok("FO-5d D1 pass: the retainer's signing state shows the client's decline with their reason (staff read)",
    st.status === "DECLINED" && st.signers.find((s) => s.role === "CLIENT")?.declineReason === REASON, st.signers);
  const labels = new NotificationLabels(), lab = new RetainerNotificationLabels(db, labels, svc); lab.onModuleInit();
  const named = await labels.of(R, [{ kind: "retainer", id: a.rid }]);
  ok("FO-5d D1 pass: the item is named and linked for a reader who may open the retainer (\"Retainer for …\", its page), never with the reason",
    named.get(`retainer|${a.rid}`)?.link === `/front-office/retainers/${a.rid}` && /^Retainer for Ana/.test(named.get(`retainer|${a.rid}`)?.label ?? "") && !/fee/.test(named.get(`retainer|${a.rid}`)?.label ?? ""), [...named]);
  const noKey = await labels.of({ ...R, keys: R.keys.filter((k) => k !== "agent/retainer:show") }, [{ kind: "retainer", id: a.rid }]);
  ok("FO-5d D1 fail: a reader without the retainer's read key gets no name and no link", noKey.size === 0);

  // ---------------------------------------------------------------- D2: refusals
  const again = await refusal(() => decline(a.token, { reason: "twice" }));
  ok("FO-5d D2 fail: a second decline on the ended link → 409 in words (declined), nothing changes",
    again?.status === 409 && again.body.state === "DECLINED" && count("audit_event", `entity_key = '${a.q}' and action = 'signing.declined'`) === 1, again);
  const b = await sent("Bea");
  const long = await refusal(() => decline(b.token, { reason: "x".repeat(501) }));
  ok("FO-5d D2 fail: a 501-character reason → 422 on the reason field; the request stays SENT", long?.status === 422 && JSON.stringify(long.body).includes("reason") && reqOf(b.q) === "SENT:false", long);
  const extra = await refusal(() => decline(b.token, { reason: "ok", why: "x" }));
  ok("FO-5d D2 fail: an unknown field → 422, named", extra?.status === 422 && JSON.stringify(extra.body).includes("why"), extra);
  const bad = await refusal(() => decline("nope", {}));
  const other = await refusal(() => decline(`${"0".repeat(32)}.${"A".repeat(43)}`, {}));
  const firmTok = await refusal(() => decline(b.token.replace(/\..*$/, `.${"B".repeat(43)}`), {}));
  ok("FO-5d D2 fail: a malformed, unknown or other firm's token → the one 404 \"This link does not work.\"",
    [bad, other, firmTok].every((x) => x?.status === 404 && x.body.code === "LINK_NOT_WORKING"), [bad, other, firmTok]);
  // A client who signed cannot decline (their consent and signature as part 4's door and the vendor write them).
  sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${b.q}'`);
  await post((await signing.act(A, b.d, signerOf(b.q, "CLIENT"), "signed"))[0]);
  const signedDecl = await refusal(() => decline(b.token, { reason: "changed my mind" }));
  ok("FO-5d D2 fail: a client who signed cannot decline → 409 (signed), the request stays CLIENT_SIGNED, no reason kept",
    signedDecl?.status === 409 && signedDecl.body.state === "SIGNED" && reqOf(b.q) === "CLIENT_SIGNED:false" && count("fo_signer", `request_id = '${b.q}' and decline_reason is not null`) === 0, signedDecl);

  // ---------------------------------------------------------------- D3: no reason, and the provider's declined event
  const c = await sent("Cai");
  await decline(c.token, { reason: "   " });
  ok("FO-5d D3 pass: a blank reason is no reason: DECLINED, decline_reason null", retOf(c.rid) === "DECLINED" && sql(`select coalesce(decline_reason, 'null') from fo_signer where request_id = '${c.q}' and role = 'CLIENT'`) === "null");
  const e = await sent("Eli");
  const [ev] = await signing.act(A, e.d, signerOf(e.q, "CLIENT"), "declined");
  const e1 = await post(ev), e2 = await post(ev);
  ok("FO-5d D3 pass: the provider's declined event → request and retainer DECLINED with no reason, one item to the owner",
    e1.applied === true && reqOf(e.q) === "DECLINED:true" && retOf(e.rid) === "DECLINED" && count("fo_signer", `request_id = '${e.q}' and declined_at is not null and decline_reason is null`) === 1
      && notes.sent().filter((x) => x.item.id === e.rid).length === 1, { e1, req: reqOf(e.q) });
  ok("FO-5d D3 fail: the same event twice → applied once (duplicate), one audit line", e2.applied === false && count("audit_event", `entity_key = '${e.q}' and action = 'signing.declined'`) === 1, e2);
  const [sg] = await signing.act(A, e.d, signerOf(e.q, "CLIENT"), "signed").catch(() => [null as unknown as SigningHookCall]);
  const late = sg ? await post(sg) : { applied: false, reason: "the vendor refused it (ended)" };
  ok("FO-5d D3 fail: a signature after a decline → not applied; the client stays unsigned", late.applied === false && count("fo_signer", `request_id = '${e.q}' and signed_at is not null`) === 0, late);
  const st2 = await refusal(() => door.state(e.token).then((x) => { if ((x as { state: string }).state !== "DECLINED") throw new Error((x as { state: string }).state); }));
  ok("FO-5d D3 pass: the declined link reads declined on the door", st2 === null, st2);

  // ---------------------------------------------------------------- D4: the firm's signer declines after the client signed
  const f = await sent("Fay");
  sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${f.q}'`);
  await post((await signing.act(A, f.d, signerOf(f.q, "CLIENT"), "signed"))[0]);
  await post((await signing.act(A, f.d, signerOf(f.q, "FIRM"), "declined"))[0]);
  ok("FO-5d D4 pass: the firm's signer declining after the client signed ends the request DECLINED and the retainer WITHDRAWN with that reason (never a 500), no item",
    reqOf(f.q) === "DECLINED:true" && sql(`select status || '|' || withdrawn_reason from fo_retainer where id = '${f.rid}'`) === "WITHDRAWN|The firm's signer declined to sign after the client signed."
      && notes.sent().filter((x) => x.item.id === f.rid).length === 0);

  // ---------------------------------------------------------------- D-DB: the database keeps the reason honest
  const g = await sent("Gus");
  const gs = signerOf(g.q, "CLIENT");
  ok("FO-5d D-DB fail: a reason without declined_at → refused by the database", sqlFails(`update fo_signer set decline_reason = 'x' where id = '${gs}'`) !== null);
  ok("FO-5d D-DB fail: an untrimmed or over-500 reason → refused by the database",
    sqlFails(`update fo_signer set declined_at = now(), decline_reason = ' x' where id = '${gs}'`) !== null && sqlFails(`update fo_signer set declined_at = now(), decline_reason = repeat('x', 501) where id = '${gs}'`) !== null);
  ok("FO-5d D-DB fail: a kept reason never changes (part 1's signer trigger)", sqlFails(`update fo_signer set decline_reason = 'another' where request_id = '${a.q}' and role = 'CLIENT'`) !== null
    && sql(`select decline_reason from fo_signer where request_id = '${a.q}' and role = 'CLIENT'`) === REASON);
} finally {
  useSigningNotifications(null);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
