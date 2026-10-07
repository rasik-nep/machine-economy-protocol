use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::{types::FailedTransactionMetadata, LiteSVM},
    machine_economy_protocol::{
        constants::{
            COMPUTE_OFFER_SEED, MODEL_INSTANCE_SEED, MODEL_RECORD_SEED, PROTOCOL_CONFIG_SEED,
            PROVIDER_RECORD_SEED,
        },
        error::MepError,
        state::{ComputeOffer, ModelInstance, ProviderRecord},
    },
    solana_instruction_error::InstructionError,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_transaction_error::TransactionError,
};

fn svm_with_program() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/machine_economy_protocol.so"
    ));
    svm.add_program(machine_economy_protocol::id(), bytes)
        .unwrap();
    svm
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    instruction: Instruction,
) -> Result<(), FailedTransactionMetadata> {
    let message = Message::new_with_blockhash(
        &[instruction],
        Some(&payer.pubkey()),
        &svm.latest_blockhash(),
    );
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer]).unwrap();
    svm.send_transaction(tx).map(|_| ())
}

fn ix<T: InstructionData, A: ToAccountMetas>(data: T, accounts: A) -> Instruction {
    Instruction::new_with_bytes(
        machine_economy_protocol::id(),
        &data.data(),
        accounts.to_account_metas(None),
    )
}

struct Market {
    svm: LiteSVM,
    provider: Keypair,
    protocol_config: Pubkey,
    provider_record: Pubkey,
    model_record: Pubkey,
    model_instance: Pubkey,
    compute_offer: Pubkey,
}

