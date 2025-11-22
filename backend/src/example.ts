/**
 * Example: Using the Abstracted Wallet Orchestrator
 *
 * This file demonstrates how to use the orchestrator functions to:
 * 1. Automatically plan USDC sends (single or multi-chain)
 * 2. Manually select single-chain or multi-chain approaches
 * 3. Check balances across chains
 *
 * To run this example:
 * 1. Make sure your .env file has RPC endpoints configured
 * 2. Run: npm run dev src/example.ts
 *    or: npx tsx src/example.ts
 */

import {
  planUsdcSend,
  selectBestSingleChainForUsdcSend,
  buildMultiChainUsdcPlan,
  getNativeBalance,
  getErc20Balance,
  getNativeBalanceFromProvider,
  getErc20BalanceFromProvider,
  updateBalancesFromJson,
  ChainId,
  CHAINS,
  NATIVE_TOKEN_ADDRESS,
  type UsdcSendPlan,
} from "./index.js";

// Example wallet addresses (replace with real addresses)
// Note: These are example addresses - replace with actual wallet addresses in production
const fromWallet = "0x13190e7028c5e7e70f87efe08a973c330b09f458" as const;
const toWallet = "0x0A088759743B403eFB2e2F766f77Ec961f185e0f" as const;

async function example0_LoadBalancesFromJson() {
  console.log("\n=== Example 0: Loading Balances from JSON ===");
  console.log("This simulates loading balances from an external API");

  // Example JSON structure that would come from an external API
  // Format: { [chainId]: { [wallet]: { [tokenAddress]: "balance" } } }
  // Only include chains that are actually configured in CHAINS
  const balancesFromApi: Record<number, Record<string, Record<string, string>>> = {};

  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const chainId = Number(chainIdStr) as ChainId;
    balancesFromApi[chainId] = {
      [fromWallet]: {
        [NATIVE_TOKEN_ADDRESS]: "5000000000000000000", // 5 ETH (example)
        [chain.commonTokens.USDC.address]: "200000000", // 200 USDC (example)
      },
    };
  }

  // Update balances from JSON (this would be called when you receive data from API)
  updateBalancesFromJson(balancesFromApi);
  console.log("✅ Balances loaded from JSON structure");
  console.log("   Now getNativeBalance() and getErc20Balance() will read from this storage");
}

async function example1_AutomaticPlanning() {
  console.log("\n=== Example 1: Automatic Planning (Single or Multi-Chain) ===");

  // Try to send 0.01 USDC (6 decimals = 10000)
  const amountUsdc = BigInt("10000"); // 0.01 USDC

  const plan = await planUsdcSend(fromWallet, toWallet, amountUsdc);

  console.log("\n📋 Plan Details:");
  console.log(JSON.stringify(plan, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value, 2));

  if (!plan) {
    console.log("❌ No viable plan found. Insufficient balance across all chains.");
    return;
  }

  if (plan.type === "single") {
    console.log("✅ Single-chain approach selected!");
    console.log(`   Chain: ${CHAINS[plan.quote.chainId].name} (${plan.quote.chainId})`);
    console.log(`   Gas Cost: ${plan.quote.gasCostUsdc.toString()} USDC`);
    console.log(`   Total Amount: ${amountUsdc.toString()} USDC`);

    // You would execute the transfer on this single chain here
    // executeTransfer(plan.quote.chainId, fromWallet, toWallet, amountUsdc);
  } else {
    console.log("✅ Multi-chain approach selected!");
    console.log(`   Number of chains: ${plan.plan.legs.length}`);
    console.log(`   Total Amount: ${plan.plan.totalAmount.toString()} USDC`);
    console.log(`   Total Gas Cost: ${plan.plan.totalGasCostUsdc.toString()} USDC`);
    console.log("\n   Split across chains:");

    plan.plan.legs.forEach((leg, index) => {
      console.log(`   ${index + 1}. ${CHAINS[leg.chainId].name} (${leg.chainId}):`);
      console.log(`      Amount: ${leg.amountUsdc.toString()} USDC`);
      console.log(`      Gas Cost: ${leg.gasCostUsdc.toString()} USDC`);
    });

    // You would execute transfers on each chain here - we can use EIL here for sign one tx for multiple chains
    // NOTE :: this should be done on the wallet frontend side the signing of the transaction
    
    // Example: Build EIL payload for multi-chain execution
    // This allows signing one transaction that executes on multiple chains
    console.log("\n   📦 EIL Payload Construction:");
    console.log("   To execute this multi-chain plan with EIL:");
    console.log("   1. Use buildEILPayload() to create CrossChainBuilder");
    console.log("   2. Each leg becomes a batch in the builder");
    console.log("   3. Call builder.getUserOpsToSign() to get UserOperations");
    console.log("   4. Sign all UserOperations with the wallet");
    console.log("   5. Execute via CrossChainExecutor");
    console.log("\n   Example EIL payload structure:");
    const eilPayloadExample = {
      batches: plan.plan.legs.map((leg, idx) => ({
        chainId: leg.chainId,
        chainName: CHAINS[leg.chainId].name,
        actions: [
          {
            type: "transfer",
            token: "USDC",
            recipient: toWallet,
            amount: leg.amountUsdc.toString(),
          },
        ],
      })),
    };
    console.log(JSON.stringify(eilPayloadExample, null, 2));
    
    // Uncomment to actually build EIL payload (requires EIL SDK setup):
    // import { buildEILPayload } from "./services/eilBuilder.js";
    // import { CrossChainSdk } from "@eil-protocol/sdk";
    // const sdk = new CrossChainSdk(/* your config */);
    // const eilPayload = await buildEILPayload(
    //   plan.plan,
    //   fromWallet,
    //   toWallet,
    //   sdk.getNetworkEnv()
    // );
    // const userOps = await eilPayload.builder.getUserOpsToSign();
    // // Sign userOps with wallet, then execute
  }
}

