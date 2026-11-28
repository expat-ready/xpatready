// PF-13 part 1b (map row 23; Release 1 row 47; AG-1-6, AG-1-9, AG-16-2; P-574 (1), P-629; briefs PF-13.md,
// P-627-amendments.md). Named tests, a pass and a fail each: DW2 the type from the bytes (SVG and text refused), DW2b the
// metadata walk (EXIF, tEXt and polyglot tails dropped; truncated and arithmetic JPEG refused; nosniff), DW3 the size
// limits, DW9 the banner, DW4's public half (the public read answers no firm id and never another firm's values), DW5's
// logo clause (an email through MessagePort's real send path carries the logo's stable link with its size; a new logo is
// a new link, an old link answers 404; the link carries no expiry, unlike FilesPort's 5-minute links). Send path covered:
// MessagePort.send for a firm's email (Messages.send → emailBrandOf → emailLayout). Fixtures are built here from
// tests/fixtures/file-types/sample.{png,jpg}. A scratch database, a Nest app of PF-4's guard and the branding routes with
// the local stand-in sign-in, files in a scratch folder, the local email adapter. No network, US$0.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf13b_images.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf13b_${process.pid}`, urlOf = (d: string) => `postgresql://xr_studio@127.0.0.1:54329/${d}`, WORK = join(STUDIO, "var", `pf13b-check-${process.pid}`);
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
process.env.FO_FILES_DIR = join(WORK, "files");
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

