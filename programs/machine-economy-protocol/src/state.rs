use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub demo_authority: Pubkey,
    pub protocol_version: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AgentPassport {
    pub owner: Pubkey,
    pub stock_agent_root: [u8; 32],
    pub current_memory_root: [u8; 32],
    pub checkpoint_count: u64,
    pub reputation_score_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ModelRecord {
    pub authority: Pubkey,
    pub manifest_root: [u8; 32],
    pub model_hash: [u8; 32],
    pub version: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ModelInstance {
    pub provider: Pubkey,
    pub model_record: Pubkey,
    pub execution_commitment: [u8; 32],
    pub trust_score_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProviderRecord {
    pub authority: Pubkey,
    pub evidence_root: [u8; 32],
    pub hardware_trust_bps: u16,
    pub execution_trust_bps: u16,
    pub breach_count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ComputeOffer {
    pub provider: Pubkey,
    pub model_instance: Pubkey,
    pub offer_index: u64,
    pub price_lamports: u64,
    pub expected_latency_ms: u32,
    pub failure_probability_bps: u16,
    pub reservation_class: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WorkContract {
    pub customer_agent: Pubkey,
    pub customer_owner: Pubkey,
    pub provider: Pubkey,
    pub supplier_agent: Pubkey,
    pub provider_authority: Pubkey,
    pub compute_offer: Pubkey,
    pub parent_contract: Pubkey,
    pub child_contract: Pubkey,
    pub contract_index: u64,
    pub task_root: [u8; 32],
    pub verification_rule_root: [u8; 32],
    pub liability_rule_root: [u8; 32],
    pub result_root: [u8; 32],
    pub price_lamports: u64,
    pub escrow_lamports: u64,
    pub deadline_slot: u64,
    pub status: ContractStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ContractStatus {
    Draft,
    Funded,
    Running,
    Submitted,
    Verified,
    Settled,
    Disputed,
    Breached,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub jurors: [Pubkey; 5],
    pub commits: u8,
    pub reveals: u8,
    pub breach_votes: u8,
    pub provider_breached: bool,
    pub no_majority: bool,
    pub work_contract: Pubkey,
    pub claimant: Pubkey,
    pub evidence_root: [u8; 32],
    pub commit_deadline_slot: u64,
    pub reveal_deadline_slot: u64,
    pub status: DisputeStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DisputeStatus {
    Open,
    CommitPhase,
    RevealPhase,
    Finalized,
}

#[account]
#[derive(InitSpace)]
pub struct JurorRecord {
    pub juror: Pubkey,
    pub dispute: Pubkey,
    pub vote_commitment: [u8; 32],
    pub revealed_vote: VoteChoice,
    pub has_revealed: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VoteChoice {
    Unrevealed,
    ProviderBreached,
    ProviderDidNotBreach,
}

#[account]
#[derive(InitSpace)]
pub struct PrecedentRecord {
    pub dispute: Pubkey,
    pub work_contract: Pubkey,
    pub ruling_root: [u8; 32],
    pub published_slot: u64,
    pub bump: u8,
}
