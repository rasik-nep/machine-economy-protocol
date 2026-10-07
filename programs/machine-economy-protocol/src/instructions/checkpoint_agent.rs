use anchor_lang::prelude::*;

use crate::{error::MepError, state::AgentPassport};

#[derive(Accounts)]
pub struct CheckpointAgent<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner
    )]
    pub agent_passport: Account<'info, AgentPassport>,
}

pub fn handle_checkpoint_agent(
    ctx: Context<CheckpointAgent>,
    new_memory_root: [u8; 32],
) -> Result<()> {
    require!(
        new_memory_root.iter().any(|byte| *byte != 0),
        MepError::InvalidMemoryRoot
    );

    let agent_passport = &mut ctx.accounts.agent_passport;
    agent_passport.current_memory_root = new_memory_root;
    agent_passport.checkpoint_count = agent_passport
        .checkpoint_count
        .checked_add(1)
        .ok_or(error!(MepError::CheckpointOverflow))?;

    Ok(())
}
