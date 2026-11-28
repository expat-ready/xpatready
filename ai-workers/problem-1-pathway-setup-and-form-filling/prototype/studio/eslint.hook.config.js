// LR-181 (lab register): the edit-time lint hook's config (product/tools/lint-hook.sh). It is eslint.config.js, the one
// CI runs, with the React Compiler rules of eslint-plugin-react-hooks switched off for the hook only. Measured 28 Nov
// (cold, per file, 4 cores): the compiler pass is ~92% of a web file's lint (react-hooks/static-components carries it:
// 1.86 of 2.0 s on questionnaire.tsx), which put the largest files over the 2 s hook bar. Without it every timed file is
// under 2 s (product/tools/lint-hook-timing.sh). CI still runs every rule; only the hook skips the compiler ones.
// The two classic hooks rules stay on. The list is read from the plugin, so a new compiler rule is off here too.
import base from "./eslint.config.js";
import reactHooks from "eslint-plugin-react-hooks";

const KEEP = new Set(["react-hooks/rules-of-hooks", "react-hooks/exhaustive-deps"]);
const off = Object.fromEntries(
  Object.keys(reactHooks.configs.recommended.rules)
    .filter((rule) => !KEEP.has(rule))
    .map((rule) => [rule, "off"]),
);

export default [...base, { files: ["web/src/**/*.{ts,tsx}"], rules: off }];
