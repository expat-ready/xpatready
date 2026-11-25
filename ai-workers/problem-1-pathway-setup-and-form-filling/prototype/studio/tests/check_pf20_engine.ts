// PF-20 part 1 (R1.36 "A recipe sends at its time only to people with the purpose's consent; … switching a recipe off
// stops queued sends"; AG-2-31 rules 1-8 and §11, AG-2-33, FO-12a's Done when, rev 11). Each line passes and fails:
// DW0 migration, migrate diff, walls and the database's rules · DW1 at its time: sent with consent, skipped without (the
// run goes on) · DW2 off starts no run; one run per person · DW3 a step switched off · DW4 off ends runs, cancels queued
// steps and jobs, one audit line · DW5 a withdrawal ends the run · DW6 registration · DW7 once; firms apart · DW8 off
// racing an enrolment (break M1) · DW9 a message held in the outbox is withdrawn by the off (break M2) · the input
// checks (break m1-m3). Scratch database with every migration and the Sample firms; real MessagePort and ConsentStore with
// the local email adapter; fakeJobs on a fake clock. No server, browser or model call; US$0. Removed at the end.
//   tsx studio/tests/check_pf20_engine.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { Automation, EnrolRefused, EXIT, STEP_QUEUE, STEP_REASON, stepJobKey } from "../api/src/platform/automation/engine.ts";
import { AutomationRegistry } from "../api/src/platform/automation/registry.ts";
import { localEmail } from "../api/src/platform/messages/channels/email/local.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { Messages } from "../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import type { AuditPort } from "../ports/audit.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SCHEMA = join(STUDIO, "prisma", "schema");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf20_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf20-check-${process.pid}`);
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const refused = (q: string, re: RegExp) => { try { execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: "pipe" }); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const uuid = () => crypto.randomUUID(), box = (w: string) => `pf20.${w}.${uuid().slice(0, 6)}@example.com`;

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
try {
  // ------------------------------------------------------------------------------------------- DW0 the migration
  mkdirSync(WORK, { recursive: true });
  const cfg = join(WORK, "prisma.config.ts");
  writeFileSync(cfg, `import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: ${JSON.stringify(SCHEMA)}, migrations: { path: ${JSON.stringify(MIG)} }, datasource: { url: ${JSON.stringify(URL)} } });\n`);
  const diff = spawnSync(join(STUDIO, "node_modules", ".bin", "prisma"), ["migrate", "diff", "--config", cfg, "--from-config-datasource", "--to-schema", SCHEMA, "--exit-code"], { cwd: STUDIO, encoding: "utf8" });
  ok("PF-20 DW0 pass: prisma migrate diff between the fully migrated database and the schema is empty", diff.status === 0, `${diff.stdout}${diff.stderr}`.slice(0, 600));
  ok("PF-20 DW0 pass: the four auto_ tables each have PF-12's forced policy",
    sql(`select count(*) from pg_class c where relname in ('auto_recipe','auto_recipe_step','auto_run','auto_step_run') and relrowsecurity and relforcerowsecurity and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'pf12_firm')`) === "4");

  await seedSampleFirms(db);
  const firmA = sql(`select id from platform_firm where key='sample-firm'`), firmB = sql(`select id from platform_firm where key='sample-solo'`);
  for (const f of [firmA, firmB]) await db.msgFirm.upsert({ where: { firmId: f }, create: { firmId: f }, update: {} });
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), alerts = fakeAlerts(), files = new LocalFiles(join(WORK, "files"));
  const consent = new ConsentStore(auditEvent, clock);
  const messages = new Messages({ db, consent, files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock });
  await messages.register();
  const registry = new AutomationRegistry();
  const followUp = registry.register({ module: "test", key: "test.follow_up", label: "Follow-up (Sample)", description: "Three messages over three days (Sample).", defaultOn: false, steps: [
    { delayMinutes: 60, class: "MARKETING", subject: "News from the firm (Sample)", body: "Step 1 (Sample)." },
    { delayMinutes: 24 * 60, class: "MARKETING", subject: "More news (Sample)", body: "Step 2 (Sample)." },
    { delayMinutes: 2 * 24 * 60, class: "SERVICE", subject: "Your enquiry (Sample)", body: "Step 3 (Sample)." },
  ] });
  registry.register({ module: "test", key: "test.two_steps", label: "Two steps (Sample)", description: "Two marketing messages a day apart (Sample).", defaultOn: true, steps: [
    { delayMinutes: 0, class: "MARKETING", subject: "First (Sample)", body: "First (Sample)." }, { delayMinutes: 24 * 60, class: "MARKETING", subject: "Second (Sample)", body: "Second (Sample)." },
  ] });
  const auto = new Automation({ db, messages, jobs, audit: auditEvent, registry, clock });
  await auto.register();
  const tx = <T>(f: (t: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) => db.$transaction(f);
  const wording = await tx((t) => consent.publishWording(t, { firmId: firmA, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Sample: yes, send me news.", by: "seed:pf20" }));
  const consented = async () => {
    const p = { kind: "FO_PERSON" as const, id: uuid() };
    await tx((t) => consent.record(t, { firmId: firmA, subject: p, channel: "EMAIL", purpose: "MARKETING", wordingId: wording.id, source: "WEB_FORM", locale: "en", recordedKind: "SELF_SERVICE", recordedBy: "system:web-form" }));
    return p;
  };
  const enrolNow = async (firmId: string, key: string, subject: { kind: "FO_PERSON"; id: string }, address: string) => {
    const r = await tx((t) => auto.enrol(t, { firmId, recipeKey: key, subject, channel: "EMAIL", address, by: "staff:pf20" }));
    if (r.started) await auto.schedule(firmId, r.stepRunIds);
    return r;
  };
  const steps = (runId: string) => db.autoStepRun.findMany({ where: { runId }, orderBy: { position: "asc" } });
  const outboxTo = (a: string) => db.msgOutbox.findMany({ where: { address: a } });

  // DW0's database rules (the engine never writes these; a second running run or a silent end are refused).
  const recipes0 = await auto.recipes(firmA);
  ok("PF-20 pass: the firm's recipes are made from the registry on first read, each as the registry says (off unless defaultOn)",
    recipes0.length === 2 && recipes0.find((r) => r.key === "test.follow_up")?.on === false && recipes0.find((r) => r.key === "test.two_steps")?.on === true && recipes0[0].steps.length === 3, recipes0);

  // ------------------------------------------------------------------------------------------- DW2 off → no run
  const pOk = await consented(), pNo = { kind: "FO_PERSON" as const, id: uuid() }, aOk = box("ok"), aNo = box("no");
  const off = await enrolNow(firmA, "test.follow_up", pOk, aOk);
  ok("PF-20 DW2 fail: a person enrolled while the recipe is off → no run starts (AG-2-31 §11)", !off.started && off.reason === "recipe off" && (await db.autoRun.count()) === 0, off);
  const on = await auto.setOn(firmA, "test.follow_up", true, "staff:pf20");
  const r1 = await enrolNow(firmA, "test.follow_up", pOk, aOk), r2 = await enrolNow(firmA, "test.follow_up", pNo, aNo), again = await enrolNow(firmA, "test.follow_up", pOk, aOk);
  ok("PF-20 DW2 pass: switched on, two people are enrolled; the same person enrolled again makes no second run",
    on?.on === true && r1.started && r2.started && !again.started && again.reason === "already running" && again.runId === (r1.started ? r1.runId : "") && (await db.autoRun.count({ where: { firmId: firmA } })) === 2, { r1, again });
  const runOk = r1.started ? r1.runId : "", runNo = r2.started ? r2.runId : "";
  ok("PF-20 DW0 fail: the database refuses a second RUNNING run of one recipe and person, and an ENDED run without its reason",
    refused(`insert into auto_run (id, firm_id, recipe_id, subject_kind, subject_id, channel, address, enrolled_by) select gen_random_uuid(), firm_id, recipe_id, subject_kind, subject_id, channel, address, 'x' from auto_run where id = '${runOk}'`, /auto_run_one_running/)
    && refused(`update auto_run set state = 'ENDED' where id = '${runOk}'`, /auto_run_ended/));

  // ------------------------------------------------------------------------------------------- DW1 at its time, consent
  await clock.advance({ minutes: 59 });
  const before = [...await steps(runOk), ...await steps(runNo)];
  ok("PF-20 DW1 fail: before the step's time nothing is sent (every step QUEUED, no outbox row)", before.every((s) => s.state === "QUEUED") && (await outboxTo(aOk)).length === 0 && (await outboxTo(aNo)).length === 0, before.map((s) => s.state));
  await clock.advance({ minutes: 2 });
  const [s1ok] = await steps(runOk), [s1no] = await steps(runNo), sentOk = await outboxTo(aOk);
  ok("PF-20 DW1 pass: at its time the consented person's MARKETING step is SENT through the outbox (the consent that allowed it named)",
    s1ok.state === "SUCCESS" && !!s1ok.outboxId && sentOk.length === 1 && sentOk[0].state === "SENT" && !!sentOk[0].consentId, { s1ok, sentOk });
  ok("PF-20 DW1 fail: the person without consent is SKIPPED with the gate's reason, nothing sent, and the run goes on (still RUNNING, next step QUEUED)",
    s1no.state === "SKIPPED" && s1no.reason === "NO_CONSENT: MARKETING" && (await outboxTo(aNo)).every((o) => o.state === "SUPPRESSED") && (await db.autoRun.findUniqueOrThrow({ where: { id: runNo } })).state === "RUNNING" && (await steps(runNo))[1].state === "QUEUED", s1no);

  // ------------------------------------------------------------------------------------------- DW3 a step switched off
  sql(`update auto_recipe_step set mode = 'OFF' where position = 2 and recipe_id = (select recipe_id from auto_run where id = '${runOk}')`);
  await clock.advance({ days: 1 });
  const s2 = (await steps(runOk))[1];
  ok("PF-20 DW3 fail: a step switched off never sends (SKIPPED \"step switched off\", still one message to the person)", s2.state === "SKIPPED" && s2.reason === STEP_REASON.STEP_OFF && (await outboxTo(aOk)).length === 1, s2);
  const s3 = (await steps(runOk))[2];
  ok("PF-20 DW3 pass: the next step is still queued and its job waits for its time", s3.state === "QUEUED" && jobs.jobs.some((j) => j.name === STEP_QUEUE && j.key === stepJobKey(s3.id) && j.status === "waiting"), s3);

  // ------------------------------------------------------------------------------------------- DW4 switching off
  const step3 = (await steps(runOk))[2];
  const offR = await auto.setOn(firmA, "test.follow_up", false, "staff:pf20");
  const runsAfter = await db.autoRun.findMany({ where: { id: { in: [runOk, runNo] } } }), queuedAfter = await db.autoStepRun.count({ where: { runId: { in: [runOk, runNo] }, state: "QUEUED" } });
  ok("PF-20 DW4 pass: switching the recipe off ends its two runs (\"recipe switched off\") and cancels both queued last steps and their jobs",
    offR?.endedRuns === 2 && offR.cancelledSteps === 2 && runsAfter.every((r) => r.state === "ENDED" && r.exitReason === EXIT.RECIPE_OFF) && queuedAfter === 0
    && jobs.jobs.filter((j) => j.name === STEP_QUEUE && j.key === stepJobKey(step3.id)).every((j) => j.status === "cancelled"), { offR, runsAfter });
  await clock.advance({ days: 3 });
  const late = await auto.runStep(firmA, step3.id);
  ok("PF-20 DW4 fail: after the off, no queued message is sent (past its time, and its job run anyway answers CANCELLED)",
    late === "CANCELLED" && (await outboxTo(aOk)).length === 1 && (await db.autoStepRun.findUniqueOrThrow({ where: { id: step3.id } })).reason === STEP_REASON.RECIPE_OFF, late);
  const line = sql(`select summary from audit_event where action = 'automation.recipe.off' and entity_key = (select id::text from auto_recipe where firm_id = '${firmA}' and key = 'test.follow_up')`);
  ok("PF-20 DW4 pass: the off is one audit line naming the counts", /switched off: 2 running, 2 queued messages cancelled/.test(line), line);

  // ------------------------------------------------------------------------------------------- DW5 withdrawn → ends
  const pW = await consented(), aW = box("withdrawn");
  const rW = await enrolNow(firmA, "test.two_steps", pW, aW);
  await clock.advance({ minutes: 1 });
  await tx((t) => consent.withdraw(t, { firmId: firmA, subject: pW, channel: "EMAIL", purpose: "MARKETING", via: "UNSUBSCRIBE", by: "system:unsubscribe" }));
  await clock.advance({ days: 1, minutes: 1 });
  const runW = rW.started ? rW.runId : "", sW = await steps(runW), runWrow = await db.autoRun.findUniqueOrThrow({ where: { id: runW } });
  ok("PF-20 DW5 pass→fail: the first step went to the consented person; after the withdrawal the next step is SKIPPED (\"WITHDRAWN: MARKETING\") and the run ends \"unsubscribed\"",
    sW[0].state === "SUCCESS" && sW[1].state === "SKIPPED" && /^WITHDRAWN/.test(sW[1].reason ?? "") && runWrow.state === "ENDED" && runWrow.exitReason === EXIT.UNSUBSCRIBED && (await outboxTo(aW)).filter((o) => o.state === "SENT").length === 1, { sW, runWrow });

  // ------------------------------------------------------------------------------------------- DW6 registration
  let twice = "";
  try { registry.register({ ...followUp, label: "Again" }); } catch (e) { twice = (e as Error).message; }
  ok("PF-20 DW6 fail: a recipe key registered twice stops the start-up, naming the key and the modules", /test\.follow_up is registered twice \(module test, then module test\)/.test(twice), twice);
  const gone = sql(`insert into auto_recipe (id, firm_id, module, key, "on", updated_by) values (gen_random_uuid(), '${firmA}', 'gone', 'gone.recipe', true, 'seed:pf20') returning id`).split("\n")[0];
  sql(`insert into auto_recipe_step (id, firm_id, recipe_id, position, delay_minutes, class, subject, body) values (gen_random_uuid(), '${firmA}', '${gone}', 1, 0, 'SERVICE', 'Gone (Sample)', 'Gone (Sample).')`);
  const pG = { kind: "FO_PERSON" as const, id: uuid() }, aG = box("gone");
  const gRun = sql(`insert into auto_run (id, firm_id, recipe_id, subject_kind, subject_id, channel, address, enrolled_by) values (gen_random_uuid(), '${firmA}', '${gone}', 'FO_PERSON', '${pG.id}', 'EMAIL', '${aG}', 'seed:pf20') returning id`).split("\n")[0];
  const gStep = sql(`insert into auto_step_run (id, firm_id, run_id, position, due_at) values (gen_random_uuid(), '${firmA}', '${gRun}', 1, now()) returning id`).split("\n")[0];
  const gOut = await auto.runStep(firmA, gStep);
  ok("PF-20 DW6 fail: a recipe whose module no longer registers it is never run (SKIPPED \"recipe not registered\", nothing sent)",
    gOut === "SKIPPED" && (await db.autoStepRun.findUniqueOrThrow({ where: { id: gStep } })).reason === STEP_REASON.NOT_REGISTERED && (await outboxTo(aG)).length === 0, gOut);
  ok("PF-20 DW6 pass: an unregistered key can neither be switched nor enrolled", (await auto.setOn(firmA, "gone.recipe", false, "staff:pf20")) === null
    && (await tx((t) => auto.enrol(t, { firmId: firmA, recipeKey: "gone.recipe", subject: pG, channel: "EMAIL", address: aG, by: "staff:pf20" }))).started === false);

  // ------------------------------------------------------------------------------------------- DW7 once; firms apart
  await auto.setOn(firmA, "test.follow_up", true, "staff:pf20");
  const pT = await consented(), aT = box("twice");
  const rT = await tx((t) => auto.enrol(t, { firmId: firmA, recipeKey: "test.follow_up", subject: pT, channel: "EMAIL", address: aT, by: "staff:pf20" }));
  const firstStep = rT.started ? rT.stepRunIds[0] : "";
  const early = await auto.runStep(firmA, firstStep);
  ok("PF-20 fail (break m1): a step called before its time sends nothing and stays QUEUED", early === "QUEUED" && (await outboxTo(aT)).length === 0, early);
  await clock.advance({ minutes: 61 });
  const twiceRun = [await auto.runStep(firmA, firstStep), await auto.runStep(firmA, firstStep)];
  ok("PF-20 DW7 pass: a step job run twice sends once (SUCCESS both times, one outbox row)", twiceRun.every((s) => s === "SUCCESS") && (await outboxTo(aT)).length === 1, twiceRun);
  ok("PF-20 DW7 fail: firm B reads none of firm A's runs for the person, and its own off touches none of them",
    (await auto.runsFor(firmB, pT)).length === 0 && (await auto.setOn(firmB, "test.follow_up", false, "staff:pf20"))?.endedRuns === 0 && (await auto.runsFor(firmA, pT))[0]?.state === "RUNNING");
  ok("PF-20 pass: \"Enrolled in\" lists the person's run with each step's state", (await auto.runsFor(firmA, pT))[0]?.steps.map((s) => s.state).join() === "SUCCESS,QUEUED,QUEUED");

  // ------------------------------------------------------------------------------------------- DW8 off races an enrolment (break M1)
  // The off's transaction is held open 1.5 s (its audit line waits); an enrolment starts 0.4 s in. Before the fix the
  // enrolment read "on" without a lock and its run outlived the off.
  const slowAudit: AuditPort<Parameters<Parameters<typeof db.$transaction>[0]>[0]> = { record: async (t, e) => { if ("action" in e && e.action === "automation.recipe.off") await new Promise((r) => setTimeout(r, 1500)); return auditEvent.record(t, e); } };
  const slow = new Automation({ db, messages, jobs, audit: slowAudit, registry, clock });
  const pR = await consented(), aR = box("race");
  const offing = slow.setOn(firmA, "test.follow_up", false, "staff:pf20");
  await new Promise((r) => setTimeout(r, 400));
  const raced = await enrolNow(firmA, "test.follow_up", pR, aR);
  await offing;
  ok("PF-20 DW8 fail (break M1): an enrolment racing a switch-off waits for it and starts no run; the recipe has none running",
    !raced.started && raced.reason === "recipe off" && (await auto.recipes(firmA)).find((r) => r.key === "test.follow_up")?.running === 0, { raced, recipes: await auto.recipes(firmA) });
  const offRecipe = sql(`select id from auto_recipe where firm_id = '${firmA}' and key = 'test.follow_up'`);
  const left = sql(`insert into auto_run (id, firm_id, recipe_id, subject_kind, subject_id, channel, address, enrolled_by) values (gen_random_uuid(), '${firmA}', '${offRecipe}', 'FO_PERSON', '${uuid()}', 'EMAIL', '${box("left")}', 'seed:pf20') returning id`).split("\n")[0];
  const again2 = await auto.setOn(firmA, "test.follow_up", false, "staff:pf20");
  ok("PF-20 DW8 pass: switching off a recipe already off still ends a run left running on it",
    again2?.endedRuns === 1 && (await db.autoRun.findUniqueOrThrow({ where: { id: left } })).exitReason === EXIT.RECIPE_OFF, again2);

  // ------------------------------------------------------------------------------------------- DW9 a held message (break M2)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock.now());
  sql(`insert into msg_send_counter (firm_id, day, sent, updated_at) values ('${firmA}', '${today}', 100000, now()) on conflict (firm_id, day) do update set sent = 100000`);
  const pH = await consented(), aH = box("held");
  const rH = await enrolNow(firmA, "test.two_steps", pH, aH);
  await clock.advance({ minutes: 1 });
  const heldStep = (await steps(rH.started ? rH.runId : ""))[0], heldRow = (await outboxTo(aH))[0];
  ok("PF-20 DW9 setup: the step was handed to the outbox and its message waits there (QUEUED \"daily limit\")", heldStep.state === "SUCCESS" && heldRow?.state === "QUEUED" && heldRow.stateReason === "daily limit", { heldStep, heldRow });
  const offH = await auto.setOn(firmA, "test.two_steps", false, "staff:pf20");
  sql(`update msg_send_counter set sent = 0 where firm_id = '${firmA}' and day = '${today}'`);
  await clock.advance({ days: 2 });
  const heldAfter = await db.msgOutbox.findUniqueOrThrow({ where: { id: heldRow.id } });
  ok("PF-20 DW9 fail (break M2): switching off withdraws the waiting message (SUPPRESSED \"CANCELLED: recipe switched off\"); once the limit clears, the sweep never sends it",
    heldAfter.state === "SUPPRESSED" && heldAfter.stateReason === "CANCELLED: recipe switched off" && !heldAfter.sentAt && (await outboxTo(aH)).every((o) => o.state !== "SENT"), heldAfter);
  ok("PF-20 DW9 pass: the off counts the withdrawn message with the cancelled step (2 queued messages)", offH?.cancelledSteps === 2
    && /switched off: 1 running, 2 queued messages cancelled/.test(sql(`select summary from audit_event where action = 'automation.recipe.off' and entity_key = (select id::text from auto_recipe where firm_id = '${firmA}' and key = 'test.two_steps')`)), offH);

  // ------------------------------------------------------------------------------------------- the engine's input (break m2, m3)
  await auto.setOn(firmA, "test.two_steps", true, "staff:pf20");
  const refusedEnrol = async (i: Partial<Parameters<typeof auto.enrol>[1]>) => tx(async (t) => {
    let why = ""; try { await auto.enrol(t, { firmId: firmA, recipeKey: "test.two_steps", subject: { kind: "FO_PERSON", id: uuid() }, channel: "EMAIL", address: box("in"), by: "staff:pf20", ...i } as Parameters<typeof auto.enrol>[1]); } catch (e) { why = e instanceof EnrolRefused ? e.message : `other: ${String(e)}`; }
    await t.$queryRaw`select 1`;   // the caller's transaction is still usable
    return why;
  });
  const whys = [await refusedEnrol({ subject: { kind: "STAFF", id: uuid() } }), await refusedEnrol({ subject: { kind: "FO_PERSON", id: "nope" } }), await refusedEnrol({ address: "not an address" }), await refusedEnrol({ channel: "WHATSAPP" })];
  ok("PF-20 fail (break m3): a staff subject, a non-uuid id, a bad address or an email on WhatsApp is refused before any SQL, and the caller's transaction goes on", whys.every((w) => w.startsWith("enrol:")), whys);
  ok("PF-20 pass: an address is kept in its one form (upper case and spaces normalised)", (await enrolNow(firmA, "test.two_steps", { kind: "FO_PERSON", id: uuid() }, "  PF20.Upper@Example.COM ")).started && (await db.autoRun.count({ where: { address: "pf20.upper@example.com" } })) === 1);
  ok("PF-20 fail (break m3): a step id that is not a uuid answers null", (await auto.runStep(firmA, "nope")) === null);
  let tab = ""; try { new AutomationRegistry().register({ module: "test", key: "test.tab", label: "Tab", description: "Tab.", defaultOn: false, steps: [{ delayMinutes: 0, class: "SERVICE", subject: "a\tb", body: "x" }] }); } catch (e) { tab = String(e); }
  let nul = ""; try { new AutomationRegistry().register({ module: "test", key: "test.nul", label: "Nul", description: "Nul.", defaultOn: false, steps: [{ delayMinutes: 0, class: "SERVICE", subject: "ok", body: "a\u0000b" }] }); } catch (e) { nul = String(e); }
  ok("PF-20 fail (break m2): the registry refuses a subject with a tab or line separator and a body with NUL", /one line/.test(tab) && /NUL/.test(nul), { tab, nul });
} finally {
  await db.$disconnect().catch(() => undefined);
  spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
