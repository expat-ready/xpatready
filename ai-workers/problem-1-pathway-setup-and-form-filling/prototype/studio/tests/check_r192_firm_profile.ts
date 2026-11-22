// R1.92 (PF-5fp; AG-01 §3.1, AG01-29(7), AG-16 §3.1, AG-1-74, AG-1-30/-31): the firm's profile, its offices with their time zones and a
// licence record, saved, read back and audited through the API on an isolated copy (its own database and port, never :4400), with the
// database read underneath. Each line has a pass and a fail:
//   P1 the Owner reads the profile: legal and trading name read-only, language, time zone and currency with their defaults, the billing
//      email, the licence count and the version; fail: the Case Officer reads it too but may change nothing (canChange false, PUT 403);
//   P2 the Owner saves public phone, public email, website, time zone and currency in one save: read back the same, one
//      platform.setting.change line per changed key, with its before and after; the same save again
//      changes nothing and writes no line;
//   P3 refusals in words on the field, nothing written: a time zone not on the list, a website without https, a phone with letters, a
//      currency other than CAD or USD (422, each field named); the legal name, trading name and country are refused as "not changed here";
//      an unknown field (firmId) is refused; a stale version is 409 with the latest profile;
//   P4 Owner only: the billing email is saved by the Owner (one platform.firm.billing_email_changed line, before and after); an Admin
//      (user-T, given Admin by the Owner through the roles route) changes the website but the billing email is 403 and nothing is written;
//   BR the breaker's round 1 on 180c6706b, each with its fail test: M1 a website with an email-shaped part saves (was 500); M2 a
//      billing email in capitals saves in lower case (was 500); M3/m4 a website with control, direction or invisible characters, a
//      space or a private host is refused (was stored); m2 an inherited key name is an unknown field; m3 plain words; m5 a phone of
//      brackets only refused; m6 an Admin's save carrying the unchanged billing email goes through; m1 only Owner and Admin read the
//      billing email and business address;
//   O1 offices: the Owner adds an office in Alberta: its zone is America/Edmonton, read back in the list with the first office (the firm's
//      zone), one platform.office.add line for it; fail: a zone not on the list is 422;
//   L1 licence: the Owner saves the Case Officer's licence record; GET licences reads it back; one platform.staff.credential_saved line,
//      and the licence number never in an audit line;
//   F1 another firm (sample-solo) refused: its Owner reads only its own profile (never firm A's values), its save never changes firm A's
//      settings, firm A's office is 404 to it and firm A's person's licence is 404 to it.
// Re-runnable on the same copy (each run's values are new; offices are never removed, so each run adds its own). US$0, no model call,
// live AI off. Run from prototype/:
// (the usage line run-suites.sh reads: an isolated copy on its own port, 4793, used by no other suite; #3003's batch failed on shard 10
// when this line carried --ttl and a trap, so the runner did not recognise it and ran the check with no copy)
//   zsh studio/tools/isolated.sh r192 4793 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_r192_firm_profile.ts 4793 xr_studio_r192
import { client, recorder } from "./runtime/api.ts";

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4793), process.argv[3] ?? "xr_studio_r192"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (firmKey: string, who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const lines = (action: string, key: string, since: string) => Number(sql(`select count(*) from audit_event where action = '${action}' and entity_key = '${key}' and at > '${since}'`));
const now = () => sql(`select clock_timestamp()::text`);
const PROFILE = "/platform/firm/profile";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const TOWNER = await signIn("sample-firm", { actorId: "user-R" }), TOFF = await signIn("sample-firm", { actorId: "user-O" });
const OFF = sql(`select id from platform_staff where actor_id = 'user-O' and firm_id = '${A}'`), ADM = sql(`select id from platform_staff where actor_id = 'user-T' and firm_id = '${A}'`);
const bOwner = sql(`select s.id from platform_staff s join platform_role_grant g on g.staff_id = s.id and g.ended_at is null and g.role = 'OWNER' where s.firm_id = '${B}' and s.status = 'ACTIVE' order by s.created_at limit 1`);
const TB = await signIn("sample-solo", { email: sql(`select email from platform_staff where id = '${bOwner}'`) });
ok("R1.92 setup: the Sample firms; firm A's Owner (user-R), Case Officer (user-O) and user-T; firm B's Owner, all signed in", !!A && !!B && !!OFF && !!ADM && !!bOwner);
const run = Date.now().toString(36).slice(-6), digits = String(Date.now()).slice(-7);

// ------------------------------------------------------------------------------------------------ P1 read
const p0 = await api(TOWNER, "GET", PROFILE);
ok("R1.92 P1 pass: the Owner reads the firm profile: names read-only, language, an IANA time zone, CAD or USD, the version, the licence count",
  p0.status === 200 && p0.body.firm?.operatingName && p0.body.readOnly?.includes("legalName") && p0.body.readOnly?.includes("operatingName") && ["en", "fr"].includes(p0.body.details?.language)
  && /^[A-Za-z_]+\/[A-Za-z_]+/.test(p0.body.details?.timeZone) && ["CAD", "USD"].includes(p0.body.details?.currency) && typeof p0.body.version === "string" && p0.body.licensedStaff >= 1
  && p0.body.canChange?.details === true && p0.body.canChange?.ownerOnly === true, p0.body);
const pOff = await api(TOFF, "GET", PROFILE), putOff = await api(TOFF, "PUT", PROFILE, { version: p0.body.version, website: "https://refused.example.ca" });
ok("R1.92 P1 fail: the Case Officer reads the profile but may change nothing (canChange false; PUT 403)", pOff.status === 200 && pOff.body.canChange?.details === false && pOff.body.canChange?.ownerOnly === false && putOff.status === 403, [pOff.body?.canChange, putOff.status]);
ok("R1.92 P1 fail: no session, no profile (401)", (await api(null, "GET", PROFILE)).status === 401);

// ------------------------------------------------------------------------------------------------ P2 save and read back, audited
const zone = p0.body.details.timeZone === "America/Vancouver" ? "America/Halifax" : "America/Vancouver", currency = p0.body.details.currency === "CAD" ? "USD" : "CAD";
const want = { publicPhone: `+1 416 ${digits.slice(0, 3)}-${digits.slice(3)}`, publicEmail: `office-${run}@sample-firm.example.ca`, website: `https://sample-firm-${run}.example.ca`, timeZone: zone, currency };
let t0 = now();
const s1 = await api(TOWNER, "PUT", PROFILE, { version: p0.body.version, ...want });
const back = await api(TOWNER, "GET", PROFILE);
ok("R1.92 P2 pass: one save of phone, email, website, time zone and currency; read back the same", s1.status === 200 && Object.entries(want).every(([k, v]) => back.body.details?.[k] === v) && s1.body.changed?.length === 5, [s1.status, s1.body?.changed, back.body?.details]);
const keyLine = (key: string) => Number(sql(`select count(*) from audit_event where action = 'platform.setting.change' and entity_key = '${A}:${key}' and at > '${t0}'`));
ok("R1.92 P2 audited: one platform.setting.change line per changed key, each on firm A", ["platform.public_phone", "platform.public_email", "platform.website", "platform.time_zone", "platform.currency"].every((k) => keyLine(k) === 1),
  ["platform.public_phone", "platform.public_email", "platform.website", "platform.time_zone", "platform.currency"].map(keyLine));
ok("R1.92 P2 audited with before and after: the public email's line holds the new value as its after (R1.8's shape)",
  sql(`select count(*) from audit_event where at > '${t0}' and entity_key = '${A}:platform.public_email' and detail::text like '%${want.publicEmail}%'`) === "1");
ok("R1.92 P2 stored: the settings rows hold the saved values", sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'`) === zone && sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.website'`) === want.website);
t0 = now();
const s2 = await api(TOWNER, "PUT", PROFILE, { version: back.body.version, ...want });
ok("R1.92 P2 fail: the same save again changes nothing and writes no audit line", s2.status === 200 && s2.body.changed?.length === 0 && sql(`select count(*) from audit_event where at > '${t0}' and firm_id = '${A}'`) === "0", [s2.status, s2.body?.changed]);

// ------------------------------------------------------------------------------------------------ P3 refusals
const v = back.body.version; t0 = now();
const bad = await api(TOWNER, "PUT", PROFILE, { version: v, timeZone: "Mars/Olympus", website: "ftp://sample.example.ca", publicPhone: "call us", currency: "EUR" });
ok("R1.92 P3: a zone not on the list, an ftp:// website, a phone with letters and EUR are refused on their fields (422), in words",
  bad.status === 422 && ["timeZone", "website", "publicPhone", "currency"].every((f) => typeof bad.body?.fields?.[f] === "string") && /time zone/i.test(bad.body.fields.timeZone), bad.body);
const names = await api(TOWNER, "PUT", PROFILE, { version: v, legalName: "Renamed Ltd", operatingName: "Renamed", countryCode: "US" });
ok("R1.92 P3: legal name, trading name and country are \"not changed here\" (422, each named, support named)", names.status === 422 && /support/i.test(names.body?.fields?.legalName ?? "") && /support/i.test(names.body?.fields?.operatingName ?? "") && !!names.body?.fields?.countryCode, names.body);
const extra = await api(TOWNER, "PUT", PROFILE, { version: v, firmId: B, website: "https://x.example.ca" });
ok("R1.92 P3: an unknown field (firmId) is refused (422)", extra.status === 422, extra.body);
const noVersion = await api(TOWNER, "PUT", PROFILE, { website: "https://x.example.ca" });
ok("R1.92 P3: a save without the version it started from is refused (422 on version)", noVersion.status === 422 && !!noVersion.body?.fields?.version, noVersion.body);
ok("R1.92 P3: nothing refused was written (no audit line, the website unchanged)", sql(`select count(*) from audit_event where at > '${t0}' and firm_id = '${A}'`) === "0" && (await api(TOWNER, "GET", PROFILE)).body.details.website === want.website);
const stale = await api(TOWNER, "PUT", PROFILE, { version: p0.body.version, website: `https://stale-${run}.example.ca` });
ok("R1.92 P3: a stale version is 409 with the latest profile; nothing written", stale.status === 409 && stale.body?.latest?.details?.website === want.website && (await api(TOWNER, "GET", PROFILE)).body.details.website === want.website, [stale.status, stale.body?.latest?.details]);

// ------------------------------------------------------------------------------------------------ P4 Owner only: the billing email; an Admin
t0 = now();
const billing = `billing-${run}@sample-firm.example.ca`;
const v2 = (await api(TOWNER, "GET", PROFILE)).body.version;
const be = await api(TOWNER, "PUT", PROFILE, { version: v2, billingEmail: billing });
ok("R1.92 P4 pass: the Owner changes the billing email; read back; one platform.firm.billing_email_changed line with before and after",
  be.status === 200 && be.body.profile?.ownerOnly?.billingEmail === billing && sql(`select billing_email from platform_firm where id = '${A}'`) === billing
  && lines("platform.firm.billing_email_changed", A, t0) === 1 && sql(`select count(*) from audit_event where action = 'platform.firm.billing_email_changed' and at > '${t0}' and detail::text like '%${billing}%'`) === "1", [be.status, be.body]);
const tRoles = await api(TOWNER, "PATCH", `/platform/staff/${ADM}/roles`, { roles: ["CASE_MANAGER", "ADMIN"], reason: "R1.92 check: an Admin for the firm profile" });
const TADM = await signIn("sample-firm", { actorId: "user-T" });
const pAdm = await api(TADM, "GET", PROFILE);
ok("R1.92 P4 setup: the Owner gives user-T the Admin role (roles route); the Admin may change details but not the Owner-only ones", tRoles.status === 200 && pAdm.body?.canChange?.details === true && pAdm.body?.canChange?.ownerOnly === false, [tRoles.status, tRoles.text.slice(0, 200), pAdm.body?.canChange]);
t0 = now();
const admBilling = await api(TADM, "PUT", PROFILE, { version: pAdm.body.version, billingEmail: `admin-${run}@sample-firm.example.ca`, website: `https://admin-${run}.example.ca` });
ok("R1.92 P4 fail: the Admin's billing email is 403 (Owner only), and nothing of that save is written", admBilling.status === 403 && /Owner/.test(admBilling.text) && sql(`select billing_email from platform_firm where id = '${A}'`) === billing && sql(`select count(*) from audit_event where at > '${t0}' and firm_id = '${A}'`) === "0", [admBilling.status, admBilling.text.slice(0, 200)]);
const admSite = await api(TADM, "PUT", PROFILE, { version: pAdm.body.version, website: `https://admin-${run}.example.ca` });
ok("R1.92 P4 pass: the Admin changes the website (agent/settings:edit), audited as the Admin", admSite.status === 200 && admSite.body.profile?.details?.website === `https://admin-${run}.example.ca`
  && sql(`select count(*) from audit_event where at > '${t0}' and entity_key = '${A}:platform.website' and actor = 'staff:${ADM}'`) === "1", [admSite.status, admSite.text.slice(0, 200)]);

// ------------------------------------------------------------------------------------------------ BR the breaker's round 1 (180c6706b)
{
  const ver = async () => (await api(TOWNER, "GET", PROFILE)).body.version as string;
  for (const site of ["https://medium.com/@sample.firm", "https://www.example.ca/contact?to=info@example.ca"]) {
    const r = await api(TOWNER, "PUT", PROFILE, { version: await ver(), website: site });
    ok(`R1.92 BR M1: a website with an email-shaped part saves (no 500) and reads back: ${site}`, r.status === 200 && (await api(TOWNER, "GET", PROFILE)).body.details.website === site, [r.status, r.text.slice(0, 200)]);
  }
  const upper = `BILLING-${run.toUpperCase()}@SAMPLE-FIRM.EXAMPLE.CA`;
  const m2 = await api(TOWNER, "PUT", PROFILE, { version: await ver(), billingEmail: upper });
  ok("R1.92 BR M2: a billing email in capitals saves in lower case (no 500)", m2.status === 200 && sql(`select billing_email from platform_firm where id = '${A}'`) === upper.toLowerCase(), [m2.status, m2.text.slice(0, 200)]);
  const tBad = now();
  for (const site of ["https://exa\nmple.ca", "https://exa\tmple.ca", "https://exa‮mple.ca", "https://exa­mple.ca", "https://exa​mple.ca", "http://127.0.0.1", "http://192.168.1.10", "https://printer.local", "https://sample firm.ca"]) {
    const r = await api(TOWNER, "PUT", PROFILE, { version: await ver(), website: site });
    ok(`R1.92 BR M3/m4: a website with a control, invisible or direction character, a space or a private host is refused on its field: ${JSON.stringify(site)}`, r.status === 422 && typeof r.body?.fields?.website === "string", [r.status, r.body?.fields]);
  }
  ok("R1.92 BR M3: none of those was written", sql(`select count(*) from audit_event where at > '${tBad}' and firm_id = '${A}'`) === "0");
  const proto = await api(TOWNER, "PUT", PROFILE, { version: await ver(), constructor: 1 });
  ok("R1.92 BR m2: an inherited key name (constructor) is an unknown field, never code text in the answer", proto.status === 422 && !/native code/.test(proto.text), proto.text.slice(0, 300));
  const nul = await api(TOWNER, "PUT", PROFILE, { version: await ver(), billingEmail: null, language: "de", website: 5 });
  ok("R1.92 BR m3: refusals in plain words, never the library's \"Invalid input\"", nul.status === 422 && Object.values(nul.body?.fields ?? {}).length === 3 && !Object.values(nul.body?.fields ?? {}).some((m) => /^Invalid/.test(String(m))), nul.body?.fields);
  const phone = await api(TOWNER, "PUT", PROFILE, { version: await ver(), publicPhone: "((((((((1234567" });
  ok("R1.92 BR m5: a phone of brackets only is refused", phone.status === 422 && !!phone.body?.fields?.publicPhone, phone.body?.fields);
  const pA = await api(TADM, "GET", PROFILE);
  const m6 = await api(TADM, "PUT", PROFILE, { version: pA.body.version, billingEmail: pA.body.ownerOnly.billingEmail, website: `https://admin2-${run}.example.ca` });
  ok("R1.92 BR m6: an Admin's save carrying the unchanged billing email goes through (only a change is Owner only)", m6.status === 200 && m6.body.changed?.join() === "website", [m6.status, m6.text.slice(0, 200)]);
  // The reviewer's round 1 (review m1, m3, m4, m6).
  const dash = await api(TOWNER, "PUT", PROFILE, { version: await ver(), publicPhone: "--------1234567" });
  ok("R1.92 BR review m3: a phone of dashes only is refused", dash.status === 422 && !!dash.body?.fields?.publicPhone, dash.body?.fields);
  const all = await api(TOWNER, "PUT", PROFILE, { version: await ver(), legalName: "X Ltd", key: "x", businessAddress: {}, timeZone: "Mars/Olympus", website: "ftp://x.example.ca", firmId: B });
  ok("R1.92 BR review m4/m6: every bad field is named at once: legal name, key and business address (not changed here), the zone, the website, the unknown field",
    all.status === 422 && ["legalName", "key", "businessAddress", "timeZone", "website", "firmId"].every((f) => typeof all.body?.fields?.[f] === "string") && /Billing/.test(all.body.fields.businessAddress), all.body?.fields);
  const fr = await api(TOWNER, "PUT", PROFILE, { version: await ver(), language: "fr" });
  const en = await api(TOWNER, "PUT", PROFILE, { version: await ver(), language: "en" });
  ok("R1.92 BR review m6: language is saved and read back (fr, then en)", fr.status === 200 && fr.body.profile?.details?.language === "fr" && en.status === 200 && en.body.profile?.details?.language === "en", [fr.status, en.status]);
  const tB2 = now(), oldBilling = sql(`select billing_email from platform_firm where id = '${A}'`), newBilling = `billing2-${run}@sample-firm.example.ca`;
  const b2 = await api(TOWNER, "PUT", PROFILE, { version: await ver(), billingEmail: newBilling });
  ok("R1.92 BR review m6: the billing email's audit line holds the before value as well as the after",
    b2.status === 200 && sql(`select count(*) from audit_event where at > '${tB2}' and action = 'platform.firm.billing_email_changed' and detail::text like '%${oldBilling}%' and detail::text like '%${newBilling}%'`) === "1", [b2.status, oldBilling]);
  const tPar = now(), vPar = await ver();
  const par = await Promise.all([1, 2, 3, 4, 5].map((i) => api(TOWNER, "PUT", PROFILE, { version: vPar, website: `https://par${i}-${run}.example.ca` })));
  ok("R1.92 BR review m1: five saves at once from one version: exactly one 200, four 409, one audit line (the row lock and the transaction)",
    par.filter((r) => r.status === 200).length === 1 && par.filter((r) => r.status === 409).length === 4 && sql(`select count(*) from audit_event where at > '${tPar}' and entity_key = '${A}:platform.website'`) === "1", par.map((r) => r.status));
  const co = await api(TOFF, "GET", PROFILE);
  ok("R1.92 BR m1: the Case Officer does not read the billing email or the business address; the Admin does", co.status === 200 && co.body.ownerOnly?.billingEmail === null && co.body.ownerOnly?.businessAddress === null && pA.body.ownerOnly?.billingEmail === upper.toLowerCase() && co.body.canChange?.ownerOnly === false, [co.body?.ownerOnly, pA.body?.ownerOnly?.billingEmail]);
}

// ------------------------------------------------------------------------------------------------ O1 offices with their time zones
t0 = now();
const office = await api(TOWNER, "POST", "/platform/offices", { name: `Calgary ${run}`, province: "AB" });
const list = await api(TOWNER, "GET", "/platform/offices");
const row = (list.body?.offices ?? []).find((o: { name: string }) => o.name === `Calgary ${run}`);
ok("R1.92 O1 pass: an office in Alberta is saved with America/Edmonton; read back in the list with a first office; audited (platform.office.add)",
  office.status === 201 || office.status === 200 ? row?.timeZone === "America/Edmonton" && list.body.multipleOffices === true && (list.body.offices as { isFirst: boolean }[]).some((o) => o.isFirst) && lines("platform.office.add", row.id, t0) === 1 : false, [office.status, office.text.slice(0, 200), row]);
ok("R1.92 O1: the profile counts the offices", (await api(TOWNER, "GET", PROFILE)).body.offices >= 2);
const badZone = await api(TOWNER, "POST", "/platform/offices", { name: `Nowhere ${run}`, province: "AB", timeZone: "Mars/Olympus" });
ok("R1.92 O1 fail: an office with a zone not on the list is refused (422) and not saved", badZone.status === 422 && sql(`select count(*) from platform_office where firm_id = '${A}' and name = 'Nowhere ${run}'`) === "0", [badZone.status, badZone.text.slice(0, 200)]);

// ------------------------------------------------------------------------------------------------ L1 licence details
t0 = now();
const licNo = `R7${digits.slice(0, 5)}`;
const lic = await api(TOWNER, "PUT", `/platform/staff/${OFF}/credential`, { representativeType: "RCIC", licensingBody: "College of Immigration and Citizenship Consultants (Sample)", licenceNumber: licNo });
const lics = await api(TOWNER, "GET", "/platform/licences");
const mine = (lics.body?.licences ?? []).find((l: { staffId: string }) => l.staffId === OFF);
ok("R1.92 L1 pass: the Owner saves the Case Officer's licence record; GET licences reads it back; one platform.staff.credential_saved line",
  lic.status === 200 && mine?.licenceNumber === licNo && mine?.representativeType === "RCIC" && lines("platform.staff.credential_saved", OFF, t0) === 1, [lic.status, lic.text.slice(0, 200), mine]);
ok("R1.92 L1: the licence number is never in an audit line", sql(`select count(*) from audit_event where at > '${t0}' and (detail::text || summary) like '%${licNo}%'`) === "0");
const licOff = await api(TOFF, "PUT", `/platform/staff/${ADM}/credential`, { representativeType: "RCIC", licensingBody: "x", licenceNumber: "R000000" });
ok("R1.92 L1 fail: the Case Officer cannot change another person's licence record (403)", licOff.status === 403, [licOff.status]);

// ------------------------------------------------------------------------------------------------ F1 another firm refused
const before = sql(`select string_agg(key || '=' || value::text, ',' order by key) from platform_firm_setting where firm_id = '${A}'`);
const pb = await api(TB, "GET", PROFILE);
ok("R1.92 F1: firm B's Owner reads only firm B's profile, never firm A's values", pb.status === 200 && pb.body.firm?.key === "sample-solo" && pb.body.details?.website !== want.website && pb.body.details?.website !== `https://admin-${run}.example.ca` && pb.body.ownerOnly?.billingEmail !== billing, pb.body);
const sb = await api(TB, "PUT", PROFILE, { version: pb.body.version, website: `https://solo-${run}.example.ca` });
ok("R1.92 F1: firm B's save changes firm B only; firm A's settings are untouched", sb.status === 200 && sql(`select string_agg(key || '=' || value::text, ',' order by key) from platform_firm_setting where firm_id = '${A}'`) === before
  && sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${B}' and key = 'platform.website'`) === `https://solo-${run}.example.ca`, [sb.status, sb.text.slice(0, 200)]);
const crossOffice = await api(TB, "PATCH", `/platform/offices/${row?.id}`, { version: row?.version, timeZone: "America/Toronto" });
ok("R1.92 F1: firm A's office is 404 to firm B and unchanged", crossOffice.status === 404 && sql(`select time_zone from platform_office where id = '${row?.id}'`) === "America/Edmonton", [crossOffice.status]);
const crossLic = await api(TB, "PUT", `/platform/staff/${OFF}/credential`, { representativeType: "RCIC", licensingBody: "x", licenceNumber: "R999999" });
ok("R1.92 F1: firm A's person's licence record is 404 to firm B and unchanged", crossLic.status === 404 && sql(`select licence_number from platform_staff_credential where staff_id = '${OFF}'`) === licNo, [crossLic.status]);
const crossRead = await api(TB, "GET", "/platform/licences");
ok("R1.92 F1: firm B's licence list holds no firm A person", crossRead.status === 200 && !(crossRead.body?.licences ?? []).some((l: { staffId: string }) => l.staffId === OFF), [crossRead.status]);

process.exit(summary() ? 1 : 0);
