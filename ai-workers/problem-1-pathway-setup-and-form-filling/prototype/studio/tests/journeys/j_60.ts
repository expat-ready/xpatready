// J-60 (map row 60, R1.60: a deposit request prepared on signing; product/screens/R1.60/rules.md on #3371; Lead 4
// approved the shape on #3371, 25 Nov): the join-and-walk for the row, written with part a2. A firm's Owner works on an
// isolated copy (its own database and port, never :4400), through the API: the Money › Trust screens are FO-7s3a/b,
// not built, so every step is an API step, each figure read back from money_trust_request.
// Done when (Lead 19's ruling, recorded on #3681 Q4): a signed retainer whose first fee row is On signing above zero,
// at a firm whose trust answer is Yes, prepares one trust deposit request (Prepared, no DR- number, estimated tax apart,
// never an invoice); the same signature event again prepares none; trust No or Unanswered, or no deposit row, nothing.
//   W0 the Owner answers the trust question Yes; the trust payment details are still empty.
//   W1 a retainer whose first row is "Deposit on signing" CAD 1,000.00, signed on paper (FO-5's Signed offline; the
//      e-signature path is part a1's pack, check_r160_deposit_prepare.ts) → one Prepared request, 1,000.00 + 130.00
//      estimated tax (Ontario 13 %, Sample), no number, no invoice.
//   W2 the same signature again (Signed offline a second time) → refused, and still one request.
//   W3 Send with the details empty → refused in words; details filled; Send → DR-0001; its email holds the number,
//      1,130.00 including the estimated tax and the trust details, and offers no card.
//   W4 a second retainer signed on paper → Prepared; Edit amount; Don't send with a reason → Cancelled, no number.
//   W5 a retainer whose first row is "On filing" → nothing prepared.
//   W6 a Case Manager without agent/payment:record → 403; firm B → 404.
//   W7 (part b) a retainer signed while trust was Unanswered, then Yes → one request: not in this part.
//   W8 ends at R1.61's first step: the sent DR-0001 request is what R1.61 pays (its pay link waits for gap G4 and the
//      founder's line on R1.61, #3371): read here as Sent, unpaid.
// Each step with its stand-in that must fail. US$0, no model call; live AI off. Legal readings Unconfirmed: no counsel.
// Run from prototype/:
//   zsh studio/tools/isolated.sh j60 4460 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j60 4460 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_60.ts j60 4460
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../../api/src/front-office/retainers/docx.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j60", Number(process.argv[3] ?? 4460)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const form = body instanceof FormData;
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(t ? { authorization: `Bearer ${t}` } : {}), ...(body !== undefined && !form ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Sample signed retainer (J-60), not a real signature\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");

try {
  // ------------------------------------------------------------------------------------------------ setup (Sample)
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:J-60', now()) on conflict (firm_id) do nothing`);
  sql(`update money_payment_settings set tax_registered = true, tax_number = coalesce(tax_number, '123456789RT0001'), trust_details = null where firm_id = '${A}'`);
  sql(`update platform_firm set business_address = coalesce(business_address, '{}'::jsonb) || '{"province_state": "ON"}'::jsonb where id = '${A}'`);
  const staff = (actor: string) => sql(`select email from platform_staff where actor_id = '${actor}'`);
  const signIn = async (firmKey: string, email: string): Promise<string> => {
    const r = await api(null, "POST", "/platform/session/local", { firmKey, email, secondStep: true });
    if (r.body?.token) return r.body.token as string;
    console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${r.body?.detail}`); process.exit(2);
  };
  const TA = await signIn("sample-firm", staff("user-R")), TT = await signIn("sample-firm", staff("user-T")), TB = await signIn("sample-solo", staff("user-S"));
  const ownerId = sql(`select id from platform_staff where actor_id = 'user-R'`);
  sql(`update fo_retainer_template set active = false where firm_id = '${A}'`);   // re-runnable: one active template
  const tplForm = new FormData(); tplForm.append("name", `J-60 retainer ${run}`);
  tplForm.append("file", new Blob([new Uint8Array(buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]))]), "j60.docx");
  const tpl = await api(TA, "POST", "/front-office/retainer-templates", tplForm);
  ok("J-60 setup: both Sample firms, firm A registered for tax in Ontario, payment settings and one retainer template", !!A && !!B && fo.failed.length === 0 && tpl.status === 201, [fo.failed, tpl.status, tpl.body]);
  /** A person engaged into a prospect the Owner owns, checked for conflicts, with a retainer of these fee rows drafted. */
  const retainer = async (given: string, fees: { label: string; amountMinor: number; when: string }[]) => {
    const person = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', 'j60.${given.toLowerCase()}.${run}@example.org', 'seed:J-60', now()) returning id`);
    const lead = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${person}', 'MANUAL', 'WEBSITE', '${ownerId}', 'seed:J-60', now()) returning id`);
    const prospectId = (await api(TA, "POST", `/front-office/leads/${lead}/engage`)).body?.id as string;
    await api(TA, "POST", "/front-office/conflict-checks", { prospectId, requestId: randomUUID(), result: "NO_CONFLICT" });
    const d = await api(TA, "POST", `/front-office/prospects/${prospectId}/retainers`, { templateId: tpl.body?.id, fees });
    return { person, prospectId, id: d.body?.id as string, drafted: d.status };
  };
  const offline = (id: string) => { const f = new FormData(); f.append("expectedVersion", "1"); f.append("reason", "Signed at the office (Sample)");
    f.append("file", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), "signed.pdf"); return api(TA, "POST", `/front-office/retainers/${id}/signed-offline`, f); };
  const requestsOf = (rid: string) => sql(`select coalesce(string_agg(q.id::text, ','), '') from money_trust_request q join fo_retainer_version v on v.id = q.retainer_version_id where v.retainer_id = '${rid}'`);
  const DEPOSIT = [{ label: "Deposit on signing", amountMinor: 100000, when: "ON_SIGNING" }, { label: "On filing", amountMinor: 50000, when: "WHEN_SUBMITTED" }];
  const invoices0 = sql(`select count(*) from money_invoice where firm_id = '${A}'`);

  // ------------------------------------------------------------------------------------------------ W0: trust on
  const w0 = await api(TA, "PUT", "/front-office/money/trust/answer", { answer: "YES" });
  ok("J-60 W0 pass (API step): the Owner answers Yes to holding client money in trust", w0.status === 200 && w0.body?.answer === "YES", w0.body);
  const r0 = await retainer("Una", DEPOSIT);
  sql(`update money_payment_settings set trust_answer = 'NO', trust_answered_by = 'seed:J-60' where firm_id = '${A}'`);
  await offline(r0.id);
  ok("J-60 W0 fail (stand-in): with trust answered No, the same signing prepares nothing", requestsOf(r0.id) === "");
  sql(`update money_payment_settings set trust_answer = 'YES', trust_answered_by = 'seed:J-60' where firm_id = '${A}'`);

  // ------------------------------------------------------------------------------------------------ W1: signed → Prepared
  const r1 = await retainer("Ana", DEPOSIT);
  const s1 = await offline(r1.id);
  const q1 = requestsOf(r1.id);
  ok("J-60 W1 pass (API step): signed on paper → one Prepared request, CAD 1,000.00 + 130.00 estimated tax, no number, on the client",
    s1.status === 200 && q1 !== "" && !q1.includes(",") && sql(`select amount_minor || ':' || estimated_tax_minor || ':' || coalesce(number, 'none') || ':' || person_id from money_trust_request where id = '${q1}'`) === `100000:13000:none:${r1.person}`, [s1.status, s1.body, q1]);
  const read1 = await api(TA, "GET", `/front-office/money/trust/requests/${q1}`);
  ok("J-60 W1 pass: the request reads Prepared with its total, and it is on the PREPARED list", read1.body?.status === "Prepared" && read1.body?.totalMinor === 113000
    && (await api(TA, "GET", "/front-office/money/trust/requests?state=PREPARED")).body?.items?.some((i: { id: string }) => i.id === q1), read1.body);
  ok("J-60 W1 fail (planted): no invoice was written for the deposit (a deposit is money held, never an earned fee)", sql(`select count(*) from money_invoice where firm_id = '${A}'`) === invoices0);

  // ------------------------------------------------------------------------------------------------ W2: the same signature again
  const s2 = await offline(r1.id);
  ok("J-60 W2 pass: the same signing again is refused, and there is still exactly one request", s2.status === 409 && requestsOf(r1.id) === q1, [s2.status, s2.body]);

  // ------------------------------------------------------------------------------------------------ W3: Send
  const noDetails = await api(TA, "POST", `/front-office/money/trust/requests/${q1}/send`);
  ok("J-60 W3 fail: Send with the trust details empty → 409 \"Add your trust payment details …\", still Prepared, no number",
    noDetails.status === 409 && /Add your trust payment details/.test(noDetails.body?.detail ?? "") && sql(`select coalesce(number, 'none') from money_trust_request where id = '${q1}'`) === "none", noDetails.body);
  sql(`update money_payment_settings set trust_details = 'Trust account (Sample): Bank 001, transit 00011, account 1234567' where firm_id = '${A}'`);
  const sent = await api(TA, "POST", `/front-office/money/trust/requests/${q1}/send`);
  ok("J-60 W3 pass (API step): Send → Sent as DR-0001 for CAD 1,130.00, emailed", sent.status === 200 && sent.body?.number === "DR-0001" && sent.body?.totalMinor === 113000 && sent.body?.email === "SENT", sent.body);
  // The local email adapter's inbox (GET /api/demo/platform-inbox, a lane copy only), as J-100 reads it.
  // The mail leaves through the outbox's own send, a moment after the commit: read for up to 15 s, as J-100 does.
  let inbox: { subject: string; body: string }[] = [];
  for (let i = 0; i < 75 && !inbox.some((m) => /DR-0001/.test(m.subject)); i++) {
    await new Promise((r) => setTimeout(r, 200));
    inbox = (await api(null, "GET", `/demo/platform-inbox?address=${encodeURIComponent(`j60.ana.${run}@example.org`)}`)).body?.messages ?? [];
  }
  const mailText = inbox.map((m) => `${m.subject} ${m.body}`).join(" ");
  ok("J-60 W3 pass: the email holds DR-0001, CAD 1,130.00 including CAD 130.00 estimated tax, and the trust details; it offers no card",
    /DR-0001/.test(mailText) && /1,130\.00 \(including CAD 130\.00 estimated tax\)/.test(mailText) && /transit 00011/.test(mailText) && !/card/i.test(mailText), mailText.slice(0, 600));

  // ------------------------------------------------------------------------------------------------ W4: Edit amount, Don't send
  const r4 = await retainer("Ben", DEPOSIT);
  await offline(r4.id);
  const q4 = requestsOf(r4.id);
  const ed = await api(TA, "PUT", `/front-office/money/trust/requests/${q4}/amount`, { amountMinor: 120000, estimatedTaxMinor: 15600 });
  ok("J-60 W4 pass (API step): Edit amount while Prepared → 1,200.00 + 156.00 stored", ed.status === 200 && sql(`select amount_minor || ':' || estimated_tax_minor from money_trust_request where id = '${q4}'`) === "120000:15600", ed.body);
  ok("J-60 W4 fail: Edit amount on the sent DR-0001 → 409", (await api(TA, "PUT", `/front-office/money/trust/requests/${q1}/amount`, { amountMinor: 1, estimatedTaxMinor: 0 })).status === 409);
  const dont = await api(TA, "POST", `/front-office/money/trust/requests/${q4}/cancel`, { reason: "Client changed their mind (Sample)" });
  ok("J-60 W4 pass: Don't send with a reason → Cancelled, with no number", dont.status === 200 && dont.body?.status === "Cancelled" && dont.body?.number === null, dont.body);

  // ------------------------------------------------------------------------------------------------ W5: no deposit row
  const r5 = await retainer("Cy", [{ label: "On filing", amountMinor: 50000, when: "WHEN_SUBMITTED" }]);
  await offline(r5.id);
  ok("J-60 W5 pass: a retainer whose first row is On filing prepares nothing (the row is billed later)", requestsOf(r5.id) === "");

  // ------------------------------------------------------------------------------------------------ W6: who may act
  const t6 = await api(TT, "POST", `/front-office/money/trust/requests/${q1}/send`), b6 = await api(TB, "GET", `/front-office/money/trust/requests/${q1}`);
  ok("J-60 W6 fail: a Case Manager without agent/payment:record → 403; firm B reading firm A's request → 404", t6.status === 403 && b6.status === 404, [t6.status, b6.status]);
  ok("J-60 W6 pass (stand-in): the Owner's own read is 200", (await api(TA, "GET", `/front-office/money/trust/requests/${q1}`)).status === 200);

  // ------------------------------------------------------------------------------------------------ W8: R1.61's first step
  ok("J-60 W8 pass (ends at R1.61's first step): DR-0001 is Sent and unpaid, waiting for the client's payment (R1.61's pay link: gap G4)",
    (await api(TA, "GET", `/front-office/money/trust/requests/${q1}`)).body?.status === "Sent");
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
