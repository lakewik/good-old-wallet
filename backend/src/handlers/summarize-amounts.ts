import { Address, ChainId } from "../setup/types.js";
import { CHAINS } from "../setup/chains.js";
import { getNativeBalance } from "./get-balances.js";
import { formatBalance } from "../utils/format-balance.js";
import { getErc20Balance } from "./get-balances.js";

interface ChainBalance {
    chainId: number;
    chainName: string;
    native: {
      symbol: string;
      balance: string; // in wei
      balanceFormatted: string; // human readable
    };
    usdc: {
      balance: string; // in smallest unit (6 decimals)
      balanceFormatted: string; // human readable
    };
  }
  
interface SummarizedAmountsResponse {
    address: Address;
    chains: ChainBalance[];
    totals: {
      native: {
        totalWei: string;
        totalFormatted: string;
        symbol: string;
      };
      usdc: {
        totalSmallestUnit: string;
        totalFormatted: string;
      };
    };
  }
  
  export async function getSummarizedAmounts(address: Address): Promise<SummarizedAmountsResponse> {
    const chains: ChainBalance[] = [];
    let totalNativeWei = 0n;
    let totalUsdcSmallestUnit = 0n;
    let nativeSymbol = "ETH"; // default
  
    for (const chainIdValue of Object.values(ChainId)) {
      // Filter out string keys from numeric enum
      if (typeof chainIdValue !== "number") continue;
  
      const chainId = chainIdValue as ChainId;
      const chain = CHAINS[chainId];
  
      // Get native balance
      const nativeBalance = await getNativeBalance(chainId, address);
      const nativeFormatted = formatBalance(nativeBalance, chain.native.decimals);
      totalNativeWei += nativeBalance;
      nativeSymbol = chain.native.symbol;
  
      // Get USDC balance
      let usdcBalance = 0n;
      let usdcFormatted = "0";
      const usdcToken = chain.commonTokens.USDC;
      if (usdcToken) {
        usdcBalance = await getErc20Balance(chainId, usdcToken, address);
        usdcFormatted = formatBalance(usdcBalance, usdcToken.decimals);
        totalUsdcSmallestUnit += usdcBalance;
      }
  
      chains.push({
        chainId: chainId,
        chainName: chain.name,
        native: {
          symbol: chain.native.symbol,
          balance: nativeBalance.toString(),
          balanceFormatted: nativeFormatted,
        },
        usdc: {
          balance: usdcBalance.toString(),
          balanceFormatted: usdcFormatted,
        },
      });
    }
  
    return {
      address,
      chains,
      totals: {
        native: {
          totalWei: totalNativeWei.toString(),
          totalFormatted: formatBalance(totalNativeWei, 18), // Assuming all native tokens are 18 decimals
          symbol: nativeSymbol,
        },
        usdc: {
          totalSmallestUnit: totalUsdcSmallestUnit.toString(),
          totalFormatted: formatBalance(totalUsdcSmallestUnit, 6), // USDC has 6 decimals
        },
      },
    };
  }