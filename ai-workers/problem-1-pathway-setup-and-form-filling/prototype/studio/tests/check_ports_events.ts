// P-785 (2), step 1: the events contract is one file per owner module (ports/events/<module>.ts) and the old shared
// file, ports/events.ts, only re-exports. No database, no server, no model call (US$0).
//   A  ports/events.ts is frozen: only imports from and `export * from` the ten files of the split, the EVENT object made
//      of their spreads, and the EventName type. A new event, shape or module written there is refused, with the place
//      it goes instead.
//   B  every ports/events/*.ts imports only zod and files of its own folder, and exports at most one `<MODULE>_EVENT`
//      object (UPPER_SNAKE keys, lower-case dotted names such as "case.stage.changed" or "firm.trial-ending"); a
//      shapes-only file (no names) is allowed.
//   C  every event name and every key is unique across the folder (two modules can never write the same name).
//   D  backward compatible: the old path still exports every value it exported before the split, and EVENT holds the
//      same 43 names (ANCHOR below, frozen: nothing is ever added to it).
//   tsx studio/tests/check_ports_events.ts
//   tsx studio/tests/check_ports_events.ts --old-file <file>   rule A alone on that file (exit 1 when refused); the
//        fixture tests/fixtures/ports-events/old-file-with-a-new-event.ts.txt is the old file with one event added.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { z } from "zod";

const STUDIO = join(import.meta.dirname, ".."), OLD = join(STUDIO, "ports/events.ts"), DIR = join(STUDIO, "ports/events");
const FIXTURE = join(STUDIO, "tests/fixtures/ports-events/old-file-with-a-new-event.ts.txt");

/** The split's files and their name objects (22 Nov). Frozen: a new module's file is not listed anywhere. */
const SPLIT: Record<string, string> = {
  firms: "FIRM_EVENT", staff: "STAFF_EVENT", booking: "BOOKING_EVENT", complaints: "COMPLAINT_EVENT", support: "SUPPORT_EVENT",
  retainers: "RETAINER_EVENT", compliance: "COMPLIANCE_EVENT", sales: "SALES_EVENT", cases: "CASE_EVENT", "person-merge": "PERSON_MERGE_EVENT",
};
/** What ports/events.ts exported before the split (main 01841047d): EVENT's 43 names and the 28 other values. */
const ANCHOR_EVENT: Record<string, string> = {
  FIRM_CREATED: "firm.created", FIRM_ACTIVATED: "firm.activated", FIRM_SUBSCRIPTION_CHANGED: "firm.subscription_changed", FIRM_PAYMENT_HOLD: "firm.payment_hold",
  PLAN_CHANGED: "plan.changed", STAFF_ROLES_CHANGED: "staff.roles_changed", STAFF_DEACTIVATED: "staff.deactivated", STAFF_JOINED: "staff.joined",
  BOOKING_SCHEDULED: "booking.scheduled", BOOKING_RESCHEDULED: "booking.rescheduled", BOOKING_CANCELLED: "booking.cancelled", BOOKING_COMPLETED: "booking.completed",
  BOOKING_NO_SHOW: "booking.no_show", COMPLAINT_RECEIVED: "complaint.received", COMPLAINT_CLOSED: "complaint.closed", SUPPORT_TICKET_RAISED: "support.ticket_created",
  RETAINER_DRAFTED: "retainer.drafted", RETAINER_SENT: "retainer.sent", RETAINER_WITHDRAWN: "retainer.withdrawn", RETAINER_SIGNED_OFFLINE: "retainer.signed_offline",
  RETAINER_REQUEST_ENDED: "retainer.request_ended", IDENTITY_CHECKED: "identity.checked", CONFLICT_CHECKED: "conflict.checked", LEAD_CREATED: "lead.created",
  LEAD_TAKEN: "lead.taken", LEAD_CLOSED: "lead.closed", LEAD_REOPENED: "lead.reopened", LEAD_ENGAGED: "lead.engaged", PROSPECT_TYPE_CHANGED: "prospect.type_changed",
  PROSPECT_WON: "prospect.won", PROSPECT_STAGE_MOVED: "prospect.stage_moved", PROSPECT_LOST: "prospect.lost", PROSPECT_UNCONVERTED: "prospect.unconverted",
  CALL_LOGGED: "call.logged", NOTE_ADDED: "note.added", CASE_CLOSED: "case.closed", CASE_REOPENED: "case.reopened", CASE_MILESTONE_RECORDED: "case.milestone_recorded",
  CASE_MILESTONE_CANCELLED: "case.milestone_cancelled", CLIENT_CREATED: "client.created", CASE_OPENED: "case.opened", PERSON_MERGED: "person.merged", PERSON_UNMERGED: "person.unmerged",
};
const ANCHOR_VALUES = ["BookingEvent", "CaseClosedPayload", "CaseMilestonePayload", "CaseOpenedPayload", "CaseReopenedPayload", "ClientCreatedPayload", "ComplaintClosed",
  "ComplaintReceived", "ConflictCheckedPayload", "FirmCreated", "IdentityCheckedPayload", "LeadEventPayload", "PersonMergePayload", "PersonMerged", "PersonUnmerged",
  "ProspectEventPayload", "ProspectMovePayload", "ProspectWonPayload", "ProspectWonSubject", "RetainerEventPayload", "StaffDeactivated", "StaffEventPayload",
  "StaffJoinedPayload", "StaffRolesChanged", "SupportTicketRaised", "TimelineLine", "WON_DUPLICATES_MAX", "WonDuplicates"];

