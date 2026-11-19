// PF-4b (PF-0c guard): MailPort's contract (ports/mail.ts), run by fakeMail, LocalMail (session/mail.ts) and
// MessagesMail (PF-19b, through the outbox; its inbox is the demo inbox, so it answers a promise): a checked
// email is sent with an id and kept for its address (lower case); one the schema refuses throws and nothing is kept.
// PF-19p: a platform account email (no firm) is sent once per key, and one with a firm too, or a marketing one, is refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { MailPort, SentMail } from "../mail.ts";

const FIRM = "00000000-0000-4000-8000-0000000f0001", FIRM_B = "00000000-0000-4000-8000-0000000f0002";
const mail = (to: string) => ({ firmId: FIRM, to, replyTo: "no-reply@example.com", subject: "Your code", text: "Your code is 123456.", class: "TRANSACTIONAL" as const });
/** The contract's firm (a runner that checks firms makes it a platform firm first). */
export const MAIL_CONTRACT_FIRM = FIRM, MAIL_CONTRACT_FIRM_B = FIRM_B;
export const mailPortContract = defineContract("MailPort", (make: () => MailPort & { inbox(address: string): SentMail[] | Promise<Pick<SentMail, "text">[]> }) => [
  { name: "a checked email is sent with an id and kept for its address (lower case)", async run() {
    const m = make(), { messageId } = await m.send(mail("Person@Example.com"));
    expect(typeof messageId === "string" && messageId.length > 0, "a message id", messageId);
    const kept = await m.inbox("person@example.com");
    expect(kept.length === 1 && kept[0].text === "Your code is 123456.", "kept once for its address", kept);
  } },
  { name: "one idempotency key in one firm is one email; another key, or the same key in another firm, is another", async run() {
    const m = make(), once = { ...mail("keyed@example.com"), idempotencyKey: "job:1" };
    const [a, b] = [await m.send(once), await m.send(once)];
    await m.send({ ...once, idempotencyKey: "job:2" });
    await m.send({ ...once, firmId: FIRM_B });
    expect(a.messageId === b.messageId && (await m.inbox("keyed@example.com")).length === 3, "the repeat answers the first id; the other key and the other firm send", await m.inbox("keyed@example.com"));
  } },
  { name: "PF-19p: a platform account email (no firm) is sent once per key; with a firm too, or as marketing, it is refused", async run() {
    const m = make(), p = { platformAccount: true as const, to: "Signup.Person@Example.com", replyTo: "no-reply@example.com", subject: "Confirm your email", text: "Your code is 654321.", class: "TRANSACTIONAL" as const, idempotencyKey: "signup:1" };
    const [a, b] = [await m.send(p), await m.send(p)];
    expect(a.messageId === b.messageId && (await m.inbox("signup.person@example.com")).length === 1, "one email for one key, kept for its address", await m.inbox("signup.person@example.com"));
    await expectRefused(() => m.send({ ...p, idempotencyKey: "signup:2", firmId: FIRM } as never), "both firmId and platformAccount are refused");
    await expectRefused(() => m.send({ ...p, idempotencyKey: "signup:3", class: "MARKETING" } as never), "a marketing platform account email is refused");
    expect((await m.inbox("signup.person@example.com")).length === 1, "nothing more kept");
  } },
  { name: "an email the schema refuses throws and nothing is kept", async run() {
    const m = make();
    await expectRefused(() => m.send({ ...mail("not-an-email"), subject: "" }), "a bad address and an empty subject are refused");
    expect((await m.inbox("not-an-email")).length === 0, "nothing kept");
  } },
]);
