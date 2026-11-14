from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ResolutionDetails(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    address: str
    interoperable_address: Optional[str] = Field(None, alias="interoperableAddress")
    chain_id: str = Field(..., alias="chainId")
    coin_type: Optional[int] = Field(None, alias="coinType")
    token: Optional[str] = None
    proof_status: Optional[str] = Field(None, alias="proofStatus")
    generation: Optional[int] = None
    resolver_pubkey: Optional[str] = Field(None, alias="resolverPubkey")
    signature: Optional[str] = None


class ResolutionResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    mode: str = "direct"
    address: str
    chain_id: str = Field(..., alias="chainId")
    details: Optional[ResolutionDetails] = None
    signature: Optional[str] = None


class PricingResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    price_usd: float = Field(..., alias="priceUsd")
    price_atomic: str = Field(..., alias="priceAtomic")
    decimals: int = 6
    available: bool = True
    tier: str = "5_plus"
