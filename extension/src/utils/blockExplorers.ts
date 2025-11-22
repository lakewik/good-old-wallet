/**
 * Block explorer URLs for popular EVM chains
 * Maps chain IDs to their respective block explorer transaction URLs
 */

export const BLOCK_EXPLORERS: Record<number, string> = {
  // Ethereum Mainnet
  1: "https://etherscan.io/tx/",
  
  // Optimism
  10: "https://optimistic.etherscan.io/tx/",
  
  // Binance Smart Chain
  56: "https://bscscan.com/tx/",
  
  // Polygon
  137: "https://polygonscan.com/tx/",
  
  // Arbitrum One
  42161: "https://arbiscan.io/tx/",
  
  // Avalanche C-Chain
  43114: "https://snowtrace.io/tx/",
  
  // Base
  8453: "https://basescan.org/tx/",
  
  // Linea
  59144: "https://lineascan.build/tx/",
  
  // zkSync Era
  324: "https://explorer.zksync.io/tx/",
  
  // Scroll
  534352: "https://scrollscan.com/tx/",
  
  // Mantle
  5000: "https://explorer.mantle.xyz/tx/",
  
  // Blast
  81457: "https://blastscan.io/tx/",
  
  // Celo
  42220: "https://celoscan.io/tx/",
  
  // Gnosis (xDAI)
  100: "https://gnosisscan.io/tx/",
  
  // Fantom
  250: "https://ftmscan.com/tx/",
  
  // Moonbeam
  1284: "https://moonscan.io/tx/",
  
  // Moonriver
  1285: "https://moonriver.moonscan.io/tx/",
  
  // Cronos
  25: "https://cronoscan.com/tx/",
  
  // Metis
  1088: "https://andromeda-explorer.metis.io/tx/",
  
  // Kava
  2222: "https://explorer.kava.io/tx/",
  
  // Evmos
  9001: "https://evm.evmos.org/tx/",
  
  // Aurora
  1313161554: "https://aurorascan.dev/tx/",
  
  // Harmony
  1666600000: "https://explorer.harmony.one/tx/",
  
  // Boba Network
  288: "https://bobascan.com/tx/",
  
  // Zora
  7777777: "https://explorer.zora.energy/tx/",
  
  // Mode
  34443: "https://explorer.mode.network/tx/",
  
  // Sepolia Testnet
  11155111: "https://sepolia.etherscan.io/tx/",
  
  // Base Sepolia Testnet
  84532: "https://sepolia.basescan.org/tx/",
  
  // Optimism Sepolia Testnet
  11155420: "https://sepolia-optimism.etherscan.io/tx/",
  
  // Arbitrum Sepolia Testnet
  421614: "https://sepolia.arbiscan.io/tx/",
};

/**
 * Get block explorer URL for a transaction on a specific chain
 * @param chainId - The chain ID
 * @param txHash - The transaction hash
 * @returns The full URL to view the transaction on the block explorer
 */
export function getBlockExplorerUrl(chainId: number, txHash: string): string {
  const base = BLOCK_EXPLORERS[chainId] || "https://etherscan.io/tx/";
  return `${base}${txHash}`;
}

