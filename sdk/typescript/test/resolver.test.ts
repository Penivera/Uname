import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UnameResolver, UnamResolver, resolveChainId, CHAIN_ALIASES } from "../src/index.js";

describe("@uname/resolver-sdk (TypeScript)", () => {
  const resolver = new UnameResolver({
    apiUrl: "https://api.unamereg.xyz",
    fallbackUrl: "https://wip-near-615054f501a8.herokuapp.com",
    network: "mainnet",
  });

  describe("Name Normalization", () => {
    it("maintains backward-compatible alias", () => {
      assert.equal(UnamResolver, UnameResolver);
    });

    it("normalizes uppercase and trims whitespace", () => {
      assert.equal(resolver.normalizeName("  Peni.Uni  "), "peni.uni");
      assert.equal(resolver.normalizeName("ALICE"), "alice.uni");
    });

    it("throws for invalid domain names", () => {
      assert.throws(() => resolver.normalizeName("ab"), /length must be 3/);
      assert.throws(() => resolver.normalizeName("admin"), /reserved name/);
      assert.throws(() => resolver.normalizeName("bad--dash"), /bad '-' placement/);
      assert.throws(() => resolver.normalizeName("invalid_char"), /only a-z, 0-9/);
    });
  });

  describe("Chain Key Resolution", () => {
    it("converts numeric EVM chain IDs to CAIP-2", () => {
      assert.equal(resolveChainId(1), "eip155:1");
      assert.equal(resolveChainId(8453), "eip155:8453");
      assert.equal(resolveChainId(42161), "eip155:42161");
      assert.equal(resolveChainId(137), "eip155:137");
    });

    it("maps common chain aliases to CAIP-2", () => {
      assert.equal(resolveChainId("base"), "eip155:8453");
      assert.equal(resolveChainId("ethereum"), "eip155:1");
      assert.equal(resolveChainId("polygon"), "eip155:137");
      assert.equal(resolveChainId("arbitrum"), "eip155:42161");
      assert.equal(resolveChainId("solana"), "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");
      assert.equal(resolveChainId("near"), "near:mainnet");
      assert.equal(resolveChainId("btc"), "bip122:000000000019d6689c085ae165831e93");
    });
  });

  describe("Domain Resolution", () => {
    it("resolves peni.uni on eip155:1 to address", async () => {
      const result = await resolver.resolve("peni.uni", "ethereum");
      assert.ok(result, "expected resolution result");
      assert.equal(result.name, "peni.uni");
      assert.match(result.address, /^0x[a-fA-F0-9]{40}$/);
    });

    it("resolves via convenience method resolveAddress()", async () => {
      const address = await resolver.resolveAddress("peni", 1);
      assert.ok(address);
      assert.match(address, /^0x[a-fA-F0-9]{40}$/);
    });

    it("returns null for non-existent domains", async () => {
      const address = await resolver.resolveAddress("random-unclaimed-domain-999.uni", "base");
      assert.equal(address, null);
    });

    it("resolves direct on-chain via FastNEAR RPC fallback", async () => {
      const res = await resolver.resolveOnChain("peni.uni", "eip155:1");
      assert.ok(res);
      assert.equal(res.mode, "on-chain");
      assert.match(res.address, /^0x/);
    });
  });

  describe("Pricing & Availability", () => {
    it("calculates 3-character tier pricing ($50)", async () => {
      const p = await resolver.getPricing("abc.uni");
      assert.ok(p);
      assert.equal(p.priceUsd, 50.0);
      assert.equal(p.tier, "3_char");
      assert.equal(p.priceAtomic, "50000000");
    });

    it("calculates 4-character tier pricing ($20)", async () => {
      const p = await resolver.getPricing("peni.uni");
      assert.ok(p);
      assert.equal(p.priceUsd, 20.0);
      assert.equal(p.tier, "4_char");
      assert.equal(p.priceAtomic, "20000000");
    });

    it("calculates 5+ character tier pricing ($5)", async () => {
      const p = await resolver.getPricing("mywallet.uni");
      assert.ok(p);
      assert.equal(p.priceUsd, 5.0);
      assert.equal(p.tier, "5_plus");
      assert.equal(p.priceAtomic, "5000000");
    });
  });
});
