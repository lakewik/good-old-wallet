import { JsonRpcProvider } from "ethers";
import { ChainId } from "./types.js";
import { CHAINS } from "./chains.js";
import { logger } from "./logger.js";

// Dynamically build providers only for chains that are defined in CHAINS
export const providers: Partial<Record<ChainId, JsonRpcProvider>> = Object.entries(CHAINS).reduce(
  (acc, [chainId, chainConfig]) => {
    const id = Number(chainId) as ChainId;
    acc[id] = new JsonRpcProvider(chainConfig.rpcUrl);
    return acc;
  },
  {} as Partial<Record<ChainId, JsonRpcProvider>>
);

// Log provider initialization
logger.info("Initializing Ethereum providers", {
  chains: Object.entries(providers).map(([id, provider]) => ({
    chainId: Number(id),
    rpcUrl: CHAINS[Number(id) as ChainId]?.rpcUrl,
  })),
});
