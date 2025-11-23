import http from "http";
import { logger } from "../setup/logger.js";
import { fetchTransactionsFromSQD, fetchTransactionsMultiChain, type Transaction } from "../services/sqdTransactions.js";
import { CHAINS, type Address, ChainId } from "../index.js";

interface TransactionsResponse {
  success: boolean;
  address: Address;
  chainId?: ChainId;
  transactions: Transaction[];
  total: number;
  error?: string;
}

interface MultiChainTransactionsResponse {
  success: boolean;
  address: Address;
  transactions: Record<number, Transaction[]>;
  totals: Record<number, number>;
  error?: string;
}

function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Parse query parameters from URL
 */
function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryString = url.split("?")[1];
  if (!queryString) return params;

  for (const param of queryString.split("&")) {
    const [key, value] = param.split("=");
    if (key && value) {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return params;
}

/**
 * @swagger
 * /transactions/{address}:
 *   get:
 *     summary: Get transactions for an address
 *     description: Returns transactions for a wallet address from SQD Network. Can filter by chain, block range, and direction.
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Ethereum wallet address
 *         example: "0x13190e7028c5e7e70f87efe08a973c330b09f458"
 *       - in: query
 *         name: chainId
 *         schema:
 *           type: integer
 *         description: Specific chain ID to query (1 for Ethereum, 8453 for Base). If not provided, queries all chains.
 *         example: 1
 *       - in: query
 *         name: fromBlock
 *         schema:
 *           type: integer
 *         description: Starting block number. Default 0.
 *         example: 18000000
 *       - in: query
 *         name: toBlock
 *         schema:
 *           type: integer
 *         description: Ending block number. Optional.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum number of transactions to return. Default 100.
 *         example: 50
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [from, to, both]
 *         description: Filter transactions by direction - 'from' (sent), 'to' (received), or 'both' (default)
 *         example: both
 *     responses:
 *       200:
 *         description: Successfully retrieved transactions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransactionsResponse'
 *       400:
 *         description: Invalid address format or parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function handleTransactionsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  address: string
): Promise<void> {
  if (!isValidAddress(address)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Invalid address format",
        message: "Address must be a valid Ethereum address (0x followed by 40 hex characters)",
      })
    );
    return;
  }

  try {
    const url = req.url || "";
    const params = parseQueryParams(url);

    // Parse query parameters
    const chainIdParam = params.chainId ? Number(params.chainId) : undefined;
    const fromBlock = params.fromBlock ? Number(params.fromBlock) : undefined;
    const toBlock = params.toBlock ? Number(params.toBlock) : undefined;
    const limit = params.limit ? Number(params.limit) : 100;
    const direction = (params.direction as "from" | "to" | "both") || "both";

    // Validate chainId if provided
    if (chainIdParam !== undefined) {
      if (!CHAINS[chainIdParam as ChainId]) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Invalid chain ID",
            message: `Chain ID ${chainIdParam} is not configured`,
          })
        );
        return;
      }
    }

    logger.info("Fetching transactions", {
      address,
      chainId: chainIdParam,
      fromBlock,
      toBlock,
      limit,
      direction,
    });

    let response: TransactionsResponse | MultiChainTransactionsResponse;

    if (chainIdParam !== undefined) {
      // Single chain query
      const transactions = await fetchTransactionsFromSQD(
        chainIdParam as ChainId,
        address as Address,
        {
          fromBlock,
          toBlock,
          limit,
          direction,
        }
      );

      response = {
        success: true,
        address: address as Address,
        chainId: chainIdParam as ChainId,
        transactions,
        total: transactions.length,
      };
    } else {
      // Multi-chain query
      const multiChainResults = await fetchTransactionsMultiChain(address as Address, {
        fromBlock,
        toBlock,
        limit,
        direction,
      });

      const totals: Record<number, number> = {};
      for (const [chainId, txs] of Object.entries(multiChainResults)) {
        totals[Number(chainId)] = txs.length;
      }

      response = {
        success: true,
        address: address as Address,
        transactions: multiChainResults as Record<number, Transaction[]>,
        totals,
      };
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response, null, 2));
  } catch (error) {
    logger.error("Error fetching transactions", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
