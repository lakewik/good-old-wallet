import React, { useState } from "react";
import Logo from "./Logo";
import Title from "./Title";
import Input from "./Input";
import Button from "./Button";
import {
  PageContainer,
  ContentContainer,
  ButtonGroup,
  InputGroup,
} from "./Container";
import {
  APP_NAME,
  LOGO_PATH,
  LOGO_ALT,
  SEED_PHRASE_PLACEHOLDER,
  SEED_PHRASE_LABEL,
  PASSWORD_PLACEHOLDER,
  PASSWORD_LABEL,
  BUTTON_LABELS,
} from "../constants";
import { WalletVault, type EncryptedVault } from "../utils/WalletVault";
import { 
  saveEncryptedVault,
  setAccountIndices,
  setAccountColor,
  setAccountName,
} from "../utils/storage";
import { restoreFromFilecoin } from "../utils/filecoinBackup";
import SuccessScreen from "./SuccessScreen";

export default function LandingScreen() {
  const [seedPhrase, setSeedPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encryptedVault, setEncryptedVault] = useState<EncryptedVault | null>(
    null,
  );
  const [savedPassword, setSavedPassword] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [restoredFromFilecoin, setRestoredFromFilecoin] = useState(false);

  const handleImportSeedPhrase = async () => {
    // Reset states
    setError(null);

    // Validation
    if (!seedPhrase.trim()) {
      setError("Please enter a seed phrase");
      return;
    }

    if (!password.trim()) {
      setError("Please enter a password");
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const vault = new WalletVault();
      setStatusMessage("Encrypting wallet...");
      const encryptedVault = await vault.encryptWallet(password, seedPhrase);

      // Save to chrome.storage.local
      await saveEncryptedVault(encryptedVault);

      // Try to restore account data from Filecoin backup
      try {
        console.log("Attempting to restore account data from Filecoin backup...");
        const backupData = await restoreFromFilecoin(seedPhrase, (message) => {
          setStatusMessage(message);
        });
        
        if (backupData) {
          console.log("Restoring account data:", backupData);
          setStatusMessage("Restoring account data...");
          
          // Restore account indices
          await setAccountIndices(backupData.indices);
          
          // Restore account colors
          for (const [accountIndex, color] of Object.entries(backupData.colors)) {
            await setAccountColor(Number(accountIndex), color);
          }
          
          // Restore account names
          for (const [accountIndex, name] of Object.entries(backupData.names)) {
            await setAccountName(Number(accountIndex), name);
          }
          
          setStatusMessage("✅ Account data restored from Filecoin backup");
          setRestoredFromFilecoin(true);
          console.log("✅ Account data restored from Filecoin backup");
        } else {
          console.log("No backup found, starting with default account");
          setStatusMessage(null);
          setRestoredFromFilecoin(false);
        }
      } catch (restoreError) {
        console.error("Error restoring from backup (continuing anyway):", restoreError);
        setStatusMessage(null);
        // Continue even if restore fails - user can still use the wallet
      }

      // Store encrypted vault and password for success screen
      setEncryptedVault(encryptedVault);
      setSavedPassword(password);

      // Clear sensitive data from state (but keep password for signing test)
      setSeedPhrase("");
      setPassword("");

      console.log("Seed phrase encrypted and saved successfully");
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to encrypt and save seed phrase";
      setError(errorMessage);
      console.error("Error importing seed phrase:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSeedPhrase = () => {
    // TODO: Implement generate logic
    console.log("Generate new seed phrase");
  };

  // Show success screen if we have encrypted vault
  if (encryptedVault) {
    return (
      <SuccessScreen 
        encryptedVault={encryptedVault} 
        password={savedPassword}
        restoredFromFilecoin={restoredFromFilecoin}
      />
    );
  }

  return (
    <PageContainer>
      <ContentContainer>
        <Logo src={LOGO_PATH} alt={LOGO_ALT} />
        <Title>{APP_NAME}</Title>

        <InputGroup>
          <Input
            id="seed-phrase-input"
            label={SEED_PHRASE_LABEL}
            value={seedPhrase}
            onChange={setSeedPhrase}
            placeholder={SEED_PHRASE_PLACEHOLDER}
            type="textarea"
            rows={3}
            disabled={isLoading}
          />

          <Input
            id="password-input"
            label={PASSWORD_LABEL}
            value={password}
            onChange={setPassword}
            placeholder={PASSWORD_PLACEHOLDER}
            type="password"
            disabled={isLoading}
            className="input-compact"
          />
        </InputGroup>

        {error && (
          <div
            className="error-message"
            style={{ color: "#ff4444", marginTop: "8px", fontSize: "14px" }}
          >
            {error}
          </div>
        )}

        {statusMessage && (
          <div
            className="status-message"
            style={{ 
              color: statusMessage.startsWith("✅") ? "#22c55e" : "#3b82f6", 
              marginTop: "8px", 
              fontSize: "14px",
              textAlign: "center"
            }}
          >
            {statusMessage}
          </div>
        )}

        <ButtonGroup>
          <Button
            variant="primary"
            onClick={handleImportSeedPhrase}
            disabled={isLoading}
          >
            {isLoading 
              ? (statusMessage || "Processing...") 
              : BUTTON_LABELS.IMPORT_SEED_PHRASE}
          </Button>
          <Button
            variant="text"
            onClick={handleGenerateSeedPhrase}
            disabled={isLoading}
          >
            {BUTTON_LABELS.GENERATE_NEW_SEED_PHRASE}
          </Button>
        </ButtonGroup>
      </ContentContainer>
    </PageContainer>
  );
}
