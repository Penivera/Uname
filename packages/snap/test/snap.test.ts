import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onNameLookup, resolveUniName } from "../src/index.js";

describe("UNAM MetaMask Snap onNameLookup", () => {
  it("resolves peni.uni on eip155:1 via live API/testnet fallback", async () => {
    const res = await onNameLookup({
      chainId: "eip155:1",
      domain: "peni.uni",
    });

    assert.ok(res, "expected resolution response");
    assert.equal(res.protocol, "UNAM (.uni)");
    assert.match(res.resolvedAddress!, /^0x[a-fA-F0-9]{40}$/);
  });

  it("normalizes domain without .uni suffix", async () => {
    const res = await onNameLookup({
      chainId: "eip155:1",
      domain: "peni",
    });

    assert.ok(res, "expected resolution response");
    assert.match(res.resolvedAddress!, /^0x[a-fA-F0-9]{40}$/);
  });

  it("returns null for non-existent domains", async () => {
    const res = await onNameLookup({
      chainId: "eip155:1",
      domain: "nonexistent-domain-xyz-12345.uni",
    });

    assert.equal(res, null);
  });

  it("returns null when domain is missing", async () => {
    const res = await onNameLookup({
      chainId: "eip155:1",
      address: "0x1111111111111111111111111111111111111111",
    });

    assert.equal(res, null);
  });

  it("resolves direct on-chain via mock RPC options", async () => {
    // Test custom endpoint routing with mock fetch
    const customResult = await resolveUniName("peni.uni", "eip155:1", {
      primaryApiUrl: "https://invalid-non-existent-api.xyz",
      fallbackApiUrl: "https://wip-near-615054f501a8.herokuapp.com",
    });

    assert.ok(customResult);
    assert.match(customResult.address, /^0x/);
  });
});
