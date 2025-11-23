import { ChainId, Address, ChainQuote, SplitPlan, SplitLeg, UsdcSendPlan } from "../setup/types.js";
import { CHAINS } from "../setup/chains.js";
import { getErc20Balance } from "../handlers/get-balances.js";
import { estimateUsdcTransferGas, gasCostInUsdc } from "../handlers/estimate-gas.js";
import { logger } from "../setup/logger.js";

/**
 * Format a BigInt amount to human-readable format with specified decimals
 * @param amount - Amount in smallest unit (e.g., wei for ETH, smallest unit for USDC)
 * @param decimals - Number of decimals (e.g., 18 for ETH, 6 for USDC)
 * @returns Formatted string with proper decimal places
 */
function formatAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) {
    return "0";
  }
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.replace(/0+$/, "");
  return `${whole}.${trimmed}`;
}

// Scenario 1: Select best single chain for USDC send
export async function selectBestSingleChainForUsdcSend(
  fromWallet: Address,
  toWallet: Address,
  amountUsdc: bigint,
): Promise<ChainQuote | null> {
  const amountUsdcFormatted = formatAmount(amountUsdc, 6);
  logger.info("Starting single chain selection for USDC send", {
    fromWallet,
    toWallet,
    amountUsdc: amountUsdc.toString(),
    amountUsdcFormatted,
  });

  const candidates: ChainQuote[] = [];

  // Only iterate over chains that are actually configured in CHAINS
  for (const [chainIdStr, cfg] of Object.entries(CHAINS)) {
    const chainIdNum = Number(chainIdStr) as ChainId;
    logger.debug("Evaluating chain for single chain send", {
      chainId: chainIdNum,
      chainName: cfg.name,
    });
    const usdc = cfg.commonTokens.USDC;
    if (!usdc) {
      logger.debug("Chain has no USDC token configured", { chainId: chainIdNum });
      continue;
    }

    const balance = await getErc20Balance(chainIdNum, usdc, fromWallet);
    const balanceFormatted = formatAmount(balance, 6);
    const amountUsdcFormatted = formatAmount(amountUsdc, 6);
    logger.debug("Balance check for chain", {
      chainId: chainIdNum,
      balance: balance.toString(),
      balanceFormatted,
      required: amountUsdc.toString(),
      requiredFormatted: amountUsdcFormatted,
      sufficient: balance >= amountUsdc,
    });

    if (balance < amountUsdc) {
      logger.debug("Insufficient balance on chain", {
        chainId: chainIdNum,
        balance: balance.toString(),
        balanceFormatted,
        required: amountUsdc.toString(),
        requiredFormatted: amountUsdcFormatted,
      });
      continue;
    }

    try {
      const { gas, gasPrice } = await estimateUsdcTransferGas(
        chainIdNum,
        fromWallet,
        toWallet,
        amountUsdc,
      );
      const nativeCost = gas * gasPrice;
      const gasCostUsdc = await gasCostInUsdc(chainIdNum, nativeCost);
      const gasCostUsdcFormatted = formatAmount(gasCostUsdc, 6);

      logger.success("Chain candidate found", {
        chainId: chainIdNum,
        chainName: cfg.name,
        estimatedGas: gas.toString(),
        gasPrice: gasPrice.toString(),
        gasCostUsdc: gasCostUsdc.toString(),
        gasCostUsdcFormatted,
      });

      candidates.push({ chainId: chainIdNum, gasCostUsdc });
    } catch (error) {
      // Gas estimation failed - already logged in gas.ts, just note we're skipping
      // No need to log again to avoid duplication
      continue;
    }
  }

  if (!candidates.length) {
    const amountUsdcFormatted = formatAmount(amountUsdc, 6);
    logger.warn("No suitable chains found for single chain send", {
      fromWallet,
      amountUsdc: amountUsdc.toString(),
      amountUsdcFormatted,
    });
    return null;
  }

  candidates.sort((a, b) => Number(a.gasCostUsdc - b.gasCostUsdc));
  const best = candidates[0];
  
  const gasCostUsdcFormatted = formatAmount(best.gasCostUsdc, 6);
  logger.success("Best single chain selected", {
    chainId: best.chainId,
    chainName: CHAINS[best.chainId].name,
    gasCostUsdc: best.gasCostUsdc.toString(),
    gasCostUsdcFormatted,
    totalCandidates: candidates.length,
  });

  return best;
}

