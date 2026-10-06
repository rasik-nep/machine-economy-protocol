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

    pub fn create_agent(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn register_provider(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn register_model_instance(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn publish_compute_offer(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn create_contract(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn open_dispute(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn commit_vote(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn reveal_vote(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }

    pub fn publish_precedent(ctx: Context<ProtocolStub>) -> Result<()> {
        crate::instructions::stubs::handle_instruction_stub(ctx)
    }
}
