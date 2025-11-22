import { CrossChainBuilder, TransferAction, MultichainToken } from "@eil-protocol/sdk";
import { NetworkEnvironment } from "@eil-protocol/sdk/dist/sdk/builder/NetworkEnvironment.js";
import { Address } from "viem";
import { ChainId, CHAINS, type Address as AppAddress } from "../index.js";
import type { SplitPlan, SplitLeg } from "../setup/types.js";
import { logger } from "../setup/logger.js";

/**
 * EIL Payload structure for multi-chain USDC transfers
 */
export interface EILPayload {
  builder: CrossChainBuilder;
  batches: Array<{
    chainId: number;
    chainName: string;
    actions: Array<{
      type: "transfer";
      token: string;
      recipient: Address;
      amount: string;
    }>;
  }>;
}

/**
 * Create a MultichainToken for USDC based on configured chains
 * Note: This requires the NetworkEnvironment to have an SDK instance
 */
function createUsdcToken(networkEnv: NetworkEnvironment): MultichainToken {
  const deployments: Record<string, Address> = {};

  // Map chain IDs to EIL format (bigint) and collect USDC addresses
  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const chainId = Number(chainIdStr) as ChainId;
    const usdc = chain.commonTokens.USDC;
    if (usdc) {
      // EIL uses bigint chain IDs as strings in the deployments object
      deployments[chainId.toString()] = usdc.address as Address;
    }
  }

  // Access SDK through the network environment's chains client
  // The SDK should be available through CrossChainSdk instance
  // For now, we'll create the token directly using MultichainToken constructor
  // In practice, you'd use: networkEnv.sdk.createToken("USDC", deployments)
  return new MultichainToken("USDC", networkEnv.chains, deployments);
}

/**
 * Convert our ChainId to EIL's expected format (bigint)
 */
function toEilChainId(chainId: ChainId): bigint {
  return BigInt(chainId);
}

/**
 * Build EIL payload for multi-chain USDC transfer plan
 * 
 * This creates a CrossChainBuilder with batches for each chain in the plan.
 * Each batch contains a TransferAction to send USDC to the destination address.
 * 
 * @param plan - The multi-chain plan with legs for each chain
 * @param fromAddress - Source wallet address
 * @param toAddress - Destination wallet address
 * @param networkEnv - EIL NetworkEnvironment (must be initialized with chains)
 * @returns EIL payload with builder and batch information
 */
export async function buildEILPayload(
  plan: SplitPlan,
  fromAddress: AppAddress,
  toAddress: AppAddress,
  networkEnv: NetworkEnvironment
): Promise<EILPayload> {
  logger.info("Building EIL payload for multi-chain USDC transfer", {
    legsCount: plan.legs.length,
    totalAmount: plan.totalAmount.toString(),
    fromAddress,
    toAddress,
  });

  // Create CrossChainBuilder
  const builder = new CrossChainBuilder(networkEnv);

  // Create USDC token
  const usdcToken = createUsdcToken(networkEnv);

  const batches: EILPayload["batches"] = [];

  // Create a batch for each leg in the plan
  for (const leg of plan.legs) {
    const chainId = toEilChainId(leg.chainId);
    const chain = CHAINS[leg.chainId];

    logger.debug("Creating batch for chain", {
      chainId: leg.chainId,
      chainName: chain.name,
      amount: leg.amountUsdc.toString(),
    });

    // Start a new batch for this chain
    const batch = builder.startBatch(chainId);

    // Create transfer action for USDC
    const transferAction = new TransferAction({
      token: usdcToken,
      recipient: toAddress as Address,
      amount: leg.amountUsdc,
    });

    // Add the transfer action to the batch
    batch.addAction(transferAction);

    batches.push({
      chainId: leg.chainId,
      chainName: chain.name,
      actions: [
        {
          type: "transfer",
          token: "USDC",
          recipient: toAddress as Address,
          amount: leg.amountUsdc.toString(),
        },
      ],
    });

    // End the batch (returns to the builder)
    batch.endBatch();
  }

  logger.success("EIL payload built successfully", {
    batchesCount: batches.length,
    totalAmount: plan.totalAmount.toString(),
  });

  return {
    builder,
    batches,
  };
}

/**
 * Get UserOperations to sign from the EIL builder
 * This returns the UserOperations that need to be signed by the wallet
 * 
 * @param builder - The CrossChainBuilder with all batches configured
 * @returns Array of UserOperations to sign
 */
export async function getEILUserOpsToSign(
  builder: CrossChainBuilder
): Promise<any[]> {
  logger.info("Getting UserOperations to sign from EIL builder");
  
  try {
    const userOps = await builder.getUserOpsToSign();
    logger.success("UserOperations retrieved", {
      count: userOps.length,
    });
    return userOps;
  } catch (error) {
    logger.error("Failed to get UserOperations", error);
    throw error;
  }
}

/**
 * Build and sign the EIL payload
 * This creates a CrossChainExecutor ready for execution
 * 
 * Note: This requires the builder to have a smart account configured
 * 
 * @param builder - The CrossChainBuilder with all batches configured
 * @returns CrossChainExecutor ready for execution
 */
export async function buildAndSignEILPayload(
  builder: CrossChainBuilder
): Promise<any> {
  logger.info("Building and signing EIL payload");
  
  try {
    const executor = await builder.buildAndSign();
    logger.success("EIL payload built and signed successfully");
    return executor;
  } catch (error) {
    logger.error("Failed to build and sign EIL payload", error);
    throw error;
  }
}
