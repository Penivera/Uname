/**
 * Unified multi-chain wallet manager for the Universal Name app.
 * Dynamically binds EVM, NEAR, and Solana wallets to their respective chains.
 */
import { chainByKey, namespaceOf, type Namespace } from "@unam/shared";
import { computed } from "vue";
import { connectEvm, disconnectEvm, evmAccount, hasEvmWallet } from "./evm";
import { connectNear, disconnectNear, nearAccount } from "./near";
import { connectSolana, disconnectSolana, hasSolanaWallet, solanaAccount } from "./solana";

export interface ChainWallet {
  namespace: Namespace | "unknown";
  chainName: string;
  account: string | null;
  hasWallet: boolean;
  walletName: string;
  connect: () => Promise<string>;
  disconnect: () => Promise<void> | void;
}

export function getWalletForChain(chainKey: string): ChainWallet {
  const info = chainByKey(chainKey);
  const ns = namespaceOf(chainKey) ?? "unknown";
  const name = info?.name ?? chainKey;

  if (ns === "eip155") {
    return {
      namespace: "eip155",
      chainName: name,
      account: evmAccount.value,
      hasWallet: hasEvmWallet(),
      walletName: "EVM Wallet (MetaMask, Rabby, Coinbase)",
      connect: connectEvm,
      disconnect: disconnectEvm,
    };
  }
  if (ns === "near") {
    return {
      namespace: "near",
      chainName: name,
      account: nearAccount.value,
      hasWallet: true,
      walletName: "NEAR Wallet (Meteor, HERE, MyNearWallet)",
      connect: async () => {
        await connectNear();
        return nearAccount.value ?? "";
      },
      disconnect: disconnectNear,
    };
  }
  if (ns === "solana") {
    return {
      namespace: "solana",
      chainName: name,
      account: solanaAccount.value,
      hasWallet: hasSolanaWallet(),
      walletName: "Solana Wallet (Phantom, Solflare)",
      connect: connectSolana,
      disconnect: disconnectSolana,
    };
  }

  return {
    namespace: "unknown",
    chainName: name,
    account: null,
    hasWallet: false,
    walletName: "External Wallet",
    connect: async () => {
      throw new Error(`Injected wallet is not supported for ${name}.`);
    },
    disconnect: () => {},
  };
}

export function useWalletForChain(chainKeyRef: { value: string }) {
  return computed(() => getWalletForChain(chainKeyRef.value));
}