async function example2_SingleChainOnly() {
  console.log("\n=== Example 2: Single-Chain Approach Only ===");

  const amountUsdc = BigInt("50000000"); // 50 USDC

  const quote = await selectBestSingleChainForUsdcSend(
    fromWallet,
    toWallet,
    amountUsdc,
  );

  if (!quote) {
    console.log("❌ No single chain has sufficient balance for this amount.");
    console.log("   Consider using planUsdcSend() for automatic multi-chain fallback.");
    return;
  }

  console.log("✅ Best single chain found:");
  console.log(`   Chain: ${CHAINS[quote.chainId].name} (${quote.chainId})`);
  console.log(`   Gas Cost: ${quote.gasCostUsdc.toString()} USDC`);
  console.log(`   Amount: ${amountUsdc.toString()} USDC`);
}

async function example3_MultiChainOnly() {
  console.log("\n=== Example 3: Multi-Chain Approach Only ===");

  const amountUsdc = BigInt("200000000"); // 200 USDC

  const plan = await buildMultiChainUsdcPlan(
    fromWallet,
    toWallet,
    amountUsdc,
  );

  if (!plan) {
    console.log("❌ Insufficient total balance across all chains.");
    return;
  }

  console.log("✅ Multi-chain plan created:");
  console.log(`   Total Amount: ${plan.totalAmount.toString()} USDC`);
  console.log(`   Total Gas Cost: ${plan.totalGasCostUsdc.toString()} USDC`);
  console.log(`   Number of legs: ${plan.legs.length}`);

  console.log("\n   Execution plan:");
  plan.legs.forEach((leg, index) => {
    console.log(`   ${index + 1}. Send ${leg.amountUsdc.toString()} USDC on ${CHAINS[leg.chainId].name}`);
    console.log(`      Gas cost: ${leg.gasCostUsdc.toString()} USDC`);
  });
}

