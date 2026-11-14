# Open-Source Wallet Forks & Integration Guide

This guide details how to integrate Universal Name (`.uni`) domain resolution directly into open-source Web3 wallets either by:
1. **Forking an existing open-source wallet** and bundling `@uname/resolver-sdk` into its native send/recipient workflow.
2. **Submitting an upstream Pull Request** to popular open-source wallets.

---

## Wallet Comparison & Fork Candidates

| Wallet | Repository | Architecture | License | Suitability for `.uni` Fork |
| :--- | :--- | :--- | :--- | :--- |
| **MyNearWallet** | [`mynearwallet/my-near-wallet`](https://github.com/mynearwallet/my-near-wallet) | React, Redux, Parcel | Apache-2.0 | ⭐⭐⭐⭐⭐ **Active Fork in Repo**: Located at [`wallets/my-near-wallet`](../../wallets/my-near-wallet). Primary web wallet for NEAR Protocol. |
| **Rabby Wallet** | [`rabbyhub/rabby`](https://github.com/rabbyhub/rabby) | React, TypeScript, Webpack | MIT / Proprietary mix | ⭐⭐⭐⭐⭐ **Top Choice**: Most popular EVM power-user extension. Clean modular address resolver. |
| **Taho Wallet** | [`taho-xyz/taho-wallet`](https://github.com/taho-xyz/taho-wallet) | React, TypeScript, Redux | GPL-3.0 | ⭐⭐⭐⭐⭐ **Top Choice**: 100% open-source, community owned, dedicated domain resolution service. |
| **Rainbow** | [`rainbow-me/rainbow`](https://github.com/rainbow-me/rainbow) | React Native (iOS/Android/Web) | GPL-3.0 | ⭐⭐⭐⭐ Excellent choice for a dedicated mobile wallet with native `.uni` support. |
| **Frame** | [`floating/frame`](https://github.com/floating/frame) | Electron, TypeScript, Node | GPL-3.0 | ⭐⭐⭐⭐ High security desktop wallet with companion browser extension. |
| **Brave Wallet** | [`brave/brave-core`](https://github.com/brave/brave-core) | C++, Chromium, Rust, React | MPL-2.0 | ⭐⭐⭐ Browser-native; best suited for upstream proposal or Rust SDK integration. |

---

## Detailed Fork Guides

1. **[MyNearWallet Fork Guide](./my-near-wallet.md)**:
   - Full walkthrough of the live fork located in [`wallets/my-near-wallet`](../../wallets/my-near-wallet).
   - Real-time resolution via `api.unamereg.xyz` and NEAR Mainnet JSON-RPC.
   - Tested and verified.
2. **[Rabby Wallet Fork Guide](./rabby-wallet.md)**:
   - Full walkthrough to fork Rabby Wallet.
   - Exact code modifications in `AddressInput` / `useResolveAddress`.
   - Building and testing the unpacked Chrome extension.
3. **[Taho Wallet Fork Guide](./taho-wallet.md)**:
   - Full walkthrough to fork Taho Wallet.
   - Integrating `@uname/resolver-sdk` into the background domain resolution service.
   - Building and deploying.

---

## Standard Integration Pattern

Regardless of which wallet you choose to fork, the integration follows a simple 3-step pattern:

```typescript
import { UnameResolver } from "@uname/resolver-sdk";

const resolver = new UnameResolver();

/**
 * Hook or function called whenever the user modifies the recipient input
 */
async function resolveRecipient(input: string, currentChainId: number | string) {
  const trimmed = input.trim().toLowerCase();

  // 1. If it ends with .uni, resolve via UnameResolver
  if (trimmed.endsWith(".uni")) {
    const address = await resolver.resolveAddress(trimmed, currentChainId);
    if (address) {
      return {
        address,
        domain: trimmed,
        type: "uname",
      };
    }
    throw new Error(`Domain ${trimmed} not found on this network`);
  }

  // 2. Otherwise fall through to existing resolvers (ENS, Unstoppable, raw 0x address)
  return fallbackResolve(trimmed);
}
```
