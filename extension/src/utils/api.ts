/**
 * API service for interacting with the Abstracted Wallet API
 * Handles all API calls with proper error handling and type safety
 */

import { API_BASE_URL } from "../constants";

// API Response Types
export interface BalancesSummaryResponse {
  address: string;
  totals: {
    [tokenSymbol: string]: {
      totalWei?: string;
      totalFormatted: string;
      symbol?: string;
      totalSmallestUnit?: string;
    };
  };
  totalPortfolioValueUSD: string;
}

export interface AssetsResponse {
  address: string;
  chains: Array<{
    chainId: number;
    chainName: string;
    native: {
      symbol: string;
      balance: string;
      balanceFormatted: string;
    };
    usdc: {
      balance: string;
      balanceFormatted: string;
    };
  }>;
  totals: {
    native: {
      totalWei: string;
      totalFormatted: string;
      symbol: string;
    };
    usdc: {
      totalSmallestUnit: string;
      totalFormatted: string;
    };
  };
}

export interface PlanRequest {
  sourceAddress: string;
  destinationAddress: string;
  amount: string;
  tokenName: "USDC";
}

export interface SingleChainPlan {
  type: "single";
  quote: {
    chainId: number;
    chainName: string;
    gasCostUsdc: string;
  };
}

export interface MultiChainPlan {
  type: "multi";
  plan: {
    legs: Array<{
      chainId: number;
      chainName: string;
      amountUsdc: string;
      gasCostUsdc: string;
    }>;
    totalAmount: string;
    totalGasCostUsdc: string;
  };
}

export interface PlanResponse {
  success: boolean;
  plan: SingleChainPlan | MultiChainPlan | null;
  message?: string;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
}

// Normalized plan format for use in the UI
export interface NormalizedTransactionPlan {
  type: "multi" | "single";
  legs: Array<{
    chainId: number;
    chainName: string;
    amountUsdc: string;
    gasCostUsdc: string;
  }>;
  totalAmount: string;
  totalGasCostUsdc: string;
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorData?: ApiErrorResponse
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Helper function to handle API responses and errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  // Clone the response so we can read it multiple times if needed
  const clonedResponse = response.clone();

  // Check content type to ensure we're getting JSON
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  // First, get the text to check if it's HTML (ngrok warning page)
  const text = await clonedResponse.text();

  // Check if we got HTML instead of JSON (ngrok warning page)
  if (
    text.includes("<!DOCTYPE") ||
    text.includes("<html") ||
    text.trim().startsWith("<")
  ) {
    throw new ApiError(
      "Received HTML response instead of JSON. This may be due to an ngrok warning page. Please check the API endpoint or try accessing it in a browser first.",
      response.status
    );
  }

  if (!response.ok) {
    let errorData: ApiErrorResponse | undefined;
    try {
      if (isJson) {
        errorData = JSON.parse(text);
      }
    } catch {
      // If response is not JSON, use status text
    }

    const errorMessage =
      errorData?.message ||
      errorData?.error ||
      response.statusText ||
      `API request failed with status ${response.status}`;

    throw new ApiError(errorMessage, response.status, errorData);
  }

  // Parse JSON response
  try {
    const parsed = JSON.parse(text) as T;
    console.log(parsed);
    return parsed;
  } catch (error) {
    throw new ApiError(
      `Invalid JSON response: ${error instanceof Error ? error.message : "Unknown error"}`,
      response.status
    );
  }
}

/**
 * Get balances summary for an address
 * Returns total portfolio value in USD and aggregated balances
 */
export async function getBalancesSummary(
  address: string
): Promise<BalancesSummaryResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/balancesSummary/${address}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    return handleResponse<BalancesSummaryResponse>(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to fetch balances summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get all assets for an address across all chains
 * Returns detailed chain-by-chain breakdown and totals
 */
export async function getAssets(address: string): Promise<AssetsResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/assets/${address}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    return handleResponse<AssetsResponse>(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to fetch assets: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Plan a sending transaction
 * Returns an optimal plan (single-chain or multi-chain) for sending tokens
 */
export async function planSendingTransaction(
  request: PlanRequest
): Promise<PlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/plan-sending-transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    return handleResponse<PlanResponse>(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to plan transaction: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Normalize API plan response to match UI expectations
 * Converts single-chain and multi-chain plans to a unified format
 */
export function normalizeTransactionPlan(
  plan: SingleChainPlan | MultiChainPlan | null
): NormalizedTransactionPlan | null {
  if (!plan) {
    return null;
  }

  if (plan.type === "single") {
    // Convert single-chain plan to normalized format
    // For single-chain, the total amount needs to be calculated from the request
    // But we'll use the gas cost structure and assume the amount is handled separately
    // Actually, for single-chain, we need the amount from the request, but we'll structure it
    // to match the multi-chain format for UI consistency
    return {
      type: "single",
      legs: [
        {
          chainId: plan.quote.chainId,
          chainName: plan.quote.chainName,
          amountUsdc: "0", // Will be set by caller based on request amount
          gasCostUsdc: plan.quote.gasCostUsdc,
        },
      ],
      totalAmount: "0", // Will be set by caller
      totalGasCostUsdc: plan.quote.gasCostUsdc,
    };
  }

  // Multi-chain plan is already in the right format
  return {
    type: "multi",
    legs: plan.plan.legs,
    totalAmount: plan.plan.totalAmount,
    totalGasCostUsdc: plan.plan.totalGasCostUsdc,
  };
}

/**
 * Normalize plan response with amount information
 * This version includes the amount from the request for single-chain plans
 */
export function normalizeTransactionPlanWithAmount(
  plan: SingleChainPlan | MultiChainPlan | null,
  requestAmount: string // Amount in human-readable format (e.g., "100.5")
): NormalizedTransactionPlan | null {
  if (!plan) {
    return null;
  }

  if (plan.type === "single") {
    // Convert amount to smallest unit (6 decimals for USDC)
    const amountInSmallestUnit = Math.floor(
      parseFloat(requestAmount) * 1000000
    ).toString();

    return {
      type: "single",
      legs: [
        {
          chainId: plan.quote.chainId,
          chainName: plan.quote.chainName,
          amountUsdc: amountInSmallestUnit,
          gasCostUsdc: plan.quote.gasCostUsdc,
        },
      ],
      totalAmount: amountInSmallestUnit,
      totalGasCostUsdc: plan.quote.gasCostUsdc,
    };
  }

  // Multi-chain plan is already in the right format
  return {
    type: "multi",
    legs: plan.plan.legs,
    totalAmount: plan.plan.totalAmount,
    totalGasCostUsdc: plan.plan.totalGasCostUsdc,
  };
}
