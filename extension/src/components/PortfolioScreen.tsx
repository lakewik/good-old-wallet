import React, { useState, useEffect } from "react";
import Button from "./Button";
import { PageContainer, ContentContainer } from "./Container";
import { LOGO_PATH, LOGO_ALT } from "../constants";
import { WalletVault } from "../utils/WalletVault";
import { getEncryptedVault } from "../utils/storage";
import type { EncryptedVault } from "../utils/WalletVault";

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
  const [totalPortfolioValue, setTotalPortfolioValue] = useState<string>("$0.00");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    try {
      const vault = new WalletVault();
      await vault.unlockAndExecute(password, encryptedVault, async (seedPhraseBytes) => {
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
      });
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

  const handleSend = () => {
    // Empty function for now
    console.log("Send button clicked");
  };

  const handleTokenSend = (token: Token) => {
    // Empty function for now
    console.log("Send token clicked:", token);
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

        {/* Send Button */}
        <div style={{ width: "100%" }}>
          <button
            onClick={handleSend}
            style={{
              width: "100%",
              padding: "var(--spacing-md) var(--spacing-lg)",
              border: "1px solid var(--border-primary)",
              borderRadius: "var(--border-radius)",
              fontFamily: "var(--font-family-sans)",
              fontSize: "10px",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              position: "relative",
              color: "var(--text-primary)",
              borderColor: "var(--border-focus)",
              background: "var(--bg-button-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--spacing-xs)",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.35)";
              e.currentTarget.style.background = "var(--bg-button-primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-focus)";
              e.currentTarget.style.background = "var(--bg-button-primary)";
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

        {/* Tokens List */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-sm)",
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

