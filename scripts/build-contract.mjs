import { mkdir, writeFile } from "node:fs/promises";

import { buildContractFlowScreenModel } from "../apps/web/src/index.ts";
import { renderContractPage } from "../apps/web/src/contract-page.ts";

await mkdir("dist", { recursive: true });
await writeFile("dist/contract.html", renderContractPage(await buildContractFlowScreenModel()));
console.log("Built dist/contract.html");
