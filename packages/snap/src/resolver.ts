/**
 * Resolution client for UNAM (.uni) names.
 * Supports primary API, staging/testnet fallback, and decentralized NEAR RPC fallback (Mainnet + Testnet).
 */

export interface SnapResolveOptions {
  primaryApiUrl?: string;
  fallbackApiUrl?: string;
  nearRpcUrl?: string;
  contractId?: string;
  timeoutMs?: number;
}

export interface SnapResolutionResult {
  address: string;
  protocol: string;
  mode?: string;
}

const DEFAULT_PRIMARY_API = "https://api.unamereg.xyz";
const DEFAULT_FALLBACK_API = "https://wip-near-615054f501a8.herokuapp.com";
const DEFAULT_MAINNET_RPC = "https://rpc.mainnet.fastnear.com";
const DEFAULT_TESTNET_RPC = "https://test.rpc.fastnear.com";
const MAINNET_CONTRACT_ID = "uname-registry.near";
const TESTNET_CONTRACT_ID = "unam-registry.testnet";
const DEFAULT_TIMEOUT_MS = 4000;

function bytesToHex(bytes: number[]): string {
  return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function queryNearRpc(
  rpcUrl: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<any | null> {
  try {
    const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");
    const res = await fetchWithTimeout(
      rpcUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "snap-rpc",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: contractId,
            method_name: methodName,
            args_base64: argsBase64,
          },
        }),
      },
      timeoutMs
    );

    if (res.ok) {
      const data = await res.json();
      if (data.result?.result) {
        const text = Buffer.from(data.result.result).toString("utf-8");
        return JSON.parse(text);
      }
    }
  } catch {
    // Return null on failure
  }
  return null;
}

/**
 * Resolves a .uni domain name to a target chain address.
 */
export async function resolveUniName(
  domain: string,
  chainId: string,
  options: SnapResolveOptions = {}
): Promise<SnapResolutionResult | null> {
  const trimmed = domain.trim().toLowerCase();
  const cleanName = trimmed.endsWith(".uni") ? trimmed : `${trimmed}.uni`;

  const primaryUrl = options.primaryApiUrl || DEFAULT_PRIMARY_API;
  const fallbackUrl = options.fallbackApiUrl || DEFAULT_FALLBACK_API;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  // 1. Try Resolver APIs (Primary then Fallback)
  for (const baseUrl of [primaryUrl, fallbackUrl]) {
    try {
      const url = `${baseUrl}/v1/resolve?name=${encodeURIComponent(cleanName)}&chain=${encodeURIComponent(chainId)}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, timeoutMs);
      if (res.ok) {
        const data = await res.json();
        if (data?.resolved?.address) {
          return {
            address: data.resolved.address,
            protocol: "UNAM (.uni)",
            mode: data.mode || "direct",
          };
        }
      }
    } catch {
      // Continue to next endpoint or decentralized RPC
    }
  }

  // 2. Direct On-Chain NEAR RPC Fallback (Queries Mainnet then Testnet)
  const rpcTargets = options.contractId && options.nearRpcUrl
    ? [{ rpc: options.nearRpcUrl, contract: options.contractId }]
    : [
        { rpc: DEFAULT_MAINNET_RPC, contract: MAINNET_CONTRACT_ID },
        { rpc: DEFAULT_TESTNET_RPC, contract: TESTNET_CONTRACT_ID },
      ];

  for (const target of rpcTargets) {
    const record = await queryNearRpc(
      target.rpc,
      target.contract,
      "resolve_direct",
      { name: cleanName, chain: chainId },
      timeoutMs
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
        address: formattedAddress,
        protocol: "UNAM (.uni)",
        mode: "on-chain",
      };
    }
  }

  return null;
}
