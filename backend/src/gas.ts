import { ethers } from "ethers";
import { ChainId, Address } from "./types.js";
import { providers } from "./providers.js";
import { CHAINS } from "./chains.js";
import { logger } from "./logger.js";

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
  
  try {
    const provider = providers[chainId];
    const usdc = CHAINS[chainId].commonTokens.USDC;

    if (!usdc) {
      throw new Error(`USDC token not configured for chain ${chainId}`);
    }

    // For gas estimation, we use the provider directly (no signer needed)
    const contract = new ethers.Contract(
      usdc.address,
      ["function transfer(address to, uint256 value) returns (bool)"],
      provider,
    );

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
    
    logger.info("USDC transfer gas estimated", {
      chainId,
      from,
      to,
      amount: amount.toString(),
      gas: gas.toString(),
      gasPrice: gasPrice.toString(),
      totalCostNative: totalCost.toString(),
    });
    
    return { gas, gasPrice };
  } catch (error) {
    logger.error("Failed to estimate USDC transfer gas", error);
    throw error;
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
