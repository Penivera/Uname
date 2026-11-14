import { resolveUniName } from "./resolver.js";

export interface NameLookupParams {
  chainId: string;
  domain?: string;
  address?: string;
}

export interface NameLookupResponse {
  resolvedAddress?: string;
  resolvedDomain?: string;
  protocol?: string;
}

/**
 * Entry point for MetaMask Snaps Name Lookup API (`endowment:name-lookup`).
 * Invoked by MetaMask when a user types a recipient domain or address.
 */
export const onNameLookup = async ({
  chainId,
  domain,
}: NameLookupParams): Promise<NameLookupResponse | null> => {
  if (!domain) {
    return null;
  }

  const normalized = domain.trim().toLowerCase();
  const lookupName = normalized.endsWith(".uni") ? normalized : `${normalized}.uni`;

  const result = await resolveUniName(lookupName, chainId);
  if (!result || !result.address) {
    return null;
  }

  return {
    resolvedAddress: result.address,
    protocol: result.protocol || "UNAM (.uni)",
  };
};

export { resolveUniName };
