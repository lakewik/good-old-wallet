import { ChainId, ChainConfig, NATIVE_TOKEN_ADDRESS } from "./types.js";
import { logger } from "./logger.js";

export const CHAINS: Record<ChainId, ChainConfig> = {
  [ChainId.ETHEREUM]: {
    id: ChainId.ETHEREUM,
    name: "Ethereum",
    rpcUrl: process.env.RPC_ETHEREUM!,
    native: {
      symbol: "ETH",
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
      isNative: true,
    },
    commonTokens: {
      USDC: {
        symbol: "USDC",
        decimals: 6,
        // Ethereum USDC
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      },
    },
    // e.g. keep at least 0.03 ETH (~few swaps + sends)
    minNativeBalance: BigInt("30000000000000000"), // 0.03 ETH
  },

  // [ChainId.ARBITRUM_ONE]: {
  //   id: ChainId.ARBITRUM_ONE,
  //   name: "Arbitrum One",
  //   rpcUrl: process.env.RPC_ARBITRUM!,
  //   native: {
  //     symbol: "ETH",
  //     decimals: 18,
  //     address: NATIVE_TOKEN_ADDRESS,
  //     isNative: true,
  //   },
  //   commonTokens: {
  //     USDC: {
  //       symbol: "USDC",
  //       decimals: 6,
  //       // Native USDC on Arbitrum One
  //       address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  //     },
  //   },
  //   minNativeBalance: BigInt("5000000000000000"), // 0.005 ETH
  // },

  [ChainId.BASE]: {
    id: ChainId.BASE,
    name: "Base",
    rpcUrl: process.env.RPC_BASE!,
    native: {
      symbol: "ETH",
      decimals: 18,
      address: NATIVE_TOKEN_ADDRESS,
      isNative: true,
    },
    commonTokens: {
      USDC: {
        symbol: "USDC",
        decimals: 6,
        // Native USDC on Base
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      },
    },
    minNativeBalance: BigInt("3000000000000000"), // 0.003 ETH
  },

  // [ChainId.OPTIMISM]: {
  //   id: ChainId.OPTIMISM,
  //   name: "Optimism",
  //   rpcUrl: process.env.RPC_OPTIMISM!,
  //   native: {
  //     symbol: "ETH",
  //     decimals: 18,
  //     address: NATIVE_TOKEN_ADDRESS,
  //     isNative: true,
  //   },
  //   commonTokens: {
  //     USDC: {
  //       symbol: "USDC",
  //       decimals: 6,
  //       // Native USDC on OP Mainnet
  //       address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  //     },
  //   },
  //   minNativeBalance: BigInt("3000000000000000"), // 0.003 ETH
  // },
};

// Log chain initialization
logger.info("Initializing chain configurations", {
  chains: Object.values(CHAINS).map(c => ({
    id: c.id,
    name: c.name,
    hasRpcUrl: !!c.rpcUrl,
  })),
});
