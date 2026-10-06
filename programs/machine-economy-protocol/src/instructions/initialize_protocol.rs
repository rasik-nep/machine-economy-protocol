use anchor_lang::prelude::*;

use crate::{constants::PROTOCOL_CONFIG_SEED, error::MepError, state::ProtocolConfig};

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_protocol(
    ctx: Context<InitializeProtocol>,
    protocol_version: u16,
    demo_authority: Pubkey,
) -> Result<()> {
    require!(protocol_version > 0, MepError::InvalidProtocolVersion);

    let protocol_config = &mut ctx.accounts.protocol_config;
    protocol_config.authority = ctx.accounts.authority.key();
    protocol_config.demo_authority = demo_authority;
    protocol_config.protocol_version = protocol_version;
    protocol_config.bump = ctx.bumps.protocol_config;

    Ok(())
}
