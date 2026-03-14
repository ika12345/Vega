"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useChainId, useSendTransaction, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { WalletConnect } from "@/components/WalletConnect";
import { X402Payment } from "@/components/X402Payment";
import { useQueryClient } from "@tanstack/react-query";
import TetrisLoading from "@/components/ui/tetris-loader";
import { Send, Bot, Loader2, ArrowRightLeft, ExternalLink, Wallet, History, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { keccak256, toBytes } from "viem";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatBubble, ChatBubbleMessage, ChatBubbleAvatar } from "@/components/ui/chat-bubble";
import { AIInput } from "@/components/ui/ai-input";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  swapTransaction?: {
    to: string;
    data: string;
    value?: string;
  };
  swapQuote?: {
    amountIn: string;
    tokenIn: string;
    tokenOut: string;
    expectedAmountOut: string;
    network: string;
  };
  transferMagicLink?: {
    url: string;
    amount: string;
    token: string;
    to: string;
    type: string;
  };
  portfolio?: {
    address: string;
    balances: Array<{ symbol: string; balance: string; contractAddress?: string }>;
  };
  transactionHistory?: {
    address: string;
    transactions: Array<{ hash: string; from: string; to: string; value: string; timestamp: number; blockNumber: number }>;
  };
}

export default function ChatPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { sendTransaction, data: swapTxHash, isPending: isSwapPending, error: swapError } = useSendTransaction();
  const { isLoading: isSwapConfirming, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapTxHash,
  });
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [conversationId] = useState<string>(() => `conv_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [magicLinkModal, setMagicLinkModal] = useState<{ url: string; type: 'wrap' | 'transfer' } | null>(null);
  
  // Fixed price for unified chat (can be made dynamic)
  const CHAT_PRICE = 0.10; // $0.10 per message

  useEffect(() => {
    // Clear old payments on load
    if (typeof window !== "undefined") {
      const oldPayment = sessionStorage.getItem(`payment_chat`);
      if (oldPayment) {
        sessionStorage.removeItem(`payment_chat`);
      }
    }
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Show swap errors
  useEffect(() => {
    if (swapError) {
      console.error("[Swap] Swap error from useSendTransaction:", swapError);
      // Wagmi/viem errors can have different structures
      const errorMessage = 
        (swapError as any)?.message || 
        (swapError as any)?.shortMessage || 
        (swapError as any)?.cause?.message ||
        (typeof swapError === 'string' ? swapError : String(swapError)) ||
        "Failed to execute swap";
      alert(`Swap Error: ${errorMessage}`);
    }
  }, [swapError]);

  const handlePaymentComplete = (hash: string) => {
    setPaymentHash(hash);
    setShowPayment(false);
    setPaymentError(null);
    // Get payment header from sessionStorage
    const paymentHeader = sessionStorage.getItem(`payment_1`);
    if (paymentHeader && typeof window !== "undefined") {
      // Store for chat endpoint
      sessionStorage.setItem(`payment_chat`, paymentHeader);
      // Also store the hash alongside the header for consistency
      sessionStorage.setItem(`payment_chat_hash`, hash);
    }
    
    // Auto-send pending message if exists
    if (pendingMessage) {
      const messageToSend = pendingMessage;
      setPendingMessage(null);
      // Add user message first
      const userMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: messageToSend,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      // Then send
      setTimeout(() => {
        sendMessageWithInput(messageToSend);
      }, 300);
    }
  };

  const sendMessageWithInput = async (messageInput: string) => {
    if (executing) return;
    setExecuting(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      
      // CRITICAL: Each message requires a NEW payment
      // Check if we have a valid payment, if not, require a new one
      const paymentHeader = sessionStorage.getItem(`payment_chat`) || sessionStorage.getItem(`payment_1`) || "";
      const storedHash = sessionStorage.getItem(`payment_chat_hash`) || sessionStorage.getItem(`payment_1_hash`);
      
      // If no payment found, require a new payment
      if (!paymentHeader && !paymentHash && !storedHash) {
        console.log("[Chat] No payment found - requiring new payment");
        setPendingMessage(messageInput);
        setShowPayment(true);
        setExecuting(false);
        return;
      }
      
      // Get payment hash - try state first, then sessionStorage, then compute from header
      let hashToSend: string | null = paymentHash;
      if (!hashToSend && typeof window !== "undefined") {
        // Try to get from sessionStorage (stored when payment completed)
        hashToSend = storedHash;
      }
      
      // If still null, compute from payment header (same method as backend)
      if (!hashToSend && paymentHeader) {
        try {
          hashToSend = keccak256(toBytes(paymentHeader));
          console.log("[Chat] ✅ Computed payment hash from header:", hashToSend);
        } catch (error) {
          console.warn("[Chat] ⚠️ Failed to compute payment hash from header:", error);
        }
      }
      
      console.log("[Chat] Payment details:", {
        hasHeader: !!paymentHeader,
        hasHash: !!hashToSend,
        hashSource: paymentHash ? "state" : (storedHash ? "sessionStorage" : "computed"),
      });
      
      // Use unified chat endpoint
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(paymentHeader && { "X-PAYMENT": paymentHeader }),
        },
        body: JSON.stringify({
          input: messageInput,
          paymentHash: hashToSend,
        }),
      });

      if (response.status === 402) {
        const errorData = await response.json();
        setPaymentError(errorData.error || "Payment required");
        setShowPayment(true);
        setPaymentHash(null);
        if (typeof window !== "undefined") {
          // Clear all payment data when payment is required (payment was used or invalid)
          sessionStorage.removeItem(`payment_chat`);
          sessionStorage.removeItem(`payment_chat_hash`);
          sessionStorage.removeItem(`payment_1`);
          sessionStorage.removeItem(`payment_1_hash`);
        }
        return;
      }

      if (!response.ok) {
        throw new Error(`Execution failed: ${response.status}`);
      }

      const data = await response.json();

      // Add assistant response with swap transaction data if available
      const assistantMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: "assistant",
        content: data.output || "No response received",
        timestamp: Date.now(),
        swapTransaction: data.swapTransaction || undefined,
        swapQuote: data.swapQuote || undefined,
        transferMagicLink: data.transferMagicLink || undefined,
        portfolio: data.portfolio || undefined,
        transactionHistory: data.transactionHistory || undefined,
      };
      console.log("[Chat] Message created with:", { 
        hasPortfolio: !!data.portfolio, 
        hasHistory: !!data.transactionHistory 
      });
      setMessages((prev) => [...prev, assistantMessage]);

      // Clear payment after successful execution
      // CRITICAL: Each message requires a NEW payment, so clear all payment data
      setPaymentHash(null);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`payment_chat`);
        sessionStorage.removeItem(`payment_chat_hash`);
        sessionStorage.removeItem(`payment_1`); // Also clear the source payment
        sessionStorage.removeItem(`payment_1_hash`); // Clear hash too
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: `msg_${Date.now() + 1}`,
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to send message"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setPaymentHash(null);
      if (typeof window !== "undefined") {
        // Clear all payment data on error
        sessionStorage.removeItem(`payment_chat`);
        sessionStorage.removeItem(`payment_chat_hash`);
        sessionStorage.removeItem(`payment_1`);
        sessionStorage.removeItem(`payment_1_hash`);
      }
      setPaymentError("Execution failed. Please create a new payment to try again.");
      setShowPayment(true);
    } finally {
      setExecuting(false);
    }
  };

  const handlePaymentError = (error: string) => {
    setPaymentError(error);
    setShowPayment(true);
  };

  const sendMessage = async () => {
    if (!input.trim() || executing) return;

    if (!isConnected) {
      alert("Please connect your wallet first");
      return;
    }

    const currentInput = input;
    setInput("");

    // Check if we need a new payment
    if (!paymentHash) {
      setPendingMessage(currentInput);
      setShowPayment(true);
      return;
    }

    // Add user message to chat (only after payment confirmed)
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: currentInput,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Use the shared send function
    sendMessageWithInput(currentInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const executeSwap = async (swapTx: { to: string; data: string; value?: string }, swapQuote?: { network: string }) => {
    console.log("[Swap] executeSwap called", { swapTx, swapQuote, isConnected, address, chainId });
    
    if (!isConnected || !address) {
      alert("Please connect your wallet first");
      return;
    }

    // CRITICAL: Check if wallet is on the correct network for the swap
    // Block transaction if on wrong network to prevent executing on wrong chain
    if (swapQuote?.network === "Mainnet" && chainId !== 25) {
      const switchToMainnet = confirm(
        `⚠️ WRONG NETWORK ⚠️\n\n` +
        `This swap is for Cronos Mainnet (Chain ID: 25), but your wallet is on Chain ID ${chainId}.\n\n` +
        `If you proceed, the transaction will execute on the WRONG network and will FAIL.\n\n` +
        `Would you like to switch to Cronos Mainnet now?`
      );
      
      if (switchToMainnet) {
        try {
          await switchChain({ chainId: 25 });
          // Give user time to approve the network switch in their wallet
          alert("Please approve the network switch in your wallet, then click the swap button again.");
          return; // Exit - user needs to click button again after switching
        } catch (error) {
          console.error("[Swap] Failed to switch chain:", error);
          alert("Failed to switch network. Please manually switch to Cronos Mainnet (Chain ID: 25) in your wallet, then try again.");
          return;
        }
      } else {
        alert("❌ Swap blocked. You must be on Cronos Mainnet (Chain ID: 25) to execute this swap.\n\nPlease switch your wallet network and try again.");
        return;
      }
    } else if (swapQuote?.network === "Testnet" && chainId !== 338) {
      const switchToTestnet = confirm(
        `⚠️ WRONG NETWORK ⚠️\n\n` +
        `This swap is for Cronos Testnet (Chain ID: 338), but your wallet is on Chain ID ${chainId}.\n\n` +
        `Would you like to switch to Cronos Testnet now?`
      );
      
      if (switchToTestnet) {
        try {
          await switchChain({ chainId: 338 });
          alert("Please approve the network switch in your wallet, then click the swap button again.");
          return;
        } catch (error) {
          console.error("[Swap] Failed to switch chain:", error);
          alert("Failed to switch network. Please manually switch to Cronos Testnet (Chain ID: 338) in your wallet, then try again.");
          return;
        }
      } else {
        alert("❌ Swap blocked. You must be on Cronos Testnet (Chain ID: 338) to execute this swap.\n\nPlease switch your wallet network and try again.");
        return;
      }
    }

    // Validate swap transaction data
    if (!swapTx || !swapTx.to || !swapTx.data) {
      console.error("[Swap] Invalid swap transaction data:", swapTx);
      alert("Invalid swap transaction data. Please try requesting a new quote.");
      return;
    }

    // Validate addresses and data format
    if (!swapTx.to.startsWith('0x') || swapTx.to.length !== 42) {
      console.error("[Swap] Invalid 'to' address:", swapTx.to);
      alert("Invalid swap transaction address. Please try requesting a new quote.");
      return;
    }

    if (!swapTx.data.startsWith('0x')) {
      console.error("[Swap] Invalid transaction data:", swapTx.data);
      alert("Invalid swap transaction data format. Please try requesting a new quote.");
      return;
    }
    
    const contractParams: any = {
      to: swapTx.to as `0x${string}`,
      data: swapTx.data as `0x${string}`,
    };
    if (swapTx.value) {
      try {
        contractParams.value = BigInt(swapTx.value);
      } catch (error) {
        console.error("[Swap] Invalid value:", swapTx.value, error);
        alert("Invalid swap amount. Please try requesting a new quote.");
        return;
      }
    }
    
    console.log("[Swap] Calling sendTransaction with params:", contractParams);
    try {
      // sendTransaction is a mutation function from wagmi - it doesn't return a promise
      // Errors are handled via the error property from useSendTransaction hook
      sendTransaction(contractParams);
    } catch (error) {
      console.error("[Swap] Error calling sendTransaction:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to initiate swap: ${errorMessage}`);
    }
  };

  return (
    <div className="h-screen bg-black text-neutral-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="z-50 bg-black/80 backdrop-blur-sm border-b border-neutral-800 flex-none">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="inline-flex items-center text-neutral-400 hover:text-neutral-300 font-medium transition-colors"
              >
                ← Back
              </Link>
              <div className="h-6 w-px bg-neutral-700"></div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                  ElectroVault
                </h1>
                <p className="text-sm text-neutral-400 mt-1">
                  Ask anything - I'll use the right tools
                </p>
              </div>
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto container mx-auto px-4 py-6 max-w-4xl">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <Bot className="h-16 w-16 text-neutral-600 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Start a Conversation</h2>
            <p className="text-neutral-400 text-center max-w-md mb-6">
              I can help you with:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
              <button
                onClick={() => {
                  if (!isConnected) {
                    alert("Please connect your wallet first");
                    return;
                  }
                  sendMessageWithInput("show my portfolio");
                }}
                disabled={executing || !isConnected}
                className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                  <h3 className="font-bold text-green-400">Show Portfolio</h3>
                </div>
                <p className="text-sm text-neutral-400">"show my portfolio"</p>
              </button>
              <button
                onClick={() => {
                  if (!isConnected) {
                    alert("Please connect your wallet first");
                    return;
                  }
                  sendMessageWithInput("my transactions");
                }}
                disabled={executing || !isConnected}
                className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <History className="h-5 w-5 text-blue-400" />
                  <h3 className="font-bold text-blue-400">Transaction History</h3>
                </div>
                <p className="text-sm text-neutral-400">"my transactions"</p>
              </button>
              <button
                onClick={() => {
                  if (!isConnected) {
                    alert("Please connect your wallet first");
                    return;
                  }
                  sendMessageWithInput("swap 100 CRO for USDC");
                }}
                disabled={executing || !isConnected}
                className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRightLeft className="h-5 w-5 text-purple-400" />
                  <h3 className="font-bold text-purple-400">Swap Tokens</h3>
                </div>
                <p className="text-sm text-neutral-400">"swap 100 CRO for USDC"</p>
              </button>
              <button
                onClick={() => {
                  if (!isConnected) {
                    alert("Please connect your wallet first");
                    return;
                  }
                  sendMessageWithInput("transfer 10 USDC to");
                }}
                disabled={executing || !isConnected}
                className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Send className="h-5 w-5 text-orange-400" />
                  <h3 className="font-bold text-orange-400">Transfer Funds</h3>
                </div>
                <p className="text-sm text-neutral-400">"transfer 10 USDC to"</p>
              </button>
              <button
                onClick={() => {
                  if (!isConnected) {
                    alert("Please connect your wallet first");
                    return;
                  }
                  sendMessageWithInput("what's my balance");
                }}
                disabled={executing || !isConnected}
                className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-5 w-5 text-amber-400" />
                  <h3 className="font-bold text-amber-400">Check Balance</h3>
                </div>
                <p className="text-sm text-neutral-400">"what's my balance"</p>
              </button>
              <button
                onClick={() => {
                  if (!isConnected) {
                    alert("Please connect your wallet first");
                    return;
                  }
                  sendMessageWithInput("create a new wallet");
                }}
                disabled={executing || !isConnected}
                className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-5 w-5 text-cyan-400" />
                  <h3 className="font-bold text-cyan-400">Create Wallet</h3>
                </div>
                <p className="text-sm text-neutral-400">"create a new wallet"</p>
              </button>
            </div>
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg max-w-2xl">
              <p className="text-sm text-blue-300">
                💡 <strong>Note:</strong> I automatically use the right tools based on your question. 
                Market data, blockchain queries, contract analysis - all handled automatically!
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                variant={message.role === "user" ? "sent" : "received"}
              >
                {message.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-neutral-800 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-blue-400" />
                  </div>
                )}
                {message.role === "user" && (
                  <ChatBubbleAvatar fallback="U" />
                )}
                <ChatBubbleMessage variant={message.role === "user" ? "sent" : "received"}>
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-neutral-400">OneChat</span>
                    </div>
                  )}
                  <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none break-words">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-inherit">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ children, className }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="bg-neutral-800/50 px-1.5 py-0.5 rounded text-xs font-mono text-neutral-300 break-all">
                              {children}
                            </code>
                          ) : (
                            <code className="block bg-neutral-800/50 p-3 rounded text-xs font-mono text-neutral-300 overflow-x-auto break-all">
                              {children}
                            </code>
                          );
                        },
                        a: ({ href, children }) => {
                          if (!href) return <span>{children}</span>;
                          
                          // Check if it's a magic link (signer app URL)
                          const isMagicLink = href.includes('localhost:5173') || href.includes('/wrap-token/') || href.includes('/transfer-token/') || href.includes('/sign-transaction/');
                          const linkType = href.includes('wrap-token') ? 'wrap' : 'transfer';
                          
                          if (isMagicLink) {
                            return (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setMagicLinkModal({ url: href, type: linkType });
                                }}
                                className="text-blue-400 hover:text-blue-300 underline cursor-pointer inline-block"
                                style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                              >
                                {children || href}
                              </button>
                            );
                          }
                          
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline cursor-pointer inline-block"
                              style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              {children || href}
                            </a>
                          );
                        },
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-inherit">{children}</li>,
                        h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-bold mb-2">{children}</h3>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-neutral-700 pl-4 italic text-neutral-400">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {/* Swap Display */}
                  {message.swapTransaction && message.swapQuote && (
                    <div className="mt-4 p-5 bg-gradient-to-br from-green-950/40 via-green-900/20 to-green-950/40 border border-green-700/50 rounded-xl shadow-lg shadow-green-900/10 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-green-500/20 rounded-lg">
                            <ArrowRightLeft className="h-5 w-5 text-green-400" />
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-green-300">Swap Ready</span>
                            <p className="text-xs text-neutral-400 mt-0.5">VVS Finance DEX</p>
                          </div>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          message.swapQuote.network === "Mainnet" 
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" 
                            : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        }`}>
                          {message.swapQuote.network}
                        </div>
                      </div>
                      
                      <div className="bg-black/30 rounded-lg p-4 mb-4 space-y-3 border border-neutral-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-neutral-400 mb-1">You Pay</p>
                            <p className="text-lg font-bold text-white">
                              {message.swapQuote.amountIn} <span className="text-sm font-normal text-neutral-300">{message.swapQuote.tokenIn}</span>
                            </p>
                          </div>
                          <div className="px-3">
                            <ArrowRightLeft className="h-5 w-5 text-green-400" />
                          </div>
                          <div className="flex-1 text-right">
                            <p className="text-xs text-neutral-400 mb-1">You Receive</p>
                            <p className="text-lg font-bold text-white">
                              ~{message.swapQuote.expectedAmountOut} <span className="text-sm font-normal text-neutral-300">{message.swapQuote.tokenOut}</span>
                            </p>
                          </div>
                        </div>
                        
                        <div className="pt-3 border-t border-neutral-800/50">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-neutral-400">Network</span>
                            <span className="text-neutral-300 font-medium">Cronos {message.swapQuote.network}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs mt-1.5">
                            <span className="text-neutral-400">Execution Cost</span>
                            <span className="text-neutral-300 font-medium">$0.15</span>
                          </div>
                        </div>
                      </div>

                      {/* Network Warning */}
                      {message.swapQuote.network === "Mainnet" && chainId !== 25 && (
                        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
                          <span className="text-yellow-400 text-lg">⚠️</span>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-yellow-300 mb-1">Network Mismatch</p>
                            <p className="text-xs text-yellow-200/80">
                              This swap requires Cronos Mainnet (Chain ID: 25). Your wallet is on Chain ID {chainId}. You'll be prompted to switch when you click execute.
                            </p>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          console.log("[Swap] Button clicked", {
                            swapTx: message.swapTransaction,
                            swapQuote: message.swapQuote,
                            chainId,
                            network: message.swapQuote?.network,
                            isConnected,
                            isSwapPending,
                            isSwapConfirming,
                          });
                          executeSwap(message.swapTransaction!, message.swapQuote);
                        }}
                        disabled={
                          isSwapPending || 
                          isSwapConfirming || 
                          !isConnected
                        }
                        className="w-full px-4 py-3 bg-gradient-to-r from-green-600 via-green-500 to-green-600 hover:from-green-500 hover:via-green-400 hover:to-green-500 disabled:from-neutral-800 disabled:via-neutral-800 disabled:to-neutral-800 disabled:opacity-50 text-white rounded-lg font-semibold transition-all duration-200 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:shadow-green-500/30 disabled:shadow-none transform hover:scale-[1.02] disabled:transform-none"
                        title={
                          !isConnected
                            ? "Connect your wallet first"
                            : isSwapPending || isSwapConfirming
                            ? "Transaction in progress..."
                            : undefined
                        }
                      >
                        {isSwapPending ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Signing Transaction...</span>
                          </>
                        ) : isSwapConfirming ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Confirming on Blockchain...</span>
                          </>
                        ) : isSwapConfirmed ? (
                          <>
                            <span className="text-lg">✓</span>
                            <span>Swap Executed Successfully</span>
                          </>
                        ) : (
                          <>
                            <ArrowRightLeft className="h-5 w-5" />
                            <span>Sign & Execute Swap</span>
                          </>
                        )}
                      </button>
                      
                      {swapTxHash && (
                        <div className="mt-3 pt-3 border-t border-neutral-800/50">
                          <a
                            href={`https://explorer.cronos.org/${message.swapQuote.network === "Mainnet" ? "" : "testnet/"}tx/${swapTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-xs text-green-400 hover:text-green-300 transition-colors group"
                          >
                            <span>View Transaction</span>
                            <span className="font-mono text-neutral-400 group-hover:text-green-400 transition-colors">
                              {swapTxHash.slice(0, 8)}...{swapTxHash.slice(-6)}
                            </span>
                            <svg className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Transfer Magic Link */}
                  {message.transferMagicLink && (
                    <div className="mt-4 p-5 bg-gradient-to-br from-blue-950/40 via-blue-900/20 to-blue-950/40 border border-blue-700/50 rounded-xl shadow-lg shadow-blue-900/10 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                            <ArrowRightLeft className="h-5 w-5 text-blue-400" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-blue-300">Transfer Ready</h3>
                            <p className="text-xs text-blue-400/70">Magic Link Generated</p>
                          </div>
                        </div>
                        <div className="px-3 py-1 bg-blue-500/20 rounded-full border border-blue-500/30">
                          <span className="text-xs font-medium text-blue-300">
                            {message.transferMagicLink.type === 'native' ? 'Native' : 'ERC-20'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3 mb-4">
                        <div className="flex justify-between items-center p-3 bg-black/30 rounded-lg border border-blue-800/30">
                          <span className="text-sm text-neutral-300">You Send</span>
                          <span className="text-sm font-semibold text-blue-300">
                            {message.transferMagicLink.amount} <span className="text-xs font-normal text-neutral-400">{message.transferMagicLink.token}</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-black/30 rounded-lg border border-blue-800/30">
                          <span className="text-sm text-neutral-300">To Address</span>
                          <span className="text-xs font-mono text-blue-300">
                            {message.transferMagicLink.to.slice(0, 6)}...{message.transferMagicLink.to.slice(-4)}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
                        <p className="text-xs text-yellow-300/90 flex items-start gap-2">
                          <span className="text-yellow-400">⚠️</span>
                          <span>
                            <strong>Magic Link Transfer:</strong> Click the button below to complete your transfer in a modal without leaving this page.
                          </span>
                        </p>
                      </div>

                      <button
                        onClick={() => message.transferMagicLink && setMagicLinkModal({ url: message.transferMagicLink.url, type: 'transfer' })}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ExternalLink className="h-5 w-5" />
                        <span>Complete Transfer</span>
                      </button>
                      
                      <p className="text-xs text-blue-400/70 text-center mt-2">
                        Complete your transaction in the modal above
                      </p>
                    </div>
                  )}

                  {/* Portfolio Display */}
                  {message.portfolio && (
                    <div className="mt-4 p-5 bg-gradient-to-br from-purple-950/40 via-purple-900/20 to-purple-950/40 border border-purple-700/50 rounded-xl shadow-lg shadow-purple-900/10 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Wallet className="h-5 w-5 text-purple-400" />
                          </div>
                          <h3 className="font-semibold text-lg text-purple-200">Portfolio</h3>
                        </div>
                        <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded">
                          {message.portfolio.balances.length} Token{message.portfolio.balances.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-xs text-purple-300/70 mb-3 p-2 bg-black/20 rounded">
                          <Wallet className="h-3 w-3" />
                          <span>Wallet: </span>
                          <a
                            href={`https://explorer.cronos.org/testnet/address/${message.portfolio.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1"
                          >
                            {message.portfolio.address.slice(0, 6)}...{message.portfolio.address.slice(-4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        {message.portfolio.balances.map((token, idx) => (
                          <div key={idx} className="flex justify-between items-center p-3 bg-black/30 rounded-lg border border-purple-800/30 hover:border-purple-700/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-purple-500/10 rounded">
                                <TrendingUp className="h-4 w-4 text-purple-400" />
                              </div>
                              <div>
                                <span className="font-semibold text-purple-200 block">{token.symbol}</span>
                                {token.contractAddress && (
                                  <span className="text-xs text-purple-400/60 font-mono">
                                    {token.contractAddress.slice(0, 8)}...{token.contractAddress.slice(-6)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-mono text-purple-300 font-semibold">{token.balance}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transaction History Display */}
                  {message.transactionHistory && (
                    <div className="mt-4 p-5 bg-gradient-to-br from-green-950/40 via-green-900/20 to-green-950/40 border border-green-700/50 rounded-xl shadow-lg shadow-green-900/10 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-green-500/20 rounded-lg">
                            <History className="h-5 w-5 text-green-400" />
                          </div>
                          <h3 className="font-semibold text-lg text-green-200">Transaction History</h3>
                        </div>
                        <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded">
                          {message.transactionHistory.transactions.length} Transaction{message.transactionHistory.transactions.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-xs text-green-300/70 mb-3 p-2 bg-black/20 rounded">
                          <Wallet className="h-3 w-3" />
                          <span>Wallet: </span>
                          <a
                            href={`https://explorer.cronos.org/testnet/address/${message.transactionHistory.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-green-400 hover:text-green-300 flex items-center gap-1"
                          >
                            {message.transactionHistory.address.slice(0, 6)}...{message.transactionHistory.address.slice(-4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        {message.transactionHistory.transactions.slice(0, 5).map((tx, idx) => (
                          <div key={idx} className="p-3 bg-black/30 rounded-lg border border-green-800/30 hover:border-green-700/50 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                              <a
                                href={`https://explorer.cronos.org/testnet/tx/${tx.hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono text-green-400 hover:text-green-300 flex items-center gap-1.5 font-semibold"
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                                {tx.hash.slice(0, 12)}...{tx.hash.slice(-10)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {tx.blockNumber > 0 && (
                                <a
                                  href={`https://explorer.cronos.org/testnet/block/${tx.blockNumber}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-green-400/60 hover:text-green-300 flex items-center gap-1"
                                >
                                  Block #{tx.blockNumber}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="p-2 bg-black/20 rounded">
                                <span className="text-green-300/70 block mb-1">From</span>
                                <span className="font-mono text-green-300">{tx.from.slice(0, 8)}...{tx.from.slice(-6)}</span>
                              </div>
                              <div className="p-2 bg-black/20 rounded">
                                <span className="text-green-300/70 block mb-1">To</span>
                                <span className="font-mono text-green-300">{tx.to.slice(0, 8)}...{tx.to.slice(-6)}</span>
                              </div>
                              <div className="col-span-2 p-2 bg-black/20 rounded">
                                <span className="text-green-300/70 block mb-1">Value</span>
                                <span className="font-mono text-green-300 font-semibold">{tx.value}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {message.transactionHistory.transactions.length > 5 && (
                          <div className="text-center pt-2">
                            <a
                              href={`https://explorer.cronos.org/testnet/address/${message.transactionHistory.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-green-400 hover:text-green-300 flex items-center justify-center gap-1"
                            >
                              View all transactions on Cronos Explorer
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-neutral-500 mt-2">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </ChatBubbleMessage>
              </ChatBubble>
            ))}
            {executing && (
              <ChatBubble variant="received">
                <div className="h-8 w-8 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-blue-400" />
                </div>
                <ChatBubbleMessage isLoading>
                  <span className="text-sm text-neutral-400">Thinking...</span>
                </ChatBubbleMessage>
              </ChatBubble>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-neutral-800 bg-black/80 backdrop-blur-sm flex-none">
        <div className="container mx-auto px-4 py-4 max-w-4xl">
          {showPayment ? (
            <div className="mb-4">
              <X402Payment
                priceUsd={CHAT_PRICE}
                agentId={1} // Use agent #1 for payment tracking
                onPaymentComplete={handlePaymentComplete}
                onError={handlePaymentError}
              />
              {pendingMessage && (
                <p className="text-sm text-neutral-400 mt-2 text-center">
                  Message will be sent after payment: "{pendingMessage.substring(0, 50)}..."
                </p>
              )}
            </div>
          ) : (
            <>
              {paymentError && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">
                  {paymentError}
                </div>
              )}
              <AIInput
                placeholder="Ask me anything... (e.g., 'What's the price of Bitcoin?', 'Analyze this contract...')"
                onSubmit={(value) => {
                  if (!value.trim() || executing) return;
                  if (!isConnected) {
                    alert("Please connect your wallet first");
                    return;
                  }
                  sendMessageWithInput(value);
                  setInput(""); // Clear input after sending
                }}
                onVoiceInput={(text) => {
                  setInput(text);
                }}
                value={input}
                onChange={(value) => setInput(value)}
                disabled={executing || !isConnected}
                minHeight={52}
                maxHeight={200}
              />
              {!isConnected && (
                <p className="text-sm text-neutral-500 mt-2 text-center">
                  Connect your wallet to start chatting
                </p>
              )}
              <p className="text-xs text-neutral-500 mt-2 text-center">
                ${CHAT_PRICE} per message • x402 micropayment
              </p>
            </>
          )}
        </div>
      </div>

      {/* Magic Link Modal */}
      {magicLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${magicLinkModal.type === 'wrap' ? 'bg-purple-500/20' : 'bg-blue-500/20'}`}>
                  {magicLinkModal.type === 'wrap' ? (
                    <ArrowRightLeft className="h-5 w-5 text-purple-400" />
                  ) : (
                    <Send className="h-5 w-5 text-blue-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {magicLinkModal.type === 'wrap' ? 'Wrap Token' : 'Transfer Token'}
                  </h3>
                  <p className="text-xs text-neutral-400">Complete your transaction</p>
                </div>
              </div>
              <button
                onClick={() => setMagicLinkModal(null)}
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5 text-neutral-400 hover:text-white" />
              </button>
            </div>

            {/* Modal Content - Iframe */}
            <div className="flex-1 relative overflow-hidden">
              <iframe
                src={magicLinkModal.url}
                className="w-full h-full border-0"
                title={`${magicLinkModal.type === 'wrap' ? 'Wrap' : 'Transfer'} Token`}
                allow="ethereum"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-950/50">
              <p className="text-xs text-neutral-400 text-center">
                Complete your transaction in the form above. You can close this modal at any time.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
