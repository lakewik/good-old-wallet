import React, { useState } from "react";
import type {
  PendingTransaction,
  SubTransaction,
  TransactionStatus,
} from "../utils/storage";
import { getBlockExplorerUrl } from "../utils/blockExplorers";

interface PendingTransactionCardProps {
  transaction: PendingTransaction;
  onUpdate: (updated: PendingTransaction) => void;
  onDelete?: (transactionId: string) => void;
}

function getStatusIcon(status: TransactionStatus) {
  switch (status) {
    case "pending":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            animation: "spin 1s linear infinite",
            color: "var(--text-muted)",
          }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
    case "success":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "#44ff44" }}
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "failed":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "#ff4444" }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
  }
}

function formatUsdc(amount: string): string {
  try {
    const amountNum = BigInt(amount);
    const divisor = BigInt(1000000);
    const whole = amountNum / divisor;
    const fraction = amountNum % divisor;
    const fractionStr = fraction.toString().padStart(6, "0");
    const fractionTrimmed = fractionStr.replace(/0+$/, "");
    if (fractionTrimmed === "") {
      return whole.toString();
    }
    return `${whole}.${fractionTrimmed}`;
  } catch (error) {
    const amountNum = parseFloat(amount) / 1000000;
    return amountNum.toFixed(6).replace(/\.?0+$/, "");
  }
}

function SubTransactionRow({
  subTx,
  isExpanded,
  isFirst,
}: {
  subTx: SubTransaction;
  isExpanded: boolean;
  isFirst: boolean;
}) {

  // Transaction hash should always be available since transaction has already been sent
  const txHash = subTx.txHash || "";
  const explorerUrl = subTx.blockExplorerUrl || (txHash ? getBlockExplorerUrl(subTx.chainId, txHash) : "#");

  return (
    <div
      style={{
        padding: "var(--spacing-sm) var(--spacing-md) var(--spacing-sm) calc(var(--spacing-md) + var(--spacing-lg))",
        borderTop: isFirst ? "none" : "1px solid rgba(255, 255, 255, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--spacing-sm)",
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
        <div style={{ flexShrink: 0 }}>{getStatusIcon(subTx.status)}</div>
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
          }}
        >
          {subTx.chainName}
        </div>
        {isExpanded && (
          <>
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-family-mono)",
                whiteSpace: "nowrap",
              }}
            >
              {formatUsdc(subTx.amountUsdc)} USDC
            </div>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                textDecoration: "underline",
                whiteSpace: "nowrap",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              View on Explorer
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function PendingTransactionCard({
  transaction,
  onUpdate,
  onDelete,
}: PendingTransactionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent expanding/collapsing when clicking delete
    if (onDelete && window.confirm("Are you sure you want to remove this transaction from history?")) {
      onDelete(transaction.id);
    }
  };

  const formatAddress = (addr: string): string => {
    if (addr.length <= 10) return addr;
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const allSuccess = transaction.subTransactions.every(
    (tx) => tx.status === "success",
  );
  const anyFailed = transaction.subTransactions.some(
    (tx) => tx.status === "failed",
  );

  const overallStatus: TransactionStatus = anyFailed
    ? "failed"
    : allSuccess
      ? "success"
      : "pending";

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
      {/* Main Card - Collapsed View */}
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
          <div style={{ flexShrink: 0 }}>{getStatusIcon(overallStatus)}</div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-family-mono)",
              whiteSpace: "nowrap",
            }}
          >
            {formatUsdc(transaction.totalAmount)} USDC
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            to {formatAddress(transaction.recipientAddress)}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {transaction.type === "multi"
              ? "Multi-Chain Transaction"
              : "Single-Chain Transaction"}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-xs)",
          }}
        >
          {onDelete && (
            <button
              onClick={handleDelete}
              style={{
                background: "transparent",
                border: "none",
                padding: "var(--spacing-xs)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "all var(--transition-fast)",
                color: "var(--text-muted)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 68, 68, 0.1)";
                e.currentTarget.style.color = "#ff4444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
              title="Remove transaction from history"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          )}
          <svg
            width="12"
            height="12"
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
        </div>
      </button>

      {/* Expanded View */}
      {isExpanded && (
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {transaction.subTransactions.map((subTx, index) => (
            <SubTransactionRow
              key={index}
              subTx={subTx}
              isExpanded={isExpanded}
              isFirst={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