async function example4_CheckBalances() {
  console.log("\n=== Example 4: Check Balances Across Chains ===");

  console.log(`Checking balances for wallet: ${fromWallet}\n`);

  // Check native balances from JSON storage
  console.log("Native Token Balances (from JSON storage):");
  // Only iterate over chains that are actually configured in CHAINS
  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const chainId = Number(chainIdStr) as ChainId;
    const balance = getNativeBalance(chainId, fromWallet);
    const balanceEth = Number(balance) / Math.pow(10, chain.native.decimals);
    console.log(`   ${chain.name}: ${balanceEth.toFixed(6)} ${chain.native.symbol}`);
  }

  // Check USDC balances from JSON storage
  console.log("\nUSDC Balances (from JSON storage):");
  // Only iterate over chains that are actually configured in CHAINS
  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const chainId = Number(chainIdStr) as ChainId;
    const usdc = chain.commonTokens.USDC;
    if (usdc) {
      const balance = getErc20Balance(chainId, usdc, fromWallet);
      const balanceUsdc = Number(balance) / Math.pow(10, usdc.decimals);
      console.log(`   ${chain.name}: ${balanceUsdc.toFixed(2)} USDC`);
    } else {
      console.log(`   ${chain.name}: USDC not configured`);
    }
  }

  // Example: Fetch from provider directly (bypassing JSON storage)
  console.log("\nFetching from provider directly (example):");
  try {
    const providerBalance = await getNativeBalanceFromProvider(
      ChainId.ETHEREUM,
      fromWallet,
    );
    const chain = CHAINS[ChainId.ETHEREUM];
    const balanceEth = Number(providerBalance) / Math.pow(10, chain.native.decimals);
    console.log(`   Ethereum (from provider): ${balanceEth.toFixed(6)} ${chain.native.symbol}`);
  } catch (error) {
    console.log(`   Error fetching from provider: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function example5_CompareApproaches() {
  console.log("\n=== Example 5: Compare Single vs Multi-Chain Costs ===");

  const amountUsdc = BigInt("150000000"); // 150 USDC

  // Try single-chain first
  const singleQuote = await selectBestSingleChainForUsdcSend(
    fromWallet,
    toWallet,
    amountUsdc,
  );

  // Try multi-chain
  const multiPlan = await buildMultiChainUsdcPlan(
    fromWallet,
    toWallet,
    amountUsdc,
  );

  console.log(`Amount to send: ${amountUsdc.toString()} USDC\n`);

  if (singleQuote) {
    console.log("Single-Chain Option:");
    console.log(`   Chain: ${CHAINS[singleQuote.chainId].name}`);
    console.log(`   Gas Cost: ${singleQuote.gasCostUsdc.toString()} USDC`);
    console.log(`   Number of transactions: 1`);
  } else {
    console.log("Single-Chain Option: Not available (insufficient balance)");
  }

  if (multiPlan) {
    console.log("\nMulti-Chain Option:");
    console.log(`   Total Gas Cost: ${multiPlan.totalGasCostUsdc.toString()} USDC`);
    console.log(`   Number of transactions: ${multiPlan.legs.length}`);
    console.log(`   Chains: ${multiPlan.legs.map(l => CHAINS[l.chainId].name).join(", ")}`);

    if (singleQuote) {
      const savings = singleQuote.gasCostUsdc - multiPlan.totalGasCostUsdc;
      if (savings > 0n) {
        console.log(`\n💰 Multi-chain saves ${savings.toString()} USDC in gas costs!`);
      } else if (savings < 0n) {
        console.log(`\n⚠️  Single-chain is cheaper by ${(-savings).toString()} USDC`);
      } else {
        console.log(`\n⚖️  Both approaches have the same gas cost`);
      }
    }
  } else {
    console.log("\nMulti-Chain Option: Not available (insufficient total balance)");
  }
}

// Main execution
async function main() {
  console.log("🚀 Abstracted Wallet Orchestrator Examples\n");
  console.log("=" .repeat(60));

  try {
    // First, load balances from JSON (simulating API call)
    await example0_LoadBalancesFromJson();

    // Run examples
    await example1_AutomaticPlanning();
    // await example2_SingleChainOnly();
    // await example3_MultiChainOnly();
    // await example4_CheckBalances();
    // await example5_CompareApproaches();

    console.log("\n" + "=".repeat(60));
    console.log("✅ All examples completed!");
  } catch (error) {
    console.error("\n❌ Error running examples:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  }
}

// Run if this file is executed directly
// This will run when: npx tsx src/example.ts or npm run dev src/example.ts
main().catch(console.error);

export {
  example0_LoadBalancesFromJson,
  example1_AutomaticPlanning,
  example2_SingleChainOnly,
  example3_MultiChainOnly,
  example4_CheckBalances,
  example5_CompareApproaches,
};
