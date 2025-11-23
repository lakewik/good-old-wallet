"use client"

import { useState, useEffect } from "react"
import { Loader2, Key, Wallet } from "lucide-react"
import { Wallet as EthersWallet } from "ethers"
import Image from "next/image"

export default function VintageWalletCheckout() {
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [status, setStatus] = useState<"idle" | "success" | "error" | "auth_error">("idle")

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [address, setAddress] = useState("")

  // Counter state
  const [counter, setCounter] = useState(0)
  const [balance, setBalance] = useState("0")
  const [canAfford, setCanAfford] = useState(false)
  const [counterLoading, setCounterLoading] = useState(false)
  const [counterStatus, setCounterStatus] = useState<"idle" | "success" | "out_of_funds">("idle")

  // Payment flow state
  const [paymentStep, setPaymentStep] = useState<"idle" | "creating" | "ready" | "verifying" | "settling" | "complete">("idle")
  const [paymentPayload, setPaymentPayload] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState("0.01") // Default 0.01 xDAI

  useEffect(() => {
    const storedKey = localStorage.getItem("wallet_pk")
    if (storedKey) {
      try {
        const wallet = new EthersWallet(storedKey)
        setAddress(wallet.address)
        setIsAuthenticated(true)
      } catch (e) {
        localStorage.removeItem("wallet_pk")
      }
    }
  }, [])

  // Fetch counter status when authenticated
  useEffect(() => {
    if (isAuthenticated && address) {
      fetchCounterStatus()
    }
  }, [isAuthenticated, address])

  const fetchCounterStatus = async () => {
    if (!address) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/counter-status/${address}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setCounter(data.counter || 0)
        setBalance(data.balance || "0")
        setCanAfford(data.canAfford || false)
      }
    } catch (error) {
      console.error("Failed to fetch counter status:", error)
    }
  }

  const handleLogin = async () => {
    if (!inputValue) return

    setIsLoading(true)
    setStatus("idle")

    try {
      // Validate private key and get address
      const wallet = new EthersWallet(inputValue)
      const userAddress = wallet.address

      // Log environment variable and URL
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
      const requestUrl = `${backendUrl}/user`
      
      console.log("[handleLogin] Starting user initialization", {
        backendUrl,
        requestUrl,
        userAddress,
        hasBackendUrl: !!backendUrl,
      })

      // Initialize user in database (get or create)
      console.log("[handleLogin] Making fetch request", {
        url: requestUrl,
        method: "POST",
        body: { userAddress },
      })

      let initResponse: Response
      try {
        initResponse = await fetch(requestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({ userAddress }),
        })

        console.log("[handleLogin] Fetch response received", {
          status: initResponse.status,
          statusText: initResponse.statusText,
          ok: initResponse.ok,
          headers: Object.fromEntries(initResponse.headers.entries()),
        })
      } catch (fetchError) {
        console.error("[handleLogin] Fetch request failed", {
          error: fetchError,
          errorMessage: fetchError instanceof Error ? fetchError.message : String(fetchError),
          errorName: fetchError instanceof Error ? fetchError.name : "Unknown",
          requestUrl,
          backendUrl,
        })
        throw new Error(`Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`)
      }

      if (!initResponse.ok) {
        let errorBody = ""
        try {
          errorBody = await initResponse.text()
          console.error("[handleLogin] Response not OK", {
            status: initResponse.status,
            statusText: initResponse.statusText,
            errorBody,
          })
        } catch (e) {
          console.error("[handleLogin] Failed to read error response body", e)
        }
        throw new Error(`Failed to initialize user: ${initResponse.status} ${initResponse.statusText}${errorBody ? ` - ${errorBody}` : ""}`)
      }

      let initData: any
      try {
        initData = await initResponse.json()
        console.log("[handleLogin] Response parsed successfully", {
          exists: initData.exists,
          data: initData,
        })
      } catch (parseError) {
        console.error("[handleLogin] Failed to parse response JSON", {
          error: parseError,
          status: initResponse.status,
        })
        throw new Error("Failed to parse server response")
      }

      console.log(
        initData.exists ? "Existing user loaded" : "New user created",
        initData
      )

      // Set user as authenticated
      setAddress(userAddress)
      localStorage.setItem("wallet_pk", inputValue)
      setIsAuthenticated(true)
      setInputValue("") // Clear the private key from input
    } catch (error) {
      console.error("[handleLogin] Login error caught", {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "Unknown",
        errorStack: error instanceof Error ? error.stack : undefined,
        backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
      })
      setStatus("auth_error")
    } finally {
      setIsLoading(false)
    }
  }

  const createPaymentTransaction = async () => {
    setIsLoading(true)
    setPaymentStep("creating")

    try {
      const BACKEND_ADDRESS = process.env.NEXT_PUBLIC_BACKEND_WALLET_ADDRESS || "0x572E3a2d12163D8FACCF5385Ce363D152EA3A33E"
      const TOKEN_ADDRESS = "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d" // wxDAI on Gnosis
      
      // Create payment request for extension
      const paymentRequest = {
        to: BACKEND_ADDRESS,
        token: TOKEN_ADDRESS,
        amount: paymentAmount,
        chainId: 100, // Gnosis
      }

      console.log("Opening wallet extension with payment request:", paymentRequest)

      // Get extension ID from environment
      const EXTENSION_ID = process.env.NEXT_PUBLIC_WALLET_EXTENSION_ID

      if (!EXTENSION_ID) {
        throw new Error("Extension ID not configured. Please set NEXT_PUBLIC_WALLET_EXTENSION_ID in .env")
      }

      // Send message to extension to open popup with payment details
      const chromeExtension = (window as any).chrome
      if (typeof window !== "undefined" && chromeExtension?.runtime) {
        chromeExtension.runtime.sendMessage(
          EXTENSION_ID, // Extension ID is required when calling from webpage
          {
            type: "CREATE_PAYMENT",
            payload: paymentRequest,
          },
          (response: any) => {
            if (chromeExtension.runtime.lastError) {
              console.error("Extension error:", chromeExtension.runtime.lastError)
              throw new Error(`Extension not responding: ${chromeExtension.runtime.lastError.message}`)
            }
            
            if (response?.success && response?.paymentPayload) {
              console.log("Received payment payload from extension:", response.paymentPayload)
              setPaymentPayload(response.paymentPayload)
              setPaymentStep("ready")
            } else {
              throw new Error("Failed to create payment in extension")
            }
          }
        )
      } else {
        // Fallback: If extension not detected, show error
        throw new Error("Good Old Wallet extension not detected. Please install the extension.")
      }
    } catch (error) {
      console.error("Error creating payment transaction:", error)
      setStatus("error")
      setPaymentStep("idle")
    } finally {
      setIsLoading(false)
    }
  }

  const handleTopUp = async () => {
    if (!paymentPayload) {
      console.error("No payment payload")
      return
    }

    setIsLoading(true)
    setPaymentStep("verifying")

    try {
      // Step 1: Verify the payment
      console.log("Verifying payment...")
      const verifyResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(paymentPayload),
      })

      const verifyData = await verifyResponse.json()
      console.log("Verification response:", verifyData)

      if (!verifyResponse.ok || !verifyData.valid) {
        throw new Error(`Verification failed: ${verifyData.reason}`)
      }

      console.log("✅ Payment verified!")

      // Step 2: Automatically settle after verification
      setPaymentStep("settling")
      
      // Small delay for UX
      await new Promise((resolve) => setTimeout(resolve, 1000))

      console.log("Settling payment...")
      const settleResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(paymentPayload),
      })

      const settleData = await settleResponse.json()
      console.log("Settlement response:", settleData)

      if (!settleResponse.ok || !settleData.settled) {
        throw new Error(`Settlement failed: ${settleData.reason}`)
      }

      console.log("✅ Payment settled!")
      console.log("Transaction hash:", settleData.txHash)

      setPaymentStep("complete")
      setStatus("success")

      // Refresh balance after a moment
      setTimeout(() => {
        fetchCounterStatus()
      }, 2000)
    } catch (error) {
      console.error("Payment flow error:", error)
      setStatus("error")
      setPaymentStep("idle")
    } finally {
      setIsLoading(false)
    }
  }

  const resetPayment = () => {
    setPaymentStep("idle")
    setPaymentPayload(null)
    setStatus("idle")
  }

  const handleCounter = async () => {
    setCounterLoading(true)
    setCounterStatus("idle")

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/counter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ userAddress: address }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setCounter(data.counter)
        setBalance(data.balance)
        setCounterStatus("success")
        // Refresh counter status
        await fetchCounterStatus()
      } else if (response.status === 402 || data.error === "out_of_funds") {
        setCounterStatus("out_of_funds")
        setCanAfford(false)
      } else {
        setCounterStatus("out_of_funds")
      }
    } catch (error) {
      console.error("Counter request failed:", error)
      setCounterStatus("out_of_funds")
    } finally {
      setCounterLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center text-white p-4">
      <div className="w-full max-w-[400px] flex flex-col items-center space-y-12">
        {/* Logo Section */}
        <div className="flex flex-col items-center space-y-6">
          <div className="relative group">
            {/* Ethereum icon */}
            <div className="flex items-center justify-center">
              <Image 
                src="/eth.svg" 
                alt="Ethereum Logo" 
                width={130} 
                height={130}
                className="opacity-90"
              />
            </div>
            {/* Decorative pipe effect - stylized line */}
            <div className="absolute top-1/2 -left-8 w-8 h-[1px] bg-white/20" />
            <div className="absolute top-1/2 -right-8 w-8 h-[1px] bg-white/20" />
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1
              className="font-serif text-3xl tracking-[0.2em] text-white/90 font-light"
              style={{ fontFamily: "var(--font-castoro-titling)" }}
            >
              GOOD OLD WALLET
            </h1>
          </div>
        </div>

        {!isAuthenticated ? (
          /* Login Form */
          <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 ml-1">Private Key</label>
              <div className="relative">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Enter private key..."
                  className="w-full bg-transparent border border-neutral-800 rounded-sm px-4 py-3 pl-10 text-sm text-neutral-300 placeholder:text-neutral-800 focus:outline-none focus:border-neutral-500 transition-colors font-light tracking-wide font-mono"
                />
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-700" />
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoading || !inputValue}
              className="w-full group relative px-8 py-3 bg-transparent overflow-hidden border border-neutral-700 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
            >
              <span className="relative z-10 flex items-center justify-center text-xs uppercase tracking-[0.25em] text-neutral-300 group-hover:text-white transition-colors">
                {isLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Accessing...
                  </>
                ) : (
                  "Unlock Wallet"
                )}
              </span>
            </button>

            {status === "auth_error" && (
              <p className="text-[10px] text-center uppercase tracking-widest text-red-900/70 animate-in fade-in duration-500">
                Invalid Private Key
              </p>
            )}
          </div>
        ) : (
          /* Payment Form (Authenticated) */
          <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-2 text-center">
              <label className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">Connected Address</label>
              <div className="flex items-center justify-center space-x-2 px-4 py-3 border border-neutral-900 bg-neutral-900/20 rounded-sm">
                <Wallet className="w-3 h-3 text-neutral-600" />
                <p className="font-mono text-[10px] text-neutral-400 tracking-wider truncate max-w-[250px]">
                  {address}
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-neutral-900" />

            {/* Balance Display */}
            <div className="space-y-2 text-center">
              <label className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">Balance</label>
              <div className="px-4 py-3 border border-neutral-900 bg-neutral-900/20 rounded-sm">
                <p className="font-mono text-sm text-neutral-300">
                  {(Number(balance) / 1e18).toFixed(4)} xDAI
                </p>
              </div>
            </div>

            {/* Counter Display */}
            <div className="space-y-2 text-center">
              <label className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">Counter</label>
              <div className="px-4 py-3 border border-neutral-900 bg-neutral-900/20 rounded-sm">
                <p className="font-mono text-3xl text-neutral-300 font-light">{counter}</p>
              </div>
            </div>

            <div className="h-px w-full bg-neutral-900" />

            {canAfford ? (
              <button
                onClick={handleCounter}
                disabled={counterLoading}
                className="w-full group relative px-8 py-3 bg-transparent overflow-hidden border border-neutral-700 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
              >
                <span className="relative z-10 flex items-center justify-center text-xs uppercase tracking-[0.25em] text-neutral-300 group-hover:text-white transition-colors">
                  {counterLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Increment Counter"
                  )}
                </span>
              </button>
            ) : (
              <div className="space-y-2 text-center">
                <div className="px-4 py-3 border border-red-900/30 bg-red-900/10 rounded-sm">
                  <p className="text-[10px] uppercase tracking-widest text-red-900/70">
                    Out of Balance
                  </p>
                  <p className="text-[9px] tracking-wider text-neutral-600 mt-1">
                    Go to wallet to top up
                  </p>
                </div>
              </div>
            )}

            {/* Counter Status Messages */}
            <div className="h-4 text-center">
              {counterStatus === "success" && (
                <p className="text-[10px] uppercase tracking-widest text-neutral-400 animate-in fade-in duration-500">
                  Counter Incremented Successfully
                </p>
              )}
              {counterStatus === "out_of_funds" && (
                <p className="text-[10px] uppercase tracking-widest text-red-900/70 animate-in fade-in duration-500">
                  Insufficient Balance
                </p>
              )}
            </div>

            <div className="h-px w-full bg-neutral-900" />

            {/* Payment Amount Input */}
            <div className="space-y-2 w-full">
              <label className="text-[9px] uppercase tracking-[0.2em] text-neutral-500">Top Up Amount (xDAI)</label>
              <input
                type="number"
                step="0.01"
                min="0.001"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                disabled={paymentStep !== "idle"}
                className="w-full bg-transparent border border-neutral-800 rounded-sm px-4 py-3 text-sm text-neutral-300 placeholder:text-neutral-800 focus:outline-none focus:border-neutral-500 transition-colors font-mono"
              />
            </div>

            {/* Payment Flow Buttons */}
            {paymentStep === "idle" && (
              <button
                onClick={createPaymentTransaction}
                disabled={isLoading}
                className="w-full group relative px-8 py-3 bg-transparent overflow-hidden border border-neutral-700 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
              >
                <span className="relative z-10 flex items-center justify-center text-xs uppercase tracking-[0.25em] text-neutral-300 group-hover:text-white transition-colors">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Creating Transaction...
                    </>
                  ) : (
                    "Request Payment"
                  )}
                </span>
              </button>
            )}

            {paymentStep === "ready" && (
              <div className="space-y-4 w-full">
                <div className="px-4 py-3 border border-green-900/30 bg-green-900/10 rounded-sm">
                  <p className="text-[10px] uppercase tracking-widest text-green-400/70">
                    Transaction Ready
                  </p>
                </div>
                <button
                  onClick={handleTopUp}
                  disabled={isLoading}
                  className="w-full group relative px-8 py-3 bg-transparent overflow-hidden border border-green-700 hover:border-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
                >
                  <span className="relative z-10 flex items-center justify-center text-xs uppercase tracking-[0.25em] text-green-300 group-hover:text-green-200 transition-colors">
                    Top Up
                  </span>
                </button>
                <button
                  onClick={resetPayment}
                  className="w-full text-[9px] uppercase tracking-widest text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {paymentStep === "verifying" && (
              <div className="px-4 py-3 border border-blue-900/30 bg-blue-900/10 rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-blue-400/70 flex items-center justify-center">
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Verifying Payment...
                </p>
              </div>
            )}

            {paymentStep === "settling" && (
              <div className="px-4 py-3 border border-yellow-900/30 bg-yellow-900/10 rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-yellow-400/70 flex items-center justify-center">
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Settling Transaction...
                </p>
              </div>
            )}

            {paymentStep === "complete" && (
              <div className="space-y-4 w-full">
                <div className="px-4 py-3 border border-green-900/30 bg-green-900/10 rounded-sm">
                  <p className="text-[10px] uppercase tracking-widest text-green-400/70">
                    ✅ Payment Successful!
                  </p>
                  <p className="text-[9px] tracking-wider text-neutral-600 mt-1">
                    Balance will update shortly
                  </p>
                </div>
                <button
                  onClick={resetPayment}
                  className="w-full group relative px-8 py-3 bg-transparent overflow-hidden border border-neutral-700 hover:border-neutral-400 transition-colors duration-300"
                >
                  <span className="relative z-10 flex items-center justify-center text-xs uppercase tracking-[0.25em] text-neutral-300 group-hover:text-white transition-colors">
                    Make Another Payment
                  </span>
                </button>
              </div>
            )}

            {/* Error Message */}
            {status === "error" && paymentStep === "idle" && (
              <div className="px-4 py-3 border border-red-900/30 bg-red-900/10 rounded-sm">
                <p className="text-[10px] uppercase tracking-widest text-red-900/70">
                  Payment Failed - Try Again
                </p>
              </div>
            )}

            {/* Optional Logout for UX completeness, small and unobtrusive */}
            <button
              onClick={() => {
                localStorage.removeItem("wallet_pk")
                setIsAuthenticated(false)
                setAddress("")
                setStatus("idle")
                setCounter(0)
                setBalance("0")
                setCanAfford(false)
                setCounterStatus("idle")
                setPaymentStep("idle")
                setPaymentPayload(null)
              }}
              className="w-full text-[9px] uppercase tracking-widest text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center space-y-4">
          <div className="w-px h-12 bg-gradient-to-b from-neutral-800 to-transparent mx-auto" />
          <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-700 font-light">Encrypted Connection</p>
        </div>
      </div>
    </div>
  )
}
