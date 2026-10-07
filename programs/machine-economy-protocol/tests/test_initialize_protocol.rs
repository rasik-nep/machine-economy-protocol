use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::{types::FailedTransactionMetadata, LiteSVM},
    machine_economy_protocol::{constants::PROTOCOL_CONFIG_SEED, error::MepError},
    solana_instruction_error::InstructionError,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_transaction_error::TransactionError,
};

fn svm_with_program(program_id: Pubkey) -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/machine_economy_protocol.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm
}

fn send_register_stock_model(
    svm: &mut LiteSVM,
    payer: &Keypair,
    protocol_config: Pubkey,
    model_record: Pubkey,
    manifest_root: [u8; 32],
    model_hash: [u8; 32],
    version: u32,
) -> Result<(), FailedTransactionMetadata> {
    let program_id = machine_economy_protocol::id();
    let instruction = Instruction::new_with_bytes(
        program_id,
        &machine_economy_protocol::instruction::RegisterStockModel {
            manifest_root,
            model_hash,
            version,
        }
        .data(),
        machine_economy_protocol::accounts::RegisterStockModel {
            authority: payer.pubkey(),
            protocol_config,
            model_record,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let transaction =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer]).unwrap();

    svm.send_transaction(transaction).map(|_| ())
}

fn send_initialize(
    svm: &mut LiteSVM,
    payer: &Keypair,
    protocol_config: Pubkey,
    protocol_version: u16,
    demo_authority: Pubkey,
) -> Result<(), FailedTransactionMetadata> {
    let program_id = machine_economy_protocol::id();
    let instruction = Instruction::new_with_bytes(
        program_id,
        &machine_economy_protocol::instruction::InitializeProtocol {
            protocol_version,
            demo_authority,
        }
        .data(),
        machine_economy_protocol::accounts::InitializeProtocol {
            authority: payer.pubkey(),
            protocol_config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let transaction =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer]).unwrap();

    svm.send_transaction(transaction).map(|_| ())
}

fn send_create_agent(
    svm: &mut LiteSVM,
    owner: &Keypair,
    protocol_config: Pubkey,
    agent_passport: Pubkey,
    stock_agent_root: [u8; 32],
    initial_memory_root: [u8; 32],
    agent_index: u64,
) -> Result<(), FailedTransactionMetadata> {
    let program_id = machine_economy_protocol::id();
    let instruction = Instruction::new_with_bytes(
        program_id,
        &machine_economy_protocol::instruction::CreateAgent {
            stock_agent_root,
            initial_memory_root,
            agent_index,
        }
        .data(),
        machine_economy_protocol::accounts::CreateAgent {
            owner: owner.pubkey(),
            protocol_config,
            agent_passport,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(&[instruction], Some(&owner.pubkey()), &blockhash);
    let transaction =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[owner]).unwrap();

    svm.send_transaction(transaction).map(|_| ())
}

fn send_checkpoint_agent(
    svm: &mut LiteSVM,
    owner: &Keypair,
    agent_passport: Pubkey,
    new_memory_root: [u8; 32],
) -> Result<(), FailedTransactionMetadata> {
    let program_id = machine_economy_protocol::id();
    let instruction = Instruction::new_with_bytes(
        program_id,
        &machine_economy_protocol::instruction::CheckpointAgent { new_memory_root }.data(),
        machine_economy_protocol::accounts::CheckpointAgent {
            owner: owner.pubkey(),
            agent_passport,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(&[instruction], Some(&owner.pubkey()), &blockhash);
    let transaction =
        VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[owner]).unwrap();

    svm.send_transaction(transaction).map(|_| ())
}

#[test]
fn initialize_protocol_stores_authority_and_version() {
    let program_id = machine_economy_protocol::id();
    let payer = Keypair::new();
    let demo_authority = Keypair::new().pubkey();
    let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id).0;
    let mut svm = svm_with_program(program_id);
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let result = send_initialize(&mut svm, &payer, protocol_config, 1, demo_authority);
    assert!(result.is_ok());

    let account = svm.get_account(&protocol_config).unwrap();
    let mut data: &[u8] = &account.data;
    let config =
        machine_economy_protocol::state::ProtocolConfig::try_deserialize(&mut data).unwrap();

    assert_eq!(config.authority, payer.pubkey());
    assert_eq!(config.demo_authority, demo_authority);
    assert_eq!(config.protocol_version, 1);
}

#[test]
fn initialize_protocol_rejects_zero_version() {
    let program_id = machine_economy_protocol::id();
    let payer = Keypair::new();
    let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id).0;
    let mut svm = svm_with_program(program_id);
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    let result = send_initialize(&mut svm, &payer, protocol_config, 0, Pubkey::new_unique());
    let error = result.unwrap_err();

    assert!(matches!(
        error.err,
        TransactionError::InstructionError(
            0,
            InstructionError::Custom(code)
        ) if code == u32::from(MepError::InvalidProtocolVersion)
    ));
    assert!(svm.get_account(&protocol_config).is_none());
}

