// Read by the type check only (tsconfig.check.json, product/tools/typecheck.mjs); nothing imports it at run time.
// Prisma's `new PrismaClient({ adapter })` infers a client type of its own in every file that writes it, and tsc expands all
// models again for each (24 Nov 2026: 213 models in about 178 test files, out of memory at 8 GB). Here the same options are
// checked (Prisma.Subset, as Prisma does) but the client is the one type the app names, `PrismaClient`. So what only the
// options' own type would say is refused, not guessed: `omit` as an option, and `$on` of a client with `log`. A `.ts` file,
// not `.d.ts`: skipLibCheck would hide a missing generated client and make every client `any`.
export * from "../../node_modules/.prisma/client/index.js";
import type { Prisma, PrismaClient as Client } from "../../node_modules/.prisma/client/index.js";
export type PrismaClient = Client;
type Options = Omit<Prisma.PrismaClientOptions, "omit">;
export declare const PrismaClient: new <T extends Options = Options>(options?: Prisma.Subset<T, Options>) => Client;
