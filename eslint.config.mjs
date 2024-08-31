// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(eslint.configs.recommended, {
  ignores: ["dist/", "lib/", "node_modules/", ".github/", "jest.config.js"],
});
