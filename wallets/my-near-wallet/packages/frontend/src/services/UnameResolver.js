/**
 * Universal Name (.uni) Domain Resolver Service for MyNearWallet
 * Resolves .uni domains to native NEAR accounts via api.unamereg.xyz,
 * with automatic fallback to NEAR Mainnet on-chain JSON-RPC.
 */

const PRIMARY_API = 'https://api.unamereg.xyz';
const FALLBACK_API = 'https://wip-near-615054f501a8.herokuapp.com';
const MAINNET_RPC = 'https://rpc.mainnet.fastnear.com';
const TESTNET_RPC = 'https://test.rpc.fastnear.com';
const MAINNET_CONTRACT = 'uname-registry.near';
const TESTNET_CONTRACT = 'unam-registry.testnet';

const cache = new Map();

export function isUnameDomain(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim().toLowerCase();
    return clean.endsWith('.uni') && clean.length >= 7; // at least 3-char label + .uni
}

export function normalizeUname(raw) {
    const trimmed = raw.trim().toLowerCase();
    return trimmed.endsWith('.uni') ? trimmed : `${trimmed}.uni`;
}

/**
 * Resolves a .uni domain to a NEAR account ID or address.
 * @param {string} domain - e.g. "peni.uni" or "alice.uni"
 * @param {string} networkId - 'mainnet' or 'testnet'
 * @returns {Promise<{ accountId: string, domain: string, mode: string } | null>}
 */
export async function resolveUname(domain, networkId = 'mainnet') {
    if (!isUnameDomain(domain)) {
        return null;
    }

    const cleanDomain = normalizeUname(domain);
    const chainKey = networkId === 'mainnet' ? 'near:mainnet' : 'near:testnet';
    const cacheKey = `${cleanDomain}:${chainKey}`;

    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < 60000) {
            return cached.data;
        }
    }

    // 1. Try Primary and Fallback HTTP APIs
    const apis = [PRIMARY_API, FALLBACK_API];
    for (const api of apis) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const resp = await fetch(
                `${api}/v1/resolve?name=${encodeURIComponent(cleanDomain)}&chain=${encodeURIComponent(chainKey)}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);

            if (resp.ok) {
                const data = await resp.json();
                const addr = data?.resolved?.address;
                if (addr) {
                    const result = {
                        accountId: addr,
                        domain: cleanDomain,
                        mode: data.mode || 'direct',
                    };
                    cache.set(cacheKey, { timestamp: Date.now(), data: result });
                    return result;
                }
            }
        } catch (e) {
            // Fallthrough to next API or on-chain
        }
    }

    // 2. Direct On-Chain JSON-RPC Fallback
    try {
        const rpc = networkId === 'mainnet' ? MAINNET_RPC : TESTNET_RPC;
        const contract = networkId === 'mainnet' ? MAINNET_CONTRACT : TESTNET_CONTRACT;

        const argsBase64 = btoa(JSON.stringify({ name: cleanDomain, chain: chainKey }));
        const payload = {
            jsonrpc: '2.0',
            id: 'mynearwallet-uname',
            method: 'query',
            params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: contract,
                method_name: 'resolve_direct',
                args_base64: argsBase64,
            },
        };

        const resp = await fetch(rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (resp.ok) {
            const data = await resp.json();
            const resultArr = data?.result?.result;
            if (Array.isArray(resultArr) && resultArr.length > 0) {
                const text = String.fromCharCode(...resultArr);
                const record = JSON.parse(text);
                if (record && record.address) {
                    let accountId = '';
                    if (Array.isArray(record.address)) {
                        accountId = String.fromCharCode(...record.address);
                    } else if (typeof record.address === 'string') {
                        accountId = record.address;
                    }

                    if (accountId) {
                        const result = {
                            accountId,
                            domain: cleanDomain,
                            mode: 'on-chain',
                        };
                        cache.set(cacheKey, { timestamp: Date.now(), data: result });
                        return result;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('On-chain .uni resolution failed:', e);
    }

    return null;
}
