# @uname/resolver-sdk

Official TypeScript/JavaScript SDK for resolving **Universal Name (.uni)** cross-chain domain names across EVM chains (Ethereum, Base, Arbitrum, Polygon, etc.), Solana, Bitcoin, and NEAR (`uname-registry.near`).

Designed for seamless integration into Web3 wallets (browser extensions, mobile apps, web wallets) and dApps.

---

## Installation

```bash
npm install @uname/resolver-sdk
# or
pnpm add @uname/resolver-sdk
# or
yarn add @uname/resolver-sdk
```

---

## Quick Start

```typescript
import { UnameResolver } from "@uname/resolver-sdk";

const resolver = new UnameResolver();

// 1. Resolve domain to an address on Base
const address = await resolver.resolveAddress("peni.uni", "base");
console.log("Recipient address:", address);
// => "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"

// 2. Resolve on Ethereum with numeric chain ID
const ethAddress = await resolver.resolveAddress("alice.uni", 1);

// 3. Resolve with full cryptographic metadata
const result = await resolver.resolve("peni.uni", "eip155:8453");
console.log(result);
/*
{
  name: "peni.uni",
  mode: "direct",
  address: "0x...",
  chainId: "eip155:8453",
  details: {
    address: "0x...",
    interoperableAddress: "0x0001...",
    coinType: 2147492105,
    proofStatus: "VERIFIED"
  }
}
*/
```

---

## Direct On-Chain Decentralized Resolution

The SDK includes automatic failover to decentralized NEAR JSON-RPC (`uname-registry.near`). If the centralized API is ever unreachable, the SDK queries the blockchain contract directly:

```typescript
// Explicit on-chain resolution bypassing all HTTP APIs
const onChainRecord = await resolver.resolveOnChain("peni.uni", "ethereum");
```

---

## Domain Pricing & Availability

```typescript
const pricing = await resolver.getPricing("myname.uni");
console.log(pricing);
/*
{
  name: "myname.uni",
  priceUsd: 5.0,
  priceAtomic: "5000000",
  available: true,
  tier: "5_plus"
}
*/
```

---

## Wallet Integration Example (e.g. Recipient Field)

```typescript
async function onRecipientInputChange(input: string, activeChainId: number) {
  if (input.endsWith(".uni")) {
    const address = await resolver.resolveAddress(input, activeChainId);
    if (address) {
      setRecipientAddress(address);
      setResolvedDomainBadge(input);
    } else {
      setError("Unregistered .uni domain");
    }
  }
}
```
