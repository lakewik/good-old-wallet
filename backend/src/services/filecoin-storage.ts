import {
  RPC_URLS,
  Synapse,
} from "@filoz/synapse-sdk";
import { WarmStorageService } from "@filoz/synapse-sdk/warm-storage";
import { getPieces, getProvider } from "@filoz/synapse-core/warm-storage";
import { createPublicClient, http, type Address } from "viem";
import { filecoinCalibration } from "viem/chains";
import { ethers } from "ethers";
import { logger } from "../setup/logger.js";
import type { Address as AppAddress } from "../setup/types.js";

export interface LatestCIDResponse {
  cid: string;
  url: string;
  datasetId: string;
  pieceId?: string;
}

/**
 * Get the most recent CID from the first storage bucket (index 0) for a user address
 * @param userAddress - The user's wallet address
 * @returns The latest CID and its URL, or null if no CID found
 */
export async function getLatestCIDFromFirstBucket(
  userAddress: AppAddress
): Promise<LatestCIDResponse | null> {
  logger.info("Fetching latest CID from first storage bucket", { userAddress });

  try {
    // 1) Get RPC provider (we don't need private key, just the provider)
    const provider = new ethers.JsonRpcProvider(RPC_URLS.calibration.http);
    const clientAddress = userAddress as Address;

    // 2) Get WarmStorage contract address from SDK
    // We need a dummy private key to create Synapse instance just to get the address
    // The address is network-specific and doesn't depend on the private key
    const dummyPrivateKey = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const synapse = await Synapse.create({
      privateKey: dummyPrivateKey,
      rpcURL: RPC_URLS.calibration.http,
    });
    const warmStorageAddress = synapse.getWarmStorageAddress();

    const warmStorageService = await WarmStorageService.create(
      provider,
      warmStorageAddress as Address,
    );

    // 3) Get all data sets ("buckets") for this client address
    const dataSets = await warmStorageService.getClientDataSetsWithDetails(
      clientAddress,
    );

    if (dataSets.length === 0) {
      logger.info("No warm-storage datasets found for this address", { userAddress });
      return null;
    }

    logger.info(`Found ${dataSets.length} data sets for ${userAddress}`);

    // 4) Get the first dataset (index 0)
    const firstDataSet = dataSets[0];
    
    logger.info("Using first dataset", {
      clientDataSetId: firstDataSet.clientDataSetId.toString(),
      dataSetId: firstDataSet.dataSetId.toString(),
      providerId: firstDataSet.providerId,
    });

    // 5) Create a viem client for the core warm-storage functions
    const viemClient = createPublicClient({
      chain: filecoinCalibration,
      transport: http(RPC_URLS.calibration.http),
    });

    // 6) Get provider info to construct the full DataSet object
    const providerInfo = await getProvider(viemClient, {
      providerId: BigInt(firstDataSet.providerId),
    });

    // 7) Build the full DataSet object required by getPieces
    const fullDataSet = {
      clientDataSetId: firstDataSet.clientDataSetId,
      dataSetId: firstDataSet.dataSetId,
      providerId: firstDataSet.providerId,
      payer: firstDataSet.payer as Address,
      payee: firstDataSet.payee as Address,
      cdn: firstDataSet.withCDN,
      pdp: {
        serviceURL: providerInfo.pdp.serviceURL,
        minPieceSizeInBytes: providerInfo.pdp.minPieceSizeInBytes,
        maxPieceSizeInBytes: providerInfo.pdp.maxPieceSizeInBytes,
        ipniPiece: providerInfo.pdp.ipniPiece,
        ipniIpfs: providerInfo.pdp.ipniIpfs,
        storagePricePerTibPerDay: providerInfo.pdp.storagePricePerTibPerDay,
        minProvingPeriodInEpochs: providerInfo.pdp.minProvingPeriodInEpochs,
        location: providerInfo.pdp.location,
        paymentTokenAddress: providerInfo.pdp.paymentTokenAddress,
      },
      live: firstDataSet.isLive,
      managed: firstDataSet.isManaged,
      metadata: firstDataSet.metadata,
    };

    // 8) Get pieces (which contain CIDs)
    const result = await getPieces(viemClient, {
      address: warmStorageAddress as Address,
      dataSet: fullDataSet,
    });

    if (result.pieces.length === 0) {
      logger.info("No pieces found in the first dataset", { userAddress });
      return null;
    }

    // 9) Get the most recent piece
    // Pieces are typically ordered by ID (which increases over time), so the last one is the most recent
    // If pieces have an ID field, we can sort by it to ensure we get the latest
    let latestPiece = result.pieces[0];
    
    // If pieces have an ID field, find the one with the highest ID (most recent)
    if (result.pieces.length > 1) {
      latestPiece = result.pieces.reduce((latest, current) => {
        const latestId = latest.id ? Number(latest.id) : 0;
        const currentId = current.id ? Number(current.id) : 0;
        return currentId > latestId ? current : latest;
      });
    }

    logger.info("Latest CID found", {
      userAddress,
      cid: latestPiece.cid,
      url: latestPiece.url,
      pieceId: latestPiece.id?.toString(),
    });

    return {
      cid: latestPiece.cid,
      url: latestPiece.url,
      datasetId: firstDataSet.dataSetId.toString(),
      pieceId: latestPiece.id?.toString(),
    };
  } catch (error) {
    logger.error("Failed to fetch latest CID from storage bucket", {
      userAddress,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
