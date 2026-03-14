"use client";

import { useState, useEffect } from "react";
import { useFundingStatus } from "@/hooks/useFundingStatus";
import { 
  ShieldAlert, 
  ShieldCheck, 
  Droplets, 
  Coins, 
  ExternalLink, 
  PlusCircle, 
  ChevronRight,
  Bot,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";



export function FundingAssistant() {
  const { 
    isReady, 
    isConnected, 
    address,
    hasGas, 
    hasUsdc, 
    balances, 
    loading,
    requirements 
  } = useFundingStatus();
  
  const [isOpen, setIsOpen] = useState(false);
  const [showAgentBubble, setShowAgentBubble] = useState(false);
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [isSending, setIsSending] = useState(false);

  // Show the agent bubble automatically if not ready after a short delay
  useEffect(() => {
    if (isConnected && !isReady && !loading) {
      const timer = setTimeout(() => setShowAgentBubble(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isReady, loading]);



  const handleSendMessage = async () => {
    if (!chatInput.trim() || isSending) return;

    const userMessage = chatInput.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput("");
    setIsSending(true);

    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const response = await fetch(`${apiUrl}/api/funding/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: userMessage, address, network: 'solana-devnet' }),
      });
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.output }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting to the Nullshot network." }]);
    } finally {
      setIsSending(false);
    }
  };

  if (!isConnected) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3 font-sans">
      {/* Nullshot Agent Bubble */}
      <AnimatePresence>
        {showAgentBubble && !isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-none shadow-2xl relative max-w-[240px] border border-blue-400/50 backdrop-blur-md"
          >
            <button 
              onClick={() => setShowAgentBubble(false)}
              className="absolute -top-2 -right-2 bg-neutral-900 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] border border-neutral-700 hover:bg-neutral-800"
            >
              ✕
            </button>
            <div className="flex items-start gap-3">
              <Bot className="h-5 w-5 mt-1 shrink-0" />
              <div>
                <p className="text-xs font-semibold mb-1">Nullshot Funding Assistant</p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {!hasGas 
                    ? "You need SOL for gas and payments on Devnet. Use the faucet to get some!" 
                    : "Your wallet is fully funded for the demo!"}
                </p>
                <button 
                  onClick={() => { setIsOpen(true); setShowAgentBubble(false); }}
                  className="mt-2 text-[10px] font-bold underline flex items-center gap-1"
                >
                  Help me fix this <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl border transition-all ${
          isReady 
            ? "bg-green-600/20 border-green-500/50 text-green-400" 
            : "bg-blue-600 border-blue-400 text-white"
        } backdrop-blur-xl`}
      >
        {isReady ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        <span className="text-sm font-semibold">
          {loading ? "Checking Status..." : isReady ? "Wallet Healthy" : "Funding Required"}
        </span>
      </motion.button>

      {/* Expandable Assistant Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[360px] max-h-[600px] bg-neutral-900/90 backdrop-blur-2xl border border-neutral-800 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div className="flex items-center gap-2 text-neutral-50">
                <div className="p-2 bg-blue-600/20 rounded-lg text-blue-400 border border-blue-500/30">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="font-bold">Nullshot Assistant</h3>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                ✕
              </button>
            </div>

            {!isChatOpen ? (
              <div className="space-y-4 overflow-y-auto pr-1">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 transition-colors hover:border-neutral-600">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/20 text-green-500">
                      <ExternalLink className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] text-neutral-400">Network</p>
                      <p className="text-xs font-semibold text-neutral-200">
                        Solana Devnet
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 transition-colors hover:border-neutral-600">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${!hasGas ? "bg-yellow-500/20 text-yellow-500" : "bg-green-500/20 text-green-500"}`}>
                      <Droplets className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] text-neutral-400">Gas (SOL)</p>
                      <p className="text-xs font-semibold text-neutral-200">
                        {balances.sol.toFixed(4)} SOL
                      </p>
                    </div>
                  </div>
                  {!hasGas && (
                    <a 
                      href="https://faucet.solana.com" 
                      target="_blank"
                      className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-md font-bold flex items-center gap-1"
                    >
                      Faucet <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>



                <div className="mt-8 pt-4 border-t border-neutral-800 text-center shrink-0">
                  <p className="text-[10px] text-neutral-500 mb-2">Powered by Nullshot AI & MCP</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsChatOpen(true)}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="h-3 w-3" /> Talk to Agent
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
                  {messages.length === 0 && (
                    <div className="text-center py-4">
                      <p className="text-xs text-neutral-500">How can the Nullshot Assistant help you today?</p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs ${
                        m.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-br-none' 
                          : 'bg-neutral-800 text-neutral-200 rounded-bl-none border border-neutral-700'
                      }`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {isSending && (
                    <div className="flex justify-start">
                      <div className="bg-neutral-800 text-neutral-200 px-3 py-2 rounded-2xl rounded-bl-none border border-neutral-700 animate-pulse">
                        <div className="flex gap-1">
                          <span className="w-1 h-1 bg-neutral-500 rounded-full animate-bounce"></span>
                          <span className="w-1 h-1 bg-neutral-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                          <span className="w-1 h-1 bg-neutral-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-2 border-t border-neutral-800">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask about funding..."
                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={isSending}
                      className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <button 
                    onClick={() => setIsChatOpen(false)}
                    className="w-full mt-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-400 font-bold"
                  >
                    Back to Status
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
