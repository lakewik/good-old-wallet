import React, { useState } from "react";
import { backupToFilecoin } from "../utils/filecoinBackup";
import type { EncryptedVault } from "../utils/WalletVault";

interface FilecoinBackupButtonProps {
  password: string;
  encryptedVault: EncryptedVault;
}

export default function FilecoinBackupButton({
  password,
  encryptedVault,
}: FilecoinBackupButtonProps) {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [backupCid, setBackupCid] = useState<string>("");
  const [backupStatus, setBackupStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const handleBackup = async () => {
    setIsBackingUp(true);
    setBackupStatus({ type: null, message: "" });

    try {
      const { pieceCid, size } = await backupToFilecoin(password, encryptedVault);
      // Convert CID to string (it might be a CID object)
      const cidString = typeof pieceCid === 'string' ? pieceCid : pieceCid.toString();
      setBackupCid(cidString);
      setShowSuccessModal(true);
      
      // Auto-close modal after 8 seconds
      setTimeout(() => {
        setShowSuccessModal(false);
      }, 8000);
    } catch (error) {
      console.error("Backup error:", error);
      setBackupStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Backup failed",
      });
      
      // Clear error message after 5 seconds
      setTimeout(() => {
        setBackupStatus({ type: null, message: "" });
      }, 5000);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <>
      {/* Success Modal */}
      {showSuccessModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "var(--spacing-md)",
          }}
          onClick={() => setShowSuccessModal(false)}
        >
          <div
            style={{
              background: "var(--bg-primary)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "var(--border-radius)",
              padding: "var(--spacing-xl)",
              maxWidth: "400px",
              width: "100%",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--spacing-md)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={chrome.runtime.getURL("corgi.png")}
              alt="Happy Corgi"
              style={{
                width: "200px",
                height: "auto",
                borderRadius: "var(--border-radius)",
              }}
            />
            <div
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#10b981",
                fontFamily: "var(--font-family-sans)",
              }}
            >
              Backup Successful! 🎉
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                fontFamily: "var(--font-family-mono)",
                wordBreak: "break-all",
                padding: "var(--spacing-sm)",
                background: "rgba(255, 255, 255, 0.05)",
                borderRadius: "4px",
                width: "100%",
              }}
            >
              CID: {backupCid}
            </div>
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                padding: "var(--spacing-sm) var(--spacing-md)",
                background: "var(--bg-button-primary)",
                border: "1px solid var(--border-focus)",
                borderRadius: "var(--border-radius)",
                color: "var(--text-primary)",
                fontSize: "12px",
                fontFamily: "var(--font-family-sans)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-button-primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-button-primary)";
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Error Status */}
      {backupStatus.type === "error" && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            right: "16px",
            zIndex: 1000,
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.2)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "var(--border-radius)",
            color: "#ef4444",
            fontSize: "12px",
            fontFamily: "var(--font-family-sans)",
            maxWidth: "280px",
            wordBreak: "break-word",
          }}
        >
          {backupStatus.message}
        </div>
      )}

      {/* Backup Button */}
      <div
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 1000,
        }}
      >
        <button
        onClick={handleBackup}
        disabled={isBackingUp}
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: isBackingUp
            ? "rgba(234, 179, 8, 0.3)"
            : "rgba(0, 144, 255, 0.15)",
          border: isBackingUp
            ? `1px solid rgba(234, 179, 8, 0.6)`
            : `1px solid rgba(0, 144, 255, 0.4)`,
          color: isBackingUp ? "#eab308" : "#0090FF",
          cursor: isBackingUp ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all var(--transition-fast)",
          boxShadow: isBackingUp 
            ? "0 4px 12px rgba(234, 179, 8, 0.3)" 
            : "0 4px 12px rgba(0, 0, 0, 0.3)",
          padding: 0,
        }}
        onMouseEnter={(e) => {
          if (!isBackingUp) {
            e.currentTarget.style.background = "rgba(0, 144, 255, 0.25)";
            e.currentTarget.style.transform = "scale(1.05)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isBackingUp) {
            e.currentTarget.style.background = "rgba(0, 144, 255, 0.15)";
            e.currentTarget.style.transform = "scale(1)";
          }
        }}
        title="Backup to Filecoin"
      >
        {isBackingUp ? (
          <svg
            width="20"
            height="20"
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
        ) : (
          <img
            src={chrome.runtime.getURL("filecoin.png")}
            alt="Filecoin Logo"
            style={{
              width: "24px",
              height: "24px",
              objectFit: "contain",
            }}
          />
        )}
      </button>
      </div>
    </>
  );
}
