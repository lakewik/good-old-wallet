import { logger } from "../setup/logger.js";
import { CHAINS } from "../setup/chains.js";
import { ChainId, Address } from "../setup/types.js";

/**
 * SQD Network Router URLs for different chains
 * Based on: https://docs.sqd.ai/subsquid-network/reference/networks/
 */
const SQD_ROUTERS: Record<ChainId, string> = {
  [ChainId.ETHEREUM]: "https://rb05.sqd-archive.net",
  [ChainId.BASE]: "https://rb05.sqd-archive.net", // Base uses same router, different dataset
  // Add more chains as needed
};

/**
 * Dataset identifiers for SQD Network
 * These are base64-encoded dataset URLs
 */
const SQD_DATASETS: Record<ChainId, string> = {
  [ChainId.ETHEREUM]: "czM6Ly9ldGhlcmV1bS1tYWlubmV0", // base64("s3://ethereum-mainnet")
  [ChainId.BASE]: "czM6Ly9iYXNlLW1haW5uZXQ", // base64("s3://base-mainnet") - adjust as needed
};

export interface Transaction {
  hash: string;
  from?: string;
  to?: string;
  value?: string;
  blockNumber: number;
  blockHash: string;
  transactionIndex: number;
  gasPrice?: string;
  gasLimit?: string;
  gasUsed?: string;
  status?: number; // 1 = success, 0 = failure
  timestamp?: number;
}

interface SQDBlockResponse {
  header: {
    number: number;
    hash: string;
    parentHash: string;
    timestamp?: number;
  };
  transactions: Array<{
    hash: string;
    from?: string;
    to?: string;
    value?: string;
    transactionIndex: number;
    gasPrice?: string;
    gasLimit?: string;
    gasUsed?: string;
    status?: number;
  }>;
}

interface SQDQueryRequest {
  fromBlock: number;
  fields: {
    transaction?: {
      hash?: boolean;
      from?: boolean;
      to?: boolean;
      value?: boolean;
      transactionIndex?: boolean;
      gasPrice?: boolean;
      gasLimit?: boolean;
      gasUsed?: boolean;
      status?: boolean;
    };
    header?: {
      number?: boolean;
      hash?: boolean;
      timestamp?: boolean;
    };
  };
  transactions?: Array<{
    from?: string[];
    to?: string[];
  }>;
}

/**
 * Get worker URL for a specific block from SQD Network router
 * Based on: https://docs.sqd.ai/subsquid-network/reference/evm-api/
 */
async function getWorkerUrl(chainId: ChainId, blockNumber: number): Promise<string | null> {
  const router = SQD_ROUTERS[chainId];
  if (!router) {
    logger.warn(`SQD router not configured for chain ${chainId}`);
    return null;
  }

  try {
    // Router endpoint format: GET /${blockNumber}/worker
    // Block 0 is not available, so we use a recent block number or latest
    // For now, we'll try to get the latest worker if blockNumber is 0 or very small
    let workerUrl: string;
    
    if (blockNumber > 0) {
      // Try to get worker for specific block
      const response = await fetch(`${router}/${blockNumber}/worker`);
      if (response.ok) {
        workerUrl = await response.text();
        return workerUrl.trim();
      }
      // If specific block fails (404), fall back to latest
      logger.debug(`Worker not found for block ${blockNumber}, using latest`, {
        status: response.status,
      });
    }
    
    // Use latest worker as fallback or for block 0
    // Note: SQD Network might use different endpoint format - adjust if needed
    const latestResponse = await fetch(`${router}/latest/worker`);
    if (!latestResponse.ok) {
      // If /latest/worker doesn't work, try getting a recent block number
      // For Ethereum, try a recent block (e.g., 18M which is from 2023)
      const recentBlock = chainId === ChainId.ETHEREUM ? 18000000 : 1000000;
      logger.debug(`Trying recent block ${recentBlock} as fallback`);
      const recentResponse = await fetch(`${router}/${recentBlock}/worker`);
      if (!recentResponse.ok) {
        throw new Error(`HTTP error! status: ${latestResponse.status} (latest) and ${recentResponse.status} (recent)`);
      }
      workerUrl = await recentResponse.text();
    } else {
      workerUrl = await latestResponse.text();
    }
    
    return workerUrl.trim();
  } catch (error) {
    logger.error(`Failed to get worker URL for chain ${chainId} at block ${blockNumber}`, error);
    return null;
  }
}

/**
 * Query transactions from SQD Network worker
 */
