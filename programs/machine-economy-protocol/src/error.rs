use anchor_lang::prelude::*;

#[error_code]
pub enum MepError {
    #[msg("Invalid dispute phase, jury, evidence, or vote.")]
    InvalidDispute,
    #[msg("Vote does not match its commitment.")]
    CommitmentMismatch,
    #[msg("Protocol version must be greater than zero.")]
    InvalidProtocolVersion,
    #[msg("Manifest version must be greater than zero.")]
    InvalidManifestVersion,
    #[msg("Manifest roots must be non-zero 32 byte hashes.")]
    InvalidManifestRoot,
    #[msg("Model hashes must be non-zero 32 byte hashes.")]
    InvalidModelHash,
    #[msg("Memory roots must be non-zero 32 byte hashes.")]
    InvalidMemoryRoot,
    #[msg("Agent checkpoint counter overflowed.")]
    CheckpointOverflow,
    #[msg("Provider evidence root must be a non-zero 32 byte hash.")]
    InvalidProviderEvidenceRoot,
    #[msg("Execution commitment must be a non-zero 32 byte hash.")]
    InvalidExecutionCommitment,
    #[msg("Basis point values must be between zero and 10000.")]
    InvalidBasisPoints,
    #[msg("Offer price and expected latency must be greater than zero.")]
    InvalidOfferTerms,
    #[msg("Reservation class must be 0, 1, or 2.")]
    InvalidReservationClass,
    #[msg("Task root must be a non-zero 32 byte hash.")]
    InvalidTaskRoot,
    #[msg("Verification and liability rule roots must be non-zero 32 byte hashes.")]
    InvalidRuleRoot,
    #[msg("Result root must be a non-zero 32 byte hash.")]
    InvalidResultRoot,
    #[msg("Contract deadline must be in the future.")]
    InvalidDeadline,
    #[msg("Contract deadline has passed.")]
    DeadlinePassed,
    #[msg("Invalid contract status for this transition.")]
    InvalidContractState,
    #[msg("Escrow balance or tracked amount is invalid.")]
    EscrowInvariant,
    #[msg("Invalid subcontract relationship or parent status.")]
    InvalidSubcontract,
    #[msg("Subcontract price must be positive and no greater than parent revenue.")]
    InvalidSubcontractPrice,
    #[msg("This instruction is part of the Phase 1 skeleton and is not implemented yet.")]
    InstructionStub,
    #[msg("Only the program upgrade authority can initialize the protocol.")]
    UnauthorizedInitializer,
    #[msg("The customer review window for this submitted result is still open.")]
    ReviewWindowOpen,
    #[msg("The provider record does not match the disputed contract.")]
    ProviderRecordMismatch,
}
