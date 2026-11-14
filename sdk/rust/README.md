# uname-resolver

Official Rust SDK for resolving **Universal Name (`.uni`)** cross-chain domain names across EVM chains (Ethereum, Base, Arbitrum, Polygon, etc.), Solana, Bitcoin, and NEAR.

Designed for high-performance wallet engines, crypto backend services, indexers, and Rust-based clients connecting directly to `uname-registry.near`.

---

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
uname-resolver = "0.1.0"
tokio = { version = "1", features = ["full"] }
```

---

## Quick Start

```rust
use uname_resolver::UnameResolver;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let resolver = UnameResolver::default();

    // 1. Quick address lookup
    if let Some(address) = resolver.resolve_address("peni.uni", "base").await? {
        println!("Resolved Base address: {}", address);
    }

    // 2. Full cryptographic resolution with proof details
    if let Some(res) = resolver.resolve("peni.uni", "ethereum").await? {
        println!("Resolved {}: {} on {}", res.name, res.address, res.chain_id);
        if let Some(details) = res.details {
            println!("Coin Type: {:?}", details.coin_type);
        }
    }

    // 3. Domain pricing and length tiers
    let pricing = resolver.get_pricing("crypto.uni")?;
    println!("Price: ${} USD (Tier: {})", pricing.price_usd, pricing.tier);

    Ok(())
}
```

---

## Features

- **Multi-Chain CAIP-2 Support**: Canonical resolution for `eip155:1`, `eip155:8453`, `solana:5eykt...`, `near:mainnet`, `bip122:000...`, with friendly aliases (`"ethereum"`, `"base"`, `"solana"`, etc.).
- **Automatic Multi-Tier Failover**:
  1. Primary API: `https://api.unamereg.xyz`
  2. Fallback API: `https://wip-near-615054f501a8.herokuapp.com`
  3. Direct On-Chain RPC: Queries `uname-registry.near` on NEAR Mainnet directly via JSON-RPC.
- **Async & Non-Blocking**: Built with `reqwest` and `tokio`.
- **Validation**: Full client-side `.uni` syntax and reserved names validation before making network requests.

---

## Testing

```bash
cargo test -p uname-resolver
```
