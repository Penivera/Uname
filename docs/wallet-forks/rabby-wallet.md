# Forking Rabby Wallet for Native `.uni` Domain Resolution

Rabby Wallet is the premier open-source EVM browser extension wallet, known for its multi-chain routing, security simulation, and active developer community.

This document walks through cloning, patching, and building a fork of Rabby Wallet with native **Universal Name (`.uni`)** support powered by `@uname/resolver-sdk`.

---

## 1. Fork and Clone Repository

```bash
# 1. Clone your fork of Rabby Wallet
git clone https://github.com/rabbyhub/rabby.git rabby-uni
cd rabby-uni

# 2. Checkout the latest stable branch or tag
git checkout -b feature/uni-domain-resolver
```

---

## 2. Install `@uname/resolver-sdk`

In your Rabby directory, add `@uname/resolver-sdk`:

```bash
yarn add @uname/resolver-sdk
# or npm install @uname/resolver-sdk
```

---

## 3. Patching the Address Input Component

In Rabby, recipient domain resolution is managed in `src/ui/component/AddressInput/index.tsx` (and its supporting resolver utilities).

### Patching `src/ui/utils/address.ts` (or Resolver Hook)

Add the `UnameResolver` instance and resolution helper:

```typescript
// Add imports:
import { UnameResolver } from "@uname/resolver-sdk";

const unameResolver = new UnameResolver({
  apiUrl: "https://api.unamereg.xyz",
  fallbackUrl: "https://wip-near-615054f501a8.herokuapp.com",
});

/**
 * Resolves address for ENS (.eth) or Universal Name (.uni)
 */
export async function resolveAddressOrDomain(
  input: string,
  chainId: number
): Promise<{ address: string; domain?: string } | null> {
  const clean = input.trim().toLowerCase();

  // Check for .uni TLD
  if (clean.endsWith(".uni")) {
    try {
      const resolved = await unameResolver.resolveAddress(clean, chainId);
      if (resolved) {
        return {
          address: resolved,
          domain: clean,
        };
      }
      return null;
    } catch (e) {
      console.warn("UNAME resolution error:", e);
      return null;
    }
  }

  // Fallback to standard ENS resolution for .eth
  return resolveEnsAddress(clean);
}
```

### Modifying the Send / Recipient UI

In Rabby's `SendToken` or `AddressInput` component (`src/ui/component/AddressInput/index.tsx`):

```tsx
// Inside handleInputChange or useEffect:
const handleAddressChange = async (val: string) => {
  setInputValue(val);

  if (val.endsWith('.uni')) {
    setLoading(true);
    const result = await resolveAddressOrDomain(val, currentChain.id);
    setLoading(false);

    if (result && result.address) {
      setResolvedAddress(result.address);
      setAddressBadge({
        text: val,
        verified: true,
        type: 'uname',
      });
      onChange(result.address);
    } else {
      setError('Unregistered .uni domain name');
    }
    return;
  }

  // Existing ENS / address handling logic...
};
```

---

## 4. Building the Extension

```bash
# Install dependencies
yarn install

# Build extension for Chrome / Brave
yarn build:pro
```

The compiled unpacked Chrome extension will be output to:
```text
dist/
```

---

## 5. Testing the Fork in Chrome / Brave

1. Open Chrome or Brave and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the upper right corner.
3. Click **Load unpacked** and select the `dist/` directory from your `rabby-uni` build.
4. Open the extension, create or import a test wallet.
5. Click **Send**, select Ethereum or Base network.
6. In the recipient input, type `peni.uni`.
7. Verify that the address immediately resolves to:
   ```text
   0x71C7656EC7ab88b098defB751B7401B5f6d8976F
   ```
8. The address is successfully populated, ready for transfer!

---

## 6. Upstream Contribution

You can also submit this patch as a Pull Request to `rabbyhub/rabby`:
- Rabby welcomes PRs that add broad ecosystem support.
- Emphasize the multi-chain nature of `.uni` (resolving across 20+ EVM chains and non-EVM).
- All resolution has built-in fallbacks to NEAR Mainnet JSON-RPC (`uname-registry.near`), guaranteeing high availability without centralized vendor lock-in.
