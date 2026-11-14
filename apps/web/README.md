# Universal Name web widget

The pay and "my names" screens for Universal Name, built as a popup that can be embedded in any page.

By default it uses the mainnet deployment: the registry contract `uname-registry.near`, read directly from NEAR, and the hosted resolver at `https://api.unamereg.xyz` for token lists, payment details and payment status. Nothing else needs to be running.

## Run it

You need Node 22 and [pnpm](https://pnpm.io) 9. From the repository root:

```bash
pnpm install
pnpm dev:web
```

Open the address Vite prints (http://localhost:5173 unless that port is taken). The page is a stand-in for a host site, with the popup open on top of it.

- `?name=peni` pre-fills the name on the pay card.
- `?start=names` opens on the owner's cards.

This is mainnet: connecting a wallet uses your real NEAR account, and a routed payment moves real funds.

## Settings

To change the defaults, copy `.env.example` to `.env.local` in `apps/web`:

| Variable | Default | What it is |
|---|---|---|
| `VITE_API_URL` | `https://api.unamereg.xyz` | The resolver |
| `VITE_CONTRACT_ID` | `uname-registry.near` | Registry contract |
| `VITE_NEAR_NETWORK` | `mainnet` | NEAR network for the owner's wallet |
| `VITE_NEAR_RPC_URL` | `https://rpc.mainnet.near.org` | NEAR RPC used to read the contract |
| `VITE_NAME_SUFFIX` | `.uni` | Suffix stripped from names |

Everything here is shipped to the browser, so put no secrets in it.

## Running against testnet with a local resolver

Use the testnet values from `.env.example`, then start the resolver. It needs [uv](https://docs.astral.sh/uv/), which installs Python 3.13 for you:

```bash
cd resolver-py
cp .env.example .env
uv sync
uv run python main.py
```

It serves on http://localhost:8000 and reads the testnet contract `unam-registry.testnet`. To try the screens with built-in sample names (`peni`, `demo`, `routed`, `bank`), set `USE_MOCK_CONTRACT="true"` in `resolver-py/.env` and restart it. Do not send real funds to the sample names: their addresses are examples, not wallets anyone on the team controls.

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

- The contract and routed payments (NEAR Intents) are both on mainnet, so payments use real funds.
- A routed payment address is for one payment only. The pay card gives 20 minutes to send, then asks for new details.
- Bank payout is simulated.
- The resolver keeps payment history in memory, so "Incoming payments" empties when it restarts.
- Destination changes take effect one hour after saving, then need applying. "Apply now (admin)" asks the resolver to skip the wait; a mainnet resolver refuses that.
- Claiming a name does not work from the widget on mainnet. Its claim button is a no-payment demo that the resolver only allows on testnet (with `ALLOW_DEMO_ENDPOINTS="true"` and `ADMIN_PRIVATE_KEY` set). Paying for a name from a NEAR wallet is not built into the widget yet.
