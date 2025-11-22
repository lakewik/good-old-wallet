import { ChainId, Address, ChainQuote, SplitPlan, SplitLeg, UsdcSendPlan } from "../setup/types.js";
import { CHAINS } from "../setup/chains.js";
import { getErc20Balance } from "../handlers/balances.js";
import { estimateUsdcTransferGas, gasCostInUsdc } from "../handlers/gas.js";
import { logger } from "../setup/logger.js";

// Scenario 1: Select best single chain for USDC send
export async function selectBestSingleChainForUsdcSend(
  fromWallet: Address,
  toWallet: Address,
  amountUsdc: bigint,
): Promise<ChainQuote | null> {
  logger.info("Starting single chain selection for USDC send", {
    fromWallet,
    toWallet,
    amountUsdc: amountUsdc.toString(),
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

    const balance = getErc20Balance(chainIdNum, usdc, fromWallet);
    logger.debug("Balance check for chain", {
      chainId: chainIdNum,
      balance: balance.toString(),
      required: amountUsdc.toString(),
      sufficient: balance >= amountUsdc,
    });

    if (balance < amountUsdc) {
      logger.debug("Insufficient balance on chain", {
        chainId: chainIdNum,
        balance: balance.toString(),
        required: amountUsdc.toString(),
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

      logger.info("Chain candidate found", {
        chainId: chainIdNum,
        gasCostUsdc: gasCostUsdc.toString(),
      });

      candidates.push({ chainId: chainIdNum, gasCostUsdc });
    } catch (error) {
      logger.warn("Failed to estimate gas for chain", {
        chainId: chainIdNum,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  if (!candidates.length) {
    logger.warn("No suitable chains found for single chain send", {
      fromWallet,
      amountUsdc: amountUsdc.toString(),
    });
    return null;
  }

  candidates.sort((a, b) => Number(a.gasCostUsdc - b.gasCostUsdc));
  const best = candidates[0];
  
  logger.info("Best single chain selected", {
    chainId: best.chainId,
    chainName: CHAINS[best.chainId].name,
    gasCostUsdc: best.gasCostUsdc.toString(),
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
  logger.info("Starting multi-chain USDC plan building", {
    fromWallet,
    toWallet,
    amountUsdc: amountUsdc.toString(),
  });

  type ChainInfo = {
    chainId: ChainId;
    balance: bigint;
    maxSpendable: bigint;
    gasCostUsdc: bigint;  // for "one transfer tx"
  };

  const perChain: ChainInfo[] = [];

  // 1. Collect per-chain info
  logger.debug("Collecting per-chain information");
  // Only iterate over chains that are actually configured in CHAINS
  for (const [chainIdStr, cfg] of Object.entries(CHAINS)) {
    const chainIdNum = Number(chainIdStr) as ChainId;
    logger.debug("Processing chain for multi-chain plan", {
      chainId: chainIdNum,
      chainName: cfg.name,
    });
    const usdc = cfg.commonTokens.USDC;
    if (!usdc) {
      logger.debug("Chain has no USDC token configured", { chainId: chainIdNum });
      continue;
    }

    const balance = getErc20Balance(chainIdNum, usdc, fromWallet);
    if (balance === 0n) {
      logger.debug("Zero balance on chain, skipping", { chainId: chainIdNum });
      continue;
    }

    // optional: keep small USDC buffer for future gas swaps, etc.
    const buffer = BigInt(0); // or e.g. 5 * 10^usdc.decimals
    const maxSpendable = balance > buffer ? balance - buffer : 0n;
    if (maxSpendable === 0n) {
      logger.debug("No spendable balance after buffer", {
        chainId: chainIdNum,
        balance: balance.toString(),
        buffer: buffer.toString(),
      });
      continue;
    }

    try {
      const { gas, gasPrice } = await estimateUsdcTransferGas(
        chainIdNum,
        fromWallet,
        toWallet,
        maxSpendable,
      );
      const nativeCost = gas * gasPrice;
      const gasCostUsdc = await gasCostInUsdc(chainIdNum, nativeCost);

      logger.info("Chain added to multi-chain plan", {
        chainId: chainIdNum,
        balance: balance.toString(),
        maxSpendable: maxSpendable.toString(),
        gasCostUsdc: gasCostUsdc.toString(),
      });

      perChain.push({
        chainId: chainIdNum,
        balance,
        maxSpendable,
        gasCostUsdc,
      });
    } catch (error) {
      logger.warn("Failed to estimate gas for chain in multi-chain plan", {
        chainId: chainIdNum,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  const totalAvailable = perChain.reduce(
    (acc, c) => acc + c.maxSpendable,
    0n,
  );

  logger.info("Total available balance calculated", {
    totalAvailable: totalAvailable.toString(),
    required: amountUsdc.toString(),
    sufficient: totalAvailable >= amountUsdc,
    chainsWithBalance: perChain.length,
  });

  if (totalAvailable < amountUsdc) {
    logger.warn("Insufficient total balance across all chains", {
      totalAvailable: totalAvailable.toString(),
      required: amountUsdc.toString(),
    });
    return null; // user actually doesn't have enough in total
  }

  // 2. Sort by "cheapest per transfer". You can refine this
  perChain.sort((a, b) => Number(a.gasCostUsdc - b.gasCostUsdc));
  logger.debug("Chains sorted by gas cost", {
    sortedChains: perChain.map(c => ({
      chainId: c.chainId,
      gasCostUsdc: c.gasCostUsdc.toString(),
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

    logger.debug("Adding leg to plan", {
      chainId: c.chainId,
      amountUsdc: take.toString(),
      gasCostUsdc: c.gasCostUsdc.toString(),
      remaining: remaining.toString(),
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

  logger.info("Multi-chain plan built successfully", {
    totalAmount: plan.totalAmount.toString(),
    totalGasCostUsdc: plan.totalGasCostUsdc.toString(),
    numberOfLegs: plan.legs.length,
    legs: plan.legs.map(l => ({
      chainId: l.chainId,
      chainName: CHAINS[l.chainId].name,
      amountUsdc: l.amountUsdc.toString(),
      gasCostUsdc: l.gasCostUsdc.toString(),
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
  logger.info("Starting automatic USDC send planning", {
    fromWallet,
    toWallet,
    amountUsdc: amountUsdc.toString(),
  });

  // First, try to find a single chain with sufficient balance
  logger.debug("Attempting single-chain approach first");
  const singleChainQuote = await selectBestSingleChainForUsdcSend(
    fromWallet,
    toWallet,
    amountUsdc,
  );

  if (singleChainQuote) {
    logger.info("Single-chain approach selected", {
      chainId: singleChainQuote.chainId,
      chainName: CHAINS[singleChainQuote.chainId].name,
      gasCostUsdc: singleChainQuote.gasCostUsdc.toString(),
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
    logger.info("Multi-chain approach selected", {
      numberOfLegs: multiChainPlan.legs.length,
      totalGasCostUsdc: multiChainPlan.totalGasCostUsdc.toString(),
      totalAmount: multiChainPlan.totalAmount.toString(),
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
  });
  return null;
}
