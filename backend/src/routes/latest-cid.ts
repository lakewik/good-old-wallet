import http from "http";
import { logger } from "../setup/logger.js";
import { getLatestCIDFromFirstBucket } from "../services/filecoin-storage.js";
import type { Address } from "../setup/types.js";

interface LatestCIDResponse {
  success: boolean;
  address: Address;
  cid?: string;
  url?: string;
  datasetId?: string;
  pieceId?: string;
  error?: string;
  message?: string;
}

function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * @swagger
 * /latest-cid/{address}:
 *   get:
 *     summary: Get latest CID from first storage bucket
 *     description: Returns the most recent CID (Content Identifier) from the first storage bucket (index 0) for a user address on Filecoin
 *     tags: [Storage]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: User wallet address
 *         example: "0x13190e7028c5e7e70f87efe08a973c330b09f458"
 *     responses:
 *       200:
 *         description: Successfully retrieved latest CID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 address:
 *                   type: string
 *                   example: "0x13190e7028c5e7e70f87efe08a973c330b09f458"
 *                 cid:
 *                   type: string
 *                   description: Content Identifier (CID)
 *                   example: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
 *                 url:
 *                   type: string
 *                   description: URL to access the CID
 *                   example: "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
 *                 datasetId:
 *                   type: string
 *                   description: Dataset ID
 *                 pieceId:
 *                   type: string
 *                   description: Piece ID
 *       400:
 *         description: Invalid address format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No storage bucket or CID found for this address
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 address:
 *                   type: string
 *                 message:
 *                   type: string
 *                   example: "No storage bucket found for this address"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function handleLatestCIDRequest(
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
    logger.info("Fetching latest CID for address", { address });

    const result = await getLatestCIDFromFirstBucket(address as Address);

    if (!result) {
      const response: LatestCIDResponse = {
        success: false,
        address: address as Address,
        message: "No storage bucket or CID found for this address",
      };
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    const response: LatestCIDResponse = {
      success: true,
      address: address as Address,
      cid: result.cid,
      url: result.url,
      datasetId: result.datasetId,
      pieceId: result.pieceId,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response, null, 2));
  } catch (error) {
    logger.error("Error fetching latest CID", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
