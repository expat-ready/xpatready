// PF-0c DW1 demonstration only (removed in the next commit).
import type { Pf0cDemoPort } from "../../../../ports/pf0c-demo.ts";
export class RealPf0cDemo implements Pf0cDemoPort { async ping() { return "pong"; } }
