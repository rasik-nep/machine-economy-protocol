/* Fixed fixture indices and stage-gated fields are validated by initialize/next. */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction
} from "@solana/web3.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { MachineEconomyProtocol } from "../../../target/types/machine_economy_protocol.ts";
import {
  STOCK_MODEL_MANIFESTS,
  STOCK_AGENT_MANIFESTS,
  DEMO_CANARY_COUNT,
  DEMO_COMPUTE_OFFERS,
  DEMO_COMPUTE_TASK,
  DEMO_PARENT_AGENT_SERVICE_PRICE_LAMPORTS,
  DEMO_PARENT_CONTRACT_TERMS,
  DEMO_PROVIDERS,
  DEMO_MODEL_INSTANCES,
  DEMO_SUBCONTRACT_PRICE_LAMPORTS,
  DEMO_SIMULATED_HARDWARE_TIERS,
  DEMO_SUBCONTRACT_TERMS,
  DEMO_TASK_INPUT,
  demoComputeTerms
} from "../../../packages/fixtures/src/index.ts";
import {
  agentProfitAndLoss,
  canonicalize,
  manifestRoot,
  sha256Hex,
  type DemoContractTerms,
  type HashHex,
  type PnlContract,
  type UtilityBreakdown
} from "../../../packages/protocol/src/index.ts";
import {
  RESERVATION_CLASSES,
  marketFromChain,
  type ChainMarket
} from "../../../packages/protocol/src/chain-market.ts";
import {
  buildFailureEvidence,
  genesisMemory,
  learnFromPrecedent,
  memoryRoot,
  verifyAgainstContract,
  verifyPrecedent,
  type AgentMemory,
  type ContractCommitments,
  type FailureEvidence,
  type VerificationMaterial,
  type VerifiedPrecedent
} from "../../../packages/protocol/src/learning.ts";
import {
  ReceiptReplayGuard,
  type ExecutionReceipt
} from "../../../packages/protocol/src/receipt.ts";
import { jobExecutionTrust, type TrustLabel } from "../../../packages/protocol/src/trust.ts";
import {
  CHECKER,
  buildVerificationPolicy,
  checkerCodeRoot,
  drawCanaries,
  resultRoot,
  seedCommitment,
  type CanaryPool,
  type VerificationPolicy,
  type VerificationResult
} from "../../../packages/protocol/src/verifier.ts";
import {
  DEVNET_GENESIS_HASH,
  FUNDING,
  TIMING,
  explorerUrl,
  resolveCluster,
  type Cluster
} from "./cluster.ts";
import { poolFor, serveJob, type ServingMode } from "./provider-daemon.ts";
import { policy, rankMarket } from "./scenario.ts";
const { AnchorError, AnchorProvider, Program, Wallet, BN } = anchor;
const id = new PublicKey("2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE");
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const WALLETS_FILE = ".anchor/demo-wallets.json";
/** programs/machine-economy-protocol/src/constants.rs REVIEW_WINDOW_SLOTS. */
const REVIEW_WINDOW_SLOTS = 1_500;
const DEVNET_WALLETS_FILE = ".anchor/devnet-wallets.json";
// The parent is created at reset but funded only when the run starts, so its
// deadline (~4.6 days of slots) must outlast an idle dashboard and a slow demo.
const PARENT_DEADLINE_SLOTS = 1_000_000;
const CHILD_DEADLINE_SLOTS = 5_000;
// Demo script only: four jurors find a breach and one dissents. The program's
// majority-of-five rule is unchanged. 1 = provider breached, 2 = did not breach.
export const JUROR_VOTES = [1, 1, 1, 1, 2] as const;
const bytes = (root: HashHex) => Array.from(Buffer.from(root.slice(7), "hex"));
const digest = (...parts: Uint8Array[]) =>
  Array.from(createHash("sha256").update(Buffer.concat(parts)).digest());
const rootHex = (root: number[]): HashHex => `sha256:${Buffer.from(root).toString("hex")}`;
const pda = (seed: string, ...parts: Uint8Array[]) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), ...parts], id)[0];
const indexBytes = (n: number) => new BN(n).toArrayLike(Buffer, "le", 8);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;
const unique = (keys: PublicKey[]) =>
  [...new Set(keys.map((key) => key.toBase58()))].map((key) => new PublicKey(key));
/** Display name for a provider, matched by the evidence root it registered on-chain. */
const providerName = (evidenceRoot: HashHex, address: string) =>
  DEMO_PROVIDERS.find((p) => p.evidenceRoot === evidenceRoot)?.displayName.split(" · ")[0] ??
  `Provider ${short(address)}`;
async function termRoots(terms: DemoContractTerms) {
  return {
    task: bytes(await sha256Hex(canonicalize(terms.task))),
    verification: bytes(await sha256Hex(canonicalize(terms.verificationRule))),
    liability: bytes(await sha256Hex(canonicalize(terms.liabilityRule)))
  };
}
export const stages = [
  "Foundation ready",
  "Work in progress",
  "Verification failed",
  "Dispute opened",
  "Votes committed",
  "Votes revealed",
  "Ruling finalized",
  "Memory checkpointed",
  "Second job settled"
] as const;
type Receipt = { label: string; signature: string };
/** A hiring decision: the winning on-chain offer's score and its provider's name. */
type Choice = UtilityBreakdown & { providerName: string };
/** A compute job's verification policy, fixed before the contract is created. */
type JobPlan = {
  seed: string;
  pool: CanaryPool;
  policy: VerificationPolicy;
};
/** What the customer checked about one delivered job. */
export type JobVerification = {
  contract: string;
  policyRoot: string;
  receipt: ExecutionReceipt & { label: "provider-signed" | "observer-signed" };
  /** Execution trust this job earned, from the receipt and verification result. */
  executionTrust: TrustLabel<string>;
  result: VerificationResult;
};

/** Short, readable error text for the dashboard instead of raw program logs. */
export function describeError(error: unknown): string {
  if (error instanceof AnchorError)
    return `${error.error.errorMessage} (${error.error.errorCode.code})`;
  if (error instanceof Error) return error.message.split("\n")[0]!.slice(0, 300);
  return "Operation failed";
}

const secretKeys = (count: number) =>
  z.array(z.array(z.number().int().min(0).max(255)).length(64)).length(count);

async function loadOrCreateKeys(file: string, count: number): Promise<Keypair[]> {
  await mkdir(".anchor", { recursive: true });
  try {
    return secretKeys(count)
      .parse(JSON.parse(await readFile(file, "utf8")))
      .map((k) => Keypair.fromSecretKey(Uint8Array.from(k)));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const keys = Array.from({ length: count }, () => Keypair.generate());
    await writeFile(file, JSON.stringify(keys.map((k) => Array.from(k.secretKey))), {
      mode: 0o600
    });
    return keys;
  }
}

