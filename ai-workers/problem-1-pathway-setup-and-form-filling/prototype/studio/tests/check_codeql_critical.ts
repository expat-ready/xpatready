// The critical CodeQL alerts (P-857: closed before product restarts). Each case fails on the code before the fix:
//   40 (type confusion, intake.ts): the upload's files must be a real list: a string or a list-shaped object is refused
//      with "Choose at least one file." before any file is handled (before, a string was taken file by file).
//   39 (type confusion, fill-case.ts): a validated read-back takes one real list of one file with a real Buffer; a
//      list-shaped object or a string "buffer" is refused with 400 before anything else is checked (before, both passed).
//   33-34 (request forgery, bounces.ts): an address from an SNS notice is fetched only as rebuilt from checked pieces:
//      SNS's own host in a written list of AWS regions, then one URI-encoded file name ending .pem (the certificate) or
//      Action=ConfirmSubscription with its URI-encoded TopicArn and Token (the SubscribeURL); a look-alike host, another
//      path or another action is refused and nothing is fetched (before, any host of the shape
//      sns.<xx-word-N>.amazonaws.com was fetched, with the notice's own path and query).
// Pure: the services are built with stubs; no server, no database, no network, no model call (US$0).
//   tsx studio/tests/check_codeql_critical.ts
import { HttpException } from "@nestjs/common";
import { CaseForms } from "../api/src/fill-case.ts";
import { Intake } from "../api/src/intake.ts";
import { createSign, generateKeyPairSync } from "node:crypto";
import { SesNotices, snsStringToSign } from "../api/src/platform/messages/channels/email/bounces.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const AUTHOR = { id: "user-A", name: "Author A", duties: ["author", "agent"] } as never;
const answer = async (f: () => Promise<unknown>) => { try { return { ok: await f() }; } catch (e) { return e instanceof HttpException ? { status: e.getStatus(), message: `${e.message} ${JSON.stringify(e.getResponse())}` } : { error: String(e) }; } };