// Scenario 2: User doesn't have 100 USDC on any single chain, but has enough in total
export async function buildMultiChainUsdcPlan(
  fromWallet: Address,
  toWallet: Address,
  amountUsdc: bigint,
): Promise<SplitPlan | null> {
  const amountUsdcFormatted = formatAmount(amountUsdc, 6);
  logger.info("Starting multi-chain USDC plan building", {
    fromWallet,
    toWallet,
    amountUsdc: amountUsdc.toString(),
    amountUsdcFormatted,
  });

  type ChainInfo = {
    chainId: ChainId;
    balance: bigint;
    maxSpendable: bigint;
    gasCostUsdc: bigint;  // for "one transfer tx"
  };

  // Step 1: Quick balance check - collect balances WITHOUT gas estimation
  // This allows fast rejection if total balance is insufficient
  logger.debug("Quick balance check across all chains");
  const quickBalanceCheck: Array<{ chainId: ChainId; balance: bigint; maxSpendable: bigint }> = [];
  let quickTotalAvailable = 0n;

  for (const [chainIdStr, cfg] of Object.entries(CHAINS)) {
    const chainIdNum = Number(chainIdStr) as ChainId;
    const usdc = cfg.commonTokens.USDC;
    if (!usdc) {
      continue;
    }

    const balance = await getErc20Balance(chainIdNum, usdc, fromWallet);
    if (balance === 0n) {
      continue;
    }

    const buffer = BigInt(0);
    const maxSpendable = balance > buffer ? balance - buffer : 0n;
    if (maxSpendable === 0n) {
      continue;
    }

    quickBalanceCheck.push({
      chainId: chainIdNum,
      balance,
      maxSpendable,
    });
    quickTotalAvailable += maxSpendable;
  }

  // Fast rejection: if total balance is insufficient, return immediately
  if (quickTotalAvailable < amountUsdc) {
    const quickTotalFormatted = formatAmount(quickTotalAvailable, 6);
    logger.warn("Insufficient total balance across all chains (quick check)", {
      totalAvailable: quickTotalAvailable.toString(),
      totalAvailableFormatted: quickTotalFormatted,
      required: amountUsdc.toString(),
      requiredFormatted: amountUsdcFormatted,
    });
    return null; // Return immediately without gas estimation
  }

  logger.info("Sufficient balance found, proceeding with gas estimation", {
    totalAvailable: quickTotalAvailable.toString(),
    totalAvailableFormatted: formatAmount(quickTotalAvailable, 6),
    chainsWithBalance: quickBalanceCheck.length,
  });

  // Step 2: Now estimate gas only for chains with sufficient balance
  const perChain: ChainInfo[] = [];

  for (const chainBalance of quickBalanceCheck) {
    const chainIdNum = chainBalance.chainId;
    const cfg = CHAINS[chainIdNum];
    
    logger.debug("Estimating gas for chain", {
      chainId: chainIdNum,
      chainName: cfg.name,
      maxSpendable: chainBalance.maxSpendable.toString(),
    });

    try {
      const { gas, gasPrice } = await estimateUsdcTransferGas(
        chainIdNum,
        fromWallet,
        toWallet,
        chainBalance.maxSpendable,
      );
      const nativeCost = gas * gasPrice;
      const gasCostUsdc = await gasCostInUsdc(chainIdNum, nativeCost);
      const balanceFormatted = formatAmount(chainBalance.balance, 6);
      const maxSpendableFormatted = formatAmount(chainBalance.maxSpendable, 6);
      const gasCostUsdcFormatted = formatAmount(gasCostUsdc, 6);

      logger.success("Chain added to multi-chain plan", {
        chainId: chainIdNum,
        chainName: cfg.name,
        balance: chainBalance.balance.toString(),
        balanceFormatted,
        maxSpendable: chainBalance.maxSpendable.toString(),
        maxSpendableFormatted,
        estimatedGas: gas.toString(),
        gasPrice: gasPrice.toString(),
        gasCostUsdc: gasCostUsdc.toString(),
        gasCostUsdcFormatted,
      });

      perChain.push({
        chainId: chainIdNum,
        balance: chainBalance.balance,
        maxSpendable: chainBalance.maxSpendable,
        gasCostUsdc,
      });
    } catch (error) {
      // Gas estimation failed - already logged in gas.ts, just skip this chain
      // No need to log again to avoid duplication
      continue;
    }
  }

  // Re-check total after gas estimation (in case some chains failed)
  const totalAvailable = perChain.reduce(
    (acc, c) => acc + c.maxSpendable,
    0n,
  );

  const totalAvailableFormatted = formatAmount(totalAvailable, 6);
  logger.info("Total available balance calculated", {
    totalAvailable: totalAvailable.toString(),
    totalAvailableFormatted,
    required: amountUsdc.toString(),
    requiredFormatted: amountUsdcFormatted,
    sufficient: totalAvailable >= amountUsdc,
    chainsWithBalance: perChain.length,
  });

  if (totalAvailable < amountUsdc) {
    const totalAvailableFormatted = formatAmount(totalAvailable, 6);
    const amountUsdcFormatted = formatAmount(amountUsdc, 6);
    logger.warn("Insufficient total balance across all chains", {
      totalAvailable: totalAvailable.toString(),
      totalAvailableFormatted,
      required: amountUsdc.toString(),
      requiredFormatted: amountUsdcFormatted,
    });
    return null; // user actually doesn't have enough in total
  }

  // 2. Sort by "cheapest per transfer". You can refine this
  perChain.sort((a, b) => Number(a.gasCostUsdc - b.gasCostUsdc));
  logger.debug("Chains sorted by gas cost", {
    sortedChains: perChain.map(c => ({
      chainId: c.chainId,
      gasCostUsdc: c.gasCostUsdc.toString(),
      gasCostUsdcFormatted: formatAmount(c.gasCostUsdc, 6),
    })),
  });

  // 3. Build greedy allocation
  const legs: SplitLeg[] = [];
  let remaining = amountUsdc;
  let totalGasCostUsdc = 0n;

  logger.debug("Building greedy allocation plan");
  for (const c of perChain) {
    if (remaining === 0n) break;
    const take = c.maxSpendable >= remaining ? remaining : c.maxSpendable;
    remaining -= take;

    const takeFormatted = formatAmount(take, 6);
    const gasCostUsdcFormatted = formatAmount(c.gasCostUsdc, 6);
    const remainingFormatted = formatAmount(remaining, 6);
    logger.debug("Adding leg to plan", {
      chainId: c.chainId,
      amountUsdc: take.toString(),
      amountUsdcFormatted: takeFormatted,
      gasCostUsdc: c.gasCostUsdc.toString(),
      gasCostUsdcFormatted,
      remaining: remaining.toString(),
      remainingFormatted,
    });

    // Note: gasCostUsdc is per tx; you might want to pro-rate if you send smaller than maxSpendable
    legs.push({
      chainId: c.chainId,
      amountUsdc: take,
      gasCostUsdc: c.gasCostUsdc,
    });
    totalGasCostUsdc += c.gasCostUsdc;
  }

  const plan: SplitPlan = {
    legs,
    totalAmount: amountUsdc - remaining,
    totalGasCostUsdc,
  };

  const totalAmountFormatted = formatAmount(plan.totalAmount, 6);
  const totalGasCostUsdcFormatted = formatAmount(plan.totalGasCostUsdc, 6);
  logger.success("Multi-chain plan built successfully", {
    totalAmount: plan.totalAmount.toString(),
    totalAmountFormatted,
    totalGasCostUsdc: plan.totalGasCostUsdc.toString(),
    totalGasCostUsdcFormatted,
    numberOfLegs: plan.legs.length,
    legs: plan.legs.map(l => ({
      chainId: l.chainId,
      chainName: CHAINS[l.chainId].name,
      amountUsdc: l.amountUsdc.toString(),
      amountUsdcFormatted: formatAmount(l.amountUsdc, 6),
      gasCostUsdc: l.gasCostUsdc.toString(),
      gasCostUsdcFormatted: formatAmount(l.gasCostUsdc, 6),
    })),
  });

  return plan;
}

