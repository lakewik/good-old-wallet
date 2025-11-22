import { 
  CrossChainBuilder, 
  TransferAction, 
  MultichainToken,
  NetworkEnvironment,
  type CrossChainConfig,
  type ChainInfo,
} from "@eil-protocol/sdk";
import { Address, type PaymasterActions, type GetPaymasterDataParameters, type GetPaymasterDataReturnType, type GetPaymasterStubDataParameters, type GetPaymasterStubDataReturnType } from "viem";
import { ChainId, CHAINS, type Address as AppAddress } from "../index.js";
import type { SplitPlan, SplitLeg } from "../setup/types.js";
import { logger } from "../setup/logger.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Load EIL deployment addresses from deployment.json
 * 
 * Tries multiple paths:
 * 1. From node_modules (development)
 * 2. From dist/assets (if bundled)
 * 3. Fallback to hardcoded addresses
 * 
 * File location: node_modules/@eil-protocol/sdk/dist/assets/deployment.json
 */
function loadEILDeployments(): any[] {
  const possiblePaths = [
    // Path 1: From source directory (development)
    join(__dirname, "../../node_modules/@eil-protocol/sdk/dist/assets/deployment.json"),
    // Path 2: From dist directory (after build)
    join(__dirname, "../node_modules/@eil-protocol/sdk/dist/assets/deployment.json"),
    // Path 3: Relative to project root
    join(process.cwd(), "node_modules/@eil-protocol/sdk/dist/assets/deployment.json"),
  ];

  for (const deploymentPath of possiblePaths) {
    try {
      const deploymentData = readFileSync(deploymentPath, "utf-8");
      const parsed = JSON.parse(deploymentData);
      logger.info("Successfully loaded EIL deployment.json", {
        path: deploymentPath,
        chainsCount: parsed.length,
      });
      return parsed;
    } catch (error) {
      // Try next path
      continue;
    }
  }

  // Fallback to known addresses from deployment.json if file can't be found
  logger.warn("Failed to load EIL deployment.json from any path, using fallback addresses");
  return [
    {
      chainId: 1,
      paymaster: "0x73Ca37d21Bb665df9899339ad31897747D782a7C",
      sourcePaymaster: "0xc7F3D98ed15c483C0f666d9F3EA0Dc7abEe77ca2",
      entryPoint: "0x433709009B8330FDa32311DF1C2AFA402eD8D009",
      bundlerUrl: "https://vnet.erc4337.io/bundler/1",
    },
    {
      chainId: 8453,
      paymaster: "0xDfA767774B04046e2Ad3aFDB6474475De6F7be1C",
      sourcePaymaster: "0xc7F3D98ed15c483C0f666d9F3EA0Dc7abEe77ca2",
      entryPoint: "0x433709009B8330FDa32311DF1C2AFA402eD8D009",
      bundlerUrl: "https://vnet.erc4337.io/bundler/8453",
    },
  ];
}

/**
 * Get EIL deployment info for a specific chain
 */
function getEILDeploymentForChain(chainId: ChainId): any | null {
  const deployments = loadEILDeployments();
  return deployments.find((d) => d.chainId === chainId) || null;
}

/**
 * Create a simple PaymasterActions implementation for source chain paymaster
 * This implements the PaymasterActions interface from viem
 */
function createSourcePaymaster(address: Address): PaymasterActions {
  const getPaymasterStubData = async (
    parameters: GetPaymasterStubDataParameters
  ): Promise<GetPaymasterStubDataReturnType> => {
    return {
      paymaster: address,
      paymasterVerificationGasLimit: 50000n,
      paymasterPostOpGasLimit: 0n,
      paymasterData: '0x' as `0x${string}`,
    };
  };

  return {
    async getPaymasterData(parameters: GetPaymasterDataParameters): Promise<GetPaymasterDataReturnType> {
      return getPaymasterStubData(parameters);
    },
    getPaymasterStubData,
  };
}

/**
 * Ensure paymaster configuration is present in CrossChainConfig
 * If sourcePaymaster is missing, it will be added using EIL deployment addresses
 * If ChainInfo entries are missing paymasterAddress, they will be updated
 * 
 * @param config - The CrossChainConfig to enhance
 * @returns Enhanced CrossChainConfig with paymaster configuration
 */
