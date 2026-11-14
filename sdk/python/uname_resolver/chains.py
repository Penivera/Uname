CHAIN_ALIASES: dict[str, str] = {
    "ethereum": "eip155:1",
    "eth": "eip155:1",
    "mainnet": "eip155:1",
    "base": "eip155:8453",
    "arbitrum": "eip155:42161",
    "arb": "eip155:42161",
    "optimism": "eip155:10",
    "op": "eip155:10",
    "polygon": "eip155:137",
    "matic": "eip155:137",
    "pol": "eip155:137",
    "bsc": "eip155:56",
    "binance": "eip155:56",
    "bnb": "eip155:56",
    "avalanche": "eip155:43114",
    "avax": "eip155:43114",
    "solana": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "sol": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "near": "near:mainnet",
    "bitcoin": "bip122:000000000019d6689c085ae165831e93",
    "btc": "bip122:000000000019d6689c085ae165831e93",
}


def resolve_chain_id(chain_or_alias: str | int) -> str:
    """
    Normalizes EVM chain IDs or string aliases into canonical CAIP-2 chain identifiers.
    """
    if isinstance(chain_or_alias, int):
        return f"eip155:{chain_or_alias}"
    s = str(chain_or_alias).strip().lower()
    return CHAIN_ALIASES.get(s, s)
