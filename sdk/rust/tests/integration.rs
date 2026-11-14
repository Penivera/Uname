use uname_resolver::{normalize_name, resolve_chain_id, UnameResolver, UnamResolver};

#[test]
fn test_name_normalization_valid() {
    assert_eq!(normalize_name("alice").unwrap(), "alice.uni");
    assert_eq!(normalize_name("alice.uni").unwrap(), "alice.uni");
    assert_eq!(normalize_name("ALICE.UNI").unwrap(), "alice.uni");
    assert_eq!(normalize_name("  bob-123.uni  ").unwrap(), "bob-123.uni");
    assert_eq!(normalize_name("crypto-whale").unwrap(), "crypto-whale.uni");
}

#[test]
fn test_name_normalization_invalid() {
    // Too short (< 3 chars)
    assert!(normalize_name("ab").is_err());
    // Too long (> 32 chars)
    assert!(normalize_name(&"a".repeat(33)).is_err());
    // Invalid characters
    assert!(normalize_name("alice!").is_err());
    assert!(normalize_name("alice_bob").is_err());
    assert!(normalize_name("alice.eth").is_err());
    // Hyphen placements
    assert!(normalize_name("-alice").is_err());
    assert!(normalize_name("alice-").is_err());
    assert!(normalize_name("alice--bob").is_err());
    // Reserved names
    assert!(normalize_name("admin").is_err());
    assert!(normalize_name("root.uni").is_err());
    assert!(normalize_name("near").is_err());
    assert!(normalize_name("uni").is_err());
}

#[test]
fn test_chain_id_resolution() {
    assert_eq!(resolve_chain_id("ethereum"), "eip155:1");
    assert_eq!(resolve_chain_id("eth"), "eip155:1");
    assert_eq!(resolve_chain_id("base"), "eip155:8453");
    assert_eq!(resolve_chain_id("arbitrum"), "eip155:42161");
    assert_eq!(resolve_chain_id("optimism"), "eip155:10");
    assert_eq!(resolve_chain_id("polygon"), "eip155:137");
    assert_eq!(resolve_chain_id("bsc"), "eip155:56");
    assert_eq!(resolve_chain_id("avalanche"), "eip155:43114");
    assert_eq!(
        resolve_chain_id("solana"),
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
    );
    assert_eq!(resolve_chain_id("near"), "near:mainnet");
    assert_eq!(
        resolve_chain_id("bitcoin"),
        "bip122:000000000019d6689c085ae165831e93"
    );
    // Custom CAIP-2 passes through
    assert_eq!(resolve_chain_id("eip155:11155111"), "eip155:11155111");
}

#[test]
fn test_pricing_tiers() {
    let resolver = UnameResolver::default();

    // 3 characters ($50)
    let p3 = resolver.get_pricing("abc").unwrap();
    assert_eq!(p3.price_usd, 50.0);
    assert_eq!(p3.price_atomic, "50000000");
    assert_eq!(p3.tier, "3_char");

    // 4 characters ($20)
    let p4 = resolver.get_pricing("abcd").unwrap();
    assert_eq!(p4.price_usd, 20.0);
    assert_eq!(p4.price_atomic, "20000000");
    assert_eq!(p4.tier, "4_char");

    // 5+ characters ($5)
    let p5 = resolver.get_pricing("alice").unwrap();
    assert_eq!(p5.price_usd, 5.0);
    assert_eq!(p5.price_atomic, "5000000");
    assert_eq!(p5.tier, "5_plus");
}

#[tokio::test]
async fn test_resolver_init_and_invalid_resolution() {
    let resolver = UnameResolver::new(
        Some("https://api.unamereg.xyz".into()),
        Some("https://wip-near-615054f501a8.herokuapp.com".into()),
        Some("https://rpc.mainnet.fastnear.com".into()),
        Some("uname-registry.near".into()),
    );

    // Verify alias UnamResolver works identically
    let _alias_resolver: UnamResolver = resolver.clone();

    // Invalid name returns None
    let res = resolver.resolve("invalid!!", "ethereum").await.unwrap();
    assert!(res.is_none());

    // Resolve address on reserved returns None
    let res_reserved = resolver.resolve_address("admin", "ethereum").await.unwrap();
    assert!(res_reserved.is_none());
}
