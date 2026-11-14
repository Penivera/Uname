<script setup lang="ts">
import {
  CHAINS,
  FINAL_STATUSES,
  chainByKey,
  chainName,
  isValidAddress,
  normalizeName,
  type NameRecord,
  type Payment,
  type Payout,
  type TokenInfo,
} from "@unam/shared";
import QRCode from "qrcode";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import AddressInput from "../components/AddressInput.vue";
import PaymentCard from "../components/PaymentCard.vue";
import { api, type CheckoutChain, type CheckoutSession } from "../lib/api";
import { isMainnet, settings } from "../lib/config";
import { connectEvm, evmAccount, hasEvmWallet, sendEvmPayment, signEvmMessage } from "../lib/evm";
import { nav } from "../lib/nav";
import {
  changeDelayMs,
  connectNear,
  disconnectNear,
  explainError,
  initNear,
  nearAccount,
  payNearFtTransfer,
  registryWrite,
} from "../lib/near";
import { registry } from "../lib/registry";
import { connectSolana, hasSolanaWallet, solanaAccount } from "../lib/solana";
import { getWalletForChain, type ChainWallet } from "../lib/wallets";

const tokens = ref<TokenInfo[]>([]);
const loadError = ref("");

const names = ref<string[]>([]);
const selected = ref("");
const record = ref<NameRecord | null>(null);
const payments = ref<Payment[]>([]);

const busy = ref("");
const error = ref("");
const notice = ref("");

// claim
const newName = ref("");
const targetNearAccount = ref("");
const nameCheck = computed(() => (newName.value ? normalizeName(newName.value, settings.suffix) : null));

const payChains = ref<CheckoutChain[]>([]);
const payChain = ref("near:mainnet");
const payToken = ref("USDC");
const payTokens = computed(() => payChains.value.find((c) => c.chainId === payChain.value)?.tokens ?? []);
const checkout = ref<CheckoutSession | null>(null);
const checkoutQR = ref("");
const checkoutPaying = ref(false);
const checkoutStatus = ref("");
const manualCheckoutTx = ref("");
const copied = ref(false);

/** Outcome of the last claim, checked against the contract rather than the resolver's word. */
const claimOutcome = ref<{ onChain: boolean; ref: string } | null>(null);

// destination form
const destChain = ref("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");
const destToken = ref("USDC");
const destAddress = ref("");
const forceDefault = ref(false);
const payoutType = ref<"crypto" | "bank">("crypto");
const bankProvider = ref("demo-offramp");
const bankReference = ref("ref-001");

const BANK_CHAINS = ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", "eip155:1", "eip155:8453", "eip155:42161", "eip155:10", "eip155:137"];
const BANK_REFERENCES: Record<string, string> = { "demo-offramp": "ref-001", "sphere-sandbox": "prov_ref_demo_001" };
const destChains = computed(() => (payoutType.value === "bank" ? CHAINS.filter((c) => BANK_CHAINS.includes(c.key)) : CHAINS));
const bankKnown = computed(() => BANK_REFERENCES[bankProvider.value] === bankReference.value);

// direct wallet form
const walletChain = ref("eip155:8453");

const destTokens = computed(() =>
  tokens.value.filter((t) => t.chain === destChain.value && (payoutType.value === "crypto" || t.token === "USDC")),
);
const destTokenInfo = computed(() => destTokens.value.find((t) => t.token === destToken.value));
const destAddressOk = computed(() => isValidAddress(destChain.value, destAddress.value));
const evmChains = CHAINS.filter((c) => c.namespace === "eip155");
const symbolOf = (assetId: string) => tokens.value.find((t) => t.assetId === assetId)?.token;
const now = ref(Date.now());
const pendingReady = computed(() => (record.value?.pending ? now.value >= record.value.pending.effective_at_ms : false));

/** The contract's relayer, read on load. With the configured admins, the only accounts that may claim without paying. */
const contractRelayer = ref<string | null>(null);
const canClaimFree = computed(() => {
  const me = nearAccount.value;
  return Boolean(me) && (me === contractRelayer.value || settings.adminAccounts.includes(me!));
});

const checkoutPayWallet = computed<ChainWallet>(() => getWalletForChain(checkout.value?.chain ?? payChain.value));

