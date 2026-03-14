"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useState, useEffect, useMemo, useCallback } from "react";

const MIN_SOL_FOR_GAS = 0.05; // Minimum SOL recommended for gas (Devnet)

export function useFundingStatus() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  
  const [solBalance, setSolBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!publicKey || !connected) {
      setSolBalance(0);
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch SOL Balance
      const balance = await connection.getBalance(publicKey);
      setSolBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error("Error fetching Solana balances:", error);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connected, connection]);

  useEffect(() => {
    fetchBalances();
    
    // Set up a refresh interval or subscription?
    // For now, simple interval
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  const status = useMemo(() => {
    const hasGas = solBalance >= MIN_SOL_FOR_GAS;
    // We only use SOL for payments now on Solana migration
    const hasUsdc = true; 
    const isReady = connected && hasGas && hasUsdc;

    return {
      isReady,
      isConnected: connected,
      address: publicKey?.toBase58() || null,
      isWrongNetwork: false, // Solana adapter handles network selection
      hasGas,
      hasUsdc,
      balances: {
        sol: solBalance,
        usdc: 10, // Mock USDC for any UI that still checks
      },
      loading,
      requirements: {
        minSol: MIN_SOL_FOR_GAS,
        minUsdc: 0,
      }
    };
  }, [connected, publicKey, solBalance, loading]);

  return {
    ...status,
    refetch: fetchBalances,
  };
}
