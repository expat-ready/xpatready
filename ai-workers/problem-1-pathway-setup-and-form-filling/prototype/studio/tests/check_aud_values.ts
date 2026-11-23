// R1.8 (QA-594; SA-11-2 before/after snapshot; AG-13-43 and P-687: the firm's Activity log shows before and after values in
// full, personal data included): the port's before and after, and a sweep of every platform and front-office audit write
// in api/src. Each `audit….record(tx, { … })` that is not a case line (it names no workspaceId) passes both `before` and
// `after` in its object (null for the side that does not exist: a create has no before, a delete no after); a helper that
// builds the object passes its own caller's values on. A pass and a fail per rule. No server, no database (US$0).
//   tsx studio/tests/check_aud_values.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { AuditEntry, AuditValues, flattenValues } from "../ports/audit.ts";
import { changesOf } from "../api/src/platform/audit/firm-read/render.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 20000)}` : ""}`); };
const FIRM = "0c0c0c0c-0000-4000-8000-0000000000a1";
const entry = (o: Partial<AuditEntry> = {}): AuditEntry => ({ firmId: FIRM, actor: "system:check", action: "fo.person.phone_edited", entity: "fo_person", entityKey: "p-1", summary: "Phone changed.", ...o });

// ------------------------------------------------------------------------------------------- the port's values
ok("pass: personal values in full are accepted in before and after (a phone number, an email address, a long address; P-687)",
  AuditEntry.safeParse(entry({ before: { phone: "+1 416 555 0100", email: "client.a@example.com" }, after: { phone: "+1 416 555 0199", address: "x".repeat(3000) } })).success);
ok("fail: the same email address in detail is still refused (detail stays ids only)", !AuditEntry.safeParse(entry({ detail: { email: "client.a@example.com" } })).success);
ok("fail: a secret is never stored: a password, a token, a hash or a one-time code in before or after is refused",
  ["password", "resetToken", "passwordHash", "otp", "apiKey", "client_secret", "pwd", "credential", "bearer", "sessionId", "inviteLink", "magicLink", "resetUrl", "jwt", "cookie"].every((k) => !AuditEntry.safeParse(entry({ after: { [k]: "x" } })).success && !AuditValues.safeParse({ [k]: "x" }).success));
ok("fail: a value longer than 4000 characters, a nested object, or 61 fields is refused",
  !AuditValues.safeParse({ a: "x".repeat(4001) }).success && !AuditValues.safeParse({ a: { b: 1 } }).success && !AuditValues.safeParse(Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`f${i}`, i]))).success);
ok("fail: a `<field>_before` or `<field>_after` key in detail is refused (before and after have one place)", !AuditEntry.safeParse(entry({ detail: { phone_before: "1" } })).success && !AuditEntry.safeParse(entry({ detail: { phone_after: "1" } })).success);

// ------------------------------------------------------------------------------------------- one shape, read by AUD-4
const change = flattenValues({ phone: "+1 416 555 0100", ownerStaffId: "s-1" }, { phone: "+1 416 555 0199", ownerStaffId: "s-1" });
ok("pass: a change keeps only the fields that changed, as <field>_before and <field>_after", JSON.stringify(change) === JSON.stringify({ phone_before: "+1 416 555 0100", phone_after: "+1 416 555 0199" }), change);
const words = changesOf({ foPersonId: "p-1", ...change }).map((c) => c.words);
ok("pass: AUD-4's reader (changesOf) shows it as \"phone: old → new\"", words.join("|") === "phone: +1 416 555 0100 → +1 416 555 0199", words);
const created = flattenValues(null, { name: "Client A", value: 1200 }), removed = flattenValues({ name: "Office 2" }, null);
ok("pass: a create gives lone _after values (an addition), a delete lone _before values (a removal), each read by changesOf",
  JSON.stringify(created) === JSON.stringify({ name_after: "Client A", value_after: 1200 }) && JSON.stringify(removed) === JSON.stringify({ name_before: "Office 2" })
  && changesOf(created).map((c) => c.words).join("|") === "name: (none) → Client A|value: (none) → 1200" && changesOf(removed)[0]?.words === "name: Office 2 → (none)", { created, removed });
ok("fail: a field set to empty is shown, never dropped (null → value, value → null)", JSON.stringify(flattenValues({ phone: null }, { phone: "1" })) === JSON.stringify({ phone_before: null, phone_after: "1" }) && JSON.stringify(flattenValues({ phone: "1" }, { phone: null })) === JSON.stringify({ phone_before: "1", phone_after: null }));

// ------------------------------------------------------------------------------------------- a case line's case (QA-595)
// Breaker M1 on #2527: a case line's firm is its case's, so only a case entity is read for its case; a configuration line
// whose typed words say "case bbbbbbbb" never takes that case (nor its firm). A stand-in db answers one case for any range.
{
  const { caseIdOf } = await import("../api/src/core.ts");
  const WS = "0c0c0c0c-0000-4000-8000-0000000000ee", ID = "bbbbbbbb-0000-4000-8000-000000000001";
  const db = { case: { findMany: async () => [{ id: ID }] } } as never;
  ok("pass (QA-595): a case entity's line names its case by its words (\"… on case bbbbbbbb\")", (await caseIdOf(db, WS, "case document", null, "uploaded a passport on case bbbbbbbb")) === ID);
  ok("fail (breaker M1): a configuration line (a field retired, a form role, a note) whose words say \"case bbbbbbbb\" names no case, so it never lands on that case's firm",
    (await caseIdOf(db, WS, "field", "applicant.x", "retired: see case bbbbbbbb")) === undefined && (await caseIdOf(db, WS, "form", "imm5257", "proposed role (reason: case bbbbbbbb)")) === undefined);
}

// ------------------------------------------------------------------------------------------- the sweep
const API = join(import.meta.dirname, "..", "api", "src");
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? files(join(d, x.name)) : x.name.endsWith(".ts") && !x.name.endsWith(".test.ts") ? [join(d, x.name)] : []));
/** Every AuditPort write in `text` that is not a case line and lacks `before` or `after` in its object. */
function missing(f: string, text: string): string[] {
  const src = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true), out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "record" && /audit\w*$/i.test(n.expression.expression.getText(src)) && n.arguments.length === 2) {
      const where = `${f.startsWith(API) ? f.slice(API.length + 1) : f}:${src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1}`;
      const arg = n.arguments[1];
      if (!ts.isObjectLiteralExpression(arg)) { if (!/audit-event\.ts$/.test(f)) out.push(`${where} (an audit write whose object the sweep cannot read)`); }
      else {
        const names = new Set(arg.properties.map((p) => p.name?.getText(src)).filter(Boolean));
        if (!names.has("workspaceId") && (!names.has("before") || !names.has("after"))) out.push(`${where} (no ${!names.has("before") ? "before" : "after"})`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}
ok("sweep pass (made-up source): a write with before and after, and a case line (workspaceId), are not listed",
  missing("x.ts", "await audit.record(tx, { firmId, entity: \"fo_x\", before: null, after: { a } }); await auditEvent.record(tx, { workspaceId, entity: \"case\" });").length === 0);
ok("sweep fail (made-up source): a write with no after, one with neither, and one whose object it cannot read are listed",
  missing("x.ts", "await this.ports.audit.record(tx, { firmId, before: {} }); await this.audit.record(tx, { firmId }); await audit.record(tx, line);").length === 3);
const all = files(API).flatMap((f) => missing(f, readFileSync(f, "utf8")));
ok("sweep: every platform and front-office audit write in api/src passes before and after (QA-594)", all.length === 0, all);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
