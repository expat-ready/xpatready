// PF-19r part 3 (R1.47 one email layout, R1.49 the gate on every path; gap G4, QA-495): every email send call in the
// app's code is listed here and goes through MessagePort, so each gets `layout()` (ports/messages.ts: the firm's name on
// top, the body, "Sent by …"), the consent gate, the daily cap and the outbox. The suite reads every file under api/src,
// finds each send call (a MailPort send, `mailIn`, a direct MessagePort send, a `demo_message` write, a raw transport, an
// email kept in memory), and fails when a file holds a send call the table below does not classify (a new sender must be
// classified: through MessagePort, or named as an open gap with its owner). Then it loads the real feature modules and
// checks each sender's port is bound to the app's MESSAGES_MAIL (MailPort over MessagePort), never fakeMail or LocalMail,
// calling the factories with a stand-in to see the mail they return is the one given. Each check has a fail: the same
// checker run on a changed copy of the code (a new unlisted sender, a stand-in bound in a feature, an unguarded demo copy,
// MAIL_PORT on LocalMail, and nine send shapes a name-based scan misses: review M2) reports it. Known limit: the scan reads
// text, not types; a file that holds a sender under no port name at all (an untyped object with a .send) is not seen
// (the TypeScript compiler could follow types; not used, to keep this a 4-second check). No database, no server, no model call, nothing leaves the machine (US$0).
//   tsx studio/tests/check_pf19r_every_sender.ts
import "reflect-metadata";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const STUDIO = join(import.meta.dirname, ".."), API = join(STUDIO, "api", "src");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 900)}` : ""}`); };

