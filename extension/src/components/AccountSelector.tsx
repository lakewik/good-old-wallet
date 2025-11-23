import React, { useState, useEffect } from "react";
import {
  getSelectedAccountIndex,
  setSelectedAccountIndex,
  getAccountCount,
  getAccountIndices,
  addAccount,
  deleteAccount,
  getAllAccountColors,
  setAccountColor,
  getAllAccountNames,
  setAccountName,
} from "../utils/storage";
import { deriveWalletFromPhrase, getAccountLabel, formatAddress } from "../utils/accountManager";
import { WalletVault } from "../utils/WalletVault";
import type { EncryptedVault } from "../utils/WalletVault";

interface AccountSelectorProps {
  password: string;
  encryptedVault: EncryptedVault;
  onAccountChange?: (accountIndex: number, address: string) => void;
}

export default function AccountSelector({
  password,
  encryptedVault,
  onAccountChange,
}: AccountSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [accountIndices, setAccountIndices] = useState<number[]>([0]);
  const [accountAddresses, setAccountAddresses] = useState<Record<number, string>>({});
  const [accountColors, setAccountColors] = useState<Record<number, string>>({});
  const [accountNames, setAccountNames] = useState<Record<number, string>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [editingNameIndex, setEditingNameIndex] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>("");

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingColorIndex !== null) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-color-picker]')) {
          setEditingColorIndex(null);
        }
      }
    };

    if (editingColorIndex !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [editingColorIndex]);

  const loadAccounts = async () => {
    try {
      setIsLoadingAddresses(true);
      console.log("Starting to load accounts...");
      
      const [currentIndex, indices, colors, names] = await Promise.all([
        getSelectedAccountIndex(),
        getAccountIndices(),
        getAllAccountColors(),
        getAllAccountNames(),
      ]);
      
      console.log("Loaded account data:", { currentIndex, indices, colors, names });
      setSelectedIndex(currentIndex);
      setAccountIndices(indices);
      setAccountColors(colors);
      setAccountNames(names);
      
      // Derive addresses for all active accounts
      if (indices.length > 0) {
        await deriveAllAccountAddresses(indices);
      } else {
        setAccountAddresses({});
      }
    } catch (error) {
      console.error("Error loading accounts:", error);
      setAccountAddresses({});
    } finally {
      setIsLoadingAddresses(false);
      console.log("Finished loading accounts");
    }
  };

  const deriveAllAccountAddresses = async (indices: number[]) => {
    if (indices.length === 0) {
      setAccountAddresses({});
      return;
    }
    
    console.log(`Deriving addresses for accounts: ${indices.join(", ")}`);
    const vault = new WalletVault();
    const addresses: Record<number, string> = {};
    
    try {
      await vault.unlockAndExecute(
        password,
        encryptedVault,
        async (seedPhraseBytes) => {
          const decoder = new TextDecoder();
          const seedPhrase = decoder.decode(seedPhraseBytes);
          
          // Derive addresses for all active account indices
          for (const accountIndex of indices) {
            try {
              console.log(`Deriving address for account ${accountIndex}...`);
              const { address } = await deriveWalletFromPhrase(seedPhrase, accountIndex);
              if (address) {
                addresses[accountIndex] = address;
                console.log(`✓ Derived address for account ${accountIndex}: ${address}`);
              } else {
                console.error(`✗ No address returned for account ${accountIndex}`);
                addresses[accountIndex] = "";
              }
            } catch (error) {
              console.error(`✗ Error deriving address for account ${accountIndex}:`, error);
              // Set empty string as fallback
              addresses[accountIndex] = "";
            }
          }
        }
      );
      
      console.log("Final addresses object:", addresses);
      console.log("Addresses keys:", Object.keys(addresses));
      setAccountAddresses(addresses);
    } catch (error) {
      console.error("Error in deriveAllAccountAddresses:", error);
      // Set empty addresses on error but keep existing ones
      setAccountAddresses(prev => prev);
    }
  };

  const handleAccountSelect = async (index: number) => {
    if (index === selectedIndex) {
      setIsOpen(false);
      return;
    }
    
    try {
      console.log(`Selecting account ${index}, current selected: ${selectedIndex}`);
      
      // Get address first (derive if not in map)
      let address = accountAddresses[index];
      console.log(`Address from map for account ${index}:`, address);
      
      // If address not found, derive it
      if (!address) {
        console.log(`Address not in map, deriving for account ${index}...`);
        const vault = new WalletVault();
        await vault.unlockAndExecute(
          password,
          encryptedVault,
          async (seedPhraseBytes) => {
            const decoder = new TextDecoder();
            const seedPhrase = decoder.decode(seedPhraseBytes);
            const { address: derivedAddress } = await deriveWalletFromPhrase(seedPhrase, index);
            address = derivedAddress;
            console.log(`Derived address for account ${index}: ${address}`);
            
            // Update the addresses object
            setAccountAddresses({ ...accountAddresses, [index]: derivedAddress });
          }
        );
      }
      
      await setSelectedAccountIndex(index);
      setSelectedIndex(index);
      setIsOpen(false);
      
      console.log(`Account ${index} selected, address: ${address}`);
      if (address && onAccountChange) {
        console.log("Calling onAccountChange callback");
        onAccountChange(index, address);
      } else {
        console.warn("Address or onAccountChange missing:", { address, onAccountChange: !!onAccountChange });
      }
    } catch (error) {
      console.error("Error selecting account:", error);
    }
  };

  const handleAddAccount = async () => {
    setIsAdding(true);
    try {
      const newIndex = await addAccount();
      const updatedIndices = await getAccountIndices();
      
      console.log(`Adding new account ${newIndex}, updated indices: ${updatedIndices.join(", ")}`);
      
      // Update account indices first so the new account appears in the dropdown
      setAccountIndices(updatedIndices);
      
      // Derive address for the new account
      const vault = new WalletVault();
      let newAddress = "";
      try {
        await vault.unlockAndExecute(
          password,
          encryptedVault,
          async (seedPhraseBytes) => {
            const decoder = new TextDecoder();
            const seedPhrase = decoder.decode(seedPhraseBytes);
            const { address } = await deriveWalletFromPhrase(seedPhrase, newIndex);
            newAddress = address;
            console.log(`Added new account ${newIndex} with address: ${address}`);
          }
        );
        
        // Update addresses with the new account's address
        setAccountAddresses(prev => {
          const updated = { ...prev, [newIndex]: newAddress };
          console.log("Updated addresses after adding account:", updated);
          return updated;
        });
      } catch (deriveError) {
        console.error("Error deriving address for new account:", deriveError);
        // Still update the indices even if address derivation fails
        // The address will be derived when the account is selected or on next load
      }
    } catch (error) {
      console.error("Error adding account:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAccount = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent account selection when clicking delete
    
    // Prevent deleting if only one account remains
    if (accountIndices.length <= 1) {
      alert("Cannot delete the last account");
      return;
    }
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete ${getAccountLabel(index)}?`)) {
      return;
    }
    
    setDeletingIndex(index);
    try {
      const updatedIndices = await deleteAccount(index);
      const newSelectedIndex = await getSelectedAccountIndex();
      
      console.log(`Deleted account ${index}, remaining indices: ${updatedIndices.join(", ")}, selected: ${newSelectedIndex}`);
      
      // Update state
      setAccountIndices(updatedIndices);
      setSelectedIndex(newSelectedIndex);
      
      // Remove the deleted account's address from state
      setAccountAddresses(prev => {
        const updated = { ...prev };
        delete updated[index];
        return updated;
      });
      
      // Reload accounts to get fresh addresses (this will re-derive all visible accounts)
      await loadAccounts();
      
      // If the deleted account was selected, trigger account change callback after addresses are loaded
      if (index === selectedIndex && onAccountChange) {
        // Derive the new selected account's address
        const vault = new WalletVault();
        await vault.unlockAndExecute(
          password,
          encryptedVault,
          async (seedPhraseBytes) => {
            const decoder = new TextDecoder();
            const seedPhrase = decoder.decode(seedPhraseBytes);
            const { address } = await deriveWalletFromPhrase(seedPhrase, newSelectedIndex);
            onAccountChange(newSelectedIndex, address);
          }
        );
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      alert(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setDeletingIndex(null);
    }
  };

  const handleColorChange = async (accountIndex: number, color: string) => {
    try {
      await setAccountColor(accountIndex, color);
      setAccountColors(prev => ({ ...prev, [accountIndex]: color }));
      setEditingColorIndex(null);
    } catch (error) {
      console.error("Error setting account color:", error);
    }
  };

  // Predefined color options
  const colorOptions = [
    "#3b82f6", // Blue
    "#10b981", // Green
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#8b5cf6", // Purple
    "#ec4899", // Pink
    "#06b6d4", // Cyan
    "#84cc16", // Lime
    "#f97316", // Orange
    "#6366f1", // Indigo
  ];

  // Get current address and color
  const currentAddress = accountAddresses[selectedIndex];
  const currentColor = accountColors[selectedIndex] || colorOptions[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          padding: "var(--spacing-xs) var(--spacing-sm)",
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "var(--border-radius)",
          color: "var(--text-primary)",
          fontSize: "11px",
          fontFamily: "var(--font-family-mono)",
          cursor: "pointer",
          transition: "all var(--transition-fast)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: currentColor,
              flexShrink: 0,
            }}
          />
          <span>{getAccountLabel(selectedIndex, accountNames[selectedIndex])}</span>
        </div>
        {isLoadingAddresses ? (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "10px" }}>
            Loading...
          </span>
        ) : currentAddress ? (
          <span style={{ color: "var(--text-muted)" }}>
            {formatAddress(currentAddress)}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "10px" }}>
            ...
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--transition-fast)",
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + var(--spacing-xs))",
              right: 0,
              background: "var(--bg-primary)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "var(--border-radius)",
              minWidth: "200px",
              zIndex: 1001,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              overflow: "hidden",
            }}
          >
            {accountIndices.map((accountIndex) => {
              const address = accountAddresses[accountIndex];
              const isSelected = accountIndex === selectedIndex;
              
              return (
                <button
                  key={accountIndex}
                  onClick={() => handleAccountSelect(accountIndex)}
                  style={{
                    width: "100%",
                    padding: "var(--spacing-sm) var(--spacing-md)",
                    background: isSelected
                      ? "rgba(255, 255, 255, 0.1)"
                      : "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                    fontSize: "11px",
                    fontFamily: "var(--font-family-sans)",
                    transition: "all var(--transition-fast)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: accountColors[accountIndex] || colorOptions[0],
                            flexShrink: 0,
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            flex: 1,
                          }}
                        >
                          {editingNameIndex === accountIndex ? (
                            <input
                              type="text"
                              value={editingNameValue}
                              onChange={(e) => setEditingNameValue(e.target.value)}
                              onBlur={async () => {
                                if (editingNameValue.trim()) {
                                  await setAccountName(accountIndex, editingNameValue.trim());
                                  setAccountNames(prev => ({ ...prev, [accountIndex]: editingNameValue.trim() }));
                                }
                                setEditingNameIndex(null);
                                setEditingNameValue("");
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  if (editingNameValue.trim()) {
                                    await setAccountName(accountIndex, editingNameValue.trim());
                                    setAccountNames(prev => ({ ...prev, [accountIndex]: editingNameValue.trim() }));
                                  }
                                  setEditingNameIndex(null);
                                  setEditingNameValue("");
                                } else if (e.key === "Escape") {
                                  setEditingNameIndex(null);
                                  setEditingNameValue("");
                                }
                              }}
                              autoFocus
                              style={{
                                background: "rgba(255, 255, 255, 0.1)",
                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                color: "var(--text-primary)",
                                fontSize: "12px",
                                fontFamily: "var(--font-family-sans)",
                                width: "100%",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div
                              style={{
                                fontWeight: isSelected ? 600 : 400,
                                fontSize: "12px",
                                cursor: "pointer",
                                flex: 1,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingNameIndex(accountIndex);
                                setEditingNameValue(accountNames[accountIndex] || "");
                              }}
                              title="Click to edit name"
                            >
                              {getAccountLabel(accountIndex, accountNames[accountIndex])}
                            </div>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-family-mono)",
                        }}
                      >
                        {isLoadingAddresses ? "Loading..." : address ? formatAddress(address) : "..."}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <button
                        data-color-picker
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingColorIndex(editingColorIndex === accountIndex ? null : accountIndex);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all var(--transition-fast)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = accountColors[accountIndex] || colorOptions[0];
                          e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-muted)";
                          e.currentTarget.style.background = "transparent";
                        }}
                        title="Change color"
                      >
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
                          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                        </svg>
                      </button>
                      {accountIndices.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteAccount(accountIndex, e)}
                          disabled={deletingIndex === accountIndex}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: deletingIndex === accountIndex ? "not-allowed" : "pointer",
                            color: "var(--text-muted)",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: deletingIndex === accountIndex ? 0.5 : 1,
                            transition: "all var(--transition-fast)",
                          }}
                          onMouseEnter={(e) => {
                            if (deletingIndex !== accountIndex) {
                              e.currentTarget.style.color = "#ff4444";
                              e.currentTarget.style.background = "rgba(255, 68, 68, 0.1)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (deletingIndex !== accountIndex) {
                              e.currentTarget.style.color = "var(--text-muted)";
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                          title="Delete account"
                        >
                          {deletingIndex === accountIndex ? (
                            <svg
                              width="12"
                              height="12"
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
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                          ) : (
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
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                    {editingColorIndex === accountIndex && (
                      <div
                        data-color-picker
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          background: "var(--bg-primary)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: "var(--border-radius)",
                          padding: "var(--spacing-sm)",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                          zIndex: 1002,
                          marginTop: "4px",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {colorOptions.map((color) => (
                          <button
                            key={color}
                            onClick={() => handleColorChange(accountIndex, color)}
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background: color,
                              border: accountColors[accountIndex] === color
                                ? "2px solid var(--text-primary)"
                                : "2px solid transparent",
                              cursor: "pointer",
                              transition: "all var(--transition-fast)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "scale(1.1)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "scale(1)";
                            }}
                            title={color}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            
            <button
              onClick={handleAddAccount}
              disabled={isAdding}
              style={{
                width: "100%",
                padding: "var(--spacing-sm) var(--spacing-md)",
                background: "transparent",
                border: "none",
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                textAlign: "center",
                cursor: isAdding ? "not-allowed" : "pointer",
                color: "var(--text-primary)",
                fontSize: "11px",
                fontFamily: "var(--font-family-sans)",
                opacity: isAdding ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--spacing-xs)",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                if (!isAdding) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isAdding) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {isAdding ? (
                <>
                  <svg
                    width="12"
                    height="12"
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
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  Adding...
                </>
              ) : (
                <>
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
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  Add Account
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