const WHERE = "a new event, its shape or a new module's names go in ports/events/<module>.ts (a new module or part adds its own file there) and are imported from that file; ports/events.ts only re-exports the files of the split (DEVELOPING.md, \"Events\")";

/** Rule A: what in this text is not a re-export of the split. Empty when the file is the frozen re-export file. */
export function oldFileFindings(text: string): string[] {
  const src = ts.createSourceFile("events.ts", text, ts.ScriptTarget.ES2023, true), out: string[] = [];
  const at = (n: ts.Node) => `line ${src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1}`;
  const said = (n: ts.Node) => n.getText(src).split("\n")[0].slice(0, 90);
  const splitPath = (n: ts.Expression | undefined) => { const m = n && ts.isStringLiteral(n) ? n.text.match(/^\.\/events\/([a-z-]+)\.ts$/) : null; return m && m[1] in SPLIT ? m[1] : null; };
  const imported = new Set<string>(), starred = new Set<string>(), spread: string[] = [];
  let events = 0, names = 0;
  for (const st of src.statements) {
    if (ts.isImportDeclaration(st)) {
      const mod = splitPath(st.moduleSpecifier), named = st.importClause?.namedBindings;
      const only = mod && !st.importClause?.name && named && ts.isNamedImports(named) && named.elements.length === 1 && !named.elements[0].propertyName && named.elements[0].name.text === SPLIT[mod];
      if (only) imported.add(mod); else out.push(`${at(st)}: an import that is not one of the split's files: ${said(st)}`);
    } else if (ts.isExportDeclaration(st)) {
      const mod = splitPath(st.moduleSpecifier);
      if (mod && !st.exportClause && !st.isTypeOnly) starred.add(mod); else out.push(`${at(st)}: an export that is not \`export * from\` one of the split's files: ${said(st)}`);
    } else if (ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && st.declarationList.declarations.length === 1 && ts.isIdentifier(st.declarationList.declarations[0].name) && st.declarationList.declarations[0].name.text === "EVENT") {
      events++;
      const decl = st.declarationList.declarations[0], whole = decl.initializer;
      // Exactly `export const EVENT = { ... } as const` (breaker M1): a `let`, a type annotation or any other type after
      // `as` would change what EVENT means to the type checker (a name only the types know, or no literal types at all).
      if (!(st.declarationList.flags & ts.NodeFlags.Const) || decl.type || !whole || !ts.isAsExpression(whole) || !ts.isConstTypeReference(whole.type)) {
        out.push(`${at(st)}: EVENT is not written \`export const EVENT = { ... } as const\` (no let, no type annotation, no other type after as): ${said(st)}`); continue;
      }
      const init = whole.expression;
      if (!ts.isObjectLiteralExpression(init)) { out.push(`${at(st)}: EVENT is not an object of the split's spreads`); continue; }
      for (const p of init.properties) {
        if (ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression) && Object.values(SPLIT).includes(p.expression.text)) spread.push(p.expression.text);
        else out.push(`${at(p)}: written in EVENT here: ${said(p)}`);
      }
    } else if (ts.isTypeAliasDeclaration(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && st.name.text === "EventName" && st.type.getText(src).replace(/\s+/g, "") === "(typeofEVENT)[keyoftypeofEVENT]") names++;
    else out.push(`${at(st)}: declared here: ${said(st)}`);
  }
  const want = Object.keys(SPLIT).sort().join(" ");
  if (!out.length) {
    if ([...imported].sort().join(" ") !== want || [...starred].sort().join(" ") !== want) out.push("a file of the split is no longer imported and re-exported (every earlier import must keep working)");
    if (events !== 1 || names !== 1 || [...spread].sort().join(" ") !== Object.values(SPLIT).sort().join(" ")) out.push("EVENT (once, the ten spreads) or EventName is missing or changed");
  }
  return out;
}

