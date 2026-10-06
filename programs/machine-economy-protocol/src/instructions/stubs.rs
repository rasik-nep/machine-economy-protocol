use anchor_lang::prelude::*;

use crate::{error::MepError, state::ProtocolConfig};

#[derive(Accounts)]
pub struct ProtocolStub<'info> {
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_instruction_stub(_ctx: Context<ProtocolStub>) -> Result<()> {
    err!(MepError::InstructionStub)
}
