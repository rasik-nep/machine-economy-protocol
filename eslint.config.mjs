import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly"
      }
    }
  },
  {
    ignores: [
      ".anchor/",
      ".pnpm-store/",
      "build/",
      "coverage/",
      "dist/",
      "ledger/",
      "node_modules/",
      "target/",
      "test-ledger/"
    ]
  }
);
