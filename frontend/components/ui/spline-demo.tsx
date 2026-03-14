'use client'

import { Card } from "@/components/ui/card"
import { Spotlight } from "@/components/ui/spotlight"
 
export function SplineSceneBasic() {
  return (
    <Card className="w-full bg-black/[0.96] relative overflow-hidden">
      {/* Interactive Spotlight that follows mouse */}
      <Spotlight
        className="z-[1]"
        size={400}
        springOptions={{ stiffness: 150, damping: 15, mass: 0.1 }}
      />
      
      <div className="relative z-10 py-16 md:py-24 px-8">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
            ElectroVault
          </h1>
          <p className="mt-3 text-base md:text-lg text-neutral-400 font-medium">
            First Web3-native AI agent marketplace on Solana
          </p>
          <p className="mt-5 text-neutral-300 max-w-lg leading-relaxed">
            Unified chat interface and individual AI agents marketplace. Every query is a real Solana transaction. 
            Pay-per-use with SOL micropayments. Powered by Gemini AI.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-neutral-400 justify-center">
            <span className="px-3 py-1.5 bg-neutral-800/50 rounded-full border border-neutral-700/50">Solana Devnet</span>
            <span className="px-3 py-1.5 bg-neutral-800/50 rounded-full border border-neutral-700/50">SOL Micropayments</span>
            <span className="px-3 py-1.5 bg-neutral-800/50 rounded-full border border-neutral-700/50">Phantom Wallet</span>
            <span className="px-3 py-1.5 bg-neutral-800/50 rounded-full border border-neutral-700/50">Web3-Native</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
