/**
 * Injected Solana wallet (Phantom, Solflare, etc.) helper.
 */
import { ref } from "vue";

export const solanaAccount = ref<string | null>(null);

export function hasSolanaWallet(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.solana || w.phantom?.solana);
}

function solanaProvider(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.phantom?.solana || w.solana || null;
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