async function queryTransactionsFromWorker(
  workerUrl: string,
  dataset: string,
  query: SQDQueryRequest
): Promise<SQDBlockResponse[]> {
  try {
    const queryUrl = `${workerUrl}/query/${dataset}`;
    const response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: SQDBlockResponse[] = await response.json();
    return data;
  } catch (error) {
    logger.error("Failed to query transactions from SQD worker", error);
    throw error;
  }
}

/**
 * Fetch transactions for an address from SQD Network
 * @param chainId - The chain ID
 * @param address - The wallet address to fetch transactions for
 * @param options - Query options
 * @returns Array of transactions
 */
export async function fetchTransactionsFromSQD(
  chainId: ChainId,
  address: Address,
  options: {
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
    direction?: "from" | "to" | "both"; // Filter by sender, receiver, or both
  } = {}
): Promise<Transaction[]> {
  // Use a reasonable default fromBlock if not provided (e.g., recent blocks)
  // Block 0 might not be available, so we'll use latest if fromBlock is 0
  const { fromBlock, toBlock, limit = 100, direction = "both" } = options;

  logger.info("Fetching transactions from SQD Network", {
    chainId,
    address,
    fromBlock: fromBlock ?? "latest",
    toBlock,
    limit,
    direction,
  });

  const dataset = SQD_DATASETS[chainId];
  if (!dataset) {
    logger.warn(`SQD dataset not configured for chain ${chainId}`);
    return [];
  }

  // Get worker URL - use latest if fromBlock is not specified or is 0
  const effectiveFromBlock = fromBlock && fromBlock > 0 ? fromBlock : undefined;
  const workerUrl = await getWorkerUrl(chainId, effectiveFromBlock ?? 0);
  if (!workerUrl) {
    logger.error(`Failed to get worker URL for chain ${chainId}`);
    return [];
  }

  // Build query request
  // If fromBlock is not specified, we'll query from a recent block
  // SQD Network requires fromBlock, so we'll use a reasonable default if not provided
  const queryFromBlock = fromBlock && fromBlock > 0 ? fromBlock : 0;
  const query: SQDQueryRequest = {
    fromBlock: queryFromBlock,
    fields: {
      transaction: {
        hash: true,
        from: true,
        to: true,
        value: true,
        transactionIndex: true,
        gasPrice: true,
        gasLimit: true,
        gasUsed: true,
        status: true,
      },
      header: {
        number: true,
        hash: true,
        timestamp: true,
      },
    },
    transactions: [],
  };

  // Add address filters based on direction
  const addressLower = address.toLowerCase();
  if (direction === "from" || direction === "both") {
    query.transactions!.push({ from: [addressLower] });
  }
  if (direction === "to" || direction === "both") {
    query.transactions!.push({ to: [addressLower] });
  }

  try {
    const blocks = await queryTransactionsFromWorker(workerUrl, dataset, query);
    
    // Flatten transactions from all blocks
    const transactions: Transaction[] = [];
    for (const block of blocks) {
      for (const tx of block.transactions) {
        if (transactions.length >= limit) {
          break;
        }

        // Apply block range filter if specified
        if (toBlock && block.header.number > toBlock) {
          continue;
        }

        transactions.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          blockNumber: block.header.number,
          blockHash: block.header.hash,
          transactionIndex: tx.transactionIndex,
          gasPrice: tx.gasPrice,
          gasLimit: tx.gasLimit,
          gasUsed: tx.gasUsed,
          status: tx.status,
          timestamp: block.header.timestamp,
        });
      }

      if (transactions.length >= limit) {
        break;
      }
    }

    logger.info(`Fetched ${transactions.length} transactions from SQD Network`, {
      chainId,
      address,
      count: transactions.length,
    });

    return transactions;
  } catch (error) {
    logger.error("Failed to fetch transactions from SQD Network", error);
    return [];
  }
}

/**
 * Fetch transactions across multiple chains for an address
 */
export async function fetchTransactionsMultiChain(
  address: Address,
  options: {
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
    direction?: "from" | "to" | "both";
    chainIds?: ChainId[]; // If not specified, uses all configured chains
  } = {}
): Promise<Record<ChainId, Transaction[]>> {
  const { chainIds = Object.keys(CHAINS).map(Number) as ChainId[] } = options;

  const results: Record<ChainId, Transaction[]> = {} as Record<ChainId, Transaction[]>;

  // Fetch transactions for each chain in parallel
  const promises = chainIds.map(async (chainId) => {
    try {
      const transactions = await fetchTransactionsFromSQD(chainId, address, options);
      results[chainId] = transactions;
    } catch (error) {
      logger.error(`Failed to fetch transactions for chain ${chainId}`, error);
      results[chainId] = [];
    }
  });

  await Promise.all(promises);

  return results;
}
