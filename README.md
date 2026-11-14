# Universal Name (`.uni`)

**One Name, Any Chain, Any Currency, Optional Bank Payout.**

Universal Name is a chain-agnostic domain name protocol and multichain settlement layer powered by a high-performance smart contract on NEAR Protocol. It maps human-readable names (`.uni`) to verified wallets across 20+ blockchains, automatically executes cross-chain intent settlement via NEAR Intents and NEAR Chain Signatures, and integrates seamlessly into Web3 wallets via client SDKs, wallet forks, and a MetaMask Snap.

> **Product Scope & Requirements**: For the full product specification, user flows (A through E), security invariants, and threat models, see the [PRD (Product Requirements Document)](file:///home/peni/Projects/wip/PRD.md).

---

## Live Deployments & Verification

| Network / Component | Target / Address | Status | Explorer / Live Link |
| :--- | :--- | :--- | :--- |
| **NEAR Mainnet Contract** | `uname-registry.near` | Live on Mainnet | [NEAR Explorer](https://explorer.near.org/accounts/uname-registry.near) |
| **Production Resolver API** | `https://api.unamereg.xyz` | Live on Production | [Health / Status](https://api.unamereg.xyz/v1/checkout/pricing?name=peni.uni) |
| **Mainnet Relayer** | `uname-registry.near` | Active | Self-relaying with NEP-141 callback abstraction |
| **Mainnet Admin** | `bernarditoro.near` | Active | Multisig / governance key |
| **Mainnet Primary Settlement Token** | Native USDC (`17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`) | Live | Verified in contract state |
| **Mainnet Secondary Accepted Tokens** | Tether USD (`usdt.tether-token.near`) | Live | Verified in contract state |
| **NEAR Testnet Contract** | `unam-registry.testnet` | Live on Testnet | [NEAR Testnet Explorer](https://explorer.testnet.near.org/accounts/unam-registry.testnet) |
| **Testnet Primary Settlement Token** | Testnet USDC (`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`) | Live | Testnet configuration |

---

## Monorepo Architecture

```
.
├── contracts/
│   └── registry/              # NEAR smart contract (Rust + near-sdk v5, NEP-141, NEP-297, length tiers)
├── resolver-py/               # FastAPI resolver & intent router (1Click API, Chain Signatures, Checkout)
├── apps/
│   └── web/                   # Next.js & Tailwind web app and embeddable widget
├── packages/
│   ├── shared/                # Universal shared types, CAIP-2 mappings, domain normalization
│   └── snap/                  # Official MetaMask Snap (@uname/snap) for onNameLookup (.uni)
├── sdk/
│   ├── typescript/            # TypeScript SDK (@uname/resolver-sdk)
│   ├── python/                # Python SDK (uname-resolver)
│   └── rust/                  # Rust SDK (uname-resolver)
├── wallets/
│   └── my-near-wallet/        # Native .uni-enabled fork of MyNearWallet
└── docs/
    └── wallet-forks/          # Integration & fork blueprints (MyNearWallet, Rabby, Taho)
```

---

## 1. Smart Contract (`contracts/registry`)

The Universal Name Registry contract on NEAR (`uname-registry.near`) manages domain ownership, multichain address connections with cryptographic proof of control, and receive policies.

### Key Capabilities
- **Length-Tiered Pricing**:
  - **3-character names** (e.g. `xyz.uni`): $50 USD (`50_000_000` 6-decimal micro-units).
  - **4-character names** (e.g. `peni.uni`): $20 USD (`20_000_000` 6-decimal micro-units).
  - **5+-character names** (e.g. `alice.uni`): $5 USD (`5_000_000` 6-decimal micro-units).
- **Keyless Cross-Chain Callback Abstraction**: Buyers can pay from any chain. Solvers execute a standard NEP-141 `ft_transfer_call` with `{"name": "...", "owner": "..."}`. The contract autonomously verifies payment and assigns domain ownership without requiring hot relayer private keys.
- **ERC-7930 Interoperable Addresses**: Address records are stored in canonical CAIP-350 envelopes (`version | chainType | chainRef | addrLen | addr`), natively supporting EVM, Solana, Bitcoin, and NEAR without custom coin-type hacks.
- **ENSIP-31 Payment Preferences**: Domain owners can specify default assets or bank payout policies with timelock protection against instant hijacking.
- **Embedded NEAR ABI**: Built with `cargo near build non-reproducible-wasm`, embedding the compressed contract schema (`__contract_abi`) for instant inspection in NEAR explorers and wallets.

### Smart Contract Methods
| Method | Type | Description |
| :--- | :--- | :--- |
| `claim_for(name, owner, payment_ref)` | Call | Relayer/admin domain registration after external payment verification. |
| `ft_on_transfer(sender_id, amount, msg)` | Call | NEP-141 payment receiver for solver-driven autonomous registration. |
| `connect_chain(name, chain, address, proof)` | Call | Binds a verified wallet address to a `.uni` domain for that chain. |
| `set_policy(name, policy)` | Call | Queues an ENSIP-31 routing policy change (subject to timelock delay). |
| `admin_approve_pending_policy(name)` | Call | Admin bypass to instantly activate queued policy changes. |
| `resolve_direct(name, chain)` | View | Direct on-chain resolution returning raw address, coin type, and generation. |
| `get_record(name)` | View | Retrieves full domain record including connected chains and active policies. |
| `get_pricing_config()` | View | Retrieves accepted tokens, relayer account, and length pricing tiers. |

### Building and Testing the Contract
```bash
# Run unit and sandbox integration tests
cargo test -p unam-registry

# Build contract WASM with embedded NEAR ABI schema
./scripts/build-contract.sh
```

---

## 2. Resolver & Intent Router API (`resolver-py`)

The Python backend service (`resolver-py`) orchestrates real-time resolution, multichain stablecoin checkout sessions, and cross-chain routing via NEAR Intents (1Click API) and NEAR Chain Signatures.

### Core Endpoints
- `GET /v1/resolve?name=peni.uni&chain=eip155:1` — Resolves a domain into an address with cryptographic Ed25519 signature verification:
  - **Mode 1 (Direct)**: Returns the owner's connected wallet address for that chain.
  - **Mode 2 (Routed)**: Returns a persistent deposit address generated via NEAR Intents or Chain Signatures that swaps incoming tokens to the owner's preferred asset.
  - **Mode 3 (Bank Payout)**: Routes incoming crypto to USDC and coordinates off-ramp settlement.
- `GET /v1/checkout/pricing?name={name}` — Returns live pricing, available payment tokens, and chain options.
- `POST /v1/checkout/session` — Initiates a multichain checkout session.
- `GET /v1/checkout/session/{checkout_id}` — Monitors transaction status (`PENDING_PAYMENT`, `PROCESSING`, `COMPLETED`).
- `POST /v1/checkout/submit` — Submits origin chain payment hash to trigger autonomous contract fulfillment.
- `GET /v1/tokens` — Lists cross-chain tokens supported by the 1Click routing engine.
- `GET /v1/status?depositAddress=...` — Polls live intent swap execution progress.
- `GET /v1/cs/derive?name=peni.uni&chain=eip155:1` — Derives a deterministic Chain Signatures deposit address.

### Running the Resolver Locally
```bash
cd resolver-py
uv sync
uv run pytest -v                # Run test suite
uv run python main.py           # Starts server on http://localhost:8000
```

---

## 3. Frontend Web Application & Embeddable Widget (`apps/web`)

A modern Next.js and Tailwind web dApp providing an end-to-end user experience for domain search, registration, connected wallet management, and routing configuration.

### Features
- **Instant Search & Registration**: Live domain availability checks with length-tiered pricing.
- **Multichain Checkout**: Pay with USDC, USDT, or native tokens across EVM, Solana, or NEAR.
- **My Names Dashboard**: Connect Ethereum, Solana, and NEAR wallets to your `.uni` name with one-click signature proofs.
- **Routing Preferences**: Set default receive assets (e.g. "Always deliver funds as USDC on Base").
- **Embeddable Pay Widget**: Can be built as a standalone `.js` file and embedded into any merchant website.

### Running the Web App
```bash
# Start frontend development server
pnpm dev:web

# Build standalone embeddable widget (writes to apps/web/dist-embed/universal-name.js)
pnpm build:embed
```

```html
<!-- Example embedding on third-party site -->
<script src="universal-name.js"></script>
<script>
  UniversalName.open({ name: "peni" });
</script>
```

---

## 4. MetaMask Snap (`packages/snap`)

The official **`@uname/snap`** package enables native `.uni` domain resolution directly inside MetaMask for all EVM networks without requiring users to download a custom wallet build.

### How It Works
MetaMask invokes the Snap's `onNameLookup` hook whenever a user types a `.uni` address into the Send or recipient field. The Snap queries `https://api.unamereg.xyz` with automatic failover to NEAR Mainnet JSON-RPC (`uname-registry.near`).

```javascript
// One-click installation from any dApp:
await window.ethereum.request({
  method: "wallet_requestSnaps",
  params: { "npm:@uname/snap": {} },
});
```

See the [MetaMask Snap Documentation](file:///home/peni/Projects/wip/packages/snap/README.md) for full instructions, local testing with MetaMask Flask, and architecture details.

---

## 5. Multi-Language SDK Suite (`sdk/`)

Official SDKs are provided for seamless integration into wallets, indexers, bots, and dApps:

| Language | Package | Path | Tests |
| :--- | :--- | :--- | :--- |
| **TypeScript / JS** | `@uname/resolver-sdk` | [`sdk/typescript`](file:///home/peni/Projects/wip/sdk/typescript) | 12/12 passing |
| **Python** | `uname-resolver` | [`sdk/python`](file:///home/peni/Projects/wip/sdk/python) | 5/5 passing |
| **Rust** | `uname-resolver` | [`sdk/rust`](file:///home/peni/Projects/wip/sdk/rust) | 5/5 passing |

### TypeScript Quickstart
```typescript
import { UnameResolver } from "@uname/resolver-sdk";

const resolver = new UnameResolver();
const address = await resolver.resolveAddress("peni.uni", "base");
// => "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
```

### Python Quickstart (Sync & Async)
```python
from uname_resolver import UnameResolver

resolver = UnameResolver()
address = resolver.resolve_address("peni.uni", "ethereum")
```

### Rust Quickstart (Async Tokio)
```rust
use uname_resolver::UnameResolver;

let resolver = UnameResolver::default();
let address = resolver.resolve_address("peni.uni", "base").await?;
```

See [sdk/README.md](file:///home/peni/Projects/wip/sdk/README.md) for complete SDK guides.

---

## 6. Open-Source Wallet Forks (`wallets/`)

To provide out-of-the-box support in native crypto wallets:
1. **MyNearWallet Fork (`wallets/my-near-wallet`)**:
   - Live, working fork of [MyNearWallet](https://github.com/mynearwallet/my-near-wallet) in [`wallets/my-near-wallet`](file:///home/peni/Projects/wip/wallets/my-near-wallet).
   - Resolves `.uni` names directly in the Send flow for NEAR and NEP-141 tokens.
   - See [wallets/my-near-wallet/UNAME_INTEGRATION.md](file:///home/peni/Projects/wip/wallets/my-near-wallet/UNAME_INTEGRATION.md).
2. **Rabby Wallet & Taho Fork Blueprints**:
   - Step-by-step guides and exact code diffs in [`docs/wallet-forks/`](file:///home/peni/Projects/wip/docs/wallet-forks/).

---

## 7. Testing & Verification

Every component includes isolated, dedicated test suites (no inline tests):

```bash
# 1. Smart Contract Tests (Rust & near-workspaces sandbox)
cargo test -p unam-registry

# 2. Rust SDK Tests
cargo test -p uname-resolver

# 3. TypeScript SDK Tests
npx tsx sdk/typescript/test/resolver.test.ts

# 4. MetaMask Snap Tests
npx tsx packages/snap/test/snap.test.ts

# 5. Python SDK Tests
PYTHONPATH=sdk/python uv run --directory resolver-py pytest sdk/python/tests -v

# 6. Backend Resolver Tests
cd resolver-py && uv run pytest -v

# 7. MyNearWallet Resolver Tests
node --test wallets/my-near-wallet/packages/frontend/test/uname_resolver.test.js
```

---

## Additional Documentation

- [PRD (Product Requirements Document)](file:///home/peni/Projects/wip/PRD.md) — Comprehensive technical specification, user flows, and security model.
- [DOCS_SUPPORTED_STABLES.md](file:///home/peni/Projects/wip/DOCS_SUPPORTED_STABLES.md) — Multichain stablecoins and settlement guide.
- [DOCS_WALLET_CONNECTIVITY.md](file:///home/peni/Projects/wip/DOCS_WALLET_CONNECTIVITY.md) — Wallet connectivity and standards.
- [MetaMask Snap Guide](file:///home/peni/Projects/wip/packages/snap/README.md) — Building and publishing `@uname/snap`.
- [Wallet Forks Guide](file:///home/peni/Projects/wip/docs/wallet-forks/README.md) — Native integration for open-source wallets.

---

## License

This project is licensed under the **GNU General Public License Version 2** (`GPL-2.0-only`). See [LICENSE](file:///home/peni/Projects/wip/LICENSE).
