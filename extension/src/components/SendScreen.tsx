import React, { useState } from "react";
import Button from "./Button";
import { PageContainer, ContentContainer } from "./Container";
import { LOGO_PATH, LOGO_ALT } from "../constants";
import ConfirmationScreen from "./ConfirmationScreen";
import {
  planSendingTransaction,
  normalizeTransactionPlanWithAmount,
  getAssets,
  ApiError,
  type PlanRequest,
} from "../utils/api";
import { getEncryptedVault, getSelectedAccountIndex } from "../utils/storage";
import { WalletVault } from "../utils/WalletVault";
import { deriveWalletFromPhrase } from "../utils/accountManager";

interface Token {
  image: string;
  name: string;
  symbol: string;
  amount: string;
  valueUSD: string;
}

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

interface SendScreenProps {
  token: Token;
  onBack: () => void;
  onCancel: () => void;
  password: string;
  encryptedVault: any;
}

export default function SendScreen({
  token,
  onBack,
  onCancel,
  password,
  encryptedVault,
}: SendScreenProps) {
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationPlan, setConfirmationPlan] = useState<TransactionPlan | null>(null);

  const tokenBalance = parseFloat(token.amount) || 0;
  const enteredAmount = parseFloat(amount) || 0;
  const exceedsBalance = enteredAmount > tokenBalance;
  const isValidAmount = amount !== "" && enteredAmount > 0 && !exceedsBalance;
  const isValidAddress = address.trim().length > 0;
  const isUsdcToken = token.symbol.toUpperCase() === "USDC";
  const isEthToken = token.symbol.toUpperCase() === "ETH";
  const canSend =
    isValidAmount &&
    isValidAddress &&
    !exceedsBalance &&
    !isLoading &&
    (isUsdcToken || isEthToken);

  const handleMaxClick = () => {
    setAmount(token.amount);
  };

  const handleSend = async () => {
    if (!canSend) return;
    
    setIsLoading(true);
    setError(null);

    try {
      // Get wallet address from vault using selected account
      const accountIndex = await getSelectedAccountIndex();
      const vault = new WalletVault();
      let sourceAddress = "";
      
      await vault.unlockAndExecute(
        password,
        encryptedVault,
        async (seedPhraseBytes) => {
          const decoder = new TextDecoder();
          const seedPhrase = decoder.decode(seedPhraseBytes);
          const { address } = await deriveWalletFromPhrase(seedPhrase, accountIndex);
          sourceAddress = address;
        },
      );

      if (!sourceAddress) {
        throw new Error("Failed to get wallet address");
      }

      // Validate address format
      if (!address.match(/^0x[a-fA-F0-9]{40}$/i)) {
        setError("Invalid recipient address format");
        setIsLoading(false);
        return;
      }

      const tokenSymbolUpper = token.symbol.toUpperCase();
      let normalizedPlan: TransactionPlan | null = null;

      if (tokenSymbolUpper === "USDC") {
        // USDC: Use backend API for planning
        const planRequest: PlanRequest = {
          sourceAddress,
          destinationAddress: address.trim(),
          amount: amount,
          tokenName: "USDC",
        };

        // Call API to plan transaction
        const response = await planSendingTransaction(planRequest);

        if (!response.success || !response.plan) {
          // No viable plan found
          setError(
            response.message ||
              "No viable plan found. Insufficient balance across all chains.",
          );
          setIsLoading(false);
          return;
        }

        // Normalize the plan response to match UI expectations
        normalizedPlan = normalizeTransactionPlanWithAmount(
          response.plan,
          amount,
        );

        if (!normalizedPlan) {
          setError("Failed to process transaction plan");
          setIsLoading(false);
          return;
        }
      } else if (tokenSymbolUpper === "ETH") {
        // ETH: Create plan directly from assets
        const assets = await getAssets(sourceAddress);
        const requestedAmountEth = parseFloat(amount);
        const requestedAmountWei = BigInt(Math.floor(requestedAmountEth * 1e18));

        // Find chains with sufficient ETH balance
        const legs: TransactionLeg[] = [];
        let remainingAmount = requestedAmountWei;
        let totalGasCostUsdc = BigInt(0);

        // Estimate gas cost (rough estimate: 21000 gas * 20 gwei = 0.00042 ETH per transfer)
        // Convert to USDC (rough estimate: 1 ETH = $2500, so 0.00042 ETH = ~$1.05 = ~1.05 USDC)
        const estimatedGasWei = BigInt("420000000000000"); // 0.00042 ETH
        const estimatedGasUsdc = BigInt("1050000"); // ~1.05 USDC (6 decimals)

        for (const chain of assets.chains) {
          if (remainingAmount <= 0n) break;

          const chainBalanceWei = BigInt(chain.native.balance);
          // Reserve some ETH for gas (keep at least 0.001 ETH for gas)
          const minReserveWei = BigInt("1000000000000000"); // 0.001 ETH
          const availableWei = chainBalanceWei > minReserveWei 
            ? chainBalanceWei - minReserveWei 
            : 0n;

          if (availableWei > 0n) {
            const amountToSend = availableWei < remainingAmount 
              ? availableWei 
              : remainingAmount;
            
            // Convert to ETH string (18 decimals)
            const amountEth = (Number(amountToSend) / 1e18).toString();
            
            legs.push({
              chainId: chain.chainId,
              chainName: chain.chainName,
              amountUsdc: amountToSend.toString(), // Store as wei string (will be interpreted as native ETH)
              gasCostUsdc: estimatedGasUsdc.toString(),
            });

            totalGasCostUsdc += estimatedGasUsdc;
            remainingAmount -= amountToSend;
          }
        }

        if (remainingAmount > 0n) {
          setError("Insufficient ETH balance across all chains");
          setIsLoading(false);
          return;
        }

        normalizedPlan = {
          type: legs.length === 1 ? "single" : "multi",
          legs,
          totalAmount: requestedAmountWei.toString(),
          totalGasCostUsdc: totalGasCostUsdc.toString(),
        };
      } else {
        setError(`Token ${token.symbol} is not supported. Only USDC and ETH are supported.`);
        setIsLoading(false);
        return;
      }

      // Success - show confirmation screen
      setConfirmationPlan(normalizedPlan);
      setIsLoading(false);
    } catch (err) {
      console.error("Error creating transaction plan:", err);
      
      let errorMessage = "Failed to create transaction plan";
      
      if (err instanceof ApiError) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleApprove = () => {
    // TODO: Execute the transactions
    console.log("Approving transactions:", confirmationPlan);
    // After approval, navigate back or show success
    onBack();
  };

  const handleTransactionSaved = () => {
    // Transaction was saved, PortfolioScreen will reload it when we navigate back
  };

  const handleCancelConfirmation = () => {
    setConfirmationPlan(null);
    setError(null);
  };

  // Show confirmation screen if plan is available
  if (confirmationPlan) {
    return (
      <ConfirmationScreen
        plan={confirmationPlan}
        recipientAddress={address}
        tokenSymbol={token.symbol}
        onApprove={handleApprove}
        onCancel={handleCancelConfirmation}
        onTransactionSaved={handleTransactionSaved}
        password={password}
        encryptedVault={encryptedVault}
      />
    );
  }

  return (
    <PageContainer>
      <ContentContainer>
        {/* Header with Back Button */}
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-sm)",
            marginBottom: "var(--spacing-md)",
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-family-sans)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "var(--spacing-xs)",
              transition: "opacity var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Back</span>
          </button>
        </div>

        {/* Token Info */}
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-md)",
            padding: "var(--spacing-md)",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "var(--border-radius)",
            marginBottom: "var(--spacing-lg)",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: token.image
                ? "transparent"
                : "rgba(255, 255, 255, 0.1)",
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
                  fontSize: "16px",
                  color: "var(--text-muted)",
                }}
              >
                {token.symbol.charAt(0)}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--text-primary)",
                marginBottom: "2px",
              }}
            >
              {token.name}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-family-mono)",
              }}
            >
              {token.symbol}
            </div>
          </div>
        </div>

        {/* Amount Input */}
        <div style={{ width: "100%", marginBottom: "var(--spacing-md)" }}>
          <label
            htmlFor="amount-input"
            style={{
              display: "block",
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "var(--spacing-xs)",
              fontFamily: "var(--font-family-sans)",
            }}
          >
            Amount
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: "var(--spacing-sm)",
              marginBottom: "var(--spacing-xs)",
            }}
          >
            <input
              id="amount-input"
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={isLoading}
              style={{
                flex: 1,
                padding: "var(--spacing-md)",
                background: "rgba(255, 255, 255, 0.02)",
                border: exceedsBalance
                  ? "1px solid #ff4444"
                  : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "var(--border-radius)",
                color: exceedsBalance ? "#ff4444" : "var(--text-primary)",
                fontSize: "16px",
                fontFamily: "var(--font-family-mono)",
                outline: "none",
                transition: "all var(--transition-fast)",
                boxSizing: "border-box",
                lineHeight: "1.5",
                margin: 0,
                opacity: isLoading ? 0.5 : 1,
              }}
              onFocus={(e) => {
                if (!exceedsBalance && !isLoading) {
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                }
              }}
              onBlur={(e) => {
                if (!exceedsBalance) {
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                }
              }}
            />
            <button
              onClick={handleMaxClick}
              style={{
                padding: "var(--spacing-md)",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "var(--border-radius)",
                color: "var(--text-primary)",
                fontSize: "12px",
                fontFamily: "var(--font-family-sans)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
                lineHeight: "1.5",
                margin: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
              }}
            >
              Max
            </button>
          </div>
          <div
            style={{
              fontSize: "11px",
              color: exceedsBalance ? "#ff4444" : "var(--text-muted)",
              fontFamily: "var(--font-family-mono)",
            }}
          >
            Balance: {token.amount} {token.symbol}
            {exceedsBalance && (
              <span style={{ marginLeft: "var(--spacing-xs)" }}>
                • Insufficient balance
              </span>
            )}
          </div>
        </div>

        {/* Address Input */}
        <div style={{ width: "100%", marginBottom: "var(--spacing-md)" }}>
          <label
            htmlFor="address-input"
            style={{
              display: "block",
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "var(--spacing-xs)",
              fontFamily: "var(--font-family-sans)",
            }}
          >
            Recipient Address
          </label>
          <input
            id="address-input"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "var(--spacing-md)",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--border-radius)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-family-mono)",
              outline: "none",
              transition: "all var(--transition-fast)",
              opacity: isLoading ? 0.5 : 1,
            }}
            onFocus={(e) => {
              if (!isLoading) {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
            }}
          />
        </div>


        {/* Error Message */}
        {error && (
          <div
            style={{
              width: "100%",
              padding: "var(--spacing-md)",
              background: "rgba(255, 68, 68, 0.1)",
              border: "1px solid rgba(255, 68, 68, 0.3)",
              borderRadius: "var(--border-radius)",
              color: "#ff4444",
              fontSize: "12px",
              marginBottom: "var(--spacing-md)",
            }}
          >
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            width: "100%",
            display: "flex",
            gap: "var(--spacing-sm)",
            alignItems: "center",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "var(--spacing-md) var(--spacing-lg)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "var(--border-radius)",
              fontFamily: "var(--font-family-sans)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: "var(--text-primary)",
              background: "rgba(255, 255, 255, 0.02)",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              flex: 1,
              padding: "var(--spacing-md) var(--spacing-lg)",
              border: "1px solid var(--border-focus)",
              borderRadius: "var(--border-radius)",
              fontFamily: "var(--font-family-sans)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: canSend ? "pointer" : "not-allowed",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: "var(--text-primary)",
              background: canSend
                ? "var(--bg-button-primary)"
                : "rgba(255, 255, 255, 0.05)",
              opacity: canSend ? 1 : 0.5,
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              if (canSend) {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.35)";
                e.currentTarget.style.background =
                  "var(--bg-button-primary-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (canSend) {
                e.currentTarget.style.borderColor = "var(--border-focus)";
                e.currentTarget.style.background = "var(--bg-button-primary)";
              }
            }}
          >
            {isLoading ? "Loading..." : "Send"}
          </button>
        </div>
      </ContentContainer>
    </PageContainer>
  );
}

