/**
 * Direct decentralized NEAR RPC client for querying UNAM smart contract on-chain.
 */

export function bytesToHex(bytes: number[]): string {
  return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function callNearRpc<T>(
  rpcUrl: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  timeoutMs = 5000
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "uname-sdk",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: contractId,
          method_name: methodName,
          args_base64: argsBase64,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    if (json.result?.result) {
      const text = Buffer.from(json.result.result).toString("utf-8");
      return JSON.parse(text) as T;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
