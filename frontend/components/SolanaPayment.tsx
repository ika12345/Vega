'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';

interface SolanaPaymentProps {
  priceUsd: number;
  agentId: number;
  onPaymentComplete: (signature: string) => void;
  onError: (error: string) => void;
}

const REGISTRY_WALLET = new PublicKey(process.env.NEXT_PUBLIC_SOLANA_REGISTRY_WALLET || "4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9");

export function SolanaPayment({ priceUsd, agentId, onPaymentComplete, onError }: SolanaPaymentProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    if (!publicKey) {
      onError("Please connect your wallet");
      return;
    }

    setLoading(true);
    try {
      // For the demo, we'll use a fixed 0.01 SOL amount to match the backend
      const lamports = 10000000; // 0.01 SOL
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: REGISTRY_WALLET,
          lamports: lamports,
        })
      );

      const signature = await sendTransaction(transaction, connection);
      
      // Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash
      });

      onPaymentComplete(signature);
    } catch (err: any) {
      console.error("Solana payment error:", err);
      onError(err.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 shadow-inner">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-neutral-50">Secure Payment</h3>
          <p className="text-xs text-neutral-400">Solana Devnet Transaction</p>
        </div>
        <div className="p-2 bg-blue-600/20 rounded-lg text-blue-400 border border-blue-500/30">
          <ShieldCheck className="h-5 w-5" />
        </div>
      </div>

      <div className="bg-black/40 rounded-lg p-3 mb-4 border border-neutral-700/50">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-neutral-400">Price</span>
          <span className="text-neutral-50 font-medium">${priceUsd.toFixed(2)} USDC</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-neutral-500 text-[10px]">Total</span>
          <span className="text-neutral-400">0.01 SOL</span>
        </div>
      </div>

      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2 group"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Confirming...</span>
          </>
        ) : (
          <>
            <span>Pay & Execute</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>

      <div className="mt-3 flex items-center justify-center gap-1.5 opacity-60">
        <AlertCircle className="h-3 w-3 text-neutral-500" />
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Encrypted & Immutable</span>
      </div>
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
