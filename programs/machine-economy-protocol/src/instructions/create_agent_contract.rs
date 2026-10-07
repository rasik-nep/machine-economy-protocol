use anchor_lang::prelude::*;

use crate::{
    constants::WORK_CONTRACT_SEED,
    error::MepError,
    state::{AgentPassport, ContractStatus, WorkContract},
};

#[derive(Accounts)]
#[instruction(contract_index: u64)]
pub struct CreateAgentContract<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,
    #[account(constraint = customer_agent.owner == customer.key())]
    pub customer_agent: Account<'info, AgentPassport>,
    pub supplier_agent: Account<'info, AgentPassport>,
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

pub fn handle_create_agent_contract(
    ctx: Context<CreateAgentContract>,
    contract_index: u64,
    price_lamports: u64,
    task_root: [u8; 32],
    verification_rule_root: [u8; 32],
    liability_rule_root: [u8; 32],
    deadline_slot: u64,
) -> Result<()> {
    require!(
        ctx.accounts.customer_agent.key() != ctx.accounts.supplier_agent.key(),
        MepError::InvalidSubcontract
    );
    require!(price_lamports > 0, MepError::InvalidSubcontractPrice);
    require!(
        deadline_slot > Clock::get()?.slot,
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

    let contract = &mut ctx.accounts.work_contract;
    contract.customer_agent = ctx.accounts.customer_agent.key();
    contract.customer_owner = ctx.accounts.customer.key();
    contract.provider = Pubkey::default();
    contract.supplier_agent = ctx.accounts.supplier_agent.key();
    contract.provider_authority = ctx.accounts.supplier_agent.owner;
    contract.compute_offer = Pubkey::default();
    contract.parent_contract = Pubkey::default();
    contract.child_contract = Pubkey::default();
    contract.contract_index = contract_index;
    contract.task_root = task_root;
    contract.verification_rule_root = verification_rule_root;
    contract.liability_rule_root = liability_rule_root;
    contract.result_root = [0; 32];
    contract.price_lamports = price_lamports;
    contract.escrow_lamports = 0;
    contract.deadline_slot = deadline_slot;
    contract.status = ContractStatus::Draft;
    contract.bump = ctx.bumps.work_contract;
    Ok(())
}
