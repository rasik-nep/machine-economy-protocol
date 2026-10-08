use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::bpf_loader_upgradeable::{self, UpgradeableLoaderState},
    },
    litesvm::LiteSVM,
};

pub fn program_data_address() -> Pubkey {
    Pubkey::find_program_address(
        &[machine_economy_protocol::id().as_ref()],
        &bpf_loader_upgradeable::ID,
    )
    .0
}

/// LiteSVM deploys programs without an upgrade authority. Tests that initialize the
/// protocol rewrite the ProgramData header so `authority` acts as the deployer.
pub fn set_upgrade_authority(svm: &mut LiteSVM, authority: Pubkey) {
    let address = program_data_address();
    let mut account = svm.get_account(&address).unwrap();
    let UpgradeableLoaderState::ProgramData { slot, .. } =
        bincode::deserialize(&account.data).unwrap()
    else {
        panic!("program data account is not ProgramData");
    };
    let header = bincode::serialize(&UpgradeableLoaderState::ProgramData {
        slot,
        upgrade_authority_address: Some(authority),
    })
    .unwrap();
    account.data[..header.len()].copy_from_slice(&header);
    svm.set_account(address, account).unwrap();
}
