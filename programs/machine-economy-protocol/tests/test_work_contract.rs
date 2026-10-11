mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::{types::FailedTransactionMetadata, LiteSVM},
    machine_economy_protocol::{
        constants::{
            AGENT_PASSPORT_SEED, COMPUTE_OFFER_SEED, MODEL_INSTANCE_SEED, MODEL_RECORD_SEED,
            PROTOCOL_CONFIG_SEED, PROVIDER_RECORD_SEED, WORK_CONTRACT_SEED,
        },
        error::MepError,
        state::{ContractStatus, ProviderRecord, WorkContract},
    },
    solana_instruction_error::InstructionError,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_transaction_error::TransactionError,
};

fn ix<T: InstructionData, A: ToAccountMetas>(data: T, accounts: A) -> Instruction {
    Instruction::new_with_bytes(
        machine_economy_protocol::id(),
        &data.data(),
        accounts.to_account_metas(None),
    )
}

fn send(
    svm: &mut LiteSVM,
    signer: &Keypair,
    instruction: Instruction,
) -> Result<(), FailedTransactionMetadata> {
    svm.expire_blockhash();
    let message = Message::new_with_blockhash(
        &[instruction],
        Some(&signer.pubkey()),
        &svm.latest_blockhash(),
    );
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[signer]).unwrap();
    svm.send_transaction(tx).map(|_| ())
}

fn assert_mep_error(error: FailedTransactionMetadata, expected: MepError) {
    assert!(matches!(
        error.err,
        TransactionError::InstructionError(0, InstructionError::Custom(code))
            if code == u32::from(expected)
    ));
}

struct Fixture {
    svm: LiteSVM,
    customer: Keypair,
    provider: Keypair,
    agent: Pubkey,
    offer: Pubkey,
    provider_record: Pubkey,
    contract: Pubkey,
}

