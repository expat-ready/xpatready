// PF-20 part 1 (R1.36; AG-2-31 rules 1-2; P-584 (2)): the automation registry. Each module registers its own recipes at
// start-up (the front office its four lead recipes, FO-12b); a firm's copy (auto_recipe and its steps) is made from it on
// first read and keeps only the firm's on/off and each step's wording, timing and mode. A key registered twice stops the
// start-up; a firm's recipe no module registers is never run. A step is one message in R1.36's slice (tasks, reminders
// and assignment as step actions are later parts).
import { z } from "zod";

/** Sample (AG-2-31 rule 2): steps per recipe in Release 1 (the library's longest has three; no builder adds more). */
export const MAX_STEPS = 20;
/** A step's wait after its run starts: at most a year (the migration's check says the same). */
export const MAX_DELAY_MINUTES = 365 * 24 * 60;

export const RecipeKey = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "a dotted lower-case key with its module first (fo.going_cold)").max(100);
export const StepClass = z.enum(["SERVICE", "MARKETING"]);
export const StepMode = z.enum(["AUTO", "ASK", "OFF"]);
/** One line with no control or line-separator character (the outbox refuses them; break m2). */
const OneLine = z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$/, "a subject on one line");
export const RecipeStepDef = z.strictObject({
  /** Minutes after the run starts (AG-2-31 rule 2: the firm can change it). */
  delayMinutes: z.number().int().min(0).max(MAX_DELAY_MINUTES),
  /** The consent gate's purpose (AG-2-33 rule 3): MARKETING needs the person's consent on the channel. */
  class: StepClass,
  subject: OneLine,
  body: z.string().trim().min(1).max(20_000).refine((t) => !t.includes("\u0000"), "no NUL character"),
  mode: StepMode.default("AUTO"),
});
export const RecipeDef = z.strictObject({
  /** The registering module (`fo`, `case`): the key's first part. */
  module: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  key: RecipeKey,
  /** What a person reads on the Automatic messages page. */
  label: z.string().trim().min(1).max(120),
  /** One plain sentence: when it starts and what it sends. */
  description: z.string().trim().min(1).max(400),
  /** On from the start for a new firm (AG-2-31 rule 1: only the new-lead recipe; the other three are off). */
  defaultOn: z.boolean(),
  steps: z.array(RecipeStepDef).min(1).max(MAX_STEPS),
}).refine((d) => d.key.startsWith(`${d.module}.`), "a recipe's key starts with its module (fo.going_cold for module fo)");
export type RecipeDef = z.input<typeof RecipeDef>;
export type Recipe = z.output<typeof RecipeDef>;

export class AutomationRegistry {
  readonly #recipes = new Map<string, Recipe>();

  /** Registers one recipe. A key registered twice throws, naming the key and both modules (the start-up stops). */
  register(def: RecipeDef): Recipe {
    const r = RecipeDef.parse(def), had = this.#recipes.get(r.key);
    if (had) throw new Error(`automation: recipe ${r.key} is registered twice (module ${had.module}, then module ${r.module}): one key, one recipe`);
    this.#recipes.set(r.key, r);
    return r;
  }
  get(key: string): Recipe | undefined { return this.#recipes.get(key); }
  has(key: string): boolean { return this.#recipes.has(key); }
  list(): Recipe[] { return [...this.#recipes.values()].sort((a, b) => a.key.localeCompare(b.key)); }
}

/** The app's one registry: modules register into it from their own feature files (api/src/features/). */
export const automationRegistry = new AutomationRegistry();
