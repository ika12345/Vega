"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { X402Payment } from "@/components/X402Payment";
import { useAgent } from "@/hooks/useAgents";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { AGENT_REGISTRY_ABI, getContractAddresses } from "@/lib/contracts";
import TetrisLoading from "@/components/ui/tetris-loader";
import ReactMarkdown from "react-markdown";
import { ChatBubble, ChatBubbleMessage, ChatBubbleAvatar } from "@/components/ui/chat-bubble";
import { Bot } from "lucide-react";
import { AIInput } from "@/components/ui/ai-input";

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

  useEffect(() => {
    fetchAgent();
    
    // CRITICAL: Clear any old payments from sessionStorage on page load/refresh
    // This prevents reusing payments that may have already been used
    // Each execution requires a fresh payment, so we clear old ones
    if (typeof window !== "undefined") {
      const oldPayment = sessionStorage.getItem(`payment_${agentIdNum}`);
      if (oldPayment) {
        console.log("Clearing old payment from sessionStorage (page refreshed)");
        sessionStorage.removeItem(`payment_${agentIdNum}`);
      }
    }
  }, [agentId]);

  const fetchAgent = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${apiUrl}/api/agents/${agentId}`);
      const data = await response.json();
      setApiAgent(data.agent);
    } catch (error) {
      console.error("Error fetching agent:", error);
    } finally {
      setLoading(false);
    }
  };

  // Use contract agent if available, otherwise fall back to API
  const agent = contractAgent
    ? {
        id: contractAgent.id,
        name: contractAgent.name,
        description: contractAgent.description,
        price: Number(contractAgent.pricePerExecution) / 1_000_000,
        reputation: Number(contractAgent.reputation),
        developer: contractAgent.developer,
        totalExecutions: Number(contractAgent.totalExecutions),
        successfulExecutions: Number(contractAgent.successfulExecutions),
      }
    : apiAgent;

  const handlePaymentComplete = (hash: string) => {
    // Set payment hash and immediately execute
    // Note: Payment will be cleared after execution (success or failure)
    setPaymentHash(hash);
    setShowPayment(false);
    setPaymentError(null);
    // Execute immediately with the new payment
    executeAgent(hash);
  };

  const handlePaymentError = (error: string) => {
    setPaymentError(error);
    setShowPayment(false);
  };

  const executeAgent = async (hash: string) => {
    if (!input.trim()) {
      alert("Please provide input");
      return;
    }

    // CRITICAL: Each payment can only be used ONCE
    // If hash is null or empty, user needs to create a new payment
    if (!hash || hash.trim() === "") {
      setPaymentError("No payment found. Please create a new payment.");
      setShowPayment(true);
      return;
    }

    setExecuting(true);
    setResult(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      
      // Get payment header from session storage
      // NOTE: This should only exist if we just created a payment in this session
      // If page was refreshed, sessionStorage should be empty (we clear it on mount)
      const paymentHeader = typeof window !== "undefined" 
        ? sessionStorage.getItem(`payment_${agentIdNum}`)
        : null;
      
      // If no payment header in storage, payment was already used, cleared, or page was refreshed
      if (!paymentHeader) {
        console.warn("No payment header in sessionStorage - payment may have been used or page was refreshed");
        setPaymentHash(null);
        setPaymentError("Payment not found. Please create a new payment.");
        setShowPayment(true);
        setExecuting(false);
        return;
      }
      
      // Note: We don't check paymentHash state here because:
      // 1. State updates are async, so paymentHash might not be set yet
      // 2. We're passing the hash directly as a parameter, so we trust it
      // 3. The payment header in sessionStorage is the source of truth
      // If there's a mismatch, it will fail on the backend anyway
      
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      // Cronos docs use X-PAYMENT, but we also send other headers for compatibility
      headers["X-PAYMENT"] = paymentHeader;
      headers["X-PAYMENT-SIGNATURE"] = paymentHeader;
      headers["PAYMENT-SIGNATURE"] = paymentHeader;

      // CRITICAL: Clear payment IMMEDIATELY after sending request (before waiting for response)
      // This prevents reuse if user tries to execute again quickly
      // Each payment can only be used ONCE, so we clear it right away
      const clearPayment = () => {
        setPaymentHash(null);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(`payment_${agentIdNum}`);
        }
      };

      const response = await fetch(`${apiUrl}/api/agents/${agentId}/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          input,
          paymentHash: hash,
        }),
      });

      // Parse response first to check for errors
      const data = await response.json();

      // Clear payment AFTER checking response (but before processing)
      // This prevents reuse while still allowing us to handle errors properly
      clearPayment();

      if (response.status === 402 || data.paymentRequired) {
        // Payment expired, invalid, or already used - clear and show payment UI
        console.warn("Payment error - requiring new payment:", data.error || data.details);
        setPaymentError(data.details || data.error || "Payment expired or invalid. Please create a new payment.");
        setShowPayment(true);
        setResult(null);
        return;
      }

      if (data.error) {
        // If error mentions "payment" or "already used", show payment UI
        const isPaymentError = data.error.toLowerCase().includes("payment") || 
                               data.error.toLowerCase().includes("already used") ||
                               data.details?.toLowerCase().includes("payment already used") ||
                               data.details?.toLowerCase().includes("payment");
        
        if (isPaymentError) {
          console.warn("Payment-related error - requiring new payment:", data.error, data.details);
          setPaymentError(data.details || data.error || "Payment was already used or invalid. Please create a new payment.");
          setShowPayment(true);
        } else {
          setPaymentError(null);
        }
        setResult(`Error: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
      } else {
        setResult(data.output);
        setPaymentError(null);
        
        // Refresh agent data to show updated metrics
        // Wait a bit for blockchain to confirm (3-5 seconds)
        setTimeout(async () => {
          console.log("[Agent Detail] Refreshing agent metrics after execution...");
          // Refetch API data
          await fetchAgent();
          // Refetch contract data directly
          if (refetchContractAgent) {
            await refetchContractAgent();
          }
          // Also invalidate wagmi queries to ensure fresh data
          const { agentRegistry } = getContractAddresses();
          await queryClient.invalidateQueries({
            queryKey: [
              "readContract",
              {
                address: agentRegistry,
                functionName: "getAgent",
                args: [BigInt(agentIdNum)],
              },
            ],
          });
          console.log("[Agent Detail] ✅ Agent metrics refreshed");
        }, 5000);
      }
    } catch (error) {
      console.error("Error executing agent:", error);
      setResult("Failed to execute agent");
      // Clear payment on any error - user will need to create a new one
      setPaymentHash(null);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`payment_${agentIdNum}`);
      }
      setPaymentError("Execution failed. Please create a new payment to try again.");
      setShowPayment(true);
    } finally {
      setExecuting(false);
    }
  };

  const handleExecute = () => {
    // CRITICAL: Each execution requires a NEW payment
    // If no payment hash in state, user must create a new payment
    if (!paymentHash) {
      setPaymentError(null);
      setShowPayment(true);
      return;
    }
    
    // Execute with the payment hash we have
    // Note: Payment will be cleared immediately after execution (success or failure)
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
      {/* Header at the top */}
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
                  ElectroVault
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
                ${agent.price}
              </div>
              <div className="text-xs text-neutral-500 mt-1">USDC</div>
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

        {/* Execute Agent Section */}
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 border-b border-neutral-800">
            <h2 className="text-2xl font-bold text-neutral-50">Execute Agent</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Provide input and execute this agent for ${agent.price} USDC per execution
            </p>
          </div>

          {/* Disclaimer removed */}

          {/* Input Section */}
          <div className="px-6 md:px-8 py-6 border-b border-neutral-800">
            <label className="block text-sm font-medium mb-3 text-neutral-300">
              Input
            </label>
            <div className="bg-neutral-800/30 rounded-xl p-2 border border-neutral-800/50 focus-within:border-neutral-700 transition-colors">
              <AIInput
                placeholder="Enter your input here... (e.g., 'Create a tweet about DeFi', 'Analyze this smart contract', etc.)"
                onVoiceInput={(text) => {
                  setInput(text);
                }}
                value={input}
                onChange={(value) => setInput(value)}
                disabled={executing}
                minHeight={120}
                maxHeight={200}
                className="py-2"
              />
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Use voice input or type your message. Press Enter to submit (Shift+Enter for new line).
            </p>
          </div>

          {/* Payment/Execute Section */}
          <div className="px-6 md:px-8 py-6">
            {showPayment ? (
              <div>
                <X402Payment
                  priceUsd={agent.price}
                  agentId={agentIdNum}
                  onPaymentComplete={handlePaymentComplete}
                  onError={handlePaymentError}
                />
              </div>
            ) : (
              <button
                onClick={handleExecute}
                disabled={executing || !input.trim()}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-neutral-800 disabled:to-neutral-800 disabled:opacity-50 text-white py-4 rounded-xl font-semibold transition-all duration-200 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {executing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Executing Agent...</span>
                  </>
                ) : paymentHash ? (
                  `Execute Agent ($${agent.price} USDC)`
                ) : (
                  `Pay & Execute ($${agent.price} USDC)`
                )}
              </button>
            )}

            {paymentError && (
              <div className="mt-4 p-4 bg-red-900/20 border border-red-800/50 text-red-300 rounded-lg text-sm">
                <strong className="text-red-400">Error:</strong> <span className="text-red-300/80">{paymentError}</span>
              </div>
            )}
          </div>

          {/* Result Section */}
          {result && (
            <div className="px-6 md:px-8 py-6 border-t border-neutral-800 bg-neutral-900/50">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-neutral-300 mb-1">Execution Result</h3>
                <p className="text-xs text-neutral-500">Generated by {agent.name}</p>
              </div>
              <ChatBubble variant="received">
                <div className="h-8 w-8 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-blue-400" />
                </div>
                <ChatBubbleMessage variant="received">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-xs text-neutral-400 font-semibold">Result</span>
                  </div>
                  <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0 text-neutral-200">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-neutral-100">{children}</strong>,
                        em: ({ children }) => <em className="italic text-neutral-300">{children}</em>,
                        code: ({ children, className }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="bg-neutral-800/70 px-1.5 py-0.5 rounded text-xs font-mono text-blue-300 border border-neutral-700">
                              {children}
                            </code>
                          ) : (
                            <code className="block bg-neutral-800/70 p-3 rounded-lg text-xs font-mono text-blue-300 overflow-x-auto border border-neutral-700">
                              {children}
                            </code>
                          );
                        },
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline"
                          >
                            {children}
                          </a>
                        ),
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 text-neutral-200">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 text-neutral-200">{children}</ol>,
                        li: ({ children }) => <li className="text-inherit">{children}</li>,
                        h1: ({ children }) => <h1 className="text-lg font-bold mb-2 text-neutral-100">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-bold mb-2 text-neutral-100">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-bold mb-2 text-neutral-200">{children}</h3>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-blue-500/50 pl-4 italic text-neutral-300 bg-neutral-800/30 py-2 rounded-r">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {result}
                    </ReactMarkdown>
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