/**
 * Whether the checkout can be paid at all. NEAR pays the contract directly.
 * Other chains are only payable through a live 1Click deposit address; without
 * one the resolver falls back to a derived address that nothing collects from,
 * so the card shows no address and no pay button.
 */
const checkoutPayable = computed(() => {
  const s = checkout.value;
  if (!s?.chain) return false;
  return s.chain.startsWith("near:") || s.settlementType === "INTENT_ROUTED_CHECKOUT";
});

/** The connected wallet can send the payment itself (NEAR and EVM; Solana is pay-by-address only). */
const checkoutWalletPay = computed(() => {
  const chain = checkout.value?.chain ?? "";
  if (!checkoutPayable.value) return false;
  return chain.startsWith("near:") || (chain.startsWith("eip155:") && checkoutPayWallet.value.hasWallet);
});
const checkoutWalletConnected = computed(() =>
  checkout.value?.chain?.startsWith("near:") ? Boolean(nearAccount.value) : Boolean(checkoutPayWallet.value.account),
);

const screen = nav.current;
let timer: number | undefined;

function manage(n: string) {
  selected.value = n;
  nav.go("name");
}

watch(screen, () => {
  notice.value = "";
  error.value = "";
});

watch(payChain, () => {
  if (!payTokens.value.some((t) => t.symbol === payToken.value)) {
    payToken.value = payTokens.value[0]?.symbol ?? "USDC";
  }
});

watch(payoutType, () => {
  if (!destChains.value.some((c) => c.key === destChain.value)) destChain.value = destChains.value[0]?.key ?? destChain.value;
  if (!destTokens.value.some((t) => t.token === destToken.value)) destToken.value = destTokens.value[0]?.token ?? "";
});

watch(destChain, () => {
  if (!destTokens.value.some((t) => t.token === destToken.value)) {
    destToken.value = destTokens.value.find((t) => t.token === "USDC")?.token ?? destTokens.value[0]?.token ?? "";
  }
});

async function loadNames() {
  if (!nearAccount.value) {
    names.value = [];
    selected.value = "";
    return;
  }
  names.value = await registry.namesOf(nearAccount.value);
  if (!names.value.includes(selected.value)) selected.value = names.value[0] ?? "";
}

async function loadSelected() {
  if (!selected.value) {
    record.value = null;
    payments.value = [];
    return;
  }
  [record.value, payments.value] = await Promise.all([
    registry.getRecord(selected.value, symbolOf),
    api.payments(selected.value).catch(() => []),
  ]);
}

watch(nearAccount, () => {
  if (nearAccount.value) targetNearAccount.value = nearAccount.value;
  void run("", loadNames);
});

watch(selected, () => {
  const p = record.value?.name === selected.value ? record.value.policy : null;
  void run("", async () => {
    await loadSelected();
    const policy = record.value?.policy ?? p;
    if (policy) {
      destChain.value = policy.payout.chain;
      destToken.value = policy.payout.token;
      destAddress.value = policy.payout.address;
      forceDefault.value = policy.force_default;
      payoutType.value = policy.payout.type;
      if (policy.payout.type === "bank") {
        bankProvider.value = policy.payout.provider;
        bankReference.value = policy.payout.reference;
      }
    }
  });
});

async function refreshPayments() {
  try {
    const list = await api.payments(selected.value);
    const open = list.filter((p) => !FINAL_STATUSES.includes(p.status)).slice(0, 5);
    await Promise.all(open.map((p) => api.refresh(p, p.depositAddress)));
    payments.value = open.length ? await api.payments(selected.value) : list;
  } catch {
    /* keep the last list */
  }
}

async function run(label: string, fn: () => Promise<void>, success?: string) {
  if (label) {
    busy.value = label;
    notice.value = "";
  }
  error.value = "";
  try {
    await fn();
    if (success) notice.value = success;
  } catch (err) {
    error.value = explainError(err);
  } finally {
    if (label) busy.value = "";
  }
}

