/**
 * Transaction Execution Module
 * 
 * This module handles the actual execution of transactions on the blockchain.
 * It uses the securely stored seed phrase to sign and send transactions.
 * 
 * For each transaction leg in the plan:
 * - Connects to the appropriate RPC endpoint for the chain (chainId)
 * - Creates a USDC transfer transaction to the recipient address
 * - Signs the transaction using the wallet derived from the seed phrase
 * - Sends the transaction to the network
 * - Waits for transaction receipt and extracts the txHash
 * 
 * Errors are handled gracefully - if a transaction fails, that sub-transaction
 * is marked as "failed" but processing continues with other legs.
 * 
 * Note: USDC uses 6 decimals, so amounts are in micro-USDC (smallest unit).
 */

import { WalletVault, type EncryptedVault } from "./WalletVault";
import type { NormalizedTransactionPlan } from "./api";
import { getBlockExplorerUrl } from "./blockExplorers";

/**
 * Result of executing a single transaction leg
 */
export interface TransactionLegResult {
  chainId: number;
  chainName: string;
  success: boolean;
  txHash?: string;
  error?: string;
  blockExplorerUrl?: string;
}

/**
 * Result of executing an entire transaction plan
 */
export interface TransactionExecutionResult {
  transactionId: string;
  overallSuccess: boolean;
  legResults: TransactionLegResult[];
  /**
   * Number of successfully executed legs
   */
  successCount: number;
  /**
   * Total number of legs in the plan
   */
  totalCount: number;
}

/**
 * Parameters for executing a transaction plan
 */
export interface ExecuteTransactionPlanParams {
  /**
   * The normalized transaction plan (single or multi-chain)
   */
  plan: NormalizedTransactionPlan;
  /**
   * The recipient address (destination for the transfer)
   */
  recipientAddress: string;
  /**
   * Token symbol (e.g., "USDC" or "ETH")
   */
  tokenSymbol: string;
  /**
   * Password to unlock the encrypted vault
   */
  password: string;
  /**
   * The encrypted vault containing the seed phrase
   */
  encryptedVault: EncryptedVault;
  /**
   * Optional transaction ID (will be generated if not provided)
   */
  transactionId?: string;
}

/**
 * Execute a transaction plan by sending token transfers on the specified chains.
 * Supports both USDC (ERC20) and native ETH transfers.
 * 
 * This function handles both single-chain and multi-chain transaction plans.
 * For each leg in the plan, it will:
 * 1. Connect to the appropriate blockchain network
 * 2. Create and sign a transfer transaction (USDC ERC20 or native ETH)
 * 3. Send the transaction and wait for confirmation
 * 4. Return the transaction hash
 * 
 * @param params - Execution parameters including plan, recipient, and vault credentials
 * @returns Promise resolving to the execution result with txHashes for each leg
 * 
 * @example
 * ```typescript
 * const result = await executeTransactionPlan({
 *   plan: normalizedPlan,
 *   recipientAddress: "0x...",
 *   password: userPassword,
 *   encryptedVault: vault
 * });
 * 
 * if (result.overallSuccess) {
 *   console.log("All transactions sent successfully!");
 *   result.legResults.forEach(leg => {
 *     console.log(`${leg.chainName}: ${leg.txHash}`);
 *   });
 * }
 * ```
 */
