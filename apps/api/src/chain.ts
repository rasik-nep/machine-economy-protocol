/* Fixed fixture indices and stage-gated fields are validated by initialize/next. */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { MachineEconomyProtocol } from "../../../target/types/machine_economy_protocol.ts";
import {
  STOCK_MODEL_MANIFESTS,
  STOCK_AGENT_MANIFESTS,
  DEMO_AGENT_GENESIS_RISK_BPS,
  DEMO_CONTRACT_TERMS,
  DEMO_PARENT_AGENT_SERVICE_PRICE_LAMPORTS,
  DEMO_PROVIDERS,
  DEMO_MODEL_INSTANCES,
  DEMO_SUBCONTRACT_PRICE_LAMPORTS,
  DEMO_SUBCONTRACT_TERMS
} from "../../../packages/fixtures/src/index.ts";
import {
  canonicalize,
  manifestRoot,
  sha256Hex,
  type DemoContractTerms,
  type HashHex
} from "../../../packages/protocol/src/index.ts";
import {
  learnFromBreach,
  type FailureEvidence,
  type AgentMemory
} from "../../../packages/protocol/src/learning.ts";
import { offers, scores, policy } from "./scenario.ts";
const { AnchorError, AnchorProvider, Program, Wallet, BN } = anchor;
const id = new PublicKey("2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE");
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const WALLETS_FILE = ".anchor/demo-wallets.json";
// The parent is created at reset but funded only when the run starts, so its
// deadline (~4.6 days of slots) must outlast an idle dashboard and a slow demo.
const PARENT_DEADLINE_SLOTS = 1_000_000;
const CHILD_DEADLINE_SLOTS = 5_000;
const FIRST_JOB_DEADLINE_SLOTS = 20;
const SECOND_JOB_DEADLINE_SLOTS = 1_000;
const COMMIT_WINDOW_SLOTS = 35;
const REVEAL_WINDOW_SLOTS = 70;
const MIN_WALLET_LAMPORTS = 500_000_000;
const bytes = (root: HashHex) => Array.from(Buffer.from(root.slice(7), "hex"));
const digest = (...parts: Uint8Array[]) =>
  Array.from(createHash("sha256").update(Buffer.concat(parts)).digest());
const rootHex = (root: number[]): HashHex => `sha256:${Buffer.from(root).toString("hex")}`;
const pda = (seed: string, ...parts: Uint8Array[]) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), ...parts], id)[0];
const indexBytes = (n: number) => new BN(n).toArrayLike(Buffer, "le", 8);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const providerName = (index: number) => DEMO_PROVIDERS[index]!.displayName.split(" · ")[0]!;
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
  "Provider preempted",
  "Dispute opened",
  "Votes committed",
  "Votes revealed",
  "Ruling finalized",
  "Memory checkpointed",
  "Second job settled"
] as const;
type Receipt = { label: string; signature: string };

/** Short, readable error text for the dashboard instead of raw program logs. */
export function describeError(error: unknown): string {
  if (error instanceof AnchorError)
    return `${error.error.errorMessage} (${error.error.errorCode.code})`;
  if (error instanceof Error) return error.message.split("\n")[0]!.slice(0, 300);
  return "Operation failed";
}

/** Disposable localnet wallets, persisted so the demo validator can name the deployer. */
export async function loadDemoWallets(): Promise<Keypair[]> {
  await mkdir(".anchor", { recursive: true });
  try {
    const saved = z
      .array(z.array(z.number().int().min(0).max(255)).length(64))
      .length(11)
      .parse(JSON.parse(await readFile(WALLETS_FILE, "utf8")));
    return saved.map((k) => Keypair.fromSecretKey(Uint8Array.from(k)));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const keys = Array.from({ length: 11 }, () => Keypair.generate());
    await writeFile(WALLETS_FILE, JSON.stringify(keys.map((k) => Array.from(k.secretKey))), {
      mode: 0o600
    });
    return keys;
  }
}

