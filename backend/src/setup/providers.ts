import { ethers } from "ethers";
import { ChainId } from "./types.js";
import { CHAINS } from "./chains.js";
import { logger } from "./logger.js";

export const providers: Record<ChainId, ethers.JsonRpcProvider> = {
  [ChainId.ETHEREUM]: new ethers.JsonRpcProvider(CHAINS[ChainId.ETHEREUM].rpcUrl),
  [ChainId.ARBITRUM_ONE]: new ethers.JsonRpcProvider(CHAINS[ChainId.ARBITRUM_ONE].rpcUrl),
  [ChainId.BASE]: new ethers.JsonRpcProvider(CHAINS[ChainId.BASE].rpcUrl),
  [ChainId.OPTIMISM]: new ethers.JsonRpcProvider(CHAINS[ChainId.OPTIMISM].rpcUrl),
  [ChainId.GNOSIS]: new ethers.JsonRpcProvider(CHAINS[ChainId.GNOSIS].rpcUrl),
};

// Log provider initialization
logger.info("Initializing Ethereum providers", {
  chains: Object.keys(providers).map(id => ({
    chainId: id,
    rpcUrl: CHAINS[Number(id) as ChainId].rpcUrl,
  })),
});
