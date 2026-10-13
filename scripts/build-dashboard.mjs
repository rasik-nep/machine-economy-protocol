import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
for (const [sourceName, outputName] of [
  ["dashboard", "app"],
  ["site", "site"],
  ["replay-mode", "replay-mode"]
]) {
  const source = await readFile(`apps/web/src/${sourceName}.ts`, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  });
  await writeFile(`apps/web/public/${outputName}.js`, outputText);
}
