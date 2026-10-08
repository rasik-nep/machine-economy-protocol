pub const PROTOCOL_CONFIG_SEED: &[u8] = b"protocol-config";
pub const AGENT_PASSPORT_SEED: &[u8] = b"agent-passport";
pub const MODEL_RECORD_SEED: &[u8] = b"model-record";
pub const MODEL_INSTANCE_SEED: &[u8] = b"model-instance";
pub const PROVIDER_RECORD_SEED: &[u8] = b"provider-record";
pub const COMPUTE_OFFER_SEED: &[u8] = b"compute-offer";
pub const WORK_CONTRACT_SEED: &[u8] = b"work-contract";
pub const DISPUTE_SEED: &[u8] = b"dispute";
pub const JUROR_RECORD_SEED: &[u8] = b"juror-record";
pub const PRECEDENT_RECORD_SEED: &[u8] = b"precedent-record";

/// Slots after the deadline in which a customer may verify or dispute a submitted
/// result. After this window anyone may release the escrow to the provider.
pub const REVIEW_WINDOW_SLOTS: u64 = 1_500;
