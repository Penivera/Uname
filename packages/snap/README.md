# @uname/snap

Official **MetaMask Snap** for **Universal Name (`.uni`)** cross-chain domain resolution.

Enables native `.uni` domain resolution directly inside MetaMask for all EVM networks (Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, etc.). Once installed, typing any `.uni` name (e.g. `peni.uni`, `alice.uni`) in MetaMask's Send or transaction recipient input resolves automatically to the verified recipient address.

---

## How It Works

MetaMask Snaps support the `endowment:name-lookup` permission. This allows third-party name systems to provide domain resolution directly inside MetaMask's native user interface without modifying the MetaMask core codebase.

```
                  ┌────────────────────────┐
                  │    User enters:        │
                  │     "peni.uni"         │
                  └──────────┬─────────────┘
                             │
                             ▼
                  ┌────────────────────────┐
                  │ MetaMask Name Lookup   │
                  │ (endowment:name-lookup)│
                  └──────────┬─────────────┘
                             │
                             ▼
                  ┌────────────────────────┐
                  │      @uname/snap       │
                  │    (onNameLookup)      │
                  └──────────┬─────────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Tier 1 API  │      │ Fallback API │      │ NEAR RPC     │
│  api.        │ ───> │ Heroku       │ ───> │ uname-       │
│  unamereg.xyz│      │ Staging      │      │ registry.near│
└──────────────┘      └──────────────┘      └──────────────┘
                             │
                             ▼
                  ┌────────────────────────┐
                  │ MetaMask populates:    │
                  │  0x71C7...8976F        │
                  │  [Badge: peni.uni]     │
                  └────────────────────────┘
```

---

## 1. Installation for End-Users

End-users can install `@uname/snap` into their MetaMask wallet directly from any supported dApp or website with one click.

### Method A: Via dApp / Website One-Click Connect

Any Web3 website can offer a "Enable .uni Resolution in MetaMask" button:

```javascript
async function installUnameSnap() {
  if (!window.ethereum) {
    alert("Please install MetaMask!");
    return;
  }

  try {
    const result = await window.ethereum.request({
      method: "wallet_requestSnaps",
      params: {
        "npm:@uname/snap": {},
      },
    });
    console.log("UNAME Snap successfully installed:", result);
  } catch (error) {
    console.error("Installation rejected or failed:", error);
  }
}
```

When triggered:
1. MetaMask displays a modal prompting the user to install **UNAME (.uni) Resolver**.
2. The user reviews and approves permissions:
   - **Resolve domain names** (`endowment:name-lookup` for `.uni` domains).
   - **Access the internet** (`endowment:network-access` to query the resolver API and NEAR RPC).
3. Once approved, `.uni` resolution is immediately active throughout MetaMask!

---

## 2. Using the Snap in MetaMask

Once installed, there is **zero additional configuration** required:

1. Open **MetaMask**.
2. Select **Send** on any EVM chain (Ethereum, Base, Arbitrum, Polygon, etc.).
3. In the recipient address input field, type any `.uni` domain (e.g., `peni.uni`).
4. MetaMask will display the resolved address along with a verification indicator:
   ```text
   peni.uni -> 0x71C7656EC7ab88b098defB751B7401B5f6d8976F
   ```
5. Confirm transaction parameters and send your funds safely.

---

## 3. Developer & Local Testing Guide

### Prerequisites
- Node.js >= 20.0.0
- pnpm >= 9.0.0
- [MetaMask Flask](https://metamask.io/flask/) (MetaMask's developer distribution for testing experimental Snaps) or standard MetaMask with developer mode enabled.

### Build the Snap

```bash
# Build TypeScript and generate dist/
pnpm --filter @uname/snap build
```

### Run Automated Unit & Integration Tests

```bash
# Run unit test suite
npx tsx packages/snap/test/snap.test.ts
```

The test suite validates:
- Real-time resolution via primary API (`https://api.unamereg.xyz`)
- Fallback resolution via staging endpoint
- Decentralized direct on-chain JSON-RPC queries to `uname-registry.near` on NEAR Mainnet
- Case normalization (`PENI.UNI` -> `peni.uni`)
- Null handling for non-existent domains and malformed inputs

### Serve Locally with Snaps CLI

To serve the Snap locally during development:

```bash
# Install snaps-cli if not already installed
npm install -g @metamask/snaps-cli

# Serve the local snap directory
cd packages/snap
snaps-cli serve
```

This starts a local development server on `http://localhost:8080`.

To install the local development Snap in MetaMask Flask:
```javascript
await window.ethereum.request({
  method: "wallet_requestSnaps",
  params: {
    "local:http://localhost:8080": {},
  },
});
```

---

## 4. Manifest Configuration

The Snap manifest is located at [`snap.manifest.json`](./snap.manifest.json):

```json
{
  "version": "0.1.0",
  "description": "Resolves Universal Name (.uni) domains to addresses across EVM chains, Solana, Bitcoin, and NEAR.",
  "proposedName": "UNAME (.uni) Resolver",
  "repository": {
    "type": "git",
    "url": "https://github.com/Penivera/WIP.git"
  },
  "source": {
    "shasum": "...",
    "location": {
      "npm": {
        "filePath": "dist/index.js",
        "packageName": "@uname/snap",
        "registry": "https://registry.npmjs.org/"
      }
    }
  },
  "initialPermissions": {
    "endowment:name-lookup": {
      "chains": [
        "eip155:1",
        "eip155:8453",
        "eip155:42161",
        "eip155:10",
        "eip155:137",
        "eip155:56",
        "eip155:43114"
      ],
      "matchers": {
        "tlds": ["uni"]
      }
    },
    "endowment:network-access": {}
  },
  "manifestVersion": "0.1"
}
```

---

## 5. Security & Trust Model

- **Decentralized Fallback**: If centralized APIs are ever down or unresponsive, `@uname/snap` directly queries `uname-registry.near` on NEAR Mainnet via JSON-RPC.
- **Cryptographic Verification**: Resolution responses include generation counters and Ed25519 signatures issued by the registry relayer.
- **Strict Sandboxing**: The Snap runs in MetaMask's isolated SES (Secure ECMAScript) sandbox and has access only to network calls for resolution. It has no access to user private keys, seed phrases, or wallet accounts.
