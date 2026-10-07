use anchor_lang::prelude::*;

use crate::{
    constants::{COMPUTE_OFFER_SEED, MODEL_INSTANCE_SEED, PROVIDER_RECORD_SEED},
    error::MepError,
    state::{ComputeOffer, ModelInstance, ProviderRecord},
};

#[derive(Accounts)]
#[instruction(offer_index: u64)]
pub struct PublishComputeOffer<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    #[account(
        seeds = [PROVIDER_RECORD_SEED, provider.key().as_ref()],
        bump = provider_record.bump,
        constraint = provider_record.authority == provider.key()
    )]
    pub provider_record: Account<'info, ProviderRecord>,
    #[account(
        seeds = [MODEL_INSTANCE_SEED, provider_record.key().as_ref(), model_instance.model_record.as_ref()],
        bump = model_instance.bump,
        constraint = model_instance.provider == provider_record.key()
    )]
    pub model_instance: Account<'info, ModelInstance>,
    #[account(
        init,
        payer = provider,
        space = 8 + ComputeOffer::INIT_SPACE,
        seeds = [COMPUTE_OFFER_SEED, model_instance.key().as_ref(), offer_index.to_le_bytes().as_ref()],
        bump
    )]
    pub compute_offer: Account<'info, ComputeOffer>,
    pub system_program: Program<'info, System>,
}

pub fn handle_publish_compute_offer(
    ctx: Context<PublishComputeOffer>,
    offer_index: u64,
    price_lamports: u64,
    expected_latency_ms: u32,
    failure_probability_bps: u16,
    reservation_class: u8,
) -> Result<()> {
    require!(
        price_lamports > 0 && expected_latency_ms > 0,
        MepError::InvalidOfferTerms
    );
    require!(
        failure_probability_bps <= 10_000,
        MepError::InvalidBasisPoints
    );
    require!(reservation_class <= 2, MepError::InvalidReservationClass);

    let offer = &mut ctx.accounts.compute_offer;
    offer.provider = ctx.accounts.provider_record.key();
    offer.model_instance = ctx.accounts.model_instance.key();
    offer.offer_index = offer_index;
    offer.price_lamports = price_lamports;
    offer.expected_latency_ms = expected_latency_ms;
    offer.failure_probability_bps = failure_probability_bps;
    offer.reservation_class = reservation_class;
    offer.bump = ctx.bumps.compute_offer;
    Ok(())
}
