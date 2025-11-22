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

    // Example: Build EIL payload and sign with private key
    // Uncomment to actually build EIL payload (requires EIL SDK setup):
    /*
    import { buildEILPayload } from "./services/eilBuilder.js";
    import { CrossChainSdk, defaultCrossChainConfig } from "@eil-protocol/sdk";
    import { createPublicClient, http } from "viem";
    import { privateKeyToAccount } from "viem/accounts";
    import { oneSignatureSignUserOps } from "@eil-protocol/sdk/dist/sdk/account/accountUtils.js";
    import type { ChainInfo } from "@eil-protocol/sdk/dist/sdk/config/index.js";

    // Example private key (NEVER use this in production - generate a new one!)
    // This is a well-known test private key from Hardhat - for demonstration only
    // In production, use: const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    const examplePrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

    // Create account from private key
    const account = privateKeyToAccount(examplePrivateKey);
    console.log(`   Using account: ${account.address}`);

    // Option 1: Use default EIL config (simpler, but may need to override chainInfos)
    // const sdk = new CrossChainSdk(defaultCrossChainConfig);

    // Option 2: Create custom config with your RPC URLs and EIL contract addresses
    // Create PublicClients for each chain using your RPC URLs
    const ethereumClient = createPublicClient({
      chain: {
        id: 1,
        name: "Ethereum",
        network: "homestead",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [CHAINS[ChainId.ETHEREUM].rpcUrl] } },
      },
      transport: http(),
    });

    const baseClient = createPublicClient({
      chain: {
        id: 8453,
        name: "Base",
        network: "base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [CHAINS[ChainId.BASE].rpcUrl] } },
      },
      transport: http(),
    });

    // Create ChainInfo array for EIL config
    // Note: Paymaster addresses can be omitted - they will be automatically added
    // by ensurePaymasterConfig() if missing. However, you can specify them explicitly:
    const chainInfos: ChainInfo[] = [
      {
        chainId: BigInt(ChainId.ETHEREUM),
        publicClient: ethereumClient,
        // paymasterAddress is optional - will be auto-added if missing
        paymasterAddress: "0x73Ca37d21Bb665df9899339ad31897747D782a7C" as `0x${string}`, // EIL paymaster on Ethereum
        entryPointAddress: "0x433709009B8330FDa32311DF1C2AFA402eD8D009" as `0x${string}`, // EIL entry point
        bundlerUrl: "https://vnet.erc4337.io/bundler/1", // ERC-4337 bundler for Ethereum
      },
      {
        chainId: BigInt(ChainId.BASE),
        publicClient: baseClient,
        // paymasterAddress is optional - will be auto-added if missing
        // This enables gas sponsorship on Base even if user has no ETH there
        paymasterAddress: "0xDfA767774B04046e2Ad3aFDB6474475De6F7be1C" as `0x${string}`, // EIL paymaster on Base
        entryPointAddress: "0x433709009B8330FDa32311DF1C2AFA402eD8D009" as `0x${string}`, // EIL entry point
        bundlerUrl: "https://vnet.erc4337.io/bundler/8453", // ERC-4337 bundler for Base
      },
    ];
    
    // Create EIL SDK configuration
    // Note: sourcePaymaster is optional - will be auto-added by ensurePaymasterConfig()
    const eilConfig = {
      expireTimeSeconds: 3600, // 1 hour - how long the UserOps are valid
      execTimeoutSeconds: 1800, // 30 minutes - execution timeout
      chainInfos: chainInfos,
      // sourcePaymaster is optional - will be automatically added if missing
      // This enables gas sponsorship for source chains
    };
    
    // Initialize EIL SDK
    const sdk = new CrossChainSdk(eilConfig);
    
    // Build EIL payload
    // ensurePaymasterConfig() will automatically add paymaster configuration if missing
    // This ensures gas sponsorship works even if paymaster wasn't explicitly configured
    const eilPayload = await buildEILPayload(
      plan.plan,
      fromWallet,
      toWallet,
      sdk.getNetworkEnv()
    );

    // Get UserOperations to sign
    const userOps = await eilPayload.builder.getUserOpsToSign();
    console.log(`\n   📝 UserOperations to sign: ${userOps.length}`);

    // Sign UserOperations with the private key
    // This uses EIL's cross-chain signature format (EIP-712)
    // One signature can cover all chains in the batch
    const signedUserOps = await oneSignatureSignUserOps(account, userOps);

    console.log("\n   ✅ Signed UserOperations:");
    console.log(`   Count: ${signedUserOps.length}`);
    signedUserOps.forEach((op, idx) => {
      console.log(`   ${idx + 1}. Chain ${op.chainId}: ${op.sender}`);
      console.log(`      Nonce: ${op.nonce}`);
      console.log(`      Has signature: ${!!op.signature}`);
    });

    // Now you can execute the signed UserOperations
    // Option A: Use the builder's buildAndSign (requires smart account setup)
    // const executor = await eilPayload.builder.buildAndSign();
    // await executor.execute();

    // Option B: Manually send each signed UserOp to its chain's bundler
    // for (const signedOp of signedUserOps) {
    //   await sendUserOperation(signedOp, bundlerUrl);
    // }

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