#[test]
fn register_stock_model_stores_manifest_root_and_model_hash() {
    let program_id = machine_economy_protocol::id();
    let payer = Keypair::new();
    let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id).0;
    let manifest_root = [7; 32];
    let model_hash = [9; 32];
    let model_record = Pubkey::find_program_address(
        &[
            machine_economy_protocol::constants::MODEL_RECORD_SEED,
            manifest_root.as_ref(),
        ],
        &program_id,
    )
    .0;
    let mut svm = svm_with_program(program_id);
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    send_initialize(&mut svm, &payer, protocol_config, 1, Pubkey::new_unique()).unwrap();
    let result = send_register_stock_model(
        &mut svm,
        &payer,
        protocol_config,
        model_record,
        manifest_root,
        model_hash,
        1,
    );

    assert!(result.is_ok());

    let account = svm.get_account(&model_record).unwrap();
    let mut data: &[u8] = &account.data;
    let record = machine_economy_protocol::state::ModelRecord::try_deserialize(&mut data).unwrap();

    assert_eq!(record.authority, payer.pubkey());
    assert_eq!(record.manifest_root, manifest_root);
    assert_eq!(record.model_hash, model_hash);
    assert_eq!(record.version, 1);
}

#[test]
fn register_stock_model_rejects_zero_manifest_root() {
    let program_id = machine_economy_protocol::id();
    let payer = Keypair::new();
    let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id).0;
    let manifest_root = [0; 32];
    let model_record = Pubkey::find_program_address(
        &[
            machine_economy_protocol::constants::MODEL_RECORD_SEED,
            manifest_root.as_ref(),
        ],
        &program_id,
    )
    .0;
    let mut svm = svm_with_program(program_id);
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

    send_initialize(&mut svm, &payer, protocol_config, 1, Pubkey::new_unique()).unwrap();
    let result = send_register_stock_model(
        &mut svm,
        &payer,
        protocol_config,
        model_record,
        manifest_root,
        [9; 32],
        1,
    );
    let error = result.unwrap_err();

    assert!(matches!(
        error.err,
        TransactionError::InstructionError(
            0,
            InstructionError::Custom(code)
        ) if code == u32::from(MepError::InvalidManifestRoot)
    ));
    assert!(svm.get_account(&model_record).is_none());
}

#[test]
fn create_agent_stores_stock_origin_and_initial_memory() {
    let program_id = machine_economy_protocol::id();
    let owner = Keypair::new();
    let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id).0;
    let stock_agent_root = [11; 32];
    let initial_memory_root = [12; 32];
    let agent_index = 0_u64;
    let agent_passport = Pubkey::find_program_address(
        &[
            machine_economy_protocol::constants::AGENT_PASSPORT_SEED,
            owner.pubkey().as_ref(),
            stock_agent_root.as_ref(),
            agent_index.to_le_bytes().as_ref(),
        ],
        &program_id,
    )
    .0;
    let mut svm = svm_with_program(program_id);
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

    send_initialize(&mut svm, &owner, protocol_config, 1, Pubkey::new_unique()).unwrap();
    let result = send_create_agent(
        &mut svm,
        &owner,
        protocol_config,
        agent_passport,
        stock_agent_root,
        initial_memory_root,
        agent_index,
    );

    assert!(result.is_ok());

    let account = svm.get_account(&agent_passport).unwrap();
    let mut data: &[u8] = &account.data;
    let passport =
        machine_economy_protocol::state::AgentPassport::try_deserialize(&mut data).unwrap();

    assert_eq!(passport.owner, owner.pubkey());
    assert_eq!(passport.stock_agent_root, stock_agent_root);
    assert_eq!(passport.current_memory_root, initial_memory_root);
    assert_eq!(passport.checkpoint_count, 0);
    assert_eq!(passport.reputation_score_bps, 5000);
}

