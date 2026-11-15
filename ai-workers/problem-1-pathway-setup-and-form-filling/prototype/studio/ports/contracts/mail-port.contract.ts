// PF-4b (PF-0c guard): MailPort's contract (ports/mail.ts), run by fakeMail and LocalMail (session/mail.ts): a checked
// email is sent with an id and kept for its address (lower case); one the schema refuses throws and nothing is kept.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { MailPort, SentMail } from "../mail.ts";

const FIRM = "00000000-0000-4000-8000-0000000f0001";
const mail = (to: string) => ({ firmId: FIRM, to, replyTo: "no-reply@example.com", subject: "Your code", text: "Your code is 123456.", class: "TRANSACTIONAL" as const });
export const mailPortContract = defineContract("MailPort", (make: () => MailPort & { inbox(address: string): SentMail[] }) => [
  { name: "a checked email is sent with an id and kept for its address (lower case)", async run() {
    const m = make(), { messageId } = await m.send(mail("Person@Example.com"));
    expect(typeof messageId === "string" && messageId.length > 0, "a message id", messageId);
    expect(m.inbox("person@example.com").length === 1 && m.inbox("person@example.com")[0].text === "Your code is 123456.", "kept once for its address", m.inbox("person@example.com"));
  } },
  { name: "an email the schema refuses throws and nothing is kept", async run() {
    const m = make();
    await expectRefused(() => m.send({ ...mail("not-an-email"), subject: "" }), "a bad address and an empty subject are refused");
    expect(m.inbox("not-an-email").length === 0, "nothing kept");
  } },
]);