export async function executeTransactionPlan(
  params: ExecuteTransactionPlanParams
): Promise<TransactionExecutionResult> {
  const {
    plan,
    recipientAddress,
    tokenSymbol,
    password,
    encryptedVault,
    transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  } = params;

  const isNativeEth = tokenSymbol.toUpperCase() === "ETH";

  const legResults: TransactionLegResult[] = [];

  // Unlock the vault and execute transactions
  const vault = new WalletVault();
  await vault.unlockAndExecute(
    password,
    encryptedVault,
    async (seedPhraseBytes) => {
      const decoder = new TextDecoder();
      const seedPhrase = decoder.decode(seedPhraseBytes);

      // Dynamically import ethers
      const { ethers } = await import("ethers");
      const wallet = ethers.Wallet.fromPhrase(seedPhrase);

      // Process each leg sequentially
      for (const leg of plan.legs) {
        try {
          console.log(`Processing transaction leg: ${leg.chainName} (chainId: ${leg.chainId})`);
          
          // Get RPC provider for this chain
          const rpcUrl = getRpcUrlForChain(leg.chainId);
          console.log(`Connecting to RPC: ${rpcUrl}`);
          const provider = new ethers.JsonRpcProvider(rpcUrl);

          // Connect wallet to provider
          const signer = wallet.connect(provider);

          let tx: ethers.ContractTransactionResponse;

          if (isNativeEth) {
            // Native ETH transfer
            const amount = BigInt(leg.amountUsdc); // amountUsdc field contains wei for ETH
            console.log(`Sending ${amount} wei (${Number(amount) / 1e18} ETH) to ${recipientAddress}`);
            
            // Send native ETH
            tx = await signer.sendTransaction({
              to: recipientAddress,
              value: amount,
            });
          } else {
            // USDC ERC20 transfer
            const usdcAddress = getUsdcAddressForChain(leg.chainId);
            console.log(`USDC contract address: ${usdcAddress}`);
            console.log(`Amount: ${leg.amountUsdc} (${Number(leg.amountUsdc) / 1e6} USDC)`);
            console.log(`Recipient: ${recipientAddress}`);

            // Create USDC contract instance (ERC20 ABI)
            const usdcContract = new ethers.Contract(
              usdcAddress,
              ERC20_TRANSFER_ABI,
              signer
            );

            // Convert amount from string to BigInt (already in smallest unit)
            const amount = BigInt(leg.amountUsdc);

            // Call transfer function
            console.log(`Calling transfer(${recipientAddress}, ${amount})`);
            tx = await usdcContract.transfer(recipientAddress, amount);
          }

          // Extract transaction hash (available immediately)
          const txHash = tx.hash;
          console.log(`Transaction sent! Hash: ${txHash}`);

          // Wait for transaction confirmation (wait for at least 1 confirmation)
          console.log(`Waiting for confirmation...`);
          await tx.wait();
          console.log(`Transaction confirmed!`);

          legResults.push({
            chainId: leg.chainId,
            chainName: leg.chainName,
            success: true,
            txHash,
            blockExplorerUrl: getBlockExplorerUrl(leg.chainId, txHash),
          });
        } catch (error) {
          // Handle errors gracefully - mark this leg as failed but continue with others
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          const errorDetails = error instanceof Error ? error.stack : String(error);
          
          console.error(`Transaction failed on ${leg.chainName} (chainId: ${leg.chainId}):`, {
            error: errorMessage,
            details: errorDetails,
            leg: leg,
            recipientAddress,
            tokenSymbol,
          });
          
          legResults.push({
            chainId: leg.chainId,
            chainName: leg.chainName,
            success: false,
            error: errorMessage,
          });
        }
      }
    }
  );

  const successCount = legResults.filter((r) => r.success).length;
  const overallSuccess = successCount === plan.legs.length;

  return {
    transactionId,
    overallSuccess,
    legResults,
    successCount,
    totalCount: plan.legs.length,
  };
}

/**
 * Helper function to get RPC URL for a given chain ID
 */
export function getRpcUrlForChain(chainId: number): string {
  const rpcUrls: Record<number, string> = {
    1: "https://eth.llamarpc.com", // Ethereum
    10: "https://mainnet.optimism.io", // Optimism
    8453: "https://mainnet.base.org", // Base
    42161: "https://arb1.arbitrum.io/rpc", // Arbitrum
    137: "https://polygon-rpc.com", // Polygon
    11155111: "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // Ethereum Sepolia
    // Add more chains as needed
  };

  const url = rpcUrls[chainId];
  if (!url) {
    throw new Error(`No RPC URL configured for chain ID ${chainId}`);
  }

  return url;
}

/**
 * Helper function to get USDC contract address for a given chain ID
 */
export function getUsdcAddressForChain(chainId: number): string {
  const usdcAddresses: Record<number, string> = {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
    10: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // Optimism
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
    42161: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // Arbitrum
    137: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon
    11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Ethereum Sepolia (testnet USDC)
    // Add more chains as needed
  };

  const address = usdcAddresses[chainId];
  if (!address) {
    throw new Error(`No USDC address configured for chain ID ${chainId}`);
  }

  return address;
}

/**
 * Standard ERC20 ABI (minimal - just the transfer function)
 */
export const ERC20_TRANSFER_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
] as const;

