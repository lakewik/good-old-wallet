import React from "react";
import type { EncryptedVault } from "../utils/WalletVault";
import PortfolioScreen from "./PortfolioScreen";

interface SuccessScreenProps {
  encryptedVault: EncryptedVault;
  password: string;
  restoredFromFilecoin?: boolean;
}

/**
 * SuccessScreen - Now redirects to PortfolioScreen
 *
 * NOTE: Test signing code has been moved to src/utils/testSigningReference.ts
 * for reference purposes.
 */
export default function SuccessScreen({
  encryptedVault,
  password,
  restoredFromFilecoin = false,
}: SuccessScreenProps) {
  // Redirect to portfolio screen
  return (
    <PortfolioScreen 
      encryptedVault={encryptedVault} 
      password={password}
      restoredFromFilecoin={restoredFromFilecoin}
    />
  );
}
