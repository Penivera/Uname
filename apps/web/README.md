# Universal Name Web App & Embeddable Widget

The **pay** and **my names** screens for Universal Name (`.uni`), built as an embeddable widget and standalone web app. It connects to the Universal Name Resolver API (`api.unamereg.xyz`) and reads the registry contract directly from NEAR Mainnet (`uname-registry.near`).

## Key Features

- **Pay a name:** Send cross-chain payments directly to any `.uni` name. Automatically binds your connected wallet (EVM, NEAR, Solana) as the sender and refund recipient—no manual address typing needed.
- **Multichain Checkout:** Purchase `.uni` domains directly from any supported chain (Ethereum, Base, Arbitrum, Optimism, Polygon, Solana, NEAR) using connected wallets.
- **Dynamic Network Adapting:** Automatically adapts between Mainnet (`uname-registry.near`) and Testnet (`unam-registry.testnet`) based on environment configuration.
- **Embeddable Modal:** Embed anywhere with a single script tag and `UniversalName.open()`.

## Settings

The defaults point to production NEAR Mainnet and hosted resolver `https://api.unamereg.xyz`. To customize, create `.env.local` in `apps/web`:

| Variable | Default (Mainnet) | Testnet Override | Purpose |
|---|---|---|---|
| `VITE_API_URL` | `https://api.unamereg.xyz` | `http://localhost:8000` | Universal Name Resolver API |
| `VITE_CONTRACT_ID` | `uname-registry.near` | `unam-registry.testnet` | Registry smart contract |
| `VITE_NEAR_NETWORK` | `mainnet` | `testnet` | NEAR network for wallet connections |
| `VITE_NEAR_RPC_URL` | `https://rpc.mainnet.near.org` | `https://rpc.testnet.near.org` | NEAR RPC endpoint |
| `VITE_NAME_SUFFIX` | `.uni` | `.uni` | Universal Name suffix |

Everything here is shipped to the browser, so put no secrets in it.

## Embedding it in another site

Build the single-file version:

```bash
pnpm build:embed
```

This writes `apps/web/dist-embed/universal-name.js`. On the host page:

```html
<script src="universal-name.js"></script>
<script>
  UniversalName.open({ name: "peni" });
</script>
```

`open` options, all optional:

| Option | Meaning |
|---|---|
| `name` | Name to pre-fill on the pay card |
| `start` | `"pay"` (default) or `"names"` |
| `backdrop` | `false` to leave the page behind undimmed |
| `onClose` | Called after the popup closes |
| `apiUrl`, `contractId`, `network`, `rpcUrl`, `suffix` | Override the settings above |

`UniversalName.close()` closes it.

## Other commands

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm typecheck` | Type-checks the web app and the shared package |
| `pnpm test` | Runs the shared package's tests |
| `pnpm build:web` | Builds the demo page into `apps/web/dist` |

## Things to know

- The contract is on NEAR testnet, but routed payments go through NEAR Intents on mainnet with real funds.
- A routed payment address is for one payment only. The pay card gives 20 minutes to send, then asks for new details.
- Bank payout is simulated.
- The resolver keeps payment history in memory, so "Incoming payments" empties when it restarts.
- Claiming goes through the resolver's checkout (`/v1/checkout/*`). The widget shows the price, then offers "Claim without payment (demo)" and checks the contract afterwards. For that to write on-chain, the resolver needs `USE_MOCK_CONTRACT="false"`, `ALLOW_DEMO_ENDPOINTS="true"`, the `near` CLI on its PATH, and `ADMIN_PRIVATE_KEY` set in `resolver-py/.env` to a key the contract accepts as relayer or admin. Without the key the resolver returns an error and the widget shows it.
- "Apply now (admin)" on a waiting destination change uses the resolver's admin endpoint. It is refused if the resolver has `ADMIN_API_TOKEN` set, since the widget does not hold that token.
- Paying for a name is not offered in the widget yet. The resolver rejects payments from other chains, and paying in USDC on NEAR needs the contract to accept that token first.
