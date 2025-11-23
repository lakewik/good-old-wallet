import React, { useState } from "react";
import { PageContainer, ContentContainer } from "./Container";
import {
  savePendingTransactions,
  getPendingTransactions,
  type PendingTransaction,
  type SubTransaction,
} from "../utils/storage";
import { getBlockExplorerUrl } from "../utils/blockExplorers";
import {
  executeTransactionPlan,
  type ExecuteTransactionPlanParams,
} from "../utils/transactionExecution";

interface TransactionLeg {
  chainId: number;
  chainName: string;
  amountUsdc: string;
  gasCostUsdc: string;
}

interface TransactionPlan {
  type: "multi" | "single";
  legs: TransactionLeg[];
  totalAmount: string;
  totalGasCostUsdc: string;
}

interface ConfirmationScreenProps {
  plan: TransactionPlan;
  recipientAddress: string;
  tokenSymbol: string;
  onApprove: () => void;
  onCancel: () => void;
  onTransactionSaved?: () => void;
  password: string;
  encryptedVault: any;
}

function formatUsdc(amount: string): string {
  // Convert from micro-USDC (6 decimals) to USDC
  try {
    const amountNum = BigInt(amount);
    const divisor = BigInt(1000000);
    const whole = amountNum / divisor;
    const fraction = amountNum % divisor;
    const fractionStr = fraction.toString().padStart(6, "0");
    // Remove trailing zeros
    const fractionTrimmed = fractionStr.replace(/0+$/, "");
    if (fractionTrimmed === "") {
      return whole.toString();
    }
    return `${whole}.${fractionTrimmed}`;
  } catch (error) {
    // Fallback to simple division if BigInt fails
    const amountNum = parseFloat(amount) / 1000000;
    return amountNum.toFixed(6).replace(/\.?0+$/, "");
  }
}

function formatEth(amount: string): string {
  // Convert from wei (18 decimals) to ETH
  try {
    const amountNum = BigInt(amount);
    const divisor = BigInt("1000000000000000000"); // 10^18
    const whole = amountNum / divisor;
    const fraction = amountNum % divisor;
    const fractionStr = fraction.toString().padStart(18, "0");
    // Remove trailing zeros
    const fractionTrimmed = fractionStr.replace(/0+$/, "");
    if (fractionTrimmed === "") {
      return whole.toString();
    }
    return `${whole}.${fractionTrimmed}`;
  } catch (error) {
    // Fallback to simple division if BigInt fails
    const amountNum = parseFloat(amount) / 1e18;
    return amountNum.toFixed(18).replace(/\.?0+$/, "");
  }
}

function formatAmount(amount: string, tokenSymbol: string): string {
  if (tokenSymbol.toUpperCase() === "ETH") {
    return formatEth(amount);
  }
  return formatUsdc(amount);
}

