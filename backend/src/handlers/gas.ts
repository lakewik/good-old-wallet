import { ethers } from "ethers";
import { ChainId, Address } from "../setup/types.js";
import { providers } from "../setup/providers.js";
import { CHAINS } from "../setup/chains.js";
import { logger } from "../setup/logger.js";

export async function estimateUsdcTransferGas(
  chainId: ChainId,
  from: Address,
  to: Address,
  amount: bigint,
): Promise<{ gas: bigint; gasPrice: bigint }> {
  logger.debug("Estimating USDC transfer gas", {
    chainId,
    from,
    to,
    amount: amount.toString(),
  });
  
  // Validate addresses before proceeding
  if (!ethers.isAddress(from)) {
    throw new Error(`Invalid 'from' address: ${from}`);
  }
  if (!ethers.isAddress(to)) {
    throw new Error(`Invalid 'to' address: ${to}`);
  }
  
  // Validate configuration first (these are unexpected errors that should be logged)
  const provider = providers[chainId];
  if (!provider) {
    const error = new Error(`Provider not configured for chain ${chainId}. Chain may be commented out in chains.ts`);
    logger.error("Failed to estimate USDC transfer gas - missing provider", {
      chainId,
      error: error.message,
    });
    throw error;
  }
  
  const chainConfig = CHAINS[chainId];
  if (!chainConfig) {
    const error = new Error(`Chain ${chainId} not configured`);
    logger.error("Failed to estimate USDC transfer gas - missing chain config", {
      chainId,
      error: error.message,
    });
    throw error;
  }
  
  const usdc = chainConfig.commonTokens.USDC;
  if (!usdc) {
    const error = new Error(`USDC token not configured for chain ${chainId}`);
    logger.error("Failed to estimate USDC transfer gas - missing USDC token", {
      chainId,
      error: error.message,
    });
    throw error;
  }

  // For gas estimation, we use the provider directly (no signer needed)
  const contract = new ethers.Contract(
    usdc.address,
    ["function transfer(address to, uint256 value) returns (bool)"],
    provider,
  );

  try {
    // Estimate gas for the transfer with the 'from' address specified
    // In ethers v6, we need to use populateTransaction and then estimateGas
    const populatedTx = await contract.transfer.populateTransaction(to, amount);
    const gas = await provider.estimateGas({
      ...populatedTx,
      from: from,
    });
    
    // Get fee data (gas price or max fee per gas for EIP-1559)
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? (feeData.maxFeePerGas ? feeData.maxFeePerGas : 0n);
    const totalCost = gas * gasPrice;
    
    logger.info("Gas estimation successful", {
      chainId,
      chainName: chainConfig.name,
      gas: gas.toString(),
      gasPrice: gasPrice.toString(),
      totalCostNative: totalCost.toString(),
      gasPriceGwei: gasPrice > 0n ? (gasPrice / BigInt(1e9)).toString() : "0",
    });
    
    return { gas, gasPrice };
  } catch (error) {
    // Gas estimation failures are expected in some scenarios (e.g., insufficient balance, RPC issues)
    // Log at info level so it's visible, but don't duplicate in orchestrator
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.info("Gas estimation failed", {
      chainId,
      chainName: chainConfig.name,
      reason: errorMessage,
    });
    // Re-throw with context for the caller
    throw new Error(`Gas estimation failed for chain ${chainId}: ${errorMessage}`);
  }
}

export async function gasCostInUsdc(
  chainId: ChainId,
  nativeAmountWei: bigint,
): Promise<bigint> {
  logger.warn("gasCostInUsdc called - not implemented", {
    chainId,
    nativeAmountWei: nativeAmountWei.toString(),
  });
  // Example: priceNativeInUsd * 1e6 / 1e18  (pseudo)
  // You can plug in a price oracle or cached off-chain price feed.
  // For now, just placeholder.
  throw new Error("Implement with real pricing");
}