export function ensurePaymasterConfig(config: CrossChainConfig): CrossChainConfig {
  const deployments = loadEILDeployments();
  
  // Find Ethereum L1 deployment for sourcePaymaster
  const ethereumDeployment = deployments.find((d) => d.chainId === 1);
  const sourcePaymasterAddress = ethereumDeployment?.sourcePaymaster || 
    "0xc7F3D98ed15c483C0f666d9F3EA0Dc7abEe77ca2"; // Fallback address

  // Enhance ChainInfo entries with paymaster addresses if missing
  const enhancedChainInfos: ChainInfo[] = config.chainInfos.map((chainInfo) => {
    // If paymasterAddress is missing or zero address, add it
    if (!chainInfo.paymasterAddress || chainInfo.paymasterAddress === "0x0000000000000000000000000000000000000000") {
      const deployment = deployments.find((d) => Number(d.chainId) === Number(chainInfo.chainId));
      
      if (deployment?.paymaster) {
        logger.info("Adding paymaster address to ChainInfo", {
          chainId: chainInfo.chainId.toString(),
          paymasterAddress: deployment.paymaster,
        });
        
        return {
          ...chainInfo,
          paymasterAddress: deployment.paymaster as Address,
          // Also update entryPoint if missing
          entryPointAddress: chainInfo.entryPointAddress || (deployment.entryPoint as Address),
          // Update bundlerUrl if missing
          bundlerUrl: chainInfo.bundlerUrl || deployment.bundlerUrl,
        };
      }
    }
    
    return chainInfo;
  });

  // Add sourcePaymaster if missing
  let enhancedConfig: CrossChainConfig = {
    ...config,
    chainInfos: enhancedChainInfos,
  };

  if (!config.sourcePaymaster) {
    logger.info("Adding sourcePaymaster to CrossChainConfig", {
      sourcePaymasterAddress,
    });
    
    enhancedConfig = {
      ...enhancedConfig,
      sourcePaymaster: createSourcePaymaster(sourcePaymasterAddress as Address),
    };
  }

  return enhancedConfig;
}

/**
 * Build EIL payload for multi-chain USDC transfer plan
 * 
 * This creates a CrossChainBuilder with batches for each chain in the plan.
 * Each batch contains a TransferAction to send USDC to the destination address.
 * 
 * **Gas Sponsorship Scenario:**
 * EIL can handle cases where the user has no native token (gas) on a destination chain:
 * 1. **Paymaster Sponsorship**: EIL paymasters can sponsor gas fees for UserOperations.
 *    The paymaster on the destination chain (e.g., Base) can pay for gas even if the
 *    user has no ETH on that chain. Payment can be made in tokens (USDC) or through vouchers.
 * 
 * 2. **Voucher System**: EIL can use vouchers to move native tokens (ETH) from one chain
 *    to another, then use that ETH for gas on the destination chain.
 * 
 * Example scenario:
 * - User has ETH only on Ethereum L1, none on Base
 * - Plan: Send 200 USDC on L1, 150 USDC on Base
 * - Solution: EIL paymaster on Base sponsors the Base transaction gas
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

  // Ensure paymaster configuration is present
  // This will add paymaster addresses and sourcePaymaster if they're missing
  const enhancedConfig = ensurePaymasterConfig(networkEnv.input);
  
  // Check if config was actually enhanced (sourcePaymaster added or ChainInfo updated)
  const wasEnhanced = 
    (!networkEnv.input.sourcePaymaster && enhancedConfig.sourcePaymaster) ||
    enhancedConfig.chainInfos.some((chainInfo, idx) => {
      const original = networkEnv.input.chainInfos[idx];
      return !original?.paymasterAddress && chainInfo.paymasterAddress;
    });
  
  // If config was enhanced, create a new NetworkEnvironment
  let finalNetworkEnv = networkEnv;
  if (wasEnhanced) {
    logger.info("Paymaster configuration was enhanced, creating new NetworkEnvironment", {
      sourcePaymasterAdded: !!enhancedConfig.sourcePaymaster && !networkEnv.input.sourcePaymaster,
      chainsWithPaymaster: enhancedConfig.chainInfos.filter(c => c.paymasterAddress).length,
    });
    finalNetworkEnv = new NetworkEnvironment(enhancedConfig);
  }

  // Create CrossChainBuilder
  const builder = new CrossChainBuilder(finalNetworkEnv);

  // Create USDC token
  const usdcToken = createUsdcToken(finalNetworkEnv);

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
    // Note: EIL paymaster (configured in NetworkEnvironment) will automatically
    // sponsor gas fees for this batch if the user has no native token on this chain.
    // The paymaster can accept payment in tokens (USDC) or through vouchers.
    const batch = builder.startBatch(chainId);

    // Create transfer action for USDC
    const transferAction = new TransferAction({
      token: usdcToken,
      recipient: toAddress as Address,
      amount: leg.amountUsdc,
    });

    // Add the transfer action to the batch
    // When built, EIL will create a UserOperation with paymaster sponsorship
    // if the user lacks native token balance on this chain
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
