pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE");

#[program]
pub mod machine_economy_protocol {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        protocol_version: u16,
        demo_authority: Pubkey,
    ) -> Result<()> {
        crate::instructions::initialize_protocol::handle_initialize_protocol(
            ctx,
            protocol_version,
            demo_authority,
        )
    }

    pub fn register_stock_model(
        ctx: Context<RegisterStockModel>,
        manifest_root: [u8; 32],
        model_hash: [u8; 32],
        version: u32,
    ) -> Result<()> {
        crate::instructions::register_stock_model::handle_register_stock_model(
            ctx,
            manifest_root,
            model_hash,
            version,
        )
    }

    pub fn create_agent(
        ctx: Context<CreateAgent>,
        stock_agent_root: [u8; 32],
        initial_memory_root: [u8; 32],
        agent_index: u64,
    ) -> Result<()> {
        crate::instructions::create_agent::handle_create_agent(
            ctx,
            stock_agent_root,
            initial_memory_root,
            agent_index,
        )
    }

    pub fn checkpoint_agent(
        ctx: Context<CheckpointAgent>,
        new_memory_root: [u8; 32],
    ) -> Result<()> {
        crate::instructions::checkpoint_agent::handle_checkpoint_agent(ctx, new_memory_root)
    }

    pub fn register_provider(
        ctx: Context<RegisterProvider>,
        evidence_root: [u8; 32],
        hardware_trust_bps: u16,
        execution_trust_bps: u16,
    ) -> Result<()> {
        crate::instructions::register_provider::handle_register_provider(
            ctx,
            evidence_root,
            hardware_trust_bps,
            execution_trust_bps,
        )
    }

    pub fn register_model_instance(
        ctx: Context<RegisterModelInstance>,
        execution_commitment: [u8; 32],
        trust_score_bps: u16,
    ) -> Result<()> {
        crate::instructions::register_model_instance::handle_register_model_instance(
            ctx,
            execution_commitment,
            trust_score_bps,
        )
    }

    pub fn publish_compute_offer(
        ctx: Context<PublishComputeOffer>,
        offer_index: u64,
        price_lamports: u64,
        expected_latency_ms: u32,
        failure_probability_bps: u16,
        reservation_class: u8,
    ) -> Result<()> {
        crate::instructions::publish_compute_offer::handle_publish_compute_offer(
            ctx,
            offer_index,
            price_lamports,
            expected_latency_ms,
            failure_probability_bps,
            reservation_class,
        )
    }

    pub fn create_contract(
        ctx: Context<CreateContract>,
        contract_index: u64,
        task_root: [u8; 32],
        verification_rule_root: [u8; 32],
        liability_rule_root: [u8; 32],
        deadline_slot: u64,
    ) -> Result<()> {
        crate::instructions::work_contract::handle_create_contract(
            ctx,
            contract_index,
            task_root,
            verification_rule_root,
            liability_rule_root,
            deadline_slot,
        )
    }

    pub fn create_subcontract(
        ctx: Context<CreateSubcontract>,
        contract_index: u64,
        price_lamports: u64,
        task_root: [u8; 32],
        verification_rule_root: [u8; 32],
        liability_rule_root: [u8; 32],
        deadline_slot: u64,
    ) -> Result<()> {
        crate::instructions::create_subcontract::handle_create_subcontract(
            ctx,
            contract_index,
            price_lamports,
            task_root,
            verification_rule_root,
            liability_rule_root,
            deadline_slot,
        )
    }

    pub fn create_agent_contract(
        ctx: Context<CreateAgentContract>,
        contract_index: u64,
        price_lamports: u64,
        task_root: [u8; 32],
        verification_rule_root: [u8; 32],
        liability_rule_root: [u8; 32],
        deadline_slot: u64,
    ) -> Result<()> {
        crate::instructions::create_agent_contract::handle_create_agent_contract(
            ctx,
            contract_index,
            price_lamports,
            task_root,
            verification_rule_root,
            liability_rule_root,
            deadline_slot,
        )
    }

    pub fn fund_contract(ctx: Context<FundContract>) -> Result<()> {
        crate::instructions::work_contract::handle_fund_contract(ctx)
    }

    pub fn start_contract(ctx: Context<StartContract>) -> Result<()> {
        crate::instructions::work_contract::handle_start_contract(ctx)
    }

    pub fn submit_result(ctx: Context<SubmitResult>, result_root: [u8; 32]) -> Result<()> {
        crate::instructions::work_contract::handle_submit_result(ctx, result_root)
    }

    pub fn verify_contract(ctx: Context<VerifyContract>) -> Result<()> {
        crate::instructions::work_contract::handle_verify_contract(ctx)
    }

    pub fn settle_contract(ctx: Context<SettleContract>) -> Result<()> {
        crate::instructions::work_contract::handle_settle_contract(ctx)
    }

    pub fn open_dispute(
        ctx: Context<OpenDispute>,
        evidence_root: [u8; 32],
        jurors: [Pubkey; 5],
        commit_deadline_slot: u64,
        reveal_deadline_slot: u64,
    ) -> Result<()> {
        arbitration::open(
            ctx,
            evidence_root,
            jurors,
            commit_deadline_slot,
            reveal_deadline_slot,
        )
    }
    pub fn commit_vote(ctx: Context<CommitVote>, commitment: [u8; 32]) -> Result<()> {
        arbitration::commit(ctx, commitment)
    }
    pub fn reveal_vote(ctx: Context<RevealVote>, vote: u8, nonce: [u8; 32]) -> Result<()> {
        arbitration::reveal(ctx, vote, nonce)
    }
    pub fn finalize_dispute(ctx: Context<FinalizeDispute>) -> Result<()> {
        arbitration::finalize(ctx)
    }
    pub fn publish_precedent(ctx: Context<PublishPrecedent>) -> Result<()> {
        arbitration::publish(ctx)
    }
}
