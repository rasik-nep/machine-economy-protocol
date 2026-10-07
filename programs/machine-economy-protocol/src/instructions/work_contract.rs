use anchor_lang::{prelude::*, system_program};

use crate::{
    constants::WORK_CONTRACT_SEED,
    error::MepError,
    state::{AgentPassport, ComputeOffer, ContractStatus, ProviderRecord, WorkContract},
};

#[derive(Accounts)]
#[instruction(contract_index: u64)]
pub struct CreateContract<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,
    #[account(constraint = customer_agent.owner == customer.key())]
    pub customer_agent: Account<'info, AgentPassport>,
    #[account(constraint = compute_offer.provider == provider_record.key())]
    pub compute_offer: Account<'info, ComputeOffer>,
    pub provider_record: Account<'info, ProviderRecord>,
    #[account(
        init,
        payer = customer,
        space = 8 + WorkContract::INIT_SPACE,
        seeds = [WORK_CONTRACT_SEED, customer_agent.key().as_ref(), contract_index.to_le_bytes().as_ref()],
        bump
    )]
    pub work_contract: Account<'info, WorkContract>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_contract(
    ctx: Context<CreateContract>,
    contract_index: u64,
    task_root: [u8; 32],
    verification_rule_root: [u8; 32],
    liability_rule_root: [u8; 32],
    deadline_slot: u64,
) -> Result<()> {
    require!(
        task_root.iter().any(|byte| *byte != 0),
        MepError::InvalidTaskRoot
    );
    require!(
        verification_rule_root.iter().any(|byte| *byte != 0)
            && liability_rule_root.iter().any(|byte| *byte != 0),
        MepError::InvalidRuleRoot
    );
    require!(
        deadline_slot > Clock::get()?.slot,
        MepError::InvalidDeadline
    );
    require!(
        ctx.accounts.compute_offer.price_lamports > 0,
        MepError::InvalidOfferTerms
    );

    let contract = &mut ctx.accounts.work_contract;
    contract.customer_agent = ctx.accounts.customer_agent.key();
    contract.customer_owner = ctx.accounts.customer.key();
    contract.provider = ctx.accounts.provider_record.key();
    contract.supplier_agent = Pubkey::default();
    contract.provider_authority = ctx.accounts.provider_record.authority;
    contract.compute_offer = ctx.accounts.compute_offer.key();
    contract.parent_contract = Pubkey::default();
    contract.child_contract = Pubkey::default();
    contract.contract_index = contract_index;
    contract.task_root = task_root;
    contract.verification_rule_root = verification_rule_root;
    contract.liability_rule_root = liability_rule_root;
    contract.result_root = [0; 32];
    contract.price_lamports = ctx.accounts.compute_offer.price_lamports;
    contract.escrow_lamports = 0;
    contract.deadline_slot = deadline_slot;
    contract.status = ContractStatus::Draft;
    contract.bump = ctx.bumps.work_contract;
    Ok(())
}

#[derive(Accounts)]
pub struct FundContract<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,
    #[account(mut, constraint = work_contract.customer_owner == customer.key())]
    pub work_contract: Account<'info, WorkContract>,
    pub system_program: Program<'info, System>,
}

pub fn handle_fund_contract(ctx: Context<FundContract>) -> Result<()> {
    let contract = &mut ctx.accounts.work_contract;
    require!(
        contract.status == ContractStatus::Draft,
        MepError::InvalidContractState
    );
    require!(
        Clock::get()?.slot <= contract.deadline_slot,
        MepError::DeadlinePassed
    );
    require!(contract.escrow_lamports == 0, MepError::EscrowInvariant);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.customer.to_account_info(),
                to: contract.to_account_info(),
            },
        ),
        contract.price_lamports,
    )?;

    contract.escrow_lamports = contract.price_lamports;
    contract.status = ContractStatus::Funded;
    Ok(())
}

#[derive(Accounts)]
pub struct StartContract<'info> {
    pub provider: Signer<'info>,
    #[account(mut, constraint = work_contract.provider_authority == provider.key())]
    pub work_contract: Account<'info, WorkContract>,
}

pub fn handle_start_contract(ctx: Context<StartContract>) -> Result<()> {
    let contract = &mut ctx.accounts.work_contract;
    require!(
        contract.status == ContractStatus::Funded,
        MepError::InvalidContractState
    );
    require!(
        Clock::get()?.slot <= contract.deadline_slot,
        MepError::DeadlinePassed
    );
    contract.status = ContractStatus::Running;
    Ok(())
}

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    pub provider: Signer<'info>,
    #[account(mut, constraint = work_contract.provider_authority == provider.key())]
    pub work_contract: Account<'info, WorkContract>,
}

pub fn handle_submit_result(ctx: Context<SubmitResult>, result_root: [u8; 32]) -> Result<()> {
    require!(
        result_root.iter().any(|byte| *byte != 0),
        MepError::InvalidResultRoot
    );
    let contract = &mut ctx.accounts.work_contract;
    require!(
        contract.status == ContractStatus::Running,
        MepError::InvalidContractState
    );
    require!(
        Clock::get()?.slot <= contract.deadline_slot,
        MepError::DeadlinePassed
    );
    contract.result_root = result_root;
    contract.status = ContractStatus::Submitted;
    Ok(())
}

#[derive(Accounts)]
pub struct VerifyContract<'info> {
    pub customer: Signer<'info>,
    #[account(mut, constraint = work_contract.customer_owner == customer.key())]
    pub work_contract: Account<'info, WorkContract>,
}

pub fn handle_verify_contract(ctx: Context<VerifyContract>) -> Result<()> {
    let contract = &mut ctx.accounts.work_contract;
    require!(
        contract.status == ContractStatus::Submitted,
        MepError::InvalidContractState
    );
    require!(
        contract.result_root.iter().any(|byte| *byte != 0),
        MepError::InvalidResultRoot
    );
    contract.status = ContractStatus::Verified;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleContract<'info> {
    pub customer: Signer<'info>,
    #[account(mut, constraint = work_contract.customer_owner == customer.key())]
    pub work_contract: Account<'info, WorkContract>,
    /// CHECK: Receiving lamports only; address is fixed when the contract is created.
    #[account(mut, address = work_contract.provider_authority)]
    pub provider_wallet: UncheckedAccount<'info>,
}

pub fn handle_settle_contract(ctx: Context<SettleContract>) -> Result<()> {
    let contract = &mut ctx.accounts.work_contract;
    require!(
        contract.status == ContractStatus::Verified,
        MepError::InvalidContractState
    );
    require!(
        contract.escrow_lamports == contract.price_lamports && contract.escrow_lamports > 0,
        MepError::EscrowInvariant
    );

    let contract_info = contract.to_account_info();
    let provider_info = ctx.accounts.provider_wallet.to_account_info();
    let rent_floor = Rent::get()?.minimum_balance(contract_info.data_len());
    let contract_balance = contract_info.lamports();
    let required_balance = rent_floor
        .checked_add(contract.escrow_lamports)
        .ok_or(error!(MepError::EscrowInvariant))?;
    require!(
        contract_balance >= required_balance,
        MepError::EscrowInvariant
    );
    let provider_balance = provider_info.lamports();
    let new_provider_balance = provider_balance
        .checked_add(contract.escrow_lamports)
        .ok_or(error!(MepError::EscrowInvariant))?;

    **contract_info.try_borrow_mut_lamports()? = contract_balance - contract.escrow_lamports;
    **provider_info.try_borrow_mut_lamports()? = new_provider_balance;
    contract.escrow_lamports = 0;
    contract.status = ContractStatus::Settled;
    Ok(())
}
