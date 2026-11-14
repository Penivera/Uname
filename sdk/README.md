# Universal Name (`.uni`) SDKs & Wallet Integration

Universal Name (`.uni`) is a chain-agnostic domain name protocol powered by a high-performance registry contract on NEAR (`uname-registry.near`), offering instant human-readable addresses across EVM chains (Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche), Solana, Bitcoin, and NEAR.

This directory contains the official client SDKs for integrating `.uni` domain resolution into wallets, dApps, bots, and backend services.

---

## Available SDKs

| Language / Platform | Package | Path | Key Use Cases |
| :--- | :--- | :--- | :--- |
| **TypeScript / JS** | `@uname/resolver-sdk` | [`sdk/typescript`](./typescript) | Browser extensions, React Native, Web wallets, NodeJS bots |
| **Python** | `uname-resolver` | [`sdk/python`](./python) | Python backends, Telegram/Discord bots, indexers, analytics |
| **Rust** | `uname-resolver` | [`sdk/rust`](./rust) | Native desktop wallets, high-performance engines, RPC nodes |
| **MetaMask Snap** | `@uname/snap` | [`packages/snap`](../packages/snap) | Plug-and-play `.uni` resolution inside MetaMask browser extension |

---

## Resolution Architecture & Failover

All SDKs implement a battle-tested **3-Tier Multi-Network Failover Strategy** ensuring high uptime:

```
[User Input: "alice.uni"]
           │
           ▼
┌──────────────────────────────┐
│  Tier 1: Production Resolver │ ──> https://api.unamereg.xyz/v1/resolve
└──────────────┬───────────────┘
               │ (if unavailable or timeout)
               ▼
┌──────────────────────────────┐
│  Tier 2: Fallback Service    │ ──> https://wip-near-615054f501a8.herokuapp.com/v1/resolve
└──────────────┬───────────────┘
               │ (if unavailable or offline)
               ▼
┌──────────────────────────────┐
│  Tier 3: Decentralized RPC   │ ──> NEAR Mainnet JSON-RPC (`uname-registry.near`)
└──────────────────────────────┘     `resolve_direct` via FastNEAR / official RPC
```

---

## Quick Reference by Language

### 1. TypeScript / JavaScript
```typescript
import { UnameResolver } from "@uname/resolver-sdk";

const resolver = new UnameResolver();
const address = await resolver.resolveAddress("peni.uni", "base");
// => "0x..."
```
*See [TypeScript SDK Documentation](./typescript/README.md) for full guide.*

### 2. Python (Sync & Async)
```python
from uname_resolver import UnameResolver

resolver = UnameResolver()
address = resolver.resolve_address("peni.uni", "base")
# => "0x..."
```
*See [Python SDK Documentation](./python/README.md) for full guide.*

### 3. Rust (Async)
```rust
use uname_resolver::UnameResolver;

let resolver = UnameResolver::default();
let address = resolver.resolve_address("peni.uni", "base").await?;
```
*See [Rust SDK Documentation](./rust/README.md) for full guide.*

---

## Wallet Integration Best Practices

1. **Auto-Trigger on `.uni` Suffix:**
   In your wallet's recipient address input field, detect when the user inputs a string ending in `.uni`.
2. **Chain Normalization:**
   Pass the active wallet chain (e.g. `1` or `8453` or `"base"`); the SDK will automatically map it to the canonical CAIP-2 identifier (`eip155:8453`).
3. **Display Visual Badges:**
   When resolved, display the verified name alongside the truncated hexadecimal address so users can confirm the destination with confidence.
