"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { 
  Transaction, 
  SystemProgram, 
  PublicKey, 
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { WalletConnect } from "@/components/WalletConnect";
import Link from "next/link";
import { ArrowLeft, Plus, Loader2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFundingStatus } from "@/hooks/useFundingStatus";

const REGISTRY_WALLET = new PublicKey(process.env.NEXT_PUBLIC_SOLANA_REGISTRY_WALLET || "4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9");

export default function NewAgentPage() {
  const { isReady: isFunded, isConnected, loading: fundingLoading } = useFundingStatus();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.description.trim()) newErrors.description = "Description is required";
    const price = parseFloat(formData.price);
    if (!formData.price || isNaN(price) || price <= 0) newErrors.price = "Price must be a positive number";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFunded) {
      alert("Insufficient funds for registration. Please check the Funding Assistant.");
      return;
    }
    
    if (!validateForm() || !publicKey) return;

    setIsPending(true);
    setError(null);

    try {
      // 1. Create Transaction for Registration (sending 0.01 SOL as registration fee)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: REGISTRY_WALLET,
          lamports: 0.01 * LAMPORTS_PER_SOL,
        })
      );

      const signature = await sendTransaction(transaction, connection);
      setHash(signature);
      setIsPending(false);
      setIsConfirming(true);

      // 2. Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash
      });

      // 3. Register on backend
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      await fetch(`${apiUrl}/api/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          price: formData.price,
          signature,
          owner: publicKey.toBase58(),
        }),
      });

      setIsConfirming(false);
      setIsSuccess(true);
      
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);

    } catch (err: any) {
      console.error("Error registering agent:", err);
      setError(err);
      setIsPending(false);
      setIsConfirming(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-sm border-b border-neutral-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                  Register New Agent
                </h1>
                <p className="text-sm text-neutral-400 mt-1">
                  Create and register your AI agent on Solana
                </p>
              </div>
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {!isConnected ? (
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-8 text-center">
            <p className="text-neutral-400 mb-4">Please connect your Solana wallet to register an agent</p>
            <WalletConnect />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2">
                Agent Name *
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:border-transparent text-neutral-50"
                placeholder="e.g., Smart Contract Analyzer"
                disabled={isPending || isConfirming}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            {/* Description Field */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-2">
                Description *
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:border-transparent text-neutral-50 resize-none"
                placeholder="Describe what your agent does and its capabilities..."
                disabled={isPending || isConfirming}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-500">{errors.description}</p>
              )}
            </div>

            {/* Price Field */}
            <div>
              <label htmlFor="price" className="block text-sm font-medium mb-2">
                Price per Execution (USDC) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">$</span>
                <input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1000"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full pl-8 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-600 focus:border-transparent text-neutral-50"
                  placeholder="0.10"
                  disabled={isPending || isConfirming}
                />
              </div>
              {errors.price && (
                <p className="mt-1 text-sm text-red-500">{errors.price}</p>
              )}
              <p className="mt-1 text-xs text-neutral-500">
                Users will pay this amount in SOL/USDC each time they execute your agent
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
                <p className="text-sm text-red-400">
                  Error: {error.message || "Failed to register agent"}
                </p>
              </div>
            )}

            {/* Success Message */}
            {isSuccess && (
              <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg">
                <p className="text-sm text-green-400">
                  ✅ Agent registered successfully! Redirecting to dashboard...
                </p>
              </div>
            )}

            {/* Submit Button */}
            {!isFunded && !fundingLoading && (
              <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-800/50 text-yellow-300 rounded-lg text-sm flex items-start gap-2">
                <div className="shrink-0 mt-0.5">⚠️</div>
                <div>
                  <strong className="text-yellow-400">Action Required:</strong> 
                  <p className="opacity-80">
                    Your wallet does not have sufficient SOL/USDC for registration. Please use the Funding Assistant in the bottom right corner.
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || isConfirming || isSuccess || !isFunded}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending || isConfirming ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {isPending ? "Confirm in wallet..." : "Confirming on-chain..."}
                </>
              ) : isSuccess ? (
                "Registered!"
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  Register Agent (0.01 SOL)
                </>
              )}
            </button>

            {/* Transaction Hash */}
            {hash && (
              <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-800">
                <p className="text-xs text-neutral-400 mb-1">Transaction Signature:</p>
                <a
                  href={`https://explorer.solana.com/tx/${hash}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 break-all flex items-center gap-1"
                >
                  {hash.slice(0, 20)}...{hash.slice(-20)} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </form>
        )}

        {/* Info Section */}
        <div className="mt-6 p-6 bg-neutral-900 rounded-lg border border-neutral-800">
          <h3 className="font-bold mb-3">Solana Agent Registration</h3>
          <ul className="space-y-2 text-sm text-neutral-400">
            <li>• Your agent will be registered via an on-chain SOL transfer</li>
            <li>• Registration fee is 0.01 SOL on Devnet</li>
            <li>• You'll receive native payments when users execute your agent</li>
            <li>• Performance metrics are tracked on the Solana ledger</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
