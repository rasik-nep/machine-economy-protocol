// Reads and decodes Machine Economy Protocol accounts straight from a Solana RPC.
// Every account must be owned by the pinned program and carry the right Anchor
// discriminator, so an RPC cannot pass off another program's data.
import anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { BN } from "@coral-xyz/anchor";

import type { HashHex } from "../../../packages/protocol/src/index.ts";
import type { ChainMarketAccounts } from "../../../packages/protocol/src/chain-market.ts";
import type { ChainReader } from "./verify.ts";

const rootHex = (bytes: number[]): HashHex => `sha256:${Buffer.from(bytes).toString("hex")}`;
/** Enum variant name, lower camel case ("Finalized" → "finalized"), as the program names it. */
const statusName = (status: object) => {
  const variant = Object.keys(status)[0] ?? "unknown";
  return variant.charAt(0).toLowerCase() + variant.slice(1);
};

type Idl = ConstructorParameters<typeof anchor.BorshAccountsCoder>[0];

// Decoded field shapes for the accounts this reader uses. The raw accounts coder keeps
// the IDL's snake_case field names (only anchor.Program camel-cases them).
type PrecedentAccount = { dispute: PublicKey; work_contract: PublicKey; ruling_root: number[] };
type DisputeAccount = {
  work_contract: PublicKey;
  evidence_root: number[];
  provider_breached: boolean;
  no_majority: boolean;
  breach_votes: number;
  reveals: number;
  status: object;
};
type ContractAccount = {
  customer_agent: PublicKey;
  provider: PublicKey;
  provider_authority: PublicKey;
  compute_offer: PublicKey;
  task_root: number[];
  verification_rule_root: number[];
  result_root: number[];
  status: object;
};
type OfferAccount = {
  provider: PublicKey;
  model_instance: PublicKey;
  price_lamports: BN;
  expected_latency_ms: number;
  failure_probability_bps: number;
  reservation_class: number;
};
type InstanceAccount = {
  provider: PublicKey;
  model_record: PublicKey;
  execution_commitment: number[];
  trust_score_bps: number;
};
type ProviderAccount = {
  evidence_root: number[];
  hardware_trust_bps: number;
  execution_trust_bps: number;
  breach_count: number;
};
type ModelRecordAccount = { manifest_root: number[] };

export function rpcReader(rpcUrl: string, idl: Idl, programId: PublicKey): ChainReader {
  const connection = new Connection(rpcUrl, "confirmed");
  const coder = new anchor.BorshAccountsCoder(idl);

  async function one<T>(name: string, address: string): Promise<T | null> {
    const info = await connection.getAccountInfo(new PublicKey(address));
    if (!info) return null;
    if (!info.owner.equals(programId))
      throw new Error(`${name} ${address} is not owned by program ${programId.toBase58()}`);
    return coder.decode<T>(name, info.data);
  }
  /** Every account of one type. Callers name the decoded shape for that type. */
  async function all(name: string): Promise<{ address: string; account: unknown }[]> {
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [{ memcmp: coder.memcmp(name) as { offset: number; bytes: string } }]
    });
    return accounts.map(({ pubkey, account }) => ({
      address: pubkey.toBase58(),
      account: coder.decode<unknown>(name, account.data)
    }));
  }
  type Decoded<T> = { address: string; account: T }[];

  return {
    async precedent(address) {
      const p = await one<PrecedentAccount>("PrecedentRecord", address);
      return (
        p && {
          address,
          dispute: p.dispute.toBase58(),
          workContract: p.work_contract.toBase58(),
          rulingRoot: rootHex(p.ruling_root)
        }
      );
    },
    async dispute(address) {
      const d = await one<DisputeAccount>("Dispute", address);
      return (
        d && {
          address,
          key: new PublicKey(address).toBytes(),
          workContract: d.work_contract.toBase58(),
          evidenceRoot: rootHex(d.evidence_root),
          providerBreached: d.provider_breached,
          noMajority: d.no_majority,
          breachVotes: d.breach_votes,
          reveals: d.reveals,
          finalized: statusName(d.status) === "finalized"
        }
      );
    },
    async contract(address) {
      const c = await one<ContractAccount>("WorkContract", address);
      // The hired model: compute_offer → model_instance → model_record.manifest_root.
      const offer =
        c && !c.compute_offer.equals(PublicKey.default)
          ? await one<OfferAccount>("ComputeOffer", c.compute_offer.toBase58())
          : null;
      const instance =
        offer && (await one<InstanceAccount>("ModelInstance", offer.model_instance.toBase58()));
      const record =
        instance &&
        (await one<ModelRecordAccount>("ModelRecord", instance.model_record.toBase58()));
      return (
        c && {
          address,
          customerAgent: c.customer_agent.toBase58(),
          provider: c.provider.toBase58(),
          providerAuthority: {
            address: c.provider_authority.toBase58(),
            publicKey: c.provider_authority.toBytes()
          },
          taskRoot: rootHex(c.task_root),
          verificationRuleRoot: rootHex(c.verification_rule_root),
          resultRoot: rootHex(c.result_root),
          status: statusName(c.status),
          modelRoot: record ? rootHex(record.manifest_root) : null
        }
      );
    },
    async market(): Promise<ChainMarketAccounts> {
      const [offers, instances, providers, records] = await Promise.all([
        all("ComputeOffer") as Promise<Decoded<OfferAccount>>,
        all("ModelInstance") as Promise<Decoded<InstanceAccount>>,
        all("ProviderRecord") as Promise<Decoded<ProviderAccount>>,
        all("ModelRecord") as Promise<Decoded<ModelRecordAccount>>
      ]);
      return {
        offers: offers.map(({ address, account }) => ({
          address,
          provider: account.provider.toBase58(),
          modelInstance: account.model_instance.toBase58(),
          priceLamports: BigInt(account.price_lamports.toString()),
          expectedLatencyMs: account.expected_latency_ms,
          failureProbabilityBps: account.failure_probability_bps,
          reservationClass: account.reservation_class
        })),
        modelInstances: instances.map(({ address, account }) => ({
          address,
          provider: account.provider.toBase58(),
          modelRecord: account.model_record.toBase58(),
          executionCommitment: rootHex(account.execution_commitment),
          trustScoreBps: account.trust_score_bps
        })),
        providers: providers.map(({ address, account }) => ({
          address,
          evidenceRoot: rootHex(account.evidence_root),
          hardwareTrustBps: account.hardware_trust_bps,
          executionTrustBps: account.execution_trust_bps,
          breachCount: account.breach_count
        })),
        modelRecords: records.map(({ address, account }) => ({
          address,
          manifestRoot: rootHex(account.manifest_root)
        }))
      };
    }
  };
}
