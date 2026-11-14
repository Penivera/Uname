/**
 * Public settings. The defaults are the mainnet deployment and the hosted
 * resolver; Vite env or the embedding page can override them (see .env.example
 * for the testnet + local resolver values).
 */
const env = import.meta.env;

export interface Settings {
  /** Python resolver base URL. */
  apiUrl: string;
  /** Registry contract account. */
  contractId: string;
  network: "testnet" | "mainnet";
  rpcUrl: string;
  suffix: string;
}

export const settings: Settings = {
  apiUrl: (env.VITE_API_URL ?? "https://api.unamereg.xyz").replace(/\/$/, ""),
  contractId: env.VITE_CONTRACT_ID ?? "uname-registry.near",
  network: env.VITE_NEAR_NETWORK === "testnet" ? "testnet" : "mainnet",
  rpcUrl: env.VITE_NEAR_RPC_URL ?? "https://rpc.mainnet.near.org",
  suffix: env.VITE_NAME_SUFFIX ?? ".uni",
};

export function configure(overrides: Partial<Settings>): void {
  Object.assign(settings, overrides);
  settings.apiUrl = settings.apiUrl.replace(/\/$/, "");
}
