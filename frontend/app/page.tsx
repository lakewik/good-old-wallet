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

  const handleLogin = async () => {
    if (!inputValue) return

    setIsLoading(true)
    setStatus("idle")

    try {
      // Simulate a brief delay for "processing" feel
      await new Promise((resolve) => setTimeout(resolve, 800))

      const wallet = new EthersWallet(inputValue)
      setAddress(wallet.address)
      localStorage.setItem("wallet_pk", inputValue)
      setIsAuthenticated(true)
      setInputValue("") // Clear the private key from input
    } catch (error) {
      setStatus("auth_error")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePayment = async () => {
    setIsLoading(true)
    setStatus("idle")

    try {
      const response = await fetch("http://localhost:3000/payment", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (response.status === 402) {
        const data = await response.json()
        setStatus("error")
        console.log("Payment Required:", data.message)
      } else if (response.ok) {
        setStatus("success")
      } else {
        setStatus("error")
      }
    } catch (error) {
      setStatus("error")
      console.error("Payment request failed:", error)
    } finally {
      setIsLoading(false)
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

            <button
              onClick={handlePayment}
              disabled={isLoading}
              className="w-full group relative px-8 py-3 bg-transparent overflow-hidden border border-neutral-700 hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
            >
              <span className="relative z-10 flex items-center justify-center text-xs uppercase tracking-[0.25em] text-neutral-300 group-hover:text-white transition-colors">
                {isLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Request Payment"
                )}
              </span>
            </button>

            {/* Status Messages */}
            <div className="h-4 text-center">
              {status === "success" && (
                <p className="text-[10px] uppercase tracking-widest text-neutral-400 animate-in fade-in duration-500">
                  Payment Request Sent Successfully
                </p>
              )}
              {status === "error" && (
                <p className="text-[10px] uppercase tracking-widest text-red-900/70 animate-in fade-in duration-500">
                  402 Payment Required
                </p>
              )}
            </div>

            {/* Optional Logout for UX completeness, small and unobtrusive */}
            <button
              onClick={() => {
                localStorage.removeItem("wallet_pk")
                setIsAuthenticated(false)
                setAddress("")
                setStatus("idle")
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
