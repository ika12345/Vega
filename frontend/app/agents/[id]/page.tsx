"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { SolanaPayment } from "@/components/SolanaPayment";
import { useAgent } from "@/hooks/useAgents";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import TetrisLoading from "@/components/ui/tetris-loader";
import ReactMarkdown from "react-markdown";
import { ChatBubble, ChatBubbleMessage } from "@/components/ui/chat-bubble";
import { Bot, ExternalLink, Loader2 } from "lucide-react";
import { AIInput } from "@/components/ui/ai-input";
import { useFundingStatus } from "@/hooks/useFundingStatus";

interface Agent {
  id: number;
  name: string;
  description: string;
  price: number;
  reputation: number;
  developer: string;
  totalExecutions: number;
  successfulExecutions: number;
}

export default function AgentDetail() {
  const params = useParams();
  const agentId = params.id as string;
  const agentIdNum = parseInt(agentId);
  const { agent: contractAgent, loading: contractLoading, refetch: refetchContractAgent } = useAgent(agentIdNum);
  const queryClient = useQueryClient();
  const [apiAgent, setApiAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { isReady: isFunded, loading: fundingLoading } = useFundingStatus();

  useEffect(() => {
    fetchAgent();
  }, [agentId]);

  const fetchAgent = async () => {
    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const response = await fetch(`${apiUrl}/api/agents/${agentId}`);
      const data = await response.json();
      setApiAgent(data.agent);
    } catch (error) {
      console.error("Error fetching agent:", error);
    } finally {
      setLoading(false);
    }
  };

  // For Solana demo, we prioritize the API agent since we don't have the contract data yet
  const agent = apiAgent || (contractAgent ? {
    id: contractAgent.id,
    name: contractAgent.name,
    description: contractAgent.description,
    price: Number(contractAgent.pricePerExecution) / 1_000_000,
    reputation: Number(contractAgent.reputation),
    developer: contractAgent.developer,
    totalExecutions: Number(contractAgent.totalExecutions),
    successfulExecutions: Number(contractAgent.successfulExecutions),
  } : null);

  const handlePaymentComplete = (signature: string) => {
    setPaymentHash(signature);
    setShowPayment(false);
    setPaymentError(null);
    executeAgent(signature);
  };

  const handlePaymentError = (error: string) => {
    setPaymentError(error);
    setShowPayment(false);
  };

  const executeAgent = async (signature: string) => {
    if (!input.trim()) {
      alert("Please provide input");
      return;
    }

    setExecuting(true);
    setResult(null);

    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      
      const response = await fetch(`${apiUrl}/api/agents/${agentId}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SOLANA-SIGNATURE": signature,
        },
        body: JSON.stringify({
          input,
          paymentHash: signature,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setResult(`Error: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
      } else {
        setResult(data.output);
        setPaymentError(null);
        
        setTimeout(async () => {
          await fetchAgent();
          if (refetchContractAgent) await refetchContractAgent();
          queryClient.invalidateQueries({ queryKey: ["agents"] });
        }, 5000);
      }
    } catch (error) {
      console.error("Error executing agent:", error);
      setResult("Failed to execute agent");
      setPaymentError("Execution failed. Please try again.");
    } finally {
      setExecuting(false);
    }
  };

  const handleExecute = () => {
    if (!isFunded) {
      setPaymentError("Insufficient funds for execution. Please check the Funding Assistant.");
      return;
    }

    if (!paymentHash) {
      setPaymentError(null);
      setShowPayment(true);
      return;
    }
    
    executeAgent(paymentHash);
  };

  if (loading || contractLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <TetrisLoading size="md" speed="normal" loadingText="Loading agent..." />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-xl text-neutral-400">Agent not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-neutral-50">
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-sm border-b border-neutral-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <a 
                href="/" 
                className="inline-flex items-center text-neutral-400 hover:text-neutral-300 font-medium transition-colors"
              >
                ← Back
              </a>
              <div className="h-6 w-px bg-neutral-700"></div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                  Vega
                </h1>
              </div>
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 shadow-lg p-6 md:p-8 mb-6">
          <h1 className="text-3xl md:text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
            {agent.name}
          </h1>
          <p className="text-base md:text-lg text-neutral-400 mb-6">
            {agent.description}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
              <div className="text-xs text-neutral-400 font-medium mb-1">Price</div>
              <div className="text-xl md:text-2xl font-bold text-neutral-50">
                0.01
              </div>
              <div className="text-xs text-neutral-500 mt-1">SOL / execution</div>
            </div>
            <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
              <div className="text-xs text-neutral-400 font-medium mb-1">Reputation</div>
              <div className="text-xl md:text-2xl font-bold text-neutral-50">
                {agent.reputation}
              </div>
              <div className="text-xs text-neutral-500 mt-1">/1000</div>
            </div>
            <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
              <div className="text-xs text-neutral-400 font-medium mb-1">Executions</div>
              <div className="text-xl md:text-2xl font-bold text-neutral-50">
                {agent.totalExecutions}
              </div>
              <div className="text-xs text-neutral-500 mt-1">Total</div>
            </div>
            <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
              <div className="text-xs text-neutral-400 font-medium mb-1">Success Rate</div>
              <div className="text-xl md:text-2xl font-bold text-neutral-50">
                {agent.totalExecutions > 0
                  ? Math.round(
                      (agent.successfulExecutions / agent.totalExecutions) * 100
                    )
                  : 0}%
              </div>
              <div className="text-xs text-neutral-500 mt-1">Reliability</div>
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 rounded-lg border border-neutral-800 shadow-lg overflow-hidden">
          <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 border-b border-neutral-800">
            <h2 className="text-2xl font-bold text-neutral-50">Execute Agent</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Provide input and execute this agent for 0.01 SOL per execution
            </p>
          </div>

          <div className="px-6 md:px-8 py-6 border-b border-neutral-800">
            <label className="block text-sm font-medium mb-3 text-neutral-300">
              Input
            </label>
            <div className="bg-neutral-800/30 rounded-xl p-2 border border-neutral-800/50 focus-within:border-neutral-700 transition-colors">
              <AIInput
                placeholder="Enter your input here..."
                onVoiceInput={(text) => setInput(text)}
                value={input}
                onChange={(value) => setInput(value)}
                disabled={executing}
                minHeight={120}
                maxHeight={200}
                className="py-2"
              />
            </div>
          </div>

          <div className="px-6 md:px-8 py-6">
            {showPayment ? (
              <SolanaPayment
                priceUsd={agent.price}
                agentId={agentIdNum}
                onPaymentComplete={handlePaymentComplete}
                onError={handlePaymentError}
              />
            ) : (
              <button
                onClick={handleExecute}
                disabled={executing || !input.trim()}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white py-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
              >
                {executing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Executing Agent...</span>
                  </>
                ) : (
                  `Pay & Execute (0.01 SOL)`
                )}
              </button>
            )}

            {!isFunded && !fundingLoading && (
              <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-800/50 text-yellow-300 rounded-lg text-sm">
                <strong className="text-yellow-400">Action Required:</strong> 
                <p className="opacity-80">
                  Your wallet does not have sufficient Devnet SOL. Please use the Funding Assistant.
                </p>
              </div>
            )}

            {paymentError && (
              <div className="mt-4 p-4 bg-red-900/20 border border-red-800/50 text-red-300 rounded-lg text-sm">
                <strong className="text-red-400">Error:</strong> <span>{paymentError}</span>
              </div>
            )}
          </div>

          {result && (
            <div className="px-6 md:px-8 py-6 border-t border-neutral-800 bg-neutral-900/50">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-neutral-300 mb-1">Execution Result</h3>
              </div>
              <ChatBubble variant="received">
                <div className="h-8 w-8 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-blue-400" />
                </div>
                <ChatBubbleMessage variant="received">
                  <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{result}</ReactMarkdown>
                  </div>
                </ChatBubbleMessage>
              </ChatBubble>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
