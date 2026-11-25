// PF-23m (R1.13; SA-11-37 rules 1-3, BR-16): log calls outside the platform carry record ids, rule names and an error's
// class, never an error's or a run's own text. Names cannot be caught by pattern, only kept out by structure.
// Each Done-when line has a pass and a fail:
//   C-R1.13 PF-23m DW1: a scan of api/src finds no console call (or the booking door's warn) that puts `.message`,
//       String(e|err|x) or whyNot(…) into a line, outside the listed exceptions; a planted leaking line is flagged.
//   C-R1.13 PF-23m DW2: every moved site passes the error object (or ids only) to logPort, never a text; a seeded name,
//       passport number and email thrown at the logger, at plainRunText and at the booking door's two warn sites never
//       reach a captured line, while the event and the ids do.
//   C-R1.13 PF-23m DW3: dbRuleOf keeps a constraint's name and never a quoted value.
// No server, no database, US$0, no model call.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf23m_log_calls.ts
import "reflect-metadata";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MessageRefused } from "../ports/messages.ts";
import { JsonLog, logPort, useLog } from "../api/src/platform/observability/log.ts";
import { dbRuleOf } from "../api/src/platform/observability/redact.ts";
import { launcherReason, plainRunText } from "../api/src/plain-run-text.ts";
import { BookingService } from "../api/src/front-office/booking/service.ts";

const SRC = join(import.meta.dirname, "..", "api", "src");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 800)}` : ""}`); };

