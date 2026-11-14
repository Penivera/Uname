/**
 * Mock Wallet Integration Example
 * Demonstrates how a Web3 wallet integrates @uname/resolver-sdk into its Send flow.
 */

import { UnameResolver } from "../src/index.js";

async function main() {
  const resolver = new UnameResolver();

  console.log("=== Web3 Wallet Recipient Input Simulation ===\n");

  const testInputs = [
    { input: "peni.uni", chain: "ethereum", chainId: 1 },
    { input: "peni.uni", chain: "base", chainId: 8453 },
    { input: "alice.uni", chain: "arbitrum", chainId: 42161 },
    { input: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", chain: "ethereum", chainId: 1 },
  ];

  for (const { input, chain, chainId } of testInputs) {
    console.log(`[Wallet UI] User entered recipient: "${input}" on chain ${chain} (${chainId})`);

    if (input.endsWith(".uni")) {
      console.log(`  🔍 Detected .uni domain! Resolving via UnameResolver...`);
      const address = await resolver.resolveAddress(input, chainId);

      if (address) {
        console.log(`  ✅ Successfully resolved:`);
        console.log(`     Target Address: ${address}`);
        console.log(`     Display Badge:  Verified [${input}]`);
      } else {
        console.log(`  ❌ Resolution returned null: domain is unregistered on this network.`);
      }
    } else if (input.startsWith("0x")) {
      console.log(`  ℹ️ Raw EVM hex address detected. Using directly.`);
    }

    console.log("");
  }
}

main().catch(console.error);
