use anchor_lang::prelude::*;

#[error_code]
pub enum MepError {
    #[msg("Protocol version must be greater than zero.")]
    InvalidProtocolVersion,
    #[msg("Manifest version must be greater than zero.")]
    InvalidManifestVersion,
    #[msg("Manifest roots must be non-zero 32 byte hashes.")]
    InvalidManifestRoot,
    #[msg("Model hashes must be non-zero 32 byte hashes.")]
    InvalidModelHash,
    #[msg("This instruction is part of the Phase 1 skeleton and is not implemented yet.")]
    InstructionStub,
}
