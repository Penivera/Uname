# Forking Taho Wallet for Native `.uni` Domain Resolution

Taho (formerly Tally Ho) is a 100% open-source, community-governed Web3 browser extension wallet licensed under GPL-3.0.

Because of its clean, modular architecture with dedicated background domain resolution services, Taho is one of the easiest wallets to fork or extend for Universal Name (`.uni`) resolution.

---

## 1. Fork and Clone Repository

```bash
# 1. Clone repository
git clone https://github.com/taho-xyz/taho-wallet.git taho-uni
cd taho-uni

# 2. Create feature branch
git checkout -b feat/uname-domain-resolution
```

---

## 2. Add `@uname/resolver-sdk`

```bash
yarn add @uname/resolver-sdk
```

---

## 3. Extending the Domain Resolution Service

In Taho, name resolution services reside in `src/background/services/domainResolution/`.

Create a dedicated resolver handler `src/background/services/domainResolution/unameResolver.ts`:

```typescript
import { UnameResolver } from "@uname/resolver-sdk";

const client = new UnameResolver({
  apiUrl: "https://api.unamereg.xyz",
  fallbackUrl: "https://wip-near-615054f501a8.herokuapp.com",
});

export async function resolveUnameDomain(
  domainName: string,
  chainId: number
): Promise<{ address: string; name: string } | null> {
  if (!domainName.toLowerCase().endsWith(".uni")) {
    return null;
  }

  try {
    const address = await client.resolveAddress(domainName, chainId);
    if (address) {
      return {
        address,
        name: domainName,
      };
    }
  } catch (err) {
    console.error("Failed to resolve .uni domain:", err);
  }
  return null;
}
```

Then register `resolveUnameDomain` in the main resolution dispatcher (`src/background/services/domainResolution/index.ts`):

```typescript
import { resolveUnameDomain } from "./unameResolver";

export async function resolveDomain(name: string, chainId: number) {
  // Check for .uni domain
  if (name.endsWith(".uni")) {
    return resolveUnameDomain(name, chainId);
  }

  // Default to ENS for .eth or UNS for other TLDs
  return resolveEns(name, chainId);
}
```

---

## 4. Build and Test

```bash
# Install dependencies
yarn install

# Build extension
yarn build:dev
```

Load the unpacked extension directory into your Chromium browser via `chrome://extensions/` and test sending tokens to any `.uni` address!
