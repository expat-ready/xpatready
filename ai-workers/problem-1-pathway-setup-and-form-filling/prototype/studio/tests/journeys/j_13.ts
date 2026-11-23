// J-13 (map row 13, R1.13 logs, metrics, error reports, alerts): the walk of PF-23m, on an isolated copy of the running
// app (its own database and port; never :4400), read through the copy's own server log (var/isolated-<name>/api.log).
// A booker gives a firm's public booking door their name, email and a passport number; the server's log keeps the
// request as structured lines with the booker's own request id and never a personal value; a stuck job reaches the
// alarm.
//   W1: the booker's two requests (one refused: no consent and an unknown field holding the passport number; one booked) answer as a person expects, and each is one JSON
//       request line in api.log carrying the X-Request-Id the booker's browser sent;
//   W2: every line of api.log is one JSON object (one named exception: Stripe's SDK hint, written past the logger only
//       when an agent session starts the copy) and none holds the seeded name, any word of it, the email or the
//       passport number; the fail case: the same scan on a scratch copy of the log with one leaking line added flags it;
//   W3: /api/health/live and /api/health/ready answer 200 (ready counts the database and the job queue);
//   W3b: an author opens a failed AI run whose message holds a server path and the person (GET /api/runs/:id, a moved
//       site, plain-run-text.ts): plain words on the page, one log line naming the run, no seeded value (review m5);
//   W4: a job waiting longer than STUCK_JOB_MS (Sample, 30 min) raises one `job_stuck` alarm line (embedded metric
//       format, metric "Alerts", AlertKind job_stuck) naming its queue and job id within 2 minutes; the next minute's
//       check raises none (one page per incident, ALERT_REPEAT_MS 5 min, Sample).
// Not here, held (P-251) until PF-23c (the founder's AWS account and on-call address): W5 the alarm reaches the on-call
// person; W6 the log group keeps 90 days in ca-central-1. This file carries no `Completes: R1.13` until then.
// The test firm, its host and its free-consultation type are written straight to the copy's database (Sample rows).
// Run from prototype/ (US$0, no model call):
//   zsh studio/tools/isolated.sh j13 4433 start --ttl 20 && trap 'zsh studio/tools/isolated.sh j13 4433 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_13.ts j13 4433
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";

const [NAME, PORT] = [process.argv[2] ?? "j13", Number(process.argv[3] ?? 4433)];
const STUDIO = join(import.meta.dirname, "..", ".."), BASE = `http://127.0.0.1:${PORT}`;
const LOG = join(STUDIO, "var", `isolated-${NAME}`, "api.log");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Ans = { status: number; rid: string | null; body: Record<string, any> };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const call = async (path: string, init: RequestInit = {}): Promise<Ans> => { const r = await fetch(`${BASE}${path}`, init); return { status: r.status, rid: r.headers.get("x-request-id"), body: await r.json().catch(() => ({})) }; };
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);

// The seeded person (de-identified, SA-11-37 Fixtures): a name, an email and a passport-shaped number.
const GIVEN = "Zelda", FAMILY = "Quixote", EMAIL = "zelda.quixote@j13-client.example", PASSPORT = "W012345678";
const SEEDED = [GIVEN, FAMILY, EMAIL, PASSPORT];
/** The one line a package writes past the logger, named so nothing else hides behind it: Stripe's SDK (23.1.0,
 *  stripe.core.js) writes this plugin hint straight to stderr when CLAUDECODE or CLAUDE_CODE_CHILD_SESSION is set, that
 *  is only when an agent session starts the copy (never in CI or the cloud). It holds no personal value. */
const STRIPE_HINT = '<claude-code-hint v="1" type="plugin" value="stripe@claude-plugins-official" />';
/** The lines of a log that are not one JSON object, and the lines holding a seeded value. */
export const scan = (lines: string[]) => ({
  notJson: lines.filter((l) => { if (l === STRIPE_HINT) return false; try { return typeof JSON.parse(l) !== "object"; } catch { return true; } }),
  leaking: lines.filter((l) => SEEDED.some((v) => l.includes(v))),
});