// ---------------------------------------------------------------------------------------------- fixtures (built here)
const fx = (f: string) => new Uint8Array(readFileSync(join(STUDIO, "tests", "fixtures", "file-types", f)));
const PNG = fx("sample.png"), JPG = fx("sample.jpg");
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const enc = (s: string) => new TextEncoder().encode(s);
const pngChunk = (type: string, data: Uint8Array) => { const head = new Uint8Array(8); new DataView(head.buffer).setUint32(0, data.length); head.set(enc(type), 4); const crc = new Uint8Array(4); new DataView(crc.buffer).setUint32(0, crc32(cat(enc(type), data)) >>> 0); return cat(head, data, crc); };
/** A PNG with chunks inserted after IHDR (8 + 25 bytes) and optional bytes after IEND. */
const pngWith = (chunks: Uint8Array[], tail = new Uint8Array(0)) => cat(PNG.subarray(0, 33), ...chunks, PNG.subarray(33), tail);
const jpegSeg = (marker: number, data: Uint8Array) => cat(new Uint8Array([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff]), data);
/** A JPEG with segments inserted after SOI, and optional bytes after EOI. */
const jpgWith = (segs: Uint8Array[], tail = new Uint8Array(0)) => cat(JPG.subarray(0, 2), ...segs, JPG.subarray(2), tail);
const EXIF_GPS = jpegSeg(0xe1, cat(enc("Exif\0\0"), enc("GPSLatitude 45.5017 N GPSLongitude 73.5673 W")));
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s));
const MB = 1024 * 1024;
/** A valid PNG of exactly n bytes: an unknown ancillary chunk pads it (the walk drops it). */
const pngOfSize = (n: number) => { const pad = n - PNG.length - 12; return pngWith([pngChunk("zzPd", new Uint8Array(pad))]); };

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { BrandingController, BrandingPublicController } = await import("../api/src/platform/branding/routes.ts");
const { BrandingImages } = await import("../api/src/platform/branding/images.ts");
const { walkImage } = await import("../api/src/platform/branding/image-walk.ts");
const feature = (await import("../api/src/features/platform-branding.ts")).default;
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { localEmail } = await import("../api/src/platform/messages/channels/email/local.ts");
const { channelsOf } = await import("../api/src/platform/messages/send/channels.ts");
const { Messages, fileKeyOf } = await import("../api/src/platform/messages/send/messages.ts");
const { fakeAlerts } = await import("../ports/alert.ts");
const { FakeClock } = await import("../ports/clock.ts");
const { fakeJobs } = await import("../ports/jobs.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf13b-check-signing-key-0123456789abcdef", () => clock.now());
let app: { close(): Promise<void> } | null = null;
try {
  const files = new LocalFiles();
  let base = "";
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: BrandingImages, useFactory: (d: InstanceType<typeof Db>) => new BrandingImages({ db: d, files, publicBase: "https://app.example" }), inject: [Db] }];
  @Module({ controllers: [PlatformIdentityController, BrandingController, BrandingPublicController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("setup: the feature registers both controllers and the images service", feature.controllers.includes(BrandingController) && feature.controllers.includes(BrandingPublicController) && JSON.stringify(feature.providers).length > 0);
  await seedSampleFirms(db);
  const A = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } }), B = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-solo" } });
  const signIn = async (actorId: string, firmKey = "sample-firm") => { const r = await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) }); return (await r.json()).token as string; };
  const owner = await signIn("user-R"), manager = await signIn("user-T"), ownerB = await signIn("user-S", "sample-solo");
  const up = async (token: string, kind: string, bytes: Uint8Array, name = "x.png", type = "image/png") => {
    const form = new FormData(); form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
    const r = await fetch(`${base}/api/platform/branding/${kind}`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: form });
    const t = await r.text(); let body: any = t; try { body = JSON.parse(t); } catch { /* text */ } return { status: r.status, body };
  };
  const pub = async (path: string) => { const r = await fetch(`${base}${path}`); return { status: r.status, headers: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) }; };
  const pathOf = (link: string) => link.replace("https://app.example", "");

  // ------------------------------------------------------------------------------------------------ DW2 type from bytes
  const svg = await up(owner, "logo", enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "logo.svg", "image/svg+xml");
  const txt = await up(owner, "logo", enc("hello, not a picture"), "logo.png", "image/png");
  ok("PF-13 DW2 fail: an SVG (any content) → 415 \"Use a PNG or JPEG file.\"; a text file named .png → 415", svg.status === 415 && svg.body.detail === "Use a PNG or JPEG file." && txt.status === 415, [svg, txt]);
  const renamed = await up(owner, "logo", PNG, "logo.jpg", "image/jpeg");
  ok("PF-13 DW2 pass: a PNG named .jpg and sent as image/jpeg saves as PNG (type from the bytes)", renamed.status === 200 && renamed.body.mediaType === "image/png", renamed.body);

  // ------------------------------------------------------------------------------------------------ DW2b the walk
  const exif = await up(owner, "logo", jpgWith([EXIF_GPS, jpegSeg(0xfe, enc("a comment"))], enc("<html><script>x</script></html>")), "me.jpg", "image/jpeg");
  const exifBytes = (await pub(pathOf(exif.body.link))).bytes;
  ok("PF-13 DW2b pass: a JPEG with GPS EXIF, a comment and an HTML tail is stored with no APP1, no COM and no tail",
    exif.status === 200 && !has(exifBytes, "Exif") && !has(exifBytes, "GPSLatitude") && !has(exifBytes, "a comment") && !has(exifBytes, "<html>") && exifBytes.length === JPG.length && exif.body.removed.includes("APP1") && exif.body.removed.includes("COM"), [exif.body, exifBytes.length, JPG.length]);
  const texted = await up(owner, "banner", pngWith([pngChunk("tEXt", enc("Author\0Someone")), pngChunk("zTXt", enc("k\0\0xyz")), pngChunk("eXIf", enc("MM\0*"))], enc("<html>")));
  const textedBytes = (await pub(pathOf(texted.body.link))).bytes;
  ok("PF-13 DW2b pass: a PNG with tEXt, zTXt, eXIf chunks and a tail is stored without them (the same bytes as the clean PNG)", texted.status === 200 && Buffer.from(textedBytes).equals(Buffer.from(PNG)), [texted.body, textedBytes.length]);
  const truncated = await up(owner, "logo", JPG.subarray(0, Math.floor(JPG.length / 2)), "t.jpg", "image/jpeg");
  const sofAt = Buffer.from(JPG).indexOf(Buffer.from([0xff, 0xc0])), arith = JPG.slice(); arith[sofAt + 1] = 0xc9;
  const arithmetic = await up(owner, "logo", arith, "a.jpg", "image/jpeg");
  const badCrc = PNG.slice(); badCrc[30] ^= 0xff;
  const crcOut = await up(owner, "logo", badCrc);
  ok("PF-13 DW2b fail: a truncated JPEG, an arithmetic-coded JPEG (SOF9) and a PNG with a broken chunk → 415", truncated.status === 415 && arithmetic.status === 415 && crcOut.status === 415 && sofAt > 0, [truncated.status, arithmetic.status, crcOut.status]);
  ok("PF-13 DW2b pass (the walk alone): the clean fixtures come back unchanged", (() => { const p = walkImage(PNG), j = walkImage(JPG); return p.ok && j.ok && Buffer.from(p.bytes).equals(Buffer.from(PNG)) && Buffer.from(j.bytes).equals(Buffer.from(JPG)); })());

  // Review M2, m1, m2: a second frame header or IHDR (a hidden size), an IHDR of another length, an APP0 that is not JFIF.
  const sofSeg = JPG.subarray(sofAt, sofAt + 2 + ((JPG[sofAt + 2] << 8) | JPG[sofAt + 3]));
  const bigSof = sofSeg.slice(); bigSof[5] = 0xea; bigSof[6] = 0x60; bigSof[7] = 0xea; bigSof[8] = 0x60;   // 60000 × 60000
  const twoSof = cat(JPG.subarray(0, sofAt + sofSeg.length), bigSof, JPG.subarray(sofAt + sofSeg.length));
  const ihdr = PNG.subarray(8, 33), bigIhdrData = ihdr.slice(8, 21); new DataView(bigIhdrData.buffer).setUint32(0, 60000); new DataView(bigIhdrData.buffer).setUint32(4, 60000);
  const twoIhdr = cat(PNG.subarray(0, 33), pngChunk("IHDR", bigIhdrData), PNG.subarray(33));
  const longIhdr = cat(PNG.subarray(0, 8), pngChunk("IHDR", cat(ihdr.slice(8, 21), new Uint8Array([0]))), PNG.subarray(33));
  const rs = await Promise.all([up(owner, "logo", twoSof, "a.jpg", "image/jpeg"), up(owner, "logo", twoIhdr), up(owner, "logo", longIhdr)]);
  ok("PF-13 DW2b fail (review M2): a second JPEG frame header, a second PNG IHDR and an IHDR of 14 bytes → 415 (no hidden size)", rs.every((r) => r.status === 415), rs.map((r) => r.status));
  const avi = await up(owner, "logo", jpgWith([jpegSeg(0xe0, enc("AVI1secret 45.50N 73.56W"))]), "a.jpg", "image/jpeg");
  ok("PF-13 DW2b pass (review m1): an APP0 that is not JFIF is dropped", avi.status === 200 && !has((await pub(pathOf(avi.body.link))).bytes, "secret"), avi.body);
  const sized = (w: number, h: number) => { const d = ihdr.slice(8, 21); new DataView(d.buffer).setUint32(0, w); new DataView(d.buffer).setUint32(4, h); return cat(PNG.subarray(0, 8), pngChunk("IHDR", d), PNG.subarray(33)); };
  const tooWide = await up(owner, "logo", sized(70000, 1));
  ok("PF-13 DW2b fail (review m2): a PNG 70,000 pixels wide → 415 in plain words (before anything is stored)", tooWide.status === 415 && tooWide.body.detail === "The image is wider or taller than 65,535 pixels. Use a smaller PNG or JPEG file.", tooWide.body);
  const bomb = await up(owner, "logo", fx("bomb.png"));
  ok("PF-13 DW2b fail (review m3): a pixel bomb's 415 says why (megapixels), not only the type", bomb.status === 415 && /megapixels/.test(bomb.body.detail), bomb.body);

  // ------------------------------------------------------------------------------------------------ DW3 limits
  const big = await up(owner, "logo", pngOfSize(2 * MB + 1)), atLimit = await up(owner, "logo", pngOfSize(2 * MB));
  ok("PF-13 DW3 fail: a 2 MB + 1 byte logo → 413 naming 2 MB", big.status === 413 && big.body.detail.includes("2 MB"), big.body);
  ok("PF-13 DW3 pass: a 2 MB logo saves (stored without the padding)", atLimit.status === 200, atLimit.body);
  const fav = await up(owner, "favicon", pngOfSize(256 * 1024 + 1)), favOk = await up(owner, "favicon", pngOfSize(256 * 1024));
  ok("PF-13 DW3 fail/pass: a 256 KB + 1 byte favicon → 413 naming 256 KB; 256 KB saves", fav.status === 413 && fav.body.detail.includes("256 KB") && favOk.status === 200, [fav.body, favOk.status]);
  const huge = await up(owner, "logo", pngOfSize(3 * MB));
  ok("PF-13 DW3 fail: a 3 MB file is stopped by the upload layer and still named: 413 \"The logo can be at most 2 MB\" (review M1)", huge.status === 413 && huge.body.detail?.startsWith("The logo can be at most 2 MB."), huge.body);
  // Review M1: the app's error filter (main.ts ProblemErrors) keeps a 413's own words only when they end as PF-F4's do;
  // this is that filter's test (CS-D1t), applied to every branding 413.
  const FILTER_KEEPS = /Allowed here: .+\. Nothing was stored\.$/;
  ok("PF-13 DW3 pass: every branding 413 (service and upload layer) is worded so the app's filter sends it as written: it names the kind's limit", [big, fav, huge].every((r) => FILTER_KEEPS.test(r.body.detail) && r.body.message === r.body.detail && r.body.code === "TOO_LARGE"), [big.body, fav.body, huge.body]);
  const two = new FormData(); two.append("file", new Blob([PNG], { type: "image/png" }), "a.png"); two.append("file", new Blob([PNG], { type: "image/png" }), "b.png");
  const twoR = await fetch(`${base}/api/platform/branding/logo`, { method: "PUT", headers: { authorization: `Bearer ${owner}` }, body: two }), twoB = await twoR.json();
  ok("PF-13 DW3 fail: two files in one upload → 400 \"Send one PNG or JPEG file\", nothing stored", twoR.status === 400 && twoB.detail.startsWith("Send one PNG or JPEG file") && FILTER_KEEPS.test(twoB.detail), twoB);
  // A file in the wrong field (multer's "Unexpected file field" since NestJS 11.2, "Unexpected field" before): the same words.
  const wrong = new FormData(); wrong.append("photo", new Blob([PNG], { type: "image/png" }), "a.png");
  const wrongR = await fetch(`${base}/api/platform/branding/logo`, { method: "PUT", headers: { authorization: `Bearer ${owner}` }, body: wrong }), wrongB = await wrongR.json();
  ok("PF-13 DW3 fail: a file in a field other than \"file\" → 400 \"Send one PNG or JPEG file\", nothing stored", wrongR.status === 400 && wrongB.code === "ONE_FILE" && wrongB.detail.startsWith("Send one PNG or JPEG file"), wrongB);

  // ------------------------------------------------------------------------------------------------ DW9 the banner
  const bigBanner = await up(owner, "banner", pngOfSize(2 * MB + 1));
  ok("PF-13 DW9 fail: a 2 MB + 1 byte banner → 413 naming 2 MB", bigBanner.status === 413 && bigBanner.body.detail.includes("2 MB"), bigBanner.body);
  const bannerGet = await pub(pathOf(texted.body.link));
  ok("PF-13 DW9 pass: the banner's link answers 200 with the image, nosniff, a day's cache and its ETag; the link carries no expiry (only ?v=)",
    bannerGet.status === 200 && bannerGet.headers.get("x-content-type-options") === "nosniff" && bannerGet.headers.get("content-type") === "image/png" && bannerGet.headers.get("cache-control") === "public, max-age=86400" && /^"[0-9a-f]{64}"$/.test(bannerGet.headers.get("etag") ?? "") && /\?v=[0-9a-f]{16}$/.test(texted.body.link), [...bannerGet.headers]);

  // ------------------------------------------------------------------------------------------------ DW4 who, and the public read
  const byManager = await up(manager, "logo", PNG);
  ok("PF-13 DW4 fail: a Case Manager's upload → 403", byManager.status === 403, byManager.body);
  await fetch(`${base}/api/platform/branding`, { method: "PUT", headers: { authorization: `Bearer ${owner}`, "content-type": "application/json" }, body: JSON.stringify({ colour: "#767676", tagline: "Immigration help, plainly" }) });
  const pa = await (await fetch(`${base}/api/public/firms/sample-firm/branding`)).json(), pb = await (await fetch(`${base}/api/public/firms/sample-solo/branding`)).json();
  const uuidIn = (o: unknown) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(JSON.stringify(o));
  ok("PF-13 DW4 pass: firm A's public read has its name, colour, tagline and image links, and no firm id", pa.name === A.operatingName && pa.colour === "#767676" && pa.tagline === "Immigration help, plainly" && pa.logo?.startsWith("https://app.example/api/public/firms/sample-firm/branding/logo?v=") && !uuidIn(pa), pa);
  ok("PF-13 DW4 fail: firm B's public read never returns firm A's values (neutral, no images)", pb.name === B.operatingName && pb.colour !== "#767676" && pb.tagline === null && pb.logo === null && !uuidIn(pb), pb);
  const nobody = await pub("/api/public/firms/no-such-firm/branding"), badKey = await pub("/api/public/firms/..%2F/branding"), crossImg = await pub(pathOf(pa.logo).replace("sample-firm", "sample-solo"));
  ok("PF-13 DW4 fail: an unknown firm key, a malformed key, and firm A's image link under firm B's key → 404", nobody.status === 404 && badKey.status === 404 && crossImg.status === 404, [nobody.status, badKey.status, crossImg.status]);

  // ------------------------------------------------------------------------------------------------ DW5 the logo in the email
  const mfiles = files, mclock = new FakeClock(new Date()), jobs = fakeJobs(mclock);
  const messages = new Messages({ db, consent: new ConsentStore(auditEvent, mclock), files: mfiles, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", localEmail]]), clock: mclock, publicBase: "https://app.example" });
  await messages.register();
  const mail = async (firmId: string) => {
    const r = await db.$transaction((t) => messages.send(t, { firmId, channel: "EMAIL", class: "TRANSACTIONAL", address: `pf13b.${randomUUID().slice(0, 6)}@example.com`, content: { subject: "Your booking (Sample)", text: "See you." }, idempotencyKey: randomUUID() }));
    return JSON.parse(new TextDecoder().decode((await mfiles.get(firmId, fileKeyOf(firmId, r.outboxId)))!.bytes)) as { html: string };
  };
  const wide = await up(owner, "logo", PNG);   // the 32 × 24 sample: drawn 64 × 48 at the layout's 48 px height
  const m1 = await mail(A.id), link1 = pa.logo as string;
  const logoNow = (await (await fetch(`${base}/api/platform/branding`, { headers: { authorization: `Bearer ${owner}` } })).json()).images.logo;
  ok("PF-13 DW5 pass: an email through MessagePort carries the logo's stable link with width and height attributes (Outlook)",
    wide.status === 200 && m1.html.includes(`src="${logoNow.link}"`) && /<img[^>]*\swidth="64"/.test(m1.html) && /<img[^>]*\sheight="48"/.test(m1.html) && logoNow.width === 32 && logoNow.height === 24, [logoNow, m1.html.slice(0, 800)]);
  await up(owner, "logo", sized(2000, 100));
  const wideMail = await mail(A.id);
  ok("PF-13 DW5 pass (review m4): a 2000 × 100 logo is drawn 300 × 15 in the email (capped width, shape kept)", /<img[^>]*\swidth="300"/.test(wideMail.html) && /<img[^>]*\sheight="15"/.test(wideMail.html), (wideMail.html.match(/<img[^>]*>/) ?? [""])[0]);
  await up(owner, "logo", PNG);
  const g1 = await pub(pathOf(logoNow.link));
  ok("PF-13 DW5 pass: that link answers 200 with the stored image (it never expires: no time in it, unlike FilesPort's 5-minute links)", g1.status === 200 && Buffer.from(g1.bytes).equals(Buffer.from(PNG)), g1.status);
  const second = await up(owner, "logo", JPG, "new.jpg", "image/jpeg"), m2 = await mail(A.id);
  const old = await pub(pathOf(logoNow.link));
  ok("PF-13 DW5 pass: a new logo is a new link in the next email", second.status === 200 && second.body.link !== logoNow.link && m2.html.includes(`src="${second.body.link}"`) && link1 !== second.body.link, [second.body.link, logoNow.link]);
  ok("PF-13 DW5 fail: the old link answers 404 cleanly (never another image's bytes)", old.status === 404 && !Buffer.from(old.bytes).includes(Buffer.from(JPG.subarray(0, 4))), old.status);
  const mB = await mail(B.id);
  ok("PF-13 DW5 fail: firm B's email carries no logo (none set) and nothing of firm A's", !mB.html.includes("<img") && !mB.html.includes("sample-firm"), mB.html.slice(0, 400));
  ok("PF-13 DW9 fail (P-629): the email carries no banner and no favicon link", !m2.html.includes("/branding/banner") && !m2.html.includes("/branding/favicon"));
  const del = await fetch(`${base}/api/platform/branding/logo`, { method: "DELETE", headers: { authorization: `Bearer ${owner}` } });
  ok("PF-13 DW5 pass: removing the logo returns the email to no logo; its link answers 404", del.status === 200 && !(await mail(A.id)).html.includes("<img") && (await pub(pathOf(second.body.link))).status === 404);

  // ------------------------------------------------------------------------------------------------ the audit line
  const lineCount = Number(sql(`select count(*) from audit_event where entity_key like '${A.id}:platform.branding.logo'`));
  ok("PF-13 audit: each logo change is one line (hash and size only, no file name)", lineCount >= 3 && sql(`select count(*) from audit_event where entity_key like '${A.id}:platform.branding.logo' and detail::text like '%.jpg%'`) === "0", lineCount);
} finally {
  await app?.close(); await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the sweep */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nPF-13 part 1b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
