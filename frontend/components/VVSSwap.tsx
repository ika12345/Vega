"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, Address } from "viem";
import { X402Payment } from "@/components/X402Payment";
import { ArrowLeftRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface QuoteResponse {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  path: string[];
  hasLiquidity: boolean;
  source: string;
}

interface SwapTransaction {
  to: string;
  data: string;
  value?: string;
}

interface ExecuteResponse {
  success: boolean;
  transaction: SwapTransaction;
  quote: {
    amountIn: string;
    expectedAmountOut: string;
    minimumAmountOut: string;
  };
  message: string;
  source: string;
}

const TOKENS = [
  { symbol: "CRO", name: "Cronos", address: "0x0000000000000000000000000000000000000000" },
  { symbol: "USDC", name: "USDC", address: "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0" },
  { symbol: "VVS", name: "VVS", address: "0x2D03bECE6747ADC00E1A131bBA1469C15FD11E03" },
];

const SWAP_PRICE = 0.15; // $0.15 per swap execution

export function VVSSwap() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: txHash, isPending: isTxPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [tokenIn, setTokenIn] = useState("CRO");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [amountIn, setAmountIn] = useState("1.0");
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [swapTx, setSwapTx] = useState<SwapTransaction | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);

  let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
    apiUrl = apiUrl.replace("localhost", window.location.hostname);
  }

  const handleGetQuote = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setQuoteError("Please enter a valid amount");
      return;
    }

    setLoadingQuote(true);
    setQuoteError(null);
    setQuote(null);

    try {
      const response = await fetch(`${apiUrl}/api/vvs-swap/quote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenIn,
          tokenOut,
          amountIn,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get quote");
      }

      setQuote(data);
      setQuoteError(null);
    } catch (error) {
      console.error("Error getting quote:", error);
      setQuoteError(error instanceof Error ? error.message : "Failed to get quote");
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  };

  const handlePaymentComplete = async (hash: string) => {
    console.log("✅ Payment completed, hash:", hash);
    setPaymentHash(hash);
    setShowPayment(false);
    console.log("🔄 Starting swap execution...");
    await executeSwap();
  };

  const executeSwap = async () => {
    if (!address || !isConnected) {
      setSwapError("Please connect your wallet");
      return;
    }

    if (!quote) {
      setSwapError("Please get a quote first");
      return;
    }

    setSwapError(null);

    try {
      // Payment is optional - backend handles mock mode
      // If payment exists, send it; otherwise backend will skip in mock mode
      const paymentHeader = sessionStorage.getItem(`payment_999`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      // Only add payment header if we have one (not required in mock mode)
      if (paymentHeader) {
        headers["X-PAYMENT"] = paymentHeader;
      }
      
      const response = await fetch(`${apiUrl}/api/vvs-swap/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tokenIn,
          tokenOut,
          amountIn,
          amountOutMin: quote.amountOut, // Use quote amount as minimum (or calculate with slippage)
          recipient: address,
        }),
      });

      const data: ExecuteResponse = await response.json();

      if (!response.ok) {
        const errorData = data as any;
        throw new Error(errorData.error || "Failed to execute swap");
      }

      if (!data.success || !data.transaction) {
        throw new Error("Invalid swap response");
      }

      setSwapTx(data.transaction);
      setSwapError(null);

      // Execute the transaction
      await executeTransaction(data.transaction);
    } catch (error) {
      console.error("Error executing swap:", error);
      setSwapError(error instanceof Error ? error.message : "Failed to execute swap");
    }
  };

  const executeTransaction = async (tx: SwapTransaction) => {
    if (!address) return;

    try {
      const contractParams: any = {
        to: tx.to as Address,
        data: tx.data as `0x${string}`,
      };
      if (tx.value) {
        contractParams.value = BigInt(tx.value);
      }
      writeContract(contractParams);
    } catch (error) {
      console.error("Error sending transaction:", error);
      setSwapError("Failed to send transaction to wallet");
    }
  };

  const handleSwap = async () => {
    if (!quote) {
      handleGetQuote();
      return;
    }

    // For testnet/demo: Skip payment and execute swap directly
    // Payment is still required on mainnet (when VVS router is available)
    // This makes testing easier - payment can be added back if needed
    console.log("🔄 Executing swap (payment handled by backend in mock mode)");
    await executeSwap();
  };

  const handleReset = () => {
    setQuote(null);
    setQuoteError(null);
    setSwapTx(null);
    setSwapError(null);
    setPaymentHash(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(`payment_999`);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-6">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6" />
          VVS Finance Token Swap
        </h2>

        {/* Token Selection */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">From</label>
            <select
              value={tokenIn}
              onChange={(e) => {
                setTokenIn(e.target.value);
                setQuote(null);
              }}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TOKENS.filter((t) => t.symbol !== tokenOut).map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {token.symbol} - {token.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">To</label>
            <select
              value={tokenOut}
              onChange={(e) => {
                setTokenOut(e.target.value);
                setQuote(null);
              }}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TOKENS.filter((t) => t.symbol !== tokenIn).map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {token.symbol} - {token.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">Amount</label>
          <input
            type="number"
            value={amountIn}
            onChange={(e) => {
              setAmountIn(e.target.value);
              setQuote(null);
            }}
            placeholder="Enter amount"
            step="0.01"
            min="0"
            className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Get Quote Button */}
        <button
          onClick={handleGetQuote}
          disabled={loadingQuote || !amountIn || parseFloat(amountIn) <= 0}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loadingQuote ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Getting Quote...
            </>
          ) : (
            "Get Quote"
          )}
        </button>

        {/* Quote Display */}
        {quote && (
          <div className="mt-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">You pay:</span>
                <span className="text-white font-semibold">
                  {quote.amountIn} {quote.tokenIn}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">You receive:</span>
                <span className="text-white font-semibold">
                  {quote.amountOut} {quote.tokenOut}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Liquidity:</span>
                <span className={quote.hasLiquidity ? "text-green-400" : "text-red-400"}>
                  {quote.hasLiquidity ? "Available" : "Low"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Quote Error */}
        {quoteError && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{quoteError}</span>
          </div>
        )}

        {/* Swap Button */}
        {quote && !swapTx && (
          <button
            onClick={handleSwap}
            disabled={!isConnected || !address}
            className="w-full mt-4 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {!isConnected ? "Connect Wallet to Swap" : "Execute Swap ($0.15)"}
          </button>
        )}

        {/* Payment Modal */}
        {showPayment && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-white/20 rounded-lg p-6 max-w-md w-full">
              <X402Payment
                priceUsd={SWAP_PRICE}
                agentId={999} // Special ID for VVS Swap
                onPaymentComplete={handlePaymentComplete}
                onError={(error) => {
                  setSwapError(error);
                  setShowPayment(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Transaction Status */}
        {swapTx && (
          <div className="mt-6 space-y-4">
            {isTxPending && (
              <div className="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
                <span className="text-yellow-400">Transaction pending...</span>
              </div>
            )}

            {isConfirming && (
              <div className="p-4 bg-blue-500/20 border border-blue-500/50 rounded-lg flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span className="text-blue-400">Waiting for confirmation...</span>
              </div>
            )}

            {isConfirmed && (
              <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="text-green-400">Swap executed successfully!</span>
              </div>
            )}

            {swapError && (
              <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-red-400">{swapError}</span>
              </div>
            )}

            {txHash && (
              <div className="p-4 bg-white/10 border border-white/20 rounded-lg">
                <p className="text-sm text-gray-300 mb-2">Transaction Hash:</p>
                <a
                  href={`https://explorer.cronos.org/testnet/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline break-all"
                >
                  {txHash}
                </a>
              </div>
            )}

            <button
              onClick={handleReset}
              className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Start New Swap
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
