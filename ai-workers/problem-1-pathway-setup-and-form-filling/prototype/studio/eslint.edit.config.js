// LR-181 (LR-083's hook half): the config the edit-time hook (product/tools/edit-lint.sh) lints one edited file with.
// It is eslint.config.js with the React Compiler rules of eslint-plugin-react-hooks turned off. Those rules compile the
// whole component file (react-hooks/static-components took 1.97 s of 2.08 s on web/src/runtime/questionnaire.tsx,
// TIMING=1, 28 Nov), so with them the largest files take 1.9-2.6 s cold, over LR-083's 2 s bar; without them about 1 s.
// rules-of-hooks and exhaustive-deps stay on. CI (studio-lint.yml, `npx eslint .`) still runs every rule.
import base from "./eslint.config.js";
import reactHooks from "eslint-plugin-react-hooks";

const KEEP = new Set(["react-hooks/rules-of-hooks", "react-hooks/exhaustive-deps"]);
const compilerRulesOff = Object.fromEntries(
  Object.keys(reactHooks.configs.recommended.rules)
    .filter((rule) => !KEEP.has(rule))
    .map((rule) => [rule, "off"]),
);

export default [...base, { files: ["web/src/**/*.{ts,tsx}"], rules: compilerRulesOff }];
