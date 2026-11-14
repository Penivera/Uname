use unam_registry::{
    parse_chain_key_checked, validate_address_checked, validate_name_checked,
    validate_policy_checked, Destination, ReceivePolicy, COIN_TYPE_BIP122, COIN_TYPE_NEAR,
    COIN_TYPE_SOLANA,
};

const EVM_FLAG: u64 = 0x8000_0000;

#[test]
fn name_validation_accepts_and_rejects() {
    assert_eq!(validate_name_checked("peni").unwrap(), "peni");
    assert_eq!(validate_name_checked("Peni.Uni").unwrap(), "peni");
    assert_eq!(validate_name_checked("  peni  ").unwrap(), "peni");
    assert_eq!(validate_name_checked("UPPER").unwrap(), "upper");
    for bad in ["ab", "-peni", "peni-", "pe--ni", "p ni", "admin", ""] {
        assert!(
            validate_name_checked(bad).is_err(),
            "expected rejection of {bad:?}"
        );
    }
}

#[test]
fn chain_key_and_cointype() {
    let (_, _, c) = parse_chain_key_checked("eip155:1").unwrap();
    assert_eq!(c, EVM_FLAG | 1);
    let (_, _, c) =
        parse_chain_key_checked("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d").unwrap();
    assert_eq!(c, COIN_TYPE_SOLANA);
    let (_, _, c) = parse_chain_key_checked("bip122:000000000019d6689c085ae165831e93").unwrap();
    assert_eq!(c, COIN_TYPE_BIP122);
    let (_, _, c) = parse_chain_key_checked("near:testnet").unwrap();
    assert_eq!(c, COIN_TYPE_NEAR);
    for bad in [
        "ethereum:1",
        "eip155:abc",
        "solana:short",
        "bip122:xyz",
        "near:devnet",
    ] {
        assert!(
            parse_chain_key_checked(bad).is_err(),
            "expected rejection of {bad:?}"
        );
    }
}

#[test]
fn address_lengths_per_namespace() {
    assert!(validate_address_checked("eip155", &[0u8; 20]).is_ok());
    assert!(validate_address_checked("eip155", &[0u8; 32]).is_err());
    assert!(validate_address_checked("solana", &[0u8; 32]).is_ok());
    assert!(validate_address_checked("solana", &[0u8; 20]).is_err());
    assert!(validate_address_checked("bip122", &[0u8; 25]).is_ok());
    assert!(validate_address_checked("bip122", &[0u8; 10]).is_err());
    assert!(validate_address_checked("near", b"alice.near").is_ok());
    assert!(validate_address_checked("near", b"a").is_err());
}

#[test]
fn policy_validation() {
    let asset_policy = ReceivePolicy {
        force_default: false,
        default: Some(Destination::Asset {
            asset: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".into(),
            chain: "eip155:1".into(),
            address: vec![0u8; 20],
        }),
        payout: None,
    };
    assert!(validate_policy_checked(&asset_policy).is_ok());
    let payout_policy = ReceivePolicy {
        force_default: true,
        default: None,
        payout: Some(Destination::Payout {
            provider: "bastion".into(),
            reference: "ref-123".into(),
        }),
    };
    assert!(validate_policy_checked(&payout_policy).is_ok());
    let empty = ReceivePolicy {
        force_default: false,
        default: None,
        payout: None,
    };
    assert!(validate_policy_checked(&empty).is_err());
    let payout_as_default = ReceivePolicy {
        force_default: false,
        default: Some(Destination::Payout {
            provider: "bastion".into(),
            reference: "ref".into(),
        }),
        payout: None,
    };
    assert!(validate_policy_checked(&payout_as_default).is_err());
}
