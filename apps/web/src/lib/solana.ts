/**
 * Injected Solana wallet (Phantom, Solflare, etc.) helper.
 */
import { ref } from "vue";

export const solanaAccount = ref<string | null>(null);

/**
 * The injected provider of the first Solana wallet found. Phantom, Solflare and
 * Backpack each inject their own object; several others also set `window.solana`.
 */
function solanaProvider(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.phantom?.solana ?? w.solflare ?? w.backpack ?? w.solana ?? null;
}

export function hasSolanaWallet(): boolean {
  return Boolean(solanaProvider());
}

export async function connectSolana(): Promise<string> {
  const p = solanaProvider();
  if (!p) {
    throw new Error("No Solana wallet found. Please install Phantom or Solflare.");
  }
  const res = await p.connect();
  const pubkey = res?.publicKey?.toString() || p.publicKey?.toString();
  if (!pubkey) {
    throw new Error("Solana wallet did not return a public key.");
  }
  solanaAccount.value = pubkey;
  return pubkey;
}

export async function disconnectSolana(): Promise<void> {
  const p = solanaProvider();
  if (p && typeof p.disconnect === "function") {
    try {
      await p.disconnect();
    } catch {
      /* ignore */
    }
  }
  solanaAccount.value = null;
}
