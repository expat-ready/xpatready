// PF-13 part 1a (map row 23; Release 1 row 47 "one email layout with the firm's branding"; AG-1-6, AG-1-9, AG-16-2;
// P-629, P-630; Lead B briefs PF-13.md, P-627-amendments.md, P-630-amendments.md). Named tests, a pass and a fail each:
// DW1 the colour's contrast, DW4 who may change it and firm walls (the staff routes; the public read is part 1b), DW5 the
// email sent through MessagePort's real send path (Messages.send → emailBrandOf → the react-email layout, stored as the
// worker sends it) carries the firm's colour and sender name, neutral before a save, DW8 the footer and signature, DW10
// the tagline (stored and read; never in an email), DW12 the layout is tables with inline styles and escapes firm values.
// Send path covered: MessagePort.send for a firm's email (every firm email goes through it: check_pf19r_every_sender.ts).
// A scratch database, a Nest app of PF-4's guard and the branding routes with the local stand-in sign-in, the local
// email adapter, fakeJobs. No network, US$0.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf13_branding.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf13_${process.pid}`, urlOf = (d: string) => `postgresql://xr_studio@127.0.0.1:54329/${d}`, WORK = join(STUDIO, "var", `pf13-check-${process.pid}`);
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { BrandingController } = await import("../api/src/platform/branding/routes.ts");
const { contrastOnWhite, ratioWords, NEUTRAL_COLOUR } = await import("../api/src/platform/branding/branding.ts");
const feature = (await import("../api/src/features/platform-branding.ts")).default;
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { localEmail } = await import("../api/src/platform/messages/channels/email/local.ts");
const { channelsOf } = await import("../api/src/platform/messages/send/channels.ts");
const { Messages, fileKeyOf } = await import("../api/src/platform/messages/send/messages.ts");
const { emailLayout } = await import("../api/src/platform/messages/layout/email-layout.ts");
const { fakeAlerts } = await import("../ports/alert.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf13-check-signing-key-0123456789abcdef", () => clock.now());
let app: { close(): Promise<void> } | null = null;
try {
  const { BrandingImages } = await import("../api/src/platform/branding/images.ts"), { LocalFiles: Files } = await import("../api/src/front-office/files.ts");
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: BrandingImages, useFactory: (d: InstanceType<typeof Db>) => new BrandingImages({ db: d, files: new Files(join(WORK, "files")), publicBase: "https://app.example" }), inject: [Db] }];   // part 1b: the images (the staff read lists them)
  @Module({ controllers: [PlatformIdentityController, BrandingController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the feature registers the branding controller", feature.controllers.includes(BrandingController));
  await seedSampleFirms(db);
  const FIRM_A = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } })), FIRM_B = (await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } }));
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await call(base, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(JSON.stringify(r.body)); return r.body.token as string; };
  const owner = await signIn("user-R"), manager = await signIn("user-T"), ownerB = await signIn("user-S", "sample-solo");
  const put = (token: string, body: unknown) => call(base, "PUT", "/api/platform/branding", { token, body });
  const get = (token: string) => call(base, "GET", "/api/platform/branding", { token });
  const lines = () => Number(sql(`select count(*) from audit_event where entity = 'platform_firm_setting' and entity_key like '${FIRM_A.id}:platform.branding.%'`));

  // ------------------------------------------------------------------------------------------------ the send path
  const files = new LocalFiles(join(WORK, "files")), mclock = new FakeClock(new Date()), jobs = fakeJobs(mclock);
  const messages = new Messages({ db, consent: new ConsentStore(auditEvent, mclock), files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock: mclock });
  await messages.register();
  const mail = async (firmId: string) => {
    const r = await db.$transaction((t) => messages.send(t, { firmId, channel: "EMAIL", class: "TRANSACTIONAL", address: `pf13.${randomUUID().slice(0, 6)}@example.com`, content: { subject: "Your booking (Sample)", text: "See you on Monday.\n\nThe firm" }, idempotencyKey: randomUUID() }));
    const f = await files.get(firmId, fileKeyOf(firmId, r.outboxId));
    return JSON.parse(new TextDecoder().decode(f!.bytes)) as { html: string; from: { name: string } };
  };

  const before = await mail(FIRM_A.id), g0 = await get(owner);
  ok("PF-13 DW5 pass (neutral): before any save, the email carries ExpatReady's neutral colour and the firm's operating name, and the read says nothing is set",
    before.html.includes(`border-bottom:3px solid ${NEUTRAL_COLOUR}`) && before.from.name === FIRM_A.operatingName && before.html.includes(`Sent by ${FIRM_A.operatingName}.`)
    && g0.status === 200 && g0.body.colour === null && g0.body.footer === null && g0.body.neutral.colour === NEUTRAL_COLOUR, { g0: g0.body, html: before.html.slice(0, 400) });

  // ------------------------------------------------------------------------------------------------ DW1 contrast
  ok("PF-13 DW1 (the ratio): #777777 is about 4.48:1 and #767676 about 4.54:1 on white (WCAG 2.1 relative luminance)", Math.abs(contrastOnWhite("#777777") - 4.478) < 0.001 && Math.abs(contrastOnWhite("#767676") - 4.542) < 0.001 && ratioWords(4.478) === "4.47:1" && ratioWords(3.1) === "3.1:1");
  const l0 = lines(), r777 = await put(owner, { colour: "#777777" });
  ok("PF-13 DW1 fail: #777777 → 400 naming the ratio (\"Contrast 4.47:1 on white; at least 4.5:1 is needed.\"), nothing saved, no audit line",
    r777.status === 422 && r777.body.detail === "Contrast 4.47:1 on white; at least 4.5:1 is needed." && lines() === l0 && (await get(owner)).body.colour === null, r777.body);
  const bad = await Promise.all([{ colour: "transparent" }, { colour: "#fff" }, { accentColour: "#ffff00" }, { colour: 7 }, { logo: "x" }, {}].map((b) => put(owner, b)));
  ok("PF-13 DW1 fail: transparent, a short hex, a pale accent, a number, an unknown field and an empty body → 422 each", bad.every((r) => r.status === 422), bad.map((r) => [r.status, r.body.detail]));
  const r767 = await put(owner, { colour: "#767676", senderName: "Maple <Immigration> & \"Co\"" });
  ok("PF-13 DW1 pass: #767676 saves (stored lower case) with a sender name, one audit line per changed key", r767.status === 200 && r767.body.colour === "#767676" && r767.body.senderName === "Maple <Immigration> & \"Co\"" && lines() === l0 + 2, r767.body);
  ok("PF-13 DW1 pass: an upper-case colour is stored lower case", (await put(owner, { accentColour: "#1F4E79" })).body.accentColour === "#1f4e79");

  // ------------------------------------------------------------------------------------------------ DW4 who and walls
  const l1 = lines(), byManager = await put(manager, { colour: "#000000" });
  ok("PF-13 DW4 fail: a Case Manager's PUT (no agent/settings:edit) → 403, nothing saved, no line", byManager.status === 403 && (await get(owner)).body.colour === "#767676" && lines() === l1, byManager.body);
  const gB = await get(ownerB);
  ok("PF-13 DW4 fail: firm B's read never returns firm A's values (its own: none set)", gB.status === 200 && gB.body.colour === null && gB.body.senderName === null && !JSON.stringify(gB.body).includes("Maple"), gB.body);
  ok("PF-13 DW4 pass: firm B's own save changes only firm B", (await put(ownerB, { colour: "#0b6e4f" })).status === 200 && (await get(owner)).body.colour === "#767676");
  ok("PF-13 DW4 fail: no sign-in → 401", (await call(base, "GET", "/api/platform/branding")).status === 401);

  // ------------------------------------------------------------------------------------------------ DW8 footer and signature
  const f1001 = await put(owner, { footer: "x".repeat(1001) }), s2001 = await put(owner, { emailSignature: "y".repeat(2001) });
  ok("PF-13 DW8 fail: a 1,001-character footer → 422 naming 1,000; a 2,001-character signature → 422 naming 2,000", f1001.status === 422 && f1001.body.detail.includes("1,000") && s2001.status === 422 && s2001.body.detail.includes("2,000"), [f1001.body, s2001.body]);
  const FOOTER = "12 King St W, Toronto ON\n+1 416 555 0100\nRCIC licence R000000 (Sample)", SIG = "Kind regards,\nThe Maple team (Sample)";
  const saved8 = await put(owner, { footer: FOOTER, emailSignature: SIG, tagline: "Immigration help, plainly" });
  ok("PF-13 DW8 pass: the footer (address, phone, licence text) and the signature save; GET returns the signature", saved8.status === 200 && (await get(owner)).body.emailSignature === SIG && (await get(owner)).body.footer === FOOTER, saved8.body);

  // ------------------------------------------------------------------------------------------------ DW10 the tagline (API part)
  const t81 = await put(owner, { tagline: "t".repeat(81) }), tBreak = await put(owner, { tagline: "two\nlines" });
  ok("PF-13 DW10 fail: an 81-character tagline → 422 naming 80; a line break → 422", t81.status === 422 && t81.body.detail.includes("80") && tBreak.status === 422, [t81.body, tBreak.body]);
  ok("PF-13 DW10 pass: \"Immigration help, plainly\" saved comes back; <b>x</b> is kept as those characters (shown as text by the pages)",
    (await get(owner)).body.tagline === "Immigration help, plainly" && (await put(owner, { tagline: "<b>x</b>" })).body.tagline === "<b>x</b>");
  await put(owner, { tagline: "Immigration help, plainly" });

  // ------------------------------------------------------------------------------------------------ DW5, DW8 in the email
  const after = await mail(FIRM_A.id), mailB = await mail(FIRM_B.id);
  ok("PF-13 DW5 pass: after the save, the email through MessagePort carries the firm's colour and sender name (From and the layout)",
    after.html.includes("border-bottom:3px solid #767676") && after.from.name === "Maple <Immigration> & \"Co\"" && after.html.includes("Sent by Maple &lt;Immigration&gt; &amp; &quot;Co&quot;."), after.html.slice(0, 900));
  ok("PF-13 DW8 pass: the email carries the footer's three lines", after.html.includes("12 King St W, Toronto ON<br/>+1 416 555 0100<br/>RCIC licence R000000 (Sample)"), after.html.slice(-1200));
  ok("PF-13 DW10 fail (P-629): the email carries no tagline (nor a banner or favicon)", !after.html.includes("Immigration help, plainly") && !/banner|favicon/i.test(after.html));
  ok("PF-13 DW8 fail: firm B's email never carries firm A's footer, colour or sender name (its own colour)",
    !mailB.html.includes("King St") && !mailB.html.includes("#767676") && !mailB.html.includes("Maple") && mailB.html.includes("border-bottom:3px solid #0b6e4f") && mailB.from.name === FIRM_B.operatingName, mailB.html.slice(0, 600));
  await put(owner, { colour: null });
  ok("PF-13 DW5 pass: clearing the colour (null) returns the email to the neutral colour", (await mail(FIRM_A.id)).html.includes(`border-bottom:3px solid ${NEUTRAL_COLOUR}`));

  // ------------------------------------------------------------------------------------------------ review M1 and m1-m6
  const lineOf = (key: string) => JSON.parse(sql(`select detail from audit_event where entity_key = '${FIRM_A.id}:${key}' order by at desc limit 1`) || "null");
  const SIG2 = "Kind regards,\nThe team, team@maple.example.com, +1 416 555 0100", rSig = await put(owner, { emailSignature: SIG2, senderName: "Support <security@maple.example.com>" });
  const sigLine = lineOf("platform.branding.email_signature");
  ok("M1 pass: a signature and a sender name holding an email address save (200, not 500)", rSig.status === 200 && rSig.body.emailSignature === SIG2, rSig.body);
  ok("M1 pass: the audit line carries the value as before/after (R1.8's value_before/value_after, read by AUD-4), never as from/to, and marks it personal",
    sigLine?.value_after === SIG2 && sigLine?.value_before === SIG && sigLine.key === "platform.branding.email_signature" && sigLine.personal === true && !("to" in sigLine) && !("toJson" in sigLine), sigLine);
  ok("M1 fail: a colour (not personal) keeps the settings home's from/to shape", "to" in (lineOf("platform.branding.accent_colour") ?? {}));
  const l5 = lines(), same = await put(owner, { emailSignature: SIG2, footer: FOOTER, tagline: "Immigration help, plainly", accentColour: "#1f4e79" });
  ok("m5 fail: re-saving the same values writes no audit line", same.status === 200 && lines() === l5, [lines(), l5]);
  const acc = await put(owner, { accentColour: "#eeeeee" }), white = await put(owner, { colour: "#ffffff" });
  ok("m4 pass: a pale accent's refusal names the field; white reads \"1:1\"", acc.status === 422 && acc.body.detail.startsWith("Accent colour: Contrast 1.16:1") && white.body.detail === "Contrast 1:1 on white; at least 4.5:1 is needed.", [acc.body.detail, white.body.detail]);
  const crlf = await put(owner, { footer: "12 King St\r\nToronto" }), emoji = await put(owner, { emailSignature: "\u{1F600}".repeat(600) });
  ok("m1 pass: Windows line endings in the footer are kept as plain line breaks; 600 emoji (600 characters) save", crlf.status === 200 && crlf.body.footer === "12 King St\nToronto" && emoji.status === 200, [crlf.body, emoji.status]);
  const weird = await Promise.all([{ senderName: "Maple \ud800" }, { senderName: "Expat\u202eReady" }, { tagline: "Expat\u200bReady" }, { senderName: "Tab\there" }, { footer: "x".repeat(1001) }].map((b) => put(owner, b)));
  ok("m1-m3 fail: a lone surrogate, a bidi or zero-width character and a tab → 422 naming the field (no 500)", weird.every((r) => r.status === 422) && weird[0].body.detail.startsWith("Sender name:") && weird[4].body.detail === "Footer: at most 1,000 characters.", weird.map((r) => [r.status, r.body.detail]));
  sql(`update platform_firm_setting set value = '"#eeeeee"'::jsonb where firm_id = '${FIRM_A.id}' and key = 'platform.branding.colour'`);
  sql(`insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${FIRM_A.id}', 'platform.branding.colour', '"#eeeeee"'::jsonb, 'test') on conflict (firm_id, key) do update set value = excluded.value`);
  const fallback = await mail(FIRM_A.id).catch((e: Error) => ({ html: `THREW ${e.message}`, from: { name: "" } }));
  ok("m6 pass: a stored colour that no longer fits its rule never stops the firm's email: it goes out in the neutral colour", fallback.html.includes(`border-bottom:3px solid ${NEUTRAL_COLOUR}`), fallback.html.slice(0, 200));

  // ------------------------------------------------------------------------------------------------ DW12 the Outlook rule
  const raw = await emailLayout({ name: "A \"<firm>\" & co", colour: "#767676", footer: "<script>x</script>", logoUrl: "https://example.com/logo.png?v=abc" }, { subject: "S <x>", text: "Body <i>one</i>" });
  ok("PF-13 DW12 pass: the layout is tables (role=presentation) with inline styles: no <style> block, no class, no <div> for structure outside the body",
    (raw.match(/<table[^>]*role="presentation"/g) ?? []).length >= 3 && !/<style[\s>]/.test(raw) && !/\sclass=/.test(raw) && /style="[^"]*border-bottom:3px solid #767676/.test(raw) && raw.includes('src="https://example.com/logo.png?v=abc"'), raw.slice(0, 600));
  ok("PF-13 DW12 fail: firm values with <, > and \" appear escaped (name, footer, subject, text); no tag gets through",
    raw.includes("A &quot;&lt;firm&gt;&quot; &amp; co") && raw.includes("&lt;script&gt;x&lt;/script&gt;") && raw.includes("<title>S &lt;x&gt;</title>") && raw.includes("Body &lt;i&gt;one&lt;/i&gt;") && !raw.includes("<script>") && !raw.includes("<i>"), raw.slice(0, 900));
} finally {
  await app?.close(); await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the sweep */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nPF-13 part 1a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
