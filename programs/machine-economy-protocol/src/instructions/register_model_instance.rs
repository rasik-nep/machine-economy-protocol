use anchor_lang::prelude::*;

use crate::{
    constants::{MODEL_INSTANCE_SEED, PROVIDER_RECORD_SEED},
    error::MepError,
    state::{ModelInstance, ModelRecord, ProviderRecord},
};

#[derive(Accounts)]
pub struct RegisterModelInstance<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    #[account(
        seeds = [PROVIDER_RECORD_SEED, provider.key().as_ref()],
        bump = provider_record.bump,
        constraint = provider_record.authority == provider.key()
    )]
    pub provider_record: Account<'info, ProviderRecord>,
    pub model_record: Account<'info, ModelRecord>,
    #[account(
        init,
        payer = provider,
        space = 8 + ModelInstance::INIT_SPACE,
        seeds = [MODEL_INSTANCE_SEED, provider_record.key().as_ref(), model_record.key().as_ref()],
        bump
    )]
    pub model_instance: Account<'info, ModelInstance>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_model_instance(
    ctx: Context<RegisterModelInstance>,
    execution_commitment: [u8; 32],
    trust_score_bps: u16,
) -> Result<()> {
    require!(
        execution_commitment.iter().any(|byte| *byte != 0),
        MepError::InvalidExecutionCommitment
    );
    require!(trust_score_bps <= 10_000, MepError::InvalidBasisPoints);

    let instance = &mut ctx.accounts.model_instance;
    instance.provider = ctx.accounts.provider_record.key();
    instance.model_record = ctx.accounts.model_record.key();
    instance.execution_commitment = execution_commitment;
    instance.trust_score_bps = trust_score_bps;
    instance.bump = ctx.bumps.model_instance;
    Ok(())
}
