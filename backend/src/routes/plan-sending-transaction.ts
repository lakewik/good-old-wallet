import http from "http";
import { logger } from "../setup/logger.js";
import { planUsdcSend } from "../services/orchestrator.js";
import { CHAINS, type Address, ChainId } from "../index.js";
import type { UsdcSendPlan } from "../setup/types.js";

interface PlanRequest {
  sourceAddress: string;
  destinationAddress: string;
  amount: string; // Amount as a string (e.g., "100.5" for 100.5 USDC)
  tokenName: string; // "USDC" for now
}

interface PlanResponse {
  success: boolean;
  plan?: UsdcSendPlan | null;
  error?: string;
  message?: string;
}

function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Convert a human-readable amount (e.g., "100.5") to BigInt in smallest units
 * @param amount - Human-readable amount as string
 * @param decimals - Number of decimals (6 for USDC)
 * @returns BigInt amount in smallest units
 */
function parseAmount(amount: string, decimals: number): bigint {
  const parts = amount.split(".");
  const whole = parts[0] || "0";
  const fractional = parts[1] || "";

  // Pad fractional part to required decimals
  const fractionalPadded = fractional.padEnd(decimals, "0").slice(0, decimals);
  const amountStr = whole + fractionalPadded;
  
  return BigInt(amountStr);
}

/**
 * Serialize BigInt values in the plan to strings for JSON response
 * Always returns all legs in a consistent format
 */
function serializePlan(plan: UsdcSendPlan | null, requestedAmount: bigint): any {
  if (!plan) {
    return null;
  }

  if (plan.type === "single") {
    // For single-chain, create a legs array with one leg
    const leg = {
      chainId: plan.quote.chainId,
      chainName: CHAINS[plan.quote.chainId].name,
      amountUsdc: requestedAmount.toString(),
      gasCostUsdc: plan.quote.gasCostUsdc.toString(),
    };

    return {
      type: "single",
      legs: [leg],
      totalAmount: requestedAmount.toString(),
      totalGasCostUsdc: plan.quote.gasCostUsdc.toString(),
    };
  } else {
    // For multi-chain, return all legs
    const legs = plan.plan.legs.map((leg) => ({
      chainId: leg.chainId,
      chainName: CHAINS[leg.chainId].name,
      amountUsdc: leg.amountUsdc.toString(),
      gasCostUsdc: leg.gasCostUsdc.toString(),
    }));

    return {
      type: "multi",
      legs: legs,
      totalAmount: plan.plan.totalAmount.toString(),
      totalGasCostUsdc: plan.plan.totalGasCostUsdc.toString(),
    };
  }
}

/**
 * Read request body from HTTP request
 */
function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * @swagger
 * /plan-sending-transaction:
 *   post:
 *     summary: Plan a sending transaction
 *     description: Creates an optimal plan (single-chain or multi-chain) for sending USDC tokens
 *     tags: [Planning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlanRequest'
 *           example:
 *             sourceAddress: "0x13190e7028c5e7e70f87efe08a973c330b09f458"
 *             destinationAddress: "0x0A088759743B403eFB2e2F766f77Ec961f185e0f"
 *             amount: "100.5"
 *             tokenName: "USDC"
 *     responses:
 *       200:
 *         description: Successfully created plan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PlanResponse'
 *       400:
 *         description: Invalid request (missing fields, invalid address, unsupported token, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       405:
 *         description: Method not allowed
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
export async function handlePlanSendingTransactionRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Method not allowed",
        message: "Only POST method is supported",
      })
    );
    return;
  }

  try {
    const body = await readRequestBody(req);
    let requestData: PlanRequest;

    try {
      requestData = JSON.parse(body);
    } catch (parseError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        })
      );
      return;
    }

    // Validate required fields
    if (!requestData.sourceAddress || !requestData.destinationAddress || !requestData.amount || !requestData.tokenName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing required fields",
          message: "sourceAddress, destinationAddress, amount, and tokenName are required",
        })
      );
      return;
    }

    // Validate addresses
    if (!isValidAddress(requestData.sourceAddress)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid source address",
          message: "sourceAddress must be a valid Ethereum address (0x followed by 40 hex characters)",
        })
      );
      return;
    }

    if (!isValidAddress(requestData.destinationAddress)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid destination address",
          message: "destinationAddress must be a valid Ethereum address (0x followed by 40 hex characters)",
        })
      );
      return;
    }

    // Validate token name (only USDC supported for now)
    if (requestData.tokenName.toUpperCase() !== "USDC") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Unsupported token",
          message: `Only USDC is supported. Received: ${requestData.tokenName}`,
        })
      );
      return;
    }

    // Validate and parse amount
    const amountRegex = /^\d+(\.\d+)?$/;
    if (!amountRegex.test(requestData.amount)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid amount format",
          message: "Amount must be a positive number (e.g., '100' or '100.5')",
        })
      );
      return;
    }

    // Parse amount to BigInt (USDC has 6 decimals)
    const amountUsdc = parseAmount(requestData.amount, 6);

    if (amountUsdc === 0n) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid amount",
          message: "Amount must be greater than 0",
        })
      );
      return;
    }

    logger.info("Planning USDC send", {
      sourceAddress: requestData.sourceAddress,
      destinationAddress: requestData.destinationAddress,
      amount: requestData.amount,
      amountUsdc: amountUsdc.toString(),
      tokenName: requestData.tokenName,
    });

    // Call the planning function
    const plan = await planUsdcSend(
      requestData.sourceAddress as Address,
      requestData.destinationAddress as Address,
      amountUsdc
    );

    // Serialize the plan (convert BigInt to strings)
    // Pass the requested amount so we can include it in single-chain plans
    const serializedPlan = serializePlan(plan, amountUsdc);

    const response: PlanResponse = {
      success: true,
      plan: serializedPlan,
    };

    if (!plan) {
      response.message = "No viable plan found. Insufficient balance across all chains.";
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response, null, 2));
  } catch (error) {
    logger.error("Error planning USDC send", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
