use anchor_lang::prelude::*;

use crate::{
    constants::{PROTOCOL_CONFIG_SEED, PROVIDER_RECORD_SEED},
    error::MepError,
    state::{ProtocolConfig, ProviderRecord},
};

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + ProviderRecord::INIT_SPACE,
        seeds = [PROVIDER_RECORD_SEED, authority.key().as_ref()],
        bump
    )]
    pub provider_record: Account<'info, ProviderRecord>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_provider(
    ctx: Context<RegisterProvider>,
    evidence_root: [u8; 32],
    hardware_trust_bps: u16,
    execution_trust_bps: u16,
) -> Result<()> {
    require!(
        evidence_root.iter().any(|byte| *byte != 0),
        MepError::InvalidProviderEvidenceRoot
    );
    require!(
        hardware_trust_bps <= 10_000 && execution_trust_bps <= 10_000,
        MepError::InvalidBasisPoints
    );

    let record = &mut ctx.accounts.provider_record;
    record.authority = ctx.accounts.authority.key();
    record.evidence_root = evidence_root;
    record.hardware_trust_bps = hardware_trust_bps;
    record.execution_trust_bps = execution_trust_bps;
    record.breach_count = 0;
    record.bump = ctx.bumps.provider_record;
    Ok(())
}