/** Every module a file reads, from its syntax (comments and strings are not imports): import and export-from
 *  declarations (a bare `import "x"` too), `import("x")` and `require("x")`. A computed specifier counts as foreign. */
export function importsOf(text: string): string[] {
  const src = ts.createSourceFile("m.ts", text, ts.ScriptTarget.ES2023, true), out: string[] = [];
  const spec = (e: ts.Expression | undefined) => (e && ts.isStringLiteralLike(e) ? e.text : "<computed>");
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) { if (n.moduleSpecifier) out.push(spec(n.moduleSpecifier)); }
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) out.push(spec(n.moduleReference.expression));
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) out.push(spec(n.arguments[0]));
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

/** Rules B and C on a folder of module files: findings, and every name found. */
export async function folderFindings(dir: string): Promise<{ findings: string[]; names: Map<string, string>; files: string[] }> {
  const findings: string[] = [], names = new Map<string, string>(), keys = new Map<string, string>();
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (!entry.isFile() || !/^[a-z][a-z0-9-]*\.ts$/.test(entry.name)) findings.push(`${entry.name}: only <module>.ts files (lower case, dashes) live in ports/events/`);
  for (const f of files) {
    const foreign = importsOf(readFileSync(join(dir, f), "utf8")).filter((s) => s !== "zod" && !/^\.\/[a-z0-9-]+\.ts$/.test(s));
    if (foreign.length) { findings.push(`${f}: imports ${foreign.join(", ")} (only zod and files of ports/events/)`); continue; }
    const mod = await import(`${pathToFileURL(join(dir, f)).href}?t=${process.pid}-${Math.random()}`) as Record<string, unknown>;
    const objects = Object.entries(mod).filter(([k, v]) => /_EVENT$/.test(k) && typeof v === "object" && v !== null && !(v instanceof z.ZodType));
    if (objects.length > 1) findings.push(`${f}: exports ${objects.length} objects named <MODULE>_EVENT (one file, one module: at most one holds its names)`);
    for (const [objectName, object] of objects) {
      if (!/^[A-Z][A-Z0-9_]*_EVENT$/.test(objectName) || typeof object !== "object" || object === null) { findings.push(`${f}: ${objectName} is not an object of names`); continue; }
      for (const sym of Object.getOwnPropertySymbols(object)) findings.push(`${f}: ${objectName} has a symbol key (${String(sym)}): names are plain keys`);
      for (const [k, v] of Object.entries(object)) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(k) || typeof v !== "string" || !/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/.test(v)) findings.push(`${f}: ${objectName}.${k} = ${JSON.stringify(v)} (keys are UPPER_SNAKE, names lower case with at least one dot)`);
        if (typeof v === "string") { if (names.has(v)) findings.push(`the event name "${v}" is in ${names.get(v)} and in ${f}: a name belongs to one module`); else names.set(v, f); }
        if (keys.has(k)) findings.push(`the key ${k} is in ${keys.get(k)} and in ${f}: a key is spelt once`); else keys.set(k, f);
      }
    }
  }
  return { findings, names, files };
}

