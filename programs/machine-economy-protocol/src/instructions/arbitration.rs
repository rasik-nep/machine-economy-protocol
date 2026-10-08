use crate::{constants::*, error::MepError, instructions::work_contract::release_escrow, state::*};
use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

// The MVP jury is explicitly appointed by the configured demo authority.
// No permissionless randomness or production jury-selection claim is made.
#[derive(Accounts)]
pub struct OpenDispute<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    pub demo_authority: Signer<'info>,
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump,
        constraint = protocol_config.demo_authority == demo_authority.key())]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut, constraint = work_contract.customer_owner == claimant.key())]
    pub work_contract: Account<'info, WorkContract>,
    #[account(init, payer = claimant, space = 8 + Dispute::INIT_SPACE,
        seeds = [DISPUTE_SEED, work_contract.key().as_ref()], bump)]
    pub dispute: Account<'info, Dispute>,
    pub system_program: Program<'info, System>,
}
pub fn open(
    ctx: Context<OpenDispute>,
    evidence: [u8; 32],
    jurors: [Pubkey; 5],
    commit_end: u64,
    reveal_end: u64,
) -> Result<()> {
    let c = &mut ctx.accounts.work_contract;
    let slot = Clock::get()?.slot;
    // Unfinished work is disputable once its deadline passes. A submitted result
    // is disputable only inside the customer review window, before it can be
    // released to the provider by release_unverified.
    let window_open = match c.status {
        ContractStatus::Running | ContractStatus::Funded => true,
        ContractStatus::Submitted => {
            slot <= c
                .deadline_slot
                .checked_add(REVIEW_WINDOW_SLOTS)
                .ok_or(error!(MepError::InvalidDeadline))?
        }
        _ => return err!(MepError::InvalidContractState),
    };
    require!(
        window_open && slot > c.deadline_slot && slot < commit_end && commit_end < reveal_end,
        MepError::InvalidDeadline
    );
    require!(
        evidence != [0; 32] && c.escrow_lamports == c.price_lamports && c.price_lamports > 0,
        MepError::InvalidDispute
    );
    for (i, juror) in jurors.iter().enumerate() {
        require!(
            *juror != Pubkey::default()
                && *juror != c.customer_owner
                && *juror != c.provider_authority
                && !jurors[..i].contains(juror),
            MepError::InvalidDispute
        );
    }
    let d = &mut ctx.accounts.dispute;
    d.work_contract = c.key();
    d.claimant = ctx.accounts.claimant.key();
    d.evidence_root = evidence;
    d.jurors = jurors;
    d.commit_deadline_slot = commit_end;
    d.reveal_deadline_slot = reveal_end;
    d.status = DisputeStatus::CommitPhase;
    d.bump = ctx.bumps.dispute;
    c.status = ContractStatus::Disputed;
    Ok(())
}
#[derive(Accounts)]
pub struct CommitVote<'info> {
    #[account(mut)]
    pub juror: Signer<'info>,
    #[account(mut)]
    pub dispute: Account<'info, Dispute>,
    #[account(init, payer = juror, space = 8 + JurorRecord::INIT_SPACE,
        seeds = [JUROR_RECORD_SEED, dispute.key().as_ref(), juror.key().as_ref()], bump)]
    pub juror_record: Account<'info, JurorRecord>,
    pub system_program: Program<'info, System>,
}
pub fn commit(ctx: Context<CommitVote>, commitment: [u8; 32]) -> Result<()> {
    let d = &mut ctx.accounts.dispute;
    require!(
        d.status == DisputeStatus::CommitPhase
            && Clock::get()?.slot <= d.commit_deadline_slot
            && d.jurors.contains(&ctx.accounts.juror.key())
            && commitment != [0; 32],
        MepError::InvalidDispute
    );
    let r = &mut ctx.accounts.juror_record;
    r.juror = ctx.accounts.juror.key();
    r.dispute = d.key();
    r.vote_commitment = commitment;
    r.revealed_vote = VoteChoice::Unrevealed;
    r.bump = ctx.bumps.juror_record;
    d.commits += 1;
    Ok(())
}
#[derive(Accounts)]
pub struct RevealVote<'info> {
    pub juror: Signer<'info>,
    #[account(mut)]
    pub dispute: Account<'info, Dispute>,
    #[account(mut, seeds = [JUROR_RECORD_SEED, dispute.key().as_ref(), juror.key().as_ref()], bump = juror_record.bump,
        constraint = juror_record.dispute == dispute.key(), constraint = juror_record.juror == juror.key())]
    pub juror_record: Account<'info, JurorRecord>,
}
pub fn reveal(ctx: Context<RevealVote>, vote: u8, nonce: [u8; 32]) -> Result<()> {
    let d = &mut ctx.accounts.dispute;
    let r = &mut ctx.accounts.juror_record;
    let slot = Clock::get()?.slot;
    require!(
        matches!(
            d.status,
            DisputeStatus::CommitPhase | DisputeStatus::RevealPhase
        ) && slot > d.commit_deadline_slot
            && slot <= d.reveal_deadline_slot
            && !r.has_revealed
            && (vote == 1 || vote == 2),
        MepError::InvalidDispute
    );
    let expected = hashv(&[
        b"mep.vote.v1",
        d.key().as_ref(),
        r.juror.as_ref(),
        &[vote],
        &nonce,
    ])
    .to_bytes();
    require!(expected == r.vote_commitment, MepError::CommitmentMismatch);
    r.revealed_vote = if vote == 1 {
        VoteChoice::ProviderBreached
    } else {
        VoteChoice::ProviderDidNotBreach
    };
    r.has_revealed = true;
    d.reveals += 1;
    if vote == 1 {
        d.breach_votes += 1;
    }
    d.status = DisputeStatus::RevealPhase;
    Ok(())
}
#[derive(Accounts)]
pub struct FinalizeDispute<'info> {
    #[account(mut, constraint = dispute.work_contract == work_contract.key())]
    pub dispute: Account<'info, Dispute>,
    #[account(mut)]
    pub work_contract: Account<'info, WorkContract>,
    /// CHECK: fixed refund destination from signed contract.
    #[account(mut, address = work_contract.customer_owner)]
    pub customer_wallet: UncheckedAccount<'info>,
    /// CHECK: fixed payout destination from signed contract.
    #[account(mut, address = work_contract.provider_authority)]
    pub provider_wallet: UncheckedAccount<'info>,
    /// Required for compute contracts so a breach ruling is recorded against the
    /// provider. Agent-to-agent contracts have no provider record.
    #[account(mut)]
    pub provider_record: Option<Account<'info, ProviderRecord>>,
}
pub fn finalize(ctx: Context<FinalizeDispute>) -> Result<()> {
    let d = &mut ctx.accounts.dispute;
    let c = &mut ctx.accounts.work_contract;
    require!(
        d.status != DisputeStatus::Finalized
            && c.status == ContractStatus::Disputed
            && Clock::get()?.slot > d.reveal_deadline_slot,
        MepError::InvalidDispute
    );
    // An absolute majority of the appointed five decides the ruling. A hung jury
    // refunds the customer: the provider never delivered an accepted result.
    let breached = d.breach_votes >= 3;
    let cleared = d.reveals - d.breach_votes >= 3;
    d.provider_breached = breached;
    d.no_majority = !breached && !cleared;
    if c.provider != Pubkey::default() {
        let record = ctx
            .accounts
            .provider_record
            .as_mut()
            .ok_or(error!(MepError::ProviderRecordMismatch))?;
        require_keys_eq!(record.key(), c.provider, MepError::ProviderRecordMismatch);
        if breached {
            record.breach_count = record
                .breach_count
                .checked_add(1)
                .ok_or(error!(MepError::InvalidDispute))?;
        }
    }
    let recipient = if cleared {
        ctx.accounts.provider_wallet.to_account_info()
    } else {
        ctx.accounts.customer_wallet.to_account_info()
    };
    release_escrow(c, &recipient)?;
    c.status = if breached {
        ContractStatus::Breached
    } else if cleared {
        ContractStatus::Settled
    } else {
        ContractStatus::Refunded
    };
    d.status = DisputeStatus::Finalized;
    Ok(())
}
#[derive(Accounts)]
pub struct PublishPrecedent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub dispute: Account<'info, Dispute>,
    #[account(constraint = work_contract.key() == dispute.work_contract)]
    pub work_contract: Account<'info, WorkContract>,
    #[account(init, payer = payer, space = 8 + PrecedentRecord::INIT_SPACE,
        seeds = [PRECEDENT_RECORD_SEED, dispute.key().as_ref()], bump)]
    pub precedent: Account<'info, PrecedentRecord>,
    pub system_program: Program<'info, System>,
}
pub fn publish(ctx: Context<PublishPrecedent>) -> Result<()> {
    let d = &ctx.accounts.dispute;
    require!(
        d.status == DisputeStatus::Finalized,
        MepError::InvalidDispute
    );
    let p = &mut ctx.accounts.precedent;
    p.dispute = d.key();
    p.work_contract = d.work_contract;
    p.ruling_root = hashv(&[
        b"mep.precedent.v1",
        d.key().as_ref(),
        &d.evidence_root,
        &[
            d.provider_breached as u8,
            d.breach_votes,
            d.reveals,
            d.no_majority as u8,
        ],
    ])
    .to_bytes();
    p.published_slot = Clock::get()?.slot;
    p.bump = ctx.bumps.precedent;
    Ok(())
}