/**
 * Disposable demo wallets. On localnet all eleven are generated and persisted so the
 * demo validator can name the deployer. On devnet the owner is the pre-funded
 * deployer keypair named by MEP_DEVNET_KEYPAIR, and the other ten are generated.
 */
export async function loadDemoWallets(cluster: Cluster = "localnet"): Promise<Keypair[]> {
  if (cluster === "localnet") return loadOrCreateKeys(WALLETS_FILE, 11);
  const path = process.env.MEP_DEVNET_KEYPAIR?.replace(/^~(?=\/)/, homedir());
  if (!path)
    throw new Error(
      "Set MEP_DEVNET_KEYPAIR to the devnet keypair that deployed the program. Never use a wallet that holds mainnet funds."
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    // JSON.parse errors quote the file's opening bytes, which may be key material.
    throw new Error("MEP_DEVNET_KEYPAIR must name a readable JSON keypair file.");
  }
  const [secret] = secretKeys(1).parse([parsed]);
  return [
    Keypair.fromSecretKey(Uint8Array.from(secret!)),
    ...(await loadOrCreateKeys(DEVNET_WALLETS_FILE, 10))
  ];
}

export class ActiveEscrowError extends Error {}

export class DemoChain {
  connection = new Connection(RPC_URL, "confirmed");
  cluster: Cluster = "localnet";
  keys!: Keypair[];
  program!: anchor.Program<MachineEconomyProtocol>;
  config = pda("protocol-config");
  stage = 0;
  receipts: Receipt[] = [];
  run = Date.now();
  agent!: PublicKey;
  twin!: PublicKey;
  specialist!: PublicKey;
  parent!: PublicKey;
  child!: PublicKey;
  contract!: PublicKey;
  second!: PublicKey;
  dispute!: PublicKey;
  precedent!: PublicKey;
  providers: PublicKey[] = [];
  instances: PublicKey[] = [];
  offerKeys: PublicKey[] = [];
  /** The agent's first and second hiring decisions, ranked from on-chain offers. */
  firstChoice?: Choice;
  secondChoice?: Choice;
  /** Root of the checker source this process runs; committed in every job policy. */
  codeRoot!: HashHex;
  firstJob?: JobPlan;
  secondJob?: JobPlan;
  firstVerification?: JobVerification;
  secondVerification?: JobVerification;
  /** Each receipt is accepted once per run. */
  receiptGuard = new ReceiptReplayGuard();
  firstMaterial?: VerificationMaterial;
  evidence?: FailureEvidence;
  evidenceBundlePath?: string;
  evidenceRoot?: HashHex;
  verified?: VerifiedPrecedent;
  // Each agent's private memory document. Only its root is on-chain, in the passport.
  memory!: AgentMemory;
  twinMemory!: AgentMemory;
  genesisRoot!: HashHex;
  initialMemoryRoot!: HashHex;
  twinInitialMemoryRoot!: HashHex;
  commitEnd = 0;
  revealEnd = 0;
  nonces: number[][] = [];
  /** The run missed an on-chain window that no retry can reopen. */
  abandonable = false;
  summary?: { text: string; model: string; advisory: boolean };
  get timing() {
    return TIMING[this.cluster];
  }
  get owner() {
    return this.keys[0]!;
  }
  get supplier() {
    return this.keys[1]!;
  }
  get client() {
    return this.keys[2]!;
  }
  get jurors() {
    return this.keys.slice(6, 11);
  }
  providerKey(index: number) {
    return this.keys[index + 3]!;
  }
  async record(label: string, transaction: Promise<string>, into = this.receipts) {
    const signature = await transaction;
    into.push({ label, signature });
    return signature;
  }
  async exists(key: PublicKey) {
    return !!(await this.connection.getAccountInfo(key));
  }
  async status(key: PublicKey) {
    const c = await this.program.account.workContract.fetchNullable(key);
    return c ? Object.keys(c.status)[0]! : null;
  }
  explorer(kind: "tx" | "address", value: string) {
    return explorerUrl(kind, value, this.cluster, RPC_URL);
  }
  async topUpWallets() {
    if (this.cluster === "localnet") {
      const { minLamports, topUpLamports } = FUNDING.localnet;
      for (const key of this.keys) {
        if ((await this.connection.getBalance(key.publicKey)) < minLamports) {
          const sig = await this.connection.requestAirdrop(key.publicKey, topUpLamports);
          await this.connection.confirmTransaction(
            { signature: sig, ...(await this.connection.getLatestBlockhash()) },
            "confirmed"
          );
        }
      }
      return;
    }
    const { minLamports, topUpLamports, ownerReserveLamports } = FUNDING.devnet;
    const balances = await Promise.all(
      this.keys.map((key) => this.connection.getBalance(key.publicKey))
    );
    const transfers = this.keys
      .slice(1)
      .map((key, i) => ({ key, balance: balances[i + 1]! }))
      .filter(({ balance }) => balance < minLamports)
      .map(({ key, balance }) => ({ key, lamports: topUpLamports - balance }));
    const required =
      transfers.reduce((sum, transfer) => sum + transfer.lamports, 0) + ownerReserveLamports;
    if (balances[0]! < required)
      throw new Error(
        `The devnet owner ${this.owner.publicKey.toBase58()} holds ${String(balances[0]! / 1e9)} SOL and needs ${String(required / 1e9)} SOL. Request devnet SOL early: the faucet is rate-limited.`
      );
    if (transfers.length === 0) return;
    const tx = new Transaction().add(
      ...transfers.map(({ key, lamports }) =>
        SystemProgram.transfer({
          fromPubkey: this.owner.publicKey,
          toPubkey: key.publicKey,
          lamports
        })
      )
    );
    await sendAndConfirmTransaction(this.connection, tx, [this.owner], {
      commitment: "confirmed"
    });
  }
  async initialize() {
    this.cluster = resolveCluster(RPC_URL, process.env.SOLANA_CLUSTER || undefined);
    if (this.cluster === "devnet") {
      if ((await this.connection.getGenesisHash()) !== DEVNET_GENESIS_HASH)
        throw new Error("SOLANA_RPC_URL does not serve devnet. Refusing to continue.");
      if (!(await this.exists(id)))
        throw new Error(
          `Program ${id.toBase58()} is not deployed on devnet. See docs/devnet.md; deploying needs explicit approval.`
        );
    }
    this.codeRoot = await checkerCodeRoot((path) => readFile(path, "utf8"));
    this.keys = await loadDemoWallets(this.cluster);
    await this.topUpWallets();
    const raw: unknown = JSON.parse(
      await readFile("target/idl/machine_economy_protocol.json", "utf8")
    );
    this.program = new Program<MachineEconomyProtocol>(
      raw,
      new AnchorProvider(this.connection, new Wallet(this.owner), { commitment: "confirmed" })
    );
    const m = this.program.methods;
    if (!(await this.exists(this.config))) {
      try {
        await this.record(
          "Initialize protocol",
          m
            .initializeProtocol(1, this.owner.publicKey)
            .accountsPartial({
              authority: this.owner.publicKey,
              programData: PublicKey.findProgramAddressSync(
                [id.toBuffer()],
                BPF_LOADER_UPGRADEABLE
              )[0]
            })
            .rpc()
        );
      } catch (error) {
        throw new Error(
          this.cluster === "localnet"
            ? `Protocol initialization failed: ${describeError(error)}. Only the program's upgrade authority can initialize it. Stop any running validator and use \`pnpm dev\`, which deploys the program with the demo wallet.`
            : `Protocol initialization failed: ${describeError(error)}. MEP_DEVNET_KEYPAIR must be the program's upgrade authority.`
        );
      }
    }
    const config = await this.program.account.protocolConfig.fetch(this.config);
    if (!config.demoAuthority.equals(this.owner.publicKey))
      throw new Error(
        this.cluster === "localnet"
          ? "Localnet belongs to another demo authority. Use the isolated demo validator command."
          : "This devnet deployment belongs to another demo authority."
      );
    const models: PublicKey[] = [];
    for (const model of STOCK_MODEL_MANIFESTS) {
      const root = await manifestRoot(model);
      const key = pda("model-record", Buffer.from(bytes(root)));
      models.push(key);
      if (!(await this.exists(key)))
        await this.record(
          "Register stock model",
          m
            .registerStockModel(bytes(root), bytes(model.artifact.hash), model.version)
            .accountsPartial({ authority: this.owner.publicKey })
            .rpc()
        );
    }
    for (let i = 0; i < 3; i++) {
      const signer = this.providerKey(i);
      const fixture = DEMO_PROVIDERS[i]!;
      const offer = DEMO_COMPUTE_OFFERS[i]!;
      const provider = pda("provider-record", signer.publicKey.toBuffer());
      this.providers.push(provider);
      if (!(await this.exists(provider)))
        await this.record(
          "Register provider",
          m
            .registerProvider(
              bytes(fixture.evidenceRoot),
              fixture.hardwareTrustBps,
              fixture.executionTrustBps
            )
            .accountsPartial({ authority: signer.publicKey })
            .signers([signer])
            .rpc()
        );
      const model = models[i === 2 ? 1 : 0]!;
      const instance = pda("model-instance", provider.toBuffer(), model.toBuffer());
      this.instances.push(instance);
      if (!(await this.exists(instance)))
        await this.record(
          "Register model instance",
          m
            .registerModelInstance(
              bytes(DEMO_MODEL_INSTANCES[i]!.executionCommitment),
              DEMO_MODEL_INSTANCES[i]!.modelTrustBps
            )
            .accountsPartial({
              provider: signer.publicKey,
              providerRecord: provider,
              modelRecord: model
            })
            .signers([signer])
            .rpc()
        );
      const key = pda("compute-offer", instance.toBuffer(), indexBytes(0));
      this.offerKeys.push(key);
      const reservationClass = RESERVATION_CLASSES.indexOf(offer.reservationClass);
      const existing = await this.program.account.computeOffer.fetchNullable(key);
      if (!existing)
        await this.record(
          "Publish compute offer",
          m
            .publishComputeOffer(
              new BN(0),
              new BN(offer.priceLamports),
              offer.expectedLatencyMs,
              offer.failureProbabilityBps,
              reservationClass
            )
            .accountsPartial({
              provider: signer.publicKey,
              providerRecord: provider,
              modelInstance: instance
            })
            .signers([signer])
            .rpc()
        );
      else if (
        existing.priceLamports.toNumber() !== offer.priceLamports ||
        existing.expectedLatencyMs !== offer.expectedLatencyMs ||
        existing.failureProbabilityBps !== offer.failureProbabilityBps ||
        existing.reservationClass !== reservationClass
      )
        // Agents rank what is on-chain, so stale offers would change the scenario.
        throw new Error(
          `${fixture.displayName}'s on-chain offer has older terms than the fixtures. Start the demo on a fresh ledger.`
        );
    }
    await this.reset();
  }
  agentAddress(signer: Keypair, stock: HashHex, index: number) {
    return pda(
      "agent-passport",
      signer.publicKey.toBuffer(),
      Buffer.from(bytes(stock)),
      indexBytes(index)
    );
  }
  async newAgent(signer: Keypair, stock: HashHex, memory: HashHex, index: number, into: Receipt[]) {
    await this.record(
      "Create agent passport",
      this.program.methods
        .createAgent(bytes(stock), bytes(memory), new BN(index))
        .accountsPartial({ owner: signer.publicKey })
        .signers(signer === this.owner ? [] : [signer])
        .rpc(),
      into
    );
    return this.agentAddress(signer, stock, index);
  }
  /**
   * Marks the run as past recovery by retrying. On localnet its escrow belongs to
   * disposable wallets on a throwaway ledger, so a fresh run may abandon it.
   */
  unrecoverable(reason: string): Error {
    this.abandonable = true;
    return new Error(
      this.cluster === "localnet"
        ? `${reason} Start a fresh run to retry; this run's localnet escrow is abandoned.`
        : `${reason} This run cannot finish; restart the demo server to begin a new one. Its devnet escrow stays in the contract accounts.`
    );
  }
  /** Preserve the current run and vote secrets until every funded obligation is resolved. */
  async assertResetAllowed() {
    if (this.abandonable && this.cluster === "localnet") return;
    const addresses = [this.parent, this.child, this.contract, this.second].filter((key) =>
      Boolean(key)
    );
    for (const address of addresses) {
      const contract = await this.program.account.workContract.fetchNullable(address);
      if (contract && !contract.escrowLamports.isZero())
        throw new ActiveEscrowError(
          "Cannot reset while escrow is active. Resolve the current run before starting another."
        );
    }
  }
  /** Starts fresh only after existing escrow is resolved; initialization has no contracts. */
  async reset() {
    await this.assertResetAllowed();
    await this.topUpWallets();
    const run = Math.max(Date.now(), this.run + 10);
    const receipts: Receipt[] = [];
    const genesisRoot = await manifestRoot(STOCK_AGENT_MANIFESTS[0]);
    // Agent A and its twin share the stock agent and start from the same knowledge,
    // but each memory names its own passport, so the two roots are independent.
    const agentGenesis = await genesisMemory(
      this.agentAddress(this.owner, genesisRoot, run).toBase58(),
      genesisRoot
    );
    const twinGenesis = await genesisMemory(
      this.agentAddress(this.owner, genesisRoot, run + 1).toBase58(),
      genesisRoot
    );
    const agent = await this.newAgent(this.owner, genesisRoot, agentGenesis.root, run, receipts);
    const twin = await this.newAgent(this.owner, genesisRoot, twinGenesis.root, run + 1, receipts);
    const specialist = await this.newAgent(
      this.supplier,
      await manifestRoot(STOCK_AGENT_MANIFESTS[1]),
      await sha256Hex("specialist memory"),
      run,
      receipts
    );
    const clientAgent = await this.newAgent(
      this.client,
      genesisRoot,
      await sha256Hex("client memory"),
      run,
      receipts
    );
    const parent = pda("work-contract", clientAgent.toBuffer(), indexBytes(run));
    const roots = await termRoots(DEMO_PARENT_CONTRACT_TERMS);
    await this.record(
      "Create parent work contract",
      this.program.methods
        .createAgentContract(
          new BN(run),
          new BN(DEMO_PARENT_AGENT_SERVICE_PRICE_LAMPORTS),
          roots.task,
          roots.verification,
          roots.liability,
          new BN((await this.connection.getSlot()) + PARENT_DEADLINE_SLOTS)
        )
        .accountsPartial({
          customer: this.client.publicKey,
          customerAgent: clientAgent,
          supplierAgent: agent
        })
        .signers([this.client])
        .rpc(),
      receipts
    );
    Object.assign(this, {
      run,
      stage: 0,
      receipts,
      agent,
      twin,
      specialist,
      parent,
      genesisRoot,
      initialMemoryRoot: agentGenesis.root,
      twinInitialMemoryRoot: twinGenesis.root,
      memory: agentGenesis.memory,
      twinMemory: twinGenesis.memory,
      child: undefined,
      contract: undefined,
      second: undefined,
      dispute: undefined,
      precedent: undefined,
      firstChoice: undefined,
      secondChoice: undefined,
      firstJob: undefined,
      secondJob: undefined,
      firstVerification: undefined,
      secondVerification: undefined,
      receiptGuard: new ReceiptReplayGuard(),
      firstMaterial: undefined,
      evidence: undefined,
      evidenceBundlePath: undefined,
      evidenceRoot: undefined,
      verified: undefined,
      abandonable: false,
      summary: undefined,
      nonces: []
    });
  }
  /** Reads every compute offer from the program, with the accounts it references. */
  /**
   * The demo's own offers, decoded from the chain. publish_compute_offer is
   * permissionless, and the demo daemon can serve only its own providers, so an
   * outside offer on a shared cluster must not be able to win and stall a run.
   */
  async fetchMarket(): Promise<ChainMarket> {
    const fetched = await this.program.account.computeOffer.fetchMultiple(this.offerKeys);
    const offers = this.offerKeys.flatMap((publicKey, i) => {
      const account = fetched[i];
      return account ? [{ publicKey, account }] : [];
    });
    const instanceKeys = unique(offers.map((o) => o.account.modelInstance));
    const providerKeys = unique(offers.map((o) => o.account.provider));
    const [instances, providers] = await Promise.all([
      this.program.account.modelInstance.fetchMultiple(instanceKeys),
      this.program.account.providerRecord.fetchMultiple(providerKeys)
    ]);
    const recordKeys = unique(instances.flatMap((i) => (i ? [i.modelRecord] : [])));
    const records = await this.program.account.modelRecord.fetchMultiple(recordKeys);
    return marketFromChain(
      {
        offers: offers.map(({ publicKey, account }) => ({
          address: publicKey.toBase58(),
          provider: account.provider.toBase58(),
          modelInstance: account.modelInstance.toBase58(),
          priceLamports: BigInt(account.priceLamports.toString()),
          expectedLatencyMs: account.expectedLatencyMs,
          failureProbabilityBps: account.failureProbabilityBps,
          reservationClass: account.reservationClass
        })),
        modelInstances: instanceKeys.flatMap((key, i) => {
          const instance = instances[i];
          return instance
            ? [
                {
                  address: key.toBase58(),
                  provider: instance.provider.toBase58(),
                  modelRecord: instance.modelRecord.toBase58(),
                  executionCommitment: rootHex(instance.executionCommitment),
                  trustScoreBps: instance.trustScoreBps
                }
              ]
            : [];
        }),
        providers: providerKeys.flatMap((key, i) => {
          const provider = providers[i];
          return provider
            ? [
                {
                  address: key.toBase58(),
                  evidenceRoot: rootHex(provider.evidenceRoot),
                  hardwareTrustBps: provider.hardwareTrustBps,
                  executionTrustBps: provider.executionTrustBps,
                  breachCount: provider.breachCount
                }
              ]
            : [];
        }),
        modelRecords: recordKeys.flatMap((key, i) => {
          const record = records[i];
          return record
            ? [{ address: key.toBase58(), manifestRoot: rootHex(record.manifestRoot) }]
            : [];
        })
      },
      STOCK_MODEL_MANIFESTS,
      {
        providerName: (provider) => providerName(provider.evidenceRoot, provider.address),
        // Fixture mode: only the providers this demo runs, identified by the provider
        // record each of its own keys owns, carry simulated hardware tiers.
        simulatedHardwareTier: (provider) => {
          const index = this.providers.findIndex((key) => key.toBase58() === provider.address);
          const fixture = DEMO_PROVIDERS[index];
          return fixture ? DEMO_SIMULATED_HARDWARE_TIERS[fixture.id] : undefined;
        }
      }
    );
  }
  /** Fails unless the agent's local memory document is the one its passport commits to. */
  async verifiedMemory(passport: PublicKey, memory: AgentMemory) {
    const account = await this.program.account.agentPassport.fetch(passport);
    if (rootHex(account.currentMemoryRoot) !== (await memoryRoot(memory)))
      throw new Error("Local agent memory does not match the passport's on-chain memory root");
    return memory;
  }
  /** Ranks on-chain offers with the agent's verified memory and picks the cheapest. */
  async choose(passport: PublicKey, memory: AgentMemory) {
    const learned = await this.verifiedMemory(passport, memory);
    const market = await this.fetchMarket();
    const best = rankMarket(market, learned.failureProbabilityOverridesBps)[0];
    if (!best) throw new Error("No on-chain offer fits the agent's policy");
    const index = this.offerKeys.findIndex((key) => key.toBase58() === best.offerId);
    if (index < 0) throw new Error("The best offer belongs to a provider this demo does not run");
    const providerName = market.providers.find((p) => p.id === best.providerId)!.displayName;
    return { winner: { ...best, providerName }, index };
  }
  // Each helper advances a contract only from the status it expects, so a step
  // that failed halfway can be retried without replaying confirmed transactions.
  async fund(key: PublicKey, signer: Keypair) {
    if ((await this.status(key)) !== "draft") return;
    await this.record(
      "Fund escrow",
      this.program.methods
        .fundContract()
        .accountsPartial({ customer: signer.publicKey, workContract: key })
        .signers(signer === this.owner ? [] : [signer])
        .rpc()
    );
  }
  async start(key: PublicKey, signer: Keypair) {
    if ((await this.status(key)) !== "funded") return;
    await this.record(
      "Start work",
      this.program.methods
        .startContract()
        .accountsPartial({ provider: signer.publicKey, workContract: key })
        .signers(signer === this.owner ? [] : [signer])
        .rpc()
    );
  }
  async complete(key: PublicKey, supplier: Keypair, customer: Keypair) {
    let status = await this.status(key);
    if (status === "running") {
      await this.record(
        "Submit committed result",
        this.program.methods
          .submitResult(
            bytes(
              await sha256Hex(
                canonicalize({ contract: key.toBase58(), result: "verified evidence summary" })
              )
            )
          )
          .accountsPartial({ provider: supplier.publicKey, workContract: key })
          .signers(supplier === this.owner ? [] : [supplier])
          .rpc()
      );
      status = "submitted";
    }
    if (status === "submitted") {
      await this.record(
        "Verify result",
        this.program.methods
          .verifyContract()
          .accountsPartial({ customer: customer.publicKey, workContract: key })
          .signers(customer === this.owner ? [] : [customer])
          .rpc()
      );
      status = "verified";
    }
    if (status === "verified")
      await this.record(
        "Settle escrow",
        this.program.methods
          .settleContract()
          .accountsPartial({ workContract: key, providerWallet: supplier.publicKey })
          .rpc()
      );
  }
  /**
   * Fixes a compute job's verification policy before hiring: a fresh canary seed is
   * drawn and only its commitment enters the policy, so the provider cannot know which
   * prompts are canaries and the customer cannot pick them after seeing the output.
   */
  async planJob(choice: Choice): Promise<JobPlan> {
    const seed = randomBytes(32).toString("hex");
    const pool = poolFor(choice.stockModelId);
    const policy = await buildVerificationPolicy({
      codeRoot: this.codeRoot,
      pool,
      canaryCount: DEMO_CANARY_COUNT,
      seedCommitment: await seedCommitment(seed)
    });
    return { seed, pool, policy };
  }
  /** Creates, funds, and starts a compute job in one atomic transaction. */
  async computeContract(
    choice: Choice,
    providerIndex: number,
    index: number,
    slots: number,
    job: JobPlan
  ) {
    const key = pda("work-contract", this.agent.toBuffer(), indexBytes(index));
    if (await this.exists(key)) return key;
    const m = this.program.methods;
    const provider = this.providerKey(providerIndex);
    // The verification policy is the committed verification rule.
    const roots = await termRoots(demoComputeTerms(job.policy));
    const follow: TransactionInstruction[] = [
      await m
        .fundContract()
        .accountsPartial({ customer: this.owner.publicKey, workContract: key })
        .instruction(),
      await m
        .startContract()
        .accountsPartial({ provider: provider.publicKey, workContract: key })
        .instruction()
    ];
    await this.record(
      `Hire ${choice.providerName}: create, fund, start`,
      m
        .createContract(
          new BN(index),
          roots.task,
          roots.verification,
          roots.liability,
          new BN((await this.connection.getSlot()) + slots)
        )
        .accountsPartial({
          customer: this.owner.publicKey,
          customerAgent: this.agent,
          computeOffer: this.offerKeys[providerIndex]!,
          providerRecord: this.providers[providerIndex]!,
          workContract: key
        })
        .postInstructions(follow)
        .signers([provider])
        .rpc()
    );
    return key;
  }
  /**
   * The customer sends the task with the drawn canaries; the provider daemon serves it,
   * signs a receipt as the provider, and commits the result root before the deadline.
   */
  async deliver(
    key: PublicKey,
    choice: Choice,
    providerIndex: number,
    mode: ServingMode,
    job: JobPlan
  ): Promise<VerificationMaterial> {
    const drawn = await drawCanaries(
      job.pool,
      job.seed,
      key.toBase58(),
      job.policy.sampling.canaryCount
    );
    const provider = this.providerKey(providerIndex);
    const { result, receipt } = await serveJob(
      {
        kind: "mep.job-request.v1",
        contract: key.toBase58(),
        modelInstance: choice.modelInstanceId,
        taskInputRoot: DEMO_COMPUTE_TASK.inputRoot,
        prompts: drawn.map(({ id, prompt }) => ({ id, prompt }))
      },
      choice.stockModelId,
      mode,
      { address: provider.publicKey.toBase58(), secretKey: provider.secretKey }
    );
    const c = await this.program.account.workContract.fetch(key);
    if ("running" in c.status) {
      if ((await this.connection.getSlot()) > c.deadlineSlot.toNumber())
        throw this.unrecoverable("The job deadline passed before delivery.");
      await this.record(
        `${choice.providerName} delivers result · ${mode === "degraded" ? "degraded serving" : "reference build"}`,
        this.program.methods
          .submitResult(bytes(await resultRoot(result)))
          .accountsPartial({ provider: provider.publicKey, workContract: key })
          .signers([provider])
          .rpc()
      );
    }
    return {
      result,
      receipt,
      taskTerms: DEMO_COMPUTE_TASK,
      taskInput: DEMO_TASK_INPUT,
      policy: job.policy,
      canaryPool: job.pool,
      canarySeed: job.seed
    };
  }
  /** The roots and provider authority a contract account commits to. */
  async commitments(key: PublicKey): Promise<ContractCommitments> {
    const c = await this.program.account.workContract.fetch(key);
    return {
      address: key.toBase58(),
      providerAuthority: {
        address: c.providerAuthority.toBase58(),
        publicKey: c.providerAuthority.toBytes()
      },
      taskRoot: rootHex(c.taskRoot),
      verificationRuleRoot: rootHex(c.verificationRuleRoot),
      resultRoot: rootHex(c.resultRoot)
    };
  }
  /** Verifies the receipt against the contract's provider authority, then scores the result. */
  async verifyJob(key: PublicKey, material: VerificationMaterial): Promise<JobVerification> {
    const { receipt, verification } = await verifyAgainstContract(
      await this.commitments(key),
      material,
      this.codeRoot,
      this.receiptGuard
    );
    return {
      contract: key.toBase58(),
      policyRoot: verification.policyRoot,
      receipt: {
        ...receipt,
        label: receipt.signerRole === "provider" ? "provider-signed" : "observer-signed"
      },
      executionTrust: jobExecutionTrust({
        receiptRole: receipt.signerRole,
        receiptVerified: true,
        verificationPassed: verification.passed
      }),
      result: verification
    };
  }
  get firstIndex() {
    return this.offerKeys.findIndex((key) => key.toBase58() === this.firstChoice?.offerId);
  }
  async waitPast(slot: number) {
    const gap = slot - (await this.connection.getSlot());
    const deadline = Date.now() + Math.max(90_000, gap * 1_000 + 30_000);
    while ((await this.connection.getSlot()) <= slot) {
      if (Date.now() > deadline) throw new Error("Slot progress timed out");
      // Devnet windows span hundreds of slots, so a slower poll stays under the public
      // RPC's rate limit at little cost in precision.
      await sleep(this.cluster === "devnet" ? 2_000 : 400);
    }
  }
  jurorRecord(juror: PublicKey) {
    return pda("juror-record", this.dispute.toBuffer(), juror.toBuffer());
  }
  /** Manifest root of the model behind a compute offer, read through its instance and record. */
  async contractedModelRoot(offer: PublicKey): Promise<HashHex | null> {
    if (offer.equals(PublicKey.default)) return null;
    const o = await this.program.account.computeOffer.fetchNullable(offer);
    const i = o && (await this.program.account.modelInstance.fetchNullable(o.modelInstance));
    const r = i && (await this.program.account.modelRecord.fetchNullable(i.modelRecord));
    return r ? rootHex(r.manifestRoot) : null;
  }
  /** Fetches the precedent, dispute, and contract, and verifies them together. */
  async verifiedPrecedent() {
    const [precedent, dispute, contract] = await Promise.all([
      this.program.account.precedentRecord.fetchNullable(this.precedent),
      this.program.account.dispute.fetchNullable(this.dispute),
      this.program.account.workContract.fetchNullable(this.contract)
    ]);
    const modelRoot = contract && (await this.contractedModelRoot(contract.computeOffer));
    return verifyPrecedent(
      {
        precedent: precedent && {
          address: this.precedent.toBase58(),
          dispute: precedent.dispute.toBase58(),
          workContract: precedent.workContract.toBase58(),
          rulingRoot: rootHex(precedent.rulingRoot)
        },
        dispute: dispute && {
          address: this.dispute.toBase58(),
          key: this.dispute.toBytes(),
          workContract: dispute.workContract.toBase58(),
          evidenceRoot: rootHex(dispute.evidenceRoot),
          providerBreached: dispute.providerBreached,
          noMajority: dispute.noMajority,
          breachVotes: dispute.breachVotes,
          reveals: dispute.reveals,
          finalized: "finalized" in dispute.status
        },
        contract: contract && {
          address: this.contract.toBase58(),
          customerAgent: contract.customerAgent.toBase58(),
          provider: contract.provider.toBase58(),
          providerAuthority: {
            address: contract.providerAuthority.toBase58(),
            publicKey: contract.providerAuthority.toBytes()
          },
          taskRoot: rootHex(contract.taskRoot),
          verificationRuleRoot: rootHex(contract.verificationRuleRoot),
          resultRoot: rootHex(contract.resultRoot),
          status: Object.keys(contract.status)[0]!,
          modelRoot
        }
      },
      this.evidence!,
      this.codeRoot,
      STOCK_MODEL_MANIFESTS
    );
  }
  async next() {
    const m = this.program.methods;
    if (this.stage === 0) {
      await this.fund(this.parent, this.client);
      await this.start(this.parent, this.owner);
      this.child = pda("work-contract", this.agent.toBuffer(), indexBytes(this.run));
      if (!(await this.exists(this.child))) {
        const parent = await this.program.account.workContract.fetch(this.parent);
        const roots = await termRoots(DEMO_SUBCONTRACT_TERMS);
        // The child must finish before the parent's deadline.
        const deadline = Math.min(
          (await this.connection.getSlot()) + CHILD_DEADLINE_SLOTS,
          parent.deadlineSlot.toNumber() - 1
        );
        await this.record(
          "Create OCR subcontract",
          m
            .createSubcontract(
              new BN(this.run),
              new BN(DEMO_SUBCONTRACT_PRICE_LAMPORTS),
              roots.task,
              roots.verification,
              roots.liability,
              new BN(deadline)
            )
            .accountsPartial({
              customer: this.owner.publicKey,
              customerAgent: this.agent,
              parentContract: this.parent,
              supplierAgent: this.specialist
            })
            .rpc()
        );
      }
      await this.fund(this.child, this.owner);
      await this.start(this.child, this.supplier);
      await this.complete(this.child, this.supplier, this.owner);
      // Agent A ranks the offers it reads from the chain, trusting published claims.
      this.firstChoice = (await this.choose(this.agent, this.memory)).winner;
    } else if (this.stage === 1) {
      // The controlled fault: the hired host's serving is degraded. Hiring and
      // delivery share one step so delivery always lands before the short deadline.
      // Plans, deliveries, and checks are kept so a retried step reuses them.
      const choice = this.firstChoice!;
      this.firstJob ??= await this.planJob(choice);
      this.contract = await this.computeContract(
        choice,
        this.firstIndex,
        this.run + 1,
        this.timing.firstJobDeadlineSlots,
        this.firstJob
      );
      this.firstMaterial ??= await this.deliver(
        this.contract,
        choice,
        this.firstIndex,
        "degraded",
        this.firstJob
      );
      this.firstVerification ??= await this.verifyJob(this.contract, this.firstMaterial);
      if (this.firstVerification.result.passed)
        throw new Error("The degraded result unexpectedly passed its verification policy");
      // A submitted result can be disputed only after the deadline, inside the review window.
      const c = await this.program.account.workContract.fetch(this.contract);
      await this.waitPast(c.deadlineSlot.toNumber());
      const built = await buildFailureEvidence({
        contract: await this.commitments(this.contract),
        provider: c.provider.toBase58(),
        deadlineSlot: c.deadlineSlot.toNumber(),
        observedSlot: await this.connection.getSlot(),
        material: this.firstMaterial,
        runningCodeRoot: this.codeRoot
      });
      this.evidence = built.evidence;
      this.evidenceRoot = built.root;
    } else if (this.stage === 2) {
      this.dispute = pda("dispute", this.contract.toBuffer());
      this.precedent = pda("precedent-record", this.dispute.toBuffer());
      if (!(await this.exists(this.dispute))) {
        const slot = await this.connection.getSlot();
        const job = await this.program.account.workContract.fetch(this.contract);
        if (slot > job.deadlineSlot.toNumber() + REVIEW_WINDOW_SLOTS)
          throw this.unrecoverable(
            "The customer review window closed before the dispute opened, so the provider can now claim the escrow."
          );
        await this.record(
          "Open quality-breach dispute",
          m
            .openDispute(
              bytes(this.evidenceRoot!),
              this.jurors.map((j) => j.publicKey),
              new BN(slot + this.timing.commitWindowSlots),
              new BN(slot + this.timing.revealWindowSlots)
            )
            .accountsPartial({
              claimant: this.owner.publicKey,
              demoAuthority: this.owner.publicKey,
              workContract: this.contract
            })
            .rpc()
        );
      }
      const d = await this.program.account.dispute.fetch(this.dispute);
      this.commitEnd = d.commitDeadlineSlot.toNumber();
      this.revealEnd = d.revealDeadlineSlot.toNumber();
    } else if (this.stage === 3) {
      // Nonces are created once per run so a retried step reveals what it committed.
      if (this.nonces.length === 0)
        this.nonces = this.jurors.map(() => Array.from(randomBytes(32)));
      let committed = 0;
      for (const [i, j] of this.jurors.entries()) {
        if (await this.exists(this.jurorRecord(j.publicKey))) {
          committed++;
          continue;
        }
        if ((await this.connection.getSlot()) > this.commitEnd) continue;
        await this.record(
          `Juror ${String(i + 1)} commits`,
          m
            .commitVote(
              digest(
                Buffer.from("mep.vote.v1"),
                this.dispute.toBuffer(),
                j.publicKey.toBuffer(),
                Buffer.from([JUROR_VOTES[i]!]),
                Buffer.from(this.nonces[i]!)
              )
            )
            .accountsPartial({ juror: j.publicKey, dispute: this.dispute })
            .signers([j])
            .rpc()
        );
        committed++;
      }
      if (committed < 3)
        throw this.unrecoverable("The commit window closed before a majority voted.");
    } else if (this.stage === 4) {
      await this.waitPast(this.commitEnd);
      for (const [i, j] of this.jurors.entries()) {
        const r = await this.program.account.jurorRecord.fetchNullable(
          this.jurorRecord(j.publicKey)
        );
        if (!r || r.hasRevealed) continue;
        await this.record(
          `Juror ${String(i + 1)} reveals ${JUROR_VOTES[i] === 1 ? "breach" : "no breach"}`,
          m
            .revealVote(JUROR_VOTES[i]!, this.nonces[i]!)
            .accountsPartial({ juror: j.publicKey, dispute: this.dispute })
            .signers([j])
            .rpc()
        );
      }
    } else if (this.stage === 5) {
      await this.waitPast(this.revealEnd);
      const d = await this.program.account.dispute.fetch(this.dispute);
      if (!("finalized" in d.status))
        await this.record(
          "Finalize ruling and route escrow",
          m
            .finalizeDispute()
            .accountsPartial({
              dispute: this.dispute,
              workContract: this.contract,
              customerWallet: this.owner.publicKey,
              providerWallet: this.providerKey(this.firstIndex).publicKey,
              providerRecord: this.providers[this.firstIndex]!
            })
            .rpc()
        );
    } else if (this.stage === 6) {
      if (!(await this.exists(this.precedent)))
        await this.record(
          "Publish precedent",
          m
            .publishPrecedent()
            .accountsPartial({
              payer: this.owner.publicKey,
              dispute: this.dispute,
              workContract: this.contract
            })
            .rpc()
        );
      // Both agents read the public record and recompute its ruling root before
      // learning. Agent A was the disputing customer; its twin only observed.
      this.verified = await this.verifiedPrecedent();
      for (const who of ["agent", "twin"] as const) {
        const passport = who === "agent" ? this.agent : this.twin;
        const current = who === "agent" ? this.memory : this.twinMemory;
        if (current.precedents.some((p) => p.rulingRoot === this.verified!.rulingRoot)) continue;
        const learned = await learnFromPrecedent(current, this.verified);
        const account = await this.program.account.agentPassport.fetch(passport);
        if (rootHex(account.currentMemoryRoot) !== learned.root) {
          await this.verifiedMemory(passport, current);
          await this.record(
            `${who === "agent" ? "Agent A" : "Agent A′"} checkpoints memory from precedent`,
            m
              .checkpointAgent(bytes(learned.root))
              .accountsPartial({ owner: this.owner.publicKey, agentPassport: passport })
              .rpc()
          );
        }
        if (who === "agent") this.memory = learned.memory;
        else this.twinMemory = learned.memory;
      }
      await writeFile(
        `.anchor/memory-${String(this.run)}.json`,
        JSON.stringify(
          { evidence: this.evidence, agent: this.memory, twin: this.twinMemory },
          null,
          2
        )
      );
      await this.publishEvidenceBundle();
    } else if (this.stage === 7) {
      // Same agent, task, and scoring policy. Only its verified memory has changed.
      const { winner, index } = await this.choose(this.agent, this.memory);
      this.secondChoice = winner;
      this.secondJob ??= await this.planJob(winner);
      this.second = await this.computeContract(
        winner,
        index,
        this.run + 2,
        this.timing.secondJobDeadlineSlots,
        this.secondJob
      );
      this.secondVerification ??= await this.verifyJob(
        this.second,
        await this.deliver(this.second, winner, index, "reference", this.secondJob)
      );
      if (!this.secondVerification.result.passed)
        throw new Error("The second provider failed its verification policy");
      await this.complete(this.second, this.providerKey(index), this.owner);
      await this.complete(this.parent, this.owner, this.client);
    } else throw new Error("Demo complete. Reset to start a new run.");
    this.stage++;
  }
  /**
   * Writes the evidence bundle an independent reader needs: the precedent address and
   * every off-chain document. Each is checked against on-chain roots by the reader,
   * so the bundle's location does not need to be trusted.
   */
  async publishEvidenceBundle() {
    const dir = `.anchor/runs/${this.cluster}-${String(this.run)}`;
    await mkdir(dir, { recursive: true });
    this.evidenceBundlePath = `${dir}/evidence-bundle.json`;
    await writeFile(
      this.evidenceBundlePath,
      JSON.stringify(
        {
          kind: "mep.evidence-bundle.v1",
          cluster: this.cluster,
          programId: id.toBase58(),
          precedent: this.precedent.toBase58(),
          evidence: this.evidence,
          stockModels: STOCK_MODEL_MANIFESTS
        },
        null,
        2
      )
    );
  }
  async ruling() {
    if (this.stage < 6) return undefined;
    const d = await this.program.account.dispute.fetch(this.dispute);
    const c = await this.program.account.workContract.fetch(this.contract);
    const cleared = d.reveals - d.breachVotes >= 3;
    return {
      provider: this.firstChoice!.providerName,
      outcome: d.providerBreached
        ? ("provider-breached" as const)
        : cleared
          ? ("provider-cleared" as const)
          : ("no-majority" as const),
      recipient: cleared ? ("provider" as const) : ("customer" as const),
      amountLamports: c.priceLamports.toNumber(),
      breachVotes: d.breachVotes,
      reveals: d.reveals
    };
  }
  async snapshot() {
    const market = await this.fetchMarket();
    const label = (rows: readonly UtilityBreakdown[]) =>
      rows.map((row) => {
        const provider = market.providers.find((p) => p.id === row.providerId);
        return {
          ...row,
          providerName: provider?.displayName ?? short(row.providerId),
          // Fixture slug ("provider-x"), matched by the on-chain evidence root.
          providerSlug: DEMO_PROVIDERS.find((p) => p.evidenceRoot === provider?.evidenceRoot)?.id,
          reservationClass: market.offers.find((o) => o.id === row.offerId)?.reservationClass
        };
      });
    const learned = this.memory.checkpoint > 0;
    const twinLearned = this.twinMemory.checkpoint > 0;
    const before = label(rankMarket(market));
    const after = label(rankMarket(market, this.memory.failureProbabilityOverridesBps));
    const twinAfter = label(rankMarket(market, this.twinMemory.failureProbabilityOverridesBps));
    const firstProvider = this.firstChoice?.providerName ?? before[0]?.providerName;
    const secondProvider = learned ? (after[0]?.providerName ?? null) : null;

    const contracts: {
      label: string;
      address: string;
      url: string;
      status: string;
      escrowLamports: number;
      priceLamports: number;
      deadlineSlot: number;
    }[] = [];
    const books: PnlContract[] = [];
    for (const [key, contractLabel, entry, role] of [
      [this.parent, "Parent · evidence report", "Parent revenue", "revenue"],
      [
        this.stage > 0 ? this.child : undefined,
        "Child · OCR extraction",
        "OCR subcontract",
        "cost"
      ],
      [
        this.stage > 1 ? this.contract : undefined,
        `Job 1 · ${firstProvider ?? "provider"}`,
        `Job 1 · ${firstProvider ?? "provider"}`,
        "cost"
      ],
      [
        this.stage > 7 ? this.second : undefined,
        `Job 2 · ${secondProvider ?? "provider"}`,
        `Job 2 · ${secondProvider ?? "provider"}`,
        "cost"
      ]
    ] as const) {
      if (!key) continue;
      const c = await this.program.account.workContract.fetchNullable(key);
      if (!c) continue;
      const row = {
        label: contractLabel,
        address: key.toBase58(),
        url: this.explorer("address", key.toBase58()),
        status: Object.keys(c.status)[0]!,
        escrowLamports: c.escrowLamports.toNumber(),
        priceLamports: c.priceLamports.toNumber(),
        deadlineSlot: c.deadlineSlot.toNumber()
      };
      contracts.push(row);
      books.push({ label: entry, role, priceLamports: row.priceLamports, status: row.status });
    }
    // Agent A's books: revenue from the client's parent contract, costs for every
    // escrow it funded, and the refund the breach ruling returned.
    const pnl = agentProfitAndLoss(books);

    const passport = await this.program.account.agentPassport.fetch(this.agent);
    const twinPassport = await this.program.account.agentPassport.fetch(this.twin);
    const registry = await Promise.all(
      STOCK_MODEL_MANIFESTS.map(async (manifest) => {
        const root = await manifestRoot(manifest);
        const address = pda("model-record", Buffer.from(bytes(root)));
        const record = await this.program.account.modelRecord.fetch(address);
        return {
          id: manifest.id,
          root,
          address: address.toBase58(),
          verified: rootHex(record.manifestRoot) === root
        };
      })
    );
    const votes = [];
    if (this.stage >= 3)
      for (const [i, j] of this.jurors.entries()) {
        const r = await this.program.account.jurorRecord.fetchNullable(
          this.jurorRecord(j.publicKey)
        );
        votes.push({
          juror: i + 1,
          address: j.publicKey.toBase58(),
          committed: !!r,
          revealed: r?.hasRevealed ?? false,
          vote: r?.hasRevealed
            ? "providerBreached" in r.revealedVote
              ? ("breach" as const)
              : ("no breach" as const)
            : null,
          commitment: r ? rootHex(r.voteCommitment) : null
        });
      }
    // Supply-side rows come from the same on-chain accounts the agent ranks.
    const supply = market.offers.map((offer) => {
      const instance = market.modelInstances.find((i) => i.id === offer.modelInstanceId)!;
      const provider = market.providers.find((p) => p.id === instance.providerId)!;
      return {
        id: DEMO_PROVIDERS.find((p) => p.evidenceRoot === provider.evidenceRoot)?.id ?? provider.id,
        address: provider.id,
        name: provider.displayName,
        // Earned tiers. The bps fields below are the provider's self-declared claims,
        // shown for transparency and never scored.
        trust: market.trust[offer.id]!,
        hardwareTrustBps: provider.hardwareTrustBps,
        executionTrustBps: provider.executionTrustBps,
        breachCount: provider.breachCount,
        instance: instance.id,
        stockModelId: instance.stockModelId,
        modelTrustBps: instance.modelTrustBps,
        offer: offer.id,
        priceLamports: offer.priceLamports,
        failureProbabilityBps: offer.failureProbabilityBps,
        reservationClass: offer.reservationClass
      };
    });
    return {
      stage: this.stage,
      stageLabel: stages[this.stage],
      run: this.run,
      network: this.cluster,
      canAbandon: this.abandonable && this.cluster === "localnet",
      slot: await this.connection.getSlot(),
      stages,
      contracts,
      votes,
      receipts: this.receipts.map((r) => ({ ...r, url: this.explorer("tx", r.signature) })),
      providers: supply,
      rejectedOffers: market.rejected,
      models: STOCK_MODEL_MANIFESTS,
      registry,
      stockAgents: STOCK_AGENT_MANIFESTS,
      policy,
      firstProvider,
      secondProvider,
      before,
      after,
      twinAfter,
      choices: {
        agent: {
          before: before[0]?.providerName ?? null,
          after: learned ? (after[0]?.providerName ?? null) : null
        },
        twin: {
          before: before[0]?.providerName ?? null,
          after: twinLearned ? (twinAfter[0]?.providerName ?? null) : null
        }
      },
      verifications: { first: this.firstVerification, second: this.secondVerification },
      checker: { ...CHECKER, codeRoot: this.codeRoot },
      evidence: this.evidence,
      evidenceBundle: this.evidenceBundlePath,
      evidenceRoot: this.evidenceRoot,
      memory: learned ? this.memory : undefined,
      twinMemory: twinLearned ? this.twinMemory : undefined,
      ruling: await this.ruling(),
      rulingRoot: this.verified?.rulingRoot,
      precedent: this.verified
        ? { ...this.verified, url: this.explorer("address", this.verified.account) }
        : undefined,
      pnl,
      agent: {
        address: this.agent.toBase58(),
        url: this.explorer("address", this.agent.toBase58()),
        twin: this.twin.toBase58(),
        twinUrl: this.explorer("address", this.twin.toBase58()),
        twinMemoryRoot: rootHex(twinPassport.currentMemoryRoot),
        twinInitialMemoryRoot: this.twinInitialMemoryRoot,
        twinCheckpoints: twinPassport.checkpointCount.toNumber(),
        genesisRoot: this.genesisRoot,
        initialMemoryRoot: this.initialMemoryRoot,
        memoryRoot: rootHex(passport.currentMemoryRoot),
        checkpoints: passport.checkpointCount.toNumber()
      },
      links: {
        program: this.explorer("address", id.toBase58()),
        dispute: this.stage > 2 ? this.explorer("address", this.dispute.toBase58()) : undefined
      },
      summary: this.summary,
      geminiConfigured: !!process.env.GEMINI_API_KEY
    };
  }
}
