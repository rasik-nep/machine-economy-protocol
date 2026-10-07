import { mkdir, writeFile } from "node:fs/promises";

import { buildSubcontractScreenModel } from "../apps/web/src/index.ts";
import { renderSubcontractPage } from "../apps/web/src/subcontract-page.ts";

await mkdir("dist", { recursive: true });
await writeFile(
  "dist/subcontract.html",
  renderSubcontractPage(await buildSubcontractScreenModel())
);
console.log("Built dist/subcontract.html");