// ------------------------------------------------------------------------------------------------ what a send call is
/** Each kind of line that sends (or keeps) an email. Comment lines are skipped. */
const KINDS = {
  mailSend: /\b(?:mail|\.mail)\??\.send(?:In)?\(/,                          // a MailPort's send (this.mail, this.ports.mail, p.mail, …)
  mailIn: /\bmailIn\(/,                                                      // MailPort in the caller's transaction (send/mail.ts)
  messagePort: /\b(?:messages|msg|this\.msg|this\.messages|this\.d\.messages|this\.d\.msg)\.send\(/,   // MessagePort itself
  demoCopy: /\bdemoMessage\.(?:create|createMany|upsert)\(/,                 // the case side's demo inbox (SI-20)
  rawTransport: /nodemailer|createTransport\(|sendMail\(|Send(?:Raw)?EmailCommand\b/,
  keptInMemory: /\.push\(\{\s*to:/,                                          // an email kept in an array instead of sent
} as const;
type Kind = keyof typeof KINDS | "anySend";

/** MessagePort's own implementation: the send path every other sender goes through (not a sender of its own). */
const MESSAGEPORT_ITSELF = ["platform/messages/send/", "platform/messages/channels/"];

/** How each file's send calls reach MessagePort. `counts` is exact: one more or one less send call fails the check, so
 *  a new sender is classified by the PR that adds it. `route` says how; `open` names a gap with its owner (R1.47 stays
 *  Partial while any entry is open). */
type Entry = { counts: Partial<Record<Kind, number>>; route: string; open?: string };
const SENDERS: Record<string, Entry> = {
  "platform/identity/service.ts": { counts: { mailSend: 1, anySend: 1 }, route: "staff invitation: MAIL_PORT, bound useExisting MESSAGES_MAIL (features/platform-staff-read.ts; PF-19r part 1)" },
  "platform/identity/session/service.ts": { counts: { mailIn: 1 }, route: "two-step reset notice: MAIL_PORT (MESSAGES_MAIL) in the caller's transaction (PF-19r part 1)" },
  "platform/identity/session/email-sender.ts": { counts: { mailSend: 1, anySend: 1 }, route: "the identity provider's code emails: the MailPort its caller gives (no caller in api/src; PF-19r part 1 tests it over MessagesMail). Not verified: the deployed function's wiring" },
  "platform/complaints/complaints.ts": { counts: { mailIn: 1 }, route: "complaint reminder: COMPLAINT_PORTS.mail = MESSAGES_MAIL (features/platform-complaints.ts; PF-19r part 1)" },
  "client-money/card/account.ts": { counts: { mailIn: 1 }, route: "payment account break email to each Owner: MAIL_PORT (MESSAGES_MAIL) in the webhook's transaction, sent after commit (features/client-money-card.ts; FO-7c part 1)" },
  "platform/support/support.ts": { counts: { mailSend: 1, anySend: 1 }, route: "support ticket mail: MAIL_PORT (MESSAGES_MAIL) (features/platform-support.ts)" },
  "platform/entitlements/storage.ts": { counts: { mailSend: 2, anySend: 2 }, route: "storage-over emails: MAIL_PORT (MESSAGES_MAIL) (features/platform-entitlements.ts; PF-15 part 1a)" },
  "platform/entitlements/limit-changes.ts": { counts: { mailSend: 1, anySend: 1 }, route: "live-plan removal notice: the MailPort its caller gives (no caller in api/src: no route until PF-4s)" },
  "front-office/signing/service.ts": { counts: { mailSend: 2, anySend: 3 }, route: "\"Your signed agreement\" and \"Agreement withdrawn\" (QA-770, FO-5d (2)): signingMail() = MESSAGES_MAIL, set by features/front-office-signing.ts (FO-6 part 3); its other .send( is SigningPort's (the envelope, no email)" },
  "front-office/signing/any-document/completion.ts": { counts: { mailSend: 1, anySend: 1 }, route: "\"Your signed document\": signingMail() = MESSAGES_MAIL, set by features/front-office-signing.ts (FO-6d part 2)" },
  "front-office/signing/link-mail.ts": { counts: { mailSend: 2, anySend: 2 }, route: "\"Please sign\" (the client's signing link) and the door's one-time code (part 4b): signingMail() = MESSAGES_MAIL, set by features/front-office-signing.ts (FO-6 part 4a)" },
  "front-office/signing/handlers.ts": { counts: {}, route: "holds the MailPort the signing feature sets (MESSAGES_MAIL) and the SigningPort; sends nothing (FO-6 part 3)" },
  "platform/billing/exit-notices.ts": { counts: { mailSend: 1, anySend: 1 }, route: "payment-hold notice and deletion warnings: MESSAGES_MAIL (features/platform-billing-exit.ts; PF-5 part 4)" },
  "front-office/booking/service.ts": { counts: { mailSend: 3, anySend: 3 }, route: "booking mail: BOOKING_PORTS.mail = MESSAGES_MAIL (features/front-office-booking.ts; PF-19b)" },
  "front-office/booking/consultation-agreement/service.ts": { counts: { mailSend: 4, anySend: 8 }, route: "consultation agreement mail (the client's link, the 24 h reminder, the one-time code, the signed copy): CONSULTATION_AGREEMENT_PORTS.mail = MESSAGES_MAIL (features/front-office-consultation-agreement.ts; FO-3c). Its other 4 .send( are SigningPort's send and the service's own send() of an agreement (from onBookingEvent twice: a new booking, and a reschedule after an ended agreement; and the catch-up), never mail" },
  "platform/firms/signup.ts": { counts: { mailSend: 1, anySend: 1 }, route: "\"You already have an account\": SIGNUP_PORTS.mail = MESSAGES_MAIL, as a platform account email (PF-19p: no firm, so it never spends a firm's daily cap) (features/platform-firms.ts; PF-5v part 2)" },
  "client-money/invoices/money.ts": { counts: { mailSend: 1, anySend: 1 }, route: "invoice and receipt emails: MAIL_PORT (MESSAGES_MAIL), optional (features/client-money-invoices.ts; FO-7b part 1b, the tech lead's ruling on #2953)" },
  "client-money/reports/send.ts": { counts: { mailIn: 1 }, route: "Send statement (the cover note with the statement PDF attached) to the client's own address: MAIL_PORT (MESSAGES_MAIL), optional, in the audit line's transaction, dispatched after commit (features/client-money-reports.ts; FO-7r part 2, R1.111)" },
  "client-money/trust/service.ts": { counts: { mailSend: 1, anySend: 1 }, route: "trust request and TRUST receipt emails: MAIL_PORT (MESSAGES_MAIL), optional (features/client-money-trust.ts; FO-7t part 1)" },
  "person-link.ts": { counts: { messagePort: 1, demoCopy: 3, anySend: 2 }, route: "the case side's link and code emails: MESSAGE_PORT, each demo_message copy written only after MessagePort accepts (PF-19r part 2); its 2nd .send( is the controller calling PersonLinks.send (the link door, no mail)" },
  "platform/register/breaches/service.ts": { counts: { messagePort: 1, anySend: 1 }, route: "security incident notice to each affected firm's Owner and Admins: BREACH_MESSAGES, bound useExisting MESSAGE_PORT (features/platform-register-breaches.ts; PF-21c), in the firm's transaction, dispatched after commit" },
  // Files that hold a port or a stand-in and send nothing themselves (a .send( appearing here fails until classified).
  "front-office/booking/runtime-ports.ts": { counts: {}, route: "builds BOOKING_PORTS from the MailPort it is given (MESSAGES_MAIL)" },
  "front-office/booking/consultation-agreement/controller.ts": { counts: { anySend: 1 }, route: "builds CONSULTATION_AGREEMENT_PORTS from the MailPort it is given (MESSAGES_MAIL; FO-3c). Its one .send( is Express's res.send of the signed copy's bytes (FO-3c part 2 download), never mail" },
  "platform/firms/runtime-ports.ts": { counts: {}, route: "builds SIGNUP_PORTS (and the local identity stand-in) from the MailPort it is given: the app gives MESSAGES_MAIL (S2); its fakeMail() default is for unit tests that give none (STANDIN_DEFAULTS)" },
  "platform/identity/session/mail.ts": { counts: {}, route: "MAIL_PORT's token and LocalMail, the tests' stand-in (S1 fails on `new LocalMail(` in app code)" },
  "platform/firms/signup-identity.ts": { counts: { mailSend: 1, anySend: 1 }, route: "sign-up verification code: the local identity stand-in sends it through the MailPort it is given, as a platform account email (PF-5v part 2, QA-481); the app gives MESSAGES_MAIL (S2). Cognito sends its own in production" },
};

/** Files whose send function takes the MailPort its caller gives: no caller may exist in api/src outside the file, else
 *  that caller's binding must be classified here first. */
const CALLER_GIVES: Record<string, RegExp> = {
  "platform/identity/session/email-sender.ts": /\bhandleCustomEmail\(/,
  "platform/entitlements/limit-changes.ts": /\bnew PlanLimitChanges\(|\bsendNotices\(/,
};

/** A file that holds a mail or message port, a mail stand-in, a raw transport or the demo inbox, by any name: it must be in
 *  the table even when it sends nothing, and every `.send(`/`.sendIn(` in it is counted whatever its receiver is called
 *  (review M2: `this.email.send`, `m.send` on a MailPort parameter, `port.send(tx, …)`, a call split over lines). */
const PORT_HOLDER = /\b(?:MailPort|MailMessage|MessagePort|MessageSend|MAIL_PORT|MESSAGE_PORT|MESSAGES_MAIL|MessagesMail|mailIn|LocalMail|fakeMail)\b|nodemailer|@aws-sdk\/client-ses|\bSES(?:v2)?Client\b|\bdemoMessage\b|\.mail\b(?!["'`])/;
const ANY_SEND = /\.\s*send(?:In)?\s*\(/g, DESTRUCTURED_SEND = /\{[^}]*\bsend(?:In)?\b[^}]*\}\s*=/g;
/** A stand-in allowed only as a parameter's default, for unit tests that give no MailPort; S2 proves the running app
 *  passes MESSAGES_MAIL there, so the default is never used by the app. Any other fakeMail( or new LocalMail( fails. */
const STANDIN_DEFAULTS: Record<string, RegExp> = { "platform/firms/runtime-ports.ts": /^export function runtimeSignUpPorts\(.*\bmail: MailPort = fakeMail\(\)\): SignUpPorts \{$/ };
const codeLines = (text: string) => text.split("\n").map((l, i) => ({ n: i + 1, l })).filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l));

/** Every send call in the given files (path relative to api/src → text), and every problem with the table above. */
function audit(files: Map<string, string>) {
  const hits: { file: string; line: number; kind: Kind }[] = [], problems: string[] = [], holders = new Map<string, number>();
  for (const [file, text] of files) {
    if (MESSAGEPORT_ITSELF.some((d) => file.startsWith(d))) continue;
    const lines = codeLines(text);
    for (const { n, l } of lines) for (const k of Object.keys(KINDS) as (keyof typeof KINDS)[]) if (KINDS[k].test(l)) hits.push({ file, line: n, kind: k });
    if (lines.some(({ l }) => PORT_HOLDER.test(l))) {
      const code = lines.map(({ l }) => l).join("\n");
      holders.set(file, (code.match(ANY_SEND)?.length ?? 0) + (code.match(DESTRUCTURED_SEND)?.length ?? 0));
    }
    // A stand-in mail in app code is a bypass wherever it sits (features or not).
    for (const { n, l } of lines) if (/\bfakeMail\(|\bnew LocalMail\(/.test(l) && !STANDIN_DEFAULTS[file]?.test(l)) problems.push(`${file}:${n}: a stand-in mail (fakeMail or LocalMail) in the app's code`);
    if (file.startsWith("features/")) for (const { n, l } of lines) if (/provide:\s*MAIL_PORT\b/.test(l) && !/useExisting:\s*MESSAGES_MAIL\b/.test(l)) problems.push(`${file}:${n}: MAIL_PORT bound to something other than MESSAGES_MAIL`);
    for (const [owner, call] of Object.entries(CALLER_GIVES)) if (file !== owner) for (const { n, l } of lines) if (call.test(l)) problems.push(`${file}:${n}: calls ${owner}'s sender: classify the MailPort it gives`);
  }
  const byFile = new Map<string, Partial<Record<Kind, number>>>();
  for (const h of hits) { const c = byFile.get(h.file) ?? {}; c[h.kind] = (c[h.kind] ?? 0) + 1; byFile.set(h.file, c); }
  for (const [file, n] of holders) { const c = byFile.get(file) ?? {}; c.anySend = n; byFile.set(file, c); }
  for (const [file, counts] of byFile) {
    const e = SENDERS[file];
    // A feature file binds ports (S2 checks those bindings); it may hold a port but never send itself.
    if (!e && file.startsWith("features/") && Object.entries(counts).every(([k, v]) => k === "anySend" && v === 0)) continue;
    if (!e) { problems.push(`${file}: ${JSON.stringify(counts)} send call(s) not in the table: route it through MessagePort and classify it`); continue; }
    for (const k of new Set([...Object.keys(counts), ...Object.keys(e.counts)]) as Set<Kind>) if ((counts[k] ?? 0) !== (e.counts[k] ?? 0)) problems.push(`${file}: ${counts[k] ?? 0} ${k} call(s), the table says ${e.counts[k] ?? 0}: classify the change`);
  }
  for (const file of Object.keys(SENDERS)) if (files.has(file) && !byFile.has(file)) problems.push(`${file}: in the table but holds no port and no send call (remove or fix the entry)`);
  // The case side's demo copy is written only after MessagePort accepted the send (`if (await this.mail(…))` just before).
  for (const h of hits.filter((x) => x.kind === "demoCopy")) {
    const all = files.get(h.file)!.split("\n"), before = all.slice(Math.max(0, h.line - 3), h.line).join("\n");
    if (!/if \(await this\.mail\(/.test(before)) problems.push(`${h.file}:${h.line}: a demo_message copy not guarded by MessagePort's answer`);
  }
  return { hits, problems, holders };
}

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
const repo = new Map(walk(API).map((p) => [relative(API, p).split("\\").join("/"), readFileSync(p, "utf8")] as const));

// ------------------------------------------------------------------------------------------------ S1 every send call
const { hits, problems, holders } = audit(repo);
console.log(`Files that hold a mail or message port (each .send( counted, any receiver): ${[...holders].map(([f, n]) => `${f}=${n}`).join(", ")}`);
console.log(`\nSend calls found in api/src (MessagePort's own files left out): ${hits.length}`);
for (const [file, e] of Object.entries(SENDERS)) console.log(`  ${e.open ? "OPEN" : "ok  "}  ${file} ${JSON.stringify(e.counts)}: ${e.route}${e.open ? ` — open: ${e.open}` : ""}`);
ok("S1 pass: every send call in api/src is classified, each through MessagePort (or a named open gap), no stand-in mail in the app's code", problems.length === 0, problems);
ok("S1 pass: the scan finds the senders it should (not blind): the invitation, the booking mail, the case links, sign-up",
  ["platform/identity/service.ts", "front-office/booking/service.ts", "person-link.ts", "platform/firms/signup.ts"].every((f) => hits.some((h) => h.file === f)) && hits.length >= 17, hits.length);

// S1 fails: the same checker on changed copies of the code.
const changed = (edit: (m: Map<string, string>) => void) => { const m = new Map(repo); edit(m); return audit(m).problems; };
const newSender = changed((m) => m.set("platform/new-thing/notify.ts", `export async function notify(mail: MailPort) {\n  await this.mail.send({ to: "a@b.example.com" });\n}\n`));
ok("S1 fail: a new file with an unlisted MailPort send is reported", newSender.some((p) => p.startsWith("platform/new-thing/notify.ts")), newSender);
const extra = changed((m) => m.set("front-office/booking/service.ts", `${m.get("front-office/booking/service.ts")}\nawait this.ports.mail.send({ to: "x" });\n`));
ok("S1 fail: one more send in a listed file is reported (the counts are exact)", extra.some((p) => p.startsWith("front-office/booking/service.ts: 4 mailSend")), extra);
const rp = repo.get("platform/firms/runtime-ports.ts")!;
const oldSignup = changed((m) => m.set("platform/firms/runtime-ports.ts", rp.replace("clock: systemClock, mail, identity:", "clock: systemClock, mail: fakeMail(), identity:")));
ok("S1 fail: sign-up's ports on fakeMail() whatever mail they are given (main before PF-5v part 2) are reported; only the unit-test default is allowed",
  rp.includes("clock: systemClock, mail, identity:") && oldSignup.some((p) => p.startsWith("platform/firms/runtime-ports.ts") && /stand-in/.test(p)), oldSignup);
const localMail = changed((m) => m.set("features/platform-staff-read.ts", m.get("features/platform-staff-read.ts")!.replace("{ provide: MAIL_PORT, useExisting: MESSAGES_MAIL }", "{ provide: MAIL_PORT, useValue: new LocalMail() }")));
ok("S1 fail: MAIL_PORT bound to LocalMail in a feature is reported", localMail.some((p) => p.startsWith("features/platform-staff-read.ts")), localMail);
const unguarded = changed((m) => m.set("person-link.ts", m.get("person-link.ts")!.replace(/if \(await this\.mail\(tx, firmId, subjectId, \{ address: address!, subject, body: text, key: `case\.link:\$\{id\}` \}, outbox\)\)/, "await this.mail(tx, firmId, subjectId, { address: address!, subject, body: text, key: `case.link:${id}` }, outbox);")));
ok("S1 fail: a demo_message copy written without MessagePort's answer is reported", unguarded.some((p) => /person-link\.ts:\d+: a demo_message copy not guarded/.test(p)), unguarded);
const raw = changed((m) => m.set("platform/raw.ts", `import { createTransport } from "nodemailer";\nconst t = createTransport({});\n`));
ok("S1 fail: a raw transport outside MessagePort's channels is reported", raw.some((p) => p.startsWith("platform/raw.ts")), raw);
const caller = changed((m) => m.set("platform/cognito/lambda.ts", `export const h = (e) => handleCustomEmail(e, { mail: fakeMail() });\n`));
ok("S1 fail: a caller of a caller-gives sender (the identity provider's) must be classified", caller.some((p) => /calls platform\/identity\/session\/email-sender\.ts/.test(p)), caller);

// Review M2: the shapes a name-based scan missed. Each probe is a new file (or one more line in a listed file); every one
// must be reported, because the file holds a port (or a raw transport) and its .send( calls are counted whatever they are named.
const SHAPES: Record<string, string> = {
  "this.email.send": `import type { MailPort } from "../../ports/mail.ts";\nexport class N { constructor(private email: MailPort) {}\n  go() { return this.email.send({}); } }\n`,
  "a MailPort parameter m.send": `import type { MailPort } from "../../ports/mail.ts";\nexport const go = (m: MailPort) => m.send({});\n`,
  "mailer.send": `import type { MailPort } from "../../ports/mail.ts";\nexport const go = (mailer: MailPort) => mailer.send({});\n`,
  "MessagePort port.send(tx, …)": `import type { MessagePort } from "../../ports/messages.ts";\nexport const go = (port: MessagePort<unknown>, tx: unknown) => port.send(tx, {} as never);\n`,
  "MessagesMail mm.sendIn": `import type { MessagesMail } from "./messages/send/mail.ts";\nexport const go = (mm: MessagesMail, tx: never) => mm.sendIn(tx, {} as never);\n`,
  ".send( on the next line": `import type { MailPort } from "../../ports/mail.ts";\nexport const go = (x: MailPort) => x\n  .send({});\n`,
  "a destructured send": `import type { MailPort } from "../../ports/mail.ts";\nexport const go = (x: MailPort) => { const { send } = x; return send({}); };\n`,
  "SESv2Client.send(cmd)": `import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";\nexport const go = () => new SESv2Client({}).send(new SendEmailCommand({}));\n`,
  "a port reached by property (this.ports.mail, then m.send)": `export class N { ports: any; go() { const m = this.ports.mail; return m.send({}); } }\n`,
};
const missed = Object.entries(SHAPES).filter(([, code]) => !changed((m) => m.set("platform/probe/shape.ts", code)).some((p) => p.startsWith("platform/probe/shape.ts"))).map(([k]) => k);
ok(`S1 fail: each of ${Object.keys(SHAPES).length} send shapes a name-based scan misses (this.email.send, a MailPort parameter, port.send(tx), mm.sendIn, a call over two lines, a destructured send, SESv2Client.send, a port by property) is reported in a new file`, missed.length === 0, missed);
const inListed = changed((m) => m.set("platform/support/support.ts", `${m.get("platform/support/support.ts")}\nconst again = (email: { send(x: unknown): unknown }) => email.send({});\n`));
ok("S1 fail: one more .send( under any name in a listed file (support.ts) is reported (anySend is exact)", inListed.some((p) => p.startsWith("platform/support/support.ts: 2 anySend")), inListed);

// ------------------------------------------------------------------------------------------------ S2 the real bindings
type Provider = { provide?: unknown; useExisting?: unknown; useFactory?: (...a: unknown[]) => unknown; inject?: unknown[]; useValue?: unknown };
const featureDir = join(API, "features");
const providers: { feature: string; p: Provider }[] = [];
process.env.PLATFORM_ENVIRONMENT ??= "local";   // PF-24w: features/platform-messages.ts reads the loader at import (required, no default)
for (const f of readdirSync(featureDir).filter((x) => x.endsWith(".ts")).sort()) {
  const feat = (await import(pathToFileURL(join(featureDir, f)).href)).default as { providers?: unknown[] } | undefined;
  for (const p of feat?.providers ?? []) if (p && typeof p === "object") providers.push({ feature: f, p: p as Provider });
}
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { MESSAGES_MAIL, MESSAGE_PORT } = await import("../api/src/features/platform-messages.ts");
const { SIGNUP_PORTS } = await import("../api/src/platform/firms/routes.ts");
const { COMPLAINT_PORTS } = await import("../api/src/features/platform-complaints.ts");
const { BOOKING_PORTS } = await import("../api/src/front-office/booking/public.controller.ts");
const tokenOf = (t: unknown) => (t && typeof t === "object" && "token" in (t as object) ? (t as { token: unknown }).token : t);
const MAILS = new Set<unknown>([MESSAGES_MAIL, MAIL_PORT]);

/** The problems with a set of providers: MAIL_PORT must be one provider, useExisting MESSAGES_MAIL; each named ports token
 *  must inject the app's mail, and its factory must return the mail it is given. */
function bindings(list: { feature: string; p: Provider }[], tokens: Record<string, unknown>) {
  const out: string[] = [];
  const mailPort = list.filter((x) => x.p.provide === MAIL_PORT);
  if (mailPort.length !== 1 || mailPort[0]!.p.useExisting !== MESSAGES_MAIL) out.push(`MAIL_PORT: ${mailPort.length} provider(s), ${mailPort.map((x) => `${x.feature}: ${x.p.useExisting === MESSAGES_MAIL ? "MESSAGES_MAIL" : "something else"}`).join("; ") || "none"}`);
  for (const [name, token] of Object.entries(tokens)) {
    const found = list.filter((x) => x.p.provide === token);
    if (found.length !== 1) { out.push(`${name}: ${found.length} provider(s)`); continue; }
    const p = found[0]!.p, inject = (p.inject ?? []).map(tokenOf), at = inject.findIndex((t) => MAILS.has(t));
    if (!p.useFactory || at < 0) { out.push(`${name} (${found[0]!.feature}): does not take MESSAGES_MAIL or MAIL_PORT`); continue; }
    const sentinel = { send: async () => ({ messageId: "sentinel" }) }, args = inject.map((_, i) => (i === at ? sentinel : undefined));
    const made = p.useFactory(...args) as { mail?: unknown } | undefined;
    if (made?.mail !== sentinel) out.push(`${name} (${found[0]!.feature}): its factory's mail is not the one given`);
  }
  return out;
}
const TOKENS: Record<string, unknown> = { SIGNUP_PORTS, COMPLAINT_PORTS, ...(BOOKING_PORTS ? { BOOKING_PORTS } : {}) };
const bound = bindings(providers, TOKENS);
ok(`S2 pass: the running app's features bind MAIL_PORT to MESSAGES_MAIL, and ${Object.keys(TOKENS).join(", ")} each return the MESSAGES_MAIL they are given`, bound.length === 0 && Object.keys(TOKENS).length === 3, { bound, tokens: Object.keys(TOKENS) });
const signupFactory = providers.find((x) => x.p.provide === SIGNUP_PORTS)!.p, given = { send: async () => ({ messageId: "given" }) };
const signupMade = signupFactory.useFactory!(given) as { mail: unknown; identity: { mail?: unknown } };
ok("S2 pass: sign-up's factory gives the same MESSAGES_MAIL to the local identity stand-in, so the verification code goes through MessagePort too (PF-5v part 2)", signupMade.mail === given && signupMade.identity?.mail === given, { identityMail: signupMade.identity?.mail === given });
const { LocalSignUp: StandIn } = await import("../api/src/platform/firms/signup-identity.ts");
const bare = { mail: given, identity: new StandIn(() => new Date()) } as unknown as { identity: { mail?: unknown } };
ok("S2 fail: a stand-in built without the mail (main before PF-5v part 2: the code only kept in memory) is told apart", bare.identity.mail !== given);
const mailTakers = providers.filter((x) => (x.p.inject ?? []).map(tokenOf).some((t) => MAILS.has(t))).map((x) => x.feature);
ok("S2 pass: support, entitlements (storage), complaints, booking and sign-up take the app's mail (MESSAGES_MAIL or MAIL_PORT)",
  ["platform-support.ts", "platform-entitlements.ts", "platform-complaints.ts", "front-office-booking.ts", "platform-firms.ts"].every((f) => mailTakers.includes(f)), mailTakers);
const personLink = readFileSync(join(API, "person-link.ts"), "utf8");
ok("S2 pass: the case side's links take MESSAGE_PORT (Nest's injection)", /@Inject\(MESSAGE_PORT\) private readonly msg: MessagePort/.test(personLink) && providers.some((x) => x.p.provide === MESSAGE_PORT));

// S2 fails: the same check on changed providers.
const { fakeMail } = await import("../ports/mail.ts");
const swap = (token: unknown, p: Provider) => providers.map((x) => (x.p.provide === token ? { feature: x.feature, p } : x));
const oldSignupBinding = bindings(swap(SIGNUP_PORTS, { provide: SIGNUP_PORTS, useFactory: () => ({ mail: fakeMail() }) }), TOKENS);
ok("S2 fail: sign-up's ports built with fakeMail (main before this PR) are reported", oldSignupBinding.some((p) => p.startsWith("SIGNUP_PORTS")), oldSignupBinding);
const ignores = bindings(swap(COMPLAINT_PORTS, { provide: COMPLAINT_PORTS, useFactory: () => ({ mail: fakeMail() }), inject: [MESSAGES_MAIL] }), TOKENS);
ok("S2 fail: a factory that takes MESSAGES_MAIL but returns another mail is reported", ignores.some((p) => /COMPLAINT_PORTS .*not the one given/.test(p)), ignores);
const { LocalMail } = await import("../api/src/platform/identity/session/mail.ts");
const localBound = bindings(swap(MAIL_PORT, { provide: MAIL_PORT, useValue: new LocalMail(() => Date.now()) }), TOKENS);
ok("S2 fail: MAIL_PORT bound to LocalMail (main before PF-19r part 1) is reported", localBound.some((p) => p.startsWith("MAIL_PORT")), localBound);

// ------------------------------------------------------------------------------------------------ S3 MessagePort's layout
const { render, layout } = await import("../ports/messages.ts");
const sendSrc = readFileSync(join(API, "platform/messages/send/messages.ts"), "utf8");
const firmMsg = render("o1", { firmId: "0f5a0000-0000-4000-8000-000000000001", channel: "EMAIL", class: "TRANSACTIONAL", address: "a@b.example.com", content: { subject: "S", text: "Body" }, idempotencyKey: "k", attachments: [] } as never, { name: "Maple Immigration", replyTo: "r@maple.example.com" }, { subject: "S", text: "Body" });
const platMsg = render("o2", { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: "a@b.example.com", content: { subject: "S", text: "Code" }, idempotencyKey: "k" } as never, "account@expatready.example.com", { subject: "S", text: "Code" });
ok("S3 pass: MessagePort renders every email with the one layout (the firm's name on top, \"Sent by …\"), a firm's and a platform account's; the adapter stores the react-email layout for both (PF-13; the plain string is the fake's)",
  /render\(/.test(sendSrc) && /html: await emailLayout\(brand, words\)/.test(sendSrc) && /emailLayout\(\{ name: PLATFORM_ACCOUNT_NAME/.test(sendSrc) && firmMsg.html.includes(">Maple Immigration</div>") && firmMsg.html.includes("Sent by Maple Immigration.") && platMsg.html.includes("Sent by ExpatReady.") && firmMsg.html === layout("Maple Immigration", "S", "Body"), { firm: firmMsg.html.slice(0, 200) });
const stand = fakeMail(); await stand.send({ firmId: "0f5a0000-0000-4000-8000-000000000001", to: "a@b.example.com", replyTo: "r@maple.example.com", subject: "S", text: "Body", class: "TRANSACTIONAL" });
ok("S3 fail: the same email through a stand-in (fakeMail, what sign-up used before this PR) carries no layout", !JSON.stringify(stand.sent).includes("Sent by"), stand.sent);

console.log(`\n${pass} passed, ${fail} failed${Object.values(SENDERS).some((e) => e.open) ? ` · open: ${Object.entries(SENDERS).filter(([, e]) => e.open).map(([f, e]) => `${f} (${e.open})`).join("; ")}` : ""}`);
process.exit(fail ? 1 : 0);
