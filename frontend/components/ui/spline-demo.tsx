'use client'

import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card"
import { Spotlight } from "@/components/ui/spotlight"
 
export function SplineSceneBasic() {
  return (
    <Card className="w-full h-[500px] bg-black/[0.96] relative overflow-hidden">
      {/* Interactive Spotlight that follows mouse */}
      <Spotlight
        className="z-[1]"
        size={400}
        springOptions={{ stiffness: 150, damping: 15, mass: 0.1 }}
      />
      
      <div className="flex h-full relative z-10">
        {/* Left content */}
        <div className="flex-1 p-8 flex flex-col justify-center items-center text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
            ElectroVault
          </h1>
          <p className="mt-2 text-sm text-neutral-400 font-medium">
            First Web3-native AI agent marketplace on Solana
          </p>
          <p className="mt-4 text-neutral-300 max-w-lg">
            Unified chat interface and individual AI agents marketplace. Every query is a real Solana transaction. 
            Pay-per-use with SOL micropayments. Powered by Gemini AI.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-400 justify-center">
            <span className="px-2 py-1 bg-neutral-800/50 rounded">Solana Devnet</span>
            <span className="px-2 py-1 bg-neutral-800/50 rounded">SOL Micropayments</span>
            <span className="px-2 py-1 bg-neutral-800/50 rounded">Phantom Wallet</span>
            <span className="px-2 py-1 bg-neutral-800/50 rounded">Web3-Native</span>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 relative z-10">
          {/* Temporarily removed robot component as requested */}
          {/* <SplineScene 
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="w-full h-full"
          /> */}
        </div>
      </div>
    </Card>
  )
}
