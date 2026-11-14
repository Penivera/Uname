<script setup lang="ts">
import {
  CHAINS,
  FINAL_STATUSES,
  chainByKey,
  isValidAddress,
  normalizeName,
  parseUnits,
  type Payment,
  type ResolveResponse,
  type TokenInfo,
} from "@unam/shared";
import QRCode from "qrcode";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import AddressInput from "../components/AddressInput.vue";
import PaymentCard from "../components/PaymentCard.vue";
import { api } from "../lib/api";
import { settings, isMainnet } from "../lib/config";
import { sendEvmPayment } from "../lib/evm";
import { nav } from "../lib/nav";
import { payNearFtTransfer } from "../lib/near";
import { getWalletForChain, type ChainWallet } from "../lib/wallets";

const props = defineProps<{ initialName: string }>();

const name = ref(props.initialName);
const chain = ref("eip155:8453");
const token = ref("USDC");
const amount = ref("");
const refundAddress = ref("");
const showManualRefund = ref(false);

const tokens = ref<TokenInfo[]>([]);
const loadError = ref("");

const busy = ref(false);
const connectingWallet = ref(false);
const error = ref("");
const result = ref<ResolveResponse | null>(null);
const qr = ref("");
const copied = ref(false);

const sending = ref(false);
const manualTx = ref("");
const payment = ref<Payment | null>(null);

const now = ref(Date.now());
let clock: number | undefined;
let poll: number | undefined;

const screen = nav.current;
const chainInfo = computed(() => chainByKey(chain.value));
const chainTokens = computed(() => tokens.value.filter((t) => t.chain === chain.value));
const tokenInfo = computed(() => chainTokens.value.find((t) => t.token === token.value));

const currentWallet = computed<ChainWallet>(() => getWalletForChain(chain.value));
const isEvm = computed(() => chainInfo.value?.namespace === "eip155");
const isNear = computed(() => chainInfo.value?.namespace === "near");

const ok = computed(() => (result.value?.ok ? result.value : null));
const failed = computed(() => (result.value && !result.value.ok ? result.value : null));

const secondsLeft = computed(() => {
  const at = ok.value?.expiresAt;
  if (!at) return null;
  return Math.max(0, Math.floor((Date.parse(at) - now.value) / 1000));
});
const expired = computed(() => secondsLeft.value === 0 && !payment.value?.txHash);
const countdown = computed(() => {
  const s = secondsLeft.value ?? 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
});
const done = computed(() => (payment.value ? FINAL_STATUSES.includes(payment.value.status) : false));
const refundOk = computed(() => isValidAddress(chain.value, refundAddress.value));
const canSend = computed(() => Boolean(ok.value?.address) && !expired.value && !payment.value?.txHash);
const tracked = computed(() => Boolean(payment.value && (payment.value.txHash || payment.value.status !== "PENDING_DEPOSIT")));

// Synchronize refundAddress with the connected wallet for the active chain
function syncRefundAddress() {
  if (currentWallet.value.account) {
    refundAddress.value = currentWallet.value.account;
  } else if (!showManualRefund.value) {
    refundAddress.value = "";
  }
}

watch(chain, () => {
  if (!chainTokens.value.some((t) => t.token === token.value)) {
    token.value = chainTokens.value.find((t) => t.token === "USDC")?.token ?? chainTokens.value[0]?.token ?? "";
  }
  syncRefundAddress();
  reset();
});

watch(() => currentWallet.value.account, () => {
  syncRefundAddress();
});

watch([name, token, amount, refundAddress], reset);

async function connectCurrentWallet() {
  connectingWallet.value = true;
  error.value = "";
  try {
    const acc = await currentWallet.value.connect();
    if (acc) {
      refundAddress.value = acc;
    }
  } catch (err: any) {
    error.value = err?.message ?? "Wallet connection failed.";
  } finally {
    connectingWallet.value = false;
  }
}

async function disconnectCurrentWallet() {
  await currentWallet.value.disconnect();
  refundAddress.value = "";
}

/** Clears the last answer. The cards that showed it are no longer reachable. */
function reset() {
  result.value = null;
  payment.value = null;
  error.value = "";
  qr.value = "";
  manualTx.value = "";
  stopPolling();
  if (screen.value === "pay") nav.dropForward();
}

function stopPolling() {
  if (poll) window.clearInterval(poll);
  poll = undefined;
}

function startPolling() {
  stopPolling();
  const tick = async () => {
    const r = ok.value;
    if (!payment.value || !r?.address) return;
    try {
      payment.value = await api.refresh(payment.value, r.address, r.memo);
      if (FINAL_STATUSES.includes(payment.value.status)) stopPolling();
    } catch {
      /* keep trying */
    }
  };
  poll = window.setInterval(tick, 5000);
}

