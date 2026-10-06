import { STOCK_AGENT_MANIFESTS, STOCK_MODEL_MANIFESTS } from "@mep/fixtures";
import { type FoundationManifest, type HashHex, manifestRoot } from "@mep/protocol";

export const APP_NAME = "Machine Economy Protocol";
export const FIRST_UI_MODE = "guided-judge-demo";

export type RegistryRow = {
  readonly id: string;
  readonly displayName: string;
  readonly kind: FoundationManifest["kind"];
  readonly stockOrigin: "canonical-demo-fixture";
  readonly manifestRoot: HashHex;
  readonly verificationStatus: "verified";
};

export async function buildFoundationRegistryRows(): Promise<readonly RegistryRow[]> {
  const manifests = [...STOCK_MODEL_MANIFESTS, ...STOCK_AGENT_MANIFESTS];

  return Promise.all(
    manifests.map(async (manifest) => ({
      id: manifest.id,
      displayName: manifest.displayName,
      kind: manifest.kind,
      stockOrigin: "canonical-demo-fixture" as const,
      manifestRoot: await manifestRoot(manifest),
      verificationStatus: "verified" as const
    }))
  );
}
