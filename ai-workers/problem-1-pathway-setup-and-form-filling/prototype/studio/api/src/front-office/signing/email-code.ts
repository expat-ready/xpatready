// FO-6 part 4a (BACKLOG row FO-6; note product/screens/FO-6-4/note.md rule 5; P-564; Lead 24 on #3433, answers 2, 6, 8):
// the firm's switch for the one-time email code before signing. On by default for every firm; a firm may switch it off,
// and then a live signing link is a bearer link until it is signed (the description says so, answer 2). It is read on
// every door call, never fixed at Send (answer 8), so a change applies at once to links already sent. The Owner's switch
// on screen comes with FO-5s's settings (answer 6); until then only writeSetting changes it.
import { z } from "zod";
import { readSetting, registerSetting } from "../../platform/settings.ts";

type DbOrTx = Parameters<typeof readSetting>[0];

export const SIGNING_EMAIL_CODE = registerSetting({
  key: "front_office.signing_email_code",
  ownerModule: "front-office",
  changePermission: "agent/legal-settings:manage",
  description: "Ask a one-time code sent by email before a client signs (P-564). On by default. Switched off, anyone holding a client's signing link can sign until it is signed.",
  schema: z.boolean(),
  default: true,
});

/** Whether the firm asks the email code before signing, read now (the default when the firm never changed it: on). */
export const emailCodeOn = (db: DbOrTx, firmId: string): Promise<boolean> => readSetting<boolean>(db, firmId, SIGNING_EMAIL_CODE.key);
