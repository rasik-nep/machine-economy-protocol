use anchor_lang::prelude::*;

use crate::{
    constants::WORK_CONTRACT_SEED,
    error::MepError,
    state::{AgentPassport, ContractStatus, WorkContract},
};

#[derive(Accounts)]
#[instruction(contract_index: u64)]
pub struct CreateSubcontract<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,
    #[account(constraint = customer_agent.owner == customer.key())]
    pub customer_agent: Account<'info, AgentPassport>,
    #[account(mut, constraint = parent_contract.supplier_agent == customer_agent.key(), constraint = parent_contract.provider_authority == customer.key())]
    pub parent_contract: Account<'info, WorkContract>,
    pub supplier_agent: Account<'info, AgentPassport>,
    #[account(
        init,
        payer = customer,
        space = 8 + WorkContract::INIT_SPACE,
        seeds = [WORK_CONTRACT_SEED, customer_agent.key().as_ref(), contract_index.to_le_bytes().as_ref()],
        bump
    )]
    pub child_contract: Account<'info, WorkContract>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_subcontract(
    ctx: Context<CreateSubcontract>,
    contract_index: u64,
    price_lamports: u64,
    task_root: [u8; 32],
    verification_rule_root: [u8; 32],
    liability_rule_root: [u8; 32],
    deadline_slot: u64,
) -> Result<()> {
    let parent = &mut ctx.accounts.parent_contract;
    require!(
        parent.parent_contract == Pubkey::default()
            && parent.child_contract == Pubkey::default()
            && parent.supplier_agent != Pubkey::default()
            && (parent.status == ContractStatus::Funded
                || parent.status == ContractStatus::Running)
            && ctx.accounts.supplier_agent.key() != ctx.accounts.customer_agent.key(),
        MepError::InvalidSubcontract
    );
    require!(
        price_lamports > 0 && price_lamports <= parent.price_lamports,
        MepError::InvalidSubcontractPrice
    );
    require!(
        deadline_slot > Clock::get()?.slot && deadline_slot < parent.deadline_slot,
        MepError::InvalidDeadline
    );
    require!(
        task_root.iter().any(|byte| *byte != 0),
        MepError::InvalidTaskRoot
    );
    require!(
        verification_rule_root.iter().any(|byte| *byte != 0)
            && liability_rule_root.iter().any(|byte| *byte != 0),
        MepError::InvalidRuleRoot
    );

    let child = &mut ctx.accounts.child_contract;
    child.customer_agent = ctx.accounts.customer_agent.key();
    child.customer_owner = ctx.accounts.customer.key();
    child.provider = Pubkey::default();
    child.supplier_agent = ctx.accounts.supplier_agent.key();
    child.provider_authority = ctx.accounts.supplier_agent.owner;
    child.compute_offer = Pubkey::default();
    child.parent_contract = parent.key();
    child.child_contract = Pubkey::default();
    child.contract_index = contract_index;
    child.task_root = task_root;
    child.verification_rule_root = verification_rule_root;
    child.liability_rule_root = liability_rule_root;
    child.result_root = [0; 32];
    child.price_lamports = price_lamports;
    child.escrow_lamports = 0;
    child.deadline_slot = deadline_slot;
    child.status = ContractStatus::Draft;
    child.bump = ctx.bumps.child_contract;
    parent.child_contract = child.key();
    Ok(())
}
