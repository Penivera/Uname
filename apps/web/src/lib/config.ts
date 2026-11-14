/** Public settings: Vite env defaults, overridable by the embedding page. */
import { computed } from "vue";

const env = import.meta.env;

export type NearNetwork = "testnet" | "mainnet";

export interface Settings {
  /** Resolver API base URL. */
  apiUrl: string;
  /** Registry contract account. */
  contractId: string;
  network: NearNetwork;
  rpcUrl: string;
  suffix: string;
}

const network: NearNetwork = env.VITE_NEAR_NETWORK === "testnet" ? "testnet" : "mainnet";
const defaultApiUrl = network === "mainnet" ? "https://api.unamereg.xyz" : "http://localhost:8000";
const defaultContractId = network === "mainnet" ? "uname-registry.near" : "unam-registry.testnet";
const defaultRpcUrl = network === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org";

export const settings: Settings = {
  apiUrl: (env.VITE_API_URL ?? defaultApiUrl).replace(/\/$/, ""),
  contractId: env.VITE_CONTRACT_ID ?? defaultContractId,
  network,
  rpcUrl: env.VITE_NEAR_RPC_URL ?? defaultRpcUrl,
  suffix: env.VITE_NAME_SUFFIX ?? ".uni",
};

export const isMainnet = computed(() => settings.network === "mainnet");

export function configure(overrides: Partial<Settings>): void {
  Object.assign(settings, overrides);
  settings.apiUrl = settings.apiUrl.replace(/\/$/, "");
}
