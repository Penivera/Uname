export type NetworkEnvironment = "mainnet" | "testnet";

export interface UnameResolverConfig {
  /** Primary resolver API endpoint. Defaults to https://api.unamereg.xyz */
  apiUrl?: string;
  /** Staging / testnet fallback endpoint. Defaults to https://wip-near-615054f501a8.herokuapp.com */
  fallbackUrl?: string;
  /** Custom NEAR RPC endpoint for decentralized on-chain resolution */
  nearRpcUrl?: string;
  /** UNAME registry contract account ID on NEAR */
  contractId?: string;
  /** Network environment (mainnet or testnet). Defaults to mainnet */
  network?: NetworkEnvironment;
  /** HTTP request timeout in milliseconds. Defaults to 5000 */
  timeoutMs?: number;
}

export type UnamResolverConfig = UnameResolverConfig;

export interface ResolutionDetails {
  address: string;
  interoperableAddress?: string;
  chainId: string;
  coinType?: number;
  token?: string;
  proofStatus?: string;
  generation?: number;
  resolverPubkey?: string;
  signature?: string;
}

export interface ResolutionResult {
  name: string;
  mode: "direct" | "routed" | "payout" | "on-chain";
  address: string;
  chainId: string;
  details?: ResolutionDetails;
  signature?: string;
}

export interface PricingResult {
  name: string;
  priceUsd: number;
  priceAtomic: string;
  decimals: number;
  available: boolean;
  tier: "3_char" | "4_char" | "5_plus";
}

export interface OnChainRecord {
  owner: string;
  generation: number;
  chains: Record<
    string,
    {
      address: number[];
      coin_type: number;
      generation: number;
      proof: number[];
      set_at_ms: number;
    }
  >;
  policy?: Record<string, unknown> | null;
  pending?: Record<string, unknown> | null;
}
