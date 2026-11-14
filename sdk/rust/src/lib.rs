use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ResolverError {
    #[error("Invalid name: {0}")]
    InvalidName(String),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("RPC error: {0}")]
    Rpc(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResolutionDetails {
    pub address: String,
    #[serde(rename = "interoperableAddress")]
    pub interoperable_address: Option<String>,
    #[serde(rename = "chainId")]
    pub chain_id: String,
    #[serde(rename = "coinType")]
    pub coin_type: Option<u64>,
    pub token: Option<String>,
    #[serde(rename = "proofStatus")]
    pub proof_status: Option<String>,
    pub generation: Option<u32>,
    pub signature: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResolutionResult {
    pub name: String,
    pub mode: String,
    pub address: String,
    #[serde(rename = "chainId")]
    pub chain_id: String,
    pub details: Option<ResolutionDetails>,
    pub signature: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PricingResult {
    pub name: String,
    pub price_usd: f64,
    pub price_atomic: String,
    pub decimals: u8,
    pub available: bool,
    pub tier: String,
}

pub fn resolve_chain_id(chain: &str) -> String {
    let lower = chain.trim().to_ascii_lowercase();
    match lower.as_str() {
        "ethereum" | "eth" | "mainnet" => "eip155:1".into(),
        "base" => "eip155:8453".into(),
        "arbitrum" | "arb" => "eip155:42161".into(),
        "optimism" | "op" => "eip155:10".into(),
        "polygon" | "matic" | "pol" => "eip155:137".into(),
        "bsc" | "binance" => "eip155:56".into(),
        "avalanche" | "avax" => "eip155:43114".into(),
        "solana" | "sol" => "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d".into(),
        "near" => "near:mainnet".into(),
        "bitcoin" | "btc" => "bip122:000000000019d6689c085ae165831e93".into(),
        other => other.to_string(),
    }
}

pub fn normalize_name(raw: &str) -> Result<String, ResolverError> {
    let trimmed = raw.trim().to_ascii_lowercase();
    let clean = if let Some(stripped) = trimmed.strip_suffix(".uni") {
        stripped
    } else {
        &trimmed
    };
    if clean.len() < 3 || clean.len() > 32 {
        return Err(ResolverError::InvalidName(format!(
            "length must be 3..=32, got {}",
            clean.len()
        )));
    }
    if !clean
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err(ResolverError::InvalidName(
            "only a-z, 0-9 and '-' allowed".into(),
        ));
    }
    if clean.starts_with('-') || clean.ends_with('-') || clean.contains("--") {
        return Err(ResolverError::InvalidName("bad '-' placement".into()));
    }
    const RESERVED: &[&str] = &[
        "admin", "root", "system", "near", "uni", "registry", "registrar", "www", "api", "app",
        "support", "help", "security", "official", "mail", "null",
    ];
    if RESERVED.contains(&clean) {
        return Err(ResolverError::InvalidName("reserved name".into()));
    }
    Ok(format!("{clean}.uni"))
}

#[derive(Clone, Debug)]
pub struct UnameResolver {
    pub api_url: String,
    pub fallback_url: String,
    pub near_rpc_url: String,
    pub contract_id: String,
    client: reqwest::Client,
}

pub type UnamResolver = UnameResolver;

impl Default for UnameResolver {
    fn default() -> Self {
        Self::new(None, None, None, None)
    }
}

impl UnameResolver {
    pub fn new(
        api_url: Option<String>,
        fallback_url: Option<String>,
        near_rpc_url: Option<String>,
        contract_id: Option<String>,
    ) -> Self {
        Self {
            api_url: api_url.unwrap_or_else(|| "https://api.unamereg.xyz".into()),
            fallback_url: fallback_url
                .unwrap_or_else(|| "https://wip-near-615054f501a8.herokuapp.com".into()),
            near_rpc_url: near_rpc_url
                .unwrap_or_else(|| "https://rpc.mainnet.fastnear.com".into()),
            contract_id: contract_id.unwrap_or_else(|| "uname-registry.near".into()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap_or_default(),
        }
    }

    pub async fn resolve(
        &self,
        name: &str,
        chain: &str,
    ) -> Result<Option<ResolutionResult>, ResolverError> {
        let clean_name = match normalize_name(name) {
            Ok(n) => n,
            Err(_) => return Ok(None),
        };
        let chain_id = resolve_chain_id(chain);

        // 1. Try Primary and Fallback APIs
        for base in [&self.api_url, &self.fallback_url] {
            let url = format!("{base}/v1/resolve");
            let req = self
                .client
                .get(&url)
                .query(&[("name", &clean_name), ("chain", &chain_id)])
                .send()
                .await;

            if let Ok(resp) = req {
                if resp.status().is_success() {
                    #[derive(Deserialize)]
                    struct RawResp {
                        mode: Option<String>,
                        resolved: Option<serde_json::Value>,
                        signature: Option<String>,
                    }
                    if let Ok(raw) = resp.json::<RawResp>().await {
                        if let Some(res_val) = raw.resolved {
                            if let Some(addr_str) = res_val.get("address").and_then(|v| v.as_str()).map(|s| s.to_string()) {
                                let details = serde_json::from_value::<ResolutionDetails>(res_val).ok();
                                return Ok(Some(ResolutionResult {
                                    name: clean_name,
                                    mode: raw.mode.unwrap_or_else(|| "direct".into()),
                                    address: addr_str,
                                    chain_id,
                                    details,
                                    signature: raw.signature,
                                }));
                            }
                        }
                    }
                }
            }
        }

        // 2. Direct On-Chain Fallback
        self.resolve_on_chain(&clean_name, &chain_id).await
    }

    pub async fn resolve_address(
        &self,
        name: &str,
        chain: &str,
    ) -> Result<Option<String>, ResolverError> {
        let res = self.resolve(name, chain).await?;
        Ok(res.map(|r| r.address))
    }

    pub async fn resolve_on_chain(
        &self,
        clean_name: &str,
        chain_id: &str,
    ) -> Result<Option<ResolutionResult>, ResolverError> {
        #[derive(Serialize)]
        struct QueryArgs<'a> {
            name: &'a str,
            chain: &'a str,
        }
        let args_bytes = serde_json::to_vec(&QueryArgs {
            name: clean_name,
            chain: chain_id,
        })?;
        let args_b64 = Self::base64_encode(&args_bytes);

        let targets = [
            (&self.near_rpc_url, &self.contract_id),
            (
                &"https://test.rpc.fastnear.com".to_string(),
                &"unam-registry.testnet".to_string(),
            ),
            (
                &"https://rpc.mainnet.fastnear.com".to_string(),
                &"uname-registry.near".to_string(),
            ),
        ];

        for (rpc, contract) in targets {
            let payload = serde_json::json!({
                "jsonrpc": "2.0",
                "id": "rust-uname",
                "method": "query",
                "params": {
                    "request_type": "call_function",
                    "finality": "final",
                    "account_id": contract,
                    "method_name": "resolve_direct",
                    "args_base64": args_b64
                }
            });

            if let Ok(resp) = self.client.post(rpc).json(&payload).send().await {
                if let Ok(json_val) = resp.json::<serde_json::Value>().await {
                    if let Some(arr) = json_val["result"]["result"].as_array() {
                        let bytes: Vec<u8> = arr
                            .iter()
                            .filter_map(|v| v.as_u64().map(|b| b as u8))
                            .collect();
                        if let Ok(text) = std::str::from_utf8(&bytes) {
                            #[derive(Deserialize)]
                            struct OnChainResolved {
                                address: Vec<u8>,
                                coin_type: Option<u64>,
                                generation: Option<u32>,
                            }
                            if let Ok(rec) = serde_json::from_str::<OnChainResolved>(text) {
                                let formatted = if chain_id.starts_with("eip155:") {
                                    format!("0x{}", Self::hex_encode(&rec.address))
                                } else if chain_id.starts_with("near:") {
                                    String::from_utf8_lossy(&rec.address).to_string()
                                } else {
                                    format!("0x{}", Self::hex_encode(&rec.address))
                                };
                                return Ok(Some(ResolutionResult {
                                    name: clean_name.to_string(),
                                    mode: "on-chain".into(),
                                    address: formatted.clone(),
                                    chain_id: chain_id.to_string(),
                                    details: Some(ResolutionDetails {
                                        address: formatted,
                                        interoperable_address: None,
                                        chain_id: chain_id.to_string(),
                                        coin_type: rec.coin_type,
                                        token: None,
                                        proof_status: None,
                                        generation: rec.generation,
                                        signature: None,
                                    }),
                                    signature: None,
                                }));
                            }
                        }
                    }
                }
            }
        }
        Ok(None)
    }

    pub fn get_pricing(&self, name: &str) -> Result<PricingResult, ResolverError> {
        let clean = normalize_name(name)?;
        let label = clean.strip_suffix(".uni").unwrap_or(&clean);
        let len = label.len();
        let (price_usd, price_atomic, tier) = match len {
            3 => (50.0, "50000000".to_string(), "3_char".to_string()),
            4 => (20.0, "20000000".to_string(), "4_char".to_string()),
            _ => (5.0, "5000000".to_string(), "5_plus".to_string()),
        };
        Ok(PricingResult {
            name: clean,
            price_usd,
            price_atomic,
            decimals: 6,
            available: true,
            tier,
        })
    }

    fn hex_encode(bytes: &[u8]) -> String {
        const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
        let mut s = String::with_capacity(bytes.len() * 2);
        for &b in bytes {
            s.push(HEX_CHARS[(b >> 4) as usize] as char);
            s.push(HEX_CHARS[(b & 0x0f) as usize] as char);
        }
        s
    }

    fn base64_encode(bytes: &[u8]) -> String {
        const B64_CHARS: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
        for chunk in bytes.chunks(3) {
            let b0 = chunk[0];
            let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

            result.push(B64_CHARS[(b0 >> 2) as usize] as char);
            result.push(B64_CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
            if chunk.len() > 1 {
                result.push(B64_CHARS[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
            } else {
                result.push('=');
            }
            if chunk.len() > 2 {
                result.push(B64_CHARS[(b2 & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
        }
        result
    }
}
