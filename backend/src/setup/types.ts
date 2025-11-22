export enum ChainId {
  ETHEREUM = 1,
  OPTIMISM = 10,
  ARBITRUM_ONE = 42161,
  BASE = 8453,
}

export type Address = `0x${string}`;

export interface TokenConfig {
  symbol: string;
  decimals: number;
  address: Address;      // ERC-20 address, or special value for native
  isNative?: boolean;
}

export interface ChainConfig {
  id: ChainId;
  name: string;
  rpcUrl: string;
  native: TokenConfig;
  commonTokens: {
    // e.g. "USDC", "DAI" etc.
    [symbol: string]: TokenConfig;
  };
  // minimum native balance you want to keep for gas
  minNativeBalance: bigint;   // in wei
}

export const NATIVE_TOKEN_ADDRESS: Address =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Scenario 1
export interface ChainQuote {
  chainId: ChainId;
  gasCostUsdc: bigint;
}

// Scenario 2
export interface SplitLeg {
  chainId: ChainId;
  amountUsdc: bigint;
  gasCostUsdc: bigint;
}

export interface SplitPlan {
  legs: SplitLeg[];
  totalAmount: bigint;
  totalGasCostUsdc: bigint;
}

// Unified result type for automatic single/multi-chain selection
export type UsdcSendPlan =
  | { type: "single"; quote: ChainQuote }
  | { type: "multi"; plan: SplitPlan };
