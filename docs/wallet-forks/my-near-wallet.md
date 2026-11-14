# Forking MyNearWallet for Native `.uni` Domain Resolution

[MyNearWallet](https://github.com/mynearwallet/my-near-wallet) is the primary open-source web wallet for NEAR Protocol, used by hundreds of thousands of NEAR users.

This repository includes a fully integrated, working fork of MyNearWallet in the [`wallets/my-near-wallet`](../../wallets/my-near-wallet) directory, with native `.uni` domain resolution configured against our live production resolver API at `https://api.unamereg.xyz`.

---

## 1. Directory Structure

The complete fork is located in its own directory:
- [`wallets/my-near-wallet/`](../../wallets/my-near-wallet)
- Core Resolver Service: [`wallets/my-near-wallet/packages/frontend/src/services/UnameResolver.js`](../../wallets/my-near-wallet/packages/frontend/src/services/UnameResolver.js)
- Detailed Fork Notes: [`wallets/my-near-wallet/UNAME_INTEGRATION.md`](../../wallets/my-near-wallet/UNAME_INTEGRATION.md)

---

## 2. Integration Mechanics

When a user sends NEAR or NEP-141 tokens in MyNearWallet:
1. **Input Detection**: The receiver input field in `EnterReceiver.js` detects when an input ends in `.uni`.
2. **Resolver Query**: `UnameResolver.js` queries `https://api.unamereg.xyz/v1/resolve` for `chain: "near:mainnet"`.
3. **On-Chain Fallback**: If the API is unreachable, it queries `uname-registry.near` on NEAR Mainnet directly via JSON-RPC.
4. **Validation**: `wallet.checkAccountAvailable()` validates the resolved account on NEAR.
5. **UI Confirmation**: A green `✓ Verified Universal Name (.uni) Domain` badge appears under the input.
6. **Execution**: The funds are transferred directly to the resolved NEAR account.

---

## 3. How to Run Locally

```bash
cd wallets/my-near-wallet
yarn
yarn start
```

Visit `http://localhost:1234` to test sending NEAR or FTs using `.uni` names!