#[test]
fn checkpoint_agent_updates_memory_for_owner_only() {
    let program_id = machine_economy_protocol::id();
    let owner = Keypair::new();
    let attacker = Keypair::new();
    let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id).0;
    let stock_agent_root = [13; 32];
    let initial_memory_root = [14; 32];
    let updated_memory_root = [15; 32];
    let agent_index = 0_u64;
    let agent_passport = Pubkey::find_program_address(
        &[
            machine_economy_protocol::constants::AGENT_PASSPORT_SEED,
            owner.pubkey().as_ref(),
            stock_agent_root.as_ref(),
            agent_index.to_le_bytes().as_ref(),
        ],
        &program_id,
    )
    .0;
    let mut svm = svm_with_program(program_id);
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();

    send_initialize(&mut svm, &owner, protocol_config, 1, Pubkey::new_unique()).unwrap();
    send_create_agent(
        &mut svm,
        &owner,
        protocol_config,
        agent_passport,
        stock_agent_root,
        initial_memory_root,
        agent_index,
    )
    .unwrap();

    let unauthorized =
        send_checkpoint_agent(&mut svm, &attacker, agent_passport, updated_memory_root);
    assert!(unauthorized.is_err());

    let authorized = send_checkpoint_agent(&mut svm, &owner, agent_passport, updated_memory_root);
    assert!(authorized.is_ok());

    let account = svm.get_account(&agent_passport).unwrap();
    let mut data: &[u8] = &account.data;
    let passport =
        machine_economy_protocol::state::AgentPassport::try_deserialize(&mut data).unwrap();

    assert_eq!(passport.current_memory_root, updated_memory_root);
    assert_eq!(passport.checkpoint_count, 1);
}

#[test]
fn create_two_agents_from_same_stock_root_with_different_memory_roots() {
    let program_id = machine_economy_protocol::id();
    let owner = Keypair::new();
    let protocol_config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &program_id).0;
    let stock_agent_root = [16; 32];
    let first_memory_root = [17; 32];
    let second_memory_root = [18; 32];
    let first_agent = Pubkey::find_program_address(
        &[
            machine_economy_protocol::constants::AGENT_PASSPORT_SEED,
            owner.pubkey().as_ref(),
            stock_agent_root.as_ref(),
            0_u64.to_le_bytes().as_ref(),
        ],
        &program_id,
    )
    .0;
    let second_agent = Pubkey::find_program_address(
        &[
            machine_economy_protocol::constants::AGENT_PASSPORT_SEED,
            owner.pubkey().as_ref(),
            stock_agent_root.as_ref(),
            1_u64.to_le_bytes().as_ref(),
        ],
        &program_id,
    )
    .0;
    let mut svm = svm_with_program(program_id);
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

    send_initialize(&mut svm, &owner, protocol_config, 1, Pubkey::new_unique()).unwrap();
    send_create_agent(
        &mut svm,
        &owner,
        protocol_config,
        first_agent,
        stock_agent_root,
        first_memory_root,
        0,
    )
    .unwrap();
    send_create_agent(
        &mut svm,
        &owner,
        protocol_config,
        second_agent,
        stock_agent_root,
        second_memory_root,
        1,
    )
    .unwrap();

    let first_account = svm.get_account(&first_agent).unwrap();
    let second_account = svm.get_account(&second_agent).unwrap();
    let mut first_data: &[u8] = &first_account.data;
    let mut second_data: &[u8] = &second_account.data;
    let first_passport =
        machine_economy_protocol::state::AgentPassport::try_deserialize(&mut first_data).unwrap();
    let second_passport =
        machine_economy_protocol::state::AgentPassport::try_deserialize(&mut second_data).unwrap();

    assert_eq!(
        first_passport.stock_agent_root,
        second_passport.stock_agent_root
    );
    assert_ne!(
        first_passport.current_memory_root,
        second_passport.current_memory_root
    );
}
