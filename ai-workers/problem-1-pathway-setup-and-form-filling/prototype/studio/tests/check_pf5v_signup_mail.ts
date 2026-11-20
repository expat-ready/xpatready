// PF-5v part 1 (QA-484; R1.19, R1.100's sign-up door): an empty sign-up answers in plain words on each field, and no
// validator text reaches an answer. DW2 needs no database (the fields are checked before any read).
// Part 2 (QA-481, DW1, DW3; after PF-19p): the local stand-in's verification email goes through the MailPort it is given
// as one platform account email (no firm), keyed by its registration; the running app's sign-up ports pass the app's
// MailPort to both the stand-in and the door. On a running copy: tests/journeys/j_100.ts W2.
//   tsx studio/tests/check_pf5v_signup_mail.ts
import type { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fakeBilling } from "../ports/billing.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeMail } from "../ports/mail.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { runtimeSignUpPorts } from "../api/src/platform/firms/runtime-ports.ts";
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
ok("PF-5v DW2 pass: an unknown key is named as not a field of this form; a wrong type of email, password or firm name answers as empty",
  !!typed && typed.includes("extra: not a field of this form") && [EMPTY.email, EMPTY.password, EMPTY.firmName].every((w) => typed.includes(w)) && typed.includes("period: check this answer"), typed);
// DW2 fail: a bad email and other refusals keep the door's existing words (never the empty words).
const bad = await errorsOf(() => door.signUp({ email: "not-an-email", password: "short", firmName: "A", countryCode: "US" }, "10.0.0.4"));
ok("PF-5v DW2 fail: a short password, a 1-letter firm and a non-CA country keep their words (never the empty words)",
  !!bad && bad.includes("password: at least 12 characters") && bad.includes("firmName: 2 to 120 characters") && bad.includes("countryCode: CA only for now") && !bad.some((e) => Object.values(EMPTY).includes(e as never)), bad);
const badEmail = await errorsOf(() => door.signUp({ email: "not-an-email", password: "correct horse battery staple 77", firmName: "Maple Law", countryCode: "CA" }, "10.0.0.5"));
ok("PF-5v DW2 fail: a bad email answers \"give your work email\", not the empty words", JSON.stringify(badEmail) === JSON.stringify(["email: give your work email (name@example.com)"]), badEmail);
const spaces = await errorsOf(() => door.signUp({ email: "a@maple.example.com", password: " ".repeat(14), firmName: "Maple Law", countryCode: "CA" }, "10.0.0.6"));
ok("PF-5v DW2 fail: a password of spaces keeps \"not only spaces\"", JSON.stringify(spaces) === JSON.stringify(["password: not only spaces"]), spaces);

// Part 2, DW1 pass: given a MailPort, the stand-in sends its verification email through it, once, as a platform account email.
{
  const mail = fakeMail(), id = new LocalSignUp(() => clock.now(), mail);
  const { subject } = await id.register({ email: "owner@maple.example.com", password: "correct horse battery staple 77", firmName: "Maple Law", link: (c) => `http://localhost:4400/sign-up/verify#token=t&code=${c}` });
  const m = mail.sent[0] as (typeof mail.sent)[number] & { platformAccount?: true; firmId?: string };
  const code = m?.text.match(/verification code is (\d{6})\./)?.[1];
  ok("PF-5v part 2 DW1 pass (QA-481): the verification email goes through MailPort once, to the person, transactional, with no firm (a platform account email)", mail.sent.length === 1 && m.to === "owner@maple.example.com" && m.class === "TRANSACTIONAL" && m.platformAccount === true && m.firmId === undefined && m.idempotencyKey === `signup:${subject}`, mail.sent);
  ok("PF-5v part 2 DW1 pass: the code it carries is the one the provider confirms; the password never appears in it", !!code && (await id.confirm({ subject, code })) && !m.text.includes("correct horse"), m?.text);
  // DW1 fail: without a MailPort (a unit test's stand-in) nothing is sent; the email is kept in memory only, as before.
  const quiet = new LocalSignUp(() => clock.now());
  await quiet.register({ email: "x@maple.example.com", password: "correct horse battery staple 77", firmName: "Maple Law", link: () => "l" });
  ok("PF-5v part 2 DW1 fail: a stand-in with no MailPort keeps the email in memory only", quiet.sent.length === 1);
}
// Part 2, DW3: the running app's sign-up ports give the app's MailPort to the door and to the stand-in (never fakeMail).
{
  const mail = fakeMail();
  const ports = runtimeSignUpPorts({ environment: "local", stripe: { secretKey: null, webhookSecret: null } }, { identity: "local", environment: "local", cognito: { userPoolId: null, clientId: null, mfaRequired: true }, localSecret: null }, {}, mail);
  await ports.identity.register({ email: "p@maple.example.com", password: "correct horse battery staple 77", firmName: "Maple Law", link: () => "l" });
  ok("PF-5v part 2 DW3 pass: runtimeSignUpPorts passes the given MailPort to the door and the stand-in", ports.mail === mail && mail.sent.length === 1);
  const other = fakeMail(), defaults = runtimeSignUpPorts({ environment: "local", stripe: { secretKey: null, webhookSecret: null } }, { identity: "local", environment: "local", cognito: { userPoolId: null, clientId: null, mfaRequired: true }, localSecret: null }, {});
  await defaults.identity.register({ email: "q@maple.example.com", password: "correct horse battery staple 77", firmName: "Maple Law", link: () => "l" });
  ok("PF-5v part 2 DW3 fail: with no MailPort given, the ports fall back to their own fakeMail, which is not the app's (so the feature must pass MESSAGES_MAIL, checked below)", other.sent.length === 0 && defaults.mail !== mail && (defaults.mail as ReturnType<typeof fakeMail>).sent.length === 1 && mail.sent.length === 1);
}
ok("PF-5v part 2 DW3 pass: the app's feature binds the sign-up ports to MESSAGES_MAIL (MailPort over MessagePort)", /inject:\s*\[MESSAGES_MAIL\]/.test(readFileSync(new URL("../api/src/features/platform-firms.ts", import.meta.url), "utf8")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