try {
  // The firm's public door (Sample rows).
  const firm = await db.platformFirm.create({ data: { key: `j13-${Date.now().toString(36)}`, operatingName: "Sample J-13 firm", countryCode: "CA", status: "ACTIVE", contactEmail: "office@j13.example" } });
  const host = await db.platformStaff.create({ data: { firmId: firm.id, email: "host@j13.example", displayName: "Sample host", status: "ACTIVE" } });
  await copyFirmHoursTo(db, firm.id, [host.id]);
  await db.foConsultationType.create({ data: { firmId: firm.id, slug: "free", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: [host.id], minutes: 30 } });

  // W1: the booker's page, a refused request (no consent), then the booking.
  const run = Date.now().toString(36), rid = { page: `j13-page-${run}`, refused: `j13-refused-${run}`, booked: `j13-booked-${run}` };
  const page = await call(`/api/public/firms/${firm.key}/book/free/slots`, { headers: { "X-Request-Id": rid.page } });
  const slot = (page.body.slots as { startsAt: string }[] | undefined)?.find((s) => Date.parse(s.startsAt) > Date.now() + 25 * 3_600_000);
  await pause(3_500);   // the form's minimum fill time
  // The refused request also carries the passport number in a field the door does not take (its answer names the key only).
  const form = (consent: boolean) => JSON.stringify({ givenNames: GIVEN, familyName: FAMILY, email: EMAIL, ...(consent ? {} : { notes: `Passport ${PASSPORT}` }), mode: "VIDEO", startsAt: slot?.startsAt, timeZone: "America/Toronto", consent, consentWordingId: page.body.consent?.wordingId, formStamp: page.body.formStamp });
  const post = (id: string, consent: boolean) => call(`/api/public/firms/${firm.key}/book/free/bookings`, { method: "POST", headers: { "content-type": "application/json", "X-Request-Id": id }, body: form(consent) });
  const refused = await post(rid.refused, false);
  const booked = await post(rid.booked, true);
  ok("J-13 W1: the booker's page opens, a request without consent is refused (4xx) and the booking is made (201); each answer carries back the booker's request id",
    page.status === 200 && !!slot && refused.status >= 400 && refused.status < 500 && booked.status === 201 && page.rid === rid.page && refused.rid === rid.refused && booked.rid === rid.booked,
    { page: [page.status, page.rid], slot, refused: [refused.status, refused.rid, refused.body], booked: [booked.status, booked.rid] });
  await pause(300);
  const parsed = logLines().flatMap((l) => { try { return [JSON.parse(l) as Record<string, unknown>]; } catch { return []; } });
  const requestLine = (id: string) => parsed.filter((x) => x.event === "request" && x.correlationId === id);
  ok("J-13 W1: each of the three requests is exactly one JSON request line in the server's log with its correlation id, its route pattern (never the path the booker typed), its status and duration",
    [rid.page, rid.refused, rid.booked].every((id) => requestLine(id).length === 1) && requestLine(rid.booked)[0]?.status === 201 && String(requestLine(rid.booked)[0]?.route).includes(":") && !String(requestLine(rid.booked)[0]?.route).includes(firm.key) && typeof requestLine(rid.booked)[0]?.durationMs === "number",
    [rid.page, rid.refused, rid.booked].map((id) => requestLine(id)));

  // W2: the whole log, structured and without the person.
  const all = logLines(), s = scan(all);
  ok(`J-13 W2: all ${all.length} lines of the server's log are JSON objects and none holds the booker's name, any word of it, the email or the passport number`, all.length > 10 && s.notJson.length === 0 && s.leaking.length === 0, s);
  const probe = scan([...all, JSON.stringify({ time: new Date().toISOString(), level: "warn", event: "console", message: `booking for ${GIVEN} ${FAMILY} failed` }), "plain text line"]);
  ok("J-13 W2 fail: the same scan flags a leaking line and a non-JSON line added to a scratch copy of the log (the check can fail)", probe.leaking.length === 1 && probe.notJson.length === 1, probe);

  // W3: health.
  const live = await call("/api/health/live"), ready = await call("/api/health/ready");
  ok("J-13 W3: /api/health/live and /api/health/ready answer 200; ready counts the database and the job queue, both ok", live.status === 200 && ready.status === 200 && ready.body.checks?.database?.ok === true && ready.body.checks?.job_queue?.ok === true, { live, ready });

  // W3b (review m5): a moved site on the running copy. An author opens a failed AI run whose step message holds a server
  // path and the seeded person (written as a run that stopped on this computer would leave it); the page gets plain
  // words, the log gets one run_message_kept_from_page line naming the run, and no line holds a seeded value.
  const ws = await db.workspace.findFirstOrThrow({ select: { id: true } });
  const runMsg = `ENOENT: open /home/app/var/${GIVEN} ${FAMILY} ${PASSPORT} ${EMAIL}.pdf`;
  const batch = await db.aiBatch.create({ data: { workspaceId: ws.id, idempotencyKey: `j13-${run}`, operation: "draft_field_maps", scopeKind: "form", scopeLabel: "Sample J-13 form", mode: "REPLAY", status: "FAILED", planSha256: "0".repeat(64), plan: {}, spendLimitUsd: 0, worstCaseUsd: 0, startedBy: "user-A", message: runMsg, finishedAt: new Date() } });
  await db.draftingJob.create({ data: { workspaceId: ws.id, batchId: batch.id, kind: "field_map", mode: "REPLAY", status: "FAILED", startedBy: "user-A", message: runMsg, finishedAt: new Date() } });
  const before = logLines().length;
  const view = await call(`/api/runs/${batch.id}`, { headers: { "x-actor": "user-A", "X-Request-Id": `j13-run-${run}` } });
  await pause(300);
  const after = logLines().slice(before), kept = after.flatMap((l) => { try { const x = JSON.parse(l) as Record<string, unknown>; return x.event === "run_message_kept_from_page" ? [x] : []; } catch { return []; } });
  const runPage = JSON.stringify(view.body);
  ok("J-13 W3b: the author's failed run page shows plain words, never the path or the person; the log names the run (run_message_kept_from_page with its id) and holds no seeded value",
    view.status === 200 && !SEEDED.some((v) => runPage.includes(v)) && !runPage.includes("/home/app") && kept.length >= 1 && kept.some((x) => x.runId === batch.id) && scan(after).leaking.length === 0,
    { status: view.status, error: view.body.error, kept, leaking: scan(after).leaking });

  // W4: a stuck job reaches the alarm, once. A queue of its own with no handler, so nothing runs the job.
  const queue = `j13.probe_${run}`;
  await db.$executeRawUnsafe(`select platform_jobs.create_queue($1, '{"policy":"standard"}'::jsonb)`, queue);
  const [job] = await db.$queryRawUnsafe<{ id: string }[]>(`insert into platform_jobs.job (name, data, start_after) values ($1, '{}'::jsonb, now() - interval '1 hour') returning id::text as id`, queue);
  const alarms = () => logLines().flatMap((l) => { try { const x = JSON.parse(l) as Record<string, any>; return x.event === "alert" && x.alert === "job_stuck" && x.queue === queue ? [x] : []; } catch { return []; } });   // eslint-disable-line @typescript-eslint/no-explicit-any -- a log line read loosely
  let first: Record<string, unknown>[] = [];
  for (let i = 0; i < 120 && !first.length; i++) { first = alarms(); if (!first.length) await pause(1_000); }
  const a = first[0] as Record<string, any> | undefined;   // eslint-disable-line @typescript-eslint/no-explicit-any -- a log line read loosely
  ok("J-13 W4: a job waiting over the stuck limit raises one job_stuck alarm line within 2 minutes, in embedded metric format (Alerts, AlertKind), naming its queue and job id and rule SA8-D40",
    first.length === 1 && a?.entityKey === job.id && a?.rule === "SA8-D40" && a?.AlertKind === "job_stuck" && a?.Alerts === 1 && Array.isArray(a?._aws?.CloudWatchMetrics) && a._aws.CloudWatchMetrics[0]?.Metrics?.[0]?.Name === "Alerts", first);
  await pause(70_000);   // the next minute's check
  ok("J-13 W4: the next minute's check raises no second alarm for the same job (one page per incident)", alarms().length === 1, alarms());
} finally {
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
