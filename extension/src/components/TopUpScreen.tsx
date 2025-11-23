import React, { useState } from "react";
import Button from "./Button";
import Input from "./Input";
import { WalletVault } from "../utils/WalletVault";
import { deriveWalletFromPhrase } from "../utils/accountManager";
import { getSelectedAccountIndex } from "../utils/storage";
import type { EncryptedVault } from "../utils/WalletVault";
import Safe from "@safe-global/protocol-kit";
import { Wallet as EthersWallet, parseUnits, Contract } from "ethers";

interface TopUpScreenProps {
  onBack: () => void;
  password: string;
  encryptedVault: EncryptedVault;
}

type Step = "input" | "creating" | "ready" | "verifying" | "settling" | "complete" | "error";

export default function TopUpScreen({
  onBack,
  password,
  encryptedVault,
}: TopUpScreenProps) {
  const [amount, setAmount] = useState("0.01");
  const [step, setStep] = useState<Step>("input");
  const [paymentPayload, setPaymentPayload] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");

  const BACKEND_URL = "http://localhost:7000";
  const BACKEND_ADDRESS = "0x572E3a2d12163D8FACCF5385Ce363D152EA3A33E";
  const TOKEN_ADDRESS = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d"; // wxDAI on Gnosis
  const RPC_URL = "https://rpc.gnosischain.com";

  const handleCreatePayload = async () => {
    setStep("creating");
    setError("");

    try {
      // Get user's private key
      const vault = new WalletVault();
      const accountIndex = await getSelectedAccountIndex();
      
      let userPrivateKey: string = "";
      await vault.unlockAndExecute(
        password,
        encryptedVault,
        async (seedPhraseBytes) => {
          const decoder = new TextDecoder();
          const seedPhrase = decoder.decode(seedPhraseBytes);
          const { wallet: { privateKey } } = await deriveWalletFromPhrase(seedPhrase, accountIndex);
          userPrivateKey = privateKey;
        }
      );

      const ownerWallet = new EthersWallet(userPrivateKey);
      console.log("Owner address:", ownerWallet.address);

      // Initialize Safe with deterministic salt based on user address
      // This ensures the same user always gets the same Safe address
      const deterministicSalt = "0"; // Use 0 for first Safe per account
      const safe = await Safe.init({
        provider: RPC_URL,
        signer: userPrivateKey,
        predictedSafe: {
          safeAccountConfig: {
            owners: [ownerWallet.address],
            threshold: 1,
          },
          safeDeploymentConfig: {
            saltNonce: deterministicSalt,
          },
        },
      });

      const safeAddress = await safe.getAddress();
      console.log("Safe Address:", safeAddress);

      // Check if Safe is deployed
      const isSafeDeployed = await safe.isSafeDeployed();
      console.log("Is Safe deployed:", isSafeDeployed);
      
      if (!isSafeDeployed) {
        console.log("⚠️ Safe not deployed, will deploy with first transaction");
        // The Safe will be deployed automatically when we execute the first transaction
        // via the /settle endpoint
      }

      // Create ERC20 transfer data
      const transferAmountWei = parseUnits(amount, 18);
      const erc20Interface = new Contract(
        TOKEN_ADDRESS,
        ["function transfer(address to, uint256 amount) returns (bool)"],
        ownerWallet
      ).interface;

      const transferData = erc20Interface.encodeFunctionData("transfer", [
        BACKEND_ADDRESS,
        transferAmountWei,
      ]);

      // Create Safe transaction
      const safeTransaction = await safe.createTransaction({
        transactions: [
          {
            to: TOKEN_ADDRESS,
            value: "0",
            data: transferData,
          },
        ],
      });

      // Sign the transaction
      const signedSafeTransaction = await safe.signTransaction(safeTransaction);
      const signature = signedSafeTransaction.signatures.get(ownerWallet.address.toLowerCase());
      
      if (!signature) {
        throw new Error("Failed to get signature");
      }

      // Create payload
      const payload = {
        paymentPayload: {
          scheme: "evm-safe-wcrc",
          networkId: 100,
          safeAddress: safeAddress,
          safeTx: {
            from: ownerWallet.address,
            to: safeTransaction.data.to,
            value: safeTransaction.data.value,
            data: safeTransaction.data.data,
            operation: safeTransaction.data.operation,
            safeTxGas: safeTransaction.data.safeTxGas,
            baseGas: safeTransaction.data.baseGas,
            gasPrice: safeTransaction.data.gasPrice,
            gasToken: safeTransaction.data.gasToken,
            refundReceiver: safeTransaction.data.refundReceiver,
            nonce: safeTransaction.data.nonce.toString(),
          },
          signatures: signature.data,
        },
      };

      console.log("Payment payload created:", payload);
      setPaymentPayload(payload);
      setStep("ready");
    } catch (err) {
      console.error("Error creating payload:", err);
      setError(err instanceof Error ? err.message : "Failed to create payment");
      setStep("error");
    }
  };

  const handleConfirmPayment = async () => {
    setStep("verifying");
    setError("");

    try {
      // Step 1: Verify
      console.log("Verifying payment...");
      const verifyResponse = await fetch(`${BACKEND_URL}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentPayload),
      });

      const verifyData = await verifyResponse.json();
      console.log("Verification response:", verifyData);

      if (!verifyResponse.ok || !verifyData.valid) {
        throw new Error(`Verification failed: ${verifyData.reason || "Unknown error"}`);
      }

      console.log("✅ Payment verified!");

      // Step 2: Settle
      setStep("settling");
      await new Promise((resolve) => setTimeout(resolve, 1000)); // UX delay

      console.log("Settling payment...");
      const settleResponse = await fetch(`${BACKEND_URL}/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentPayload),
      });

      const settleData = await settleResponse.json();
      console.log("Settlement response:", settleData);

      if (!settleResponse.ok || !settleData.settled) {
        throw new Error(`Settlement failed: ${settleData.reason || "Unknown error"}`);
      }

      console.log("✅ Payment settled!");
      setTxHash(settleData.txHash || "");
      setStep("complete");
    } catch (err) {
      console.error("Payment flow error:", err);
      setError(err instanceof Error ? err.message : "Payment failed");
      setStep("error");
    }
  };

  const handleReset = () => {
    setAmount("0.01");
    setStep("input");
    setPaymentPayload(null);
    setError("");
    setTxHash("");
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
          padding: "var(--spacing-sm)",
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
        }}
      >
        <button
          onClick={step === "complete" ? handleReset : onBack}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Top Up Funds
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--spacing-md)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-md)",
        }}
      >
        {/* Input Step */}
        {step === "input" && (
          <>
            <div style={{ marginTop: "var(--spacing-lg)" }}>
              <Input
                label="Amount (xDAI)"
                type="text"
                value={amount}
                onChange={setAmount}
                placeholder="0.01"
              />
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  marginTop: "var(--spacing-xs)",
                }}
              >
                Minimum: 0.001 xDAI
              </div>
            </div>

            <div
              style={{
                marginTop: "auto",
                paddingTop: "var(--spacing-lg)",
              }}
            >
              <Button
                onClick={handleCreatePayload}
                disabled={!amount || parseFloat(amount) <= 0}
              >
                Create Payload
              </Button>
            </div>
          </>
        )}

        {/* Creating Step */}
        {step === "creating" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--spacing-md)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                animation: "spin 1s linear infinite",
                color: "var(--text-secondary)",
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
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Creating transaction...
            </div>
          </div>
        )}

        {/* Ready/Confirmation Step */}
        {step === "ready" && (
          <>
            <div
              style={{
                padding: "var(--spacing-md)",
                background: "rgba(68, 255, 68, 0.05)",
                border: "1px solid rgba(68, 255, 68, 0.2)",
                borderRadius: "var(--border-radius)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#44ff44",
                  marginBottom: "var(--spacing-sm)",
                  fontWeight: 600,
                }}
              >
                Transaction Ready
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                Amount: {amount} xDAI
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                To: {BACKEND_ADDRESS.substring(0, 10)}...
              </div>
            </div>

            <div style={{ marginTop: "auto" }}>
              <Button onClick={handleConfirmPayment}>Transfer</Button>
            </div>
          </>
        )}

        {/* Verifying Step */}
        {step === "verifying" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--spacing-md)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                animation: "spin 1s linear infinite",
                color: "var(--text-secondary)",
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
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Verifying payment...
            </div>
          </div>
        )}

        {/* Settling Step */}
        {step === "settling" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--spacing-md)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                animation: "spin 1s linear infinite",
                color: "var(--text-secondary)",
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
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Settling transaction...
            </div>
          </div>
        )}

        {/* Complete Step */}
        {step === "complete" && (
          <>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--spacing-md)",
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#44ff44"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div style={{ fontSize: "14px", color: "#44ff44", fontWeight: 600 }}>
                Payment Successful!
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  textAlign: "center",
                }}
              >
                Your balance has been updated
              </div>
              {txHash && (
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-family-mono)",
                    textAlign: "center",
                    wordBreak: "break-all",
                    padding: "var(--spacing-sm)",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "var(--border-radius)",
                  }}
                >
                  {txHash}
                </div>
              )}
            </div>

            <div style={{ marginTop: "auto" }}>
              <Button onClick={handleReset}>Done</Button>
            </div>
          </>
        )}

        {/* Error Step */}
        {step === "error" && (
          <>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--spacing-md)",
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ff4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <div style={{ fontSize: "14px", color: "#ff4444", fontWeight: 600 }}>
                Payment Failed
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  textAlign: "center",
                  padding: "var(--spacing-sm)",
                  background: "rgba(255, 68, 68, 0.1)",
                  borderRadius: "var(--border-radius)",
                }}
              >
                {error}
              </div>
            </div>

            <div style={{ marginTop: "auto" }}>
              <Button onClick={handleReset}>Try Again</Button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