// ---------------------------------------------------------------------------------------------------------- DW1 scan
/** A line that writes a log and puts an error's or a run's own text into it. */
// Review m1 (0f49fafb0): wider than `.message`: the launcher's and provider's words (`.err`, `.refused`, `.error` as a
// property, `why`), stacks, JSON of an error, a text variable after a literal; the injected `log?.(` callbacks and a
// logPort field built from a template. One line at a time: a call split over lines is left to review (said in the PR).
const WRITES = /\bconsole\.(log|info|warn|error|debug)\(|\bthis\.warn\(|\blog\?\.\(|\bthis\.d\.log\?\.\(|\blogPort\.(info|warn|error)\(/;
const LEAKS = /(\.message\b|\bString\((e|err|error|x)(?![.\w])|\bwhyNot\(|\$\{(e|err|error|x|why)\}|\.(err|stack)\b|(?<!AI_FAILED)\.refused\b|\.error\b(?!\s*\()|\bJSON\.stringify\((e|err|error|x)\b|(?<![\w."'])why\b(?!\s*:))/;
// A text variable after a literal; an error object there is fine (patchConsole reduces it to class and frames).
const TEXT_AFTER_LITERAL = /\bconsole\.(log|info|warn|error|debug)\("[^"]*",\s*(?!(?:e|err|error|x)\))[a-z]\w*(\.slice\([^)]*\))?\)/;
const TEMPLATE_FIELD = /\blogPort\.(info|warn|error)\([^)]*`/;
/** launcherReason(…) turns the words into a fixed code (review m2): what it reads is not logged. */
const CODES = /launcherReason\((?:[^()]|\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))*\)/g;
export const leaks = (raw: string) => { const line = raw.replace(CODES, "CODE"); return (WRITES.test(line) && LEAKS.test(line)) || TEXT_AFTER_LITERAL.test(line) || TEMPLATE_FIELD.test(line); };
/** One-shot command-line scripts whose JSON answer on stdout is what their caller reads (not the server log), and the
 *  logger's own module. Each is named in the PR; anything new is a failure. */
const EXCEPT: { file: string; has: string }[] = [
  { file: "case-clients/prospect-won.ts", has: "console.log(JSON.stringify({ error: String(e)" },
  { file: "front-office/firm-seed.ts", has: "console.log(JSON.stringify({ error: String(e)" },
  { file: "platform/web-address/firm-created.ts", has: "console.log(JSON.stringify({ error: String(e)" },
  // Not a leak: d.why is one of three fixed sentences (sample-seed.ts 19-21); the file is open PR #2001's, left as it is.
  { file: "platform/identity/sample-seed.ts", has: "console.warn(`platform: Sample seed ${d.why}`)" },
];
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []; });
const found: string[] = [];
for (const f of files(SRC)) {
  const rel = relative(SRC, f).split("\\").join("/");
  if (rel.startsWith("platform/observability/")) continue;   // the logger itself
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (!leaks(line)) return;
    if (EXCEPT.some((x) => x.file === rel && line.includes(x.has))) return;
    found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
  });
}
ok("C-R1.13 PF-23m DW1 pass: no log call under api/src puts an error's or a run's text into a line (outside the 4 listed exceptions)", found.length === 0, found);
// Review m1: the 7 lines the first scan missed, as they stood on main 9af529c57 (one line each).
const missedBefore = [
  "if (stub.code !== 0) { console.warn(`${step.kind} ${jobId}: stub refused:`, String(sj?.refused ?? stub.err).trim().slice(-600) || `exit ${stub.code}`); return r; }",
  "if (!limit) console.warn(`${step.kind} ${jobId}: live call did not run:`, why.slice(0, 600));",
  "console.warn(`${step.kind} ${jobId}: the AI service refused the request:`, attempts.map((a) => a.error ?? \"\").join(\" | \").slice(0, 600));",
  "console.warn(`${step.kind} ${jobId}: the AI service was busy:`, attempts.map((a) => a.error ?? \"\").join(\" | \").slice(0, 600));",
  "if (stub.code !== 0) { console.warn(`[who-can-be] stub pass refused ${jobId}: ${String(last(stub.out)?.refused ?? stub.err).trim().slice(-300)}`); return r; }",
  "if (!lj?.run_file) { console.warn(`[who-can-be] live call did not run ${jobId}: ${String(lj?.refused ?? lj?.error ?? live.err).trim().slice(-300)}`); return r; }",
  "console.warn(\"run message kept from the page:\", t.slice(0, 600));",
];
ok("C-R1.13 PF-23m DW1 fail (review m1): each of the 7 old lines the first scan missed is flagged now", missedBefore.every(leaks), missedBefore.map(leaks));
const planted = ["console.warn(String(e));", "console.error(`form copy ${id}: ${(e as Error).message.slice(0, 200)}`);", "console.warn(`demo: ${whyNot(e)}`);", "this.warn(`x failed: ${e.message}`);", "console.warn(`poll: ${e}`);",
  "this.d.log?.(`send failed: ${e.message}`);", "logPort.warn(\"x\", { note: `${why}` });", "console.error(JSON.stringify(err));", "console.error(err.stack);"];
const kept = ["logPort.error(\"form_copy_failed\", e, { copyId: id });", "console.warn(`cases: filled ${n} rows`);", "console.error(e);", "console.error(\"[demo] the finished story stopped\", e);",
  "logPort.warn(\"ai_stub_refused\", { step: step.kind, jobId, exit: stub.code, reason: launcherReason(String(sj?.refused ?? stub.err)) });"];
ok("C-R1.13 PF-23m DW1 fail: each planted leaking line is flagged by the scan, and safe lines are not", planted.every(leaks) && !kept.some(leaks), { planted: planted.map(leaks), kept: kept.map(leaks) });
ok("C-R1.13 PF-23m DW1: each listed exception is still where it is named (an exception that moved is not silently kept)",
  EXCEPT.every((x) => readFileSync(join(SRC, x.file), "utf8").includes(x.has)), EXCEPT.map((x) => [x.file, readFileSync(join(SRC, x.file), "utf8").includes(x.has)]));

// ------------------------------------------------------------------------------------------- DW2 the moved sites
// [file, event, form]: "error" = logPort.error("<event>", <the caught error>, …); "warn" = logPort.warn("<event>", {…}).
const SITES: [string, string, "error" | "warn"][] = [
  ["rounds.ts", "ai_stub_refused", "warn"], ["rounds.ts", "ai_live_not_run", "warn"], ["rounds.ts", "ai_provider_refused", "warn"], ["rounds.ts", "ai_provider_busy", "warn"],
  ["fill-case.ts", "form_copy_failed", "error"],
  ["draft-qd.ts", "qd_conditions_round_failed", "error"], ["draft-qd.ts", "qd_run_failed", "error"], ["draft-qd.ts", "qd_conditions_failed", "error"], ["draft-qd.ts", "qd_run_stopped", "error"],
  ["form-masters.ts", "masters_saved_rounds_failed", "error"], ["form-masters.ts", "masters_round_failed", "error"], ["form-masters.ts", "masters_audit_not_written", "error"], ["form-masters.ts", "masters_job_not_ended", "error"],
  ["pqr-drafts.ts", "pqr_round_failed", "error"], ["pqr-drafts.ts", "pqr_saved_rounds_failed", "error"], ["pqr-drafts.ts", "pqr_job_not_ended", "error"],
  ["review-runs.ts", "form_review_round_failed", "error"],
  ["people-ai.ts", "who_can_be_run_stopped", "error"], ["people-ai.ts", "who_can_be_stub_refused", "warn"], ["people-ai.ts", "who_can_be_live_not_run", "warn"],
  ["impact.ts", "impact_round_failed", "error"], ["plain-run-text.ts", "run_message_kept_from_page", "warn"],
  ["firms.ts", "case_firm_fill_failed", "error"], ["demo.ts", "case_firm_fill_failed", "error"], ["case-clients/live.ts", "won_prospect_poll_failed", "error"],
  ["platform/entitlements/storage.ts", "storage_daily_failed", "error"], ["platform/entitlements/storage.ts", "storage_measure_failed", "error"],
  ["platform/identity/service.ts", "cognito_keys_not_warmed", "error"], ["platform/jobs/pgboss-jobs.ts", "jobs_background_error", "error"],
  ["platform/jobs/platform-jobs.ts", "jobs_stop_failed", "error"], ["platform/web-address/routes.ts", "web_address_catch_up_failed", "error"],
];
/** The call's arguments up to its closing bracket (one line each). */
const callAt = (src: string, event: string, form: string) => {
  const at = src.indexOf(`logPort.${form}("${event}"`);
  if (at < 0) return null;
  let depth = 0, i = src.indexOf("(", at);
  for (let j = i; j < src.length; j++) { if (src[j] === "(") depth++; else if (src[j] === ")" && --depth === 0) return src.slice(i + 1, j); }
  return null;
};
/** Review m4: a field holds an id, a code or a number, never a text-like value (`why`, `text`, `message`, `e`, …), as
 *  `{ why }` or `{ note: why }`. */
const TEXTY = new Set(["e", "err", "error", "x", "why", "t", "text", "message", "msg", "out", "stderr", "detail", "words", "body", "reason"]);
const textyFields = (args: string) => { const f = args.replace(CODES, "CODE").match(/\{[^{}]*\}\s*$/s)?.[0] ?? ""; return [...f.matchAll(/(?:[{,]\s*(\w+)\s*(?=[,}]))|(?::\s*(\w+)\s*(?=[,}]))/g)].map((m) => m[1] ?? m[2]).filter((n) => TEXTY.has(n)); };
const bad: unknown[] = [];
for (const [file, event, form] of SITES) {
  const args = callAt(readFileSync(join(SRC, file), "utf8"), event, form);
  // error: second argument is a bare identifier (the caught error); neither form builds a text (no template, no .message).
  const shape = args && (form === "error" ? /^"[a-z_]+",\s*[a-z]\w*\s*(,\s*\{[^`]*\})?\s*$/s : /^"[a-z_]+",\s*\{[^`]*\}\s*$/s).test(args.replace(CODES, "CODE").trim());
  const texty = args ? textyFields(args) : [];
  if (!shape || texty.length || /\.message|String\(|`/.test((args ?? "").replace(CODES, "CODE"))) bad.push({ file, event, args, texty });
}
ok(`C-R1.13 PF-23m DW2 pass: each of the ${SITES.length} moved sites passes the caught error or ids only to logPort, never a text`, bad.length === 0, bad);
const fakeSite = 'catch (e) { logPort.error("x_failed", e, { id }); }', leakySite = 'catch (e) { logPort.warn("x_failed", { why: `${(e as Error).message}` }); }';
ok("C-R1.13 PF-23m DW2 fail (review m4): a text-like field is refused even without a template (`{ jobId, why }`, `{ note: why }`), an id field is not",
  textyFields('"y_failed", { jobId, why }').join() === "why" && textyFields('"y_failed", { note: why }').join() === "why" && textyFields('"y_failed", { jobId, exit: stub.code }').length === 0, [textyFields('"y_failed", { jobId, why }'), textyFields('"y_failed", { note: why }')]);
ok("C-R1.13 PF-23m DW2 fail: the site check refuses a logPort call that builds a text from the error", /^"[a-z_]+",\s*[a-z]\w*\s*(,\s*\{[^`]*\})?\s*$/s.test(callAt(fakeSite, "x_failed", "error")!.trim()) && /`|\.message/.test(callAt(leakySite, "x_failed", "warn")!), [fakeSite, leakySite]);

// The seeded person (de-identified, SA-11-37 Fixtures): a name, a passport-shaped number and an email.
const NAME = "Zelda Quixote", WORDS = ["Zelda", "Quixote"], PASSPORT = "W012345678", EMAIL = "zelda.q@example.test";
const SEEDED = `Sample ${NAME} ${PASSPORT} ${EMAIL}`;
const lines: string[] = [];
const was = useLog(new JsonLog((l) => { lines.push(l); }));
const clean = (ls: string[]) => ls.every((l) => ![...WORDS, PASSPORT, EMAIL].some((v) => l.includes(v)));
try {
  lines.length = 0;
  logPort.error("form_copy_failed", new Error(`No copy for ${SEEDED}`), { copyId: "copy_77" });
  logPort.error("case_firm_fill_failed", Object.assign(new Error(`new row violates check constraint "case_firm_check" for ${SEEDED}`), { code: "P2010" }), { at: "start", rule: "case_firm_check" });
  const e = lines.map((l) => JSON.parse(l) as Record<string, any>);
  ok("C-R1.13 PF-23m DW2 pass: a moved site's logPort.error line holds the event, the ids, the class and the code", e.length === 2 && e[0].event === "form_copy_failed" && e[0].copyId === "copy_77" && e[0].error?.errorName === "Error" && e[1].rule === "case_firm_check" && e[1].error?.code === "P2010", e);
  ok("C-R1.13 PF-23m DW2 pass: no captured line holds the seeded name, any word of it, the passport number or the email", clean(lines), lines);
  // Fail case: the old form of the same call (the error's text in the line) is caught by name only partly: the name stays.
  lines.length = 0;
  const oldCall = (text: string) => logPort.warn("console", { message: text });   // what patchConsole does with a text argument
  oldCall(`form copy copy_77: ${new Error(`No copy for ${SEEDED}`).message}`);
  ok("C-R1.13 PF-23m DW2 fail: the old call (the error's message in a text) leaks the name even after pattern redaction", lines.length === 1 && !clean(lines) && lines[0].includes(NAME) && !lines[0].includes(EMAIL), lines);

  // A real site: plainRunText (a run's message a person would read, with a server path and the seeded person).
  lines.length = 0;
  const shown = plainRunText(`ENOENT: /home/app/var/${NAME}.pdf for ${SEEDED}`, "run_42");
  ok("C-R1.13 PF-23m DW2 pass (plain-run-text.ts): the page gets plain words; the log line names the run (review m3) and the length only", shown !== null && !shown.includes(NAME) && lines.length === 1 && JSON.parse(lines[0]).event === "run_message_kept_from_page" && JSON.parse(lines[0]).runId === "run_42" && clean(lines), { shown, lines });
  // Review m2: the launcher's refusal is a fixed reason code, never its words.
  const reasons = ["guard: the inventory changed since it was admitted", "Anthropic API: account usage limit reached", `ENOENT: /home/app/${NAME}.pdf`, `refused for ${SEEDED}`, ""].map(launcherReason);
  ok("C-R1.13 PF-23m DW2 pass (review m2): launcherReason gives a code (guard, usage_limit, not_found, other, none), never the words", reasons.join() === "guard,usage_limit,not_found,other,none", reasons);

  // Real sites: the booking door's two warn lines (front-office/booking/service.ts afterCommit and refusedIsFinal).
  const warned: string[] = [];
  const svc = new BookingService({} as never, { warn: (m: string) => warned.push(m), jobs: { cancel: async () => { throw new Error(`queue refused ${SEEDED}`); } } } as never);
  svc["refusedIsFinal"](new MessageRefused(`not sent: ${SEEDED} is suppressed`), "bk_1");
  await svc["afterCommit"]({ booking: { id: "bk_1", firmId: "f_1" }, kind: "cancelled", oldSequence: 1 } as never).catch(() => undefined);
  ok("C-R1.13 PF-23m DW2 pass (booking/service.ts): the refused-email and after-commit warnings name the booking and the error's class, never the person", warned.length >= 2 && warned.every((w) => w.includes("bk_1")) && clean(warned) && warned.some((w) => w.includes("MessageRefused")), warned);
} finally { useLog(was); }

// --------------------------------------------------------------------------------------------- DW3 dbRuleOf
const pg = new Error(`new row for relation "case_stage" violates check constraint "case_firm_check"\nDETAIL:  Failing row contains (${SEEDED}).`);
ok("C-R1.13 PF-23m DW3 pass: dbRuleOf keeps the constraint's name from PostgreSQL's words and from Prisma's meta", dbRuleOf(pg) === "case_firm_check" && dbRuleOf(Object.assign(new Error("x"), { meta: { constraint: "fo_person_email_key" } })) === "fo_person_email_key", [dbRuleOf(pg)]);
ok("C-R1.13 PF-23m DW3 fail: a quoted value, a passport-shaped name or no rule gives nothing (never a value)",
  dbRuleOf(new Error(`value "${NAME}" violates nothing`)) === undefined && dbRuleOf(Object.assign(new Error("x"), { meta: { constraint: PASSPORT } })) === undefined && dbRuleOf(new Error(`check constraint "${EMAIL}"`)) === undefined && dbRuleOf("text") === undefined && dbRuleOf(null) === undefined,
  [dbRuleOf(new Error(`value "${NAME}" violates nothing`)), dbRuleOf(Object.assign(new Error("x"), { meta: { constraint: PASSPORT } }))]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
