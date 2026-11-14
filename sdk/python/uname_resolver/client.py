import asyncio
import base64
import json
from typing import Optional, Union

import httpx

from uname_resolver.chains import resolve_chain_id
from uname_resolver.models import PricingResult, ResolutionDetails, ResolutionResult

DEFAULT_MAINNET_API = "https://api.unamereg.xyz"
DEFAULT_FALLBACK_API = "https://wip-near-615054f501a8.herokuapp.com"
DEFAULT_MAINNET_RPC = "https://rpc.mainnet.fastnear.com"
DEFAULT_TESTNET_RPC = "https://test.rpc.fastnear.com"
DEFAULT_MAINNET_CONTRACT = "uname-registry.near"
DEFAULT_TESTNET_CONTRACT = "unam-registry.testnet"


def _bytes_to_hex(byte_list: list[int]) -> str:
    return "0x" + "".join(f"{b:02x}" for b in byte_list)


class AsyncUnameResolver:
    def __init__(
        self,
        api_url: str = DEFAULT_MAINNET_API,
        fallback_url: str = DEFAULT_FALLBACK_API,
        near_rpc_url: Optional[str] = None,
        contract_id: Optional[str] = None,
        is_testnet: bool = False,
        timeout_sec: float = 5.0,
    ):
        self.api_url = api_url
        self.fallback_url = fallback_url
        self.near_rpc_url = near_rpc_url or (
            DEFAULT_TESTNET_RPC if is_testnet else DEFAULT_MAINNET_RPC
        )
        self.contract_id = contract_id or (
            DEFAULT_TESTNET_CONTRACT if is_testnet else DEFAULT_MAINNET_CONTRACT
        )
        self.timeout_sec = timeout_sec

    def normalize_name(self, raw: str) -> str:
        s = raw.strip().lower()
        if not s.endswith(".uni"):
            s = f"{s}.uni"
        label = s[:-4]
        if len(label) < 3 or len(label) > 32:
            raise ValueError(f"Invalid domain length: {len(label)}")
        return s

    async def resolve(
        self, name: str, chain: Union[str, int]
    ) -> Optional[ResolutionResult]:
        try:
            clean_name = self.normalize_name(name)
        except ValueError:
            return None
        chain_id = resolve_chain_id(chain)

        # 1. Query Resolver APIs (Primary then Staging/Fallback)
        for base in [self.api_url, self.fallback_url]:
            try:
                url = f"{base}/v1/resolve"
                async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                    resp = await client.get(
                        url, params={"name": clean_name, "chain": chain_id}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        resolved = data.get("resolved")
                        if resolved and "address" in resolved:
                            return ResolutionResult(
                                name=clean_name,
                                mode=data.get("mode", "direct"),
                                address=resolved["address"],
                                chainId=chain_id,
                                details=ResolutionDetails(**resolved),
                                signature=data.get("signature"),
                            )
            except Exception:
                pass

        # 2. Decentralized On-Chain RPC Fallback
        return await self.resolve_on_chain(clean_name, chain_id)

    async def resolve_address(
        self, name: str, chain: Union[str, int]
    ) -> Optional[str]:
        res = await self.resolve(name, chain)
        return res.address if res else None

    async def resolve_on_chain(
        self, name: str, chain: Union[str, int]
    ) -> Optional[ResolutionResult]:
        try:
            clean_name = self.normalize_name(name)
        except ValueError:
            return None
        chain_id = resolve_chain_id(chain)

        args_b64 = base64.b64encode(
            json.dumps({"name": clean_name, "chain": chain_id}).encode("utf-8")
        ).decode("utf-8")

        targets = [
            (self.near_rpc_url, self.contract_id),
            (DEFAULT_TESTNET_RPC, DEFAULT_TESTNET_CONTRACT),
            (DEFAULT_MAINNET_RPC, DEFAULT_MAINNET_CONTRACT),
        ]

        for rpc, contract in targets:
            try:
                payload = {
                    "jsonrpc": "2.0",
                    "id": "py-uname",
                    "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": contract,
                        "method_name": "resolve_direct",
                        "args_base64": args_b64,
                    },
                }
                async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                    resp = await client.post(rpc, json=payload)
                    if resp.status_code == 200:
                        json_resp = resp.json()
                        raw_res = json_resp.get("result", {}).get("result")
                        if raw_res:
                            record = json.loads(bytes(raw_res).decode("utf-8"))
                            addr_bytes = record.get("address", [])
                            if chain_id.startswith("eip155:"):
                                formatted = _bytes_to_hex(addr_bytes)
                            elif chain_id.startswith("near:"):
                                formatted = bytes(addr_bytes).decode("utf-8")
                            else:
                                formatted = _bytes_to_hex(addr_bytes)

                            return ResolutionResult(
                                name=clean_name,
                                mode="on-chain",
                                address=formatted,
                                chainId=chain_id,
                                details=ResolutionDetails(
                                    address=formatted,
                                    chainId=chain_id,
                                    coinType=record.get("coin_type"),
                                    generation=record.get("generation"),
                                ),
                            )
            except Exception:
                pass
        return None

    async def is_available(self, name: str) -> bool:
        try:
            clean_name = self.normalize_name(name)
        except ValueError:
            return False

        args_b64 = base64.b64encode(
            json.dumps({"name": clean_name}).encode("utf-8")
        ).decode("utf-8")

        payload = {
            "jsonrpc": "2.0",
            "id": "py-uname-avail",
            "method": "query",
            "params": {
                "request_type": "call_function",
                "finality": "final",
                "account_id": self.contract_id,
                "method_name": "is_name_available",
                "args_base64": args_b64,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                resp = await client.post(self.near_rpc_url, json=payload)
                if resp.status_code == 200:
                    raw_res = resp.json().get("result", {}).get("result")
                    if raw_res:
                        return json.loads(bytes(raw_res).decode("utf-8"))
        except Exception:
            pass
        return True

    async def get_pricing(self, name: str) -> Optional[PricingResult]:
        try:
            clean_name = self.normalize_name(name)
        except ValueError:
            return None

        label = clean_name[:-4]
        if len(label) == 3:
            price_usd = 50.0
            price_atomic = "50000000"
            tier = "3_char"
        elif len(label) == 4:
            price_usd = 20.0
            price_atomic = "20000000"
            tier = "4_char"
        else:
            price_usd = 5.0
            price_atomic = "5000000"
            tier = "5_plus"

        avail = await self.is_available(clean_name)
        return PricingResult(
            name=clean_name,
            priceUsd=price_usd,
            priceAtomic=price_atomic,
            decimals=6,
            available=avail,
            tier=tier,
        )


AsyncUnamResolver = AsyncUnameResolver


class UnameResolver:
    """Synchronous client wrapping AsyncUnameResolver."""

    def __init__(self, **kwargs):
        self._async_client = AsyncUnameResolver(**kwargs)

    def normalize_name(self, raw: str) -> str:
        return self._async_client.normalize_name(raw)

    def resolve(
        self, name: str, chain: Union[str, int]
    ) -> Optional[ResolutionResult]:
        return asyncio.run(self._async_client.resolve(name, chain))

    def resolve_address(
        self, name: str, chain: Union[str, int]
    ) -> Optional[str]:
        return asyncio.run(self._async_client.resolve_address(name, chain))

    def resolve_on_chain(
        self, name: str, chain: Union[str, int]
    ) -> Optional[ResolutionResult]:
        return asyncio.run(self._async_client.resolve_on_chain(name, chain))

    def is_available(self, name: str) -> bool:
        return asyncio.run(self._async_client.is_available(name))

    def get_pricing(self, name: str) -> Optional[PricingResult]:
        return asyncio.run(self._async_client.get_pricing(name))


UnamResolver = UnameResolver
