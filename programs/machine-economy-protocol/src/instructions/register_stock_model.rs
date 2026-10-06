use anchor_lang::prelude::*;

use crate::{
    constants::{MODEL_RECORD_SEED, PROTOCOL_CONFIG_SEED},
    error::MepError,
    state::{ModelRecord, ProtocolConfig},
};

#[derive(Accounts)]
#[instruction(manifest_root: [u8; 32])]
pub struct RegisterStockModel<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump,
        has_one = authority
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + ModelRecord::INIT_SPACE,
        seeds = [MODEL_RECORD_SEED, manifest_root.as_ref()],
        bump
    )]
    pub model_record: Account<'info, ModelRecord>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_stock_model(
    ctx: Context<RegisterStockModel>,
    manifest_root: [u8; 32],
    model_hash: [u8; 32],
    version: u32,
) -> Result<()> {
    require!(version > 0, MepError::InvalidManifestVersion);
    require!(
        manifest_root.iter().any(|byte| *byte != 0),
        MepError::InvalidManifestRoot
    );
    require!(
        model_hash.iter().any(|byte| *byte != 0),
        MepError::InvalidModelHash
    );

    let model_record = &mut ctx.accounts.model_record;
    model_record.authority = ctx.accounts.authority.key();
    model_record.manifest_root = manifest_root;
    model_record.model_hash = model_hash;
    model_record.version = version;
    model_record.bump = ctx.bumps.model_record;

    Ok(())
}