const oldFileArg = process.argv.indexOf("--old-file");
if (oldFileArg > 0) {
  const file = process.argv[oldFileArg + 1];
  if (!file) { console.log("--old-file wants a file; nothing was checked"); process.exit(2); }
  const found = oldFileFindings(readFileSync(file, "utf8"));
  for (const f of found) console.log(`REFUSED  ${f}`);
  console.log(found.length ? `\n${file}: ${found.length} thing(s) that are not re-exports. ${WHERE}. A file written before the split (a branch from before 22 Nov) shows every old line here: keep main's ports/events.ts as it is and move only your new event and its shape to ports/events/<module>.ts (the module that writes it: firms, staff, booking, complaints, support, retainers, compliance, sales, cases, person-merge, or a new file). A name in an existing module's file shows in EVENT by itself; a name in a new module's file does not: import it from that file.` : `${file}: only re-exports`);
  process.exit(found.length ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const WORK = join(STUDIO, "var", `ports-events-check-${process.pid}`);
try {
  // A: the old file, and what it refuses.
  const oldText = readFileSync(OLD, "utf8"), oldFound = oldFileFindings(oldText);
  ok("P-785 step 1 A pass: ports/events.ts only re-exports the split's files (frozen)", oldFound.length === 0, oldFound);
  if (oldFound.length) console.log(`      ${WHERE}`);
  const refused = (what: string, text: string, saying: RegExp) => { const f = oldFileFindings(text); ok(`P-785 step 1 A fail: ${what} is refused`, f.length > 0 && f.some((l) => saying.test(l)), f); };
  refused("the fixture (the old file with one event added inside EVENT)", readFileSync(FIXTURE, "utf8"), /written in EVENT here: INVOICE_ISSUED/);
  refused("a new shape declared in the old file", `${oldText}\nexport const InvoiceIssued = 1;\n`, /declared here: export const InvoiceIssued/);
  refused("a new module spread into EVENT", oldText.replace("  ...FIRM_EVENT,", "  ...FIRM_EVENT,\n  ...INVOICE_EVENT,"), /written in EVENT here: \.\.\.INVOICE_EVENT/);
  refused("a new module re-exported from the old file", `${oldText}export * from "./events/invoices.ts";\n`, /not `export \* from` one of the split's files/);
  refused("an import from outside the split", `import { z } from "zod";\n${oldText}`, /an import that is not one of the split's files/);
  const spreads = Object.values(SPLIT).map((c) => `typeof ${c}`).join(" & ");
  refused("EVENT retyped after `as` with a name only the types know", oldText.replace("} as const;", `} as ${spreads} & { readonly INVOICE_ISSUED: "invoice.issued" };`), /EVENT is not written `export const EVENT = \{ \.\.\. \} as const`/);
  refused("EVENT retyped as Record<string, string> (no literal types)", oldText.replace("} as const;", "} as Record<string, string>;"), /EVENT is not written/);
  refused("EVENT with a type annotation", oldText.replace("export const EVENT = {", "export const EVENT: Record<string, string> = {"), /EVENT is not written/);
  refused("EVENT made a let", oldText.replace("export const EVENT = {", "export let EVENT = {"), /EVENT is not written/);
  refused("EVENT with no as const", oldText.replace("} as const;", "};"), /EVENT is not written/);
  refused("a split file dropped from the re-exports", oldText.replace('export * from "./events/booking.ts";\n', ""), /no longer imported and re-exported/);

  // B, C: the folder as it is.
  const tree = await folderFindings(DIR);
  ok(`P-785 step 1 B, C pass: ${tree.files.length} module files, ${tree.names.size} event names, each file one <MODULE>_EVENT object, zod only, every name and key once`, tree.findings.length === 0 && Object.keys(SPLIT).every((m) => tree.files.includes(`${m}.ts`)), tree.findings);

  // D: the old path, as before the split.
  const anchor = (old: Record<string, unknown>) => {
    const event = (old.EVENT ?? {}) as Record<string, string>;
    return { lost: Object.entries(ANCHOR_EVENT).filter(([k, v]) => event[k] !== v).map(([k]) => k), gone: ANCHOR_VALUES.filter((k) => old[k] === undefined), event };
  };
  const now = anchor(await import(pathToFileURL(OLD).href) as Record<string, unknown>);
  ok("P-785 step 1 D pass: EVENT from ports/events.ts still holds the 43 names it held before the split, same keys and values", now.lost.length === 0 && Object.keys(ANCHOR_EVENT).length === 43, now.lost);
  ok("P-785 step 1 D pass: the 28 other values the old path exported (shapes, WON_DUPLICATES_MAX) are still exported from it", now.gone.length === 0 && ANCHOR_VALUES.length === 28, now.gone);
  const reach = [...tree.names].filter(([name, f]) => f.replace(/\.ts$/, "") in SPLIT && !Object.values(now.event).includes(name)).map(([name]) => name);
  ok("P-785 step 1 D pass: a name in one of the split's files is in EVENT too (an event added to its module's file needs no edit here)", reach.length === 0, reach);

  // A copy of ports/events.ts and its folder, to change on purpose. PROBE is a name no module can ever write (asserted
  // absent first), so a real new event added later never collides with this check's own examples (review M1).
  const PROBE = "p785probe.never_real", PROBE2 = "p785probe.never_real_two";
  ok("P-785 step 1 pass: the probe names are in no module file", !tree.names.has(PROBE) && !tree.names.has(PROBE2), [...tree.names.keys()].filter((n) => n.startsWith("p785probe")));
  const ports = join(WORK, "ports"), copy = join(ports, "events");
  const fresh = () => {
    rmSync(ports, { recursive: true, force: true });
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(ports, "events.ts"), oldText);
    for (const f of tree.files) writeFileSync(join(copy, f), readFileSync(join(DIR, f)));
  };
  const probeFile = (obj: string, key: string, name: string) => `import { z } from "zod";\nexport const ${obj} = { ${key}: "${name}" } as const;\nexport const Probe = z.strictObject({ type: z.literal(${obj}.${key}) });\n`;

  // Before and after: a new event needs no edit to a shared file.
  fresh();
  writeFileSync(join(copy, "p785-probe.ts"), probeFile("P785_PROBE_EVENT", "P785_PROBE", PROBE));
  const added = await folderFindings(copy);
  ok("P-785 step 1 pass (after): a new module's events are one new file in ports/events/, no other file edited", added.findings.length === 0 && added.names.get(PROBE) === "p785-probe.ts" && oldFileFindings(readFileSync(join(ports, "events.ts"), "utf8")).length === 0, added.findings);
  writeFileSync(join(copy, "p785-other.ts"), `export const P785_OTHER_EVENT = { P785_OTHER: "${PROBE}" } as const;\n`);
  const twice = await folderFindings(copy);
  ok("P-785 step 1 C fail: the same event name in two module files is refused, naming both", twice.findings.some((l) => l.includes(`"${PROBE}" is in p785-other.ts and in p785-probe.ts`)), twice.findings);
  writeFileSync(join(copy, "p785-other.ts"), `export const P785_OTHER_EVENT = { P785_PROBE: "${PROBE2}" } as const;\n`);
  const sameKey = await folderFindings(copy);
  ok("P-785 step 1 C fail: the same key with a different name in two module files is refused", sameKey.findings.some((l) => /the key P785_PROBE is in p785-other\.ts and in p785-probe\.ts/.test(l)), sameKey.findings);

  // B: what a module file may be.
  const folderRefuses = async (what: string, file: string, text: string, saying: RegExp) => {
    fresh(); writeFileSync(join(copy, file), text);
    const f = await folderFindings(copy).catch((e: unknown) => ({ findings: [`CRASH ${String(e)}`] }));
    ok(`P-785 step 1 B fail: ${what} is refused`, f.findings.some((l) => saying.test(l)) && !f.findings.some((l) => l.startsWith("CRASH")), f.findings);
  };
  await folderRefuses("a module file that imports the old file", "p785-other.ts", `import { EVENT } from "../events.ts";\nexport const P785_OTHER_EVENT = { P785_OTHER: "${PROBE2}" } as const;\nexport const again = EVENT;\n`, /p785-other\.ts: imports \.\.\/events\.ts/);
  await folderRefuses("a bare import from outside the folder (no crash)", "p785-other.ts", `import "../matching.ts";\nexport const P785_OTHER_EVENT = { P785_OTHER: "${PROBE2}" } as const;\n`, /p785-other\.ts: imports \.\.\/matching\.ts/);
  await folderRefuses("a key or a name spelt another way", "p785-other.ts", `export const P785_OTHER_EVENT = { p785Other: "P785Other" } as const;\n`, /P785_OTHER_EVENT\.p785Other/);
  await folderRefuses("a file with two <MODULE>_EVENT objects", "p785-other.ts", `export const P785_A_EVENT = { P785_A: "${PROBE2}" } as const;\nexport const P785_B_EVENT = { P785_B: "p785probe.b" } as const;\n`, /p785-other\.ts: exports 2 objects/);
  await folderRefuses("a file whose name is not <module>.ts", "P785_Other.ts", `export const P785_OTHER_EVENT = { P785_OTHER: "${PROBE2}" } as const;\n`, /P785_Other\.ts: only <module>\.ts files/);
  const allowed = async (what: string, file: string, text: string) => {
    fresh(); writeFileSync(join(copy, file), text);
    const f = await folderFindings(copy);
    ok(`P-785 step 1 B pass: ${what}`, f.findings.length === 0, f.findings);
  };
  const allowedKeep = async (what: string, file: string, text: string) => {
    writeFileSync(join(copy, file), text);
    const f = await folderFindings(copy);
    ok(`P-785 step 1 B pass: ${what}`, f.findings.length === 0, f.findings);
  };
  await folderRefuses("a symbol key in a names object", "p785-other.ts", `export const P785_OTHER_EVENT = { P785_OTHER: "${PROBE2}", [Symbol("x")]: "${PROBE}" } as const;\n`, /P785_OTHER_EVENT has a symbol key/);
  await allowed("a number constant whose name ends in _EVENT is not a second names object", "p785-other.ts", `export const P785_OTHER_EVENT = { P785_OTHER: "${PROBE2}" } as const;\nexport const MAX_LINES_PER_EVENT = 50;\n`);
  await allowed("a name with three parts or a dash, as the requirements write them (case.stage.changed, firm.trial-ending)", "p785-other.ts", `export const P785_OTHER_EVENT = { P785_A: "p785probe.stage.changed", P785_B: "p785probe.trial-ending" } as const;\n`);
  await allowed("a doc comment naming another file is not an import", "p785-other.ts", `// Read from "ports/matching.ts" and from "../events.ts" (text only).\nexport const P785_OTHER_EVENT = { P785_OTHER: "${PROBE2}" } as const;\n`);
  fresh(); writeFileSync(join(copy, "p785-probe.ts"), probeFile("P785_PROBE_EVENT", "P785_PROBE", PROBE));
  { const f0 = join(copy, "p785-shapes.ts"); writeFileSync(f0, ""); }
  await allowedKeep("a shapes-only file (no names) importing a sibling", "p785-shapes.ts", `import { z } from "zod";\nimport { P785_PROBE_EVENT } from "./p785-probe.ts";\nexport const P785Shape = z.strictObject({ type: z.literal(P785_PROBE_EVENT.P785_PROBE) });\n`);

  // D fail: a value or a name removed from a split file is caught on the old path.
  fresh();
  const sales = join(copy, "sales.ts");
  writeFileSync(sales, readFileSync(sales, "utf8").replace(/\n  LEAD_REOPENED: "lead\.reopened",/, "").replace("export const TimelineLine =", "const TimelineLine ="));
  const broken = anchor(await import(`${pathToFileURL(join(ports, "events.ts")).href}?t=${process.pid}`) as Record<string, unknown>);
  ok("P-785 step 1 D fail: a name or a value removed from a split file is caught on the old path, named", broken.lost.includes("LEAD_REOPENED") && broken.gone.includes("TimelineLine"), broken);
} finally { rmSync(WORK, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
