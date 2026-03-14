'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';

export function WalletConnect() {
  const { publicKey, connected, disconnect } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (connected && publicKey) {
    const address = publicKey.toBase58();
    return (
      <div className="flex items-center gap-3">
        <div className="px-4 py-1.5 rounded-lg bg-neutral-800/50 backdrop-blur-sm border border-neutral-700">
          <span className="text-sm font-medium text-neutral-50 font-mono">
            {address.slice(0, 4)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700 hover:border-neutral-600 transition-colors flex items-center gap-2 text-sm text-neutral-300 hover:text-neutral-50"
          title="Disconnect wallet"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    );
  }

  return (
    <div className="solana-wallet-button-container">
      <WalletMultiButton className="!bg-neutral-800 !hover:bg-neutral-700 !rounded-lg !px-4 !py-2 !h-auto !text-sm !font-medium !text-neutral-50 !border !border-neutral-700 !transition-colors" />
    </div>
  );
}
