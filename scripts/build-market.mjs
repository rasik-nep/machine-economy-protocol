import { mkdir, writeFile } from "node:fs/promises";

import { buildMarketScreenModel, buildRouterScreenModel } from "../apps/web/src/index.ts";
import { renderMarketPage } from "../apps/web/src/market-page.ts";

await mkdir("dist", { recursive: true });
await writeFile(
  "dist/market.html",
  renderMarketPage(await buildMarketScreenModel(), buildRouterScreenModel())
);
console.log("Built dist/market.html");
