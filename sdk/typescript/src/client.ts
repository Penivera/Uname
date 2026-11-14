import { normalizeName } from "@unam/shared";
import { resolveChainId } from "./chains.js";
import { bytesToHex, callNearRpc } from "./rpc.js";
import {
  OnChainRecord,
  PricingResult,
  ResolutionResult,
  UnameResolverConfig,
  UnamResolverConfig,
} from "./types.js";

const DEFAULT_MAINNET_API = "https://api.unamereg.xyz";
const DEFAULT_TESTNET_API = "https://wip-near-615054f501a8.herokuapp.com";
const DEFAULT_MAINNET_RPC = "https://rpc.mainnet.fastnear.com";
const DEFAULT_TESTNET_RPC = "https://test.rpc.fastnear.com";
const DEFAULT_MAINNET_CONTRACT = "uname-registry.near";
const DEFAULT_TESTNET_CONTRACT = "unam-registry.testnet";

export class UnameResolver {
  readonly apiUrl: string;
  readonly fallbackUrl: string;
  readonly nearRpcUrl: string;
  readonly contractId: string;
  readonly timeoutMs: number;

  constructor(config: UnameResolverConfig = {}) {
    const isTestnet = config.network === "testnet";
    this.apiUrl = config.apiUrl || DEFAULT_MAINNET_API;
    this.fallbackUrl = config.fallbackUrl || DEFAULT_TESTNET_API;
    this.nearRpcUrl =
      config.nearRpcUrl || (isTestnet ? DEFAULT_TESTNET_RPC : DEFAULT_MAINNET_RPC);
    this.contractId =
      config.contractId || (isTestnet ? DEFAULT_TESTNET_CONTRACT : DEFAULT_MAINNET_CONTRACT);
    this.timeoutMs = config.timeoutMs || 5000;
  }

  /**
   * Normalizes a human-readable domain name (e.g. "Peni" or "peni.uni" -> "peni.uni").
   */
  normalizeName(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    const cleanLabel = trimmed.endsWith(".uni") ? trimmed.slice(0, -4) : trimmed;
    const validated = normalizeName(cleanLabel);
    if (!validated.ok) {
      throw new Error(`Invalid .uni domain name '${raw}': ${validated.reason}`);
    }
    return `${validated.name}.uni`;
  }

  /**
   * Resolves a .uni name to a target chain address with full resolution metadata.
   */
  async resolve(
    name: string,
    chain: string | number
  ): Promise<ResolutionResult | null> {
    let cleanName: string;
    try {
      cleanName = this.normalizeName(name);
    } catch {
      return null;
    }
    const chainId = resolveChainId(chain);

    // 1. Try Resolver APIs (Primary then Fallback)
    for (const baseUrl of [this.apiUrl, this.fallbackUrl]) {
      try {
        const url = `${baseUrl}/v1/resolve?name=${encodeURIComponent(cleanName)}&chain=${encodeURIComponent(chainId)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          if (data?.resolved?.address) {
            return {
              name: cleanName,
              mode: data.mode || "direct",
              address: data.resolved.address,
              chainId,
              details: data.resolved,
              signature: data.signature,
            };
          }
        }
      } catch {
        // Continue to fallback
      }
    }

    // 2. Direct On-Chain Fallback
    return this.resolveOnChain(cleanName, chainId);
  }

  /**
   * Convenience method: returns only the native address string for a domain and chain.
   */
  async resolveAddress(
    name: string,
    chain: string | number
  ): Promise<string | null> {
    const result = await this.resolve(name, chain);
    return result ? result.address : null;
  }

  /**
   * Convenience method: returns the ERC-7930 interoperable address for a domain and chain.
   */
  async resolveErc7930(
    name: string,
    chain: string | number
  ): Promise<string | null> {
    const result = await this.resolve(name, chain);
    return result?.details?.interoperableAddress || null;
  }

  /**
   * Resolves a name directly from the NEAR blockchain contract without using middleman APIs.
   */
  async resolveOnChain(
    name: string,
    chain: string | number
  ): Promise<ResolutionResult | null> {
    let cleanName: string;
    try {
      cleanName = this.normalizeName(name);
    } catch {
      return null;
    }
    const chainId = resolveChainId(chain);

    // Query Mainnet and Testnet RPCs
    const targets = [
      { rpc: this.nearRpcUrl, contract: this.contractId },
      { rpc: DEFAULT_TESTNET_RPC, contract: DEFAULT_TESTNET_CONTRACT },
      { rpc: DEFAULT_MAINNET_RPC, contract: DEFAULT_MAINNET_CONTRACT },
    ];

    for (const target of targets) {
      const record = await callNearRpc<{
        address: number[];
        coin_type: number;
        generation: number;
        chain: string;
      }>(
        target.rpc,
        target.contract,
        "resolve_direct",
        { name: cleanName, chain: chainId },
        this.timeoutMs
      );

      if (record?.address && Array.isArray(record.address)) {
        let formattedAddress: string;
        if (chainId.startsWith("eip155:")) {
          formattedAddress = bytesToHex(record.address);
        } else if (chainId.startsWith("near:")) {
          formattedAddress = Buffer.from(record.address).toString("utf-8");
        } else {
          formattedAddress = bytesToHex(record.address);
        }

        return {
          name: cleanName,
          mode: "on-chain",
          address: formattedAddress,
          chainId,
          details: {
            address: formattedAddress,
            chainId,
            coinType: record.coin_type,
            generation: record.generation,
          },
        };
      }
    }

    return null;
  }

  /**
   * Fetches the complete on-chain record for a name directly from the contract.
   */
  async getRecordOnChain(name: string): Promise<OnChainRecord | null> {
    let cleanName: string;
    try {
      cleanName = this.normalizeName(name);
    } catch {
      return null;
    }

    return callNearRpc<OnChainRecord>(
      this.nearRpcUrl,
      this.contractId,
      "get_record",
      { name: cleanName },
      this.timeoutMs
    );
  }

  /**
   * Checks if a .uni domain name is available for registration.
   */
  async isAvailable(name: string): Promise<boolean> {
    let cleanName: string;
    try {
      cleanName = this.normalizeName(name);
    } catch {
      return false;
    }

    // Check pricing endpoint or on-chain
    const res = await callNearRpc<boolean>(
      this.nearRpcUrl,
      this.contractId,
      "is_name_available",
      { name: cleanName },
      this.timeoutMs
    );
    return res ?? true;
  }

  /**
   * Returns tiered pricing information for registering a .uni domain.
   */
  async getPricing(name: string): Promise<PricingResult | null> {
    let cleanName: string;
    try {
      cleanName = this.normalizeName(name);
    } catch {
      return null;
    }

    const label = cleanName.slice(0, -4);
    const len = label.length;

    let priceAtomic: string;
    let priceUsd: number;
    let tier: "3_char" | "4_char" | "5_plus";

    if (len === 3) {
      priceAtomic = "50000000";
      priceUsd = 50.0;
      tier = "3_char";
    } else if (len === 4) {
      priceAtomic = "20000000";
      priceUsd = 20.0;
      tier = "4_char";
    } else {
      priceAtomic = "5000000";
      priceUsd = 5.0;
      tier = "5_plus";
    }

    const available = await this.isAvailable(cleanName);

    return {
      name: cleanName,
      priceUsd,
      priceAtomic,
      decimals: 6,
      available,
      tier,
    };
  }
}

export const UnamResolver = UnameResolver;
