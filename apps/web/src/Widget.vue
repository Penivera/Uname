<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { isMainnet, settings } from "./lib/config";
import { isPayFlow, nav, type Screen } from "./lib/nav";
import OwnerView from "./views/OwnerView.vue";
import PayView from "./views/PayView.vue";

defineProps<{ initialName: string; backdrop: boolean }>();
const emit = defineEmits<{ close: [] }>();

const TITLES: Record<Screen, string> = {
  pay: "Pay a name",
  "pay-details": "Confirm & Send",
  "pay-status": "Payment Status",
  names: "My names",
  claim: "Claim & Register",
  name: "Manage Domain",
  destination: "Payout Settings",
  wallets: "Direct Wallets",
  payments: "Incoming Payments",
};
const title = computed(() => TITLES[nav.current.value]);

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="scrim" :class="{ clear: !backdrop }"></div>
  <section class="popup" role="dialog" aria-modal="true" :aria-label="title">
    <header class="bar">
      <button class="icon" type="button" aria-label="Back" :disabled="!nav.canBack.value" @click="nav.back()">‹</button>
      <button class="icon" type="button" aria-label="Forward" :disabled="!nav.canForward.value" @click="nav.forward()">›</button>
      <div class="title-group">
        <span class="title">{{ title }}</span>
        <span class="net-badge" :class="settings.network">
          <span class="net-dot"></span>
          {{ settings.network }}
        </span>
      </div>
      <button class="switch" type="button" @click="nav.go(isPayFlow ? 'names' : 'pay')">
        {{ isPayFlow ? "My names" : "Pay" }}
      </button>
      <button class="icon" type="button" aria-label="Close" @click="emit('close')">×</button>
    </header>
    <div class="body">
      <!-- Both flows stay mounted so going back and forward keeps what was entered. -->
      <PayView v-show="isPayFlow" :initial-name="initialName" />
      <OwnerView v-show="!isPayFlow" />
    </div>
    <footer class="foot">
      <span>Contract: <strong class="mono">{{ settings.contractId }}</strong></span>
      <span> · Network: <strong :style="{ color: isMainnet ? 'var(--ok)' : 'var(--warn)' }">{{ settings.network.toUpperCase() }}</strong></span>
      <span> · Universal Name (.uni)</span>
    </footer>
  </section>
</template>
