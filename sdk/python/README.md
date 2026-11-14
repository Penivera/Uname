# uname-resolver (Python SDK)

Official Python SDK for resolving **Universal Name (.uni)** cross-chain domain names across EVM chains, Solana, Bitcoin, and NEAR (`uname-registry.near`).

Supports both synchronous (`UnameResolver`) and asynchronous (`AsyncUnameResolver`) usage.

---

## Installation

```bash
pip install uname-resolver
```

---

## Quick Start (Synchronous)

```python
from uname_resolver import UnameResolver

resolver = UnameResolver()

# 1. Resolve address on Base
address = resolver.resolve_address("peni.uni", "base")
print(address)
# => "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"

# 2. Resolve on Ethereum with numeric chain ID
eth_address = resolver.resolve_address("peni.uni", 1)

# 3. Check domain pricing
pricing = resolver.get_pricing("peni.uni")
print(f"Price: ${pricing.price_usd} (Tier: {pricing.tier})")
```

---

## Asynchronous Usage

```python
import asyncio
from uname_resolver import AsyncUnameResolver

async def main():
    resolver = AsyncUnameResolver()
    res = await resolver.resolve("peni.uni", "eip155:1")
    if res:
        print(f"Resolved {res.name} -> {res.address} (mode: {res.mode})")

asyncio.run(main())
```
