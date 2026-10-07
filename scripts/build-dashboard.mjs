import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
const source = await readFile("apps/web/src/dashboard.ts", "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
});
await writeFile("apps/web/public/app.js", outputText);