(async () => {
  // ── Alert 40: intake ──
  const quiet = console.error; console.error = () => {};
  const intake = new Intake({} as never, { id: async () => "ws" } as never, {} as never, {} as never, {} as never);
  const s = await answer(() => intake.intake(AUTHOR, "abc" as never));
  ok("alert 40 fail: a string as the upload's files is refused (400 \"Choose at least one file.\"), never taken letter by letter", s.status === 400 && /Choose at least one file/.test(s.message ?? ""), s);
  const o = await answer(() => intake.intake(AUTHOR, { 0: { originalname: "a.pdf", buffer: Buffer.from("%PDF") }, length: 1 } as never));
  ok("alert 40 fail: a list-shaped object ({0: file, length: 1}) is refused (400) before any file is handled", o.status === 400 && /Choose at least one file/.test(o.message ?? ""), o);
  const e = await answer(() => intake.intake(AUTHOR, [] as never));
  ok("alert 40 pass: an empty list still answers 400 \"Choose at least one file.\" (unchanged)", e.status === 400 && /Choose at least one file/.test(e.message ?? ""), e);
  console.error = quiet;

  // ── Alert 39: validated read-back ──
  const forms = new CaseForms({} as never, {} as never, {} as never);
  (forms as unknown as { copyFor: () => Promise<unknown> }).copyFor = async () => ({ x: { status: "DRAFT", path: null }, c: {} });
  const v = (files: unknown) => answer(() => forms.validated(AUTHOR, "copy-1", files as never));
  const shaped = await v({ 0: { originalname: "v.pdf", buffer: Buffer.from("%PDF-1.7") }, length: 1 });
  ok("alert 39 fail: a list-shaped object ({0: file, length: 1}) is refused 400 \"Send the one validated PDF\"", shaped.status === 400 && /Send the one validated PDF/.test(shaped.message ?? ""), shaped);
  const str = await v([{ originalname: "v.pdf", buffer: "%PDF-1.7" }]);
  ok("alert 39 fail: a file whose buffer is a string, not a Buffer, is refused 400", str.status === 400 && /Send the one validated PDF/.test(str.message ?? ""), str);
  const two = await v([{ buffer: Buffer.from("a") }, { buffer: Buffer.from("b") }]);
  ok("alert 39 fail: two files are refused 400 (unchanged)", two.status === 400 && /Send the one validated PDF/.test(two.message ?? ""), two);
  const good = await v([{ originalname: "v.pdf", buffer: Buffer.from("%PDF-1.7") }]);
  ok("alert 39 pass: one real file with a Buffer passes this check and reaches the next one (a copy not generated: 409)", good.status === 409 && /Only a generated copy/.test(good.message ?? ""), good);

  // ── Alerts 33-34: SNS addresses ──
  const fetched: string[] = [];
  const fetchCert = async (url: string) => { fetched.push(url); throw new Error("no certificate in this test"); };
  const notices = new SesNotices({ db: {} as never, consent: {} as never, fetchCert });
  const notice = (cert: string) => ({ Type: "Notification", MessageId: "m-1", TopicArn: "arn:aws:sns:ca-central-1:000000000000:ses-notices", Message: "{}", Timestamp: new Date().toISOString(), SignatureVersion: "2", Signature: "c2ln", SigningCertURL: cert });
  const refused = async (cert: string) => { try { await notices.verify(notice(cert)); return "verified"; } catch (x) { return (x as Error).message; } };
  const lookAlike = await refused("https://sns.zz-fake-9.amazonaws.com/SimpleNotificationService-x.pem");
  ok("alerts 33-34 fail: a certificate on a look-alike host (sns.zz-fake-9.amazonaws.com, no such region) is refused and nothing is fetched", lookAlike === "certificate not from Amazon SNS" && fetched.length === 0, { lookAlike, fetched });
  const other = await refused("https://sns.ca-central-1.amazonaws.com.evil.example/x.pem");
  ok("alerts 33-34 fail: a certificate on another host is refused and nothing is fetched (unchanged)", other === "certificate not from Amazon SNS" && fetched.length === 0, { other, fetched });
  const real = "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-rec.pem";
  await refused(real);
  ok("alerts 33-34 pass: SNS's own host in a known region is fetched, at exactly the address the notice named", fetched.length === 1 && fetched[0] === real, fetched);
  await refused("https://sns.eu-west-1.amazonaws.com//evil.example/x.pem");
  await refused("https://sns.eu-west-1.amazonaws.com/a/b.pem");
  await refused("https://sns.eu-west-1.amazonaws.com/x.pem?u=https://evil.example/");
  ok("alerts 33-34 fail: a certificate path other than one file name ending .pem (//host/x.pem, a folder, a query) is refused and nothing is fetched", fetched.length === 1, fetched);

  // SubscribeURL: the notice is signed by a key this run makes, so receive() reaches the address check.
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 }), CERT = "https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-t.pem";
  const visited: string[] = [], TOPIC = "arn:aws:sns:ca-central-1:000000000000:ses-notices";
  const subs = new SesNotices({ db: {} as never, consent: {} as never, topics: [TOPIC], fetchCert: async () => key.publicKey.export({ type: "spki", format: "pem" }).toString(), confirm: async (u) => { visited.push(u); } });
  const confirmation = (url: string) => {
    const n: Record<string, string> = { Type: "SubscriptionConfirmation", MessageId: "m-2", Token: "tok-1", TopicArn: TOPIC, Message: "confirm", SubscribeURL: url, Timestamp: new Date().toISOString(), SignatureVersion: "2", SigningCertURL: CERT };
    n.Signature = createSign("RSA-SHA256").update(snsStringToSign(n), "utf8").sign(key.privateKey, "base64");
    return subs.receive(n).then((r) => r, (x: Error) => x.message);
  };
  const goodSub = `https://sns.ca-central-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=tok-1`;
  const g = await confirmation(goodSub);
  ok("alerts 33-34 pass: a signed confirmation visits SNS's ConfirmSubscription address, rebuilt to the same address", g === "confirmation" && visited.length === 1 && visited[0] === goodSub, { g, visited });
  const bad = [await confirmation("https://sns.ca-central-1.amazonaws.com/x/?Action=ConfirmSubscription&TopicArn=a&Token=b"), await confirmation("https://sns.ca-central-1.amazonaws.com/?Action=Publish&TopicArn=a&Token=b"), await confirmation("https://sns.ca-central-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=a"), await confirmation("https://sns.zz-fake-9.amazonaws.com/?Action=ConfirmSubscription&TopicArn=a&Token=b")];
  ok("alerts 33-34 fail: a SubscribeURL with another path, another action, no token or a look-alike host is refused and never visited", bad.every((b) => b === "subscribe address not from Amazon SNS") && visited.length === 1, { bad, visited });

  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
