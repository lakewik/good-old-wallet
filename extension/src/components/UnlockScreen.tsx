import React, { useState } from "react";
import Logo from "./Logo";
import Title from "./Title";
import Input from "./Input";
import Button from "./Button";
import { PageContainer, ContentContainer, ButtonGroup } from "./Container";
import {
  APP_NAME,
  LOGO_PATH,
  LOGO_ALT,
  PASSWORD_LABEL,
  PASSWORD_PLACEHOLDER,
} from "../constants";
import { WalletVault } from "../utils/WalletVault";
import { getEncryptedVault } from "../utils/storage";
import SuccessScreen from "./SuccessScreen";
import type { EncryptedVault } from "../utils/WalletVault";

export default function UnlockScreen() {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encryptedVault, setEncryptedVault] = useState<EncryptedVault | null>(
    null,
  );

  const handleUnlock = async () => {
    setError(null);

    if (!password.trim()) {
      setError("Please enter your password");
      return;
    }

    setIsLoading(true);

    try {
      const storedData = await getEncryptedVault();
      if (!storedData) {
        setError("No wallet found. Please import a seed phrase first.");
        setIsLoading(false);
        return;
      }

      const vault = new WalletVault();

      // Test decryption by trying to unlock
      await vault.unlockAndExecute(password, storedData.vault, async () => {
        // If we get here, decryption succeeded
        // Store the vault for success screen
        setEncryptedVault(storedData.vault);
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to unlock wallet";
      setError(errorMessage);
      console.error("Error unlocking wallet:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Show success screen if unlocked
  if (encryptedVault) {
    return (
      <SuccessScreen encryptedVault={encryptedVault} password={password} />
    );
  }

  return (
    <PageContainer>
      <ContentContainer>
        <Logo src={LOGO_PATH} alt={LOGO_ALT} />
        <Title>{APP_NAME}</Title>

        <Input
          id="password-input"
          label={PASSWORD_LABEL}
          value={password}
          onChange={setPassword}
          placeholder={PASSWORD_PLACEHOLDER}
          type="password"
          disabled={isLoading}
          autoFocus={true}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading && password.trim()) {
              handleUnlock();
            }
          }}
        />

        {error && (
          <div
            className="error-message"
            style={{ color: "#ff4444", marginTop: "8px", fontSize: "14px" }}
          >
            {error}
          </div>
        )}

        <ButtonGroup>
          <Button
            variant="primary"
            onClick={handleUnlock}
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? "Unlocking..." : "Unlock Wallet"}
          </Button>
        </ButtonGroup>
      </ContentContainer>
    </PageContainer>
  );
}