/** Step 1: check the name is free and get the resolver's price for it. */
const claim = () =>
  run("claim", async () => {
    const n = nameCheck.value;
    if (!n?.ok) throw new Error(n ? `Not a valid name: ${n.reason}.` : "Enter a name.");
    const owner = nearAccount.value || targetNearAccount.value.trim();
    if (!owner) throw new Error("Please connect a NEAR wallet or enter a target NEAR account ID.");
    if (await registry.getRecord(n.name)) throw new Error("That name is already taken.");
    claimOutcome.value = null;
    manualCheckoutTx.value = "";
    checkoutStatus.value = "";
    const session = await api.checkoutSession({
      name: n.name,
      owner,
      chain: payChain.value,
      token: payToken.value,
    });
    checkout.value = session;
    if (session.depositAddress) {
      checkoutQR.value = await QRCode.toDataURL(session.depositAddress, { margin: 1, width: 176 });
    }
    nav.go("claim");
  });

/** Pay checkout session directly using connected wallet (NEAR or EVM) */
async function payCheckoutWithWallet() {
  const session = checkout.value;
  if (!session) return;
  checkoutPaying.value = true;
  error.value = "";
  notice.value = "";
  try {
    const chainKey = session.chain ?? payChain.value;
    const wallet = getWalletForChain(chainKey);

    if (chainKey.startsWith("near:")) {
      if (!nearAccount.value) {
        await connectNear();
        if (!nearAccount.value) throw new Error("Connect your NEAR wallet, then press the button again.");
      }
      // Pay via ft_transfer_call on NEAR
      const tokenContract = session.tokenContract;
      if (!tokenContract) throw new Error("Missing NEAR token contract.");
      const txHash = await payNearFtTransfer({
        tokenContract,
        receiverId: settings.contractId,
        amount: session.amount ?? "50000000",
        msg: session.depositMemo ?? JSON.stringify({ name: session.name }),
      });
      // Submit tx to checkout adapter
      await api.submitCheckout(session.checkoutId, txHash).catch(() => {});
      claimOutcome.value = { onChain: true, ref: txHash };
      newName.value = "";
      await loadNames();
    } else if (chainKey.startsWith("eip155:")) {
      // Pay via EVM wallet
      const info = chainByKey(chainKey);
      const evmChainId = info?.evmChainId;
      if (!evmChainId || !session.depositAddress) throw new Error("Missing EVM payment parameters.");

      let fromAccount = wallet.account;
      if (!fromAccount) fromAccount = await wallet.connect();

      const txHash = await sendEvmPayment({
        from: fromAccount,
        to: session.depositAddress,
        chainId: evmChainId,
        amount: String(session.totalBilledUsd),
        decimals: session.tokenDecimals ?? 6,
        contractAddress: session.tokenContract,
      });

      checkoutStatus.value = `Payment sent on ${session.chainName}! Waiting for on-chain settlement...`;
      await api.submitCheckout(session.checkoutId, txHash);
      startPollingCheckout(session.checkoutId, session.name);
    } else {
      throw new Error(`Direct wallet payment not available for ${session.chainName}. Please transfer to the deposit address below.`);
    }
  } catch (err: any) {
    error.value = err?.message ?? "Payment failed.";
  } finally {
    checkoutPaying.value = false;
  }
}

async function submitManualCheckoutTx() {
  const session = checkout.value;
  if (!session || !manualCheckoutTx.value.trim()) return;
  checkoutPaying.value = true;
  error.value = "";
  try {
    await api.submitCheckout(session.checkoutId, manualCheckoutTx.value.trim());
    checkoutStatus.value = "Transaction submitted! Waiting for on-chain confirmation...";
    startPollingCheckout(session.checkoutId, session.name);
  } catch (err: any) {
    error.value = err?.message ?? "Failed to submit transaction.";
  } finally {
    checkoutPaying.value = false;
  }
}

function startPollingCheckout(checkoutId: string, domainName: string) {
  let attempts = 0;
  const interval = window.setInterval(async () => {
    attempts++;
    try {
      const rec = await registry.getRecord(domainName);
      if (rec && rec.owner === (nearAccount.value || targetNearAccount.value.trim())) {
        window.clearInterval(interval);
        claimOutcome.value = { onChain: true, ref: checkoutId };
        newName.value = "";
        await loadNames();
        return;
      }
      const s = await api.getCheckoutSession(checkoutId);
      if (s.status === "COMPLETED" || s.nearTxHash) {
        window.clearInterval(interval);
        claimOutcome.value = { onChain: true, ref: s.nearTxHash ?? checkoutId };
        newName.value = "";
        await loadNames();
        return;
      }
    } catch {
      /* continue polling */
    }
    if (attempts > 30) {
      window.clearInterval(interval);
      checkoutStatus.value = "Settlement is still processing. Check your domains in a moment.";
    }
  }, 4000);
}

