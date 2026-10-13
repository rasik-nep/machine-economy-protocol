// Publishes a captured demo run as the static site's replay data.
//   pnpm replay:export [--run <devnet-1791…>] [--out <dir>] [--allow-localnet]
// With no --run, it picks the newest complete devnet run in .anchor/replay.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const { prepareReplay, REPLAY_BUNDLE_FILE, REPLAY_CAPTURE_DIR } = await import(
  "../apps/api/src/replay.ts"
);
const { values } = parseArgs({
  options: {
    run: { type: "string" },
    out: { type: "string", default: "apps/web/replay" },
    "allow-localnet": { type: "boolean", default: false }
  }
});
const allowLocalnet = values["allow-localnet"];
const stageFiles = Array.from({ length: 9 }, (_, i) => `stage-${String(i)}.json`);

async function pickRun() {
  if (values.run) return values.run;
  const runs = existsSync(REPLAY_CAPTURE_DIR) ? await readdir(REPLAY_CAPTURE_DIR) : [];
  const candidates = runs
    .filter((name) => /^(devnet|localnet)-\d+$/.test(name))
    .filter((name) => allowLocalnet || name.startsWith("devnet-"))
    .filter((name) => stageFiles.every((f) => existsSync(`${REPLAY_CAPTURE_DIR}/${name}/${f}`)))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  if (!candidates[0])
    throw new Error(
      `No complete ${allowLocalnet ? "" : "devnet "}run in ${REPLAY_CAPTURE_DIR}. Run the full demo first.`
    );
  return candidates[0];
}

try {
  const run = await pickRun();
  if (!/^(devnet|localnet)-\d+$/.test(run)) throw new Error(`Invalid run name: ${run}`);
  const captured = await Promise.all(
    stageFiles.map(async (f) =>
      JSON.parse(await readFile(`${REPLAY_CAPTURE_DIR}/${run}/${f}`, "utf8"))
    )
  );
  const bundle = `.anchor/runs/${run}/evidence-bundle.json`;
  const bundlePublished = existsSync(bundle);
  const replay = prepareReplay(captured, { allowLocalnet, bundlePublished });
  // Every stage is overwritten; a bundle from an earlier replay must not survive.
  await mkdir(values.out, { recursive: true });
  await rm(`${values.out}/${REPLAY_BUNDLE_FILE}`, { force: true });
  for (const snapshot of replay)
    await writeFile(
      `${values.out}/stage-${String(snapshot.stage)}.json`,
      `${JSON.stringify(snapshot, null, 2)}\n`
    );
  if (bundlePublished) await copyFile(bundle, `${values.out}/${REPLAY_BUNDLE_FILE}`);
  console.log(
    `Exported ${run} (${replay[0].network}) to ${values.out}${bundlePublished ? " with its evidence bundle" : ""}.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
