import { describe, expect, it } from "vitest";

import { parseReplayStage, replaySnapshotPath, replayStageAfter } from "./replay-mode.js";

describe("replay mode stepping", () => {
  it("follows the same stage transitions as the demo server", () => {
    expect(replayStageAfter("/demo/next", 0)).toBe(1);
    expect(replayStageAfter("/demo/degrade", 1)).toBe(2);
    expect(replayStageAfter("/demo/resolve", 2)).toBe(6);
    expect(replayStageAfter("/demo/next", 6)).toBe(7);
    expect(replayStageAfter("/demo/next", 7)).toBe(8);
    expect(replayStageAfter("/demo/run", 3)).toBe(8);
    expect(replayStageAfter("/demo/reset", 8)).toBe(0);
  });

  it("rejects actions that are out of order or live-only", () => {
    expect(replayStageAfter("/demo/degrade", 0)).toBeUndefined();
    expect(replayStageAfter("/demo/resolve", 4)).toBeUndefined();
    expect(replayStageAfter("/demo/next", 8)).toBeUndefined();
    expect(replayStageAfter("/demo/summary", 8)).toBeUndefined();
  });

  it("accepts only stored stages from 0 to 8", () => {
    expect(parseReplayStage("0")).toBe(0);
    expect(parseReplayStage("8")).toBe(8);
    expect(parseReplayStage("9")).toBeUndefined();
    expect(parseReplayStage("-1")).toBeUndefined();
    expect(parseReplayStage("1.5")).toBeUndefined();
    expect(parseReplayStage(null)).toBeUndefined();
    expect(replaySnapshotPath(3)).toBe("/replay/stage-3.json");
  });
});
