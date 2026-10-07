/* Fixed fixture indices and stage-gated fields are validated by initialize/next. */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { MachineEconomyProtocol } from "../../../target/types/machine_economy_protocol.ts";
import {
  STOCK_MODEL_MANIFESTS,
  STOCK_AGENT_MANIFESTS,
  DEMO_PROVIDERS,
  DEMO_MODEL_INSTANCES
} from "../../../packages/fixtures/src/index.ts";
import {
  canonicalize,
  manifestRoot,
  sha256Hex,
  type HashHex
} from "../../../packages/protocol/src/index.ts";
import {
  learnFromBreach,
  type FailureEvidence,
  type AgentMemory
} from "../../../packages/protocol/src/learning.ts";
import { offers, scores, policy } from "./scenario.ts";
const { AnchorProvider, Program, Wallet, BN } = anchor;
const id = new PublicKey("2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE");
const bytes = (root: HashHex) => Array.from(Buffer.from(root.slice(7), "hex"));
const digest = (...parts: Uint8Array[]) =>
  Array.from(createHash("sha256").update(Buffer.concat(parts)).digest());
const rootHex = (root: number[]): HashHex => `sha256:${Buffer.from(root).toString("hex")}`;
const pda = (seed: string, ...parts: Uint8Array[]) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), ...parts], id)[0];
const indexBytes = (n: number) => new BN(n).toArrayLike(Buffer, "le", 8);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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
export class DemoChain {
  connection = new Connection("http://127.0.0.1:8899", "confirmed");
  keys!: Keypair[];
  program!: anchor.Program<MachineEconomyProtocol>;
  config = pda("protocol-config");
  stage = 0;
  receipts: { label: string; signature: string }[] = [];
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
  async record(label: string, transaction: Promise<string>) {
    const signature = await transaction;
    this.receipts.push({ label, signature });
    return signature;
  }
  async initialize() {
    await mkdir(".anchor", { recursive: true });
    try {
      const saved = z
        .array(z.array(z.number().int().min(0).max(255)).length(64))
        .length(11)
        .parse(JSON.parse(await readFile(".anchor/demo-wallets.json", "utf8")));
      this.keys = saved.map((k) => Keypair.fromSecretKey(Uint8Array.from(k)));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      this.keys = Array.from({ length: 11 }, () => Keypair.generate());
      await writeFile(
        ".anchor/demo-wallets.json",
        JSON.stringify(this.keys.map((k) => Array.from(k.secretKey))),
        { mode: 0o600 }
      );
    }
    for (const key of this.keys) {
      if ((await this.connection.getBalance(key.publicKey)) < 100_000_000) {
        const sig = await this.connection.requestAirdrop(key.publicKey, 2_000_000_000);
        await this.connection.confirmTransaction(
          { signature: sig, ...(await this.connection.getLatestBlockhash()) },
          "confirmed"
        );
      }
    }
    const raw: unknown = JSON.parse(
      await readFile("target/idl/machine_economy_protocol.json", "utf8")
    );
    this.program = new Program(
      raw as MachineEconomyProtocol,
      new AnchorProvider(this.connection, new Wallet(this.owner), { commitment: "confirmed" })
    );
    const m = this.program.methods;
    if (!(await this.connection.getAccountInfo(this.config)))
      await this.record(
        "Initialize protocol",
        m
          .initializeProtocol(1, this.owner.publicKey)
          .accountsPartial({ authority: this.owner.publicKey })
          .rpc()
      );
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
      if (!(await this.connection.getAccountInfo(key)))
        await this.record(
          "Register stock model",
          m
            .registerStockModel(bytes(root), bytes(model.artifact.hash), model.version)
            .accountsPartial({ authority: this.owner.publicKey })
            .rpc()
        );
    }
    for (let i = 0; i < 3; i++) {
      const signer = this.keys[i + 3]!;
      const fixture = DEMO_PROVIDERS[i]!;
      const offer = offers[i]!;
      const provider = pda("provider-record", signer.publicKey.toBuffer());
      this.providers.push(provider);
      if (!(await this.connection.getAccountInfo(provider)))
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
      if (!(await this.connection.getAccountInfo(instance)))
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
      if (!(await this.connection.getAccountInfo(key)))
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
  async newAgent(signer: Keypair, stock: HashHex, memory: HashHex, index: number) {
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
        .rpc()
    );
    return key;
  }
  async reset() {
    this.run = Math.max(Date.now(), this.run + 10);
    this.stage = 0;
    this.receipts = [];
    this.evidence = undefined;
    this.evidenceRoot = undefined;
    this.memory = undefined;
    this.rulingRoot = undefined;
    this.summary = undefined;
    this.genesisRoot = await manifestRoot(STOCK_AGENT_MANIFESTS[0]);
    this.initialMemoryRoot = await sha256Hex(
      canonicalize({
        kind: "mep.memory.genesis.v1",
        risk: { "provider-x": 100, "provider-y": 900, "provider-z": 100 }
      })
    );
    this.memoryRoot = this.initialMemoryRoot;
    this.agent = await this.newAgent(this.owner, this.genesisRoot, this.memoryRoot, this.run);
    this.twin = await this.newAgent(
      this.owner,
      this.genesisRoot,
      await sha256Hex("independent agent history"),
      this.run + 1
    );
    this.specialist = await this.newAgent(
      this.supplier,
      await manifestRoot(STOCK_AGENT_MANIFESTS[1]),
      await sha256Hex("specialist memory"),
      this.run
    );
    const clientAgent = await this.newAgent(
      this.client,
      this.genesisRoot,
      await sha256Hex("client memory"),
      this.run
    );
    this.parent = pda("work-contract", clientAgent.toBuffer(), indexBytes(this.run));
    const slot = await this.connection.getSlot();
    const task = bytes(await sha256Hex("invoice evidence summary"));
    const verification = bytes(await sha256Hex("customer-attested-result-root"));
    const liability = bytes(await sha256Hex("missed-deadline-provider-liability"));
    await this.record(
      "Create parent work contract",
      this.program.methods
        .createAgentContract(
          new BN(this.run),
          new BN(20_000_000),
          task,
          verification,
          liability,
          new BN(slot + 10000)
        )
        .accountsPartial({
          customer: this.client.publicKey,
          customerAgent: clientAgent,
          supplierAgent: this.agent
        })
        .signers([this.client])
        .rpc()
    );
  }
  async fund(key: PublicKey, signer: Keypair) {
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
    await this.record(
      "Verify result",
      this.program.methods
        .verifyContract()
        .accountsPartial({ customer: customer.publicKey, workContract: key })
        .signers(customer === this.owner ? [] : [customer])
        .rpc()
    );
    await this.record(
      "Settle escrow",
      this.program.methods
        .settleContract()
        .accountsPartial({
          customer: customer.publicKey,
          workContract: key,
          providerWallet: supplier.publicKey
        })
        .signers(customer === this.owner ? [] : [customer])
        .rpc()
    );
  }
  async computeContract(providerIndex: number, index: number, slots: number) {
    const key = pda("work-contract", this.agent.toBuffer(), indexBytes(index));
    await this.record(
      "Create compute contract",
      this.program.methods
        .createContract(
          new BN(index),
          bytes(await sha256Hex("evidence summary job")),
          bytes(await sha256Hex("customer-attested-result-root")),
          bytes(await sha256Hex("missed deadline refund")),
          new BN((await this.connection.getSlot()) + slots)
        )
        .accountsPartial({
          customer: this.owner.publicKey,
          customerAgent: this.agent,
          computeOffer: this.offerKeys[providerIndex]!,
          providerRecord: this.providers[providerIndex]!
        })
        .rpc()
    );
    await this.fund(key, this.owner);
    await this.start(key, this.keys[providerIndex + 3]!);
    return key;
  }
  async waitPast(slot: number) {
    const deadline = Date.now() + 90_000;
    while ((await this.connection.getSlot()) <= slot) {
      if (Date.now() > deadline) throw new Error("Localnet slot progress timed out");
      await sleep(400);
    }
  }
  async next() {
    const m = this.program.methods;
    if (this.stage === 0) {
      await this.fund(this.parent, this.client);
      await this.start(this.parent, this.owner);
      this.child = pda("work-contract", this.agent.toBuffer(), indexBytes(this.run));
      await this.record(
        "Create OCR subcontract",
        m
          .createSubcontract(
            new BN(this.run),
            new BN(3_000_000),
            bytes(await sha256Hex("ocr task")),
            bytes(await sha256Hex("customer-attested-result-root")),
            bytes(await sha256Hex("missed-deadline-provider-liability")),
            new BN((await this.connection.getSlot()) + 5000)
          )
          .accountsPartial({
            customer: this.owner.publicKey,
            customerAgent: this.agent,
            parentContract: this.parent,
            supplierAgent: this.specialist
          })
          .rpc()
      );
      await this.fund(this.child, this.owner);
      await this.start(this.child, this.supplier);
      await this.complete(this.child, this.supplier, this.owner);
      const firstWinner = scores()[0]!;
      const firstIndex = DEMO_PROVIDERS.findIndex((p) => p.id === firstWinner.providerId);
      this.contract = await this.computeContract(firstIndex, this.run + 1, 20);
    } else if (this.stage === 1) {
      const c = await this.program.account.workContract.fetch(this.contract);
      await this.waitPast(c.deadlineSlot.toNumber());
      this.evidence = {
        kind: "mep.failure.v1",
        contract: this.contract.toBase58(),
        providerId: "provider-x",
        deadlineSlot: c.deadlineSlot.toNumber(),
        observedSlot: await this.connection.getSlot(),
        reason: "controlled-preemption",
        resultSubmitted: false
      };
      this.evidenceRoot = await sha256Hex(canonicalize(this.evidence));
    } else if (this.stage === 2) {
      this.dispute = pda("dispute", this.contract.toBuffer());
      this.precedent = pda("precedent-record", this.dispute.toBuffer());
      const slot = await this.connection.getSlot();
      this.commitEnd = slot + 35;
      this.revealEnd = slot + 70;
      await this.record(
        "Open missed-SLA dispute",
        m
          .openDispute(
            bytes(this.evidenceRoot!),
            this.jurors.map((j) => j.publicKey),
            new BN(this.commitEnd),
            new BN(this.revealEnd)
          )
          .accountsPartial({
            claimant: this.owner.publicKey,
            demoAuthority: this.owner.publicKey,
            workContract: this.contract
          })
          .rpc()
      );
    } else if (this.stage === 3) {
      this.nonces = this.jurors.map(() => Array.from(randomBytes(32)));
      for (const [i, j] of this.jurors.entries())
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
    } else if (this.stage === 4) {
      await this.waitPast(this.commitEnd);
      for (const [i, j] of this.jurors.entries())
        await this.record(
          `Juror ${String(i + 1)} reveals`,
          m
            .revealVote(1, this.nonces[i]!)
            .accountsPartial({ juror: j.publicKey, dispute: this.dispute })
            .signers([j])
            .rpc()
        );
    } else if (this.stage === 5) {
      await this.waitPast(this.revealEnd);
      await this.record(
        "Finalize and refund",
        m
          .finalizeDispute()
          .accountsPartial({
            dispute: this.dispute,
            workContract: this.contract,
            customerWallet: this.owner.publicKey,
            providerWallet: this.keys[3]!.publicKey
          })
          .rpc()
      );
    } else if (this.stage === 6) {
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
        this.memoryRoot,
        this.rulingRoot,
        this.evidence!,
        d.providerBreached
      );
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
      const i = DEMO_PROVIDERS.findIndex((p) => p.id === winner.providerId);
      this.second = await this.computeContract(i, this.run + 2, 1000);
      await this.complete(this.second, this.keys[i + 3]!, this.owner);
      await this.complete(this.parent, this.owner, this.client);
    } else throw new Error("Demo complete. Reset to start a new run.");
    this.stage++;
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
      ["Job 1 · Provider X", this.stage > 0 ? this.contract : undefined],
      ["Job 2 · Provider Z", this.stage > 7 ? this.second : undefined]
    ] as const) {
      if (!key) continue;
      const c = await this.program.account.workContract.fetch(key);
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
    const votes = [];
    if (this.stage >= 3)
      for (const [i, j] of this.jurors.entries()) {
        const r = await this.program.account.jurorRecord.fetchNullable(
          pda("juror-record", this.dispute.toBuffer(), j.publicKey.toBuffer())
        );
        votes.push({
          juror: i + 1,
          address: j.publicKey.toBase58(),
          committed: !!r,
          revealed: r?.hasRevealed ?? false,
          commitment: r ? rootHex(r.voteCommitment) : null
        });
      }
    return {
      stage: this.stage,
      stageLabel: stages[this.stage],
      run: this.run,
      network: "localnet",
      slot: await this.connection.getSlot(),
      stages,
      contracts,
      votes,
      receipts: this.receipts,
      providers: DEMO_PROVIDERS,
      models: STOCK_MODEL_MANIFESTS,
      registry,
      stockAgents: STOCK_AGENT_MANIFESTS,
      instances: DEMO_MODEL_INSTANCES,
      offers,
      policy,
      before: scores(),
      after: scores(this.memory?.failureProbabilityOverridesBps),
      evidence: this.evidence,
      evidenceRoot: this.evidenceRoot,
      memory: this.memory,
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
