/**
 * Background script for Good Old Wallet extension
 * Handles messages from web pages
 */

// Listen for messages from web pages
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log("Received message from webpage:", message, "Sender:", sender);

  if (message.type === "CREATE_PAYMENT") {
    const { to, token, amount, chainId } = message.payload;

    console.log("Payment request received:", { to, token, amount, chainId });

    // Store the payment request in chrome.storage for the popup to access
    chrome.storage.local.set(
      {
        pendingPayment: {
          to,
          token,
          amount,
          chainId,
          timestamp: Date.now(),
        },
      },
      () => {
        console.log("Payment request stored in storage");

        // Open or focus the extension popup
        chrome.action.openPopup();

        // Note: We can't immediately send a response because the user needs to confirm
        // The popup will handle creating and signing the transaction
        // and will send the response back through storage or another mechanism
      }
    );

    // Keep the message channel open for async response
    return true;
  }

  // Unknown message type
  sendResponse({ success: false, error: "Unknown message type" });
  return false;
});

console.log("Good Old Wallet background script loaded");

