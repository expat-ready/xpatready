// PF-19r part 2 (gap G4, QA-495; Release 1 rows R1.47 one email layout, R1.49 the gate on every path): the case side's
// link and code emails through MessagePort. Named tests DW7-DW12 from the brief, each with a pass and a fail, plus P-710's
// production-mode check (a production configuration never seeds the Sample firms). All through the product's API on an
// isolated copy (the Sample platform firms are seeded there, P-710), the outbox and the copy's log read with SQL and from
// disk. Needs Visitor visa released on the copy (tests/runtime/setup_visitor_visa.ts). No model call, US$0.
// The check releases the Visitor visa itself (setup_visitor_visa.ts) when its copy has none.
//   zsh studio/tools/isolated.sh runtime_pf19r 4430 start && tsx studio/tests/check_pf19r_case_links.ts 4430 xr_studio_runtime_pf19r
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] ?? "4430", DBNAME = process.argv[3] ?? "xr_studio_runtime_pf19r", BASE = `http://127.0.0.1:${PORT}`;
const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string, db = DBNAME) => execFileSync(join(BIN, "psql"), [urlOf(db), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
type Res = { status: number; body: any };
const seen: string[] = [];   // every answer body, scanned for tokens and codes (DW11)
const call = async (method: string, path: string, body?: unknown, actor: string | null = "user-O"): Promise<Res> => {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (actor) h["x-actor"] = actor;
  const r = await fetch(`${BASE}/api${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); seen.push(text); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};
const yearsAgo = (y: number) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - y); return d.toISOString().slice(0, 10); };
const inbox = async (address: string) => ((await call("GET", `/demo/inbox?address=${encodeURIComponent(address)}`, undefined, null)).body?.messages ?? []) as { kind: string; link?: string; body?: string; subject?: string }[];
const platformInbox = async (address: string) => ((await call("GET", `/demo/platform-inbox?address=${encodeURIComponent(address)}`, undefined, null)).body?.messages ?? []) as { subject: string; body: string; html: string; from: string }[];
const tokenIn = (m: { kind: string; link?: string }[]) => /#t=([A-Za-z0-9_-]{43})/.exec(m.find((x) => x.kind === "link")?.link ?? "")?.[1] ?? "";
const codeIn = (m: { kind: string; body?: string }[]) => (/code is (\d{3}) (\d{3})/.exec(m.find((x) => x.kind === "code")?.body ?? "") ?? []).slice(1).join("");
type Row = { id: string; firm_id: string; class: string; subject_kind: string; subject_id: string; state: string; key: string };
const outboxTo = (address: string): Row[] => JSON.parse(sql(`select coalesce(json_agg(json_build_object('id', id, 'firm_id', firm_id, 'class', class, 'subject_kind', subject_kind, 'subject_id', subject_id, 'state', state, 'key', idempotency_key) order by created_at), '[]') from msg_outbox where address = '${address.toLowerCase()}'`));
const until = async (f: () => Promise<boolean> | boolean, ms = 30_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await new Promise((r) => setTimeout(r, 500)); } return false; };

(async () => {
  const openable = async () => ((await call("GET", "/runtime/openable")).body ?? []).find((r: { combination: string; startable: boolean }) => /Visitor visa/.test(r.combination) && r.startable);
  let vv = await openable();
  if (!vv) {   // review M3: the merge queue starts the copy and runs this file alone
    execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, "tests", "runtime", "setup_visitor_visa.ts"), PORT, DBNAME], { stdio: ["ignore", "ignore", "inherit"], timeout: 600_000 });
    vv = await openable();
  }
  if (!vv) { console.error("STOP  Visitor visa could not be released on this copy"); process.exit(2); }
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`);
  ok("setup (P-710): this test copy has the Sample platform firms (seeded on demo and test copies)", /^[0-9a-f-]{36}$/.test(firmA), firmA);
  const run = Date.now().toString(36);
  const newCase = async (tag: string) => {
    const c = await call("POST", "/runtime/cases", { combinationId: vv.combination_id, reference: `PF19R-${tag}-${run}`, clientActor: "user-P", principal: { displayName: "Sample Client A" } });
    const id = c.body?.id as string, P = c.body?.people?.find((x: { role: string }) => x.role === "principal")?.subject_id as string;
    const S = (await call("POST", `/runtime/cases/${id}/people`, { role: "spouse_or_partner", displayName: "Sample Partner" })).body?.subject_id as string;
    for (const [s, d] of [[P, yearsAgo(40)], [S, yearsAgo(38)]]) await call("PUT", `/runtime/cases/${id}/answers/${s}/person.date_of_birth`, { value: d, expectedId: null });
    return { id, S };
  };

  // ------------------------------------------------------------------ DW7 "Send to …" through MessagePort
  const k1 = await newCase("dw7"), A = `partner.${run}@example.com`;
  const sent = await call("POST", `/runtime/cases/${k1.id}/people/${k1.S}/link`, { address: A }, "user-P");
  const caseFirm = sql(`select firm_id from runtime_case where id = '${k1.id}'`);
  const r7 = outboxTo(A);
  await until(async () => (await platformInbox(A)).length > 0);
  const p7 = (await platformInbox(A))[0], d7 = await inbox(A);
  ok("DW7 pass: \"Send to …\" writes one outbox row (TRANSACTIONAL, CASE_PARTY for the person, the case's platform firm) and the worker sends it with the one layout; the demo inbox shows the link",
    sent.status < 300 && r7.length === 1 && r7[0].class === "TRANSACTIONAL" && r7[0].subject_kind === "CASE_PARTY" && r7[0].subject_id === k1.S && r7[0].firm_id === caseFirm && caseFirm === firmA
    && !!p7 && /Sent by Sample/.test(p7.html) && p7.from.startsWith("Sample") && !!tokenIn(d7) && r7[0].key === `case.link:${sql(`select id from person_link where subject_id = '${k1.S}' and voided_at is null`)}`, { status: sent.status, r7, p7: p7?.from });
  const G = `gone.${run}@example.com`;
  sql(`insert into msg_suppression (id, firm_id, channel, address, reason, created_by) values (gen_random_uuid(), '${firmA}', 'EMAIL', '${G}', 'HARD_BOUNCE', 'seed:pf19r')`);
  const k2 = await newCase("dw7f");
  const refused = await call("POST", `/runtime/cases/${k2.id}/people/${k2.S}/link`, { address: G }, "user-P");
  ok("DW7 fail: a send the gate refuses rolls back: 409 in words, no outbox row, no demo copy, no link made",
    refused.status === 409 && refused.body?.code === "ADDRESS_NOT_SENT" && /^Not sent: this address does not take email from the firm/.test(refused.body?.detail ?? "")
    && outboxTo(G).length === 0 && (await inbox(G)).length === 0 && sql(`select count(*) from person_link where subject_id = '${k2.S}'`) === "0", refused.body);

  // ------------------------------------------------------------------ DW8 "Send me a code" through MessagePort
  const tA = tokenIn(d7);
  const codeSend = await call("POST", "/link/code/send", { token: tA }, null);
  const codeRow = outboxTo(A).filter((r) => r.key.includes(":code:"));
  const code = codeIn(await inbox(A));
  ok("DW8 pass: \"Send me a code\" goes through MessagePort (a second outbox row for the person, keyed by the link and the code's time, never the code)",
    codeSend.status < 300 && codeRow.length === 1 && codeRow[0].subject_id === k1.S && /^\d{6}$/.test(code) && !codeRow[0].key.includes(code) && !codeRow[0].key.includes(tA), { codeSend: codeSend.body, codeRow });
  sql(`insert into msg_suppression (id, firm_id, channel, address, reason, created_by) values (gen_random_uuid(), '${firmA}', 'EMAIL', '${A}', 'COMPLAINT', 'seed:pf19r')`);
  const codes0 = (await inbox(A)).filter((m) => m.kind === "code").length, hash0 = sql(`select code_hash from person_link where subject_id = '${k1.S}' and voided_at is null`);
  const codeRefused = await call("POST", "/link/code/send", { token: tA }, null);
  ok("DW8 fail: a code to a suppressed address is not sent and the page is told so (409 \"Not sent: …\"); the code in force is unchanged",
    codeRefused.status === 409 && /^Not sent: this address does not take email from the firm/.test(codeRefused.body?.detail ?? "") && (await inbox(A)).filter((m) => m.kind === "code").length === codes0
    && sql(`select code_hash from person_link where subject_id = '${k1.S}' and voided_at is null`) === hash0, codeRefused.body);
  sql(`delete from msg_suppression where address = '${A}'`);

  // Review M2: three presses at once: each that answers "sent" wrote its own outbox row, and the code in the demo inbox is the one in force.
  const k5 = await newCase("dw8p"), F = `partner.f.${run}@example.com`;
  await call("POST", `/runtime/cases/${k5.id}/people/${k5.S}/link`, { address: F }, "user-P");
  const tF = tokenIn(await inbox(F));
  const presses = await Promise.all([1, 2, 3].map(() => call("POST", "/link/code/send", { token: tF }, null)));
  const sentOk = presses.filter((p) => p.status < 300).length, codeRows = outboxTo(F).filter((r) => r.key.includes(":code:"));
  const shown = codeIn(await inbox(F)), entered = await call("POST", "/link/code", { token: tF, code: shown }, null);
  ok("DW8 pass (review M2): presses at the same moment never share a key: one outbox row per press that answered sent, and the code the person holds is the one in force",
    sentOk >= 1 && codeRows.length === sentOk && new Set(codeRows.map((r) => r.key)).size === codeRows.length && entered.status < 300, { sentOk, codeRows: codeRows.length, entered: entered.status });

  // ------------------------------------------------------------------ DW9 the same send twice
  const k3 = await newCase("dw9"), C = `partner.c.${run}@example.com`, key = `pf19r-${run}`;
  const once = await call("POST", `/runtime/cases/${k3.id}/people/${k3.S}/link`, { address: C, idempotencyKey: key }, "user-P");
  const twice = await call("POST", `/runtime/cases/${k3.id}/people/${k3.S}/link`, { address: C, idempotencyKey: key }, "user-P");
  ok("DW9 pass: the same idempotency key twice → one link, one outbox row, one demo copy (the second answers created: false)",
    once.status < 300 && twice.status < 300 && twice.body?.created === false && outboxTo(C).length === 1 && (await inbox(C)).filter((m) => m.kind === "link").length === 1, { once: once.status, twice: twice.body?.created, rows: outboxTo(C).length });
  // QA-359's path: the officer sends to a new address, then Client A's Resend sends the same link again, then again at once.
  const tC = tokenIn(await inbox(C)); await call("POST", "/link/code/send", { token: tC }, null);
  await call("POST", "/link/code", { token: tC, code: codeIn(await inbox(C)) }, null);
  const D = `partner.d.${run}@example.com`;
  await call("POST", `/runtime/cases/${k3.id}/people/${k3.S}/link`, { address: D });
  const again1 = await call("POST", `/runtime/cases/${k3.id}/people/${k3.S}/link`, {}, "user-P");
  const again2 = await call("POST", `/runtime/cases/${k3.id}/people/${k3.S}/link`, {}, "user-P");
  const dRows = outboxTo(D), dLinks = (await inbox(D)).filter((m) => m.kind === "link").length;
  ok("DW9 fail (break m3 kept): Client A's Resend of the firm's link sends it once more, and pressed again within a minute sends nothing more (outbox and demo inbox agree)",
    again1.status < 300 && again2.status < 300 && dRows.length === 2 && dLinks === 2 && dRows[1].key.includes(":again:"), { a1: again1.status, a2: again2.status, dRows, dLinks });
  // Review M1: every later Resend (each more than a minute after the last) is its own email, never a repeat of a key.
  const resent = () => Number(sql(`select count(*) from audit_event where action = 'resent' and entity_key = '${k3.S}'`));
  for (const n of [3, 4]) {
    sql(`update demo_message set created_at = created_at - interval '2 minutes' where address = '${D}'`);
    const before = resent(), r = await call("POST", `/runtime/cases/${k3.id}/people/${k3.S}/link`, {}, "user-P");
    ok(`DW9 pass (review M1): Resend no. ${n} a minute later writes its own outbox row and demo copy, matching its history line`, r.status < 300 && outboxTo(D).length === n && (await inbox(D)).filter((m) => m.kind === "link").length === n && resent() === before + 1, { status: r.status, rows: outboxTo(D).length });
  }
  sql(`update demo_message set created_at = created_at - interval '2 minutes' where address = '${D}'`);
  sql(`insert into msg_suppression (id, firm_id, channel, address, reason, created_by) values (gen_random_uuid(), '${firmA}', 'EMAIL', '${D}', 'COMPLAINT', 'seed:pf19r')`);
  const resentBefore = resent(), blocked = await call("POST", `/runtime/cases/${k3.id}/people/${k3.S}/link`, {}, "user-P");
  ok("DW9 fail (review M1): a later Resend to a suppressed address is refused (409 \"Not sent\"), with no history line and no copy",
    blocked.status === 409 && blocked.body?.code === "ADDRESS_NOT_SENT" && resent() === resentBefore && outboxTo(D).length === 4, blocked.body);
  sql(`delete from msg_suppression where address = '${D}'`);

  // ------------------------------------------------------------------ DW10 a case whose firm has no platform firm
  const k4 = await newCase("dw10"), E = `partner.e.${run}@example.com`;
  // CS-K1: a case's client is of the case's firm key (the foreign key to case_client), so the made-up key gets its own client row first.
  // CS-W1 part 2 (20261126160000): a case's firm is required and never changes (case_firm_fixed), so a case whose firm key
  // has no platform firm can no longer exist and the API's 409 FIRM_CANNOT_SEND cannot be reached from one; the check is
  // now that the database refuses making one (the statement, client row included, rolls back) and nothing is sent.
  const sqlErr = (q: string) => { try { sql(q); return ""; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
  const noFirm = sqlErr(`with c as (insert into case_client (id, workspace_id, firm_key, client_number, display_name, display_kind, created_by)
         select gen_random_uuid(), workspace_id, 'no-platform-firm-${run}', case_client_next_number(workspace_id, 'no-platform-firm-${run}'), 'Sample client (DW10)', 'PERSON', 'seed:pf19r' from runtime_case where id = '${k4.id}' returning id)
       update runtime_case set firm_id = null, firm_key = 'no-platform-firm-${run}', client_id = (select id from c) where id = '${k4.id}'`);
  ok("DW10 fail: a case firm key with no platform firm cannot be made (CS-W1 part 2 refuses it, the case keeps its firm), nothing written: no link, no outbox row, no demo copy",
    /case_firm_fixed: a runtime_case row keeps its firm/.test(noFirm) && sql(`select firm_key from runtime_case where id = '${k4.id}'`) === "sample-firm" && sql(`select count(*) from case_client where firm_key = 'no-platform-firm-${run}'`) === "0"
    && sql(`select count(*) from person_link where subject_id = '${k4.S}'`) === "0" && outboxTo(E).length === 0 && (await inbox(E)).length === 0, noFirm);
  ok("DW10 pass: a case of a platform firm sends (DW7's case, firm sample-firm)", r7.length === 1 && r7[0].firm_id === firmA);
  // Break B3: a case whose firm_id names another firm than its key's (sample-solo on a sample-firm case) sends nothing.
  const firmB = sql(`select id from platform_firm where key = 'sample-solo'`), k6 = await newCase("dw10b"), H = `partner.h.${run}@example.com`;
  // CS-K1: the case and its client carry the same firm id (the foreign key on client_id, firm_id, RESTRICT both ways), so the
  // fixture crosses both: the case's firm id to null (the key is then not checked), the client's, then the case's.
  // CS-W1 part 2: the crossing itself is now refused (case_firm_fixed), so the check is that refusal, the case keeping its firm.
  const crossed = sqlErr(`begin; update runtime_case set firm_id = null where id = '${k6.id}'; update case_client set firm_id = '${firmB}' where id = (select client_id from runtime_case where id = '${k6.id}'); update runtime_case set firm_id = '${firmB}' where id = '${k6.id}'; commit;`);
  ok("DW10 fail (break B3): a case whose firm_id names another firm than its firm key's cannot be made (CS-W1 part 2 refuses it); nothing is sent as the other firm",
    /case_firm_fixed: a runtime_case row keeps its firm/.test(crossed) && sql(`select firm_id from runtime_case where id = '${k6.id}'`) === firmA && outboxTo(H).length === 0 && sql(`select count(*) from msg_outbox where firm_id = '${firmB}' and address = '${H}'`) === "0", crossed);
  // Break B4, B9: an address the sending path would refuse or rewrite is a field error in words, never a 500.
  const k7 = await newCase("dw7b");
  const odd = await Promise.all([`jos\u00e9.${run}@example.com`, `x.${run}@ex_ample.com`, `\uff58.${run}@example.com`].map((a) => call("POST", `/runtime/cases/${k7.id}/people/${k7.S}/link`, { address: a }, "user-P")));
  ok("DW7 fail (break B4, B9): an accented, underscored or full-width address is refused on its field (400, in words), never a 500, and nothing is written",
    odd.every((r) => r.status === 400 && /plain letters/.test(JSON.stringify(r.body))) && sql(`select count(*) from person_link where subject_id = '${k7.S}'`) === "0", odd.map((r) => [r.status, r.body?.detail]));

  // ------------------------------------------------------------------ DW11 no token or code anywhere it should not be
  const secrets = new Set<string>();
  for (const a of [A, C, D]) for (const m of await inbox(a)) { const t = tokenIn([m]); if (t) secrets.add(t); const c = codeIn([m]); if (c) { secrets.add(c); secrets.add(`${c.slice(0, 3)} ${c.slice(3)}`); } }
  const vardir = [join(STUDIO, "var", "isolated", DBNAME.replace(/^xr_studio_/, "")), join(STUDIO, "var", `isolated-${DBNAME.replace(/^xr_studio_/, "")}`)].find(existsSync);
  const logs = [vardir ? join(vardir, "api.log") : "", ...(existsSync(join(STUDIO, "var", "isolated-logs")) ? readdirSync(join(STUDIO, "var", "isolated-logs")).filter((f) => f.includes(DBNAME.replace(/^xr_studio_/, ""))).map((f) => join(STUDIO, "var", "isolated-logs", f)) : [])].filter((f) => f && existsSync(f));
  const logText = logs.map((f) => readFileSync(f, "utf8")).join("\n");
  const auditText = sql(`select coalesce(string_agg(summary || ' ' || coalesce(detail::text, ''), ' '), '') from audit_event where at > now() - interval '1 hour'`);
  const outboxText = sql(`select coalesce(string_agg(idempotency_key || ' ' || coalesce(state_reason, ''), ' '), '') from msg_outbox`);
  const answers = seen.filter((t) => !t.includes('"messages"')).join("\n");   // every answer except the demo inbox listings themselves
  const leaks = [...secrets].filter((x) => logText.includes(x) || auditText.includes(x) || outboxText.includes(x) || answers.includes(x));
  ok("DW11 pass: no link token or code in the copy's log lines, any audit line, any outbox key or reason, or any answer or refusal text (only the email itself holds them)",
    secrets.size >= 4 && logs.length > 0 && leaks.length === 0, { secrets: secrets.size, logs, leaks: leaks.map((x) => x.slice(0, 6)) });
  const planted = [...secrets][0]!, scan = (text: string) => [...secrets].filter((x) => text.includes(x));
  ok("DW11 fail (review m1): the same scan, run on the copy's real log with a token planted in one line, finds it (the scan is not blind)", scan(`${logText}\n{"event":"planted","detail":"${planted}"}`).includes(planted) && scan(logText).length === 0);

  // ------------------------------------------------------------------ DW12 demo copies only after a QUEUED answer
  const src = readFileSync(join(STUDIO, "api", "src", "person-link.ts"), "utf8").split("\n");
  const creates = src.map((l, i) => (l.includes("demoMessage.create(") ? i : -1)).filter((i) => i >= 0);
  const guarded = creates.every((i) => /if \(await this\.mail\(tx, /.test(src[i - 1] ?? ""));
  ok("DW12 pass: every demoMessage.create in person-link.ts sits right under `if (await this.mail(tx, …))` (MessagePort answered QUEUED with a new row)", creates.length === 3 && guarded, creates.map((i) => src[i - 1]?.trim().slice(0, 60)));
  ok("DW12 fail: an unguarded create is found by the same check", !/if \(await this\.mail\(tx, /.test("        await tx.demoMessage.create({ data: {} });"));

  // ------------------------------------------------------------------ P-710: production never seeds
  const scratch = `xr_studio_pf19r_prod_${process.pid}`;
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", scratch]); execFileSync(join(BIN, "createdb"), [...PG, scratch]);
  try {
    for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(scratch), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
    const { seedSampleOnStart } = await import("../api/src/platform/identity/sample-seed.ts");
    // PF-24w: the seed reads PF-24's loader, so a production configuration is a complete one (every value made by this run,
    // as check_pf4_identity.ts's PROD); an incomplete one would be refused for its missing settings, not by P-710's rule.
    const hex = (n: number) => randomBytes(n).toString("hex").slice(0, n);
    const PROD = { PLATFORM_ENVIRONMENT: "production", DATABASE_URL: urlOf(scratch), PLATFORM_COGNITO_USER_POOL_ID: `ca-central-1_${hex(9)}`, PLATFORM_COGNITO_CLIENT_ID: hex(26), PLATFORM_STRIPE_SECRET_KEY: ["sk", "test", hex(32)].join("_"), PLATFORM_STRIPE_WEBHOOK_SECRET: ["whsec", hex(32)].join("_"), PLATFORM_SES_REGION: "ca-central-1", PLATFORM_BOLDSIGN_API_KEY: hex(40), PLATFORM_ZOOM_CLIENT_ID: hex(22), PLATFORM_ZOOM_CLIENT_SECRET: hex(32), PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN: hex(22), PLATFORM_SECRET_BOX_KEYS: `1:${randomBytes(32).toString("base64")}`, PLATFORM_SECRET_BOX_KEY_VERSION: "1" };
    await seedSampleOnStart({ ...PROD, PLATFORM_SAMPLE_SEED: "on" });
    ok("P-710 fail: a production configuration, even with PLATFORM_SAMPLE_SEED=on, leaves no Sample firm", sql(`select count(*) from platform_firm`, scratch) === "0");
    await seedSampleOnStart({ DATABASE_URL: urlOf(scratch), PLATFORM_SAMPLE_SEED: "on", PLATFORM_ENVIRONMENT: "local" });   // the seed takes its database from this env (never the demo)
    ok("P-710 pass: the same seed outside production makes the Sample firms (the test copy's setting)", sql(`select count(*) from platform_firm where key in ('sample-firm', 'sample-solo')`, scratch) === "2");
  } finally { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", scratch]); } catch { /* left */ } }

  console.log(`\nPF-19r part 2: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(`STOP  ${e instanceof Error ? e.stack : e}`); process.exit(2); });
