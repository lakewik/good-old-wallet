import React, { useState, useEffect, useRef } from "react";
import Button from "./Button";
import { PageContainer, ContentContainer } from "./Container";
import { LOGO_PATH, LOGO_ALT } from "../constants";
import { WalletVault } from "../utils/WalletVault";
import {
  getEncryptedVault,
  getPendingTransactions,
  savePendingTransactions,
  removePendingTransaction,
  getSelectedAccountIndex,
  getAccountColor,
  type PendingTransaction,
} from "../utils/storage";
import { deriveWalletFromPhrase } from "../utils/accountManager";
import AccountSelector from "./AccountSelector";
import type { EncryptedVault } from "../utils/WalletVault";
import SendScreen from "./SendScreen";
import PendingTransactionCard from "./PendingTransactionCard";
import FilecoinBackupButton from "./FilecoinBackupButton";
import TopUpScreen from "./TopUpScreen";
import {
  getBalancesSummary,
  ApiError,
} from "../utils/api";

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
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<
    PendingTransaction[]
  >([]);
  const [accountColor, setAccountColor] = useState<string>("#3b82f6");
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
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
          
          // Update transaction status after 10 seconds
          // Note: Only update sub-transactions that are still pending, keep failed ones as failed
          (window as any)[timeoutKey] = setTimeout(async () => {
            const updated = await getPendingTransactions();
            const txIndex = updated.findIndex((t) => t.id === tx.id);
            if (txIndex !== -1 && updated[txIndex]?.status === "pending") {
              const updatedTx = { ...updated[txIndex] };
              
              // Update sub-transactions: only mark pending ones as success, keep failed ones as failed
              updatedTx.subTransactions = updatedTx.subTransactions.map(
                (subTx) => {
                  if (subTx.status === "pending") {
                    return {
                      ...subTx,
                      status: "success" as const,
                      // Keep existing txHash and blockExplorerUrl
                    };
                  }
                  // Keep failed sub-transactions as failed
                  return subTx;
                },
              );
              
              // Update overall status based on sub-transaction statuses
              const allSuccess = updatedTx.subTransactions.every(
                (subTx) => subTx.status === "success",
              );
              const anyFailed = updatedTx.subTransactions.some(
                (subTx) => subTx.status === "failed",
              );
              
              updatedTx.status = anyFailed
                ? "failed"
                : allSuccess
                  ? "success"
                  : "pending";
              
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


  const handleTransactionUpdate = async (updated: PendingTransaction) => {
    const all = await getPendingTransactions();
    const index = all.findIndex((t) => t.id === updated.id);
    if (index !== -1) {
      all[index] = updated;
      await savePendingTransactions(all);
      setPendingTransactions(all);
    }
  };

  const handleTransactionDelete = async (transactionId: string) => {
    try {
      await removePendingTransaction(transactionId);
      // Reload transactions to update UI
      const updated = await getPendingTransactions();
      setPendingTransactions(updated);
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const loadWalletData = async () => {
    try {
      setError(null);
      const accountIndex = await getSelectedAccountIndex();
      
      // Load account color
      try {
        const color = await getAccountColor(accountIndex);
        if (color) {
          setAccountColor(color);
        } else {
          // Default color if none set
          setAccountColor("#3b82f6");
        }
      } catch (error) {
        console.error("Error loading account color:", error);
        setAccountColor("#3b82f6");
      }
      
      const vault = new WalletVault();
      await vault.unlockAndExecute(
        password,
        encryptedVault,
        async (seedPhraseBytes) => {
          const decoder = new TextDecoder();
          const seedPhrase = decoder.decode(seedPhraseBytes);

          // Derive wallet address using account index
          const { address: walletAddress } = await deriveWalletFromPhrase(seedPhrase, accountIndex);
          setAddress(walletAddress);

          // Fetch portfolio data from API
          try {
            // Fetch balances summary (contains everything we need)
            const balancesSummary = await getBalancesSummary(walletAddress);
            
            // Format total portfolio value
            const portfolioValue = parseFloat(
              balancesSummary.totalPortfolioValueUSD,
            );
            setTotalPortfolioValue(
              `$${portfolioValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
            );

            // Build token list from totals
            const tokenList: Token[] = [];

            // Add native token (ETH)
            const ethTotal = balancesSummary.totals.ETH;
            if (ethTotal && parseFloat(ethTotal.totalFormatted) > 0) {
              // Calculate USD value for ETH (portfolio value minus USDC)
              const usdcTotal = balancesSummary.totals.USDC;
              const usdcValue = usdcTotal ? parseFloat(usdcTotal.totalFormatted) : 0;
              const ethValueUSD = portfolioValue - usdcValue;
              
              tokenList.push({
                image: "",
                name: "Ethereum",
                symbol: "ETH",
                amount: ethTotal.totalFormatted,
                valueUSD: `$${ethValueUSD.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`,
              });
            }

            // Add USDC token
            const usdcTotal = balancesSummary.totals.USDC;
            if (usdcTotal && parseFloat(usdcTotal.totalFormatted) > 0) {
              const usdcValue = parseFloat(usdcTotal.totalFormatted);
              tokenList.push({
                image: "",
                name: "USD Coin",
                symbol: "USDC",
                amount: usdcTotal.totalFormatted,
                valueUSD: `$${usdcValue.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`,
              });
            }

            setTokens(tokenList);
          } catch (apiError) {
            console.error("Error fetching portfolio data:", apiError);
            if (apiError instanceof ApiError) {
              setError(
                `Failed to load portfolio: ${apiError.message}. Please try again later.`,
              );
            } else {
              setError(
                "Failed to load portfolio data. Please try again later.",
              );
            }
            // Set default empty state
            setTotalPortfolioValue("$0.00");
            setTokens([]);
          }
        },
      );
    } catch (error) {
      console.error("Error loading wallet data:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load wallet. Please try again.",
      );
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

  // Helper function to convert hex color to RGB string for rgba
  const hexToRgb = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result && result[1] && result[2] && result[3]) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `${r}, ${g}, ${b}`;
    }
    return "59, 130, 246"; // Default blue
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

  const handleTopUpClick = () => {
    setShowTopUp(true);
  };

  const handleBackFromTopUp = () => {
    setShowTopUp(false);
    loadPendingTransactions(); // Reload transactions after top-up
    loadWalletData(); // Reload wallet data to refresh balances
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

  if (error && tokens.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--spacing-md)",
          padding: "var(--spacing-md)",
          color: "var(--text-secondary)",
          background: "var(--bg-primary)",
        }}
      >
        <div
          style={{
            padding: "var(--spacing-md)",
            background: "rgba(255, 68, 68, 0.1)",
            border: "1px solid rgba(255, 68, 68, 0.3)",
            borderRadius: "var(--border-radius)",
            color: "#ff4444",
            fontSize: "12px",
            textAlign: "center",
            maxWidth: "300px",
          }}
        >
          {error}
        </div>
        <button
          onClick={loadWalletData}
          style={{
            padding: "var(--spacing-sm) var(--spacing-md)",
            background: "var(--bg-button-primary)",
            border: "1px solid var(--border-focus)",
            borderRadius: "var(--border-radius)",
            color: "var(--text-primary)",
            fontSize: "12px",
            fontFamily: "var(--font-family-sans)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Show top-up screen if requested
  if (showTopUp) {
    return (
      <TopUpScreen
        onBack={handleBackFromTopUp}
        password={password}
        encryptedVault={encryptedVault}
      />
    );
  }

  // Show send screen if a token is selected
  if (selectedToken) {
    return (
      <SendScreen
        token={selectedToken}
        onBack={handleBackFromSend}
        onCancel={handleCancelSend}
        password={password}
        encryptedVault={encryptedVault}
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
            justifyContent: "flex-end",
          }}
        >
          <AccountSelector
            password={password}
            encryptedVault={encryptedVault}
            onAccountChange={async (accountIndex, newAddress) => {
              console.log("Account changed:", accountIndex, newAddress);
              setAddress(newAddress);
              
              // Load account color for the new account
              try {
                const color = await getAccountColor(accountIndex);
                if (color) {
                  setAccountColor(color);
                } else {
                  setAccountColor("#3b82f6");
                }
              } catch (error) {
                console.error("Error loading account color:", error);
                setAccountColor("#3b82f6");
              }
              
              // Set loading state for balances
              setIsLoadingBalances(true);
              try {
                // Reload wallet data for the new account
                await loadWalletData();
              } catch (error) {
                console.error("Error loading wallet data after account change:", error);
              } finally {
                setIsLoadingBalances(false);
              }
            }}
          />
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
              background: `rgba(${hexToRgb(accountColor)}, 0.05)`,
              border: `1px solid rgba(${hexToRgb(accountColor)}, 0.2)`,
              borderRadius: "var(--border-radius)",
              transition: "all var(--transition-normal)",
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
                color: accountColor,
                fontFamily: "var(--font-family-sans)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "color var(--transition-normal)",
              }}
            >
              {isLoadingBalances ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      animation: "spin 1s linear infinite",
                    }}
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="32"
                      strokeDashoffset="32"
                      opacity="0.3"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="32"
                      strokeDashoffset="24"
                    />
                  </svg>
                  <span style={{ fontSize: "14px", opacity: 0.7 }}>Loading...</span>
                </>
              ) : (
                totalPortfolioValue
              )}
            </div>
          </div>

          {/* Top Up Button */}
          <button
            onClick={handleTopUpClick}
            style={{
              width: "100%",
              padding: "var(--spacing-md)",
              background: `rgba(${hexToRgb(accountColor)}, 0.1)`,
              border: `1px solid rgba(${hexToRgb(accountColor)}, 0.3)`,
              borderRadius: "var(--border-radius)",
              color: accountColor,
              fontSize: "12px",
              fontWeight: 600,
              fontFamily: "var(--font-family-sans)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--spacing-xs)",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `rgba(${hexToRgb(accountColor)}, 0.15)`;
              e.currentTarget.style.borderColor = `rgba(${hexToRgb(accountColor)}, 0.5)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `rgba(${hexToRgb(accountColor)}, 0.1)`;
              e.currentTarget.style.borderColor = `rgba(${hexToRgb(accountColor)}, 0.3)`;
            }}
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Top Up Funds</span>
          </button>

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
                  onDelete={handleTransactionDelete}
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
            {isLoadingBalances ? (
              <div
                style={{
                  padding: "var(--spacing-lg)",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{
                    animation: "spin 1s linear infinite",
                  }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="32"
                    strokeDashoffset="32"
                    opacity="0.3"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="32"
                    strokeDashoffset="24"
                  />
                </svg>
                <span>Loading balances...</span>
              </div>
            ) : tokens.length === 0 ? (
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
      <FilecoinBackupButton password={password} encryptedVault={encryptedVault} />
    </div>
  );
}
