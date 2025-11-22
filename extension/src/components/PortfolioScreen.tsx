import React, { useState, useEffect } from "react";
import Button from "./Button";
import { PageContainer, ContentContainer } from "./Container";
import { LOGO_PATH, LOGO_ALT } from "../constants";
import { WalletVault } from "../utils/WalletVault";
import {
  getEncryptedVault,
  getPendingTransactions,
  savePendingTransactions,
  type PendingTransaction,
} from "../utils/storage";
import type { EncryptedVault } from "../utils/WalletVault";
import SendScreen from "./SendScreen";
import PendingTransactionCard from "./PendingTransactionCard";

interface PortfolioScreenProps {
  password: string;
  encryptedVault: EncryptedVault;
}

interface Token {
  image: string;
  name: string;
  symbol: string;
  amount: string;
  valueUSD: string;
}

interface TokenCardProps {
  token: Token;
  onSend: () => void;
}

function TokenCard({ token, onSend }: TokenCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        gap: "var(--spacing-md)",
        padding: "var(--spacing-md)",
        background: isHovered
          ? "rgba(255, 255, 255, 0.04)"
          : "rgba(255, 255, 255, 0.02)",
        border: isHovered
          ? "1px solid rgba(255, 255, 255, 0.15)"
          : "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "var(--border-radius)",
        transition: "all var(--transition-fast)",
      }}
    >
      {/* First Column: Token Icon */}
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          background: token.image ? "transparent" : "rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {token.image ? (
          <img
            src={token.image}
            alt={token.name}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
            }}
          >
            {token.symbol.charAt(0)}
          </span>
        )}
      </div>

      {/* Second Column: Token Name and Symbol */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {token.name}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "var(--font-family-mono)",
          }}
        >
          {token.symbol}
        </div>
      </div>

      {/* Third Column: Dollar Value and Token Amount */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          alignItems: "flex-end",
          textAlign: "right",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {token.valueUSD}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-family-mono)",
          }}
        >
          {token.amount} {token.symbol}
        </div>
      </div>

      {/* Fourth Column: Send Button with Large Hitbox */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "60px",
          padding: "var(--spacing-xs)",
          margin: "calc(-1 * var(--spacing-xs))",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          onClick={onSend}
          style={{
            background: "transparent",
            border: "none",
            color: isHovered ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: "11px",
            fontFamily: "var(--font-family-sans)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "var(--spacing-sm)",
            transition: "color var(--transition-fast)",
          }}
        >
          <span>Send</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function PortfolioScreen({
  password,
  encryptedVault,
}: PortfolioScreenProps) {
  const [address, setAddress] = useState<string>("");
  const [totalPortfolioValue, setTotalPortfolioValue] =
    useState<string>("$0.00");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [pendingTransactions, setPendingTransactions] = useState<
    PendingTransaction[]
  >([]);

  useEffect(() => {
    loadWalletData();
    loadPendingTransactions();
  }, []);

  const loadPendingTransactions = async () => {
    try {
      const transactions = await getPendingTransactions();
      
      // Filter out transactions older than 24 hours
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const recentTransactions = transactions.filter(
        (tx) => now - tx.createdAt < twentyFourHours,
      );
      
      // Remove old transactions from storage
      if (recentTransactions.length !== transactions.length) {
        await savePendingTransactions(recentTransactions);
      }
      
      setPendingTransactions(recentTransactions);
      
      // Process pending transactions - mock execution
      recentTransactions.forEach((tx) => {
        if (tx.status === "pending") {
          // Check if we already set a timeout for this transaction
          const timeoutKey = `timeout_${tx.id}`;
          if ((window as any)[timeoutKey]) {
            return; // Already processing
          }
          
          // Mock transaction execution - succeed after 10 seconds
          // Note: txHash should already exist since transaction was sent, we just update status
          (window as any)[timeoutKey] = setTimeout(async () => {
            const updated = await getPendingTransactions();
            const txIndex = updated.findIndex((t) => t.id === tx.id);
            if (txIndex !== -1 && updated[txIndex].status === "pending") {
              const updatedTx = { ...updated[txIndex] };
              updatedTx.status = "success";
              updatedTx.subTransactions = updatedTx.subTransactions.map(
                (subTx) => ({
                  ...subTx,
                  status: "success" as const,
                  // Keep existing txHash and blockExplorerUrl
                }),
              );
              updated[txIndex] = updatedTx;
              await savePendingTransactions(updated);
              // Filter again in case transaction is now > 24h old
              const now2 = Date.now();
              const filtered = updated.filter(
                (t) => now2 - t.createdAt < twentyFourHours,
              );
              setPendingTransactions(filtered);
            }
            delete (window as any)[timeoutKey];
          }, 10000);
        }
      });
    } catch (error) {
      console.error("Error loading pending transactions:", error);
    }
  };

  const getBlockExplorerUrl = (chainId: number, txHash: string): string => {
    const explorers: Record<number, string> = {
      1: "https://etherscan.io/tx/",
      8453: "https://basescan.org/tx/",
    };
    const base = explorers[chainId] || "https://etherscan.io/tx/";
    return `${base}${txHash}`;
  };

  const handleTransactionUpdate = async (updated: PendingTransaction) => {
    const all = await getPendingTransactions();
    const index = all.findIndex((t) => t.id === updated.id);
    if (index !== -1) {
      all[index] = updated;
      await savePendingTransactions(all);
      setPendingTransactions(all);
    }
  };

  const loadWalletData = async () => {
    try {
      const vault = new WalletVault();
      await vault.unlockAndExecute(
        password,
        encryptedVault,
        async (seedPhraseBytes) => {
          const decoder = new TextDecoder();
          const seedPhrase = decoder.decode(seedPhraseBytes);

          // Derive wallet address
          const { ethers } = await import("ethers");
          const wallet = ethers.Wallet.fromPhrase(seedPhrase);
          setAddress(wallet.address);

          // TODO: Fetch portfolio value and tokens from blockchain
          // For now, using placeholder data
          setTotalPortfolioValue("$12,345.67");
          setTokens([
            {
              image: "",
              name: "Ethereum",
              symbol: "ETH",
              amount: "2.5",
              valueUSD: "$6,234.50",
            },
            {
              image: "",
              name: "USD Coin",
              symbol: "USDC",
              amount: "5,000.00",
              valueUSD: "$5,000.00",
            },
            {
              image: "",
              name: "Wrapped Ethereum",
              symbol: "WETH",
              amount: "1.0",
              valueUSD: "$2,491.80",
            },
            {
              image: "",
              name: "Dai Stablecoin",
              symbol: "DAI",
              amount: "1,000.00",
              valueUSD: "$1,000.00",
            },
            {
              image: "",
              name: "Chainlink",
              symbol: "LINK",
              amount: "50.0",
              valueUSD: "$750.00",
            },
            {
              image: "",
              name: "Uniswap",
              symbol: "UNI",
              amount: "100.0",
              valueUSD: "$500.00",
            },
            {
              image: "",
              name: "Aave Token",
              symbol: "AAVE",
              amount: "5.0",
              valueUSD: "$370.37",
            },
          ]);
        },
      );
    } catch (error) {
      console.error("Error loading wallet data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  };

  const formatAddress = (addr: string): string => {
    if (addr.length <= 10) return addr;
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const handleTokenSend = (token: Token) => {
    setSelectedToken(token);
  };

  const handleBackFromSend = () => {
    setSelectedToken(null);
    loadPendingTransactions(); // Reload pending transactions when returning
  };

  const handleCancelSend = () => {
    setSelectedToken(null);
  };

  if (isLoading) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
          background: "var(--bg-primary)",
        }}
      >
        Loading...
      </div>
    );
  }

  // Show send screen if a token is selected
  if (selectedToken) {
    return (
      <SendScreen
        token={selectedToken}
        onBack={handleBackFromSend}
        onCancel={handleCancelSend}
      />
    );
  }

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
      {/* Fixed Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg-primary)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "var(--spacing-xs) var(--spacing-sm)",
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          width: "100%",
          flexShrink: 0,
          margin: 0,
        }}
      >
        <div style={{ width: "44px", height: "44px", flexShrink: 0 }}>
          <img
            src={LOGO_PATH}
            alt={LOGO_ALT}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              opacity: 0.7,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-sm)",
            flex: 1,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-family-mono)",
              fontSize: "12px",
              color: "var(--text-primary)",
            }}
          >
            {formatAddress(address)}
          </span>
          <button
            onClick={copyAddress}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              color: copied ? "#44ff44" : "var(--text-muted)",
              transition: "color var(--transition-fast)",
            }}
            title={copied ? "Copied!" : "Copy address"}
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
              {copied ? (
                <>
                  <path d="M20 6L9 17l-5-5" />
                </>
              ) : (
                <>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          width: "100%",
          scrollbarWidth: "none", // Firefox
          msOverflowStyle: "none", // IE/Edge
        }}
        className="hide-scrollbar"
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-sm)",
            padding: "var(--spacing-sm)",
          }}
        >
          {/* Total Portfolio Value */}
          <div
            style={{
              width: "100%",
              textAlign: "center",
              padding: "var(--spacing-md) var(--spacing-xs)",
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
                marginBottom: "var(--spacing-xs)",
              }}
            >
              Total Portfolio Value
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--text-primary)",
                fontFamily: "var(--font-family-sans)",
              }}
            >
              {totalPortfolioValue}
            </div>
          </div>

          {/* Recent Transactions */}
          {pendingTransactions.length > 0 && (
            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-sm)",
                marginTop: "var(--spacing-lg)",
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
                Recent Transactions
              </div>
              {pendingTransactions.map((tx) => (
                <PendingTransactionCard
                  key={tx.id}
                  transaction={tx}
                  onUpdate={handleTransactionUpdate}
                />
              ))}
            </div>
          )}

          {/* Tokens List */}
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-sm)",
              marginTop: "var(--spacing-lg)",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: "var(--spacing-xs)",
              }}
            >
              Tokens
            </div>
            {tokens.length === 0 ? (
              <div
                style={{
                  padding: "var(--spacing-lg)",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "11px",
                }}
              >
                No tokens found
              </div>
            ) : (
              tokens.map((token, index) => (
                <TokenCard
                  key={index}
                  token={token}
                  onSend={() => handleTokenSend(token)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