/** Records the deposit transaction, tells the resolver, and moves to the status card. */
async function recordDeposit(txHash: string) {
  const r = ok.value;
  if (!payment.value || !r?.address) return;
  payment.value = { ...payment.value, txHash, status: "KNOWN_DEPOSIT_TX" };
  nav.go("pay-status");
  await api.reportDeposit(r.address, txHash, r.memo);
}

async function createPayment() {
  const onDetails = screen.value === "pay-details";
  result.value = null;
  payment.value = null;
  error.value = "";
  qr.value = "";
  manualTx.value = "";
  stopPolling();
  busy.value = true;
  try {
    const info = tokenInfo.value;
    if (!info) throw new Error("Pick a payment token.");
    if (!refundAddress.value) throw new Error("Connect your wallet or provide a refund address.");

    const normalized = normalizeName(name.value, settings.suffix);
    if (!normalized.ok) throw new Error(`Invalid recipient name: ${normalized.reason}`);

    const r = await api.resolve({
      name: normalized.name,
      chain: chain.value,
      token: info,
      amount: amount.value,
      refundAddress: refundAddress.value,
    });
    result.value = r;
    if (r.ok && r.address) {
      qr.value = await QRCode.toDataURL(r.address, { margin: 1, width: 176 });
      if (r.mode === "routed" && r.expiresAt) {
        const at = new Date().toISOString();
        payment.value = {
          id: r.address,
          name: r.name,
          status: "PENDING_DEPOSIT",
          originChain: r.chain,
          originToken: r.token,
          amountIn: r.amountIn,
          destChain: r.destination.chain,
          destToken: r.destination.token,
          payoutType: r.destination.type === "bank" ? "bank" : "crypto",
          estReceive: r.estReceive.amount,
          expiresAt: r.expiresAt,
          createdAt: at,
          updatedAt: at,
        };
        startPolling();
      }
    }
    if (!onDetails) nav.go("pay-details");
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function copyAddress() {
  if (!ok.value?.address) return;
  await navigator.clipboard.writeText(ok.value.address);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1500);
}

async function payWithEvmWallet() {
  const r = ok.value;
  const info = tokenInfo.value;
  const evmChainId = chainInfo.value?.evmChainId;
  if (!r?.address || !evmChainId) return;
  if (!canSend.value) return; // never send to an expired address
  error.value = "";
  sending.value = true;
  try {
    let fromAccount = currentWallet.value.account;
    if (!fromAccount) fromAccount = await currentWallet.value.connect();
    if (!info) throw new Error("This token is not in the routing list, so send it from your wallet app instead.");
    const txHash = await sendEvmPayment({
      from: fromAccount,
      to: r.address,
      chainId: evmChainId,
      amount: r.amountIn,
      decimals: info.decimals,
      contractAddress: info.contractAddress,
    });
    manualTx.value = txHash;
    await recordDeposit(txHash);
  } catch (err) {
    error.value = (err as { message?: string }).message ?? "The wallet rejected the transaction.";
  } finally {
    sending.value = false;
  }
}

async function payWithNearWallet() {
  const r = ok.value;
  const info = tokenInfo.value;
  if (!r?.address) return;
  if (!canSend.value) return;
  error.value = "";
  sending.value = true;
  try {
    if (!currentWallet.value.account) await currentWallet.value.connect();
    const tokenContract = info?.contractAddress;
    if (!tokenContract) throw new Error("Missing NEAR token contract.");
    const baseAmount = parseUnits(r.amountIn, info?.decimals ?? 6).toString();
    const txHash = await payNearFtTransfer({
      tokenContract,
      receiverId: r.address,
      amount: baseAmount,
      msg: r.memo ?? "",
    });
    manualTx.value = txHash;
    await recordDeposit(txHash);
  } catch (err: any) {
    error.value = err?.message ?? "NEAR transaction was rejected or failed.";
  } finally {
    sending.value = false;
  }
}

async function reportManual() {
  if (!manualTx.value.trim()) return;
  error.value = "";
  try {
    await recordDeposit(manualTx.value.trim());
  } catch (err) {
    error.value = (err as Error).message;
  }
}

onMounted(async () => {
  clock = window.setInterval(() => (now.value = Date.now()), 1000);
  try {
    tokens.value = await api.tokens();
    syncRefundAddress();
  } catch (err) {
    loadError.value = (err as Error).message;
  }
});
onUnmounted(() => {
  if (clock) window.clearInterval(clock);
  stopPolling();
});
</script>

<template>
  <!-- Card 1: Payment Portal Flow -->
  <form v-if="screen === 'pay'" @submit.prevent="createPayment">
    <p class="lead">
      Universal Name Payment Portal: enter any <strong>.uni</strong> recipient to route and execute your payment automatically.
    </p>
    <p v-if="loadError" class="note bad">{{ loadError }}</p>

    <label for="un-name">Recipient (.uni name)</label>
    <input
      id="un-name"
      v-model.trim="name"
      placeholder="e.g. alice.uni or peni"
      autocomplete="off"
      autocapitalize="none"
      required
    />

    <div class="row">
      <div>
        <label for="un-chain">Pay from chain</label>
        <select id="un-chain" v-model="chain">
          <option v-for="c in CHAINS" :key="c.key" :value="c.key">{{ c.name }}</option>
        </select>
      </div>
      <div>
        <label for="un-token">Token</label>
        <select id="un-token" v-model="token">
          <option v-for="t in chainTokens" :key="t.assetId" :value="t.token">{{ t.token }}</option>
        </select>
      </div>
    </div>

    <label for="un-amount">Amount</label>
    <input id="un-amount" v-model.trim="amount" inputmode="decimal" placeholder="10.00" required />

    <!-- Seamless Refund / Sender Wallet: auto-bound from connected wallet -->
    <div v-if="currentWallet.account" class="wallet-box active">
      <div class="wallet-row">
        <div class="wallet-meta">
          <span class="status-dot"></span>
          <div>
            <div class="wallet-label">Connected Wallet (Sender & Refund)</div>
            <div class="mono wallet-address">{{ currentWallet.account }}</div>
          </div>
        </div>
        <button type="button" class="btn-text" @click="disconnectCurrentWallet">Change</button>
      </div>
    </div>
    <div v-else class="wallet-box">
      <div class="wallet-row">
        <div class="wallet-meta">
          <span class="status-dot idle"></span>
          <div>
            <div class="wallet-label">Sender & Refund Wallet</div>
            <div class="muted" style="font-size: 12px">Connect to pay & receive refunds automatically</div>
          </div>
        </div>
        <button type="button" class="btn secondary small" :disabled="connectingWallet" @click="connectCurrentWallet">
          {{ connectingWallet ? "Connecting…" : "Connect Wallet" }}
        </button>
      </div>
    </div>

    <div style="margin-top: 6px">
      <a
        href="#"
        class="muted"
        style="font-size: 12px; text-decoration: underline"
        @click.prevent="showManualRefund = !showManualRefund"
      >
        {{ showManualRefund ? "Hide custom refund address" : "Or specify custom refund address" }}
      </a>
      <div v-if="showManualRefund" style="margin-top: 8px">
        <AddressInput
          id="un-refund"
          v-model="refundAddress"
          :chain="chain"
          placeholder="Your refund address on this chain"
        />
        <p v-if="refundAddress && !refundOk" class="muted" style="margin-top: 4px; font-size: 12px">
          Not a valid {{ chainInfo?.name }} address.
        </p>
      </div>
    </div>

    <div class="actions">
      <button
        v-if="!currentWallet.account && !refundAddress"
        type="button"
        class="btn block"
        :disabled="connectingWallet"
        @click="connectCurrentWallet"
      >
        {{ connectingWallet ? "Connecting…" : `Connect ${currentWallet.chainName} Wallet` }}
      </button>
      <button
        v-else
        type="submit"
        class="btn block"
        :disabled="busy || !name || !amount || !refundOk || !tokenInfo"
      >
        {{ busy ? "Calculating Route…" : "Create Payment" }}
      </button>
    </div>
    <p v-if="error" class="note bad">{{ error }}</p>
  </form>

  <!-- Card 2: Transaction Details & Send -->
  <div v-else-if="screen === 'pay-details'">
    <template v-if="failed">
      <h2>
        <template v-if="failed.error === 'NAME_NOT_FOUND'">Name not found</template>
        <template v-else-if="failed.error === 'NO_RECORD'">Can't be paid on {{ chainInfo?.name }}</template>
        <template v-else-if="failed.error === 'NO_ROUTE'">No route for this payment</template>
        <template v-else-if="failed.error === 'AMOUNT_TOO_LOW'">Amount too low</template>
        <template v-else>Can't get payment details</template>
      </h2>
      <p class="note bad" style="margin-top: 0">{{ failed.message }}</p>
      <template v-if="failed.supported?.length">
        <p class="muted" style="margin: 12px 0 6px">What works instead:</p>
        <p>
          <span v-for="s in failed.supported.slice(0, 30)" :key="s.chain + s.token" class="badge" style="margin: 0 6px 6px 0">
            {{ s.token === "any" ? `any token on ${s.chainName}` : `${s.token} on ${s.chainName}` }}
          </span>
        </p>
      </template>
      <div class="actions">
        <button type="button" class="btn secondary" @click="nav.back()">Change details</button>
      </div>
    </template>

    <template v-else-if="ok">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
        <span class="badge" :class="ok.mode === 'direct' ? 'ok' : ''">
          {{ ok.mode === "direct" ? "Direct Wallet Settlement" : "Intent-Routed Settlement" }}
        </span>
        <span class="pill-badge">{{ chainInfo?.name }}</span>
      </div>

      <dl class="kv">
        <dt>Recipient</dt>
        <dd><strong>{{ ok.name }}</strong></dd>
        <dt>You Send</dt>
        <dd><strong>{{ ok.amountIn }} {{ ok.token }}</strong> on {{ chainInfo?.name }}</dd>
        <dt>Recipient Gets</dt>
        <dd>
          about {{ ok.estReceive.amount }} {{ ok.estReceive.token }} on {{ ok.destination.chainName }}
          <span v-if="ok.minReceive" class="muted">(min {{ ok.minReceive }})</span>
        </dd>
        <template v-if="ok.destination.type === 'bank'">
          <dt>Destination</dt>
          <dd>Bank payout via {{ ok.destination.provider }} (simulated)</dd>
        </template>
        <template v-else-if="ok.destination.address && ok.mode === 'routed'">
          <dt>Destination</dt>
          <dd class="mono">{{ ok.destination.address }}</dd>
        </template>
        <template v-if="ok.timeEstimateSec">
          <dt>Est. Settlement</dt>
          <dd>~{{ ok.timeEstimateSec }}s after deposit confirmation</dd>
        </template>
      </dl>

      <template v-if="ok.address && !expired">
        <div class="address">
          <span class="mono">{{ ok.address }}</span>
          <button type="button" class="btn secondary small" @click="copyAddress">{{ copied ? "Copied" : "Copy" }}</button>
        </div>
        <p v-if="ok.memo" class="note warn">Memo (required): <span class="mono">{{ ok.memo }}</span></p>
        <img v-if="qr" :src="qr" class="qr" width="176" height="176" alt="QR code of the payment address" />
        <p v-if="secondsLeft !== null && !payment?.txHash" class="note warn">
          Quote expires in {{ countdown }}. Execute before expiration.
        </p>
      </template>
      <p v-else-if="expired" class="note bad">This payment quote has expired. Create a new transaction.</p>

      <ul class="hints">
        <li v-for="w in ok.warnings" :key="w">{{ w }}</li>
      </ul>

      <div v-if="ok.address" class="actions">
        <button v-if="expired" type="button" class="btn block" :disabled="busy" @click="createPayment">
          {{ busy ? "Checking…" : "Get new quote" }}
        </button>
        <!-- EVM 1-click execution -->
        <button
          v-else-if="isEvm && currentWallet.hasWallet"
          type="button"
          class="btn block"
          :disabled="!canSend || sending"
          @click="payWithEvmWallet"
        >
          {{ sending ? "Confirm in wallet…" : `Pay ${ok.amountIn} ${ok.token} with ${chainInfo?.name} Wallet` }}
        </button>
        <!-- NEAR 1-click execution -->
        <button
          v-else-if="isNear && currentWallet.hasWallet"
          type="button"
          class="btn block"
          :disabled="!canSend || sending"
          @click="payWithNearWallet"
        >
          {{ sending ? "Confirm in NEAR wallet…" : `Pay ${ok.amountIn} ${ok.token} with NEAR Wallet` }}
        </button>
        <button
          v-if="tracked"
          type="button"
          class="btn secondary block"
          @click="nav.go('pay-status')"
        >
          View payment status
        </button>
      </div>

      <template v-if="payment && !payment.txHash && !expired">
        <label for="un-tx">Paid from external wallet? Submit transaction hash</label>
        <div class="row">
          <input id="un-tx" v-model.trim="manualTx" class="mono" placeholder="0x… or NEAR tx hash" autocomplete="off" />
          <button type="button" class="btn secondary" style="flex: 0 0 auto" :disabled="!manualTx" @click="reportManual">Submit</button>
        </div>
      </template>
      <p v-if="error" class="note bad">{{ error }}</p>
    </template>

    <p v-else class="muted">{{ busy ? "Calculating route…" : "No payment details yet." }}</p>
  </div>

  <!-- Card 3: Track Payment Status -->
  <div v-else-if="screen === 'pay-status'">
    <template v-if="payment">
      <PaymentCard :payment="payment" />
      <p v-if="!done" class="muted" style="margin-top: 12px">
        Checking live status. You can navigate away or close the portal; the payment will settle automatically.
      </p>
      <div v-else class="actions">
        <button type="button" class="btn secondary" @click="amount = ''; nav.go('pay')">Make another payment</button>
      </div>
    </template>
    <p v-else class="muted">No payment in progress.</p>
  </div>
</template>