impl Fixture {
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(
            env!("CARGO_TARGET_TMPDIR"),
            "/../deploy/machine_economy_protocol.so"
        ));
        let id = machine_economy_protocol::id();
        svm.add_program(id, bytes).unwrap();
        let customer = Keypair::new();
        let provider = Keypair::new();
        svm.airdrop(&customer.pubkey(), 1_000_000_000).unwrap();
        svm.airdrop(&provider.pubkey(), 1_000_000_000).unwrap();

        let config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &id).0;
        let agent = Pubkey::find_program_address(
            &[
                AGENT_PASSPORT_SEED,
                customer.pubkey().as_ref(),
                &[11; 32],
                &0_u64.to_le_bytes(),
            ],
            &id,
        )
        .0;
        let model = Pubkey::find_program_address(&[MODEL_RECORD_SEED, &[7; 32]], &id).0;
        let provider_record =
            Pubkey::find_program_address(&[PROVIDER_RECORD_SEED, provider.pubkey().as_ref()], &id)
                .0;
        let instance = Pubkey::find_program_address(
            &[
                MODEL_INSTANCE_SEED,
                provider_record.as_ref(),
                model.as_ref(),
            ],
            &id,
        )
        .0;
        let offer = Pubkey::find_program_address(
            &[COMPUTE_OFFER_SEED, instance.as_ref(), &0_u64.to_le_bytes()],
            &id,
        )
        .0;
        let contract = Pubkey::find_program_address(
            &[WORK_CONTRACT_SEED, agent.as_ref(), &0_u64.to_le_bytes()],
            &id,
        )
        .0;

        common::set_upgrade_authority(&mut svm, customer.pubkey());
        send(
            &mut svm,
            &customer,
            ix(
                machine_economy_protocol::instruction::InitializeProtocol {
                    protocol_version: 1,
                    demo_authority: customer.pubkey(),
                },
                machine_economy_protocol::accounts::InitializeProtocol {
                    authority: customer.pubkey(),
                    program_data: common::program_data_address(),
                    protocol_config: config,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        send(
            &mut svm,
            &customer,
            ix(
                machine_economy_protocol::instruction::CreateAgent {
                    stock_agent_root: [11; 32],
                    initial_memory_root: [12; 32],
                    agent_index: 0,
                },
                machine_economy_protocol::accounts::CreateAgent {
                    owner: customer.pubkey(),
                    protocol_config: config,
                    agent_passport: agent,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        send(
            &mut svm,
            &customer,
            ix(
                machine_economy_protocol::instruction::RegisterStockModel {
                    manifest_root: [7; 32],
                    model_hash: [8; 32],
                    version: 1,
                },
                machine_economy_protocol::accounts::RegisterStockModel {
                    authority: customer.pubkey(),
                    protocol_config: config,
                    model_record: model,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        send(
            &mut svm,
            &provider,
            ix(
                machine_economy_protocol::instruction::RegisterProvider {
                    evidence_root: [3; 32],
                    hardware_trust_bps: 8_800,
                    execution_trust_bps: 8_700,
                },
                machine_economy_protocol::accounts::RegisterProvider {
                    authority: provider.pubkey(),
                    protocol_config: config,
                    provider_record,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        send(
            &mut svm,
            &provider,
            ix(
                machine_economy_protocol::instruction::RegisterModelInstance {
                    execution_commitment: [4; 32],
                    trust_score_bps: 9_100,
                },
                machine_economy_protocol::accounts::RegisterModelInstance {
                    provider: provider.pubkey(),
                    provider_record,
                    model_record: model,
                    model_instance: instance,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        send(
            &mut svm,
            &provider,
            ix(
                machine_economy_protocol::instruction::PublishComputeOffer {
                    offer_index: 0,
                    price_lamports: 8_000_000,
                    expected_latency_ms: 2_000,
                    failure_probability_bps: 500,
                    reservation_class: 1,
                },
                machine_economy_protocol::accounts::PublishComputeOffer {
                    provider: provider.pubkey(),
                    provider_record,
                    model_instance: instance,
                    compute_offer: offer,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();

        Self {
            svm,
            customer,
            provider,
            agent,
            offer,
            provider_record,
            contract,
        }
    }

    fn create(
        &mut self,
        task_root: [u8; 32],
        deadline_slot: u64,
    ) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::CreateContract {
                contract_index: 0,
                task_root,
                verification_rule_root: [21; 32],
                liability_rule_root: [22; 32],
                deadline_slot,
            },
            machine_economy_protocol::accounts::CreateContract {
                customer: self.customer.pubkey(),
                customer_agent: self.agent,
                compute_offer: self.offer,
                provider_record: self.provider_record,
                work_contract: self.contract,
                system_program: system_program::ID,
            },
        );
        send(&mut self.svm, &self.customer, instruction)
    }

    fn fund(&mut self, signer: &Keypair) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::FundContract {},
            machine_economy_protocol::accounts::FundContract {
                customer: signer.pubkey(),
                work_contract: self.contract,
                system_program: system_program::ID,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn start(&mut self, signer: &Keypair) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::StartContract {},
            machine_economy_protocol::accounts::StartContract {
                provider: signer.pubkey(),
                work_contract: self.contract,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn submit(
        &mut self,
        signer: &Keypair,
        root: [u8; 32],
    ) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::SubmitResult { result_root: root },
            machine_economy_protocol::accounts::SubmitResult {
                provider: signer.pubkey(),
                work_contract: self.contract,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn verify(&mut self, signer: &Keypair) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::VerifyContract {},
            machine_economy_protocol::accounts::VerifyContract {
                customer: signer.pubkey(),
                work_contract: self.contract,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn settle(
        &mut self,
        signer: &Keypair,
        recipient: Pubkey,
    ) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::SettleContract {},
            machine_economy_protocol::accounts::SettleContract {
                work_contract: self.contract,
                provider_wallet: recipient,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn release_unverified(
        &mut self,
        signer: &Keypair,
        recipient: Pubkey,
    ) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::ReleaseUnverified {},
            machine_economy_protocol::accounts::ReleaseUnverified {
                work_contract: self.contract,
                provider_wallet: recipient,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn dispute(&self) -> Pubkey {
        Pubkey::find_program_address(
            &[
                machine_economy_protocol::constants::DISPUTE_SEED,
                self.contract.as_ref(),
            ],
            &machine_economy_protocol::id(),
        )
        .0
    }

    fn jurors(&mut self) -> [Keypair; 5] {
        let jurors: [Keypair; 5] = std::array::from_fn(|_| Keypair::new());
        for j in &jurors {
            self.svm.airdrop(&j.pubkey(), 100_000_000).unwrap();
        }
        jurors
    }

    fn open_dispute(
        &mut self,
        claimant: &Keypair,
        jurors: &[Keypair; 5],
        commit_deadline_slot: u64,
        reveal_deadline_slot: u64,
    ) -> Result<(), FailedTransactionMetadata> {
        let id = machine_economy_protocol::id();
        let instruction = ix(
            machine_economy_protocol::instruction::OpenDispute {
                evidence_root: [77; 32],
                jurors: std::array::from_fn(|n| jurors[n].pubkey()),
                commit_deadline_slot,
                reveal_deadline_slot,
            },
            machine_economy_protocol::accounts::OpenDispute {
                claimant: claimant.pubkey(),
                demo_authority: claimant.pubkey(),
                protocol_config: Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &id).0,
                work_contract: self.contract,
                dispute: self.dispute(),
                system_program: system_program::ID,
            },
        );
        send(&mut self.svm, claimant, instruction)
    }

    fn juror_record(&self, juror: Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[
                machine_economy_protocol::constants::JUROR_RECORD_SEED,
                self.dispute().as_ref(),
                juror.as_ref(),
            ],
            &machine_economy_protocol::id(),
        )
        .0
    }

    fn commit_vote(&mut self, juror: &Keypair, vote: u8) -> Result<(), FailedTransactionMetadata> {
        let dispute = self.dispute();
        let instruction = ix(
            machine_economy_protocol::instruction::CommitVote {
                commitment: solana_sha256_hasher::hashv(&[
                    b"mep.vote.v1",
                    dispute.as_ref(),
                    juror.pubkey().as_ref(),
                    &[vote],
                    &[88; 32],
                ])
                .to_bytes(),
            },
            machine_economy_protocol::accounts::CommitVote {
                juror: juror.pubkey(),
                dispute,
                juror_record: self.juror_record(juror.pubkey()),
                system_program: system_program::ID,
            },
        );
        send(&mut self.svm, juror, instruction)
    }

    fn reveal_vote(&mut self, juror: &Keypair, vote: u8) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::RevealVote {
                vote,
                nonce: [88; 32],
            },
            machine_economy_protocol::accounts::RevealVote {
                juror: juror.pubkey(),
                dispute: self.dispute(),
                juror_record: self.juror_record(juror.pubkey()),
            },
        );
        send(&mut self.svm, juror, instruction)
    }

    fn finalize(
        &mut self,
        signer: &Keypair,
        provider_record: Option<Pubkey>,
    ) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::FinalizeDispute {},
            machine_economy_protocol::accounts::FinalizeDispute {
                dispute: self.dispute(),
                work_contract: self.contract,
                customer_wallet: self.customer.pubkey(),
                provider_wallet: self.provider.pubkey(),
                provider_record,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn breach_count(&self) -> u32 {
        let account = self.svm.get_account(&self.provider_record).unwrap();
        ProviderRecord::try_deserialize(&mut account.data.as_slice())
            .unwrap()
            .breach_count
    }

    fn state(&self) -> WorkContract {
        let account = self.svm.get_account(&self.contract).unwrap();
        WorkContract::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    fn register_supplier_agent(&mut self, supplier: &Keypair) -> Pubkey {
        self.svm.airdrop(&supplier.pubkey(), 1_000_000_000).unwrap();
        let id = machine_economy_protocol::id();
        let config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &id).0;
        let agent = Pubkey::find_program_address(
            &[
                AGENT_PASSPORT_SEED,
                supplier.pubkey().as_ref(),
                &[51; 32],
                &0_u64.to_le_bytes(),
            ],
            &id,
        )
        .0;
        send(
            &mut self.svm,
            supplier,
            ix(
                machine_economy_protocol::instruction::CreateAgent {
                    stock_agent_root: [51; 32],
                    initial_memory_root: [52; 32],
                    agent_index: 0,
                },
                machine_economy_protocol::accounts::CreateAgent {
                    owner: supplier.pubkey(),
                    protocol_config: config,
                    agent_passport: agent,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        agent
    }

    fn register_client_agent(&mut self, client: &Keypair) -> Pubkey {
        self.svm.airdrop(&client.pubkey(), 1_000_000_000).unwrap();
        let id = machine_economy_protocol::id();
        let config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &id).0;
        let agent = Pubkey::find_program_address(
            &[
                AGENT_PASSPORT_SEED,
                client.pubkey().as_ref(),
                &[11; 32],
                &0_u64.to_le_bytes(),
            ],
            &id,
        )
        .0;
        send(
            &mut self.svm,
            client,
            ix(
                machine_economy_protocol::instruction::CreateAgent {
                    stock_agent_root: [11; 32],
                    initial_memory_root: [62; 32],
                    agent_index: 0,
                },
                machine_economy_protocol::accounts::CreateAgent {
                    owner: client.pubkey(),
                    protocol_config: config,
                    agent_passport: agent,
                    system_program: system_program::ID,
                },
            ),
        )
        .unwrap();
        agent
    }

    fn agent_contract_address(&self, client_agent: Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[
                WORK_CONTRACT_SEED,
                client_agent.as_ref(),
                &0_u64.to_le_bytes(),
            ],
            &machine_economy_protocol::id(),
        )
        .0
    }

    fn create_agent_parent(
        &mut self,
        client: &Keypair,
        client_agent: Pubkey,
        price_lamports: u64,
    ) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::CreateAgentContract {
                contract_index: 0,
                price_lamports,
                task_root: [70; 32],
                verification_rule_root: [71; 32],
                liability_rule_root: [72; 32],
                deadline_slot: u64::MAX - 1,
            },
            machine_economy_protocol::accounts::CreateAgentContract {
                customer: client.pubkey(),
                customer_agent: client_agent,
                supplier_agent: self.agent,
                work_contract: self.agent_contract_address(client_agent),
                system_program: system_program::ID,
            },
        );
        send(&mut self.svm, client, instruction)
    }

    fn child_address(&self) -> Pubkey {
        Pubkey::find_program_address(
            &[
                WORK_CONTRACT_SEED,
                self.agent.as_ref(),
                &1_u64.to_le_bytes(),
            ],
            &machine_economy_protocol::id(),
        )
        .0
    }

    fn create_subcontract(
        &mut self,
        signer: &Keypair,
        parent_contract: Pubkey,
        supplier_agent: Pubkey,
        price_lamports: u64,
        deadline_slot: u64,
    ) -> Result<(), FailedTransactionMetadata> {
        let instruction = ix(
            machine_economy_protocol::instruction::CreateSubcontract {
                contract_index: 1,
                price_lamports,
                task_root: [41; 32],
                verification_rule_root: [42; 32],
                liability_rule_root: [43; 32],
                deadline_slot,
            },
            machine_economy_protocol::accounts::CreateSubcontract {
                customer: signer.pubkey(),
                customer_agent: self.agent,
                parent_contract,
                supplier_agent,
                child_contract: self.child_address(),
                system_program: system_program::ID,
            },
        );
        send(&mut self.svm, signer, instruction)
    }

    fn state_at(&self, address: Pubkey) -> WorkContract {
        let account = self.svm.get_account(&address).unwrap();
        WorkContract::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    fn fund_at(
        &mut self,
        signer: &Keypair,
        contract: Pubkey,
    ) -> Result<(), FailedTransactionMetadata> {
        send(
            &mut self.svm,
            signer,
            ix(
                machine_economy_protocol::instruction::FundContract {},
                machine_economy_protocol::accounts::FundContract {
                    customer: signer.pubkey(),
                    work_contract: contract,
                    system_program: system_program::ID,
                },
            ),
        )
    }
}

#[test]
fn create_contract_records_terms_and_rejects_invalid_task() {
    let mut fixture = Fixture::new();
    let invalid = fixture.create([0; 32], u64::MAX - 1).unwrap_err();
    assert_mep_error(invalid, MepError::InvalidTaskRoot);
    assert!(fixture.svm.get_account(&fixture.contract).is_none());

    let invalid_deadline = fixture.create([20; 32], 0).unwrap_err();
    assert_mep_error(invalid_deadline, MepError::InvalidDeadline);

    let attacker = Keypair::new();
    fixture
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    let forged_create = ix(
        machine_economy_protocol::instruction::CreateContract {
            contract_index: 0,
            task_root: [20; 32],
            verification_rule_root: [21; 32],
            liability_rule_root: [22; 32],
            deadline_slot: u64::MAX - 1,
        },
        machine_economy_protocol::accounts::CreateContract {
            customer: attacker.pubkey(),
            customer_agent: fixture.agent,
            compute_offer: fixture.offer,
            provider_record: fixture.provider_record,
            work_contract: fixture.contract,
            system_program: system_program::ID,
        },
    );
    assert!(send(&mut fixture.svm, &attacker, forged_create).is_err());

    fixture.create([20; 32], u64::MAX - 1).unwrap();
    let contract = fixture.state();
    assert_eq!(contract.customer_agent, fixture.agent);
    assert_eq!(contract.customer_owner, fixture.customer.pubkey());
    assert_eq!(contract.provider, fixture.provider_record);
    assert_eq!(contract.provider_authority, fixture.provider.pubkey());
    assert_eq!(contract.compute_offer, fixture.offer);
    assert_eq!(contract.task_root, [20; 32]);
    assert_eq!(contract.verification_rule_root, [21; 32]);
    assert_eq!(contract.liability_rule_root, [22; 32]);
    assert_eq!(contract.price_lamports, 8_000_000);
    assert_eq!(contract.escrow_lamports, 0);
    assert!(contract.status == ContractStatus::Draft);
}

#[test]
fn expired_contract_rejects_funding_and_start() {
    let mut fixture = Fixture::new();
    fixture.create([20; 32], 100).unwrap();
    let customer = Keypair::new_from_array(fixture.customer.to_bytes()[..32].try_into().unwrap());
    fixture.svm.warp_to_slot(101);
    let expired = fixture.fund(&customer).unwrap_err();
    assert_mep_error(expired, MepError::DeadlinePassed);
    assert!(fixture.state().status == ContractStatus::Draft);
    assert_eq!(fixture.state().escrow_lamports, 0);

    let mut funded = Fixture::new();
    funded.create([20; 32], 100).unwrap();
    let customer = Keypair::new_from_array(funded.customer.to_bytes()[..32].try_into().unwrap());
    let provider = Keypair::new_from_array(funded.provider.to_bytes()[..32].try_into().unwrap());
    funded.fund(&customer).unwrap();
    funded.svm.warp_to_slot(101);
    let expired = funded.start(&provider).unwrap_err();
    assert_mep_error(expired, MepError::DeadlinePassed);
    assert!(funded.state().status == ContractStatus::Funded);
}

#[test]
fn fund_contract_transfers_exact_price_and_rejects_wrong_owner_and_repeat() {
    let mut fixture = Fixture::new();
    fixture.create([20; 32], u64::MAX - 1).unwrap();
    let attacker = Keypair::new();
    fixture
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    assert!(fixture.fund(&attacker).is_err());

    let before = fixture.svm.get_account(&fixture.contract).unwrap().lamports;
    let customer = Keypair::new_from_array(fixture.customer.to_bytes()[..32].try_into().unwrap());
    fixture.fund(&customer).unwrap();
    let after = fixture.svm.get_account(&fixture.contract).unwrap().lamports;
    assert_eq!(after - before, 8_000_000);
    assert_eq!(fixture.state().escrow_lamports, 8_000_000);
    assert!(fixture.state().status == ContractStatus::Funded);
    let repeat = fixture.fund(&customer).unwrap_err();
    assert_mep_error(repeat, MepError::InvalidContractState);
}

#[test]
fn start_and_submit_require_provider_and_correct_state() {
    let mut fixture = Fixture::new();
    fixture.create([20; 32], u64::MAX - 1).unwrap();
    let provider = Keypair::new_from_array(fixture.provider.to_bytes()[..32].try_into().unwrap());
    let customer = Keypair::new_from_array(fixture.customer.to_bytes()[..32].try_into().unwrap());
    let premature = fixture.start(&provider).unwrap_err();
    assert_mep_error(premature, MepError::InvalidContractState);
    fixture.fund(&customer).unwrap();
    assert!(fixture.start(&customer).is_err());
    fixture.start(&provider).unwrap();
    assert!(fixture.state().status == ContractStatus::Running);
    let repeated = fixture.start(&provider).unwrap_err();
    assert_mep_error(repeated, MepError::InvalidContractState);
    assert!(fixture.submit(&customer, [30; 32]).is_err());
    let invalid = fixture.submit(&provider, [0; 32]).unwrap_err();
    assert_mep_error(invalid, MepError::InvalidResultRoot);
    fixture.submit(&provider, [30; 32]).unwrap();
    assert_eq!(fixture.state().result_root, [30; 32]);
    assert!(fixture.state().status == ContractStatus::Submitted);
    let repeated = fixture.submit(&provider, [31; 32]).unwrap_err();
    assert_mep_error(repeated, MepError::InvalidContractState);
}

#[test]
fn verify_requires_customer_and_settle_pays_only_the_fixed_provider() {
    let mut fixture = Fixture::new();
    fixture.create([20; 32], u64::MAX - 1).unwrap();
    let provider = Keypair::new_from_array(fixture.provider.to_bytes()[..32].try_into().unwrap());
    let customer = Keypair::new_from_array(fixture.customer.to_bytes()[..32].try_into().unwrap());
    fixture.fund(&customer).unwrap();
    let premature = fixture.verify(&customer).unwrap_err();
    assert_mep_error(premature, MepError::InvalidContractState);
    fixture.start(&provider).unwrap();
    fixture.submit(&provider, [30; 32]).unwrap();
    assert!(fixture.verify(&provider).is_err());
    let premature = fixture.settle(&customer, provider.pubkey()).unwrap_err();
    assert_mep_error(premature, MepError::InvalidContractState);
    fixture.verify(&customer).unwrap();
    assert!(fixture.state().status == ContractStatus::Verified);
    let repeated = fixture.verify(&customer).unwrap_err();
    assert_mep_error(repeated, MepError::InvalidContractState);

    let attacker = Keypair::new();
    fixture
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    // Settlement is permissionless after verification, but the payout address is fixed.
    assert!(fixture.settle(&attacker, attacker.pubkey()).is_err());
    assert!(fixture.settle(&customer, attacker.pubkey()).is_err());
    let provider_before = fixture
        .svm
        .get_account(&provider.pubkey())
        .unwrap()
        .lamports;
    let contract_before = fixture.svm.get_account(&fixture.contract).unwrap().lamports;
    fixture.settle(&attacker, provider.pubkey()).unwrap();
    let provider_after = fixture
        .svm
        .get_account(&provider.pubkey())
        .unwrap()
        .lamports;
    let contract_after = fixture.svm.get_account(&fixture.contract).unwrap().lamports;
    assert_eq!(provider_after - provider_before, 8_000_000);
    assert_eq!(contract_before - contract_after, 8_000_000);
    assert_eq!(fixture.state().escrow_lamports, 0);
    assert!(fixture.state().status == ContractStatus::Settled);
    let repeated = fixture.settle(&customer, provider.pubkey()).unwrap_err();
    assert_mep_error(repeated, MepError::InvalidContractState);
}

#[test]
fn create_subcontract_links_parent_and_supplier_agent_with_valid_terms() {
    let mut fixture = Fixture::new();
    let client = Keypair::new();
    let client_agent = fixture.register_client_agent(&client);
    let parent_address = fixture.agent_contract_address(client_agent);
    let invalid_parent = fixture
        .create_agent_parent(&client, client_agent, 0)
        .unwrap_err();
    assert_mep_error(invalid_parent, MepError::InvalidSubcontractPrice);
    let unauthorized = Keypair::new();
    fixture
        .svm
        .airdrop(&unauthorized.pubkey(), 1_000_000_000)
        .unwrap();
    assert!(fixture
        .create_agent_parent(&unauthorized, client_agent, 15_000_000)
        .is_err());
    let agent_a_owner =
        Keypair::new_from_array(fixture.customer.to_bytes()[..32].try_into().unwrap());
    let self_hire_parent = fixture
        .create_agent_parent(&agent_a_owner, fixture.agent, 15_000_000)
        .unwrap_err();
    assert_mep_error(self_hire_parent, MepError::InvalidSubcontract);
    fixture
        .create_agent_parent(&client, client_agent, 15_000_000)
        .unwrap();
    let parent = fixture.state_at(parent_address);
    assert_eq!(parent.customer_agent, client_agent);
    assert_eq!(parent.supplier_agent, fixture.agent);
    assert_eq!(parent.provider_authority, fixture.customer.pubkey());
    assert_eq!(parent.price_lamports, 15_000_000);

    let supplier = Keypair::new();
    let supplier_agent = fixture.register_supplier_agent(&supplier);
    let customer = Keypair::new_from_array(fixture.customer.to_bytes()[..32].try_into().unwrap());
    let child = fixture.child_address();

    let unfunded = fixture
        .create_subcontract(
            &customer,
            parent_address,
            supplier_agent,
            3_000_000,
            u64::MAX - 2,
        )
        .unwrap_err();
    assert_mep_error(unfunded, MepError::InvalidSubcontract);
    fixture.fund_at(&client, parent_address).unwrap();

    let overpriced = fixture
        .create_subcontract(
            &customer,
            parent_address,
            supplier_agent,
            16_000_000,
            u64::MAX - 2,
        )
        .unwrap_err();
    assert_mep_error(overpriced, MepError::InvalidSubcontractPrice);
    let late = fixture
        .create_subcontract(
            &customer,
            parent_address,
            supplier_agent,
            3_000_000,
            u64::MAX - 1,
        )
        .unwrap_err();
    assert_mep_error(late, MepError::InvalidDeadline);
    assert!(fixture
        .create_subcontract(
            &supplier,
            parent_address,
            supplier_agent,
            3_000_000,
            u64::MAX - 2
        )
        .is_err());
    let self_hire = fixture
        .create_subcontract(
            &customer,
            parent_address,
            fixture.agent,
            3_000_000,
            u64::MAX - 2,
        )
        .unwrap_err();
    assert_mep_error(self_hire, MepError::InvalidSubcontract);

    fixture
        .create_subcontract(
            &customer,
            parent_address,
            supplier_agent,
            3_000_000,
            u64::MAX - 2,
        )
        .unwrap();
    let parent = fixture.state_at(parent_address);
    let subcontract = fixture.state_at(child);
    assert_eq!(parent.child_contract, child);
    assert_eq!(subcontract.parent_contract, parent_address);
    assert_eq!(subcontract.customer_agent, fixture.agent);
    assert_eq!(subcontract.supplier_agent, supplier_agent);
    assert_eq!(subcontract.provider, Pubkey::default());
    assert_eq!(subcontract.provider_authority, supplier.pubkey());
    assert_eq!(subcontract.compute_offer, Pubkey::default());
    assert_eq!(subcontract.price_lamports, 3_000_000);
    assert!(subcontract.status == ContractStatus::Draft);
    assert!(fixture
        .create_subcontract(
            &customer,
            parent_address,
            supplier_agent,
            3_000_000,
            u64::MAX - 2
        )
        .is_err());
}

#[test]
fn child_escrow_settles_to_supplier_agent_owner() {
    let mut fixture = Fixture::new();
    let client = Keypair::new();
    let client_agent = fixture.register_client_agent(&client);
    let parent = fixture.agent_contract_address(client_agent);
    fixture
        .create_agent_parent(&client, client_agent, 15_000_000)
        .unwrap();
    fixture.fund_at(&client, parent).unwrap();
    let customer = Keypair::new_from_array(fixture.customer.to_bytes()[..32].try_into().unwrap());
    let supplier = Keypair::new();
    let supplier_agent = fixture.register_supplier_agent(&supplier);
    let child = fixture.child_address();
    fixture
        .create_subcontract(&customer, parent, supplier_agent, 3_000_000, u64::MAX - 2)
        .unwrap();

    fixture.fund_at(&customer, child).unwrap();
    send(
        &mut fixture.svm,
        &supplier,
        ix(
            machine_economy_protocol::instruction::StartContract {},
            machine_economy_protocol::accounts::StartContract {
                provider: supplier.pubkey(),
                work_contract: child,
            },
        ),
    )
    .unwrap();
    send(
        &mut fixture.svm,
        &supplier,
        ix(
            machine_economy_protocol::instruction::SubmitResult {
                result_root: [44; 32],
            },
            machine_economy_protocol::accounts::SubmitResult {
                provider: supplier.pubkey(),
                work_contract: child,
            },
        ),
    )
    .unwrap();
    send(
        &mut fixture.svm,
        &customer,
        ix(
            machine_economy_protocol::instruction::VerifyContract {},
            machine_economy_protocol::accounts::VerifyContract {
                customer: customer.pubkey(),
                work_contract: child,
            },
        ),
    )
    .unwrap();
    let before = fixture
        .svm
        .get_account(&supplier.pubkey())
        .unwrap()
        .lamports;
    send(
        &mut fixture.svm,
        &customer,
        ix(
            machine_economy_protocol::instruction::SettleContract {},
            machine_economy_protocol::accounts::SettleContract {
                work_contract: child,
                provider_wallet: supplier.pubkey(),
            },
        ),
    )
    .unwrap();
    let after = fixture
        .svm
        .get_account(&supplier.pubkey())
        .unwrap()
        .lamports;
    assert_eq!(after - before, 3_000_000);
    assert_eq!(fixture.state_at(child).escrow_lamports, 0);
    assert!(fixture.state_at(child).status == ContractStatus::Settled);
    assert_eq!(fixture.state_at(parent).escrow_lamports, 15_000_000);

    send(
        &mut fixture.svm,
        &customer,
        ix(
            machine_economy_protocol::instruction::StartContract {},
            machine_economy_protocol::accounts::StartContract {
                provider: customer.pubkey(),
                work_contract: parent,
            },
        ),
    )
    .unwrap();
    send(
        &mut fixture.svm,
        &customer,
        ix(
            machine_economy_protocol::instruction::SubmitResult {
                result_root: [73; 32],
            },
            machine_economy_protocol::accounts::SubmitResult {
                provider: customer.pubkey(),
                work_contract: parent,
            },
        ),
    )
    .unwrap();
    send(
        &mut fixture.svm,
        &client,
        ix(
            machine_economy_protocol::instruction::VerifyContract {},
            machine_economy_protocol::accounts::VerifyContract {
                customer: client.pubkey(),
                work_contract: parent,
            },
        ),
    )
    .unwrap();
    let agent_a_before = fixture
        .svm
        .get_account(&customer.pubkey())
        .unwrap()
        .lamports;
    send(
        &mut fixture.svm,
        &client,
        ix(
            machine_economy_protocol::instruction::SettleContract {},
            machine_economy_protocol::accounts::SettleContract {
                work_contract: parent,
                provider_wallet: customer.pubkey(),
            },
        ),
    )
    .unwrap();
    let agent_a_after = fixture
        .svm
        .get_account(&customer.pubkey())
        .unwrap()
        .lamports;
    assert_eq!(agent_a_after - agent_a_before, 15_000_000);
    assert!(fixture.state_at(parent).status == ContractStatus::Settled);
}

#[test]
fn dispute_commit_reveal_refund_and_precedent_are_guarded() {
    use machine_economy_protocol::{
        accounts as a,
        constants::{DISPUTE_SEED, JUROR_RECORD_SEED, PRECEDENT_RECORD_SEED},
        instruction as i,
        state::{Dispute, DisputeStatus, PrecedentRecord},
    };
    use solana_sha256_hasher::hashv;
    for breach in [true, false] {
        let mut f = Fixture::new();
        let customer = Keypair::new_from_array(f.customer.to_bytes()[..32].try_into().unwrap());
        let provider = Keypair::new_from_array(f.provider.to_bytes()[..32].try_into().unwrap());
        f.create([20; 32], 100).unwrap();
        f.fund(&customer).unwrap();
        f.start(&provider).unwrap();
        let id = machine_economy_protocol::id();
        let config = Pubkey::find_program_address(&[PROTOCOL_CONFIG_SEED], &id).0;
        let dispute = Pubkey::find_program_address(&[DISPUTE_SEED, f.contract.as_ref()], &id).0;
        let precedent =
            Pubkey::find_program_address(&[PRECEDENT_RECORD_SEED, dispute.as_ref()], &id).0;
        let jurors: [Keypair; 5] = std::array::from_fn(|_| Keypair::new());
        for j in &jurors {
            f.svm.airdrop(&j.pubkey(), 100_000_000).unwrap();
        }
        let keys = std::array::from_fn(|n| jurors[n].pubkey());
        let open = |jury| {
            ix(
                i::OpenDispute {
                    evidence_root: [77; 32],
                    jurors: jury,
                    commit_deadline_slot: 200,
                    reveal_deadline_slot: 300,
                },
                a::OpenDispute {
                    claimant: customer.pubkey(),
                    demo_authority: customer.pubkey(),
                    protocol_config: config,
                    work_contract: f.contract,
                    dispute,
                    system_program: system_program::ID,
                },
            )
        };
        assert!(send(&mut f.svm, &customer, open(keys)).is_err());
        f.svm.warp_to_slot(101);
        assert!(send(&mut f.svm, &customer, open([keys[0]; 5])).is_err());
        send(&mut f.svm, &customer, open(keys)).unwrap();
        assert!(send(&mut f.svm, &customer, open(keys)).is_err());
        assert!(f.settle(&customer, provider.pubkey()).is_err());
        assert!(f.submit(&provider, [33; 32]).is_err());
        let publish = ix(
            i::PublishPrecedent {},
            a::PublishPrecedent {
                payer: customer.pubkey(),
                dispute,
                work_contract: f.contract,
                precedent,
                system_program: system_program::ID,
            },
        );
        assert!(send(&mut f.svm, &customer, publish.clone()).is_err());
        let record = |key: Pubkey| {
            Pubkey::find_program_address(&[JUROR_RECORD_SEED, dispute.as_ref(), key.as_ref()], &id)
                .0
        };
        let vote = if breach { 1 } else { 2 };
        let commit = |j: &Keypair| {
            ix(
                i::CommitVote {
                    commitment: hashv(&[
                        b"mep.vote.v1",
                        dispute.as_ref(),
                        j.pubkey().as_ref(),
                        &[vote],
                        &[88; 32],
                    ])
                    .to_bytes(),
                },
                a::CommitVote {
                    juror: j.pubkey(),
                    dispute,
                    juror_record: record(j.pubkey()),
                    system_program: system_program::ID,
                },
            )
        };
        assert!(send(&mut f.svm, &provider, commit(&provider)).is_err());
        for j in &jurors {
            send(&mut f.svm, j, commit(j)).unwrap();
        }
        assert!(send(&mut f.svm, &jurors[0], commit(&jurors[0])).is_err());
        let reveal = |j: &Keypair, nonce| {
            ix(
                i::RevealVote { vote, nonce },
                a::RevealVote {
                    juror: j.pubkey(),
                    dispute,
                    juror_record: record(j.pubkey()),
                },
            )
        };
        assert!(send(&mut f.svm, &jurors[0], reveal(&jurors[0], [88; 32])).is_err());
        f.svm.warp_to_slot(201);
        assert_mep_error(
            send(&mut f.svm, &jurors[0], reveal(&jurors[0], [89; 32])).unwrap_err(),
            MepError::CommitmentMismatch,
        );
        let finalize = ix(
            i::FinalizeDispute {},
            a::FinalizeDispute {
                dispute,
                work_contract: f.contract,
                customer_wallet: customer.pubkey(),
                provider_wallet: provider.pubkey(),
                provider_record: Some(f.provider_record),
            },
        );
        assert!(send(&mut f.svm, &jurors[0], finalize.clone()).is_err());
        for j in &jurors {
            send(&mut f.svm, j, reveal(j, [88; 32])).unwrap();
        }
        assert!(send(&mut f.svm, &jurors[0], reveal(&jurors[0], [88; 32])).is_err());
        f.svm.warp_to_slot(301);
        let recipient = if breach {
            customer.pubkey()
        } else {
            provider.pubkey()
        };
        let before = f.svm.get_account(&recipient).unwrap().lamports;
        send(&mut f.svm, &jurors[0], finalize.clone()).unwrap();
        assert_eq!(
            f.svm.get_account(&recipient).unwrap().lamports - before,
            8_000_000
        );
        assert_eq!(f.state().escrow_lamports, 0);
        assert!(send(&mut f.svm, &jurors[0], finalize).is_err());
        let account = f.svm.get_account(&dispute).unwrap();
        let d = Dispute::try_deserialize(&mut account.data.as_slice()).unwrap();
        assert!(d.status == DisputeStatus::Finalized);
        assert_eq!(d.provider_breached, breach);
        assert!(!d.no_majority);
        assert_eq!(f.breach_count(), u32::from(breach));
        assert!(
            f.state().status
                == if breach {
                    ContractStatus::Breached
                } else {
                    ContractStatus::Settled
                }
        );
        send(&mut f.svm, &customer, publish.clone()).unwrap();
        assert!(send(&mut f.svm, &customer, publish).is_err());
        let account = f.svm.get_account(&precedent).unwrap();
        let p = PrecedentRecord::try_deserialize(&mut account.data.as_slice()).unwrap();
        assert_eq!(
            p.ruling_root,
            hashv(&[
                b"mep.precedent.v1",
                dispute.as_ref(),
                &[77; 32],
                &[breach as u8, if breach { 5 } else { 0 }, 5, 0]
            ])
            .to_bytes()
        );
    }
}

#[test]
fn hung_jury_refunds_customer_without_recording_a_breach() {
    use machine_economy_protocol::state::{Dispute, DisputeStatus};
    let mut f = Fixture::new();
    let customer = Keypair::new_from_array(f.customer.to_bytes()[..32].try_into().unwrap());
    let provider = Keypair::new_from_array(f.provider.to_bytes()[..32].try_into().unwrap());
    f.create([20; 32], 100).unwrap();
    f.fund(&customer).unwrap();
    f.start(&provider).unwrap();
    let jurors = f.jurors();
    f.svm.warp_to_slot(101);
    f.open_dispute(&customer, &jurors, 200, 300).unwrap();
    // Two breach votes and one cleared vote: no side reaches three of five.
    for (j, vote) in jurors.iter().zip([1, 1, 2]) {
        f.commit_vote(j, vote).unwrap();
    }
    f.svm.warp_to_slot(201);
    for (j, vote) in jurors.iter().zip([1, 1, 2]) {
        f.reveal_vote(j, vote).unwrap();
    }
    let early = f.finalize(&customer, Some(f.provider_record)).unwrap_err();
    assert_mep_error(early, MepError::InvalidDispute);
    f.svm.warp_to_slot(301);

    // Compute contracts must name their provider record so reputation cannot be skipped.
    let missing_record = f.finalize(&customer, None).unwrap_err();
    assert_mep_error(missing_record, MepError::ProviderRecordMismatch);

    let before = f.svm.get_account(&customer.pubkey()).unwrap().lamports;
    let cranker = Keypair::new();
    f.svm.airdrop(&cranker.pubkey(), 100_000_000).unwrap();
    f.finalize(&cranker, Some(f.provider_record)).unwrap();
    assert_eq!(
        f.svm.get_account(&customer.pubkey()).unwrap().lamports - before,
        8_000_000
    );
    assert_eq!(f.state().escrow_lamports, 0);
    assert!(f.state().status == ContractStatus::Refunded);
    assert_eq!(f.breach_count(), 0);
    let d = Dispute::try_deserialize(&mut f.svm.get_account(&f.dispute()).unwrap().data.as_slice())
        .unwrap();
    assert!(d.status == DisputeStatus::Finalized);
    assert!(d.no_majority);
    assert!(!d.provider_breached);
    let repeated = f.finalize(&customer, Some(f.provider_record)).unwrap_err();
    assert_mep_error(repeated, MepError::InvalidDispute);
}

#[test]
fn unverified_result_releases_to_provider_after_review_window() {
    use machine_economy_protocol::constants::REVIEW_WINDOW_SLOTS;
    let mut f = Fixture::new();
    let customer = Keypair::new_from_array(f.customer.to_bytes()[..32].try_into().unwrap());
    let provider = Keypair::new_from_array(f.provider.to_bytes()[..32].try_into().unwrap());
    f.create([20; 32], 100).unwrap();
    f.fund(&customer).unwrap();
    f.start(&provider).unwrap();
    let running = f
        .release_unverified(&provider, provider.pubkey())
        .unwrap_err();
    assert_mep_error(running, MepError::InvalidContractState);
    f.submit(&provider, [30; 32]).unwrap();

    let review_end = 100 + REVIEW_WINDOW_SLOTS;
    f.svm.warp_to_slot(review_end);
    let open = f
        .release_unverified(&provider, provider.pubkey())
        .unwrap_err();
    assert_mep_error(open, MepError::ReviewWindowOpen);

    f.svm.warp_to_slot(review_end + 1);
    assert!(f.release_unverified(&customer, customer.pubkey()).is_err());
    let before = f.svm.get_account(&provider.pubkey()).unwrap().lamports;
    f.release_unverified(&customer, provider.pubkey()).unwrap();
    assert_eq!(
        f.svm.get_account(&provider.pubkey()).unwrap().lamports - before,
        8_000_000
    );
    assert_eq!(f.state().escrow_lamports, 0);
    assert!(f.state().status == ContractStatus::Settled);
    let repeated = f
        .release_unverified(&provider, provider.pubkey())
        .unwrap_err();
    assert_mep_error(repeated, MepError::InvalidContractState);
}

#[test]
fn submitted_result_is_disputable_only_inside_review_window() {
    use machine_economy_protocol::constants::REVIEW_WINDOW_SLOTS;
    let review_end = 100 + REVIEW_WINDOW_SLOTS;

    let mut late = Fixture::new();
    let customer = Keypair::new_from_array(late.customer.to_bytes()[..32].try_into().unwrap());
    let provider = Keypair::new_from_array(late.provider.to_bytes()[..32].try_into().unwrap());
    late.create([20; 32], 100).unwrap();
    late.fund(&customer).unwrap();
    late.start(&provider).unwrap();
    late.submit(&provider, [30; 32]).unwrap();
    let jurors = late.jurors();
    late.svm.warp_to_slot(review_end + 1);
    let expired = late
        .open_dispute(&customer, &jurors, review_end + 50, review_end + 100)
        .unwrap_err();
    assert_mep_error(expired, MepError::InvalidDeadline);
    assert!(late.state().status == ContractStatus::Submitted);

    let mut f = Fixture::new();
    let customer = Keypair::new_from_array(f.customer.to_bytes()[..32].try_into().unwrap());
    let provider = Keypair::new_from_array(f.provider.to_bytes()[..32].try_into().unwrap());
    f.create([20; 32], 100).unwrap();
    f.fund(&customer).unwrap();
    f.start(&provider).unwrap();
    f.submit(&provider, [30; 32]).unwrap();
    let jurors = f.jurors();
    f.svm.warp_to_slot(review_end);
    f.open_dispute(&customer, &jurors, review_end + 50, review_end + 100)
        .unwrap();
    assert!(f.state().status == ContractStatus::Disputed);
    // A disputed result can no longer be released by timeout.
    f.svm.warp_to_slot(review_end + 1);
    let blocked = f
        .release_unverified(&provider, provider.pubkey())
        .unwrap_err();
    assert_mep_error(blocked, MepError::InvalidContractState);
    for j in &jurors {
        f.commit_vote(j, 1).unwrap();
    }
    f.svm.warp_to_slot(review_end + 51);
    for j in &jurors {
        f.reveal_vote(j, 1).unwrap();
    }
    f.svm.warp_to_slot(review_end + 101);
    let before = f.svm.get_account(&customer.pubkey()).unwrap().lamports;
    f.finalize(&provider, Some(f.provider_record)).unwrap();
    assert_eq!(
        f.svm.get_account(&customer.pubkey()).unwrap().lamports - before,
        8_000_000
    );
    assert!(f.state().status == ContractStatus::Breached);
    assert_eq!(f.breach_count(), 1);
}

#[test]
fn four_to_one_split_on_submitted_result_breaches_and_publishes_tally() {
    use machine_economy_protocol::{
        accounts as a, constants::PRECEDENT_RECORD_SEED, instruction as i, state::PrecedentRecord,
    };
    // The demo's quality breach: the provider delivers on time, the customer's
    // spot-check fails, and one of five jurors dissents.
    let mut f = Fixture::new();
    let customer = Keypair::new_from_array(f.customer.to_bytes()[..32].try_into().unwrap());
    let provider = Keypair::new_from_array(f.provider.to_bytes()[..32].try_into().unwrap());
    f.create([20; 32], 100).unwrap();
    f.fund(&customer).unwrap();
    f.start(&provider).unwrap();
    f.submit(&provider, [30; 32]).unwrap();
    let jurors = f.jurors();
    // Disputing before the deadline is rejected even with a submitted result.
    let early = f.open_dispute(&customer, &jurors, 200, 300).unwrap_err();
    assert_mep_error(early, MepError::InvalidDeadline);
    f.svm.warp_to_slot(101);
    f.open_dispute(&customer, &jurors, 200, 300).unwrap();
    let votes = [1, 1, 1, 1, 2];
    for (j, vote) in jurors.iter().zip(votes) {
        f.commit_vote(j, vote).unwrap();
    }
    f.svm.warp_to_slot(201);
    for (j, vote) in jurors.iter().zip(votes) {
        f.reveal_vote(j, vote).unwrap();
    }
    f.svm.warp_to_slot(301);
    let before = f.svm.get_account(&customer.pubkey()).unwrap().lamports;
    f.finalize(&provider, Some(f.provider_record)).unwrap();
    assert_eq!(
        f.svm.get_account(&customer.pubkey()).unwrap().lamports - before,
        8_000_000
    );
    assert!(f.state().status == ContractStatus::Breached);
    assert_eq!(f.state().result_root, [30; 32]);
    assert_eq!(f.breach_count(), 1);

    let id = machine_economy_protocol::id();
    let dispute = f.dispute();
    let precedent = Pubkey::find_program_address(&[PRECEDENT_RECORD_SEED, dispute.as_ref()], &id).0;
    let publish = ix(
        i::PublishPrecedent {},
        a::PublishPrecedent {
            payer: customer.pubkey(),
            dispute,
            work_contract: f.contract,
            precedent,
            system_program: system_program::ID,
        },
    );
    send(&mut f.svm, &customer, publish).unwrap();
    let account = f.svm.get_account(&precedent).unwrap();
    let p = PrecedentRecord::try_deserialize(&mut account.data.as_slice()).unwrap();
    assert_eq!(
        p.ruling_root,
        solana_sha256_hasher::hashv(&[
            b"mep.precedent.v1",
            dispute.as_ref(),
            &[77; 32],
            &[1, 4, 5, 0]
        ])
        .to_bytes()
    );
}
