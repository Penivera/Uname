import pytest
from uname_resolver import UnameResolver, AsyncUnameResolver, UnamResolver, resolve_chain_id


def test_chain_aliases():
    assert resolve_chain_id("ethereum") == "eip155:1"
    assert resolve_chain_id("base") == "eip155:8453"
    assert resolve_chain_id(42161) == "eip155:42161"
    assert resolve_chain_id("solana") == "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
    assert resolve_chain_id("near") == "near:mainnet"


def test_name_normalization():
    resolver = UnameResolver()
    assert resolver.normalize_name("peni") == "peni.uni"
    assert resolver.normalize_name("PENI.UNI") == "peni.uni"
    with pytest.raises(ValueError):
        resolver.normalize_name("ab")


def test_sync_resolution_peni():
    resolver = UnameResolver()
    address = resolver.resolve_address("peni.uni", "ethereum")
    assert address is not None
    assert address.startswith("0x")
    assert len(address) == 42


def test_pricing_tiers():
    resolver = UnameResolver()
    p3 = resolver.get_pricing("abc.uni")
    assert p3 is not None
    assert p3.price_usd == 50.0
    assert p3.tier == "3_char"

    p4 = resolver.get_pricing("peni.uni")
    assert p4 is not None
    assert p4.price_usd == 20.0
    assert p4.tier == "4_char"

    p5 = resolver.get_pricing("alice.uni")
    assert p5 is not None
    assert p5.price_usd == 5.0
    assert p5.tier == "5_plus"


@pytest.mark.asyncio
async def test_async_resolution():
    async_resolver = AsyncUnameResolver()
    result = await async_resolver.resolve("peni.uni", "eip155:1")
    assert result is not None
    assert result.address.startswith("0x")
    assert result.name == "peni.uni"

    # Also test backward compatibility alias
    assert UnamResolver is UnameResolver
