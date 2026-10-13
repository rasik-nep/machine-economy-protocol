import { z } from "zod";

/** Snapshots of each run are captured here by the demo server; the folder is ignored by Git. */
export const REPLAY_CAPTURE_DIR = ".anchor/replay";
/** The published bundle name, served next to the snapshots on the static site. */
export const REPLAY_BUNDLE_FILE = "evidence-bundle.json";
const STAGES = 9;

const snapshot = z
  .object({
    stage: z
      .number()
      .int()
      .min(0)
      .max(STAGES - 1),
    run: z.number().int(),
    network: z.enum(["localnet", "devnet"]),
    stages: z.array(z.string()).length(STAGES),
    evidenceBundle: z.string().optional(),
    summary: z.object({ text: z.string(), model: z.string(), advisory: z.boolean() }).optional()
  })
  .passthrough();
export type ReplaySnapshot = z.infer<typeof snapshot>;

/**
 * Checks that captured snapshots form one complete run, then prepares them for
 * publication: an advisory summary requested at any finalized stage is shown on every
 * finalized stage, and the local evidence-bundle path becomes the published file name.
 */
export function prepareReplay(
  captured: readonly unknown[],
  options: { allowLocalnet?: boolean; bundlePublished: boolean }
): ReplaySnapshot[] {
  const snapshots = captured.map((s) => snapshot.parse(s)).sort((a, b) => a.stage - b.stage);
  if (snapshots.length !== STAGES || snapshots.some((s, i) => s.stage !== i))
    throw new Error(
      `A replay needs exactly one snapshot for each of the ${String(STAGES)} stages.`
    );
  const { run, network } = snapshots[0] ?? {};
  if (snapshots.some((s) => s.run !== run || s.network !== network))
    throw new Error("Every replay snapshot must come from the same run and network.");
  if (network !== "devnet" && !options.allowLocalnet)
    throw new Error("Publish devnet runs only: localnet Explorer links do not work for others.");
  const summary = snapshots.filter((s) => s.summary).at(-1)?.summary;
  return snapshots.map((s) => {
    const { evidenceBundle, ...rest } = s;
    return {
      ...rest,
      ...(evidenceBundle && options.bundlePublished ? { evidenceBundle: REPLAY_BUNDLE_FILE } : {}),
      ...(s.stage >= 6 && summary ? { summary } : {}),
      // Recorded runs never show transient server state.
      busy: false,
      error: null,
      canAbandon: false
    };
  });
}
