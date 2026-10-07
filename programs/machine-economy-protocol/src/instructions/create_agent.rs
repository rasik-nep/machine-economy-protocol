use anchor_lang::prelude::*;

use crate::{
    constants::{AGENT_PASSPORT_SEED, PROTOCOL_CONFIG_SEED},
    error::MepError,
    state::{AgentPassport, ProtocolConfig},
};

#[derive(Accounts)]
#[instruction(stock_agent_root: [u8; 32], initial_memory_root: [u8; 32], agent_index: u64)]
pub struct CreateAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = owner,
        space = 8 + AgentPassport::INIT_SPACE,
        seeds = [
            AGENT_PASSPORT_SEED,
            owner.key().as_ref(),
            stock_agent_root.as_ref(),
            agent_index.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub agent_passport: Account<'info, AgentPassport>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_agent(
    ctx: Context<CreateAgent>,
    stock_agent_root: [u8; 32],
    initial_memory_root: [u8; 32],
    _agent_index: u64,
) -> Result<()> {
    require!(
        stock_agent_root.iter().any(|byte| *byte != 0),
        MepError::InvalidManifestRoot
    );
    require!(
        initial_memory_root.iter().any(|byte| *byte != 0),
        MepError::InvalidMemoryRoot
    );

    let agent_passport = &mut ctx.accounts.agent_passport;
    agent_passport.owner = ctx.accounts.owner.key();
    agent_passport.stock_agent_root = stock_agent_root;
    agent_passport.current_memory_root = initial_memory_root;
    agent_passport.checkpoint_count = 0;
    agent_passport.reputation_score_bps = 5000;
    agent_passport.bump = ctx.bumps.agent_passport;

    Ok(())
}