/** Demo path for testnet without real tokens */
const completeClaim = () =>
  run("complete", async () => {
    const session = checkout.value;
    const n = normalizeName(session?.name ?? "", settings.suffix);
    if (!session || !n.ok) throw new Error("Start the claim again.");
    const done = await api.checkoutSimulate(session.checkoutId);
    const onChain = (await registry.getRecord(n.name))?.owner === (nearAccount.value || targetNearAccount.value.trim());
    claimOutcome.value = { onChain, ref: done.nearTxHash ?? "" };
    if (onChain) {
      newName.value = "";
      await loadNames();
    }
  });

/**
 * Claims by calling the contract's `claim` from the connected NEAR wallet.
 * The contract allows this without payment only for its admin or relayer
 * account; anyone else is refused.
 */
const claimWithWallet = () =>
  run("complete", async () => {
    const n = normalizeName(checkout.value?.name ?? "", settings.suffix);
    if (!n.ok) throw new Error("Start the claim again.");
    if (!nearAccount.value) throw new Error("Connect the NEAR wallet that should own the name.");
    try {
      await registryWrite.claim(n.name);
    } catch (err) {
      // The deployed contract can lose its panic text and report a bare trap.
      if (/unreachable/i.test(explainError(err))) throw new Error("PAYMENT_REQUIRED");
      throw err;
    }
    const onChain = (await registry.getRecord(n.name))?.owner === nearAccount.value;
    claimOutcome.value = { onChain, ref: "" };
    if (onChain) {
      newName.value = "";
      await loadNames();
    }
  });

const approveNow = () =>
  run("apply", async () => {
    await api.approvePolicy(selected.value);
    await loadSelected();
    if (record.value?.pending) {
      throw new Error("The resolver accepted the request, but the change is still waiting on-chain. It needs the contract admin's key to apply it early.");
    }
  }, "Change applied.");

const saveDestination = () =>
  run(
    "policy",
    async () => {
      const info = destTokenInfo.value;
      if (!info) throw new Error("Pick a token.");
      if (!destAddressOk.value) throw new Error(`That is not a valid ${chainName(destChain.value)} address.`);
      const base = { chain: destChain.value, token: info.token, assetId: info.assetId, address: destAddress.value };
      const payout: Payout =
        payoutType.value === "bank"
          ? { type: "bank", ...base, provider: bankProvider.value, reference: bankReference.value }
          : { type: "crypto", ...base };
      if (payout.type === "bank" && (!payout.provider || !payout.reference)) {
        throw new Error("Bank payout needs a provider and a reference.");
      }
      await registryWrite.setPolicy(selected.value, forceDefault.value, payout);
      await loadSelected();
    },
    changeDelayMs.value === 0
      ? "Destination saved on-chain."
      : "Change queued on-chain. It can be applied once the contract's delay has passed.",
  );

const applyPending = () =>
  run(
    "apply",
    async () => {
      await registryWrite.applyPolicy(selected.value);
      await loadSelected();
    },
    "Change applied.",
  );

const addWallet = () =>
  run(
    "wallet",
    async () => {
      const account = await connectEvm();
      await registryWrite.setRecord(selected.value, walletChain.value, account, record.value?.version ?? 1, (m) =>
        signEvmMessage(account, m),
      );
      await loadSelected();
    },
    "Wallet connected to the name.",
  );

async function copyDepositAddress() {
  if (!checkout.value?.depositAddress) return;
  await navigator.clipboard.writeText(checkout.value.depositAddress);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1500);
}

