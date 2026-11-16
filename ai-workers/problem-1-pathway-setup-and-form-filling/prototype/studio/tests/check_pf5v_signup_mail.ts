// PF-5v (QA-481, QA-484; R1.19, R1.100): the sign-up's verification email reaches the demo inbox through MailPort, and
// an empty sign-up answers in plain words on each field. DW2 needs no database (the fields are checked before any read).
//   tsx studio/tests/check_pf5v_signup_mail.ts
import type { PrismaClient } from "@prisma/client";
import { fakeBilling } from "../ports/billing.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeMail } from "../ports/mail.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { LocalSignUp } from "../api/src/platform/firms/signup-identity.ts";
import { EMPTY, FirmSignUp } from "../api/src/platform/firms/signup.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const errorsOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { const r = (e as { getResponse?: () => { errors?: string[] } }).getResponse?.(); return r?.errors ?? null; } };

const clock = new FakeClock();
const door = new FirmSignUp(null as unknown as PrismaClient, { audit: auditEvent, billing: fakeBilling(), identity: new LocalSignUp(() => clock.now()), mail: fakeMail(), clock, appUrl: "http://localhost:4400" });
const VALIDATOR = /Invalid input|expected|received|Unrecognized|Too small|Too big/i;

// DW2 pass: {} names all three fields in plain words; blank answers count as empty.
const empty = await errorsOf(() => door.signUp({}, "10.0.0.1"));
ok("PF-5v DW2 pass: {} names the work email, the password and the firm's name in plain words", !!empty && [EMPTY.email, EMPTY.password, EMPTY.firmName].every((w) => empty.includes(w)) && !empty.some((e) => VALIDATOR.test(e)), empty);
const blank = await errorsOf(() => door.signUp({ email: "  ", password: "", firmName: "   ", countryCode: "CA" }, "10.0.0.2"));
ok("PF-5v DW2 pass: blank answers get the same words, one per field", JSON.stringify(blank) === JSON.stringify([EMPTY.email, EMPTY.password, EMPTY.firmName]), blank);
const typed = await errorsOf(() => door.signUp({ email: 5, password: true, firmName: [], countryCode: "CA", extra: 1, period: "WEEKLY" }, "10.0.0.3"));
ok("PF-5v DW2 pass: a wrong type or an unknown key never answers in the validator's words", !!typed && typed.length > 0 && !typed.some((e) => VALIDATOR.test(e)), typed);
// DW2 fail: a bad email and other refusals keep the door's existing words (never the empty words).
const bad = await errorsOf(() => door.signUp({ email: "not-an-email", password: "short", firmName: "A", countryCode: "US" }, "10.0.0.4"));
ok("PF-5v DW2 fail: a bad email keeps its words; a short password, a 1-letter firm and a non-CA country keep theirs",
  !!bad && bad.includes("password: at least 12 characters") && bad.includes("firmName: 2 to 120 characters") && bad.includes("countryCode: CA only for now") && !bad.some((e) => Object.values(EMPTY).includes(e as never)), bad);
const badEmail = await errorsOf(() => door.signUp({ email: "not-an-email", password: "correct horse battery staple 77", firmName: "Maple Law", countryCode: "CA" }, "10.0.0.5"));
ok("PF-5v DW2 fail: a bad email answers \"give your work email\", not the empty words", JSON.stringify(badEmail) === JSON.stringify(["email: give your work email (name@example.com)"]), badEmail);
const spaces = await errorsOf(() => door.signUp({ email: "a@maple.example.com", password: " ".repeat(14), firmName: "Maple Law", countryCode: "CA" }, "10.0.0.6"));
ok("PF-5v DW2 fail: a password of spaces keeps \"not only spaces\"", JSON.stringify(spaces) === JSON.stringify(["password: not only spaces"]), spaces);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
