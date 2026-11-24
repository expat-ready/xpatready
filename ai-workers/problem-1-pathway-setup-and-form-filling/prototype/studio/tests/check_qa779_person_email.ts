// QA-779 part (a) (R1.53; Gap · Major, qa 7, 24 Nov; the tech lead's ruling on #3532): a person's email can be added or
// changed by staff, so a client with no email can get one and their retainer can be sent. `PATCH /api/front-office/people/
// :personId` takes `{ email }`, alone or with `{ phone }` (FO-9a's route, people/edit.ts), against the real routes of an
// isolated copy (no fake API). Each rule a pass and a fail:
//   E1 FO-2's email rule: trimmed and lower-cased; not an email, empty, or an unknown field → 422 on the field, nothing saved;
//   E2 own or all as FO-2v: another firm's person and an unseen person are 404, nothing saved;
//   E3 the key agent/prospect:edit: a Read-only person is refused, nothing saved;
//   E4 the person's version (PF-31, If-Match): a stale one is 409 STALE with the saved values, nothing saved;
//   E5 the same address again writes nothing; E6 one audit line per change, its words and ids never the address
//      (before and after hold it, R1.8, P-687);
//   E7 another person with the address: saved, with a warning in words, named only when the editor may open them (P-574 (2));
//   E8 with the phone in one change; E9 the prospect read carries the email and the version; E10 the conflict check is
//      then out of date (gate.ts CONFLICT_CHECK_STALE), as the prospect page says.
// The sentences are written out here (not imported), so the check runs against code without the change and fails there.
// Seeds the Sample firms itself; Sample people by SQL. US$0, no model call, no mail.
//   zsh studio/tools/isolated.sh qa779 4448 start PLATFORM_IDENTITY=local && tsx studio/tests/check_qa779_person_email.ts 4448 xr_studio_qa779
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4448), DBNAME = process.argv[3] ?? "xr_studio_qa779";
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`;
const NOT_AN_EMAIL = "This is not an email address. Check it, for example name@example.com.", EMAIL_REQUIRED = "Enter an email address.";
const HIDDEN = "Someone you cannot open already has this email address. Ask a manager to check whether this is the same person.";
const ACTION = "front_office.person.email_changed";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; etag: string | null };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
try {
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
  const R = staffOf("user-R"), T = staffOf("user-T"), S = staffOf("user-S");   // firm A's Owner and Case Manager; firm B's Owner
  const roEmail = `qa779-reader-${run}@sample-firm.example.com`;
  const RO = { id: sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${roEmail}', 'Sample reader ${run}', 'qa779-reader-${run}', now()) returning id`), email: roEmail };
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${RO.id}', 'READ_ONLY', 'seed:QA-779-test')`);
  const signIn = async (firmKey: string, email: string) => {
    const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
    const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
  };
  const tok = { R: await signIn("sample-firm", R.email), T: await signIn("sample-firm", T.email), RO: await signIn("sample-firm", RO.email), S: await signIn("sample-solo", S.email) };
  const call = async (t: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Ans> => {
    const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const x = await r.text(); let b: unknown = x; try { b = JSON.parse(x); } catch { /* text */ } return { status: r.status, body: b, etag: r.headers.get("etag") };
  };
  const edit = (t: string, personId: string, body: unknown, headers?: Record<string, string>) => call(t, "PATCH", `/front-office/people/${personId}`, body, headers);
  const setSeesAll = async (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "seed:QA-779-test", workspaceId: await platformAuditWorkspaceId(db as never), reason: `QA-779 test: everyone sees all ${value ? "on" : "off"}` });
  let n = 0;
  /** A Sample person (email or none) on an Engaged lead and Individual prospect owned by `owner`, in firm `f`. */
  const person = (given: string, owner: string, email: string | null = null, f = A) => {
    const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${f}', '${given}${run}', 'Sample', ${email ? `'${email}'` : "null"}, 'test', now()) returning id`);
    const lead = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${f}', '${pid}', 'MANUAL', 'WEBSITE', '${owner}', 'ENGAGED', now(), 'test', 'test', now()) returning number`);
    const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
      select gen_random_uuid(), '${f}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${f}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${owner}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
    sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
    return { pid, prospectId: id, lead, name: `${given}${run} Sample`, n: ++n };
  };
  const emailOf = (pid: string) => sql(`select coalesce(email, '-') from fo_person where id = '${pid}'`);
  const lines = (pid: string) => Number(sql(`select count(*) from audit_event where entity = 'fo_person' and entity_key = '${pid}' and action = '${ACTION}'`));
  const fieldOf = (a: Ans, f: string) => (a.body?.fields ?? {})[f] as string | undefined;
  await setSeesAll(true);

  // ------------------------------------------------------------------------------------------------- E1 the email rule
  const ana = person("Ana", R.id);
  const saved = await edit(tok.R, ana.pid, { email: `  Ana.${run}@Example.COM ` });
  ok("R1.53 QA-779 E1 pass: { email } on a person with none is saved, trimmed and lower-cased, with the person's new version",
    saved.status === 200 && saved.body.email === `ana.${run}@example.com` && emailOf(ana.pid) === `ana.${run}@example.com` && typeof saved.body.version === "string", saved.body);
  const bea = person("Bea", R.id);
  const bad = await Promise.all(["not-an-email", "name@example", "two@@example.com", "a b@example.com", `x@example.com${"\u0000"}`, "a\u0085b@example.com", "a​b@example.com", `${"a".repeat(250)}@example.com`].map((e) => edit(tok.R, bea.pid, { email: e })));
  ok("R1.53 QA-779 E1 fail: an address that is not an email (no @ or domain, two @, a space, a control or invisible mark (U+0000, U+0085, U+200B), over 254 characters) → 422 with the field's one sentence, never a 500, nothing saved",
    bad.every((a) => a.status === 422 && fieldOf(a, "email") === NOT_AN_EMAIL) && emailOf(bea.pid) === "-" && lines(bea.pid) === 0, bad.map((a) => [a.status, fieldOf(a, "email")]));
  const empty = await Promise.all([{ email: "   " }, { email: null }, { email: 12 }].map((b) => edit(tok.R, bea.pid, b)));
  ok("R1.53 QA-779 E1 fail: an empty email or none (removing an email is not asked for) → 422 \"Enter an email address.\"; not text → the field's sentence; nothing saved",
    empty[0].status === 422 && fieldOf(empty[0], "email") === EMAIL_REQUIRED && fieldOf(empty[1], "email") === EMAIL_REQUIRED && fieldOf(empty[2], "email") === NOT_AN_EMAIL && emailOf(bea.pid) === "-", empty.map((a) => [a.status, a.body?.fields]));
  const extra = await edit(tok.R, bea.pid, { email: `bea.${run}@example.com`, note: "x" });
  ok("R1.53 QA-779 E1 fail: another field beside email → 422 naming that field only (email is a field of this route now), nothing saved",
    extra.status === 422 && !!fieldOf(extra, "note") && !fieldOf(extra, "email") && emailOf(bea.pid) === "-", extra.body);

  // ------------------------------------------------------------------------------------------------- E2 who may
  const bOther = person("Otherfirm", S.id, null, B);
  const cross = await edit(tok.R, bOther.pid, { email: `other.${run}@example.com` });
  ok("R1.53 QA-779 E2 fail: another firm's person → 404, as an unknown id, nothing saved", cross.status === 404 && emailOf(bOther.pid) === "-" && (await edit(tok.R, crypto.randomUUID(), { email: `x.${run}@example.com` })).status === 404, cross.body);
  ok("R1.53 QA-779 E2 pass: that firm's own Owner adds it", (await edit(tok.S, bOther.pid, { email: `other.${run}@example.com` })).status === 200 && emailOf(bOther.pid) === `other.${run}@example.com`);
  await setSeesAll(false);
  const ownT = person("Tess", T.id), rOnly = person("Rex", R.id);
  const unseen = await edit(tok.T, rOnly.pid, { email: `rex.${run}@example.com` });
  ok("R1.53 QA-779 E2 fail: with \"everyone sees all\" off, the Case Manager and the Owner's person → 404, nothing saved", unseen.status === 404 && emailOf(rOnly.pid) === "-", unseen.body);
  ok("R1.53 QA-779 E2 pass: the Case Manager adds the email of the person on their own lead", (await edit(tok.T, ownT.pid, { email: `tess.${run}@example.com` })).status === 200 && emailOf(ownT.pid) === `tess.${run}@example.com`);
  await setSeesAll(true);

  // ------------------------------------------------------------------------------------------------- E3 the key
  const cy = person("Cy", R.id);
  const ro = await edit(tok.RO, cy.pid, { email: `cy.${run}@example.com` });
  const roAfter = emailOf(cy.pid), byOwner = await edit(tok.R, cy.pid, { email: `cy.${run}@example.com` });
  ok("R1.53 QA-779 E3 fail/pass: a Read-only person (no agent/prospect:edit) is refused 403 and nothing is saved; the Owner's same body is saved",
    ro.status === 403 && roAfter === "-" && byOwner.status === 200 && emailOf(cy.pid) === `cy.${run}@example.com`, { ro: ro.status, owner: byOwner.status });

  // ------------------------------------------------------------------------------------------------- E4 the version
  const di = person("Di", R.id);
  const read1 = await call(tok.R, "GET", `/front-office/prospects/${di.prospectId}`);
  const v1 = read1.body?.person?.version as string | undefined;
  sql(`update fo_person set phone = '+14165550142', updated_at = now() + interval '1 second' where id = '${di.pid}'`);   // a colleague's save meanwhile (Sample)
  const stale = await edit(tok.R, di.pid, { email: `di.${run}@example.com` }, { "if-match": `"${v1}"` });
  ok("R1.53 QA-779 E4 fail: with the version read before a colleague's save (If-Match) → 409 STALE with the saved values and the new version, nothing saved",
    !!v1 && stale.status === 409 && stale.body?.code === "STALE" && stale.body?.current?.email === null && stale.body?.current?.phone === "+14165550142" && stale.body?.current?.version !== v1 && emailOf(di.pid) === "-", stale.body);
  const fresh = await edit(tok.R, di.pid, { email: `di.${run}@example.com` }, { "if-match": `"${stale.body?.current?.version}"` });
  ok("R1.53 QA-779 E4 pass: with the current version (If-Match) it is saved, and the answer's ETag is the new version", fresh.status === 200 && emailOf(di.pid) === `di.${run}@example.com` && fresh.etag === `"${fresh.body.version}"`, { status: fresh.status, etag: fresh.etag, body: fresh.body });

  // ------------------------------------------------------------------------------------------------- E5, E6 no change; the audit line
  const at = sql(`select updated_at from fo_person where id = '${ana.pid}'`), n0 = lines(ana.pid);
  const again = await edit(tok.R, ana.pid, { email: `ANA.${run}@example.com` });
  ok("R1.53 QA-779 E5 fail: the same address again (another case) writes nothing: no new version, no audit line",
    again.status === 200 && again.body.email === `ana.${run}@example.com` && sql(`select updated_at from fo_person where id = '${ana.pid}'`) === at && lines(ana.pid) === n0 && n0 === 1, { n0, after: lines(ana.pid) });
  const changed = await edit(tok.R, ana.pid, { email: `ana.new.${run}@example.com` });
  ok("R1.53 QA-779 E5 pass: a different address is saved with one more audit line", changed.status === 200 && emailOf(ana.pid) === `ana.new.${run}@example.com` && lines(ana.pid) === 2);
  const words = sql(`select string_agg(summary || ' ' || actor || ' ' || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(detail) e(k, v) where k !~ '_(before|after)$')::text, ' ') from audit_event where entity_key = '${ana.pid}' and action = '${ACTION}'`);
  const vals = sql(`select string_agg(coalesce(detail->>'email_before', '-') || '>' || coalesce(detail->>'email_after', '-'), ' ' order by at) from audit_event where entity_key = '${ana.pid}' and action = '${ACTION}'`);
  ok("R1.53 QA-779 E6 pass: each change is one audit line on fo_person naming the person and the staff member; before and after hold the address in full (R1.8, P-687)",
    words.includes(ana.pid) && words.includes(`staff:${R.id}`) && vals === `->ana.${run}@example.com ana.${run}@example.com>ana.new.${run}@example.com`, { vals });
  ok("R1.53 QA-779 E6 fail: the line's words and ids never hold the address (no @, no local part) (PF-23)", lines(ana.pid) === 2 && !/@|ana\.|example\.com/i.test(words), words.slice(0, 300));

  // ------------------------------------------------------------------------------------------------- E7 another person with the address
  const known = person("Kit", R.id, `kit.${run}@example.com`), eli = person("Eli", R.id);
  const dup = await edit(tok.R, eli.pid, { email: `Kit.${run}@example.com` });
  ok("R1.53 QA-779 E7 pass: another person in the firm already has the address → saved (a warning, never a block, P-574 (2)), and the answer names them with their lead",
    dup.status === 200 && emailOf(eli.pid) === `kit.${run}@example.com` && dup.body.warning === `${known.name} (${known.lead}) already has this email address. Check whether this is the same person.`, dup.body);
  await setSeesAll(false);
  const fin = person("Fin", T.id);
  const hidden = await edit(tok.T, fin.pid, { email: `kit.${run}@example.com` });
  ok("R1.53 QA-779 E7 fail: the other person is on a lead the editor may not open → saved, with the nameless warning only (never their name)",
    hidden.status === 200 && emailOf(fin.pid) === `kit.${run}@example.com` && hidden.body.warning === HIDDEN && !String(hidden.body.warning).includes("Kit"), hidden.body);
  await setSeesAll(true);
  ok("R1.53 QA-779 E7 fail: no other person with the address → no warning", saved.status === 200 && !("warning" in saved.body) && fresh.status === 200 && !("warning" in fresh.body), { saved: saved.body, fresh: fresh.body });

  // ------------------------------------------------------------------------------------------------- E8 with the phone
  const gil = person("Gil", R.id);
  const both = await edit(tok.R, gil.pid, { email: `gil.${run}@example.com`, phone: "+1 416 555 0143" });
  const phoneOnly = await edit(tok.R, gil.pid, { phone: "+1 416 555 0144" });
  ok("R1.53 QA-779 E8 pass: { email, phone } saves both in one change (one line each); { phone } alone still answers as before, without an email",
    both.status === 200 && both.body.email === `gil.${run}@example.com` && both.body.phone === "+14165550143" && lines(gil.pid) === 1 && Number(sql(`select count(*) from audit_event where entity_key = '${gil.pid}' and action = 'front_office.person.phone_changed'`)) === 2
    && phoneOnly.status === 200 && JSON.stringify(Object.keys(phoneOnly.body).sort()) === JSON.stringify(["fixNumber", "personId", "phone", "version"]), { both: both.body, phoneOnly: phoneOnly.body });
  const hal = person("Hal", R.id);
  const badPhone = await edit(tok.R, hal.pid, { email: `hal.${run}@example.com`, phone: "12" });
  ok("R1.53 QA-779 E8 fail: a good email with an unreadable phone → 422 on the phone, and neither is saved", badPhone.status === 422 && !!fieldOf(badPhone, "phone") && emailOf(hal.pid) === "-" && sql(`select coalesce(phone, '-') from fo_person where id = '${hal.pid}'`) === "-", badPhone.body);

  // ------------------------------------------------------------------------------------------------- E9, E10 the prospect read; the conflict check
  const p9 = await call(tok.R, "GET", `/front-office/prospects/${di.prospectId}`);
  ok("R1.53 QA-779 E9 pass: the prospect read carries the person's email and the version the edit answered (the page's Email field and If-Match)",
    p9.body?.person?.email === `di.${run}@example.com` && p9.body?.person?.version === fresh.body.version, p9.body?.person);
  ok("R1.53 QA-779 E9 fail: a person with no email reads null there (\"Not given\")", (await call(tok.R, "GET", `/front-office/prospects/${bea.prospectId}`)).body?.person?.email === null);
  const ivy = person("Ivy", R.id);
  const check = await call(tok.R, "POST", "/front-office/conflict-checks", { requestId: crypto.randomUUID(), prospectId: ivy.prospectId, result: "NO_CONFLICT" });
  const gate = async () => (await call(tok.R, "GET", `/front-office/prospects/${ivy.prospectId}/conflict-checks`)).body?.clearance;
  const before = await gate(), added = await edit(tok.R, ivy.pid, { email: `ivy.${run}@example.com` }), afterGate = await gate();
  ok("R1.53 QA-779 E10 pass/fail: a check recorded with no email clears the gate; once the email is added the check is out of date (CONFLICT_CHECK_STALE), so a new check is needed before the retainer is sent",
    check.status === 201 && before?.ok === true && added.status === 200 && afterGate?.ok === false && afterGate?.code === "CONFLICT_CHECK_STALE", { check: check.status, before, added: added.status, afterGate });
} catch (e) {
  ok("R1.53 QA-779: the check ran to the end", false, String((e as Error).stack ?? e).slice(0, 1200));
} finally {
  await db.$disconnect().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