onMounted(async () => {
  try {
    const [delay, tks, chns] = await Promise.all([
      registry.changeDelayMs(),
      api.tokens().catch(() => []),
      api.checkoutChains().catch(() => []),
    ]);
    changeDelayMs.value = delay;
    tokens.value = tks;
    payChains.value = chns.length ? chns : [
      { chainId: "near:mainnet", chainName: "NEAR Protocol", tokens: [{ symbol: "USDC" }, { symbol: "USDT" }] },
      { chainId: "eip155:8453", chainName: "Base", tokens: [{ symbol: "USDC" }] },
      { chainId: "eip155:42161", chainName: "Arbitrum", tokens: [{ symbol: "USDC" }, { symbol: "USDT" }] },
      { chainId: "eip155:1", chainName: "Ethereum", tokens: [{ symbol: "USDC" }, { symbol: "USDT" }] },
      { chainId: "eip155:10", chainName: "Optimism", tokens: [{ symbol: "USDC" }] },
      { chainId: "eip155:137", chainName: "Polygon", tokens: [{ symbol: "USDC" }, { symbol: "USDT" }] },
      { chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", chainName: "Solana", tokens: [{ symbol: "USDC" }] },
    ];
    registry.relayer().then((r) => (contractRelayer.value = r)).catch(() => {});
    await initNear();
    await loadNames();
    if (!tokens.value.length) loadError.value = `Cannot reach the resolver at ${settings.apiUrl}, so the token list is empty.`;
  } catch (err) {
    loadError.value = (err as Error).message;
  }
  timer = window.setInterval(() => {
    now.value = Date.now();
    if (selected.value && !busy.value) void refreshPayments();
  }, 6000);
});
onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <p v-if="loadError" class="note bad" style="margin: 0 0 12px">{{ loadError }}</p>

  <!-- Card: wallet, owned names, claim -->
  <div v-if="screen === 'names'">
    <p class="lead">Get your own name and choose how you want to be paid.</p>

    <!-- Connected Wallet Status (NEAR or External) -->
    <template v-if="nearAccount">
      <div class="wallet-box active" style="margin-bottom: 14px">
        <div class="wallet-row">
          <div class="wallet-meta">
            <span class="status-dot"></span>
            <div>
              <div class="wallet-label">Signed in as</div>
              <div class="mono wallet-address">{{ nearAccount }}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px">
            <span class="net-badge" :class="settings.network"><span class="net-dot"></span>{{ settings.network }}</span>
            <button type="button" class="btn-text" @click.prevent="disconnectNear">Disconnect</button>
          </div>
        </div>
      </div>

      <h2>Your names</h2>
      <p v-if="!names.length" class="muted">This account owns no names yet.</p>
      <div v-else class="menu" style="margin-top: 0">
        <button v-for="n in names" :key="n" type="button" @click="manage(n)">
          <span>{{ n }}</span><span class="chev">›</span>
        </button>
      </div>
    </template>

    <!-- Multi-chain wallet options if NEAR is not connected -->
    <template v-else>
      <div class="wallet-box" style="margin-bottom: 14px">
        <div class="wallet-row">
          <div class="wallet-meta">
            <span class="status-dot idle"></span>
            <div>
              <div class="wallet-label">Not signed in</div>
              <div class="muted" style="font-size: 12.5px">Connect your NEAR wallet to see and manage your names</div>
            </div>
          </div>
          <button type="button" class="btn small" @click="run('connect', connectNear)">Connect</button>
        </div>
      </div>
    </template>

    <!-- Claim form (Accessible whether connected or registering for an account) -->
    <form style="margin-top: 18px" @submit.prevent="claim">
      <h2>Claim a new name</h2>
      <label for="un-new">Domain Name (3 to 32 characters: a-z, 0-9, and hyphens)</label>
      <input id="un-new" v-model.trim="newName" placeholder="e.g. vitalik" autocomplete="off" autocapitalize="none" />
      <p v-if="nameCheck && !nameCheck.ok" class="muted" style="margin-top: 6px">Not valid: {{ nameCheck.reason }}.</p>

      <div v-if="!nearAccount" style="margin-top: 10px">
        <label for="un-target-owner">Owner NEAR Account ID</label>
        <input
          id="un-target-owner"
          v-model.trim="targetNearAccount"
          placeholder="e.g. alice.near or 64-char implicit account"
          autocomplete="off"
          required
        />
      </div>

      <div class="row" style="margin-top: 10px">
        <div>
          <label for="un-pchain">Pay from chain</label>
          <select id="un-pchain" v-model="payChain">
            <option v-for="c in payChains" :key="c.chainId" :value="c.chainId">{{ c.chainName }}</option>
          </select>
        </div>
        <div>
          <label for="un-ptoken">Token</label>
          <select id="un-ptoken" v-model="payToken">
            <option v-for="t in payTokens" :key="t.symbol" :value="t.symbol">{{ t.symbol }}</option>
          </select>
        </div>
      </div>
      <div class="actions">
        <button
          type="submit"
          class="btn block"
          :disabled="!nameCheck?.ok || !payToken || (!nearAccount && !targetNearAccount.trim()) || busy === 'claim'"
        >
          {{ busy === "claim" ? "Checking availability…" : "See Price & Checkout" }}
        </button>
      </div>
    </form>
  </div>

  <!-- Card: price and multichain checkout completion -->
  <div v-else-if="screen === 'claim'">
    <template v-if="checkout">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
        <h2>{{ checkout.name }}</h2>
        <span class="pill-badge">{{ checkout.chainName }}</span>
      </div>

      <dl class="kv">
        <dt>Owner</dt>
        <dd class="mono">{{ checkout.owner }}</dd>
        <dt>Domain Price</dt>
        <dd>${{ checkout.priceUsd.toFixed(2) }}</dd>
        <template v-if="checkout.slippageBufferUsd">
          <dt>Buffer</dt>
          <dd>${{ checkout.slippageBufferUsd.toFixed(2) }} for cross-chain execution</dd>
        </template>
        <dt>Total Billed</dt>
        <dd><strong>{{ checkout.amountFormatted }}</strong> on {{ checkout.chainName }}</dd>
      </dl>

      <template v-if="!claimOutcome">
        <p v-if="!checkoutPayable" class="note warn">
          Paying from {{ checkout.chainName }} isn't available right now. Go back and choose NEAR to pay.
        </p>

        <!-- One button for every chain the connected wallet can pay from; the wallet that opens depends on the chain. -->
        <div v-if="checkoutWalletPay" class="actions" style="margin-top: 16px">
          <button type="button" class="btn block" :disabled="checkoutPaying" @click="payCheckoutWithWallet">
            {{
              checkoutPaying
                ? "Confirm in your wallet…"
                : checkoutWalletConnected
                  ? `Pay ${checkout.amountFormatted}`
                  : "Connect Wallet and Pay"
            }}
          </button>
        </div>

        <!-- Manual payment / Deposit Address -->
        <template v-if="checkoutPayable && checkout.depositAddress && !checkout.chain?.startsWith('near:')">
          <div style="margin-top: 14px">
            <label>{{ checkoutWalletPay ? "Or send it yourself to this address:" : "Send it to this address:" }}</label>
            <div class="address">
              <span class="mono">{{ checkout.depositAddress }}</span>
              <button type="button" class="btn secondary small" @click="copyDepositAddress">
                {{ copied ? "Copied" : "Copy" }}
              </button>
            </div>
            <p v-if="checkout.depositMemo" class="note warn">Memo (required): <span class="mono">{{ checkout.depositMemo }}</span></p>
            <img v-if="checkoutQR" :src="checkoutQR" class="qr" width="176" height="176" alt="Checkout QR" />
          </div>

          <label for="un-ctx" style="margin-top: 12px">Paid from somewhere else? Paste the transaction hash:</label>
          <div class="row">
            <input id="un-ctx" v-model.trim="manualCheckoutTx" class="mono" placeholder="Tx hash…" autocomplete="off" />
            <button
              type="button"
              class="btn secondary"
              style="flex: 0 0 auto"
              :disabled="!manualCheckoutTx.trim() || checkoutPaying"
              @click="submitManualCheckoutTx"
            >
              Submit
            </button>
          </div>
        </template>

        <!-- Contract admin or relayer: claim without paying -->
        <div v-if="isMainnet && canClaimFree" style="margin-top: 16px; border-top: 1px dashed var(--line); padding-top: 12px">
          <p class="muted" style="margin-bottom: 8px">
            The contract's admin or relayer account can claim without paying. Any other account is refused.
          </p>
          <button type="button" class="btn secondary small block" :disabled="busy === 'complete'" @click="claimWithWallet">
            {{ busy === "complete" ? "Confirm in your wallet…" : "Claim as contract admin (no payment)" }}
          </button>
        </div>

        <!-- Fallback testnet demo button -->
        <div v-if="!isMainnet" style="margin-top: 16px; border-top: 1px dashed var(--line); padding-top: 12px">
          <button type="button" class="btn secondary small block" :disabled="busy === 'complete'" @click="completeClaim">
            {{ busy === "complete" ? "Claiming…" : "Demo Claim without payment (Testnet only)" }}
          </button>
        </div>

        <p v-if="checkoutStatus" class="note ok">{{ checkoutStatus }}</p>
      </template>

      <template v-else-if="claimOutcome.onChain">
        <p class="note ok">Claimed! The contract now lists {{ checkout.name }} under {{ checkout.owner }}.</p>
        <div class="actions">
          <button type="button" class="btn block" @click="manage(checkout.name.replace(settings.suffix, ''))">Manage this name</button>
        </div>
      </template>

      <p v-else class="note bad">
        Not confirmed on-chain yet. If you recently paid, settlement takes 10-30 seconds.
      </p>
    </template>
    <p v-else class="muted">Enter a name on the previous card first.</p>
  </div>

  <!-- Card: one name -->
  <div v-else-if="screen === 'name'">
    <template v-if="selected && record">
      <h2>{{ selected }}</h2>
      <dl class="kv">
        <dt>You receive</dt>
        <dd v-if="record.policy">
          {{ record.policy.payout.token }} on {{ chainName(record.policy.payout.chain) }}
          <span v-if="record.policy.payout.type === 'bank'"> → bank (simulated)</span>
        </dd>
        <dd v-else class="muted">Not set</dd>
        <dt>Direct wallets</dt>
        <dd>{{ Object.keys(record.records).length || "None" }}</dd>
      </dl>
      <p v-if="record.pending" class="note warn">A destination change is waiting to be applied.</p>
      <div class="menu">
        <button type="button" @click="nav.go('destination')">
          <span>What you receive<small>Token, chain and address for routed payments</small></span><span class="chev">›</span>
        </button>
        <button type="button" @click="nav.go('wallets')">
          <span>Direct wallets<small>Get paid as-is on chains where you have a wallet</small></span><span class="chev">›</span>
        </button>
        <button type="button" @click="nav.go('payments')">
          <span>Incoming payments<small>{{ payments.length }} tracked</small></span><span class="chev">›</span>
        </button>
      </div>
    </template>
    <p v-else-if="selected" class="note warn" style="margin-top: 0">The contract returned no record for “{{ selected }}”.</p>
    <p v-else class="muted">Pick a name first.</p>
  </div>

  <!-- Card: routed destination -->
  <div v-else-if="screen === 'destination'">
    <template v-if="selected && record">
      <dl v-if="record.policy" class="kv">
        <dt>Current</dt>
        <dd>
          {{ record.policy.payout.token }} on {{ chainName(record.policy.payout.chain) }}
          <span v-if="record.policy.payout.type === 'bank'">, then simulated bank payout via {{ record.policy.payout.provider }}</span>
        </dd>
        <dt>Address</dt>
        <dd class="mono">{{ record.policy.payout.address }}</dd>
        <dt>Route all</dt>
        <dd>{{ record.policy.force_default ? "Yes" : "No, direct wallets are paid as-is" }}</dd>
      </dl>
      <p v-else class="muted">No destination yet. Without one, only chains with a direct wallet can pay {{ selected }}.</p>

      <div v-if="record.pending" class="note warn">
        Waiting:
        {{ record.pending.policy ? `${record.pending.policy.payout.token} on ${chainName(record.pending.policy.payout.chain)}` : "clear the destination" }}.
        <template v-if="pendingReady">
          It can be applied now.
          <button type="button" class="btn small" style="margin-left: 6px" :disabled="busy === 'apply'" @click="applyPending">Apply</button>
        </template>
        <template v-else>
          Ready at {{ new Date(record.pending.effective_at_ms).toLocaleString() }}.
          <button type="button" class="btn secondary small" style="margin-left: 6px" :disabled="busy === 'apply'" @click="approveNow">
            Apply now (admin)
          </button>
        </template>
      </div>
      <p v-else-if="changeDelayMs" class="muted" style="margin-top: 10px">
        Changes take effect {{ Math.round(changeDelayMs / 60000) }} minutes after saving, then need applying.
      </p>

      <form @submit.prevent="saveDestination">
        <div class="row">
          <div>
            <label for="un-dchain">Receive on</label>
            <select id="un-dchain" v-model="destChain">
              <option v-for="c in destChains" :key="c.key" :value="c.key">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label for="un-dtoken">Token</label>
            <select id="un-dtoken" v-model="destToken">
              <option v-for="t in destTokens" :key="t.assetId" :value="t.token">{{ t.token }}</option>
            </select>
          </div>
        </div>

        <label for="un-ptype">Payout</label>
        <select id="un-ptype" v-model="payoutType">
          <option value="crypto">To my wallet</option>
          <option value="bank">To my bank (simulated)</option>
        </select>

        <label for="un-daddr">
          {{ payoutType === "bank" ? "Provider's deposit address (stands in for a real off-ramp)" : "Your address" }}
          on {{ chainName(destChain) }}
        </label>
        <AddressInput id="un-daddr" v-model="destAddress" :chain="destChain" :wallet="payoutType === 'crypto'" />
        <p v-if="destAddress && !destAddressOk" class="muted" style="margin-top: 6px">Not a valid {{ chainName(destChain) }} address.</p>

        <div v-if="payoutType === 'bank'" class="row">
          <div>
            <label for="un-prov">Provider ID</label>
            <input id="un-prov" v-model.trim="bankProvider" autocomplete="off" />
          </div>
          <div>
            <label for="un-pref">Reference (no bank details)</label>
            <input id="un-pref" v-model.trim="bankReference" placeholder="ref-001" autocomplete="off" />
          </div>
        </div>

        <p v-if="payoutType === 'bank' && !bankKnown" class="muted" style="margin-top: 6px">
          The demo off-ramp only recognises provider <span class="mono">demo-offramp</span> with reference
          <span class="mono">ref-001</span>. With anything else, payments arrive as USDC at the address above and no bank
          payout is simulated.
        </p>

        <label><input v-model="forceDefault" type="checkbox" />Route every payment here, even where I have a direct wallet</label>

        <div class="actions">
          <button type="submit" class="btn block" :disabled="!destAddressOk || !destTokenInfo || busy === 'policy'">
            {{ busy === "policy" ? "Confirm in your wallet…" : "Save destination" }}
          </button>
        </div>
      </form>
    </template>
    <p v-else class="muted">Pick a name first.</p>
  </div>

  <!-- Card: direct wallets -->
  <div v-else-if="screen === 'wallets'">
    <template v-if="selected && record">
      <p class="lead">A connected wallet is paid directly on its chain, with no conversion.</p>
      <ul class="plain">
        <li v-for="(addr, key) in record.records" :key="key">
          {{ chainName(String(key)) }}<br /><span class="mono">{{ addr }}</span>
        </li>
        <li v-if="!Object.keys(record.records).length" class="muted">None connected.</li>
      </ul>
      <label for="un-wchain">Add an EVM wallet on</label>
      <select id="un-wchain" v-model="walletChain">
        <option v-for="c in evmChains" :key="c.key" :value="c.key">{{ c.name }}</option>
      </select>
      <div class="actions">
        <button type="button" class="btn block" :disabled="!hasEvmWallet() || busy === 'wallet'" @click="addWallet">
          {{ busy === "wallet" ? "Sign, then confirm…" : "Connect and sign" }}
        </button>
      </div>
      <p v-if="!hasEvmWallet()" class="muted" style="margin-top: 8px">No EVM wallet found in this browser.</p>
    </template>
    <p v-else class="muted">Pick a name first.</p>
  </div>

  <!-- Card: incoming payments -->
  <div v-else-if="screen === 'payments'">
    <p v-if="!selected" class="muted">Pick a name first.</p>
    <p v-else-if="!payments.length" class="muted">
      No routed payments tracked for {{ selected }}. Direct payments go straight to your wallet and are not listed, and
      the resolver forgets this list when it restarts.
    </p>
    <ul v-else class="plain">
      <li v-for="p in payments" :key="p.id"><PaymentCard :payment="p" compact /></li>
    </ul>
  </div>

  <p v-if="error" class="note bad">{{ error }}</p>
  <p v-if="notice" class="note ok">{{ notice }}</p>
</template>
