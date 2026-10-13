/**
 * Replay mode serves a recorded run as static snapshots, one per stage, so the public
 * site needs no demo server, wallet, or RPC. Every address and signature in a snapshot
 * stays verifiable on Solana Explorer.
 */
export const REPLAY_FINAL_STAGE = 8;

export const replaySnapshotPath = (stage: number) => `/replay/stage-${String(stage)}.json`;

/** The stage a demo action leads to, mirroring the demo server's action handling. */
export function replayStageAfter(action: string, stage: number): number | undefined {
  if (action === "/demo/reset") return 0;
  if (action === "/demo/run") return REPLAY_FINAL_STAGE;
  if (action === "/demo/resolve") return stage === 2 ? 6 : undefined;
  if (action === "/demo/degrade") return stage === 1 ? 2 : undefined;
  if (action === "/demo/next") return stage < REPLAY_FINAL_STAGE ? stage + 1 : undefined;
  // Live-only actions, such as requesting a new Gemini summary, are not replayable.
  return undefined;
}

/** A stored stage is trusted only if it is a whole stage number. */
export function parseReplayStage(value: string | null): number | undefined {
  if (value === null || !/^\d$/.test(value)) return undefined;
  const stage = Number(value);
  return stage <= REPLAY_FINAL_STAGE ? stage : undefined;
}
