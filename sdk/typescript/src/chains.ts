import { CHAINS, ChainInfo, normalizeChainKey } from "@unam/shared";

export const CHAIN_ALIASES: Record<string, string> = {
  ethereum: "eip155:1",
  eth: "eip155:1",
  mainnet: "eip155:1",
  base: "eip155:8453",
  arbitrum: "eip155:42161",
  arb: "eip155:42161",
  optimism: "eip155:10",
  op: "eip155:10",
  polygon: "eip155:137",
  matic: "eip155:137",
  pol: "eip155:137",
  bsc: "eip155:56",
  binance: "eip155:56",
  bnb: "eip155:56",
  avalanche: "eip155:43114",
  avax: "eip155:43114",
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  sol: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  near: "near:mainnet",
  bitcoin: "bip122:000000000019d6689c085ae165831e93",
  btc: "bip122:000000000019d6689c085ae165831e93",
};

/**
 * Normalizes an arbitrary chain identifier (EVM numeric ID, shorthand name, or CAIP-2 key)
 * into a canonical CAIP-2 chain key.
 *
 * @example
 * resolveChainId(8453) // "eip155:8453"
 * resolveChainId("base") // "eip155:8453"
 * resolveChainId("solana") // "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
 */
export function resolveChainId(chainOrAlias: string | number): string {
  if (typeof chainOrAlias === "number") {
    return `eip155:${chainOrAlias}`;
  }
  const s = String(chainOrAlias).trim().toLowerCase();
  if (CHAIN_ALIASES[s]) {
    return CHAIN_ALIASES[s];
  }
  return normalizeChainKey(s);
}

export { CHAINS };
export type { ChainInfo };