impl Market {
    fn new() -> Self {
        let mut svm = svm_with_program();
        let owner = Keypair::new();
        let provider = Keypair::new();
        svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
        svm.airdrop(&provider.pubkey(), 1_000_000_000).unwrap();
        let id = machine_economy_protocol::id();
        let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &id).0;
        let provider_record =
            Pubkey::find_program_address(&[PROVIDER_RECORD_SEED, provider.pubkey().as_ref()], &id)
                .0;
        let model_record = Pubkey::find_program_address(&[MODEL_RECORD_SEED, &[7; 32]], &id).0;
        let model_instance = Pubkey::find_program_address(
            &[
                MODEL_INSTANCE_SEED,
                provider_record.as_ref(),
                model_record.as_ref(),
            ],
            &id,
        )
        .0;
        let compute_offer = Pubkey::find_program_address(
            &[
                COMPUTE_OFFER_SEED,
                model_instance.as_ref(),
                &0_u64.to_le_bytes(),
            ],
            &id,
        )
        .0;
        send(
            &mut svm,
            &owner,
            ix(
                machine_economy_protocol::instruction::InitializeProtocol {
                    protocol_version: 1,
                    demo_authority: owner.pubkey(),
                },
                machine_economy_protocol::accounts::InitializeProtocol {
                    authority: owner.pubkey(),
                    protocol_config,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        send(
            &mut svm,
            &owner,
            ix(
                machine_economy_protocol::instruction::RegisterStockModel {
                    manifest_root: [7; 32],
                    model_hash: [8; 32],
                    version: 1,
                },
                machine_economy_protocol::accounts::RegisterStockModel {
                    authority: owner.pubkey(),
                    protocol_config,
                    model_record,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        Self {
            svm,
            provider,
            protocol_config,
            provider_record,
            model_record,
            model_instance,
            compute_offer,
        }
    }

    fn register_provider(
        &mut self,
        signer: &Keypair,
        evidence_root: [u8; 32],
        hardware_trust_bps: u16,
    ) -> Result<(), FailedTransactionMetadata> {
        send(
            &mut self.svm,
            signer,
            ix(
                machine_economy_protocol::instruction::RegisterProvider {
                    evidence_root,
                    hardware_trust_bps,
                    execution_trust_bps: 8_700,
                },
                machine_economy_protocol::accounts::RegisterProvider {
                    authority: signer.pubkey(),
                    protocol_config: self.protocol_config,
                    provider_record: self.provider_record,
                    system_program: system_program::ID,
                },
            ),
        )
    }

    fn register_instance(
        &mut self,
        signer: &Keypair,
        execution_commitment: [u8; 32],
        trust_score_bps: u16,
    ) -> Result<(), FailedTransactionMetadata> {
        send(
            &mut self.svm,
            signer,
            ix(
                machine_economy_protocol::instruction::RegisterModelInstance {
                    execution_commitment,
                    trust_score_bps,
                },
                machine_economy_protocol::accounts::RegisterModelInstance {
                    provider: signer.pubkey(),
                    provider_record: self.provider_record,
                    model_record: self.model_record,
                    model_instance: self.model_instance,
                    system_program: system_program::ID,
                },
            ),
        )
    }

    fn publish_offer(
        &mut self,
        signer: &Keypair,
        price_lamports: u64,
        failure_probability_bps: u16,
    ) -> Result<(), FailedTransactionMetadata> {
        send(
            &mut self.svm,
            signer,
            ix(
                machine_economy_protocol::instruction::PublishComputeOffer {
                    offer_index: 0,
                    price_lamports,
                    expected_latency_ms: 2_000,
                    failure_probability_bps,
                    reservation_class: 1,
                },
                machine_economy_protocol::accounts::PublishComputeOffer {
                    provider: signer.pubkey(),
                    provider_record: self.provider_record,
                    model_instance: self.model_instance,
                    compute_offer: self.compute_offer,
                    system_program: system_program::ID,
                },
            ),
        )
    }
}

fn assert_mep_error(error: FailedTransactionMetadata, expected: MepError) {
    assert!(matches!(
        error.err,
        TransactionError::InstructionError(0, InstructionError::Custom(code))
            if code == u32::from(expected)
    ));
}

#[test]
fn register_provider_stores_evidence_and_trust() {
    let mut market = Market::new();
    let provider = Keypair::new_from_array(market.provider.to_bytes()[..32].try_into().unwrap());
    market.register_provider(&provider, [3; 32], 8_800).unwrap();
    let account = market.svm.get_account(&market.provider_record).unwrap();
    let record = ProviderRecord::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(record.authority, market.provider.pubkey());
    assert_eq!(record.evidence_root, [3; 32]);
    assert_eq!(record.hardware_trust_bps, 8_800);
    assert_eq!(record.execution_trust_bps, 8_700);
    assert_eq!(record.breach_count, 0);
}

#[test]
fn register_provider_rejects_out_of_range_trust() {
    let mut market = Market::new();
    let provider = Keypair::new_from_array(market.provider.to_bytes()[..32].try_into().unwrap());
    let error = market
        .register_provider(&provider, [3; 32], 10_001)
        .unwrap_err();
    assert_mep_error(error, MepError::InvalidBasisPoints);
    assert!(market.svm.get_account(&market.provider_record).is_none());
}

#[test]
fn register_model_instance_links_model_and_provider() {
    let mut market = Market::new();
    let provider = Keypair::new_from_array(market.provider.to_bytes()[..32].try_into().unwrap());
    market.register_provider(&provider, [3; 32], 8_800).unwrap();
    market.register_instance(&provider, [4; 32], 9_100).unwrap();
    let account = market.svm.get_account(&market.model_instance).unwrap();
    let instance = ModelInstance::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(instance.provider, market.provider_record);
    assert_eq!(instance.model_record, market.model_record);
    assert_eq!(instance.execution_commitment, [4; 32]);
    assert_eq!(instance.trust_score_bps, 9_100);
}

#[test]
fn register_model_instance_rejects_other_provider() {
    let mut market = Market::new();
    let provider = Keypair::new_from_array(market.provider.to_bytes()[..32].try_into().unwrap());
    let attacker = Keypair::new();
    market
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    market.register_provider(&provider, [3; 32], 8_800).unwrap();
    assert!(market.register_instance(&attacker, [4; 32], 9_100).is_err());
    assert!(market.svm.get_account(&market.model_instance).is_none());
}

#[test]
fn publish_compute_offer_stores_terms() {
    let mut market = Market::new();
    let provider = Keypair::new_from_array(market.provider.to_bytes()[..32].try_into().unwrap());
    market.register_provider(&provider, [3; 32], 8_800).unwrap();
    market.register_instance(&provider, [4; 32], 9_100).unwrap();
    market.publish_offer(&provider, 8_000_000, 500).unwrap();
    let account = market.svm.get_account(&market.compute_offer).unwrap();
    let offer = ComputeOffer::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(offer.provider, market.provider_record);
    assert_eq!(offer.model_instance, market.model_instance);
    assert_eq!(offer.offer_index, 0);
    assert_eq!(offer.price_lamports, 8_000_000);
    assert_eq!(offer.expected_latency_ms, 2_000);
    assert_eq!(offer.failure_probability_bps, 500);
    assert_eq!(offer.reservation_class, 1);
}

#[test]
fn publish_compute_offer_rejects_zero_price_and_other_provider() {
    let mut market = Market::new();
    let provider = Keypair::new_from_array(market.provider.to_bytes()[..32].try_into().unwrap());
    let attacker = Keypair::new();
    market
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    market.register_provider(&provider, [3; 32], 8_800).unwrap();
    market.register_instance(&provider, [4; 32], 9_100).unwrap();
    let error = market.publish_offer(&provider, 0, 500).unwrap_err();
    assert_mep_error(error, MepError::InvalidOfferTerms);
    assert!(market.publish_offer(&attacker, 8_000_000, 500).is_err());
    assert!(market.svm.get_account(&market.compute_offer).is_none());
}