function CollapsibleTransactionCard({
  leg,
  index,
  tokenSymbol,
}: {
  leg: TransactionLeg;
  index: number;
  tokenSymbol: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "var(--border-radius)",
        overflow: "hidden",
        transition: "all var(--transition-fast)",
      }}
    >
      {/* Collapsed One-Liner */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: "100%",
          padding: "var(--spacing-sm) var(--spacing-md)",
          background: "transparent",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          gap: "var(--spacing-sm)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-sm)",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            {leg.chainName}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              fontFamily: "var(--font-family-mono)",
              whiteSpace: "nowrap",
            }}
          >
            {formatAmount(leg.amountUsdc, tokenSymbol)} {tokenSymbol}
          </div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: "var(--text-muted)",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--transition-fast)",
            flexShrink: 0,
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div
          style={{
            padding: "var(--spacing-md)",
            paddingTop: "var(--spacing-sm)",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Chain ID
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-family-mono)",
              }}
            >
              {leg.chainId}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Amount
            </div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-family-mono)",
              }}
            >
              {formatAmount(leg.amountUsdc, tokenSymbol)} {tokenSymbol}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Gas Cost
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-family-mono)",
              }}
            >
              {formatUsdc(leg.gasCostUsdc)} USDC
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfirmationScreen({
  plan,
  recipientAddress,
  tokenSymbol,
  onApprove,
  onCancel,
  onTransactionSaved,
  password,
  encryptedVault,
}: ConfirmationScreenProps) {
  const [isLoading, setIsLoading] = useState(false);

  const formatAddress = (addr: string): string => {
    if (addr.length <= 10) return addr;
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };


  const handleApprove = async () => {
    if (isLoading) return; // Prevent double-clicks
    
    setIsLoading(true);
    try {
      // Execute the transaction plan
      // This will send actual transactions to the blockchain
      const executionParams: ExecuteTransactionPlanParams = {
        plan,
        recipientAddress,
        tokenSymbol,
        password,
        encryptedVault,
      };

      const executionResult = await executeTransactionPlan(executionParams);

      // Convert execution results to sub-transactions
      const subTransactions: SubTransaction[] = executionResult.legResults.map(
        (legResult) => ({
          chainId: legResult.chainId,
          chainName: legResult.chainName,
          amountUsdc: plan.legs.find((l) => l.chainId === legResult.chainId)
            ?.amountUsdc || "0",
          gasCostUsdc: plan.legs.find((l) => l.chainId === legResult.chainId)
            ?.gasCostUsdc || "0",
          status: legResult.success ? ("pending" as const) : ("failed" as const),
          txHash: legResult.txHash,
          blockExplorerUrl: legResult.blockExplorerUrl,
        })
      );

      // Determine overall transaction status
      const overallStatus: "pending" | "success" | "failed" =
        executionResult.overallSuccess
          ? "pending" // Will be updated to "success" when confirmed
          : executionResult.successCount > 0
          ? "pending" // Partial success - still pending
          : "failed"; // All failed

      const pendingTransaction: PendingTransaction = {
        id: executionResult.transactionId,
        recipientAddress,
        tokenSymbol,
        totalAmount: plan.totalAmount,
        totalGasCostUsdc: plan.totalGasCostUsdc,
        type: plan.type,
        subTransactions,
        status: overallStatus,
        createdAt: Date.now(),
      };

      // Save to storage
      const existing = await getPendingTransactions();
      await savePendingTransactions([...existing, pendingTransaction]);

      // Notify parent
      if (onTransactionSaved) {
        onTransactionSaved();
      }

      // Call the approve handler (which will navigate back)
      onApprove();
    } catch (error) {
      console.error("Error executing transaction plan:", error);
      setIsLoading(false);
      // Show error message to user - for now just log it
      // Could add error state and display it in UI
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg-primary)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "var(--spacing-md) var(--spacing-sm)",
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          width: "100%",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Confirm Transaction
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          width: "100%",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        className="hide-scrollbar"
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-sm)",
            padding: "var(--spacing-sm) var(--spacing-md)",
          }}
        >
          {/* Recipient Info */}
          <div
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--border-radius)",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: "2px",
              }}
            >
              Recipient
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-family-mono)",
                wordBreak: "break-all",
              }}
            >
              {formatAddress(recipientAddress)}
            </div>
          </div>

          {/* Transaction Type and Collapsible Transactions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--spacing-xs)",
                padding: "var(--spacing-xs) 0",
              }}
            >
              {plan.type === "multi" ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    Multi-Chain Transaction
                  </span>
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    Single-Chain Transaction
                  </span>
                </>
              )}
            </div>
            {plan.legs.map((leg, index) => (
              <CollapsibleTransactionCard key={index} leg={leg} index={index} tokenSymbol={tokenSymbol} />
            ))}
          </div>

          {/* Summary */}
          <div
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "var(--border-radius)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-xs)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Total Amount
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-family-mono)",
                }}
              >
                {formatAmount(plan.totalAmount, tokenSymbol)} {tokenSymbol}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Total Gas Cost
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-family-mono)",
                }}
              >
                {formatUsdc(plan.totalGasCostUsdc)} USDC
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer with Buttons */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 10,
          background: "var(--bg-primary)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "var(--spacing-md) var(--spacing-sm)",
          display: "flex",
          gap: "var(--spacing-sm)",
          width: "100%",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onCancel}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "var(--spacing-md) var(--spacing-lg)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "var(--border-radius)",
            fontFamily: "var(--font-family-sans)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "var(--text-primary)",
            background: "rgba(255, 255, 255, 0.02)",
            opacity: isLoading ? 0.5 : 1,
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
            }
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleApprove}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "var(--spacing-md) var(--spacing-lg)",
            border: "1px solid var(--border-focus)",
            borderRadius: "var(--border-radius)",
            fontFamily: "var(--font-family-sans)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "var(--text-primary)",
            background: isLoading ? "rgba(255, 255, 255, 0.1)" : "var(--bg-button-primary)",
            opacity: isLoading ? 0.7 : 1,
            transition: "all var(--transition-fast)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--spacing-xs)",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.35)";
              e.currentTarget.style.background = "var(--bg-button-primary-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.borderColor = "var(--border-focus)";
              e.currentTarget.style.background = "var(--bg-button-primary)";
            }
          }}
        >
          {isLoading ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  animation: "spin 1s linear infinite",
                }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Sending...
            </>
          ) : (
            "Approve"
          )}
        </button>
      </div>
    </div>
  );
}

