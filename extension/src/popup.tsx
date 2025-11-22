import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import LandingScreen from "./components/LandingScreen";
import UnlockScreen from "./components/UnlockScreen";
import { hasWallet } from "./utils/storage";

function Popup() {
  const [hasExistingWallet, setHasExistingWallet] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    const checkWalletExists = async () => {
      try {
        const exists = await hasWallet();
        setHasExistingWallet(exists);
      } catch (error) {
        console.error("Error checking wallet:", error);
        setHasExistingWallet(false);
      }
    };

    checkWalletExists();
  }, []);

  // Show loading state while checking
  if (hasExistingWallet === null) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
        }}
      >
        Loading...
      </div>
    );
  }

  // Show unlock screen if wallet exists, otherwise show landing screen
  return hasExistingWallet ? <UnlockScreen /> : <LandingScreen />;
}

function init() {
  const container = document.getElementById("root");
  if (!container) {
    console.error("Root container not found");
    return;
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}

init();