// Scenario 3: Automatically choose between single-chain or multi-chain approach
// based on whether sufficient balance exists on one chain or needs to be summed from multiple chains
export async function planUsdcSend(
  fromWallet: Address,
  toWallet: Address,
  amountUsdc: bigint,
): Promise<UsdcSendPlan | null> {
  const amountUsdcFormatted = formatAmount(amountUsdc, 6);
  logger.info("Starting automatic USDC send planning", {
    fromWallet,
    toWallet,
    amountUsdc: amountUsdc.toString(),
    amountUsdcFormatted,
  });

  // Quick balance check: sum all USDC balances across chains
  // This allows fast rejection if total balance is insufficient
  logger.debug("Quick total balance check");
  let quickTotalBalance = 0n;
  for (const [chainIdStr, cfg] of Object.entries(CHAINS)) {
    const chainIdNum = Number(chainIdStr) as ChainId;
    const usdc = cfg.commonTokens.USDC;
    if (usdc) {
      const balance = await getErc20Balance(chainIdNum, usdc, fromWallet);
      quickTotalBalance += balance;
    }
  }

  // Fast rejection: if total balance is insufficient, return immediately
  if (quickTotalBalance < amountUsdc) {
    const quickTotalFormatted = formatAmount(quickTotalBalance, 6);
    logger.warn("Insufficient total balance across all chains (quick check)", {
      totalBalance: quickTotalBalance.toString(),
      totalBalanceFormatted: quickTotalFormatted,
      required: amountUsdc.toString(),
      requiredFormatted: amountUsdcFormatted,
    });
    return null; // Return immediately without any gas estimation
  }

  logger.info("Sufficient total balance found, proceeding with planning", {
    totalBalance: quickTotalBalance.toString(),
    totalBalanceFormatted: formatAmount(quickTotalBalance, 6),
    required: amountUsdc.toString(),
    requiredFormatted: amountUsdcFormatted,
  });

  // First, try to find a single chain with sufficient balance
  logger.debug("Attempting single-chain approach first");
  const singleChainQuote = await selectBestSingleChainForUsdcSend(
    fromWallet,
    toWallet,
    amountUsdc,
  );

  if (singleChainQuote) {
    const gasCostUsdcFormatted = formatAmount(singleChainQuote.gasCostUsdc, 6);
    logger.success("Single-chain approach selected", {
      chainId: singleChainQuote.chainId,
      chainName: CHAINS[singleChainQuote.chainId].name,
      gasCostUsdc: singleChainQuote.gasCostUsdc.toString(),
      gasCostUsdcFormatted,
    });
    return {
      type: "single",
      quote: singleChainQuote,
    };
  }

  // Single chain not available, try multi-chain approach
  logger.debug("Single-chain approach not viable, attempting multi-chain approach");
  const multiChainPlan = await buildMultiChainUsdcPlan(
    fromWallet,
    toWallet,
    amountUsdc,
  );

  if (multiChainPlan) {
    const totalGasCostUsdcFormatted = formatAmount(multiChainPlan.totalGasCostUsdc, 6);
    const totalAmountFormatted = formatAmount(multiChainPlan.totalAmount, 6);
    logger.success("Multi-chain approach selected", {
      numberOfLegs: multiChainPlan.legs.length,
      totalGasCostUsdc: multiChainPlan.totalGasCostUsdc.toString(),
      totalGasCostUsdcFormatted,
      totalAmount: multiChainPlan.totalAmount.toString(),
      totalAmountFormatted,
    });
    return {
      type: "multi",
      plan: multiChainPlan,
    };
  }

  // Neither approach is viable
  logger.warn("No viable plan found for USDC send", {
    fromWallet,
    toWallet,
    amountUsdc: amountUsdc.toString(),
    amountUsdcFormatted,
  });
  return null;
}