export class DemoChain {
  connection = new Connection(RPC_URL, "confirmed");
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
  firstIndex = 0;
  secondIndex?: number;
  providers: PublicKey[] = [];
  instances: PublicKey[] = [];
  offerKeys: PublicKey[] = [];
  evidence?: FailureEvidence;
  evidenceRoot?: HashHex;
  memory?: AgentMemory;
  memoryRoot!: HashHex;
  genesisRoot!: HashHex;
  initialMemoryRoot!: HashHex;
  rulingRoot?: HashHex;
  commitEnd = 0;
  revealEnd = 0;
  nonces: number[][] = [];
  summary?: { text: string; model: string; advisory: boolean };
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
  async topUpWallets() {
    for (const key of this.keys) {
      if ((await this.connection.getBalance(key.publicKey)) < MIN_WALLET_LAMPORTS) {
        const sig = await this.connection.requestAirdrop(key.publicKey, 2_000_000_000);
        await this.connection.confirmTransaction(
          { signature: sig, ...(await this.connection.getLatestBlockhash()) },
          "confirmed"
        );
      }
    }
  }
  async initialize() {
    this.keys = await loadDemoWallets();
    await this.topUpWallets();
    const raw: unknown = JSON.parse(
      await readFile("target/idl/machine_economy_protocol.json", "utf8")
    );
    this.program = new Program(
      raw as MachineEconomyProtocol,
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
          `Protocol initialization failed: ${describeError(error)}. Only the program's upgrade authority can initialize it. Stop any running validator and use \`pnpm dev\`, which deploys the program with the demo wallet.`
        );
      }
    }
    const config = await this.program.account.protocolConfig.fetch(this.config);
    if (!config.demoAuthority.equals(this.owner.publicKey))
      throw new Error(
        "Localnet belongs to another demo authority. Use the isolated demo validator command."
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
      const offer = offers[i]!;
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
      if (!(await this.exists(key)))
        await this.record(
          "Publish compute offer",
          m
            .publishComputeOffer(
              new BN(0),
              new BN(offer.priceLamports),
              offer.expectedLatencyMs,
              offer.failureProbabilityBps,
              i
            )
            .accountsPartial({
              provider: signer.publicKey,
              providerRecord: provider,
              modelInstance: instance
            })
            .signers([signer])
            .rpc()
        );
    }
    await this.reset();
  }
  async newAgent(signer: Keypair, stock: HashHex, memory: HashHex, index: number, into: Receipt[]) {
    const key = pda(
      "agent-passport",
      signer.publicKey.toBuffer(),
      Buffer.from(bytes(stock)),
      indexBytes(index)
    );
    await this.record(
      "Create agent passport",
      this.program.methods
        .createAgent(bytes(stock), bytes(memory), new BN(index))
        .accountsPartial({ owner: signer.publicKey })
        .signers(signer === this.owner ? [] : [signer])
        .rpc(),
      into
    );
    return key;
  }
  /**
   * Starts a fresh run at any stage. Every account is new (indices derive from the
   * run id), so an abandoned run cannot block the next one. State is swapped in only
   * after the new accounts exist, so dashboard polls never see half-built runs.
   */
  async reset() {
    await this.topUpWallets();
    const run = Math.max(Date.now(), this.run + 10);
    const receipts: Receipt[] = [];
    const genesisRoot = await manifestRoot(STOCK_AGENT_MANIFESTS[0]);
    const initialMemoryRoot = await sha256Hex(
      canonicalize({ kind: "mep.memory.genesis.v1", risk: DEMO_AGENT_GENESIS_RISK_BPS })
    );
    const agent = await this.newAgent(this.owner, genesisRoot, initialMemoryRoot, run, receipts);
    const twin = await this.newAgent(
      this.owner,
      genesisRoot,
      await sha256Hex("independent agent history"),
      run + 1,
      receipts
    );
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
    const roots = await termRoots(DEMO_CONTRACT_TERMS);
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
      initialMemoryRoot,
      memoryRoot: initialMemoryRoot,
      firstIndex: 0,
      secondIndex: undefined,
      evidence: undefined,
      evidenceRoot: undefined,
      memory: undefined,
      rulingRoot: undefined,
      summary: undefined,
      nonces: []
    });
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
  /** Creates, funds, and starts a compute job in one atomic transaction. */
  async computeContract(providerIndex: number, index: number, slots: number) {
    const key = pda("work-contract", this.agent.toBuffer(), indexBytes(index));
    if (await this.exists(key)) return key;
    const m = this.program.methods;
    const provider = this.providerKey(providerIndex);
    const roots = await termRoots(DEMO_CONTRACT_TERMS);
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
      `Hire ${providerName(providerIndex)}: create, fund, start`,
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
  async waitPast(slot: number) {
    const deadline = Date.now() + 90_000;
    while ((await this.connection.getSlot()) <= slot) {
      if (Date.now() > deadline) throw new Error("Localnet slot progress timed out");
      await sleep(400);
    }
  }
  jurorRecord(juror: PublicKey) {
    return pda("juror-record", this.dispute.toBuffer(), juror.toBuffer());
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
      const firstWinner = scores()[0]!;
      this.firstIndex = DEMO_PROVIDERS.findIndex((p) => p.id === firstWinner.providerId);
      this.contract = await this.computeContract(
        this.firstIndex,
        this.run + 1,
        FIRST_JOB_DEADLINE_SLOTS
      );
    } else if (this.stage === 1) {
      const c = await this.program.account.workContract.fetch(this.contract);
      await this.waitPast(c.deadlineSlot.toNumber());
      this.evidence = {
        kind: "mep.failure.v1",
        contract: this.contract.toBase58(),
        providerId: DEMO_PROVIDERS[this.firstIndex]!.id,
        deadlineSlot: c.deadlineSlot.toNumber(),
        observedSlot: await this.connection.getSlot(),
        reason: "controlled-preemption",
        resultSubmitted: false
      };
      this.evidenceRoot = await sha256Hex(canonicalize(this.evidence));
    } else if (this.stage === 2) {
      this.dispute = pda("dispute", this.contract.toBuffer());
      this.precedent = pda("precedent-record", this.dispute.toBuffer());
      if (!(await this.exists(this.dispute))) {
        const slot = await this.connection.getSlot();
        await this.record(
          "Open missed-SLA dispute",
          m
            .openDispute(
              bytes(this.evidenceRoot!),
              this.jurors.map((j) => j.publicKey),
              new BN(slot + COMMIT_WINDOW_SLOTS),
              new BN(slot + REVEAL_WINDOW_SLOTS)
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
                Buffer.from([1]),
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
        throw new Error(
          "The commit window closed before a majority voted. Start a fresh run to retry the dispute."
        );
    } else if (this.stage === 4) {
      await this.waitPast(this.commitEnd);
      for (const [i, j] of this.jurors.entries()) {
        const r = await this.program.account.jurorRecord.fetchNullable(
          this.jurorRecord(j.publicKey)
        );
        if (!r || r.hasRevealed) continue;
        await this.record(
          `Juror ${String(i + 1)} reveals`,
          m
            .revealVote(1, this.nonces[i]!)
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
      const p = await this.program.account.precedentRecord.fetch(this.precedent);
      const d = await this.program.account.dispute.fetch(this.dispute);
      this.rulingRoot = rootHex(p.rulingRoot);
      const learned = await learnFromBreach(
        this.initialMemoryRoot,
        this.rulingRoot,
        this.evidence!,
        d.providerBreached
      );
      const passport = await this.program.account.agentPassport.fetch(this.agent);
      if (rootHex(passport.currentMemoryRoot) !== learned.root)
        await this.record(
          "Checkpoint learned memory",
          m
            .checkpointAgent(bytes(learned.root))
            .accountsPartial({ owner: this.owner.publicKey, agentPassport: this.agent })
            .rpc()
        );
      this.memory = learned.memory;
      this.memoryRoot = learned.root;
      await writeFile(
        `.anchor/memory-${String(this.run)}.json`,
        JSON.stringify({ evidence: this.evidence, memory: this.memory }, null, 2)
      );
    } else if (this.stage === 7) {
      const winner = scores(this.memory!.failureProbabilityOverridesBps)[0]!;
      this.secondIndex = DEMO_PROVIDERS.findIndex((p) => p.id === winner.providerId);
      this.second = await this.computeContract(
        this.secondIndex,
        this.run + 2,
        SECOND_JOB_DEADLINE_SLOTS
      );
      await this.complete(this.second, this.providerKey(this.secondIndex), this.owner);
      await this.complete(this.parent, this.owner, this.client);
    } else throw new Error("Demo complete. Reset to start a new run.");
    this.stage++;
  }
  async ruling() {
    if (this.stage < 6) return undefined;
    const d = await this.program.account.dispute.fetch(this.dispute);
    const c = await this.program.account.workContract.fetch(this.contract);
    const cleared = d.reveals - d.breachVotes >= 3;
    return {
      provider: providerName(this.firstIndex),
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
    const contracts: {
      label: string;
      address: string;
      status: string;
      escrowLamports: number;
      priceLamports: number;
      deadlineSlot: number;
    }[] = [];
    for (const [label, key] of [
      ["Parent · evidence report", this.parent],
      ["Child · OCR extraction", this.stage > 0 ? this.child : undefined],
      [`Job 1 · ${providerName(this.firstIndex)}`, this.stage > 0 ? this.contract : undefined],
      [`Job 2 · ${providerName(this.secondIndex ?? 0)}`, this.stage > 7 ? this.second : undefined]
    ] as const) {
      if (!key) continue;
      const c = await this.program.account.workContract.fetchNullable(key);
      if (!c) continue;
      contracts.push({
        label,
        address: key.toBase58(),
        status: Object.keys(c.status)[0]!,
        escrowLamports: c.escrowLamports.toNumber(),
        priceLamports: c.priceLamports.toNumber(),
        deadlineSlot: c.deadlineSlot.toNumber()
      });
    }
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
    // Breach counts come from the provider records, written by finalize_dispute.
    const providerRecords = await this.program.account.providerRecord.fetchMultiple(this.providers);
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
          commitment: r ? rootHex(r.voteCommitment) : null
        });
      }
    const before = scores();
    const after = scores(this.memory?.failureProbabilityOverridesBps);
    return {
      stage: this.stage,
      stageLabel: stages[this.stage],
      run: this.run,
      network:
        RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost") ? "localnet" : RPC_URL,
      slot: await this.connection.getSlot(),
      stages,
      contracts,
      votes,
      receipts: this.receipts,
      providers: DEMO_PROVIDERS.map((p, i) => ({
        ...p,
        name: providerName(i),
        breachCount: providerRecords[i]?.breachCount ?? 0
      })),
      models: STOCK_MODEL_MANIFESTS,
      registry,
      stockAgents: STOCK_AGENT_MANIFESTS,
      instances: DEMO_MODEL_INSTANCES,
      offers,
      policy,
      genesisRisk: DEMO_AGENT_GENESIS_RISK_BPS,
      firstProvider: providerName(this.firstIndex),
      secondProvider: this.memory
        ? providerName(DEMO_PROVIDERS.findIndex((p) => p.id === after[0]!.providerId))
        : null,
      before,
      after,
      evidence: this.evidence,
      evidenceRoot: this.evidenceRoot,
      memory: this.memory,
      ruling: await this.ruling(),
      rulingRoot: this.rulingRoot,
      agent: {
        address: this.agent.toBase58(),
        twin: this.twin.toBase58(),
        twinMemoryRoot: rootHex(twinPassport.currentMemoryRoot),
        genesisRoot: this.genesisRoot,
        initialMemoryRoot: this.initialMemoryRoot,
        memoryRoot: rootHex(passport.currentMemoryRoot),
        checkpoints: passport.checkpointCount.toNumber()
      },
      summary: this.summary,
      geminiConfigured: !!process.env.GEMINI_API_KEY
    };
  }
}
