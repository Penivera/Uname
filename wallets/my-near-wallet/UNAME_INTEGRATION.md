# Universal Name (`.uni`) Integration in MyNearWallet

This fork of [MyNearWallet](https://github.com/mynearwallet/my-near-wallet) introduces native **Universal Name (`.uni`)** cross-chain domain resolution.

Users can enter any `.uni` name (e.g. `peni.uni`, `alice.uni`) directly in the Send flow when sending NEAR or Fungible Tokens (NEP-141). MyNearWallet automatically resolves the `.uni` domain to the owner's connected NEAR account ID and displays a verified badge.

---

## Architecture & Data Flow

```
[User inputs "peni.uni" in Send screen]
                  │
                  ▼
┌──────────────────────────────────────────────┐
│ MyNearWallet: InputAccountId / EnterReceiver │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│      src/services/UnameResolver.js           │
└─────────────────────┬────────────────────────┘
                      │
       ┌──────────────┴──────────────┐
       ▼                             ▼
┌───────────────────────────┐ ┌────────────────────────────────────────┐
│ Tier 1: Production API    │ │ Tier 2: Decentralized On-Chain Fallback │
│ https://api.unamereg.xyz  │ │ uname-registry.near on NEAR Mainnet    │
│   (/v1/resolve endpoint)  │ │   (resolve_direct JSON-RPC query)      │
└──────────────┬────────────┘ └───────────────────┬────────────────────┘
               │                                  │
               └──────────────┬───────────────────┘
                              │
                              ▼
           [Resolved: "peni.near" / Account ID]
                              │
                              ▼
┌──────────────────────────────────────────────┐
│ MyNearWallet validates on-chain state        │
│ Displays: "✓ Verified .uni Domain"           │
│ Dispatches transfer to resolved recipient    │
└──────────────────────────────────────────────┘
```

---

## Modified Files

1. **`packages/frontend/src/services/UnameResolver.js`** *(New)*:
   - Queries `https://api.unamereg.xyz/v1/resolve` for `chain: "near:mainnet"` (or `near:testnet`).
   - Multi-tier fallback to staging API and direct NEAR JSON-RPC (`resolve_direct` view call on `uname-registry.near`).
   - 60-second in-memory LRU cache to minimize network calls during typing.

2. **`packages/frontend/src/utils/wallet.ts`**:
   - `checkAccountAvailable(accountId)`: Checks if the input is a `.uni` domain; if so, resolves it to the underlying NEAR account before validating on-chain account existence.
   - `sendMoney(receiverId, amount)`: Intercepts `.uni` recipient addresses and executes the NEAR native transfer to the resolved account.

3. **`packages/frontend/src/components/send/SendContainerWrapper.js`**:
   - `handleSendToken`: Resolves `.uni` domain names to NEAR account IDs when executing Fungible Token (NEP-141) transfers.

4. **`packages/frontend/src/components/send/components/views/EnterReceiver.js`**:
   - Renders a verified `.uni` indicator badge (`✓ Verified Universal Name (.uni) Domain`) upon successful resolution.

5. **`packages/frontend/test/uname_resolver.test.js`** *(New)*:
   - Unit tests covering domain name syntax, normalization, and validation rules.

---

## Running the Fork Locally

```bash
# Navigate to the MyNearWallet directory
cd wallets/my-near-wallet

# Install dependencies (Yarn v1)
yarn

# Start the frontend dev server
yarn start
```

The wallet web interface will open at `http://localhost:1234` or `https://localhost:1234`.

---

## Verification & Testing

To run the unit test suite:

```bash
node --test wallets/my-near-wallet/packages/frontend/test/uname_resolver.test.js
```
